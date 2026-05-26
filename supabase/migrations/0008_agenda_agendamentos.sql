-- ============================================================
-- 0008_agenda_agendamentos.sql — Fase 3
-- Schema da Agenda Oficial + Agendamentos (Calendly via Google
-- Calendar como ponte). Cortadas as FK para tabelas que NÃO
-- existem no web-bula (products, breeders, crm_leads) — viram
-- colunas UUID nullable sem REFERENCES. FK para crm_leads será
-- adicionada retroativamente na Fase 8 quando o CRM chegar.
-- ============================================================

-- ── site_settings (chave-valor genérico, usado pelo agendamento) ─
CREATE TABLE IF NOT EXISTS public.site_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "site_settings_all" ON public.site_settings;
CREATE POLICY "site_settings_all" ON public.site_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_site_settings_updated_at ON public.site_settings;
CREATE TRIGGER trg_site_settings_updated_at
    BEFORE UPDATE ON public.site_settings
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── AGENDA OFICIAL ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agenda_events (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title                 TEXT NOT NULL,
    description           TEXT,
    event_type            TEXT NOT NULL DEFAULT 'tarefa_interna',
    status                TEXT NOT NULL DEFAULT 'planejado',
    priority              TEXT NOT NULL DEFAULT 'media',
    start_at              TIMESTAMPTZ NOT NULL,
    end_at                TIMESTAMPTZ,
    all_day               BOOLEAN NOT NULL DEFAULT FALSE,
    location              TEXT,
    color                 TEXT,
    notes                 TEXT,
    recurrence_rule       TEXT,
    recurrence_until      DATE,
    responsible_member_id UUID REFERENCES public.tactical_members(id) ON DELETE SET NULL,
    linked_leilao_id      UUID REFERENCES public.cronograma_leiloes(id) ON DELETE SET NULL,
    linked_task_id        UUID REFERENCES public.tactical_tasks(id)     ON DELETE SET NULL,
    linked_flow_id        UUID REFERENCES public.strategic_flows(id)    ON DELETE SET NULL,
    -- FKs cortadas (tabelas não existem no web-bula):
    linked_product_id     INTEGER,  -- products
    linked_breeder_id     INTEGER,  -- breeders
    linked_lead_id        UUID,     -- crm_leads (Fase 8)
    linked_contract_id    UUID REFERENCES public.tactical_contracts(id) ON DELETE SET NULL,
    created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agenda_events_start_idx       ON public.agenda_events (start_at);
CREATE INDEX IF NOT EXISTS agenda_events_type_idx        ON public.agenda_events (event_type);
CREATE INDEX IF NOT EXISTS agenda_events_status_idx      ON public.agenda_events (status);
CREATE INDEX IF NOT EXISTS agenda_events_leilao_idx      ON public.agenda_events (linked_leilao_id);
CREATE INDEX IF NOT EXISTS agenda_events_task_idx        ON public.agenda_events (linked_task_id);
CREATE INDEX IF NOT EXISTS agenda_events_flow_idx        ON public.agenda_events (linked_flow_id);
CREATE INDEX IF NOT EXISTS agenda_events_responsible_idx ON public.agenda_events (responsible_member_id);

CREATE OR REPLACE FUNCTION public.update_agenda_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agenda_events_updated_at ON public.agenda_events;
CREATE TRIGGER trg_agenda_events_updated_at
    BEFORE UPDATE ON public.agenda_events
    FOR EACH ROW EXECUTE FUNCTION public.update_agenda_events_updated_at();

ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agenda_events_all" ON public.agenda_events;
CREATE POLICY "agenda_events_all" ON public.agenda_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── AGENDAMENTOS (Calendly/Google Calendar) ─────────────────
CREATE TABLE IF NOT EXISTS public.agendamentos (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source                  TEXT NOT NULL DEFAULT 'calendly',
    google_event_id         TEXT UNIQUE,
    google_calendar_id      TEXT,
    calendly_event_uri      TEXT,
    summary                 TEXT NOT NULL,
    description             TEXT,
    start_at                TIMESTAMPTZ NOT NULL,
    end_at                  TIMESTAMPTZ,
    timezone                TEXT DEFAULT 'America/Sao_Paulo',
    location                TEXT,
    meeting_url             TEXT,
    invitee_name            TEXT,
    invitee_email           TEXT,
    invitee_phone           TEXT,
    status                  TEXT NOT NULL DEFAULT 'agendado',
    cancelled_at            TIMESTAMPTZ,
    cancel_reason           TEXT,
    notes                   TEXT,
    tags                    JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- FK cortada: lead_id (crm_leads vem na Fase 8)
    lead_id                 UUID,
    responsible_member_id   UUID REFERENCES public.tactical_members(id) ON DELETE SET NULL,
    linked_leilao_id        UUID REFERENCES public.cronograma_leiloes(id) ON DELETE SET NULL,
    linked_task_id          UUID REFERENCES public.tactical_tasks(id)   ON DELETE SET NULL,
    raw_payload             JSONB,
    last_synced_at          TIMESTAMPTZ,
    created_by              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT agendamentos_source_chk CHECK (source IN ('calendly','google','manual')),
    CONSTRAINT agendamentos_status_chk CHECK (status IN ('agendado','confirmado','concluido','cancelado','nao_compareceu'))
);

CREATE INDEX IF NOT EXISTS agendamentos_start_idx       ON public.agendamentos (start_at);
CREATE INDEX IF NOT EXISTS agendamentos_status_idx      ON public.agendamentos (status);
CREATE INDEX IF NOT EXISTS agendamentos_lead_idx        ON public.agendamentos (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agendamentos_invitee_email_idx ON public.agendamentos (invitee_email) WHERE invitee_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS agendamentos_invitee_phone_idx ON public.agendamentos (invitee_phone) WHERE invitee_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS agendamentos_source_idx      ON public.agendamentos (source);

DROP TRIGGER IF EXISTS trg_agendamentos_updated_at ON public.agendamentos;
CREATE TRIGGER trg_agendamentos_updated_at
    BEFORE UPDATE ON public.agendamentos
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agendamentos_all" ON public.agendamentos;
CREATE POLICY "agendamentos_all" ON public.agendamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Seed de configuração (vazia — o operador deve preencher na UI) ──
-- A configuração do Calendly/Google Calendar do fórmula não é
-- aplicável ao web-bula. Inserimos só a estrutura padrão para
-- que a UI de /sistema/agendamentos/settings tenha o que ler.
INSERT INTO public.site_settings (key, value)
VALUES (
    'agendamentos_calendar',
    jsonb_build_object(
        'google_calendar_id', '',
        'calendly_event_url', '',
        'default_responsible_member_id', NULL,
        'auto_link_lead_by_email', true,
        'auto_link_lead_by_phone', true,
        'sync_window_past_days', 7,
        'sync_window_future_days', 90
    )
)
ON CONFLICT (key) DO NOTHING;
