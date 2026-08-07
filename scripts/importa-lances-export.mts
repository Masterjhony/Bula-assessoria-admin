/**
 * Importação RETROATIVA de lances a partir do export de conversa do WhatsApp.
 *
 * No celular/WhatsApp Web: grupo → ⋮ → Mais → Exportar conversa → SEM mídia.
 * Depois: npx tsx scripts/importa-lances-export.mts <arquivo.txt> [jid-do-grupo]
 *
 * Usa o MESMO parser determinístico do ao-vivo (handleLanceGroupMessage com
 * skipGroupCheck; IA desligada — em lote, só o que o parser entende com
 * certeza). O merge por (data do pregão, lote) deduplica reexecuções.
 * Linhas com cara de venda que o parser não entendeu vão pra um arquivo de
 * revisão em outputs/.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const l of readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)) {
    if (!l || l.startsWith('#') || !l.includes('=')) continue
    const i = l.indexOf('=')
    process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"|"$/g, '')
}

const [, , arquivo, jidArg] = process.argv
if (!arquivo) {
    console.error('uso: npx tsx scripts/importa-lances-export.mts <export.txt> [jid-do-grupo]')
    process.exit(1)
}

const { createClient } = await import('@supabase/supabase-js')
const { handleLanceGroupMessage, parseLanceMessage } = await import('../src/lib/whatsapp-lances')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})

// ── parse do export ("dd/mm/aaaa hh:mm - Autor: texto", continuação = linhas sem cabeçalho) ──
const CAB = /^(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})\s+-\s+([^:]{1,60}):\s?([\s\S]*)$/
type Msg = { ts: number; autor: string; texto: string }
const msgs: Msg[] = []
const conteudo = readFileSync(arquivo, 'utf-8')
for (const linha of conteudo.split(/\r?\n/)) {
    const m = linha.match(CAB)
    if (m) {
        const [, dd, mm, aaaa, hh, min, autor, texto] = m
        // export vem no horário local (BRT = UTC-3)
        const ts = Math.floor(Date.parse(`${aaaa}-${mm}-${dd}T${hh}:${min}:00-03:00`) / 1000)
        if (Number.isFinite(ts)) msgs.push({ ts, autor: autor.trim(), texto })
    } else if (msgs.length && linha.trim()) {
        msgs[msgs.length - 1].texto += '\n' + linha
    }
}
console.log(`mensagens no export: ${msgs.length}`)

const jid = jidArg || `export-${basename(arquivo).replace(/\W+/g, '-').slice(0, 40)}@g.us`
const SALE_HINT = /\b(levou|levamos|arrematou|arrematad[oa]|arremate|vendid[oa]|vendeu|comprador|comprou)\b|\blote\s*\d+/i

let vendas = 0
const porData = new Map<string, number>()
const revisar: string[] = []
for (const [i, m] of msgs.entries()) {
    const res = await handleLanceGroupMessage(sb, {
        groupJid: jid,
        text: m.texto,
        messageId: `export:${jid}:${m.ts}:${i}`,
        ts: m.ts,
        aiFallback: false,
        skipGroupCheck: true,
    })
    if (res.is_sale) {
        vendas++
        const d = String(res.leilao_data)
        porData.set(d, (porData.get(d) ?? 0) + 1)
    } else if (SALE_HINT.test(m.texto) && m.texto.length > 25 && !parseLanceMessage(m.texto)) {
        revisar.push(`[${new Date(m.ts * 1000).toISOString().slice(0, 16)}] ${m.autor}:\n${m.texto}\n`)
    }
    if (i % 200 === 199) console.log(`  ${i + 1}/${msgs.length}…`)
}

console.log(`\nvendas capturadas/mescladas: ${vendas}`)
console.table([...porData.entries()].sort().map(([data, n]) => ({ data, vendas: n })))
if (revisar.length) {
    mkdirSync(join(root, 'outputs'), { recursive: true })
    const out = join(root, 'outputs', `lances-export-revisar-${basename(arquivo).replace(/\W+/g, '-')}.txt`)
    writeFileSync(out, revisar.join('\n────────\n'), 'utf-8')
    console.log(`${revisar.length} mensagens com cara de venda NÃO parseadas → ${out}`)
}
process.exit(0)
