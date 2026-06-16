// Fechamento do Leilão Seleção Nelore Floc (15/06/2026).
//
// Fontes:
// - Mensagens WhatsApp (cobertura Bula: lotes 11,13,17,23,24,30) enviadas em 15/06.
// - Catálogo (bula_leiloes.catalogo_url): condição = 30 parcelas (2+2+2+2+2+20).
// - "Somatória - Leilão Seleção Floc" (leiloeira): faturamento total R$ 728.100,00
//   / 29,5 animais / 14 compradores / 9 estados.
// Acordo (cronograma/bula_leiloes): 1% do faturamento total do leilão.
//
// AMBIGUIDADE: nas mensagens, os lotes 11 e 13 vêm seguidos de "Com Douglas Bispo -
// Bula Assessoria / Ricardo Brasileiro" (adotado aqui), mas há um "Sr Adenilson Tedesco"
// repetido antes deles. Se 11/13 forem do Adenilson/Fábio, ajustar.
//
// Uso: DRY_RUN=1 node scripts/add-fechamento-floc-2026-06-15.mjs | sem DRY_RUN grava.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const DATA = '2026-06-15'
const NOME = 'Leilão Seleção Nelore Floc - 15/06/2026'
const PARCELAS = 30
const FATURAMENTO_TOTAL = 728100
const ACORDO_PCT = 0.01
const CONDICAO = '30 parcelas (2+2+2+2+2+20); 12% desconto à vista'
// IDs fixos
const LEILOEIRA_ID = 'cdfed41f-ff46-4519-8dff-10d8d8fccaa5' // PROGRAMA LEILOES
const CAT_RECEITA = 'e74434bd-3366-4015-9268-15d6640cf15f'  // Comissao Leilao
const CAT_DESPESA = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e'  // Comissão Funcionário
const CC_ASSESSORES = '52dd8ed0-0c0a-4524-86bd-01dc121487b3' // COM02

// Cobertura Bula (parcela × 30)
const lots = [
  { lote: '24', parcela: 680, assessor: 'Fábio Omena', fornId: '1739c44b-b46a-4c1d-8adf-f6509fb44891', comprador: 'Sr Adenilson Tedesco', fazenda: 'Fazenda Montana', cidade: 'Tomé Açu', uf: 'PA' },
  { lote: '17', parcela: 530, assessor: 'Fábio Omena', fornId: '1739c44b-b46a-4c1d-8adf-f6509fb44891', comprador: 'Sr Adenilson Tedesco', fazenda: 'Fazenda Montana', cidade: 'Tomé Açu', uf: 'PA' },
  { lote: '23', parcela: 530, assessor: 'Fábio Omena', fornId: '1739c44b-b46a-4c1d-8adf-f6509fb44891', comprador: 'Sr Adenilson Tedesco', fazenda: 'Fazenda Montana', cidade: 'Tomé Açu', uf: 'PA' },
  { lote: '11', parcela: 510, assessor: 'Douglas Bispo', fornId: '25642186-16ad-4306-9eb7-8f3372b63f00', comprador: 'Ricardo Brasileiro', fazenda: 'Fazenda Terra Santa', cidade: 'Tucumã', uf: 'PA' },
  { lote: '13', parcela: 510, assessor: 'Douglas Bispo', fornId: '25642186-16ad-4306-9eb7-8f3372b63f00', comprador: 'Ricardo Brasileiro', fazenda: 'Fazenda Terra Santa', cidade: 'Tucumã', uf: 'PA' },
  { lote: '30', parcela: 470, assessor: 'Fábio Omena', fornId: '1739c44b-b46a-4c1d-8adf-f6509fb44891', comprador: 'Nelore Lima', fazenda: 'Fazenda seu Luiz', cidade: 'Carmelópolis', uf: 'CE' },
].map((l) => ({ ...l, animais: 1, vgv: l.parcela * PARCELAS, empresa: 'Bula Assessoria', vendedor: 'Nelore Floc' }))

const RATE = (nome) => (/f[áa]bio/i.test(nome) ? 0.03 : 0.02)
const vgv_total = lots.reduce((s, l) => s + l.vgv, 0)
const receita_bula = r2(FATURAMENTO_TOTAL * ACORDO_PCT)

