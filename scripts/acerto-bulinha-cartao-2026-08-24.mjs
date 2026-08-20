/**
 * Acerto Bulinha x fatura de cartao de 24/08/2026.
 *
 * DECISAO DO JOAO (20/08): as duas faturas de cartao com debito automatico em 24/08
 * ABATEM o saldo de comissao devido ao Bulinha (Felipe Andrade).
 *
 * Base factual (conferida em erp_cartao_lancamentos antes de gravar):
 *   das 444 compras ja registradas nos cartoes da Bula, R$ 184.266,48 no total,
 *   TODAS tem portador "FELIPE V ANDRADE" (finais 6495, 3880 e 3883) — as unicas
 *   linhas com outro portador sao anuidade e seguro lancados em "CONTA" (R$ 294,79).
 *   Ou seja: gasto de cartao da Bula e gasto do Bulinha. Ja havia precedente — a
 *   comissao de junho (58.872,00) foi paga em julho "com desconto dos gastos dele
 *   no cartao da empresa", e este residual e a sobra daquele acerto.
 *
 * Contas envolvidas:
 *   CP  Fatura VISA 6495      venc 24/08   5.949,84
 *   CP  Fatura MASTERCARD     venc 24/08   1.380,13
 *                                        ----------
 *                             compensado  7.329,97
 *   CP  Saldo devido Bulinha  venc 27/07   7.392,00
 *                                        ----------
 *                             RESIDUAL       62,03
 *
 * O que faz:
 *   1) baixa PARCIAL do CP do Bulinha em 7.329,97 (forma 'cartao', data 24/08),
 *      status -> 'parcial', restando 62,03 em aberto e ainda retido por decisao
 *   2) anota as duas CP de cartao dizendo que o pagamento delas quita esse saldo,
 *      para o acerto ficar rastreavel dos dois lados
 *   3) marca as tres com a tag 'acerto-bulinha-cartao-2026-08'
 *
 * O que NAO faz, de proposito:
 *   - nao mexe no VALOR nem na DATA das faturas: elas sao debito real no banco em 24/08
 *   - nao cancela o CP do Bulinha: o residual de 62,03 continua devido
 *   - nao recategoriza as faturas: "Cartao de Credito" e a linha de CAIXA da fatura
 *     ([[erp-cartoes-credito-modulo]]); a despesa analitica vive nos lancamentos.
 *     A duplicidade que existia era de CAIXA (o ERP esperava 7.392 + 7.329,97 sairem),
 *     e e exatamente ela que a baixa parcial elimina.
 *
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const TAG = '[ACERTO BULINHA-CARTAO 20/08]'
const MARCA = 'acerto-bulinha-cartao-2026-08'
const DATA_ACERTO = '2026-08-24'
const DOC_BULINHA = 'acerto-bulinha:residual-julho-2026'
const DOC_CARTOES = ['sicoob17:cartao-visa-ago', 'sicoob17:cartao-master-ago']
const fmt = n => Number(n).toFixed(2).padStart(11)
const r2 = n => Math.round(Number(n) * 100) / 100
let erros = 0
const fail = (e, ctx) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }
const addTag = (tags, t) => Array.from(new Set([...(tags || []), t]))

/* ---------- 0) evidencia: quem e o portador dos cartoes ---------- */
let lan = [], i = 0
while (true) {
  const { data } = await sb.from('erp_cartao_lancamentos').select('portador,valor,tipo').range(i, i + 999)
  lan = lan.concat(data); if (data.length < 1000) break; i += 1000
}
const compras = lan.filter(l => Number(l.valor) > 0 && l.tipo === 'compra')
const doFelipe = compras.filter(l => /FELIPE/i.test(l.portador || ''))
const somaC = r2(compras.reduce((s, l) => s + Number(l.valor), 0))
const somaF = r2(doFelipe.reduce((s, l) => s + Number(l.valor), 0))
console.log('EVIDENCIA  compras no cartao: ' + compras.length + ' lancamentos, ' + fmt(somaC))
console.log('           com portador FELIPE V ANDRADE: ' + doFelipe.length + ' (' + r2(100 * somaF / somaC) + '%), ' + fmt(somaF))
console.log('')

/* ---------- 1) as tres contas ---------- */
const { data: cartoes } = await sb.from('erp_contas_pagar')
  .select('id,descricao,valor,valor_pago,vencimento,status,tags,observacoes')
  .in('numero_documento', DOC_CARTOES)
const { data: bul } = await sb.from('erp_contas_pagar')
  .select('id,descricao,valor,valor_pago,vencimento,status,tags,observacoes')
  .eq('numero_documento', DOC_BULINHA).single()

if (!bul) { console.error('CP do Bulinha nao encontrada (' + DOC_BULINHA + ')'); process.exit(1) }
if (!cartoes || cartoes.length !== 2) { console.error('esperava 2 CP de cartao, achei ' + (cartoes || []).length); process.exit(1) }

const compensa = r2(cartoes.reduce((s, c) => s + (Number(c.valor) - Number(c.valor_pago || 0)), 0))
const devido = r2(Number(bul.valor) - Number(bul.valor_pago || 0))
const residual = r2(devido - compensa)

