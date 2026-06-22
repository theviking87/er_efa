CREATE TABLE public.formador_ufcds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formador_id uuid NOT NULL REFERENCES public.formadores(id) ON DELETE CASCADE,
  ufcd_id uuid NOT NULL REFERENCES public.ufcds(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (formador_id, ufcd_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formador_ufcds TO authenticated;
GRANT ALL ON public.formador_ufcds TO service_role;
ALTER TABLE public.formador_ufcds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full formador_ufcds" ON public.formador_ufcds FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_formador_ufcds_formador ON public.formador_ufcds(formador_id);
CREATE INDEX idx_formador_ufcds_ufcd ON public.formador_ufcds(ufcd_id);