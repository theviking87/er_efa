ALTER TABLE public.formadores ADD COLUMN IF NOT EXISTS abreviatura text;

UPDATE public.formadores
SET abreviatura = CASE
  WHEN array_length(regexp_split_to_array(trim(nome), '\s+'), 1) >= 2
    THEN (regexp_split_to_array(trim(nome), '\s+'))[1]
      || ' '
      || (regexp_split_to_array(trim(nome), '\s+'))[array_length(regexp_split_to_array(trim(nome), '\s+'), 1)]
  ELSE trim(nome)
END
WHERE abreviatura IS NULL OR abreviatura = '';