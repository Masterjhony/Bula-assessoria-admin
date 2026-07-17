-- ============================================================
-- 0052_lances_vendas_policy.sql — Acesso do painel às vendas do pregão
--
-- 0050 criou bula_leilao_vendas com RLS ligado e SEM policy (só o backend
-- service-role escrevia). A página /sistema/lances (validação + import pro
-- fechamento) usa o client autenticado do painel — mesmo padrão das demais
-- tabelas do admin (cronograma_leiloes_all, bula_fechamento_all).
-- ============================================================

DROP POLICY IF EXISTS "bula_leilao_vendas_all" ON public.bula_leilao_vendas;
CREATE POLICY "bula_leilao_vendas_all" ON public.bula_leilao_vendas
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
