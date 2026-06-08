// Registra fechamentos informados por WhatsApp em 08/06/2026.
//
// Leiloes:
// - 8o Leilao Jacamim Femeas (07/06/2026)
// - 9o Leilao Nelore Flor do Aratau (07/06/2026)
// - 1o Nelore Sao Francisco / NFSF (07/06/2026)
//
// Fontes:
// - imagens de WhatsApp enviadas pelo usuario em 08/06/2026;
// - F:/Listagem.pdf, que confirma o resultado oficial do Flor do Aratau.
//
// Uso: node scripts/add-fechamentos-2026-06-07-whatsapp.mjs

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

const DATA = '2026-06-07'
const CATEGORIA_RECEITA = 'Comissao Leilao'
const CATEGORIA_COR = '#6B8F5C'

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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

const pctAssessor = new Map([
  ['Fabio Omena', 0.03],
  ['Douglas Bispo', 0.02],
  ['Leonardo Serafim', 0.02],
  ['Marcelo Carneiro', 0.02],
  ['Marcelo Carneiro / Leonardo Serafim', 0.02],
  ['Bulinha (Felipe Andrade)', 0.02],
])

const estadoNome = new Map([
  ['BA', 'Bahia'],
  ['CE', 'Ceara'],
  ['GO', 'Goias'],
  ['MA', 'Maranhao'],
  ['MG', 'Minas Gerais'],
  ['PA', 'Para'],
  ['PR', 'Parana'],
])

function enrichLances({ parcelas, vendedor, lances }) {
  return lances.map((lance) => {
    const vgv = lance.vgv ?? round2(lance.parcela * (lance.parcelas ?? parcelas) * lance.animais)
    return {
      ...lance,
      parcelas: lance.parcelas ?? parcelas,
      vendedor,
      vgv,
      observacao: [
        lance.observacaoExtra,
        `VGV: ${brl(lance.parcela)} x ${lance.parcelas ?? parcelas} x ${lance.animais} = ${brl(vgv)}.`,
      ].filter(Boolean).join(' '),
    }
  })
}

function aggregateLances(lances, totalReceita) {
  const vgv_total = round2(lances.reduce((sum, lance) => sum + lance.vgv, 0))
  const animais_vendidos = lances.reduce((sum, lance) => sum + lance.animais, 0)
  const lotes_vendidos = lances.length
  const maior_lance = Math.max(...lances.map((lance) => Number(lance.parcela || 0)))
  const ticket_medio = animais_vendidos ? Math.round(vgv_total / animais_vendidos) : 0

  const byAssessor = new Map()
  for (const lance of lances) {
    const nome = lance.assessor || 'Nao informado'
    const cur = byAssessor.get(nome) ?? {
      nome,
      empresa: lance.empresa || 'Bula Assessoria',
      transacoes: 0,
      animais: 0,
      vgv: 0,
    }
    cur.transacoes += 1
    cur.animais += lance.animais
    cur.vgv = round2(cur.vgv + lance.vgv)
    byAssessor.set(nome, cur)
  }

  const por_assessor = [...byAssessor.values()]
    .sort((a, b) => b.vgv - a.vgv)
    .map((assessor, index) => {
      const pct = pctAssessor.get(assessor.nome) ?? 0
      const comissao = round2(assessor.vgv * pct)
      return {
        posicao: index + 1,
        nome: assessor.nome,
        empresa: assessor.empresa,
        transacoes: assessor.transacoes,
        animais: assessor.animais,
        vgv: assessor.vgv,
        ticket_medio: assessor.animais ? Math.round(assessor.vgv / assessor.animais) : 0,
        pct_total: vgv_total ? round2(assessor.vgv / vgv_total) : 0,
        comissao_pct: pct || null,
        comissao,
        observacao: pct
          ? `Comissao estimada pela regra padrao de ${(pct * 100).toLocaleString('pt-BR')}% sobre VGV.`
          : 'Assessor sem percentual confirmado; comissao nao provisionada.',
      }
    })

  const byUf = new Map()
  for (const lance of lances) {
    const cur = byUf.get(lance.uf) ?? { uf: lance.uf, lotes: 0, animais: 0, vgv: 0 }
    cur.lotes += 1
    cur.animais += lance.animais
    cur.vgv = round2(cur.vgv + lance.vgv)
    byUf.set(lance.uf, cur)
  }
  const por_estado = [...byUf.values()]
    .sort((a, b) => b.vgv - a.vgv)
    .map((uf) => ({
      ...uf,
      estado: estadoNome.get(uf.uf) ?? uf.uf,
      pct_total: vgv_total ? round2(uf.vgv / vgv_total) : 0,
      ticket_medio: uf.animais ? Math.round(uf.vgv / uf.animais) : 0,
    }))

  const byComprador = new Map()
  for (const lance of lances) {
    const key = `${lance.comprador}|${lance.fazenda}|${lance.uf}`
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
    cur.vgv = round2(cur.vgv + lance.vgv)
    byComprador.set(key, cur)
  }
  const compradores = [...byComprador.values()]
    .sort((a, b) => b.vgv - a.vgv)
    .map((comprador, index) => ({ rank: index + 1, ...comprador }))

  const comissao_assessoria = round2(por_assessor.reduce((sum, a) => sum + Number(a.comissao || 0), 0))
  const sobra_bruta = totalReceita == null ? null : round2(totalReceita - comissao_assessoria)

  return {
    vgv_total,
    animais_vendidos,
    lotes_vendidos,
    maior_lance,
    ticket_medio,
    compradores_unicos: compradores.length,
    estados_alcancados: por_estado.length,
    por_assessor,
    por_estado,
    compradores,
    comissao_assessoria,
    sobra_bruta,
  }
}

