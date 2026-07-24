import ExcelJS from "exceljs";
import { saveFile } from "@/lib/dom-helpers";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export type RubricaFilter = "BF" | "BFM" | "SA" | "TR" | "HN" | "ATL";

export type ProcessamentoExport = {
  ano: number; mes: number;
  curso: { codigo?: string | null; nome?: string | null; acao?: string | null; codigo_operacao?: string | null; codigo_sigo?: string | null } | null;
  totais: { BF: number; BFM: number; SA: number; TR: number; HN: number; ATL: number; geral: number };
  formandos: Array<{ id?: string; nome: string; rubrica: string; horas_previstas: number; horas_frequentadas: number; dias_elegiveis: number; valor_hora?: number; valor_dia?: number; km_total?: number; valor: number; memoria_calculo?: Record<string, unknown> | null }>;
  formadores: Array<{ id?: string; nome: string; horas_frequentadas: number; valor_hora: number; valor: number; memoria_calculo?: Record<string, unknown> | null }>;
  empresa?: { nome?: string | null; nif?: string | null; morada?: string | null } | null;
  logoEmpresaUrl?: string | null;
  logoDgertUrl?: string | null;
  logoPessoas2030Url?: string | null;
  filtro?: {
    formandoId?: string | null;
    formadorId?: string | null;
    rubricas?: RubricaFilter[];
  };
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

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : (+v.toFixed(4)).toString().replace(/\.?0+$/, "");
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
}

function memoriaToStr(m?: Record<string, unknown> | null): string {
  if (!m || typeof m !== "object") return "";
  const entries = Object.entries(m);
  if (!entries.length) return "";
  // Coloca formula/regra à frente, depois pares chave=valor.
  const partes: string[] = [];
  const formula = m["formula"]; const regra = m["regra"];
  if (formula) partes.push(String(formula));
  if (regra) partes.push(String(regra));
  const resto = entries.filter(([k]) => k !== "formula" && k !== "regra");
  if (resto.length) {
    partes.push(resto.map(([k, v]) => `${k}=${fmtVal(v)}`).join("; "));
  }
  return partes.join("  •  ");
}

