// Registra o fechamento do 41o Touros Camparino (06/06/2026).
//
// Origem dos dados:
// - imagens de WhatsApp enviadas pelo usuario em 08/06/2026.
//
// O catalogo mencionado no pedido nao corresponde a este leilao (era Expozebu,
// femeas, 30/04/2026). Para este fechamento, o catalogo correto permanece como
// pendencia. A quantidade de parcelas foi assumida como 30x pelo padrao
// Camparino registrado no sistema e porque os prints indicam "parcela".
//
// Uso: node scripts/add-fechamento-touros-camparino-2026.mjs

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
const NOME = '41o Touros Camparino - 06/06/2026'
const CR_DOCUMENTO = 'BULA-2026-CR-WPP-CAMPARINO-TOUROS-20260606'
const PARCELAS = 30
const CONDICAO = '30 parcelas (assumido pelo padrao Camparino; confirmar no catalogo correto)'
const VENDEDOR = 'Fazenda Camparino'
const LEILOEIRA = 'PROGRAMA LEILOES'
const ACORDO_PCT_MINIMO = 0.005
const ACORDO_DESCRICAO =
  'Tabela Camparino sobre faturamento/participacao: abaixo de 10% = 0,5%; 10% a 15% = 0,75%; 15% a 20% = 1%; acima de 20% = 1,5%. Provisionado em 0,5% ate confirmacao do faturamento total.'

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
    lote: '58',
    parcela: 1550,
    animais: 1,
    sexo: 'M',
    assessor: 'Fabio Omena',
    empresa: 'Bula Assessoria',
    comprador: 'Fazenda LP / Sr Jonas Conselvam',
    fazenda: 'Fazenda LP',
    cidade: 'Nao informado',
    uf: 'MT',
    observacaoExtra: 'Mensagem: Lt 58 - 1.550,00 - 1M. Mato Grosso.',
  },
  {
    lote: '68',
    parcela: 1500,
    animais: 1,
    sexo: 'M',
    assessor: 'Fabio Omena',
    empresa: 'Bula Assessoria',
    comprador: 'Fazenda LP / Sr Jonas Conselvam',
    fazenda: 'Fazenda LP',
    cidade: 'Nao informado',
    uf: 'MT',
    observacaoExtra: 'Mensagem: lt 68 - 1.500,00 - 1M. Mato Grosso.',
  },
  {
    lote: '32',
    parcela: 1750,
    animais: 1,
    sexo: 'M',
    assessor: 'Nao informado',
    empresa: 'Outro',
    comprador: 'Fazenda Boa Esperanca / Valter Diniz',
    fazenda: 'Fazenda Boa Esperanca',
    cidade: 'Novo Repartimento',
    uf: 'PA',
    observacaoExtra: 'Mensagem: 32 - 1.750 - 1M. Assessor nao aparece no print.',
  },
  {
    lote: '40',
    parcela: 1700,
    animais: 1,
    sexo: 'M',
    assessor: 'Peralta',
    empresa: 'Outro',
    comprador: 'Guilherme Staut / Fazenda Campo Grande',
    fazenda: 'Fazenda Campo Grande',
    cidade: 'Pontes e Lacerda',
    uf: 'MT',
    observacaoExtra: 'Mensagem: Lote 40 1M com Peralta; Marcelo confirmou R$ 1.700 de parcela.',
  },
  {
    lote: '28',
    parcela: 1700,
    animais: 1,
    sexo: 'M',
    assessor: 'Peralta',
    empresa: 'Outro',
    comprador: 'Guilherme Staut / Fazenda Campo Grande',
    fazenda: 'Fazenda Campo Grande',
    cidade: 'Pontes e Lacerda',
    uf: 'MT',
    observacaoExtra: 'Mensagem: lote 28, 1M, R$ 1.700, assessoria do Peralta.',
  },
  {
    lote: '14',
    parcela: 1850,
    animais: 1,
    sexo: 'M',
    assessor: 'Fabio Omena',
    empresa: 'Bula Assessoria',
    comprador: 'Sr Gilson Carlos',
    fazenda: 'Fazenda Nossa Senhora Aparecida',
    cidade: 'Santa Terezinha',
    uf: 'MT',
    observacaoExtra: 'Mensagem: Lt 14 - 1.850,00 - 1M.',
  },
  {
    lote: '60',
    parcela: 1700,
    animais: 1,
    sexo: 'M',
    assessor: 'Peralta',
    empresa: 'Outro',
    comprador: 'Guilherme Staut / Fazenda Campo Grande',
    fazenda: 'Fazenda Campo Grande',
    cidade: 'Pontes e Lacerda',
    uf: 'MT',
    observacaoExtra: 'Mensagem: lote 60, 1M, R$ 1.700, Guilherme Staut, assessoria Peralta.',
  },
  {
    lote: '82',
    parcela: 1400,
    animais: 1,
    sexo: 'M',
    assessor: 'Leonardo Serafim',
    empresa: 'Bula Assessoria',
    comprador: 'PHB Agropecuaria',
    fazenda: 'PHB Agropecuaria',
    cidade: 'Nova Canaa do Norte',
    uf: 'MT',
    observacaoExtra: 'Mensagem: lote 82, 1M, R$ 1.400, com o Leo da Bula Assessoria.',
  },
]

