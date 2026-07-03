-- Bucket `lote-gifs` para os GIFs/vídeos curtos de divulgação de lotes de
-- leilão (página Ferramentas → GIF de Lotes).
--
-- O upload é feito no browser com a sessão do usuário (anon key + cookies),
-- direto pro Storage (mesmo racional do catálogo: fura o limite de 4.5MB de
-- body da Vercel). Para funcionar precisamos:
--   1. O bucket existir e ser público (o VPS Baileys baixa a mídia por URL)
--   2. Policies em storage.objects para INSERT/UPDATE/DELETE de autenticado
--
-- A criação do bucket fica em scripts/setup-lote-gifs-bucket.mjs (service
-- role). Aqui só as policies, idempotentes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'lote_gifs_authenticated_insert'
  ) THEN
    CREATE POLICY "lote_gifs_authenticated_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'lote-gifs');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'lote_gifs_public_read'
  ) THEN
    CREATE POLICY "lote_gifs_public_read"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'lote-gifs');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'lote_gifs_authenticated_update'
  ) THEN
    CREATE POLICY "lote_gifs_authenticated_update"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'lote-gifs')
      WITH CHECK (bucket_id = 'lote-gifs');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'lote_gifs_authenticated_delete'
  ) THEN
    CREATE POLICY "lote_gifs_authenticated_delete"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'lote-gifs');
  END IF;
END $$;
