import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { MONTH_NAMES, TIPOLOGIA_LABEL, ESTADO_CURSO_LABEL } from "@/lib/format";

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

function sanitize(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

async function rowsById(table: string, columns: string, ids: string[]) {
  if (!ids.length) return new Map<string, any>();
  const { data, error } = await (supabase as any).from(table).select(columns).in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((r: any) => [r.id, r]));
}

/** Exporta um livro Excel com todas as sessões, UFCD e formadores de um curso (para SIGO). */
export async function exportSigoCurso(cursoId: string) {
  const [curso, cursoUfcds, sessoes] = await Promise.all([
    supabase.from("cursos").select("*").eq("id", cursoId).maybeSingle(),
    supabase.from("curso_ufcds")
      .select("id, horas_totais, concluida, ordem, ufcd_id")
      .eq("curso_id", cursoId).order("ordem"),
    supabase.from("sessoes")
      .select("id, data, hora_inicio, hora_fim, horas, observacoes, formador_id, curso_ufcd_id")
      .eq("curso_id", cursoId).order("data").order("hora_inicio"),
  ]);

  if (!curso.data) throw new Error("Curso não encontrado");
  if (cursoUfcds.error) throw cursoUfcds.error;
  if (sessoes.error) throw sessoes.error;
  const c = curso.data as any;
  const cufs = cursoUfcds.data ?? [];
  const sess = sessoes.data ?? [];

  const [ufcdById, formadorById, cufFormadores] = await Promise.all([
    rowsById("ufcds", "id, codigo, designacao, horas_referencia", uniqueIds(cufs.map((u: any) => u.ufcd_id))),
    rowsById("formadores", "id, nome, nif", uniqueIds(sess.map((x: any) => x.formador_id))),
    cufs.length
      ? (supabase as any).from("curso_ufcd_formadores").select("curso_ufcd_id, formador_id").in("curso_ufcd_id", cufs.map((u: any) => u.id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if ((cufFormadores as any).error) throw (cufFormadores as any).error;
  const assignedFormadorIds = uniqueIds(((cufFormadores as any).data ?? []).map((r: any) => r.formador_id));
  const assignedFormadorById = new Map([...formadorById]);
  if (assignedFormadorIds.some((id) => !assignedFormadorById.has(id))) {
    const extra = await rowsById("formadores", "id, nome, nif", assignedFormadorIds.filter((id) => !assignedFormadorById.has(id)));
    extra.forEach((v, k) => assignedFormadorById.set(k, v));
  }
  const formadoresPorCuf = new Map<string, any[]>();
  ((cufFormadores as any).data ?? []).forEach((r: any) => {
    const arr = formadoresPorCuf.get(r.curso_ufcd_id) ?? [];
    const f = assignedFormadorById.get(r.formador_id);
    if (f) arr.push(f);
    formadoresPorCuf.set(r.curso_ufcd_id, arr);
  });

  // Sheet 1 — Sessões
  const sessoesRows = sess.map((s: any) => {
    const cuf = cufs.find((u: any) => u.id === s.curso_ufcd_id);
    const ufcd = cuf ? ufcdById.get(cuf.ufcd_id) : null;
    const formador = formadorById.get(s.formador_id);
    return {
      Data: s.data,
      "Hora Início": s.hora_inicio?.slice(0, 5),
      "Hora Fim": s.hora_fim?.slice(0, 5),
      Horas: Number(s.horas),
      "UFCD Código": ufcd?.codigo ?? "",
      "UFCD Designação": ufcd?.designacao ?? "",
      Formador: formador?.nome ?? "",
      "NIF Formador": formador?.nif ?? "",
      Observações: s.observacoes ?? "",
    };
  });

  // Sheet 2 — UFCD com horas
  const horasPorCuf = new Map<string, number>();
  sess.forEach((s: any) => {
    horasPorCuf.set(s.curso_ufcd_id, (horasPorCuf.get(s.curso_ufcd_id) ?? 0) + Number(s.horas));
  });
  const ufcdRows = cufs.map((u: any) => {
    const ufcd = ufcdById.get(u.ufcd_id);
    const realizadas = horasPorCuf.get(u.id) ?? 0;
    return {
      Código: ufcd?.codigo ?? "",
      Designação: ufcd?.designacao ?? "",
      "Horas Totais": u.horas_totais,
      "Horas Realizadas": realizadas,
      "Horas em Falta": Math.max(0, u.horas_totais - realizadas),
      Concluída: u.concluida ? "Sim" : "Não",
      Formadores: (formadoresPorCuf.get(u.id) ?? []).map((f: any) => f.nome).join("; "),
    };
  });

  // Sheet 3 — Formadores envolvidos
  const formadoresMap = new Map<string, { nome: string; nif: string; horas: number }>();
  sess.forEach((s: any) => {
    const formador = formadorById.get(s.formador_id);
    const k = formador?.id ?? "—";
    const cur = formadoresMap.get(k) ?? { nome: formador?.nome ?? "—", nif: formador?.nif ?? "", horas: 0 };
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
  const { data, error } = await supabase.from("sessoes")
    .select("data, horas, formador_id, curso_id, curso_ufcd_id")
    .gte("data", inicio).lte("data", fim);
  if (error) throw error;
  const sessoes = data ?? [];
  const [formadorById, cursoById, cufById] = await Promise.all([
    rowsById("formadores", "id, nome, nif", uniqueIds(sessoes.map((s: any) => s.formador_id))),
    rowsById("cursos", "id, nome, codigo", uniqueIds(sessoes.map((s: any) => s.curso_id))),
    rowsById("curso_ufcds", "id, ufcd_id", uniqueIds(sessoes.map((s: any) => s.curso_ufcd_id))),
  ]);
  const ufcdById = await rowsById("ufcds", "id, codigo, designacao", uniqueIds(Array.from(cufById.values()).map((u: any) => u.ufcd_id)));

  const rows = sessoes.map((s: any) => {
    const formador = formadorById.get(s.formador_id);
    const curso = cursoById.get(s.curso_id);
    const cuf = cufById.get(s.curso_ufcd_id);
    const ufcd = cuf ? ufcdById.get(cuf.ufcd_id) : null;
    return {
      Data: s.data,
      Horas: Number(s.horas),
      Formador: formador?.nome ?? "",
      NIF: formador?.nif ?? "",
      Curso: curso?.codigo ?? "",
      "Nome Curso": curso?.nome ?? "",
      UFCD: ufcd?.codigo ?? "",
      "Designação UFCD": ufcd?.designacao ?? "",
    };
  });

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
  const [curso, inscritos, sessoes] = await Promise.all([
    supabase.from("cursos").select("codigo, nome").eq("id", cursoId).maybeSingle(),
    supabase.from("curso_formandos")
      .select("id, estado, formando:formandos(id, nome, nif, email)")
      .eq("curso_id", cursoId),
    supabase.from("sessoes")
      .select("id, data, hora_inicio, hora_fim, horas, curso_ufcd:curso_ufcds(ufcd:ufcds(codigo, designacao))")
      .eq("curso_id", cursoId).order("data").order("hora_inicio"),
  ]);
  if (!curso.data) throw new Error("Curso não encontrado");
  const c = curso.data as any;

  const inscritoIds = (inscritos.data ?? []).map((i: any) => i.id).filter(Boolean);
  const faltasRes = inscritoIds.length
    ? await supabase.from("formando_faltas")
      .select("curso_formando_id, sessao_id, data, horas, tipo, observacoes")
      .in("curso_formando_id", inscritoIds)
    : { data: [], error: null };
  if (faltasRes.error) throw faltasRes.error;
  const faltasCurso = faltasRes.data ?? [];

  const totalHoras = (sessoes.data ?? []).reduce((s, x: any) => s + Number(x.horas ?? 0), 0);

  const totByCf = new Map<string, { just: number; injust: number }>();
  faltasCurso.forEach((f: any) => {
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
  const detalheRows = faltasCurso.map((f: any) => {
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

/** Relatório global de faltas num intervalo (todos os cursos). */
export async function exportRelatorioFaltas(inicio: string, fim: string) {
  const { data: faltas, error } = await supabase
    .from("formando_faltas")
    .select("data, horas, tipo, observacoes, curso_formando_id, sessao_id")
    .gte("data", inicio).lte("data", fim)
    .order("data");
  if (error) throw error;

  const cfIds = Array.from(new Set((faltas ?? []).map((f: any) => f.curso_formando_id).filter(Boolean)));
  const sessaoIds = Array.from(new Set((faltas ?? []).map((f: any) => f.sessao_id).filter(Boolean)));
  const [cfs, sessoes] = await Promise.all([
    cfIds.length
      ? supabase.from("curso_formandos").select("id, curso_id, formando:formandos(nome, nif), curso:cursos(codigo, nome)").in("id", cfIds)
      : Promise.resolve({ data: [], error: null }),
    sessaoIds.length
      ? supabase.from("sessoes").select("id, hora_inicio, hora_fim, curso_ufcd:curso_ufcds(ufcd:ufcds(codigo, designacao))").in("id", sessaoIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (cfs.error) throw cfs.error;
  if (sessoes.error) throw sessoes.error;
  const cfById = new Map((cfs.data ?? []).map((r: any) => [r.id, r]));
  const sessaoById = new Map((sessoes.data ?? []).map((r: any) => [r.id, r]));

  const detalhe = (faltas ?? []).map((f: any) => ({
    Data: f.data,
    Curso: `${cfById.get(f.curso_formando_id)?.curso?.codigo ?? ""} — ${cfById.get(f.curso_formando_id)?.curso?.nome ?? ""}`,
    Formando: cfById.get(f.curso_formando_id)?.formando?.nome ?? "",
    NIF: cfById.get(f.curso_formando_id)?.formando?.nif ?? "",
    UFCD: sessaoById.get(f.sessao_id)?.curso_ufcd?.ufcd?.codigo ?? "",
    "Hora Início": sessaoById.get(f.sessao_id)?.hora_inicio?.slice(0, 5) ?? "",
    "Hora Fim": sessaoById.get(f.sessao_id)?.hora_fim?.slice(0, 5) ?? "",
    Horas: Number(f.horas),
    Tipo: f.tipo,
    Observações: f.observacoes ?? "",
  }));

  // Resumo por formando+curso
  const m = new Map<string, { curso: string; formando: string; nif: string; just: number; injust: number }>();
  (faltas ?? []).forEach((f: any) => {
    const cf = cfById.get(f.curso_formando_id);
    const key = (f.curso_formando_id ?? "") + "|" + (cf?.curso_id ?? "");
    const cur = m.get(key) ?? {
      curso: `${cf?.curso?.codigo ?? ""} — ${cf?.curso?.nome ?? ""}`,
      formando: cf?.formando?.nome ?? "",
      nif: cf?.formando?.nif ?? "",
      just: 0, injust: 0,
    };
    if (f.tipo === "justificada") cur.just += Number(f.horas);
    else cur.injust += Number(f.horas);
    m.set(key, cur);
  });
  const resumo = Array.from(m.values())
    .sort((a, b) => a.curso.localeCompare(b.curso) || a.formando.localeCompare(b.formando))
    .map(r => ({
      Curso: r.curso,
      Formando: r.formando,
      NIF: r.nif,
      "Faltas just.": r.just,
      "Faltas injust.": r.injust,
      "Total horas": r.just + r.injust,
    }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhe), "Detalhe");
  downloadWorkbook(wb, `Relatorio_Faltas_${inicio}_${fim}.xlsx`);
}

export function monthLabel(ano: number, mes: number) {
  return `${MONTH_NAMES[mes]} ${ano}`;
}
