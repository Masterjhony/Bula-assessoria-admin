-- ============================================================
-- 0010_whatsapp.sql — Schema WhatsApp + Catálogos (Fase 6)
-- Consolidação de 10 migrations do fórmula (ordem corrigida:
-- central_whatsapp_06_mai_2026 ANTES das migrations que ALTERam
-- whatsapp_templates / whatsapp_campaigns).
--
-- IMPORTANTE: este schema CRIA as tabelas e bucket, mas o servidor
-- Baileys NÃO está conectado. As rotas API ficam como stubs: aceitam
-- requests, mas operações que precisam do VPS (envio de mensagem,
-- pareamento de sessão, sync de catálogos) retornam 503. O usuário
-- montará o servidor próprio depois.
--
-- Adaptações para web-bula:
-- - FKs para crm_leads (Fase 8) viraram UUID nullable sem REFERENCES;
--   serão religadas quando o CRM chegar.
-- ============================================================

-- Patch global: garantir coluna description em site_settings
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS description TEXT;

-- Patch global: criar crm_leads esqueleto para que as migrations
-- WhatsApp consigam fazer ALTER TABLE crm_leads ADD COLUMN. A Fase 8
-- vai expandir esta tabela com as colunas restantes do CRM.
CREATE TABLE IF NOT EXISTS public.crm_leads (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome        TEXT,
    telefone    TEXT,
    email       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_leads_all" ON public.crm_leads;
CREATE POLICY "crm_leads_all" ON public.crm_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Origem: database/create_whatsapp_messages_table.sql ──
-- Tabela de log de mensagens enviadas pelo WhatsApp
-- Execute no Supabase Studio: https://supabase.com/dashboard/project/hghtikjaqixglmpujbwj/sql

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    phone       TEXT,                              -- null se lead sem telefone
    name        TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'sent', -- 'sent' | 'failed' | 'not_on_whatsapp' | 'no_phone'
    reason      TEXT,                              -- motivo de falha (ex: 'not_on_whatsapp')
    error_msg   TEXT,                              -- mensagem de erro técnico
    lead_id     UUID,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role and authenticated full access"
    ON public.whatsapp_messages FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE INDEX whatsapp_messages_created_at_idx ON public.whatsapp_messages (created_at DESC);
CREATE INDEX whatsapp_messages_phone_idx      ON public.whatsapp_messages (phone);
CREATE INDEX whatsapp_messages_lead_id_idx    ON public.whatsapp_messages (lead_id);


-- ── Origem: database/whatsapp_auth_table.sql ──
-- Create whatsapp_auth table to store Baileys session data
CREATE TABLE public.whatsapp_auth (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Turn on Row Level Security
ALTER TABLE public.whatsapp_auth ENABLE ROW LEVEL SECURITY;

-- Allow full access to authenticated users (admin panel) and service role
CREATE POLICY "Allow full access to whatsapp_auth" ON public.whatsapp_auth
    FOR ALL
    USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Create an index to make finding records faster
CREATE INDEX whatsapp_auth_id_idx ON public.whatsapp_auth (id);


-- ── Origem: database/central_whatsapp_06_mai_2026.sql ──
-- ============================================================================
-- Central WhatsApp — Camada de automação comercial sobre o CRM existente
-- ============================================================================
-- Data: 2026-05-06
--
-- Este script:
--   1. Estende crm_leads com flags da Central (opt-in, opt-out, handoff humano,
--      interesse identificado pelo bot, último contato WhatsApp).
--   2. Estende whatsapp_messages com direção (inbound/outbound) e corpo da
--      mensagem para tornar a tabela um log conversacional completo, sem criar
--      uma tabela paralela.
--   3. Cria whatsapp_templates (mensagens prontas reutilizáveis).
--   4. Cria whatsapp_campaigns + whatsapp_campaign_recipients para envios em
--      massa segmentados a partir do CRM.
--   5. Cria whatsapp_optouts como tabela de cache rápido por número (espelhada
--      em crm_leads.optout_whatsapp para integridade transversal).
--
-- O objetivo é que a Central use APENAS o CRM como fonte de verdade dos leads
-- — não criamos contatos paralelos. As tabelas novas só registram o que o CRM
-- não comporta naturalmente (conteúdo de mensagens, biblioteca de templates,
-- campanhas e respectivos destinatários).
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1) crm_leads — flags da Central WhatsApp
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.crm_leads
    -- Interesse principal identificado pelo bot (touros / matrizes / embrioes /
    -- semen / leiloes / venda_genetica / consultor / outro)
    ADD COLUMN IF NOT EXISTS interesse_principal TEXT,

    -- Tags comerciais livres (preenchidas pelo bot e/ou pela equipe)
    ADD COLUMN IF NOT EXISTS tags_whatsapp JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Última interação no WhatsApp (mensagem enviada ou recebida)
    ADD COLUMN IF NOT EXISTS last_whatsapp_at TIMESTAMPTZ,

    -- O lead pediu humano? Quando true, o bot pausa para esse contato
    ADD COLUMN IF NOT EXISTS handoff_humano BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS handoff_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS handoff_responsavel TEXT,

    -- Opt-out: lead não quer mais receber mensagens (atendido em qualquer envio)
    ADD COLUMN IF NOT EXISTS optout_whatsapp BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS optout_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crm_leads_interesse_principal
    ON public.crm_leads (interesse_principal)
    WHERE interesse_principal IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_handoff_humano
    ON public.crm_leads (handoff_humano)
    WHERE handoff_humano = true;

CREATE INDEX IF NOT EXISTS idx_crm_leads_optout_whatsapp
    ON public.crm_leads (optout_whatsapp)
    WHERE optout_whatsapp = true;

COMMENT ON COLUMN public.crm_leads.interesse_principal IS
    'Interesse capturado pelo bot da Central WhatsApp (touros, matrizes, embrioes, semen, leiloes, venda_genetica, consultor, outro)';
COMMENT ON COLUMN public.crm_leads.handoff_humano IS
    'Quando true, o bot pausa atendimento automatizado para este contato.';
COMMENT ON COLUMN public.crm_leads.optout_whatsapp IS
    'Quando true, nenhum envio (welcome, campanha ou template) é disparado para este contato.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2) whatsapp_messages — virar log conversacional (inbound + outbound)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.whatsapp_messages
    -- Direção da mensagem (default outbound mantém compatibilidade com registros antigos)
    ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'outbound',

    -- Corpo da mensagem (texto puro — anexos ficam fora do escopo desta v1)
    ADD COLUMN IF NOT EXISTS body TEXT,

    -- Origem do envio (lp, webhook, manual, campanha, template, bot)
    ADD COLUMN IF NOT EXISTS origin TEXT,

    -- ID da campanha, quando aplicável
    ADD COLUMN IF NOT EXISTS campaign_id UUID,

    -- ID do template, quando aplicável
    ADD COLUMN IF NOT EXISTS template_id UUID,

    -- Assistente comercial — identificador da etapa do fluxo no momento do envio
    ADD COLUMN IF NOT EXISTS bot_step TEXT;

ALTER TABLE public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_direction_check
    CHECK (direction IN ('inbound', 'outbound'))
    NOT VALID;

ALTER TABLE public.whatsapp_messages
    VALIDATE CONSTRAINT whatsapp_messages_direction_check;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_direction
    ON public.whatsapp_messages (direction);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_campaign
    ON public.whatsapp_messages (campaign_id) WHERE campaign_id IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- 3) whatsapp_templates — biblioteca de mensagens reutilizáveis
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,            -- chave estável (ex: 'welcome', 'follow-up')
    title       TEXT NOT NULL,                   -- nome humano (ex: "Boas-vindas LP")
    category    TEXT NOT NULL DEFAULT 'geral',   -- welcome | triagem | oportunidade | leilao | follow_up | encaminhamento | optout | geral
    body        TEXT NOT NULL,                   -- corpo da mensagem (suporta {nome}, {responsavel}, etc)
    variables   JSONB NOT NULL DEFAULT '[]'::jsonb, -- array de variáveis usadas (informativo p/ UI)
    archived    BOOLEAN NOT NULL DEFAULT false,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_templates_full_access" ON public.whatsapp_templates;
