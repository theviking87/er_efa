
CREATE POLICY "auth read formador-documentos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'formador-documentos');
CREATE POLICY "auth insert formador-documentos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'formador-documentos');
CREATE POLICY "auth update formador-documentos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'formador-documentos') WITH CHECK (bucket_id = 'formador-documentos');
CREATE POLICY "auth delete formador-documentos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'formador-documentos');
