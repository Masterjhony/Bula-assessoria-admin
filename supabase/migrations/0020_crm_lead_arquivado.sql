-- Soft-delete / arquivamento de leads do CRM.
-- Um lead arquivado some das telas de Qualificação, Kanban e da lista de Leads,
-- mas continua no banco (recuperável na aba "Arquivados"). Excluir de vez é uma
-- ação separada (DELETE) feita a partir dessa aba.
ALTER TABLE public.crm_leads
    ADD COLUMN IF NOT EXISTS arquivado boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS arquivado_at timestamptz;

-- Índice para as consultas filtrarem por arquivado/não-arquivado rapidamente.
CREATE INDEX IF NOT EXISTS idx_crm_leads_arquivado ON public.crm_leads (arquivado);
