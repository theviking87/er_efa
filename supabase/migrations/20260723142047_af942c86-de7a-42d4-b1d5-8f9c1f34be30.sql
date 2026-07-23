
ALTER TABLE public.fin_config ADD COLUMN IF NOT EXISTS atl_teto_mensal numeric NOT NULL DEFAULT 0;
ALTER TABLE public.fin_bolsa_config ADD COLUMN IF NOT EXISTS valor_atl numeric NOT NULL DEFAULT 0;
ALTER TABLE public.fin_processamento ADD COLUMN IF NOT EXISTS total_atl numeric NOT NULL DEFAULT 0;
ALTER TABLE public.fin_processamento_linha DROP CONSTRAINT IF EXISTS fin_processamento_linha_rubrica_check;
ALTER TABLE public.fin_processamento_linha ADD CONSTRAINT fin_processamento_linha_rubrica_check CHECK (rubrica = ANY (ARRAY['BF','BFM','SA','TR','HN','ATL']));
