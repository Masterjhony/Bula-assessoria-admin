/**
 * Reprocessa o histórico do grupo "Lances Bula Assessoria" (whatsapp_messages,
 * origin='group-inbound') pelo parser determinístico de vendas e reconstrói os
 * fechamentos automáticos — mesma rota do tempo real (handleLanceGroupMessage),
 * então o que roda aqui é o que roda em produção.
 *
 * Fechamentos manuais (origem null, ex.: EAO Baviera 11-12/07) NUNCA são
 * tocados; nesses dias as vendas ficam só em bula_leilao_vendas.
 *
 *   npx tsx scripts/reprocessa-lances-grupo.mts                  # dry-run: só mostra o que capturaria
 *   npx tsx scripts/reprocessa-lances-grupo.mts --gravar         # grava vendas + fechamentos
 *   npx tsx scripts/reprocessa-lances-grupo.mts --desde 2026-07-12
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseLanceMessage, handleLanceGroupMessage, pregaoDateISO } from '../src/lib/whatsapp-lances'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const args = process.argv.slice(2)
const GRAVAR = args.includes('--gravar')
const DESDE = (() => { const i = args.indexOf('--desde'); return i >= 0 ? args[i + 1] : '2026-07-12' })()
const GROUP_JID = '120363162972078973@g.us'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

type Msg = { body: string | null; created_at: string; reason: string | null }
const msgs: Msg[] = []
for (let off = 0; ; off += 1000) {
    const { data, error } = await sb.from('whatsapp_messages')
        .select('body, created_at, reason')
        .eq('origin', 'group-inbound')
        .like('phone', `${GROUP_JID.split('@')[0]}%`)
        .gte('created_at', `${DESDE}T00:00:00Z`)
        .order('created_at', { ascending: true })
        .range(off, off + 999)
    if (error) { console.error('Erro ao ler mensagens:', error.message); process.exit(1) }
    msgs.push(...((data ?? []) as Msg[]))
    if (!data || data.length < 1000) break
}
console.log(`Mensagens do grupo desde ${DESDE}: ${msgs.length} · modo: ${GRAVAR ? '🚨 GRAVANDO' : 'dry-run'}`)

let vendas = 0
const porDia = new Map<string, string[]>()
for (const m of msgs) {
    const text = (m.body || '').trim()
    if (!text) continue
    const tsSec = Math.floor(new Date(m.created_at).getTime() / 1000)
    const parsed = parseLanceMessage(text)
    if (!parsed) continue
    vendas++
    const dia = pregaoDateISO(tsSec)
    const resumo = parsed.lotes.map((l) =>
        `lt ${l} · ${parsed.parcela != null ? `R$ ${parsed.parcela}` : 'sem valor'} · ${parsed.animais ?? '?'}${parsed.sexo ?? ''} · ${parsed.assessor ?? 'assessor?'} · ${parsed.comprador ?? parsed.fazenda ?? 'comprador?'}${parsed.uf ? ` (${parsed.cidade ?? ''}/${parsed.uf})` : ''}`)
    porDia.set(dia, [...(porDia.get(dia) ?? []), ...resumo])

    if (GRAVAR) {
        const out = await handleLanceGroupMessage(sb, {
            groupJid: GROUP_JID,
            text,
            messageId: m.reason,
            ts: tsSec,
            aiFallback: false,
            skipGroupCheck: true,
        })
        if (out.error || (out.lotes && Object.values(out.lotes as Record<string, string>).includes('error'))) {
            console.log('  ⚠ erro:', JSON.stringify(out))
        }
    }
}

console.log(`\nMensagens de venda parseadas: ${vendas}`)
for (const [dia, linhas] of [...porDia.entries()].sort()) {
    console.log(`\n═══ pregão de ${dia} — ${linhas.length} lote(s) ═══`)
    for (const l of linhas) console.log('  ', l)
}

if (GRAVAR) {
    const { data: fechs } = await sb.from('bula_leilao_fechamento')
        .select('nome, data, vgv_total, lotes_vendidos, origem').gte('data', DESDE).order('data')
    console.log('\nFechamentos no período:')
    for (const f of fechs ?? []) console.log(`  ${f.data} · ${f.nome} · ${f.lotes_vendidos} lotes · VGV ${f.vgv_total} · ${f.origem ?? 'manual'}`)
    const { data: pend } = await sb.from('bula_leilao_vendas')
        .select('leilao_data, lote, status').eq('status', 'revisar').gte('leilao_data', DESDE).order('leilao_data')
    if (pend?.length) console.log(`\nVendas em 'revisar' (sem valor ou sem leilão resolvido): ${pend.map((p) => `${p.leilao_data} lt ${p.lote}`).join(' · ')}`)
} else {
    console.log('\n[dry-run] nada gravado. Rode com --gravar para lançar.')
}
