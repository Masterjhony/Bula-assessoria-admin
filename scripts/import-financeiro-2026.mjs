// Importa a planilha "Financeiro_Bula_2026_Organizado (1).xlsx" para o ERP.
//
// Mapeamento:
//   Aba Leiloes      -> erp_contas_receber + erp_contas_pagar (impostos/despesas)
//   Aba A Pagar      -> erp_contas_pagar (comissoes e parceiros)
//   Aba Folha        -> erp_contas_pagar (folha do mes corrente: Maio/2026)
//   Aba Resumo       -> conferencia apenas (nao importa)
//   Aba Acordos      -> observacoes em contas pendentes
//
// Idempotente: usa numero_documento prefixado com BULA-2026- como chave;
// deleta + reinsere a cada execucao.
//
// Uso: node scripts/import-financeiro-2026.mjs

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// ── Carrega .env.local ────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPA_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SUPA_KEY) {
  console.error('SUPABASE_URL / SERVICE_ROLE_KEY ausentes em .env.local')
  process.exit(1)
}

const sb = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } })

// ── Helpers ───────────────────────────────────────────────────────────────
const MESES = {
  JANEIRO: 1, FEVEREIRO: 2, 'MARÇO': 3, MARCO: 3, ABRIL: 4, MAIO: 5,
  JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
}

function isoDate(ano, mes, dia) {
  const m = String(mes).padStart(2, '0')
  const d = String(dia || 1).padStart(2, '0')
  return `${ano}-${m}-${d}`
}

function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function lastDayOfMonth(ano, mes) {
  const d = new Date(Date.UTC(ano, mes, 0))
  return d.toISOString().slice(0, 10)
}

function parseObservacao(obs) {
  if (!obs) return { nf: '', data: null, raw: '' }
  const nfMatch = obs.match(/NF\s*([\d\/]+)/i)
  const pagoMatch = obs.match(/PAGO\s*(\d{1,2}\/\d{1,2})(?:\/\d{2,4})?/i)
  const dataIso = obs.match(/Data:\s*(\d{4}-\d{2}-\d{2})/)
  let pagoDate = null
  if (pagoMatch) {
    const [d, m] = pagoMatch[1].split('/').map((s) => parseInt(s, 10))
    pagoDate = isoDate(2026, m, d)
  } else if (dataIso) {
    pagoDate = dataIso[1]
  }
  return { nf: nfMatch ? nfMatch[1] : '', dataPago: pagoDate, raw: obs }
}

// ── Carrega xlsx ──────────────────────────────────────────────────────────
const xlsxPath = join(root, 'Financeiro_Bula_2026_Organizado (1).xlsx')
const wb = XLSX.readFile(xlsxPath)
const leiloes = XLSX.utils.sheet_to_json(wb.Sheets['Leilões'], { defval: null, header: 1 }).slice(1).filter((r) => r[2] && r[4])
const apagar = XLSX.utils.sheet_to_json(wb.Sheets['A Pagar'], { defval: null, header: 1 }).slice(3).filter((r) => typeof r[0] === 'number')
const folha = XLSX.utils.sheet_to_json(wb.Sheets['Folha & Comissões'], { defval: null, header: 1 }).slice(3).filter((r) => typeof r[0] === 'number')
const acordos = XLSX.utils.sheet_to_json(wb.Sheets['Acordos Pendentes'], { defval: null, header: 1 }).slice(4).filter((r) => typeof r[0] === 'number')

console.log(`Carregado: ${leiloes.length} leilões | ${apagar.length} contas a pagar | ${folha.length} folha | ${acordos.length} acordos`)

// ── 1) Limpa importacoes anteriores ────────────────────────────────────────
console.log('\n[1/6] Limpando dados anteriores (BULA-2026-*)...')
const { error: e1 } = await sb.from('erp_contas_receber').delete().like('numero_documento', 'BULA-2026-%')
if (e1) console.error('  erro cr:', e1.message)
const { error: e2 } = await sb.from('erp_contas_pagar').delete().like('numero_documento', 'BULA-2026-%')
if (e2) console.error('  erro cp:', e2.message)

// ── 2) Garante categorias ─────────────────────────────────────────────────
console.log('\n[2/6] Garantindo categorias...')
const catsDef = [
  { nome: 'Comissão Leilão', tipo: 'receita', cor: '#6B8F5C' },
  { nome: 'Imposto sobre Receita (17%)', tipo: 'despesa', cor: '#C0504D' },
  { nome: 'Despesa Operacional Leilão', tipo: 'despesa', cor: '#8B5A2B' },
  { nome: 'Comissão Funcionário', tipo: 'despesa', cor: '#A8423F' },
  { nome: 'Folha Pagamento', tipo: 'despesa', cor: '#C0504D' },
  { nome: 'Cartão de Crédito', tipo: 'despesa', cor: '#5C7AB7' },
]
const catMap = {}
for (const c of catsDef) {
  const { data: existing } = await sb.from('erp_categorias').select('id').eq('nome', c.nome).maybeSingle()
  if (existing) {
    catMap[c.nome] = existing.id
  } else {
    const { data, error } = await sb.from('erp_categorias').insert(c).select('id').single()
    if (error) console.error(`  erro ${c.nome}:`, error.message)
    else catMap[c.nome] = data.id
  }
}
console.log('  categorias:', Object.keys(catMap).length)

