CREATE TABLE public.curso_formando_ufcds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_formando_id uuid NOT NULL REFERENCES public.curso_formandos(id) ON DELETE CASCADE,
  curso_ufcd_id uuid NOT NULL REFERENCES public.curso_ufcds(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(curso_formando_id, curso_ufcd_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.curso_formando_ufcds TO authenticated;
GRANT ALL ON public.curso_formando_ufcds TO service_role;

ALTER TABLE public.curso_formando_ufcds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth all" ON public.curso_formando_ufcds FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_cfu_cf ON public.curso_formando_ufcds(curso_formando_id);
CREATE INDEX idx_cfu_cu ON public.curso_formando_ufcds(curso_ufcd_id);