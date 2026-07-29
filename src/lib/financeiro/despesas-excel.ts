import ExcelJS from "exceljs";
import { saveFile } from "@/lib/dom-helpers";

export type DespesaRow = {
  id: string;
  data: string; // ISO
  categoria: string;
  descricao: string;
  fornecedor?: string | null;
  nif?: string | null;
  valor: number;
  curso_codigo?: string | null;
  curso_nome?: string | null;
  observacoes?: string | null;
};

export type DespesasExport = {
  titulo: string; // ex "Despesas — Todos os projetos" ou "Despesas — Projeto X"
  periodo?: string | null; // ex "Janeiro/2026" ou "2026"
  empresa?: { nome?: string | null; nif?: string | null; morada?: string | null } | null;
  logoEmpresaUrl?: string | null;
  logoDgertUrl?: string | null;
  logoPessoas2030Url?: string | null;
  rows: DespesaRow[];
  modo: "consolidado" | "por_curso";
};

async function fetchImage(url?: string | null): Promise<{ buf: ArrayBuffer; ext: "png" | "jpeg"; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const ext: "png" | "jpeg" = /\.jpe?g(\?|$)/i.test(url) ? "jpeg" : "png";
    const blob = new Blob([buf], { type: `image/${ext}` });
    const url2 = URL.createObjectURL(blob);
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = url2;
    });
    URL.revokeObjectURL(url2);
    return { buf, ext, w: dims.w, h: dims.h };
  } catch { return null; }
}

function fit(nw: number, nh: number, maxW: number, maxH: number) {
  const r = Math.min(maxW / nw, maxH / nh);
  return { width: Math.round(nw * r), height: Math.round(nh * r) };
}

function drawHeader(ws: ExcelJS.Worksheet, titulo: string, periodo: string | null | undefined, empresa: DespesasExport["empresa"], lastCol: string) {
  ws.getRow(1).height = 38; ws.getRow(2).height = 16;
  ws.mergeCells(`A4:${lastCol}4`);
  ws.getCell("A4").value = titulo;
  ws.getCell("A4").font = { size: 14, bold: true };
  if (periodo) {
    ws.mergeCells(`A5:${lastCol}5`);
    ws.getCell("A5").value = `Período: ${periodo}`;
    ws.getCell("A5").font = { size: 11, color: { argb: "FF666666" } };
  }
  if (empresa) {
    ws.mergeCells(`A6:${lastCol}6`);
    ws.getCell("A6").value = `${empresa.nome ?? ""} • NIF ${empresa.nif ?? "—"} • ${empresa.morada ?? ""}`;
    ws.getCell("A6").font = { size: 9, color: { argb: "FF888888" } };
  }
}

async function drawLogos(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook, p: DespesasExport) {
  const [logoE, logoD] = await Promise.all([fetchImage(p.logoEmpresaUrl), fetchImage(p.logoDgertUrl)]);
  if (logoE) {
    const id = wb.addImage({ buffer: logoE.buf as any, extension: logoE.ext });
    const s = fit(logoE.w, logoE.h, 120, 45);
    ws.addImage(id, { tl: { col: 0.1, row: 0.1 } as any, ext: s, editAs: "oneCell" } as any);
  }
  if (logoD) {
    const id = wb.addImage({ buffer: logoD.buf as any, extension: logoD.ext });
    const s = fit(logoD.w, logoD.h, 120, 45);
    ws.addImage(id, { tl: { col: 6.2, row: 0.1 } as any, ext: s, editAs: "oneCell" } as any);
  }
}

const COLS = [
  { header: "Data", width: 12 },
  { header: "Categoria", width: 16 },
  { header: "Descrição", width: 36 },
  { header: "Fornecedor", width: 22 },
  { header: "NIF", width: 12 },
  { header: "Curso", width: 26 },
  { header: "Observações", width: 24 },
  { header: "Valor (€)", width: 14 },
];
const LAST_COL = "H";

