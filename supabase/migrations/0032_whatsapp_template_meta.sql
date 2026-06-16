-- ============================================================
-- 0032_whatsapp_template_meta.sql — ciclo de vida de templates na Meta (Fase 2)
--
-- whatsapp_templates passa a guardar o estado de aprovação na Meta. Um template
-- nasce LOCAL (só corpo livre, usado pelo Baileys). Ao submeter à Meta vira
-- PENDING; quando a Meta aprova/rejeita, vira APPROVED/REJECTED. Só APPROVED
-- pode ser usado em campanhas de massa pela Cloud API (fora da janela de 24h).
-- ============================================================

ALTER TABLE public.whatsapp_templates
    -- ID do template na Meta (retornado na criação). Null = nunca submetido.
    ADD COLUMN IF NOT EXISTS meta_template_id  TEXT,
    -- LOCAL | PENDING | APPROVED | REJECTED | PAUSED | DISABLED
    ADD COLUMN IF NOT EXISTS meta_status       TEXT NOT NULL DEFAULT 'LOCAL',
    -- Categoria Meta: MARKETING | UTILITY | AUTHENTICATION
    ADD COLUMN IF NOT EXISTS meta_category     TEXT,
    -- Código de idioma Meta (ex: pt_BR)
    ADD COLUMN IF NOT EXISTS meta_language     TEXT,
    -- Motivo da rejeição (quando REJECTED)
    ADD COLUMN IF NOT EXISTS meta_rejected_reason TEXT,
    -- Última vez que sincronizamos o status com a Meta
    ADD COLUMN IF NOT EXISTS meta_synced_at    TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_templates_meta_status_check'
    ) THEN
        ALTER TABLE public.whatsapp_templates
            ADD CONSTRAINT whatsapp_templates_meta_status_check
            CHECK (meta_status IN ('LOCAL','PENDING','APPROVED','REJECTED','PAUSED','DISABLED'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_meta_status
    ON public.whatsapp_templates (meta_status) WHERE meta_status <> 'LOCAL';

COMMENT ON COLUMN public.whatsapp_templates.meta_status IS
    'Estado na Meta: LOCAL (não submetido) | PENDING | APPROVED | REJECTED | PAUSED | DISABLED. Só APPROVED vale para massa via Cloud API.';
