/**
 * Conciliacao Sicoob 07/08 (2 faltantes) + 10/08 + 11/08 de 2026.
 * Fonte: extrato lido no internet banking em 11/08/2026.
 *
 * Faz:
 *  1) importa os movimentos que faltavam (dedup por import_key)
 *  2) baixa os CP quitados que aparecem no extrato
 *  3) corrige o CP estimado de casa Expogenetica (2.000 ja pagos em 11/08)
 *  4) cancela o reembolso estimado do Fabio (pago de verdade em 07/08)
 *  5) recalcula saldo_atual da conta Sicoob
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
const OBS = 'Extrato Sicoob lido no internet banking em 11/08/2026'

const MOV = [
  // --- 07/08 (faltavam no ERP; explicam a diferenca de 10.149,31) ---
  ['2026-08-07', 'saida',   4008.21, 'PIX EMITIDO OUTRA IF - 59.791.094 0001-07 - Ref Reembolsos Fabio Omena', 'Pix'],
  ['2026-08-07', 'saida',   6141.10, 'DEB.TRANSF.CONTAS DIF.TIT. INTERCREDIS - FAV.: LEONARDO SERAFIM FRANCISCO LTDA - Ref Reembolsos Leonardo', '2980207'],
  // --- 10/08 ---
  ['2026-08-10', 'saida',     39.00, 'DEB.PARCELAS SUBSC./INTEGR.', '46026'],
  ['2026-08-10', 'saida',    129.90, 'DEBITO PACOTE SERVICOS', '129'],
  ['2026-08-10', 'saida',   1648.57, 'PIX EMITIDO OUTRA IF - 65.565.807 0001-17 - Ref restante reembolso gastos no cartao', 'Pix'],
  ['2026-08-10', 'saida',   2700.00, 'PIX EMITIDO OUTRA IF - Ref diarias Matheus M1', 'Pix'],
  ['2026-08-10', 'saida',  20215.00, 'PIX EMITIDO OUTRA IF - 59.791.094 0001-07 - Ref restante Comissao Junho 2026 nfs 28 (FABIO OMENA)', 'Pix'],
  ['2026-08-10', 'saida',  29535.00, 'DEB.TRANSF.CONTAS DIF.TIT. INTERCREDIS - FAV.: RUSA ASSESSORIA PECUARIA LTDA - Ref Comissao Rusa Julho 2026 NF 34', '2988093'],
  ['2026-08-10', 'entrada', 165667.50, 'PIX RECEBIDO - OUTRA IF - JBJ AGROPECUARIA LTDA - 15.689.716 0001-15', 'Pix'],
  ['2026-08-10', 'saida',   3500.00, 'PIX EMITIDO OUTRA IF - 13.347.016 0001-17 - Ref campanha Trafego Pago patrocinado', 'Pix'],
  ['2026-08-10', 'saida',     39.00, 'PIX EMITIDO OUTRA IF - 21.986.213 0001-04', 'Pix'],
  ['2026-08-10', 'saida',     42.98, 'PIX EMITIDO OUTRA IF - 17.895.646 0001-87 (UBER)', 'Pix'],
  ['2026-08-10', 'entrada',   20.98, 'CREDITO DEVOLUCAO PIX - UBER DO BRASIL TECNOLOGIA LTDA - 17.895.646 0001-87', 'Pix'],
  ['2026-08-10', 'saida',     20.98, 'PIX EMITIDO OUTRA IF - 17.895.646 0001-87 (UBER)', 'Pix'],
  ['2026-08-10', 'saida',    218.30, 'DEB.TIT.COMPE EFETIVADO - Ref Site ClickWeb', '2934434'],
  // --- 11/08 ---
  ['2026-08-11', 'saida',   2000.00, 'PIX EMITIDO OUTRA IF - Ref aluguel casa expogenetica', 'Pix'],
  ['2026-08-11', 'saida',      2.08, 'TARIFA COBRANCA', '284534'],
  ['2026-08-11', 'entrada', 2800.00, 'CRED.LIQUIDACAO COBRANCA', '284069'],
]

/* ---------- 1) importa movimentos ---------- */
const { data: jaTemMov } = await sb.from('erp_movimentos_bancarios')
  .select('import_key').eq('conta_bancaria_id', CONTA).gte('data', '2026-08-07')
