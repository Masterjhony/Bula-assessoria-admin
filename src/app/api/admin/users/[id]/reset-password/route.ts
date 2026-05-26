import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { sendMail, renderPasswordResetEmail } from '@/lib/email'

export const runtime = 'nodejs'

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )

    const { data: userRes, error: getErr } = await supabase.auth.admin.getUserById(id)
    if (getErr || !userRes.user?.email) {
        return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })
    }

    const email = userRes.user.email
    const fullName = (userRes.user.user_metadata as any)?.full_name as string | undefined

    const origin =
        request.headers.get('origin') ||
        `https://${request.headers.get('host') || 'admin.formuladoboi.com'}`
    const redirectTo = `${origin}/reset-password`

    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
    })

    if (linkErr || !linkData?.properties?.action_link) {
        console.error('[reset-password] generateLink error:', linkErr)
        return NextResponse.json({ error: 'Falha ao gerar link de redefinição.' }, { status: 500 })
    }

    try {
        await sendMail({
            to: email,
            subject: 'Redefinição de senha · Fórmula do Boi',
            html: renderPasswordResetEmail(linkData.properties.action_link, fullName),
        })
    } catch (mailErr) {
        console.error('[reset-password] sendMail error:', mailErr)
        return NextResponse.json(
            { error: 'Falha ao enviar email de redefinição.' },
            { status: 502 }
        )
    }

    return NextResponse.json({ ok: true, email })
}
