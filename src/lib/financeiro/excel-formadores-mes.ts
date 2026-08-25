import ExcelJS from "exceljs";
import { saveFile } from "@/lib/dom-helpers";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const EUR = '#,##0.00 "€"';

export type LinhaFormadorMes = {
  nome: string;
  curso: string;
  nif?: string | null;
  iban?: string | null;
  horas: number;
  valorHora: number;
  base: number;
  ivaPct: number;
  seloPct: number;
  retencaoPct: number;
  recibo: boolean;
};

export type ExportFormadoresMes = {
  ano: number;
  mes: number;
  linhas: LinhaFormadorMes[];
  empresa?: { nome?: string | null; nif?: string | null; morada?: string | null } | null;
};

export async function exportFormadoresMesExcel(p: ExportFormadoresMes) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestão de Formação"; wb.created = new Date();
  const ws = wb.addWorksheet(`${String(p.mes).padStart(2, "0")}-${p.ano}`, {
    pageSetup: { orientation: "landscape", fitToPage: true },
  });

  const colWidths = [28, 30, 13, 24, 8, 10, 15, 8, 13, 8, 13, 17, 8, 16, 16, 11];
  ws.columns = colWidths.map(w => ({ width: w }));
  const NCOL = colWidths.length; // 16 -> A..P
  const LAST = "P";

  ws.mergeCells(`A1:${LAST}1`);
  ws.getCell("A1").value = `Formadores — Resumo mensal ${MESES[p.mes - 1]} / ${p.ano}`;
  ws.getCell("A1").font = { size: 14, bold: true };
  if (p.empresa) {
    ws.mergeCells(`A2:${LAST}2`);
    ws.getCell("A2").value = `${p.empresa.nome ?? ""} • NIF ${p.empresa.nif ?? "—"} • ${p.empresa.morada ?? ""}`;
    ws.getCell("A2").font = { size: 9, color: { argb: "FF888888" } };
  }

  // Ordenar por formador (alfabético) e, dentro do formador, por curso.
  const linhas = [...p.linhas].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt") || a.curso.localeCompare(b.curso, "pt"));

  let r = 4;
  const head = ["Formador", "Curso", "NIF", "IBAN", "Horas", "€/hora", "Valor ilíquido (€)", "IVA %", "IVA (€)", "Selo %", "Imposto de Selo (€)", "Total do documento (€)", "IRS %", "Retenção na fonte IRS (€)", "Total a pagar (€)", "Recibo"];
  const hr = ws.getRow(r);
  head.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    const hiIva = i === 8, hiIrs = i === 13;
    c.font = { bold: true, size: 10, color: { argb: (hiIva || hiIrs) ? "FF1F3864" : "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: hiIva ? "FF93C5FD" : hiIrs ? "FFFCD34D" : "FF1F3864" } };
    c.alignment = { vertical: "middle", horizontal: i <= 3 ? "left" : i === NCOL - 1 ? "center" : "right", wrapText: true };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  hr.height = 30;
  r++;

  const first = r;
  const dataRows: number[] = [];
  let i = 0;
  while (i < linhas.length) {
    const nome = linhas[i].nome;
    const grupo: number[] = [];
    while (i < linhas.length && linhas[i].nome === nome) {
      const f = linhas[i];
      const row = ws.getRow(r);
      const vIva = f.base * f.ivaPct / 100;
      const vSelo = f.base * f.seloPct / 100;
      const vIrs = f.base * f.retencaoPct / 100;
      row.getCell(1).value = grupo.length === 0 ? f.nome : "";
      row.getCell(2).value = f.curso;
      row.getCell(3).value = f.nif ?? "—";
      row.getCell(4).value = f.iban ?? "—";
      row.getCell(5).value = Number(f.horas.toFixed(2));
      row.getCell(6).value = f.valorHora;
      row.getCell(7).value = { formula: `E${r}*F${r}`, result: Number(f.base.toFixed(2)) } as any;
      row.getCell(8).value = f.ivaPct / 100;
      row.getCell(9).value = { formula: `G${r}*H${r}`, result: Number(vIva.toFixed(2)) } as any;
      row.getCell(10).value = f.seloPct / 100;
      row.getCell(11).value = { formula: `G${r}*J${r}`, result: Number(vSelo.toFixed(2)) } as any;
      row.getCell(12).value = { formula: `G${r}+I${r}+K${r}`, result: Number((f.base + vIva + vSelo).toFixed(2)) } as any;
      row.getCell(13).value = f.retencaoPct / 100;
      row.getCell(14).value = { formula: `G${r}*M${r}`, result: Number(vIrs.toFixed(2)) } as any;
      row.getCell(15).value = { formula: `L${r}-N${r}`, result: Number((f.base + vIva + vSelo - vIrs).toFixed(2)) } as any;
      row.getCell(16).value = f.recibo ? "Confirmado" : "Pendente";

      [6, 7, 9, 11, 12, 14, 15].forEach(n => { row.getCell(n).numFmt = EUR; });
      row.getCell(5).numFmt = "0.0";
      [8, 10, 13].forEach(n => { row.getCell(n).numFmt = "0.0%"; });
      row.getCell(16).alignment = { horizontal: "center" };
      row.getCell(1).font = { bold: true, size: 10 };
      row.getCell(2).font = { size: 9, italic: true, color: { argb: "FF555555" } };
      for (let n = 1; n <= NCOL; n++) {
        row.getCell(n).border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } };
        if (![1, 2, 9, 14].includes(n)) row.getCell(n).font = { ...(row.getCell(n).font ?? {}), size: 10 };
      }
      row.getCell(9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
      row.getCell(9).font = { size: 10, bold: true, color: { argb: "FF1E40AF" } };
      row.getCell(14).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      row.getCell(14).font = { size: 10, bold: true, color: { argb: "FFB45309" } };

      grupo.push(r);
      dataRows.push(r);
      r++;
      i++;
    }

    // Subtotal por formador quando tem mais do que um curso
    if (grupo.length > 1) {
      const st = ws.getRow(r);
      st.getCell(1).value = `Subtotal — ${nome}`;
      ws.mergeCells(`A${r}:D${r}`);
      const cells = grupo.map(g => `E${g}`).join(",");
      st.getCell(5).value = { formula: `SUM(${cells})` } as any;
      st.getCell(5).numFmt = "0.0";
      [7, 9, 11, 12, 14, 15].forEach(n => {
        const col = String.fromCharCode(64 + n);
        st.getCell(n).value = { formula: `SUM(${grupo.map(g => `${col}${g}`).join(",")})` } as any;
        st.getCell(n).numFmt = EUR;
      });
      for (let n = 1; n <= NCOL; n++) {
        st.getCell(n).font = { bold: true, size: 10, color: { argb: "FF1F3864" } };
        st.getCell(n).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
        st.getCell(n).border = { top: { style: "thin" }, bottom: { style: "thin" } };
      }
      r++;
    }
  }

  if (dataRows.length) {
    const tot = ws.getRow(r);
    tot.getCell(1).value = "TOTAL GERAL";
    ws.mergeCells(`A${r}:D${r}`);
    tot.getCell(5).value = { formula: `SUM(${dataRows.map(g => `E${g}`).join(",")})` } as any;
    tot.getCell(5).numFmt = "0.0";
    [7, 9, 11, 12, 14, 15].forEach(n => {
      const col = String.fromCharCode(64 + n);
      tot.getCell(n).value = { formula: `SUM(${dataRows.map(g => `${col}${g}`).join(",")})` } as any;
      tot.getCell(n).numFmt = EUR;
    });
    for (let n = 1; n <= NCOL; n++) {
      const hiIva = n === 9, hiIrs = n === 14;
      tot.getCell(n).font = { bold: true, size: 10, color: hiIva ? { argb: "FF1E40AF" } : hiIrs ? { argb: "FFB45309" } : undefined };
      tot.getCell(n).fill = { type: "pattern", pattern: "solid", fgColor: { argb: hiIva ? "FFDBEAFE" : hiIrs ? "FFFEF3C7" : "FFE7EEF8" } };
      tot.getCell(n).border = { top: { style: "thin" }, bottom: { style: "double" } };
    }
  } else {
    ws.getCell(`A${r}`).value = "Sem honorários processados neste mês.";
  }

  ws.views = [{ state: "frozen", ySplit: first - 1 }];

  const name = `Formadores ${String(p.mes).padStart(2, "0")}-${p.ano}.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  await saveFile(name, buf as ArrayBuffer);
  return name;
}
