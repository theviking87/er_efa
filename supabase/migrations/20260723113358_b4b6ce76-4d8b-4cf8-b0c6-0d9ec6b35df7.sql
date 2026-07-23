ALTER TABLE public.fin_processamento_linha
  ALTER COLUMN valor_dia DROP NOT NULL,
  ALTER COLUMN km_total DROP NOT NULL,
  ALTER COLUMN horas_previstas DROP NOT NULL,
  ALTER COLUMN horas_frequentadas DROP NOT NULL,
  ALTER COLUMN horas_elegiveis DROP NOT NULL,
  ALTER COLUMN dias_elegiveis DROP NOT NULL;