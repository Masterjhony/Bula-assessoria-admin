-- ============================================================
-- 0043_ai_usage_log.sql
-- Log de uso das APIs de IA (OpenRouter) — concierge e transcrição de áudio.
-- Alimenta as métricas de "gasto de IA" na aba Métricas do cockpit de WhatsApp.
-- Gravação é best-effort no código (não quebra o fluxo se falhar).
-- ============================================================

create table if not exists public.ai_usage_log (
    id                uuid primary key default gen_random_uuid(),
    created_at        timestamptz not null default now(),
    provider          text not null default 'openrouter',
    model             text,
    kind              text,          -- 'concierge' | 'transcription' | 'chat'
    prompt_tokens     integer,
    completion_tokens integer,
    total_tokens      integer,
    cost_usd          numeric
);

create index if not exists ai_usage_log_created_at_idx on public.ai_usage_log (created_at desc);
