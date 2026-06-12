import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { syncWhatsappCloudTemplatesToLocal } from '@/lib/whatsapp-cloud-api'

export const dynamic = 'force-dynamic'

export async function POST() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    try {
        const result = await syncWhatsappCloudTemplatesToLocal(supabase, auth.userId)
        return NextResponse.json({ success: true, ...result })
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : 'Falha ao sincronizar templates.' },
            { status: 500 }
        )
    }
}
