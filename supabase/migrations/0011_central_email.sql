-- ============================================================
-- 0011_central_email.sql — Fase 7 (Central de E-mail)
-- Cópia direta de database/central_email_marketing.sql do fórmula
-- com FKs a crm_leads cortadas (UUID nullable sem REFERENCES).
-- A Fase 8 (CRM) pode religar as FKs retroativamente se necessário.
-- ============================================================

-- ============================================================================
-- Central de E-mail Marketing — Camada de automação por e-mail sobre o CRM
-- ============================================================================
-- Data: 2026-05-19
--
-- Espelha a arquitetura de campanhas WhatsApp (whatsapp_campaigns/_steps/
-- _recipients/_templates) pra suportar campanhas por e-mail usando o SMTP
-- já configurado (Hostinger via src/lib/email.ts).
--
-- Por que tabelas separadas (não generalizar com `channel`):
--   - E-mail tem `subject`, `html`, `unsubscribe_token` — campos irrelevantes
--     em WhatsApp.
--   - WhatsApp tem `media_*`, `poll_*`, `optout_whatsapp`, callback do VPS
--     — irrelevantes em e-mail.
--   - Schemas separados evitam coluna nullable demais e migrations conflitantes.
--
-- O CRM (crm_leads.email) continua sendo a fonte de verdade dos contatos —
-- não criamos contatos paralelos.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1) crm_leads — flags de e-mail (opt-out, último contato)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.crm_leads
    -- Opt-out de e-mail (independente do WhatsApp): lead clicou "descadastrar"
    ADD COLUMN IF NOT EXISTS optout_email BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS optout_email_at TIMESTAMPTZ,

    -- Última interação por e-mail (envio bem-sucedido)
    ADD COLUMN IF NOT EXISTS last_email_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_leads_optout_email
    ON public.crm_leads (optout_email)
    WHERE optout_email = true;

CREATE INDEX IF NOT EXISTS idx_crm_leads_email_active
    ON public.crm_leads (email)
    WHERE email IS NOT NULL AND email <> '' AND optout_email = false;

COMMENT ON COLUMN public.crm_leads.optout_email IS
    'Quando true, nenhum envio por e-mail (campanha ou template) é disparado pra este lead.';
COMMENT ON COLUMN public.crm_leads.last_email_at IS
    'Timestamp do último e-mail bem-sucedido (campaign ou manual).';


-- ────────────────────────────────────────────────────────────────────────────
-- 2) email_templates — biblioteca de templates HTML reutilizáveis
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_templates (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,             -- chave estável (ex: 'welcome-email')
    title       TEXT NOT NULL,                    -- nome humano
    category    TEXT NOT NULL DEFAULT 'geral',    -- welcome | newsletter | leilao | follow_up | reativacao | aviso | geral
    subject     TEXT NOT NULL,                    -- assunto (suporta {nome}, {empresa}, etc)
    body_html   TEXT NOT NULL,                    -- corpo HTML (suporta {nome} + {{UNSUBSCRIBE_URL}})
    body_text   TEXT,                             -- versão plain-text (gerada do html se vazio)
    variables   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- array informativo de variáveis
    archived    BOOLEAN NOT NULL DEFAULT false,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_templates_full_access" ON public.email_templates;
CREATE POLICY "email_templates_full_access"
    ON public.email_templates FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_email_templates_category
    ON public.email_templates (category) WHERE archived = false;


-- ────────────────────────────────────────────────────────────────────────────
-- 3) email_campaigns — campanhas segmentadas
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_campaigns (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    -- Filtros aplicados a crm_leads pra montar o público
    segment         JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Conteúdo do passo 0: pode referenciar template OU trazer subject+body próprios
    template_id     UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
    subject         TEXT,
    body_html       TEXT,
    body_text       TEXT,
    -- Remetente customizável (default = SMTP_FROM env). "Nome <email@dominio>"
    from_name       TEXT,
    reply_to        TEXT,
    status          TEXT NOT NULL DEFAULT 'rascunho',  -- rascunho | enviando | concluida | cancelada | erro
    total_recipients   INTEGER NOT NULL DEFAULT 0,
    sent_count         INTEGER NOT NULL DEFAULT 0,
    failed_count       INTEGER NOT NULL DEFAULT 0,
    optout_skip_count  INTEGER NOT NULL DEFAULT 0,
    -- Regras de parada da sequência (default conservador)
    stop_on_optout     BOOLEAN NOT NULL DEFAULT true,
    -- "interesse adquirido": engine WhatsApp setou interesse_principal — sinal
    -- de qualificação, vale parar follow-up de e-mail também
    stop_on_interest   BOOLEAN NOT NULL DEFAULT false,
    -- Reação: aplicar tag no lead (em tags_whatsapp) ao iniciar campanha
    audience_tag       TEXT,
    started_at         TIMESTAMPTZ,
    finished_at        TIMESTAMPTZ,
    created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at         TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    CHECK (status IN ('rascunho','enviando','concluida','cancelada','erro'))
);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_campaigns_full_access" ON public.email_campaigns;
CREATE POLICY "email_campaigns_full_access"
    ON public.email_campaigns FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status
    ON public.email_campaigns (status);


