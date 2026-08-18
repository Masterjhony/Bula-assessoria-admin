// Posição de caixa e fluxo previsto x realizado da Bula Assessoria.
// Data-base: 23/07/2026. Horizonte: 20/08/2026.
//
// Fontes:
// - F:\FINANCEIRO BULA 2026 (5).xlsx
// - ERP Bula (contas a pagar/receber, consulta somente leitura)
// - Evidências informadas pelo chefe em 23/07/2026:
//   saldos Sicoob/Sicredi e mensagem de atualização dos recebimentos de junho.
//
// Saídas:
// - outputs/posicao-caixa-fluxo-2026-07-23.{html,pdf,xlsx}
// - Desktop/Posicao de Caixa e Fluxo Previsto Realizado - 23-07-2026.{pdf,xlsx}
//
// Uso:
//   node scripts/gera-relatorio-fluxo-caixa-2026-07-23.mjs

import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import sharp from 'sharp'
import XLSX from 'xlsx'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(root, 'outputs')
const desktop = join(process.env.USERPROFILE || '', 'Desktop')
const sourceXlsx = 'F:\\FINANCEIRO BULA 2026 (5).xlsx'
const baseDate = '2026-07-23'
const horizonEnd = '2026-08-20'
const reportVariant = process.env.BULA_REPORT_VARIANT || 'principal'
const isFabio7000Scenario = reportVariant === 'cenario-comissoes-fabio-7000'
const outputStem = isFabio7000Scenario
  ? 'cenario-pagamento-comissoes-fluxo-caixa-2026-07-27'
  : 'posicao-caixa-fluxo-2026-07-23'
const desktopStem = isFabio7000Scenario
  ? 'Cenario de Pagamento das Comissoes - Fluxo de Caixa - 27-07-2026'
  : 'Posicao de Caixa e Fluxo Previsto Realizado - 23-07-2026'

