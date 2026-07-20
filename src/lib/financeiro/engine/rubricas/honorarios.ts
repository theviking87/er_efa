import type { ContextoProcessamento, LinhaHonorario } from "../types";
import { regraAtiva } from "../contexto";

/**
 * Para cada formador com sessões no mês calcula os honorários base a partir
 * da tabela HON (valor/hora) e configuração do formador (IVA/IRS/SS).
 */
export function calcularHonorarios(ctx: ContextoProcessamento): LinhaHonorario[] {
  const rub = ctx.rubricas.find((r) => r.codigo === "HON");
  if (!rub) return [];
  const regra = regraAtiva(ctx, rub.id);
  const valorHoraDefault = Number(regra?.valor_unitario ?? 0);
  const out: LinhaHonorario[] = [];

  const horasPorFormador = new Map<string, number>();
  ctx.sessoes.forEach((s) => {
    horasPorFormador.set(s.formador_id, (horasPorFormador.get(s.formador_id) ?? 0) + s.horas);
  });

  horasPorFormador.forEach((horas, formadorId) => {
    const fmt = ctx.formadores.find((f) => f.id === formadorId);
    const cfg = fmt?.config ?? null;
    const valorHora = valorHoraDefault; // futura extensão: valor por formador em fin_formador_config
    const valor = horas * valorHora;
    const percIva = cfg?.regime_iva === "normal" ? 23 : 0;
    const iva = (valor * percIva) / 100;
    const percIrs = cfg?.retencao_irs ? Number(cfg.percentagem_irs ?? 0) : 0;
    const retencao = (valor * percIrs) / 100;
    const percSs = cfg?.seguranca_social ? Number(cfg.percentagem_ss ?? 0) : 0;
    const ss = (valor * percSs) / 100;
    const total = valor + iva - retencao - ss;
    out.push({
      formador_id: formadorId,
      descricao: `Formação — ${horas.toFixed(2)} horas`,
      horas,
      valor_hora: valorHora,
      valor: round2(valor),
      iva: round2(iva),
      retencao_irs: round2(retencao),
      seguranca_social: round2(ss),
      total: round2(total),
      memoria_calculo: {
        formula: "horas × valor_hora + IVA − IRS − SS",
        parcelas: [
          { label: "Horas", valor: horas },
          { label: "Valor/hora", valor: valorHora },
          { label: "Bruto", valor: round2(valor) },
          { label: `IVA (${percIva}%)`, valor: round2(iva) },
          { label: `IRS (${percIrs}%)`, valor: round2(-retencao) },
          { label: `SS (${percSs}%)`, valor: round2(-ss) },
          { label: "Total", valor: round2(total) },
        ],
      },
    });
  });
  return out;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
