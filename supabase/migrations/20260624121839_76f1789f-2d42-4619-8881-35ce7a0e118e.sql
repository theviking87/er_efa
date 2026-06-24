
CREATE TABLE public.formando_pra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_formando_id UUID NOT NULL REFERENCES public.curso_formandos(id) ON DELETE CASCADE,
  curso_ufcd_id UUID NOT NULL REFERENCES public.curso_ufcds(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(curso_formando_id, curso_ufcd_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.formando_pra TO authenticated;
GRANT ALL ON public.formando_pra TO service_role;

ALTER TABLE public.formando_pra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth full formando_pra" ON public.formando_pra FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER trg_formando_pra_updated_at
BEFORE UPDATE ON public.formando_pra
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage policies for the formando-pra bucket (authenticated full access)
CREATE POLICY "auth read formando-pra"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'formando-pra');

CREATE POLICY "auth insert formando-pra"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'formando-pra');

CREATE POLICY "auth update formando-pra"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'formando-pra');

CREATE POLICY "auth delete formando-pra"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'formando-pra');
