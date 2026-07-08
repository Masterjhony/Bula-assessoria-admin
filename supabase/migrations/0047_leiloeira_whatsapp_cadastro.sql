-- ============================================================
-- 0047_leiloeira_whatsapp_cadastro.sql — Cadastro em leiloeiras via GRUPO
-- do WhatsApp (Baileys) + rastro da decisão (aprovado/recusado no grupo).
--
-- Arquitetura: a API oficial (Cloud) fala com o CLIENTE; o Baileys (número
-- próprio) fala com a EQUIPE/PARCEIROS. Cada leiloeira ganha o JID do seu
-- grupo de cadastros ("Cadastros Bula e Programa", "Cadastros Bula Remates");
-- quando o checklist de habilitação completa, a ficha é postada no grupo com
-- um código (#CAD-XXXX). A resposta "aprovado"/"recusado" no grupo é captada
-- pelo VPS e fecha o ciclo (status + retorno ao cliente pela API oficial).
-- ============================================================

-- ── JID do grupo de cadastros da leiloeira (Baileys) ──
ALTER TABLE public.leiloeiras
    ADD COLUMN IF NOT EXISTS whatsapp_group_id   TEXT DEFAULT '',   -- ex.: 120363...@g.us
    ADD COLUMN IF NOT EXISTS whatsapp_group_name TEXT DEFAULT '';   -- nome do grupo (exibição)

-- ── Rastro da submissão/decisão por canal ──
ALTER TABLE public.cliente_leiloeira_cadastro
    ADD COLUMN IF NOT EXISTS canal        TEXT DEFAULT 'email',     -- email | whatsapp
    ADD COLUMN IF NOT EXISTS codigo       TEXT DEFAULT '',          -- CAD-XXXX (matching da resposta no grupo)
    ADD COLUMN IF NOT EXISTS crm_lead_id  UUID,                     -- lead de origem (submissão pré-cliente)
    ADD COLUMN IF NOT EXISTS decidido_at  TIMESTAMPTZ,              -- quando o grupo respondeu
    ADD COLUMN IF NOT EXISTS decidido_por TEXT DEFAULT '',          -- quem respondeu no grupo
    ADD COLUMN IF NOT EXISTS decisao_msg  TEXT DEFAULT '';          -- texto da resposta (auditoria)

CREATE INDEX IF NOT EXISTS idx_cliente_leiloeira_codigo
    ON public.cliente_leiloeira_cadastro (codigo) WHERE codigo <> '';
