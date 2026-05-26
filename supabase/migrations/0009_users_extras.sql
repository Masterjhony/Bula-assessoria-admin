-- ============================================================
-- 0009_users_extras.sql — Fase 5 (Usuários & Configurações)
-- Estende profiles com colunas usadas pelo painel de admin do
-- fórmula (email, role, full_name + 7 campos de cadastro) e
-- adiciona signup_verification_codes.
-- ============================================================

-- ── PROFILES: colunas adicionais ────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='email') THEN
        ALTER TABLE public.profiles ADD COLUMN email TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='role') THEN
        ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'user';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='full_name') THEN
        ALTER TABLE public.profiles ADD COLUMN full_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='avatar_url') THEN
        ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='phone') THEN
        ALTER TABLE public.profiles ADD COLUMN phone TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='farm_name') THEN
        ALTER TABLE public.profiles ADD COLUMN farm_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='estado') THEN
        ALTER TABLE public.profiles ADD COLUMN estado TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='cidade') THEN
        ALTER TABLE public.profiles ADD COLUMN cidade TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='momento_pecuaria') THEN
        ALTER TABLE public.profiles ADD COLUMN momento_pecuaria TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='o_que_busca') THEN
        ALTER TABLE public.profiles ADD COLUMN o_que_busca TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='quantidade_animais') THEN
        ALTER TABLE public.profiles ADD COLUMN quantidade_animais TEXT;
    END IF;
END $$;

-- Backfill email a partir de auth.users (usuários já existentes no web-bula)
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- ── SIGNUP VERIFICATION CODES (admin panel signup via email) ─
CREATE TABLE IF NOT EXISTS public.signup_verification_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    full_name   TEXT,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    attempts    INT NOT NULL DEFAULT 0,
    ip          TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signup_codes_email_created
    ON public.signup_verification_codes (email, created_at DESC);

ALTER TABLE public.signup_verification_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON public.signup_verification_codes;
CREATE POLICY "service_role_all" ON public.signup_verification_codes
    FOR ALL TO service_role USING (true) WITH CHECK (true);
