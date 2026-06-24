ALTER TABLE public.formando_pra ADD COLUMN IF NOT EXISTS nota TEXT;
ALTER TABLE public.formando_pra ALTER COLUMN nome DROP NOT NULL;
ALTER TABLE public.formando_pra ALTER COLUMN storage_path DROP NOT NULL;