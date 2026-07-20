// Configuração financeira de um formando: rubricas elegíveis + overrides.
import { supabase } from "@/integrations/supabase/client";
import type { FinFormandoRubrica } from "../types";
import { registarDiff } from "./auditoria";

const ENTIDADE = "fin_formando_rubricas";

export async function listarRubricasDoFormando(formandoId: string): Promise<FinFormandoRubrica[]> {
  const { data, error } = await (supabase as any)
    .from(ENTIDADE).select("*").eq("formando_id", formandoId);
  if (error) throw error;
  return (data ?? []) as FinFormandoRubrica[];
}

export async function upsertRubricaFormando(input: Omit<FinFormandoRubrica, "id"> & { id?: string }) {
  if (input.id) {
    const antes = await (supabase as any).from(ENTIDADE).select("*").eq("id", input.id).maybeSingle();
    const { data, error } = await (supabase as any)
      .from(ENTIDADE).update(input).eq("id", input.id).select("*").single();
    if (error) throw error;
    await registarDiff(ENTIDADE, data.id, antes?.data ?? null, data);
    return data as FinFormandoRubrica;
  }
  const { data, error } = await (supabase as any)
    .from(ENTIDADE).insert(input).select("*").single();
  if (error) throw error;
  await registarDiff(ENTIDADE, data.id, null, data);
  return data as FinFormandoRubrica;
}

export async function eliminarRubricaFormando(id: string, antes?: FinFormandoRubrica) {
  const { error } = await (supabase as any).from(ENTIDADE).delete().eq("id", id);
  if (error) throw error;
  await registarDiff(ENTIDADE, id, antes ?? null, null);
}
