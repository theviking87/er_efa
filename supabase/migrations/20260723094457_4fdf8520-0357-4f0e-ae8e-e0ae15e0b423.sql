
DROP TABLE IF EXISTS public.fin_auditoria CASCADE;
DROP TABLE IF EXISTS public.fin_rubrica_regras CASCADE;
DROP TABLE IF EXISTS public.fin_formando_rubricas CASCADE;
DROP TABLE IF EXISTS public.fin_formador_config CASCADE;
DROP TABLE IF EXISTS public.fin_rubricas CASCADE;
DROP TABLE IF EXISTS public.fin_configuracao_global CASCADE;
DROP TABLE IF EXISTS public.fin_utilizadores CASCADE;
DROP TABLE IF EXISTS public.financeiro_bolsas CASCADE;
DROP TABLE IF EXISTS public.financeiro_subsidios CASCADE;
DROP TABLE IF EXISTS public.financeiro_quilometros CASCADE;
DROP TABLE IF EXISTS public.financeiro_honorarios CASCADE;
DROP TABLE IF EXISTS public.financeiro_processamentos CASCADE;
DROP FUNCTION IF EXISTS public.fin_bloqueio_fechado() CASCADE;

CREATE TABLE public.fin_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horas_mes_referencia numeric NOT NULL DEFAULT 140,
  valor_sa numeric NOT NULL DEFAULT 6.00,
  valor_km numeric NOT NULL DEFAULT 0.40,
  limite_km_dia numeric NOT NULL DEFAULT 50.00,
  percentagem_irs numeric NOT NULL DEFAULT 23.0,
  percentagem_ss numeric NOT NULL DEFAULT 0.0,
  percentagem_iva numeric NOT NULL DEFAULT 23.0,
  empresa_nome text, empresa_nif text, empresa_morada text,
  empresa_email text, empresa_telefone text,
  logo_empresa_url text, logo_dgert_url text, logo_pessoas2030_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_config TO authenticated;
GRANT ALL ON public.fin_config TO service_role;
ALTER TABLE public.fin_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_fin_config" ON public.fin_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_fin_config_updated BEFORE UPDATE ON public.fin_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.fin_config DEFAULT VALUES;

CREATE TABLE public.fin_bolsa_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formando_id uuid NOT NULL REFERENCES public.formandos(id) ON DELETE CASCADE,
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('BF','BFM')),
  valor_mensal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (formando_id, projeto_id, tipo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_bolsa_config TO authenticated;
GRANT ALL ON public.fin_bolsa_config TO service_role;
ALTER TABLE public.fin_bolsa_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_fin_bolsa_config" ON public.fin_bolsa_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_fin_bolsa_config_updated BEFORE UPDATE ON public.fin_bolsa_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.curso_formando_ufcds ADD COLUMN IF NOT EXISTS frequenta boolean NOT NULL DEFAULT true;
ALTER TABLE public.formando_faltas ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'falta' CHECK (tipo IN ('falta','ausencia_uc'));

CREATE TABLE public.fin_processamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  curso_id uuid NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  ano int NOT NULL,
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  estado text NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho','fechado')),
  total_bf numeric NOT NULL DEFAULT 0,
  total_bfm numeric NOT NULL DEFAULT 0,
  total_sa numeric NOT NULL DEFAULT 0,
  total_tr numeric NOT NULL DEFAULT 0,
  total_hn numeric NOT NULL DEFAULT 0,
  total_geral numeric NOT NULL DEFAULT 0,
  fechado_em timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (curso_id, ano, mes)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_processamento TO authenticated;
GRANT ALL ON public.fin_processamento TO service_role;
ALTER TABLE public.fin_processamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_fin_processamento" ON public.fin_processamento FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_fin_processamento_updated BEFORE UPDATE ON public.fin_processamento FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.fin_processamento_linha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processamento_id uuid NOT NULL REFERENCES public.fin_processamento(id) ON DELETE CASCADE,
  formando_id uuid REFERENCES public.formandos(id) ON DELETE CASCADE,
  formador_id uuid REFERENCES public.formadores(id) ON DELETE CASCADE,
  rubrica text NOT NULL CHECK (rubrica IN ('BF','BFM','SA','TR','HN')),
  horas_previstas numeric NOT NULL DEFAULT 0,
  horas_frequentadas numeric NOT NULL DEFAULT 0,
  horas_elegiveis numeric NOT NULL DEFAULT 0,
  dias_elegiveis int NOT NULL DEFAULT 0,
  valor_hora numeric NOT NULL DEFAULT 0,
  valor_dia numeric NOT NULL DEFAULT 0,
  km_total numeric NOT NULL DEFAULT 0,
  valor numeric NOT NULL DEFAULT 0,
  memoria_calculo jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_processamento_linha TO authenticated;
GRANT ALL ON public.fin_processamento_linha TO service_role;
ALTER TABLE public.fin_processamento_linha ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_fin_processamento_linha" ON public.fin_processamento_linha FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_fin_linha_proc ON public.fin_processamento_linha(processamento_id);
