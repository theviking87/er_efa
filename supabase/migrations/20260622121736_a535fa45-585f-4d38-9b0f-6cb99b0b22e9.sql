DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.cursos; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.curso_ufcds; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.curso_ufcd_formadores; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.formador_disponibilidades; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sessoes; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.cursos REPLICA IDENTITY FULL;
ALTER TABLE public.curso_ufcds REPLICA IDENTITY FULL;
ALTER TABLE public.curso_ufcd_formadores REPLICA IDENTITY FULL;
ALTER TABLE public.formador_disponibilidades REPLICA IDENTITY FULL;
ALTER TABLE public.sessoes REPLICA IDENTITY FULL;