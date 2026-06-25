// Integração da planilha financeira de JUNHO/2026 (fonte oficial) no ERP.
//
// Concilia cada leilão de junho da planilha (receita + status) com o ERP:
//  - alinha receita/faturamento de fechamentos existentes ao valor oficial;
//  - cria contas a receber faltantes (provisão) com a receita/leiloeira corretas;
//  - aplica status (RECEBIDO -> recebido; A RECEBER -> aberto);
//  - vincula contas a receber ao fechamento (fechamento_id) quando há;
//  - ajusta cliente_id (leiloeira) das CRs "EXTRA" sem leiloeira.
//
// Conciliação BANCÁRIA (erp_movimentos_bancarios): NÃO há, no extrato importado
// (jun/jul), créditos batendo com as receitas de leilão -> nada a conciliar com
// banco agora (as comissões ainda não caíram na conta). Não se inventa movimento.
//
// Decisões (delegadas pelo cliente em 25/06/2026):
//  - Santa Nice: vale a RECEITA oficial da planilha (R$ 15.030), não 5%×529.500.
//  - Matinha: vendas oficiais R$ 150.600 (R$ 45.000 de cobertura adicional não
//    detalhada entram como 1 lance placeholder, sem comissão); receita R$ 7.530.
//
// Uso: DRY_RUN=1 node scripts/integra-financeiro-junho-2026.mjs
//      (sem DRY_RUN grava em produção)
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
const now = () => new Date().toISOString()

const CAT_RECEITA = 'e74434bd-3366-4015-9268-15d6640cf15f' // Comissao Leilao
const LEILOEIRA = {
  PROGRAMA: 'cdfed41f-ff46-4519-8dff-10d8d8fccaa5',
  REMATES: '0e458050-bf86-4c52-9a4e-a06d0b94a386', // Bula Remates
  AGRESTE: '8720c854-fd20-466f-98d6-5e6dffc1a2da', // Agreste Leiloes
}
// fechamentos existentes (junho)
const FECH = {
  cachoeirao: '9e017caf-8899-4852-99a5-d506bb5905b6',
  santaNice: '982e286e-7741-480a-bfc9-cf01f7f428ce',
  flor: 'dd10dd7d-f4d1-4656-ba07-175c4ea3b81e',
  terraBrava: '8d6ac3ae-4e38-4120-a49c-eafbc09c507f',
  matinha: '2ffd63ed-ee77-49cf-afc2-8fe077c9550e',
}

const log = []
const note = (s) => { log.push(s); console.log(s) }

// ---------- helpers de update ----------
async function updFechamento(id, patch, label) {
  if (DRY_RUN) { note(`[fech] ${label}: ${JSON.stringify(patch)}`); return }
  const { error } = await sb.from('bula_leilao_fechamento').update({ ...patch, updated_at: now() }).eq('id', id)
  if (error) throw new Error(`fech ${label}: ${error.message}`)
  note(`[fech] ${label} atualizado`)
}
async function updCRByDoc(doc, patch, label) {
  const { data: ex } = await sb.from('erp_contas_receber').select('id').eq('numero_documento', doc).maybeSingle()
  if (!ex) { note(`[CR] ${label}: doc ${doc} NÃO encontrado — pulado`); return null }
  if (DRY_RUN) { note(`[CR] ${label}: ${JSON.stringify(patch)}`); return ex.id }
  const { error } = await sb.from('erp_contas_receber').update({ ...patch, updated_at: now() }).eq('id', ex.id)
  if (error) throw new Error(`CR ${label}: ${error.message}`)
  note(`[CR] ${label} atualizado -> ${JSON.stringify(patch)}`)
  return ex.id
}
async function upsertCR(doc, payload, label) {
  const { data: ex } = await sb.from('erp_contas_receber').select('id').eq('numero_documento', doc).maybeSingle()
  if (DRY_RUN) { note(`[CR+] ${label}: ${ex ? 'ATUALIZA' : 'CRIA'} ${brl(payload.valor)} (${payload.status})`); return }
  if (ex) { const { error } = await sb.from('erp_contas_receber').update({ ...payload, updated_at: now() }).eq('id', ex.id); if (error) throw new Error(`CR ${label}: ${error.message}`); note(`[CR+] ${label} ATUALIZADA ${brl(payload.valor)}`) }
  else { const { error } = await sb.from('erp_contas_receber').insert(payload); if (error) throw new Error(`CR ${label}: ${error.message}`); note(`[CR+] ${label} CRIADA ${brl(payload.valor)}`) }
}

note(DRY_RUN ? '*** DRY RUN ***' : '*** GRAVANDO EM PRODUÇÃO ***')

