
-- Financeiro module
CREATE TABLE public.financeiro_processamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  curso_id UUID NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  estado TEXT NOT NULL DEFAULT 'aberto' CHECK (estado IN ('aberto','fechado')),
  data_criacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_fecho TIMESTAMPTZ,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (curso_id, ano, mes)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_processamentos TO authenticated;
GRANT ALL ON public.financeiro_processamentos TO service_role;
ALTER TABLE public.financeiro_processamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all processamentos" ON public.financeiro_processamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.financeiro_bolsas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  processamento_id UUID NOT NULL REFERENCES public.financeiro_processamentos(id) ON DELETE CASCADE,
  formando_id UUID NOT NULL REFERENCES public.formandos(id) ON DELETE CASCADE,
  horas_previstas NUMERIC(8,2) NOT NULL DEFAULT 0,
  horas_frequentadas NUMERIC(8,2) NOT NULL DEFAULT 0,
  valor_hora NUMERIC(10,4) NOT NULL DEFAULT 0,
  valor_calculado NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_final NUMERIC(12,2) NOT NULL DEFAULT 0,
  editado_manual BOOLEAN NOT NULL DEFAULT false,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_bolsas TO authenticated;
GRANT ALL ON public.financeiro_bolsas TO service_role;
ALTER TABLE public.financeiro_bolsas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all bolsas" ON public.financeiro_bolsas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.financeiro_subsidios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  processamento_id UUID NOT NULL REFERENCES public.financeiro_processamentos(id) ON DELETE CASCADE,
  formando_id UUID NOT NULL REFERENCES public.formandos(id) ON DELETE CASCADE,
  dias INTEGER NOT NULL DEFAULT 0,
  valor_dia NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_subsidios TO authenticated;
GRANT ALL ON public.financeiro_subsidios TO service_role;
ALTER TABLE public.financeiro_subsidios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all subsidios" ON public.financeiro_subsidios FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.financeiro_quilometros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  processamento_id UUID NOT NULL REFERENCES public.financeiro_processamentos(id) ON DELETE CASCADE,
  formando_id UUID NOT NULL REFERENCES public.formandos(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  origem TEXT,
  destino TEXT,
  km NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_km NUMERIC(10,4) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_quilometros TO authenticated;
GRANT ALL ON public.financeiro_quilometros TO service_role;
ALTER TABLE public.financeiro_quilometros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all quilometros" ON public.financeiro_quilometros FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.financeiro_honorarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  processamento_id UUID NOT NULL REFERENCES public.financeiro_processamentos(id) ON DELETE CASCADE,
  formador_id UUID REFERENCES public.formadores(id) ON DELETE SET NULL,
  descricao TEXT,
  valor NUMERIC(12,2) NOT NULL DEFAULT 0,
  iva NUMERIC(5,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financeiro_honorarios TO authenticated;
GRANT ALL ON public.financeiro_honorarios TO service_role;
ALTER TABLE public.financeiro_honorarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all honorarios" ON public.financeiro_honorarios FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.configuracao_financeira (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  valor_refeicao NUMERIC(10,2) NOT NULL DEFAULT 6.00,
  valor_km NUMERIC(10,4) NOT NULL DEFAULT 0.40,
  horas_mes NUMERIC(8,2) NOT NULL DEFAULT 150,
  iva NUMERIC(5,2) NOT NULL DEFAULT 23,
  moeda TEXT NOT NULL DEFAULT 'EUR',
  atualizacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracao_financeira TO authenticated;
GRANT ALL ON public.configuracao_financeira TO service_role;
ALTER TABLE public.configuracao_financeira ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all config fin" ON public.configuracao_financeira FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at trigger (reuse if it exists, else create)
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_fp_upd BEFORE UPDATE ON public.financeiro_processamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fb_upd BEFORE UPDATE ON public.financeiro_bolsas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fs_upd BEFORE UPDATE ON public.financeiro_subsidios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fq_upd BEFORE UPDATE ON public.financeiro_quilometros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fh_upd BEFORE UPDATE ON public.financeiro_honorarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cf_upd BEFORE UPDATE ON public.configuracao_financeira FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- seed default configuration row
INSERT INTO public.configuracao_financeira (valor_refeicao, valor_km, horas_mes, iva, moeda)
VALUES (6.00, 0.40, 150, 23, 'EUR');
