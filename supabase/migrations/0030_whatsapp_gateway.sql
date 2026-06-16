-- ============================================================
-- 0030_whatsapp_gateway.sql — Gateway de disparo + guard rails anti-ban (Fase 1)
--
-- Suporta o ponto único de saída `src/lib/whatsapp-gateway.ts`:
--   1. whatsapp_messages ganha `channel` (baileys|cloud) e `intent` para que
--      todo envio seja rastreável por canal e motivo.
--   2. whatsapp_send_counters: contador diário por canal (base do cap/warmup).
--   3. increment_whatsapp_counter(): incremento atômico do contador do dia.
--   4. site_settings.whatsapp_guardrails: configuração dos guard rails.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
-- ON CONFLICT DO NOTHING.
-- ============================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) whatsapp_messages — canal e intenção do envio
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.whatsapp_messages
    ADD COLUMN IF NOT EXISTS channel TEXT,   -- 'baileys' | 'cloud' (null = legado)
    ADD COLUMN IF NOT EXISTS intent  TEXT;   -- crm_reply | assessor | campaign | bot | broadcast

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_channel
    ON public.whatsapp_messages (channel) WHERE channel IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_intent
    ON public.whatsapp_messages (intent) WHERE intent IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_messages.channel IS
    'Transporte usado: baileys (VPS, canal quente) ou cloud (API oficial, massa). Null em registros legados.';
COMMENT ON COLUMN public.whatsapp_messages.intent IS
    'Intenção do disparo (crm_reply | assessor | campaign | bot | broadcast) — usada pela política de roteamento do gateway.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2) whatsapp_send_counters — envios/dia por canal (cap + warmup)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_send_counters (
    channel    TEXT NOT NULL,                 -- 'baileys' | 'cloud'
    day        DATE NOT NULL,                  -- dia no fuso America/Sao_Paulo
    sent_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (channel, day)
);

ALTER TABLE public.whatsapp_send_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_send_counters_full_access" ON public.whatsapp_send_counters;
CREATE POLICY "wa_send_counters_full_access"
    ON public.whatsapp_send_counters FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');


-- ────────────────────────────────────────────────────────────────────────────
-- 3) increment_whatsapp_counter — incremento atômico do contador do dia
-- ────────────────────────────────────────────────────────────────────────────
-- O dia é resolvido pelo chamador (no fuso do guard rail) e passado como p_day,
-- para que leitura (dailyCount) e escrita usem exatamente a mesma data.
CREATE OR REPLACE FUNCTION public.increment_whatsapp_counter(p_channel TEXT, p_day DATE)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    INSERT INTO public.whatsapp_send_counters (channel, day, sent_count)
    VALUES (p_channel, p_day, 1)
    ON CONFLICT (channel, day)
    DO UPDATE SET sent_count = public.whatsapp_send_counters.sent_count + 1,
                  updated_at = timezone('utc'::text, now())
    RETURNING sent_count INTO v_count;
    RETURN v_count;
END;
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- 4) site_settings.whatsapp_guardrails — configuração dos guard rails
-- ────────────────────────────────────────────────────────────────────────────
-- Defaults conservadores. Espelha GUARDRAILS_DEFAULTS em
-- src/lib/whatsapp-guardrails.ts. warmup_started_on = null → sem aquecimento
-- (usa daily_cap). Para aquecer um número novo, setar a data de início.
INSERT INTO public.site_settings (key, value, description)
VALUES (
    'whatsapp_guardrails',
    '{
        "enabled": true,
        "baileys": {
            "daily_cap": 300,
            "warmup_start": 30,
            "warmup_step": 20,
            "warmup_started_on": null,
            "min_delay_ms": 8000,
            "max_delay_ms": 25000
        },
        "cloud": { "daily_cap": 1000 },
        "business_hours": {
            "enabled": false,
            "start": "08:00",
            "end": "20:00",
            "timezone": "America/Sao_Paulo"
        },
        "dedup_hours": 12
    }'::jsonb,
    'Guard rails anti-ban do WhatsApp (cap diário, warmup, jitter, horário comercial, dedup). Lido por src/lib/whatsapp-guardrails.ts.'
)
ON CONFLICT (key) DO NOTHING;
