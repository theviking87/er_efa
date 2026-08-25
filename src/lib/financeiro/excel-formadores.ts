import ExcelJS from "exceljs";
import { saveFile } from "@/lib/dom-helpers";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export type FormadorLinhaExport = {
  nome: string;
  nif?: string | null;
  iban?: string | null;
  horas: number;
  valorHora: number;
  base: number;
  ivaPct: number;      // 0 se não aplica
  seloPct?: number;    // 0 se não aplica
  retencaoPct: number; // 0 se sem retenção
  recibo: boolean;
};


export type ProcFormadoresExport = {
  ano: number; mes: number;
  curso: { codigo?: string | null; nome?: string | null; acao?: string | null; codigo_operacao?: string | null; codigo_sigo?: string | null } | null;
  formadores: FormadorLinhaExport[];
  despesas: Array<{ descricao: string; valor: number }>;
  empresa?: { nome?: string | null; nif?: string | null; morada?: string | null } | null;
  logoEmpresaUrl?: string | null;
  logoDgertUrl?: string | null;
  logoPessoas2030Url?: string | null;
};

async function fetchImage(url?: string | null): Promise<{ buf: ArrayBuffer; ext: "png" | "jpeg"; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const ext: "png" | "jpeg" = /\.jpe?g(\?|$)/i.test(url) ? "jpeg" : "png";
    const blob = new Blob([buf], { type: `image/${ext}` });
    const u2 = URL.createObjectURL(blob);
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = u2;
    });
    URL.revokeObjectURL(u2);
    return { buf, ext, w: dims.w, h: dims.h };
  } catch { return null; }
}

function fit(nw: number, nh: number, maxW: number, maxH: number) {
  const r = Math.min(maxW / nw, maxH / nh);
  return { width: Math.round(nw * r), height: Math.round(nh * r) };
}

const EUR = '#,##0.00 "€"';