CREATE POLICY "wa_templates_full_access"
    ON public.whatsapp_templates FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_whatsapp_templates_category
    ON public.whatsapp_templates (category) WHERE archived = false;


-- ────────────────────────────────────────────────────────────────────────────
-- 4) whatsapp_campaigns — listas de transmissão segmentadas
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name            TEXT NOT NULL,                     -- nome da campanha
    description     TEXT,
    -- Filtros JSON aplicados ao CRM para gerar o público (ex: {"interesse_principal":"touros"})
    segment         JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Mensagem de envio: pode referenciar um template ou trazer corpo livre
    template_id     UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
    body            TEXT,                              -- usado quando template_id é null
    status          TEXT NOT NULL DEFAULT 'rascunho',  -- rascunho | enviando | concluida | cancelada | erro
    total_recipients INTEGER NOT NULL DEFAULT 0,
    sent_count      INTEGER NOT NULL DEFAULT 0,
    failed_count    INTEGER NOT NULL DEFAULT 0,
    optout_skip_count INTEGER NOT NULL DEFAULT 0,      -- pulados por opt-out
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_campaigns_full_access" ON public.whatsapp_campaigns;
CREATE POLICY "wa_campaigns_full_access"
    ON public.whatsapp_campaigns FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_status
    ON public.whatsapp_campaigns (status);


