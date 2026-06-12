import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import {
    fetchWhatsappCloudPhoneNumber,
    fetchWhatsappCloudTemplates,
    getWhatsappCloudConfig,
    isWhatsappCloudApiConfigured,
} from '@/lib/whatsapp-cloud-api'
import { resolveSegment } from '@/lib/whatsapp-segment'

export const dynamic = 'force-dynamic'

export async function GET() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const config = getWhatsappCloudConfig()
    const configured = isWhatsappCloudApiConfigured()
    let phone: Record<string, unknown> | null = null
    let metaTemplates: Awaited<ReturnType<typeof fetchWhatsappCloudTemplates>> = []
    const errors: string[] = []

    if (configured) {
        try {
            phone = await fetchWhatsappCloudPhoneNumber()
        } catch (e) {
            errors.push(e instanceof Error ? e.message : 'Falha ao consultar numero.')
        }

        try {
            metaTemplates = await fetchWhatsappCloudTemplates()
        } catch (e) {
            errors.push(e instanceof Error ? e.message : 'Falha ao consultar templates.')
        }
    }

    let jmpAudience = 0
    try {
        jmpAudience = (await resolveSegment(supabase, { jmp_landing: true })).length
    } catch (e) {
        errors.push(e instanceof Error ? e.message : 'Falha ao contar leads JMP.')
    }

    return NextResponse.json({
        configured,
        config: {
            accessTokenConfigured: Boolean(config.accessToken),
            phoneNumberId: config.phoneNumberId,
            businessAccountId: config.businessAccountId,
            graphVersion: config.graphVersion,
        },
        phone,
        metaTemplates,
        approvedTemplates: metaTemplates.filter(t => t.status === 'APPROVED').length,
        jmpAudience,
        errors,
    })
}
