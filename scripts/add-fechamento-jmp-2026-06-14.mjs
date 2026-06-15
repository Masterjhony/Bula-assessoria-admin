// Registra o fechamento do 10o Leilao Nelore JMP (touros 14/06/2026 e bezerras 13/06/2026).
//
// Origem dos dados:
// - PDF "0TOUROS JMP.pdf" (Listagem Vendas Assessores/Pisteiros, gerado 15/06/2026)
//   encaminhado pelo usuario em 15/06/2026 e atualizado com o lote 1005 (Fabio Gaia).
// - Imagem "Vendas.jpeg" com as 3 bezerras vendidas.
// - Mensagem WhatsApp: "Lote 20 vendido por Douglas Bispo e 10 e 34 para o Bulinha".
//
// Acordo Bula x JMP (ver fechamento "Leilao JMP Supreme", 2026-04-19):
//   receita Bula = 0,5% SOBRE O FATURAMENTO TOTAL DO LEILAO (nao sobre a cobertura Bula).
// O relatorio de pisteiros traz apenas a cobertura Bula; o faturamento total da
// leiloeira ainda nao foi informado, entao receita_bula / sobra_bruta ficam pendentes.
//
// Decisoes de comissao de pisteiro (confirmadas com o usuario / lancamentos passados):
//   - Douglas Bispo = 2% (Santa Nice, Jacamim, Cachoeirao).
//   - Bulinha (Felipe Andrade) = dono da FdB; neste leilao aparece a 0% (igual a
//     "Felipe Vilela Andrade" nos touros). Padrao historico era 2%, mas aqui = 0%.
//   - Demais alíquotas vem direto do relatorio (Fabio Gaia 3%, Leonardo 2%,
//     Lucas Martins 0,33%, Mateus / LM 0%).
//
// Uso:
//   DRY_RUN=1 node scripts/add-fechamento-jmp-2026-06-14.mjs   (so imprime, nao grava)
//   node scripts/add-fechamento-jmp-2026-06-14.mjs             (grava)

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'

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

