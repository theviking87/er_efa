import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { MONTH_NAMES, TIPOLOGIA_LABEL, ESTADO_CURSO_LABEL } from "@/lib/format";

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

function sanitize(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim();
}

/** Exporta um livro Excel com todas as sessões, UFCD e formadores de um curso (para SIGO). */
export async function exportSigoCurso(cursoId: string) {
  const [curso, ufcds, sessoes] = await Promise.all([
    supabase.from("cursos").select("*").eq("id", cursoId).maybeSingle(),
    supabase.from("curso_ufcds")
      .select("id, horas_totais, concluida, ordem, ufcd:ufcds(codigo, designacao, horas_referencia), formadores:curso_ufcd_formadores(formador:formadores(nome, nif))")
      .eq("curso_id", cursoId).order("ordem"),
    supabase.from("sessoes")
      .select("data, hora_inicio, hora_fim, horas, observacoes, formador:formadores(nome, nif), curso_ufcd:curso_ufcds(ufcd:ufcds(codigo, designacao))")
      .eq("curso_id", cursoId).order("data").order("hora_inicio"),
  ]);

  if (!curso.data) throw new Error("Curso não encontrado");
  const c = curso.data as any;

  // Sheet 1 — Sessões
  const sessoesRows = (sessoes.data ?? []).map((s: any) => ({
    Data: s.data,
    "Hora Início": s.hora_inicio?.slice(0, 5),
    "Hora Fim": s.hora_fim?.slice(0, 5),
    Horas: Number(s.horas),
    "UFCD Código": s.curso_ufcd?.ufcd?.codigo ?? "",
    "UFCD Designação": s.curso_ufcd?.ufcd?.designacao ?? "",
    Formador: s.formador?.nome ?? "",
    "NIF Formador": s.formador?.nif ?? "",
    Observações: s.observacoes ?? "",
  }));

  // Sheet 2 — UFCD com horas
  const horasPorCuf = new Map<string, number>();
  (sessoes.data ?? []).forEach((s: any) => {
    const cufId = (s as any).curso_ufcd_id ?? null;
    // Recompute via fetch if needed; fallback by codigo
    const k = s.curso_ufcd?.ufcd?.codigo ?? "";
    horasPorCuf.set(k, (horasPorCuf.get(k) ?? 0) + Number(s.horas));
  });
  const ufcdRows = (ufcds.data ?? []).map((u: any) => {
    const realizadas = horasPorCuf.get(u.ufcd.codigo) ?? 0;
    return {
      Código: u.ufcd.codigo,
      Designação: u.ufcd.designacao,
      "Horas Totais": u.horas_totais,
      "Horas Realizadas": realizadas,
      "Horas em Falta": Math.max(0, u.horas_totais - realizadas),
      Concluída: u.concluida ? "Sim" : "Não",
      Formadores: (u.formadores ?? []).map((f: any) => f.formador.nome).join("; "),
    };
  });

  // Sheet 3 — Formadores envolvidos
  const formadoresMap = new Map<string, { nome: string; nif: string; horas: number }>();
  (sessoes.data ?? []).forEach((s: any) => {
    const k = s.formador?.nome ?? "—";
    const cur = formadoresMap.get(k) ?? { nome: k, nif: s.formador?.nif ?? "", horas: 0 };
    cur.horas += Number(s.horas);
    formadoresMap.set(k, cur);
  });
  const formadoresRows = Array.from(formadoresMap.values()).map(f => ({
    Formador: f.nome, NIF: f.nif, "Horas Realizadas": f.horas,
  }));

  // Sheet 0 — Resumo
  const totalHoras = sessoesRows.reduce((a, r) => a + Number(r.Horas), 0);
  const resumoRows = [
    ["Curso", c.nome],
    ["Código", c.codigo],
    ["Tipologia", TIPOLOGIA_LABEL[c.tipologia] ?? c.tipologia],
    ["Estado", ESTADO_CURSO_LABEL[c.estado] ?? c.estado],
    ["Data Início", c.data_inicio ?? ""],
    ["Data Fim", c.data_fim ?? ""],
    [],
    ["Total sessões", sessoesRows.length],
    ["Total horas realizadas", totalHoras],
    ["UFCD atribuídas", ufcdRows.length],
    ["UFCD concluídas", ufcdRows.filter(u => u.Concluída === "Sim").length],
    ["Formadores envolvidos", formadoresRows.length],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumoRows), "Resumo");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessoesRows), "Sessões");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ufcdRows), "UFCD");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formadoresRows), "Formadores");

  downloadWorkbook(wb, `SIGO_${sanitize(c.codigo)}_${sanitize(c.nome).slice(0, 40)}.xlsx`);
}

