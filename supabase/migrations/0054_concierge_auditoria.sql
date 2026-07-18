-- Auditor noturno do atendimento IA: um registro por conversa auditada por dia.
-- Lido pela aba "Auditoria IA" do CRM (via service role) e escrito pelo cron
-- /api/cron/auditoria-conversas.
create table if not exists crm_conversa_auditorias (
    id uuid primary key default gen_random_uuid(),
    dia date not null,
    phone text not null,
    lead_id uuid,
    lead_nome text,
    msgs_lead int not null default 0,
    msgs_bot int not null default 0,
    fase_final text,
    score int,
    resumo text,
    falhas jsonb not null default '[]'::jsonb,
    trava text,
    proxima_acao text,
    destaque text,
    modelo text,
    created_at timestamptz not null default now(),
    unique (dia, phone)
);

create index if not exists crm_conversa_auditorias_dia_idx
    on crm_conversa_auditorias (dia desc, score asc);

-- Acesso só pelo service role (as telas leem via server action com supabaseAdmin).
alter table crm_conversa_auditorias enable row level security;
