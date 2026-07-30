DROP POLICY IF EXISTS "auth full cronograma_observacoes" ON public.cronograma_observacoes;
CREATE POLICY "auth full cronograma_observacoes" ON public.cronograma_observacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth full formando_pra" ON public.formando_pra;
CREATE POLICY "auth full formando_pra" ON public.formando_pra
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON public.cronograma_observacoes FROM anon;
REVOKE ALL ON public.formando_pra FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cronograma_observacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.formando_pra TO authenticated;
GRANT ALL ON public.cronograma_observacoes TO service_role;
GRANT ALL ON public.formando_pra TO service_role;

DROP POLICY IF EXISTS "auth update formando-pra" ON storage.objects;
CREATE POLICY "auth update formando-pra" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'formando-pra')
  WITH CHECK (bucket_id = 'formando-pra');