const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf8')
  .split(/\r?\n/)
  .filter((line) => line && !line.startsWith('#') && line.includes('='))
  .map((line) => {
    const i = line.indexOf('=')
    return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')]
  }))

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const r2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
const brl = (value) => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const num = (value) => Number(value || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const pct = (value) => `${Number(value || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})}%`
const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
const isoToBr = (iso) => {
  if (!iso) return '—'
  const [y, m, d] = String(iso).split('-')
  return `${d}/${m}/${y}`
}
const monthKey = (iso) => String(iso).slice(0, 7)
const monthLabels = {
  '2026-07': 'Jul/26',
  '2026-08': 'Até 20/08',
  '2026-09': 'Set/26',
  '2026-10': 'Out/26',
  '2026-11': 'Nov/26',
  '2026-12': 'Dez/26',
}
const excelDate = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

// ---------------------------------------------------------------------------
// 1) Posição bancária informada
// ---------------------------------------------------------------------------
const bankAccounts = [
  { account: 'Sicoob — Conta Corrente 1.056-1', balance: 42828.87 },
  { account: 'Sicredi — Conta Corrente 53609-7', balance: 29577.20 },
]
const startingCash = r2(bankAccounts.reduce((sum, row) => sum + row.balance, 0))
assert.equal(startingCash, 72406.07)

// ---------------------------------------------------------------------------
// 2) Consultas somente leitura ao ERP
// ---------------------------------------------------------------------------
const [{ data: cpData, error: cpError }, { data: crData, error: crError }] = await Promise.all([
  sb
    .from('erp_contas_pagar')
    .select('id,descricao,valor,valor_pago,desconto,juros,multa,emissao,vencimento,status,numero_documento,parcela,total_parcelas,recorrencia,observacoes,fornecedor:erp_pessoas!fornecedor_id(nome),categoria:erp_categorias!categoria_id(nome),centro:erp_centros_custo!centro_custo_id(nome)')
    .in('status', ['aberto', 'vencido', 'parcial'])
    .lte('vencimento', horizonEnd)
    .order('vencimento'),
  sb
    .from('erp_contas_receber')
    .select('id,descricao,valor,valor_recebido,desconto,juros,multa,emissao,vencimento,status,numero_documento,observacoes,cliente:erp_pessoas!cliente_id(nome),categoria:erp_categorias!categoria_id(nome)')
    .in('status', ['aberto', 'vencido', 'parcial'])
    .order('vencimento'),
])
if (cpError) throw cpError
if (crError) throw crError

const cpRows = (cpData || []).map((row) => ({
  ...row,
  fornecedor_nome: row.fornecedor?.nome || '',
  categoria_nome: row.categoria?.nome || 'Sem categoria',
  centro_nome: row.centro?.nome || '',
  saldo: r2(Number(row.valor) + Number(row.juros) + Number(row.multa) - Number(row.desconto) - Number(row.valor_pago)),
}))
const anaSalaryCp = {
  id: 'manual-salario-ana-julho-2026',
  descricao: 'Folha Julho/2026 - ANA',
  valor: 6000,
  valor_pago: 0,
  desconto: 0,
  juros: 0,
  multa: 0,
  emissao: '2026-07-01',
  vencimento: '2026-07-31',
  status: 'provisionado no relatório',
  numero_documento: 'MANUAL-FOLHA-JUL-ANA',
  parcela: 1,
  total_parcelas: 1,
  recorrencia: 'mensal',
  observacoes: 'Salário de Ana incluído por determinação do chefe em 23/07/2026. Ainda não constava no contas a pagar consultado.',
  fornecedor_nome: 'ANA',
  categoria_nome: 'Folha de Pagamento',
  centro_nome: 'Salários Operacionais',
  saldo: 6000,
}
const adjustedCpRows = cpRows.map((row) => {
  const isFabioSalary = isFabio7000Scenario
    && row.vencimento === '2026-07-31'
    && row.categoria_nome === 'Folha de Pagamento'
    && /FABIO/i.test(row.fornecedor_nome)
  if (!isFabioSalary) return row
  return {
    ...row,
    valor: 7000,
    saldo: 7000,
    observacoes: `${row.observacoes || ''} | Salário fixo ajustado para R$ 7.000,00 por determinação do chefe.`,
  }
})
const cpReportRows = [...adjustedCpRows, anaSalaryCp].sort((a, b) =>
  a.vencimento.localeCompare(b.vencimento) || a.descricao.localeCompare(b.descricao))
const crRows = (crData || []).map((row) => ({
  ...row,
  cliente_nome: row.cliente?.nome || '',
  categoria_nome: row.categoria?.nome || 'Sem categoria',
  saldo: r2(Number(row.valor) + Number(row.juros) + Number(row.multa) - Number(row.desconto) - Number(row.valor_recebido)),
}))

const erpCommissionDue27 = r2(cpRows
  .filter((row) => row.vencimento === '2026-07-27' && ['Comissão Funcionário', 'Repasse Assessorias/Parceiros'].includes(row.categoria_nome))
  .reduce((sum, row) => sum + row.saldo, 0))
assert.equal(erpCommissionDue27, 202219.59)

// ---------------------------------------------------------------------------
// 3) Entradas com data — mensagem atualizada prevalece sobre o ERP
// ---------------------------------------------------------------------------
const allScheduledInflows = [
  { date: '2026-07-23', description: 'Bula Remates — leilões de junho (Kriz Matrizes, Rio Bonito, Nelore MEAB e IPB 30 anos)', amount: 51200, confidence: 'Confirmado', source: 'Confirmação do chefe em 23/07/2026 + imagem da relação dos leilões de junho' },
  { date: '2026-07-27', description: 'Terra Brava — parcela 1/3', amount: 2405, confidence: 'Confirmado', source: 'Mensagem 23/07 + ERP (total conservador R$ 7.215)' },
  { date: '2026-07-29', description: 'Matinha — Thiago/Granja Santiago 1/2', amount: 2800, confidence: 'Confirmado', source: 'Mensagem 23/07 + boleto' },
  { date: '2026-07-30', description: 'Kito — parcela 2/3 do acordo original (1/2 em aberto)', amount: 15030, confidence: 'Provável', source: 'Planilha + ERP; boleto com vencimento' },
  { date: '2026-07-30', description: 'Leilão RS Agropecuária — comissão Bula a 5%', amount: 8775, confidence: 'Confirmado', source: 'Mensagem confirmada em 23/07: pagamento informado para 30/07' },
  { date: '2026-08-09', description: 'JMP Fêmeas/Bezerras — parcela 1/2', amount: 58484, confidence: 'Confirmado', source: 'Mensagem 23/07; data atualizada' },
  { date: '2026-08-09', description: 'JMP Machos/Touros — parcela 1/2', amount: 107183.50, confidence: 'Confirmado', source: 'Mensagem 23/07; data atualizada' },
  { date: '2026-08-12', description: 'Matinha — Thiago/Granja Santiago 2/2', amount: 2800, confidence: 'Confirmado', source: 'Mensagem 23/07 + boleto' },
  { date: '2026-08-25', description: 'Terra Brava — parcela 2/3', amount: 2405, confidence: 'Confirmado', source: 'Mensagem 23/07 + ERP (total conservador R$ 7.215)' },
  { date: '2026-08-30', description: 'Kito — parcela 3/3 do acordo original (2/2 em aberto)', amount: 15030, confidence: 'Provável', source: 'Planilha + ERP; boleto com vencimento' },
  { date: '2026-09-09', description: 'JMP Fêmeas/Bezerras — parcela 2/2', amount: 58484, confidence: 'Confirmado', source: 'Mensagem 23/07; data atualizada' },
  { date: '2026-09-09', description: 'JMP Machos/Touros — parcela 2/2', amount: 107183.50, confidence: 'Confirmado', source: 'Mensagem 23/07; data atualizada' },
  { date: '2026-09-25', description: 'Terra Brava — parcela 3/3', amount: 2405, confidence: 'Confirmado', source: 'Mensagem 23/07 + ERP (total conservador R$ 7.215)' },
]
const scheduledInflows = allScheduledInflows.filter((row) => row.date <= horizonEnd)
const afterHorizonInflows = allScheduledInflows.filter((row) => row.date > horizonEnd)
const scheduledInflowsTotal = r2(scheduledInflows.reduce((sum, row) => sum + row.amount, 0))
assert.equal(scheduledInflowsTotal, 248677.50)

// Títulos do ERP substituídos pelas datas/parcelas acima.
const scheduledDocs = new Set([
  'BULA-2026-CR-MATINHA-THIAGO-B1',
  'BULA-2026-CR-MATINHA-THIAGO-B2',
  'BULA-2026-CR-KITO-20260509-B1',
  'BULA-2026-CR-KITO-20260509-B2',
  'BULA-2026-CR-TERRABRAVA-PROVADOS-JUNHO-2026',
  'BULA-2026-CR-JMP-FEMEAS-20260613-P1',
  'BULA-2026-CR-JMP-FEMEAS-20260613-P2',
  'BULA-2026-CR-JMP-TOUROS-20260614-P1',
  'BULA-2026-CR-JMP-TOUROS-20260614-P2',
  'BULA-2026-CR-RS-AGROPECUARIA-20260623',
])

// ---------------------------------------------------------------------------
// 4) Todas as saídas conhecidas, sem filtro gerencial
// ---------------------------------------------------------------------------
const commissionPayables = [
  { date: '2026-07-27', description: 'Comissão — Fábio Omena', beneficiary: 'Fábio Omena', reference: 'Junho/2026', amount: 60645.00 },
  { date: '2026-07-27', description: 'Comissão — Douglas Bispo', beneficiary: 'Douglas Bispo', reference: 'Junho/2026', amount: 28493.00 },
  { date: '2026-07-27', description: 'Comissão — Gustavo Rusa', beneficiary: 'Gustavo Rusa', reference: 'Julho/2026', amount: 23490.00 },
  { date: '2026-07-27', description: 'Comissão — Leonardo Serafim', beneficiary: 'Leonardo Serafim', reference: 'Junho/2026', amount: 21788.00 },
  { date: '2026-07-27', description: 'Comissão — Bulinha (Felipe Andrade)', beneficiary: 'Bulinha (Felipe Andrade)', reference: 'Maio + junho, líquido do cartão', amount: 7392.53 },
  { date: '2026-07-27', description: 'Comissão — João Antônio', beneficiary: 'João Antônio', reference: 'Junho/2026', amount: 2000.00 },
  { date: '2026-07-27', description: 'Comissão — Matheus Alves', beneficiary: 'Matheus Alves', reference: 'Junho/2026', amount: 238.59 },
].map((row) => ({
  ...row,
  group: 'Comissões',
  source: 'Relatório integral “Comissões a Pagar — 27/07/2026”',
}))
const commissionReportTotal = r2(commissionPayables.reduce((sum, row) => sum + row.amount, 0))
assert.equal(commissionReportTotal, 144047.12)
const commissionSchedule = [
  { date: '2026-07-27', beneficiary: 'Fábio Omena', description: 'Comissão — Fábio Omena — parcela 1/3', reference: '1/3', amount: 20215.00 },
  { date: '2026-07-27', beneficiary: 'Douglas Bispo', description: 'Comissão — Douglas Bispo — parcela 1/3', reference: '1/3', amount: 9497.67 },
  { date: '2026-07-27', beneficiary: 'Leonardo Serafim', description: 'Comissão — Leonardo Serafim — parcela 1/3', reference: '1/3', amount: 7262.67 },
  { date: '2026-07-27', beneficiary: 'João Antônio', description: 'Comissão — João Antônio — integral', reference: 'Integral', amount: 2000.00 },
  { date: '2026-07-27', beneficiary: 'Matheus Alves', description: 'Comissão — Matheus Alves — integral', reference: 'Integral', amount: 238.59 },
  { date: '2026-08-10', beneficiary: 'Gustavo Rusa', description: 'Comissão — Gustavo Rusa — integral', reference: 'Integral', amount: 23490.00 },
  { date: '2026-08-10', beneficiary: 'Bulinha (Felipe Andrade)', description: 'Comissão — Bulinha — integral', reference: 'Integral', amount: 7392.53 },
  { date: '2026-08-11', beneficiary: 'Fábio Omena', description: 'Comissão — Fábio Omena — saldo 2/3', reference: 'Saldo 2/3', amount: 40430.00 },
  { date: '2026-08-11', beneficiary: 'Douglas Bispo', description: 'Comissão — Douglas Bispo — saldo 2/3', reference: 'Saldo 2/3', amount: 18995.33 },
  { date: '2026-08-11', beneficiary: 'Leonardo Serafim', description: 'Comissão — Leonardo Serafim — saldo 2/3', reference: 'Saldo 2/3', amount: 14525.33 },
].map((row) => ({
  ...row,
  group: 'Comissões',
  source: 'Cronograma de pagamento definido pelo chefe em 23/07/2026',
}))
assert.equal(r2(commissionSchedule.reduce((sum, row) => sum + row.amount, 0)), commissionReportTotal)
const scheduledCommissionAmount = (beneficiary, date) => r2(commissionSchedule
  .filter((row) => row.beneficiary === beneficiary && row.date === date)
  .reduce((sum, row) => sum + row.amount, 0))

const fixedCp = cpReportRows.filter((row) => {
  if (row.vencimento < baseDate || row.vencimento > horizonEnd) return false
  const isDue27Commission = row.vencimento === '2026-07-27'
    && ['Comissão Funcionário', 'Repasse Assessorias/Parceiros'].includes(row.categoria_nome)
  return !isDue27Commission && row.saldo > 0
})

const groupedFixed = new Map()
for (const row of fixedCp) {
  let description = row.descricao
  let group = row.categoria_nome
  if (row.categoria_nome === 'Folha de Pagamento') {
    description = 'Folha fixa mensal — 7 pessoas (inclui Ana)'
    group = 'Folha'
  } else if (['Aluguel', 'Servicos de Terceiros', 'Alimentacao/Refeicoes'].includes(row.categoria_nome)) {
    description = 'Estrutura fixa — aluguel, contabilidade e café'
    group = 'Estrutura'
  } else if (/COMISSAO FIXA SDR/i.test(row.descricao)) {
    description = 'Comissão fixa SDR — João Antônio'
    group = 'Comissão fixa'
  }
  const key = `${row.vencimento}|${group}|${description}`
  if (!groupedFixed.has(key)) {
    groupedFixed.set(key, {
      date: row.vencimento,
      description,
      amount: 0,
      group,
      source: 'ERP — contas a pagar',
    })
  }
  groupedFixed.get(key).amount = r2(groupedFixed.get(key).amount + row.saldo)
}

const salaryPayables = cpReportRows
  .filter((row) => row.vencimento === '2026-07-31' && row.categoria_nome === 'Folha de Pagamento' && row.saldo > 0)
  .map((row) => ({
    beneficiary: row.fornecedor_nome,
    description: row.descricao,
    amount: row.saldo,
    source: row.id === anaSalaryCp.id ? 'Inclusão manual solicitada em 23/07' : 'ERP — contas a pagar',
  }))
  .sort((a, b) => b.amount - a.amount)
const salaryTotal = r2(salaryPayables.reduce((sum, row) => sum + row.amount, 0))
assert.equal(salaryTotal, isFabio7000Scenario ? 37100 : 41800)
const reimbursementHistory = [
  { reference: 'Abril/2026 — Fábio', amount: 7200.00 },
  { reference: 'Junho/2026 — Fábio', amount: 3620.67 },
  { reference: 'Julho/2026 — Douglas', amount: 1772.15 },
]
const reimbursementAverage = r2(reimbursementHistory.reduce((sum, row) => sum + row.amount, 0) / reimbursementHistory.length)
assert.equal(reimbursementAverage, 4197.61)
const manualPayables = [
  {
    date: '2026-07-31',
    category: 'Reembolso de Assessores',
    group: 'Reembolsos',
    beneficiary: 'Assessores com salário fixo',
    description: 'Provisão média mensal de reembolsos variáveis dos assessores',
    reference: 'Média de 3 registros históricos',
    amount: reimbursementAverage,
    source: 'ERP — R$ 7.200,00; R$ 3.620,67; R$ 1.772,15',
  },
  {
    date: '2026-08-07',
    category: 'Serviços de Terceiros',
    group: 'Serviços',
    beneficiary: 'Fórmula do Boi',
    description: 'Pagamento à Fórmula do Boi — 5º dia útil de agosto',
    reference: 'Agosto/2026',
    amount: 5000,
    source: 'Orientação do chefe em 23/07/2026',
  },
]
const otherPayables = fixedCp
  .filter((row) => row.categoria_nome !== 'Folha de Pagamento' && row.saldo > 0)
  .map((row) => ({
    date: row.vencimento,
    category: row.categoria_nome,
    beneficiary: row.fornecedor_nome || row.descricao,
    description: row.descricao,
    reference: row.numero_documento || '',
    amount: row.saldo,
    source: 'ERP — contas a pagar',
  }))
const fullObligations = [
  ...commissionSchedule.map((row) => ({ ...row, category: 'Comissões' })),
  ...salaryPayables.map((row) => ({
    ...row,
    date: '2026-07-31',
    category: 'Salários',
    reference: 'Folha Julho/2026',
  })),
  ...manualPayables,
  ...otherPayables,
].sort((a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category) || a.beneficiary.localeCompare(b.beneficiary))
assert.equal(r2(fullObligations.reduce((sum, row) => sum + row.amount, 0)), isFabio7000Scenario ? 194844.73 : 199544.73)

const scheduledOutflows = [
  ...commissionSchedule,
  ...groupedFixed.values(),
  ...manualPayables.map((row) => ({
    date: row.date,
    description: row.description,
    amount: row.amount,
    group: row.group,
    source: row.source,
  })),
]
  .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description))

