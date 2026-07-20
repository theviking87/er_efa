
-- ============================================================
-- Financeiro v2 — arquitetura base (Fase 1 alargada)
-- ============================================================

-- 1) UTILIZADORES locais (independente do auth do Supabase)
CREATE TABLE IF NOT EXISTS public.fin_utilizadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  nome_utilizador text NOT NULL UNIQUE,
  perfil text NOT NULL DEFAULT 'operador',
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_utilizadores TO authenticated;
GRANT ALL ON public.fin_utilizadores TO service_role;
ALTER TABLE public.fin_utilizadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full fin_utilizadores" ON public.fin_utilizadores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_fin_utilizadores_upd BEFORE UPDATE ON public.fin_utilizadores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) CONFIGURAÇÃO GLOBAL versionada (nunca apagar — mantém histórico)
CREATE TABLE IF NOT EXISTS public.fin_configuracao_global (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horas_mes_referencia numeric NOT NULL DEFAULT 150,
  valor_subsidio_alimentacao numeric NOT NULL DEFAULT 6.00,
  valor_km numeric NOT NULL DEFAULT 0.40,
  moeda text NOT NULL DEFAULT 'EUR',
  casas_decimais smallint NOT NULL DEFAULT 2,
  data_inicio date NOT NULL DEFAULT CURRENT_DATE,
  utilizador_id uuid REFERENCES public.fin_utilizadores(id) ON DELETE SET NULL,
  utilizador_nome text,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_configuracao_global TO authenticated;
GRANT ALL ON public.fin_configuracao_global TO service_role;
ALTER TABLE public.fin_configuracao_global ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full fin_configuracao_global" ON public.fin_configuracao_global FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_fin_cfg_global_upd BEFORE UPDATE ON public.fin_configuracao_global FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_fin_cfg_global_inicio ON public.fin_configuracao_global(data_inicio DESC);

-- 3) RUBRICAS FINANCEIRAS (catálogo)
CREATE TABLE IF NOT EXISTS public.fin_rubricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  descricao text NOT NULL,
  categoria text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 100,
  permite_edicao_manual boolean NOT NULL DEFAULT true,
  gera_documento boolean NOT NULL DEFAULT false,
  gera_exportacao boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_rubricas TO authenticated;
GRANT ALL ON public.fin_rubricas TO service_role;
ALTER TABLE public.fin_rubricas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full fin_rubricas" ON public.fin_rubricas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_fin_rubricas_upd BEFORE UPDATE ON public.fin_rubricas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) REGRAS das rubricas (versionadas por período)
CREATE TABLE IF NOT EXISTS public.fin_rubrica_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubrica_id uuid NOT NULL REFERENCES public.fin_rubricas(id) ON DELETE CASCADE,
  valor_unitario numeric,
  valor_maximo numeric,
  horas_referencia numeric,
  dias_minimos integer,
  permite_limite boolean NOT NULL DEFAULT false,
  permite_edicao_manual boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  data_inicio date NOT NULL DEFAULT CURRENT_DATE,
  data_fim date,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_rubrica_regras TO authenticated;
GRANT ALL ON public.fin_rubrica_regras TO service_role;
ALTER TABLE public.fin_rubrica_regras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full fin_rubrica_regras" ON public.fin_rubrica_regras FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_fin_regras_upd BEFORE UPDATE ON public.fin_rubrica_regras FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_fin_regras_rubrica ON public.fin_rubrica_regras(rubrica_id, data_inicio DESC);

-- 5) FORMANDO — rubricas configuradas (elegibilidade + overrides)
CREATE TABLE IF NOT EXISTS public.fin_formando_rubricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formando_id uuid NOT NULL REFERENCES public.formandos(id) ON DELETE CASCADE,
  rubrica_id uuid NOT NULL REFERENCES public.fin_rubricas(id) ON DELETE CASCADE,
  elegivel boolean NOT NULL DEFAULT true,
  valor_especifico numeric,
  limite_especifico numeric,
  data_inicio date,
  data_fim date,
  iban text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (formando_id, rubrica_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_formando_rubricas TO authenticated;
GRANT ALL ON public.fin_formando_rubricas TO service_role;
ALTER TABLE public.fin_formando_rubricas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full fin_formando_rubricas" ON public.fin_formando_rubricas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_fin_fr_upd BEFORE UPDATE ON public.fin_formando_rubricas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_fin_fr_formando ON public.fin_formando_rubricas(formando_id);

-- 6) FORMADOR — configuração fiscal para honorários
CREATE TABLE IF NOT EXISTS public.fin_formador_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formador_id uuid NOT NULL UNIQUE REFERENCES public.formadores(id) ON DELETE CASCADE,
  regime_iva text NOT NULL DEFAULT 'isento',
  artigo_isencao text,
  retencao_irs boolean NOT NULL DEFAULT true,
  percentagem_irs numeric NOT NULL DEFAULT 23,
  seguranca_social boolean NOT NULL DEFAULT false,
  percentagem_ss numeric,
  iban text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_formador_config TO authenticated;
GRANT ALL ON public.fin_formador_config TO service_role;
ALTER TABLE public.fin_formador_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full fin_formador_config" ON public.fin_formador_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_fin_fc_upd BEFORE UPDATE ON public.fin_formador_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7) AUDITORIA financeira
CREATE TABLE IF NOT EXISTS public.fin_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  utilizador_id uuid REFERENCES public.fin_utilizadores(id) ON DELETE SET NULL,
  nome_utilizador text NOT NULL,
  operacao text NOT NULL,
  entidade text NOT NULL,
  registo_id uuid,
  campo_alterado text,
  valor_anterior text,
  valor_novo text,
  motivo text,
  data_hora timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_auditoria TO authenticated;
GRANT ALL ON public.fin_auditoria TO service_role;
ALTER TABLE public.fin_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full fin_auditoria" ON public.fin_auditoria FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_fin_auditoria_entidade ON public.fin_auditoria(entidade, registo_id, data_hora DESC);

-- Seed inicial de rubricas
INSERT INTO public.fin_rubricas (codigo, descricao, categoria, ordem, gera_documento, gera_exportacao) VALUES
  ('BF1', 'Bolsa de Formação — Tipo 1', 'Bolsa', 10, false, true),
  ('BF2', 'Bolsa de Formação — Tipo 2', 'Bolsa', 20, false, true),
  ('BFM', 'Bolsa Majorada',              'Bolsa', 30, false, true),
  ('SA',  'Subsídio de Alimentação',     'Subsídio', 40, false, true),
  ('KM',  'Quilómetros / Deslocação',    'Deslocação', 50, false, true),
  ('HON', 'Honorários de Formador',      'Honorários', 60, true,  true),
  ('OUT', 'Outros',                      'Outros', 90, false, true)
ON CONFLICT (codigo) DO NOTHING;
