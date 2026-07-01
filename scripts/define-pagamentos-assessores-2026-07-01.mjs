// Define os pagamentos a ASSESSORES que estavam em bucket genérico ("Outras
// Despesas"/"Compras Diversas"), pelo padrão observado: valor QUEBRADO (centavos
// não redondos) = reembolso de despesa de leilão -> "Despesa Operacional Leilão";
// valor REDONDO = remuneração -> Comissão (PF) / Repasse (PJ). Não mexe no que já
// está em categoria específica (Folha/Comissão/Repasse/Despesa Op). 01/07/2026.
//
// Uso: node scripts/define-pagamentos-assessores-2026-07-01.mjs        (DRY)
//      APPLY=1 node scripts/define-pagamentos-assessores-2026-07-01.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.env.APPLY === '1'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

const DESP_LEILAO = '562264eb-8134-4990-a56b-d884279acf90' // Despesa Operacional Leilão
const COMISSAO = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e'    // Comissão Funcionário
const REPASSE = '5dcdc58a-d81b-4a4c-a81a-5e703e6a1a90'     // Repasse Assessorias/Parceiros
const GENERICAS = new Set(['2be58816-f134-417c-8a1c-296e3eef78b0', '9e20f375-b070-4991-95f8-723210cf9bd0', '20c2defd-415c-42cc-8939-fcd8cf104280', '1d16d458-64a3-4e01-b47e-83793bf077e5', null])

// assessores: [padrão de nome, é PJ?]
const ASSESSORES = [
  ['FO ASSESSORIA', true], ['DOUGLAS BISPO', false], ['GRUPO AGROBISPO', true], ['BISPO AGRONEGOCIOS', true],
  ['LEONARDO SERAFIM', false], ['LUIZ FELIPE PERALTA', false],
]

const idInfo = new Map()
for (const [nm, pj] of ASSESSORES) {
  const { data: ps } = await sb.from('erp_pessoas').select('id,nome').ilike('nome', `%${nm}%`)
  for (const p of ps || []) idInfo.set(p.id, { nome: p.nome, pj })
}
const ids = [...idInfo.keys()]
if (!ids.length) { console.log('Nenhum assessor encontrado'); process.exit(0) }

const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,valor,categoria_id,pessoa_id,cat:erp_categorias!categoria_id(nome)')
  .in('pessoa_id', ids).eq('tipo', 'saida')

let n = 0
const linhas = []
for (const m of movs) {
  if (!GENERICAS.has(m.categoria_id)) continue // só mexe no que está genérico
  const info = idInfo.get(m.pessoa_id)
  const quebrado = Math.round(Number(m.valor) * 100) % 100 !== 0
  const cat = quebrado ? DESP_LEILAO : (info.pj ? REPASSE : COMISSAO)
  const rot = quebrado ? 'reembolso leilão' : 'comissão/remuneração'
  linhas.push(`  ${info.nome.slice(0, 26).padEnd(26)} ${brl(m.valor).padStart(12)} ${quebrado ? '[quebrado]' : '[redondo] '} -> ${rot}`)
  if (APPLY) await sb.from('erp_movimentos_bancarios').update({ categoria_id: cat, updated_at: new Date().toISOString() }).eq('id', m.id)
  n++
}
console.log(`\n${APPLY ? '=== APLICADO ===' : '=== DRY RUN ==='}`)
console.log(`Pagamentos de assessor redefinidos (estavam genéricos): ${n}`)
linhas.forEach((l) => console.log(l))
