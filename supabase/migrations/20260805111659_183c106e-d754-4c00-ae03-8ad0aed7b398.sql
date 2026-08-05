ALTER TABLE public.painel_notas ADD COLUMN IF NOT EXISTS chave text NOT NULL DEFAULT 'painel';
CREATE UNIQUE INDEX IF NOT EXISTS painel_notas_chave_key ON public.painel_notas (chave);