export async function exportProcessamentoExcel(p: ProcessamentoExport) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestão de Formação"; wb.created = new Date();

  const ws = wb.addWorksheet("Processamento", { pageSetup: { orientation: "landscape", fitToPage: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } } });
  // 9 colunas: Nome, Rubrica, H.prev, H.freq, Dias, Km, €/hora ou €/dia, €/Km, Valor (fórmula)
  ws.columns = [
    { width: 30 }, { width: 9 }, { width: 10 }, { width: 11 }, { width: 7 }, { width: 8 }, { width: 13 }, { width: 10 }, { width: 15 },
  ];
  const LAST_COL = "I"; // 9

  // Logos — Empresa e DGERT no topo, Pessoas 2030 no fundo. Respeitar aspect ratio real.
  const [logoE, logoD, logoP] = await Promise.all([
    fetchImage(p.logoEmpresaUrl), fetchImage(p.logoDgertUrl), fetchImage(p.logoPessoas2030Url),
  ]);
  if (logoE) {
    const id = wb.addImage({ buffer: logoE.buf as any, extension: logoE.ext });
    const s = fit(logoE.w, logoE.h, 120, 45);
    ws.addImage(id, { tl: { col: 0.1, row: 0.1 } as any, ext: s, editAs: "oneCell" } as any);
  }
  if (logoD) {
    const id = wb.addImage({ buffer: logoD.buf as any, extension: logoD.ext });
    const s = fit(logoD.w, logoD.h, 120, 45);
    ws.addImage(id, { tl: { col: 7.2, row: 0.1 } as any, ext: s, editAs: "oneCell" } as any);
  }
  ws.getRow(1).height = 38; ws.getRow(2).height = 16;

  ws.mergeCells(`A4:${LAST_COL}4`);
  ws.getCell("A4").value = `Processamento — ${MESES[p.mes-1]} / ${p.ano}`;
  ws.getCell("A4").font = { size: 14, bold: true };
  ws.mergeCells(`A5:${LAST_COL}5`);
  ws.getCell("A5").value = `${p.curso?.codigo ?? ""} — ${p.curso?.nome ?? ""}`;
  ws.getCell("A5").font = { size: 11, color: { argb: "FF666666" } };

  const metaCurso = [
    p.curso?.acao ? `Ação: ${p.curso.acao}` : "",
    p.curso?.codigo_operacao ? `Cód. Operação: ${p.curso.codigo_operacao}` : "",
    p.curso?.codigo_sigo ? `Cód. SIGO: ${p.curso.codigo_sigo}` : "",
  ].filter(Boolean).join("  •  ");
  if (metaCurso) {
    ws.mergeCells(`A6:${LAST_COL}6`);
    ws.getCell("A6").value = metaCurso;
    ws.getCell("A6").font = { size: 9, color: { argb: "FF444444" } };
  }

  if (p.empresa) {
    ws.mergeCells(`A7:${LAST_COL}7`);
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
  let formandosFirstRow = 0, formandosLastRow = 0;
  let formadoresFirstRow = 0, formadoresLastRow = 0;

  if (!soFormador) {
    ws.mergeCells(`A${r}:${LAST_COL}${r}`);
    const tituloF = soFormando
      ? `Formando — ${formandosFiltrados[0]?.nome ?? ""}`
      : "Formandos";
    ws.getCell(`A${r}`).value = tituloF; ws.getCell(`A${r}`).font = { bold: true, size: 12 };
    r++;
    const headFormandos = ["Formando", "Rubrica", "H. previstas", "H. frequentadas", "Dias", "Km", "€/hora ou €/dia", "€/Km", "Valor (€)"];
    headFormandos.forEach((h, i) => {
      const c = ws.getCell(r, i+1); c.value = h; c.font = { bold: true };
      c.alignment = { horizontal: i < 2 ? "left" : "right", vertical: "middle", wrapText: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
      c.border = { bottom: { style: "thin", color: { argb: "FFCCCCCC" } } };
    });
    r++;
    formandosFirstRow = r;
    formandosFiltrados.forEach(l => {
      ws.getCell(r, 1).value = l.nome;
      ws.getCell(r, 2).value = l.rubrica;
      ws.getCell(r, 3).value = l.horas_previstas; ws.getCell(r, 3).numFmt = "0.0";
      ws.getCell(r, 4).value = l.horas_frequentadas; ws.getCell(r, 4).numFmt = "0.0";
      ws.getCell(r, 5).value = l.dias_elegiveis;
      const rub = l.rubrica;
      const mem = (l.memoria_calculo ?? {}) as Record<string, unknown>;
      const kmDiaAplicado = Number(mem["km_dia_aplicado"] ?? 0);
      const valorKm = Number(mem["valor_km"] ?? 0);
      const tetoMensalTR = Number(mem["tr_teto_mensal"] ?? mem["teto_mensal"] ?? 152.78);
      // Km column
      if (rub === "TR" && kmDiaAplicado > 0) {
        ws.getCell(r, 6).value = { formula: `E${r}*${kmDiaAplicado}`, result: l.km_total ?? 0 } as any;
        ws.getCell(r, 6).numFmt = "0.0";
      } else if (l.km_total && l.km_total > 0) {
        ws.getCell(r, 6).value = l.km_total; ws.getCell(r, 6).numFmt = "0.0";
      }
      // Taxa €/h ou €/d
      let temTaxa = false;
      if (l.valor_hora && l.valor_hora > 0) { ws.getCell(r, 7).value = l.valor_hora; ws.getCell(r, 7).numFmt = "#,##0.0000 €"; temTaxa = true; }
      else if (l.valor_dia && l.valor_dia > 0) { ws.getCell(r, 7).value = l.valor_dia; ws.getCell(r, 7).numFmt = "#,##0.00 €"; temTaxa = true; }
      // €/Km
      if (rub === "TR" && valorKm > 0) {
        ws.getCell(r, 8).value = valorKm; ws.getCell(r, 8).numFmt = "#,##0.0000 €";
      }
      const vc = ws.getCell(r, 9);
      if (temTaxa && (rub === "BF" || rub === "BFM")) {
        vc.value = { formula: `D${r}*G${r}`, result: l.valor } as any;
      } else if (temTaxa && rub === "SA") {
        vc.value = { formula: `E${r}*G${r}`, result: l.valor } as any;
      } else if (rub === "TR" && valorKm > 0) {
        vc.value = { formula: `MIN(F${r}*H${r},${tetoMensalTR})`, result: l.valor } as any;
      } else {
        vc.value = l.valor;
      }
      vc.numFmt = "#,##0.00 €";
      const memo = memoriaToStr(l.memoria_calculo);
      if (memo) {
        vc.note = { texts: [{ text: memo }], margins: { insetmode: "auto" } } as any;
      }
      r++;
    });
    formandosLastRow = r - 1;
    if (!formandosFiltrados.length) {
      ws.mergeCells(`A${r}:${LAST_COL}${r}`); ws.getCell(`A${r}`).value = "Sem linhas.";
      ws.getCell(`A${r}`).font = { italic: true, color: { argb: "FF999999" } };
      r++;
    }
    r++;
  }

  if (!soFormando) {
    ws.mergeCells(`A${r}:${LAST_COL}${r}`);
    const tituloH = soFormador
      ? `Honorários — ${formadoresFiltrados[0]?.nome ?? ""}`
      : "Honorários — Formadores";
    ws.getCell(`A${r}`).value = tituloH; ws.getCell(`A${r}`).font = { bold: true, size: 12 };
    r++;
    const headForm = ["Formador", "", "", "Horas", "", "", "€/hora", "", "Valor (€)"];
    headForm.forEach((h, i) => {
      const c = ws.getCell(r, i+1); c.value = h; c.font = { bold: true };
      c.alignment = { horizontal: i === 0 ? "left" : "right", wrapText: true, vertical: "middle" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    });
    r++;
    formadoresFirstRow = r;
    formadoresFiltrados.forEach(l => {
      ws.getCell(r, 1).value = l.nome;
      ws.getCell(r, 4).value = l.horas_frequentadas; ws.getCell(r, 4).numFmt = "0.0";
      ws.getCell(r, 7).value = l.valor_hora; ws.getCell(r, 7).numFmt = "#,##0.00 €";
      const vc = ws.getCell(r, 9);
      vc.value = { formula: `D${r}*G${r}`, result: l.valor } as any;
      vc.numFmt = "#,##0.00 €";
      const memo = memoriaToStr(l.memoria_calculo);
      if (memo) {
        vc.note = { texts: [{ text: memo }], margins: { insetmode: "auto" } } as any;
      }
      r++;
    });
    formadoresLastRow = r - 1;
    if (!formadoresFiltrados.length) {
      ws.mergeCells(`A${r}:${LAST_COL}${r}`); ws.getCell(`A${r}`).value = "Sem linhas.";
      ws.getCell(`A${r}`).font = { italic: true, color: { argb: "FF999999" } };
      r++;
    }
  }

  // Totais recalculados sobre linhas filtradas — usar fórmulas (SUMIF sobre coluna Rubrica)
  r += 2;
  const t = { BF: 0, BFM: 0, SA: 0, TR: 0, HN: 0, ATL: 0 };
  formandosFiltrados.forEach(l => { const k = l.rubrica as keyof typeof t; if (k in t) t[k] += l.valor; });
  formadoresFiltrados.forEach(l => { t.HN += l.valor; });
  const geral = t.BF + t.BFM + t.SA + t.TR + t.HN + t.ATL;
  const rubricasVis: RubricaFilter[] = rubricasSel ? Array.from(rubricasSel) : ["BF","BFM","SA","TR","HN","ATL"];
  const hasFormRange = formandosFirstRow > 0 && formandosLastRow >= formandosFirstRow;
  const hasHnRange = formadoresFirstRow > 0 && formadoresLastRow >= formadoresFirstRow;
  const fRange = hasFormRange ? `B${formandosFirstRow}:B${formandosLastRow}` : "";
  const fSum = hasFormRange ? `I${formandosFirstRow}:I${formandosLastRow}` : "";
  const hSum = hasHnRange ? `I${formadoresFirstRow}:I${formadoresLastRow}` : "";

  const totRows: Array<{ label: string; result: number; formula?: string }> = [];
  const subtotalRowRefs: number[] = [];

  if (!soFormador) {
    const push = (rub: RubricaFilter, label: string, val: number) => {
      if (!rubricasVis.includes(rub)) return;
      totRows.push({ label, result: val, formula: hasFormRange ? `SUMIF(${fRange},"${rub}",${fSum})` : undefined });
    };
    push("BF", "Total BF", t.BF);
    push("BFM", "Total BFM", t.BFM);
    push("SA", "Total SA", t.SA);
    push("TR", "Total TR", t.TR);
    push("ATL", "Total ATL", t.ATL);
  }

  // Escrever primeiro os "Total X" para conseguir referenciar depois no subtotal.
  const detailStartRow = r;
  totRows.forEach((tr) => {
    ws.mergeCells(r, 1, r, 8);
    ws.getCell(r, 1).value = tr.label;
    ws.getCell(r, 1).alignment = { horizontal: "right" };
    const vc = ws.getCell(r, 9);
    vc.value = tr.formula ? ({ formula: tr.formula, result: tr.result } as any) : tr.result;
    vc.numFmt = "#,##0.00 €";
    r++;
  });
  const detailEndRow = r - 1;

  const subtotalRows: Array<{ label: string; result: number; formula?: string }> = [];
  if (!soFormador) {
    const totalFormandos = (rubricasVis.includes("BF") ? t.BF : 0) + (rubricasVis.includes("BFM") ? t.BFM : 0) + (rubricasVis.includes("SA") ? t.SA : 0) + (rubricasVis.includes("TR") ? t.TR : 0) + (rubricasVis.includes("ATL") ? t.ATL : 0);
    const formula = detailEndRow >= detailStartRow ? `SUM(I${detailStartRow}:I${detailEndRow})` : undefined;
    subtotalRows.push({ label: "Subtotal Formandos (BF+BFM+SA+TR+ATL)", result: totalFormandos, formula });
  }
  if (!soFormando && rubricasVis.includes("HN")) {
    subtotalRows.push({ label: "Subtotal Formadores (HN)", result: t.HN, formula: hasHnRange ? `SUM(${hSum})` : undefined });
  }
  subtotalRows.forEach((sr) => {
    ws.mergeCells(r, 1, r, 8);
    ws.getCell(r, 1).value = sr.label;
    ws.getCell(r, 1).alignment = { horizontal: "right" };
    ws.getCell(r, 1).font = { bold: true };
    const vc = ws.getCell(r, 9);
    vc.value = sr.formula ? ({ formula: sr.formula, result: sr.result } as any) : sr.result;
    vc.numFmt = "#,##0.00 €";
    vc.font = { bold: true };
    subtotalRowRefs.push(r);
    r++;
  });

  // TOTAL — soma dos subtotais
  const totalFormula = subtotalRowRefs.length
    ? `SUM(${subtotalRowRefs.map(rr => `I${rr}`).join(",")})`
    : undefined;
  ws.mergeCells(r, 1, r, 8);
  ws.getCell(r, 1).value = "TOTAL";
  ws.getCell(r, 1).alignment = { horizontal: "right" };
  const tvc = ws.getCell(r, 9);
  tvc.value = totalFormula ? ({ formula: totalFormula, result: geral } as any) : geral;
  tvc.numFmt = "#,##0.00 €";
  ws.getCell(r, 1).fill = tvc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111827" } };
  ws.getCell(r, 1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  tvc.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
  r++;

  // Legenda das rubricas
  ws.mergeCells(`A${r}:${LAST_COL}${r}`);
  ws.getCell(`A${r}`).value = "Legenda: BF — Bolsa de Formação; BFM — Bolsa de Formação Modular; SA — Subsídio de Alimentação; TR — Subsídio de Transporte; ATL — Apoio ao Tempo Livre; HN — Honorários. Coluna Km aplica-se ao TR (dias × km/dia aplicado); Valor TR = Km × €/Km (limitado pelo tecto mensal se aplicável).";
  ws.getCell(`A${r}`).font = { italic: true, size: 9, color: { argb: "FF666666" } };
  ws.getCell(`A${r}`).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  ws.getRow(r).height = 32;


  // Rodapé Pessoas 2030 centrado abaixo dos totais — respeita aspect ratio.
  if (logoP) {
    const id = wb.addImage({ buffer: logoP.buf as any, extension: logoP.ext });
    const s = fit(logoP.w, logoP.h, 220, 80);
    ws.addImage(id, { tl: { col: 4, row: r + 1 } as any, ext: s, editAs: "oneCell" } as any);
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
