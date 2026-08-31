/**
 * Reprocessa detecções de catálogo com o pipeline que ABRE o PDF.
 *
 *   npx tsx --env-file=.env.local scripts/catalogos-reprocessar.mts
 *       → simulação: lê os arquivos, mostra o que faria, NÃO grava nada
 *
 *   ... scripts/catalogos-reprocessar.mts --aplicar
 *       → grava: anexa o que tiver prova, marca o resto pra revisão
 *
 * Flags:
 *   --aplicar            grava (sem ela é simulação)
 *   --limit=N            processa só as N mais recentes (default 200)
 *   --status=a,b         filtra por match_status (default: tudo menos attached/manual)
 *   --id=<uuid>          uma detecção específica
 *   --forcar             reprocessa também o que já está anexado
 *
 * Existe porque o histórico foi todo casado por NOME DE ARQUIVO: tem catálogo
 * marcado "sem match" que na verdade é de um leilão do cronograma, e tem
 * relatório que virou candidato ambíguo. Isso relê tudo pelo conteúdo.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) process.env[k] = v as string
}

const { processarDeteccao } = await import('../src/lib/catalog-pipeline')

const args = process.argv.slice(2)
const APLICAR = args.includes('--aplicar')
const FORCAR = args.includes('--forcar')
const LIMIT = Number(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 200)
const ID = args.find(a => a.startsWith('--id='))?.split('=')[1]
const STATUS = args.find(a => a.startsWith('--status='))?.split('=')[1]?.split(',')

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})

let q = sb.from('whatsapp_catalog_detections')
    .select('id, file_name, received_at, match_status, attached')
    .order('received_at', { ascending: false })
    .limit(LIMIT)
if (ID) q = q.eq('id', ID)
else if (STATUS) q = q.in('match_status', STATUS)
else if (!FORCAR) q = q.not('match_status', 'in', '("attached","manual","duplicate")')

const { data: deteccoes, error } = await q
if (error) { console.error('Erro ao listar detecções:', error.message); process.exit(1) }

console.log(`${APLICAR ? 'APLICANDO' : 'SIMULAÇÃO (use --aplicar para gravar)'} — ${deteccoes?.length ?? 0} detecções\n`)

const resumo: Record<string, number> = {}
for (const d of deteccoes ?? []) {
    process.stdout.write(`· ${d.received_at.slice(0, 10)} ${d.file_name.slice(0, 58).padEnd(58)} `)
    try {
        const r = await processarDeteccao(sb, d.id, { dryRun: !APLICAR, forcar: FORCAR })
        resumo[r.status] = (resumo[r.status] ?? 0) + 1

        let alvo = ''
        if (r.cronograma_id) {
            const { data: leilao } = await sb.from('cronograma_leiloes')
                .select('nome, data').eq('id', r.cronograma_id).maybeSingle()
            if (leilao) alvo = ` → ${leilao.nome} (${leilao.data.slice(8, 10)}/${leilao.data.slice(5, 7)})`
        }
        console.log(`${d.match_status} ⇒ ${r.status.toUpperCase()}${alvo}`)
        if (r.evidencia) {
            const ev = r.evidencia
            console.log(`    doc: ${ev.tipo} | ${ev.evento_nome ?? '—'} | ${ev.data_leilao ?? 'sem data'} | ${ev.criadores.slice(0, 2).join(', ') || '—'} [${ev.fonte}]`)
        }
        if (r.motivo) console.log(`    motivo: ${r.motivo}`)
    } catch (e) {
        resumo.erro = (resumo.erro ?? 0) + 1
        console.log(`ERRO: ${e instanceof Error ? e.message : e}`)
    }
}

console.log('\n─── resumo ───')
for (const [k, v] of Object.entries(resumo).sort((a, b) => b[1] - a[1])) {
    console.log(`${String(v).padStart(4)}  ${k}`)
}
if (!APLICAR) console.log('\nNada foi gravado. Rode com --aplicar quando concordar com o resultado.')