const scheduledOutflowsTotal = r2(scheduledOutflows.reduce((sum, row) => sum + row.amount, 0))
assert.equal(scheduledOutflowsTotal, isFabio7000Scenario ? 194844.73 : 199544.73)

// ---------------------------------------------------------------------------
// 5) Fluxo diário e mensal
// ---------------------------------------------------------------------------
const flowEvents = [
  {
    date: baseDate,
    status: 'Realizado',
    type: 'Saldo inicial',
    description: 'Saldos bancários informados — Sicoob + Sicredi',
    inflow: startingCash,
    outflow: 0,
    taxReserve: 0,
    confidence: 'Realizado',
    source: 'Imagem de saldos em 23/07/2026',
  },
  ...scheduledInflows.map((row) => ({
    date: row.date,
    status: 'Previsto',
    type: 'Entrada',
    description: row.description,
    inflow: row.amount,
    outflow: 0,
    taxReserve: r2(row.amount * 0.18),
    confidence: row.confidence,
    source: row.source,
  })),
  ...scheduledOutflows.map((row) => ({
    date: row.date,
    status: 'Previsto',
    type: 'Saída',
    description: row.description,
    inflow: 0,
    outflow: row.amount,
    taxReserve: 0,
    confidence: 'Registrado',
    source: row.source,
  })),
].sort((a, b) => a.date.localeCompare(b.date)
  || (a.type === 'Saldo inicial' ? -1 : b.type === 'Saldo inicial' ? 1 : a.type === 'Entrada' ? -1 : 1)
  || a.description.localeCompare(b.description))

let grossBalance = 0
let freeBalance = 0
for (const row of flowEvents) {
  grossBalance = r2(grossBalance + row.inflow - row.outflow)
  freeBalance = r2(freeBalance + row.inflow - row.outflow - row.taxReserve)
  row.net = r2(row.inflow - row.outflow)
  row.freeNet = r2(row.inflow - row.outflow - row.taxReserve)
  row.grossBalance = grossBalance
  row.freeBalance = freeBalance
}

const forecastRows = flowEvents.filter((row) => row.type !== 'Saldo inicial')
const minGrossRow = forecastRows.reduce((min, row) => row.grossBalance < min.grossBalance ? row : min, forecastRows[0])
assert.equal(minGrossRow.grossBalance, isFabio7000Scenario ? 67104.53 : 62404.53)
assert.equal(minGrossRow.date, '2026-08-07')

const monthOrder = ['2026-07', '2026-08']
const monthly = []
let openingGross = startingCash
let openingFree = startingCash
for (const month of monthOrder) {
  const monthEvents = forecastRows.filter((row) => monthKey(row.date) === month)
  const inflows = r2(monthEvents.reduce((sum, row) => sum + row.inflow, 0))
  const outflows = r2(monthEvents.reduce((sum, row) => sum + row.outflow, 0))
  const reserve = r2(monthEvents.reduce((sum, row) => sum + row.taxReserve, 0))
  const closingGross = r2(openingGross + inflows - outflows)
  const closingFree = r2(openingFree + inflows - outflows - reserve)
  monthly.push({
    month,
    label: monthLabels[month],
    openingGross,
    inflows,
    outflows,
    reserve,
    net: r2(inflows - outflows),
    closingGross,
    closingFree,
  })
  openingGross = closingGross
  openingFree = closingFree
}

const endingGross = monthly.at(-1).closingGross
const endingFree = monthly.at(-1).closingFree
assert.equal(endingGross, isFabio7000Scenario ? 126238.84 : 121538.84)
assert.equal(endingFree, isFabio7000Scenario ? 81476.89 : 76776.89)

// ---------------------------------------------------------------------------
// 6) Recebíveis sem data e pipeline da planilha
// ---------------------------------------------------------------------------
const noDateReceivables = crRows
  .filter((row) => !scheduledDocs.has(row.numero_documento))
  .map((row) => ({
    group: row.status === 'vencido' ? 'Vencido sem previsão' : 'Sem previsão',
    date: row.vencimento,
    description: row.descricao,
    counterparty: row.cliente_nome,
    amount: row.saldo,
    status: row.status,
    action: row.observacoes || 'Confirmar data e responsável pela cobrança.',
    source: 'ERP — contas a receber',
  }))

const noDateErpTotal = r2(noDateReceivables.reduce((sum, row) => sum + row.amount, 0))
assert.equal(noDateErpTotal, 133635)

const sourceWb = XLSX.readFile(sourceXlsx, { cellFormula: true })
const leiloesWs = sourceWb.Sheets['Leilões']
const sheetValue = (cell) => leiloesWs[cell]?.v ?? null
const pipelineRows = []
const pipelineNoValue = []
for (let row = 85; row <= 96; row += 1) {
  const status = String(sheetValue(`L${row}`) || '')
  const description = String(sheetValue(`E${row}`) || '')
  const amount = Number(sheetValue(`M${row}`) || 0)
  if (!description || !/A RECEBER|INFORMAÇÕES PENDENTES/i.test(status)) continue
  if (amount > 0) {
    pipelineRows.push({
      group: 'Pipeline julho — sem data',
      date: '',
      description,
      counterparty: String(sheetValue(`F${row}`) || ''),
      amount: r2(amount),
      status,
      action: 'Confirmar fechamento, NF, responsável e data de pagamento.',
      source: 'FINANCEIRO BULA 2026 (5).xlsx',
    })
  } else {
    pipelineNoValue.push(description)
  }
}
// Magda aparece em junho com valor ainda desconhecido.
pipelineNoValue.unshift('LEILÃO TOUROS MAGDA')

const pipelineTotal = r2(pipelineRows.reduce((sum, row) => sum + row.amount, 0))
assert.equal(pipelineTotal, 105709)
const opportunityTotal = r2(noDateErpTotal + pipelineTotal)
assert.equal(opportunityTotal, 239344)

const allReceivables = [
  ...scheduledInflows.map((row) => ({
    group: 'Fluxo-base',
    date: row.date,
    description: row.description,
    counterparty: '',
    amount: row.amount,
    status: row.confidence,
    action: 'Acompanhar a baixa na data e conciliar com o extrato.',
    source: row.source,
  })),
  ...afterHorizonInflows.map((row) => ({
    group: 'Após 20/08 — fora do horizonte',
    date: row.date,
    description: row.description,
    counterparty: '',
    amount: row.amount,
    status: row.confidence,
    action: 'Não compõe o saldo projetado até 20/08; acompanhar para o próximo ciclo.',
    source: row.source,
  })),
  ...noDateReceivables,
  ...pipelineRows,
]

// ---------------------------------------------------------------------------
// 7) Cenários
// ---------------------------------------------------------------------------
const julyOtherInflows = r2(scheduledInflows.filter((row) => row.date.startsWith('2026-07')).reduce((sum, row) => sum + row.amount, 0))
const julyPayroll = salaryTotal
const julyClosingBeforeCommission = r2(startingCash + julyOtherInflows - julyPayroll)
const maxCommissionNoDeficit = julyClosingBeforeCommission
const maxCommissionWith20kBuffer = r2(julyClosingBeforeCommission - 20000)
const maxCommissionWithPayrollBuffer = r2(julyClosingBeforeCommission - julyPayroll)
const julyTaxReserve = r2(julyOtherInflows * 0.18)
const julyFreeBeforeCommission = r2(julyClosingBeforeCommission - julyTaxReserve)
const julyCommissionScheduled = r2(commissionSchedule
  .filter((row) => row.date.startsWith('2026-07'))
  .reduce((sum, row) => sum + row.amount, 0))
const julyClosingAfterPlan = monthly[0].closingGross
assert.equal(julyCommissionScheduled, 39213.93)
assert.equal(julyClosingAfterPlan, isFabio7000Scenario ? 72104.53 : 67404.53)

const horizonClosingBase = endingGross
const jmpFirstInstallment = 165667.50
const horizonClosingNoJmp = r2(horizonClosingBase - jmpFirstInstallment)
assert.equal(horizonClosingNoJmp, isFabio7000Scenario ? -39428.66 : -44128.66)

// ---------------------------------------------------------------------------
// 8) Gráficos SVG/PNG
// ---------------------------------------------------------------------------
const chartWidth = 900
const chartHeight = 300
const moneyCompact = (value) => {
  const n = Number(value)
  if (Math.abs(n) >= 1000000) return `R$ ${(n / 1000000).toFixed(1).replace('.', ',')} mi`
  if (Math.abs(n) >= 1000) return `R$ ${(n / 1000).toFixed(0)} mil`
  return brl(n)
}