// ===================== 1) MATINHA: vendas 150.600 / receita 7.530 =====================
{
  const PARCELAS = 30
  const lots = [
    { lote: 'bateria 13', parcela: 560, animais: 5, vgv: 84000, assessor: 'Fábio Omena', empresa: 'Bula Assessoria', comprador: 'GR Agropecuária - Guy Rangel', fazenda: 'GR Agropecuária', cidade: 'Tucuruí', uf: 'PA' },
    { lote: '26', parcela: 720, animais: 1, vgv: 21600, assessor: 'Lucas Martins', empresa: 'Bula Assessoria', comprador: 'Não informado (lote 26)', fazenda: 'Não informada', cidade: 'Não informada', uf: 'PA' },
    { lote: '—', parcela: null, animais: 0, vgv: 45000, assessor: 'Não informado', empresa: 'Bula Assessoria', comprador: 'Cobertura adicional (não detalhada na planilha)', fazenda: '—', cidade: '—', uf: 'NI' },
  ]
  const PCT = { 'Fábio Omena': 0.03, 'Lucas Martins': 0.02, 'Não informado': 0 }
  const vgv_total = 150600, animais = 6, receita = 7530
  const byA = new Map()
  for (const l of lots) { const c = byA.get(l.assessor) || { nome: l.assessor, empresa: l.empresa, transacoes: 0, animais: 0, vgv: 0 }; c.transacoes++; c.animais += l.animais; c.vgv += l.vgv; byA.set(l.assessor, c) }
  const por_assessor = [...byA.values()].sort((a, b) => b.vgv - a.vgv).map((a, i) => ({ posicao: i + 1, nome: a.nome, empresa: a.empresa, transacoes: a.transacoes, animais: a.animais, vgv: a.vgv, ticket_medio: a.animais ? Math.round(a.vgv / a.animais) : 0, pct_total: r2(a.vgv / vgv_total * 100) / 100, comissao_pct: PCT[a.nome] ?? 0, comissao: r2(a.vgv * (PCT[a.nome] ?? 0)) }))
  const comissao_assessoria = r2(por_assessor.reduce((s, a) => s + a.comissao, 0))
  const sobra_bruta = r2(receita - comissao_assessoria)
  const compradores = lots.map((l, i) => ({ rank: i + 1, comprador: l.comprador, fazenda: l.fazenda, cidade: l.cidade, uf: l.uf, lotes: 1, animais: l.animais, vgv: l.vgv }))
  const por_estado = [
    { uf: 'PA', estado: 'Pará', lotes: 2, animais: 6, vgv: 105600, pct_total: r2(105600 / vgv_total * 100) / 100, ticket_medio: Math.round(105600 / 6) },
    { uf: 'NI', estado: 'Não informado', lotes: 1, animais: 0, vgv: 45000, pct_total: r2(45000 / vgv_total * 100) / 100, ticket_medio: 0 },
  ]
  const observacoes = [
    'Fechamento parcial (cobertura Bula) — Leilão Virtual Touros Matinha (21/06/2026), Programa Leilões / Canal Rural, 220 touros.',
    'VENDAS BULA oficiais (planilha financeira): R$ 150.600. Itemizado nas mensagens: bateria 13 (5 touros, Fábio Omena) + lote 26 (Lucas Martins) = R$ 105.600.',
    'Diferença de R$ 45.000 = cobertura adicional não detalhada nas mensagens (lance placeholder, sem assessor/comissão).',
    'Acordo: 0,33% do faturamento + 5% da venda. Provisionado 5% da venda = R$ 7.530,00; 0,33% do faturamento total pendente da leiloeira.',
    `Comissão de assessoria: ${brl(comissao_assessoria)} (Fábio Omena 3%; Lucas Martins 2%). Condição assumida 30 parcelas.`,
  ].join('\n')
  await updFechamento(FECH.matinha, {
    lotes_ofertados: 3, lotes_vendidos: 3, animais_vendidos: animais,
    vgv_total, ticket_medio: Math.round(vgv_total / animais), maior_lance: 84000,
    compradores_unicos: compradores.length, estados_alcancados: por_estado.length,
    por_assessor, por_estado, compradores,
    lances: lots.map((l) => ({ lote: l.lote, animais: l.animais, vgv: l.vgv, parcela: l.parcela, parcelas: l.parcela ? PARCELAS : null, assessor: l.assessor, empresa: l.empresa, vendedor: 'Rancho da Matinha', comprador: `${l.comprador} · ${l.fazenda} · ${l.cidade}/${l.uf}` })),
    receita_bula: receita, comissao_assessoria, sobra_bruta, observacoes,
  }, 'Matinha 150.600/7.530')
  await updCRByDoc('BULA-2026-CR-MATINHA-VIRTUAL-20260621', {
    valor: receita, fechamento_id: FECH.matinha,
    observacoes: `Provisão = 5% da venda oficial (R$ 150.600) = ${brl(receita)}. 0,33% do faturamento total pendente. Vinculado ao fechamento ${FECH.matinha}.`,
  }, 'Matinha CR 7.530 + link')
}

