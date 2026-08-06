// Extrai dados de julho/2026 para o relatório de desempenho dos leilões.
// Uso: node scripts/relatorio-leiloes-julho-2026-dados.mjs > outputs/relatorio-julho-2026-dados.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function all(table, build) {
  const out = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select('*').range(from, from + PAGE - 1)
    if (build) q = build(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return out
}

const [leiloes, fechamentos, vendas, cronograma] = await Promise.all([
  all('bula_leiloes'),
  all('bula_leilao_fechamento'),
  all('bula_leilao_vendas'),
  all('cronograma_leiloes'),
])

const sample = (rows) => rows.length ? Object.keys(rows[0]) : []
console.log('bula_leiloes:', leiloes.length, sample(leiloes))
console.log('bula_leilao_fechamento:', fechamentos.length, sample(fechamentos))
console.log('bula_leilao_vendas:', vendas.length, sample(vendas))
console.log('cronograma_leiloes:', cronograma.length, sample(cronograma))

mkdirSync(join(root, 'outputs'), { recursive: true })
writeFileSync(join(root, 'outputs', 'relatorio-julho-2026-raw.json'), JSON.stringify({ leiloes, fechamentos, vendas, cronograma }, null, 1))
console.log('OK -> outputs/relatorio-julho-2026-raw.json')
