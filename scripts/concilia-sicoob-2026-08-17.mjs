/**
 * Conciliacao Sicoob 11/08 -> 17/08/2026.
 * Fonte: extrato PDF sicoob_2026_08_17_16_11_48.pdf (periodo 01/08 a 17/08, saldo final 87.045,43 C).
 * Extracao validada contra os saldos diarios do proprio extrato (8/8 dias conferem).
 *
 * Faz:
 *  1) importa os 6 movimentos que faltavam (11/08, 14/08 e 17/08)
 *  2) baixa CP quitadas no extrato (ISSQN + 2 seguros)
 *  3) baixa CR do JMP 1a parcela (165.667,50 recebidos em 10/08)
 *  4) cria CP ja pagas dos debitos sem titulo (uniformes, reembolso Bula Remates, saldo Fabio)
 *  5) ajusta/cria as CP dos lancamentos FUTUROS agendados que o extrato mostra
 *  6) valida o saldo contra o extrato
 *
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7' // Sicoob CC 1.056-1
const OBS = 'Extrato Sicoob 01-17/08/2026 (PDF sicoob_2026_08_17_16_11_48)'
const TAG = '[CONCILIADO 17/08]'
const SALDO_EXTRATO = 87045.43

const CAT = {
  leilao: '562264eb-8134-4990-a56b-d884279acf90',    // Despesa Operacional Leilao
  reembolso: '6e79fd9e-f837-4ff4-a73d-3d8bdabe7ce7', // REEMBOLSO
  comissao: 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e',  // Comissao Funcionario
  imposto: '6d3270c8-2680-4cdd-a709-5b1520d1f430',   // Impostos e Taxas
  seguros: '4e96d8bf-f4f7-47d9-8d1b-f8035e7be97e',   // Seguros
  cartao: 'bd6c6ed1-054a-404c-ba21-08f424888c1f',    // Cartao de Credito
  terceiros: '1f72e05d-01ed-474b-bc83-90974be930f9', // Servicos de Terceiros
  comissaoLeilao: 'e74434bd-3366-4015-9268-15d6640cf15f', // receita Comissao Leilao
}
const fmt = n => Number(n).toFixed(2).padStart(11)
let erros = 0
const fail = (e, ctx) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }

/* ---------- 1) movimentos que faltavam ---------- */
const MOV = [
  ['2026-08-11', 'saida', 240.00, 'PIX EMITIDO OUTRA IF - 68.392.671 0001-89 - Entrada uniformes expogenetica', 'Pix', CAT.leilao],
  ['2026-08-14', 'saida', 5026.34, 'TRANSF. PIX SICOOB - FAV.: BULA REMATES LTDA - Ref reembolso Bula Remates reemissao passagens', '2999250', CAT.reembolso],
  ['2026-08-14', 'saida', 3834.00, 'PIX EMITIDO OUTRA IF - 59.791.094 0001-07 - Ref saldo restante comissao junho (FABIO OMENA)', 'Pix', CAT.comissao],
  ['2026-08-17', 'saida', 24524.81, 'DEB.CONV.PREFEITURA - Ref ISSQN (guia SEFAZ Campo Grande)', '2996828', CAT.imposto],
  ['2026-08-17', 'saida', 122.60, 'DEB. CONV. SEGUROS - SICOOB SEG', 'SICOOB SEG', CAT.seguros],
  ['2026-08-17', 'saida', 62.04, 'DEB. CONV. SEGUROS - SICOOB SEG', 'SICOOB SEG', CAT.seguros],
]
const { data: jaTemMov } = await sb.from('erp_movimentos_bancarios')
  .select('import_key').eq('conta_bancaria_id', CONTA).gte('data', '2026-08-10')
