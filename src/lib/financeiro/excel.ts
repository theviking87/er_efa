import ExcelJS from "exceljs";
import { saveFile } from "@/lib/dom-helpers";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export type RubricaFilter = "BF" | "BFM" | "SA" | "TR" | "HN";

export type ProcessamentoExport = {
  ano: number; mes: number;
  curso: { codigo?: string | null; nome?: string | null; acao?: string | null; codigo_operacao?: string | null; codigo_sigo?: string | null } | null;
  totais: { BF: number; BFM: number; SA: number; TR: number; HN: number; geral: number };
  formandos: Array<{ id?: string; nome: string; rubrica: string; horas_previstas: number; horas_frequentadas: number; dias_elegiveis: number; valor_hora?: number; valor: number }>;
  formadores: Array<{ id?: string; nome: string; horas_frequentadas: number; valor_hora: number; valor: number }>;
  empresa?: { nome?: string | null; nif?: string | null; morada?: string | null } | null;
  logoEmpresaUrl?: string | null;
  logoDgertUrl?: string | null;
  logoPessoas2030Url?: string | null;
  filtro?: {
    // Se definido, exporta APENAS este formando (esconde secção de formadores)
    formandoId?: string | null;
    // Se definido, exporta APENAS este formador (esconde secção de formandos)
    formadorId?: string | null;
    // Rubricas a incluir. Se vazio/omitido = todas.
    rubricas?: RubricaFilter[];
  };
};

async function fetchImage(url?: string | null): Promise<{ buf: ArrayBuffer; ext: "png" | "jpeg" } | null> {
  if (!url) return null;
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const ext: "png" | "jpeg" = /\.jpe?g(\?|$)/i.test(url) ? "jpeg" : "png";
    return { buf, ext };
  } catch { return null; }
}

