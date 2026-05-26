import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'

export const runtime = 'nodejs'

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { id } = await params
    if (!id) return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 })

    if (id === auth.userId) {
        return NextResponse.json(
            { error: 'Você não pode excluir sua própria conta.' },
            { status: 400 }
        )
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
    )

    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) {
        console.error('[admin/users DELETE] error:', error)
        return NextResponse.json({ error: 'Falha ao excluir usuário.' }, { status: 500 })
    }

    // Profile is removed via FK cascade (profiles.id REFERENCES auth.users.id ON DELETE CASCADE).
    // If the FK is not cascading, clean up explicitly:
    await supabase.from('profiles').delete().eq('id', id)

    return NextResponse.json({ ok: true })
}
