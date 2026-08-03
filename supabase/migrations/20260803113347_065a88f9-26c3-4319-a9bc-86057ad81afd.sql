CREATE TABLE public.painel_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  texto text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.painel_notas TO authenticated;
GRANT ALL ON public.painel_notas TO service_role;
ALTER TABLE public.painel_notas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "painel_notas_auth_all" ON public.painel_notas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_painel_notas_updated BEFORE UPDATE ON public.painel_notas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.painel_notas (texto) VALUES ('');