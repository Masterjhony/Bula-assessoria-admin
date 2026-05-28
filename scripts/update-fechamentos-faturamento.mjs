// Atualiza faturamento_total_leilao dos fechamentos a partir dos dados de
// faturamento total da leiloeira fornecidos pelo cliente (artes oficiais):
//
//   Terra Brava (Touros Provados, 19/04/2026):
//     Machos: 182 cab — Média R$ 24.547,25 — Total R$ 4.467.600,00
//     Compradores: 82 / Estados: 15
//
//   Bezerras Nelore JMP – Edição Supreme (19/04/2026):
//     Doadoras: 5 (avg 448.200) → 2.241.000
//     Bezerras (ind.): 110,5 (avg 63.206,33) → 6.984.300
//     Bezerras (mult.): 48 (avg 23.937,50) → 1.149.000
//     Somatória: 163,5 — Média 63.451,38 — Total R$ 10.374.300,00
//     Compradores: 70 / Estados: 14
//
// O vgv_total existente é a cobertura da Bula (slice nossa) e fica intacto.
// Compradores/estados nas tabelas das artes são leilão-wide — também ficam
// como estão (campos no DB representam a parcela nossa).
//
// Idempotente: update direto por id.

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

const updates = [
  {
    nome_match: 'Leilão Terra Brava 50 Anos',
    data: '2026-04-19',
    faturamento_total_leilao: 4_467_600.0,
  },
  {
    nome_match: 'Leilão JMP Supreme',
    data: '2026-04-19',
    faturamento_total_leilao: 10_374_300.0,
  },
]

for (const u of updates) {
  const { data: row, error: selErr } = await supabase
    .from('bula_leilao_fechamento')
    .select('id, nome, data, vgv_total, faturamento_total_leilao')
    .eq('nome', u.nome_match)
    .eq('data', u.data)
    .maybeSingle()
  if (selErr) {
    console.error(`SELECT falhou para "${u.nome_match}":`, selErr.message)
    continue
  }
  if (!row) {
    console.warn(`Não encontrado: "${u.nome_match}" em ${u.data}`)
    continue
  }
  const { error: updErr } = await supabase
    .from('bula_leilao_fechamento')
    .update({ faturamento_total_leilao: u.faturamento_total_leilao, updated_at: new Date().toISOString() })
    .eq('id', row.id)
  if (updErr) {
    console.error(`UPDATE falhou para id=${row.id}:`, updErr.message)
    continue
  }
  const cobNossa = (row.vgv_total && u.faturamento_total_leilao)
    ? `${((row.vgv_total / u.faturamento_total_leilao) * 100).toFixed(2)}%`
    : '—'
  console.log(`OK "${row.nome}" (${row.data}) → fat=R$ ${u.faturamento_total_leilao.toLocaleString('pt-BR')} | vgv=R$ ${Number(row.vgv_total).toLocaleString('pt-BR')} | cobertura=${cobNossa}`)
}
