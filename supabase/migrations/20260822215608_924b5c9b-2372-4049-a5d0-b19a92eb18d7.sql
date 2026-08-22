CREATE TABLE public.contratos_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo_contrato text NOT NULL DEFAULT 'FORMADOR',
  data_geracao timestamp with time zone NOT NULL DEFAULT now(),
  nome_formador text NOT NULL,
  ufcd text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contratos_historico TO authenticated;
GRANT ALL ON public.contratos_historico TO service_role;
ALTER TABLE public.contratos_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY contratos_historico_auth_all ON public.contratos_historico FOR ALL TO authenticated USING (true) WITH CHECK (true);