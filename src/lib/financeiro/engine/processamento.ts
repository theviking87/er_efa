// Orquestrador: contexto → horas → validações → rubricas → resultado.
import { carregarContexto } from "./contexto";
import { calcularHoras, type HorasFormando } from "./horas";
import { validar } from "./validacoes";
import {
  calcularBolsas,
  calcularSubsidios,
  calcularQuilometros,
  calcularHonorarios,
} from "./rubricas";
import type { Chave, ContextoProcessamento, ResultadoCalculo, Validacao } from "./types";

export type ProcessamentoCompleto = {
  ctx: ContextoProcessamento;
  horas: Map<string, HorasFormando>;
  validacoes: Validacao[];
  resultado: ResultadoCalculo;
};

export async function executarProcessamento(chave: Chave): Promise<ProcessamentoCompleto> {
  const ctx = await carregarContexto(chave);
  const regraSA = ctx.rubricas.find((r) => r.codigo === "SA");
  const diasMinimos = regraSA
    ? Number(
        ctx.regras
          .filter((r) => r.rubrica_id === regraSA.id)
          .sort((a, b) => (a.data_inicio < b.data_inicio ? 1 : -1))[0]?.dias_minimos ?? 3,
      )
    : 3;
  const horas = calcularHoras(ctx, diasMinimos);
  const validacoes = validar(ctx, horas);

  const bolsas = calcularBolsas(ctx, horas);
  const subsidios = calcularSubsidios(ctx, horas);
  const quilometros = calcularQuilometros(ctx, horas);
  const honorarios = calcularHonorarios(ctx);

  const totBolsas = round2(bolsas.reduce((a, b) => a + b.valor_calculado, 0));
  const totSubs = round2(subsidios.reduce((a, b) => a + b.total, 0));
  const totKm = round2(quilometros.reduce((a, b) => a + b.total, 0));
  const totHon = round2(honorarios.reduce((a, b) => a + b.total, 0));

  return {
    ctx,
    horas,
    validacoes,
    resultado: {
      bolsas,
      subsidios,
      quilometros,
      honorarios,
      totais: {
        bolsas: totBolsas,
        subsidios: totSubs,
        km: totKm,
        honorarios: totHon,
        geral: round2(totBolsas + totSubs + totKm + totHon),
      },
    },
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
