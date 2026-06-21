
CREATE TYPE public.falta_tipo AS ENUM ('justificada', 'injustificada');

CREATE TABLE public.formando_faltas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  curso_formando_id UUID NOT NULL REFERENCES public.curso_formandos(id) ON DELETE CASCADE,
  sessao_id UUID REFERENCES public.sessoes(id) ON DELETE SET NULL,
  data DATE NOT NULL,
  horas NUMERIC NOT NULL DEFAULT 0,
  tipo public.falta_tipo NOT NULL DEFAULT 'injustificada',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formando_faltas TO authenticated;
GRANT ALL ON public.formando_faltas TO service_role;
ALTER TABLE public.formando_faltas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full faltas" ON public.formando_faltas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_faltas_cf ON public.formando_faltas(curso_formando_id);
CREATE INDEX idx_faltas_sessao ON public.formando_faltas(sessao_id);