-- ────────────────────────────────────────────────────────────────────────────
-- 5) whatsapp_campaign_recipients — destinatários por campanha
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_recipients (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id     UUID NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
    lead_id         UUID,
    phone           TEXT NOT NULL,
    name            TEXT,
    status          TEXT NOT NULL DEFAULT 'pendente',  -- pendente | enviado | falhou | optout
    error_msg       TEXT,
    sent_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.whatsapp_campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_recipients_full_access" ON public.whatsapp_campaign_recipients;
CREATE POLICY "wa_recipients_full_access"
    ON public.whatsapp_campaign_recipients FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_wa_recipients_campaign ON public.whatsapp_campaign_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_wa_recipients_status   ON public.whatsapp_campaign_recipients (status);


-- ────────────────────────────────────────────────────────────────────────────
-- 6) whatsapp_optouts — cache rápido por número (sem precisar de lead_id)
--    útil quando alguém escreve "PARAR" sem ter lead vinculado.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_optouts (
    phone       TEXT PRIMARY KEY,                     -- só dígitos, sem +55
    reason      TEXT,
    lead_id     UUID,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.whatsapp_optouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_optouts_full_access" ON public.whatsapp_optouts;
CREATE POLICY "wa_optouts_full_access"
    ON public.whatsapp_optouts FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');


-- ────────────────────────────────────────────────────────────────────────────
-- 7) Trigger updated_at em whatsapp_templates / whatsapp_campaigns
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_templates_updated ON public.whatsapp_templates;
CREATE TRIGGER trg_whatsapp_templates_updated
    BEFORE UPDATE ON public.whatsapp_templates
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_whatsapp_campaigns_updated ON public.whatsapp_campaigns;
CREATE TRIGGER trg_whatsapp_campaigns_updated
    BEFORE UPDATE ON public.whatsapp_campaigns
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- 8) Seed inicial — templates padrão da Fórmula do Boi
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.whatsapp_templates (slug, title, category, body, variables) VALUES
    (
        'welcome-default',
        'Boas-vindas (padrão)',
        'welcome',
        E'Olá {nome}! 👋\n\nAqui é da *Fórmula do Boi* — genética Nelore PO.\n\nPara te atender melhor, qual é o seu principal interesse?\n\n1️⃣ Touros\n2️⃣ Matrizes\n3️⃣ Embriões\n4️⃣ Sêmen\n5️⃣ Leilões\n6️⃣ Vender minha genética\n7️⃣ Falar com um consultor\n\nResponda apenas com o número.',
        '["nome"]'::jsonb
    ),
    (
        'triagem-touros',
        'Triagem · interesse em touros',
        'triagem',
        E'Excelente, {nome}! 🐂\n\nTrabalhamos com touros Nelore PO de elite. Pra te apresentar opções alinhadas com seu rebanho, me conta:\n\n• Quantas matrizes pretende cobrir?\n• Tem preferência por linhagem?\n\nLogo um consultor entra em contato.',
        '["nome"]'::jsonb
    ),
    (
        'triagem-matrizes',
        'Triagem · interesse em matrizes',
        'triagem',
        E'Ótima escolha, {nome}! 🐄\n\nTemos matrizes Nelore PO de programas top. Pra apresentar as melhores oportunidades, me diz:\n\n• Quantas matrizes está buscando?\n• Foco em produção, doadora ou registro?\n\nUm consultor entra em contato em seguida.',
        '["nome"]'::jsonb
    ),
    (
        'triagem-embrioes',
        'Triagem · interesse em embriões',
        'triagem',
        E'Bacana, {nome}! 🧬\n\nTemos lotes de embriões de doadoras provadas. Pra montar a melhor proposta:\n\n• Quantos embriões pretende implantar?\n• Tem preferência por touro ou doadora específica?',
        '["nome"]'::jsonb
    ),
    (
        'triagem-semen',
        'Triagem · interesse em sêmen',
        'triagem',
        E'Show, {nome}! 💉\n\nTrabalhamos com sêmen de touros provados. Pra te ajudar:\n\n• Quantas doses está buscando?\n• Algum touro ou linhagem em mente?',
        '["nome"]'::jsonb
    ),
    (
        'triagem-leiloes',
        'Triagem · interesse em leilões',
        'triagem',
        E'Perfeito, {nome}! 🔨\n\nTemos um cronograma ativo de leilões. Vou te mandar o link com os próximos eventos e datas, ok?\n\n👉 https://formuladoboi.com/agenda',
        '["nome"]'::jsonb
    ),
    (
        'triagem-venda-genetica',
        'Triagem · vender genética',
        'triagem',
        E'Interessante, {nome}! 🤝\n\nA Fórmula do Boi também avalia genética para revenda. Me passa:\n\n• Tipo do material (touro / matriz / embrião / sêmen)\n• Quantidade disponível\n• Linhagem principal\n\nUm consultor vai analisar e retornar.',
        '["nome"]'::jsonb
    ),
    (
        'consultor-handoff',
        'Encaminhamento para consultor',
        'encaminhamento',
        E'Beleza, {nome}! 👨‍💼\n\nVou te encaminhar agora pra um consultor da equipe comercial. Ele entra em contato em instantes por aqui mesmo.',
        '["nome"]'::jsonb
    ),
    (
        'follow-up-3d',
        'Follow-up 3 dias sem resposta',
        'follow_up',
        E'Oi {nome}, tudo bem? 🤠\n\nVi que conversamos por aqui há alguns dias. Posso te passar mais detalhes sobre {interesse} ou ajustar a busca pra outro tipo de animal?',
        '["nome", "interesse"]'::jsonb
    ),
    (
        'aviso-leilao',
        'Aviso de leilão',
        'leilao',
        E'🔨 *Leilão Fórmula do Boi*\n\n{nome}, próximo leilão chegando: *{leilao_nome}* em *{leilao_data}*.\n\nConfira o catálogo e participe:\n👉 {leilao_link}',
        '["nome", "leilao_nome", "leilao_data", "leilao_link"]'::jsonb
    ),
    (
        'optout-confirmacao',
        'Confirmação de opt-out',
        'optout',
        E'Tudo certo, {nome}. Você foi removido(a) da nossa lista de envios automáticos. ✅\n\nSe mudar de ideia, é só responder *VOLTAR* a qualquer momento.',
        '["nome"]'::jsonb
    )
