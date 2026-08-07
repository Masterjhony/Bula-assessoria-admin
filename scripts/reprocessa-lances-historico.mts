/**
 * Reprocessa RETROATIVAMENTE mensagens de grupos "Lances*" que já estão em
 * whatsapp_messages mas nunca passaram pelo parser de lances (grupos que não
 * eram fonte na época). Usa o mesmo handler do ao-vivo (merge por data+lote →
 * reexecutar é idempotente). IA desligada; candidatos não-parseados vão pra
 * outputs/ pra revisão.
 * Uso: npx tsx scripts/reprocessa-lances-historico.mts <jid1> [jid2...]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const l of readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)) {
    if (!l || l.startsWith('#') || !l.includes('=')) continue
    const i = l.indexOf('=')
    process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"|"$/g, '')
}

const jids = process.argv.slice(2)
if (!jids.length) {
    console.error('uso: npx tsx scripts/reprocessa-lances-historico.mts <jid1> [jid2...]')
    process.exit(1)
}

const { createClient } = await import('@supabase/supabase-js')
const { handleLanceGroupMessage, parseLanceMessage } = await import('../src/lib/whatsapp-lances')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})

const SALE_HINT = /\b(levou|levamos|arrematou|arrematad[oa]|arremate|vendid[oa]|vendeu|comprador|comprou)\b|\blote\s*\d+/i

for (const jid of jids) {
    console.log(`\n════ grupo ${jid} ════`)
    // pagina em blocos de 1000 (PostgREST corta)
    type Row = { id: string; body: string | null; reason: string | null; created_at: string }
    const rows: Row[] = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await sb
            .from('whatsapp_messages')
            .select('id, body, reason, created_at')
            .eq('phone', jid)
            .eq('direction', 'inbound')
            .order('created_at', { ascending: true })
            .range(from, from + 999)
        if (error) { console.error('  query falhou:', error.message); break }
        rows.push(...((data ?? []) as Row[]))
        if (!data || data.length < 1000) break
    }
    console.log(`  mensagens: ${rows.length}`)

    let vendas = 0
    const porData = new Map<string, number>()
    const revisar: string[] = []
    for (const [i, m] of rows.entries()) {
        if (!m.body?.trim()) continue
        const ts = Math.floor(Date.parse(m.created_at) / 1000)
        const res = await handleLanceGroupMessage(sb, {
            groupJid: jid,
            text: m.body,
            messageId: m.reason || `retro:${m.id}`,
            ts,
            aiFallback: false,
            skipGroupCheck: true,
        })
        if (res.is_sale) {
            vendas++
            const d = String(res.leilao_data)
            porData.set(d, (porData.get(d) ?? 0) + 1)
        } else if (SALE_HINT.test(m.body) && m.body.length > 25 && !parseLanceMessage(m.body)) {
            revisar.push(`[${m.created_at.slice(0, 16)}]\n${m.body}\n`)
        }
        if (i % 300 === 299) console.log(`  ${i + 1}/${rows.length}…`)
    }
    console.log(`  vendas capturadas/mescladas: ${vendas}`)
    console.table([...porData.entries()].sort().map(([data, n]) => ({ data, vendas: n })))
    if (revisar.length) {
        mkdirSync(join(root, 'outputs'), { recursive: true })
        const out = join(root, 'outputs', `lances-retro-revisar-${jid.replace(/\W+/g, '-')}.txt`)
        writeFileSync(out, revisar.join('\n────────\n'), 'utf-8')
        console.log(`  ${revisar.length} candidatos não-parseados → ${out}`)
    }
}
process.exit(0)