// por assessor
const byA = new Map()
for (const l of lots) {
  const cur = byA.get(l.assessor) || { nome: l.assessor, empresa: l.empresa, transacoes: 0, animais: 0, vgv: 0 }
  cur.transacoes += 1; cur.animais += l.animais; cur.vgv += l.vgv
  byA.set(l.assessor, cur)
}
const por_assessor = [...byA.values()].sort((a, b) => b.vgv - a.vgv).map((a, i) => {
  const pct = RATE(a.nome)
  return { posicao: i + 1, nome: a.nome, empresa: a.empresa, transacoes: a.transacoes, animais: a.animais, vgv: a.vgv, ticket_medio: Math.round(a.vgv / a.animais), pct_total: r2(a.vgv / vgv_total * 100) / 100, comissao_pct: pct, comissao: r2(a.vgv * pct) }
})
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

// por estado
const byU = new Map()
for (const l of lots) {
  const cur = byU.get(l.uf) || { uf: l.uf, lotes: 0, animais: 0, vgv: 0 }
  cur.lotes += 1; cur.animais += l.animais; cur.vgv += l.vgv
  byU.set(l.uf, cur)
}
const nomesUf = { PA: 'Pará', CE: 'Ceará' }
const por_estado = [...byU.values()].sort((a, b) => b.vgv - a.vgv).map((u) => ({ ...u, estado: nomesUf[u.uf] || u.uf, pct_total: r2(u.vgv / vgv_total * 100) / 100, ticket_medio: Math.round(u.vgv / u.animais) }))

const observacoes = [
  `Fechamento do Leilão Seleção Nelore Floc (15/06/2026), leiloeira Programa Leilões / Agreste Leilões Nordeste. Virtual.`,
  `Cobertura Bula: ${lots.length} lotes / ${lots.length} fêmeas / ${brl(vgv_total)} (parcela × ${PARCELAS}).`,
  `Faturamento TOTAL do leilão (somatória da leiloeira): ${brl(FATURAMENTO_TOTAL)} · 29,5 animais · 14 compradores · 9 estados (AL/BA/CE/MG/PA/PB/PE/PI/SE).`,
  `Acordo: 1% do faturamento total = ${brl(receita_bula)}. Comissões de assessoria ${brl(comissao_assessoria)} (Fábio 3%, Douglas 2%). Sobra bruta ${brl(sobra_bruta)}.`,
  `Condição: ${CONDICAO}.`,
  `OBS: lotes 11 e 13 atribuídos a Douglas Bispo / Ricardo Brasileiro (Fazenda Terra Santa, Tucumã-PA) — confirmar, pois nas mensagens "Sr Adenilson Tedesco" aparece repetido antes deles.`,
].join('\n')

const payload = {
  nome: NOME, data: DATA, local: 'Virtual',
  lotes_ofertados: lots.length, lotes_vendidos: lots.length, animais_vendidos: lots.length,
  vgv_total, ticket_medio: Math.round(vgv_total / lots.length), maior_lance: Math.max(...lots.map((l) => l.vgv)),
  compradores_unicos: compradores.length, estados_alcancados: por_estado.length,
  por_assessor, por_estado, compradores,
  lances: lots.map((l) => ({ lote: l.lote, animais: l.animais, vgv: l.vgv, parcela: l.parcela, parcelas: PARCELAS, assessor: l.assessor, empresa: l.empresa, vendedor: l.vendedor, comprador: `${l.comprador} · ${l.fazenda} · ${l.cidade}/${l.uf}` })),
  perfil_genetico: [],
  faturamento_total_leilao: FATURAMENTO_TOTAL,
  acordo_pct_faturamento: ACORDO_PCT, acordo_pct_venda_cobertura: null,
  acordo_descricao: `1% sobre o faturamento total do leilão (Programa Leilões/Agreste). Faturamento total: ${brl(FATURAMENTO_TOTAL)}.`,
  receita_bula, comissao_assessoria, sobra_bruta, observacoes,
}

console.log(DRY_RUN ? '*** DRY RUN ***' : '*** GRAVANDO EM PRODUÇÃO ***')
console.log(`\n${NOME}`)
console.log(`  VGV cobertura : ${brl(vgv_total)} (${lots.length} fêmeas)`)
console.log(`  Faturamento   : ${brl(FATURAMENTO_TOTAL)}`)
console.log(`  Receita (1%)  : ${brl(receita_bula)}`)
console.log(`  Comissão      : ${brl(comissao_assessoria)}  | Sobra bruta: ${brl(sobra_bruta)}`)
for (const a of por_assessor) console.log(`    ${a.nome.padEnd(16)} ${a.transacoes} lt / ${brl(a.vgv).padStart(12)} @ ${(a.comissao_pct * 100)}% = ${brl(a.comissao)}`)
console.log(`  Imposto est. 18%: ${brl(receita_bula * 0.18)} | Lucro líq.: ${brl(receita_bula - comissao_assessoria - receita_bula * 0.18)}`)

