/**
 * Conciliacao Sicoob 24/08 -> 25/08/2026.
 * Fonte: extrato PDF sicoob_2026_08_25_11_01_16.pdf (periodo 01/08 a 25/08, saldo final 33.726,22 C).
 * Continuacao de scripts/concilia-sicoob-2026-08-24.mjs (que fechou em 23.013,27).
 *
 * O extrato novo traz UM unico lancamento inedito:
 *   25/08  +10.712,95  PIX RECEB.OUTRA IF - PEDRO GUSTAVO DE BRITTO NOVIS
 *
 * Quem e: PEDRO GUSTAVO DE BRITTO NOVIS E OUTROS, CNPJ 29.141.206/0001-13,
 * e-mail adm_financeiro@fazendaguadalupe.com.br — a FAZENDA GUADALUPE.
 * Referente a: 1a parcela do acordo do 20o Leilao Guadalupe Agropecuaria
 * (21.425,90 em 2x de 10.712,95, 1a ate 25/08), fechado no WhatsApp em 20/08
 * e confirmado pelo chefe em 21/08. A parcela quita DOIS CR de 25/08:
 *   FEMEAS 18/07 (5% cobertura) parc. 1/2 ....... 3.000,00
 *   TOUROS 19/07 (0,5% faturamento) parc. 1/2 ... 7.712,95
 *                                              = 10.712,95  (valor exato do PIX)
 * A 2a parcela (25/09) continua aberta: 7.502,95 + 3.210,00 = 10.712,95.
 *
 * Regra de vinculo: 1 movimento : 1 titulo vincula em `conta_receber_id`.
 * 1 movimento : N titulos NAO vincula (a coluna e singular) — baixa os N,
 * marca o movimento conciliado e lista os titulos em `observacoes`.
 *
 * O que NAO se resolve aqui (segue como estava, decisao do Joao):
 *  - a entrada de 19.810,50 de 20/08 (acerto Bula Remates), ainda `classificado`,
 *    parcial contra Kriz 10.164,00 + Neloraco PO 25.155,00 = 35.319,00;
 *  - os 320,00 a favor do Douglas (lote 19 do Nelore Sorriso), sem titulo.
 *
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7' // Sicoob CC 1.056-1
const OBS = 'Extrato Sicoob 01-25/08/2026 (PDF sicoob_2026_08_25_11_01_16)'
const TAG = '[CONCILIADO 25/08]'
const SALDO_EXTRATO = 33726.22

const CAT_COMISSAO_LEILAO = 'e74434bd-3366-4015-9268-15d6640cf15f' // Comissao Leilao (receita) — a mesma dos CR
const PESSOA_PROGRAMA = 'cdfed41f-ff46-4519-8dff-10d8d8fccaa5'     // PROGRAMA LEILOES, cliente dos dois CR
const CR_FEMEAS = 'e09f0fde-f07a-4c1c-9ca8-81a6ad81ca11'           // 3.000,00
const CR_TOUROS = '6d4939ab-cbd4-492e-a4f3-615373ff5034'           // 7.712,95

const fmt = n => Number(n).toFixed(2).padStart(11)
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
let erros = 0
const fail = (e, ctx) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }

/* ------- o movimento novo, ja importado como PENDENTE pelo importador ------- */
const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,tipo,valor,descricao,documento,status_conciliacao')
  .eq('conta_bancaria_id', CONTA).eq('data', '2026-08-25')
const mov = (movs || []).find(m => m.tipo === 'entrada' && Math.abs(Number(m.valor) - 10712.95) < 0.005)
if (!mov) { console.error('FALTA o PIX de 25/08 (10.712,95) — rode o importador de extrato antes.'); process.exit(1) }

