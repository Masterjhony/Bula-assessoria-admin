-- ============================================================================
-- 0059_mercado_medias.sql — MÉDIAS DE LEILÃO (sinal de preço)
--
-- O radar de 0058 responde ONDE e QUANDO o mercado leiloa. Isto acrescenta POR
-- QUANTO: o Leiloboi publica, em cada leilão realizado, a tabela de médias por
-- sexo / categoria / faixa de idade. É a única fonte de preço praticado que o
-- sistema passa a ter — hoje o assessor argumenta de memória.
--
-- Uma linha por (evento × sexo × descrição × idade). Idempotente por
-- `fingerprint`, mesma estratégia de mercado_eventos: recoletar não duplica.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mercado_medias (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id       UUID REFERENCES public.mercado_eventos(id) ON DELETE CASCADE,
    leiloeira       TEXT NOT NULL,
    evento_nome     TEXT NOT NULL,
    data            DATE,
    sexo            TEXT,                 -- 'M' | 'F'
    descricao       TEXT,                 -- "NELORE", "NELORE PO"…
    idade           TEXT,                 -- "ATÉ 12 MESES", "VACAS PRENHES"…
    peso            TEXT,
    valor           NUMERIC,              -- média em R$
    kg_vivo         TEXT,
    fingerprint     TEXT NOT NULL UNIQUE,
    coletado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mercado_medias_data   ON public.mercado_medias (data DESC);
CREATE INDEX IF NOT EXISTS idx_mercado_medias_evento ON public.mercado_medias (evento_id);

ALTER TABLE public.mercado_medias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mercado_medias_all" ON public.mercado_medias;
CREATE POLICY "mercado_medias_all" ON public.mercado_medias FOR ALL
    USING (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

-- ── Fontes ganham um PARSER explícito ───────────────────────────────────────
-- `modo` diz COMO buscar (http × apify). `parser` diz COMO LER. Sem separar os
-- dois, adicionar um site novo obrigava a inventar um modo novo.
ALTER TABLE public.mercado_fontes
    ADD COLUMN IF NOT EXISTS parser TEXT NOT NULL DEFAULT 'generico';

UPDATE public.mercado_fontes SET parser = 'programa'  WHERE slug = 'programa-leiloes';
UPDATE public.mercado_fontes SET parser = 'generico'  WHERE parser IS NULL OR parser = '';

-- Leiloboi: agenda + RESULTADOS COM MÉDIAS. Listagem por mês em
-- /resultados?anomes=MM-AAAA (server-rendered, custo zero) e uma página de
-- detalhe por leilão com a tabela de médias.
INSERT INTO public.mercado_fontes (leiloeira, slug, site_url, agenda_url, modo, parser, observacoes) VALUES
    ('Leiloboi', 'leiloboi', 'https://leiloboi.com',
     'https://leiloboi.com/resultados?anomes={mesano}', 'http', 'leiloboi',
     'Listagem por mês (?anomes=MM-AAAA) + página de detalhe com "Médias do leilão". Marca cada evento como Corte ou Elite — Elite é o PO. Fonte única de preço praticado no sistema.')
ON CONFLICT (slug) DO UPDATE
    SET agenda_url = EXCLUDED.agenda_url,
        parser     = EXCLUDED.parser,
        modo       = EXCLUDED.modo,
        ativo      = true;
