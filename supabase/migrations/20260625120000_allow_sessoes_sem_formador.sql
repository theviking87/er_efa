-- Permite sessões sem formador para aparecerem no cronograma/impressão como "em falta".
ALTER TABLE public.sessoes
  ALTER COLUMN formador_id DROP NOT NULL;