ON CONFLICT (slug) DO NOTHING;


-- ── Origem: database/whatsapp_flows.sql ──
-- ============================================================================
-- Múltiplos fluxos nomeados — cada um é um grafo completo (inbound + new_lead),
-- com EXATAMENTE um marcado como ativo. Inbound e render-welcome consultam o
-- ativo. Operador pode criar variantes (A/B, sazonais) e trocar o ativo em
-- 1 clique.
-- ============================================================================
-- Data: 2026-05-12
--
-- Migração suave: copia o `site_settings.whatsapp_flow_v2` (se existir) pra
-- uma linha nessa tabela chamada "Padrão" com is_active=true. Se a chave não
-- existir no site_settings, criamos a linha sem grafo (a leitura via lib
-- cai no buildDefaultGraph() do código).
--
-- Os endpoints /api/whatsapp/inbound e /api/whatsapp/render-welcome passam a:
--   1. carregar o fluxo ativo desta tabela
--   2. cair no site_settings.whatsapp_flow_v2 se nada estiver ativo (compat)
--   3. cair no buildDefaultGraph() se nem isso existir
-- ============================================================================


CREATE TABLE IF NOT EXISTS public.whatsapp_flows (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    graph       JSONB NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT false,
    created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.whatsapp_flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_flows_full_access" ON public.whatsapp_flows;
CREATE POLICY "wa_flows_full_access"
    ON public.whatsapp_flows FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

-- Garante UM único ativo. Constraint parcial: só impede 2 linhas com
-- is_active=true (NULLs/false podem repetir). Toggling ativo é
-- "desativa todos, ativa o escolhido" — feito em transação na API.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wa_flows_one_active
    ON public.whatsapp_flows (is_active)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_wa_flows_active ON public.whatsapp_flows (is_active);

DROP TRIGGER IF EXISTS trg_wa_flows_updated ON public.whatsapp_flows;
CREATE TRIGGER trg_wa_flows_updated
    BEFORE UPDATE ON public.whatsapp_flows
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- Seed: copia o grafo atual de site_settings.whatsapp_flow_v2 (se existir)
-- pra uma linha "Padrão" com is_active=true. Só executa se a tabela está
-- vazia (idempotente).
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_count INT;
    v_graph JSONB;
BEGIN
    SELECT COUNT(*) INTO v_count FROM public.whatsapp_flows;
    IF v_count > 0 THEN
        RAISE NOTICE 'whatsapp_flows já tem dados — pulando seed.';
        RETURN;
    END IF;

    SELECT value INTO v_graph
    FROM public.site_settings
    WHERE key = 'whatsapp_flow_v2'
    LIMIT 1;

    -- Mesmo sem grafo persistido, criamos a linha Padrão com placeholder.
    -- A lib whatsapp-flows.ts detecta isso e usa buildDefaultGraph() em runtime.
    INSERT INTO public.whatsapp_flows (name, description, graph, is_active)
    VALUES (
        'Padrão',
        'Fluxo padrão criado na migração — herda o grafo anterior em site_settings.whatsapp_flow_v2 (ou o buildDefaultGraph() do código se não houver).',
        COALESCE(v_graph, '{"version":2,"startId":"start","nodes":[],"edges":[]}'::jsonb),
        true
    );
END $$;


-- ── Origem: database/whatsapp_flows_settings.sql ──
-- ============================================================================
-- whatsapp_flows: settings JSONB + last_activated_at
-- ============================================================================
-- Data: 2026-05-12
--
-- Adiciona:
--   settings           — bag de parâmetros do fluxo (rate limit, horário
--                        permitido, fuso, fallback template, etc). Lidos pelo
--                        engine quando o fluxo está ativo. Default '{}'::jsonb
--                        para nunca quebrar reads existentes.
--   last_activated_at  — quando o fluxo virou ativo pela última vez.
--                        Preenchido pelo endpoint /activate.
--
-- A migration é idempotente: usa ADD COLUMN IF NOT EXISTS.
-- ============================================================================

ALTER TABLE public.whatsapp_flows
    ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.whatsapp_flows
    ADD COLUMN IF NOT EXISTS last_activated_at TIMESTAMPTZ;

-- Backfill: marca last_activated_at = updated_at para o fluxo ativo (única
-- estimativa razoável). Linhas inativas ficam NULL.
UPDATE public.whatsapp_flows
SET last_activated_at = updated_at
WHERE is_active = true AND last_activated_at IS NULL;

COMMENT ON COLUMN public.whatsapp_flows.settings IS
    'Parâmetros do fluxo (rate limit, horário, fuso, etc). JSONB livre — o engine só lê chaves conhecidas.';

COMMENT ON COLUMN public.whatsapp_flows.last_activated_at IS
    'Última vez que este fluxo foi ativado via /activate. Útil pra histórico/rollback.';


-- ── Origem: database/whatsapp_flow_config_seed.sql ──
-- Seed default WhatsApp flow configuration in site_settings
INSERT INTO site_settings (key, value, description)
VALUES (
  'whatsapp_flow',
  '{
    "welcome_message": "Olá {nome}! Seja bem vindo(a)! 🎉\n\nGostaríamos de te apresentar a *Fórmula do Boi*!\n\nAcesse nosso Marketplace e confira nossas ofertas exclusivas:\n👉 https://formuladoboi.com\n\nDeseja mais informações? Responda com o número da opção:\n\n1️⃣ Ver catálogo completo\n2️⃣ Falar com um consultor\n3️⃣ Conhecer nossos serviços",
    "options": [
      {"key": "1", "label": "Ver catálogo", "response": "Confira nosso catálogo completo em: https://formuladoboi.com 🐂"},
      {"key": "2", "label": "Falar com consultor", "response": "Ótimo! Em breve um de nossos consultores entrará em contato com você! 😊"},
      {"key": "3", "label": "Conhecer serviços", "response": "Conheça todos os nossos serviços em: https://formuladoboi.com 🌟"}
    ],
    "flow_timeout_minutes": 60
  }'::jsonb,
  'Configuração do fluxo de mensagens WhatsApp automáticas'
)
ON CONFLICT (key) DO NOTHING;


