import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/auth-helpers'
import { fetchVpsGroups } from '@/lib/whatsapp-vps'
import { normalizePhone } from '@/lib/whatsapp-central'

function key(value: string | null | undefined): string {
    return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
export async function POST() {
    const auth = await requireAdmin()
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data: sources, error } = await supabase
        .from('operational_sources')
        .select('id, label, source_kind, phone, whatsapp_jid, aliases')
        .eq('active', true)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const groupResults = await Promise.allSettled([
        fetchVpsGroups('joao-automation'),
        fetchVpsGroups('joao'),
    ])
    const groups = groupResults.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    const groupByName = new Map(groups.map(g => [key(g.subject), g]))

    const contactLabels = (sources || []).filter(s => s.source_kind === 'contact' && !s.phone).map(s => s.label)
    const [leadRes, msgRes] = await Promise.all([
        contactLabels.length
            ? supabase.from('crm_leads').select('nome, telefone, celular').in('nome', contactLabels).limit(500)
            : Promise.resolve({ data: [] as Array<{ nome: string; telefone: string | null; celular: string | null }> }),
        contactLabels.length
            ? supabase.from('whatsapp_messages').select('name, phone, created_at').in('name', contactLabels).not('phone', 'like', '%@g.us').order('created_at', { ascending: false }).limit(1000)
            : Promise.resolve({ data: [] as Array<{ name: string; phone: string; created_at: string }> }),
    ])
    const contactPhones = new Map<string, string>()
    for (const lead of leadRes.data || []) {
        const phone = normalizePhone(lead.celular || lead.telefone || '')
        if (phone && !contactPhones.has(key(lead.nome))) contactPhones.set(key(lead.nome), phone)
    }
    for (const msg of msgRes.data || []) {
        const phone = normalizePhone(msg.phone || '')
        if (phone && !contactPhones.has(key(msg.name))) contactPhones.set(key(msg.name), phone)
    }

    let resolved = 0
    const unresolved: string[] = []
    for (const source of sources || []) {
        const aliases = [source.label, ...(source.aliases || [])].map(key)
        if (source.source_kind === 'group' && !source.whatsapp_jid) {
            const group = aliases.map(a => groupByName.get(a)).find(Boolean)
            if (group) {
                await supabase.from('operational_sources').update({ whatsapp_jid: group.id, updated_at: new Date().toISOString() }).eq('id', source.id)
                resolved++
            } else unresolved.push(source.label)
        } else if (source.source_kind === 'contact' && !source.phone) {
            const phone = aliases.map(a => contactPhones.get(a)).find(Boolean)
            if (phone) {
                await supabase.from('operational_sources').update({ phone, updated_at: new Date().toISOString() }).eq('id', source.id)
                resolved++
            } else unresolved.push(source.label)
        }
    }
    return NextResponse.json({ resolved, unresolved, groups_seen: groups.length })
}
