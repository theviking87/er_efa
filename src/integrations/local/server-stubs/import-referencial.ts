// Versões locais (offline) das funções de importação de referencial.
import { supabase } from "../client";

type Ctx = { data: Record<string, unknown> };

export async function extrairReferencialPdf(_opts: Ctx): Promise<never> {
  throw new Error("A extração automática de PDF requer ligação à Internet. Introduza as UFCD manualmente.");
}

export async function importarReferencial({ data }: Ctx) {
  const ufcds = (data.ufcds ?? []) as { codigo: string; designacao: string; horas: number }[];
  const codigos = ufcds.map((u) => u.codigo);
  const { data: existentes } = await supabase.from("ufcds").select("codigo").in("codigo", codigos);
  const existSet = new Set(((existentes ?? []) as { codigo: string }[]).map((e) => e.codigo));
  const novos = ufcds.filter((u) => !existSet.has(u.codigo));
  let criados = 0;
  if (novos.length) {
    const { error } = await supabase
      .from("ufcds")
      .insert(novos.map((u) => ({ codigo: u.codigo, designacao: u.designacao, horas_referencia: u.horas })));
    if (error) throw new Error(error.message);
    criados = novos.length;
  }
  return { criados, existentes: ufcds.length - criados };
}
