import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { TIPOLOGIA_LABEL, ESTADO_CURSO_LABEL, fmtDate } from "@/lib/format";
import { localRows, yieldToBrowser } from "@/lib/offline-sql";
import { saveFileElectron } from "@/lib/electron-io";

const BRAND = [37, 99, 235] as [number, number, number]; // azul
const MUTED = [100, 116, 139] as [number, number, number];

function sanitize(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "_").trim();
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

async function rowsById(table: string, columns: string, ids: string[]) {
  if (!ids.length) return new Map<string, any>();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  const offline = await localRows<any>(`SELECT ${columns} FROM ${table} WHERE id IN (${placeholders})`, ids);
  if (offline) return new Map(offline.map((r: any) => [r.id, r]));
  const { data, error } = await (supabase as any).from(table).select(columns).in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((r: any) => [r.id, r]));
}

async function savePdf(doc: jsPDF, filename: string) {
  await yieldToBrowser();
  if (import.meta.env.VITE_OFFLINE === "1") {
    const bytes = doc.output("arraybuffer");
    const saved = await saveFileElectron(filename, bytes, [{ name: "PDF", extensions: ["pdf"] }]);
    if (saved) return;
  }
  doc.save(filename);
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
  const offline = await localRows<any>(`
    SELECT 'curso' AS kind, c.id, c.codigo, c.nome, c.tipologia, c.estado, c.data_inicio, c.data_fim,
           NULL::uuid AS ufcd_id, NULL::text AS ufcd_codigo, NULL::text AS ufcd_designacao,
           NULL::numeric AS horas_totais, NULL::boolean AS concluida, NULL::integer AS ordem,
           NULL::date AS data, NULL::time AS hora_inicio, NULL::time AS hora_fim, NULL::numeric AS horas,
           NULL::uuid AS formador_id, NULL::text AS formador_nome, NULL::uuid AS curso_ufcd_id
      FROM cursos c WHERE c.id = $1
    UNION ALL
    SELECT 'ufcd' AS kind, cu.id, NULL, NULL, NULL, NULL, NULL, NULL,
           cu.ufcd_id, u.codigo, u.designacao, cu.horas_totais, cu.concluida, cu.ordem,
           NULL, NULL, NULL, NULL, NULL, NULL, cu.id
      FROM curso_ufcds cu LEFT JOIN ufcds u ON u.id = cu.ufcd_id
     WHERE cu.curso_id = $1
    UNION ALL
    SELECT 'sessao' AS kind, s.id, NULL, NULL, NULL, NULL, NULL, NULL,
           cu.ufcd_id, u.codigo, u.designacao, NULL, NULL, NULL,
           s.data, s.hora_inicio, s.hora_fim, s.horas, s.formador_id, f.nome, s.curso_ufcd_id
      FROM sessoes s
      LEFT JOIN curso_ufcds cu ON cu.id = s.curso_ufcd_id
      LEFT JOIN ufcds u ON u.id = cu.ufcd_id
      LEFT JOIN formadores f ON f.id = s.formador_id
     WHERE s.curso_id = $1
     ORDER BY kind, data, hora_inicio
  `, [cursoId]);

  let c: any;
  let cufs: any[];
  let sess: any[];
  let ufcdById: Map<string, any>;
  let formadorById: Map<string, any>;
  if (offline) {
    const cursoRow = offline.find((r: any) => r.kind === "curso");
    if (!cursoRow) throw new Error("Curso não encontrado");
    c = cursoRow;
    cufs = offline.filter((r: any) => r.kind === "ufcd").map((r: any) => ({ id: r.id, ufcd_id: r.ufcd_id, horas_totais: Number(r.horas_totais ?? 0), concluida: r.concluida, ordem: r.ordem }));
    sess = offline.filter((r: any) => r.kind === "sessao").map((r: any) => ({ ...r, horas: Number(r.horas ?? 0) }));
    ufcdById = new Map(offline.filter((r: any) => r.ufcd_id).map((r: any) => [r.ufcd_id, { id: r.ufcd_id, codigo: r.ufcd_codigo, designacao: r.ufcd_designacao }]));
    formadorById = new Map(offline.filter((r: any) => r.formador_id).map((r: any) => [r.formador_id, { id: r.formador_id, nome: r.formador_nome }]));
  } else {
    const [curso, cursoUfcds, sessoes] = await Promise.all([
      supabase.from("cursos").select("*").eq("id", cursoId).maybeSingle(),
      supabase.from("curso_ufcds")
        .select("id, horas_totais, concluida, ordem, ufcd_id")
        .eq("curso_id", cursoId).order("ordem"),
      supabase.from("sessoes")
        .select("data, hora_inicio, hora_fim, horas, formador_id, curso_ufcd_id")
        .eq("curso_id", cursoId).order("data").order("hora_inicio"),
    ]);
    if (!curso.data) throw new Error("Curso não encontrado");
    if (cursoUfcds.error) throw cursoUfcds.error;
    if (sessoes.error) throw sessoes.error;
    c = curso.data as any;
    cufs = cursoUfcds.data ?? [];
    sess = sessoes.data ?? [];
    [ufcdById, formadorById] = await Promise.all([
      rowsById("ufcds", "id, codigo, designacao", uniqueIds(cufs.map((u: any) => u.ufcd_id))),
      rowsById("formadores", "id, nome", uniqueIds(sess.map((s: any) => s.formador_id))),
    ]);
  }
  const cufById = new Map(cufs.map((u: any) => [u.id, u]));

  const horasPorCuf = new Map<string, number>();
  sess.forEach((s: any) => {
    horasPorCuf.set(s.curso_ufcd_id, (horasPorCuf.get(s.curso_ufcd_id) ?? 0) + Number(s.horas));
  });
  const totalHoras = sess.reduce((a: number, s: any) => a + Number(s.horas), 0);

  const doc = newDoc("portrait");
  header(doc, "Relatório SIGO — Curso", `${c.codigo} · ${c.nome}`);

  let y = infoBlock(doc, 26, [
    ["Tipologia", TIPOLOGIA_LABEL[c.tipologia] ?? c.tipologia ?? ""],
    ["Estado", ESTADO_CURSO_LABEL[c.estado] ?? c.estado ?? ""],
    ["Data início", c.data_inicio ? fmtDate(c.data_inicio) : ""],
    ["Data fim", c.data_fim ? fmtDate(c.data_fim) : ""],
    ["Total sessões", String(sess.length)],
    ["Total horas realizadas", `${totalHoras}h`],
  ]);

  y += 3;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  doc.text("UFCD do curso", 14, y);
  autoTable(doc, {
    ...tableTheme,
    startY: y + 2,
    head: [["Código", "Designação", "Previstas", "Dadas", "Faltam", "Concluída"]],
    body: cufs.map((u: any) => {
      const ufcd = ufcdById.get(u.ufcd_id);
      const r = horasPorCuf.get(u.id) ?? 0;
      return [
        ufcd?.codigo ?? "",
        ufcd?.designacao ?? "",
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
    body: sess.map((s: any) => {
      const cuf = cufById.get(s.curso_ufcd_id) as any;
      const ufcd = cuf ? ufcdById.get(cuf.ufcd_id) : null;
      const formador = formadorById.get(s.formador_id);
      return [
        fmtDate(s.data),
        s.hora_inicio?.slice(0, 5) ?? "",
        s.hora_fim?.slice(0, 5) ?? "",
        `${s.horas}h`,
        ufcd?.codigo ?? "",
        formador?.nome ?? "",
      ];
    }),
    columnStyles: { 3: { halign: "right" } },
  });

  footer(doc);
  await savePdf(doc, `SIGO_${sanitize(c.codigo)}_${sanitize(c.nome).slice(0, 40)}.pdf`);
}

// ============= 2. Horas por formador =============
export async function exportRelatorioFormadoresPdf(inicio: string, fim: string) {
  const offline = await localRows<any>(`
    SELECT s.data, s.horas, s.formador_id, s.curso_id, s.curso_ufcd_id,
           f.nome AS formador_nome, f.nif AS formador_nif,
           c.codigo AS curso_codigo,
           cu.ufcd_id, u.codigo AS ufcd_codigo
      FROM sessoes s
      LEFT JOIN formadores f ON f.id = s.formador_id
      LEFT JOIN cursos c ON c.id = s.curso_id
      LEFT JOIN curso_ufcds cu ON cu.id = s.curso_ufcd_id
      LEFT JOIN ufcds u ON u.id = cu.ufcd_id
     WHERE s.data >= $1 AND s.data <= $2
     ORDER BY s.data ASC
  `, [inicio, fim]);
  let rows: any[];
  let formadorById: Map<string, any>;
  let cursoById: Map<string, any>;
  let cufById: Map<string, any>;
  let ufcdById: Map<string, any>;
  if (offline) {
    rows = offline;
    formadorById = new Map(rows.filter((s: any) => s.formador_id).map((s: any) => [s.formador_id, { id: s.formador_id, nome: s.formador_nome, nif: s.formador_nif }]));
    cursoById = new Map(rows.filter((s: any) => s.curso_id).map((s: any) => [s.curso_id, { id: s.curso_id, codigo: s.curso_codigo }]));
    cufById = new Map(rows.filter((s: any) => s.curso_ufcd_id).map((s: any) => [s.curso_ufcd_id, { id: s.curso_ufcd_id, ufcd_id: s.ufcd_id }]));
    ufcdById = new Map(rows.filter((s: any) => s.ufcd_id).map((s: any) => [s.ufcd_id, { id: s.ufcd_id, codigo: s.ufcd_codigo }]));
  } else {
    const { data, error } = await supabase.from("sessoes")
      .select("data, horas, formador_id, curso_id, curso_ufcd_id")
      .gte("data", inicio).lte("data", fim)
      .order("data");
    if (error) throw error;
    rows = data ?? [];
    [formadorById, cursoById, cufById] = await Promise.all([
      rowsById("formadores", "id, nome, nif", uniqueIds(rows.map((s: any) => s.formador_id))),
      rowsById("cursos", "id, codigo", uniqueIds(rows.map((s: any) => s.curso_id))),
      rowsById("curso_ufcds", "id, ufcd_id", uniqueIds(rows.map((s: any) => s.curso_ufcd_id))),
    ]);
    ufcdById = await rowsById("ufcds", "id, codigo", uniqueIds(Array.from(cufById.values()).map((u: any) => u.ufcd_id)));
  }

  const agg = new Map<string, { formador: string; nif: string; horas: number; sessoes: number }>();
  rows.forEach((s: any) => {
    const formador = formadorById.get(s.formador_id);
    const k = formador?.id ?? "—";
    const cur = agg.get(k) ?? { formador: formador?.nome ?? "—", nif: formador?.nif ?? "", horas: 0, sessoes: 0 };
    cur.horas += Number(s.horas); cur.sessoes += 1;
    agg.set(k, cur);
  });
  const totalH = rows.reduce((a: number, s: any) => a + Number(s.horas), 0);

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
    body: rows.map((s: any) => {
      const formador = formadorById.get(s.formador_id);
      const curso = cursoById.get(s.curso_id);
      const cuf = cufById.get(s.curso_ufcd_id);
      const ufcd = cuf ? ufcdById.get(cuf.ufcd_id) : null;
      return [
        fmtDate(s.data),
        formador?.nome ?? "",
        curso?.codigo ?? "",
        ufcd?.codigo ?? "",
        `${s.horas}h`,
      ];
    }),
    columnStyles: { 4: { halign: "right" } },
  });

  footer(doc);
  await savePdf(doc, `Relatorio_Formadores_${inicio}_${fim}.pdf`);
}

// ============= 3. Execução de cursos =============
export async function exportRelatorioCursosPdf() {
  const offline = await localRows<any>(`
    SELECT c.id, c.codigo, c.nome, c.tipologia, c.estado, c.data_inicio, c.data_fim,
           COUNT(cu.id) AS n_ufcds,
           SUM(CASE WHEN cu.concluida THEN 1 ELSE 0 END) AS concluidas,
           SUM(COALESCE(cu.horas_totais, 0)) AS previstas,
           COALESCE(h.realizadas, 0) AS realizadas
      FROM cursos c
      LEFT JOIN curso_ufcds cu ON cu.curso_id = c.id
      LEFT JOIN (
        SELECT curso_id, SUM(COALESCE(horas, 0)) AS realizadas
          FROM sessoes
         GROUP BY curso_id
      ) h ON h.curso_id = c.id
     GROUP BY c.id, c.codigo, c.nome, c.tipologia, c.estado, c.data_inicio, c.data_fim, h.realizadas
     ORDER BY c.codigo ASC
  `);

  let cursosRows: any[];
  let horasPorCurso = new Map<string, number>();
  let totais = new Map<string, { total: number; concluidas: number; n: number }>();
  if (offline) {
    cursosRows = offline;
    offline.forEach((c: any) => {
      horasPorCurso.set(c.id, Number(c.realizadas ?? 0));
      totais.set(c.id, { total: Number(c.previstas ?? 0), concluidas: Number(c.concluidas ?? 0), n: Number(c.n_ufcds ?? 0) });
    });
  } else {
    const [cursos, ufcds, sessoes] = await Promise.all([
      supabase.from("cursos").select("id, codigo, nome, tipologia, estado, data_inicio, data_fim"),
      supabase.from("curso_ufcds").select("id, curso_id, horas_totais, concluida"),
      supabase.from("sessoes").select("curso_id, horas"),
    ]);

    cursosRows = cursos.data ?? [];
    (sessoes.data ?? []).forEach((s: any) => {
      horasPorCurso.set(s.curso_id, (horasPorCurso.get(s.curso_id) ?? 0) + Number(s.horas));
    });
    (ufcds.data ?? []).forEach((u: any) => {
      const cur = totais.get(u.curso_id) ?? { total: 0, concluidas: 0, n: 0 };
      cur.total += Number(u.horas_totais); cur.n += 1; if (u.concluida) cur.concluidas += 1;
      totais.set(u.curso_id, cur);
    });
  }

  const doc = newDoc("landscape");
  header(doc, "Execução de cursos", `Atualizado em ${new Date().toLocaleDateString("pt-PT")}`);

  autoTable(doc, {
    ...tableTheme,
    startY: 24,
    head: [["Código", "Curso", "Tipologia", "Estado", "Início", "Fim", "UFCD", "Concl.", "Previstas", "Dadas", "Faltam", "%"]],
    body: cursosRows.map((c: any) => {
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
  await savePdf(doc, `Execucao_Cursos_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============= 4. Faltas dos formandos =============
export async function exportRelatorioFaltasPdf(inicio: string, fim: string) {
  const offline = await localRows<any>(`
    SELECT ff.data, ff.horas, ff.tipo, ff.observacoes, ff.curso_formando_id, ff.sessao_id,
           c.codigo AS curso_codigo, c.nome AS curso_nome,
           fo.nome AS formando_nome, fo.nif AS formando_nif,
           u.codigo AS ufcd_codigo,
           s.hora_inicio, s.hora_fim,
           cf.id AS cf_id, cf.curso_id
      FROM formando_faltas ff
      LEFT JOIN curso_formandos cf ON cf.id = ff.curso_formando_id
      LEFT JOIN cursos c ON c.id = cf.curso_id
      LEFT JOIN formandos fo ON fo.id = cf.formando_id
      LEFT JOIN sessoes s ON s.id = ff.sessao_id
      LEFT JOIN curso_ufcds cu ON cu.id = s.curso_ufcd_id
      LEFT JOIN ufcds u ON u.id = cu.ufcd_id
     WHERE ff.data >= $1 AND ff.data <= $2
     ORDER BY ff.data ASC
  `, [inicio, fim]);
  if (offline) {
    const m = new Map<string, { curso: string; formando: string; nif: string; just: number; injust: number }>();
    offline.forEach((f: any) => {
      const key = `${f.cf_id ?? ""}|${f.curso_id ?? ""}`;
      const cur = m.get(key) ?? {
        curso: `${f.curso_codigo ?? ""} — ${f.curso_nome ?? ""}`,
        formando: f.formando_nome ?? "",
        nif: f.formando_nif ?? "",
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
    let y = infoBlock(doc, 26, [["Registos", String(offline.length)], ["Horas justificadas", `${totJ}h`], ["Horas injustificadas", `${totI}h`]]);
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
      body: offline.map((f: any) => [fmtDate(f.data), f.formando_nome ?? "", f.curso_codigo ?? "", f.ufcd_codigo ?? "", `${String(f.hora_inicio ?? "").slice(0, 5)}–${String(f.hora_fim ?? "").slice(0, 5)}`, `${f.horas}h`, f.tipo === "justificada" ? "Just." : "Injust.", f.observacoes ?? ""]),
      columnStyles: { 5: { halign: "right" }, 6: { halign: "center" } },
    });
    footer(doc);
    await savePdf(doc, `Relatorio_Faltas_${inicio}_${fim}.pdf`);
    return;
  }

  const { data: faltas, error } = await supabase
    .from("formando_faltas")
    .select("data, horas, tipo, observacoes, curso_formando_id, sessao_id")
    .gte("data", inicio).lte("data", fim)
    .order("data");
  if (error) throw error;

  const lista = faltas ?? [];
  const cfIds = uniqueIds(lista.map((f: any) => f.curso_formando_id));
  const sessaoIds = uniqueIds(lista.map((f: any) => f.sessao_id));
  const [cfs, sessoes] = await Promise.all([
    cfIds.length
      ? supabase.from("curso_formandos").select("id, curso_id, formando_id").in("id", cfIds)
      : Promise.resolve({ data: [], error: null }),
    sessaoIds.length
      ? supabase.from("sessoes").select("id, hora_inicio, hora_fim, curso_ufcd_id").in("id", sessaoIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (cfs.error) throw cfs.error;
  if (sessoes.error) throw sessoes.error;
  const [cursoById, formandoById, cufById] = await Promise.all([
    rowsById("cursos", "id, codigo, nome", uniqueIds((cfs.data ?? []).map((r: any) => r.curso_id))),
    rowsById("formandos", "id, nome, nif", uniqueIds((cfs.data ?? []).map((r: any) => r.formando_id))),
    rowsById("curso_ufcds", "id, ufcd_id", uniqueIds((sessoes.data ?? []).map((r: any) => r.curso_ufcd_id))),
  ]);
  const ufcdById = await rowsById("ufcds", "id, codigo", uniqueIds(Array.from(cufById.values()).map((u: any) => u.ufcd_id)));
  const cfById = new Map((cfs.data ?? []).map((r: any) => [r.id, r]));
  const sessaoById = new Map((sessoes.data ?? []).map((r: any) => [r.id, r]));

  const m = new Map<string, { curso: string; formando: string; nif: string; just: number; injust: number }>();
  lista.forEach((f: any) => {
    const cf = cfById.get(f.curso_formando_id);
    const key = (f.curso_formando_id ?? "") + "|" + (cf?.curso_id ?? "");
    const cur = m.get(key) ?? {
      curso: `${cursoById.get(cf?.curso_id)?.codigo ?? ""} — ${cursoById.get(cf?.curso_id)?.nome ?? ""}`,
      formando: formandoById.get(cf?.formando_id)?.nome ?? "",
      nif: formandoById.get(cf?.formando_id)?.nif ?? "",
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
      formandoById.get(cfById.get(f.curso_formando_id)?.formando_id)?.nome ?? "",
      cursoById.get(cfById.get(f.curso_formando_id)?.curso_id)?.codigo ?? "",
      ufcdById.get(cufById.get(sessaoById.get(f.sessao_id)?.curso_ufcd_id)?.ufcd_id)?.codigo ?? "",
      `${sessaoById.get(f.sessao_id)?.hora_inicio?.slice(0, 5) ?? ""}–${sessaoById.get(f.sessao_id)?.hora_fim?.slice(0, 5) ?? ""}`,
      `${f.horas}h`,
      f.tipo === "justificada" ? "Just." : "Injust.",
      f.observacoes ?? "",
    ]),
    columnStyles: { 5: { halign: "right" }, 6: { halign: "center" } },
  });

  footer(doc);
  await savePdf(doc, `Relatorio_Faltas_${inicio}_${fim}.pdf`);
}

// ============= Nota de Honorários =============
export interface NotaHonorariosOpts {
  formadorId?: string;
  // Modo "mes": filtra sessões por ano+mes. "ufcd": por UFCD ministrada.
  // "avulso": formador externo / prestação única, sem sessões da BD.
  modo: "mes" | "ufcd" | "avulso";
  ano?: number;
  mes?: number; // 1-12
  ufcdId?: string | null;
  valorHora: number;
  numero?: string;
  destinatario?: {
    nome?: string;
    nif?: string;
    morada?: string;
  };
  retencaoIrs?: number; // percentagem (ex. 23)
  iva?: number; // percentagem de IVA a acrescer (ex. 23). 0 ou undefined = sem IVA
  aplicarIva?: boolean; // se false, mostra "Regime de isenção"
  observacoes?: string;
  dataEmissao?: string; // ISO yyyy-mm-dd; default = hoje
  // Modo "avulso":
  formadorExterno?: {
    nome: string;
    nif?: string;
    morada?: string;
    codigo_postal?: string;
    localidade?: string;
    email?: string;
    iban?: string;
  };
  horasAvulso?: number;
  descricaoAvulso?: string; // descrição da prestação (linha única)
  // Se definido (> 0) em modo "avulso", usa este valor como subtotal (prestação única
  // com preço fechado, sem cálculo por hora). Sobrepõe valorHora × horasAvulso.
  valorTotalAvulso?: number;
}

export async function exportNotaHonorariosPdf(opts: NotaHonorariosOpts) {
  const { modo, ano, mes, ufcdId, valorHora } = opts;
  const dataEmissao = opts.dataEmissao || new Date().toISOString().slice(0, 10);

  if (modo === "mes" && (!ano || !mes)) throw new Error("Ano/mês obrigatórios");
  if (modo === "ufcd" && !ufcdId) throw new Error("UFCD obrigatória");
  if (modo === "avulso") {
    if (!opts.formadorExterno?.nome) throw new Error("Nome do formador obrigatório");
    const usaTotal = (opts.valorTotalAvulso ?? 0) > 0;
    if (!usaTotal && (!opts.horasAvulso || opts.horasAvulso <= 0)) throw new Error("Horas obrigatórias");
  } else {
    if (!opts.formadorId) throw new Error("Formador obrigatório");
  }

  let formador: any;
  let sess: any[] = [];
  let cufById = new Map<string, any>();
  let ufcdById = new Map<string, any>();
  let cursoById = new Map<string, any>();

  if (modo === "avulso") {
    formador = opts.formadorExterno!;
  } else {
    const formadorId = opts.formadorId!;
    let query = supabase.from("sessoes")
      .select("data, hora_inicio, hora_fim, horas, curso_id, curso_ufcd_id")
      .eq("formador_id", formadorId);

    if (modo === "mes") {
      const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const fimDate = new Date(ano!, mes!, 0);
      const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(fimDate.getDate()).padStart(2, "0")}`;
      query = query.gte("data", inicio).lte("data", fim);
    }

    const [formadorRes, sessoesRes] = await Promise.all([
      supabase.from("formadores").select("*").eq("id", formadorId).maybeSingle(),
      query.order("data").order("hora_inicio"),
    ]);
    if (!formadorRes.data) throw new Error("Formador não encontrado");
    if (sessoesRes.error) throw sessoesRes.error;
    formador = formadorRes.data;
    sess = sessoesRes.data ?? [];

    const cufIds = uniqueIds(sess.map(s => s.curso_ufcd_id));
    const cursoIds = uniqueIds(sess.map(s => s.curso_id));
    cufById = await rowsById("curso_ufcds", "id, ufcd_id, curso_id", cufIds);
    const ufcdIds = uniqueIds(Array.from(cufById.values()).map((c: any) => c.ufcd_id));
    [ufcdById, cursoById] = await Promise.all([
      rowsById("ufcds", "id, codigo, designacao", ufcdIds),
      rowsById("cursos", "id, codigo, nome", cursoIds),
    ]);

    if (modo === "ufcd" && ufcdId) {
      sess = sess.filter(s => {
        const cuf = cufById.get(s.curso_ufcd_id);
        return cuf?.ufcd_id === ufcdId;
      });
    }
  }


  const avulsoTotal = modo === "avulso" && (opts.valorTotalAvulso ?? 0) > 0
    ? Number(opts.valorTotalAvulso)
    : null;
  const totalHoras = modo === "avulso"
    ? Number(opts.horasAvulso || 0)
    : sess.reduce((a, s) => a + Number(s.horas || 0), 0);
  const subtotal = avulsoTotal !== null ? avulsoTotal : totalHoras * valorHora;
  const ivaPct = opts.iva ?? 0;
  const ivaValor = subtotal * (ivaPct / 100);
  const retencaoPct = opts.retencaoIrs ?? 0;
  const retencao = subtotal * (retencaoPct / 100);
  const total = subtotal + ivaValor - retencao;

  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const ufcdSel = modo === "ufcd" && ufcdId ? ufcdById.get(ufcdId) : null;
  const periodoLabel = modo === "mes"
    ? `${meses[mes!-1]} ${ano}`
    : modo === "ufcd"
      ? (ufcdSel ? `UFCD ${ufcdSel.codigo} — ${ufcdSel.designacao}` : "UFCD")
      : `Prestação de serviços — ${fmtDate(dataEmissao)}`;
  const numeroSuffix = modo === "mes"
    ? `${ano}${String(mes).padStart(2,"0")}`
    : modo === "ufcd"
      ? (ufcdSel ? String(ufcdSel.codigo).replace(/\s+/g,"") : "UFCD")
      : dataEmissao.replace(/-/g,"");
  const numero = opts.numero || `NH-${numeroSuffix}-${String(formador.nome || "").replace(/\s+/g,"").slice(0,4).toUpperCase()}`;


  const fmtEUR = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;

  const doc = newDoc("portrait");
  const w = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, w, 22, "F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold"); doc.setFontSize(16);
  doc.text("NOTA DE HONORÁRIOS", 14, 13);
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.text(`Nº ${numero}`, 14, 19);
  doc.setTextColor(0,0,0);

  // Emitente
  let y = 32;
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text("EMITENTE", 14, y);
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  y += 5;
  doc.text(formador.nome || "", 14, y); y += 4;
  if (formador.nif) { doc.text(`NIF: ${formador.nif}`, 14, y); y += 4; }
  if (formador.morada) { doc.text(formador.morada, 14, y); y += 4; }
  if (formador.codigo_postal || formador.localidade) {
    doc.text(`${formador.codigo_postal ?? ""} ${formador.localidade ?? ""}`.trim(), 14, y); y += 4;
  }
  if (formador.email) { doc.text(formador.email, 14, y); y += 4; }
  if (formador.iban) { doc.text(`IBAN: ${formador.iban}`, 14, y); y += 4; }

  // Destinatário (lado direito)
  let yr = 32;
  doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text("DESTINATÁRIO", w/2 + 5, yr);
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  yr += 5;
  const d = opts.destinatario ?? {};
  doc.text(d.nome || "—", w/2 + 5, yr); yr += 4;
  if (d.nif) { doc.text(`NIF: ${d.nif}`, w/2 + 5, yr); yr += 4; }
  if (d.morada) {
    const lines = doc.splitTextToSize(d.morada, w/2 - 20);
    doc.text(lines, w/2 + 5, yr); yr += 4 * lines.length;
  }

  // Meta
  y = Math.max(y, yr) + 4;
  doc.setDrawColor(...MUTED); doc.setLineWidth(0.2);
  doc.line(14, y, w - 14, y);
  y += 6;
  doc.setFont("helvetica","bold"); doc.setFontSize(9);
  doc.text(`Período: ${periodoLabel}`, 14, y);
  doc.text(`Data de emissão: ${fmtDate(dataEmissao)}`, w - 14, y, { align: "right" });
  y += 6;

  // Tabela de sessões / prestação
  if (modo === "avulso") {
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [["Descrição", "Horas", "Valor/h", "Total"]],
      body: [[
        opts.descricaoAvulso || "Prestação de serviços de formação",
        avulsoTotal !== null && totalHoras === 0 ? "—" : `${totalHoras.toFixed(2)}h`,
        avulsoTotal !== null ? "—" : fmtEUR(valorHora),
        fmtEUR(subtotal),
      ]],
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right", fontStyle: "bold" },
      },
    });
  } else {
    const body = sess.map(s => {
      const cuf = cufById.get(s.curso_ufcd_id);
      const ufcd = cuf ? ufcdById.get(cuf.ufcd_id) : null;
      const curso = cursoById.get(s.curso_id);
      return [
        fmtDate(s.data),
        curso ? `${curso.codigo}` : "",
        ufcd ? `${ufcd.codigo} — ${ufcd.designacao}` : "",
        `${(s.hora_inicio ?? "").slice(0,5)}–${(s.hora_fim ?? "").slice(0,5)}`,
        `${Number(s.horas).toFixed(2)}h`,
        fmtEUR(valorHora),
        fmtEUR(Number(s.horas) * valorHora),
      ];
    });
    autoTable(doc, {
      ...tableTheme,
      startY: y,
      head: [["Data", "Curso", "UFCD", "Horário", "Horas", "Valor/h", "Total"]],
      body: body.length ? body : [["—","—","Sem sessões no período","—","0h", fmtEUR(valorHora), fmtEUR(0)]],
      columnStyles: {
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right", fontStyle: "bold" },
      },
    });
  }


  let yEnd = (doc as any).lastAutoTable.finalY + 6;

  // Totais
  const boxX = w - 90;
  const drawRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 11 : 9);
    doc.text(label, boxX, yEnd);
    doc.text(value, w - 14, yEnd, { align: "right" });
    yEnd += bold ? 7 : 5;
  };
  if (!(avulsoTotal !== null && totalHoras === 0)) drawRow("Total de horas:", `${totalHoras.toFixed(2)}h`);
  drawRow("Subtotal:", fmtEUR(subtotal));
  if (!opts.aplicarIva || ivaPct === 0) drawRow("IVA:", "Regime de isenção");
  else if (ivaPct > 0) drawRow(`IVA (${ivaPct}%):`, `+ ${fmtEUR(ivaValor)}`);
  if (retencaoPct > 0) drawRow(`Retenção IRS (${retencaoPct}%):`, `- ${fmtEUR(retencao)}`);
  else if (retencaoPct === 0) drawRow("Retenção IRS:", "Regime de isenção");
  doc.setDrawColor(...BRAND); doc.setLineWidth(0.5);
  doc.line(boxX, yEnd - 2, w - 14, yEnd - 2);
  yEnd += 2;
  drawRow("TOTAL A PAGAR:", fmtEUR(total), true);

  // Observações
  if (opts.observacoes) {
    yEnd += 6;
    doc.setFont("helvetica","bold"); doc.setFontSize(9);
    doc.text("Observações", 14, yEnd);
    doc.setFont("helvetica","normal");
    yEnd += 4;
    const lines = doc.splitTextToSize(opts.observacoes, w - 28);
    doc.text(lines, 14, yEnd);
    yEnd += 4 * lines.length;
  }

  // Nota legal
  yEnd += 10;
  doc.setFont("helvetica","italic"); doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("Documento sem valor fiscal. Emitido para efeitos de processamento de honorários.", 14, yEnd);
  doc.setTextColor(0,0,0);

  footer(doc);
  const fnameSuffix = modo === "mes"
    ? `${ano}-${String(mes).padStart(2,"0")}`
    : modo === "ufcd"
      ? (ufcdSel ? sanitize(String(ufcdSel.codigo)) : "ufcd")
      : `avulso-${dataEmissao}`;
  const fname = `NotaHonorarios_${sanitize(formador.nome || "formador")}_${fnameSuffix}.pdf`;


  await savePdf(doc, fname);
}