export async function exportProcFormadoresExcel(p: ProcFormadoresExport, opts?: { returnFile?: boolean }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestão de Formação"; wb.created = new Date();

  const ws = wb.addWorksheet("Formadores", {
    pageSetup: { orientation: "landscape", fitToPage: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });

  // A..O (15 colunas)
  const colWidths = [30, 14, 24, 9, 10, 15, 8, 13, 8, 13, 17, 8, 16, 16, 12];
  ws.columns = colWidths.map(w => ({ width: w }));
  const LAST = "O";


  const colPx = colWidths.map(w => w * 7);
  const totalPx = colPx.reduce((a, b) => a + b, 0);
  const pxToCol = (px: number) => {
    let acc = 0;
    for (let i = 0; i < colPx.length; i++) {
      if (px < acc + colPx[i]) return i + (px - acc) / colPx[i];
      acc += colPx[i];
    }
    return colPx.length - 1;
  };

  const [logoE, logoD, logoP] = await Promise.all([
    fetchImage(p.logoEmpresaUrl), fetchImage(p.logoDgertUrl), fetchImage(p.logoPessoas2030Url),
  ]);
  const topLogos: Array<{ img: NonNullable<Awaited<ReturnType<typeof fetchImage>>>; size: { width: number; height: number } }> = [];
  if (logoE) topLogos.push({ img: logoE, size: fit(logoE.w, logoE.h, 378, 76) });
  if (logoD) topLogos.push({ img: logoD, size: fit(logoD.w, logoD.h, 180, 63) });
  if (topLogos.length) {
    const gap = 80;
    const blockW = topLogos.reduce((a, l) => a + l.size.width, 0) + gap * (topLogos.length - 1);
    let x = Math.max(0, (totalPx - blockW) / 2);
    const maxH = Math.max(...topLogos.map(l => l.size.height));
    topLogos.forEach(l => {
      const id = wb.addImage({ buffer: l.img.buf as any, extension: l.img.ext });
      ws.addImage(id, { tl: { col: pxToCol(x), row: 0.1 } as any, ext: l.size, editAs: "oneCell" } as any);
      x += l.size.width + gap;
    });
    ws.getRow(1).height = Math.max(38, maxH * 0.78);
  } else {
    ws.getRow(1).height = 38;
  }
  ws.getRow(2).height = 16;

  ws.mergeCells(`A4:${LAST}4`);
  ws.getCell("A4").value = `Processamento de Formadores — ${MESES[p.mes - 1]} / ${p.ano}`;
  ws.getCell("A4").font = { size: 14, bold: true };
  ws.mergeCells(`A5:${LAST}5`);
  ws.getCell("A5").value = `${p.curso?.codigo ?? ""} — ${p.curso?.nome ?? ""}`;
  ws.getCell("A5").font = { size: 11, color: { argb: "FF666666" } };

  const meta = [
    p.curso?.acao ? `Ação: ${p.curso.acao}` : "",
    p.curso?.codigo_operacao ? `Cód. Operação: ${p.curso.codigo_operacao}` : "",
    p.curso?.codigo_sigo ? `Cód. SIGO: ${p.curso.codigo_sigo}` : "",
  ].filter(Boolean).join("  •  ");
  if (meta) {
    ws.mergeCells(`A6:${LAST}6`);
    ws.getCell("A6").value = meta;
    ws.getCell("A6").font = { size: 9, color: { argb: "FF444444" } };
  }
  if (p.empresa) {
    ws.mergeCells(`A7:${LAST}7`);
    ws.getCell("A7").value = `${p.empresa.nome ?? ""} • NIF ${p.empresa.nif ?? "—"} • ${p.empresa.morada ?? ""}`;
    ws.getCell("A7").font = { size: 9, color: { argb: "FF888888" } };
  }

  let r = 9;
  ws.mergeCells(`A${r}:${LAST}${r}`);
  ws.getCell(`A${r}`).value = "Honorários (HN)";
  ws.getCell(`A${r}`).font = { bold: true, size: 12 };
  r++;

  const head = ["Formador", "NIF", "IBAN", "Horas", "€/hora", "Valor ilíquido (€)", "IVA %", "IVA (€)", "Selo %", "Imposto de Selo (€)", "Total do documento (€)", "IRS %", "Retenção na fonte IRS (€)", "Total a pagar (€)", "Recibo"];
  const NCOL = head.length;
  const headRow = ws.getRow(r);
  head.forEach((h, i) => {
    const c = headRow.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
    c.alignment = { vertical: "middle", horizontal: i <= 2 ? "left" : i === NCOL - 1 ? "center" : "right", wrapText: true };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  headRow.height = 30;
  r++;

  const first = r;
  for (const f of p.formadores) {
    const row = ws.getRow(r);
    const seloPct = Number(f.seloPct ?? 0);
    const vIva = f.base * f.ivaPct / 100;
    const vSelo = f.base * seloPct / 100;
    const vIrs = f.base * f.retencaoPct / 100;
    row.getCell(1).value = f.nome;
    row.getCell(2).value = f.nif ?? "—";
    row.getCell(3).value = f.iban ?? "—";
    row.getCell(4).value = Number(f.horas.toFixed(2));
    row.getCell(5).value = f.valorHora;
    row.getCell(6).value = { formula: `D${r}*E${r}`, result: Number(f.base.toFixed(2)) } as any;
    row.getCell(7).value = f.ivaPct / 100;
    row.getCell(8).value = { formula: `F${r}*G${r}`, result: Number(vIva.toFixed(2)) } as any;
    row.getCell(9).value = seloPct / 100;
    row.getCell(10).value = { formula: `F${r}*I${r}`, result: Number(vSelo.toFixed(2)) } as any;
    row.getCell(11).value = { formula: `F${r}+H${r}+J${r}`, result: Number((f.base + vIva + vSelo).toFixed(2)) } as any;
    row.getCell(12).value = f.retencaoPct / 100;
    row.getCell(13).value = { formula: `F${r}*L${r}`, result: Number(vIrs.toFixed(2)) } as any;
    row.getCell(14).value = { formula: `K${r}-M${r}`, result: Number((f.base + vIva + vSelo - vIrs).toFixed(2)) } as any;
    row.getCell(15).value = f.recibo ? "Confirmado" : "Pendente";

    [5, 6, 8, 10, 11, 13, 14].forEach(i => { row.getCell(i).numFmt = EUR; });
    row.getCell(4).numFmt = "0.0";
    [7, 9, 12].forEach(i => { row.getCell(i).numFmt = "0.0%"; });
    row.getCell(15).alignment = { horizontal: "center" };
    row.getCell(14).font = { bold: true };
    for (let i = 1; i <= NCOL; i++) {
      row.getCell(i).border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } };
      row.getCell(i).font = { ...(row.getCell(i).font ?? {}), size: 10 };
    }
    r++;
  }
  const last = r - 1;

  if (p.formadores.length) {
    const tot = ws.getRow(r);
    tot.getCell(1).value = "TOTAL";
    ws.mergeCells(`A${r}:C${r}`);
    tot.getCell(4).value = { formula: `SUM(D${first}:D${last})` } as any;
    [6, 8, 10, 11, 13, 14].forEach(i => {
      const col = String.fromCharCode(64 + i);
      tot.getCell(i).value = { formula: `SUM(${col}${first}:${col}${last})` } as any;
      tot.getCell(i).numFmt = EUR;
    });
    tot.getCell(4).numFmt = "0.0";
    for (let i = 1; i <= NCOL; i++) {
      tot.getCell(i).font = { bold: true, size: 10 };
      tot.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7EEF8" } };
      tot.getCell(i).border = { top: { style: "thin" }, bottom: { style: "double" } };
    }
    r += 2;

  } else {
    ws.getCell(`A${r}`).value = "Sem formadores neste processamento.";
    r += 2;
  }

  // Outras despesas
  if (p.despesas.length) {
    ws.mergeCells(`A${r}:${LAST}${r}`);
    ws.getCell(`A${r}`).value = "Outras despesas";
    ws.getCell(`A${r}`).font = { bold: true, size: 12 };
    r++;
    const hr = ws.getRow(r);
    ["Descrição", "Valor (€)"].forEach((h, i) => {
      const c = hr.getCell(i + 1);
      c.value = h;
      c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
    });
    ws.mergeCells(`A${r}:C${r}`);
    r++;
    const dFirst = r;
    for (const d of p.despesas) {
      const row = ws.getRow(r);
      row.getCell(1).value = d.descricao;
      ws.mergeCells(`A${r}:C${r}`);
      row.getCell(4).value = d.valor;
      row.getCell(4).numFmt = EUR;
      r++;
    }
    const dLast = r - 1;
    const dt = ws.getRow(r);
    dt.getCell(1).value = "TOTAL DESPESAS";
    ws.mergeCells(`A${r}:C${r}`);
    dt.getCell(4).value = { formula: `SUM(D${dFirst}:D${dLast})` } as any;
    dt.getCell(4).numFmt = EUR;
    dt.getCell(1).font = { bold: true }; dt.getCell(4).font = { bold: true };
    r += 2;
  }

  // Logo Pessoas 2030 no rodapé
  if (logoP) {
    const size = fit(logoP.w, logoP.h, 300, 70);
    const id = wb.addImage({ buffer: logoP.buf as any, extension: logoP.ext });
    ws.addImage(id, { tl: { col: pxToCol(Math.max(0, (totalPx - size.width) / 2)), row: r } as any, ext: size, editAs: "oneCell" } as any);
  }

  const cursoTxt = String(p.curso?.codigo ?? p.curso?.nome ?? "").replace(/[\\/:*?"<>|]/g, " ").trim();
  const name = `Processamento Formadores ${cursoTxt} ${String(p.mes).padStart(2, "0")}-${p.ano}.xlsx`.replace(/\s+/g, " ");
  const buf = await wb.xlsx.writeBuffer();
  if (opts?.returnFile) return { name, buf: buf as ArrayBuffer };
  await saveFile(name, buf as ArrayBuffer);
  return { name, buf: buf as ArrayBuffer };
}
