// Atualiza o fechamento do "2o Leilao LS Now" (LS Agropecuaria / e-rural, 30/05/2026).
//
// Correcao 2026-05-30, a partir dos apontamentos de audio do chefe:
// - nao misturar LS Now com o 18o Mega Leilao Nelore Para;
// - fechar LS primeiro;
// - LS Now contem os lotes 10, M5 e 25;
// - lotes 10 e 25 em 30 pagamentos;
// - lote M5 e a bateria toda em 40 pagamentos, vendido por Fabricio Hyppolito.
//
// Fronteira de dados: este registro guarda dados comerciais/operacionais.
// Nao preenche receita_bula, comissao_assessoria, sobra_bruta nem acordo_*;
// esses campos vivem no ERP.
//
// Uso: node scripts/add-fechamento-ls-now.mjs

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

const NOME = '2o Leilao LS Now - 30/05/2026'
const DATA = '2026-05-30'

const lancesBase = [
  {
    uf: 'TO',
    lote: '10',
    parcela: 780,
    parcelas: 30,
    animais: 1,
    sexo: 'M',
    empresa: 'Bula Assessoria',
    assessor: 'Fabio Omena',
    vendedor: 'LS Agropecuaria',
    comprador: 'Agmar Inacio de Oliveira',
    fazenda: 'Fazenda Santa Luzia',
    cidade: 'Comeia',
    observacao: '1 touro Nelore P.O. - parcela R$ 780 x 30, conforme apontamento de audio.',
  },
  {
    uf: 'PA',
    lote: 'M5',
    parcela: 2000,
    parcelas: 40,
    animais: 4,
    sexo: 'M',
    empresa: 'Bula Assessoria',
    assessor: 'Fabricio Hyppolito',
    vendedor: 'LS Agropecuaria',
    comprador: 'Arthur Lopes',
    fazenda: 'Fazenda Recanto',
    cidade: 'Novo Repartimento',
    observacao: 'Bateria M5 inteira: 4 machos, R$ 500/cabeca x 4 = R$ 2.000 por parcela, em 40 pagamentos. Confirmado por audio e conversa de WhatsApp.',
  },
  {
    uf: 'MT',
    lote: '25',
    parcela: 600,
    parcelas: 30,
    animais: 1,
    sexo: 'M',
    empresa: 'Bula Assessoria',
    assessor: 'Fabio Omena',
    vendedor: 'LS Agropecuaria',
    comprador: 'Sr Jose Roberto Mazon',
    fazenda: 'Fazenda Vale do Ipe',
    cidade: 'Ribeirao Cascalheira',
    observacao: '1 touro - parcela R$ 600 x 30, conforme apontamento de audio.',
  },
]

const lances = lancesBase.map((lance) => ({
  ...lance,
  vgv: lance.parcela * lance.parcelas,
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

const byComprador = new Map()
for (const lance of lances) {
  const cur = byComprador.get(lance.comprador) ?? {
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
  byComprador.set(lance.comprador, cur)
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

const por_estado = [...byUf.values()].sort((a, b) => b.vgv - a.vgv)

const observacoes = [
  'Fechamento corrigido conforme apontamentos de audio recebidos em 30/05/2026.',
  'O fechamento anterior misturava dois leiloes. Este registro agora contempla somente o LS Now / Touros.',
  'Itens considerados no LS Now: lote 10, lote M5 e lote 25.',
  'Lotes 10 e 25 ajustados para 30 pagamentos. Lote M5 mantido em 40 pagamentos.',
  'Lotes 30, 31, 32 e 33 removidos deste fechamento; pertencem ao 18o Mega Leilao Nelore Para.',
  `Nossa cobertura LS Now: ${lotes_vendidos} lotes / ${animais_vendidos} animais / R$ ${vgv_total.toLocaleString('pt-BR')}.`,
  'Conferencia WhatsApp: Marcelo confirmou que so o lote M5 foi 40 pagamentos; restante do LS em 30 pagamentos.',
].join('\n')

const payload = {
  nome: NOME,
  data: DATA,
  local: 'Virtual',
  lotes_ofertados: 24,
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
}

const { data: existing, error: selErr } = await supabase
  .from('bula_leilao_fechamento')
  .select('id,nome')
  .eq('data', DATA)
  .ilike('nome', '%LS%Now%')
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
console.log(`  Ticket medio       : R$ ${ticket_medio.toLocaleString('pt-BR')}`)
console.log(`  Maior parcela      : R$ ${maior_lance.toLocaleString('pt-BR')}`)
console.log(`  Assessores         : ${por_assessor.map((a) => `${a.nome} (R$ ${a.vgv.toLocaleString('pt-BR')})`).join(', ')}`)
