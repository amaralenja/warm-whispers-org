CREATE POLICY "wa-media auth read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'wa-media');
CREATE POLICY "wa-media auth insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'wa-media');
CREATE POLICY "wa-media auth update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'wa-media');
CREATE POLICY "wa-media auth delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'wa-media');