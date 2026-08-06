-- ============================================================
-- 0063_erp_resultados_historico_receita.sql
--
-- A pagina "Resultados" ganhou um bloco comparativo ano x ano-1 que inclui
-- faturamento. O seed de 2025 (relatorio Power BI) so trouxe a operacao
-- (leiloes / lotes / VGV) — receita da assessoria nao existia no consolidado.
--
-- Esta coluna abre espaco para o faturamento historico ser preenchido quando
-- a apuracao de 2025 for levantada. Enquanto for NULL, a tela mostra o
-- comparativo de faturamento como "nao apurado" (e nunca um zero falso).
-- ============================================================

ALTER TABLE public.erp_resultados_historico
    ADD COLUMN IF NOT EXISTS receita NUMERIC(14,2);

COMMENT ON COLUMN public.erp_resultados_historico.receita IS
    'Faturamento da Bula (receita da assessoria) no periodo. NULL = nao apurado — a tela nao inventa zero.';
