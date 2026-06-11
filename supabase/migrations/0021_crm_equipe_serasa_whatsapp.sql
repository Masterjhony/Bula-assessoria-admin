-- CRM: campos de análise financeira e suporte às automações por usuário.
-- Idempotente: seguro de reaplicar.

ALTER TABLE public.crm_leads
    ADD COLUMN IF NOT EXISTS score_serasa INTEGER,
    ADD COLUMN IF NOT EXISTS pendencias_financeiras TEXT;

COMMENT ON COLUMN public.crm_leads.score_serasa IS
    'Score Serasa informado no atendimento do lead.';
COMMENT ON COLUMN public.crm_leads.pendencias_financeiras IS
    'Se o lead tem pendências financeiras no nome: Sim | Não.';

CREATE INDEX IF NOT EXISTS idx_crm_leads_responsavel
    ON public.crm_leads (responsavel)
    WHERE responsavel IS NOT NULL;
