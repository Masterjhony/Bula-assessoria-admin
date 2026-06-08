// Registra o fechamento do Leilao Matrizes Santa Nice 2026 (06/06/2026).
//
// Origem dos dados:
// - imagens de WhatsApp enviadas pelo usuario em 08/06/2026;
// - catalogo "Catalogo Leilao Matrizes Santa Nice 2026.pdf", que confirma
//   condicao de pagamento em 30 parcelas (2+2+2+2+2+20).
//
// Observacao: ha transcricao auxiliar local do leilao com divergencias em
// alguns lotes. Este lancamento usa as imagens como fonte principal.
//
// Uso: node scripts/add-fechamento-santa-nice-2026.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DATA = '2026-06-06'
const NOME = 'Leilao Matrizes Santa Nice 2026 - 06/06/2026'
const CR_DOCUMENTO = 'BULA-2026-CR-WPP-SANTA-NICE-20260606'
const PARCELAS = 30
const CONDICAO = '30 parcelas (2+2+2+2+2+20)'
const VENDEDOR = 'Criatorio Santa Nice'
const LEILOEIRA = 'PROGRAMA LEILOES'
const ACORDO_ID = '6a5f8f6f-29e7-4cea-9952-5c81614aa89e'
const ACORDO_PCT = 0.05
const ACORDO_DESCRICAO = '5% da venda da cobertura'

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function ensurePessoa(nome, flags = {}) {
  const { data: existing, error: selErr } = await supabase
    .from('erp_pessoas')
    .select('id,is_cliente,is_fornecedor')
    .eq('nome', nome)
    .maybeSingle()
  if (selErr) throw new Error(`SELECT pessoa ${nome}: ${selErr.message}`)

  if (existing) {
    const next = {
      is_cliente: existing.is_cliente || Boolean(flags.is_cliente),
      is_fornecedor: existing.is_fornecedor || Boolean(flags.is_fornecedor),
    }
    if (next.is_cliente !== existing.is_cliente || next.is_fornecedor !== existing.is_fornecedor) {
      const { error } = await supabase.from('erp_pessoas').update(next).eq('id', existing.id)
      if (error) throw new Error(`UPDATE pessoa ${nome}: ${error.message}`)
    }
    return existing.id
  }

  const { data, error } = await supabase
    .from('erp_pessoas')
    .insert({ tipo: 'pj', nome, is_cliente: Boolean(flags.is_cliente), is_fornecedor: Boolean(flags.is_fornecedor) })
    .select('id')
    .single()
  if (error) throw new Error(`INSERT pessoa ${nome}: ${error.message}`)
  return data.id
}

async function ensureCategoria(nome, tipo, cor) {
  const { data: existing, error: selErr } = await supabase
    .from('erp_categorias')
    .select('id')
    .eq('nome', nome)
    .maybeSingle()
  if (selErr) throw new Error(`SELECT categoria ${nome}: ${selErr.message}`)
  if (existing) return existing.id

  const { data, error } = await supabase
    .from('erp_categorias')
    .insert({ nome, tipo, cor })
    .select('id')
    .single()
  if (error) throw new Error(`INSERT categoria ${nome}: ${error.message}`)
  return data.id
}