// ── 3) Garante pessoas (clientes = leiloeiras, fornecedores = beneficiários) ──
console.log('\n[3/6] Garantindo pessoas...')

async function upsertPessoa(nome, { is_cliente = false, is_fornecedor = false } = {}) {
  if (!nome) return null
  const nomeClean = String(nome).trim()
  const { data: existing } = await sb.from('erp_pessoas').select('id,is_cliente,is_fornecedor').eq('nome', nomeClean).maybeSingle()
  if (existing) {
    if ((is_cliente && !existing.is_cliente) || (is_fornecedor && !existing.is_fornecedor)) {
      await sb.from('erp_pessoas').update({
        is_cliente: existing.is_cliente || is_cliente,
        is_fornecedor: existing.is_fornecedor || is_fornecedor,
      }).eq('id', existing.id)
    }
    return existing.id
  }
  const { data, error } = await sb.from('erp_pessoas').insert({
    tipo: 'pj',
    nome: nomeClean,
    is_cliente, is_fornecedor,
  }).select('id').single()
  if (error) { console.error(`  erro pessoa ${nomeClean}:`, error.message); return null }
  return data.id
}

const leiloeirasSet = new Set(leiloes.map((r) => r[5]).filter((x) => x))
const leiloeiraIds = {}
for (const nome of leiloeirasSet) {
  leiloeiraIds[nome] = await upsertPessoa(nome, { is_cliente: true })
}
console.log('  leiloeiras (clientes):', Object.keys(leiloeiraIds).length)

const beneficiariosSet = new Set(apagar.map((r) => r[1]).filter((x) => x))
// também adiciona colaboradores da folha
for (const r of folha) if (r[1]) beneficiariosSet.add(String(r[1]).trim())
const beneficiarioIds = {}
for (const nome of beneficiariosSet) {
  beneficiarioIds[String(nome).trim()] = await upsertPessoa(nome, { is_fornecedor: true })
}
console.log('  fornecedores/colaboradores:', Object.keys(beneficiarioIds).length)

// ── 4) Importa contas a receber (leilões) ─────────────────────────────────
console.log('\n[4/6] Importando contas a receber (leilões)...')

const acordosMap = new Map()
for (const a of acordos) {
  const leilao = String(a[2] || '').trim()
  if (leilao) acordosMap.set(leilao, { problema: a[3], acao: a[4], responsavel: a[5] })
}

const crRows = []
const cpImpostoRows = []
const cpDespesaRows = []