const jacamimLances = enrichLances({
  parcelas: 30,
  vendedor: 'Fazenda Jacamim',
  lances: [
    { lote: '55', parcela: 850, animais: 1, sexo: 'F', assessor: 'Fabio Omena', empresa: 'Bula Assessoria', comprador: 'Nelore Beca', fazenda: 'Fazenda Casa Amarela', cidade: 'Quixelo', uf: 'CE', observacaoExtra: 'Mensagem: Levamos 55 - R$ 850,00 - 1F.' },
    { lote: '127', parcela: 900, animais: 1, sexo: 'F', assessor: 'Bulinha (Felipe Andrade)', empresa: 'Bula Remates', comprador: 'Marco Tulio Severino', fazenda: 'Fazenda Ribeirao Bonito', cidade: 'Cacu', uf: 'GO', observacaoExtra: 'Mensagem: Levamos 127 - R$ 900,00 - 1F.' },
    { lote: '43', parcela: 900, animais: 1, sexo: 'F', assessor: 'Marcelo Carneiro / Leonardo Serafim', empresa: 'Bula Remates', comprador: 'Nelore Leao', fazenda: 'Nelore Leao', cidade: 'Joao Pinheiro', uf: 'MG', observacaoExtra: 'Mensagem: LT 43 - R$ 900,00 - 1F.' },
    { lote: '112', parcela: 650, animais: 1, sexo: 'F', assessor: 'Leonardo Serafim', empresa: 'Bula Assessoria', comprador: 'Elias Abdo Filho', fazenda: 'Nelore ABBA', cidade: 'Cruzeiro do Oeste', uf: 'PR', observacaoExtra: 'Mensagem: lote 112 - R$ 650,00 - 1F.' },
    { lote: '18', parcela: 820, animais: 1, sexo: 'F', assessor: 'Marcelo Carneiro / Leonardo Serafim', empresa: 'Bula Remates', comprador: 'Thales de Oliveira', fazenda: 'Fazenda Sao Miguel', cidade: 'Pimenta', uf: 'MG', observacaoExtra: 'Mensagem: lote 18 - R$ 820,00 - 1F.' },
    { lote: '73', parcela: 650, animais: 1, sexo: 'F', assessor: 'Douglas Bispo', empresa: 'Bula Assessoria', comprador: 'Fazenda Mestre Sousa / Nelore MSJ', fazenda: 'Fazenda Mestre Sousa', cidade: 'Baixa Grande', uf: 'BA', observacaoExtra: 'Mensagem: lote 73 - R$ 650,00 - 1F.' },
    { lote: '54', parcela: 1000, animais: 1, sexo: 'F', assessor: 'Leonardo Serafim', empresa: 'Bula Assessoria', comprador: 'Elias Abdo Filho', fazenda: 'Nelore ABBA', cidade: 'Cruzeiro do Oeste', uf: 'PR', observacaoExtra: 'Mensagem: voltando as compras, lote 54 - R$ 1.000,00 - 1F.' },
    { lote: '44', parcela: 920, animais: 1, sexo: 'F', assessor: 'Fabio Omena', empresa: 'Bula Assessoria', comprador: 'Nelore Beca', fazenda: 'Fazenda Casa Amarela', cidade: 'Quixelo', uf: 'CE', observacaoExtra: 'Mensagem: lote 44 - R$ 920,00 - 1F.' },
  ],
})

