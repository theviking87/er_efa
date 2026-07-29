CREATE TABLE public.fin_processamento_obs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processamento_id uuid NOT NULL REFERENCES public.fin_processamento(id) ON DELETE CASCADE,
  formando_id uuid NOT NULL,
  texto text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processamento_id, formando_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_processamento_obs TO authenticated;
GRANT ALL ON public.fin_processamento_obs TO service_role;
ALTER TABLE public.fin_processamento_obs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_fin_processamento_obs" ON public.fin_processamento_obs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_fin_processamento_obs_upd BEFORE UPDATE ON public.fin_processamento_obs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();