// Persistência das linhas calculadas + fecho imutável.
// Todas as escritas passam por auditoria.
import { supabase } from "@/integrations/supabase/client";
import { registarAuditoria } from "../services/auditoria";
import { getUtilizadorAtivo } from "../current-user";
import type { ProcessamentoCompleto } from "./processamento";

const s = supabase as any;

export type OverridesLinha = {
  valorAprovado?: number | null;
  observacoes?: string | null;
};

/** Guarda / recalcula todas as linhas para um processamento existente (estado <= calculado). */
export async function guardarCalculo(
  processamentoId: string,
  proc: ProcessamentoCompleto,
) {
  // Verifica estado
  const p = await s.from("financeiro_processamentos").select("estado").eq("id", processamentoId).single();
  if (p.error) throw p.error;
  if (p.data.estado === "fechado") throw new Error("Processamento está fechado.");

  // Limpa linhas anteriores (o trigger de bloqueio protege se fechado)
  await Promise.all([
    s.from("financeiro_bolsas").delete().eq("processamento_id", processamentoId),
    s.from("financeiro_subsidios").delete().eq("processamento_id", processamentoId),
    s.from("financeiro_quilometros").delete().eq("processamento_id", processamentoId),
    s.from("financeiro_honorarios").delete().eq("processamento_id", processamentoId),
  ]);

  const { resultado } = proc;
  const bolsasRows = resultado.bolsas.map((b) => ({
    processamento_id: processamentoId,
    formando_id: b.formando_id,
    horas_previstas: b.horas_previstas,
    horas_frequentadas: b.horas_frequentadas,
    valor_hora: b.valor_hora,
    valor_calculado: b.valor_calculado,
    valor_final: b.valor_calculado,
    valor_aprovado: b.valor_calculado,
    teto_aplicado: b.teto_aplicado,
    memoria_calculo: b.memoria_calculo,
    observacoes: `Rubrica ${b.rubrica_codigo}`,
  }));
  const subsRows = resultado.subsidios.map((x) => ({
    processamento_id: processamentoId,
    formando_id: x.formando_id,
    dias: x.dias,
    valor_dia: x.valor_dia,
    total: x.total,
    valor_aprovado: x.total,
    memoria_calculo: x.memoria_calculo,
  }));
  const kmRows = resultado.quilometros.map((x) => ({
    processamento_id: processamentoId,
    formando_id: x.formando_id,
    data: x.data,
    km: x.km,
    valor_km: x.valor_km,
    total: x.total,
    valor_aprovado: x.total,
    memoria_calculo: x.memoria_calculo,
  }));
  const honRows = resultado.honorarios.map((x) => ({
    processamento_id: processamentoId,
    formador_id: x.formador_id,
    descricao: x.descricao,
    horas: x.horas,
    valor_hora: x.valor_hora,
    valor: x.valor,
    iva: x.iva,
    retencao_irs: x.retencao_irs,
    seguranca_social: x.seguranca_social,
    total: x.total,
    valor_aprovado: x.total,
    memoria_calculo: x.memoria_calculo,
  }));

  if (bolsasRows.length) await s.from("financeiro_bolsas").insert(bolsasRows);
  if (subsRows.length) await s.from("financeiro_subsidios").insert(subsRows);
  if (kmRows.length) await s.from("financeiro_quilometros").insert(kmRows);
  if (honRows.length) await s.from("financeiro_honorarios").insert(honRows);

  const totais = resultado.totais;
  await s.from("financeiro_processamentos").update({
    estado: "calculado",
    total_bolsas: totais.bolsas,
    total_subsidios: totais.subsidios,
    total_km: totais.km,
    total_honorarios: totais.honorarios,
    total_geral: totais.geral,
  }).eq("id", processamentoId);

  await registarAuditoria({
    operacao: "editar",
    entidade: "financeiro_processamentos",
    registo_id: processamentoId,
    campo_alterado: "calculo",
    valor_novo: JSON.stringify(totais),
    motivo: "Recálculo do motor financeiro",
  });
}

/** Fecho imutável: só executa se não houver validações bloqueantes. */
export async function fecharProcessamento(processamentoId: string, proc: ProcessamentoCompleto) {
  const bloq = proc.validacoes.filter((v) => v.nivel === "bloqueante");
  if (bloq.length) throw new Error(`Existem ${bloq.length} validações bloqueantes.`);

  const snapshot = {
    ctx: {
      curso: proc.ctx.curso,
      chave: proc.ctx.chave,
      configGlobal: proc.ctx.configGlobal,
      totalFormandos: proc.ctx.formandos.length,
      totalSessoes: proc.ctx.sessoes.length,
    },
    resultado: proc.resultado,
    horas: Array.from(proc.horas.values()).map((h) => ({
      formando_id: h.formando_id,
      horas_previstas: h.horas_previstas,
      horas_frequentadas: h.horas_frequentadas,
      dias_elegiveis_subsidio: h.dias_elegiveis_subsidio,
    })),
    validacoes: proc.validacoes,
    fechado_em: new Date().toISOString(),
  };

  const u = getUtilizadorAtivo();
  const upd = await s.from("financeiro_processamentos").update({
    estado: "fechado",
    data_fecho: new Date().toISOString(),
    fechado_por: u.nome_utilizador,
    snapshot,
  }).eq("id", processamentoId);
  if (upd.error) throw upd.error;

  await registarAuditoria({
    operacao: "editar",
    entidade: "financeiro_processamentos",
    registo_id: processamentoId,
    campo_alterado: "estado",
    valor_anterior: "calculado",
    valor_novo: "fechado",
    motivo: "Fecho do processamento",
  });
}

/** Reabrir (limpa apenas o estado — snapshot mantém-se como histórico). */
export async function reabrirProcessamento(processamentoId: string) {
  const upd = await s
    .from("financeiro_processamentos")
    .update({ estado: "aberto", data_fecho: null })
    .eq("id", processamentoId);
  if (upd.error) throw upd.error;
  await registarAuditoria({
    operacao: "editar",
    entidade: "financeiro_processamentos",
    registo_id: processamentoId,
    campo_alterado: "estado",
    valor_anterior: "fechado",
    valor_novo: "aberto",
    motivo: "Reabertura do processamento",
  });
}