const chaves = new Set((jaTemMov || []).map(m => m.import_key))

let novos = 0
for (const [data, tipo, valor, descricao, documento] of MOV) {
  const key = 'csv:' + crypto.createHash('sha1')
    .update([CONTA, data, tipo, valor.toFixed(2), descricao].join('|')).digest('hex').slice(0, 24)
  if (chaves.has(key)) continue
  novos++
  console.log('MOV + ' + data + ' ' + tipo.padEnd(7) + valor.toFixed(2).padStart(11) + '  ' + descricao.slice(0, 78))
  if (APPLY) {
    const { error } = await sb.from('erp_movimentos_bancarios').insert({
      conta_bancaria_id: CONTA, data, tipo, valor, descricao, documento,
      origem: 'importacao_csv', observacoes: OBS, import_key: key,
      conciliado: false, status_conciliacao: 'pendente',
    })
    if (error) { console.error('  ERRO:', error.message); process.exitCode = 1 }
  }
}
console.log('-> ' + novos + ' movimentos novos\n')

/* ---------- 2) baixa dos CP quitados ---------- */
const baixas = [
  // ilike + '%OMENA%' porque a base tem as duas grafias: "FABIO OMENA" e "FÁBIO OMENA"
  { like: '%OMENA%',        venc: '2026-08-10', dataPgto: '2026-08-10',
    nota: 'Saldo de 1/3 da comissao de junho pago em 10/08 (PIX R$ 20.215,00 - FO ASSESSORIA / nfs 28).' },
  { like: '%GUSTAVO RUSA%', venc: '2026-07-27', dataPgto: '2026-08-10',
    nota: 'Quitado no PIX de 10/08 a RUSA ASSESSORIA (R$ 29.535,00 - NF 34, Comissao Rusa Julho 2026).' },
  { like: '%Site ClickWeb%', venc: '2026-08-10', dataPgto: '2026-08-10',
    nota: 'Debito de titulo compensado em 10/08 (R$ 218,30).' },
]
let somaBaixas = 0
for (const b of baixas) {
  const { data: cps } = await sb.from('erp_contas_pagar')
    .select('id,descricao,valor,valor_pago,status,observacoes')
    .ilike('descricao', b.like).eq('vencimento', b.venc).neq('status', 'pago')
  for (const cp of cps || []) {
    somaBaixas += Number(cp.valor) - Number(cp.valor_pago || 0)
    console.log('BAIXA  ' + cp.valor.toFixed(2).padStart(10) + ' (falta ' +
      (Number(cp.valor) - Number(cp.valor_pago || 0)).toFixed(2).padStart(9) + ')  ' + cp.descricao.slice(0, 70))
    if (APPLY) {
      const { error } = await sb.from('erp_contas_pagar').update({
        status: 'pago', valor_pago: cp.valor, data_pagamento: b.dataPgto,
        observacoes: ((cp.observacoes || '') + ' [CONCILIADO 11/08] ' + b.nota).trim(),
      }).eq('id', cp.id)
      if (error) { console.error('  ERRO:', error.message); process.exitCode = 1 }
    }
  }
}

/* ---------- 2b) complemento da comissao Rusa de julho ---------- */
// 4 CP lancados somam 23.490,00; o pagamento real foi 29.535,00 -> faltavam 6.045,00
const CHAVE_RUSA = 'rusa-jul26:complemento'
const { data: temRusa } = await sb.from('erp_contas_pagar')
  .select('id').eq('numero_documento', CHAVE_RUSA).limit(1)
