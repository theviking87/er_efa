CREATE TABLE public.cronograma_observacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id uuid NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  mes date NOT NULL,
  texto text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (curso_id, mes)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_observacoes TO authenticated;
GRANT ALL ON public.cronograma_observacoes TO service_role;
ALTER TABLE public.cronograma_observacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full cronograma_observacoes" ON public.cronograma_observacoes FOR ALL USING (true) WITH CHECK (true);