const chaves = new Set((jaTemMov || []).map(m => m.import_key))
const movId = {}
let novos = 0
for (const [data, tipo, valor, descricao, documento, categoria_id] of MOV) {
  const key = 'csv:' + crypto.createHash('sha1')
    .update([CONTA, data, tipo, valor.toFixed(2), descricao].join('|')).digest('hex').slice(0, 24)
  if (chaves.has(key)) { console.log('MOV = ja existe  ' + data + fmt(valor) + '  ' + descricao.slice(0, 60)); continue }
  novos++
  console.log('MOV + ' + data + ' ' + tipo.padEnd(7) + fmt(valor) + '  ' + descricao.slice(0, 74))
  if (APPLY) {
    const { data: ins, error } = await sb.from('erp_movimentos_bancarios').insert({
      conta_bancaria_id: CONTA, data, tipo, valor, descricao, documento, categoria_id,
      origem: 'importacao_csv', observacoes: OBS, import_key: key,
      conciliado: true, status_conciliacao: 'classificado',
    }).select('id').single()
    fail(error, 'mov ' + descricao.slice(0, 30))
    if (ins) movId[valor.toFixed(2) + '@' + data] = ins.id
  }
}
console.log('-> ' + novos + ' movimentos novos')
console.log('')

/* ---------- 2) baixa das CP quitadas no extrato ---------- */
const baixasCP = [
  { like: '%ISSQN ref. julho/2026%', venc: '2026-08-17', pgto: '2026-08-17', mov: '24524.81@2026-08-17',
    nota: 'Debito automatico DEB.CONV.PREFEITURA em 17/08 (doc 2996828), R$ 24.524,81 - valor exato da guia.' },
  { like: 'Seguro Sicoob (deb. automatico 17/08)', venc: '2026-08-17', pgto: '2026-08-17', valor: 62.04, mov: '62.04@2026-08-17',
    nota: 'Debito automatico DEB. CONV. SEGUROS (SICOOB SEG) em 17/08.' },
  { like: 'Seguro Sicoob (deb. automatico 17/08)', venc: '2026-08-17', pgto: '2026-08-17', valor: 122.60, mov: '122.60@2026-08-17',
    nota: 'Debito automatico DEB. CONV. SEGUROS (SICOOB SEG) em 17/08.' },
]
for (const b of baixasCP) {
  let qb = sb.from('erp_contas_pagar').select('id,descricao,valor,valor_pago,status,observacoes')
    .eq('vencimento', b.venc).neq('status', 'pago')
  qb = b.valor != null ? qb.eq('descricao', b.like).eq('valor', b.valor) : qb.ilike('descricao', b.like)
  const { data: cps } = await qb
  if (!cps || !cps.length) { console.log('BAIXA CP ! nao encontrada: ' + b.like + ' ' + (b.valor == null ? '' : b.valor)); continue }
  for (const cp of cps) {
    console.log('BAIXA CP ' + fmt(cp.valor) + '  ' + cp.descricao.slice(0, 66))
    if (APPLY) {
      const { error } = await sb.from('erp_contas_pagar').update({
        status: 'pago', valor_pago: cp.valor, data_pagamento: b.pgto, conta_bancaria_id: CONTA,
        observacoes: ((cp.observacoes || '') + ' ' + TAG + ' ' + b.nota).trim(),
      }).eq('id', cp.id)
      fail(error, 'baixa CP ' + cp.descricao.slice(0, 24))
      if (movId[b.mov]) {
        const { error: e2 } = await sb.from('erp_movimentos_bancarios')
          .update({ conta_pagar_id: cp.id, conciliado: true, status_conciliacao: 'conciliado' })
          .eq('id', movId[b.mov])
        fail(e2, 'vinculo mov->CP')
      }
    }
  }
}
console.log('')

/* ---------- 3) baixa do CR JMP 1a parcela (165.667,50 em 10/08) ---------- */
const DOC_JMP = ['BULA-2026-CR-JMP-FEMEAS-20260613-P1', 'BULA-2026-CR-JMP-TOUROS-20260614-P1']
const { data: crJmp } = await sb.from('erp_contas_receber')
  .select('id,descricao,valor,valor_recebido,status,observacoes').in('numero_documento', DOC_JMP)