export async function exportProcessamentoExcel(p: ProcessamentoExport) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestão de Formação"; wb.created = new Date();

  const ws = wb.addWorksheet("Processamento", { pageSetup: { orientation: "landscape", fitToPage: true, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } } });
  ws.columns = [
    { width: 32 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 8 }, { width: 14 },
  ];

  // Logos — Empresa e DGERT no topo, Pessoas 2030 no fundo
  const [logoE, logoD, logoP] = await Promise.all([
    fetchImage(p.logoEmpresaUrl), fetchImage(p.logoDgertUrl), fetchImage(p.logoPessoas2030Url),
  ]);
  if (logoE) {
    const id = wb.addImage({ buffer: logoE.buf as any, extension: logoE.ext });
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 130, height: 55 } });
  }
  if (logoD) {
    const id = wb.addImage({ buffer: logoD.buf as any, extension: logoD.ext });
    ws.addImage(id, { tl: { col: 5, row: 0 }, ext: { width: 130, height: 55 } });
  }
  ws.getRow(1).height = 46; ws.getRow(2).height = 20;

  ws.mergeCells("A4:F4");
  ws.getCell("A4").value = `Processamento — ${MESES[p.mes-1]} / ${p.ano}`;
  ws.getCell("A4").font = { size: 14, bold: true };
  ws.mergeCells("A5:F5");
  ws.getCell("A5").value = `${p.curso?.codigo ?? ""} — ${p.curso?.nome ?? ""}`;
  ws.getCell("A5").font = { size: 11, color: { argb: "FF666666" } };

  const metaCurso = [
    p.curso?.acao ? `Ação: ${p.curso.acao}` : "",
    p.curso?.codigo_operacao ? `Cód. Operação: ${p.curso.codigo_operacao}` : "",
    p.curso?.codigo_sigo ? `Cód. SIGO: ${p.curso.codigo_sigo}` : "",
  ].filter(Boolean).join("  •  ");
  if (metaCurso) {
    ws.mergeCells("A6:F6");
    ws.getCell("A6").value = metaCurso;
    ws.getCell("A6").font = { size: 9, color: { argb: "FF444444" } };
  }

  if (p.empresa) {
    ws.mergeCells("A7:F7");
    ws.getCell("A7").value = `${p.empresa.nome ?? ""} • NIF ${p.empresa.nif ?? "—"} • ${p.empresa.morada ?? ""}`;
    ws.getCell("A7").font = { size: 9, color: { argb: "FF888888" } };
  }

  const filtro = p.filtro ?? {};
  const rubricasSel = filtro.rubricas && filtro.rubricas.length ? new Set(filtro.rubricas) : null;
  const soFormador = !!filtro.formadorId;
  const soFormando = !!filtro.formandoId;

  const formandosFiltrados = p.formandos.filter(l => {
    if (soFormador) return false;
    if (soFormando && l.id !== filtro.formandoId) return false;
    if (rubricasSel && !rubricasSel.has(l.rubrica as RubricaFilter)) return false;
    return true;
  });
  const formadoresFiltrados = p.formadores.filter(l => {
    if (soFormando) return false;
    if (soFormador && l.id !== filtro.formadorId) return false;
    if (rubricasSel && !rubricasSel.has("HN")) return false;
    return true;
  });

  let r = 8;

  if (!soFormador) {
    ws.mergeCells(`A${r}:F${r}`);
    const tituloF = soFormando
      ? `Formando — ${formandosFiltrados[0]?.nome ?? ""}`
      : "Formandos";
    ws.getCell(`A${r}`).value = tituloF; ws.getCell(`A${r}`).font = { bold: true, size: 12 };
    r++;
    const headFormandos = ["Formando", "Rubrica", "H. previstas", "H. frequentadas", "Dias", "Valor (€)"];
    headFormandos.forEach((h, i) => {
      const c = ws.getCell(r, i+1); c.value = h; c.font = { bold: true }; c.alignment = { horizontal: i < 2 ? "left" : "right" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
      c.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
    });
    r++;
    formandosFiltrados.forEach(l => {
      ws.getCell(r, 1).value = l.nome;
      ws.getCell(r, 2).value = l.rubrica;
      ws.getCell(r, 3).value = l.horas_previstas; ws.getCell(r, 3).numFmt = "0.0";
      ws.getCell(r, 4).value = l.horas_frequentadas; ws.getCell(r, 4).numFmt = "0.0";
      ws.getCell(r, 5).value = l.dias_elegiveis;
      ws.getCell(r, 6).value = l.valor; ws.getCell(r, 6).numFmt = "#,##0.00 €";
      r++;
    });
    if (!formandosFiltrados.length) {
      ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = "Sem linhas.";
      ws.getCell(`A${r}`).font = { italic: true, color: { argb: "FF999999" } };
      r++;
    }
    r++;
  }

  if (!soFormando) {
    ws.mergeCells(`A${r}:F${r}`);
    const tituloH = soFormador
      ? `Honorários — ${formadoresFiltrados[0]?.nome ?? ""}`
      : "Honorários — Formadores";
    ws.getCell(`A${r}`).value = tituloH; ws.getCell(`A${r}`).font = { bold: true, size: 12 };
    r++;
    const headForm = ["Formador", "", "Horas", "€/hora", "", "Valor (€)"];
    headForm.forEach((h, i) => {
      const c = ws.getCell(r, i+1); c.value = h; c.font = { bold: true }; c.alignment = { horizontal: i === 0 ? "left" : "right" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    });
    r++;
    formadoresFiltrados.forEach(l => {
      ws.getCell(r, 1).value = l.nome;
      ws.getCell(r, 3).value = l.horas_frequentadas; ws.getCell(r, 3).numFmt = "0.0";
      ws.getCell(r, 4).value = l.valor_hora; ws.getCell(r, 4).numFmt = "#,##0.00 €";
      ws.getCell(r, 6).value = l.valor; ws.getCell(r, 6).numFmt = "#,##0.00 €";
      r++;
    });
    if (!formadoresFiltrados.length) {
      ws.mergeCells(`A${r}:F${r}`); ws.getCell(`A${r}`).value = "Sem linhas.";
      ws.getCell(`A${r}`).font = { italic: true, color: { argb: "FF999999" } };
      r++;
    }
  }

  // Totais recalculados sobre linhas filtradas
  r += 2;
  const t = { BF: 0, BFM: 0, SA: 0, TR: 0, HN: 0 };
  formandosFiltrados.forEach(l => { const k = l.rubrica as keyof typeof t; if (k in t) t[k] += l.valor; });
  formadoresFiltrados.forEach(l => { t.HN += l.valor; });
  const geral = t.BF + t.BFM + t.SA + t.TR + t.HN;
  const totRows: Array<[string, number]> = [];
  const rubricasVis: RubricaFilter[] = rubricasSel ? Array.from(rubricasSel) : ["BF","BFM","SA","TR","HN"];
  if (!soFormador) {
    if (rubricasVis.includes("BF")) totRows.push(["Total BF", t.BF]);
    if (rubricasVis.includes("BFM")) totRows.push(["Total BFM", t.BFM]);
    if (rubricasVis.includes("SA")) totRows.push(["Total SA", t.SA]);
    if (rubricasVis.includes("TR")) totRows.push(["Total TR", t.TR]);
  }
  if (!soFormando && rubricasVis.includes("HN")) totRows.push(["Total HN", t.HN]);
  totRows.push(["TOTAL", geral]);

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

  // Rodapé Pessoas 2030 centrado abaixo dos totais
  if (logoP) {
    const id = wb.addImage({ buffer: logoP.buf as any, extension: logoP.ext });
    ws.addImage(id, { tl: { col: 2, row: r + 1 }, ext: { width: 160, height: 55 } });
  }

  const buf = await wb.xlsx.writeBuffer();
  const alvo = soFormando
    ? `_form_${(formandosFiltrados[0]?.nome ?? "").replace(/\W+/g,"_").slice(0,30)}`
    : soFormador
      ? `_hnr_${(formadoresFiltrados[0]?.nome ?? "").replace(/\W+/g,"_").slice(0,30)}`
      : "";
  const rubSfx = rubricasSel ? `_${Array.from(rubricasSel).join("-")}` : "";
  const name = `processamento_${p.ano}-${String(p.mes).padStart(2, "0")}_${(p.curso?.codigo ?? "curso").replace(/\W+/g, "_")}${alvo}${rubSfx}.xlsx`;
  await saveFile(name, buf as ArrayBuffer);
}
