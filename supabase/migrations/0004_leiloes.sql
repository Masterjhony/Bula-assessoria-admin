-- ============================================================
-- 0004_leiloes.sql — Schema do módulo Leilões (Fase 1)
-- Migrado de formula_boi/database/*.sql (14 arquivos consolidados).
-- Sem dados (seeds removidos) — os dados serão importados via
-- scripts/migrate-leiloes-data.mjs lendo o Supabase do fórmula.
-- ============================================================

-- ── MEMBROS (base referenciada por leilão) ───────────────────
CREATE TABLE IF NOT EXISTS public.bula_membros (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome        TEXT NOT NULL,
    iniciais    TEXT NOT NULL,
    cor         TEXT DEFAULT '#C8A96E',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bula_membros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bula_membros_all" ON public.bula_membros;
CREATE POLICY "bula_membros_all" ON public.bula_membros FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── LEILÕES (com colunas estendidas + catálogo) ─────────────
CREATE TABLE IF NOT EXISTS public.bula_leiloes (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome            TEXT NOT NULL,
    data            DATE NOT NULL,
    tipo            TEXT NOT NULL,
    local           TEXT NOT NULL,
    animais         INTEGER DEFAULT 0,
    expectativa     NUMERIC(12,2) DEFAULT 0,
    meta_bula       NUMERIC(12,2) DEFAULT 0,
    realizado_bula  NUMERIC(12,2) DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'prospecto',
    img             TEXT DEFAULT '',
    tasks           JSONB DEFAULT '[]'::jsonb,
    horario         TEXT DEFAULT '',
    transmissao     TEXT DEFAULT '',
    modelo          TEXT DEFAULT 'PRESENCIAL',
    leiloeira       TEXT DEFAULT 'BULA',
    condicao        TEXT DEFAULT '',
    frete_gratis    TEXT DEFAULT '',
    acordo_comissao TEXT DEFAULT '',
    catalogo_url    TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bula_leiloes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bula_leiloes_all" ON public.bula_leiloes;
CREATE POLICY "bula_leiloes_all" ON public.bula_leiloes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Junction: leilão <-> membros (assessores escalados)
CREATE TABLE IF NOT EXISTS public.bula_leilao_assessores (
    leilao_id UUID NOT NULL REFERENCES public.bula_leiloes(id) ON DELETE CASCADE,
    membro_id UUID NOT NULL REFERENCES public.bula_membros(id) ON DELETE CASCADE,
    PRIMARY KEY (leilao_id, membro_id)
);

ALTER TABLE public.bula_leilao_assessores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bula_leilao_assessores_all" ON public.bula_leilao_assessores;
CREATE POLICY "bula_leilao_assessores_all" ON public.bula_leilao_assessores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── FECHAMENTO DE LEILÕES (resultado + análises) ────────────
CREATE TABLE IF NOT EXISTS public.bula_leilao_fechamento (
    id                          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome                        TEXT NOT NULL,
    data                        DATE NOT NULL,
    local                       TEXT,
    lotes_ofertados             INTEGER DEFAULT 0,
    lotes_vendidos              INTEGER DEFAULT 0,
    animais_vendidos            INTEGER DEFAULT 0,
    vgv_total                   NUMERIC(14,2) DEFAULT 0,
    ticket_medio                NUMERIC(14,2) DEFAULT 0,
    maior_lance                 NUMERIC(14,2) DEFAULT 0,
    compradores_unicos          INTEGER DEFAULT 0,
    estados_alcancados          INTEGER DEFAULT 0,
    por_assessor                JSONB DEFAULT '[]'::jsonb,
    por_estado                  JSONB DEFAULT '[]'::jsonb,
    compradores                 JSONB DEFAULT '[]'::jsonb,
    lances                      JSONB DEFAULT '[]'::jsonb,
    perfil_genetico             JSONB DEFAULT '[]'::jsonb,
    comissao_assessoria         NUMERIC(12,2) DEFAULT 0,
    receita_bula                NUMERIC(12,2) DEFAULT 0,
    sobra_bruta                 NUMERIC(12,2) DEFAULT 0,
    observacoes                 TEXT,
    lotes_catalogo              JSONB DEFAULT '[]'::jsonb,
    distribuicao_empresa        JSONB DEFAULT '[]'::jsonb,
    faturamento_total_leilao    NUMERIC(14,2),
    acordo_pct_faturamento      NUMERIC(7,5),
    acordo_pct_venda_cobertura  NUMERIC(7,5),
    acordo_descricao            TEXT,
    acordo_criador_id           UUID,  -- FK adicionada após criação de bula_acordos_criadores
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.bula_leilao_fechamento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bula_fechamento_all" ON public.bula_leilao_fechamento;
CREATE POLICY "bula_fechamento_all" ON public.bula_leilao_fechamento FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── EQUIPE DE LEILÕES (roster canônico de assessores) ──────
CREATE TABLE IF NOT EXISTS public.leiloes_equipe (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome        TEXT NOT NULL,
    apelido     TEXT,
    iniciais    TEXT,
    cor         TEXT DEFAULT '#C8A96E',
    empresa     TEXT,
    telefone    TEXT,
    email       TEXT,
    foto_url    TEXT,
    ativo       BOOLEAN DEFAULT TRUE,
    ordem       INTEGER DEFAULT 0,
    observacao  TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS leiloes_equipe_nome_uniq ON public.leiloes_equipe (LOWER(nome));

ALTER TABLE public.leiloes_equipe ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leiloes_equipe_all" ON public.leiloes_equipe;
CREATE POLICY "leiloes_equipe_all" ON public.leiloes_equipe FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_leiloes_equipe_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leiloes_equipe_updated_at ON public.leiloes_equipe;
CREATE TRIGGER leiloes_equipe_updated_at
    BEFORE UPDATE ON public.leiloes_equipe
    FOR EACH ROW EXECUTE FUNCTION public.touch_leiloes_equipe_updated_at();

-- ── CRONOGRAMA DE LEILÕES (agenda oficial / source of truth) ─
CREATE TABLE IF NOT EXISTS public.cronograma_leiloes (
    id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    data                    DATE NOT NULL,
    dia_semana              TEXT,
    hora                    TEXT,
    nome                    TEXT NOT NULL,
    criador                 TEXT,
    presencial              TEXT,
    leiloeira               TEXT,
    raca                    TEXT,
    qtd_animais             INTEGER,
    sexo                    TEXT,
    comissao                TEXT,
    contrato                TEXT,
    faturamento_previsto    NUMERIC(14,2),
    faturamento_realizado   NUMERIC(14,2),
    venda_bula              NUMERIC(14,2),
    comissao_receber        NUMERIC(14,2),
    recebido                TEXT,
    catalogo_url            TEXT,
    img                     TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.cronograma_leiloes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cronograma_leiloes_all" ON public.cronograma_leiloes;
CREATE POLICY "cronograma_leiloes_all" ON public.cronograma_leiloes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_cronograma_leiloes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cronograma_leiloes_updated_at ON public.cronograma_leiloes;
CREATE TRIGGER trg_cronograma_leiloes_updated_at
    BEFORE UPDATE ON public.cronograma_leiloes
    FOR EACH ROW EXECUTE FUNCTION public.update_cronograma_leiloes_updated_at();

-- ── ACORDOS COMERCIAIS COM CRIADORES / LEILOEIRAS ──────────
CREATE TABLE IF NOT EXISTS public.bula_acordos_criadores (
    id                          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    contraparte                 TEXT NOT NULL,
    tipo                        TEXT NOT NULL CHECK (tipo IN ('criador', 'leiloeira_propria')),
    pct_faturamento             NUMERIC(7,5),
    pct_venda_cobertura         NUMERIC(7,5),
    descricao                   TEXT,
    vigencia_inicio             DATE,
    vigencia_fim                DATE,
    observacoes                 TEXT,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bula_acordos_contraparte ON public.bula_acordos_criadores (LOWER(contraparte));
CREATE INDEX IF NOT EXISTS idx_bula_acordos_vigencia ON public.bula_acordos_criadores (vigencia_inicio, vigencia_fim);

ALTER TABLE public.bula_acordos_criadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bula_acordos_select" ON public.bula_acordos_criadores;
CREATE POLICY "bula_acordos_select" ON public.bula_acordos_criadores FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bula_acordos_modify" ON public.bula_acordos_criadores;
CREATE POLICY "bula_acordos_modify" ON public.bula_acordos_criadores FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- FK retroativa em bula_leilao_fechamento.acordo_criador_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'bula_fechamento_acordo_criador_fk'
    ) THEN
        ALTER TABLE public.bula_leilao_fechamento
            ADD CONSTRAINT bula_fechamento_acordo_criador_fk
            FOREIGN KEY (acordo_criador_id)
            REFERENCES public.bula_acordos_criadores(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- ── COMISSÕES PADRÃO DOS ASSESSORES ────────────────────────
CREATE TABLE IF NOT EXISTS public.bula_comissoes_padrao_assessor (
    id                              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome                            TEXT NOT NULL,
    empresa                         TEXT CHECK (empresa IN ('Bula Assessoria', 'Fórmula do Boi', 'Outro')),
    pct_leilao                      NUMERIC(7,5),
    pct_semen_proprio               NUMERIC(7,5),
    pct_semen_residual_indicacao    NUMERIC(7,5),
    pct_embrioes_proprio            NUMERIC(7,5),
    indicado_por_id                 UUID REFERENCES public.bula_comissoes_padrao_assessor(id) ON DELETE SET NULL,
    ativo                           BOOLEAN DEFAULT TRUE,
    vigencia_inicio                 DATE,
    observacoes                     TEXT,
    created_at                      TIMESTAMPTZ DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bula_comissoes_nome ON public.bula_comissoes_padrao_assessor (LOWER(nome));
CREATE INDEX IF NOT EXISTS idx_bula_comissoes_indicado_por ON public.bula_comissoes_padrao_assessor (indicado_por_id);

ALTER TABLE public.bula_comissoes_padrao_assessor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bula_comissoes_select" ON public.bula_comissoes_padrao_assessor;
CREATE POLICY "bula_comissoes_select" ON public.bula_comissoes_padrao_assessor FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bula_comissoes_modify" ON public.bula_comissoes_padrao_assessor;
CREATE POLICY "bula_comissoes_modify" ON public.bula_comissoes_padrao_assessor FOR ALL TO authenticated USING (true) WITH CHECK (true);