-- ── Origem: database/whatsapp_templates_media_and_poll.sql ──
-- ============================================================================
-- whatsapp_templates: suporte a mídia (foto/vídeo/etc) e enquete nativa
-- ============================================================================
-- Data: 2026-05-11
--
-- Estende a tabela whatsapp_templates para que um template possa carregar:
--   - Um anexo (foto, vídeo, áudio ou documento) armazenado no R2.
--   - Uma enquete nativa do WhatsApp (pergunta + opções).
--
-- O template original em texto continua funcionando como antes. Os novos
-- campos são todos opcionais.
--
-- Convenção do `media_url`: armazenamos a KEY do R2 (com o prefixo padrão
-- `libmedia/`), não a URL pública/presigned. A URL é gerada na hora do envio
-- pelo Next.js (presigned curta) e passada ao VPS.
-- ============================================================================

ALTER TABLE public.whatsapp_templates
    -- Mídia (opcional). Se preenchida, é enviada ANTES da `body` no WhatsApp.
    ADD COLUMN IF NOT EXISTS media_url       TEXT,            -- key do R2 (ex.: libmedia/123_foto.jpg)
    ADD COLUMN IF NOT EXISTS media_type      TEXT,            -- image|video|audio|document
    ADD COLUMN IF NOT EXISTS media_mime      TEXT,            -- mimetype original
    ADD COLUMN IF NOT EXISTS media_filename  TEXT,            -- nome original (mostrado em document)
    ADD COLUMN IF NOT EXISTS media_caption   TEXT,            -- legenda (se vazio, usa body como caption)

    -- Enquete (opcional). Se preenchida, é enviada DEPOIS da `body`.
    ADD COLUMN IF NOT EXISTS poll_question         TEXT,
    ADD COLUMN IF NOT EXISTS poll_options          JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS poll_selectable_count INT  NOT NULL DEFAULT 1;

-- Restringe os tipos de mídia aceitos.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_templates_media_type_check'
    ) THEN
        ALTER TABLE public.whatsapp_templates
            ADD CONSTRAINT whatsapp_templates_media_type_check
            CHECK (media_type IS NULL OR media_type IN ('image','video','audio','document'));
    END IF;
END $$;

COMMENT ON COLUMN public.whatsapp_templates.media_url IS
    'Key do R2 (ex.: libmedia/123_foto.jpg). A presigned URL é gerada no envio.';
COMMENT ON COLUMN public.whatsapp_templates.media_type IS
    'image | video | audio | document — define como o VPS envia via Baileys.';
COMMENT ON COLUMN public.whatsapp_templates.poll_options IS
    'Array JSON de strings com as opções da enquete (ex.: ["Sêmen","Embriões",...]).';


-- ── Origem: database/whatsapp_campaigns_media.sql ──
-- ============================================================================
-- whatsapp_campaigns: suporte a anexar mídia direto na campanha
-- ============================================================================
-- Data: 2026-05-11
--
-- Espelha os campos de mídia que já existem em `whatsapp_templates` para que
-- uma campanha possa carregar foto/vídeo/PDF sem precisar criar template.
--
-- Convenção: mesma do template — `media_url` guarda a KEY do R2 (com prefixo
-- libmedia/), nunca a URL pública. A presigned URL é gerada no envio pelo
-- /api/whatsapp/central/campaigns/[id]/send.
--
-- Quando a campanha tem `template_id` E `media_url` próprio, o `send` route
-- prefere a mídia DA CAMPANHA (override). Permite reaproveitar o texto do
-- template mas trocar o anexo por campanha — útil pra "mesmo welcome, foto
-- diferente por evento".
-- ============================================================================