let somaJmp = 0
for (const cr of crJmp || []) {
  if (cr.status === 'recebido') { console.log('BAIXA CR = ja recebido  ' + cr.descricao.slice(0, 60)); continue }
  somaJmp += Number(cr.valor)
  console.log('BAIXA CR ' + fmt(cr.valor) + '  ' + cr.descricao.slice(0, 66))
  if (APPLY) {
    const { error } = await sb.from('erp_contas_receber').update({
      status: 'recebido', valor_recebido: cr.valor, data_recebimento: '2026-08-10',
      forma_recebimento: 'pix', conta_bancaria_id: CONTA,
      observacoes: ((cr.observacoes || '') + ' ' + TAG + ' PIX RECEBIDO de JBJ AGROPECUARIA LTDA (15.689.716/0001-15) em 10/08/2026: R$ 165.667,50 = 1a parcela do 10o Leilao Nelore JMP (Femeas 58.484,00 + Touros 107.183,50). 2a parcela vence 13/09.').trim(),
    }).eq('id', cr.id)
    fail(error, 'baixa CR ' + cr.descricao.slice(0, 24))
  }
}
if (somaJmp) console.log('  soma JMP conferida: ' + fmt(somaJmp) + '  (extrato: 165.667,50)')
if (APPLY && somaJmp) {
  const { data: mvJmp } = await sb.from('erp_movimentos_bancarios').select('id')
    .eq('conta_bancaria_id', CONTA).eq('data', '2026-08-10').eq('valor', 165667.5).limit(1)
  if (mvJmp && mvJmp.length) {
    const { error } = await sb.from('erp_movimentos_bancarios').update({
      conta_receber_id: (crJmp || [])[0].id, conciliado: true, status_conciliacao: 'conciliado',
      categoria_id: CAT.comissaoLeilao,
      observacoes: OBS + ' | ' + TAG + ' 1a parcela JMP (2 CR: Femeas 58.484,00 + Touros 107.183,50).',
    }).eq('id', mvJmp[0].id)
    fail(error, 'vinculo mov JMP')
  }
}
console.log('')

/* ---------- 4) CP novas ja pagas (debitos sem titulo no ERP) ---------- */
const novasPagas = [
  { doc: 'sicoob17:uniformes-expo', descricao: 'ENTRADA UNIFORMES EXPOGENETICA - 68.392.671/0001-89',
    valor: 240.00, venc: '2026-08-11', pgto: '2026-08-11', cat: CAT.leilao,
    tags: ['a-pagar', 'agosto', 'leilao', 'expogenetica'],
    nota: 'Lancado na conciliacao do extrato 01-17/08: PIX de 11/08 sem titulo correspondente no ERP.' },
  { doc: 'sicoob17:reemb-remates-passagens', descricao: 'REEMBOLSO BULA REMATES - reemissao de passagens (Expogenetica)',
    valor: 5026.34, venc: '2026-08-14', pgto: '2026-08-14', cat: CAT.reembolso,
    pessoa: '0e458050-bf86-4c52-9a4e-a06d0b94a386',
    tags: ['a-pagar', 'agosto', 'reembolso', 'expogenetica'],
    nota: 'TRANSF. PIX SICOOB de 14/08 (doc 2999250) FAV.: BULA REMATES LTDA. Sem titulo previo no ERP.' },
  { doc: 'sicoob17:fabio-saldo-comissao-junho', descricao: 'COMISSAO JUNHO/2026 - saldo restante - FABIO OMENA (FO ASSESSORIA)',
    valor: 3834.00, venc: '2026-08-14', pgto: '2026-08-14', cat: CAT.comissao,
    tags: ['a-pagar', 'comissao', '2026', 'junho'],
    nota: 'PIX de 14/08 "Ref saldo restante comissao junho". As 13 CP de comissao de junho do Fabio ja somavam R$ 60.645,00 (baixadas em 10/08) - este e um saldo ADICIONAL. CONFERIR com a Ana qual leilao de junho o originou.' },
]
for (const n of novasPagas) {
  const { data: ja } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', n.doc).limit(1)
  if (ja && ja.length) { console.log('CP  = ja existe  ' + n.descricao.slice(0, 60)); continue }
  console.log('CP  + pago ' + fmt(n.valor) + '  ' + n.descricao.slice(0, 62))
  if (APPLY) {
    const { data: ins, error } = await sb.from('erp_contas_pagar').insert({
      descricao: n.descricao, valor: n.valor, valor_pago: n.valor,
      emissao: n.venc, vencimento: n.venc, data_pagamento: n.pgto, status: 'pago',
      categoria_id: n.cat, fornecedor_id: n.pessoa || null, conta_bancaria_id: CONTA,
      forma_pagamento: 'pix', numero_documento: n.doc, tags: n.tags,
      observacoes: TAG + ' ' + n.nota,
    }).select('id').single()
    fail(error, 'CP nova ' + n.descricao.slice(0, 24))
    const k = n.valor.toFixed(2) + '@' + n.venc
    if (ins && movId[k]) {
      const { error: e2 } = await sb.from('erp_movimentos_bancarios')
        .update({ conta_pagar_id: ins.id, conciliado: true, status_conciliacao: 'conciliado' }).eq('id', movId[k])
      fail(e2, 'vinculo mov->CP nova')
    }
  }
}
console.log('')

