
CREATE TABLE public.formador_disponibilidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formador_id uuid NOT NULL REFERENCES public.formadores(id) ON DELETE CASCADE,
  data date NOT NULL,
  hora_inicio time NOT NULL DEFAULT '09:00',
  hora_fim time NOT NULL DEFAULT '18:00',
  tipo text NOT NULL DEFAULT 'disponivel' CHECK (tipo IN ('disponivel','indisponivel')),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.formador_disponibilidades TO authenticated;
GRANT ALL ON public.formador_disponibilidades TO service_role;

ALTER TABLE public.formador_disponibilidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth full disponibilidades" ON public.formador_disponibilidades
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER set_updated_at_disp BEFORE UPDATE ON public.formador_disponibilidades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_disp_formador_data ON public.formador_disponibilidades(formador_id, data);
