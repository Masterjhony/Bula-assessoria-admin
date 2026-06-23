// Criação + fechamento do 3º Leilão Matrizes KatiSpera (20/06/2026).
//
// Fontes (imagens enviadas pelo cliente):
// - Flyer: "3º LEILÃO MATRIZES KatiSpera", sábado 20/06 12h (Brasília), fêmeas
//   (doadoras/matrizes/novilhas superprecoces prenhes, 100% genotipadas).
//   Leiloeira PROGRAMA LEILÕES; transmissão Canal Rural -> Virtual.
// - WhatsApp: "Esse leilão não estava na agenda, mas vendemos lá 11 fêmeas".
//   "Acordo foi 6% da venda."
//     • Levamos lt 89 e 91 - 550,00 - 10F (com Douglas Bispo / Bula):
//       Mauro Cesar, Fazenda Mudança, Novo Repartimento-PA.
//     • Levamos lt 61 - 670,00 - 1F (com Douglas Bispo / Bula):
//       Nelore Grão Pará / Dr Celso Lopes, Faz. Flor de Minas, Ourilândia do Norte-PA.
//
// Definições confirmadas pelo cliente (23/06/2026):
// - 550,00 / 670,00 = PARCELA por cabeça; condição 30 parcelas.
// - Comissão do assessor Douglas Bispo = 2% sobre o VGV de cobertura.
// - Acordo = 6% sobre a VENDA (cobertura Bula).
//
// Como o leilão NÃO estava na agenda, o script também CRIA o leilão em
// bula_leiloes + cronograma_leiloes + agenda_events (padrão add-leilao-*).
//
// Uso: DRY_RUN=1 node scripts/add-fechamento-katispera-matrizes-2026-06-20.mjs
//      (sem DRY_RUN grava em produção)
import { readFileSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const r2 = (n) => Math.round(Number(n) * 100) / 100
const addDays = (iso, d) => { const x = new Date(`${iso}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10) }

const DATA = '2026-06-20'
const NOME = '3º Leilão Matrizes KatiSpera'
const NOME_CRONO = '3º LEILÃO MATRIZES KATISPERA'
const PARCELAS = 30
const ACORDO_PCT_VENDA = 0.06
const CONDICAO = '30 parcelas'
const LEILOEIRA_NOME = 'Programa Leilões'

// IDs fixos (mesmos do fechamento Floc 15/06; validados no preflight abaixo).
const LEILOEIRA_ID = 'cdfed41f-ff46-4519-8dff-10d8d8fccaa5' // PROGRAMA LEILOES (erp_pessoas)
const CAT_RECEITA = 'e74434bd-3366-4015-9268-15d6640cf15f'  // Comissao Leilao (receita)
const CAT_DESPESA = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e'  // Comissão Funcionário (despesa)
const CC_ASSESSORES = '52dd8ed0-0c0a-4524-86bd-01dc121487b3' // COM02
const DOUGLAS_FORN_ID = '25642186-16ad-4306-9eb7-8f3372b63f00' // Douglas Bispo (erp_pessoas)

// Cobertura Bula. vgv = parcela × PARCELAS × animais.
const lots = [
  { lote: '89 e 91', parcela: 550, animais: 10, assessor: 'Douglas Bispo', comprador: 'Mauro Cesar', fazenda: 'Fazenda Mudança', cidade: 'Novo Repartimento', uf: 'PA' },
  { lote: '61', parcela: 670, animais: 1, assessor: 'Douglas Bispo', comprador: 'Nelore Grão Pará - Dr Celso Lopes', fazenda: 'Fazenda Flor de Minas', cidade: 'Ourilândia do Norte', uf: 'PA' },
].map((l) => ({ ...l, vgv: l.parcela * PARCELAS * l.animais, empresa: 'Bula Assessoria', vendedor: 'KatiSpera' }))

const DOUGLAS_PCT = 0.02
const vgv_total = lots.reduce((s, l) => s + l.vgv, 0)
const total_animais = lots.reduce((s, l) => s + l.animais, 0)
const receita_bula = r2(vgv_total * ACORDO_PCT_VENDA)

// por assessor (só Douglas Bispo)
const byA = new Map()
for (const l of lots) {
  const cur = byA.get(l.assessor) || { nome: l.assessor, empresa: l.empresa, transacoes: 0, animais: 0, vgv: 0 }
  cur.transacoes += 1; cur.animais += l.animais; cur.vgv += l.vgv
  byA.set(l.assessor, cur)
}
const por_assessor = [...byA.values()].sort((a, b) => b.vgv - a.vgv).map((a, i) => ({
  posicao: i + 1, nome: a.nome, empresa: a.empresa, transacoes: a.transacoes, animais: a.animais, vgv: a.vgv,
  ticket_medio: Math.round(a.vgv / a.animais), pct_total: r2(a.vgv / vgv_total * 100) / 100,
  comissao_pct: DOUGLAS_PCT, comissao: r2(a.vgv * DOUGLAS_PCT),
}))
const comissao_assessoria = r2(por_assessor.reduce((s, a) => s + a.comissao, 0))
const sobra_bruta = r2(receita_bula - comissao_assessoria)

// compradores
const byC = new Map()
for (const l of lots) {
  const k = `${l.comprador}|${l.uf}`
  const cur = byC.get(k) || { comprador: l.comprador, fazenda: l.fazenda, cidade: l.cidade, uf: l.uf, lotes: 0, animais: 0, vgv: 0 }
  cur.lotes += 1; cur.animais += l.animais; cur.vgv += l.vgv
  byC.set(k, cur)
}
const compradores = [...byC.values()].sort((a, b) => b.vgv - a.vgv).map((c, i) => ({ rank: i + 1, ...c }))

// por estado (tudo PA)
const por_estado = [{ uf: 'PA', estado: 'Pará', lotes: lots.length, animais: total_animais, vgv: vgv_total, pct_total: 1, ticket_medio: Math.round(vgv_total / total_animais) }]

const observacoes = [
  `Criação + fechamento do 3º Leilão Matrizes KatiSpera (20/06/2026), leiloeira Programa Leilões. Transmissão Canal Rural — Virtual. Leilão de fêmeas (doadoras/matrizes/novilhas prenhes, 100% genotipadas).`,
  `Leilão NÃO estava na agenda; criado retroativamente a partir das imagens enviadas pelo cliente.`,
  `Cobertura Bula: lotes 89, 91 e 61 / ${total_animais} fêmeas / ${brl(vgv_total)} (parcela × ${PARCELAS}).`,
  `Acordo: 6% sobre a venda (cobertura Bula) = ${brl(receita_bula)}. Comissão assessoria ${brl(comissao_assessoria)} (Douglas Bispo 2%). Sobra bruta ${brl(sobra_bruta)}.`,
  `Condição: ${CONDICAO}. Faturamento TOTAL do leilão não informado pela leiloeira.`,
].join('\n')

const payload = {
  nome: NOME, data: DATA, local: 'Virtual',
  lotes_ofertados: lots.length, lotes_vendidos: lots.length, animais_vendidos: total_animais,
  vgv_total, ticket_medio: Math.round(vgv_total / total_animais), maior_lance: Math.max(...lots.map((l) => l.vgv)),
  compradores_unicos: compradores.length, estados_alcancados: por_estado.length,
  por_assessor, por_estado, compradores,
  lances: lots.map((l) => ({ lote: l.lote, animais: l.animais, vgv: l.vgv, parcela: l.parcela, parcelas: PARCELAS, assessor: l.assessor, empresa: l.empresa, vendedor: l.vendedor, comprador: `${l.comprador} · ${l.fazenda} · ${l.cidade}/${l.uf}` })),
  perfil_genetico: [],
  faturamento_total_leilao: null,
  acordo_pct_faturamento: null, acordo_pct_venda_cobertura: ACORDO_PCT_VENDA,
  acordo_descricao: `6% sobre a venda (cobertura Bula) = ${brl(receita_bula)}. Programa Leilões.`,
  receita_bula, comissao_assessoria, sobra_bruta, observacoes,
}

console.log(DRY_RUN ? '*** DRY RUN ***' : '*** GRAVANDO EM PRODUÇÃO ***')
console.log(`\n${NOME} — ${DATA}`)
console.log(`  VGV cobertura : ${brl(vgv_total)} (${total_animais} fêmeas · ${lots.length} lotes)`)
console.log(`  Receita 6%    : ${brl(receita_bula)}`)
console.log(`  Comissão 2%   : ${brl(comissao_assessoria)} (Douglas Bispo)  | Sobra bruta: ${brl(sobra_bruta)}`)
for (const l of lots) console.log(`    lt ${String(l.lote).padEnd(7)} ${l.animais}F × ${brl(l.parcela)}/parc × ${PARCELAS} = ${brl(l.vgv).padStart(14)}  -> ${l.comprador}`)
console.log(`  Imposto est. 18%: ${brl(receita_bula * 0.18)} | Lucro líq.: ${brl(receita_bula - comissao_assessoria - receita_bula * 0.18)}`)

// Preflight: confirma que os IDs fixos resolvem (evita posting em conta errada).
async function preflight() {
  const checks = [
    ['erp_pessoas', LEILOEIRA_ID, 'Leiloeira'],
    ['erp_pessoas', DOUGLAS_FORN_ID, 'Douglas Bispo'],
    ['erp_categorias', CAT_RECEITA, 'Cat. receita'],
    ['erp_categorias', CAT_DESPESA, 'Cat. despesa'],
    ['erp_centros_custo', CC_ASSESSORES, 'CC assessores'],
  ]
  console.log('\nPreflight de IDs:')
  for (const [table, id, label] of checks) {
    const { data, error } = await sb.from(table).select('id,nome').eq('id', id).maybeSingle()
    if (error) throw new Error(`${label}: ${error.message}`)
    if (!data) throw new Error(`${label}: id ${id} NÃO encontrado em ${table} — abortar antes de gravar.`)
    console.log(`  ok ${label.padEnd(14)} -> ${data.nome}`)
  }
}

await preflight()

if (DRY_RUN) { console.log('\n[DRY_RUN] nada gravado.'); process.exit(0) }

// 1) Cria/atualiza o leilão público (bula_leiloes) + cronograma + agenda
const bulaPayload = {
  nome: NOME, data: DATA, tipo: 'Fêmeas — doadoras, matrizes e novilhas prenhes (genotipadas)',
  local: 'Virtual', animais: total_animais, expectativa: 0, meta_bula: 0, realizado_bula: vgv_total,
  status: 'concluido', img: '', horario: '12:00', transmissao: 'Canal Rural', modelo: 'VIRTUAL',
  leiloeira: LEILOEIRA_NOME, condicao: CONDICAO, frete_gratis: '', acordo_comissao: '6% da venda', catalogo_url: null, tasks: [],
}
const cronoPayload = {
  data: DATA, dia_semana: 'Sabado', hora: '12:00', nome: NOME_CRONO, criador: 'KatiSpera',
  presencial: 'VIRTUAL', leiloeira: 'PROGRAMA LEILOES', raca: 'Nelore', qtd_animais: total_animais,
  sexo: 'FEMEAS', comissao: '6% da venda', contrato: CONDICAO, recebido: 'NAO',
  venda_bula: brl(vgv_total), comissao_receber: brl(receita_bula), faturamento_realizado: '',
}

async function upsertByNameDate(table, p) {
  const { data: ex, error: selErr } = await sb.from(table).select('id').eq('nome', p.nome).eq('data', p.data).maybeSingle()
  if (selErr) throw new Error(`SELECT ${table}: ${selErr.message}`)
  if (ex) { const { error } = await sb.from(table).update(p).eq('id', ex.id); if (error) throw new Error(`UPDATE ${table}: ${error.message}`); return { id: ex.id, action: 'atualizado' } }
  const { data, error } = await sb.from(table).insert(p).select('id').single(); if (error) throw new Error(`INSERT ${table}: ${error.message}`); return { id: data.id, action: 'criado' }
}

// cronograma_leiloes pode não ter algumas colunas opcionais; tenta o payload
// completo e cai para o mínimo se reclamar de coluna inexistente.
let crono
try { crono = await upsertByNameDate('cronograma_leiloes', cronoPayload) }
catch (e) {
  if (/column .* does not exist|Could not find/i.test(e.message)) {
    const { venda_bula, comissao_receber, faturamento_realizado, contrato_obs, ...min } = cronoPayload
    crono = await upsertByNameDate('cronograma_leiloes', min)
    console.log(`  (cronograma: colunas extras ignoradas — ${e.message})`)
  } else throw e
}
const bula = await upsertByNameDate('bula_leiloes', bulaPayload)
console.log(`\n-> bula_leiloes ${bula.action} (${bula.id}) | cronograma_leiloes ${crono.action} (${crono.id})`)

// agenda_events (recria vinculado ao cronograma)
const agendaPayload = {
  id: randomUUID(), title: NOME_CRONO,
  description: ['Leiloeira: Programa Leilões', 'Transmissão: Canal Rural (Virtual)', 'Raça: Nelore · Sexo: FEMEAS', `Cobertura Bula: ${total_animais} fêmeas (lotes 89, 91, 61)`, 'Condição: 30 parcelas', 'Acordo: 6% da venda'].join('\n'),
  event_type: 'leilao', status: 'concluido', priority: 'media',
  start_at: `${DATA}T12:00:00-03:00`, end_at: `${DATA}T14:00:00-03:00`, all_day: false,
  location: 'Virtual', color: '#A68B4B',
  notes: `Adicionado por ${basename(import.meta.url)} a partir das imagens enviadas pelo cliente (leilão fora da agenda).`,
  linked_leilao_id: crono.id,
}
await sb.from('agenda_events').delete().eq('linked_leilao_id', crono.id)
const { error: agErr } = await sb.from('agenda_events').insert(agendaPayload)
if (agErr) console.log(`  (agenda_events: ${agErr.message})`); else console.log('-> agenda_events recriado')

// 2) fechamento
const { data: ex, error: selErr } = await sb.from('bula_leilao_fechamento').select('id').eq('data', DATA).ilike('nome', '%KATISPERA%').maybeSingle()
if (selErr) throw new Error(selErr.message)
let fechId
if (ex) { const { error } = await sb.from('bula_leilao_fechamento').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', ex.id); if (error) throw new Error(error.message); fechId = ex.id; console.log(`-> fechamento ATUALIZADO (${fechId})`) }
else { const { data, error } = await sb.from('bula_leilao_fechamento').insert(payload).select('id').single(); if (error) throw new Error(error.message); fechId = data.id; console.log(`-> fechamento CRIADO (${fechId})`) }

// 3) conta a receber (comissão Bula)
const crDoc = 'BULA-2026-CR-KATISPERA-20260620'
const crPayload = {
  descricao: '3º LEILAO MATRIZES KATISPERA - COMISSAO BULA', cliente_id: LEILOEIRA_ID, categoria_id: CAT_RECEITA,
  valor: receita_bula, valor_recebido: 0, emissao: DATA, vencimento: addDays(DATA, 45), status: 'aberto',
  numero_documento: crDoc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
  observacoes: `Comissão Bula = 6% da venda (cobertura ${brl(vgv_total)}) = ${brl(receita_bula)}. Vinculado ao fechamento ${fechId}.`,
  tags: ['leilao', '2026', 'junho', 'katispera', 'comissao'], anexos: [],
}
{
  const { data: exCr } = await sb.from('erp_contas_receber').select('id').eq('numero_documento', crDoc).maybeSingle()
  if (exCr) { await sb.from('erp_contas_receber').update({ ...crPayload, updated_at: new Date().toISOString() }).eq('id', exCr.id); console.log(`-> conta a receber ATUALIZADA ${brl(receita_bula)}`) }
  else { const { data, error } = await sb.from('erp_contas_receber').insert(crPayload).select('id').single(); if (error) throw new Error(error.message); console.log(`-> conta a receber CRIADA (${data.id}) ${brl(receita_bula)}`) }
}

// 4) comissão a pagar (Douglas Bispo 2%)
for (const a of por_assessor) {
  const doc = 'BULA-2026-CP-COM-KATISPERA-DOUGLAS'
  const cp = {
    descricao: `COMISSAO 3º LEILAO MATRIZES KATISPERA - ${a.nome.toUpperCase()} (${a.comissao_pct * 100}%)`,
    fornecedor_id: DOUGLAS_FORN_ID, categoria_id: CAT_DESPESA, centro_custo_id: CC_ASSESSORES,
    valor: a.comissao, emissao: DATA, vencimento: '2026-07-25', status: 'aberto',
    numero_documento: doc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
    observacoes: `Comissão ${a.comissao_pct * 100}% sobre VGV de cobertura ${brl(a.vgv)} no 3º Leilão Matrizes KatiSpera. Vinculado ao fechamento ${fechId}.`,
    tags: ['a-pagar', 'comissao', '2026', 'leilao', 'katispera', 'douglas'], anexos: [],
  }
  const { data: exCp } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', doc).maybeSingle()
  if (exCp) { await sb.from('erp_contas_pagar').update({ ...cp, updated_at: new Date().toISOString() }).eq('id', exCp.id); console.log(`-> CP ATUALIZADA ${a.nome} ${brl(a.comissao)}`) }
  else { const { error } = await sb.from('erp_contas_pagar').insert(cp); if (error) throw new Error(error.message); console.log(`-> CP CRIADA ${a.nome} ${brl(a.comissao)} (${doc})`) }
}

console.log('\nConcluído.')
