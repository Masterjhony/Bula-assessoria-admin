-- Bucket `media` da Biblioteca de Mídia (Ferramentas → Biblioteca de Mídia).
--
-- O upload é feito no browser com a sessão do usuário (anon key + cookies),
-- direto pro Storage (fura o limite de 4.5MB de body da Vercel). A criação do
-- bucket fica em scripts/setup-media-bucket.mjs (service role). Aqui só as
-- policies, idempotentes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'media_authenticated_insert'
  ) THEN
    CREATE POLICY "media_authenticated_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'media');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'media_public_read'
  ) THEN
    CREATE POLICY "media_public_read"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'media');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'media_authenticated_update'
  ) THEN
    CREATE POLICY "media_authenticated_update"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'media')
      WITH CHECK (bucket_id = 'media');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'media_authenticated_delete'
  ) THEN
    CREATE POLICY "media_authenticated_delete"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'media');
  END IF;
END $$;
