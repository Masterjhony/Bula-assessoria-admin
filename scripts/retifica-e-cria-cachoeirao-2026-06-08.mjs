// (2026-06-08) Parte 2 das alterações pedidas pelo chefe:
//   1) Retificar receita_bula (= esperada pelo acordo) nos 4 leilões a R$0.
//   2) Criar o fechamento "Destaques da Safra Nelore Cachoeirão" (03/06/2026)
//      com a estrutura de cobertura (lotes/assessores/compradores) parseada das
//      mensagens de WhatsApp. VGV fica PENDENTE: depende do nº de parcelas
//      (condição de pagamento) e do % do acordo — a confirmar.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const r2 = (n) => Math.round(Number(n) * 100) / 100

// ── 1. Retificar receitas (= esperada pelo acordo) ───────────────────
console.log('— Retificando receitas (receita_bula = esperada pelo acordo) —')
const ALVOS = [
  '84a96ad4-33b6-46e9-a71d-0452e68f36b8', // LS Collection
  'b807e56f-c90b-4bfa-92ad-5b85cd7d8899', // LS Now
  '811f774e-c4b2-4b6c-bc6b-fab286007b76', // Tresmar
]
{
  const { data } = await sb.from('bula_leilao_fechamento').select('id').ilike('nome', '%mega%nelore%par%').eq('data', '2026-05-30')
  if (data?.length === 1) ALVOS.push(data[0].id) // 18º Mega Nelore Pará
}
for (const id of ALVOS) {
  const { data: x } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,data,vgv_total,faturamento_total_leilao,acordo_pct_faturamento,acordo_pct_venda_cobertura,comissao_assessoria')
    .eq('id', id).single()
  const esperada = r2((Number(x.acordo_pct_faturamento) || 0) * (Number(x.faturamento_total_leilao) || 0)
    + (Number(x.acordo_pct_venda_cobertura) || 0) * (Number(x.vgv_total) || 0))
  const sobra = r2(esperada - (Number(x.comissao_assessoria) || 0))
  const { error } = await sb.from('bula_leilao_fechamento')
    .update({ receita_bula: esperada, sobra_bruta: sobra, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) { console.error(`  x ${x.nome}:`, error.message); continue }
  console.log(`  ok ${x.nome} -> receita=${brl(esperada)} | sobra=${brl(sobra)} (comissao ${brl(x.comissao_assessoria)})`)
}

// ── 2. Criar Destaques da Safra Nelore Cachoeirão (03/06/2026) ────────
console.log('\n— Criando fechamento Destaques da Safra Nelore Cachoeirao (03/06) —')
const DATA = '2026-06-03'
const NOME = 'Destaques da Safra Nelore Cachoeirao - 03/06/2026'
// parcela = valor da parcela; animais = nº de touros (sufixo "M" = macho).
// VGV/lote = parcela × NUM_PARCELAS × animais  → NUM_PARCELAS A CONFIRMAR.
const lances = [
  { lote: '28', parcela: 600, animais: 1, sexo: 'M', assessor: 'Leonardo Serafim', comprador: 'Jose Armando Machado / Guilherme Machado', fazenda: 'Fazenda Catarinense', cidade: 'Marcelandia', uf: 'MT', msg: 'Levamos lote 28 - 1M; 600 de parcela - Leonardo Serafim.' },
  { lote: '27', parcela: 570, animais: 1, sexo: 'M', assessor: 'Douglas Bispo', comprador: 'Gilberto Sarubi', fazenda: 'Fazenda Garantido', cidade: 'Oriximina', uf: 'PA', msg: 'Levamos lt 27 - 570,00 - 1M; Com Douglas Bispo.' },
  { lote: '7', parcela: 750, animais: 1, sexo: 'M', assessor: 'Douglas Bispo', comprador: 'Fazenda Bom Retiro (Nelore BF)', fazenda: 'Fazenda Bom Retiro', cidade: 'Novo Repartimento', uf: 'PA', msg: 'Levamos lt 7 - 750,00 - 1M; Com Douglas Bispo.' },
  { lote: '42', parcela: 570, animais: 3, sexo: 'M', assessor: 'Douglas Bispo', comprador: 'Gilberto Sarubi', fazenda: 'Fazenda Garantido', cidade: 'Oriximina', uf: 'PA', msg: 'Levamos 42 - 570,00 - 3M; Com Douglas Bispo.' },
  { lote: '43', parcela: 550, animais: 1, sexo: 'M', assessor: 'Fabricio Hyppolito', comprador: 'Arthur Lopes', fazenda: 'Fazenda Recanto', cidade: 'Novo Repartimento', uf: 'PA', msg: 'Lote 43 - 550,00; FOI COM Fabricio Hyppolito.' },
  { lote: '17', parcela: 620, animais: 1, sexo: 'M', assessor: 'Fabio Omena', comprador: 'Agropecuaria Dois Irmaos do Buriti', fazenda: 'Fazenda Uniao', cidade: 'Dois Irmaos do Buriti', uf: 'MS', msg: 'Lote 17 - 620 - 1M; foi com Fabio Omena Gaia.' },
  { lote: '40', parcela: 500, animais: 1, sexo: 'M', assessor: 'Fabio Omena', comprador: 'Marcel Castro Boiadeiro', fazenda: 'Fazenda Barreira', cidade: 'Heliopolis', uf: 'BA', msg: 'Levamos lt 40 - 500,00 - 1M; Foi com Fabio Omena.' },
].map((l) => ({ ...l, empresa: 'Bula Assessoria', parcelas: null, vgv: 0 })) // parcelas/vgv PENDENTE

const animais_vendidos = lances.reduce((s, l) => s + l.animais, 0)
const byA = new Map()
for (const l of lances) {
  const c = byA.get(l.assessor) ?? { nome: l.assessor, empresa: 'Bula Assessoria', transacoes: 0, animais: 0, vgv: 0 }
  c.transacoes++; c.animais += l.animais; byA.set(l.assessor, c)
}
const por_assessor = [...byA.values()].sort((a, b) => b.animais - a.animais)
  .map((a, i) => ({ posicao: i + 1, ...a, ticket_medio: 0, pct_total: 0, comissao: null, observacao: 'VGV pendente: aguardando no de parcelas.' }))
const byU = new Map()
for (const l of lances) { const c = byU.get(l.uf) ?? { uf: l.uf, lotes: 0, animais: 0, vgv: 0 }; c.lotes++; c.animais += l.animais; byU.set(l.uf, c) }
const por_estado = [...byU.values()].map((u) => ({ ...u, estado: u.uf, pct_total: 0, ticket_medio: 0 }))

const payload = {
  nome: NOME, data: DATA, local: 'Nelore Cachoeirao (Presencial)',
  lotes_ofertados: 50, lotes_vendidos: lances.length, animais_vendidos,
  vgv_total: 0, ticket_medio: 0, maior_lance: Math.max(...lances.map((l) => l.parcela)),
  compradores_unicos: new Set(lances.map((l) => l.comprador)).size, estados_alcancados: por_estado.length,
  por_assessor, por_estado, compradores: [], lances, perfil_genetico: [],
  faturamento_total_leilao: 1128900,
  acordo_pct_faturamento: null, acordo_pct_venda_cobertura: null, acordo_descricao: null,
  receita_bula: null, comissao_assessoria: null, sobra_bruta: null,
  observacoes: [
    'PENDENTE: VGV da cobertura aguarda o no de parcelas (condicao de pagamento do leilao) - VGV/lote = parcela x no parcelas x no touros.',
    'PENDENTE: % do acordo com a leiloeira Nelore Cachoeirao (nao informado).',
    'Faturamento da leiloeira: R$ 1.128.900,00 (informado pelo chefe em 08/06/2026).',
    'Cobertura Bula (das mensagens de WhatsApp): 7 lotes / 9 touros. Assessores: Douglas Bispo, Fabio Omena, Fabricio Hyppolito, Leonardo Serafim.',
    'Leilao: Destaques da Safra Nelore Cachoeirao, 03/06/2026, presencial, 50 touros Nelore PO (catalogo) / 45 animais (agenda). Transmissao Canal do Boi - Bula Remates.',
  ].join('\n'),
}

const { data: ex } = await sb.from('bula_leilao_fechamento').select('id').eq('data', DATA).ilike('nome', '%cachoeir%').maybeSingle()
let id
if (ex) {
  const { error } = await sb.from('bula_leilao_fechamento').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', ex.id)
  if (error) { console.error('  x UPDATE:', error.message); process.exit(1) }
  id = ex.id; console.log(`  ok atualizado (id=${id})`)
} else {
  const { data, error } = await sb.from('bula_leilao_fechamento').insert(payload).select('id').single()
  if (error) { console.error('  x INSERT:', error.message); process.exit(1) }
  id = data.id; console.log(`  ok criado (id=${id})`)
}
console.log(`  Cobertura: ${lances.length} lotes / ${animais_vendidos} touros | faturamento leiloeira ${brl(1128900)} | VGV/receita PENDENTES`)
console.log('\nDone.')
