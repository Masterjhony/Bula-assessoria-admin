// Registra vendas informadas por Marcelo em 31/05/2026 para o
// 2o Leilao LS Collection.
//
// Origem: WhatsApp Marcelo Primo Carneiro, apos envio do checklist:
// - Lt 11, parcela 720, 1F, comprador Nelore Tavares, Joao Pinheiro-MG;
// - Lote 36 + preferencia no lote 16, parcela 600, 2F,
//   comprador Francisco Alex, Fazenda Seu Luiz e Nelore Lima, Carmelopolis-CE.
//
// Uso: node scripts/add-fechamento-ls-collection-hoje.mjs

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
const NOME = '2o Leilao LS Collection - 31/05/2026'
const PARCELAS_PADRAO = 30

const lancesBase = [
  {
    uf: 'MG',
    lote: '11',
    parcela: 720,
    parcelas: PARCELAS_PADRAO,
    animais: 1,
    sexo: 'F',
    empresa: 'Bula Assessoria',
    assessor: 'Marcelo Carneiro / Leonardo Serafim',
    vendedor: 'LS Agropecuaria',
    comprador: 'Nelore Tavares',
    fazenda: 'Nelore Tavares',
    cidade: 'Joao Pinheiro',
    observacao:
      'Lt 11 - R$ 720,00 - 1F. Assessoria tecnica: Marcelo Carneiro e Leonardo Serafim. Mensagem WhatsApp 31/05/2026.',
  },
  {
    uf: 'CE',
    lote: '36 + preferencia 16',
    parcela: 600,
    parcelas: PARCELAS_PADRAO,
    animais: 2,
    sexo: 'F',
    empresa: 'Bula Assessoria',
    assessor: 'Fabio Omena',
    vendedor: 'LS Agropecuaria',
    comprador: 'Francisco Alex',
    fazenda: 'Fazenda Seu Luiz e Nelore Lima',
    cidade: 'Carmelopolis',
    observacao:
      'Lote 36 e preferencia no lote 16 - R$ 600,00 de parcela - 2F. Mensagem encaminhada por Marcelo em 31/05/2026.',
  },
]

const lances = lancesBase.map((lance) => ({
  ...lance,
  vgv: lance.parcela * lance.parcelas * lance.animais,
}))

const vgv_total = lances.reduce((sum, lance) => sum + lance.vgv, 0)
const animais_vendidos = lances.reduce((sum, lance) => sum + lance.animais, 0)
const lotes_vendidos = lances.reduce((sum, lance) => sum + (lance.lote.includes('+') ? 2 : 1), 0)
const maior_lance = Math.max(...lances.map((lance) => lance.parcela))
const ticket_medio = Math.round(vgv_total / animais_vendidos)

function groupByAssessor() {
  const map = new Map()
  for (const lance of lances) {
    const cur = map.get(lance.assessor) ?? {
      nome: lance.assessor,
      empresa: lance.empresa,
      transacoes: 0,
      animais: 0,
      vgv: 0,
    }
    cur.transacoes += lance.lote.includes('+') ? 2 : 1
    cur.animais += lance.animais
    cur.vgv += lance.vgv
    map.set(lance.assessor, cur)
  }
  return [...map.values()]
    .sort((a, b) => b.vgv - a.vgv)
    .map((assessor, index) => ({
      posicao: index + 1,
      nome: assessor.nome,
      empresa: assessor.empresa,
      transacoes: assessor.transacoes,
      animais: assessor.animais,
      vgv: assessor.vgv,
      ticket_medio: Math.round(assessor.vgv / assessor.animais),
      pct_total: Math.round((assessor.vgv / vgv_total) * 10000) / 10000,
    }))
}

function groupCompradores() {
  return lances
    .map((lance, index) => ({
      rank: index + 1,
      comprador: lance.comprador,
      fazenda: lance.fazenda,
      cidade: lance.cidade,
      uf: lance.uf,
      lotes: lance.lote.includes('+') ? 2 : 1,
      animais: lance.animais,
      vgv: lance.vgv,
    }))
    .sort((a, b) => b.vgv - a.vgv)
    .map((comprador, index) => ({ ...comprador, rank: index + 1 }))
}

function groupEstados() {
  const map = new Map()
  for (const lance of lances) {
    const cur = map.get(lance.uf) ?? { uf: lance.uf, lotes: 0, animais: 0, vgv: 0 }
    cur.lotes += lance.lote.includes('+') ? 2 : 1
    cur.animais += lance.animais
    cur.vgv += lance.vgv
    map.set(lance.uf, cur)
  }
  return [...map.values()].sort((a, b) => b.vgv - a.vgv)
}

const por_assessor = groupByAssessor()
const compradores = groupCompradores()
const por_estado = groupEstados()

const { data: acordo } = await supabase
  .from('bula_acordos_criadores')
  .select('id, pct_faturamento, pct_venda_cobertura, descricao')
  .ilike('contraparte', '%LS Collection%')
  .maybeSingle()

const observacoes = [
  'Vendas LS Collection hoje, conforme WhatsApp de Marcelo Primo Carneiro em 31/05/2026.',
  `Parcelamento assumido como ${PARCELAS_PADRAO} pagamentos por padrao operacional ate nova confirmacao.`,
  'Lt 11: Nelore Tavares, Joao Pinheiro-MG, assessoria Marcelo Carneiro e Leonardo Serafim.',
  'Lote 36 + preferencia lote 16: Francisco Alex, Fazenda Seu Luiz e Nelore Lima, Carmelopolis-CE, assessoria Fabio Omena.',
].join('\n')

const payload = {
  nome: NOME,
  data: DATA,
  local: 'Virtual',
  lotes_ofertados: 0,
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
  observacoes,
  acordo_criador_id: acordo?.id ?? null,
  acordo_pct_faturamento: acordo?.pct_faturamento ?? null,
  acordo_pct_venda_cobertura: acordo?.pct_venda_cobertura ?? null,
  acordo_descricao: acordo?.descricao ?? null,
}

const { data: existing, error: selErr } = await supabase
  .from('bula_leilao_fechamento')
  .select('id,nome')
  .eq('data', DATA)
  .ilike('nome', '%LS%Collection%')
  .maybeSingle()

if (selErr) {
  console.error('SELECT fechamento:', selErr.message)
  process.exit(1)
}

if (existing) {
  const { error } = await supabase
    .from('bula_leilao_fechamento')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
  if (error) {
    console.error('UPDATE fechamento:', error.message)
    process.exit(1)
  }
  console.log(`Fechamento LS Collection atualizado (id=${existing.id})`)
} else {
  const { data: inserted, error } = await supabase
    .from('bula_leilao_fechamento')
    .insert(payload)
    .select('id')
    .single()
  if (error) {
    console.error('INSERT fechamento:', error.message)
    process.exit(1)
  }
  console.log(`Fechamento LS Collection criado (id=${inserted.id})`)
}

await supabase
  .from('cronograma_leiloes')
  .update({ comissao: '1% do faturamento total + 4% da venda da cobertura' })
  .eq('data', DATA)
  .ilike('nome', '%LS%COLLECTION%')

console.log('\nResumo:')
console.log(`  VGV cobertura Bula : R$ ${vgv_total.toLocaleString('pt-BR')}`)
console.log(`  Lotes/animais      : ${lotes_vendidos}/${animais_vendidos}`)
console.log(`  Ticket medio       : R$ ${ticket_medio.toLocaleString('pt-BR')}`)
console.log(`  Maior parcela      : R$ ${maior_lance.toLocaleString('pt-BR')}`)
