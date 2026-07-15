-- ============================================================
-- 0050_bula_leilao_vendas.sql — Vendas capturadas do pregão ao vivo
--
-- O grupo "Lances Bula Assessoria" (Baileys) é um fluxo contínuo de vários
-- leilões. Uma IA extrai as VENDAS confirmadas ("levou lote 35 por 900",
-- "comprador Luis Antonio") e grava aqui — 1 linha por lote arrematado. O
-- leilão do dia é resolvido por DATA (cronograma_leiloes) + grupo. Dedup por
-- message_id (o history sync reenvia as mesmas mensagens). Acesso via service
-- role (backend): group-inbound insere, o módulo Clientes/relatórios lê.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bula_leilao_vendas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_jid     TEXT NOT NULL,
    message_id    TEXT UNIQUE,                  -- dedup (mesma msg do sync não duplica)
    raw_text      TEXT,                         -- mensagem original
    quoted_text   TEXT,                         -- msg citada (contexto do comprador)
    lote          TEXT,                         -- número/rótulo do lote
    valor         NUMERIC(14,2),                -- valor da venda/arremate
    comprador     TEXT,                         -- nome do comprador (quando informado)
    cronograma_id UUID REFERENCES public.cronograma_leiloes(id) ON DELETE SET NULL,
    leilao_data   DATE,                         -- data do pregão (resolução do leilão)
    confidence    NUMERIC(4,3),                 -- confiança da extração por IA (0..1)
    status        TEXT NOT NULL DEFAULT 'auto', -- auto | revisar
    msg_ts        TIMESTAMPTZ,                  -- timestamp da mensagem no WhatsApp
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bula_leilao_vendas_data ON public.bula_leilao_vendas (leilao_data);
CREATE INDEX IF NOT EXISTS idx_bula_leilao_vendas_cron ON public.bula_leilao_vendas (cronograma_id);

ALTER TABLE public.bula_leilao_vendas ENABLE ROW LEVEL SECURITY;

-- Grupo(s) de lances monitorado(s), lido pelo /api/whatsapp/group-inbound.
INSERT INTO public.site_settings (key, value)
VALUES ('whatsapp_lances_groups', '{"jids":["120363162972078973@g.us"]}'::jsonb)
ON CONFLICT (key) DO NOTHING;
