
CREATE POLICY "desp anexos select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'despesas-anexos');
CREATE POLICY "desp anexos insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'despesas-anexos');
CREATE POLICY "desp anexos update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'despesas-anexos') WITH CHECK (bucket_id = 'despesas-anexos');
CREATE POLICY "desp anexos delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'despesas-anexos');
