-- Bucket `leilao-covers` para capas de leilões.
--
-- O upload é feito por /api/bula/leiloes/upload, que usa o cliente Supabase
-- server-side com a sessão do usuário (anon key + cookies). Para o upload
-- funcionar precisamos:
--   1. O bucket existir e ser público (leitura aberta via getPublicUrl)
--   2. Policies em storage.objects permitindo INSERT/UPDATE/DELETE para
--      qualquer usuário autenticado restritas a esse bucket.
--
-- A criação do bucket em si fica num script separado
-- (scripts/setup-leilao-covers-bucket.mjs) porque storage.buckets exige
-- service role e a coluna `owner` muda de schema entre versões — aqui só
-- garantimos as policies idempotentes.

DO $$
BEGIN
  -- INSERT: usuário autenticado pode subir arquivos no bucket leilao-covers.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'leilao_covers_authenticated_insert'
  ) THEN
    CREATE POLICY "leilao_covers_authenticated_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'leilao-covers');
  END IF;

  -- SELECT: leitura pública (o bucket é público, mas a policy explícita
  -- evita surpresas se alguém mudar o bucket para privado depois).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'leilao_covers_public_read'
  ) THEN
    CREATE POLICY "leilao_covers_public_read"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'leilao-covers');
  END IF;

  -- UPDATE: usuário autenticado pode sobrescrever (upsert) o próprio upload.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'leilao_covers_authenticated_update'
  ) THEN
    CREATE POLICY "leilao_covers_authenticated_update"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'leilao-covers')
      WITH CHECK (bucket_id = 'leilao-covers');
  END IF;

  -- DELETE: usuário autenticado pode remover capa antiga ao trocar.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'leilao_covers_authenticated_delete'
  ) THEN
    CREATE POLICY "leilao_covers_authenticated_delete"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'leilao-covers');
  END IF;
END $$;