if (!temRusa?.length) {
  console.log('CP  +   6045.00  COMISSAO PARCEIRO GUSTAVO RUSA (5%) - complemento julho/2026 (ja pago)')
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').insert({
      descricao: 'COMISSAO PARCEIRO GUSTAVO RUSA (5%) - complemento julho/2026',
      valor: 6045, valor_pago: 6045, vencimento: '2026-07-27', emissao: '2026-07-31',
      data_pagamento: '2026-08-10', status: 'pago',
      categoria_id: 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e',
      numero_documento: CHAVE_RUSA, tags: ['comissao', '2026', 'julho', 'rusa'],
      observacoes: '[CONCILIADO 11/08] Diferenca apurada na conciliacao: os 4 CP lancados somavam R$ 23.490,00 e o PIX de 10/08 a RUSA ASSESSORIA (NF 34) foi de R$ 29.535,00. Conferir com a Ana quais leiloes de julho geraram os R$ 6.045,00 a mais.',
    })
    if (error) { console.error('  ERRO:', error.message); process.exitCode = 1 }
  }
}

/* ---------- 3) casa Expogenetica: 2.000 ja pagos ---------- */
const { data: casa } = await sb.from('erp_contas_pagar')
  .select('id,valor,valor_pago,observacoes').eq('numero_documento', 'desp-expo:casa').limit(1)
if (casa?.length && Number(casa[0].valor_pago || 0) === 0) {
  console.log('CP  ~   parcial: casa Expogenetica - R$ 2.000,00 pagos em 11/08, restam R$ 5.000,00')
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').update({
      valor_pago: 2000, status: 'parcial',
      observacoes: (casa[0].observacoes || '') + ' [CONCILIADO 11/08] R$ 2.000,00 pagos em 11/08 (PIX "Ref aluguel casa expogenetica"). Saldo estimado de R$ 5.000,00.',
    }).eq('id', casa[0].id)
    if (error) { console.error('  ERRO:', error.message); process.exitCode = 1 }
  }
}

/* ---------- 4) reembolso estimado do Fabio: ja pago de verdade ---------- */
const { data: reemb } = await sb.from('erp_contas_pagar')
  .select('id,observacoes,status').eq('numero_documento', 'reemb-jul:fabio').limit(1)
if (reemb?.length && reemb[0].status !== 'cancelado') {
  console.log('CP  x   cancela reembolso estimado do Fabio (pago de verdade em 07/08: R$ 4.008,21)')
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').update({
      status: 'cancelado',
      observacoes: (reemb[0].observacoes || '') + ' [CONCILIADO 11/08] CANCELADO: o reembolso do Fabio ja saiu em 07/08 no valor real de R$ 4.008,21 (PIX FO ASSESSORIA). Estimativa substituida pelo fato.',
    }).eq('id', reemb[0].id)
    if (error) { console.error('  ERRO:', error.message); process.exitCode = 1 }
  }
}

/* ---------- 5) confere o saldo por delta ----------
   Nao da pra recomputar do saldo_inicial: a conta tem lancamentos tipo
   'transferencia' que uma soma entrada-saida ignora (foi exatamente o bug
   corrigido em 03/07). Entao a conferencia e feita pelo delta dos movimentos
   novos sobre o saldo que o ERP ja tinha. */
const SALDO_ERP_ANTES = 22606.86 // saldo_atual gravado, com extrato ate 07/08 incompleto
const delta = MOV.reduce((s, [, tipo, valor]) => s + (tipo === 'entrada' ? valor : -valor), 0)
const esperado = SALDO_ERP_ANTES + delta
console.log('\nSaldo no ERP antes:      R$ ' + SALDO_ERP_ANTES.toFixed(2).padStart(12))
console.log('Delta dos 18 movimentos: R$ ' + delta.toFixed(2).padStart(12))
console.log('Saldo esperado:          R$ ' + esperado.toFixed(2).padStart(12))
console.log('Saldo do banco 11/08:    R$ ' + (120855.22).toFixed(2).padStart(12))
console.log('Diferenca:               R$ ' + (esperado - 120855.22).toFixed(2).padStart(12) +
  (Math.abs(esperado - 120855.22) < 0.01 ? '   <-- BATE' : '   <-- NAO BATE'))
console.log('Total baixado em CP:     R$ ' + somaBaixas.toFixed(2).padStart(12))

if (APPLY) {
  await sb.from('erp_contas_bancarias').update({ saldo_atual: 120855.22 }).eq('id', CONTA)
  console.log('saldo_atual da conta Sicoob gravado como 120.855,22')
}
console.log('\n' + (APPLY ? 'APLICADO' : 'DRY-RUN'))
