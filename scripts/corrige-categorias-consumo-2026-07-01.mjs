// Corrige a categoria de movimentos cujo destinatário é um comerciante de
// CONSUMO (refeição/transporte/hospedagem/combustível) — típico de assessor em
// leilão presencial. Determinístico pelo nome da contraparte; sobrescreve
// categoria errada (ex.: Uber marcado como "Software/Assinaturas"). Não toca em
// assessores, impostos, fornecedores fixos, etc. 01/07/2026.
//
// Uso: node scripts/corrige-categorias-consumo-2026-07-01.mjs        (DRY)
//      APPLY=1 node scripts/corrige-categorias-consumo-2026-07-01.mjs

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

const C = {
  ALIMENT: 'b26ffe87-f4d6-4060-b697-a7f698c35f7d', // Alimentacao/Refeicoes
  TRANSP: '39139125-e4b4-4b9c-9438-28d775e9e637',  // Transporte (Apps)
  VIAGEM: '98083139-0fbf-487a-9988-a08519ebf259',  // Viagem/Passagens
  COMBU: '9dcb4575-515f-417b-9cbe-85a4aa36a861',   // Combustivel
}
const NOME = { [C.ALIMENT]: 'Alimentação/Refeições', [C.TRANSP]: 'Transporte (Apps)', [C.VIAGEM]: 'Viagem/Passagens', [C.COMBU]: 'Combustível' }

function classify(nome) {
  const s = (nome || '').toUpperCase()
  if (/\bUBER\b|IFOOD|\b99\b|CABIFY/.test(s)) return C.TRANSP
  if (/HOTEL|HOTEIS|HOTELARIA|POUSADA|HARBOR|MATIZZE|ATLAS HOTEL|BUSSE|\bH\+\b|AIRPORT.*RESTAUR/.test(s)) return C.VIAGEM
  if (/POSTO|AUTO POSTO|ITANHANGA|COSTA RICA CONVENIENCIA|GUAVIRA|\bTAJI\b/.test(s)) return C.COMBU
  if (/RESTAURANTE|CHURRASCARIA|LANCHONETE|LANCHES|PIZZ|CAFETERIA|\bCAFE\b|PADARIA|CONFEITARIA|CONVENIENCIA|MERCEARIA|SANDUBA|BOLOS|GOURMET|IPE DOURADO|CHEIRO DA ROCA|MARRUA|ZITAO|VIENA REST|FAST RESTAUR|MINORU|PAO DE QUEIJO|PAO MIX|PAO &|EMPORIO|ChURRAS|ESTRELA DO SUL|BEZERROS E EVENTOS|SDB COMERCIO DE ALIMENTOS|BIG FIELD|ESPETOS|BOREACHARIA|GARCA BRANCA|CASA COLONIAL|COLONIAL|RODRIGO SAND|BAR MERCEARIA|BAR ZITO/.test(s)) return C.ALIMENT
  return null
}

const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,valor,categoria_id,pessoa_id,pessoa:erp_pessoas!pessoa_id(nome)')
  .not('pessoa_id', 'is', null)

let n = 0
const porTipo = {}
const amostra = []
for (const m of movs) {
  const cat = classify(m.pessoa && m.pessoa.nome)
  if (!cat || cat === m.categoria_id) continue
  porTipo[NOME[cat]] = (porTipo[NOME[cat]] || 0) + 1
  if (amostra.length < 18) amostra.push(`${(m.pessoa.nome || '').slice(0, 30).padEnd(30)} ${brl(m.valor).padStart(11)} -> ${NOME[cat]}`)
  if (APPLY) await sb.from('erp_movimentos_bancarios').update({ categoria_id: cat, updated_at: new Date().toISOString() }).eq('id', m.id)
  n++
}
console.log(`\n${APPLY ? '=== APLICADO ===' : '=== DRY RUN ==='}`)
console.log(`Categorias de consumo corrigidas: ${n}`)
console.log('Por tipo:', JSON.stringify(porTipo))
console.log('Amostra:'); amostra.forEach((s) => console.log('  ' + s))