-- ────────────────────────────────────────────────────────────────────────────
-- 4) email_campaign_steps — sequência multi-step (follow-up)
-- ────────────────────────────────────────────────────────────────────────────
-- O passo 0 vive em email_campaigns. Passos 1, 2, 3... aqui — cada um com
-- delay relativo ao passo anterior. Idêntico ao modelo do WhatsApp.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_campaign_steps (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id     UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
    step_order      INTEGER NOT NULL,           -- 1, 2, 3, ...
    delay_value     INTEGER NOT NULL DEFAULT 1,
    delay_unit      TEXT NOT NULL DEFAULT 'days',  -- minutes | hours | days
    -- Conteúdo: template OU subject+body próprios
    template_id     UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
    subject         TEXT,
    body_html       TEXT,
    body_text       TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    UNIQUE (campaign_id, step_order),
    CHECK (step_order >= 1),
    CHECK (delay_value >= 0),
    CHECK (delay_unit IN ('minutes', 'hours', 'days'))
);

ALTER TABLE public.email_campaign_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_campaign_steps_full_access" ON public.email_campaign_steps;
CREATE POLICY "email_campaign_steps_full_access"
    ON public.email_campaign_steps FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_email_campaign_steps_campaign
    ON public.email_campaign_steps (campaign_id, step_order);


-- ────────────────────────────────────────────────────────────────────────────
-- 5) email_campaign_recipients — destinatários + estado da sequência
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id     UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
    lead_id         UUID,
    email           TEXT NOT NULL,                -- snapshot do e-mail no momento do disparo
    name            TEXT,
    status          TEXT NOT NULL DEFAULT 'pendente',  -- pendente | enviado | falhou | optout
    error_msg       TEXT,
    sent_at         TIMESTAMPTZ,
    -- Sequência: idêntico ao WhatsApp
    current_step    INTEGER NOT NULL DEFAULT 0,
    next_send_at    TIMESTAMPTZ,
    stopped_at      TIMESTAMPTZ,
    stopped_reason  TEXT,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    CHECK (stopped_reason IS NULL OR stopped_reason IN
        ('optout', 'interest', 'completed', 'cancelled', 'error', 'bounce'))
);

ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_campaign_recipients_full_access" ON public.email_campaign_recipients;
CREATE POLICY "email_campaign_recipients_full_access"
    ON public.email_campaign_recipients FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_email_recipients_campaign
    ON public.email_campaign_recipients (campaign_id);

CREATE INDEX IF NOT EXISTS idx_email_recipients_status
    ON public.email_campaign_recipients (status);

