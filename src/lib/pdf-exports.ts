import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { TIPOLOGIA_LABEL, ESTADO_CURSO_LABEL, fmtDate } from "@/lib/format";

const BRAND = [37, 99, 235] as [number, number, number]; // azul
const MUTED = [100, 116, 139] as [number, number, number];

function sanitize(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function newDoc(orientation: "portrait" | "landscape" = "portrait") {
  return new jsPDF({ orientation, unit: "mm", format: "a4" });
}

function header(doc: jsPDF, titulo: string, subtitulo?: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, w, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(titulo, 14, 11);
  if (subtitulo) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(subtitulo, 14, 15.5);
  }
  doc.setTextColor(0, 0, 0);
}

function footer(doc: jsPDF) {
  const total = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.2);
    doc.line(14, h - 12, w - 14, h - 12);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Gestão Pedagógica", 14, h - 7);
    const ts = new Date().toLocaleString("pt-PT");
    doc.text(ts, w / 2, h - 7, { align: "center" });
    doc.text(`Página ${i} de ${total}`, w - 14, h - 7, { align: "right" });
  }
}

const tableTheme = {
  styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2, overflow: "linebreak" as const },
  headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" as const, fontSize: 9 },
  alternateRowStyles: { fillColor: [248, 250, 252] as [number, number, number] },
  margin: { left: 14, right: 14 },
};

function infoBlock(doc: jsPDF, startY: number, items: [string, string][]) {
  let y = startY;
  doc.setFontSize(9);
  for (const [k, v] of items) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUTED);
    doc.text(k.toUpperCase(), 14, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(v || "—", 60, y);
    y += 5;
  }
  return y;
}

// ============= 1. SIGO por curso =============
export async function exportSigoCursoPdf(cursoId: string) {
  const [curso, ufcds, sessoes] = await Promise.all([
    supabase.from("cursos").select("*").eq("id", cursoId).maybeSingle(),
    supabase.from("curso_ufcds")
      .select("id, horas_totais, concluida, ordem, ufcd:ufcds(codigo, designacao)")
      .eq("curso_id", cursoId).order("ordem"),
    supabase.from("sessoes")
      .select("data, hora_inicio, hora_fim, horas, formador:formadores(nome), curso_ufcd:curso_ufcds(ufcd:ufcds(codigo))")
      .eq("curso_id", cursoId).order("data").order("hora_inicio"),
  ]);
  if (!curso.data) throw new Error("Curso não encontrado");
  const c = curso.data as any;

  const horasPorCodigo = new Map<string, number>();
  (sessoes.data ?? []).forEach((s: any) => {
    const k = s.curso_ufcd?.ufcd?.codigo ?? "";
    horasPorCodigo.set(k, (horasPorCodigo.get(k) ?? 0) + Number(s.horas));
  });
  const totalHoras = (sessoes.data ?? []).reduce((a, s: any) => a + Number(s.horas), 0);

  const doc = newDoc("portrait");
  header(doc, "Relatório SIGO — Curso", `${c.codigo} · ${c.nome}`);

  let y = infoBlock(doc, 26, [
    ["Tipologia", TIPOLOGIA_LABEL[c.tipologia] ?? c.tipologia ?? ""],
    ["Estado", ESTADO_CURSO_LABEL[c.estado] ?? c.estado ?? ""],
    ["Data início", c.data_inicio ? fmtDate(c.data_inicio) : ""],
    ["Data fim", c.data_fim ? fmtDate(c.data_fim) : ""],
    ["Total sessões", String((sessoes.data ?? []).length)],
    ["Total horas realizadas", `${totalHoras}h`],
  ]);

  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("UFCD do curso", 14, y);
  autoTable(doc, {
    ...tableTheme,
    startY: y + 2,
    head: [["Código", "Designação", "Previstas", "Dadas", "Faltam", "Concluída"]],
    body: (ufcds.data ?? []).map((u: any) => {
      const r = horasPorCodigo.get(u.ufcd.codigo) ?? 0;
      return [
        u.ufcd.codigo,
        u.ufcd.designacao,
        `${u.horas_totais}h`,
        `${r}h`,
        `${Math.max(0, u.horas_totais - r)}h`,
        u.concluida ? "Sim" : "Não",
      ];
    }),
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "center" } },
  });

  doc.addPage();
  header(doc, "Sessões do curso", `${c.codigo} · ${c.nome}`);
  autoTable(doc, {
    ...tableTheme,
    startY: 26,
    head: [["Data", "Início", "Fim", "Horas", "UFCD", "Formador"]],
    body: (sessoes.data ?? []).map((s: any) => [
      fmtDate(s.data),
      s.hora_inicio?.slice(0, 5) ?? "",
      s.hora_fim?.slice(0, 5) ?? "",
      `${s.horas}h`,
      s.curso_ufcd?.ufcd?.codigo ?? "",
      s.formador?.nome ?? "",
    ]),
    columnStyles: { 3: { halign: "right" } },
  });

  footer(doc);
  doc.save(`SIGO_${sanitize(c.codigo)}_${sanitize(c.nome).slice(0, 40)}.pdf`);
}

