// Esquema local (PGlite) — espelha exactamente o esquema usado pela aplicação.
// Gerado a partir do esquema em produção. Não altera regras de negócio.

export const SCHEMA_SQL = `
CREATE TYPE public.curso_estado AS ENUM ('planeado', 'ativo', 'concluido', 'suspenso', 'cancelado');
CREATE TYPE public.curso_tipologia AS ENUM ('EFA', 'ERFA', 'MFA', 'OUTRO');
CREATE TYPE public.falta_tipo AS ENUM ('justificada', 'injustificada', 'ausencia', 'online');
CREATE TYPE public.formador_estado AS ENUM ('ativo', 'inativo', 'ferias', 'baixa_medica', 'suspenso', 'arquivado');
CREATE TYPE public.formando_estado AS ENUM ('ativo', 'inativo', 'desistente', 'concluido');
CREATE TYPE public.inscricao_estado AS ENUM ('inscrito', 'em_formacao', 'concluido', 'desistente');
CREATE TYPE public.projeto_estado AS ENUM ('planeado', 'ativo', 'concluido', 'arquivado');

CREATE TABLE public.cronograma_observacoes (id uuid DEFAULT gen_random_uuid() NOT NULL, curso_id uuid NOT NULL, mes date NOT NULL, texto text DEFAULT ''::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.curso_ferias (id uuid DEFAULT gen_random_uuid() NOT NULL, curso_id uuid NOT NULL, data_inicio date NOT NULL, data_fim date NOT NULL, motivo text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.curso_formando_ufcds (id uuid DEFAULT gen_random_uuid() NOT NULL, curso_formando_id uuid NOT NULL, curso_ufcd_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, frequenta boolean DEFAULT true NOT NULL);
CREATE TABLE public.curso_formandos (id uuid DEFAULT gen_random_uuid() NOT NULL, curso_id uuid NOT NULL, formando_id uuid NOT NULL, data_inscricao date DEFAULT CURRENT_DATE NOT NULL, estado inscricao_estado DEFAULT 'inscrito'::inscricao_estado NOT NULL, observacoes text, created_at timestamp with time zone DEFAULT now() NOT NULL, data_desistencia date, data_conclusao date);
CREATE TABLE public.curso_ufcd_formadores (id uuid DEFAULT gen_random_uuid() NOT NULL, curso_ufcd_id uuid NOT NULL, formador_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.curso_ufcds (id uuid DEFAULT gen_random_uuid() NOT NULL, curso_id uuid NOT NULL, ufcd_id uuid NOT NULL, horas_totais integer DEFAULT 25 NOT NULL, ordem integer DEFAULT 0 NOT NULL, concluida boolean DEFAULT false NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.cursos (id uuid DEFAULT gen_random_uuid() NOT NULL, codigo text NOT NULL, nome text NOT NULL, tipologia curso_tipologia DEFAULT 'EFA'::curso_tipologia NOT NULL, data_inicio date, data_fim date, estado curso_estado DEFAULT 'planeado'::curso_estado NOT NULL, observacoes text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, projeto_id uuid, acao text, codigo_operacao text, codigo_sigo text);
CREATE TABLE public.despesa_categorias (id uuid DEFAULT gen_random_uuid() NOT NULL, nome text NOT NULL, ordem integer DEFAULT 0 NOT NULL, ativo boolean DEFAULT true NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.despesas (id uuid DEFAULT gen_random_uuid() NOT NULL, projeto_id uuid, curso_id uuid, categoria_id uuid NOT NULL, data date DEFAULT CURRENT_DATE NOT NULL, descricao text NOT NULL, valor numeric DEFAULT 0 NOT NULL, fornecedor text, nif text, anexo_storage_path text, observacoes text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.fin_bolsa_config (id uuid DEFAULT gen_random_uuid() NOT NULL, formando_id uuid NOT NULL, projeto_id uuid, tipo text NOT NULL, valor_mensal numeric DEFAULT 0 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, elegivel_sa boolean DEFAULT true NOT NULL, elegivel_tr boolean DEFAULT false NOT NULL, km_diario numeric DEFAULT 0 NOT NULL, valor_atl numeric DEFAULT 0 NOT NULL, elegivel_atl boolean DEFAULT false NOT NULL);
CREATE TABLE public.fin_config (id uuid DEFAULT gen_random_uuid() NOT NULL, horas_mes_referencia numeric DEFAULT 140 NOT NULL, valor_sa numeric DEFAULT 6.00 NOT NULL, valor_km numeric DEFAULT 0.40 NOT NULL, limite_km_dia numeric DEFAULT 50.00 NOT NULL, percentagem_irs numeric DEFAULT 23.0 NOT NULL, percentagem_ss numeric DEFAULT 0.0 NOT NULL, percentagem_iva numeric DEFAULT 23.0 NOT NULL, empresa_nome text, empresa_nif text, empresa_morada text, empresa_email text, empresa_telefone text, logo_empresa_url text, logo_dgert_url text, logo_pessoas2030_url text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, tr_teto_mensal numeric, atl_teto_mensal numeric DEFAULT 0 NOT NULL);
CREATE TABLE public.fin_processamento (id uuid DEFAULT gen_random_uuid() NOT NULL, projeto_id uuid, curso_id uuid NOT NULL, ano integer NOT NULL, mes integer NOT NULL, estado text DEFAULT 'rascunho'::text NOT NULL, total_bf numeric DEFAULT 0 NOT NULL, total_bfm numeric DEFAULT 0 NOT NULL, total_sa numeric DEFAULT 0 NOT NULL, total_tr numeric DEFAULT 0 NOT NULL, total_hn numeric DEFAULT 0 NOT NULL, total_geral numeric DEFAULT 0 NOT NULL, fechado_em timestamp with time zone, observacoes text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, total_atl numeric DEFAULT 0 NOT NULL);
CREATE TABLE public.fin_processamento_linha (id uuid DEFAULT gen_random_uuid() NOT NULL, processamento_id uuid NOT NULL, formando_id uuid, formador_id uuid, rubrica text NOT NULL, horas_previstas numeric DEFAULT 0, horas_frequentadas numeric DEFAULT 0, horas_elegiveis numeric DEFAULT 0, dias_elegiveis integer DEFAULT 0, valor_hora numeric DEFAULT 0, valor_dia numeric DEFAULT 0, km_total numeric DEFAULT 0, valor numeric DEFAULT 0 NOT NULL, memoria_calculo jsonb DEFAULT '{}'::jsonb NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, valor_manual numeric);
CREATE TABLE public.fin_processamento_obs (id uuid DEFAULT gen_random_uuid() NOT NULL, processamento_id uuid NOT NULL, formando_id uuid NOT NULL, texto text DEFAULT ''::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.fin_transporte_config (id uuid DEFAULT gen_random_uuid() NOT NULL, formando_id uuid NOT NULL, modo text DEFAULT 'km'::text NOT NULL, km_diario numeric DEFAULT 0 NOT NULL, valor_passe numeric DEFAULT 0 NOT NULL, vigente_desde date DEFAULT CURRENT_DATE NOT NULL, observacoes text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.formador_disponibilidades (id uuid DEFAULT gen_random_uuid() NOT NULL, formador_id uuid NOT NULL, data date NOT NULL, hora_inicio time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL, hora_fim time without time zone DEFAULT '18:00:00'::time without time zone NOT NULL, tipo text DEFAULT 'disponivel'::text NOT NULL, notas text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, curso_id uuid);
CREATE TABLE public.formador_documentos (id uuid DEFAULT gen_random_uuid() NOT NULL, formador_id uuid NOT NULL, tipo text NOT NULL, nome text NOT NULL, storage_path text NOT NULL, validade date, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.formador_inatividades (id uuid DEFAULT gen_random_uuid() NOT NULL, formador_id uuid NOT NULL, data_inicio date NOT NULL, data_fim date NOT NULL, motivo text, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.formador_ufcds (id uuid DEFAULT gen_random_uuid() NOT NULL, formador_id uuid NOT NULL, ufcd_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.formadores (id uuid DEFAULT gen_random_uuid() NOT NULL, nome text NOT NULL, nif text, cc text, validade_cc date, morada text, codigo_postal text, localidade text, telemovel text, email text, iban text, habilitacoes text, ccp text, validade_ccp date, observacoes text, estado formador_estado DEFAULT 'ativo'::formador_estado NOT NULL, cor text DEFAULT '#E11D48'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, abreviatura text, data_nascimento date, valor_hora numeric DEFAULT 0 NOT NULL, sem_retencao boolean DEFAULT false NOT NULL, retencao_percentagem numeric DEFAULT 23 NOT NULL, aplica_iva boolean DEFAULT false NOT NULL, iva_percentagem numeric DEFAULT 23 NOT NULL);
CREATE TABLE public.formando_faltas (id uuid DEFAULT gen_random_uuid() NOT NULL, curso_formando_id uuid NOT NULL, sessao_id uuid, data date NOT NULL, horas numeric DEFAULT 0 NOT NULL, tipo falta_tipo DEFAULT 'injustificada'::falta_tipo NOT NULL, observacoes text, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.formando_pra (id uuid DEFAULT gen_random_uuid() NOT NULL, curso_formando_id uuid NOT NULL, curso_ufcd_id uuid NOT NULL, nome text, storage_path text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, nota text);
CREATE TABLE public.formandos (id uuid DEFAULT gen_random_uuid() NOT NULL, nome text NOT NULL, nif text, cc text, validade_cc date, data_nascimento date, telemovel text, email text, morada text, codigo_postal text, localidade text, habilitacoes text, situacao_emprego text, niss text, observacoes text, estado formando_estado DEFAULT 'ativo'::formando_estado NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, iban text, bic text);
CREATE TABLE public.painel_notas (id uuid DEFAULT gen_random_uuid() NOT NULL, texto text DEFAULT ''::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.projetos (id uuid DEFAULT gen_random_uuid() NOT NULL, codigo text NOT NULL, nome text NOT NULL, descricao text, entidade_promotora text, programa_financiamento text, data_inicio date, data_fim date, estado projeto_estado DEFAULT 'ativo'::projeto_estado NOT NULL, ativo boolean DEFAULT true NOT NULL, observacoes text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.sessoes (id uuid DEFAULT gen_random_uuid() NOT NULL, curso_id uuid NOT NULL, curso_ufcd_id uuid NOT NULL, formador_id uuid NOT NULL, data date NOT NULL, hora_inicio time without time zone NOT NULL, hora_fim time without time zone NOT NULL, horas numeric(5,2) NOT NULL, observacoes text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.ufcds (id uuid DEFAULT gen_random_uuid() NOT NULL, codigo text NOT NULL, designacao text NOT NULL, horas_referencia integer DEFAULT 25 NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

ALTER TABLE public.fin_processamento_obs ADD CONSTRAINT fin_processamento_obs_pkey PRIMARY KEY (id);
ALTER TABLE public.fin_processamento_obs ADD CONSTRAINT fin_processamento_obs_processamento_id_formando_id_key UNIQUE (processamento_id, formando_id);
ALTER TABLE public.painel_notas ADD CONSTRAINT painel_notas_pkey PRIMARY KEY (id);
ALTER TABLE public.projetos ADD CONSTRAINT projetos_pkey PRIMARY KEY (id);
ALTER TABLE public.formadores ADD CONSTRAINT formadores_pkey PRIMARY KEY (id);
ALTER TABLE public.formador_inatividades ADD CONSTRAINT formador_inatividades_pkey PRIMARY KEY (id);
ALTER TABLE public.formador_inatividades ADD CONSTRAINT formador_inatividades_formador_id_fkey FOREIGN KEY (formador_id) REFERENCES formadores(id) ON DELETE CASCADE;
ALTER TABLE public.formador_documentos ADD CONSTRAINT formador_documentos_pkey PRIMARY KEY (id);
ALTER TABLE public.formador_documentos ADD CONSTRAINT formador_documentos_formador_id_fkey FOREIGN KEY (formador_id) REFERENCES formadores(id) ON DELETE CASCADE;
ALTER TABLE public.cursos ADD CONSTRAINT cursos_pkey PRIMARY KEY (id);
ALTER TABLE public.ufcds ADD CONSTRAINT ufcds_pkey PRIMARY KEY (id);
ALTER TABLE public.ufcds ADD CONSTRAINT ufcds_codigo_key UNIQUE (codigo);
ALTER TABLE public.curso_ufcds ADD CONSTRAINT curso_ufcds_pkey PRIMARY KEY (id);
ALTER TABLE public.curso_ufcds ADD CONSTRAINT curso_ufcds_curso_id_ufcd_id_key UNIQUE (curso_id, ufcd_id);
ALTER TABLE public.curso_ufcds ADD CONSTRAINT curso_ufcds_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE;
ALTER TABLE public.curso_ufcds ADD CONSTRAINT curso_ufcds_ufcd_id_fkey FOREIGN KEY (ufcd_id) REFERENCES ufcds(id) ON DELETE RESTRICT;
ALTER TABLE public.curso_ufcd_formadores ADD CONSTRAINT curso_ufcd_formadores_pkey PRIMARY KEY (id);
ALTER TABLE public.curso_ufcd_formadores ADD CONSTRAINT curso_ufcd_formadores_curso_ufcd_id_formador_id_key UNIQUE (curso_ufcd_id, formador_id);
ALTER TABLE public.curso_ufcd_formadores ADD CONSTRAINT curso_ufcd_formadores_curso_ufcd_id_fkey FOREIGN KEY (curso_ufcd_id) REFERENCES curso_ufcds(id) ON DELETE CASCADE;
ALTER TABLE public.curso_ufcd_formadores ADD CONSTRAINT curso_ufcd_formadores_formador_id_fkey FOREIGN KEY (formador_id) REFERENCES formadores(id) ON DELETE CASCADE;
ALTER TABLE public.sessoes ADD CONSTRAINT sessoes_check CHECK ((hora_fim > hora_inicio));
ALTER TABLE public.sessoes ADD CONSTRAINT sessoes_pkey PRIMARY KEY (id);
ALTER TABLE public.sessoes ADD CONSTRAINT sessoes_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE;
ALTER TABLE public.sessoes ADD CONSTRAINT sessoes_curso_ufcd_id_fkey FOREIGN KEY (curso_ufcd_id) REFERENCES curso_ufcds(id) ON DELETE CASCADE;
ALTER TABLE public.sessoes ADD CONSTRAINT sessoes_formador_id_fkey FOREIGN KEY (formador_id) REFERENCES formadores(id) ON DELETE RESTRICT;
ALTER TABLE public.formandos ADD CONSTRAINT formandos_pkey PRIMARY KEY (id);
ALTER TABLE public.curso_formandos ADD CONSTRAINT curso_formandos_pkey PRIMARY KEY (id);
ALTER TABLE public.curso_formandos ADD CONSTRAINT curso_formandos_curso_id_formando_id_key UNIQUE (curso_id, formando_id);
ALTER TABLE public.curso_formandos ADD CONSTRAINT curso_formandos_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE;
ALTER TABLE public.curso_formandos ADD CONSTRAINT curso_formandos_formando_id_fkey FOREIGN KEY (formando_id) REFERENCES formandos(id) ON DELETE CASCADE;
ALTER TABLE public.formando_faltas ADD CONSTRAINT formando_faltas_pkey PRIMARY KEY (id);
ALTER TABLE public.formando_faltas ADD CONSTRAINT formando_faltas_curso_formando_id_fkey FOREIGN KEY (curso_formando_id) REFERENCES curso_formandos(id) ON DELETE CASCADE;
ALTER TABLE public.formando_faltas ADD CONSTRAINT formando_faltas_sessao_id_fkey FOREIGN KEY (sessao_id) REFERENCES sessoes(id) ON DELETE SET NULL;
ALTER TABLE public.formador_ufcds ADD CONSTRAINT formador_ufcds_formador_id_fkey FOREIGN KEY (formador_id) REFERENCES formadores(id) ON DELETE CASCADE;
ALTER TABLE public.formador_disponibilidades ADD CONSTRAINT formador_disponibilidades_tipo_check CHECK ((tipo = ANY (ARRAY['disponivel'::text, 'indisponivel'::text])));
ALTER TABLE public.formador_disponibilidades ADD CONSTRAINT formador_disponibilidades_pkey PRIMARY KEY (id);
ALTER TABLE public.formador_disponibilidades ADD CONSTRAINT formador_disponibilidades_formador_id_fkey FOREIGN KEY (formador_id) REFERENCES formadores(id) ON DELETE CASCADE;
ALTER TABLE public.fin_processamento_obs ADD CONSTRAINT fin_processamento_obs_processamento_id_fkey FOREIGN KEY (processamento_id) REFERENCES fin_processamento(id) ON DELETE CASCADE;
ALTER TABLE public.formador_ufcds ADD CONSTRAINT formador_ufcds_pkey PRIMARY KEY (id);
ALTER TABLE public.formador_ufcds ADD CONSTRAINT formador_ufcds_formador_id_ufcd_id_key UNIQUE (formador_id, ufcd_id);
ALTER TABLE public.formador_ufcds ADD CONSTRAINT formador_ufcds_ufcd_id_fkey FOREIGN KEY (ufcd_id) REFERENCES ufcds(id) ON DELETE CASCADE;
ALTER TABLE public.formador_disponibilidades ADD CONSTRAINT formador_disponibilidades_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE SET NULL;
ALTER TABLE public.formando_pra ADD CONSTRAINT formando_pra_pkey PRIMARY KEY (id);
ALTER TABLE public.formando_pra ADD CONSTRAINT formando_pra_curso_formando_id_curso_ufcd_id_key UNIQUE (curso_formando_id, curso_ufcd_id);
ALTER TABLE public.formando_pra ADD CONSTRAINT formando_pra_curso_formando_id_fkey FOREIGN KEY (curso_formando_id) REFERENCES curso_formandos(id) ON DELETE CASCADE;
ALTER TABLE public.formando_pra ADD CONSTRAINT formando_pra_curso_ufcd_id_fkey FOREIGN KEY (curso_ufcd_id) REFERENCES curso_ufcds(id) ON DELETE CASCADE;
ALTER TABLE public.fin_transporte_config ADD CONSTRAINT fin_transporte_config_pkey PRIMARY KEY (id);
ALTER TABLE public.fin_transporte_config ADD CONSTRAINT fin_transporte_config_formando_id_vigente_desde_key UNIQUE (formando_id, vigente_desde);
ALTER TABLE public.curso_ferias ADD CONSTRAINT curso_ferias_pkey PRIMARY KEY (id);
ALTER TABLE public.curso_ferias ADD CONSTRAINT curso_ferias_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE;
ALTER TABLE public.cronograma_observacoes ADD CONSTRAINT cronograma_observacoes_pkey PRIMARY KEY (id);
ALTER TABLE public.cronograma_observacoes ADD CONSTRAINT cronograma_observacoes_curso_id_mes_key UNIQUE (curso_id, mes);
ALTER TABLE public.cronograma_observacoes ADD CONSTRAINT cronograma_observacoes_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE;
ALTER TABLE public.curso_formando_ufcds ADD CONSTRAINT curso_formando_ufcds_pkey PRIMARY KEY (id);
ALTER TABLE public.curso_formando_ufcds ADD CONSTRAINT curso_formando_ufcds_curso_formando_id_curso_ufcd_id_key UNIQUE (curso_formando_id, curso_ufcd_id);
ALTER TABLE public.curso_formando_ufcds ADD CONSTRAINT curso_formando_ufcds_curso_formando_id_fkey FOREIGN KEY (curso_formando_id) REFERENCES curso_formandos(id) ON DELETE CASCADE;
ALTER TABLE public.curso_formando_ufcds ADD CONSTRAINT curso_formando_ufcds_curso_ufcd_id_fkey FOREIGN KEY (curso_ufcd_id) REFERENCES curso_ufcds(id) ON DELETE CASCADE;
ALTER TABLE public.projetos ADD CONSTRAINT projetos_codigo_key UNIQUE (codigo);
ALTER TABLE public.cursos ADD CONSTRAINT cursos_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE RESTRICT;
ALTER TABLE public.despesa_categorias ADD CONSTRAINT despesa_categorias_pkey PRIMARY KEY (id);
ALTER TABLE public.fin_config ADD CONSTRAINT fin_config_pkey PRIMARY KEY (id);
ALTER TABLE public.fin_bolsa_config ADD CONSTRAINT fin_bolsa_config_tipo_check CHECK ((tipo = ANY (ARRAY['BF'::text, 'BFM'::text])));
ALTER TABLE public.fin_bolsa_config ADD CONSTRAINT fin_bolsa_config_pkey PRIMARY KEY (id);
ALTER TABLE public.fin_bolsa_config ADD CONSTRAINT fin_bolsa_config_formando_id_projeto_id_tipo_key UNIQUE (formando_id, projeto_id, tipo);
ALTER TABLE public.fin_bolsa_config ADD CONSTRAINT fin_bolsa_config_formando_id_fkey FOREIGN KEY (formando_id) REFERENCES formandos(id) ON DELETE CASCADE;
ALTER TABLE public.despesa_categorias ADD CONSTRAINT despesa_categorias_nome_key UNIQUE (nome);
ALTER TABLE public.despesas ADD CONSTRAINT despesas_pkey PRIMARY KEY (id);
ALTER TABLE public.despesas ADD CONSTRAINT despesas_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE SET NULL;
ALTER TABLE public.despesas ADD CONSTRAINT despesas_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE SET NULL;
ALTER TABLE public.fin_bolsa_config ADD CONSTRAINT fin_bolsa_config_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE;
ALTER TABLE public.fin_processamento ADD CONSTRAINT fin_processamento_mes_check CHECK (((mes >= 1) AND (mes <= 12)));
ALTER TABLE public.fin_processamento ADD CONSTRAINT fin_processamento_estado_check CHECK ((estado = ANY (ARRAY['rascunho'::text, 'fechado'::text])));
ALTER TABLE public.fin_processamento ADD CONSTRAINT fin_processamento_pkey PRIMARY KEY (id);
ALTER TABLE public.fin_processamento ADD CONSTRAINT fin_processamento_curso_id_ano_mes_key UNIQUE (curso_id, ano, mes);
ALTER TABLE public.fin_processamento ADD CONSTRAINT fin_processamento_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE SET NULL;
ALTER TABLE public.fin_processamento ADD CONSTRAINT fin_processamento_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE CASCADE;
ALTER TABLE public.despesas ADD CONSTRAINT despesas_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES despesa_categorias(id) ON DELETE RESTRICT;
ALTER TABLE public.fin_processamento_linha ADD CONSTRAINT fin_processamento_linha_pkey PRIMARY KEY (id);
ALTER TABLE public.fin_processamento_linha ADD CONSTRAINT fin_processamento_linha_processamento_id_fkey FOREIGN KEY (processamento_id) REFERENCES fin_processamento(id) ON DELETE CASCADE;
ALTER TABLE public.fin_processamento_linha ADD CONSTRAINT fin_processamento_linha_formando_id_fkey FOREIGN KEY (formando_id) REFERENCES formandos(id) ON DELETE CASCADE;
ALTER TABLE public.fin_processamento_linha ADD CONSTRAINT fin_processamento_linha_formador_id_fkey FOREIGN KEY (formador_id) REFERENCES formadores(id) ON DELETE CASCADE;
ALTER TABLE public.fin_processamento_linha ADD CONSTRAINT fin_processamento_linha_rubrica_check CHECK ((rubrica = ANY (ARRAY['BF'::text, 'BFM'::text, 'SA'::text, 'TR'::text, 'HN'::text, 'ATL'::text])));

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN NEW.updated_at = now(); RETURN NEW; END $fn$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $fn$;

CREATE TRIGGER curso_ferias_updated BEFORE UPDATE ON public.curso_ferias FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_cursos_upd BEFORE UPDATE ON public.cursos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_despesa_categorias_updated_at BEFORE UPDATE ON public.despesa_categorias FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_despesas_updated_at BEFORE UPDATE ON public.despesas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_fin_bolsa_config_updated BEFORE UPDATE ON public.fin_bolsa_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_fin_config_updated BEFORE UPDATE ON public.fin_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_fin_processamento_updated BEFORE UPDATE ON public.fin_processamento FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_fin_processamento_obs_upd BEFORE UPDATE ON public.fin_processamento_obs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_fin_transporte_config_updated_at BEFORE UPDATE ON public.fin_transporte_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at_disp BEFORE UPDATE ON public.formador_disponibilidades FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_formadores_upd BEFORE UPDATE ON public.formadores FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_formando_pra_updated_at BEFORE UPDATE ON public.formando_pra FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_formandos_updated_at BEFORE UPDATE ON public.formandos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_painel_notas_updated BEFORE UPDATE ON public.painel_notas FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_projetos_updated_at BEFORE UPDATE ON public.projetos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_sessoes_upd BEFORE UPDATE ON public.sessoes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Armazenamento local de ficheiros (equivalente aos buckets)
CREATE TABLE public._local_storage (bucket text NOT NULL, path text NOT NULL, mime text, size bigint DEFAULT 0 NOT NULL, conteudo text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, PRIMARY KEY (bucket, path));
-- Utilizador local (sessão offline)
CREATE TABLE public._local_auth (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, password text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
INSERT INTO public._local_auth (email, password) VALUES ('formacao@app.local', 'ER2026');
`;

/** Tabelas de dados da aplicação (usadas em backup/restauro). */
export const APP_TABLES = [
  "projetos",
  "ufcds",
  "formadores",
  "formandos",
  "cursos",
  "curso_ufcds",
  "curso_formandos",
  "curso_formando_ufcds",
  "curso_ufcd_formadores",
  "curso_ferias",
  "cronograma_observacoes",
  "formador_ufcds",
  "formador_disponibilidades",
  "formador_inatividades",
  "formador_documentos",
  "formando_faltas",
  "formando_pra",
  "sessoes",
  "despesa_categorias",
  "despesas",
  "fin_config",
  "fin_bolsa_config",
  "fin_transporte_config",
  "fin_processamento",
  "fin_processamento_linha",
  "fin_processamento_obs",
  "painel_notas",
] as const;

export const STORAGE_BUCKETS = [
  "formador-documentos",
  "formando-pra",
  "despesas-anexos",
  "empresa-logos",
] as const;