ALTER TABLE public.whatsapp_campaigns
    ADD COLUMN IF NOT EXISTS media_url       TEXT,
    ADD COLUMN IF NOT EXISTS media_type      TEXT,
    ADD COLUMN IF NOT EXISTS media_mime      TEXT,
    ADD COLUMN IF NOT EXISTS media_filename  TEXT,
    ADD COLUMN IF NOT EXISTS media_caption   TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_campaigns_media_type_check'
    ) THEN
        ALTER TABLE public.whatsapp_campaigns
            ADD CONSTRAINT whatsapp_campaigns_media_type_check
            CHECK (media_type IS NULL OR media_type IN ('image','video','audio','document'));
    END IF;
END $$;

COMMENT ON COLUMN public.whatsapp_campaigns.media_url IS
    'Key do R2 (ex.: libmedia/123_foto.jpg). Sobrescreve media do template, se houver.';


-- ── Origem: database/whatsapp_campaign_sequences.sql ──
-- ============================================================================
-- Campanhas multi-step (sequência, follow-up, regras de parada, reação)
-- ============================================================================
-- Data: 2026-05-12
--
-- Estende a aba "Campanhas" pra cobrir tudo que é específico de campanha,
-- conforme o desenho aprovado:
--   - Sequência: 1+ passos (cada um com delay relativo ao passo anterior)
--   - Follow-up: passos adicionais quando o lead não responde
--   - Regras de parada: para a sequência se lead responder / opt-out / handoff
--   - Reação à resposta: tag aplicada / handoff humano automático quando
--     o lead responder durante a janela da campanha
--
-- O passo 0 (canônico) é o conteúdo já gravado em `whatsapp_campaigns` (body
-- + template_id + media_*). Passos adicionais ficam em `whatsapp_campaign_steps`,
-- agendados via `whatsapp_campaign_recipients.next_send_at` e processados por
-- um endpoint cron que roda a cada poucos minutos.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1) whatsapp_campaigns — regras de parada e reação à resposta
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.whatsapp_campaigns
    -- Regras de parada por destinatário (default = comportamento conservador)
    ADD COLUMN IF NOT EXISTS stop_on_reply    BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS stop_on_optout   BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS stop_on_handoff  BOOLEAN NOT NULL DEFAULT true,
    -- "interesse adquirido": o engine setou interesse_principal durante a janela
    -- da campanha — sinal de qualificação, geralmente vale parar o follow-up
    ADD COLUMN IF NOT EXISTS stop_on_interest BOOLEAN NOT NULL DEFAULT false,

    -- Reação à resposta (aplicada UMA vez quando o lead responde durante a
    -- janela ativa da campanha — antes de a sequência parar via stop_on_reply)
    ADD COLUMN IF NOT EXISTS reply_tag        TEXT,         -- ex: "campanha:leilao-maio:respondeu"
    ADD COLUMN IF NOT EXISTS reply_handoff    BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.whatsapp_campaigns.stop_on_reply IS
    'Para a sequência de follow-ups deste destinatário assim que ele responder qualquer mensagem.';
COMMENT ON COLUMN public.whatsapp_campaigns.stop_on_optout IS
    'Para a sequência se o lead virar opt-out (PARAR, etc) — geralmente fica true por compliance.';
COMMENT ON COLUMN public.whatsapp_campaigns.stop_on_handoff IS
    'Para a sequência se um operador colocar o lead em handoff humano (via Inbox ou /api/whatsapp/central/lead-action).';
COMMENT ON COLUMN public.whatsapp_campaigns.stop_on_interest IS
    'Para a sequência quando o engine grava interesse_principal — sinal forte de qualificação.';
COMMENT ON COLUMN public.whatsapp_campaigns.reply_tag IS
    'Tag aplicada em crm_leads.tags_whatsapp quando o lead responder durante a janela ativa da campanha. Útil pra segmentar follow-ups manuais depois.';
COMMENT ON COLUMN public.whatsapp_campaigns.reply_handoff IS
    'Quando true, marca handoff_humano=true automaticamente se o lead responder. Use pra campanhas pequenas/quentes onde o operador prefere conduzir manualmente.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2) whatsapp_campaign_steps — sequência de envios (passos 1+, follow-ups)
