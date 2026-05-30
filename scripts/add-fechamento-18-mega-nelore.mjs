// Cria/atualiza o fechamento separado do 18o Mega Leilao Nelore Para.
//
// Origem: conversa de 30/05/2026 com Marcelo Primo Carneiro no WhatsApp:
// - "Esse foi o 18 Mega Leilao Nelore Para"
// - "Leilao do Para e 30 parcelas"
// - Lt 30, Lt 31, Lt 32 e Lt 33 encaminhados como vendas da cobertura.
// - Marcelo corrigiu o Lt 31: "Coloca para o Fabio".
//
// Uso: node scripts/add-fechamento-18-mega-nelore.mjs

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
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

const DATA = '2026-05-30'
const NOME = '18o Mega Leilao Nelore Para - 30/05/2026'
const VENDEDOR = 'Nelore FPA - Fazenda Paraiso do Acara'

const lancesBase = [
  { lote: '30', parcela: 9000, assessor: 'Fabio Omena' },
  { lote: '31', parcela: 1600, assessor: 'Fabio Omena', observacaoExtra: 'Mensagem original citava Douglas Bispo; Marcelo corrigiu para Fabio.' },
  { lote: '32', parcela: 1450, assessor: 'Fabio Omena' },
  { lote: '33', parcela: 1250, assessor: 'Fabio Omena' },
]

const lances = lancesBase.map((lance) => ({
  uf: 'PA',
  lote: lance.lote,
  parcela: lance.parcela,
  parcelas: 30,
  animais: 1,
  sexo: 'F',
  empresa: 'Bula Assessoria',
  assessor: lance.assessor,
  vendedor: VENDEDOR,
  comprador: 'Nao informado',
  fazenda: 'Fazenda Paraiso do Acara',
  cidade: 'Acara',
  observacao: [
    `Lt ${lance.lote} - R$ ${lance.parcela.toLocaleString('pt-BR')} - 1F em 30 parcelas, conforme WhatsApp.`,
    lance.observacaoExtra ?? '',
    'Comprador nao informado na conversa conferida.',
  ].filter(Boolean).join(' '),
  vgv: lance.parcela * 30,
}))

const vgv_total = lances.reduce((sum, lance) => sum + lance.vgv, 0)
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

const compradores = []
const por_estado = [{
  uf: 'PA',
  estado: 'Para',
  lotes: lotes_vendidos,
  animais: animais_vendidos,
  vgv: vgv_total,
  pct_total: 1,
  ticket_medio,
}]

const observacoes = [
  'Fechamento separado do LS Now conforme conferencia do WhatsApp em 30/05/2026.',
  'Marcelo confirmou que estes lotes pertencem ao 18o Mega Leilao Nelore Para.',
  'Condicao confirmada: Leilao do Para e 30 parcelas.',
  'Lotes de cobertura: 30, 31, 32 e 33. Todos 1F.',
  'Lote 31 atribuido a Fabio Omena por correcao expressa do Marcelo, apesar da mensagem encaminhada citar Douglas Bispo.',
  'Compradores nao constavam no trecho conferido da conversa; por isso nao foram inventados no ranking de compradores.',
  `Nossa cobertura no Para: ${lotes_vendidos} lotes / ${animais_vendidos} animais / R$ ${vgv_total.toLocaleString('pt-BR')}.`,
].join('\n')

const payload = {
  nome: NOME,
  data: DATA,
  local: 'Redencao/PA',
  lotes_ofertados: 60,
  lotes_vendidos,
  animais_vendidos,
  vgv_total,
  ticket_medio,
  maior_lance,
  compradores_unicos: 0,
  estados_alcancados: por_estado.length,
  por_assessor,
  por_estado,
  compradores,
  lances,
  perfil_genetico: [],
  faturamento_total_leilao: null,
  observacoes,
}

const { data: existing, error: selErr } = await supabase
  .from('bula_leilao_fechamento')
  .select('id,nome')
  .eq('data', DATA)
  .ilike('nome', '%Mega%Nelore%Para%')
  .maybeSingle()

if (selErr) {
  console.error('SELECT:', selErr.message)
  process.exit(1)
}

if (existing) {
  const { error } = await supabase
    .from('bula_leilao_fechamento')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', existing.id)
  if (error) {
    console.error('UPDATE:', error.message)
    process.exit(1)
  }
  console.log(`Fechamento atualizado (id=${existing.id})`)
} else {
  const { data: inserted, error } = await supabase
    .from('bula_leilao_fechamento')
    .insert(payload)
    .select('id')
    .single()
  if (error) {
    console.error('INSERT:', error.message)
    process.exit(1)
  }
  console.log(`Fechamento criado (id=${inserted.id})`)
}

console.log('\nResumo:')
console.log(`  VGV cobertura Bula : R$ ${vgv_total.toLocaleString('pt-BR')}`)
console.log(`  Lotes/animais      : ${lotes_vendidos}/${animais_vendidos}`)
console.log(`  Parcelas           : 30x em todos os lotes`)
console.log(`  Assessor           : ${por_assessor.map((a) => `${a.nome} (R$ ${a.vgv.toLocaleString('pt-BR')})`).join(', ')}`)
