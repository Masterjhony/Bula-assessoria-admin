-- ============================================================
-- 0056_erp_folha_estrutura.sql — Cadastro canônico de Folha & Comissões
--
-- A estrutura (salário fixo + % de comissão por assessor) vivia hardcoded no
-- front do ERP. O chefe pediu para FIXAR no sistema: vira cadastro editável
-- (tela Folha & Comissões, finance-admin) e fonte da projeção anual de custos
-- fixos (scripts/projeta-folha-fixa-2026.mjs).
--
-- comissao_pct  = % sobre a base de venda do assessor (a base NÃO é o VGV do
--                 fechamento — ver acordos/comissionamento).
-- comissao_fixa = valor fixo mensal em R$ (caso do SDR).
-- Fonte do seed: planilha "FOLHA & ESTRUTURA DE COMISSÕES" do chefe (jul/2026).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.erp_folha_estrutura (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome          TEXT NOT NULL UNIQUE,
    funcao        TEXT,
    salario_fixo  NUMERIC(12,2) NOT NULL DEFAULT 0,
    comissao_pct  NUMERIC(6,3),           -- ex.: 3.000 = 3%
    comissao_fixa NUMERIC(12,2),          -- comissão fixa mensal em R$ (SDR)
    ativo         BOOLEAN NOT NULL DEFAULT TRUE,
    ordem         INTEGER NOT NULL DEFAULT 0,
    observacao    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.erp_folha_estrutura ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "erp_folha_estrutura_read" ON public.erp_folha_estrutura;
CREATE POLICY "erp_folha_estrutura_read" ON public.erp_folha_estrutura
    FOR SELECT TO authenticated USING (true);
-- escrita apenas via service role (API valida finance-admin)

INSERT INTO public.erp_folha_estrutura (nome, funcao, salario_fixo, comissao_pct, comissao_fixa, ordem, observacao) VALUES
    ('FABIO OMENNA',  'Assessor Comercial',      11700, 3.0,  NULL, 1, NULL),
    ('DOUGLAS BISPO', 'Assessor Comercial',       3600, 2.0,  NULL, 2, NULL),
    ('LEONARDO',      'Assessor Técnico',        13500, 2.0,  NULL, 3, NULL),
    ('GUSTAVO RUSA',  'Parceiro',                    0, 5.0,  NULL, 4, 'Parceiro: sem salário fixo, só comissão.'),
    ('JOÃO EDUARDO',  'Tecnologia e Financeiro',  3000, NULL, NULL, 5, NULL),
    ('JOÃO GABRIEL',  'Marketing',                2000, NULL, NULL, 6, NULL),
    ('JOÃO ANTONIO',  'SDR',                      2000, NULL, 2000, 7, 'Comissão fixa mensal de R$ 2.000 além do salário.')
ON CONFLICT (nome) DO NOTHING;
