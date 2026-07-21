-- ============================================================
-- 0055_erp_resultados_historico.sql — Resultados mensais históricos
--
-- A página "Resultados" do ERP mostra a evolução mensal da operação
-- (leilões, lotes, VGV da equipe). De abr/2026 em diante tudo é calculado
-- ao vivo de bula_leilao_fechamento; anos ANTERIORES ao sistema (2025) não
-- têm fechamento granular — entram aqui como agregado mensal consolidado.
--
-- Convenção: mes 1..12 = agregado do mês; mes 0 = consolidado ANUAL, usado
-- para métricas que não somam mês a mês (vendedores/compradores ÚNICOS no
-- ano). Fonte do seed 2025: relatório Power BI enviado pela equipe em
-- 20/07/2026 (Vendedores 85 · Compradores 387 · Lotes 1.267 · 190 leilões).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.erp_resultados_historico (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ano         INTEGER NOT NULL,
    mes         INTEGER NOT NULL DEFAULT 0 CHECK (mes BETWEEN 0 AND 12),
    leiloes     INTEGER,                -- nº de leilões assessorados no período
    lotes       INTEGER,                -- lotes vendidos pela equipe
    vgv         NUMERIC(14,2),          -- venda da equipe (VGV cobertura)
    vendedores  INTEGER,                -- vendedores únicos (só faz sentido em mes=0)
    compradores INTEGER,                -- compradores únicos (só faz sentido em mes=0)
    observacao  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ano, mes)
);

ALTER TABLE public.erp_resultados_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp_resultados_historico_read" ON public.erp_resultados_historico;
CREATE POLICY "erp_resultados_historico_read" ON public.erp_resultados_historico
    FOR SELECT TO authenticated USING (true);
-- escrita apenas via service role (APIs do ERP)

-- ── Seed 2025 (Power BI · resultados do ano) ────────────────
INSERT INTO public.erp_resultados_historico (ano, mes, leiloes, lotes, vgv, vendedores, compradores, observacao) VALUES
    (2025,  1,  2,   2,    25200.00, NULL, NULL, NULL),
    (2025,  2,  9,  35,   761700.00, NULL, NULL, NULL),
    (2025,  3, 11,  43,  1191000.00, NULL, NULL, NULL),
    (2025,  4, 15,  78,  3258000.00, NULL, NULL, NULL),
    (2025,  5, 21, 124,  5393740.00, NULL, NULL, NULL),
    (2025,  6, 15, 172,  8705500.00, NULL, NULL, NULL),
    (2025,  7, 15, 131,  7346230.00, NULL, NULL, NULL),
    (2025,  8, 30, 148, 15426797.90, NULL, NULL, NULL),
    (2025,  9, 22, 190,  5930600.00, NULL, NULL, NULL),
    (2025, 10, 24, 140,  6711420.00, NULL, NULL, NULL),
    (2025, 11, 17, 119,  5445600.00, NULL, NULL, NULL),
    (2025, 12,  9,  85,  3787000.00, NULL, NULL, NULL),
    (2025,  0, 190, 1267, 63982787.90, 85, 387, 'Fonte: relatório Power BI resultados 2025 (recebido 20/07/2026)')
ON CONFLICT (ano, mes) DO NOTHING;