// ============= 2. Horas por formador =============
export async function exportRelatorioFormadoresPdf(inicio: string, fim: string) {
  const { data } = await supabase.from("sessoes")
    .select("data, horas, formador:formadores(nome, nif), curso:cursos(nome, codigo), curso_ufcd:curso_ufcds(ufcd:ufcds(codigo))")
    .gte("data", inicio).lte("data", fim)
    .order("data");

  const rows = data ?? [];
  const agg = new Map<string, { formador: string; nif: string; horas: number; sessoes: number }>();
  rows.forEach((s: any) => {
    const k = s.formador?.nome ?? "—";
    const cur = agg.get(k) ?? { formador: k, nif: s.formador?.nif ?? "", horas: 0, sessoes: 0 };
    cur.horas += Number(s.horas); cur.sessoes += 1;
    agg.set(k, cur);
  });
  const totalH = rows.reduce((a, s: any) => a + Number(s.horas), 0);

  const doc = newDoc("portrait");
  header(doc, "Horas por formador", `${fmtDate(inicio)} a ${fmtDate(fim)}`);

  let y = infoBlock(doc, 26, [
    ["Sessões", String(rows.length)],
    ["Horas totais", `${totalH}h`],
    ["Formadores", String(agg.size)],
  ]);

  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("Resumo por formador", 14, y);
  autoTable(doc, {
    ...tableTheme,
    startY: y + 2,
    head: [["Formador", "NIF", "Sessões", "Horas"]],
    body: Array.from(agg.values())
      .sort((a, b) => b.horas - a.horas)
      .map(a => [a.formador, a.nif, String(a.sessoes), `${a.horas}h`]),
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } },
    foot: [["", "Total", String(rows.length), `${totalH}h`]],
    footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
  });

  doc.addPage();
  header(doc, "Sessões — detalhe", `${fmtDate(inicio)} a ${fmtDate(fim)}`);
  autoTable(doc, {
    ...tableTheme,
    startY: 26,
    head: [["Data", "Formador", "Curso", "UFCD", "Horas"]],
    body: rows.map((s: any) => [
      fmtDate(s.data),
      s.formador?.nome ?? "",
      s.curso?.codigo ?? "",
      s.curso_ufcd?.ufcd?.codigo ?? "",
      `${s.horas}h`,
    ]),
    columnStyles: { 4: { halign: "right" } },
  });

  footer(doc);
  doc.save(`Relatorio_Formadores_${inicio}_${fim}.pdf`);
}