CREATE INDEX IF NOT EXISTS idx_email_recipients_next_send
    ON public.email_campaign_recipients (next_send_at)
    WHERE next_send_at IS NOT NULL AND stopped_at IS NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- 6) email_optouts — cache rápido por endereço (sem precisar de lead_id)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_optouts (
    email       TEXT PRIMARY KEY,                 -- lowercased
    reason      TEXT,
    lead_id     UUID,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.email_optouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_optouts_full_access" ON public.email_optouts;
CREATE POLICY "email_optouts_full_access"
    ON public.email_optouts FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');


-- ────────────────────────────────────────────────────────────────────────────
-- 7) email_messages — log conversacional de envios (auditoria)
-- ────────────────────────────────────────────────────────────────────────────
-- Espelha whatsapp_messages: registra TODO envio (campanha, template manual
-- ou transacional) pra ter histórico por lead.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_messages (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id         UUID,
    email           TEXT NOT NULL,                -- lowercased
    direction       TEXT NOT NULL DEFAULT 'outbound',
    subject         TEXT,
    body_html       TEXT,
    body_text       TEXT,
    status          TEXT NOT NULL DEFAULT 'sent',  -- queued | sent | failed
    error_msg       TEXT,
    origin          TEXT,                          -- campanha | template | manual | sistema
    campaign_id     UUID REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
    template_id     UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
    recipient_id    UUID REFERENCES public.email_campaign_recipients(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    CHECK (direction IN ('outbound','inbound')),
    CHECK (status IN ('queued','sent','failed'))
);

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_messages_full_access" ON public.email_messages;
CREATE POLICY "email_messages_full_access"
    ON public.email_messages FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_email_messages_lead
    ON public.email_messages (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_messages_email
    ON public.email_messages (email);
CREATE INDEX IF NOT EXISTS idx_email_messages_campaign
    ON public.email_messages (campaign_id) WHERE campaign_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- 8) Triggers updated_at
-- ────────────────────────────────────────────────────────────────────────────
-- A função touch_updated_at() já existe (criada na migration da Central
-- WhatsApp). Reaproveitamos.
DROP TRIGGER IF EXISTS trg_email_templates_updated ON public.email_templates;
CREATE TRIGGER trg_email_templates_updated
    BEFORE UPDATE ON public.email_templates
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_email_campaigns_updated ON public.email_campaigns;
CREATE TRIGGER trg_email_campaigns_updated
    BEFORE UPDATE ON public.email_campaigns
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_email_campaign_steps_updated ON public.email_campaign_steps;
CREATE TRIGGER trg_email_campaign_steps_updated
    BEFORE UPDATE ON public.email_campaign_steps
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- 9) Seed inicial — templates HTML padrão (voz Matheus, 1ª pessoa)
-- ────────────────────────────────────────────────────────────────────────────
-- Marcador {{UNSUBSCRIBE_URL}} é trocado pelo link assinado por destinatário
-- no momento do envio (src/lib/email-marketing.ts).
INSERT INTO public.email_templates (slug, title, category, subject, body_html, variables) VALUES
    (
        'welcome-email-default',
        'Boas-vindas (e-mail padrão)',
        'welcome',
        'Bem-vindo à Fórmula do Boi, {nome}',
        E'<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#0f0f0f;">\n  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">\n    <tr><td align="center">\n      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5;">\n        <tr><td style="background:#0a0a0a;padding:24px 32px;color:#ffffff;">\n          <div style="font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Fórmula do Boi</div>\n          <div style="font-size:12px;color:#A0792E;margin-top:4px;">Genética Nelore P.O.</div>\n        </td></tr>\n        <tr><td style="padding:32px;">\n          <p style="margin:0 0 16px 0;font-size:15px;">Olá {nome},</p>\n          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">\n            Aqui é o Matheus, da <strong>Fórmula do Boi</strong>. Recebi seu cadastro e quero deixar tudo organizado pra te atender direito.\n          </p>\n          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">Trabalhamos em três frentes:</p>\n          <ul style="margin:0 0 20px 24px;font-size:15px;line-height:1.7;">\n            <li>Aceleradora de Touros (sêmen, embriões, doadoras)</li>\n            <li>Central de Embriões e FIV</li>\n            <li>Assessoria em Leilões Nelore PO</li>\n          </ul>\n          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;">\n            Em breve te chamo no WhatsApp pra entender o que faz sentido pro seu rebanho. Se já souber o que quer ver primeiro, me responde por aqui mesmo.\n          </p>\n          <p style="margin:24px 0 8px 0;font-size:14px;color:#666;">Abraço,</p>\n          <p style="margin:0;font-size:14px;color:#0f0f0f;font-weight:600;">Matheus · Fórmula do Boi</p>\n        </td></tr>\n        <tr><td style="background:#fafafa;padding:16px 32px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">\n          © Fórmula do Boi · contato@formuladoboi.com<br>\n          <a href="{{UNSUBSCRIBE_URL}}" style="color:#999;text-decoration:underline;">Descadastrar destes e-mails</a>\n        </td></tr>\n      </table>\n    </td></tr>\n  </table>\n</body></html>',
        '["nome"]'::jsonb
    ),
    (
        'newsletter-base',
        'Newsletter (base)',
        'newsletter',
        'Novidades da Fórmula do Boi',
        E'<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#0f0f0f;">\n  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">\n    <tr><td align="center">\n      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5;">\n        <tr><td style="background:#0a0a0a;padding:24px 32px;color:#ffffff;">\n          <div style="font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Fórmula do Boi</div>\n          <div style="font-size:12px;color:#A0792E;margin-top:4px;">Newsletter</div>\n        </td></tr>\n        <tr><td style="padding:32px;">\n          <p style="margin:0 0 16px 0;font-size:15px;">Olá {nome},</p>\n          <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">\n            [Escreva aqui o conteúdo da newsletter. Use parágrafos curtos, 1 ideia por bloco.]\n          </p>\n          <p style="margin:24px 0 0 0;font-size:14px;color:#666;">Abraço,<br>Matheus · Fórmula do Boi</p>\n        </td></tr>\n        <tr><td style="background:#fafafa;padding:16px 32px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">\n          © Fórmula do Boi · contato@formuladoboi.com<br>\n          <a href="{{UNSUBSCRIBE_URL}}" style="color:#999;text-decoration:underline;">Descadastrar destes e-mails</a>\n        </td></tr>\n      </table>\n    </td></tr>\n  </table>\n</body></html>',
        '["nome"]'::jsonb
    ),
    (
        'aviso-leilao-email',
        'Aviso de leilão (e-mail)',
        'leilao',
        '🔨 {leilao_nome} — {leilao_data}',
        E'<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#0f0f0f;">\n  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">\n    <tr><td align="center">\n      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5;">\n        <tr><td style="background:#0a0a0a;padding:24px 32px;color:#ffffff;">\n          <div style="font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Fórmula do Boi</div>\n          <div style="font-size:12px;color:#A0792E;margin-top:4px;">Próximo Leilão</div>\n        </td></tr>\n        <tr><td style="padding:32px;">\n          <p style="margin:0 0 16px 0;font-size:15px;">Olá {nome},</p>\n          <p style="margin:0 0 16px 0;font-size:17px;line-height:1.5;font-weight:600;">\n            {leilao_nome} — {leilao_data}\n          </p>\n          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;">\n            Tô passando pra avisar do próximo leilão que acompanhamos. Catálogo e detalhes no link abaixo.\n          </p>\n          <div style="text-align:center;margin:28px 0;">\n            <a href="{leilao_link}" style="display:inline-block;background:#A0792E;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;">\n              Ver catálogo\n            </a>\n          </div>\n          <p style="margin:24px 0 0 0;font-size:14px;color:#666;">Abraço,<br>Matheus · Fórmula do Boi</p>\n        </td></tr>\n        <tr><td style="background:#fafafa;padding:16px 32px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">\n          © Fórmula do Boi · contato@formuladoboi.com<br>\n          <a href="{{UNSUBSCRIBE_URL}}" style="color:#999;text-decoration:underline;">Descadastrar destes e-mails</a>\n        </td></tr>\n      </table>\n    </td></tr>\n  </table>\n</body></html>',
        '["nome","leilao_nome","leilao_data","leilao_link"]'::jsonb
    )
ON CONFLICT (slug) DO NOTHING;