function lineChartSvg() {
  const values = monthly.flatMap((row) => [row.closingGross, row.closingFree])
  const min = Math.min(0, ...values)
  const max = Math.max(...values) * 1.08
  const left = 70, right = 25, top = 38, bottom = 52
  const w = chartWidth - left - right
  const h = chartHeight - top - bottom
  const x = (i) => left + i * (w / (monthly.length - 1))
  const y = (v) => top + (max - v) / (max - min) * h
  const points = (key) => monthly.map((row, i) => `${x(i)},${y(row[key])}`).join(' ')
  const ticks = 4
  let grid = ''
  for (let i = 0; i <= ticks; i += 1) {
    const v = min + (max - min) * (ticks - i) / ticks
    const yy = top + h * i / ticks
    grid += `<line x1="${left}" y1="${yy}" x2="${chartWidth - right}" y2="${yy}" stroke="#e2e2e2" stroke-width="1"/>`
    grid += `<text x="${left - 9}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#666">${esc(moneyCompact(v))}</text>`
  }
  const labels = monthly.map((row, i) => `<text x="${x(i)}" y="${chartHeight - 20}" text-anchor="middle" font-size="12" fill="#444">${row.label}</text>`).join('')
  const dots = (key, color) => monthly.map((row, i) => `<circle cx="${x(i)}" cy="${y(row[key])}" r="4" fill="${color}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${chartWidth}" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <text x="${left}" y="20" font-family="Arial" font-size="16" font-weight="700" fill="#171717">Saldo projetado por mês</text>
    ${grid}
    <line x1="${left}" y1="${y(0)}" x2="${chartWidth - right}" y2="${y(0)}" stroke="#777" stroke-width="1.2"/>
    <polyline points="${points('closingGross')}" fill="none" stroke="#2f6b43" stroke-width="4"/>
    <polyline points="${points('closingFree')}" fill="none" stroke="#c29b38" stroke-width="4"/>
    ${dots('closingGross', '#2f6b43')}
    ${dots('closingFree', '#c29b38')}
    ${labels}
    <rect x="${chartWidth - 320}" y="8" width="12" height="4" fill="#2f6b43"/><text x="${chartWidth - 300}" y="15" font-size="11" fill="#444">Caixa bruto</text>
    <rect x="${chartWidth - 195}" y="8" width="12" height="4" fill="#c29b38"/><text x="${chartWidth - 175}" y="15" font-size="11" fill="#444">Livre após reserva de 18%</text>
  </svg>`
}

function barChartSvg() {
  const max = Math.max(...monthly.flatMap((row) => [row.inflows, row.outflows])) * 1.08
  const left = 70, right = 25, top = 38, bottom = 52
  const w = chartWidth - left - right
  const h = chartHeight - top - bottom
  const groupW = w / monthly.length
  const barW = groupW * 0.28
  const y = (v) => top + h - (v / max) * h
  let grid = ''
  for (let i = 0; i <= 4; i += 1) {
    const v = max * (4 - i) / 4
    const yy = top + h * i / 4
    grid += `<line x1="${left}" y1="${yy}" x2="${chartWidth - right}" y2="${yy}" stroke="#e2e2e2"/>`
    grid += `<text x="${left - 9}" y="${yy + 4}" text-anchor="end" font-size="11" fill="#666">${esc(moneyCompact(v))}</text>`
  }
  const bars = monthly.map((row, i) => {
    const center = left + groupW * i + groupW / 2
    const inH = top + h - y(row.inflows)
    const outH = top + h - y(row.outflows)
    return `<rect x="${center - barW - 2}" y="${y(row.inflows)}" width="${barW}" height="${inH}" fill="#4b815a" rx="2"/>
      <rect x="${center + 2}" y="${y(row.outflows)}" width="${barW}" height="${outH}" fill="#a64d45" rx="2"/>
      <text x="${center}" y="${chartHeight - 20}" text-anchor="middle" font-size="12" fill="#444">${row.label}</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${chartWidth}" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <text x="${left}" y="20" font-family="Arial" font-size="16" font-weight="700" fill="#171717">Entradas e saídas previstas</text>
    ${grid}${bars}
    <rect x="${chartWidth - 220}" y="8" width="12" height="8" fill="#4b815a"/><text x="${chartWidth - 200}" y="16" font-size="11" fill="#444">Entradas</text>
    <rect x="${chartWidth - 125}" y="8" width="12" height="8" fill="#a64d45"/><text x="${chartWidth - 105}" y="16" font-size="11" fill="#444">Saídas</text>
  </svg>`
}

const lineSvg = lineChartSvg()
const barSvg = barChartSvg()
const linePng = await sharp(Buffer.from(lineSvg)).png().toBuffer()
const barPng = await sharp(Buffer.from(barSvg)).png().toBuffer()

// ---------------------------------------------------------------------------
// 9) Planilha Excel
// ---------------------------------------------------------------------------
const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria / Codex'
wb.created = new Date()
wb.modified = new Date()
wb.calcProperties.fullCalcOnLoad = true

const COLORS = {
  black: '171717',
  charcoal: '242424',
  gold: 'C5A34C',
  green: '3F704D',
  paleGreen: 'EAF3E9',
  red: 'A64D45',
  paleRed: 'F7E9E7',
  paleGold: 'F7F2E5',
  gray: '666666',
  paleGray: 'F3F3F3',
  white: 'FFFFFF',
}
const moneyFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00'
const dateFmt = 'dd/mm/yyyy'

function styleTitle(ws, title, subtitle, lastCol) {
  ws.mergeCells(1, 1, 1, lastCol)
  ws.getCell(1, 1).value = title
  ws.getCell(1, 1).font = { name: 'Arial', size: 20, bold: true, color: { argb: COLORS.white } }
  ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.black } }
  ws.getCell(1, 1).alignment = { vertical: 'middle' }
  ws.getRow(1).height = 34
  ws.mergeCells(2, 1, 2, lastCol)
  ws.getCell(2, 1).value = subtitle
  ws.getCell(2, 1).font = { name: 'Arial', size: 10, color: { argb: COLORS.gray } }
  ws.getRow(2).height = 22
  ws.getRow(3).height = 5
  ws.getCell(3, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.gold } }
}

function styleHeader(row) {
  row.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: COLORS.white } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.charcoal } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: COLORS.black } } }
  })
  row.height = 26
}

function stripeRows(ws, start, end) {
  for (let r = start; r <= end; r += 1) {
    if ((r - start) % 2 === 1) {
      ws.getRow(r).eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.paleGray } }
      })
    }
    ws.getRow(r).eachCell((cell) => {
      cell.font = { name: 'Arial', size: 9, color: { argb: COLORS.black } }
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = { bottom: { style: 'hair', color: { argb: 'D9D9D9' } } }
    })
  }
}

const dash = wb.addWorksheet('Dashboard', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] })
dash.columns = Array.from({ length: 12 }, (_, i) => ({ width: i === 0 ? 3 : 14 }))
styleTitle(
  dash,
  isFabio7000Scenario ? 'CENÁRIO DE PAGAMENTO DAS COMISSÕES — POSIÇÃO DE CAIXA' : 'POSIÇÃO DE CAIXA E FLUXO PREVISTO × REALIZADO',
  `Data-base 23/07/2026 · Horizonte até 20/08/2026 · valores em reais${isFabio7000Scenario ? ' · salário de Fábio ajustado para R$ 7.000' : ''}`,
  12,
)

const cards = [
  { range: 'B5:D7', label: 'CAIXA REALIZADO', value: startingCash, color: COLORS.black, valueColor: COLORS.white },
  { range: 'E5:G7', label: 'COMISSÕES TOTAIS', value: commissionReportTotal, color: COLORS.paleGold, valueColor: COLORS.black, note: 'cronograma negociado' },
  { range: 'H5:J7', label: 'MENOR CAIXA', value: minGrossRow.grossBalance, color: COLORS.paleRed, valueColor: COLORS.red, note: isoToBr(minGrossRow.date) },
  { range: 'K5:L7', label: 'CAIXA EM 20/08', value: endingGross, color: COLORS.paleGreen, valueColor: COLORS.green, note: 'todas as obrigações' },
]
for (const card of cards) {
  dash.mergeCells(card.range)
  const cell = dash.getCell(card.range.split(':')[0])
  cell.value = `${card.label}\n${brl(card.value)}${card.note ? `\n${card.note}` : ''}`
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: card.color } }
  cell.font = { name: 'Arial', size: 14, bold: true, color: { argb: card.valueColor } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
}

dash.mergeCells('B9:L9')
dash.getCell('B9').value = `Fluxo atualizado: Bula Remates ${brl(51200)} em 23/07, RS ${brl(8775)} em 30/07 e comissões parceladas em 27/07, 10/08 e 11/08. Folha ${brl(julyPayroll)} + reembolso ${brl(reimbursementAverage)}.`
dash.getCell('B9').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.paleGold } }
dash.getCell('B9').font = { name: 'Arial', size: 10, bold: true, color: { argb: COLORS.black } }
dash.getCell('B9').alignment = { vertical: 'middle', wrapText: true }
dash.getRow(9).height = 34

dash.getCell('B11').value = 'Mês'
dash.getCell('C11').value = 'Saldo inicial'
dash.getCell('D11').value = 'Entradas'
dash.getCell('E11').value = 'Saídas'
dash.getCell('F11').value = 'Reserva 18%'
dash.getCell('G11').value = 'Saldo bruto'
dash.getCell('H11').value = 'Saldo livre'
styleHeader(dash.getRow(11))
monthly.forEach((row, i) => {
  const r = 12 + i
  dash.getCell(r, 2).value = row.label
  dash.getCell(r, 3).value = row.openingGross
  dash.getCell(r, 4).value = row.inflows
  dash.getCell(r, 5).value = row.outflows
  dash.getCell(r, 6).value = row.reserve
  dash.getCell(r, 7).value = row.closingGross
  dash.getCell(r, 8).value = row.closingFree
  for (let c = 3; c <= 8; c += 1) dash.getCell(r, c).numFmt = moneyFmt
})
stripeRows(dash, 12, 11 + monthly.length)

const lineImgId = wb.addImage({ buffer: linePng, extension: 'png' })
const barImgId = wb.addImage({ buffer: barPng, extension: 'png' })
dash.addImage(lineImgId, { tl: { col: 1, row: 19 }, ext: { width: 650, height: 217 } })
dash.addImage(barImgId, { tl: { col: 6.7, row: 19 }, ext: { width: 500, height: 167 } })

