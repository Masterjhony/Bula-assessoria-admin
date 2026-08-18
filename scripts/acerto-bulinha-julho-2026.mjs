/**
 * Acerto do Bulinha (Felipe Andrade) - comissoes de junho pagas em julho.
 *
 * Informado pelo Joao em 11/08: os seis CP de comissao com vencimento em 27/07
 * (R$ 58.872,00) foram acertados no pagamento de julho, mas com desconto pesado
 * dos gastos que ele fez no cartao da empresa. Sobrou devido a ele
 * R$ 7.392,00, ainda em aberto.
 *
 * Modelagem:
 *  - os 6 CP de comissao viram PAGO (a obrigacao de comissao foi liquidada:
 *    parte em dinheiro, parte por compensacao do cartao);
 *  - o residual de R$ 7.392,00 entra como UMA linha, na categoria
 *    "Repasse Assessorias/Parceiros" e nao em "Comissao Funcionario", para nao
 *    contar a mesma despesa de comissao duas vezes. Ele mantem o vencimento
 *    original de 27/07, porque e divida vencida de julho.
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

const RESIDUAL = 7392.00
const CHAVE = 'acerto-bulinha:residual-julho-2026'
const CAT_REPASSE = '5dcdc58a-d81b-4a4c-a81a-5e703e6a1a90' // Repasse Assessorias/Parceiros

const { data: cps } = await sb.from('erp_contas_pagar')
  .select('id,vencimento,descricao,valor,valor_pago,status,observacoes')
  .ilike('descricao', '%BULINHA%').eq('vencimento', '2026-07-27')
  .not('status', 'in', '("pago","cancelado")').order('valor', { ascending: false })

const totalCom = (cps || []).reduce((s, c) => s + Number(c.valor), 0)
const liquidado = totalCom - RESIDUAL

console.log('=== ACERTO BULINHA — comissoes de junho, pagas em julho ===')
console.log('Comissoes lancadas (6 CP, venc. 27/07): R$ ' + totalCom.toFixed(2))
console.log('Liquidado (dinheiro + compensacao do cartao): R$ ' + liquidado.toFixed(2))
console.log('Residual ainda devido a ele: R$ ' + RESIDUAL.toFixed(2) + '\n')

const NOTA = ' [ACERTO 11/08] Comissao de junho acertada no pagamento de julho (PIX de 13/07 R$ 38.000,00 e de 17/07 R$ 51.871,50 a FELIPE VILELA ANDRADE). O acerto descontou os gastos que ele fez no cartao da empresa, e do total de R$ ' +
  totalCom.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' sobrou um residual de R$ ' +
  RESIDUAL.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' ainda devido - lancado a parte como saldo em aberto.'

for (const cp of cps || []) {
  console.log('BAIXA  ' + Number(cp.valor).toFixed(2).padStart(10) + '  ' + cp.descricao.slice(0, 66))
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').update({
      status: 'pago', valor_pago: Number(cp.valor), data_pagamento: '2026-07-17',
      observacoes: ((cp.observacoes || '') + NOTA).trim(),
    }).eq('id', cp.id)
    if (error) { console.error('  ERRO:', error.message); process.exitCode = 1 }
  }
}

const { data: ja } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', CHAVE).limit(1)
if (ja?.length) {
  console.log('\n(residual ja lancado)')
} else {
  console.log('\nCP  +  2026-07-27  ' + RESIDUAL.toFixed(2).padStart(10) + '  SALDO DEVIDO A BULINHA (FELIPE ANDRADE) - residual do acerto de julho')
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').insert({
      descricao: 'SALDO DEVIDO A BULINHA (FELIPE ANDRADE) - residual do acerto de julho',
      valor: RESIDUAL, valor_pago: 0, vencimento: '2026-07-27', emissao: '2026-07-27',
      status: 'vencido', categoria_id: CAT_REPASSE, numero_documento: CHAVE,
      vendedor: 'BULINHA (FELIPE ANDRADE)',
      tags: ['a-pagar', 'acerto-residual', '2026', 'julho', 'bulinha'],
      observacoes: '[ACERTO 11/08] Sobra do acerto das comissoes de junho (R$ ' +
        totalCom.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) +
        '), pagas em julho com desconto dos gastos dele no cartao da empresa. Lancado em "Repasse Assessorias/Parceiros" e nao em "Comissao Funcionario" de proposito: a despesa de comissao ja foi reconhecida nos seis CP originais, e repetir aqui contaria a mesma despesa duas vezes. Esta linha representa so o caixa que ainda tem de sair.',
    })
    if (error) { console.error('  ERRO:', error.message); process.exitCode = 1 }
  }
}

const { data: cp2 } = await sb.from('erp_contas_pagar').select('valor,valor_pago,tags')
  .lte('vencimento', '2026-08-31').in('status', ['aberto', 'vencido', 'parcial'])
const tot = cp2.reduce((s, c) => s + Number(c.valor) - Number(c.valor_pago || 0), 0)
const est = cp2.filter(c => (c.tags || []).includes('estimado')).reduce((s, c) => s + Number(c.valor) - Number(c.valor_pago || 0), 0)
console.log('\nA pagar ate 31/08: R$ ' + tot.toFixed(2) + '  (firme R$ ' + (tot - est).toFixed(2) + ' + estimado R$ ' + est.toFixed(2) + ')')
console.log(APPLY ? 'APLICADO' : 'DRY-RUN')
