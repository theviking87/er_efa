
CREATE TYPE public.formando_estado AS ENUM ('ativo', 'inativo', 'desistente', 'concluido');
CREATE TYPE public.inscricao_estado AS ENUM ('inscrito', 'em_formacao', 'concluido', 'desistente');

CREATE TABLE public.formandos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  nif TEXT,
  cc TEXT,
  validade_cc DATE,
  data_nascimento DATE,
  telemovel TEXT,
  email TEXT,
  morada TEXT,
  codigo_postal TEXT,
  localidade TEXT,
  habilitacoes TEXT,
  situacao_emprego TEXT,
  niss TEXT,
  observacoes TEXT,
  estado public.formando_estado NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formandos TO authenticated;
GRANT ALL ON public.formandos TO service_role;
ALTER TABLE public.formandos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full formandos" ON public.formandos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_formandos_updated_at BEFORE UPDATE ON public.formandos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.curso_formandos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  curso_id UUID NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  formando_id UUID NOT NULL REFERENCES public.formandos(id) ON DELETE CASCADE,
  data_inscricao DATE NOT NULL DEFAULT CURRENT_DATE,
  estado public.inscricao_estado NOT NULL DEFAULT 'inscrito',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (curso_id, formando_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curso_formandos TO authenticated;
GRANT ALL ON public.curso_formandos TO service_role;
ALTER TABLE public.curso_formandos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full curso_formandos" ON public.curso_formandos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_curso_formandos_curso ON public.curso_formandos(curso_id);
CREATE INDEX idx_curso_formandos_formando ON public.curso_formandos(formando_id);
