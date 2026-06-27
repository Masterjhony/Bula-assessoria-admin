-- ============================================================
-- 0042_leilao_assertividade.sql
-- Guarda o resultado da comparação da extração (videoextrator) contra o
-- fechamento real da Bula: o índice de assertividade + o detalhe "onde errou"
-- (per_buyer). Preenchido pela VPS (core/fechamento_compare.py).
-- ============================================================

ALTER TABLE public.bula_leilao_video_analise
    ADD COLUMN IF NOT EXISTS indice_assertividade NUMERIC,
    ADD COLUMN IF NOT EXISTS assertividade JSONB,
    ADD COLUMN IF NOT EXISTS assertividade_em TIMESTAMPTZ;