// ============= 3. Execução de cursos =============
export async function exportRelatorioCursosPdf() {
  const [cursos, ufcds, sessoes] = await Promise.all([
    supabase.from("cursos").select("id, codigo, nome, tipologia, estado, data_inicio, data_fim"),
    supabase.from("curso_ufcds").select("id, curso_id, horas_totais, concluida"),
    supabase.from("sessoes").select("curso_id, horas"),
  ]);

  const horasPorCurso = new Map<string, number>();
  (sessoes.data ?? []).forEach((s: any) => {
    horasPorCurso.set(s.curso_id, (horasPorCurso.get(s.curso_id) ?? 0) + Number(s.horas));
  });
  const totais = new Map<string, { total: number; concluidas: number; n: number }>();
  (ufcds.data ?? []).forEach((u: any) => {
    const cur = totais.get(u.curso_id) ?? { total: 0, concluidas: 0, n: 0 };
    cur.total += Number(u.horas_totais); cur.n += 1; if (u.concluida) cur.concluidas += 1;
    totais.set(u.curso_id, cur);
  });

  const doc = newDoc("landscape");
  header(doc, "Execução de cursos", `Atualizado em ${new Date().toLocaleDateString("pt-PT")}`);

  autoTable(doc, {
    ...tableTheme,
    startY: 24,
    head: [["Código", "Curso", "Tipologia", "Estado", "Início", "Fim", "UFCD", "Concl.", "Previstas", "Dadas", "Faltam", "%"]],
    body: (cursos.data ?? []).map((c: any) => {
      const t = totais.get(c.id) ?? { total: 0, concluidas: 0, n: 0 };
      const r = horasPorCurso.get(c.id) ?? 0;
      const pct = t.total > 0 ? Math.round((r / t.total) * 1000) / 10 : 0;
      return [
        c.codigo, c.nome,
        TIPOLOGIA_LABEL[c.tipologia] ?? c.tipologia ?? "",
        ESTADO_CURSO_LABEL[c.estado] ?? c.estado ?? "",
        c.data_inicio ? fmtDate(c.data_inicio) : "",
        c.data_fim ? fmtDate(c.data_fim) : "",
        String(t.n), String(t.concluidas),
        `${t.total}h`, `${r}h`, `${Math.max(0, t.total - r)}h`, `${pct}%`,
      ];
    }),
    columnStyles: { 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" }, 11: { halign: "right", fontStyle: "bold" } },
  });

  footer(doc);
  doc.save(`Execucao_Cursos_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============= 4. Faltas dos formandos =============
export async function exportRelatorioFaltasPdf(inicio: string, fim: string) {
  const { data: faltas, error } = await supabase
    .from("formando_faltas")
    .select("data, horas, tipo, observacoes, curso_formando_id, sessao_id")
    .gte("data", inicio).lte("data", fim)
    .order("data");
  if (error) throw error;

  const lista = faltas ?? [];
  const cfIds = Array.from(new Set(lista.map((f: any) => f.curso_formando_id).filter(Boolean)));
  const sessaoIds = Array.from(new Set(lista.map((f: any) => f.sessao_id).filter(Boolean)));
  const [cfs, sessoes] = await Promise.all([
    cfIds.length
      ? supabase.from("curso_formandos").select("id, curso_id, formando:formandos(nome, nif), curso:cursos(codigo, nome)").in("id", cfIds)
      : Promise.resolve({ data: [], error: null }),
    sessaoIds.length
      ? supabase.from("sessoes").select("id, hora_inicio, hora_fim, curso_ufcd:curso_ufcds(ufcd:ufcds(codigo))").in("id", sessaoIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (cfs.error) throw cfs.error;
  if (sessoes.error) throw sessoes.error;
  const cfById = new Map((cfs.data ?? []).map((r: any) => [r.id, r]));
  const sessaoById = new Map((sessoes.data ?? []).map((r: any) => [r.id, r]));

  const m = new Map<string, { curso: string; formando: string; nif: string; just: number; injust: number }>();
  lista.forEach((f: any) => {
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
  const resumo = Array.from(m.values()).sort((a, b) => a.curso.localeCompare(b.curso) || a.formando.localeCompare(b.formando));
  const totJ = resumo.reduce((a, r) => a + r.just, 0);
  const totI = resumo.reduce((a, r) => a + r.injust, 0);

  const doc = newDoc("portrait");
  header(doc, "Faltas dos formandos", `${fmtDate(inicio)} a ${fmtDate(fim)}`);

  let y = infoBlock(doc, 26, [
    ["Registos", String(lista.length)],
    ["Horas justificadas", `${totJ}h`],
    ["Horas injustificadas", `${totI}h`],
  ]);

  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("Resumo por formando", 14, y);
  autoTable(doc, {
    ...tableTheme,
    startY: y + 2,
    head: [["Curso", "Formando", "NIF", "Just.", "Injust.", "Total"]],
    body: resumo.map(r => [r.curso, r.formando, r.nif, `${r.just}h`, `${r.injust}h`, `${r.just + r.injust}h`]),
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right", fontStyle: "bold" } },
    foot: [["", "", "Total", `${totJ}h`, `${totI}h`, `${totJ + totI}h`]],
    footStyles: { fillColor: [241, 245, 249], textColor: 0, fontStyle: "bold" },
  });

  doc.addPage();
  header(doc, "Faltas — detalhe", `${fmtDate(inicio)} a ${fmtDate(fim)}`);
  autoTable(doc, {
    ...tableTheme,
    startY: 26,
    head: [["Data", "Formando", "Curso", "UFCD", "Hora", "Horas", "Tipo", "Observações"]],
    body: lista.map((f: any) => [
      fmtDate(f.data),
      cfById.get(f.curso_formando_id)?.formando?.nome ?? "",
      cfById.get(f.curso_formando_id)?.curso?.codigo ?? "",
      sessaoById.get(f.sessao_id)?.curso_ufcd?.ufcd?.codigo ?? "",
      `${sessaoById.get(f.sessao_id)?.hora_inicio?.slice(0, 5) ?? ""}–${sessaoById.get(f.sessao_id)?.hora_fim?.slice(0, 5) ?? ""}`,
      `${f.horas}h`,
      f.tipo === "justificada" ? "Just." : "Injust.",
      f.observacoes ?? "",
    ]),
    columnStyles: { 5: { halign: "right" }, 6: { halign: "center" } },
  });

  footer(doc);
  doc.save(`Relatorio_Faltas_${inicio}_${fim}.pdf`);
}
