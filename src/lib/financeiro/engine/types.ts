// Tipos do Motor Financeiro (Fase 1).
// Estes tipos vivem à parte de `src/lib/financeiro/types.ts` (linhas persistidas)
// e representam o *snapshot em memória* do processamento durante o cálculo.

import type {
  FinRubrica,
  FinRubricaRegra,
  FinFormandoRubrica,
  FinConfiguracaoGlobal,
  FinFormadorConfig,
} from "../types";

export type Chave = { ano: number; mes: number; cursoId: string; projetoId: string | null };

export type FormandoCtx = {
  curso_formando_id: string;
  formando_id: string;
  nome: string;
  iban: string | null;
  km: number; // futura extensão: por agora 0
};

export type SessaoCtx = {
  id: string;
  data: string; // ISO date
  horas: number;
  curso_ufcd_id: string;
  formador_id: string;
};

export type FaltaCtx = {
  curso_formando_id: string;
  sessao_id: string | null;
  data: string;
  horas: number;
};

export type FormadorCtx = {
  id: string;
  nome: string;
  config: FinFormadorConfig | null;
};

export type CursoCtx = {
  id: string;
  codigo: string;
  nome: string;
  estado: string;
  data_inicio: string | null;
  data_fim: string | null;
  projeto_id: string | null;
};

export type ContextoProcessamento = {
  chave: Chave;
  curso: CursoCtx;
  configGlobal: FinConfiguracaoGlobal | null;
  formandos: FormandoCtx[];
  sessoes: SessaoCtx[];
  faltas: FaltaCtx[];
  formadores: FormadorCtx[];
  rubricas: FinRubrica[];
  regras: FinRubricaRegra[]; // regras ativas para o mês
  atribuicoes: FinFormandoRubrica[];
};

export type MemoriaCalculo = {
  formula: string;
  parcelas: Array<{ label: string; valor: number | string }>;
  notas?: string[];
};

export type LinhaBolsa = {
  formando_id: string;
  horas_previstas: number;
  horas_frequentadas: number;
  valor_hora: number;
  valor_calculado: number;
  teto_aplicado: boolean;
  memoria_calculo: MemoriaCalculo;
  rubrica_codigo: string; // BF1/BF2/BFM
};

export type LinhaSubsidio = {
  formando_id: string;
  dias: number;
  valor_dia: number;
  total: number;
  memoria_calculo: MemoriaCalculo;
};

export type LinhaKm = {
  formando_id: string;
  data: string;
  km: number;
  valor_km: number;
  total: number;
  memoria_calculo: MemoriaCalculo;
};

export type LinhaHonorario = {
  formador_id: string;
  descricao: string;
  horas: number;
  valor_hora: number;
  valor: number;
  iva: number;
  retencao_irs: number;
  seguranca_social: number;
  total: number;
  memoria_calculo: MemoriaCalculo;
};

export type ValidacaoNivel = "bloqueante" | "aviso";
export type Validacao = { nivel: ValidacaoNivel; codigo: string; mensagem: string; ref?: string };

export type ResultadoCalculo = {
  bolsas: LinhaBolsa[];
  subsidios: LinhaSubsidio[];
  quilometros: LinhaKm[];
  honorarios: LinhaHonorario[];
  totais: {
    bolsas: number;
    subsidios: number;
    km: number;
    honorarios: number;
    geral: number;
  };
};