/* ---------- 5) lancamentos FUTUROS agendados (bloco do extrato) ---------- */
const ajustes = [
  { like: 'Simples Nacional (DAS) ref. julho/2026%', venc: '2026-08-20',
    set: { valor: 55846.64, descricao: 'Simples Nacional (DAS) ref. julho/2026 - deb. agendado 20/08 (doc 2996829)',
      tags: ['a-pagar', 'imposto', '2026', 'julho'] },
    nota: 'Valor CONFIRMADO pelo bloco "Lancamentos futuros" do extrato de 17/08: R$ 55.846,64 (era estimativa de R$ 56.000,00). Deixa de ser orcamento.' },
  { like: 'BILHETE/BOLETO 22/08 - FABIO OMENA GAIA', venc: '2026-08-22',
    set: { vencimento: '2026-08-21', descricao: 'BILHETE/BOLETO - FABIO OMENA GAIA (viagem Expogenetica)' },
    nota: 'Extrato agenda o PIX de R$ 6.178,45 para 21/08 a 22.002.438/0001-41 "Ref viagens Fabio e Leonardo expogenetica" = 4.196,87 (Fabio) + 1.981,58 (Leonardo). Vencimento corrigido de 22/08 para 21/08.' },
  { like: 'BILHETE/BOLETO 22/08 - LEONARDO FRANCISCO', venc: '2026-08-22',
    set: { vencimento: '2026-08-21', descricao: 'BILHETE/BOLETO - LEONARDO FRANCISCO (viagem Expogenetica)' },
    nota: 'Extrato agenda o PIX de R$ 6.178,45 para 21/08 a 22.002.438/0001-41 "Ref viagens Fabio e Leonardo expogenetica" = 4.196,87 (Fabio) + 1.981,58 (Leonardo). Vencimento corrigido de 22/08 para 21/08.' },
]
for (const a of ajustes) {
  const { data: cps } = await sb.from('erp_contas_pagar').select('id,descricao,valor,observacoes,status')
    .ilike('descricao', a.like).eq('vencimento', a.venc).neq('status', 'pago')
  if (!cps || !cps.length) { console.log('CP  ! ajuste nao encontrado: ' + a.like); continue }
  for (const cp of cps) {
    console.log('CP  ~ ' + fmt(cp.valor) + ' -> ' + JSON.stringify(a.set).slice(0, 66) + '  | ' + cp.descricao.slice(0, 40))
    if (APPLY) {
      const { error } = await sb.from('erp_contas_pagar')
        .update(Object.assign({}, a.set, { observacoes: ((cp.observacoes || '') + ' ' + TAG + ' ' + a.nota).trim() }))
        .eq('id', cp.id)
      fail(error, 'ajuste CP ' + cp.descricao.slice(0, 24))
    }
  }
}
const futuras = [
  { doc: 'sicoob17:marcas-remat-1', descricao: 'REMAT - deferimento de marcas (1o pagamento) - deb. agendado 20/08',
    valor: 495.00, venc: '2026-08-20', cat: CAT.terceiros, tags: ['a-pagar', 'agosto', 'agendado'] },
  { doc: 'sicoob17:cartao-visa-ago', descricao: 'Fatura cartao VISA (DEB.CONV.DEM.EMPRES / DBAUTO VIS) - deb. agendado 24/08',
    valor: 5949.84, venc: '2026-08-24', cat: CAT.cartao, tags: ['a-pagar', 'agosto', 'agendado', 'cartao'] },
  { doc: 'sicoob17:cartao-master-ago', descricao: 'Fatura cartao MASTERCARD (DEB.CONV.DEM.EMPRES) - deb. agendado 24/08',
    valor: 1380.13, venc: '2026-08-24', cat: CAT.cartao, tags: ['a-pagar', 'agosto', 'agendado', 'cartao'] },
  { doc: 'sicoob17:seguro-6204-set', descricao: 'Seguro Sicoob (deb. automatico 15/09)',
    valor: 62.04, venc: '2026-09-15', cat: CAT.seguros, tags: ['a-pagar', 'setembro', 'agendado'] },
  { doc: 'sicoob17:seguro-12260-set', descricao: 'Seguro Sicoob (deb. automatico 15/09)',
    valor: 122.60, venc: '2026-09-15', cat: CAT.seguros, tags: ['a-pagar', 'setembro', 'agendado'] },
]
for (const n of futuras) {
  const { data: ja } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', n.doc).limit(1)
  if (ja && ja.length) { console.log('CP  = ja existe  ' + n.descricao.slice(0, 60)); continue }
  console.log('CP  + ' + fmt(n.valor) + '  venc ' + n.venc + '  ' + n.descricao.slice(0, 58))
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').insert({
      descricao: n.descricao, valor: n.valor, emissao: '2026-08-17', vencimento: n.venc, status: 'aberto',
      categoria_id: n.cat, conta_bancaria_id: CONTA, numero_documento: n.doc, tags: n.tags,
      observacoes: TAG + ' Debito agendado, confirmado no bloco "Lancamentos futuros" do extrato de 17/08/2026.',
    })
    fail(error, 'CP futura ' + n.descricao.slice(0, 24))
  }
}
console.log('')

