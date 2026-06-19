-- Bucket `cliente-documentos` para anexos dos clientes (CPF, comprovantes, IE…).
--
-- Diferente das capas/catálogos de leilão, estes documentos são SENSÍVEIS:
-- o bucket é PRIVADO e o acesso de leitura é feito por signed URL gerada no
-- server (service role). Por isso NÃO há policy de SELECT público — só
-- authenticated. A criação do bucket fica em
-- scripts/setup-cliente-documentos-bucket.mjs (service role).

DO $$
BEGIN
  -- INSERT: usuário autenticado pode subir documentos no bucket.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'cliente_documentos_authenticated_insert'
  ) THEN
    CREATE POLICY "cliente_documentos_authenticated_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'cliente-documentos');
  END IF;

  -- SELECT: somente autenticados (bucket privado; download via signed URL).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'cliente_documentos_authenticated_read'
  ) THEN
    CREATE POLICY "cliente_documentos_authenticated_read"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'cliente-documentos');
  END IF;

  -- UPDATE: usuário autenticado pode sobrescrever (upsert).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'cliente_documentos_authenticated_update'
  ) THEN
    CREATE POLICY "cliente_documentos_authenticated_update"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'cliente-documentos')
      WITH CHECK (bucket_id = 'cliente-documentos');
  END IF;

  -- DELETE: usuário autenticado pode remover um documento.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'cliente_documentos_authenticated_delete'
  ) THEN
    CREATE POLICY "cliente_documentos_authenticated_delete"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'cliente-documentos');
  END IF;
END $$;