const florKnownFabio = new Set(['01', '05'])
const florLances = enrichLances({
  parcelas: 30,
  vendedor: 'Nelore Flor do Aratau',
  lances: [
    { lote: '01', parcela: 4100, animais: 1, sexo: 'M', assessor: 'Fabio Omena', empresa: 'Bula Assessoria', comprador: 'Diego Benitah Batista', fazenda: 'Nelore FPA / Fazenda Paraiso do Acara', cidade: 'Nao informado', uf: 'PA', observacaoExtra: 'Mensagem: Lote 01 - R$ 4.100,00 - 1M. Valor confere com F:/Listagem.pdf.' },
    { lote: '01F', parcela: 480, animais: 1, sexo: 'F', comprador: 'Ilane Silva Mendes', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA' },
    { lote: '02F', parcela: 900, animais: 1, sexo: 'F', comprador: 'Gessivaldo Buss', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA' },
    { lote: '04', parcela: 1150, animais: 1, sexo: 'M', comprador: 'Ilane Silva Mendes', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA' },
    { lote: '04F', parcela: 620, animais: 1, sexo: 'F', comprador: 'Aldemar Pereira Camara de Sousa', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA' },
    { lote: '05', parcela: 720, animais: 1, sexo: 'M', assessor: 'Fabio Omena', empresa: 'Bula Assessoria', comprador: 'Andre Luis Caetano Rosa', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA', observacaoExtra: 'Mensagem citou R$ 710,00; F:/Listagem.pdf informa total R$ 21.600,00, equivalente a R$ 720,00 em 30 parcelas. Usado valor oficial da listagem.' },
    { lote: '08', parcela: 850, animais: 1, sexo: 'M', comprador: 'Vanderlucio Rocha da Silva', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA' },
    { lote: '09', parcela: 770, animais: 1, sexo: 'M', comprador: 'Jose Dionisio Bispo Neto', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA' },
    { lote: '21', parcela: 600, animais: 1, sexo: 'M', comprador: 'Edenivaldo Araujo Barreto', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA' },
    { lote: '23', parcela: 620, animais: 1, sexo: 'M', comprador: 'Antonio Teixeira de Almeida', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA' },
    { lote: '28', parcela: 500, animais: 1, sexo: 'M', comprador: 'Francisco Carolindo de Almeida', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA', observacaoExtra: 'Comprador ajustado pelo WhatsApp; F:/Listagem.pdf traz comprador Rafael de Macedo.' },
    { lote: '41', parcela: 550, animais: 1, sexo: 'M', comprador: 'Edenivaldo Araujo Barreto', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA' },
    { lote: '46', parcela: 1100, animais: 1, sexo: 'M', comprador: 'Nassandro Ferreira da Silva', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA' },
    { lote: '47', parcela: 820, animais: 1, sexo: 'M', comprador: 'Dejernandes Lopes de Souza', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA' },
    { lote: '48', parcela: 600, animais: 1, sexo: 'M', comprador: 'Nassandro Ferreira da Silva', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA' },
    { lote: '49', parcela: 850, animais: 1, sexo: 'M', comprador: 'Ronisvan de Sousa Costa Luz', fazenda: 'Nelore Flor do Aratau', cidade: 'Nao informado', uf: 'PA' },
  ].map((lance) => ({
    assessor: florKnownFabio.has(lance.lote) ? 'Fabio Omena' : 'Nao informado',
    empresa: florKnownFabio.has(lance.lote) ? 'Bula Assessoria' : 'Nao informado',
    observacaoExtra: lance.observacaoExtra ?? `Lote incluido na relacao "Vendas" do WhatsApp e conferido no F:/Listagem.pdf. Assessor individual nao informado no print.`,
    ...lance,
  })),
})

const fsfLances = enrichLances({
  parcelas: 40,
  vendedor: 'Nelore NFSF',
  lances: [
    { lote: '03', parcela: 500, animais: 1, sexo: 'M', assessor: 'Fabio Omena', empresa: 'Bula Assessoria', comprador: 'Bayron', fazenda: 'Fazenda Tres Marias', cidade: 'Mirador', uf: 'MA', observacaoExtra: 'Mensagem: lt 03 - R$ 500,00 - 1M.' },
    { lote: '27', parcela: 400, animais: 1, sexo: 'F', assessor: 'Fabio Omena', empresa: 'Bula Assessoria', comprador: 'Bayron', fazenda: 'Fazenda Tres Marias', cidade: 'Mirador', uf: 'MA', observacaoExtra: 'Mensagem: lt 27 - R$ 400,00 - 1F.' },
    { lote: '36', parcela: 400, animais: 1, sexo: 'F', assessor: 'Fabio Omena', empresa: 'Bula Assessoria', comprador: 'Bayron', fazenda: 'Fazenda Tres Marias', cidade: 'Mirador', uf: 'MA', observacaoExtra: 'Mensagem: lt 36 - R$ 400,00 - 1F.' },
    { lote: '20', parcela: 450, animais: 1, sexo: 'M', assessor: 'Fabio Omena', empresa: 'Bula Assessoria', comprador: 'Leontino dos Prazeres Mafra', fazenda: 'Fazenda Sao Jose', cidade: 'Matinha', uf: 'MA', observacaoExtra: 'Mensagem: lt 20 - R$ 450,00 - 1M.' },
  ],
})

function makeFechamento(cfg) {
  const agg = aggregateLances(cfg.lances, cfg.receita_bula)
  return {
    payload: {
      nome: cfg.nome,
      data: DATA,
      local: cfg.local,
      lotes_ofertados: cfg.lotes_ofertados,
      lotes_vendidos: agg.lotes_vendidos,
      animais_vendidos: agg.animais_vendidos,
      vgv_total: agg.vgv_total,
      ticket_medio: agg.ticket_medio,
      maior_lance: agg.maior_lance,
      compradores_unicos: agg.compradores_unicos,
      estados_alcancados: agg.estados_alcancados,
      por_assessor: agg.por_assessor,
      por_estado: agg.por_estado,
      compradores: agg.compradores,
      lances: cfg.lances,
      perfil_genetico: [],
      faturamento_total_leilao: cfg.faturamento_total_leilao,
      acordo_pct_faturamento: cfg.acordo_pct_faturamento,
      acordo_pct_venda_cobertura: cfg.acordo_pct_venda_cobertura,
      acordo_descricao: cfg.acordo_descricao,
      acordo_criador_id: null,
      receita_bula: cfg.receita_bula,
      comissao_assessoria: agg.comissao_assessoria,
      sobra_bruta: agg.sobra_bruta,
      observacoes: cfg.observacoes({ ...agg, receita_bula: cfg.receita_bula }),
    },
    agg,
  }
}

const jacamimReceita = round2(jacamimLances.reduce((s, l) => s + l.vgv, 0) * 0.03)
const florFaturamento = 1_134_900
const florVgv = florLances.reduce((s, l) => s + l.vgv, 0)
const florReceita = round2(florFaturamento * 0.01 + florVgv * 0.03)
const fsfFaturamento = 675_600
const fsfReceita = round2(fsfFaturamento * 0.01)

const fechamentos = [
  {
    key: 'jacamim-femeas-20260607',
    nome: '8o Leilao Jacamim Femeas - 07/06/2026',
    publicId: '24913ec2-fcbb-4d82-a9bd-a45aec8f70e3',
    cronoId: '86aa71a3-b9f2-4615-b5ff-fa3b4c480382',
    leiloeira: 'PROGRAMA LEILOES',
    local: 'Virtual',
    lotes_ofertados: 210,
    parcelas: 30,
    lances: jacamimLances,
    faturamento_total_leilao: null,
    acordo_pct_faturamento: 0.01,
    acordo_pct_venda_cobertura: 0.03,
    acordo_descricao: '1% do faturamento total + 3% da venda da cobertura',
    receita_bula: jacamimReceita,
    contaDescricao: '8o LEILAO JACAMIM FEMEAS - COBERTURA BULA',
    tags: ['leilao', '2026', 'junho', 'jacamim', 'whatsapp', 'provisao'],
    observacoes: (agg) => [
      'Fechamento registrado a partir das imagens de WhatsApp enviadas em 08/06/2026.',
      'Mensagem consolidada: Leilao Jacamim, 30 parcelas, acordo 1% do faturamento + 3% da venda.',
      `Cobertura Bula: ${agg.lotes_vendidos} lotes / ${agg.animais_vendidos} femeas / ${brl(agg.vgv_total)}.`,
      `Receita provisionada neste momento: somente 3% da venda da cobertura = ${brl(agg.receita_bula)}.`,
      'Pendencia: falta o faturamento total da leiloeira para somar o 1% do faturamento ao contas a receber.',
      `Comissao de assessoria estimada por regras padrao: ${brl(agg.comissao_assessoria)}.`,
    ].join('\n'),
  },
  {
    key: 'flor-do-aratau-20260607',
    nome: '9o Leilao Nelore Flor do Aratau - 07/06/2026',
    publicId: '74ed47dc-1f6b-4241-b346-f3558cc5e9d9',
    cronoId: 'a06d0449-07fb-4072-930f-f8baa7593943',
    leiloeira: 'BULA REMATES',
    local: 'Presencial',
    lotes_ofertados: 54,
    parcelas: 30,
    lances: florLances,
    faturamento_total_leilao: florFaturamento,
    acordo_pct_faturamento: 0.01,
    acordo_pct_venda_cobertura: 0.03,
    acordo_descricao: '1% do faturamento total + 3% da venda da cobertura',
    receita_bula: florReceita,
    contaDescricao: '9o LEILAO NELORE FLOR DO ARATAU - FECHAMENTO BULA',
    tags: ['leilao', '2026', 'junho', 'flor-do-aratau', 'whatsapp', 'listagem-pdf', 'provisao'],
    observacoes: (agg) => [
      'Fechamento registrado a partir das imagens de WhatsApp e do arquivo F:/Listagem.pdf.',
      `Listagem oficial: total geral ${brl(florFaturamento)}, 54 lotes ofertados, 50 vendidos, media R$ 22.698,00.`,
      `Cobertura Bula considerada: ${agg.lotes_vendidos} lotes / ${agg.animais_vendidos} animais / ${brl(agg.vgv_total)}.`,
      `Receita Bula: 1% do faturamento (${brl(round2(florFaturamento * 0.01))}) + 3% da cobertura (${brl(round2(agg.vgv_total * 0.03))}) = ${brl(agg.receita_bula)}.`,
      'Lote 05: print indicava R$ 710,00; Listagem.pdf informa total R$ 21.600,00, usado como valor oficial.',
      'Comprador do lote 28 ajustado conforme WhatsApp; Listagem.pdf traz Rafael de Macedo.',
      'Assessor individual dos lotes da lista "Vendas" nao foi informado no print; somente lotes 01 e 05 ficaram vinculados a Fabio Omena para comissao estimada.',
    ].join('\n'),
  },
  {
    key: 'nelore-sao-francisco-20260607',
    nome: '1o Nelore Sao Francisco - 07/06/2026',
    publicId: 'edca1e77-9196-430f-bb09-573323e79a43',
    cronoId: '26c28c24-0e43-42f5-8caf-c64636dddb17',
    leiloeira: 'AGRESTE LEILOES',
    local: 'Presencial',
    lotes_ofertados: 39,
    parcelas: 40,
    lances: fsfLances,
    faturamento_total_leilao: fsfFaturamento,
    acordo_pct_faturamento: 0.01,
    acordo_pct_venda_cobertura: null,
    acordo_descricao: '1% do faturamento total do leilao',
    receita_bula: fsfReceita,
    contaDescricao: '1o NELORE SAO FRANCISCO - FECHAMENTO BULA',
    tags: ['leilao', '2026', 'junho', 'sao-francisco', 'nfsf', 'whatsapp', 'provisao'],
    observacoes: (agg) => [
      'Fechamento registrado a partir das imagens de WhatsApp enviadas em 08/06/2026.',
      `Resumo de midia encaminhado: total do leilao ${brl(fsfFaturamento)}, 39 lotes/animais, media geral R$ 17.323,08.`,
      'Leilao em 40 parcelas; acordo informado: 1% do faturamento.',
      `Cobertura Bula: ${agg.lotes_vendidos} lotes / ${agg.animais_vendidos} animais / ${brl(agg.vgv_total)}.`,
      `Receita Bula: 1% do faturamento = ${brl(agg.receita_bula)}.`,
      `Comissao de assessoria estimada por regra padrao Fabio Omena 3%: ${brl(agg.comissao_assessoria)}.`,
    ].join('\n'),
  },
]

async function upsertFechamento(cfg) {
  const { payload, agg } = makeFechamento(cfg)

  const { data: existingFechamento, error: selFechErr } = await supabase
    .from('bula_leilao_fechamento')
    .select('id,nome')
    .eq('nome', cfg.nome)
    .maybeSingle()
  if (selFechErr) throw new Error(`SELECT fechamento ${cfg.nome}: ${selFechErr.message}`)

  let fechamentoId
  if (existingFechamento) {
    const { error } = await supabase
      .from('bula_leilao_fechamento')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', existingFechamento.id)
    if (error) throw new Error(`UPDATE fechamento ${cfg.nome}: ${error.message}`)
    fechamentoId = existingFechamento.id
    console.log(`Fechamento atualizado: ${cfg.nome} (id=${fechamentoId})`)
  } else {
    const { data, error } = await supabase
      .from('bula_leilao_fechamento')
      .insert(payload)
      .select('id')
      .single()
    if (error) throw new Error(`INSERT fechamento ${cfg.nome}: ${error.message}`)
    fechamentoId = data.id
    console.log(`Fechamento criado: ${cfg.nome} (id=${fechamentoId})`)
  }

  await supabase
    .from('cronograma_leiloes')
    .update({
      venda_bula: brl(agg.vgv_total),
      comissao_receber: cfg.receita_bula == null ? '' : brl(cfg.receita_bula),
      comissao: cfg.acordo_descricao,
      contrato: `${cfg.parcelas} parcelas`,
      faturamento_realizado: cfg.faturamento_total_leilao == null ? '' : brl(cfg.faturamento_total_leilao),
    })
    .eq('id', cfg.cronoId)

  await supabase
    .from('bula_leiloes')
    .update({
      realizado_bula: agg.vgv_total,
      acordo_comissao: cfg.acordo_descricao,
      condicao: `${cfg.parcelas} parcelas`,
      status: 'concluido',
    })
    .eq('id', cfg.publicId)

  const clienteId = await ensurePessoa(cfg.leiloeira, { is_cliente: true })
  const categoriaId = await ensureCategoria(CATEGORIA_RECEITA, 'receita', CATEGORIA_COR)
  const crDocumento = `BULA-2026-CR-WPP-${slug(cfg.key)}`
  const crPayload = {
    descricao: cfg.contaDescricao,
    cliente_id: clienteId,
    categoria_id: categoriaId,
    valor: cfg.receita_bula,
    valor_recebido: 0,
    emissao: DATA,
    vencimento: addDays(DATA, 45),
    status: 'aberto',
    numero_documento: crDocumento,
    parcela: 1,
    total_parcelas: 1,
    recorrencia: 'nenhuma',
    observacoes: [
      `Provisao de fluxo de caixa gerada a partir do fechamento ${fechamentoId}.`,
      `VGV Bula: ${brl(agg.vgv_total)} | Receita Bula: ${brl(cfg.receita_bula)}.`,
      `Acordo: ${cfg.acordo_descricao}.`,
      cfg.faturamento_total_leilao == null
        ? 'Faturamento total da leiloeira pendente; revisar conta a receber quando confirmado.'
        : `Faturamento total informado: ${brl(cfg.faturamento_total_leilao)}.`,
      'Vencimento tecnico D+45 ate confirmacao financeira definitiva.',
    ].join(' '),
    tags: cfg.tags,
    anexos: [],
  }

  const { data: existingCr, error: selCrErr } = await supabase
    .from('erp_contas_receber')
    .select('id')
    .eq('numero_documento', crDocumento)
    .maybeSingle()
  if (selCrErr) throw new Error(`SELECT conta a receber ${cfg.nome}: ${selCrErr.message}`)

  if (existingCr) {
    const { error } = await supabase
      .from('erp_contas_receber')
      .update({ ...crPayload, updated_at: new Date().toISOString() })
      .eq('id', existingCr.id)
    if (error) throw new Error(`UPDATE conta a receber ${cfg.nome}: ${error.message}`)
    console.log(`Conta a receber atualizada: ${crDocumento} (id=${existingCr.id})`)
  } else {
    const { data, error } = await supabase
      .from('erp_contas_receber')
      .insert(crPayload)
      .select('id')
      .single()
    if (error) throw new Error(`INSERT conta a receber ${cfg.nome}: ${error.message}`)
    console.log(`Conta a receber criada: ${crDocumento} (id=${data.id})`)
  }

  console.log(`  Cobertura: ${agg.lotes_vendidos}/${cfg.lotes_ofertados} lotes | ${agg.animais_vendidos} animais | ${brl(agg.vgv_total)}`)
  console.log(`  Receita Bula: ${brl(cfg.receita_bula)} | Comissao assessoria: ${brl(agg.comissao_assessoria)} | Sobra: ${agg.sobra_bruta == null ? 'pendente' : brl(agg.sobra_bruta)}`)
  console.log('')
}

for (const cfg of fechamentos) {
  await upsertFechamento(cfg)
}