/* ---------- 6) validacao por saldo ---------- */
const { data: conta } = await sb.from('erp_contas_bancarias').select('saldo_atual,saldo_inicial').eq('id', CONTA).single()
let all = [], from = 0
while (true) {
  const { data } = await sb.from('erp_movimentos_bancarios').select('tipo,valor').eq('conta_bancaria_id', CONTA).range(from, from + 999)
  all = all.concat(data)
  if (data.length < 1000) break
  from += 1000
}
const net = all.reduce((s, m) => s + (m.tipo === 'entrada' ? 1 : m.tipo === 'saida' ? -1 : 0) * Number(m.valor), 0)
const calc = Number(conta.saldo_inicial) + net
console.log('SALDO  gravado ' + fmt(conta.saldo_atual) + ' | recalculado ' + fmt(calc) + ' | extrato ' + fmt(SALDO_EXTRATO))
const diff = Math.abs(calc - SALDO_EXTRATO)
if (diff < 0.005) console.log('OK  saldo bate com o extrato.')
else if (APPLY) console.log('ATENCAO diferenca de R$ ' + diff.toFixed(2))
else console.log('dry-run: diferenca esperada de R$ ' + diff.toFixed(2) + ' (soma dos 6 movimentos ainda nao gravados)')
console.log(APPLY ? (erros ? '*** ' + erros + ' erro(s) ***' : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.')