const comissaoPctPorAssessor = new Map([
  ['Fabio Omena', 0.03],
  ['Leonardo Serafim', 0.02],
])

const lances = lancesBase.map((lance) => {
  const vgv = lance.parcela * PARCELAS * lance.animais
  return {
    ...lance,
    parcelas: PARCELAS,
    vendedor: VENDEDOR,
    vgv,
    observacao: [
      `${lance.observacaoExtra} Condicao usada no lancamento: ${CONDICAO}.`,
      `VGV: ${brl(lance.parcela)} x ${PARCELAS} x ${lance.animais} = ${brl(vgv)}.`,
    ].join(' '),
  }
})

const vgv_total = lances.reduce((sum, lance) => sum + lance.vgv, 0)
const receita_bula = Math.round(vgv_total * ACORDO_PCT_MINIMO * 100) / 100
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
      observacao: pct > 0
        ? `Comissao padrao aplicada: ${(pct * 100).toLocaleString('pt-BR')}% sobre o VGV.`
        : 'Sem regra de comissao padrao cadastrada; revisar antes de gerar conta a pagar.',
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
  ['MT', 'Mato Grosso'],
  ['PA', 'Para'],
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
  'O catalogo enviado no pedido era do Camparino Expozebu de 30/04/2026 e nao corresponde a este leilao de touros; catalogo correto permanece pendente.',
  `Condicao usada para calculo: ${CONDICAO}.`,
  `Cobertura Bula: ${lotes_vendidos} lotes / ${animais_vendidos} machos / ${brl(vgv_total)}.`,
  `Acordo do sistema: tabela Camparino. Receita provisionada na faixa minima de 0,5%: ${brl(receita_bula)}.`,
  'Faturamento total da leiloeira ainda nao informado; revisar faixa do acordo quando esse dado chegar.',
  `Comissao de assessoria apurada apenas para assessores Bula com regra conhecida: ${brl(comissao_assessoria)}. Peralta e lote 32 sem regra/assessor confirmado.`,
  `Sobra bruta provisoria: ${brl(sobra_bruta)}. Pode mudar com faturamento total/faixa do acordo e validacao de comissoes.`,
].join('\n')

const fechamentoPayload = {
  nome: NOME,
  data: DATA,
  local: 'Virtual',
  lotes_ofertados: 90,
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
  acordo_pct_venda_cobertura: ACORDO_PCT_MINIMO,
  acordo_descricao: ACORDO_DESCRICAO,
  receita_bula,
  comissao_assessoria,
  sobra_bruta,
  observacoes,
}

const { data: existingFechamento, error: selFechErr } = await supabase
  .from('bula_leilao_fechamento')
  .select('id,nome')
  .eq('data', DATA)
  .or('nome.ilike.%Touros%Camparino%,nome.ilike.%41%Camparino%,nome.ilike.%41o%Touros%')
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
  console.log(`Fechamento Touros Camparino atualizado (id=${fechamentoId})`)
} else {
  const { data, error } = await supabase
    .from('bula_leilao_fechamento')
    .insert(fechamentoPayload)
    .select('id')
    .single()
  if (error) throw new Error(`INSERT fechamento: ${error.message}`)
  fechamentoId = data.id
  console.log(`Fechamento Touros Camparino criado (id=${fechamentoId})`)
}

await supabase
  .from('cronograma_leiloes')
  .update({
    venda_bula: brl(vgv_total),
    comissao_receber: brl(receita_bula),
    contrato: CONDICAO,
  })
  .eq('data', DATA)
  .or('nome.ilike.%TOUROS%CAMPARINO%,criador.ilike.%CAMPARINO%')

await supabase
  .from('bula_leiloes')
  .update({
    realizado_bula: vgv_total,
    condicao: CONDICAO,
    status: 'concluido',
  })
  .eq('data', DATA)
  .ilike('nome', '%TOUROS%CAMPARINO%')

const clienteId = await ensurePessoa(LEILOEIRA, { is_cliente: true })
const categoriaId = await ensureCategoria('Comissao Leilao', 'receita', '#6B8F5C')

const crPayload = {
  descricao: '41o TOUROS CAMPARINO - COBERTURA BULA',
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
    `VGV Bula: ${brl(vgv_total)} | Receita provisoria: 0,5% = ${brl(receita_bula)}.`,
    'Origem: imagens WhatsApp encaminhadas em 08/06/2026.',
    'Pendente: faturamento total da leiloeira para validar faixa da tabela Camparino.',
    'Vencimento tecnico D+45 ate confirmacao financeira definitiva.',
  ].join(' '),
  tags: ['leilao', '2026', 'junho', 'camparino', 'touros', 'whatsapp', 'provisao'],
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
console.log(`  Cobertura          : ${lotes_vendidos} lotes / ${animais_vendidos} machos`)
console.log(`  Condicao           : ${CONDICAO}`)
console.log(`  VGV Bula           : ${brl(vgv_total)}`)
console.log(`  Receita Bula       : ${brl(receita_bula)} (provisoria, faixa 0,5%)`)
console.log(`  Comissao assessoria: ${brl(comissao_assessoria)}`)
console.log(`  Sobra bruta        : ${brl(sobra_bruta)}`)
console.log(`  Conta a receber    : ${CR_DOCUMENTO}`)
