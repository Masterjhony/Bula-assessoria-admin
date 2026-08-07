-- Rotinas agendadas do agente WhatsApp: "todo dia às 8h me manda o resumo
-- financeiro". Criadas/canceladas pelo próprio chat (com confirmação) e
-- executadas pelo cron /api/cron/agente-rotinas — a instrução roda no agente
-- como se o dono tivesse mandado a mensagem naquele horário, com o papel dele.
-- Service-role only (RLS ligado sem policies).

CREATE TABLE IF NOT EXISTS public.agente_rotinas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       TEXT NOT NULL,             -- dono (destino em DM)
    chat_jid    TEXT,                      -- grupo de destino (NULL = DM)
    solicitante TEXT,
    instrucao   TEXT NOT NULL,             -- o pedido que o agente executa
    horario     TEXT NOT NULL,             -- 'HH:MM' em America/Sao_Paulo
    frequencia  TEXT NOT NULL DEFAULT 'diaria'
                CHECK (frequencia IN ('diaria', 'dias_uteis', 'semanal:0', 'semanal:1', 'semanal:2',
                                      'semanal:3', 'semanal:4', 'semanal:5', 'semanal:6')
                       OR frequencia LIKE 'mensal:%'),
    ativo       BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agente_rotinas_ativas_idx ON public.agente_rotinas (ativo, horario);

ALTER TABLE public.agente_rotinas ENABLE ROW LEVEL SECURITY;