for (const c of cartoes) console.log('CARTAO   ' + fmt(c.valor) + '  venc ' + c.vencimento + '  ' + c.descricao.slice(0, 56))
console.log('         ' + fmt(compensa) + '  = total a compensar')
console.log('BULINHA  ' + fmt(devido) + '  venc ' + bul.vencimento + '  ' + bul.descricao.slice(0, 56))
console.log('RESIDUAL ' + fmt(residual) + (residual < 0 ? '  ATENCAO: cartao maior que a divida' : ''))
console.log('')

if (residual < 0) {
  console.error('ABORTA: as faturas (' + fmt(compensa).trim() + ') sao maiores que o saldo devido ('
    + fmt(devido).trim() + '). Nesse caso o Bulinha e que passa a dever a Bula — decisao do Joao, nao do script.')
  process.exit(1)
}
if (bul.status === 'pago') { console.log('CP do Bulinha ja esta quitada. Nada a fazer.'); process.exit(0) }

/* ---------- 2) baixa parcial no CP do Bulinha ---------- */
const jaFeito = (bul.tags || []).includes(MARCA)
const novoPago = r2(Number(bul.valor_pago || 0) + compensa)
const novoStatus = Math.abs(novoPago - Number(bul.valor)) < 0.005 ? 'pago' : 'parcial'
const notaBul = TAG + ' Abatido pelas faturas de cartao com debito automatico em ' + DATA_ACERTO
  + ' (VISA 5.949,84 + MASTERCARD 1.380,13 = ' + compensa.toFixed(2) + '): o gasto do cartao e do proprio Felipe '
  + '(100% das compras dos cartoes da Bula tem portador FELIPE V ANDRADE), entao a Bula quita a divida pagando a fatura '
  + 'em vez de transferir para ele. Nao houve saida de caixa para o Felipe. Restam R$ ' + residual.toFixed(2)
  + ' em aberto, ainda retidos por decisao.'

if (jaFeito) console.log('BULINHA  = ja compensado antes (tag ' + MARCA + '), nao mexo')
else {
  console.log('BULINHA  ~ pago ' + fmt(bul.valor_pago || 0) + ' -> ' + fmt(novoPago) + ' | status ' + bul.status + ' -> ' + novoStatus + ' | resta ' + fmt(residual))
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').update({
      valor_pago: novoPago, status: novoStatus, data_pagamento: DATA_ACERTO,
      forma_pagamento: 'cartao', fornecedor_id: '623cf381-2714-404e-b96a-cd04b1e43af9',
      tags: addTag(bul.tags, MARCA),
      observacoes: ((bul.observacoes || '') + ' ' + notaBul).trim(),
    }).eq('id', bul.id)
    fail(error, 'baixa parcial Bulinha')
  }
}
console.log('')

/* ---------- 3) anotacao do outro lado ---------- */
for (const c of cartoes) {
  if ((c.tags || []).includes(MARCA)) { console.log('CARTAO   = ja anotado  ' + c.descricao.slice(0, 56)); continue }
  const nota = TAG + ' O pagamento desta fatura ABATE o saldo de comissao devido ao Bulinha (Felipe Andrade), '
    + 'titulo ' + DOC_BULINHA + ' (R$ ' + devido.toFixed(2) + '). Portador de 100% das compras do cartao e FELIPE V ANDRADE. '
    + 'As duas faturas de ' + DATA_ACERTO + ' somam R$ ' + compensa.toFixed(2) + ' e deixam R$ ' + residual.toFixed(2) + ' de residual. '
    + 'O valor e a data continuam valendo: e debito real no Sicoob.'
  console.log('CARTAO   ~ anotado ' + fmt(c.valor) + '  ' + c.descricao.slice(0, 52))
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').update({
      tags: addTag(c.tags, MARCA),
      observacoes: ((c.observacoes || '') + ' ' + nota).trim(),
    }).eq('id', c.id)
    fail(error, 'anotacao cartao')
  }
}
console.log('')

/* ---------- 4) conferencia ---------- */
if (APPLY) {
  const { data: dep } = await sb.from('erp_contas_pagar')
    .select('descricao,valor,valor_pago,status,tags')
    .in('numero_documento', [...DOC_CARTOES, DOC_BULINHA])
  let caixaEsperado = 0
  for (const c of dep) {
    const resta = r2(Number(c.valor) - Number(c.valor_pago || 0))
    const conta = !['pago', 'cancelado'].includes(c.status) && !(c.tags || []).includes('retido-por-decisao')
    caixaEsperado += conta ? resta : 0
    console.log('  ' + c.status.padEnd(8) + ' resta ' + fmt(resta) + (conta ? '  [entra no caixa]' : '  [fora do fluxo]') + '  ' + c.descricao.slice(0, 48))
  }
  console.log('')
  console.log('  Caixa a sair nas tres contas: ' + fmt(caixaEsperado) + '  (antes do acerto o ERP esperava ' + fmt(r2(compensa + devido)) + ')')
  console.log('  Duplicidade de caixa eliminada: ' + fmt(r2(compensa)))
}
console.log(APPLY ? (erros ? '*** ' + erros + ' erro(s) ***' : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.')
