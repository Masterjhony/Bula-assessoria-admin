-- ============================================================
-- 0028_clientes.sql — Módulo CLIENTES (compradores)
-- Persiste cadastros manuais de clientes e o histórico de interações.
-- A lista de clientes em /sistema/clientes é montada agregando os
-- compradores reais dos fechamentos (bula_leilao_fechamento.compradores)
-- e cruzando com o CRM; estas tabelas guardam o que NÃO vem dali:
--   • clientes           → cadastros/edições manuais (overlay por match_key)
--   • cliente_interacoes → contatos registrados, inclusive para compradores
--                          derivados de fechamentos (anexados via cliente_key)
-- ============================================================

-- ── Cadastros manuais (overlay deduplicado pelo nome normalizado) ──
CREATE TABLE IF NOT EXISTS public.clientes (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    match_key        TEXT NOT NULL UNIQUE,            -- nome normalizado (dedup c/ fechamentos)
    nome             TEXT NOT NULL,
    responsavel      TEXT DEFAULT '',
    telefone         TEXT DEFAULT '',
    email            TEXT DEFAULT '',
    cidade           TEXT DEFAULT '',
    uf               TEXT DEFAULT '',
    perfil           TEXT DEFAULT 'Novo',
    status           TEXT DEFAULT 'quente',
    recorrente       BOOLEAN NOT NULL DEFAULT false,
    interesses       JSONB NOT NULL DEFAULT '[]'::jsonb,
    tags             JSONB NOT NULL DEFAULT '[]'::jsonb,
    observacoes      TEXT DEFAULT '',
    preferencias     TEXT DEFAULT '',
    proximo_followup DATE,
    crm_lead_id      UUID,                            -- vínculo opcional com crm_leads
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clientes_all" ON public.clientes;
CREATE POLICY "clientes_all" ON public.clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Reusa o trigger de updated_at criado em 0012 (update_modified_column_crm).
DROP TRIGGER IF EXISTS update_clientes_modtime ON public.clientes;
CREATE TRIGGER update_clientes_modtime
    BEFORE UPDATE ON public.clientes
    FOR EACH ROW EXECUTE FUNCTION public.update_modified_column_crm();

-- ── Histórico de interações comerciais ──
CREATE TABLE IF NOT EXISTS public.cliente_interacoes (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_key  TEXT NOT NULL,                       -- match_key (fechamento ou manual)
    cliente_id   UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
    tipo         TEXT NOT NULL DEFAULT 'WhatsApp',    -- WhatsApp | Ligação | E-mail | Visita | Reunião
    responsavel  TEXT DEFAULT '',
    nota         TEXT NOT NULL DEFAULT '',
    data         DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cliente_interacoes_key ON public.cliente_interacoes (cliente_key);

ALTER TABLE public.cliente_interacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cliente_interacoes_all" ON public.cliente_interacoes;
CREATE POLICY "cliente_interacoes_all" ON public.cliente_interacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
