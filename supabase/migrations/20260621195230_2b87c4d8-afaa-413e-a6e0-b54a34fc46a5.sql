
-- Enums
CREATE TYPE public.formador_estado AS ENUM ('ativo','inativo','ferias','baixa_medica','suspenso','arquivado');
CREATE TYPE public.curso_tipologia AS ENUM ('EFA','ERFA','MFA','OUTRO');
CREATE TYPE public.curso_estado AS ENUM ('planeado','ativo','concluido','suspenso','cancelado');

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- FORMADORES
CREATE TABLE public.formadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  nif TEXT,
  cc TEXT,
  validade_cc DATE,
  morada TEXT,
  codigo_postal TEXT,
  localidade TEXT,
  telemovel TEXT,
  email TEXT,
  iban TEXT,
  habilitacoes TEXT,
  ccp TEXT,
  validade_ccp DATE,
  observacoes TEXT,
  estado public.formador_estado NOT NULL DEFAULT 'ativo',
  cor TEXT NOT NULL DEFAULT '#E11D48',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formadores TO authenticated;
GRANT ALL ON public.formadores TO service_role;
ALTER TABLE public.formadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full access formadores" ON public.formadores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_formadores_upd BEFORE UPDATE ON public.formadores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- INATIVIDADES
CREATE TABLE public.formador_inatividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formador_id UUID NOT NULL REFERENCES public.formadores(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formador_inatividades TO authenticated;
GRANT ALL ON public.formador_inatividades TO service_role;
ALTER TABLE public.formador_inatividades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full inatividades" ON public.formador_inatividades FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- DOCUMENTOS
CREATE TABLE public.formador_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formador_id UUID NOT NULL REFERENCES public.formadores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  nome TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  validade DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formador_documentos TO authenticated;
GRANT ALL ON public.formador_documentos TO service_role;
ALTER TABLE public.formador_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full documentos" ON public.formador_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CURSOS
CREATE TABLE public.cursos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipologia public.curso_tipologia NOT NULL DEFAULT 'EFA',
  data_inicio DATE,
  data_fim DATE,
  estado public.curso_estado NOT NULL DEFAULT 'planeado',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cursos TO authenticated;
GRANT ALL ON public.cursos TO service_role;
ALTER TABLE public.cursos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full cursos" ON public.cursos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_cursos_upd BEFORE UPDATE ON public.cursos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- UFCDs (catalogo)
CREATE TABLE public.ufcds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  designacao TEXT NOT NULL,
  horas_referencia INTEGER NOT NULL DEFAULT 25,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ufcds TO authenticated;
GRANT ALL ON public.ufcds TO service_role;
ALTER TABLE public.ufcds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full ufcds" ON public.ufcds FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CURSO_UFCDS (UFCD atribuida a curso)
CREATE TABLE public.curso_ufcds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id UUID NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  ufcd_id UUID NOT NULL REFERENCES public.ufcds(id) ON DELETE RESTRICT,
  horas_totais INTEGER NOT NULL DEFAULT 25,
  ordem INTEGER NOT NULL DEFAULT 0,
  concluida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (curso_id, ufcd_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curso_ufcds TO authenticated;
GRANT ALL ON public.curso_ufcds TO service_role;
ALTER TABLE public.curso_ufcds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full curso_ufcds" ON public.curso_ufcds FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CURSO_UFCD_FORMADORES
CREATE TABLE public.curso_ufcd_formadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_ufcd_id UUID NOT NULL REFERENCES public.curso_ufcds(id) ON DELETE CASCADE,
  formador_id UUID NOT NULL REFERENCES public.formadores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (curso_ufcd_id, formador_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curso_ufcd_formadores TO authenticated;
GRANT ALL ON public.curso_ufcd_formadores TO service_role;
ALTER TABLE public.curso_ufcd_formadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full cuf" ON public.curso_ufcd_formadores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- SESSOES (cronograma)
CREATE TABLE public.sessoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id UUID NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  curso_ufcd_id UUID NOT NULL REFERENCES public.curso_ufcds(id) ON DELETE CASCADE,
  formador_id UUID NOT NULL REFERENCES public.formadores(id) ON DELETE RESTRICT,
  data DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  horas NUMERIC(5,2) NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (hora_fim > hora_inicio)
);
CREATE INDEX idx_sessoes_curso_data ON public.sessoes(curso_id, data);
CREATE INDEX idx_sessoes_formador_data ON public.sessoes(formador_id, data);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessoes TO authenticated;
GRANT ALL ON public.sessoes TO service_role;
ALTER TABLE public.sessoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full sessoes" ON public.sessoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_sessoes_upd BEFORE UPDATE ON public.sessoes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
