import ExcelJS from "exceljs";
import { saveFile } from "@/lib/dom-helpers";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export type ProcessamentoExport = {
  ano: number; mes: number;
  curso: { codigo?: string | null; nome?: string | null } | null;
  totais: { BF: number; BFM: number; SA: number; TR: number; HN: number; geral: number };
  formandos: Array<{ nome: string; rubrica: string; horas_previstas: number; horas_frequentadas: number; dias_elegiveis: number; valor: number }>;
  formadores: Array<{ nome: string; horas_frequentadas: number; valor_hora: number; valor: number }>;
  empresa?: { nome?: string | null; nif?: string | null; morada?: string | null } | null;
  logoEmpresaUrl?: string | null;
  logoDgertUrl?: string | null;
  logoPessoas2030Url?: string | null;
};

async function fetchImage(url?: string | null): Promise<ArrayBuffer | null> {
  if (!url) return null;
  try { const r = await fetch(url); if (!r.ok) return null; return await r.arrayBuffer(); }
  catch { return null; }
}

export async function exportProcessamentoExcel(p: ProcessamentoExport) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestão de Formação"; wb.created = new Date();

  const ws = wb.addWorksheet("Processamento", { pageSetup: { orientation: "landscape", fitToPage: true, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } } });
  ws.columns = [
    { width: 32 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 8 }, { width: 14 },
  ];

  // Logos
  const [logoE, logoD, logoP] = await Promise.all([
    fetchImage(p.logoEmpresaUrl), fetchImage(p.logoDgertUrl), fetchImage(p.logoPessoas2030Url),
  ]);
  let anchorCol = 0;
  for (const buf of [logoE, logoD, logoP]) {
    if (!buf) continue;
    const id = wb.addImage({ buffer: buf as any, extension: "png" });
    ws.addImage(id, { tl: { col: anchorCol, row: 0 }, ext: { width: 110, height: 55 } });
    anchorCol += 2;
  }
  ws.getRow(1).height = 46; ws.getRow(2).height = 20;

  ws.mergeCells("A4:F4");
  ws.getCell("A4").value = `Processamento — ${MESES[p.mes-1]} / ${p.ano}`;
  ws.getCell("A4").font = { size: 14, bold: true };
  ws.mergeCells("A5:F5");
  ws.getCell("A5").value = `${p.curso?.codigo ?? ""} — ${p.curso?.nome ?? ""}`;
  ws.getCell("A5").font = { size: 11, color: { argb: "FF666666" } };

  if (p.empresa) {
    ws.mergeCells("A6:F6");
    ws.getCell("A6").value = `${p.empresa.nome ?? ""} • NIF ${p.empresa.nif ?? "—"} • ${p.empresa.morada ?? ""}`;
    ws.getCell("A6").font = { size: 9, color: { argb: "FF888888" } };
  }

  let r = 8;
  ws.mergeCells(`A${r}:F${r}`);
  ws.getCell(`A${r}`).value = "Formandos"; ws.getCell(`A${r}`).font = { bold: true, size: 12 };
  r++;
  const headFormandos = ["Formando", "Rubrica", "H. previstas", "H. frequentadas", "Dias", "Valor (€)"];
  headFormandos.forEach((h, i) => {
    const c = ws.getCell(r, i+1); c.value = h; c.font = { bold: true }; c.alignment = { horizontal: i < 2 ? "left" : "right" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    c.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
  });
  r++;
  p.formandos.forEach(l => {
    ws.getCell(r, 1).value = l.nome;
    ws.getCell(r, 2).value = l.rubrica;
    ws.getCell(r, 3).value = l.horas_previstas; ws.getCell(r, 3).numFmt = "0.0";
    ws.getCell(r, 4).value = l.horas_frequentadas; ws.getCell(r, 4).numFmt = "0.0";
    ws.getCell(r, 5).value = l.dias_elegiveis;
    ws.getCell(r, 6).value = l.valor; ws.getCell(r, 6).numFmt = "#,##0.00 €";
    r++;
  });

  r++;
  ws.mergeCells(`A${r}:F${r}`);
  ws.getCell(`A${r}`).value = "Honorários — Formadores"; ws.getCell(`A${r}`).font = { bold: true, size: 12 };
  r++;
  const headForm = ["Formador", "", "Horas", "€/hora", "", "Valor (€)"];
  headForm.forEach((h, i) => {
    const c = ws.getCell(r, i+1); c.value = h; c.font = { bold: true }; c.alignment = { horizontal: i === 0 ? "left" : "right" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  });
  r++;
  p.formadores.forEach(l => {
    ws.getCell(r, 1).value = l.nome;
    ws.getCell(r, 3).value = l.horas_frequentadas; ws.getCell(r, 3).numFmt = "0.0";
    ws.getCell(r, 4).value = l.valor_hora; ws.getCell(r, 4).numFmt = "#,##0.00 €";
    ws.getCell(r, 6).value = l.valor; ws.getCell(r, 6).numFmt = "#,##0.00 €";
    r++;
  });

  r += 2;
  const totRows: Array<[string, number]> = [
    ["Total BF", p.totais.BF], ["Total BFM", p.totais.BFM],
    ["Total SA", p.totais.SA], ["Total TR", p.totais.TR],
    ["Total HN", p.totais.HN], ["TOTAL GERAL", p.totais.geral],
  ];
  totRows.forEach(([lab, val], i) => {
    const isTotal = i === totRows.length - 1;
    ws.mergeCells(r, 1, r, 5);
    ws.getCell(r, 1).value = lab;
    ws.getCell(r, 1).alignment = { horizontal: "right" };
    ws.getCell(r, 1).font = { bold: isTotal };
    ws.getCell(r, 6).value = val; ws.getCell(r, 6).numFmt = "#,##0.00 €";
    ws.getCell(r, 6).font = { bold: isTotal, size: isTotal ? 12 : 11 };
    if (isTotal) {
      ws.getCell(r, 1).fill = ws.getCell(r, 6).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
      ws.getCell(r, 1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getCell(r, 6).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    }
    r++;
  });

  const buf = await wb.xlsx.writeBuffer();
  const name = `processamento_${p.ano}-${String(p.mes).padStart(2, "0")}_${(p.curso?.codigo ?? "curso").replace(/\W+/g, "_")}.xlsx`;
  await saveFile(name, buf as ArrayBuffer);
}
