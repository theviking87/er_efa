import ExcelJS from "exceljs";

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export const RUBRICA_PAGAMENTO_LABEL: Record<string, string> = {
  SA: "SUBALIMENTAÇÃO",
  BF: "BOLSAFORMAÇÃO",
  BFM: "BOLSAFORMAÇÃO",
  TR: "SUBTRANSPORTE",
  ATL: "ATL",
};

export type PagamentoSimplesRow = {
  iban: string;
  nome: string;
  bic: string;
  valor: number;
  ano: number;
  mes: number;
  rubrica: string;
};

/**
 * Mapa simples de pagamentos: sem cabeçalhos, sem logos.
 * Colunas por esta ordem: IBAN | Nome | BIC/SWIFT | Valor | Mês | Rubrica.
 */
export async function exportPagamentosSimplesExcel(
  rows: PagamentoSimplesRow[],
  fileName: string,
): Promise<{ name: string; buf: ArrayBuffer }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestão de Formação"; wb.created = new Date();
  const ws = wb.addWorksheet("Pagamentos", {
    pageSetup: { orientation: "landscape", fitToPage: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });
  ws.columns = [{ width: 32 }, { width: 34 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 20 }];

  for (const r of rows) {
    const row = ws.addRow([
      r.iban || "",
      r.nome,
      r.bic || "",
      Number(r.valor.toFixed(2)),
      `${MESES[r.mes - 1]} ${r.ano}`,
      RUBRICA_PAGAMENTO_LABEL[r.rubrica] ?? r.rubrica,
    ]);
    row.getCell(4).numFmt = '#,##0.00 "€"';
    row.font = { name: "Arial", size: 10 };
    row.alignment = { vertical: "middle" };
  }

  const buf = await wb.xlsx.writeBuffer();
  return { name: fileName, buf: buf as ArrayBuffer };
}