// ===================== 2) SANTA NICE: receita oficial 15.030 =====================
{
  const { data: sn } = await sb.from('bula_leilao_fechamento').select('comissao_assessoria').eq('id', FECH.santaNice).maybeSingle()
  const sobra = sn ? r2(15030 - Number(sn.comissao_assessoria || 0)) : null
  await updFechamento(FECH.santaNice, {
    receita_bula: 15030, sobra_bruta: sobra,
    observacoes: 'Leilão Matrizes Santa Nice 2026 (06/06/2026), Programa Leilões. RECEITA oficial (planilha financeira) = R$ 15.030,00. Obs: a base comissionável efetiva (5%) foi ~R$ 300.600, e não os R$ 529.500 de venda bruta — diferença por co-corretagem/divisão. A receber.',
  }, `Santa Nice 15.030 (sobra ${brl(sobra)})`)
}
await updCRByDoc('BULA-2026-CR-WPP-SANTA-NICE-20260606', {
  valor: 15030, fechamento_id: FECH.santaNice,
  observacoes: 'Receita oficial (planilha financeira) = R$ 15.030,00 (5% sobre base comissionável ~R$ 300.600). A receber.',
}, 'Santa Nice CR 15.030')

// ===================== 3) FLOR DO ARATAU: 11.346 + RECEBIDO =====================
await updFechamento(FECH.flor, {
  faturamento_total_leilao: 1134600, receita_bula: 11346,
}, 'Flor faturamento 1.134.600 / receita 11.346')
await updCRByDoc('BULA-2026-CR-WPP-FLOR-DO-ARATAU-20260607', {
  valor: 11346, valor_recebido: 11346, status: 'recebido', cliente_id: LEILOEIRA.REMATES,
  observacoes: 'Receita oficial (planilha): 1% do faturamento R$ 1.134.600 = R$ 11.346,00. RECEBIDO.',
}, 'Flor CR 11.346 recebido')

// ===================== 4) CACHOEIRÃO: alinhar fechamento ao oficial =====================
await updFechamento(FECH.cachoeirao, {
  faturamento_total_leilao: 1091400, receita_bula: 10914,
}, 'Cachoeirão faturamento 1.091.400 / receita 10.914')
await updCRByDoc('BULA-2026-CR-EXTRA-DESTAQUE-SAFRA-N', {
  cliente_id: LEILOEIRA.REMATES, fechamento_id: FECH.cachoeirao,
}, 'Cachoeirão CR set leiloeira + link')

// ===================== 5) TRESMAR (Elite da Prova): set leiloeira =====================
await updCRByDoc('BULA-2026-CR-EXTRA-ELITE-DA-PROVA-T', { cliente_id: LEILOEIRA.REMATES }, 'Tresmar CR set leiloeira')

// ===================== 6) TERRA BRAVA: vincular CR ao fechamento =====================
await updCRByDoc('BULA-2026-CR-TERRABRAVA-PROVADOS-JUNHO-2026', { fechamento_id: FECH.terraBrava }, 'Terra Brava CR link')

// ===================== 7) CRs FALTANTES (provisão a receber) =====================
const novos = [
  { doc: 'BULA-2026-CR-KATAYAMA-TRILOGIA-JUNHO-2026', desc: 'KATAYAMA TRILOGIA (1-2/06) - COMISSAO BULA', leiloeira: 'AGRESTE', valor: 3040, emissao: '2026-06-02', obs: 'Provisão: 5% da venda Bula (R$ 60.800) = R$ 3.040,00. Dias 1-2/06 da Trilogia (Agreste). A receber.' },
  { doc: 'BULA-2026-CR-SANTA-NAZARE-20260609', desc: 'LEILAO NELORE SANTA NAZARE (09/06) - COMISSAO BULA', leiloeira: 'PROGRAMA', valor: 15044, emissao: '2026-06-09', obs: 'Provisão: 3% da venda (R$ 84.000 = R$ 2.520) + 1% do faturamento (R$ 1.252.400 = R$ 12.524) = R$ 15.044,00. A receber.' },
  { doc: 'BULA-2026-CR-MEAB-FAZ-MODELO-20260623', desc: 'LEILAO MEAB E FAZENDA MODELO (23/06) - COMISSAO BULA', leiloeira: 'REMATES', valor: 25170, emissao: '2026-06-23', obs: 'Provisão: 2% do faturamento (R$ 1.258.500) = R$ 25.170,00. A receber.' },
  { doc: 'BULA-2026-CR-RS-AGROPECUARIA-20260623', desc: 'LEILAO RS AGROPECUARIA (23/06) - COMISSAO BULA', leiloeira: 'PROGRAMA', valor: 8775, emissao: '2026-06-23', obs: 'Provisão: 5% da venda Bula (R$ 175.500) = R$ 8.775,00. A receber.' },
]
for (const n of novos) {
  await upsertCR(n.doc, {
    descricao: n.desc, cliente_id: LEILOEIRA[n.leiloeira], categoria_id: CAT_RECEITA,
    valor: n.valor, valor_recebido: 0, emissao: n.emissao, vencimento: addDays(n.emissao, 45), status: 'aberto',
    numero_documento: n.doc, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
    observacoes: n.obs, tags: ['leilao', '2026', 'junho', 'comissao', 'provisao'], anexos: [],
  }, n.desc)
}

note('\n--- Conciliação bancária ---')
note('Sem créditos no extrato importado (erp_movimentos_bancarios, jun/jul) batendo com as receitas de leilão — nada a conciliar com banco agora.')
note(DRY_RUN ? '\n[DRY_RUN] nada gravado.' : '\nConcluído.')
