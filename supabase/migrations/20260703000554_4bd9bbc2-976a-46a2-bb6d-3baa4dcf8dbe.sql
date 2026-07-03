
-- Allow anon role (used by supabaseAdmin fallback when service role key is absent)
-- to read/write objects in the wa-media bucket. This unblocks vendor uploads that
-- go through the server function using the publishable key fallback.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='wa-media anon insert') THEN
    CREATE POLICY "wa-media anon insert" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'wa-media');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='wa-media anon read') THEN
    CREATE POLICY "wa-media anon read" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'wa-media');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='wa-media anon update') THEN
    CREATE POLICY "wa-media anon update" ON storage.objects FOR UPDATE TO anon USING (bucket_id = 'wa-media') WITH CHECK (bucket_id = 'wa-media');
  END IF;
END$$;
