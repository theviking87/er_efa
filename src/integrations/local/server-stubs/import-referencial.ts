// Offline replacements for src/lib/import-referencial.functions.ts.
import { supabase } from "@/integrations/supabase/client";

export type UfcdExtraida = {
  codigo: string;
  designacao: string;
  horas: number;
};

export const extrairReferencialPdf = async (_args: {
  data: { pdfBase64: string; filename?: string };
}): Promise<{ ufcds: any[] }> => {
  throw new Error(
    "Extração automática por IA não disponível offline. Importa o referencial via Excel ou adiciona UFCDs manualmente.",
  );
};

export const importarReferencial = async (args: {
  data: { ufcds: UfcdExtraida[] };
}) => {
  const codigos = args.data.ufcds.map((u) => u.codigo);
  const { data: existentes } = await supabase
    .from("ufcds")
    .select("codigo")
    .in("codigo", codigos);
  const existSet = new Set((existentes ?? []).map((e: any) => e.codigo));
  const novos = args.data.ufcds.filter((u) => !existSet.has(u.codigo));
  let criados = 0;
  if (novos.length) {
    const { error } = await supabase.from("ufcds").insert(
      novos.map((u) => ({
        codigo: u.codigo,
        designacao: u.designacao,
        horas_referencia: u.horas,
      })),
    );
    if (error) throw new Error(error.message);
    criados = novos.length;
  }
  return { criados, existentes: args.data.ufcds.length - criados };
};
