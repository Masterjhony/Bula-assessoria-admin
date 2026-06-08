-- ============================================================
-- 0016_crm_perfil_fields.sql — CRM: campos de perfil/qualificação
-- ------------------------------------------------------------
-- Corrige o erro ao salvar um NOVO lead no CRM: o formulário envia
-- colunas que nunca foram criadas em crm_leads (intencao_investimento,
-- assessoria, is_mql, momento_pecuaria) e o Postgres rejeita o INSERT
-- com "column ... does not exist". Aqui garantimos que todas existam.
--
-- Também adiciona os campos novos pedidos no painel:
--   cpf, inscricao_estadual (Identificação),
--   operacao_pecuaria (Perfil & Qualificação),
--   temperatura (substitui "probabilidade" no card do lead).
--
-- Tudo idempotente (ADD COLUMN IF NOT EXISTS) — seguro de reaplicar.
-- ============================================================

ALTER TABLE public.crm_leads
    -- Identificação
    ADD COLUMN IF NOT EXISTS cpf                       TEXT,
    ADD COLUMN IF NOT EXISTS inscricao_estadual        TEXT,
    -- Perfil & Qualificação
    ADD COLUMN IF NOT EXISTS operacao_pecuaria         TEXT,
    -- Card do lead (substitui probabilidade na UI; probabilidade segue
    -- existindo para o módulo Funil de Vendas)
    ADD COLUMN IF NOT EXISTS temperatura               TEXT,
    -- Colunas que o formulário já enviava mas nunca foram criadas
    -- (raiz do erro ao salvar novo lead):
    ADD COLUMN IF NOT EXISTS momento_pecuaria          TEXT,
    ADD COLUMN IF NOT EXISTS intencao_investimento     TEXT,
    ADD COLUMN IF NOT EXISTS assessoria                TEXT,
    ADD COLUMN IF NOT EXISTS is_mql                    BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.crm_leads.operacao_pecuaria IS
    'Operação na pecuária: cria-corte | recria-corte | engorda-corte | ciclo-completo-corte | criador-gado-po.';
COMMENT ON COLUMN public.crm_leads.temperatura IS
    'Temperatura do lead: frio | morno | quente.';
