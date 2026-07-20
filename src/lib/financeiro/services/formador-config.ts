// Configuração fiscal do formador (aplica-se apenas a honorários).
import { supabase } from "@/integrations/supabase/client";
import type { FinFormadorConfig } from "../types";
import { registarDiff } from "./auditoria";

const ENTIDADE = "fin_formador_config";

export async function obterConfigFormador(formadorId: string): Promise<FinFormadorConfig | null> {
  const { data, error } = await (supabase as any)
    .from(ENTIDADE).select("*").eq("formador_id", formadorId).maybeSingle();
  if (error) throw error;
  return (data as FinFormadorConfig) ?? null;
}

export async function guardarConfigFormador(formadorId: string, patch: Partial<Omit<FinFormadorConfig, "id" | "formador_id">>) {
  const antes = await obterConfigFormador(formadorId);
  if (antes) {
    const { data, error } = await (supabase as any)
      .from(ENTIDADE).update(patch).eq("id", antes.id).select("*").single();
    if (error) throw error;
    await registarDiff(ENTIDADE, data.id, antes, data);
    return data as FinFormadorConfig;
  }
  const { data, error } = await (supabase as any)
    .from(ENTIDADE).insert({ formador_id: formadorId, ...patch }).select("*").single();
  if (error) throw error;
  await registarDiff(ENTIDADE, data.id, null, data);
  return data as FinFormadorConfig;
}
