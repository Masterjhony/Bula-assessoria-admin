// Comissão do parceiro Gustavo Rusa (direcionamento técnico) — Maio/Junho 2026.
//
// Fonte: "Controle_Gustavo_Rusa_Lances_Maio_Junho_2026.xlsx" (apuração da financeira
// anterior). Rusa = 5% em 30x sobre lotes que ele direcionou (vendidos por Douglas/
// Fábio). REGRA DO ÁUDIO: paga-se Rusa OU o assessor no mesmo lote, nunca os dois.
//
// Total resumo aprovado pela Bula = R$ 64.945,00 (soma dos blocos por leilão).
// Já pago no extrato = R$ 57.490,00 (3 PIX a RUSA ASSESSORIA): 20.000 (22/05) +
// 16.750 (12/06) + 20.740 (29/06). Saldo = R$ 7.455,00.
//
// Modela como 1 conta a pagar (parceiro), status parcial, com o detalhamento por
// leilão na observação, e VINCULA os 3 movimentos do extrato (abate o pago — não
// fica pendente). Idempotente por numero_documento.
//
// Uso: DRY_RUN=1 node scripts/lanca-comissao-rusa-mai-jun-2026.mjs | sem DRY_RUN grava.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const FORN_RUSA = 'a2c9ec8c-27c0-40f4-a944-0cdcf25c6134'
const CAT_PARCEIRO = '5dcdc58a-d81b-4a4c-a81a-5e703e6a1a90' // Repasse Assessorias/Parceiros
const CC_PARCEIROS = '3350800e-d771-4963-a0c9-342ed268ca4a'  // COM03 Comissão Parceiros Comerciais
const NUM_DOC = 'BULA-2026-CP-COM-RUSA-MAIJUN'

const BLOCOS = [
  ['Pérolas do Cachoeirão', 10350], ['JMP Bezerras', 10350], ['Navirai Expozebu', 4050],
  ['EAO Expozebu', 12000], ['Leilão Santa Nice', 8400], ['Tresmar', 1275],
  ['JMP Bezerras / JMP Touros', 11065], ['Nelore KRIZ', 1200], ['Matrizes KatiSpera', 1005],
  ['Nelore MEAB e Modelo', 5250],
]
const TOTAL = BLOCOS.reduce((s, b) => s + b[1], 0) // 64.945
const MOVS = [
  ['757ba651-33a0-42e6-b58f-2fa3dfedfda7', '2026-05-22', 20000],
  ['a53da482-cf0e-41c4-a699-00192dd39b85', '2026-06-12', 16750],
  ['dd67f43d-fa53-459a-87f1-4811ebb5ec1a', '2026-06-29', 20740],
]
const PAGO = MOVS.reduce((s, m) => s + m[2], 0) // 57.490
const SALDO = TOTAL - PAGO

const obs = [
  'Comissão do parceiro Gustavo Rusa (direcionamento técnico, 5% em 30x) — Mai/Jun 2026.',
  'Fonte: Controle_Gustavo_Rusa_Lances_Maio_Junho_2026.xlsx.',
  'REGRA: paga-se Rusa OU o assessor (Douglas/Fábio) no mesmo lote, nunca os dois.',
  '',
  'Detalhe por leilão (comissão Rusa):',
  ...BLOCOS.map(([n, v]) => `  ${n}: ${brl(v)}`),
  `  TOTAL: ${brl(TOTAL)}`,
  '',
  `Pago (extrato, 3 PIX a RUSA ASSESSORIA): ${brl(PAGO)} = 20.000 (22/05) + 16.750 (12/06) + 20.740 (29/06).`,
  `Saldo em aberto: ${brl(SALDO)}.`,
  '',
  'CAVEATS (do próprio controle): vários blocos do resumo NÃO foram confirmados no grupo de lances (Pérolas, JMP Bezerras, Navirai, EAO, Santa Nice, Tresmar, KRIZ, MEAB) — confirmar antes de quitar o saldo. Confirmados: lances Rusa (base 22.020) e KatiSpera. Há diferença de R$ 5 (resumo 64.945 × texto 64.950) e R$ 290,92 no bloco JMP. Possível sobreposição com comissões de Douglas/Fábio já lançadas nos fechamentos — revisar pela regra do áudio.',
].join('\n')

const row = {
  descricao: 'COMISSAO PARCEIRO GUSTAVO RUSA - MAIO/JUNHO 2026',
  fornecedor_id: FORN_RUSA, categoria_id: CAT_PARCEIRO, centro_custo_id: CC_PARCEIROS,
  valor: TOTAL, valor_pago: PAGO, data_pagamento: '2026-06-29',
  emissao: '2026-05-30', vencimento: '2026-06-30',
  status: SALDO > 0 ? 'parcial' : 'pago', forma_pagamento: 'pix',
  numero_documento: NUM_DOC, recorrencia: 'nenhuma',
  observacoes: obs, tags: ['comissao', 'parceiro', 'rusa', '2026', 'parcial'],
}

console.log('COMISSÃO RUSA — Mai/Jun 2026')
console.log(`  Total: ${brl(TOTAL)} | Pago: ${brl(PAGO)} | Saldo: ${brl(SALDO)} | status: ${row.status}`)
if (DRY_RUN) { console.log('\n[DRY_RUN]\n' + obs); process.exit(0) }

const { data: ex } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', NUM_DOC).maybeSingle()
let cpId
if (ex) { await sb.from('erp_contas_pagar').update({ ...row, updated_at: new Date().toISOString() }).eq('id', ex.id); cpId = ex.id; console.log('-> CP ATUALIZADA', cpId) }
else { const { data, error } = await sb.from('erp_contas_pagar').insert(row).select('id').single(); if (error) throw new Error(error.message); cpId = data.id; console.log('-> CP CRIADA', cpId) }

// Vincula os 3 movimentos do extrato (abate o pago)
for (const [mid, data, val] of MOVS) {
  const { error } = await sb.from('erp_movimentos_bancarios').update({ conta_pagar_id: cpId, pessoa_id: FORN_RUSA }).eq('id', mid)
  if (error) throw new Error(error.message)
  console.log(`-> movimento ${data} ${brl(val)} vinculado à CP`)
}
console.log('\nConcluído.')
