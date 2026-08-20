/**
 * Sicredi: lanca o resgate de 15.000,00 de 04/08/2026 que nunca foi registrado.
 *
 * O QUE ACONTECEU: em 04/08 sairam R$ 15.000,00 da conta corrente do Sicredi por PIX de
 * mesma titularidade para o Sicoob (o credito esta conciliado no extrato do Sicoob de 04/08).
 * A conta corrente do Sicredi opera com VARREDURA: ela nunca guarda saldo, todo dinheiro fica
 * na aplicacao e volta na hora do pagamento. Em todos os 186 movimentos da conta o padrao e um
 * PAR — "RESG.APLIC.FIN.AVISO PREV" (entrada na CC) contra "RESGATE ENVIADO A CC" (saida da
 * aplicacao). No dia 04/08 so o pagamento foi lancado; o par do resgate ficou faltando.
 *
 * Resultado: a CC ficou com saldo de -15.000,00, impossivel numa conta com varredura, e a
 * aplicacao ficou 15.000,00 acima da posicao real.
 *
 * O LIQUIDO NAO MUDA — R$ 12.598,64 antes e depois. Muda o rateio:
 *    antes:  aplicacao 27.598,64  +  CC -15.000,00  =  12.598,64
 *    depois: aplicacao 12.598,64  +  CC       0,00  =  12.598,64
 *
 * Ancora da aplicacao: em 03/08 houve "AJUSTE POSICAO APLICACAO (app Sicredi 03/08 13:31)",
 * ou seja, a posicao de 27.598,64 foi conferida no app no dia anterior a saida.
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
const CC = 'af4724ec-e098-4e13-b172-04b2bfb1949d'  // Sicredi Conta Corrente 53609-7
const APP = '5879aa04-2d69-4b9a-a80c-d9e3eca7ac06' // Sicredi Investimentos (aplicacao)
const TAG = '[SICREDI RESGATE 04/08]'
const DATA = '2026-08-04'
const VALOR = 15000.00
const CAT_INT_ENT = '2847979e-b319-4cad-9510-828c9d6bc1c0' // Transferencias Internas - Entrada
const CAT_INT_SAI = '1d83b7e5-aa77-4e1d-a774-64ecfda0b746' // Transferencias Internas - Saida
const NOTA = TAG + ' Par do resgate da varredura que faltava: em 04/08 sairam 15.000,00 da CC por PIX de mesma '
  + 'titularidade para o Sicoob (credito conciliado no extrato do Sicoob), mas o resgate da aplicacao nunca foi '
  + 'lancado. A CC ficou com -15.000,00, impossivel numa conta com varredura. Liquido do Sicredi inalterado: 12.598,64.'
const fmt = n => Number(n).toFixed(2).padStart(12)
let erros = 0
const fail = (e, ctx) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }

/* ---------- posicao antes ---------- */
const antes = {}
for (const [id, k] of [[CC, 'cc'], [APP, 'app']]) {
  const { data } = await sb.from('erp_contas_bancarias').select('nome,saldo_atual,saldo_inicial').eq('id', id).single()
  antes[k] = data
  console.log('ANTES  ' + data.nome.padEnd(44) + fmt(data.saldo_atual))
}
console.log('ANTES  ' + 'LIQUIDO SICREDI'.padEnd(44) + fmt(Number(antes.cc.saldo_atual) + Number(antes.app.saldo_atual)))
console.log('')

/* ---------- guarda: so faz sentido se a CC estiver mesmo negativa em 15.000 ---------- */
if (Math.abs(Number(antes.cc.saldo_atual) + VALOR) > 0.005) {
  console.log('ABORTA: a conta corrente esta em ' + fmt(antes.cc.saldo_atual) + ', esperado ' + fmt(-VALOR) + '.')
  console.log('Alguem ja corrigiu, ou o extrato do Sicredi entrou. Conferir antes de rodar.')
  process.exit(1)
}

/* ---------- o par que faltava ---------- */
const MOV = [
  { conta: CC, tipo: 'entrada', cat: CAT_INT_ENT,
    descricao: 'RESG.APLIC.FIN.AVISO PREV — resgate da aplicacao para cobrir o PIX de 15.000,00 ao Sicoob' },
  { conta: APP, tipo: 'saida', cat: CAT_INT_SAI,
    descricao: 'RESGATE ENVIADO A CC 53609-7 (varredura) — cobre o PIX de 15.000,00 ao Sicoob' },
]
for (const m of MOV) {
  const key = 'ajuste:' + crypto.createHash('sha1')
    .update([m.conta, DATA, m.tipo, VALOR.toFixed(2), m.descricao].join('|')).digest('hex').slice(0, 24)
  const { data: ja } = await sb.from('erp_movimentos_bancarios').select('id').eq('import_key', key).limit(1)
  if (ja && ja.length) { console.log('MOV = ja existe  ' + m.tipo.padEnd(7) + fmt(VALOR) + '  ' + m.descricao.slice(0, 54)); continue }
  console.log('MOV + ' + DATA + ' ' + m.tipo.padEnd(7) + fmt(VALOR) + '  ' + m.descricao.slice(0, 62))
  if (APPLY) {
    const { error } = await sb.from('erp_movimentos_bancarios').insert({
      conta_bancaria_id: m.conta, data: DATA, tipo: m.tipo, valor: VALOR,
      descricao: m.descricao, documento: 'varredura', categoria_id: m.cat,
      origem: 'ajuste_manual', observacoes: NOTA, import_key: key,
      conciliado: true, status_conciliacao: 'conciliado',
    })
    fail(error, 'mov ' + m.tipo)
  }
}
console.log('')

/* ---------- posicao depois ---------- */
if (APPLY) {
  const depois = {}
  for (const [id, k] of [[CC, 'cc'], [APP, 'app']]) {
    const { data } = await sb.from('erp_contas_bancarias').select('nome,saldo_atual').eq('id', id).single()
    depois[k] = data
    console.log('DEPOIS ' + data.nome.padEnd(44) + fmt(data.saldo_atual))
  }
  const liq = Number(depois.cc.saldo_atual) + Number(depois.app.saldo_atual)
  const liqAntes = Number(antes.cc.saldo_atual) + Number(antes.app.saldo_atual)
  console.log('DEPOIS ' + 'LIQUIDO SICREDI'.padEnd(44) + fmt(liq))
  console.log('')
  console.log(Math.abs(liq - liqAntes) < 0.005
    ? 'OK  liquido inalterado (' + fmt(liq).trim() + ') — so o rateio entre as duas contas mudou.'
    : '*** ATENCAO: o liquido mudou de ' + fmt(liqAntes).trim() + ' para ' + fmt(liq).trim())
  console.log(Math.abs(Number(depois.cc.saldo_atual)) < 0.005
    ? 'OK  conta corrente zerada, como manda a varredura.'
    : '*** ATENCAO: conta corrente ficou em ' + fmt(depois.cc.saldo_atual).trim())
}
console.log(APPLY ? (erros ? '*** ' + erros + ' erro(s) ***' : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.')
console.log('')
console.log('LEMBRETE: o extrato do Sicredi de agosto NUNCA foi importado. Os 12.598,64 sao a posicao')
console.log('do ERP em 03-04/08, nao um saldo confirmado pelo banco. Movimento posterior a 04/08 e desconhecido.')
