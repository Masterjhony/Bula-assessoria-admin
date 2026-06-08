// (2026-06-08) Lança as comissões de assessoria que estavam faltando na tabela
// de Fechamento (chefe apontou "—" na coluna COMISSÃO).
// Regra: comissão = pct_leilao × VGV do assessor (mesma convenção dos demais
// fechamentos). Percentuais oficiais (bula_comissoes_padrao_assessor):
//   Fábio Omena = 3%; demais (Douglas, Leonardo, Marcelo, Bulinha, dupla) = 2%.
// ⚠ Fabrício Hyppolito NÃO está na tabela oficial → usado 2% (padrão Bula).
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const r2 = (n) => Math.round(Number(n) * 100) / 100
// Fábio = 3%; qualquer outro assessor (inclui dupla e Fabrício) = 2%.
const rate = (nome) => (/f[áa]bio/i.test(nome || '') ? 0.03 : 0.02)

const IDS = [
  { id: 'f6cb9aad-2b2a-4207-9c0b-e2e37808587b', rotulo: '18º Mega Nelore Pará' },
  { id: 'b807e56f-c90b-4bfa-92ad-5b85cd7d8899', rotulo: 'LS Now' },
  { id: '84a96ad4-33b6-46e9-a71d-0452e68f36b8', rotulo: 'LS Collection' },
  { id: '85e097ff-2096-4923-a675-6b690f06bf50', rotulo: 'Katayama Trilogia (1º dia)' },
  { id: '9e017caf-8899-4852-99a5-d506bb5905b6', rotulo: 'Destaques Cachoeirão' },
]

for (const { id, rotulo } of IDS) {
  const { data: x, error } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,receita_bula,comissao_assessoria,por_assessor').eq('id', id).single()
  if (error) { console.error(`✗ ${rotulo}:`, error.message); continue }
  const por_assessor = (x.por_assessor || []).map((a) => {
    const pct = rate(a.nome)
    const comissao = r2((Number(a.vgv) || 0) * pct)
    return { ...a, comissao_pct: pct, comissao }
  })
  const total = r2(por_assessor.reduce((s, a) => s + (a.comissao || 0), 0))
  const sobra = r2((Number(x.receita_bula) || 0) - total)
  const { error: upErr } = await sb.from('bula_leilao_fechamento')
    .update({ por_assessor, comissao_assessoria: total, sobra_bruta: sobra, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (upErr) { console.error(`✗ ${rotulo}:`, upErr.message); continue }
  console.log(`✓ ${x.nome}`)
  for (const a of por_assessor) console.log(`   ${a.nome}: ${(a.comissao_pct * 100)}% × ${brl(a.vgv)} = ${brl(a.comissao)}`)
  console.log(`   → comissão total ${brl(total)} | receita ${brl(x.receita_bula)} | lucro bruto ${brl(sobra)}${sobra === 0 ? '  ⚠ ZERO' : ''}`)
}
console.log('\nDone.')