const lancesBase = [
  {
    lote: '38',
    parcela: 1250,
    animais: 1,
    sexo: 'F',
    assessor: 'Douglas Bispo',
    comprador: 'Nelore Grao Para / Dr Celso Lopes',
    fazenda: 'Fazenda Flor de Minas',
    cidade: 'Ourilandia do Norte',
    uf: 'PA',
    observacaoExtra: 'Mensagem: Lt 38 - 1.250,00 - 1F.',
  },
  {
    lote: '15',
    parcela: 1800,
    animais: 1,
    sexo: 'F',
    assessor: 'Douglas Bispo',
    comprador: 'Nelore Grao Para / Dr Celso Lopes',
    fazenda: 'Fazenda Flor de Minas',
    cidade: 'Ourilandia do Norte',
    uf: 'PA',
    observacaoExtra: 'Mensagem: Lt 15 - 1.800,00 - 1F parida.',
  },
  {
    lote: '16',
    parcela: 1500,
    animais: 2,
    sexo: 'F',
    assessor: 'Marcelo Carneiro / Leonardo Serafim',
    comprador: 'Thales',
    fazenda: 'Fazenda Santa Barbara',
    cidade: 'Pimenta',
    uf: 'MG',
    observacaoExtra: 'Mensagem: LT 16 - 2F - 1.500. Cliente Thales, Pimenta-MG.',
  },
  {
    lote: '4',
    parcela: 1900,
    animais: 2,
    sexo: 'F',
    assessor: 'Marcelo Carneiro / Leonardo Serafim',
    comprador: 'Condominio Nelore Tavares / Agrirural Agropecuaria',
    fazenda: 'Nelore Tavares',
    cidade: 'Joao Pinheiro',
    uf: 'MG',
    observacaoExtra: 'Mensagem: LT 4 - 1.900 - 2F. Comprador Nelore Tavares / Agrirural Agropecuaria.',
  },
  {
    lote: '5',
    parcela: 1400,
    animais: 1,
    sexo: 'F',
    assessor: 'Douglas Bispo',
    comprador: 'Nelore Grao Para / Dr Celso Lopes',
    fazenda: 'Fazenda Flor de Minas',
    cidade: 'Ourilandia do Norte',
    uf: 'PA',
    observacaoExtra: 'Mensagem: Lt 5 - 1.400,00 - 1F parida.',
  },
  {
    lote: '47',
    parcela: 1150,
    animais: 1,
    sexo: 'F',
    assessor: 'Douglas Bispo',
    comprador: 'Pedro Pontes',
    fazenda: 'Nelore Sao Caetano',
    cidade: 'Tucuma',
    uf: 'PA',
    observacaoExtra: 'Mensagem: LT 47 - 1.150,00 - 1F parida.',
  },
  {
    lote: '49',
    parcela: 1250,
    animais: 2,
    sexo: 'F',
    assessor: 'Marcelo Carneiro / Leonardo Serafim',
    comprador: 'Nelore Tavares',
    fazenda: 'Nelore Tavares',
    cidade: 'Joao Pinheiro',
    uf: 'MG',
    observacaoExtra: 'Mensagem: LT 49 - 1.250,00 - 2F.',
  },
  {
    lote: '48',
    parcela: 1300,
    animais: 1,
    sexo: 'F',
    assessor: 'Fabio Omena',
    comprador: 'Almeida Agropecuaria',
    fazenda: 'Almeida Agropecuaria',
    cidade: 'Chorozinho',
    uf: 'CE',
    observacaoExtra: 'Mensagem: Lt 48 - 1300 - 1F.',
  },
  {
    lote: '46',
    parcela: 1450,
    animais: 1,
    sexo: 'F',
    assessor: 'Fabio Omena',
    comprador: 'Almeida Agropecuaria',
    fazenda: 'Almeida Agropecuaria',
    cidade: 'Chorozinho',
    uf: 'CE',
    observacaoExtra: 'Mensagem: lt 46 - 1450 - 1F.',
  },
]

const comissaoPctPorAssessor = new Map([
  ['Douglas Bispo', 0.02],
  ['Fabio Omena', 0.03],
  ['Marcelo Carneiro / Leonardo Serafim', 0.02],
])

const lances = lancesBase.map((lance) => {
  const vgv = lance.parcela * PARCELAS * lance.animais
  return {
    ...lance,
    parcelas: PARCELAS,
    empresa: 'Bula Assessoria',
    vendedor: VENDEDOR,
    vgv,
    observacao: [
      `${lance.observacaoExtra} Condicao do catalogo: ${CONDICAO}.`,
      `VGV: ${brl(lance.parcela)} x ${PARCELAS} x ${lance.animais} = ${brl(vgv)}.`,
    ].join(' '),
  }
})

const vgv_total = lances.reduce((sum, lance) => sum + lance.vgv, 0)
const receita_bula = Math.round(vgv_total * ACORDO_PCT * 100) / 100
const animais_vendidos = lances.reduce((sum, lance) => sum + lance.animais, 0)
const lotes_vendidos = lances.length
const maior_lance = Math.max(...lances.map((lance) => lance.parcela))
const ticket_medio = Math.round(vgv_total / animais_vendidos)

const byAssessor = new Map()
for (const lance of lances) {
  const cur = byAssessor.get(lance.assessor) ?? {
    nome: lance.assessor,
    empresa: lance.empresa,
    transacoes: 0,
    animais: 0,
    vgv: 0,
  }
  cur.transacoes += 1
  cur.animais += lance.animais
  cur.vgv += lance.vgv
  byAssessor.set(lance.assessor, cur)
}

