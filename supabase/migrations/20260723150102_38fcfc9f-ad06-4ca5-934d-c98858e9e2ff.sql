ALTER TABLE public.fin_bolsa_config ADD COLUMN IF NOT EXISTS elegivel_atl BOOLEAN NOT NULL DEFAULT false;
UPDATE public.fin_bolsa_config SET elegivel_atl = true WHERE COALESCE(valor_atl, 0) > 0;