function writeHeaderRow(ws: ExcelJS.Worksheet, row: number) {
  COLS.forEach((c, i) => {
    const cell = ws.getCell(row, i+1);
    cell.value = c.header; cell.font = { bold: true };
    cell.alignment = { horizontal: i === COLS.length - 1 ? "right" : "left", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });
}

function writeDataRow(ws: ExcelJS.Worksheet, row: number, d: DespesaRow) {
  const [y, m, day] = d.data.split("-");
  ws.getCell(row, 1).value = `${day}/${m}/${y}`;
  ws.getCell(row, 2).value = d.categoria;
  ws.getCell(row, 3).value = d.descricao;
  ws.getCell(row, 4).value = d.fornecedor ?? "";
  ws.getCell(row, 5).value = d.nif ?? "";
  ws.getCell(row, 6).value = d.curso_codigo || d.curso_nome ? `${d.curso_codigo ?? ""}${d.curso_codigo && d.curso_nome ? " — " : ""}${d.curso_nome ?? ""}` : "—";
  ws.getCell(row, 7).value = d.observacoes ?? "";
  const vc = ws.getCell(row, 8);
  vc.value = d.valor;
  vc.numFmt = "#,##0.00 €";
}

function writeTotais(ws: ExcelJS.Worksheet, startRow: number, rows: DespesaRow[]): number {
  let r = startRow + 1;
  // Totais por categoria
  const porCat = new Map<string, number>();
  rows.forEach(d => porCat.set(d.categoria, (porCat.get(d.categoria) ?? 0) + Number(d.valor)));
  ws.mergeCells(`A${r}:${LAST_COL}${r}`);
  ws.getCell(`A${r}`).value = "Totais por categoria";
  ws.getCell(`A${r}`).font = { bold: true, size: 11 };
  ws.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
  r++;
  Array.from(porCat.entries()).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([cat, val]) => {
    ws.mergeCells(r, 1, r, 7);
    ws.getCell(r, 1).value = cat;
    ws.getCell(r, 1).alignment = { horizontal: "right" };
    const vc = ws.getCell(r, 8); vc.value = val; vc.numFmt = "#,##0.00 €";
    r++;
  });
  // Totais por curso
  r++;
  const porCurso = new Map<string, number>();
  rows.forEach(d => {
    const key = d.curso_codigo || d.curso_nome ? `${d.curso_codigo ?? ""}${d.curso_codigo && d.curso_nome ? " — " : ""}${d.curso_nome ?? ""}` : "Sem curso";
    porCurso.set(key, (porCurso.get(key) ?? 0) + Number(d.valor));
  });
  ws.mergeCells(`A${r}:${LAST_COL}${r}`);
  ws.getCell(`A${r}`).value = "Totais por curso";
  ws.getCell(`A${r}`).font = { bold: true, size: 11 };
  ws.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2FF" } };
  r++;
  Array.from(porCurso.entries()).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([curso, val]) => {
    ws.mergeCells(r, 1, r, 7);
    ws.getCell(r, 1).value = curso;
    ws.getCell(r, 1).alignment = { horizontal: "right" };
    const vc = ws.getCell(r, 8); vc.value = val; vc.numFmt = "#,##0.00 €";
    r++;
  });
  // Total geral
  r++;
  const geral = rows.reduce((s, d) => s + Number(d.valor), 0);
  ws.mergeCells(r, 1, r, 7);
  ws.getCell(r, 1).value = "TOTAL GERAL";
  ws.getCell(r, 1).alignment = { horizontal: "right" };
  ws.getCell(r, 1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getCell(r, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  const tvc = ws.getCell(r, 8);
  tvc.value = geral; tvc.numFmt = "#,##0.00 €";
  tvc.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
  tvc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  r++;
  return r;
}

async function drawFooterLogo(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook, url: string | null | undefined, atRow: number) {
  const logoP = await fetchImage(url);
  if (!logoP) return;
  const id = wb.addImage({ buffer: logoP.buf as any, extension: logoP.ext });
  const s = fit(logoP.w, logoP.h, 180, 60);
  ws.addImage(id, { tl: { col: 3, row: atRow + 1 } as any, ext: s, editAs: "oneCell" } as any);
}

export async function exportDespesasExcel(p: DespesasExport) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestão de Formação"; wb.created = new Date();

  const setupSheet = (name: string) => {
    const ws = wb.addWorksheet(name, { pageSetup: { orientation: "landscape", fitToPage: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } } });
    ws.columns = COLS.map(c => ({ width: c.width }));
    return ws;
  };

  if (p.modo === "consolidado") {
    const ws = setupSheet("Despesas");
    await drawLogos(ws, wb, p);
    drawHeader(ws, p.titulo, p.periodo, p.empresa, LAST_COL);
    let r = 8;
    writeHeaderRow(ws, r); r++;
    const ordenadas = [...p.rows].sort((a,b) => a.data.localeCompare(b.data));
    ordenadas.forEach(d => { writeDataRow(ws, r, d); r++; });
    if (!ordenadas.length) {
      ws.mergeCells(`A${r}:${LAST_COL}${r}`);
      ws.getCell(`A${r}`).value = "Sem despesas para os filtros aplicados.";
      ws.getCell(`A${r}`).font = { italic: true, color: { argb: "FF999999" } };
      r++;
    } else {
      r = writeTotais(ws, r + 1, ordenadas);
    }
    await drawFooterLogo(ws, wb, p.logoPessoas2030Url, r);
  } else {
    // por curso — uma folha por curso + folha Resumo
    const grupos = new Map<string, DespesaRow[]>();
    p.rows.forEach(d => {
      const key = d.curso_codigo || d.curso_nome ? `${d.curso_codigo ?? ""}${d.curso_codigo && d.curso_nome ? " — " : ""}${d.curso_nome ?? ""}` : "Sem curso";
      const arr = grupos.get(key) ?? [];
      arr.push(d); grupos.set(key, arr);
    });

    // Resumo primeiro
    const wsResumo = setupSheet("Resumo");
    await drawLogos(wsResumo, wb, p);
    drawHeader(wsResumo, `${p.titulo} — Resumo por curso`, p.periodo, p.empresa, LAST_COL);
    let rr = 8;
    wsResumo.mergeCells(`A${rr}:${LAST_COL}${rr}`);
    wsResumo.getCell(`A${rr}`).value = "Curso"; wsResumo.getCell(`A${rr}`).font = { bold: true };
    wsResumo.getCell(`A${rr}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    rr++;
    const cursoTot: Array<{ curso: string; valor: number; n: number }> = [];
    Array.from(grupos.entries()).forEach(([curso, rows]) => {
      const total = rows.reduce((s, d) => s + Number(d.valor), 0);
      cursoTot.push({ curso, valor: total, n: rows.length });
    });
    cursoTot.sort((a,b) => a.curso.localeCompare(b.curso));
    cursoTot.forEach(({ curso, valor, n }) => {
      wsResumo.mergeCells(rr, 1, rr, 6);
      wsResumo.getCell(rr, 1).value = curso;
      wsResumo.getCell(rr, 7).value = `${n} despesa(s)`;
      wsResumo.getCell(rr, 7).alignment = { horizontal: "right" };
      wsResumo.getCell(rr, 7).font = { italic: true, color: { argb: "FF777777" } };
      const vc = wsResumo.getCell(rr, 8); vc.value = valor; vc.numFmt = "#,##0.00 €";
      rr++;
    });
    rr++;
    const geral = p.rows.reduce((s, d) => s + Number(d.valor), 0);
    wsResumo.mergeCells(rr, 1, rr, 7);
    wsResumo.getCell(rr, 1).value = "TOTAL GERAL";
    wsResumo.getCell(rr, 1).alignment = { horizontal: "right" };
    wsResumo.getCell(rr, 1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    wsResumo.getCell(rr, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    const tvc = wsResumo.getCell(rr, 8);
    tvc.value = geral; tvc.numFmt = "#,##0.00 €";
    tvc.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    tvc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
    rr++;
    await drawFooterLogo(wsResumo, wb, p.logoPessoas2030Url, rr);

    // Uma folha por curso
    Array.from(grupos.entries()).sort((a,b) => a[0].localeCompare(b[0])).forEach(([curso, rows]) => {
      const safeName = curso.replace(/[\\/*?:[\]]/g, " ").slice(0, 28) || "Curso";
      const ws = setupSheet(safeName);
      drawHeader(ws, `${p.titulo} — ${curso}`, p.periodo, p.empresa, LAST_COL);
      let r = 8;
      writeHeaderRow(ws, r); r++;
      const ord = [...rows].sort((a,b) => a.data.localeCompare(b.data));
      ord.forEach(d => { writeDataRow(ws, r, d); r++; });
      r = writeTotais(ws, r + 1, ord);
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const sfx = p.modo === "consolidado" ? "consolidado" : "por_curso";
  const name = `despesas_${sfx}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  await saveFile(name, buf as ArrayBuffer);
}
