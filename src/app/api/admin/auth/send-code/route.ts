import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { sendMail, renderVerificationCodeEmail } from '@/lib/email'

export const runtime = 'nodejs'

function hashCode(code: string) {
    return crypto.createHash('sha256').update(code).digest('hex')
}

function generateCode() {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

export async function POST(request: Request) {
    try {
        const { email, fullName } = await request.json()

        if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) {
            return NextResponse.json({ error: 'Email inválido.' }, { status: 400 })
        }

        const normalizedEmail = email.trim().toLowerCase()

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json({ error: 'Servidor não configurado.' }, { status: 500 })
        }

        const supabase = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        })

        // Throttle: at most 1 code per 60 seconds per email
        const sinceISO = new Date(Date.now() - 60_000).toISOString()
        const { data: recent } = await supabase
            .from('signup_verification_codes')
            .select('id, created_at')
            .eq('email', normalizedEmail)
            .gte('created_at', sinceISO)
            .limit(1)

        if (recent && recent.length > 0) {
            return NextResponse.json(
                { error: 'Aguarde alguns segundos antes de solicitar um novo código.' },
                { status: 429 }
            )
        }

        const code = generateCode()
        const codeHash = hashCode(code)
        const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString()
        const ip =
            request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
            request.headers.get('x-real-ip') ||
            null

        const { error: insertError } = await supabase
            .from('signup_verification_codes')
            .insert({
                email: normalizedEmail,
                code_hash: codeHash,
                full_name: typeof fullName === 'string' ? fullName.slice(0, 200) : null,
                expires_at: expiresAt,
                ip,
            })

        if (insertError) {
            console.error('[send-code] insert error:', insertError)
            return NextResponse.json({ error: 'Erro ao gerar código.' }, { status: 500 })
        }

        try {
            await sendMail({
                to: normalizedEmail,
                subject: `Seu código de verificação: ${code}`,
                html: renderVerificationCodeEmail(code, typeof fullName === 'string' ? fullName : undefined),
            })
        } catch (mailErr: any) {
            console.error('[send-code] sendMail error:', mailErr)
            return NextResponse.json(
                { error: 'Não foi possível enviar o email. Verifique o endereço e tente novamente.' },
                { status: 502 }
            )
        }

        return NextResponse.json({ ok: true, expiresAt })
    } catch (err: any) {
        console.error('[send-code] unexpected error:', err)
        return NextResponse.json({ error: 'Erro inesperado.' }, { status: 500 })
    }
}
