// Reembolso de despesas variáveis do assessor Fábio de Omena Gaia — Junho/2026.
//
// Fonte: "RELATORIO DESPESA bula.xlsx" enviado pela financeira anterior (Ana Paula) em 30/06/2026.
// Processo descrito por ela: "chega o relatório de comissão e de despesas → lançamos nos
// leilões → depois reembolsamos." Segue o padrão já existente no ERP "DESPESAS <MÊS> FABIO"
// (abril foi R$ 7.200; venc. dia 20 do mês seguinte).
//
// IMPORTANTE: as COMISSÕES de junho NÃO entram aqui — já estão lançadas no ERP por leilão
// (COMISSAO ... FÁBIO OMENA (3%) etc.). Lançá-las de novo duplicaria. Este script é só o
// reembolso de despesas (viagem/alimentação/combustível + patrocínios).
//
// Diferença vs. abril: abril foi categorizado como "Comissão Funcionário" (incoerente —
// reembolso de viagem não é comissão). Aqui uso "Despesa Operacional Leilão" p/ o DRE
// refletir corretamente. Quebra detalhada vai em observações.
//
// Uso: DRY_RUN=1 node scripts/lanca-despesas-fabio-junho-2026.mjs  |  sem DRY_RUN grava.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// IDs reais (sondados 30/06/2026)
const FORN_FABIO = '1739c44b-b46a-4c1d-8adf-f6509fb44891'        // FABIO (fornecedor, mesmo de "DESPESAS ABRIL FABIO")
const CAT_OP_LEILAO = '562264eb-8134-4990-a56b-d884279acf90'      // Despesa Operacional Leilão
const PLANO_ADM = '8689266d-f98d-475d-ae09-5e8369a55640'         // 4.3 Despesas Administrativas
const CC_COMISSAO = '52dd8ed0-0c0a-4524-86bd-01dc121487b3'        // COM02 Comissão Assessores (centro do assessor)
const BANCO_SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'       // Sicoob

const VIAGENS = [
  ['15/06', 'táxi', 19.92], ['10/06', 'táxi', 80.69], ['01/06', 'táxi', 71.87],
  ['15/06', 'táxi', 110.00], ['10/06', 'táxi', 28.00],
  ['10/06', 'alimentação', 80.00], ['16/06', 'alimentação', 136.00],
  ['18/06', 'visita cliente (combustível)', 334.88], ['07/06', 'visita cliente (combustível)', 116.92],
  ['03/06', 'visita cliente (combustível)', 321.84],
  ['01/06', 'alimentação (LS)', 57.00], ['01/06', 'alimentação (LS)', 55.00], ['01/06', 'alimentação (LS)', 63.50],
]
const PATROCINIOS = [
  ['Patrocinado JHVM, Jacamim, Santa Nice', 770.00],
  ['Patrocinado Santa Nazaré', 569.14],
  ['Patrocinado JMP', 805.91],
]
const totViagens = VIAGENS.reduce((s, x) => s + x[2], 0)
const totPatroc = PATROCINIOS.reduce((s, x) => s + x[1], 0)
const TOTAL = Math.round((totViagens + totPatroc) * 100) / 100

const obs = [
  'Reembolso de despesas — Junho/2026 (RELATORIO DESPESA bula.xlsx).',
  '',
  `VIAGENS/ALIMENTAÇÃO/COMBUSTÍVEL — ${brl(totViagens)}:`,
  ...VIAGENS.map(([d, desc, v]) => `  ${d} ${desc}: ${brl(v)}`),
  '',
  `PATROCÍNIOS (leilões) — ${brl(totPatroc)}:`,
  ...PATROCINIOS.map(([desc, v]) => `  ${desc}: ${brl(v)}`),
  '',
  `TOTAL: ${brl(TOTAL)}`,
].join('\n')

const NUM_DOC = 'DESPESAS-JUNHO-FABIO-2026'
const row = {
  descricao: 'DESPESAS JUNHO FABIO',
  fornecedor_id: FORN_FABIO,
  categoria_id: CAT_OP_LEILAO,
  centro_custo_id: CC_COMISSAO,
  plano_conta_id: PLANO_ADM,
  conta_bancaria_id: BANCO_SICOOB,
  valor: TOTAL,
  emissao: '2026-07-01',
  vencimento: '2026-07-20',
  status: 'aberto',
  forma_pagamento: 'pix',
  numero_documento: NUM_DOC,
  recorrencia: 'nenhuma',
  tags: ['despesa-variavel', 'reembolso', '2026'],
  observacoes: obs,
}

console.log('Reembolso DESPESAS JUNHO FABIO')
console.log('  viagens:', brl(totViagens), '| patrocínios:', brl(totPatroc), '| TOTAL:', brl(TOTAL))
console.log('  vencimento:', row.vencimento, '| categoria: Despesa Operacional Leilão | centro: COM02')

// Idempotência por numero_documento
const { data: existe } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', NUM_DOC)
if ((existe || []).length) { console.log('\nJá existe (numero_documento ' + NUM_DOC + '). Nada a fazer.'); process.exit(0) }

if (DRY_RUN) { console.log('\n[DRY_RUN] não gravado. Observação:\n' + obs); process.exit(0) }
const { data, error } = await sb.from('erp_contas_pagar').insert(row).select('id')
if (error) { console.error('Erro:', error.message); process.exit(1) }
console.log('\nOK — conta a pagar criada, id', data[0].id)