const por_assessor = [...byAssessor.values()]
  .sort((a, b) => b.vgv - a.vgv)
  .map((assessor, index) => {
    const pct = comissaoPctPorAssessor.get(assessor.nome) ?? 0
    const comissao = Math.round(assessor.vgv * pct * 100) / 100
    return {
      posicao: index + 1,
      nome: assessor.nome,
      empresa: assessor.empresa,
      transacoes: assessor.transacoes,
      animais: assessor.animais,
      vgv: assessor.vgv,
      ticket_medio: Math.round(assessor.vgv / assessor.animais),
      pct_total: Math.round((assessor.vgv / vgv_total) * 10000) / 10000,
      comissao,
      observacao: assessor.nome.includes('/')
        ? 'Comissao agregada estimada em 2% para a dupla; revisar rateio interno Marcelo/Leonardo antes de pagar.'
        : `Comissao padrao aplicada: ${(pct * 100).toLocaleString('pt-BR')}% sobre o VGV.`,
    }
  })

const comissao_assessoria = Math.round(por_assessor.reduce((sum, a) => sum + a.comissao, 0) * 100) / 100
const sobra_bruta = Math.round((receita_bula - comissao_assessoria) * 100) / 100

const byComprador = new Map()
for (const lance of lances) {
  const key = `${lance.comprador}|${lance.fazenda}|${lance.cidade}|${lance.uf}`
  const cur = byComprador.get(key) ?? {
    comprador: lance.comprador,
    fazenda: lance.fazenda,
    cidade: lance.cidade,
    uf: lance.uf,
    lotes: 0,
    animais: 0,
    vgv: 0,
  }
  cur.lotes += 1
  cur.animais += lance.animais
  cur.vgv += lance.vgv
  byComprador.set(key, cur)
}

const compradores = [...byComprador.values()]
  .sort((a, b) => b.vgv - a.vgv)
  .map((comprador, index) => ({ rank: index + 1, ...comprador }))

const byUf = new Map()
for (const lance of lances) {
  const cur = byUf.get(lance.uf) ?? { uf: lance.uf, lotes: 0, animais: 0, vgv: 0 }
  cur.lotes += 1
  cur.animais += lance.animais
  cur.vgv += lance.vgv
  byUf.set(lance.uf, cur)
}

const nomesUf = new Map([
  ['MG', 'Minas Gerais'],
  ['PA', 'Para'],
  ['CE', 'Ceara'],
])

const por_estado = [...byUf.values()]
  .sort((a, b) => b.vgv - a.vgv)
  .map((uf) => ({
    ...uf,
    estado: nomesUf.get(uf.uf) ?? uf.uf,
    pct_total: Math.round((uf.vgv / vgv_total) * 10000) / 10000,
    ticket_medio: Math.round(uf.vgv / uf.animais),
  }))

const observacoes = [
  'Fechamento registrado a partir das imagens de WhatsApp encaminhadas pelo usuario em 08/06/2026.',
  `Catalogo conferido: 06/06/2026, 12h, condicao ${CONDICAO}; agenda do sistema registra 110 femeas.`,
  `Cobertura Bula: ${lotes_vendidos} lotes / ${animais_vendidos} femeas / ${brl(vgv_total)}.`,
  `Acordo cadastrado: ${ACORDO_DESCRICAO}; receita Bula provisionada: ${brl(receita_bula)}.`,
  `Comissao de assessoria calculada por regra padrao: ${brl(comissao_assessoria)}; sobra bruta: ${brl(sobra_bruta)}.`,
  'Marcelo Carneiro / Leonardo Serafim aparece como dupla nas mensagens; comissao agregada estimada em 2% e deve ter rateio interno revisado antes do pagamento.',
  'Transcricao auxiliar local do leilao apresentou divergencias em alguns lotes; para este fechamento prevaleceram as imagens encaminhadas.',
].join('\n')

const fechamentoPayload = {
  nome: NOME,
  data: DATA,
  local: 'Virtual',
  lotes_ofertados: 92,
  lotes_vendidos,
  animais_vendidos,
  vgv_total,
  ticket_medio,
  maior_lance,
  compradores_unicos: compradores.length,
  estados_alcancados: por_estado.length,
  por_assessor,
  por_estado,
  compradores,
  lances,
  perfil_genetico: [],
  faturamento_total_leilao: null,
  acordo_pct_faturamento: null,
  acordo_pct_venda_cobertura: ACORDO_PCT,
  acordo_descricao: ACORDO_DESCRICAO,
  acordo_criador_id: ACORDO_ID,
  receita_bula,
  comissao_assessoria,
  sobra_bruta,
  observacoes,
}

const { data: existingFechamento, error: selFechErr } = await supabase
  .from('bula_leilao_fechamento')
  .select('id,nome')
  .eq('data', DATA)
  .or('nome.ilike.%Santa%Nice%,nome.ilike.%Santanice%')
  .maybeSingle()