if (DRY_RUN) { console.log('\n[DRY_RUN] nada gravado.'); process.exit(0) }

// 1) fechamento
const { data: ex, error: selErr } = await sb.from('bula_leilao_fechamento').select('id').eq('data', DATA).ilike('nome', '%FLOC%').maybeSingle()
if (selErr) throw new Error(selErr.message)
let fechId
if (ex) {
  const { error } = await sb.from('bula_leilao_fechamento').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', ex.id)
  if (error) throw new Error(error.message); fechId = ex.id; console.log(`\n-> fechamento ATUALIZADO (${fechId})`)
} else {
  const { data, error } = await sb.from('bula_leilao_fechamento').insert(payload).select('id').single()
  if (error) throw new Error(error.message); fechId = data.id; console.log(`\n-> fechamento CRIADO (${fechId})`)
}

// 2) cronograma + bula_leiloes
await sb.from('cronograma_leiloes').update({ venda_bula: brl(vgv_total), comissao_receber: brl(receita_bula), faturamento_realizado: brl(FATURAMENTO_TOTAL), contrato: CONDICAO }).eq('data', DATA).ilike('nome', '%FLOC%')
await sb.from('bula_leiloes').update({ realizado_bula: vgv_total, condicao: CONDICAO, status: 'concluido' }).eq('data', DATA).ilike('nome', '%FLOC%')
console.log('-> cronograma + bula_leiloes atualizados')

// 3) conta a receber
const crDoc = 'BULA-2026-CR-FLOC-20260615'
const crPayload = {
  descricao: 'LEILAO SELECAO NELORE FLOC - COMISSAO BULA', cliente_id: LEILOEIRA_ID, categoria_id: CAT_RECEITA,
  valor: receita_bula, valor_recebido: 0, emissao: DATA, vencimento: addDays(DATA, 45), status: 'aberto',
  numero_documento: crDoc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
  observacoes: `Comissão Bula = 1% do faturamento total (${brl(FATURAMENTO_TOTAL)}) = ${brl(receita_bula)}. Vinculado ao fechamento ${fechId}.`,
  tags: ['leilao', '2026', 'junho', 'floc', 'comissao'], anexos: [],
}
{
  const { data: exCr } = await sb.from('erp_contas_receber').select('id').eq('numero_documento', crDoc).maybeSingle()
  if (exCr) { await sb.from('erp_contas_receber').update({ ...crPayload, updated_at: new Date().toISOString() }).eq('id', exCr.id); console.log(`-> conta a receber ATUALIZADA ${brl(receita_bula)}`) }
  else { const { data, error } = await sb.from('erp_contas_receber').insert(crPayload).select('id').single(); if (error) throw new Error(error.message); console.log(`-> conta a receber CRIADA (${data.id}) ${brl(receita_bula)}`) }
}

// 4) comissões a pagar (uma por assessor)
for (const a of por_assessor) {
  const forn = lots.find((l) => l.assessor === a.nome).fornId
  const slug = /f[áa]bio/i.test(a.nome) ? 'FABIO' : 'DOUGLAS'
  const doc = `BULA-2026-CP-COM-FLOC-${slug}`
  const cp = {
    descricao: `COMISSAO LEILAO SELECAO NELORE FLOC - ${a.nome.toUpperCase()} (${a.comissao_pct * 100}%)`,
    fornecedor_id: forn, categoria_id: CAT_DESPESA, centro_custo_id: CC_ASSESSORES,
    valor: a.comissao, emissao: DATA, vencimento: '2026-07-25', status: 'aberto',
    numero_documento: doc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
    observacoes: `Comissão ${a.comissao_pct * 100}% sobre VGV de cobertura ${brl(a.vgv)} no Leilão Seleção Nelore Floc. Vinculado ao fechamento ${fechId}.`,
    tags: ['a-pagar', 'comissao', '2026', 'leilao', 'floc', slug.toLowerCase()], anexos: [],
  }
  const { data: exCp } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', doc).maybeSingle()
  if (exCp) { await sb.from('erp_contas_pagar').update({ ...cp, updated_at: new Date().toISOString() }).eq('id', exCp.id); console.log(`-> CP ATUALIZADA ${a.nome} ${brl(a.comissao)}`) }
  else { const { error } = await sb.from('erp_contas_pagar').insert(cp); if (error) throw new Error(error.message); console.log(`-> CP CRIADA ${a.nome} ${brl(a.comissao)} (${doc})`) }
}

console.log('\nConcluído.')
