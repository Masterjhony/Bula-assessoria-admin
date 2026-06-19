-- ============================================================
-- 0033_clientes_cadastro.sql — Clientes prontos p/ cadastro em leiloeiras
-- Acrescenta ao módulo CLIENTES os dados necessários para cadastrar o
-- comprador nas leiloeiras parceiras (CPF, Inscrição Estadual, score de
-- crédito, protestos) e cria as tabelas de apoio:
--   • leiloeiras                 → registro das leiloeiras parceiras (alvo do
--                                  e-mail de submissão; define os requisitos)
--   • cliente_documentos         → metadados de anexos (bucket cliente-documentos)
--   • cliente_leiloeira_cadastro → status do cadastro do cliente por leiloeira
-- ============================================================

-- ── Campos de cadastro no cliente (overlay manual em public.clientes) ──
ALTER TABLE public.clientes
    ADD COLUMN IF NOT EXISTS cpf                    TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS inscricao_estadual     TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS tem_inscricao_estadual TEXT DEFAULT '',     -- 'Sim' | 'Não' | ''
    ADD COLUMN IF NOT EXISTS score_credito          INTEGER,             -- 0..1000 (Serasa-like)
    ADD COLUMN IF NOT EXISTS score_faixa            TEXT DEFAULT '',     -- baixo|regular|razoavel|bom|otimo
    ADD COLUMN IF NOT EXISTS score_consultado_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS protestos              JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS protestos_consultado_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS momento_pecuaria       TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS operacao_pecuaria      TEXT DEFAULT '';

-- ── Leiloeiras parceiras (registro + requisitos de cadastro) ──
CREATE TABLE IF NOT EXISTS public.leiloeiras (
    id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nome           TEXT NOT NULL,
    email_cadastro TEXT DEFAULT '',                 -- e-mail que recebe a submissão de cadastro
    contato        TEXT DEFAULT '',                 -- telefone/whatsapp/responsável
    requisitos     JSONB NOT NULL DEFAULT '{}'::jsonb, -- { require_ie, score_min, documentos:[] }
    observacoes    TEXT DEFAULT '',
    ativo          BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leiloeiras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leiloeiras_all" ON public.leiloeiras;
CREATE POLICY "leiloeiras_all" ON public.leiloeiras FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_leiloeiras_modtime ON public.leiloeiras;
CREATE TRIGGER update_leiloeiras_modtime
    BEFORE UPDATE ON public.leiloeiras
    FOR EACH ROW EXECUTE FUNCTION public.update_modified_column_crm();

-- ── Documentos anexados ao cliente (arquivos no bucket cliente-documentos) ──
CREATE TABLE IF NOT EXISTS public.cliente_documentos (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_key   TEXT NOT NULL,                    -- match_key (funciona p/ comprador derivado)
    cliente_id    UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
    tipo          TEXT DEFAULT 'outro',             -- cpf|comprovante|ie|contrato|outro
    nome_arquivo  TEXT NOT NULL,
    path          TEXT NOT NULL,                    -- caminho no bucket
    tamanho_bytes BIGINT DEFAULT 0,
    content_type  TEXT DEFAULT '',
    uploaded_by   TEXT DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cliente_documentos_key ON public.cliente_documentos (cliente_key);

ALTER TABLE public.cliente_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cliente_documentos_all" ON public.cliente_documentos;
CREATE POLICY "cliente_documentos_all" ON public.cliente_documentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Status do cadastro do cliente em cada leiloeira ──
CREATE TABLE IF NOT EXISTS public.cliente_leiloeira_cadastro (
    id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_key      TEXT NOT NULL,                 -- match_key do cliente
    leiloeira_id     UUID NOT NULL REFERENCES public.leiloeiras(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'pendente', -- pendente | enviado | aprovado | recusado
    enviado_at       TIMESTAMPTZ,
    aprovado_at      TIMESTAMPTZ,
    email_message_id TEXT DEFAULT '',
    observacoes      TEXT DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cliente_key, leiloeira_id)
);
CREATE INDEX IF NOT EXISTS idx_cliente_leiloeira_key ON public.cliente_leiloeira_cadastro (cliente_key);

ALTER TABLE public.cliente_leiloeira_cadastro ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cliente_leiloeira_cadastro_all" ON public.cliente_leiloeira_cadastro;
CREATE POLICY "cliente_leiloeira_cadastro_all" ON public.cliente_leiloeira_cadastro FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_cliente_leiloeira_modtime ON public.cliente_leiloeira_cadastro;
CREATE TRIGGER update_cliente_leiloeira_modtime
    BEFORE UPDATE ON public.cliente_leiloeira_cadastro
    FOR EACH ROW EXECUTE FUNCTION public.update_modified_column_crm();
