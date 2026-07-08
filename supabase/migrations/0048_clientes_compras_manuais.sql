-- ============================================================
-- 0048_clientes_compras_manuais.sql — Compras reportadas pelo assessor
-- O módulo Clientes deriva as compras dos fechamentos (bula_leilao_fechamento).
-- Para clientes trazidos por um assessor (ex.: carteira Douglas) que ainda não
-- estão nos fechamentos, guardamos o histórico de compras informado pelo
-- assessor aqui (leilão, lote, tipo, qtd, parcelas, valor). O getClientes só
-- exibe estas quando o cliente NÃO tem compras derivadas de fechamento — assim
-- nunca duplica VGV de quem já é comprador conhecido.
-- Formato: [{ id, data, descricao, leilao, categoria, cabecas, valor }]
-- ============================================================

ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS compras_manuais JSONB NOT NULL DEFAULT '[]'::jsonb;
