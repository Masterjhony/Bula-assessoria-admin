-- Remove o Open Finance (Pluggy). A integração funcionava ponta a ponta, mas só
-- com o banco sandbox: a credencial disponível era de aplicação "demo" (uso
-- comercial proibido) e o plano de produção da Pluggy começa em R$ 2.500/mês —
-- caro demais para ler o extrato de duas contas próprias. As tabelas continham
-- apenas dados de teste do conector "Pluggy Bank".
-- Substitui 0067_openfinance.sql (removido).

DROP TABLE IF EXISTS public.openfinance_transacoes;
DROP TABLE IF EXISTS public.openfinance_itens;
