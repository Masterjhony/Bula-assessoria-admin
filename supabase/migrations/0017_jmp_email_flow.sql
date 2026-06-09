-- Fila do fluxo de e-mail marketing JMP + config geral da landing.
--
-- Cada lead que entra é "inscrito": para cada e-mail do fluxo habilitado,
-- gravamos uma linha pendente com o horário de envio. Um cron
-- (/api/jmp/email-cron) processa as linhas vencidas e dispara pelo SMTP.
-- Tudo via service role na API; RLS habilitada sem policies de anon.

CREATE TABLE IF NOT EXISTS public.jmp_email_queue (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id     UUID,
    to_email    TEXT NOT NULL,
    nome        TEXT,
    email_id    TEXT NOT NULL,                 -- id do e-mail no emailFlow
    lead_data   JSONB NOT NULL DEFAULT '{}'::jsonb, -- contexto p/ template
    send_at     TIMESTAMPTZ NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending', -- pending|sent|failed|skipped
    sent_at     TIMESTAMPTZ,
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.jmp_email_queue ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS jmp_email_queue_due_idx
    ON public.jmp_email_queue (status, send_at);
-- Evita duplicar a inscrição do mesmo lead no mesmo e-mail do fluxo.
CREATE UNIQUE INDEX IF NOT EXISTS jmp_email_queue_lead_email_ux
    ON public.jmp_email_queue (lead_id, email_id);

-- Config chave/valor da landing JMP (ex.: id da planilha do Google Sheets).
CREATE TABLE IF NOT EXISTS public.jmp_config (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.jmp_config ENABLE ROW LEVEL SECURITY;
