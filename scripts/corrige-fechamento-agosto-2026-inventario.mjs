/**
 * Inventario + BACKUP de tudo que a correcao de agosto/2026 vai tocar.
 * Roda antes de qualquer escrita e grava outputs/backup-correcao-agosto-2026-09-01.json.
 *
 * Uso: node scripts/corrige-fechamento-agosto-2026-inventario.mjs
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const { data: fech } = await sb.from('bula_leilao_fechamento')
    .select('*').gte('data', '2026-08-01').lte('data', '2026-08-31').order('data')

console.log(`FECHAMENTOS DE AGOSTO: ${fech.length} · VGV ${brl(fech.reduce((s, f) => s + (f.vgv_total || 0), 0))} · comissao ${brl(fech.reduce((s, f) => s + (f.comissao_assessoria || 0), 0))}`)

const ids = fech.map(f => f.id)
const { data: cp } = await sb.from('erp_contas_pagar').select('*').in('fechamento_id', ids)
const { data: cr } = await sb.from('erp_contas_receber').select('*').in('fechamento_id', ids)
console.log(`\nCP ligados a fechamento de agosto: ${cp.length}`)
for (const x of cp) console.log('  ', x.vencimento, String(x.valor).padStart(9), String(x.status).padEnd(9), '|', x.descricao.slice(0, 70))
console.log(`\nCR ligados a fechamento de agosto: ${cr.length}`)
for (const x of cr) console.log('  ', x.vencimento, String(x.valor).padStart(9), String(x.status).padEnd(9), '|', x.descricao.slice(0, 70))

// CP/CR que citam pelo NOME os leiloes que serao apagados ou refeitos
const ALVOS = ['CASABRANCA', 'JMP', 'NAVIRA', 'EXCEL', 'PEPITAS', 'KATISPERA', 'SAO GERALDO', 'SÃO GERALDO', 'XINGU', 'MATINHA', 'ASJ', 'SAO JOSE', 'SÃO JOSÉ', 'CRIADOR', 'TERRA BRAVA', 'ENGENHO']
const soltos = { cp: [], cr: [] }
for (const alvo of ALVOS) {
    for (const [tab, acc] of [['erp_contas_pagar', soltos.cp], ['erp_contas_receber', soltos.cr]]) {
        const { data } = await sb.from(tab).select('*').ilike('descricao', `%${alvo}%`).gte('vencimento', '2026-08-01')
        for (const r of data ?? []) if (!acc.some(x => x.id === r.id)) acc.push(r)
    }
}
console.log(`\nCP citando esses leiloes (venc >= 01/08): ${soltos.cp.length}`)
for (const x of soltos.cp) console.log('  ', x.vencimento, String(x.valor).padStart(9), String(x.status).padEnd(9), (x.fechamento_id || '-').slice(0, 8), '|', x.descricao.slice(0, 66))
console.log(`\nCR citando esses leiloes (venc >= 01/08): ${soltos.cr.length}`)
for (const x of soltos.cr) console.log('  ', x.vencimento, String(x.valor).padStart(9), String(x.status).padEnd(9), (x.fechamento_id || '-').slice(0, 8), '|', x.descricao.slice(0, 66))

fs.mkdirSync('outputs', { recursive: true })
fs.writeFileSync('outputs/backup-correcao-agosto-2026-09-01.json', JSON.stringify({
    geradoEm: new Date().toISOString(),
    o_que_e: 'Estado do fechamento de agosto/2026 e dos titulos ligados a ele ANTES da correcao de 01/09/2026.',
    fechamentos: fech, cp_por_fechamento: cp, cr_por_fechamento: cr,
    cp_por_nome: soltos.cp, cr_por_nome: soltos.cr,
}, null, 1))
console.log('\nbackup → outputs/backup-correcao-agosto-2026-09-01.json')
