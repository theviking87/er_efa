// Carrega, numa só query por bloco, todo o contexto necessário
// para processar um curso/mês/ano. Nunca é chamado a partir de componentes React
// diretamente — passa por `processamento.ts`.
import { supabase } from "@/integrations/supabase/client";
import type {
  Chave,
  ContextoProcessamento,
  FormandoCtx,
  SessaoCtx,
  FaltaCtx,
  FormadorCtx,
  CursoCtx,
} from "./types";
import type {
  FinRubrica,
  FinRubricaRegra,
  FinFormandoRubrica,
  FinConfiguracaoGlobal,
  FinFormadorConfig,
} from "../types";

const s = supabase as any;

function firstOfMonth(ano: number, mes: number) {
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}
function lastOfMonth(ano: number, mes: number) {
  const d = new Date(Date.UTC(ano, mes, 0));
  return d.toISOString().slice(0, 10);
}

export async function carregarContexto(chave: Chave): Promise<ContextoProcessamento> {
  const inicio = firstOfMonth(chave.ano, chave.mes);
  const fim = lastOfMonth(chave.ano, chave.mes);

  // Curso
  const curso = await s.from("cursos").select("*").eq("id", chave.cursoId).single();
  if (curso.error) throw curso.error;
  const cursoCtx: CursoCtx = {
    id: curso.data.id,
    codigo: curso.data.codigo,
    nome: curso.data.nome,
    estado: curso.data.estado,
    data_inicio: curso.data.data_inicio,
    data_fim: curso.data.data_fim,
    projeto_id: curso.data.projeto_id,
  };

  // Config global (última ativa)
  const cfg = await s
    .from("fin_configuracao_global")
    .select("*")
    .eq("ativo", true)
    .order("data_inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  const configGlobal: FinConfiguracaoGlobal | null = cfg.data ?? null;

  // Formandos inscritos + IBAN via rubricas (usamos o IBAN configurado por atribuição)
  const inscricoes = await s
    .from("curso_formandos")
    .select("id, formando_id, formandos(id, nome)")
    .eq("curso_id", chave.cursoId);
  if (inscricoes.error) throw inscricoes.error;
  const formandoIds: string[] = (inscricoes.data ?? []).map((r: any) => r.formando_id);

  // Rubricas ativas
  const rubs = await s.from("fin_rubricas").select("*").eq("ativo", true).order("ordem");
  if (rubs.error) throw rubs.error;
  const rubricas = (rubs.data ?? []) as FinRubrica[];

  // Regras ativas no mês
  const regsQ = await s
    .from("fin_rubrica_regras")
    .select("*")
    .eq("ativo", true)
    .lte("data_inicio", fim);
  if (regsQ.error) throw regsQ.error;
  const regras = ((regsQ.data ?? []) as FinRubricaRegra[]).filter(
    (r) => r.data_fim == null || r.data_fim >= inicio,
  );

  // Atribuições formando ↔ rubrica
  const atrQ = formandoIds.length
    ? await s.from("fin_formando_rubricas").select("*").in("formando_id", formandoIds)
    : { data: [] as any[], error: null };
  if (atrQ.error) throw atrQ.error;
  const atribuicoes = (atrQ.data ?? []) as FinFormandoRubrica[];

  // Mapa IBAN por formando (última atribuição com IBAN definido)
  const ibanPorFormando = new Map<string, string | null>();
  atribuicoes.forEach((a) => {
    if (a.iban && !ibanPorFormando.get(a.formando_id)) ibanPorFormando.set(a.formando_id, a.iban);
  });

  const formandos: FormandoCtx[] = (inscricoes.data ?? []).map((r: any) => ({
    curso_formando_id: r.id,
    formando_id: r.formando_id,
    nome: r.formandos?.nome ?? "—",
    iban: ibanPorFormando.get(r.formando_id) ?? null,
    km: 0,
  }));

  // Sessões do curso no mês
  const sessQ = await s
    .from("sessoes")
    .select("id, data, horas, curso_ufcd_id, formador_id")
    .eq("curso_id", chave.cursoId)
    .gte("data", inicio)
    .lte("data", fim)
    .order("data");
  if (sessQ.error) throw sessQ.error;
  const sessoes = ((sessQ.data ?? []) as any[]).map<SessaoCtx>((x) => ({
    id: x.id,
    data: x.data,
    horas: Number(x.horas ?? 0),
    curso_ufcd_id: x.curso_ufcd_id,
    formador_id: x.formador_id,
  }));

  // Faltas do mês para inscrições do curso
  const cursoFormandoIds = formandos.map((f) => f.curso_formando_id);
  const faltasQ = cursoFormandoIds.length
    ? await s
        .from("formando_faltas")
        .select("curso_formando_id, sessao_id, data, horas")
        .in("curso_formando_id", cursoFormandoIds)
        .gte("data", inicio)
        .lte("data", fim)
    : { data: [] as any[], error: null };
  if (faltasQ.error) throw faltasQ.error;
  const faltas = ((faltasQ.data ?? []) as any[]).map<FaltaCtx>((x) => ({
    curso_formando_id: x.curso_formando_id,
    sessao_id: x.sessao_id,
    data: x.data,
    horas: Number(x.horas ?? 0),
  }));

  // Formadores presentes nas sessões
  const formadorIds = Array.from(new Set(sessoes.map((s) => s.formador_id)));
  const formsQ = formadorIds.length
    ? await s.from("formadores").select("id, nome, abreviatura").in("id", formadorIds)
    : { data: [] as any[], error: null };
  if (formsQ.error) throw formsQ.error;
  const cfgFormsQ = formadorIds.length
    ? await s.from("fin_formador_config").select("*").in("formador_id", formadorIds)
    : { data: [] as any[], error: null };
  const cfgMap = new Map<string, FinFormadorConfig>();
  ((cfgFormsQ.data ?? []) as FinFormadorConfig[]).forEach((c) => cfgMap.set(c.formador_id, c));
  const formadores: FormadorCtx[] = ((formsQ.data ?? []) as any[]).map((f) => ({
    id: f.id,
    nome: f.nome,
    config: cfgMap.get(f.id) ?? null,
  }));

  return {
    chave,
    curso: cursoCtx,
    configGlobal,
    formandos,
    sessoes,
    faltas,
    formadores,
    rubricas,
    regras,
    atribuicoes,
  };
}

/** Escolhe a regra mais recente aplicável ao mês para uma rubrica. */
export function regraAtiva(
  ctx: ContextoProcessamento,
  rubricaId: string,
): (typeof ctx)["regras"][number] | null {
  const inicioMes = firstOfMonth(ctx.chave.ano, ctx.chave.mes);
  const candidatas = ctx.regras
    .filter((r) => r.rubrica_id === rubricaId && r.data_inicio <= inicioMes)
    .sort((a, b) => (a.data_inicio < b.data_inicio ? 1 : -1));
  return candidatas[0] ?? null;
}
