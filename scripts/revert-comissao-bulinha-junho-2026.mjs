// REVERT do fix-comissao-bulinha-junho-2026.mjs.
//
// Motivo: o ajuste que zerou a comissão do Bulinha em junho estava ERRADO.
// A regra do chefe é "nos leilões da BULA REMATES ele não tem comissão", e
// nenhum dos 3 leilões de junho onde ele vendeu é Bula Remates — os três são
// da PROGRAMA LEILÕES (conferido em cronograma_leiloes.leiloeira):
//   07/06 8º Leilão Jacamin Fêmeas      -> PROGRAMA LEILÕES
//   13/06 Leilão de Fêmeas Nelore JMP   -> PROGRAMA LEILOES
//   14/06 Leilão Touros JMP             -> PROGRAMA LEILOES
// O "0,00%" do PDF é o que a LEILOEIRA paga a ele (nada) — não anula os 2%
// que a Bula paga ao pisteiro. Confirmado pelo chefe em 22/07 ("2% pro
// Bulinha") e de novo em 23/07.
//
// Restaura os valores originais nos 3 fechamentos e reabre os 3 CPs.
//
// Uso: DRY_RUN=1 node scripts/revert-comissao-bulinha-junho-2026.mjs
//      node scripts/revert-comissao-bulinha-junho-2026.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const isBulinha = (nome) => /bulinha|felipe\s+.*andrade|felipe\s+vilela/i.test(String(nome || ''))
const NOTA = ' [AJUSTE 23/07/2026] Bulinha é dono da Bula Remates/Fórmula do Boi — nessas vendas ele NÃO tem comissão (PDF pisteiros FELIPE VENDAS JUNHO, todas 0,00%). Comissão de 2% zerada e CP cancelado.'

// valores ORIGINAIS (pré-ajuste)
const ALVOS = [
  { id: 'c1afc577-062e-4473-8a53-0d10e6802392', nome: 'Jacamim 07/06', comissao: 540, comAss: 5148, sobra: 16964.5 },
  { id: 'cd19dba3-792d-42e3-a563-f6025528dd51', nome: 'Bezerras JMP 13/06', comissao: 1260, comAss: 17910, sobra: 51204 },
  { id: 'c0f291bb-17bc-4b10-b320-c5ed6e767057', nome: 'Touros JMP 14/06', comissao: 29986, comAss: 90985.25, sobra: 27402.19 },
]
const CPS = ['3191dc97-8cd9-4632-ade1-55209e4f2cd7', 'fb4868ff-9a54-4c81-8cb2-739fc93c50a6', '30a04017-24de-4b74-a2d1-dfb2eeb6ba27']

console.log(DRY_RUN ? '=== DRY RUN (nada é gravado) ===\n' : '=== REVERTENDO EM PRODUÇÃO ===\n')

for (const t of ALVOS) {
  const { data: f, error } = await sb.from('bula_leilao_fechamento').select('*').eq('id', t.id).single()
  if (error) { console.error('erro lendo', t.id, error.message); process.exit(1) }
  const pa = (f.por_assessor || []).map((a) => ({ ...a }))
  let achou = false
  for (const a of pa) if (isBulinha(a.nome)) { a.comissao = t.comissao; achou = true }
  if (!achou) { console.error(`  ${t.nome}: Bulinha não encontrado — ABORTA`); process.exit(1) }
  console.log(`[${t.nome}] ${f.nome}`)
  console.log(`  Bulinha comissão: ${brl(0)} -> ${brl(t.comissao)}`)
  console.log(`  comissao_assessoria: ${brl(f.comissao_assessoria)} -> ${brl(t.comAss)}`)
  console.log(`  sobra_bruta:         ${brl(f.sobra_bruta)} -> ${brl(t.sobra)}`)
  if (!DRY_RUN) {
    const { error: e2 } = await sb.from('bula_leilao_fechamento').update({
      por_assessor: pa, comissao_assessoria: t.comAss, sobra_bruta: t.sobra, updated_at: new Date().toISOString(),
    }).eq('id', t.id)
    if (e2) { console.error('  ERRO:', e2.message); process.exit(1) }
    console.log('  ✔ revertido')
  }
  console.log('')
}

console.log('--- Reabrindo CPs ---')
for (const cid of CPS) {
  const { data: c, error } = await sb.from('erp_contas_pagar').select('*').eq('id', cid).single()
  if (error) { console.error('erro lendo CP', cid, error.message); process.exit(1) }
  const obs = String(c.observacoes || '').split(NOTA).join('')
  console.log(`[${cid}] ${brl(c.valor)} — ${c.status} -> aberto`)
  if (!DRY_RUN) {
    const { error: e2 } = await sb.from('erp_contas_pagar').update({
      status: 'aberto', observacoes: obs, projeto: 'Aguardando validação 25/07', updated_at: new Date().toISOString(),
    }).eq('id', cid)
    if (e2) { console.error('  ERRO:', e2.message); process.exit(1) }
    console.log('  ✔ reaberto')
  }
}
console.log(DRY_RUN ? '\nDRY RUN concluído.' : '\nRevert concluído.')
