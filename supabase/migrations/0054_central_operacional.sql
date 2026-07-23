-- ============================================================
-- 0054_central_operacional.sql — Radar / Central Operacional
--
-- Converte sinais recebidos nas conversas profissionais do WhatsApp em:
--   • itens de triagem (pedido, decisão, mídia, documento, prazo...)
--   • planos de ação revisáveis e versionados
--   • aprovações e execução auditável
--   • diário operacional ligado à evidência original
--
-- A captura nasce em allowlist: somente as 27 conversas aprovadas pelo João.
-- Uma fonte pode pertencer a várias áreas (ex.: Financeiro + Cobranças).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.operational_sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label           TEXT NOT NULL UNIQUE,
    source_kind     TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (source_kind IN ('contact','group','unknown')),
    inbox_id        TEXT NOT NULL DEFAULT 'joao',
    phone           TEXT,
    whatsapp_jid    TEXT,
    areas           TEXT[] NOT NULL DEFAULT '{}',
    aliases         TEXT[] NOT NULL DEFAULT '{}',
    active          BOOLEAN NOT NULL DEFAULT true,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS operational_sources_inbox_phone_uidx
    ON public.operational_sources (inbox_id, phone)
    WHERE phone IS NOT NULL AND phone <> '';
CREATE UNIQUE INDEX IF NOT EXISTS operational_sources_inbox_jid_uidx
    ON public.operational_sources (inbox_id, whatsapp_jid)
    WHERE whatsapp_jid IS NOT NULL AND whatsapp_jid <> '';
CREATE INDEX IF NOT EXISTS operational_sources_areas_idx
    ON public.operational_sources USING GIN (areas);

COMMENT ON TABLE public.operational_sources IS
    'Allowlist da Central Operacional. Fora destas fontes o Radar ignora a conversa.';

CREATE TABLE IF NOT EXISTS public.operational_items (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_key          TEXT NOT NULL UNIQUE,
    source_id             UUID REFERENCES public.operational_sources(id) ON DELETE SET NULL,
    source_label          TEXT NOT NULL,
    source_chat_jid       TEXT,
    source_sender_jid     TEXT,
    source_sender_name    TEXT,
    inbox_id              TEXT NOT NULL DEFAULT 'joao',
    external_message_id   TEXT,
    whatsapp_message_id   UUID REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
    direction             TEXT NOT NULL DEFAULT 'inbound'
                          CHECK (direction IN ('inbound','outbound')),
    occurred_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    body                  TEXT NOT NULL DEFAULT '',
    quoted_body           TEXT,
    media_bucket          TEXT,
    media_path            TEXT,
    media_type            TEXT,
    media_mime            TEXT,
    media_filename        TEXT,
    media_size            BIGINT,
    kind                  TEXT NOT NULL DEFAULT 'informacao'
                          CHECK (kind IN (
                              'solicitacao','decisao','prazo','tarefa','catalogo','lance',
                              'comprovante','documento','midia_marketing','risco','informacao'
                          )),
    areas                 TEXT[] NOT NULL DEFAULT '{}',
    title                 TEXT NOT NULL,
    summary               TEXT NOT NULL DEFAULT '',
    confidence            NUMERIC(4,3) NOT NULL DEFAULT 0.500
                          CHECK (confidence >= 0 AND confidence <= 1),
    priority              TEXT NOT NULL DEFAULT 'normal'
                          CHECK (priority IN ('baixa','normal','alta','urgente')),
    state                 TEXT NOT NULL DEFAULT 'pending'
                          CHECK (state IN ('pending','planned','routed','archived','error')),
    needs_review          BOOLEAN NOT NULL DEFAULT true,
    classification_reason TEXT,
    metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
    reviewed_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operational_items_state_created_idx
    ON public.operational_items (state, created_at DESC);
CREATE INDEX IF NOT EXISTS operational_items_source_idx
    ON public.operational_items (source_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS operational_items_areas_idx
    ON public.operational_items USING GIN (areas);
CREATE INDEX IF NOT EXISTS operational_items_kind_idx
    ON public.operational_items (kind, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.operational_plans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id             UUID REFERENCES public.operational_items(id) ON DELETE SET NULL,
    title               TEXT NOT NULL,
    objective           TEXT NOT NULL,
    requester           TEXT,
    requester_source_id UUID REFERENCES public.operational_sources(id) ON DELETE SET NULL,
    areas               TEXT[] NOT NULL DEFAULT '{}',
    status              TEXT NOT NULL DEFAULT 'awaiting_approval'
                        CHECK (status IN (
                            'draft','awaiting_approval','approved','executing','waiting',
                            'awaiting_step_approval','completed','rejected','cancelled','failed','paused'
                        )),
    priority            TEXT NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('baixa','normal','alta','urgente')),
    due_at              TIMESTAMPTZ,
    expected_outcome    TEXT,
    context             TEXT,
    risk_level          TEXT NOT NULL DEFAULT 'low'
                        CHECK (risk_level IN ('low','medium','high')),
    approval_scope      JSONB NOT NULL DEFAULT '{}'::jsonb,
    version             INTEGER NOT NULL DEFAULT 1,
    proposed_by         TEXT NOT NULL DEFAULT 'system',
    approved_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at         TIMESTAMPTZ,
    rejected_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    rejected_at         TIMESTAMPTZ,
    execution_summary   TEXT,
    last_error          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operational_plans_status_created_idx
    ON public.operational_plans (status, created_at DESC);
CREATE INDEX IF NOT EXISTS operational_plans_item_idx
    ON public.operational_plans (item_id);
CREATE INDEX IF NOT EXISTS operational_plans_areas_idx
    ON public.operational_plans USING GIN (areas);

CREATE TABLE IF NOT EXISTS public.operational_plan_steps (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id           UUID NOT NULL REFERENCES public.operational_plans(id) ON DELETE CASCADE,
    position          INTEGER NOT NULL DEFAULT 1000,
    action_type       TEXT NOT NULL
                      CHECK (action_type IN (
                          'research','draft_message','send_whatsapp','wait_reply','create_task',
                          'update_record','financial_action','manual','notify_requester'
                      )),
    title             TEXT NOT NULL,
    description       TEXT,
    status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                          'pending','approved','executing','waiting','completed',
                          'skipped','failed','awaiting_approval'
                      )),
    requires_approval BOOLEAN NOT NULL DEFAULT true,
    separate_approval BOOLEAN NOT NULL DEFAULT false,
    target_source_id  UUID REFERENCES public.operational_sources(id) ON DELETE SET NULL,
    target_label      TEXT,
    target_phone      TEXT,
    draft_body        TEXT,
    approved_body     TEXT,
    action_payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
    result            JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message     TEXT,
    not_before        TIMESTAMPTZ,
    executed_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, position)
);

