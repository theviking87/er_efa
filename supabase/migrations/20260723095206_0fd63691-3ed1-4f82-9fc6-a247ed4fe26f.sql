-- Políticas de acesso para o bucket empresa-logos (privado): utilizadores autenticados podem listar, ler, carregar e apagar.
CREATE POLICY "empresa-logos read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'empresa-logos');
CREATE POLICY "empresa-logos insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'empresa-logos');
CREATE POLICY "empresa-logos update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'empresa-logos') WITH CHECK (bucket_id = 'empresa-logos');
CREATE POLICY "empresa-logos delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'empresa-logos');