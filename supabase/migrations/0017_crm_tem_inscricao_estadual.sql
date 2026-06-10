-- ============================================================
-- 0017_crm_tem_inscricao_estadual.sql — CRM: flag "tem Inscrição Estadual?"
-- ------------------------------------------------------------
-- O formulário da landing JMP passou a perguntar (obrigatório) se o lead
-- TEM inscrição estadual (Sim/Não). Isso é diferente da coluna
-- inscricao_estadual já existente, que guarda o NÚMERO da IE. Por isso uma
-- coluna dedicada para a resposta Sim/Não.
--
-- Idempotente (ADD COLUMN IF NOT EXISTS) — seguro de reaplicar.
-- ============================================================

ALTER TABLE public.crm_leads
    ADD COLUMN IF NOT EXISTS tem_inscricao_estadual TEXT;

COMMENT ON COLUMN public.crm_leads.tem_inscricao_estadual IS
    'Resposta da landing JMP (Sim/Não): se o lead possui inscrição estadual. Distinta de inscricao_estadual (o número da IE).';
