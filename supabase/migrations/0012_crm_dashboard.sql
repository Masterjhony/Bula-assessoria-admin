-- ============================================================
-- 0012_crm_dashboard.sql — Fase 8 (CRM + Dashboard)
-- Estende crm_leads (esqueleto criado na Fase 6) com TODAS as colunas
-- usadas pelo CRM do fórmula. Schema completo, sem dados — usuário
-- pediu explicitamente "schema vazio".
-- ============================================================

-- ── crm_leads: colunas operacionais e de qualificação ──────
ALTER TABLE public.crm_leads
    ADD COLUMN IF NOT EXISTS status                    TEXT NOT NULL DEFAULT 'Lead',
    ADD COLUMN IF NOT EXISTS prioridade                TEXT,
    ADD COLUMN IF NOT EXISTS interesse                 TEXT,
    ADD COLUMN IF NOT EXISTS empresa                   TEXT,
    ADD COLUMN IF NOT EXISTS ultimo_contato            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS data_estimada_fechamento  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS celular                   TEXT,
    ADD COLUMN IF NOT EXISTS responsavel               TEXT,
    ADD COLUMN IF NOT EXISTS updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS position                  FLOAT8 DEFAULT 0,
    -- funil + scoring (add_funnel_fields + add_qualification_fields)
    ADD COLUMN IF NOT EXISTS funnel_id                 TEXT DEFAULT 'default',
    ADD COLUMN IF NOT EXISTS stage                     TEXT DEFAULT 'novo',
    ADD COLUMN IF NOT EXISTS valor_estimado            NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS probabilidade             SMALLINT,
    ADD COLUMN IF NOT EXISTS data_entrada              TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS notes                     TEXT,
    -- sinais de qualificação (add_lead_qualification_signals)
    ADD COLUMN IF NOT EXISTS contact_count             INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS contact_history           JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS is_preferencial           BOOLEAN NOT NULL DEFAULT false,
    -- LP fields (migrate_crm_add_lp_fields)
    ADD COLUMN IF NOT EXISTS landing_url               TEXT,
    ADD COLUMN IF NOT EXISTS source_page               TEXT,
    ADD COLUMN IF NOT EXISTS origem                    TEXT,
    ADD COLUMN IF NOT EXISTS instagram                 TEXT,
    -- Sheets fields (migrate_crm_add_sheets_fields)
    ADD COLUMN IF NOT EXISTS o_que_busca               TEXT,
    ADD COLUMN IF NOT EXISTS quantidade_animais        TEXT,
    ADD COLUMN IF NOT EXISTS estado                    TEXT,
    ADD COLUMN IF NOT EXISTS cidade                    TEXT,
    -- UTM tracking (migrate_crm_add_utm_fields)
    ADD COLUMN IF NOT EXISTS source                    TEXT,
    ADD COLUMN IF NOT EXISTS medium                    TEXT,
    ADD COLUMN IF NOT EXISTS campaign                  TEXT,
    ADD COLUMN IF NOT EXISTS utm_content               TEXT,
    ADD COLUMN IF NOT EXISTS utm_term                  TEXT,
    ADD COLUMN IF NOT EXISTS referrer                  TEXT,
    ADD COLUMN IF NOT EXISTS gclid                     TEXT,
    ADD COLUMN IF NOT EXISTS fbclid                    TEXT,
    -- bag genérica (add_extra_data_to_crm_leads)
    ADD COLUMN IF NOT EXISTS extra_data                JSONB DEFAULT '{}'::jsonb;

-- Trigger updated_at (caso ainda não exista)
CREATE OR REPLACE FUNCTION public.update_modified_column_crm()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_crm_leads_modtime ON public.crm_leads;
CREATE TRIGGER update_crm_leads_modtime
    BEFORE UPDATE ON public.crm_leads
    FOR EACH ROW EXECUTE FUNCTION public.update_modified_column_crm();

-- ── Funis (do bula_assessoria; aqui sem prefixo "bula_") ────
CREATE TABLE IF NOT EXISTS public.crm_funis (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    nome        TEXT NOT NULL,
    icone       TEXT DEFAULT 'funnel',
    etapas      JSONB NOT NULL DEFAULT '[]'::jsonb,
    posicao     INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.crm_funis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_funis_all" ON public.crm_funis;
CREATE POLICY "crm_funis_all" ON public.crm_funis FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.crm_deals (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    funil_id        UUID NOT NULL REFERENCES public.crm_funis(id) ON DELETE CASCADE,
    etapa_id        TEXT NOT NULL,
    nome            TEXT NOT NULL,
    localizacao     TEXT DEFAULT '',
    telefone        TEXT DEFAULT '',
    email           TEXT DEFAULT '',
    valor           NUMERIC(12,2) DEFAULT 0,
    temperatura     TEXT DEFAULT 'frio',
    assessor_id     UUID,
    notas           TEXT DEFAULT '',
    timeline        JSONB DEFAULT '[]'::jsonb,
    dias_no_estagio INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_deals_all" ON public.crm_deals;
CREATE POLICY "crm_deals_all" ON public.crm_deals FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── leads simples (do bula_assessoria) ──────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome        TEXT NOT NULL,
    telefone    TEXT DEFAULT '',
    regiao      TEXT DEFAULT '',
    rebanho     INTEGER DEFAULT 0,
    origem      TEXT DEFAULT 'Site',
    status      TEXT DEFAULT 'novo',
    interesse   TEXT DEFAULT '',
    orcamento   NUMERIC(12,2) DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leads_all" ON public.leads;
CREATE POLICY "leads_all" ON public.leads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── marketing_config (singleton) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_config (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    investimento NUMERIC(12,2) DEFAULT 0,
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.marketing_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "marketing_config_all" ON public.marketing_config;
CREATE POLICY "marketing_config_all" ON public.marketing_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Singleton: 1 linha vazia se a tabela estiver sem dados
INSERT INTO public.marketing_config (investimento)
SELECT 0
WHERE NOT EXISTS (SELECT 1 FROM public.marketing_config);
