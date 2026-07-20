// CRUD de rubricas + regras.
import { supabase } from "@/integrations/supabase/client";
import type { FinRubrica, FinRubricaRegra } from "../types";
import { registarDiff } from "./auditoria";

const ENT_RUB = "fin_rubricas";
const ENT_REG = "fin_rubrica_regras";

export async function listarRubricas(): Promise<FinRubrica[]> {
  const { data, error } = await (supabase as any)
    .from(ENT_RUB).select("*").order("ordem").order("codigo");
  if (error) throw error;
  return (data ?? []) as FinRubrica[];
}

export async function criarRubrica(r: Omit<FinRubrica, "id">): Promise<FinRubrica> {
  const { data, error } = await (supabase as any)
    .from(ENT_RUB).insert(r).select("*").single();
  if (error) throw error;
  await registarDiff(ENT_RUB, data.id, null, data);
  return data as FinRubrica;
}

export async function atualizarRubrica(id: string, patch: Partial<FinRubrica>, antes?: FinRubrica) {
  const { data, error } = await (supabase as any)
    .from(ENT_RUB).update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  await registarDiff(ENT_RUB, id, antes ?? null, data);
  return data as FinRubrica;
}

export async function eliminarRubrica(id: string, antes?: FinRubrica) {
  const { error } = await (supabase as any).from(ENT_RUB).delete().eq("id", id);
  if (error) throw error;
  await registarDiff(ENT_RUB, id, antes ?? null, null);
}

// ---- Regras ----
export async function listarRegras(rubricaId?: string): Promise<FinRubricaRegra[]> {
  let q: any = (supabase as any).from(ENT_REG).select("*").order("data_inicio", { ascending: false });
  if (rubricaId) q = q.eq("rubrica_id", rubricaId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FinRubricaRegra[];
}

export async function criarRegra(r: Omit<FinRubricaRegra, "id">): Promise<FinRubricaRegra> {
  const { data, error } = await (supabase as any)
    .from(ENT_REG).insert(r).select("*").single();
  if (error) throw error;
  await registarDiff(ENT_REG, data.id, null, data);
  return data as FinRubricaRegra;
}

export async function atualizarRegra(id: string, patch: Partial<FinRubricaRegra>, antes?: FinRubricaRegra) {
  const { data, error } = await (supabase as any)
    .from(ENT_REG).update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  await registarDiff(ENT_REG, id, antes ?? null, data);
  return data as FinRubricaRegra;
}

export async function eliminarRegra(id: string, antes?: FinRubricaRegra) {
  const { error } = await (supabase as any).from(ENT_REG).delete().eq("id", id);
  if (error) throw error;
  await registarDiff(ENT_REG, id, antes ?? null, null);
}