-- ────────────────────────────────────────────────────────────────────────────
-- O passo 0 é sempre o conteúdo da própria campanha (body/template_id/media_*).
-- Esta tabela armazena passos 1, 2, 3... cada um com delay relativo AO PASSO
-- ANTERIOR e conteúdo próprio (template_id OU body OU mídia).
--
-- Por que delay relativo (e não absoluto): quando o operador pausa o cron,
-- os deltas continuam fazendo sentido na retomada — se fosse absoluto, todos
-- os steps atrasados disparariam de uma vez ao retomar.
--
-- Quando o step seria enviado e o lead NÃO está mais ativo (replied/optout/
-- handoff/interest), o cron pula esse step (registra stopped_reason) e marca
-- a sequência como parada.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_steps (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id     UUID NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
    step_order      INTEGER NOT NULL,  -- 1, 2, 3, ... (passo 0 vive em campaigns)
    -- Atraso a partir do passo anterior (passo 1 conta a partir do passo 0).
    delay_value     INTEGER NOT NULL DEFAULT 1,
    delay_unit      TEXT NOT NULL DEFAULT 'days',  -- minutes | hours | days
    -- Conteúdo do passo (mesma regra dos campos da campanha):
    template_id     UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
    body            TEXT,
    media_url       TEXT,
    media_type      TEXT,
    media_mime      TEXT,
    media_filename  TEXT,
    media_caption   TEXT,
    -- Quando true, este step só é enviado se o passo anterior teve status OK.
    -- (Reservado pra futuro: condições mais ricas. Hoje sempre true.)
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,

    UNIQUE (campaign_id, step_order),
    CHECK (step_order >= 1),
    CHECK (delay_value >= 0),
    CHECK (delay_unit IN ('minutes', 'hours', 'days'))
);

ALTER TABLE public.whatsapp_campaign_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_campaign_steps_full_access" ON public.whatsapp_campaign_steps;
CREATE POLICY "wa_campaign_steps_full_access"
    ON public.whatsapp_campaign_steps FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_wa_campaign_steps_campaign
    ON public.whatsapp_campaign_steps (campaign_id, step_order);

DROP TRIGGER IF EXISTS trg_wa_campaign_steps_updated ON public.whatsapp_campaign_steps;
CREATE TRIGGER trg_wa_campaign_steps_updated
    BEFORE UPDATE ON public.whatsapp_campaign_steps
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- 3) whatsapp_campaign_recipients — estado da sequência por destinatário
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.whatsapp_campaign_recipients
    -- Índice do próximo step a enviar. 0 = ainda não recebeu o passo 0;
    -- N = recebeu até o passo N-1, próximo é o passo N.
    ADD COLUMN IF NOT EXISTS current_step    INTEGER NOT NULL DEFAULT 0,

    -- Quando o cron deve mandar o próximo step. null = ou já terminou ou parou.
    ADD COLUMN IF NOT EXISTS next_send_at    TIMESTAMPTZ,

    -- Quando o lead respondeu durante a janela ativa da campanha (1ª resposta).
    ADD COLUMN IF NOT EXISTS replied_at      TIMESTAMPTZ,

    -- Quando e por que a sequência parou pra esse destinatário.
    ADD COLUMN IF NOT EXISTS stopped_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS stopped_reason  TEXT;

-- replied | optout | handoff | interest | completed | cancelled | error
ALTER TABLE public.whatsapp_campaign_recipients
    DROP CONSTRAINT IF EXISTS wa_campaign_recipients_stopped_reason_check;
ALTER TABLE public.whatsapp_campaign_recipients
    ADD CONSTRAINT wa_campaign_recipients_stopped_reason_check
    CHECK (stopped_reason IS NULL OR stopped_reason IN
        ('replied', 'optout', 'handoff', 'interest', 'completed', 'cancelled', 'error'));

CREATE INDEX IF NOT EXISTS idx_wa_recipients_next_send
    ON public.whatsapp_campaign_recipients (next_send_at)
    WHERE next_send_at IS NOT NULL AND stopped_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wa_recipients_lead_active
    ON public.whatsapp_campaign_recipients (lead_id)
    WHERE stopped_at IS NULL AND lead_id IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_campaign_recipients.current_step IS
    'Índice do próximo step a enviar. 0 antes de qualquer envio; N depois de receber até o step N-1.';
COMMENT ON COLUMN public.whatsapp_campaign_recipients.next_send_at IS
    'Timestamp pra o cron acordar e enviar o próximo step. null = sequência terminou ou parou.';
COMMENT ON COLUMN public.whatsapp_campaign_recipients.stopped_reason IS
    'Razão da parada da sequência (NULL = ainda ativa ou já completou todos os steps).';


-- ── Origem: database/whatsapp_catalogs.sql ──
-- ============================================================
-- CATÁLOGOS WHATSAPP — automação que monitora grupos para
-- detectar PDFs de catálogo de leilão e anexar ao cronograma.
--
-- Roda numa SEGUNDA sessão Baileys no VPS (container separado,
-- porta 3002, número diferente). Não toca na Central WhatsApp.
--
-- Executar uma vez no SQL Editor do Supabase.
-- ============================================================

-- 1) Coluna de catálogo no cronograma de leilões
-- ------------------------------------------------------------
ALTER TABLE public.cronograma_leiloes
    ADD COLUMN IF NOT EXISTS catalogo_url        TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS catalogo_anexado_em TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS catalogo_origem     TEXT DEFAULT NULL;

COMMENT ON COLUMN public.cronograma_leiloes.catalogo_url IS 'URL pública (R2 presigned ou externa) do PDF do catálogo do leilão';
COMMENT ON COLUMN public.cronograma_leiloes.catalogo_anexado_em IS 'Quando o catálogo foi anexado pela última vez';
COMMENT ON COLUMN public.cronograma_leiloes.catalogo_origem IS 'whatsapp-bula | whatsapp-academia | manual | outro';


