-- Ponte Dev do agente interno: fila de tarefas que a BRIDGE LOCAL (PC do João)
-- executa com Claude Code (alterar o sistema, relatórios caprichados) ou Codex
-- (monitoramentos e tarefas avulsas). O agente WhatsApp só ENFILEIRA (após o
-- "sim" do admin); quem executa e avisa a conclusão é a bridge.
-- Service-role only (RLS ligado sem policies).

CREATE TABLE IF NOT EXISTS public.agente_dev_tarefas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    runner      TEXT NOT NULL CHECK (runner IN ('claude', 'codex')),
    descricao   TEXT NOT NULL,
    solicitante TEXT,
    phone       TEXT,               -- quem avisar no WhatsApp ao terminar
    status      TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'rodando', 'concluida', 'erro', 'cancelada')),
    resultado   TEXT,
    exit_code   INT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at  TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agente_dev_tarefas_fila_idx
    ON public.agente_dev_tarefas (status, created_at);

ALTER TABLE public.agente_dev_tarefas ENABLE ROW LEVEL SECURITY;