CREATE INDEX IF NOT EXISTS operational_plan_steps_plan_idx
    ON public.operational_plan_steps (plan_id, position);
CREATE INDEX IF NOT EXISTS operational_plan_steps_waiting_phone_idx
    ON public.operational_plan_steps (target_phone)
    WHERE status = 'waiting' AND target_phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.operational_approvals (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id     UUID NOT NULL REFERENCES public.operational_plans(id) ON DELETE CASCADE,
    step_id     UUID REFERENCES public.operational_plan_steps(id) ON DELETE SET NULL,
    decision    TEXT NOT NULL CHECK (decision IN ('approve','edit','reject','pause','resume','cancel')),
    actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    scope       JSONB NOT NULL DEFAULT '{}'::jsonb,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operational_approvals_plan_idx
    ON public.operational_approvals (plan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.operational_diary_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id         UUID REFERENCES public.operational_items(id) ON DELETE SET NULL,
    plan_id         UUID REFERENCES public.operational_plans(id) ON DELETE SET NULL,
    kind            TEXT NOT NULL DEFAULT 'registro',
    areas           TEXT[] NOT NULL DEFAULT '{}',
    title           TEXT NOT NULL,
    summary         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'captured'
                    CHECK (status IN ('captured','confirmed','completed','superseded','cancelled')),
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operational_diary_occurred_idx
    ON public.operational_diary_entries (occurred_at DESC);
CREATE INDEX IF NOT EXISTS operational_diary_areas_idx
    ON public.operational_diary_entries USING GIN (areas);

CREATE TABLE IF NOT EXISTS public.operational_execution_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id     UUID NOT NULL REFERENCES public.operational_plans(id) ON DELETE CASCADE,
    step_id     UUID REFERENCES public.operational_plan_steps(id) ON DELETE SET NULL,
    event_type  TEXT NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operational_execution_events_plan_idx
    ON public.operational_execution_events (plan_id, created_at DESC);

-- Controles de segurança do número pessoal. O envio nasce desligado e só pode
-- ser habilitado por um usuário autenticado na Central Operacional.
CREATE TABLE IF NOT EXISTS public.operational_controls (
    id                  TEXT PRIMARY KEY,
    outbound_enabled    BOOLEAN NOT NULL DEFAULT false,
    daily_limit         INTEGER NOT NULL DEFAULT 5 CHECK (daily_limit BETWEEN 0 AND 5),
    paused_reason       TEXT,
    updated_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.operational_controls (id, outbound_enabled, daily_limit)
VALUES ('joao', false, 5)
ON CONFLICT (id) DO NOTHING;

-- Uma linha por tentativa aprovada. O UNIQUE por etapa impede reenvio após
-- timeout/crash: diante de entrega incerta o sistema para para revisão humana.
CREATE TABLE IF NOT EXISTS public.operational_send_attempts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id          UUID NOT NULL REFERENCES public.operational_plans(id) ON DELETE CASCADE,
    step_id          UUID NOT NULL UNIQUE REFERENCES public.operational_plan_steps(id) ON DELETE CASCADE,
    inbox_id         TEXT NOT NULL DEFAULT 'joao',
    recipient_phone  TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'claimed'
                     CHECK (status IN ('claimed','sent','failed','blocked','delivery_uncertain')),
    transport_status TEXT,
    message_id       TEXT,
    error_message    TEXT,
    claimed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operational_send_attempts_daily_idx
    ON public.operational_send_attempts (inbox_id, claimed_at DESC);

-- Reserva atômica de um único envio. Além do limite diário, confirma novamente
-- que plano, etapa, aprovação individual e destinatário da allowlist continuam
-- válidos no exato instante anterior ao envio.
CREATE OR REPLACE FUNCTION public.claim_operational_send(
    p_plan_id UUID,
    p_step_id UUID,
    p_recipient_phone TEXT,
    p_inbox_id TEXT DEFAULT 'joao'
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing TEXT;
    v_enabled BOOLEAN;
    v_limit INTEGER;
    v_used INTEGER;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('operational-send:' || p_inbox_id));

    SELECT status INTO v_existing
      FROM public.operational_send_attempts
     WHERE step_id = p_step_id;
    IF FOUND THEN
        RETURN 'already_' || v_existing;
    END IF;

    SELECT outbound_enabled, daily_limit INTO v_enabled, v_limit
      FROM public.operational_controls
     WHERE id = p_inbox_id;
    IF NOT FOUND OR NOT v_enabled THEN
        RETURN 'outbound_disabled';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.operational_plan_steps s
          JOIN public.operational_plans p ON p.id = s.plan_id
          JOIN public.operational_sources src ON src.id = s.target_source_id
         WHERE s.id = p_step_id
           AND s.plan_id = p_plan_id
           AND s.action_type IN ('send_whatsapp','notify_requester')
           AND s.separate_approval = true
           AND s.status = 'approved'
           AND p.status IN ('approved','executing')
           AND src.active = true
           AND regexp_replace(COALESCE(src.phone, ''), '[^0-9]', '', 'g') =
               regexp_replace(COALESCE(p_recipient_phone, ''), '[^0-9]', '', 'g')
    ) THEN
        RETURN 'approval_or_allowlist_invalid';
    END IF;

    -- Três falhas recentes acionam o kill switch até revisão manual.
    IF (SELECT COUNT(*) FROM public.operational_send_attempts
         WHERE inbox_id = p_inbox_id AND status IN ('failed','delivery_uncertain')
           AND claimed_at >= NOW() - INTERVAL '1 hour') >= 3 THEN
        UPDATE public.operational_controls
           SET outbound_enabled = false,
               paused_reason = 'Três falhas de envio na última hora.',
               updated_at = NOW()
         WHERE id = p_inbox_id;
        RETURN 'failure_kill_switch';
    END IF;

    SELECT COUNT(*) INTO v_used
      FROM public.operational_send_attempts
     WHERE inbox_id = p_inbox_id
       AND status IN ('claimed','sent','delivery_uncertain')
       AND (claimed_at AT TIME ZONE 'America/Sao_Paulo')::date =
           (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;
    IF v_used >= v_limit THEN
        RETURN 'daily_limit_reached';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.operational_send_attempts
         WHERE inbox_id = p_inbox_id AND status = 'claimed'
           AND claimed_at >= NOW() - INTERVAL '10 minutes'
    ) THEN
        RETURN 'another_send_in_progress';
    END IF;

    INSERT INTO public.operational_send_attempts
        (plan_id, step_id, inbox_id, recipient_phone, status)
    VALUES
        (p_plan_id, p_step_id, p_inbox_id, regexp_replace(p_recipient_phone, '[^0-9]', '', 'g'), 'claimed');
    RETURN 'claimed';
END;
$$;

-- RLS: leitura/escrita pela equipe autenticada; webhooks usam service_role.
ALTER TABLE public.operational_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_plan_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_diary_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_execution_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_send_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operational_sources_team_all ON public.operational_sources;
CREATE POLICY operational_sources_team_all ON public.operational_sources FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS operational_items_team_all ON public.operational_items;
CREATE POLICY operational_items_team_all ON public.operational_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS operational_plans_team_all ON public.operational_plans;
CREATE POLICY operational_plans_team_all ON public.operational_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS operational_plan_steps_team_all ON public.operational_plan_steps;
CREATE POLICY operational_plan_steps_team_all ON public.operational_plan_steps FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS operational_approvals_team_all ON public.operational_approvals;
CREATE POLICY operational_approvals_team_all ON public.operational_approvals FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS operational_diary_team_all ON public.operational_diary_entries;
CREATE POLICY operational_diary_team_all ON public.operational_diary_entries FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS operational_execution_events_team_all ON public.operational_execution_events;
CREATE POLICY operational_execution_events_team_all ON public.operational_execution_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS operational_controls_team_all ON public.operational_controls;
CREATE POLICY operational_controls_team_all ON public.operational_controls FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS operational_send_attempts_team_all ON public.operational_send_attempts;
CREATE POLICY operational_send_attempts_team_all ON public.operational_send_attempts FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON FUNCTION public.claim_operational_send(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_operational_send(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

-- Allowlist aprovada em 22/07/2026. ON CONFLICT preserva IDs já resolvidos.
INSERT INTO public.operational_sources (label, source_kind, areas, phone)
VALUES
    ('Marcelo Primo Carneiro', 'contact', ARRAY['cadastros','comercial','marketing','financeiro','cobrancas'], NULL),
    ('Cadastros Bula e Programa', 'group', ARRAY['cadastros'], NULL),
    ('Cadastros Bula Remates', 'group', ARRAY['cadastros'], NULL),
    ('Notificações, Automações e fluxo CRM', 'group', ARRAY['cadastros'], NULL),
    ('+55 43 9178-5868', 'contact', ARRAY['cadastros'], '554391785868'),
    ('+55 43 8816-4135', 'contact', ARRAY['cadastros'], '554388164135'),
    ('Academia do Nelore P.O', 'group', ARRAY['comercial'], NULL),
    ('#2 Academia do Nelore PO', 'group', ARRAY['comercial'], NULL),
    ('Bula Assessoria l Assessores', 'group', ARRAY['comercial'], NULL),
    ('Lances Bula Assessoria', 'group', ARRAY['comercial'], NULL),
    ('+55 67 9975-1008', 'contact', ARRAY['comercial','marketing'], '556799751008'),
    ('Marketing Bula / Fórmula', 'group', ARRAY['marketing'], NULL),
    ('João Gabriel dos Santos', 'contact', ARRAY['marketing'], NULL),
    ('João Antônio Bula Assessoria', 'contact', ARRAY['marketing'], NULL),
    ('Bula - Ana Paula', 'contact', ARRAY['financeiro','cobrancas'], NULL),
    ('+55 67 9991-5326', 'contact', ARRAY['financeiro'], '556799915326'),
    ('Fabio Omena - Bula Assessoria', 'contact', ARRAY['financeiro'], NULL),
    ('Felipe Andrade', 'contact', ARRAY['financeiro','cobrancas'], NULL),
    ('Financeiro Bula Assessoria', 'group', ARRAY['financeiro','cobrancas'], NULL),
    ('Leonardo', 'contact', ARRAY['financeiro'], NULL),
    ('Douglas Bispo', 'contact', ARRAY['financeiro'], NULL),
    ('+55 34 9818-6989', 'contact', ARRAY['cobrancas'], '553498186989'),
    ('+55 31 9237-1779', 'contact', ARRAY['cobrancas'], '553192371779'),
    ('+55 65 9994-6545', 'contact', ARRAY['cobrancas'], '556599946545'),
    ('+55 38 9739-9622', 'contact', ARRAY['cobrancas'], '553897399622'),
    ('+55 82 8822-2020', 'contact', ARRAY['cobrancas'], '558288222020'),
    ('+55 34 9972-2425', 'contact', ARRAY['cobrancas'], '553499722425')
ON CONFLICT (label) DO UPDATE SET
    source_kind = EXCLUDED.source_kind,
    areas = EXCLUDED.areas,
    phone = COALESCE(public.operational_sources.phone, EXCLUDED.phone),
    active = true,
    updated_at = NOW();
