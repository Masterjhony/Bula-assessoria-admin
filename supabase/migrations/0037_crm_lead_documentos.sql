-- Anexos nos cards do CRM (RG/CPF, comprovantes, contratos…). Reaproveita o
-- bucket privado `cliente-documentos` (policies já criadas em 0034), apenas com
-- um prefixo de path próprio (crm-leads/<leadId>/...). Aqui fica só a tabela de
-- metadados, espelhando cliente_documentos (0033) mas chaveada por lead_id.

CREATE TABLE IF NOT EXISTS public.crm_lead_documentos (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id       UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
    tipo          TEXT DEFAULT 'outro',             -- cpf|comprovante|ie|contrato|outro
    nome_arquivo  TEXT NOT NULL,
    path          TEXT NOT NULL,                    -- caminho no bucket cliente-documentos
    tamanho_bytes BIGINT DEFAULT 0,
    content_type  TEXT DEFAULT '',
    uploaded_by   TEXT DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_lead_documentos_lead ON public.crm_lead_documentos (lead_id);

ALTER TABLE public.crm_lead_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_lead_documentos_all" ON public.crm_lead_documentos;
CREATE POLICY "crm_lead_documentos_all" ON public.crm_lead_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);