dash.getCell('B34').value = 'ALERTAS DE GESTÃO'
dash.getCell('B34').font = { name: 'Arial', size: 11, bold: true, color: { argb: COLORS.black } }
dash.mergeCells('B35:L35')
dash.getCell('B35').value = `• Com a Bula Remates, o RS e o cronograma de comissões, o caixa fecha julho positivo em ${brl(julyClosingAfterPlan)}.`
dash.mergeCells('B36:L36')
dash.getCell('B36').value = `• O pagamento de ${brl(5000)} à Fórmula do Boi em 07/08 leva o ponto mínimo do caixa a ${brl(minGrossRow.grossBalance)}.`
dash.mergeCells('B37:L37')
dash.getCell('B37').value = `• Se a primeira parcela conjunta do JMP atrasar além de 20/08, o caixa encerra o horizonte em ${brl(horizonClosingNoJmp)}. Energia segue cadastrada com valor zero.`
for (const row of [35, 36, 37]) {
  dash.getCell(row, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row === 35 ? COLORS.paleGreen : COLORS.paleGold } }
  dash.getCell(row, 2).font = { name: 'Arial', size: 10, bold: row === 35, color: { argb: COLORS.black } }
  dash.getCell(row, 2).alignment = { wrapText: true, vertical: 'middle' }
  dash.getRow(row).height = 25
}

