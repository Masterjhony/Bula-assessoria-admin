-- ============================================================================
-- 0060_mercado_criadores.sql — RANKING ACNB (prospecção)
--
-- Terceira lente do radar, e a única que NÃO é sobre leilão: é sobre GENTE.
-- A ACNB publica o ranking oficial de Criador/Expositor da raça por calendário.
-- Cruzado com `clientes` e `crm_leads`, ele responde a pergunta que hoje ninguém
-- responde: **quais dos maiores criadores de Nelore do Brasil ainda não são
-- nossos?** — que é uma lista de prospecção qualificada por mérito público, não
-- por chute.
--
-- Fonte: API JSON/HTML pública da ACNB (srvneapp002.eastus.cloudapp.azure.com,
-- POST /Ranking/Resultado/PesquisaRankingCE). Custo ZERO, sem Apify.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mercado_criadores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    associacao      TEXT NOT NULL DEFAULT 'ACNB',
    calendario_id   INTEGER,
    calendario_nome TEXT,
    raca            TEXT NOT NULL DEFAULT 'Nelore',
    -- 'criador' | 'expositor' — o ranking CE cobre os dois papéis.
    tipo            TEXT NOT NULL DEFAULT 'criador',
    posicao         INTEGER,
    nome            TEXT NOT NULL,
    -- Nome normalizado: é por ele que o cruzamento com a nossa base acontece.
    nome_norm       TEXT NOT NULL,
    pessoa_id       TEXT,
    pontos          NUMERIC,

    -- ── Cruzamento com a base (recalculado a cada coleta) ──
    -- 'cliente'     → já está em `clientes`
    -- 'lead'        → está no CRM, ainda não virou cliente
    -- 'relacionado' → não é o mesmo nome, mas há contato nosso com sobrenome
    --                 RARO em comum ("LUCENTE & LUCENTE AGROPECUÁRIA" × "Cassio
    --                 Lucente"). Vale mais que um frio: existe porta de entrada.
    -- 'ausente'     → não temos ninguém: prospecção do zero
    situacao        TEXT NOT NULL DEFAULT 'ausente',
    cliente_key     TEXT,
    crm_lead_id     UUID,
    -- Quem na nossa base motivou o 'relacionado' (nome + id), para o assessor
    -- saber por quem puxar a conversa.
    relacionados    JSONB NOT NULL DEFAULT '[]'::jsonb,

    fingerprint     TEXT NOT NULL UNIQUE,
    coletado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mercado_criadores_pos      ON public.mercado_criadores (posicao);
CREATE INDEX IF NOT EXISTS idx_mercado_criadores_situacao ON public.mercado_criadores (situacao);
CREATE INDEX IF NOT EXISTS idx_mercado_criadores_norm     ON public.mercado_criadores (nome_norm);

ALTER TABLE public.mercado_criadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mercado_criadores_all" ON public.mercado_criadores;
CREATE POLICY "mercado_criadores_all" ON public.mercado_criadores FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

DROP TRIGGER IF EXISTS trg_mercado_criadores_updated ON public.mercado_criadores;
CREATE TRIGGER trg_mercado_criadores_updated BEFORE UPDATE ON public.mercado_criadores
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
