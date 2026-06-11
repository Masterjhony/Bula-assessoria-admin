-- ============================================================
-- 0025_crm_normalize_lead_statuses.sql
-- Canoniza status legados dos leads para evitar divergencia entre
-- banco, Entrada Leads e Kanban.
-- ============================================================

UPDATE public.crm_leads
SET status = 'CONEXÃO'
WHERE status IS NULL
   OR btrim(status) = ''
   OR lower(btrim(status)) IN ('lead', 'sem status', 'conexão', 'conexao');

UPDATE public.crm_leads
SET status = 'QUALIFICAÇÃO'
WHERE lower(btrim(status)) IN ('qualificação', 'qualificacao', 'perdido');

UPDATE public.crm_leads
SET status = 'CADASTRO'
WHERE lower(btrim(status)) IN ('cadastro', 'qualificado');

UPDATE public.crm_leads
SET status = 'ASSESSORES'
WHERE lower(btrim(status)) IN ('assessores', 'direcionamento leilão', 'direcionamento leilao', 'proposta', 'negociação', 'negociacao', 'fechado');
