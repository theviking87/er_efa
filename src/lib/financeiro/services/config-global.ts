// Configuração Financeira Global — versionada.
// Nunca apagar versões antigas. Ao "guardar" cria-se sempre uma nova versão
// ativa (a antiga passa a inativa).
import { supabase } from "@/integrations/supabase/client";
import type { FinConfiguracaoGlobal } from "../types";
import { getUtilizadorAtivo } from "../current-user";
import { registarDiff } from "./auditoria";

const ENTIDADE = "fin_configuracao_global";

export async function obterConfiguracaoAtiva(): Promise<FinConfiguracaoGlobal | null> {
  const { data, error } = await (supabase as any)
    .from(ENTIDADE).select("*")
    .eq("ativo", true)
    .order("data_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as FinConfiguracaoGlobal | null;
}

export async function listarConfiguracoes(): Promise<FinConfiguracaoGlobal[]> {
  const { data, error } = await (supabase as any)
    .from(ENTIDADE).select("*").order("data_inicio", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FinConfiguracaoGlobal[];
}

export type NovaConfiguracaoGlobal = Omit<
  FinConfiguracaoGlobal,
  "id" | "created_at" | "ativo" | "utilizador_id" | "utilizador_nome"
>;

export async function guardarNovaConfiguracao(input: NovaConfiguracaoGlobal): Promise<FinConfiguracaoGlobal> {
  const u = getUtilizadorAtivo();
  const antiga = await obterConfiguracaoAtiva();

  const payload = {
    ...input,
    ativo: true,
    utilizador_id: u.id,
    utilizador_nome: u.nome_utilizador,
  };
  const { data, error } = await (supabase as any)
    .from(ENTIDADE).insert(payload).select("*").single();
  if (error) throw error;

  if (antiga) {
    // Marca a versão anterior como inativa (mas mantém-se no histórico).
    await (supabase as any).from(ENTIDADE).update({ ativo: false }).eq("id", antiga.id);
  }

  await registarDiff(ENTIDADE, data.id, antiga, data, "Nova versão da configuração global");
  return data as FinConfiguracaoGlobal;
}
