ALTER TABLE public.formadores
  ADD COLUMN IF NOT EXISTS sem_retencao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS retencao_percentagem numeric NOT NULL DEFAULT 23,
  ADD COLUMN IF NOT EXISTS aplica_iva boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iva_percentagem numeric NOT NULL DEFAULT 23;

ALTER TABLE public.fin_processamento_linha
  ADD COLUMN IF NOT EXISTS valor_manual numeric;