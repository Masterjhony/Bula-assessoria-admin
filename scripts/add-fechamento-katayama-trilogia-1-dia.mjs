// Registra o fechamento informado por Marcelo Primo Carneiro no WhatsApp
// para o 1o dia do Leilao Katayama Trilogia (31/05/2026).
//
// Contexto conferido na conversa:
// - "Levamos LT 84 - 4F - 380,00 40x"
// - "Foi com Marcelo Carneiro da Bula Assessoria"
// - "Assessoria tecnica do Leonardo Serafim"
// - "Vai para Nelore Tavares, Em Joao Pinheiro MG"
// - Marcelo esclareceu: "Opa, venda do Leilao Katayama hoje"
//
// Uso: node scripts/add-fechamento-katayama-trilogia-1-dia.mjs

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

const DATA = '2026-05-31'
const NOME = '1o Dia - Leilao Katayama Trilogia - 31/05/2026'
const CR_DOCUMENTO = 'BULA-2026-CR-WPP-KATAYAMA-20260531-LT84'
const PARCELA = 380
const PARCELAS = 40
const ANIMAIS = 4
const VGV_TOTAL = PARCELA * PARCELAS * ANIMAIS
const RECEITA_BULA = Math.round(VGV_TOTAL * 0.05 * 100) / 100

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

const lance = {
  uf: 'MG',
  lote: '84',
  parcela: PARCELA,
  parcelas: PARCELAS,
  animais: ANIMAIS,
  sexo: 'F',
  empresa: 'Bula Assessoria',
  assessor: 'Marcelo Carneiro / Leonardo Serafim',
  vendedor: 'Nelore Katayama',
  comprador: 'Nelore Tavares',
  fazenda: 'Nelore Tavares',
  cidade: 'Joao Pinheiro',
  observacao:
    'LT 84 - 4F - R$ 380,00 em 40 parcelas. Comprador Nelore Tavares, Joao Pinheiro-MG. Assessoria Marcelo Carneiro e Leonardo Serafim. WhatsApp Marcelo Primo Carneiro em 31/05/2026.',
  vgv: VGV_TOTAL,
}

const por_assessor = [{
  posicao: 1,
  nome: lance.assessor,
  empresa: lance.empresa,
  transacoes: 1,
  animais: ANIMAIS,
  vgv: VGV_TOTAL,
  ticket_medio: Math.round(VGV_TOTAL / ANIMAIS),
  pct_total: 1,
}]

const por_estado = [{
  uf: 'MG',
  estado: 'Minas Gerais',
  lotes: 1,
  animais: ANIMAIS,
  vgv: VGV_TOTAL,
  pct_total: 1,
  ticket_medio: Math.round(VGV_TOTAL / ANIMAIS),
}]

const compradores = [{
  rank: 1,
  comprador: lance.comprador,
  fazenda: lance.fazenda,
  cidade: lance.cidade,
  uf: lance.uf,
  lotes: 1,
  animais: ANIMAIS,
  vgv: VGV_TOTAL,
}]

const observacoes = [
  'Fechamento registrado a partir da mensagem do WhatsApp de Marcelo Primo Carneiro.',
  'Marcelo esclareceu que a venda pertence ao Leilao Katayama do dia.',
  'LT 84: 4 femeas, R$ 380,00 em 40 parcelas, comprador Nelore Tavares, Joao Pinheiro-MG.',
  'Assessoria comercial/tecnica: Marcelo Carneiro da Bula Assessoria e Leonardo Serafim.',
  'Acordo operacional no cronograma: 5% da venda.',
  `Receita Bula provisionada para fluxo de caixa: R$ ${RECEITA_BULA.toLocaleString('pt-BR')}.`,
].join('\n')

const fechamentoPayload = {
  nome: NOME,
  data: DATA,
  local: 'Virtual',
  lotes_ofertados: 0,
  lotes_vendidos: 1,
  animais_vendidos: ANIMAIS,
  vgv_total: VGV_TOTAL,
  ticket_medio: Math.round(VGV_TOTAL / ANIMAIS),
  maior_lance: PARCELA,
  compradores_unicos: 1,
  estados_alcancados: 1,
  por_assessor,
  por_estado,
  compradores,
  lances: [lance],
  perfil_genetico: [],
  faturamento_total_leilao: null,
  acordo_pct_faturamento: null,
  acordo_pct_venda_cobertura: 0.05,
  acordo_descricao: '5% da venda da cobertura',
  receita_bula: RECEITA_BULA,
  comissao_assessoria: null,
  sobra_bruta: null,
  observacoes,
}

const { data: existingFechamento, error: selFechErr } = await supabase
  .from('bula_leilao_fechamento')
  .select('id,nome')
  .eq('data', DATA)
  .ilike('nome', '%Katayama%Trilogia%')
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
  console.log(`Fechamento Katayama atualizado (id=${fechamentoId})`)
} else {
  const { data, error } = await supabase
    .from('bula_leilao_fechamento')
    .insert(fechamentoPayload)
    .select('id')
    .single()
  if (error) throw new Error(`INSERT fechamento: ${error.message}`)
  fechamentoId = data.id
  console.log(`Fechamento Katayama criado (id=${fechamentoId})`)
}

await supabase
  .from('cronograma_leiloes')
  .update({
    venda_bula: `R$ ${VGV_TOTAL.toLocaleString('pt-BR')}`,
    comissao_receber: `R$ ${RECEITA_BULA.toLocaleString('pt-BR')}`,
    comissao: '5% da venda',
  })
  .eq('data', DATA)
  .ilike('nome', '%KATAYAMA%TRILOGIA%')

await supabase
  .from('bula_leiloes')
  .update({ realizado_bula: VGV_TOTAL, acordo_comissao: '5% da venda', status: 'concluido' })
  .eq('data', DATA)
  .ilike('nome', '%KATAYAMA%TRILOGIA%')

const clienteId = await ensurePessoa('PROGRAMA LEILOES', { is_cliente: true })
const categoriaId = await ensureCategoria('Comissao Leilao', 'receita', '#6B8F5C')

const crPayload = {
  descricao: '1o DIA - LEILAO KATAYAMA TRILOGIA - LT 84',
  cliente_id: clienteId,
  categoria_id: categoriaId,
  valor: RECEITA_BULA,
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
    `VGV Bula: R$ ${VGV_TOTAL.toLocaleString('pt-BR')} | Receita: 5% = R$ ${RECEITA_BULA.toLocaleString('pt-BR')}.`,
    'Origem: WhatsApp Marcelo Primo Carneiro, 31/05/2026, LT 84.',
    'Vencimento tecnico D+45 ate confirmacao financeira definitiva.',
  ].join(' '),
  tags: ['leilao', '2026', 'maio', 'katayama', 'whatsapp', 'provisao'],
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
console.log(`  Lote/animais       : LT 84 / ${ANIMAIS}F`)
console.log(`  Venda              : R$ ${PARCELA.toLocaleString('pt-BR')} x ${PARCELAS} x ${ANIMAIS} = R$ ${VGV_TOTAL.toLocaleString('pt-BR')}`)
console.log(`  Receita Bula       : R$ ${RECEITA_BULA.toLocaleString('pt-BR')}`)
console.log(`  Conta a receber    : ${CR_DOCUMENTO}`)