for (const r of leiloes) {
  const num = r[1]
  const mesNome = r[2]
  const dia = r[3]
  const leilaoNome = String(r[4] || '').trim()
  const leiloeira = r[5]
  const contato = r[6] || ''
  const vendas = Number(r[8] || 0)
  const status = String(r[12] || '').trim()
  const receita = Number(r[13] || 0)
  const imposto = Math.abs(Number(r[15] || 0))
  // Despesa: planilha usa sinal misto. Positivo = saida real (conta a pagar);
  // negativo = credito/reembolso (Bula Remates) que NAO entra como CP.
  const despesaRaw = Number(r[16] || 0)
  const despesa = despesaRaw > 0 ? despesaRaw : 0
  const obs = r[18] || ''
  const mesNum = MESES[mesNome]
  if (!mesNum) { console.warn(`  ! mes invalido em #${num}: ${mesNome}`); continue }

  const emissao = isoDate(2026, mesNum, dia)
  const parsed = parseObservacao(obs)
  const acordo = acordosMap.get(leilaoNome)

  // ── Conta a Receber ─────────────────────────────────
  if (receita > 0 && status !== 'Sem vendas') {
    let statusCR = 'aberto'
    let dataRecebimento = null
    let valorRecebido = 0
    if (status === 'FATURADO' && parsed.dataPago && /PAGO/i.test(obs)) {
      statusCR = 'recebido'
      dataRecebimento = parsed.dataPago
      valorRecebido = receita
    } else if (status === 'VENCIDO') {
      statusCR = 'vencido'
    } else if (status === 'A RECEBER' || status === 'FATURADO' || status === 'BULA REMATES' || status === 'VALIDAR ACORDO') {
      statusCR = 'aberto'
    }

    const vencimento = parsed.dataPago || addDays(emissao, 45)
    let observacoes = `Vendas Bula: R$ ${vendas.toLocaleString('pt-BR')}`
    if (contato) observacoes += ` | Contato: ${contato}`
    if (acordo) observacoes += ` | ⚠ ACORDO PENDENTE: ${acordo.problema} → ${acordo.acao} (${acordo.responsavel})`
    if (obs) observacoes += ` | Obs original: ${obs}`

    crRows.push({
      descricao: `${leilaoNome}${leiloeira ? ' - ' + leiloeira : ''}`,
      cliente_id: leiloeira ? leiloeiraIds[leiloeira] : null,
      categoria_id: catMap['Comissão Leilão'],
      valor: receita,
      emissao,
      vencimento,
      status: statusCR,
      valor_recebido: valorRecebido,
      data_recebimento: dataRecebimento,
      numero_documento: `BULA-2026-CR-${String(num).padStart(3, '0')}${parsed.nf ? '-NF' + parsed.nf : ''}`,
      forma_recebimento: statusCR === 'recebido' ? 'transferencia' : '',
      observacoes,
      tags: ['leilao', '2026', mesNome.toLowerCase(), ...(acordo ? ['acordo-pendente'] : [])],
    })
  }

  // ── Imposto 17% como conta a pagar ──────────────────
  if (imposto > 0.01) {
    cpImpostoRows.push({
      descricao: `Imposto 17% - ${leilaoNome}`,
      categoria_id: catMap['Imposto sobre Receita (17%)'],
      valor: Number(imposto.toFixed(2)),
      emissao,
      vencimento: lastDayOfMonth(2026, mesNum === 12 ? 12 : mesNum + 1),
      status: 'aberto',
      numero_documento: `BULA-2026-CP-IMP-${String(num).padStart(3, '0')}`,
      observacoes: `Imposto referente a comissao do leilao ${leilaoNome} (${mesNome})`,
      tags: ['imposto', 'leilao', '2026'],
    })
  }

  // ── Despesa do leilao como conta a pagar ────────────
  if (despesa > 0.01) {
    cpDespesaRows.push({
      descricao: `Despesas - ${leilaoNome}`,
      categoria_id: catMap['Despesa Operacional Leilão'],
      valor: Number(despesa.toFixed(2)),
      emissao,
      vencimento: addDays(emissao, 30),
      status: 'aberto',
      numero_documento: `BULA-2026-CP-DESP-${String(num).padStart(3, '0')}`,
      observacoes: `Despesas operacionais do leilao ${leilaoNome}`,
      tags: ['despesa-leilao', '2026'],
    })
  }
}

// insere CR em lotes
async function insertBatch(table, rows, label) {
  if (!rows.length) { console.log(`  ${label}: 0`); return }
  const chunkSize = 50
  let ok = 0
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await sb.from(table).insert(chunk)
    if (error) console.error(`  erro lote ${i}: ${error.message}`)
    else ok += chunk.length
  }
  console.log(`  ${label}: ${ok}/${rows.length}`)
}

await insertBatch('erp_contas_receber', crRows, 'contas a receber (leiloes)')

// ── 5) Importa contas a pagar ─────────────────────────────────────────────
console.log('\n[5/6] Importando contas a pagar...')