-- 2) Grupos monitorados (config dinâmica via UI)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_catalog_groups (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jid          TEXT UNIQUE NOT NULL,            -- ex: "120363012345678901@g.us"
    nome         TEXT NOT NULL,                   -- "Bula Assessoria | Assessores"
    slug         TEXT,                            -- "bula-assessoria" | "academia-nelore-po"
    ativo        BOOLEAN NOT NULL DEFAULT TRUE,
    descricao    TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_whatsapp_catalog_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wa_catalog_groups_updated_at ON public.whatsapp_catalog_groups;
CREATE TRIGGER trg_wa_catalog_groups_updated_at
    BEFORE UPDATE ON public.whatsapp_catalog_groups
    FOR EACH ROW EXECUTE FUNCTION update_whatsapp_catalog_groups_updated_at();

ALTER TABLE public.whatsapp_catalog_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage catalog groups" ON public.whatsapp_catalog_groups;
CREATE POLICY "Admins manage catalog groups"
    ON public.whatsapp_catalog_groups FOR ALL
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    ));

-- Seeds iniciais (apenas o nome — o JID o operador adiciona depois pela UI).
INSERT INTO public.whatsapp_catalog_groups (nome, slug, descricao, jid, ativo)
VALUES
    ('Bula Assessoria | Assessores', 'bula-assessoria', 'Grupo dos assessores Bula — recebe catálogos antes do disparo', '', TRUE),
    ('Academia do Nelore P.O',       'academia-nelore-po', 'Comunidade Academia do Nelore P.O — catálogos de leilões parceiros', '', TRUE)
ON CONFLICT (jid) DO NOTHING;


-- 3) Detecções de PDF (uma linha por arquivo recebido)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_catalog_detections (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Origem
    group_jid         TEXT NOT NULL,                       -- "...@g.us"
    group_name        TEXT,                                -- snapshot do nome do grupo
    sender_jid        TEXT,                                -- "554999...@s.whatsapp.net"
    sender_name       TEXT,                                -- pushName do remetente
    message_id        TEXT,                                -- id da mensagem original (idempotência)

    -- Arquivo
    file_name         TEXT NOT NULL,                       -- "Catalogo Mega EAO 2026.pdf"
    file_mime         TEXT,
    file_size         INTEGER,
    r2_key            TEXT,                                -- key no R2 ex: "libmedia/catalogos-whatsapp/2026/05/<uuid>.pdf"

    -- Matching com cronograma_leiloes
    match_status      TEXT NOT NULL DEFAULT 'pending',     -- pending | matched | ambiguous | no_match | attached | manual
    match_score       NUMERIC(5,2),                        -- 0..100 (similaridade)
    match_method      TEXT,                                -- "filename_fuzzy" | "filename_exact" | "manual"
    cronograma_id     UUID REFERENCES public.cronograma_leiloes(id) ON DELETE SET NULL,
    candidates        JSONB,                               -- top-N candidatos com score, pro operador escolher manualmente

    -- Anexação
    attached          BOOLEAN NOT NULL DEFAULT FALSE,
    attached_at       TIMESTAMPTZ,
    attached_by       TEXT,                                -- "auto" | user_id (uuid)
    overwrote_existing BOOLEAN NOT NULL DEFAULT FALSE,     -- se substituiu catalogo_url anterior

    -- Diagnóstico
    error             TEXT,                                -- se algo deu errado no fluxo
    notes             TEXT,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_catalog_detections_received  ON public.whatsapp_catalog_detections (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_catalog_detections_status    ON public.whatsapp_catalog_detections (match_status);
CREATE INDEX IF NOT EXISTS idx_wa_catalog_detections_group     ON public.whatsapp_catalog_detections (group_jid);
CREATE INDEX IF NOT EXISTS idx_wa_catalog_detections_msg       ON public.whatsapp_catalog_detections (message_id);
CREATE INDEX IF NOT EXISTS idx_wa_catalog_detections_cronograma ON public.whatsapp_catalog_detections (cronograma_id);

CREATE OR REPLACE FUNCTION update_whatsapp_catalog_detections_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wa_catalog_detections_updated_at ON public.whatsapp_catalog_detections;
CREATE TRIGGER trg_wa_catalog_detections_updated_at
    BEFORE UPDATE ON public.whatsapp_catalog_detections
    FOR EACH ROW EXECUTE FUNCTION update_whatsapp_catalog_detections_updated_at();

ALTER TABLE public.whatsapp_catalog_detections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage catalog detections" ON public.whatsapp_catalog_detections;
CREATE POLICY "Admins manage catalog detections"
    ON public.whatsapp_catalog_detections FOR ALL
    USING (EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    ));


-- 4) Pausa global da segunda sessão (espelha o padrão da Central)
-- ------------------------------------------------------------
INSERT INTO public.site_settings (key, value)
VALUES ('whatsapp_catalogs_paused', '{"paused": false, "paused_at": null, "paused_by": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;


