-- Guarda dados suficientes para recuperar midias inbound se o download/upload
-- falhar no momento do webhook. O media_meta_id e o ID retornado no payload da
-- Meta (audio.id, image.id etc.); enquanto a Meta retiver a midia, o script de
-- recovery consegue baixar e preencher media_url depois.

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_meta_id       text,
  ADD COLUMN IF NOT EXISTS media_ingest_error  text,
  ADD COLUMN IF NOT EXISTS media_ingested_at   timestamptz;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_media_recovery
  ON public.whatsapp_messages (media_meta_id)
  WHERE media_meta_id IS NOT NULL AND media_url IS NULL;
