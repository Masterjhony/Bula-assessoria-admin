-- ============================================================
-- 0007_projetos_okr_contratos.sql — Schema da Fase 2
-- Consolidação de 14 arquivos do fórmula (tactical_*, strategic_*,
-- contratos). Sem ClickSign (cortado a pedido). Sem seeds — apenas
-- as colunas default do tactical_kanban_columns e o Funil Comercial
-- (necessários pro Kanban renderizar com colunas).
--
-- Adaptações para web-bula:
-- - profiles do web-bula NÃO tem coluna `role`. Policies que
--   originalmente checavam `role='admin'` passam a permitir qualquer
--   usuário autenticado.
-- - Buckets de storage (tactical-attachments, contracts) e suas
--   policies são INCLUSOS aqui, mas precisam ser criados via API
--   `INSERT INTO storage.buckets` que requer service_role (já
--   garantido pelo apply-migration-single.mjs).
-- ============================================================

-- ── TACTICAL TASKS (kanban principal) ───────────────────────
CREATE TABLE IF NOT EXISTS public.tactical_tasks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    title               TEXT NOT NULL,
    description         TEXT,
    status              TEXT NOT NULL DEFAULT 'A fazer',
    priority            TEXT DEFAULT 'Média',
    due_date            TIMESTAMPTZ,
    start_date          TIMESTAMPTZ,
    assignees           TEXT[],
    position            INTEGER DEFAULT 0,
    column_id           TEXT,
    unidade             TEXT NOT NULL DEFAULT 'formula_boi',
    archived_at         TIMESTAMPTZ,
    checklists          JSONB DEFAULT '[]'::jsonb,
    -- ICE scoring + estratégia
    ice_impact          SMALLINT DEFAULT 5,
    ice_confidence      SMALLINT DEFAULT 5,
    ice_ease            SMALLINT DEFAULT 5,
    depends_on          TEXT[] DEFAULT '{}',
    strategic_stage     TEXT,
    status_changed_at   TIMESTAMPTZ DEFAULT NOW(),
    -- WhatsApp origin (mantido pra compatibilidade — não usado no bula)
    whatsapp_group_id   TEXT,
    whatsapp_group_name TEXT,
    whatsapp_sender     TEXT,
    whatsapp_sender_name TEXT
);

ALTER TABLE public.tactical_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tactical_tasks_all" ON public.tactical_tasks;
CREATE POLICY "tactical_tasks_all" ON public.tactical_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS tactical_tasks_unidade_status_position_idx
    ON public.tactical_tasks (unidade, status, position);
CREATE INDEX IF NOT EXISTS tactical_tasks_archived_at_idx
    ON public.tactical_tasks (archived_at);
CREATE INDEX IF NOT EXISTS idx_tactical_tasks_strategic_stage
    ON public.tactical_tasks (strategic_stage);

-- ── KANBAN COLUMNS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tactical_kanban_columns (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tactical_kanban_columns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tactical_kanban_columns_all" ON public.tactical_kanban_columns;
CREATE POLICY "tactical_kanban_columns_all" ON public.tactical_kanban_columns FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Default columns
INSERT INTO public.tactical_kanban_columns (title, position)
SELECT * FROM (VALUES
    ('Idéias',       1000),
    ('A fazer',      2000),
    ('Em andamento', 3000),
    ('Completa',     4000)
) AS v(title, position)
WHERE NOT EXISTS (SELECT 1 FROM public.tactical_kanban_columns);

-- ── TASK COMMENTS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tactical_task_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID NOT NULL REFERENCES public.tactical_tasks(id) ON DELETE CASCADE,
    profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tactical_task_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tactical_task_comments_all" ON public.tactical_task_comments;
CREATE POLICY "tactical_task_comments_all" ON public.tactical_task_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── TASK ATTACHMENTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tactical_task_attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id      UUID NOT NULL REFERENCES public.tactical_tasks(id) ON DELETE CASCADE,
    file_name    TEXT NOT NULL,
    file_url     TEXT NOT NULL,
    file_path    TEXT NOT NULL,
    file_type    TEXT,
    file_size    BIGINT,
    uploaded_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tactical_task_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tactical_task_attachments_all" ON public.tactical_task_attachments;
CREATE POLICY "tactical_task_attachments_all" ON public.tactical_task_attachments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage bucket + policies para tactical-attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('tactical-attachments', 'tactical-attachments', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Allow authenticated upload to tactical-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read of tactical-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete from tactical-attachments" ON storage.objects;

CREATE POLICY "Allow authenticated upload to tactical-attachments"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'tactical-attachments');
CREATE POLICY "Allow public read of tactical-attachments"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'tactical-attachments');
CREATE POLICY "Allow authenticated delete from tactical-attachments"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'tactical-attachments');

