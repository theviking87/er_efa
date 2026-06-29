// Offline replacements for src/lib/import-cronograma.functions.ts.
// Runs entirely client-side against the local PGlite shim.
import { supabase } from "@/integrations/supabase/client";

export type SessaoExtraida = {
  data: string;
  hora_inicio: string;
  hora_fim: string;
  ufcd_codigo: string | null;
  ufcd_nome: string | null;
  formador_nome: string | null;
  observacoes: string | null;
};

async function loadCursoContext(cursoId: string) {
  const [{ data: curso }, { data: cufcds }, { data: formadores }, { data: ufcdsAll }] =
    await Promise.all([
      supabase
        .from("cursos")
        .select("id, codigo, nome, data_inicio, data_fim")
        .eq("id", cursoId)
        .maybeSingle(),
      supabase
        .from("curso_ufcds")
        .select("id, horas_totais, ufcd_id, ufcd:ufcds(id, codigo, designacao)")
        .eq("curso_id", cursoId),
      supabase.from("formadores").select("id, nome, abreviatura").eq("estado", "ativo"),
      supabase.from("ufcds").select("id, codigo, designacao, horas_referencia"),
    ]);

  if (!curso) throw new Error("Curso não encontrado");

  const cufcdIds = (cufcds ?? []).map((u: any) => u.id);
  const horasPorUfcd: Record<string, number> = {};
  if (cufcdIds.length) {
    const { data: sess } = await supabase
      .from("sessoes")
      .select("curso_ufcd_id, horas")
      .in("curso_ufcd_id", cufcdIds);
    (sess ?? []).forEach((s: any) => {
      horasPorUfcd[s.curso_ufcd_id] = (horasPorUfcd[s.curso_ufcd_id] ?? 0) + Number(s.horas ?? 0);
    });
  }

  return {
    curso_ufcds: (cufcds ?? []).map((u: any) => ({
      id: u.id,
      ufcd_id: u.ufcd_id ?? u.ufcd?.id ?? null,
      codigo: u.ufcd?.codigo,
      designacao: u.ufcd?.designacao,
      horas_totais: u.horas_totais ?? 0,
      horas_existentes: horasPorUfcd[u.id] ?? 0,
    })),
    formadores: (formadores ?? []).map((f: any) => ({
      id: f.id,
      nome: f.nome,
      abreviatura: f.abreviatura,
    })),
    ufcds_catalogo: (ufcdsAll ?? []).map((u: any) => ({
      id: u.id,
      codigo: u.codigo,
      designacao: u.designacao,
      horas_referencia: u.horas_referencia,
    })),
    curso: { data_inicio: curso.data_inicio, data_fim: curso.data_fim },
  };
}

// Mirrors the server-fn signature: called as fn({ data: { cursoId } }).
export const getImportContext = async (args: { data: { cursoId: string } }) => {
  return loadCursoContext(args.data.cursoId);
};

// PDF AI extraction is not available offline. Caller should show a friendly
// message and fall back to manual entry / XLSX import (when added).
export const extrairCronogramaPdf = async (_args: {
  data: { cursoId: string; pdfBase64: string; filename?: string };
}): Promise<{
  sessoes: SessaoExtraida[];
  curso_ufcds: any[];
  formadores: any[];
  curso: { data_inicio: string; data_fim: string };
}> => {
  throw new Error(
    "Extração automática por IA não disponível offline. Importa via Excel ou regista as sessões manualmente.",
  );
};

export const criarFormadorRapido = async (args: {
  data: { nome: string; abreviatura?: string | null };
}) => {
  const { data: row, error } = await supabase
    .from("formadores")
    .insert({
      nome: args.data.nome,
      abreviatura: args.data.abreviatura ?? null,
      estado: "ativo",
    })
    .select("id, nome, abreviatura")
    .single();
  if (error) throw new Error(error.message);
  return row;
};

export const criarUfcdNoCurso = async (args: {
  data: { cursoId: string; codigo: string; designacao: string; horas_referencia: number };
}) => {
  const { cursoId, codigo, designacao, horas_referencia } = args.data;
  let ufcdId: string | null = null;
  const { data: existing } = await supabase
    .from("ufcds")
    .select("id")
    .eq("codigo", codigo)
    .maybeSingle();
  if (existing) ufcdId = existing.id;
  else {
    const { data: novo, error } = await supabase
      .from("ufcds")
      .insert({ codigo, designacao, horas_referencia })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    ufcdId = novo.id;
  }

  const { data: existeCU } = await supabase
    .from("curso_ufcds")
    .select("id, horas_totais")
    .eq("curso_id", cursoId)
    .eq("ufcd_id", ufcdId)
    .maybeSingle();
  if (existeCU) {
    return {
      id: existeCU.id,
      ufcd_id: ufcdId!,
      codigo,
      designacao,
      horas_totais: existeCU.horas_totais ?? 0,
      horas_existentes: 0,
    };
  }
  const { data: cu, error: e2 } = await supabase
    .from("curso_ufcds")
    .insert({ curso_id: cursoId, ufcd_id: ufcdId, horas_totais: horas_referencia })
    .select("id, horas_totais")
    .single();
  if (e2) throw new Error(e2.message);
  return {
    id: cu.id,
    ufcd_id: ufcdId!,
    codigo,
    designacao,
    horas_totais: cu.horas_totais ?? 0,
    horas_existentes: 0,
  };
};
