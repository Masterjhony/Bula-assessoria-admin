-- ─────────────────────────────────────────────────────────────────────────
-- Despesas variáveis no fechamento de leilões (ERP)
-- ─────────────────────────────────────────────────────────────────────────
-- Pedido do chefe (2026-06-08): a tabela de Fechamento de Leilões precisa de
-- "Imposto estimado (18%)" e "Despesas variáveis".
--
--   • Imposto estimado é SEMPRE 18% sobre a receita Bula (receita_bula) e é
--     calculado na UI — não precisa de coluna.
--   • Despesas variáveis é informado manualmente por fechamento → nova coluna.
--
-- Lucro líquido (calculado na UI) =
--   receita_bula − comissao_assessoria − (0,18 × receita_bula) − despesas_variaveis
--
-- Idempotente (ADD COLUMN IF NOT EXISTS).

ALTER TABLE public.bula_leilao_fechamento
  ADD COLUMN IF NOT EXISTS despesas_variaveis NUMERIC(12,2) DEFAULT 0;
