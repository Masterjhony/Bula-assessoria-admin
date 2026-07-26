-- ============================================================================
-- 0058_mercado_leiloes.sql — RADAR DE MERCADO (coleta pública + Apify)
--
-- Objetivo comercial: hoje a agenda da Bula nasce da planilha ESCALA, com sync
-- manual. Só enxergamos o leilão que já é nosso. Este schema guarda o que o
-- MERCADO está anunciando (agenda pública das leiloeiras), para responder três
-- perguntas que ninguém consegue responder hoje:
--
--   1. Que leilão existe no mercado e NÃO está no nosso cronograma? (gap)
--   2. Quem está fazendo quantos leilões, de que raça, em que praça?
--   3. Onde há catálogo publicado que a gente ainda não capturou?
--
-- Coleta em dois modos, por CUSTO (a conta Apify é plano free, US$5/mês):
--   • 'http'  — o HTML já traz o conteúdo → busca direta, custo ZERO
--   • 'apify' — site renderiza no cliente → headless via Apify, custo real
-- Só cai no Apify quem precisa. `mercado_coletas` registra o custo de cada run.
-- ============================================================================

-- ── 1) Fontes monitoradas ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mercado_fontes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Nome canônico da leiloeira. O cronograma tem grafias divergentes
    -- ("PROGRAMA LEILÕES" / "PROGRAMA LEILOES" / "PROGRAMA LEILÕEs"); aqui
    -- guardamos UMA forma e casamos por slug.
    leiloeira       TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    site_url        TEXT NOT NULL,
    -- Template da página de agenda. `{data}` é substituído por DD-MM-AAAA.
    agenda_url      TEXT,
    modo            TEXT NOT NULL DEFAULT 'http' CHECK (modo IN ('http', 'apify')),
    ativo           BOOLEAN NOT NULL DEFAULT true,
    observacoes     TEXT,
    ultima_coleta_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2) Eventos descobertos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mercado_eventos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fonte_id        UUID REFERENCES public.mercado_fontes(id) ON DELETE SET NULL,
    leiloeira       TEXT NOT NULL,
    nome            TEXT NOT NULL,
    data            DATE,
    hora            TEXT,
    categoria       TEXT,                 -- "Nelore PO", "Máquinas e Implementos"…
    local           TEXT,                 -- "Londrina - PR"
    uf              TEXT,
    url             TEXT,
    catalogo_url    TEXT,
    -- Impressão digital estável do evento (leiloeira+data+nome normalizados).
    -- É o que torna a coleta IDEMPOTENTE: rodar 10x não duplica.
    fingerprint     TEXT NOT NULL UNIQUE,
    -- Casamento com a nossa agenda. NULL = não está no cronograma (o "gap",
    -- que é justamente o valor comercial da tabela).
    cronograma_id   UUID,
    match_score     NUMERIC,
    -- Quando este evento apareceu pela 1ª vez e quando foi visto por último.
    -- Sumiu da agenda da leiloeira? `visto_em` para de avançar → cancelamento.
    descoberto_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    visto_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mercado_eventos_data      ON public.mercado_eventos (data DESC);
CREATE INDEX IF NOT EXISTS idx_mercado_eventos_leiloeira ON public.mercado_eventos (leiloeira);
CREATE INDEX IF NOT EXISTS idx_mercado_eventos_gap       ON public.mercado_eventos (data) WHERE cronograma_id IS NULL;

-- ── 3) Log de coletas (inclui custo do Apify) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.mercado_coletas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fonte_id        UUID REFERENCES public.mercado_fontes(id) ON DELETE SET NULL,
    modo            TEXT NOT NULL,
    apify_run_id    TEXT,
    apify_actor     TEXT,
    status          TEXT NOT NULL DEFAULT 'ok',   -- ok | erro | parcial
    paginas         INTEGER NOT NULL DEFAULT 0,
    eventos_novos   INTEGER NOT NULL DEFAULT 0,
    eventos_vistos  INTEGER NOT NULL DEFAULT 0,
    custo_usd       NUMERIC NOT NULL DEFAULT 0,
    duracao_ms      INTEGER,
    erro            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mercado_coletas_created ON public.mercado_coletas (created_at DESC);

-- ── 4) RLS (mesmo padrão das demais tabelas do sistema) ─────────────────────
ALTER TABLE public.mercado_fontes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercado_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercado_coletas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mercado_fontes_all" ON public.mercado_fontes;
CREATE POLICY "mercado_fontes_all" ON public.mercado_fontes FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "mercado_eventos_all" ON public.mercado_eventos;
CREATE POLICY "mercado_eventos_all" ON public.mercado_eventos FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "mercado_coletas_all" ON public.mercado_coletas;
CREATE POLICY "mercado_coletas_all" ON public.mercado_coletas FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

-- ── 5) updated_at ───────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_mercado_fontes_updated ON public.mercado_fontes;
CREATE TRIGGER trg_mercado_fontes_updated BEFORE UPDATE ON public.mercado_fontes
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_mercado_eventos_updated ON public.mercado_eventos;
CREATE TRIGGER trg_mercado_eventos_updated BEFORE UPDATE ON public.mercado_eventos
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 6) Seed das fontes confirmadas (domínios verificados em 25/07/2026) ─────
INSERT INTO public.mercado_fontes (leiloeira, slug, site_url, agenda_url, modo, observacoes) VALUES
    ('Programa Leilões', 'programa-leiloes', 'https://programaleiloes.com.br',
     'https://programaleiloes.com.br/agenda/{data}', 'http',
     'Agenda por dia (DD-MM-AAAA) server-rendered: coleta direta, custo zero. O botão "Exibir mais leilões" é JS — se faltar evento, subir esta fonte para modo apify.'),
    ('Agreste Leilões', 'agreste-leiloes', 'https://agresteleiloes.com.br', NULL, 'apify',
     'Estrutura ainda não mapeada — entra pelo crawler genérico.'),
    ('Central Leilões', 'central-leiloes', 'https://centralleiloes.com.br', NULL, 'apify',
     'Estrutura ainda não mapeada — entra pelo crawler genérico.')
ON CONFLICT (slug) DO NOTHING;
