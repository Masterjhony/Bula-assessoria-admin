import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const runtime = 'nodejs'

function hashCode(code: string) {
    return crypto.createHash('sha256').update(code).digest('hex')
}

const MAX_ATTEMPTS = 5

export async function POST(request: Request) {
    try {
        const { email, code, password, fullName } = await request.json()

        if (!email || !code || !password) {
            return NextResponse.json({ error: 'Preencha todos os campos.' }, { status: 400 })
        }

        const normalizedEmail = String(email).trim().toLowerCase()
        const normalizedCode = String(code).trim()

        if (typeof password !== 'string' || password.length < 8) {
            return NextResponse.json(
                { error: 'A senha deve ter pelo menos 8 caracteres.' },
                { status: 400 }
            )
        }

        if (!/^\d{6}$/.test(normalizedCode)) {
            return NextResponse.json({ error: 'Código inválido.' }, { status: 400 })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json({ error: 'Servidor não configurado.' }, { status: 500 })
        }

        const supabase = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        })

        // Most recent unconsumed, unexpired code for this email
        const { data: rows, error: fetchError } = await supabase
            .from('signup_verification_codes')
            .select('id, code_hash, expires_at, consumed_at, attempts, full_name')
            .eq('email', normalizedEmail)
            .is('consumed_at', null)
            .order('created_at', { ascending: false })
            .limit(1)

        if (fetchError) {
            console.error('[verify-signup] fetch error:', fetchError)
            return NextResponse.json({ error: 'Erro ao validar código.' }, { status: 500 })
        }

        const row = rows?.[0]
        if (!row) {
            return NextResponse.json(
                { error: 'Código não encontrado. Solicite um novo código.' },
                { status: 400 }
            )
        }

        if (new Date(row.expires_at).getTime() < Date.now()) {
            return NextResponse.json(
                { error: 'Código expirado. Solicite um novo código.' },
                { status: 400 }
            )
        }

        if (row.attempts >= MAX_ATTEMPTS) {
            return NextResponse.json(
                { error: 'Tentativas excedidas. Solicite um novo código.' },
                { status: 429 }
            )
        }

        const providedHash = hashCode(normalizedCode)
        const a = Buffer.from(providedHash, 'hex')
        const b = Buffer.from(row.code_hash, 'hex')
        const codeOk = a.length === b.length && crypto.timingSafeEqual(a, b)

        if (!codeOk) {
            await supabase
                .from('signup_verification_codes')
                .update({ attempts: row.attempts + 1 })
                .eq('id', row.id)
            return NextResponse.json({ error: 'Código incorreto.' }, { status: 400 })
        }

        // Code is valid — create the user.
        const effectiveName =
            typeof fullName === 'string' && fullName.trim()
                ? fullName.trim()
                : row.full_name || null

        const { data: created, error: createError } = await supabase.auth.admin.createUser({
            email: normalizedEmail,
            password,
            email_confirm: true,
            user_metadata: effectiveName ? { full_name: effectiveName } : undefined,
        })

        if (createError) {
            const msg = createError.message || ''
            if (msg.toLowerCase().includes('already')) {
                return NextResponse.json(
                    { error: 'Este email já está cadastrado.' },
                    { status: 409 }
                )
            }
            console.error('[verify-signup] createUser error:', createError)
            return NextResponse.json({ error: 'Erro ao criar conta.' }, { status: 500 })
        }

        // Mark code consumed
        await supabase
            .from('signup_verification_codes')
            .update({ consumed_at: new Date().toISOString() })
            .eq('id', row.id)

        // Promote to admin so the new user can access the panel right after signup
        if (created.user?.id) {
            await supabase
                .from('profiles')
                .upsert(
                    {
                        id: created.user.id,
                        email: normalizedEmail,
                        full_name: effectiveName,
                        role: 'admin',
                    },
                    { onConflict: 'id' }
                )
        }

        return NextResponse.json({ ok: true })
    } catch (err: any) {
        console.error('[verify-signup] unexpected error:', err)
        return NextResponse.json({ error: 'Erro inesperado.' }, { status: 500 })
    }
}