/** Relatório global de horas por formador num intervalo. */
export async function exportRelatorioFormadores(inicio: string, fim: string) {
  const { data } = await supabase.from("sessoes")
    .select("data, horas, formador:formadores(nome, nif), curso:cursos(nome, codigo), curso_ufcd:curso_ufcds(ufcd:ufcds(codigo, designacao))")
    .gte("data", inicio).lte("data", fim);

  const rows = (data ?? []).map((s: any) => ({
    Data: s.data,
    Horas: Number(s.horas),
    Formador: s.formador?.nome ?? "",
    NIF: s.formador?.nif ?? "",
    Curso: s.curso?.codigo ?? "",
    "Nome Curso": s.curso?.nome ?? "",
    UFCD: s.curso_ufcd?.ufcd?.codigo ?? "",
    "Designação UFCD": s.curso_ufcd?.ufcd?.designacao ?? "",
  }));

  // Agregado
  const agg = new Map<string, { formador: string; nif: string; horas: number; sessoes: number }>();
  rows.forEach(r => {
    const k = r.Formador;
    const cur = agg.get(k) ?? { formador: r.Formador, nif: r.NIF, horas: 0, sessoes: 0 };
    cur.horas += r.Horas; cur.sessoes += 1;
    agg.set(k, cur);
  });
  const aggRows = Array.from(agg.values()).map(a => ({
    Formador: a.formador, NIF: a.nif, "Total Sessões": a.sessoes, "Total Horas": a.horas,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aggRows), "Resumo por formador");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Sessões");
  downloadWorkbook(wb, `Relatorio_Formadores_${inicio}_${fim}.xlsx`);
}

/** Relatório de execução por curso. */
export async function exportRelatorioCursos() {
  const [cursos, ufcds, sessoes] = await Promise.all([
    supabase.from("cursos").select("id, codigo, nome, tipologia, estado, data_inicio, data_fim"),
    supabase.from("curso_ufcds").select("id, curso_id, horas_totais, concluida"),
    supabase.from("sessoes").select("curso_id, curso_ufcd_id, horas"),
  ]);

  const horasPorCurso = new Map<string, number>();
  const horasPorCuf = new Map<string, number>();
  (sessoes.data ?? []).forEach((s: any) => {
    horasPorCurso.set(s.curso_id, (horasPorCurso.get(s.curso_id) ?? 0) + Number(s.horas));
    horasPorCuf.set(s.curso_ufcd_id, (horasPorCuf.get(s.curso_ufcd_id) ?? 0) + Number(s.horas));
  });
  const totaisPorCurso = new Map<string, { total: number; concluidas: number; nUfcds: number }>();
  (ufcds.data ?? []).forEach((u: any) => {
    const cur = totaisPorCurso.get(u.curso_id) ?? { total: 0, concluidas: 0, nUfcds: 0 };
    cur.total += Number(u.horas_totais);
    cur.nUfcds += 1;
    if (u.concluida) cur.concluidas += 1;
    totaisPorCurso.set(u.curso_id, cur);
  });

  const rows = (cursos.data ?? []).map((c: any) => {
    const t = totaisPorCurso.get(c.id) ?? { total: 0, concluidas: 0, nUfcds: 0 };
    const realizadas = horasPorCurso.get(c.id) ?? 0;
    const pct = t.total > 0 ? Math.round((realizadas / t.total) * 1000) / 10 : 0;
    return {
      Código: c.codigo,
      Curso: c.nome,
      Tipologia: TIPOLOGIA_LABEL[c.tipologia] ?? c.tipologia,
      Estado: ESTADO_CURSO_LABEL[c.estado] ?? c.estado,
      "Data Início": c.data_inicio ?? "",
      "Data Fim": c.data_fim ?? "",
      "UFCD Atribuídas": t.nUfcds,
      "UFCD Concluídas": t.concluidas,
      "Horas Previstas": t.total,
      "Horas Realizadas": realizadas,
      "Horas em Falta": Math.max(0, t.total - realizadas),
      "Execução %": pct,
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Execução de cursos");
  downloadWorkbook(wb, `Relatorio_Cursos_${new Date().toISOString().slice(0,10)}.xlsx`);
}

/** Relatório de faltas / assiduidade de um curso. */
export async function exportFaltasCurso(cursoId: string) {
  const [curso, inscritos, sessoes, faltas] = await Promise.all([
    supabase.from("cursos").select("codigo, nome").eq("id", cursoId).maybeSingle(),
    supabase.from("curso_formandos")
      .select("id, estado, formando:formandos(id, nome, nif, email)")
      .eq("curso_id", cursoId),
    supabase.from("sessoes")
      .select("id, data, hora_inicio, hora_fim, horas, curso_ufcd:curso_ufcds(ufcd:ufcds(codigo, designacao))")
      .eq("curso_id", cursoId).order("data").order("hora_inicio"),
    supabase.from("formando_faltas")
      .select("curso_formando_id, sessao_id, data, horas, tipo, observacoes, curso_formando:curso_formandos!inner(curso_id)")
      .eq("curso_formando.curso_id", cursoId),
  ]);
  if (!curso.data) throw new Error("Curso não encontrado");
  const c = curso.data as any;

  const totalHoras = (sessoes.data ?? []).reduce((s, x: any) => s + Number(x.horas ?? 0), 0);

  const totByCf = new Map<string, { just: number; injust: number }>();
  (faltas.data ?? []).forEach((f: any) => {
    const cur = totByCf.get(f.curso_formando_id) ?? { just: 0, injust: 0 };
    if (f.tipo === "justificada") cur.just += Number(f.horas);
    else cur.injust += Number(f.horas);
    totByCf.set(f.curso_formando_id, cur);
  });
  const resumoRows = (inscritos.data ?? []).map((i: any) => {
    const t = totByCf.get(i.id) ?? { just: 0, injust: 0 };
    const total = t.just + t.injust;
    const ass = totalHoras > 0 ? Math.round(((totalHoras - total) / totalHoras) * 1000) / 10 : 100;
    return {
      Formando: i.formando?.nome ?? "",
      NIF: i.formando?.nif ?? "",
      Email: i.formando?.email ?? "",
      Estado: i.estado,
      "Horas curso": totalHoras,
      "Faltas just.": t.just,
      "Faltas injust.": t.injust,
      "Total faltas": total,
      "Assiduidade %": ass,
    };
  });

  const cfById = new Map((inscritos.data ?? []).map((i: any) => [i.id, i.formando?.nome ?? ""]));
  const sById = new Map((sessoes.data ?? []).map((s: any) => [s.id, s]));
  const detalheRows = (faltas.data ?? []).map((f: any) => {
    const s = sById.get(f.sessao_id) as any;
    return {
      Data: f.data,
      Formando: cfById.get(f.curso_formando_id) ?? "",
      "UFCD": s?.curso_ufcd?.ufcd?.codigo ?? "",
      "Hora Início": s?.hora_inicio?.slice(0, 5) ?? "",
      "Hora Fim": s?.hora_fim?.slice(0, 5) ?? "",
      Horas: Number(f.horas),
      Tipo: f.tipo,
      Observações: f.observacoes ?? "",
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoRows), "Assiduidade");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalheRows), "Faltas (detalhe)");
  downloadWorkbook(wb, `Faltas_${sanitize(c.codigo)}_${sanitize(c.nome).slice(0, 40)}.xlsx`);
}

export function monthLabel(ano: number, mes: number) {
  return `${MONTH_NAMES[mes]} ${ano}`;
}
