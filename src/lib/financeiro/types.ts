// Tipos partilhados do módulo Financeiro (Fase 1).
// Nenhum cálculo ou regra de negócio vive nos componentes React —
// esses ficheiros vivem em src/lib/financeiro/services/*.
export type RubricaCategoria =
  | "Bolsa" | "Subsídio" | "Deslocação" | "Honorários" | "Prémio" | "Outros";

export type FinUtilizador = {
  id: string;
  nome: string;
  nome_utilizador: string;
  perfil: string;
  ativo: boolean;
  observacoes: string | null;
};

export type FinConfiguracaoGlobal = {
  id: string;
  horas_mes_referencia: number;
  valor_subsidio_alimentacao: number;
  valor_km: number;
  moeda: string;
  casas_decimais: number;
  data_inicio: string;
  utilizador_id: string | null;
  utilizador_nome: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
};

export type FinRubrica = {
  id: string;
  codigo: string;
  descricao: string;
  categoria: RubricaCategoria | string;
  ativo: boolean;
  ordem: number;
  permite_edicao_manual: boolean;
  gera_documento: boolean;
  gera_exportacao: boolean;
  observacoes: string | null;
};

export type FinRubricaRegra = {
  id: string;
  rubrica_id: string;
  valor_unitario: number | null;
  valor_maximo: number | null;
  horas_referencia: number | null;
  dias_minimos: number | null;
  permite_limite: boolean;
  permite_edicao_manual: boolean;
  ativo: boolean;
  data_inicio: string;
  data_fim: string | null;
  observacoes: string | null;
};

export type FinFormandoRubrica = {
  id: string;
  formando_id: string;
  rubrica_id: string;
  elegivel: boolean;
  valor_especifico: number | null;
  limite_especifico: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  iban: string | null;
  observacoes: string | null;
};

export type FinFormadorConfig = {
  id: string;
  formador_id: string;
  regime_iva: "isento" | "normal" | string;
  artigo_isencao: string | null;
  retencao_irs: boolean;
  percentagem_irs: number;
  seguranca_social: boolean;
  percentagem_ss: number | null;
  iban: string | null;
  observacoes: string | null;
};

export type FinAuditoriaRegisto = {
  operacao: "criar" | "editar" | "eliminar" | "importar" | "outro" | string;
  entidade: string;
  registo_id?: string | null;
  campo_alterado?: string | null;
  valor_anterior?: string | null;
  valor_novo?: string | null;
  motivo?: string | null;
};
