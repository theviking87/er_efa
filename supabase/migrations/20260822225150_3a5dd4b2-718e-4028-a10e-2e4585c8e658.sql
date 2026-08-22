CREATE TABLE public.documentacao_estado (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chave text NOT NULL UNIQUE,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentacao_estado TO authenticated;
GRANT ALL ON public.documentacao_estado TO service_role;
ALTER TABLE public.documentacao_estado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados gerem documentacao" ON public.documentacao_estado FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_documentacao_estado_upd BEFORE UPDATE ON public.documentacao_estado FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();