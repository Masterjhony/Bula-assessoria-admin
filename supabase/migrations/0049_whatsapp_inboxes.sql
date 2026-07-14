-- ============================================================
-- 0049_whatsapp_inboxes.sql — Multi-inbox no atendimento WhatsApp
--
-- Hoje o atendimento tem UMA sessão Baileys (número do João Antonio) + UM
-- número da API oficial (Cloud). Esta migration introduz o conceito de INBOX:
-- cada número vira uma "caixa" com conversas próprias, e o sistema pode plugar
-- N sessões Baileys, cada uma com seu QR/pareamento.
--
-- Dimensões distintas (não se substituem):
--   • channel (baileys|cloud) → TRANSPORTE / anti-ban (whatsapp_send_counters,
--     política do gateway). Permanece intacto.
--   • inbox_id                → ORGANIZAÇÃO da conversa. Novidade desta migration.
--     conversa = (inbox_id, telefone). O id do inbox = sessionId no VPS.
--
-- Idempotente: CREATE TABLE / ADD COLUMN IF NOT EXISTS, ON CONFLICT DO NOTHING.
-- ============================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) whatsapp_inboxes — cadastro de caixas de atendimento
-- ────────────────────────────────────────────────────────────────────────────
-- `id` é o slug estável e TAMBÉM o sessionId usado no VPS Baileys
-- (ex.: 'joao', 'cloud'). `channel` casa com whatsapp_messages.channel para a
-- política anti-ban. `automations_enabled` controla se o concierge/welcome roda
-- neste inbox (decisão de produto: automação só na oficial; Baileys manuais).
-- `status` é um espelho leve — a verdade da conexão vem do VPS (/status) e da
-- Meta; aqui só cacheamos para a UI.
CREATE TABLE IF NOT EXISTS public.whatsapp_inboxes (
    id                  TEXT PRIMARY KEY,               -- slug = sessionId no VPS
    label               TEXT NOT NULL,
    kind                TEXT NOT NULL CHECK (kind IN ('baileys','cloud')),
    phone               TEXT,                            -- E.164 opcional (só rótulo)
    channel             TEXT NOT NULL CHECK (channel IN ('baileys','cloud')),
    status              TEXT NOT NULL DEFAULT 'unknown', -- espelho leve p/ UI
    is_primary          BOOLEAN NOT NULL DEFAULT false,  -- inbox primário (automações)
    automations_enabled BOOLEAN NOT NULL DEFAULT false,  -- concierge/welcome roda aqui?
    ativo               BOOLEAN NOT NULL DEFAULT true,
    ordem               INTEGER NOT NULL DEFAULT 100,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.whatsapp_inboxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_inboxes_full_access" ON public.whatsapp_inboxes;
CREATE POLICY "wa_inboxes_full_access"
    ON public.whatsapp_inboxes FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

COMMENT ON TABLE public.whatsapp_inboxes IS
    'Caixas de atendimento WhatsApp. id = sessionId no VPS Baileys (ou "cloud" p/ API oficial). channel casa com whatsapp_messages.channel (anti-ban).';
COMMENT ON COLUMN public.whatsapp_inboxes.automations_enabled IS
    'Se true, o concierge/welcome/grafo roda para mensagens deste inbox. Baileys manuais nascem false; a oficial nasce true.';

-- Seed: os dois inboxes que já existem hoje.
--  • cloud → API oficial, primário, automações ON (comportamento atual).
--  • joao  → Baileys já pareado. automations_enabled=true PRESERVA o
--            auto-responder atual do João (evita regressão silenciosa no deploy);
--            o operador desliga na UI quando quiser torná-lo 100% manual.
INSERT INTO public.whatsapp_inboxes
    (id, label, kind, channel, is_primary, automations_enabled, ativo, ordem)
VALUES
    ('cloud', 'API Oficial',   'cloud',   'cloud',   true,  true, true, 10),
    ('joao',  'João Antonio',  'baileys', 'baileys', false, true, true, 20)
ON CONFLICT (id) DO NOTHING;


-- ────────────────────────────────────────────────────────────────────────────
-- 2) whatsapp_messages.inbox_id — a qual caixa a mensagem pertence
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.whatsapp_messages
    ADD COLUMN IF NOT EXISTS inbox_id TEXT;   -- FK lógica p/ whatsapp_inboxes.id

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_inbox_id
    ON public.whatsapp_messages (inbox_id) WHERE inbox_id IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_messages.inbox_id IS
    'Caixa de atendimento (whatsapp_inboxes.id) que enviou/recebeu a mensagem. Null em registros legados pré-multi-inbox.';

-- Backfill: mapeia o histórico pelas duas caixas que existiam.
-- channel NULL (pré-gateway) fica NULL — a UI trata como "sem inbox".
UPDATE public.whatsapp_messages SET inbox_id = 'cloud'
    WHERE inbox_id IS NULL AND channel = 'cloud';
UPDATE public.whatsapp_messages SET inbox_id = 'joao'
    WHERE inbox_id IS NULL AND channel = 'baileys';
