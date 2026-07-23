ALTER TABLE public.fin_config ADD COLUMN IF NOT EXISTS tr_teto_mensal numeric;
ALTER TABLE public.fin_bolsa_config DROP COLUMN IF EXISTS tr_teto_mensal;