const brl = (n) =>
  n == null
    ? '(pendente)'
    : `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const round2 = (n) => Math.round(n * 100) / 100

const ACORDO_PCT_FATURAMENTO = 0.005
const ACORDO_DESCRICAO =
  'Acordo especial Bula x JMP: 0,5% sobre o faturamento total do leilao. ' +
  'Faturamento total da leiloeira (Programa Leiloes) ainda nao informado; ' +
  'receita_bula e sobra_bruta ficam pendentes ate esse dado. O relatorio de pisteiros ' +
  'cobre apenas a cobertura Bula.'

// ----------------------------------------------------------------------------
// Helpers de agregacao a partir dos lances
// ----------------------------------------------------------------------------
function agregaPorAssessor(assessores) {
  const total = assessores.reduce((s, a) => s + a.vgv, 0)
  return assessores
    .slice()
    .sort((a, b) => b.vgv - a.vgv)
    .map((a, i) => ({
      posicao: i + 1,
      nome: a.nome,
      empresa: a.empresa,
      transacoes: a.lotes,
      animais: a.animais,
      vgv: a.vgv,
      ticket_medio: Math.round(a.vgv / a.animais),
      pct_total: Math.round((a.vgv / total) * 10000) / 10000,
      comissao_pct: a.pct,
      comissao: round2(a.comissao),
      observacao: a.observacao ?? null,
    }))
}

function agregaCompradores(lances) {
  const m = new Map()
  for (const l of lances) {
    const cur = m.get(l.comprador) ?? { comprador: l.comprador, lotes: 0, animais: 0, vgv: 0 }
    cur.lotes += 1
    cur.animais += l.animais
    cur.vgv += l.valor
    m.set(l.comprador, cur)
  }
  return [...m.values()]
    .sort((a, b) => b.vgv - a.vgv)
    .map((c, i) => ({ rank: i + 1, ...c }))
}

// ============================================================================
// TOUROS — 14/06/2026
// ============================================================================
// Lances itemizados (28 dos 61 lotes): todos os lotes com comissao + LM + Mateus.
// Cada bloco reconcilia exatamente com o subtotal do relatorio.
const tourosLances = [
  // Douglas Bispo Carvalho — 2%
  { assessor: 'Douglas Bispo', lote: '188', comprador: 'Pablo Pinheiro', animais: 4, valor: 96000 },
  { assessor: 'Douglas Bispo', lote: '221', comprador: 'Deiglames Oliveira', animais: 4, valor: 88000 },
  { assessor: 'Douglas Bispo', lote: '87', comprador: 'Sebastiao Pereira de Souza', animais: 1, valor: 26100 },
  { assessor: 'Douglas Bispo', lote: '99', comprador: 'Lindoalmir e Joao Alfredo', animais: 1, valor: 72000 },
  // Fabio de Omena Gaia — 3%
  { assessor: 'Fabio Omena', lote: '1001', comprador: 'Guilherme Carvalho e Marcelo', animais: 1, valor: 500000 },
  { assessor: 'Fabio Omena', lote: '1003', comprador: 'Guilherme Carvalho e Marcelo', animais: 1, valor: 380000 },
  { assessor: 'Fabio Omena', lote: '1005', comprador: 'Guilherme Carvalho e Marcelo', animais: 1, valor: 240000 },
  { assessor: 'Fabio Omena', lote: '107', comprador: 'Moacir Dumm Junior', animais: 1, valor: 37500 },
  { assessor: 'Fabio Omena', lote: '114', comprador: 'Felipe Mota', animais: 1, valor: 36000 },
  { assessor: 'Fabio Omena', lote: '121', comprador: 'Agropecuaria Dois Irmaos do Buriti LTDA', animais: 1, valor: 31500 },
  { assessor: 'Fabio Omena', lote: '126', comprador: 'Agropecuaria Dois Irmaos do Buriti LTDA', animais: 1, valor: 27000 },
  { assessor: 'Fabio Omena', lote: '20', comprador: 'Felipe Mota', animais: 1, valor: 36000 },
  { assessor: 'Fabio Omena', lote: '89', comprador: 'Claudio Fernandes Ivo', animais: 1, valor: 24000 },
  // Leonardo Serafim Francisco — 2%
  { assessor: 'Leonardo Serafim', lote: '205', comprador: 'Marcelo Clemente', animais: 3, valor: 60000 },
  { assessor: 'Leonardo Serafim', lote: '257', comprador: 'Maria Vilma Ribeiro Rotta', animais: 10, valor: 180000 },
  { assessor: 'Leonardo Serafim', lote: '270', comprador: 'Marcelo Clemente', animais: 10, valor: 180000 },
  // Lucas Martins Duraes Braganca — 0,33%
  { assessor: 'Lucas Martins', lote: '109', comprador: 'Armindo Martins da Conceicao', animais: 1, valor: 39000 },
  { assessor: 'Lucas Martins', lote: '134', comprador: 'Armindo Martins da Conceicao', animais: 1, valor: 25500 },
  { assessor: 'Lucas Martins', lote: '173', comprador: 'Rodrigo Moreno Machado', animais: 1, valor: 24000 },
  { assessor: 'Lucas Martins', lote: '208', comprador: 'Armindo Martins da Conceicao', animais: 4, valor: 107200 },
  { assessor: 'Lucas Martins', lote: '243', comprador: 'Fernando Diniz', animais: 4, valor: 80000 },
  { assessor: 'Lucas Martins', lote: '244', comprador: 'Fernando Diniz', animais: 4, valor: 80000 },
  { assessor: 'Lucas Martins', lote: '245', comprador: 'Fernando Diniz', animais: 4, valor: 80000 },
  { assessor: 'Lucas Martins', lote: '246', comprador: 'Fernando Diniz', animais: 4, valor: 80000 },
  // Mateus Alves da Silva — 0%
  { assessor: 'Mateus Alves', lote: '129', comprador: 'Rufino Kuhnem Junior', animais: 1, valor: 24300 },
  { assessor: 'Mateus Alves', lote: '165', comprador: 'Rufino Kuhnem Junior', animais: 1, valor: 24000 },
  { assessor: 'Mateus Alves', lote: '28', comprador: 'Rufino Kuhnem Junior', animais: 1, valor: 24000 },
  // LM Assessoria — 0%
  { assessor: 'LM Assessoria', lote: '92', comprador: 'Waldemir de Oliveira Moro', animais: 1, valor: 24000 },
].map((l) => ({ ...l, empresa: 'Bula Assessoria', vendedor: 'JBJ Agropecuaria LTDA' }))

// Subtotais OFICIAIS do relatorio (autoridade para totais e por_assessor).
const tourosAssessores = [
  { nome: 'Douglas Bispo', empresa: 'Bula Assessoria', lotes: 4, animais: 10, vgv: 282100, pct: 0.02, comissao: 5642.0 },
  { nome: 'Fabio Omena', empresa: 'Bula Assessoria', lotes: 9, animais: 9, vgv: 1312000, pct: 0.03, comissao: 39360.0 },
  {
    nome: 'Felipe Vilela Andrade (Bulinha)', empresa: 'Formula do Boi', lotes: 33, animais: 54, vgv: 1499300, pct: 0,
    comissao: 0,
    observacao:
      'Bulinha (dono FdB), 0% de comissao. 33 lotes / 54 animais nao itemizados aqui; ' +
      'detalhe lote-a-lote no PDF de origem. Principais compradores: Moacir Dumm Junior, ' +
      'Liberato A. Serafini Filho, Ademir Vitorio Notario, Joao Roberto Baird, entre outros.',
  },
  { nome: 'Leonardo Serafim', empresa: 'Bula Assessoria', lotes: 3, animais: 23, vgv: 420000, pct: 0.02, comissao: 8400.0 },
  { nome: 'Lucas Martins', empresa: 'Bula Assessoria', lotes: 8, animais: 23, vgv: 515700, pct: 0.0033, comissao: 1701.81 },
  { nome: 'Mateus Alves', empresa: 'Formula do Boi', lotes: 3, animais: 3, vgv: 72300, pct: 0, comissao: 0 },
  { nome: 'LM Assessoria', empresa: 'LM Assessoria', lotes: 1, animais: 1, vgv: 24000, pct: 0, comissao: 0 },
]

const TOUROS = {
  matchData: '2026-06-14',
  cronogramaNome: '%TOUROS%JMP%',
  fechamentoNome: '10o Leilao Nelore JMP - Touros - 14/06/2026',
  data: '2026-06-14',
  local: 'Presencial',
  lotes_vendidos: 61,
  animais_vendidos: 123,
  vgv_total: 4125400,
  maior_lance: 500000,
  assessores: tourosAssessores,
  lances: tourosLances,
}

// ============================================================================
// BEZERRAS — 13/06/2026
// ============================================================================
const bezerrasLances = [
  { assessor: 'Bulinha (Felipe Andrade)', lote: '10', comprador: 'Elvio Severino Pereira', animais: 1, valor: 39000 },
  { assessor: 'Douglas Bispo', lote: '20', comprador: 'Nelir Aparecida Tavares', animais: 1, valor: 126000 },
  { assessor: 'Bulinha (Felipe Andrade)', lote: '34', comprador: 'Elvio Severino Pereira', animais: 1, valor: 24000 },
].map((l) => ({ ...l, empresa: l.assessor.startsWith('Bulinha') ? 'Formula do Boi' : 'Bula Assessoria', vendedor: 'JBJ Agropecuaria LTDA', categoria: 'Novilha PO' }))

const bezerrasAssessores = [
  { nome: 'Douglas Bispo', empresa: 'Bula Assessoria', lotes: 1, animais: 1, vgv: 126000, pct: 0.02, comissao: 2520.0 },
  {
    nome: 'Bulinha (Felipe Andrade)', empresa: 'Formula do Boi', lotes: 2, animais: 2, vgv: 63000, pct: 0, comissao: 0,
    observacao:
      'Bulinha = dono da FdB; aplicado 0% (igual ao tratamento de "Felipe Vilela Andrade" nos touros do mesmo evento). ' +
      'Padrao historico em outros leiloes era 2% — confirmar se quer 0% ou 2% aqui.',
  },
]

const BEZERRAS = {
  matchData: '2026-06-13',
  cronogramaNome: '%BEZERRAS%JMP%',
  fechamentoNome: 'Leilao de Bezerras Nelore JMP - 13/06/2026',
  data: '2026-06-13',
  local: 'Presencial',
  lotes_vendidos: 3,
  animais_vendidos: 3,
  vgv_total: 189000,
  maior_lance: 126000,
  assessores: bezerrasAssessores,
  lances: bezerrasLances,
}

// ----------------------------------------------------------------------------
// Construcao + reconciliacao do payload
// ----------------------------------------------------------------------------
function buildPayload(cfg) {
  const por_assessor = agregaPorAssessor(cfg.assessores)
  const compradores = agregaCompradores(cfg.lances)
  const comissao_assessoria = round2(cfg.assessores.reduce((s, a) => s + a.comissao, 0))

  // Reconciliacao (avisos, nao bloqueia)
  const warnings = []
  const somaVgvAssessores = cfg.assessores.reduce((s, a) => s + a.vgv, 0)
  if (somaVgvAssessores !== cfg.vgv_total) {
    warnings.push(`VGV por assessor (${brl(somaVgvAssessores)}) != vgv_total (${brl(cfg.vgv_total)})`)
  }
  const somaLotes = cfg.assessores.reduce((s, a) => s + a.lotes, 0)
  if (somaLotes !== cfg.lotes_vendidos) warnings.push(`lotes por assessor (${somaLotes}) != lotes_vendidos (${cfg.lotes_vendidos})`)
  const somaAnimais = cfg.assessores.reduce((s, a) => s + a.animais, 0)
  if (somaAnimais !== cfg.animais_vendidos) warnings.push(`animais por assessor (${somaAnimais}) != animais_vendidos (${cfg.animais_vendidos})`)
  // lances itemizados vs subtotal por assessor
  const lancesPorAssessor = new Map()
  for (const l of cfg.lances) {
    const cur = lancesPorAssessor.get(l.assessor) ?? { vgv: 0, n: 0 }
    cur.vgv += l.valor
    cur.n += 1
    lancesPorAssessor.set(l.assessor, cur)
  }
  for (const a of cfg.assessores) {
    const it = lancesPorAssessor.get(a.nome)
    if (it && it.vgv !== a.vgv) warnings.push(`lances de ${a.nome} somam ${brl(it.vgv)} mas subtotal e ${brl(a.vgv)}`)
  }

  const observacoes = [
    `Fechamento do 10o Leilao Nelore JMP, registrado a partir do relatorio de pisteiros (PDF) e da imagem das bezerras, enviados em 15/06/2026.`,
    `Cobertura/totais oficiais do relatorio: ${cfg.lotes_vendidos} lotes / ${cfg.animais_vendidos} animais / ${brl(cfg.vgv_total)}.`,
    `Comissao de pisteiros (paga pela Bula): ${brl(comissao_assessoria)}.`,
    `Acordo Bula x JMP = 0,5% sobre o FATURAMENTO TOTAL do leilao. Esse faturamento ainda nao foi informado pela leiloeira (Programa Leiloes); por isso receita_bula e sobra_bruta ficam PENDENTES.`,
    cfg.lances.length < cfg.lotes_vendidos
      ? `Lances itemizados: ${cfg.lances.length} de ${cfg.lotes_vendidos} (os demais sao do Bulinha/Felipe Vilela a 0% — ver PDF). Compradores agregados a partir dos lances itemizados.`
      : `Lances itemizados: ${cfg.lances.length} de ${cfg.lotes_vendidos}.`,
  ].join('\n')

  const payload = {
    nome: cfg.fechamentoNome,
    data: cfg.data,
    local: cfg.local,
    lotes_ofertados: cfg.lotes_vendidos,
    lotes_vendidos: cfg.lotes_vendidos,
    animais_vendidos: cfg.animais_vendidos,
    vgv_total: cfg.vgv_total,
    ticket_medio: Math.round(cfg.vgv_total / cfg.animais_vendidos),
    maior_lance: cfg.maior_lance,
    compradores_unicos: compradores.length,
    estados_alcancados: 0,
    por_assessor,
    por_estado: [],
    compradores,
    lances: cfg.lances.map((l) => ({
      lote: l.lote,
      animais: l.animais,
      vgv: l.valor,
      assessor: l.assessor,
      empresa: l.empresa,
      vendedor: l.vendedor,
      comprador: l.comprador,
    })),
    perfil_genetico: [],
    faturamento_total_leilao: null,
    acordo_pct_faturamento: ACORDO_PCT_FATURAMENTO,
    acordo_pct_venda_cobertura: null,
    acordo_descricao: ACORDO_DESCRICAO,
    receita_bula: null,
    comissao_assessoria,
    sobra_bruta: null,
    observacoes,
  }
  return { payload, warnings, comissao_assessoria, por_assessor, compradores }
}

async function upsertFechamento(cfg) {
  const { payload, warnings, comissao_assessoria, por_assessor, compradores } = buildPayload(cfg)

  console.log(`\n================ ${cfg.fechamentoNome} ================`)
  console.log(`  Data            : ${cfg.data} (${cfg.local})`)
  console.log(`  Lotes/Animais   : ${cfg.lotes_vendidos} / ${cfg.animais_vendidos}`)
  console.log(`  VGV total       : ${brl(cfg.vgv_total)}`)
  console.log(`  Ticket medio    : ${brl(payload.ticket_medio)}  | Maior lance: ${brl(cfg.maior_lance)}`)
  console.log(`  Comissao pisteiro: ${brl(comissao_assessoria)}`)
  console.log(`  Receita Bula    : (pendente faturamento total) | acordo 0,5% do faturamento`)
  console.log(`  Por assessor:`)
  for (const a of por_assessor) {
    console.log(
      `    - ${a.nome.padEnd(34)} ${String(a.transacoes).padStart(2)} lt / ${String(a.animais).padStart(3)} an / ${brl(a.vgv).padStart(16)} @ ${(a.comissao_pct * 100).toFixed(2)}% = ${brl(a.comissao)}`,
    )
  }
  console.log(`  Top compradores (dos lances itemizados):`)
  for (const c of compradores.slice(0, 6)) {
    console.log(`    #${c.rank} ${c.comprador.padEnd(36)} ${c.lotes} lt / ${c.animais} an / ${brl(c.vgv)}`)
  }
  if (warnings.length) {
    console.log(`  >>> AVISOS DE RECONCILIACAO:`)
    for (const w of warnings) console.log(`      ! ${w}`)
  } else {
    console.log(`  Reconciliacao: OK (totais e subtotais batem)`)
  }

  if (DRY_RUN) {
    console.log(`  [DRY_RUN] nada gravado.`)
    return
  }

  // upsert fechamento
  const { data: existing, error: selErr } = await supabase
    .from('bula_leilao_fechamento')
    .select('id')
    .eq('data', cfg.data)
    .ilike('nome', '%JMP%')
    .maybeSingle()
  if (selErr) throw new Error(`SELECT fechamento (${cfg.data}): ${selErr.message}`)

  let id
  if (existing) {
    const { error } = await supabase
      .from('bula_leilao_fechamento')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw new Error(`UPDATE fechamento: ${error.message}`)
    id = existing.id
    console.log(`  -> fechamento ATUALIZADO (id=${id})`)
  } else {
    const { data, error } = await supabase.from('bula_leilao_fechamento').insert(payload).select('id').single()
    if (error) throw new Error(`INSERT fechamento: ${error.message}`)
    id = data.id
    console.log(`  -> fechamento CRIADO (id=${id})`)
  }

  // cronograma_leiloes (descritivo)
  const { error: cronErr } = await supabase
    .from('cronograma_leiloes')
    .update({
      venda_bula: brl(cfg.vgv_total),
      comissao: '0,5% do faturamento total',
      faturamento_realizado: '',
    })
    .eq('data', cfg.matchData)
    .ilike('nome', cfg.cronogramaNome)
  if (cronErr) console.log(`  (aviso) cronograma_leiloes nao atualizado: ${cronErr.message}`)
  else console.log(`  -> cronograma_leiloes atualizado`)

  return id
}

console.log(DRY_RUN ? '*** DRY RUN — nada sera gravado ***' : '*** GRAVANDO EM PRODUCAO ***')
await upsertFechamento(TOUROS)
await upsertFechamento(BEZERRAS)
console.log('\nConcluido.')
