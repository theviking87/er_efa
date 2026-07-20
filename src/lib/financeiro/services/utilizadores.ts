// CRUD para utilizadores locais do módulo financeiro.
import { supabase } from "@/integrations/supabase/client";
import type { FinUtilizador } from "../types";
import { registarDiff } from "./auditoria";

const ENTIDADE = "fin_utilizadores";

export async function listarUtilizadores(): Promise<FinUtilizador[]> {
  const { data, error } = await (supabase as any)
    .from(ENTIDADE).select("*").order("nome");
  if (error) throw error;
  return (data ?? []) as FinUtilizador[];
}

export async function criarUtilizador(u: Omit<FinUtilizador, "id">): Promise<FinUtilizador> {
  const { data, error } = await (supabase as any)
    .from(ENTIDADE).insert(u).select("*").single();
  if (error) throw error;
  await registarDiff(ENTIDADE, data.id, null, data);
  return data as FinUtilizador;
}

export async function atualizarUtilizador(id: string, patch: Partial<FinUtilizador>, antes?: FinUtilizador) {
  const { data, error } = await (supabase as any)
    .from(ENTIDADE).update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  await registarDiff(ENTIDADE, id, antes ?? null, data);
  return data as FinUtilizador;
}

export async function eliminarUtilizador(id: string, antes?: FinUtilizador) {
  const { error } = await (supabase as any).from(ENTIDADE).delete().eq("id", id);
  if (error) throw error;
  await registarDiff(ENTIDADE, id, antes ?? null, null);
}
