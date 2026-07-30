CREATE TABLE public.fin_transporte_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formando_id uuid NOT NULL,
  modo text NOT NULL DEFAULT 'km',
  km_diario numeric NOT NULL DEFAULT 0,
  valor_passe numeric NOT NULL DEFAULT 0,
  vigente_desde date NOT NULL DEFAULT CURRENT_DATE,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (formando_id, vigente_desde)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_transporte_config TO authenticated;
GRANT ALL ON public.fin_transporte_config TO service_role;

ALTER TABLE public.fin_transporte_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_fin_transporte_config" ON public.fin_transporte_config
FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER set_fin_transporte_config_updated_at
BEFORE UPDATE ON public.fin_transporte_config
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.fin_transporte_config (formando_id, modo, km_diario, valor_passe, vigente_desde)
SELECT formando_id, 'km', km_diario, 0, DATE '2000-01-01'
FROM public.fin_bolsa_config
WHERE elegivel_tr = true AND km_diario > 0;