/* ---------- 1) baixa dos dois CR da 1a parcela Guadalupe ------------------- */
console.log('\n[1] 1a parcela do acordo Guadalupe (25/08, +10.712,95) — um PIX quita DOIS CR')
let somaCR = 0
for (const id of [CR_FEMEAS, CR_TOUROS]) {
  const { data: cr } = await sb.from('erp_contas_receber').select('id,descricao,valor,status,observacoes').eq('id', id).single()
  if (!cr) { console.log('  BAIXA ! CR ' + id + ' nao existe'); erros++; continue }
  somaCR += Number(cr.valor)
  if (cr.status === 'recebido') { console.log('  BAIXA = ja recebido ' + fmt(cr.valor) + '  ' + cr.descricao.slice(0, 62)); continue }
  console.log('  BAIXA ' + fmt(cr.valor) + '  ' + cr.descricao.slice(0, 66))
  if (APPLY) fail((await sb.from('erp_contas_receber').update({
    status: 'recebido', valor_recebido: cr.valor, data_recebimento: '2026-08-25',
    forma_recebimento: 'pix', conta_bancaria_id: CONTA,
    observacoes: ((cr.observacoes || '') + ' ' + TAG + ' Recebido no PIX unico de 25/08 de PEDRO GUSTAVO DE BRITTO NOVIS E OUTROS (Fazenda Guadalupe, CNPJ 29.141.206/0001-13): 10.712,95 = 3.000,00 (femeas 18/07) + 7.712,95 (touros 19/07). 1a das 2 parcelas do acordo de 21.425,90; a 2a vence 25/09.').trim(),
  }).eq('id', cr.id)).error, 'baixa CR ' + cr.descricao.slice(0, 24))
}
console.log('  soma dos CR ' + brl(somaCR) + ' x PIX 10.712,95 -> diferenca ' + brl(somaCR - 10712.95))

/* ---------- 2) classifica o movimento ------------------------------------- */
console.log('\n[2] Classificacao do movimento')
const nota = 'Comissao 20o Leilao Guadalupe Agropecuaria - 1a parcela do acordo (21.425,90 em 2x). Pagador: PEDRO GUSTAVO DE BRITTO NOVIS E OUTROS / Fazenda Guadalupe (CNPJ 29.141.206/0001-13). Quita 2 CR de 25/08: FEMEAS 18/07 3.000,00 (e09f0fde) + TOUROS 19/07 7.712,95 (6d4939ab). Sem vinculo 1:1 porque conta_receber_id e singular. 2a parcela (10.712,95) vence 25/09.'
console.log('  MOV ' + mov.data + ' ' + fmt(mov.valor) + ' -> conciliado  (' + mov.status_conciliacao + ' antes)')
if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
  categoria_id: CAT_COMISSAO_LEILAO, pessoa_id: PESSOA_PROGRAMA,
  status_conciliacao: 'conciliado', conciliado: true,
  observacoes: [OBS, nota].join(' | '),
}).eq('id', mov.id)).error, 'classifica ' + mov.data)

/* ---------- 3) o que segue em aberto -------------------------------------- */
console.log('\n[3] Guadalupe — o que resta')
const { data: resto } = await sb.from('erp_contas_receber')
  .select('descricao,valor,status,vencimento').ilike('descricao', '%GUADALUPE%').neq('status', 'cancelado').order('vencimento')
for (const c of resto || []) console.log('  ' + c.vencimento + ' ' + String(c.status).padEnd(10) + fmt(c.valor) + '  ' + c.descricao.slice(0, 62))

/* ---------- 4) validacao por saldo ---------------------------------------- */
console.log('\n[4] Validacao por saldo')
const { data: conta } = await sb.from('erp_contas_bancarias').select('saldo_atual,saldo_inicial').eq('id', CONTA).single()
let all = [], from = 0
for (;;) {
  const { data } = await sb.from('erp_movimentos_bancarios').select('tipo,valor').eq('conta_bancaria_id', CONTA).range(from, from + 999)
  all = all.concat(data || [])
  if (!data || data.length < 1000) break
  from += 1000
}
const net = all.reduce((s, m) => s + (m.tipo === 'entrada' ? 1 : m.tipo === 'saida' ? -1 : 0) * Number(m.valor), 0)
const calc = Number(conta.saldo_inicial) + net
console.log('  gravado ' + fmt(conta.saldo_atual) + ' | recalculado ' + fmt(calc) + ' | extrato ' + fmt(SALDO_EXTRATO))
console.log(Math.abs(calc - SALDO_EXTRATO) < 0.005 ? '  OK saldo bate com o extrato.' : '  ATENCAO diferenca de R$ ' + Math.abs(calc - SALDO_EXTRATO).toFixed(2))

console.log('\n' + (APPLY ? (erros ? '*** ' + erros + ' erro(s) ***' : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.'))
