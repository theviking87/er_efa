CREATE TABLE public.curso_ferias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  curso_id uuid NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curso_ferias TO authenticated;
GRANT ALL ON public.curso_ferias TO service_role;
ALTER TABLE public.curso_ferias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full curso_ferias" ON public.curso_ferias TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER curso_ferias_updated BEFORE UPDATE ON public.curso_ferias FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX curso_ferias_curso_idx ON public.curso_ferias(curso_id, data_inicio, data_fim);