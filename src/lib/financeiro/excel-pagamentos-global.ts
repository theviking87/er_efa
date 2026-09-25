import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { saveFile } from "@/lib/dom-helpers";

const EUR = '#,##0.00 "€";-#,##0.00 "€";"-"';
const RUBRICAS_FORMANDO = ["BF", "BFM", "SA", "TR", "ATL", "OUT"] as const;
const NOMES_RUB: Record<string, string> = { BF: "Bolsa (BF)", BFM: "Bolsa Mérito (BFM)", SA: "Sub. Alimentação (SA)", TR: "Transporte (TR)", ATL: "ATL", OUT: "Outras" };

export type FiltroPagamentos = { de: string; ate: string; cursoId: string | null }; // de/ate = "YYYY-MM"

const ym = (a: number, m: number) => `${a}-${String(m).padStart(2, "0")}`;

function header(ws: ExcelJS.Worksheet, row: number, cols: string[]) {
  const r = ws.getRow(row);
  cols.forEach((h, i) => {
    const c = r.getCell(i + 1);
    c.value = h;
    c.font = { name: "Arial", bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  r.height = 30;
}

function totalRow(ws: ExcelJS.Worksheet, row: number, first: number, labelCol: number, sumCols: number[]) {
  const r = ws.getRow(row);
  r.getCell(labelCol).value = "TOTAL";
  for (const n of sumCols) {
    const col = ws.getColumn(n).letter;
    r.getCell(n).value = first < row ? ({ formula: `SUM(${col}${first}:${col}${row - 1})` } as any) : 0;
    r.getCell(n).numFmt = ws.getCell(`${col}${first}`).numFmt || EUR;
  }
  r.eachCell({ includeEmpty: true }, c => {
    c.font = { name: "Arial", bold: true, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7EEF8" } };
    c.border = { top: { style: "thin" }, bottom: { style: "double" } };
  });
}

function sheet(wb: ExcelJS.Workbook, name: string, titulo: string, widths: number[]) {
  const ws = wb.addWorksheet(name, { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = widths.map(w => ({ width: w }));
  ws.getCell("A1").value = titulo;
  ws.getCell("A1").font = { name: "Arial", size: 14, bold: true };
  return ws;
}

export async function exportPagamentosGlobal(f: FiltroPagamentos) {
  const [aDe, mDe] = f.de.split("-").map(Number);
  const [aAte, mAte] = f.ate.split("-").map(Number);

  let q = supabase.from("fin_processamento")
    .select("id, ano, mes, estado, curso_id, curso:curso_id(codigo, nome)")
    .gte("ano", aDe).lte("ano", aAte);
  if (f.cursoId) q = q.eq("curso_id", f.cursoId);
  const { data: procsRaw, error } = await q;
  if (error) throw error;
  const procs = (procsRaw ?? []).filter((p: any) => { const k = ym(p.ano, p.mes); return k >= f.de && k <= f.ate; });
  if (!procs.length) throw new Error("Sem processamentos no período escolhido.");
  const procMap = new Map(procs.map((p: any) => [p.id, p]));

  const ids = procs.map((p: any) => p.id);
  const linhas: any[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error: e } = await supabase.from("fin_processamento_linha")
      .select("processamento_id, rubrica, valor, valor_manual, horas_frequentadas, valor_hora, recibo_confirmado, memoria_calculo, formando:formando_id(id, nome, nif), formador:formador_id(id, nome, nif, retencao_percentagem, iva_percentagem)")
      .in("processamento_id", ids.slice(i, i + 50));
    if (e) throw e;
    linhas.push(...(data ?? []));
  }

  // Sessões do período para repartir honorários por UFCD
  const dIni = `${f.de}-01`;
  const dFim = new Date(aAte, mAte, 0); const dFimIso = `${f.ate}-${String(dFim.getDate()).padStart(2, "0")}`;
  const cursoIds = Array.from(new Set(procs.map((p: any) => p.curso_id)));
  const { data: sess, error: e2 } = await supabase.from("sessoes")
    .select("curso_id, formador_id, data, horas, curso_ufcd:curso_ufcd_id(ufcd:ufcd_id(codigo, designacao))")
    .in("curso_id", cursoIds).gte("data", dIni).lte("data", dFimIso);
  if (e2) throw e2;
  const horasUfcd = new Map<string, Map<string, number>>(); // curso|formador|YYYY-MM -> ufcd -> horas
  for (const s of sess ?? []) {
    const k = `${(s as any).curso_id}|${(s as any).formador_id}|${(s as any).data.slice(0, 7)}`;
    const u = (s as any).curso_ufcd?.ufcd;
    const nome = u ? `${u.codigo} — ${u.designacao}` : "Sem UFCD";
    const m = horasUfcd.get(k) ?? new Map<string, number>();
    m.set(nome, (m.get(nome) ?? 0) + Number((s as any).horas || 0));
    horasUfcd.set(k, m);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestão de Formação"; wb.created = new Date();
  const periodo = f.de === f.ate ? f.de : `${f.de} a ${f.ate}`;
  const cursoTxt = f.cursoId ? ((procs[0] as any).curso?.codigo ?? "") : "Todos os cursos";

  // ---------- Formadores (por mês + curso) ----------
  type HN = { nome: string; nif: string; mes: string; curso: string; cursoId: string; fid: string; estado: string; horas: number; vh: number; base: number; ivaPct: number; seloPct: number; irsPct: number; recibo: boolean };
  const hnMap = new Map<string, HN>();
  for (const l of linhas) {
    if (l.rubrica !== "HN" || !l.formador) continue;
    const p: any = procMap.get(l.processamento_id);
    const k = `${l.processamento_id}|${l.formador.id}`;
    const mc = l.memoria_calculo ?? {};
    const g = hnMap.get(k) ?? {
      nome: l.formador.nome, nif: l.formador.nif ?? "", mes: ym(p.ano, p.mes), curso: p.curso?.codigo ?? "", cursoId: p.curso_id, fid: l.formador.id, estado: p.estado,
      horas: 0, vh: Number(l.valor_hora ?? 0), base: 0,
      ivaPct: mc.aplica_iva === true ? Number(mc.iva_pct ?? 0) : 0,
      seloPct: mc.aplica_selo === true ? Number(mc.selo_pct ?? 0) : 0,
      irsPct: mc.aplica_retencao === true ? Number(mc.retencao_pct ?? 0) : 0,
      recibo: false,
    };
    g.horas += Number(l.horas_frequentadas ?? 0);
    g.base += Number(l.valor_manual ?? l.valor ?? 0);
    if (l.recibo_confirmado) g.recibo = true;
    hnMap.set(k, g);
  }
  const hn = Array.from(hnMap.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt") || a.mes.localeCompare(b.mes) || a.curso.localeCompare(b.curso));

  const writeHN = (ws: ExcelJS.Worksheet, rows: { key: string[]; horas: number; base: number; ivaPct: number; seloPct: number; irsPct: number; extra?: string[] }[], keyCols: string[], extraCols: string[] = []) => {
    const cols = [...keyCols, "Horas", "Valor ilíquido (€)", "IVA %", "IVA (€)", "Selo %", "Selo (€)", "Total documento (€)", "IRS %", "Retenção IRS (€)", "Total a pagar (€)", ...extraCols];
    header(ws, 3, cols);
    const k = keyCols.length;
    const L = (n: number) => ws.getColumn(k + n).letter;
    let r = 4;
    for (const x of rows) {
      const row = ws.getRow(r);
      x.key.forEach((v, i) => (row.getCell(i + 1).value = v));
      row.getCell(k + 1).value = +x.horas.toFixed(2); row.getCell(k + 1).numFmt = "0.0";
      row.getCell(k + 2).value = +x.base.toFixed(2);
      row.getCell(k + 3).value = x.ivaPct / 100;
      row.getCell(k + 4).value = { formula: `${L(2)}${r}*${L(3)}${r}` } as any;
      row.getCell(k + 5).value = x.seloPct / 100;
      row.getCell(k + 6).value = { formula: `${L(2)}${r}*${L(5)}${r}` } as any;
      row.getCell(k + 7).value = { formula: `${L(2)}${r}+${L(4)}${r}+${L(6)}${r}` } as any;
      row.getCell(k + 8).value = x.irsPct / 100;
      row.getCell(k + 9).value = { formula: `${L(2)}${r}*${L(8)}${r}` } as any;
      row.getCell(k + 10).value = { formula: `${L(7)}${r}-${L(9)}${r}` } as any;
      [2, 4, 6, 7, 9, 10].forEach(n => (row.getCell(k + n).numFmt = EUR));
      [3, 5, 8].forEach(n => (row.getCell(k + n).numFmt = "0.0%"));
      (x.extra ?? []).forEach((v, i) => (row.getCell(k + 11 + i).value = v));
      row.font = { name: "Arial", size: 10 };
      r++;
    }
    totalRow(ws, r, 4, 1, [1, 2, 4, 6, 7, 9, 10].map(n => k + n));
    ws.views = [{ state: "frozen", ySplit: 3 }];
  };

  // Folha 1 — mensal por formador
  const mensal = new Map<string, { key: string[]; horas: number; base: number; iva: number; selo: number; irs: number }>();
  for (const x of hn) {
    const k = `${x.fid}|${x.mes}`;
    const g = mensal.get(k) ?? { key: [x.nome, x.nif, x.mes], horas: 0, base: 0, iva: 0, selo: 0, irs: 0 };
    g.horas += x.horas; g.base += x.base;
    g.iva += x.base * x.ivaPct / 100; g.selo += x.base * x.seloPct / 100; g.irs += x.base * x.irsPct / 100;
    mensal.set(k, g);
  }
  const ws1 = sheet(wb, "Formadores - Mensal", `Pagamentos a formadores por mês — ${periodo} — ${cursoTxt}`, [30, 13, 10, 8, 14, 8, 12, 8, 12, 15, 8, 14, 15]);
  writeHN(ws1, Array.from(mensal.values()).map(g => ({
    key: g.key, horas: g.horas, base: g.base,
    ivaPct: g.base ? g.iva / g.base * 100 : 0, seloPct: g.base ? g.selo / g.base * 100 : 0, irsPct: g.base ? g.irs / g.base * 100 : 0,
  })), ["Formador", "NIF", "Mês"]);

  // Folha 2 — por curso
  const ws2 = sheet(wb, "Formadores - Por curso", `Pagamentos a formadores por curso — ${periodo} — ${cursoTxt}`, [30, 13, 10, 12, 8, 14, 8, 12, 8, 12, 15, 8, 14, 15, 12, 11]);
  writeHN(ws2, hn.map(x => ({ key: [x.nome, x.nif, x.mes, x.curso], horas: x.horas, base: x.base, ivaPct: x.ivaPct, seloPct: x.seloPct, irsPct: x.irsPct, extra: [x.estado, x.recibo ? "Confirmado" : "Pendente"] })),
    ["Formador", "NIF", "Mês", "Curso"], ["Estado proc.", "Recibo"]);

  // Folha 3 — por UFCD (valor repartido pelas horas de sessões de cada UFCD)
  const ufRows: any[] = [];
  for (const x of hn) {
    const m = horasUfcd.get(`${x.cursoId}|${x.fid}|${x.mes}`);
    const tot = m ? Array.from(m.values()).reduce((s, v) => s + v, 0) : 0;
    const entries = m && tot > 0 ? Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])) : [["Sem sessões associadas", x.horas] as [string, number]];
    const base = tot > 0 ? tot : (x.horas || 1);
    for (const [uf, h] of entries) {
      const share = x.base * (h / base);
      ufRows.push({ key: [x.nome, x.mes, x.curso, uf], horas: h, base: share, ivaPct: x.ivaPct, seloPct: x.seloPct, irsPct: x.irsPct });
    }
  }
  const ws3 = sheet(wb, "Formadores - Por UFCD", `Pagamentos a formadores por UFCD — ${periodo} — ${cursoTxt}`, [30, 10, 12, 40, 8, 14, 8, 12, 8, 12, 15, 8, 14, 15]);
  writeHN(ws3, ufRows, ["Formador", "Mês", "Curso", "UFCD"]);
  ws3.getCell("A2").value = "Valor por UFCD repartido proporcionalmente às horas de sessão do formador nessa UFCD no mês.";
  ws3.getCell("A2").font = { name: "Arial", size: 9, italic: true, color: { argb: "FF666666" } };

  // ---------- Formandos por rubrica ----------
  const fmMap = new Map<string, any>();
  for (const l of linhas) {
    if (!l.formando || l.rubrica === "HN") continue;
    const p: any = procMap.get(l.processamento_id);
    const k = `${l.processamento_id}|${l.formando.id}`;
    const g = fmMap.get(k) ?? { nome: l.formando.nome, nif: l.formando.nif ?? "", mes: ym(p.ano, p.mes), curso: p.curso?.codigo ?? "", estado: p.estado, v: {} as Record<string, number> };
    const rub = (RUBRICAS_FORMANDO as readonly string[]).includes(l.rubrica) ? l.rubrica : "OUT";
    g.v[rub] = (g.v[rub] ?? 0) + Number(l.valor_manual ?? l.valor ?? 0);
    fmMap.set(k, g);
  }
  const fm = Array.from(fmMap.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt") || a.mes.localeCompare(b.mes) || a.curso.localeCompare(b.curso));
  const ws4 = sheet(wb, "Formandos - Por rubrica", `Pagamentos a formandos por rubrica e mês — ${periodo} — ${cursoTxt}`, [30, 13, 10, 12, 13, 13, 13, 13, 13, 13, 14, 12]);
  const cols4 = ["Formando", "NIF", "Mês", "Curso", ...RUBRICAS_FORMANDO.map(r => `${NOMES_RUB[r]} (€)`), "Total (€)", "Estado proc."];
  header(ws4, 3, cols4);
  let r = 4;
  for (const x of fm) {
    const row = ws4.getRow(r);
    [x.nome, x.nif, x.mes, x.curso].forEach((v, i) => (row.getCell(i + 1).value = v));
    RUBRICAS_FORMANDO.forEach((rb, i) => { row.getCell(5 + i).value = +(x.v[rb] ?? 0).toFixed(2); row.getCell(5 + i).numFmt = EUR; });
    row.getCell(11).value = { formula: `SUM(E${r}:J${r})` } as any; row.getCell(11).numFmt = EUR;
    row.getCell(12).value = x.estado;
    row.font = { name: "Arial", size: 10 };
    r++;
  }
  totalRow(ws4, r, 4, 1, [5, 6, 7, 8, 9, 10, 11]);
  ws4.views = [{ state: "frozen", ySplit: 3 }];

  const name = `Pagamentos ${periodo.replace(/ /g, "")}${f.cursoId ? " " + cursoTxt : ""}.xlsx`;
  const buf = await wb.xlsx.writeBuffer();
  await saveFile(name, buf as ArrayBuffer);
  return name;
}