const flowWs = wb.addWorksheet('Fluxo Diário', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
styleTitle(flowWs, 'FLUXO DIÁRIO PREVISTO × REALIZADO', 'Saldo bruto e saldo livre após reserva gerencial de 18% sobre as entradas futuras', 12)
flowWs.columns = [
  { header: 'Data', key: 'date', width: 13 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Tipo', key: 'type', width: 13 },
  { header: 'Descrição', key: 'description', width: 48 },
  { header: 'Entrada', key: 'inflow', width: 16 },
  { header: 'Saída', key: 'outflow', width: 16 },
  { header: 'Reserva 18%', key: 'reserve', width: 16 },
  { header: 'Variação livre', key: 'freeNet', width: 16 },
  { header: 'Saldo bruto', key: 'gross', width: 17 },
  { header: 'Saldo livre', key: 'free', width: 17 },
  { header: 'Confiança', key: 'confidence', width: 14 },
  { header: 'Fonte', key: 'source', width: 42 },
]
flowWs.getRow(4).values = flowWs.columns.map((col) => col.header)
styleHeader(flowWs.getRow(4))
flowEvents.forEach((row, i) => {
  const r = 5 + i
  flowWs.getCell(r, 1).value = excelDate(row.date)
  flowWs.getCell(r, 1).numFmt = dateFmt
  flowWs.getCell(r, 2).value = row.status
  flowWs.getCell(r, 3).value = row.type
  flowWs.getCell(r, 4).value = row.description
  flowWs.getCell(r, 5).value = row.inflow || null
  flowWs.getCell(r, 6).value = row.outflow || null
  flowWs.getCell(r, 7).value = row.taxReserve || null
  flowWs.getCell(r, 8).value = row.freeNet
  flowWs.getCell(r, 9).value = row.grossBalance
  flowWs.getCell(r, 10).value = row.freeBalance
  flowWs.getCell(r, 11).value = row.confidence
  flowWs.getCell(r, 12).value = row.source
  for (let c = 5; c <= 10; c += 1) flowWs.getCell(r, c).numFmt = moneyFmt
})
stripeRows(flowWs, 5, 4 + flowEvents.length)
flowWs.autoFilter = { from: 'A4', to: `L${4 + flowEvents.length}` }
flowWs.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }

const monthlyWs = wb.addWorksheet('Resumo Mensal', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
styleTitle(monthlyWs, 'RESUMO MENSAL — TODAS AS OBRIGAÇÕES', 'Fluxo completo, com comissões integrais, salários e sensibilidade ao recebimento do JMP', 9)
monthlyWs.columns = [
  { width: 15 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  { width: 18 }, { width: 18 }, { width: 18 }, { width: 42 },
]
monthlyWs.getRow(4).values = ['Mês', 'Saldo inicial', 'Entradas', 'Saídas', 'Reserva 18%', 'Variação', 'Saldo bruto', 'Saldo livre', 'Leitura']
styleHeader(monthlyWs.getRow(4))
monthly.forEach((row, i) => {
  const r = 5 + i
  monthlyWs.getRow(r).values = [
    row.label, row.openingGross, row.inflows, row.outflows, row.reserve,
    row.net, row.closingGross, row.closingFree,
    row.month === '2026-07' ? 'Mês mais apertado antes da entrada do JMP'
      : row.month === '2026-08' ? 'Primeira parcela do JMP recompõe o caixa'
        : row.month === '2026-09' ? 'Segunda parcela do JMP sustenta o trimestre'
          : 'Sem novas entradas confirmadas no cenário-base',
  ]
  for (let c = 2; c <= 8; c += 1) monthlyWs.getCell(r, c).numFmt = moneyFmt
})
stripeRows(monthlyWs, 5, 4 + monthly.length)

monthlyWs.getCell('A13').value = 'CRONOGRAMA DEFINIDO PARA AS COMISSÕES'
monthlyWs.getCell('A13').font = { name: 'Arial', size: 11, bold: true }
monthlyWs.getRow(14).values = ['Beneficiário', 'Valor integral', '27/07', '10/08', '11/08', 'Tratamento no fluxo']
styleHeader(monthlyWs.getRow(14))
commissionPayables.forEach((row, i) => {
  const r = 15 + i
  monthlyWs.getCell(r, 1).value = row.beneficiary
  monthlyWs.getCell(r, 2).value = row.amount
  monthlyWs.getCell(r, 3).value = scheduledCommissionAmount(row.beneficiary, '2026-07-27') || null
  monthlyWs.getCell(r, 4).value = scheduledCommissionAmount(row.beneficiary, '2026-08-10') || null
  monthlyWs.getCell(r, 5).value = scheduledCommissionAmount(row.beneficiary, '2026-08-11') || null
  monthlyWs.getCell(r, 6).value = 'Cronograma incorporado ao fluxo diário'
  for (let c = 2; c <= 5; c += 1) monthlyWs.getCell(r, c).numFmt = moneyFmt
})
stripeRows(monthlyWs, 15, 14 + commissionPayables.length)

monthlyWs.getCell('A24').value = 'SENSIBILIDADE DA 1ª PARCELA DO JMP'
monthlyWs.getCell('A24').font = { name: 'Arial', size: 11, bold: true }
monthlyWs.getRow(25).values = ['Situação', 'Caixa em 20/08', 'Diferença', 'Leitura']
styleHeader(monthlyWs.getRow(25))
const jmpScenarios = [
  ['JMP recebido em 09/08', horizonClosingBase, 0, 'Caixa volta ao positivo'],
  ['Primeira parcela conjunta atrasa além de 20/08', horizonClosingNoJmp, -jmpFirstInstallment, 'Caixa permanece negativo'],
]
jmpScenarios.forEach((row, i) => {
  const r = 26 + i
  monthlyWs.getRow(r).values = row
  monthlyWs.getCell(r, 2).numFmt = moneyFmt
  monthlyWs.getCell(r, 3).numFmt = moneyFmt
})
stripeRows(monthlyWs, 26, 27)

const obligationsWs = wb.addWorksheet('Obrigações Completas', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
styleTitle(obligationsWs, 'OBRIGAÇÕES COMPLETAS — SEM FILTRO', 'Todas as comissões do relatório de 27/07, todos os salários e demais contas conhecidas até 20/08', 8)
obligationsWs.columns = [
  { width: 13 }, { width: 18 }, { width: 28 }, { width: 48 },
  { width: 28 }, { width: 18 }, { width: 42 }, { width: 18 },
]
obligationsWs.getRow(4).values = ['Vencimento', 'Grupo', 'Beneficiário', 'Descrição', 'Referência', 'Valor integral', 'Fonte', 'Incluído no fluxo?']
styleHeader(obligationsWs.getRow(4))
fullObligations.forEach((row, i) => {
  const r = 5 + i
  obligationsWs.getCell(r, 1).value = excelDate(row.date)
  obligationsWs.getCell(r, 1).numFmt = dateFmt
  obligationsWs.getCell(r, 2).value = row.category
  obligationsWs.getCell(r, 3).value = row.beneficiary
  obligationsWs.getCell(r, 4).value = row.description
  obligationsWs.getCell(r, 5).value = row.reference || ''
  obligationsWs.getCell(r, 6).value = row.amount
  obligationsWs.getCell(r, 6).numFmt = moneyFmt
  obligationsWs.getCell(r, 7).value = row.source
  obligationsWs.getCell(r, 8).value = 'SIM — integral'
})
const obligationsTotalRow = 5 + fullObligations.length
obligationsWs.getCell(obligationsTotalRow, 1).value = 'TOTAL'
obligationsWs.getCell(obligationsTotalRow, 1).font = { bold: true }
obligationsWs.getCell(obligationsTotalRow, 6).value = scheduledOutflowsTotal
obligationsWs.getCell(obligationsTotalRow, 6).numFmt = moneyFmt
obligationsWs.getCell(obligationsTotalRow, 6).font = { bold: true }
stripeRows(obligationsWs, 5, 4 + fullObligations.length)
obligationsWs.autoFilter = { from: 'A4', to: `H${4 + fullObligations.length}` }

const recWs = wb.addWorksheet('Recebimentos', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
styleTitle(recWs, 'RECEBIMENTOS FUTUROS E OPORTUNIDADES', 'Entradas com data alimentam o caixa-base; itens sem data aparecem apenas como potencial', 9)
recWs.columns = [
  { width: 24 }, { width: 13 }, { width: 48 }, { width: 26 }, { width: 17 },
  { width: 18 }, { width: 55 }, { width: 38 }, { width: 14 },
]
recWs.getRow(4).values = ['Grupo', 'Data', 'Descrição', 'Contraparte', 'Valor', 'Status', 'Próxima ação / observação', 'Fonte', 'Entra no caixa-base?']
styleHeader(recWs.getRow(4))
allReceivables.forEach((row, i) => {
  const r = 5 + i
  recWs.getCell(r, 1).value = row.group
  if (row.date) {
    recWs.getCell(r, 2).value = excelDate(row.date)
    recWs.getCell(r, 2).numFmt = dateFmt
  }
  recWs.getCell(r, 3).value = row.description
  recWs.getCell(r, 4).value = row.counterparty
  recWs.getCell(r, 5).value = row.amount
  recWs.getCell(r, 5).numFmt = moneyFmt
  recWs.getCell(r, 6).value = row.status
  recWs.getCell(r, 7).value = row.action
  recWs.getCell(r, 8).value = row.source
  recWs.getCell(r, 9).value = row.group === 'Fluxo-base' ? 'SIM' : 'NÃO'
})
stripeRows(recWs, 5, 4 + allReceivables.length)
recWs.autoFilter = { from: 'A4', to: `I${4 + allReceivables.length}` }

const cpWs = wb.addWorksheet('Contas a Pagar', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
styleTitle(cpWs, 'CONTAS A PAGAR — ERP + AJUSTE MANUAL', 'Posição bruta do ERP mantida integralmente para conferência. O fluxo usa o relatório específico de comissões para não duplicar a mesma obrigação.', 12)
cpWs.columns = [
  { width: 13 }, { width: 13 }, { width: 48 }, { width: 28 }, { width: 25 }, { width: 25 },
  { width: 17 }, { width: 16 }, { width: 24 }, { width: 38 }, { width: 14 }, { width: 18 },
]
cpWs.getRow(4).values = ['Vencimento', 'Status', 'Descrição', 'Fornecedor', 'Categoria', 'Centro de custo', 'Saldo', 'Documento', 'Recorrência', 'Observação', 'Entra no caixa-base?', 'Tratamento']
styleHeader(cpWs.getRow(4))
cpReportRows.forEach((row, i) => {
  const r = 5 + i
  const due27Variable = row.vencimento === '2026-07-27'
    && ['Comissão Funcionário', 'Repasse Assessorias/Parceiros'].includes(row.categoria_nome)
  const zeroEnergy = row.saldo === 0 && /Energia/i.test(row.descricao)
  cpWs.getCell(r, 1).value = excelDate(row.vencimento)
  cpWs.getCell(r, 1).numFmt = dateFmt
  cpWs.getCell(r, 2).value = row.status
  cpWs.getCell(r, 3).value = row.descricao
  cpWs.getCell(r, 4).value = row.fornecedor_nome
  cpWs.getCell(r, 5).value = row.categoria_nome
  cpWs.getCell(r, 6).value = row.centro_nome
  cpWs.getCell(r, 7).value = row.saldo
  cpWs.getCell(r, 7).numFmt = moneyFmt
  cpWs.getCell(r, 8).value = row.numero_documento
  cpWs.getCell(r, 9).value = row.recorrencia
  cpWs.getCell(r, 10).value = row.observacoes
  cpWs.getCell(r, 11).value = due27Variable || zeroEnergy ? 'NÃO' : 'SIM'
  cpWs.getCell(r, 12).value = due27Variable
    ? 'Exibido para conciliação; fluxo usa relatório integral de R$ 144.047,12 para evitar duplicidade'
    : zeroEnergy ? 'Preencher valor antes do vencimento' : 'Considerado pelo vencimento'
})
stripeRows(cpWs, 5, 4 + cpReportRows.length)
cpWs.autoFilter = { from: 'A4', to: `L${4 + cpReportRows.length}` }

const assumptionsWs = wb.addWorksheet('Premissas', { views: [{ showGridLines: false }] })
styleTitle(assumptionsWs, 'PREMISSAS, DIVERGÊNCIAS E LIMITAÇÕES', 'Leitura obrigatória para usar o fluxo como instrumento de decisão', 6)
assumptionsWs.columns = [{ width: 22 }, { width: 36 }, { width: 26 }, { width: 26 }, { width: 48 }, { width: 54 }]
assumptionsWs.getRow(4).values = ['Tema', 'Premissa adotada', 'Fonte 1', 'Fonte 2', 'Divergência / risco', 'Tratamento no relatório']
styleHeader(assumptionsWs.getRow(4))
const assumptions = [
  ['Saldo inicial', brl(startingCash), 'Imagem Sicoob', 'Imagem Sicredi', 'Não inclui aplicações ou contas não exibidas', 'Tratado como realizado em 23/07/2026'],
  ['Bula Remates — leilões de junho', `${brl(51200)} em 23/07`, 'Confirmação do chefe em 23/07', 'Imagem dos leilões', 'Recebimento informado para hoje e ainda separado do saldo bancário inicial', 'Incluído integralmente como entrada prevista em 23/07/2026'],
  ['Comissões 27/07', brl(commissionReportTotal), 'Relatório Comissões a Pagar 27/07', 'Definição do chefe em 23/07', `ERP bruto mostra ${brl(erpCommissionDue27)} e exige conciliação`, `Total integral mantido; pagamentos distribuídos em 27/07 (${brl(39213.93)}), 10/08 (${brl(30882.53)}) e 11/08 (${brl(73950.66)})`],
  ['Folha de julho', brl(julyPayroll), 'ERP', 'Orientação do chefe em 23/07', `ERP continha ${brl(35800)}; Ana não estava cadastrada${isFabio7000Scenario ? ' e Fábio constava com R$ 11.700,00' : ''}`, isFabio7000Scenario ? `Fábio ajustado para ${brl(7000)} e Ana incluída em ${brl(6000)}, totalizando ${brl(julyPayroll)}` : `Incluídos ${brl(6000)} para Ana, totalizando ${brl(julyPayroll)}`],
  ['Reembolso dos assessores', brl(reimbursementAverage), 'ERP — histórico de pagamentos', 'Orientação do chefe em 23/07', 'Valor futuro é variável e ainda não possui prestação de contas fechada', `Provisão pela média simples de ${brl(7200)}, ${brl(3620.67)} e ${brl(1772.15)}`],
  ['Fórmula do Boi', brl(5000), 'Orientação do chefe em 23/07', 'Calendário de agosto/2026', 'Valor ainda não constava no contas a pagar consultado', 'Incluído em 07/08/2026, 5º dia útil de agosto'],
  ['Terra Brava', `${brl(7215)} em 3 parcelas`, 'Mensagem 23/07', 'ERP', 'Planilha mostra R$ 8.235; ERP retificado mostra R$ 7.215', 'Usado o menor valor conciliado: 3 × R$ 2.405'],
  ['JMP', `2 parcelas conjuntas de ${brl(165667.50)}`, 'Mensagem 23/07', 'ERP', 'ERP tinha 14/08 e 13/09; mensagem informa 09/08 e 09/09', 'Datas da mensagem prevalecem; valores corrigidos por Fêmeas/Machos'],
  ['Matinha', 'R$ 2.800 em 29/07 e R$ 2.800 em 12/08', 'Mensagem 23/07', 'ERP', 'Tangará aparece como R$ 1.080 na mensagem e R$ 1.090 no ERP', 'Tangará já foi pago e está dentro do saldo inicial; não entra novamente'],
  ['RS Agropecuária', `${brl(8775)} em 30/07`, 'Mensagem confirmada em 23/07', 'ERP', 'Percentual confirmado em 5% após tratativa', 'Incluído integralmente nas entradas de 30/07 e retirado dos recebíveis sem data'],
  ['Tributos', 'Reserva gerencial de 18% das entradas futuras', 'Planilha coluna Imposto', 'Política interna', 'Data efetiva do DAS não está detalhada no ERP', 'Exibidos saldo bruto e saldo livre após reserva'],
  ['Energia', 'R$ 0 no ERP', 'Contas a pagar', '', 'Valor real não informado', 'Não reduz o caixa; destacado como lacuna'],
  ['Recebíveis sem data', brl(opportunityTotal), 'ERP', 'Planilha', 'Podem atrasar, ser cancelados ou exigir ajuste de valor', 'Fora do caixa-base até existir data firme'],
  ['Após 20/08', 'Movimentos posteriores ficam fora do saldo do horizonte', 'Planilha', 'ERP', 'Folha de agosto e parcelas posteriores exigem nova atualização', 'Listados como fora do horizonte, sem afetar o caixa em 20/08'],
]
assumptions.forEach((row, i) => {
  assumptionsWs.getRow(5 + i).values = row
})
stripeRows(assumptionsWs, 5, 4 + assumptions.length)

assumptionsWs.getCell(`A${7 + assumptions.length}`).value = 'ITENS SEM VALOR NA PLANILHA'
assumptionsWs.getCell(`A${7 + assumptions.length}`).font = { name: 'Arial', size: 11, bold: true }
assumptionsWs.mergeCells(8 + assumptions.length, 1, 8 + assumptions.length, 6)
assumptionsWs.getCell(8 + assumptions.length, 1).value = pipelineNoValue.join(' · ')
assumptionsWs.getCell(8 + assumptions.length, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.paleGold } }
assumptionsWs.getCell(8 + assumptions.length, 1).alignment = { wrapText: true, vertical: 'middle' }
assumptionsWs.getRow(8 + assumptions.length).height = 36

mkdirSync(outputDir, { recursive: true })
const xlsxPath = join(outputDir, `${outputStem}.xlsx`)
const desktopXlsx = join(desktop, `${desktopStem}.xlsx`)
await wb.xlsx.writeFile(xlsxPath)
await wb.xlsx.writeFile(desktopXlsx)

// ---------------------------------------------------------------------------
// 10) Relatório executivo em HTML/PDF
// ---------------------------------------------------------------------------
const monthlyTable = monthly.map((row) => `
  <tr>
    <td>${esc(row.label)}</td>
    <td class="money">${brl(row.openingGross)}</td>
    <td class="money positive">${brl(row.inflows)}</td>
    <td class="money negative">${brl(row.outflows)}</td>
    <td class="money">${brl(row.reserve)}</td>
    <td class="money strong">${brl(row.closingGross)}</td>
    <td class="money">${brl(row.closingFree)}</td>
  </tr>`).join('')

const commissionAgendaLabels = {
  '2026-07-27': 'Comissões — Fábio, Douglas e Leonardo 1/3; João e Matheus integrais',
  '2026-08-10': 'Comissões — Gustavo Rusa e Bulinha integrais',
  '2026-08-11': 'Comissões — saldo 2/3 de Fábio, Douglas e Leonardo',
}
const nearTermEvents = []
const commissionAgendaRows = new Map()
for (const row of forecastRows.filter((item) => item.date <= '2026-08-12')) {
  const isCommission = row.type === 'Saída' && row.description.startsWith('Comissão —')
  if (!isCommission) {
    nearTermEvents.push(row)
    continue
  }
  if (!commissionAgendaRows.has(row.date)) {
    const grouped = {
      ...row,
      description: commissionAgendaLabels[row.date] || 'Comissões — cronograma negociado',
      outflow: 0,
      source: 'Cronograma definido em 23/07/2026',
    }
    commissionAgendaRows.set(row.date, grouped)
    nearTermEvents.push(grouped)
  }
  const grouped = commissionAgendaRows.get(row.date)
  grouped.outflow = r2(grouped.outflow + row.outflow)
  grouped.net = r2(-grouped.outflow)
  grouped.grossBalance = row.grossBalance
  grouped.freeBalance = row.freeBalance
}
const nearTermTable = nearTermEvents.map((row) => `
  <tr>
    <td>${isoToBr(row.date)}</td>
    <td><span class="tag ${row.type === 'Entrada' ? 'in' : 'out'}">${row.type}</span></td>
    <td>${esc(row.description)}<div class="sub">${esc(row.confidence)} · ${esc(row.source)}</div></td>
    <td class="money ${row.inflow ? 'positive' : 'negative'}">${row.inflow ? brl(row.inflow) : `− ${brl(row.outflow)}`}</td>
    <td class="money strong ${row.grossBalance < 0 ? 'negative' : ''}">${brl(row.grossBalance)}</td>
  </tr>`).join('')

const topNoDate = [...noDateReceivables].sort((a, b) => b.amount - a.amount)
const noDateTable = topNoDate.map((row) => `
  <tr>
    <td>${esc(row.group)}</td>
    <td>${esc(row.description)}</td>
    <td class="money">${brl(row.amount)}</td>
    <td>${esc(row.counterparty || '—')}</td>
    <td>${isoToBr(row.date)}</td>
  </tr>`).join('')

const commissionTable = commissionPayables.map((row) => `
  <tr>
    <td>${esc(row.beneficiary)}</td>
    <td class="money strong">${brl(row.amount)}</td>
    <td class="money">${scheduledCommissionAmount(row.beneficiary, '2026-07-27') ? brl(scheduledCommissionAmount(row.beneficiary, '2026-07-27')) : '—'}</td>
    <td class="money">${scheduledCommissionAmount(row.beneficiary, '2026-08-10') ? brl(scheduledCommissionAmount(row.beneficiary, '2026-08-10')) : '—'}</td>
    <td class="money">${scheduledCommissionAmount(row.beneficiary, '2026-08-11') ? brl(scheduledCommissionAmount(row.beneficiary, '2026-08-11')) : '—'}</td>
  </tr>`).join('')

const salaryTable = salaryPayables.map((row) => `
  <tr>
    <td>${esc(row.beneficiary)}</td>
    <td>${esc(row.description)}</td>
    <td class="money strong">${brl(row.amount)}</td>
    <td>${esc(row.source)}</td>
  </tr>`).join('')

const additionalPayables = [...manualPayables, ...otherPayables]
  .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description))
const additionalPayablesTotal = r2(additionalPayables.reduce((sum, row) => sum + row.amount, 0))
assert.equal(additionalPayablesTotal, 13697.61)
const otherPayablesTable = additionalPayables.map((row) => `
  <tr>
    <td>${isoToBr(row.date)}</td>
    <td>${esc(row.category)}</td>
    <td>${esc(row.description)}</td>
    <td class="money strong">${brl(row.amount)}</td>
  </tr>`).join('')

const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Posição de caixa e fluxo previsto realizado</title>
  <style>
    @page { size: A4; margin: 11mm 10mm 13mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #171717; background: #fff; font-size: 10px; line-height: 1.35; }
    .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #171717; padding-bottom: 9px; }
    .brand { font-size: 20px; font-weight: 800; letter-spacing: 2.5px; text-transform: uppercase; }
    .brand small { display: block; color: #666; font-size: 8px; font-weight: 400; letter-spacing: 1.6px; }
    .meta { color: #666; font-size: 8.5px; text-align: right; }
    .gold { width: 64px; height: 3px; margin: 7px 0 13px; background: #c5a34c; }
    h1 { margin: 0; font-size: 16.5px; letter-spacing: 1px; text-transform: uppercase; }
    h2 { margin: 15px 0 7px; font-size: 12px; letter-spacing: .7px; text-transform: uppercase; }
    .subtitle { margin: 4px 0 12px; color: #555; font-size: 9.5px; }
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
    .card { min-height: 76px; padding: 10px; border: 1px solid #ddd; background: #fafafa; }
    .card.dark { color: #fff; background: #171717; border-color: #171717; }
    .card .label { color: #777; font-size: 7.8px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; }
    .card.dark .label { color: #d7bf77; }
    .card .value { margin-top: 4px; font-size: 17px; font-weight: 800; white-space: nowrap; }
    .card .note { margin-top: 4px; color: #666; font-size: 8px; }
    .card.dark .note { color: #ccc; }
    .callout { margin-top: 9px; padding: 8px 10px; border-left: 3px solid #c5a34c; background: #f8f4e8; }
    .callout.red { border-left-color: #a64d45; background: #fbefed; }
    .callout.green { border-left-color: #3f704d; background: #edf5ed; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    th { padding: 4px 5px; border-bottom: 1.5px solid #171717; color: #555; font-size: 7.7px; letter-spacing: .5px; text-align: left; text-transform: uppercase; }
    td { padding: 4px 5px; border-bottom: 1px solid #ddd; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .money { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .positive { color: #356842; }
    .negative { color: #9a443c; }
    .strong { font-weight: 800; }
    .sub { margin-top: 1px; color: #777; font-size: 7.8px; }
    .tag { display: inline-block; min-width: 42px; padding: 1px 5px; border-radius: 10px; font-size: 7.5px; font-weight: 700; text-align: center; }
    .tag.in { color: #356842; background: #eaf3e9; }
    .tag.out { color: #9a443c; background: #f7e9e7; }
    .chart { margin-top: 9px; padding: 5px 7px; border: 1px solid #ddd; break-inside: avoid; }
    .chart svg { display: block; width: 100%; height: auto; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
    .page-break { break-before: page; }
    .repeat { padding-top: 11mm; }
    .kpis { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 8px; }
    .kpi { padding: 8px; border-top: 3px solid #c5a34c; background: #f6f6f6; }
    .kpi span { display: block; color: #666; font-size: 8px; text-transform: uppercase; }
    .kpi strong { display: block; margin-top: 3px; font-size: 15px; }
    .action { display: grid; grid-template-columns: 22px 1fr; gap: 7px; margin-top: 6px; padding: 7px; background: #f6f6f6; }
    .action .n { width: 20px; height: 20px; padding-top: 3px; border-radius: 50%; color: #fff; background: #171717; text-align: center; font-size: 8px; font-weight: 700; }
    .footer { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 7px; border-top: 1px solid #bbb; color: #777; font-size: 7.5px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">Bula Assessoria<small>Assessoria Pecuária</small></div>
    <div class="meta">${isFabio7000Scenario ? 'Cenário independente' : 'Documento interno'}<br>Data-base: 23/07/2026<br>Horizonte: 20/08/2026</div>
  </div>
  <div class="gold"></div>
  <h1>${isFabio7000Scenario ? 'Cenário de pagamento das comissões — posição de caixa' : 'Posição de caixa e fluxo previsto × realizado'}</h1>
  <div class="subtitle">Projeção atualizada com ${brl(51200)} da Bula Remates em 23/07, o cronograma negociado das comissões, recebimento do Leilão RS em 30/07${isFabio7000Scenario ? ' e salário fixo de Fábio ajustado para R$ 7.000,00' : ''}.</div>

  <div class="cards">
    <div class="card dark"><div class="label">Caixa realizado</div><div class="value">${brl(startingCash)}</div><div class="note">Sicoob + Sicredi</div></div>
    <div class="card"><div class="label">Comissões totais</div><div class="value">${brl(commissionReportTotal)}</div><div class="note">Parceladas conforme acordo</div></div>
    <div class="card"><div class="label">Menor caixa</div><div class="value positive">${brl(minGrossRow.grossBalance)}</div><div class="note">${isoToBr(minGrossRow.date)}</div></div>
    <div class="card"><div class="label">Caixa em 20/08</div><div class="value positive">${brl(endingGross)}</div><div class="note">Com todas as obrigações</div></div>
  </div>

  <div class="callout green"><strong>Leitura executiva:</strong> com a Bula Remates pagando ${brl(51200)} em 23/07, o RS pagando ${brl(8775)} em 30/07 e as comissões distribuídas entre 27/07, 10/08 e 11/08, o caixa fecha julho positivo em ${brl(julyClosingAfterPlan)}. O ponto mínimo é ${brl(minGrossRow.grossBalance)} em 07/08, antes da entrada do JMP.</div>

  <h2>Posição bancária realizada</h2>
  <table>
    <thead><tr><th>Conta</th><th class="money">Saldo</th><th>Participação</th></tr></thead>
    <tbody>
      ${bankAccounts.map((row) => `<tr><td>${esc(row.account)}</td><td class="money strong">${brl(row.balance)}</td><td>${pct(row.balance / startingCash * 100)}</td></tr>`).join('')}
      <tr><td><strong>Total disponível</strong></td><td class="money strong">${brl(startingCash)}</td><td>100,0%</td></tr>
    </tbody>
  </table>

  <h2>Resumo mensal com todas as obrigações</h2>
  <table>
    <thead><tr><th>Mês</th><th class="money">Saldo inicial</th><th class="money">Entradas</th><th class="money">Saídas</th><th class="money">Reserva 18%</th><th class="money">Saldo bruto</th><th class="money">Saldo livre</th></tr></thead>
    <tbody>${monthlyTable}</tbody>
  </table>

  <div class="chart">${lineSvg}</div>
  <div class="footer"><span>Bula Assessoria — posição de caixa</span><span>1</span></div>

  <div class="page-break"></div>
  <div class="header repeat">
    <div class="brand">Bula Assessoria<small>Obrigações completas</small></div>
    <div class="meta">Sem filtros<br>23/07/2026</div>
  </div>
  <div class="gold"></div>

  <div class="cards">
    <div class="card dark"><div class="label">Comissões</div><div class="value">${brl(commissionReportTotal)}</div><div class="note">27/07 · 10/08 · 11/08</div></div>
    <div class="card"><div class="label">Salários</div><div class="value">${brl(salaryTotal)}</div><div class="note">31/07 · inclui Ana</div></div>
    <div class="card"><div class="label">Reembolsos e outros</div><div class="value">${brl(additionalPayablesTotal)}</div><div class="note">Inclui Fórmula do Boi</div></div>
    <div class="card"><div class="label">Total de saídas</div><div class="value">${brl(scheduledOutflowsTotal)}</div><div class="note">Todas incluídas</div></div>
  </div>

  <h2>Comissões — valor integral e cronograma definido</h2>
  <table>
    <thead><tr><th>Beneficiário</th><th class="money">Valor integral</th><th class="money">27/07</th><th class="money">10/08</th><th class="money">11/08</th></tr></thead>
    <tbody>${commissionTable}</tbody>
    <tfoot><tr><td><strong>Total</strong></td><td class="money strong">${brl(commissionReportTotal)}</td><td class="money strong">${brl(39213.93)}</td><td class="money strong">${brl(30882.53)}</td><td class="money strong">${brl(73950.66)}</td></tr></tfoot>
  </table>

  <h2>Salários de julho — todos incluídos</h2>
  <table>
    <thead><tr><th>Beneficiário</th><th>Descrição</th><th class="money">Valor</th><th>Fonte</th></tr></thead>
    <tbody>${salaryTable}</tbody>
    <tfoot><tr><td colspan="2"><strong>Total da folha</strong></td><td class="money strong">${brl(salaryTotal)}</td><td></td></tr></tfoot>
  </table>

  <h2>Reembolso médio e demais contas até 20/08</h2>
  <table>
    <thead><tr><th>Vencimento</th><th>Categoria</th><th>Descrição</th><th class="money">Valor</th></tr></thead>
    <tbody>${otherPayablesTable}</tbody>
    <tfoot><tr><td colspan="3"><strong>Total de reembolsos e demais contas</strong></td><td class="money strong">${brl(additionalPayablesTotal)}</td></tr></tfoot>
  </table>
  <div class="callout"><strong>Premissa do reembolso:</strong> média de ${brl(reimbursementAverage)} calculada sobre três registros históricos: ${reimbursementHistory.map((row) => `${esc(row.reference)} ${brl(row.amount)}`).join(' · ')}.</div>
  <div class="callout green"><strong>Posição após a atualização:</strong> o caixa encerra julho em ${brl(julyClosingAfterPlan)} e permanece positivo até o JMP, com mínimo de ${brl(minGrossRow.grossBalance)} em 07/08. A Bula Remates adiciona ${brl(51200)} em 23/07 e o RS adiciona ${brl(8775)} em 30/07.</div>

  <div class="footer"><span>Bula Assessoria — obrigações completas</span><span>2</span></div>

  <div class="page-break"></div>
  <div class="header repeat">
    <div class="brand">Bula Assessoria<small>Fluxo de caixa</small></div>
    <div class="meta">Previsto × realizado<br>23/07/2026</div>
  </div>
  <div class="gold"></div>
  <h2>Agenda financeira — todos os próximos movimentos</h2>
  <table>
    <thead><tr><th>Data</th><th>Tipo</th><th>Movimento</th><th class="money">Valor</th><th class="money">Saldo após</th></tr></thead>
    <tbody>${nearTermTable}</tbody>
  </table>

  <div class="kpis">
    <div class="kpi"><span>Entradas com data</span><strong>${brl(scheduledInflowsTotal)}</strong></div>
    <div class="kpi"><span>Saídas completas</span><strong>${brl(scheduledOutflowsTotal)}</strong></div>
    <div class="kpi"><span>Caixa em 20/08</span><strong>${brl(endingGross)}</strong></div>
  </div>

  <h2>Dependência da primeira parcela do JMP</h2>
  <div class="two">
    <div class="callout green"><strong>Com JMP em 09/08:</strong><br>Caixa em 20/08: ${brl(horizonClosingBase)}.</div>
    <div class="callout red"><strong>Se o JMP passar de 20/08:</strong><br>Caixa em 20/08: ${brl(horizonClosingNoJmp)}.</div>
  </div>
  <div class="callout red">Sem a primeira parcela conjunta do JMP, o caixa continua negativo até 20/08 e encerra em ${brl(horizonClosingNoJmp)}. A folha de agosto vence depois do horizonte e não está incluída nesta projeção.</div>

  <div class="footer"><span>Bula Assessoria — agenda financeira</span><span>3</span></div>

  <div class="page-break"></div>
  <div class="header repeat">
    <div class="brand">Bula Assessoria<small>Recebíveis e riscos</small></div>
    <div class="meta">Posição em 23/07/2026</div>
  </div>
  <div class="gold"></div>
  <h2>Recebíveis do ERP sem data firme</h2>
  <table>
    <thead><tr><th>Grupo</th><th>Recebível</th><th class="money">Valor</th><th>Contraparte</th><th>Venc. ERP</th></tr></thead>
    <tbody>${noDateTable}</tbody>
    <tfoot><tr><td colspan="2"><strong>Total sem data — ERP</strong></td><td class="money strong">${brl(noDateErpTotal)}</td><td colspan="2"></td></tr></tfoot>
  </table>

  <h2>Pipeline adicional da planilha</h2>
  <table>
    <thead><tr><th>Evento</th><th>Contraparte</th><th class="money">Receita potencial</th><th>Status</th></tr></thead>
    <tbody>${pipelineRows.map((row) => `<tr><td>${esc(row.description)}</td><td>${esc(row.counterparty || '—')}</td><td class="money">${brl(row.amount)}</td><td>Sem data de pagamento</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="2"><strong>Total com valor informado</strong></td><td class="money strong">${brl(pipelineTotal)}</td><td></td></tr></tfoot>
  </table>
  <div class="callout"><strong>Sem valor definido:</strong> ${esc(pipelineNoValue.join(' · '))}. Esses itens não foram somados ao fluxo nem ao total de oportunidades.</div>

  <h2>Pontos de atenção</h2>
  <div class="action"><div class="n">1</div><div><strong>JMP:</strong> confirmar por escrito as datas 09/08 e 09/09 e acompanhar a compensação bancária. É o principal risco do horizonte.</div></div>
  <div class="action"><div class="n">2</div><div><strong>Comissões:</strong> o total integral de ${brl(commissionReportTotal)} foi mantido e distribuído conforme o cronograma negociado: ${brl(39213.93)} em 27/07, ${brl(30882.53)} em 10/08 e ${brl(73950.66)} em 11/08.</div></div>
  <div class="action"><div class="n">3</div><div><strong>Cobrança:</strong> priorizar MRA, Santa Nazaré, MEAB, Kriz e KatiSpera. Só esses cinco somam ${brl(37140 + 11428 + 12524 + 25170 + 16122 + 11106)}.</div></div>
  <div class="action"><div class="n">4</div><div><strong>Custos ausentes:</strong> preencher energia e reservar futuras comissões/despesas dos leilões de julho antes de considerar o saldo final como totalmente disponível.</div></div>
  <div class="action"><div class="n">5</div><div><strong>RS e Magda:</strong> resolver percentual/valor antes de faturar ou prometer repasse.</div></div>

  <div class="footer"><span>Bula Assessoria — riscos e plano de ação</span><span>4</span></div>
</body>
</html>`

const htmlPath = join(outputDir, `${outputStem}.html`)
const pdfPath = join(outputDir, `${outputStem}.pdf`)
const desktopPdf = join(desktop, `${desktopStem}.pdf`)
writeFileSync(htmlPath, html, 'utf8')

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  const options = {
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  }
  await page.pdf({ ...options, path: pdfPath })
  await page.pdf({ ...options, path: desktopPdf })
} finally {
  await browser.close()
}

console.log(`Caixa realizado: ${brl(startingCash)}`)
console.log(`Menor caixa previsto: ${brl(minGrossRow.grossBalance)} em ${isoToBr(minGrossRow.date)}`)
console.log(`Entradas com data: ${brl(scheduledInflowsTotal)}`)
console.log(`Recebíveis sem data: ${brl(opportunityTotal)}`)
console.log(`Caixa em 20/08: ${brl(endingGross)}`)
console.log(`Livre após reserva de 18%: ${brl(endingFree)}`)
console.log(`PDF: ${desktopPdf}`)
console.log(`XLSX: ${desktopXlsx}`)
