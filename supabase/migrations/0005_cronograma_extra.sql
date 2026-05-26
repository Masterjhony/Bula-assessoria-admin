-- ============================================================
-- 0005_cronograma_extra.sql — Colunas extras de cronograma_leiloes
-- Adicionadas no fórmula via ALTER manual (não presentes nos .sql),
-- mas necessárias para que a migração de dados não perca informação.
-- ============================================================

ALTER TABLE public.cronograma_leiloes
    ADD COLUMN IF NOT EXISTS catalogo_anexado_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS catalogo_origem TEXT;
