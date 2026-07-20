import type { ContextoProcessamento, LinhaBolsa } from "../types";
import type { HorasFormando } from "../horas";
import { regraAtiva } from "../contexto";
import type { FinRubrica } from "../../types";

/** Calcula uma linha de bolsa por formando+rubrica (BF1/BF2/BFM). */
export function calcularBolsas(
  ctx: ContextoProcessamento,
  horas: Map<string, HorasFormando>,
): LinhaBolsa[] {
  const out: LinhaBolsa[] = [];
  const bolsas = ctx.rubricas.filter((r) => r.categoria === "Bolsa");
  const bolsasIds = new Set(bolsas.map((b) => b.id));
  const atribByF = new Map<string, string[]>();
  ctx.atribuicoes.forEach((a) => {
    if (!a.elegivel || !bolsasIds.has(a.rubrica_id)) return;
    const arr = atribByF.get(a.formando_id) ?? [];
    arr.push(a.rubrica_id);
    atribByF.set(a.formando_id, arr);
  });

  const rubById = new Map<string, FinRubrica>(bolsas.map((b) => [b.id, b]));

  atribByF.forEach((rubIds, formandoId) => {
    rubIds.forEach((rid) => {
      const rubrica = rubById.get(rid);
      if (!rubrica) return;
      const regra = regraAtiva(ctx, rid);
      const h = horas.get(formandoId);
      if (!regra || !h) return;
      const atr = ctx.atribuicoes.find((a) => a.formando_id === formandoId && a.rubrica_id === rid);
      const valorHora = Number(atr?.valor_especifico ?? regra.valor_unitario ?? 0);
      const teto = Number(atr?.limite_especifico ?? regra.valor_maximo ?? 0) || Infinity;
      const bruto = h.horas_frequentadas * valorHora;
      const tetoAplicado = bruto > teto;
      const final = tetoAplicado ? teto : bruto;
      out.push({
        formando_id: formandoId,
        horas_previstas: h.horas_previstas,
        horas_frequentadas: h.horas_frequentadas,
        valor_hora: valorHora,
        valor_calculado: round2(final),
        teto_aplicado: tetoAplicado,
        rubrica_codigo: rubrica.codigo,
        memoria_calculo: {
          formula: "horas_frequentadas × valor_hora (com teto mensal)",
          parcelas: [
            { label: "Horas frequentadas", valor: h.horas_frequentadas },
            { label: "Valor/hora", valor: valorHora },
            { label: "Bruto", valor: round2(bruto) },
            { label: "Teto", valor: isFinite(teto) ? teto : "—" },
            { label: "Final", valor: round2(final) },
          ],
          notas: tetoAplicado ? ["Teto mensal aplicado."] : [],
        },
      });
    });
  });
  return out;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
