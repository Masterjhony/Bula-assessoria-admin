// Preenche bula_leiloes.cronograma_id para os pares ATUAIS, usando exatamente o
// mesmo pareamento por similaridade que o painel admin (mergeLeiloes) já mostra
// hoje. Assim "congelamos" o pareamento correto como vínculo explícito, sem
// mudar nenhum dado exibido. Idempotente e seguro: só preenche onde está nulo
// (a menos que --force), nunca apaga.
//
// Uso:  node scripts/backfill-bula-cronograma-link.mjs [--dry] [--force]

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const dry = process.argv.includes('--dry')
const force = process.argv.includes('--force')

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)

// ── Algoritmo de pareamento — PORTADO VERBATIM de src/app/sistema/leiloes/page.tsx
const MERGE_STOP = new Set([
  'de', 'do', 'da', 'dos', 'das', 'e', 'o', 'os', 'a', 'as',
  'leilao', 'virtual', 'nelore', 'fazenda', 'agropecuaria',
  'etapa', 'remates', 'bula',
])
function mergeTokens(s) {
  return new Set(
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 2 && !MERGE_STOP.has(w)),
  )
}
function nameScore(a, b) {
  const ta = mergeTokens(a), tb = mergeTokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / Math.min(ta.size, tb.size)
}
function daysApart(a, b) {
  const d = (Date.parse(a) - Date.parse(b)) / 86_400_000
  return Number.isFinite(d) ? Math.abs(d) : 999
}
function diceSim(a, b) {
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
  const na = norm(a), nb = norm(b)
  if (na.length < 2 || nb.length < 2) return na.length > 0 && na === nb ? 1 : 0
  const grams = (s) => {
    const m = new Map()
    for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1) }
    return m
  }
  const ga = grams(na), gb = grams(nb)
  let inter = 0
  for (const [g, ca] of ga) inter += Math.min(ca, gb.get(g) ?? 0)
  return (2 * inter) / ((na.length - 1) + (nb.length - 1))
}
function pair(bula, crono) {
  const cands = []
  bula.forEach((b, bi) => {
    crono.forEach((c, ci) => {
      const dd = daysApart(b.data, c.data)
      if (dd > 14) return
      const nm = Math.max(nameScore(b.nome, c.nome), nameScore(b.nome, c.criador || ''))
      const ch = dd === 0 ? Math.max(diceSim(b.nome, c.nome), diceSim(b.nome, c.criador || '')) : 0
      const ok = dd === 0 ? (nm >= 0.34 || ch >= 0.78) : nm >= 0.6
      if (!ok) return
      cands.push({ bi, ci, score: Math.max(nm, ch >= 0.78 ? ch : 0) - dd * 0.03 })
    })
  })
  cands.sort((x, y) => y.score - x.score)
  const pairCrono = new Map(), usedBula = new Set(), usedCrono = new Set()
  for (const cd of cands) {
    if (usedBula.has(cd.bi) || usedCrono.has(cd.ci)) continue
    usedBula.add(cd.bi); usedCrono.add(cd.ci); pairCrono.set(cd.bi, cd.ci)
  }
  return pairCrono
}

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const bula = (await c.query('select id, nome, data, cronograma_id from public.bula_leiloes order by data')).rows
const crono = (await c.query('select id, nome, data, criador from public.cronograma_leiloes order by data')).rows
console.log(`bula_leiloes: ${bula.length} | cronograma_leiloes: ${crono.length}`)

const pairCrono = pair(bula, crono)
let toSet = 0, skipExisting = 0, changed = 0
for (const [bi, ci] of pairCrono) {
  const b = bula[bi], target = crono[ci].id
  if (b.cronograma_id && !force) { skipExisting++; continue }
  if (b.cronograma_id === target) continue
  toSet++
  if (b.cronograma_id && b.cronograma_id !== target) changed++
  console.log(`  ${b.nome}  →  ${crono[ci].nome} (${target})${b.cronograma_id ? '  [muda vínculo existente]' : ''}`)
  if (!dry) {
    await c.query('update public.bula_leiloes set cronograma_id = $1 where id = $2', [target, b.id])
  }
}
console.log(`\nPares encontrados: ${pairCrono.size} | a gravar: ${toSet} | já vinculados (pulados): ${skipExisting} | vínculos alterados: ${changed}`)
console.log(dry ? 'DRY-RUN: nada gravado.' : 'Gravado.')
await c.end()
