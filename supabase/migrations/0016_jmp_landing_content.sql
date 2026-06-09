-- Conteúdo editável da landing "Nelore JMP" (jmp.bulaassessoria.com),
-- gerenciado pelo painel adminjmp.*. Um único registro JSONB (id='default')
-- guarda flyers, galerias, textos do leilão, vídeos do YouTube e link do grupo.
--
-- Acesso é sempre via API server-side com service role (GET público lê,
-- POST autenticado grava), então mantemos RLS habilitada SEM policies para
-- anon/authenticated — ninguém alcança a tabela direto com a anon key.

CREATE TABLE IF NOT EXISTS public.jmp_landing_content (
    id         TEXT PRIMARY KEY DEFAULT 'default',
    data       JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.jmp_landing_content ENABLE ROW LEVEL SECURITY;

-- O bucket `jmp-landing` (público) é criado pelo script
-- scripts/setup-jmp-landing.mjs (Storage exige service role). Uploads são
-- feitos via service role na API, então não dependemos de policies de
-- storage.objects para INSERT — só leitura pública, garantida pelo bucket.
