-- ============================================================
-- 0006_cronograma_text_columns.sql
-- O cronograma do fórmula trata campos numéricos como TEXT
-- (aceita string vazia '' como valor "não informado"). Para
-- preservar 100% dos dados durante a migração, ajustamos os
-- tipos no web-bula para casar com o de origem.
-- ============================================================

ALTER TABLE public.cronograma_leiloes
    ALTER COLUMN faturamento_previsto TYPE TEXT USING faturamento_previsto::text,
    ALTER COLUMN faturamento_realizado TYPE TEXT USING faturamento_realizado::text,
    ALTER COLUMN venda_bula TYPE TEXT USING venda_bula::text,
    ALTER COLUMN comissao_receber TYPE TEXT USING comissao_receber::text,
    ALTER COLUMN qtd_animais TYPE TEXT USING qtd_animais::text;
