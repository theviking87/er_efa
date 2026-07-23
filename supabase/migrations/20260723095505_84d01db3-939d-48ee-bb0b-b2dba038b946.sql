
ALTER TYPE public.falta_tipo ADD VALUE IF NOT EXISTS 'ausencia';
ALTER TABLE public.formadores ADD COLUMN IF NOT EXISTS valor_hora numeric NOT NULL DEFAULT 0;
ALTER TABLE public.fin_bolsa_config ADD COLUMN IF NOT EXISTS elegivel_sa boolean NOT NULL DEFAULT true;
ALTER TABLE public.fin_bolsa_config ADD COLUMN IF NOT EXISTS elegivel_tr boolean NOT NULL DEFAULT false;
ALTER TABLE public.fin_bolsa_config ADD COLUMN IF NOT EXISTS km_diario numeric NOT NULL DEFAULT 0;
