import type { ContextoProcessamento, LinhaKm } from "../types";
import type { HorasFormando } from "../horas";
import { regraAtiva } from "../contexto";

export function calcularQuilometros(
  ctx: ContextoProcessamento,
  horas: Map<string, HorasFormando>,
): LinhaKm[] {
  const rub = ctx.rubricas.find((r) => r.codigo === "KM");
  if (!rub) return [];
  const regra = regraAtiva(ctx, rub.id);
  if (!regra) return [];
  const valorKm = Number(regra.valor_unitario ?? 0);
  const teto = Number(regra.valor_maximo ?? 0) || Infinity;
  const out: LinhaKm[] = [];
  const atribs = ctx.atribuicoes.filter((a) => a.rubrica_id === rub.id && a.elegivel);
  atribs.forEach((a) => {
    const f = ctx.formandos.find((x) => x.formando_id === a.formando_id);
    if (!f) return;
    const h = horas.get(f.formando_id);
    if (!h) return;
    // km configurados na atribuição em `valor_especifico` (Km/dia, ida-e-volta já contabilizados pelo cliente).
    const kmPorDia = Number(a.valor_especifico ?? 0);
    let acumulado = 0;
    h.presencas_por_dia.forEach((horasFreq, dia) => {
      if (horasFreq <= 0) return;
      acumulado += kmPorDia;
      const totalDia = kmPorDia * valorKm;
      out.push({
        formando_id: f.formando_id,
        data: dia,
        km: kmPorDia,
        valor_km: valorKm,
        total: Math.round(totalDia * 100) / 100,
        memoria_calculo: {
          formula: "km_dia × valor_km",
          parcelas: [
            { label: "Km (ida+volta)", valor: kmPorDia },
            { label: "Valor/km", valor: valorKm },
            { label: "Total", valor: Math.round(totalDia * 100) / 100 },
          ],
        },
      });
    });
    // Aplicar teto mensal (rateio simples: reduzir última linha se necessário)
    const totalMes = acumulado * valorKm;
    if (isFinite(teto) && totalMes > teto) {
      const excedente = totalMes - teto;
      // Reduz do fim para trás
      const linhasF = out.filter((l) => l.formando_id === f.formando_id).reverse();
      let restante = excedente;
      for (const l of linhasF) {
        if (restante <= 0) break;
        const cortar = Math.min(l.total, restante);
        l.total = Math.round((l.total - cortar) * 100) / 100;
        l.memoria_calculo.notas = ["Teto mensal aplicado."];
        restante -= cortar;
      }
    }
  });
  return out;
}
