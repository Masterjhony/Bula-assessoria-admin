-- ============================================================
-- 0051_lances_parser_fechamento_auto.sql — Parser determinístico de lances
--
-- A captura do grupo "Lances Bula Assessoria" deixou de ser só-IA: um parser
-- determinístico extrai lote/parcela/qtd/sexo/assessor/comprador/fazenda/UF e
-- faz MERGE por (leilao_data, lote) — fichas parciais se completam na mesma
-- linha. Depois o fechamento do leilão é reconstruído automaticamente em
-- bula_leilao_fechamento (origem='lances-auto'; fechamentos manuais nunca são
-- tocados).
-- ============================================================

ALTER TABLE public.bula_leilao_vendas
    ADD COLUMN IF NOT EXISTS animais  INTEGER,
    ADD COLUMN IF NOT EXISTS sexo     TEXT,
    ADD COLUMN IF NOT EXISTS assessor TEXT,
    ADD COLUMN IF NOT EXISTS fazenda  TEXT,
    ADD COLUMN IF NOT EXISTS cidade   TEXT,
    ADD COLUMN IF NOT EXISTS uf       TEXT,
    ADD COLUMN IF NOT EXISTS fonte    TEXT NOT NULL DEFAULT 'parser';

-- Uma mensagem multi-lote ("Comprador do lote 513 e 515") vira 1 linha POR
-- lote com o MESMO message_id; e o merge atualiza message_id pro da última
-- mensagem que contribuiu. UNIQUE não serve mais (dedup real é por
-- (leilao_data, lote) + o log de whatsapp_messages no group-inbound).
ALTER TABLE public.bula_leilao_vendas DROP CONSTRAINT IF EXISTS bula_leilao_vendas_message_id_key;
CREATE INDEX IF NOT EXISTS idx_bula_leilao_vendas_msg ON public.bula_leilao_vendas (message_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bula_leilao_vendas_data_lote ON public.bula_leilao_vendas (leilao_data, lote);

-- Fechamentos gerados pela automação de lances (únicos que ela atualiza).
ALTER TABLE public.bula_leilao_fechamento ADD COLUMN IF NOT EXISTS origem TEXT;
