// Serviço de auditoria financeira. Todas as alterações relevantes
// devem passar aqui — nunca escrever diretamente na tabela fin_auditoria
// a partir de componentes.
import { supabase } from "@/integrations/supabase/client";
import { getUtilizadorAtivo } from "../current-user";
import type { FinAuditoriaRegisto } from "../types";

export async function registarAuditoria(r: FinAuditoriaRegisto) {
  const u = getUtilizadorAtivo();
  const payload = {
    utilizador_id: u.id,
    nome_utilizador: u.nome_utilizador,
    operacao: r.operacao,
    entidade: r.entidade,
    registo_id: r.registo_id ?? null,
    campo_alterado: r.campo_alterado ?? null,
    valor_anterior: r.valor_anterior ?? null,
    valor_novo: r.valor_novo ?? null,
    motivo: r.motivo ?? null,
  };
  const { error } = await (supabase as any).from("fin_auditoria").insert(payload);
  // Auditoria nunca deve bloquear operações — apenas loga o erro.
  if (error) console.warn("[financeiro/auditoria] falhou:", error.message);
}

export async function registarDiff(
  entidade: string,
  registoId: string | null,
  antes: Record<string, any> | null,
  depois: Record<string, any> | null,
  motivo?: string,
) {
  const operacao = !antes ? "criar" : !depois ? "eliminar" : "editar";
  if (operacao === "criar" || operacao === "eliminar") {
    await registarAuditoria({ entidade, registo_id: registoId, operacao, motivo, valor_novo: depois ? JSON.stringify(depois) : null, valor_anterior: antes ? JSON.stringify(antes) : null });
    return;
  }
  const keys = new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})]);
  const jobs: Promise<any>[] = [];
  keys.forEach((k) => {
    const a = antes?.[k];
    const d = depois?.[k];
    if (JSON.stringify(a) === JSON.stringify(d)) return;
    jobs.push(registarAuditoria({
      entidade, registo_id: registoId, operacao: "editar",
      campo_alterado: k,
      valor_anterior: a == null ? null : String(a),
      valor_novo: d == null ? null : String(d),
      motivo,
    }));
  });
  await Promise.all(jobs);
}