-- ── TACTICAL MEMBERS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tactical_members (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    role          TEXT,
    avatar_color  TEXT DEFAULT '#B8860B',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tactical_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tactical_members_all" ON public.tactical_members;
CREATE POLICY "tactical_members_all" ON public.tactical_members FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── OBJECTIVES (O do OKR) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tactical_objectives (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT NOT NULL,
    description  TEXT,
    quarter      TEXT DEFAULT 'Q2 2026',
    color        TEXT DEFAULT '#B8860B',
    status       TEXT DEFAULT 'active',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tactical_objectives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tactical_objectives_all" ON public.tactical_objectives;
CREATE POLICY "tactical_objectives_all" ON public.tactical_objectives FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── KEY RESULTS (KR do OKR) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tactical_key_results (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objective_id  UUID NOT NULL REFERENCES public.tactical_objectives(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    current_value NUMERIC DEFAULT 0,
    target_value  NUMERIC DEFAULT 100,
    unit          TEXT DEFAULT '%',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tactical_key_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tactical_key_results_all" ON public.tactical_key_results;
CREATE POLICY "tactical_key_results_all" ON public.tactical_key_results FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── TASK ↔ KR LINKS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tactical_task_kr_links (
    task_id UUID NOT NULL REFERENCES public.tactical_tasks(id)       ON DELETE CASCADE,
    kr_id   UUID NOT NULL REFERENCES public.tactical_key_results(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, kr_id)
);

ALTER TABLE public.tactical_task_kr_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tactical_task_kr_links_all" ON public.tactical_task_kr_links;
CREATE POLICY "tactical_task_kr_links_all" ON public.tactical_task_kr_links FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── RISKS / DECISIONS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tactical_risks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT NOT NULL,
    description  TEXT,
    probability  TEXT DEFAULT 'media',
    impact       TEXT DEFAULT 'medio',
    mitigation   TEXT,
    status       TEXT DEFAULT 'active',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tactical_risks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tactical_risks_all" ON public.tactical_risks;
CREATE POLICY "tactical_risks_all" ON public.tactical_risks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.tactical_decisions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision     TEXT NOT NULL,
    reason       TEXT,
    data_basis   TEXT,
    outcome      TEXT,
    decided_at   DATE DEFAULT CURRENT_DATE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tactical_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tactical_decisions_all" ON public.tactical_decisions;
CREATE POLICY "tactical_decisions_all" ON public.tactical_decisions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── STRATEGIC FLOWS & STAGES ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.strategic_flows (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    description  TEXT,
    active       BOOLEAN DEFAULT true,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.strategic_stages (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id      UUID NOT NULL REFERENCES public.strategic_flows(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    position     INTEGER DEFAULT 0,
    weight       INTEGER DEFAULT 3 CHECK (weight BETWEEN 1 AND 5),
    color        TEXT DEFAULT '#B8860B',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategic_stages_flow_id ON public.strategic_stages(flow_id);
CREATE INDEX IF NOT EXISTS idx_strategic_stages_position ON public.strategic_stages(position);

ALTER TABLE public.strategic_flows  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategic_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "strategic_flows_all" ON public.strategic_flows;
CREATE POLICY "strategic_flows_all" ON public.strategic_flows FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "strategic_stages_all" ON public.strategic_stages;
CREATE POLICY "strategic_stages_all" ON public.strategic_stages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── CONTRATOS (sem ClickSign) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.tactical_contracts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name TEXT NOT NULL,
    title       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'Pendente'
                  CHECK (status IN ('Ativo', 'Pendente', 'Vencido', 'Cancelado')),
    value       NUMERIC(15, 2),
    start_date  DATE,
    end_date    DATE,
    file_url    TEXT,
    file_path   TEXT,
    file_name   TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.update_tactical_contracts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tactical_contracts_updated_at ON public.tactical_contracts;
CREATE TRIGGER trg_tactical_contracts_updated_at
    BEFORE UPDATE ON public.tactical_contracts
    FOR EACH ROW EXECUTE FUNCTION public.update_tactical_contracts_updated_at();

ALTER TABLE public.tactical_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tactical_contracts_all" ON public.tactical_contracts;
CREATE POLICY "tactical_contracts_all" ON public.tactical_contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage bucket + policies para contracts
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Allow authenticated upload to contracts" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read of contracts" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete from contracts" ON storage.objects;

CREATE POLICY "Allow authenticated upload to contracts"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'contracts');
CREATE POLICY "Allow public read of contracts"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'contracts');
CREATE POLICY "Allow authenticated delete from contracts"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'contracts');

-- ── Seed: Funil Comercial padrão ────────────────────────────
DO $$
DECLARE
    existing_flow UUID;
    new_flow_id UUID;
BEGIN
    SELECT id INTO existing_flow FROM public.strategic_flows WHERE name = 'Funil Comercial';
    IF existing_flow IS NULL THEN
        INSERT INTO public.strategic_flows (name, description)
        VALUES ('Funil Comercial', 'Pipeline principal de captação, conversão e resultado')
        RETURNING id INTO new_flow_id;

        INSERT INTO public.strategic_stages (flow_id, name, position, weight, color) VALUES
            (new_flow_id, 'Prospecção',   1000, 3, '#3B82F6'),
            (new_flow_id, 'Qualificação', 2000, 4, '#F59E0B'),
            (new_flow_id, 'Proposta',     3000, 5, '#B8860B'),
            (new_flow_id, 'Negociação',   4000, 4, '#EC4899'),
            (new_flow_id, 'Fechamento',   5000, 5, '#10B981');
    END IF;
END $$;
