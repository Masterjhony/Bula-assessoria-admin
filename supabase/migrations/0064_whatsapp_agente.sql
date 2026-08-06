-- Agente interno "Bula" no WhatsApp operacional.
-- Pendências de mutação: o agente NUNCA executa alteração direto — registra a
-- ação aqui e só executa quando o solicitante responde "sim" (expira em 10min).
-- Service-role only (RLS ligado sem policies, mesmo padrão das tabelas operacionais).

CREATE TABLE IF NOT EXISTS public.whatsapp_agente_pendencias (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       TEXT NOT NULL,              -- quem pediu (canônico); em grupo, vazio se @lid não resolvido
    chat_jid    TEXT,                       -- JID do grupo quando a pendência nasceu lá (NULL em 1:1)
    solicitante TEXT,                       -- nome do membro (allowlist/pushName)
    tool_name   TEXT NOT NULL,              -- ex.: 'crm_atualizar_lead'
    args        JSONB NOT NULL DEFAULT '{}'::jsonb,
    resumo      TEXT NOT NULL,              -- texto mostrado ("Vou alterar X para Y. Confirma?")
    status      TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','executada','cancelada','expirada','substituida','erro')),
    resultado   JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
    executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS wa_agente_pend_phone_idx
    ON public.whatsapp_agente_pendencias (phone, status, created_at DESC);
CREATE INDEX IF NOT EXISTS wa_agente_pend_chat_idx
    ON public.whatsapp_agente_pendencias (chat_jid, status, created_at DESC);

ALTER TABLE public.whatsapp_agente_pendencias ENABLE ROW LEVEL SECURITY;
