import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { normalizePhone } from '@/lib/whatsapp-central'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { id } = await ctx.params
    let body: { phone?: string | null; whatsapp_jid?: string | null; active?: boolean; areas?: string[] }
    try { body = await req.json() } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.phone !== undefined) patch.phone = normalizePhone(body.phone || '') || null
    if (body.whatsapp_jid !== undefined) patch.whatsapp_jid = body.whatsapp_jid?.trim() || null
    if (body.active !== undefined) patch.active = body.active
    if (body.areas !== undefined) patch.areas = body.areas
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { error } = await supabase.from('operational_sources').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
}
