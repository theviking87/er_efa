// Versões locais (offline) das funções de servidor de importação de cronograma.
// Mesma assinatura e mesmo resultado — apenas correm sobre a base de dados local.
import { supabase } from "../client";

type Ctx = { data: Record<string, unknown> };

export type SessaoExtraida = {
  data: string;
  hora_inicio: string;
  hora_fim: string;
  ufcd_codigo: string | null;
  ufcd_nome: string | null;
  formador_nome: string | null;
  observacoes: string | null;
};

async function contexto(cursoId: string) {
  const [{ data: curso }, { data: cufcds }, { data: formadores }, { data: ufcdsAll }] = await Promise.all([
    supabase.from("cursos").select("id, codigo, nome, data_inicio, data_fim").eq("id", cursoId).maybeSingle(),
    supabase
      .from("curso_ufcds")
      .select("id, horas_totais, ufcd_id, ufcd:ufcds(id, codigo, designacao)")
      .eq("curso_id", cursoId),
    supabase.from("formadores").select("id, nome, abreviatura").eq("estado", "ativo"),
    supabase.from("ufcds").select("id, codigo, designacao, horas_referencia").order("codigo"),
  ]);
  if (!curso) throw new Error("Curso não encontrado");

  const cufcdIds = (cufcds ?? []).map((u: any) => u.id);
  const horasPorUfcd: Record<string, number> = {};
  if (cufcdIds.length) {
    const { data: sess } = await supabase.from("sessoes").select("curso_ufcd_id, horas").in("curso_ufcd_id", cufcdIds);
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
    formadores: (formadores ?? []).map((f: any) => ({ id: f.id, nome: f.nome, abreviatura: f.abreviatura })),
    ufcds_catalogo: (ufcdsAll ?? []).map((u: any) => ({
      id: u.id,
      codigo: u.codigo,
      designacao: u.designacao,
      horas_referencia: u.horas_referencia,
    })),
    curso: { data_inicio: (curso as any).data_inicio, data_fim: (curso as any).data_fim },
  };
}

export async function getImportContext({ data }: Ctx) {
  return contexto(String(data.cursoId));
}

export async function extrairCronogramaPdf(_opts: Ctx): Promise<never> {
  throw new Error("A extração automática de PDF requer ligação à Internet. Introduza as sessões manualmente.");
}

export async function criarFormadorRapido({ data }: Ctx) {
  const { data: row, error } = await supabase
    .from("formadores")
    .insert({ nome: data.nome, abreviatura: data.abreviatura ?? null, estado: "ativo" })
    .select("id, nome, abreviatura")
    .single();
  if (error) throw new Error(error.message);
  return row;
}

export async function criarUfcdNoCurso({ data }: Ctx) {
  const cursoId = String(data.cursoId);
  const codigo = String(data.codigo);
  const designacao = String(data.designacao);
  const horas = Number(data.horas_referencia);

  let ufcdId: string | null = null;
  const { data: existing } = await supabase.from("ufcds").select("id").eq("codigo", codigo).maybeSingle();
  if (existing) ufcdId = (existing as any).id;
  else {
    const { data: novo, error: e1 } = await supabase
      .from("ufcds")
      .insert({ codigo, designacao, horas_referencia: horas })
      .select("id")
      .single();
    if (e1) throw new Error(e1.message);
    ufcdId = (novo as any).id;
  }

  const { data: existeCU } = await supabase
    .from("curso_ufcds")
    .select("id, horas_totais")
    .eq("curso_id", cursoId)
    .eq("ufcd_id", ufcdId)
    .maybeSingle();
  if (existeCU) {
    return {
      id: (existeCU as any).id,
      ufcd_id: ufcdId!,
      codigo,
      designacao,
      horas_totais: (existeCU as any).horas_totais ?? 0,
      horas_existentes: 0,
    };
  }
  const { data: cu, error: e2 } = await supabase
    .from("curso_ufcds")
    .insert({ curso_id: cursoId, ufcd_id: ufcdId, horas_totais: horas })
    .select("id, horas_totais")
    .single();
  if (e2) throw new Error(e2.message);
  return {
    id: (cu as any).id,
    ufcd_id: ufcdId!,
    codigo,
    designacao,
    horas_totais: (cu as any).horas_totais ?? horas,
    horas_existentes: 0,
  };
}
