// Inspeção rápida: encontra leilões e fechamentos do Terra Brava e Bezerras
// Nelore JMP no banco para guiar os lançamentos.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ilike = (col, q) => supabase.from('bula_leiloes').select('id,nome,data,leiloeira,local').ilike(col, q).order('data')
const ilikeF = (col, q) => supabase.from('bula_leilao_fechamento').select('id,nome,data,vgv_total,faturamento_total_leilao').ilike(col, q).order('data')

console.log('═══ Procurando em bula_leiloes ═══')
for (const term of ['%terra brava%', '%terrabrava%', '%nelore jmp%', '%jmp%', '%supreme%', '%bezerras nelore%']) {
  const { data, error } = await ilike('nome', term)
  if (error) { console.error(term, error.message); continue }
  if (data?.length) {
    console.log(`\n→ "${term}" (${data.length}):`)
    for (const r of data) console.log(`   ${r.data} | ${r.nome} | leiloeira=${r.leiloeira} | local=${r.local}`)
  }
}

console.log('\n═══ Procurando em bula_leilao_fechamento ═══')
for (const term of ['%terra brava%', '%terrabrava%', '%nelore jmp%', '%jmp%', '%supreme%', '%bezerras nelore%']) {
  const { data, error } = await ilikeF('nome', term)
  if (error) { console.error(term, error.message); continue }
  if (data?.length) {
    console.log(`\n→ "${term}" (${data.length}):`)
    for (const r of data) console.log(`   ${r.data} | ${r.nome} | vgv=${r.vgv_total} | fat=${r.faturamento_total_leilao}`)
  }
}

console.log('\n═══ Todos os leilões com data >= 2026-04-01 e <= 2026-04-30 ═══')
const { data: apr } = await supabase.from('bula_leiloes').select('id,nome,data,leiloeira').gte('data', '2026-04-01').lte('data', '2026-04-30').order('data')
for (const r of apr ?? []) console.log(`   ${r.data} | ${r.nome} | ${r.leiloeira}`)
