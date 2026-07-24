ALTER TABLE public.curso_formandos
  ADD COLUMN IF NOT EXISTS data_desistencia date,
  ADD COLUMN IF NOT EXISTS data_conclusao date;