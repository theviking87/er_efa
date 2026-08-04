ALTER TABLE public.formador_documentos ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE public.formador_documentos ADD COLUMN IF NOT EXISTS entregue boolean NOT NULL DEFAULT false;
ALTER TABLE public.formador_documentos ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;

ALTER TABLE public.formando_pra ADD COLUMN IF NOT EXISTS entregue boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.formando_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formando_id uuid NOT NULL REFERENCES public.formandos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  entregue boolean NOT NULL DEFAULT false,
  ordem integer NOT NULL DEFAULT 0,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.formando_documentos TO authenticated;
GRANT ALL ON public.formando_documentos TO service_role;

ALTER TABLE public.formando_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth all formando_documentos" ON public.formando_documentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_formando_documentos_updated_at
  BEFORE UPDATE ON public.formando_documentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();