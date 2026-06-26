-- Mídia recebida (inbound) no WhatsApp: áudio, imagem, vídeo, documento.
--
-- Antes, o webhook da Cloud API descartava o ID da mídia e gravava só o
-- placeholder de texto ("[áudio]"), então não havia como escutar/ver o que o
-- lead mandou. Agora o webhook baixa a mídia da Graph API e guarda no R2
-- (mesma infra dos templates/campanhas), salvando aqui a KEY do objeto + tipo.
-- O histórico (thread) resolve a key em signed URL na hora de exibir.
--
-- media_url      = key do objeto no R2 (ex.: "wa-inbound/55…/wamid….ogg")
-- media_type     = 'audio' | 'image' | 'video' | 'document'
-- media_mime     = mime real reportado pela Meta (ex.: audio/ogg)
-- media_filename = nome original (documentos) — null nos demais

ALTER TABLE whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_url      text,
  ADD COLUMN IF NOT EXISTS media_type     text,
  ADD COLUMN IF NOT EXISTS media_mime     text,
  ADD COLUMN IF NOT EXISTS media_filename text;