if (selFechErr) throw new Error(`SELECT fechamento: ${selFechErr.message}`)

let fechamentoId
if (existingFechamento) {
  const { error } = await supabase
    .from('bula_leilao_fechamento')
    .update({ ...fechamentoPayload, updated_at: new Date().toISOString() })
    .eq('id', existingFechamento.id)
  if (error) throw new Error(`UPDATE fechamento: ${error.message}`)
  fechamentoId = existingFechamento.id
  console.log(`Fechamento Santa Nice atualizado (id=${fechamentoId})`)
} else {
  const { data, error } = await supabase
    .from('bula_leilao_fechamento')
    .insert(fechamentoPayload)
    .select('id')
    .single()
  if (error) throw new Error(`INSERT fechamento: ${error.message}`)
  fechamentoId = data.id
  console.log(`Fechamento Santa Nice criado (id=${fechamentoId})`)
}

await supabase
  .from('cronograma_leiloes')
  .update({
    venda_bula: brl(vgv_total),
    comissao_receber: brl(receita_bula),
    comissao: '5% da venda',
    contrato: CONDICAO,
  })
  .eq('data', DATA)
  .or('nome.ilike.%Santa%Nice%,criador.ilike.%Santa%Nice%,nome.ilike.%Santanice%,criador.ilike.%Santanice%')

await supabase
  .from('bula_leiloes')
  .update({
    realizado_bula: vgv_total,
    acordo_comissao: '5% da venda',
    condicao: CONDICAO,
    status: 'concluido',
  })
  .eq('data', DATA)
  .or('nome.ilike.%Santa%Nice%,nome.ilike.%Santanice%')

const clienteId = await ensurePessoa(LEILOEIRA, { is_cliente: true })
const categoriaId = await ensureCategoria('Comissao Leilao', 'receita', '#6B8F5C')

const crPayload = {
  descricao: 'LEILAO MATRIZES SANTA NICE 2026 - COBERTURA BULA',
  cliente_id: clienteId,
  categoria_id: categoriaId,
  valor: receita_bula,
  valor_recebido: 0,
  emissao: DATA,
  vencimento: addDays(DATA, 45),
  status: 'aberto',
  numero_documento: CR_DOCUMENTO,
  parcela: 1,
  total_parcelas: 1,
  recorrencia: 'nenhuma',
  observacoes: [
    `Provisao de fluxo de caixa gerada a partir do fechamento ${fechamentoId}.`,
    `VGV Bula: ${brl(vgv_total)} | Receita: 5% = ${brl(receita_bula)}.`,
    'Origem: imagens WhatsApp encaminhadas em 08/06/2026 e catalogo Santa Nice 2026.',
    'Vencimento tecnico D+45 ate confirmacao financeira definitiva.',
  ].join(' '),
  tags: ['leilao', '2026', 'junho', 'santa-nice', 'whatsapp', 'provisao'],
  anexos: [],
}

const { data: existingCr, error: selCrErr } = await supabase
  .from('erp_contas_receber')
  .select('id')
  .eq('numero_documento', CR_DOCUMENTO)
  .maybeSingle()
if (selCrErr) throw new Error(`SELECT conta a receber: ${selCrErr.message}`)

if (existingCr) {
  const { error } = await supabase
    .from('erp_contas_receber')
    .update({ ...crPayload, updated_at: new Date().toISOString() })
    .eq('id', existingCr.id)
  if (error) throw new Error(`UPDATE conta a receber: ${error.message}`)
  console.log(`Conta a receber atualizada (id=${existingCr.id})`)
} else {
  const { data, error } = await supabase
    .from('erp_contas_receber')
    .insert(crPayload)
    .select('id')
    .single()
  if (error) throw new Error(`INSERT conta a receber: ${error.message}`)
  console.log(`Conta a receber criada (id=${data.id})`)
}

console.log('\nResumo:')
console.log(`  Leilao             : ${NOME}`)
console.log(`  Cobertura          : ${lotes_vendidos} lotes / ${animais_vendidos} femeas`)
console.log(`  Condicao           : ${CONDICAO}`)
console.log(`  VGV Bula           : ${brl(vgv_total)}`)
console.log(`  Receita Bula       : ${brl(receita_bula)}`)
console.log(`  Comissao assessoria: ${brl(comissao_assessoria)}`)
console.log(`  Sobra bruta        : ${brl(sobra_bruta)}`)
console.log(`  Conta a receber    : ${CR_DOCUMENTO}`)
