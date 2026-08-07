-- Open Finance (Pluggy): transações bancárias chegando automaticamente.
-- STAGING deliberado: nada entra direto em erp_movimentos_bancarios (o saldo é
-- derivado por trigger e a conciliação é um fluxo humano) — transação nova cai
-- aqui, o agente avisa no WhatsApp, e a entrada no ERP é um passo explícito.
-- Service-role only (RLS ligado sem policies).

CREATE TABLE IF NOT EXISTS public.openfinance_itens (
    item_id     TEXT PRIMARY KEY,          -- id do item no Pluggy (uma conexão banco+consentimento)
    connector   TEXT,                      -- nome do banco/conector
    status      TEXT,
    contas      JSONB,                     -- snapshot das contas (id, nome, saldo)
    last_sync   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.openfinance_transacoes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pluggy_tx_id   TEXT NOT NULL UNIQUE,   -- dedup absoluto
    item_id        TEXT NOT NULL,
    account_id     TEXT,
    conta          TEXT,                   -- rótulo amigável (banco/conta)
    data           DATE,
    descricao      TEXT,
    valor          NUMERIC(14,2),          -- negativo = saída
    categoria      TEXT,                   -- categoria do Pluggy (quando houver)
    raw            JSONB,
    processado     BOOLEAN NOT NULL DEFAULT FALSE,  -- já virou movimento no ERP?
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS openfinance_tx_data_idx ON public.openfinance_transacoes (data DESC);
CREATE INDEX IF NOT EXISTS openfinance_tx_pend_idx ON public.openfinance_transacoes (processado, data DESC);

ALTER TABLE public.openfinance_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.openfinance_transacoes ENABLE ROW LEVEL SECURITY;
