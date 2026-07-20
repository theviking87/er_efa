import type { ContextoProcessamento, LinhaSubsidio } from "../types";
import type { HorasFormando } from "../horas";
import { regraAtiva } from "../contexto";

export function calcularSubsidios(
  ctx: ContextoProcessamento,
  horas: Map<string, HorasFormando>,
): LinhaSubsidio[] {
  const rub = ctx.rubricas.find((r) => r.codigo === "SA");
  if (!rub) return [];
  const regra = regraAtiva(ctx, rub.id);
  if (!regra) return [];
  const valorDia = Number(regra.valor_unitario ?? 0);
  const out: LinhaSubsidio[] = [];
  const atribuidos = new Set(
    ctx.atribuicoes.filter((a) => a.rubrica_id === rub.id && a.elegivel).map((a) => a.formando_id),
  );
  ctx.formandos.forEach((f) => {
    if (!atribuidos.has(f.formando_id)) return;
    const h = horas.get(f.formando_id);
    if (!h) return;
    const dias = h.dias_elegiveis_subsidio;
    const total = Math.round(dias * valorDia * 100) / 100;
    out.push({
      formando_id: f.formando_id,
      dias,
      valor_dia: valorDia,
      total,
      memoria_calculo: {
        formula: "dias com ≥ dias_minimos horas × valor_dia",
        parcelas: [
          { label: "Dias elegíveis", valor: dias },
          { label: "Valor/dia", valor: valorDia },
          { label: "Total", valor: total },
        ],
      },
    });
  });
  return out;
}
