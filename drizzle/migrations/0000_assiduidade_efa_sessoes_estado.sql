ALTER TABLE public.sessoes ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'realizada';
ALTER TABLE public.fin_config ADD COLUMN IF NOT EXISTS limiar_sa_horas numeric NOT NULL DEFAULT 3;
ALTER TABLE public.fin_config ADD COLUMN IF NOT EXISTS limite_faltas_just_pct numeric NOT NULL DEFAULT 10;

CREATE TABLE public.recuperacao_pedagogica (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_formando_id uuid NOT NULL REFERENCES public.curso_formandos(id) ON DELETE CASCADE,
  curso_ufcd_id uuid REFERENCES public.curso_ufcds(id) ON DELETE SET NULL,
  motivo text NOT NULL DEFAULT '',
  plano text,
  responsavel text,
  prazo date,
  horas_recuperadas numeric NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'em_analise',
  decisao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recuperacao_pedagogica TO authenticated;
GRANT ALL ON public.recuperacao_pedagogica TO service_role;
ALTER TABLE public.recuperacao_pedagogica ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth full access recuperacao" ON public.recuperacao_pedagogica FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER trg_recuperacao_updated BEFORE UPDATE ON public.recuperacao_pedagogica FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();