// 5a) Aba A Pagar
const cpAPagarRows = []
function parseDataPagamento(txt) {
  if (!txt) return null
  if (typeof txt !== 'string') return null
  // "20 DE MAIO" -> 2026-05-20
  const m = txt.match(/(\d{1,2})\s*DE\s*([A-Za-zÇçÃãÁáÂâÊêÉéÍíÓóÔôÕõÚú]+)/i)
  if (m) {
    const dia = parseInt(m[1], 10)
    const mes = MESES[m[2].toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')]
                || MESES[m[2].toUpperCase()]
    if (mes) return isoDate(2026, mes, dia)
  }
  return null
}

for (const r of apagar) {
  const num = r[0]
  const beneficiario = String(r[1] || '').trim()
  const descricao = String(r[2] || '').trim() || `Pagamento ${beneficiario}`
  const valor = Number(r[3] || 0)
  const dataTxt = r[4]
  const status = String(r[5] || '').trim().toLowerCase()
  if (valor <= 0) continue
  const venc = parseDataPagamento(dataTxt) || '2026-05-31'
  const isCartao = /CART[ÃA]O/i.test(beneficiario)
  cpAPagarRows.push({
    descricao,
    fornecedor_id: beneficiarioIds[beneficiario] || null,
    categoria_id: isCartao ? catMap['Cartão de Crédito'] : catMap['Comissão Funcionário'],
    valor,
    emissao: '2026-05-01',
    vencimento: venc,
    status: 'aberto',
    numero_documento: `BULA-2026-CP-A${String(num).padStart(3, '0')}`,
    observacoes: status === 'a discutir' ? `⚠ A DISCUTIR: ${dataTxt || ''}` : (status === 'pendente' ? 'Pendente: a definir' : ''),
    tags: ['a-pagar', 'comissao', '2026'],
  })
}
await insertBatch('erp_contas_pagar', cpAPagarRows, 'contas a pagar (A Pagar)')

// 5b) Folha de Maio/2026 (somente quem tem salario fixo)
const cpFolhaRows = []
for (const r of folha) {
  const num = r[0]
  const colaborador = String(r[1] || '').trim()
  const fixo = Number(r[2] || 0)
  const funcao = String(r[4] || '').trim()
  if (fixo <= 0) continue
  cpFolhaRows.push({
    descricao: `Folha Maio/2026 - ${colaborador}`,
    fornecedor_id: beneficiarioIds[colaborador] || null,
    categoria_id: catMap['Folha Pagamento'],
    valor: fixo,
    emissao: '2026-05-01',
    vencimento: '2026-05-31',
    status: 'aberto',
    numero_documento: `BULA-2026-CP-FOLHA-${String(num).padStart(3, '0')}`,
    observacoes: `Funcao: ${funcao}`,
    tags: ['folha', '2026', 'maio'],
  })
}
await insertBatch('erp_contas_pagar', cpFolhaRows, 'contas a pagar (Folha)')

// 5c) Imposto + despesas dos leiloes
await insertBatch('erp_contas_pagar', cpImpostoRows, 'contas a pagar (Impostos)')
await insertBatch('erp_contas_pagar', cpDespesaRows, 'contas a pagar (Despesas leilao)')

// ── 6) Resumo final ───────────────────────────────────────────────────────
console.log('\n[6/6] Resumo final no banco:')
const [{ count: cCR }, { count: cCP }, { count: cP }] = await Promise.all([
  sb.from('erp_contas_receber').select('*', { count: 'exact', head: true }).like('numero_documento', 'BULA-2026-%'),
  sb.from('erp_contas_pagar').select('*', { count: 'exact', head: true }).like('numero_documento', 'BULA-2026-%'),
  sb.from('erp_pessoas').select('*', { count: 'exact', head: true }),
])
console.log(`  CR: ${cCR}`)
console.log(`  CP: ${cCP}`)
console.log(`  Pessoas total: ${cP}`)

// Totais para conferencia com Resumo da planilha
const { data: crData } = await sb.from('erp_contas_receber').select('valor,status,valor_recebido').like('numero_documento', 'BULA-2026-%')
const { data: cpData } = await sb.from('erp_contas_pagar').select('valor,status,categoria:erp_categorias!categoria_id(nome)').like('numero_documento', 'BULA-2026-%')

const totalReceita = crData.reduce((s, r) => s + Number(r.valor), 0)
const totalRecebido = crData.reduce((s, r) => s + Number(r.valor_recebido || 0), 0)
const totalAPagar = cpData.reduce((s, r) => s + Number(r.valor), 0)
const totalImposto = cpData.filter((r) => r.categoria?.nome === 'Imposto sobre Receita (17%)').reduce((s, r) => s + Number(r.valor), 0)
const totalDespLeilao = cpData.filter((r) => r.categoria?.nome === 'Despesa Operacional Leilão').reduce((s, r) => s + Number(r.valor), 0)
const totalComissao = cpData.filter((r) => r.categoria?.nome === 'Comissão Funcionário').reduce((s, r) => s + Number(r.valor), 0)
const totalFolha = cpData.filter((r) => r.categoria?.nome === 'Folha Pagamento').reduce((s, r) => s + Number(r.valor), 0)

console.log('\n=== TOTAIS IMPORTADOS vs PLANILHA ===')
console.log(`Receita bruta CR  : R$ ${totalReceita.toFixed(2)}   (planilha: 453.786,36)`)
console.log(`Total ja recebido : R$ ${totalRecebido.toFixed(2)}`)
console.log(`Impostos CP       : R$ ${totalImposto.toFixed(2)}   (planilha: 77.143,68)`)
console.log(`Despesas Leilao CP: R$ ${totalDespLeilao.toFixed(2)}   (planilha: 83.091,64)`)
console.log(`Comissao CP       : R$ ${totalComissao.toFixed(2)}   (planilha A Pagar: 119.471,00 - cartao)`)
console.log(`Folha CP          : R$ ${totalFolha.toFixed(2)}   (planilha: 28.800,00)`)
console.log(`Total CP geral    : R$ ${totalAPagar.toFixed(2)}`)

console.log('\nImportacao concluida ✓')
