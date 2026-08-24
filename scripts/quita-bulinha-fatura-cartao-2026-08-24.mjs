/**
 * Fecha o saldo devido ao Bulinha (Felipe Andrade) contra as faturas de cartao
 * debitadas em 24/08/2026 — agora CONFIRMADAS no extrato Sicoob
 * (sicoob_2026_08_24_16_22_23.pdf), nao mais previstas.
 *
 * Por que isso quita e nao paga: 100% das compras nos cartoes da Bula tem
 * portador FELIPE V ANDRADE — pagar a fatura E a forma de quitar a divida com
 * ele, nao sai dinheiro a mais. Ver memoria `cartao-bula-e-gasto-do-bulinha`.
 * Em 20/08 o acerto ja tinha sido lancado como previsao (valor_pago gravado,
 * status ficou `vencido`); aqui ele vira `pago` porque o debito aconteceu.
 *
 * Os 62,03 de residual (7.392,00 - 7.329,97) entram como `desconto` — a divida
 * foi liquidada pelas faturas e essa sobra nao vira pagamento novo.
 *
 * NAO mexe nas CP das faturas: elas sao debito automatico real no Sicoob e ja
 * estao conciliadas com os movimentos de 24/08.
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
const CP_BULINHA = '739d2a76-ed28-4e68-a740-84f2f0345471'
const CP_VISA = '2e82dcd6-0ce8-4af3-ba3b-e5626cf51ef7'
const CP_MASTER = 'b2d86004-8ef5-4fad-9e61-67c99c359ef1'
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

/* As faturas precisam estar PAGAS (conciliadas com o extrato) para quitar. */
const { data: faturas } = await sb.from('erp_contas_pagar')
  .select('id,descricao,valor,valor_pago,status,data_pagamento').in('id', [CP_VISA, CP_MASTER])
let somaFaturas = 0
for (const f of faturas || []) {
  console.log(`FATURA ${String(f.status).padEnd(8)} ${brl(f.valor).padStart(10)} pago em ${f.data_pagamento || '-'}  ${f.descricao.slice(0, 48)}`)
  if (f.status !== 'pago') { console.error('  -> ainda nao esta paga; rode scripts/concilia-sicoob-2026-08-24.mjs --apply antes.'); process.exit(1) }
  somaFaturas += Number(f.valor)
}
somaFaturas = Number(somaFaturas.toFixed(2))

const { data: cp } = await sb.from('erp_contas_pagar').select('*').eq('id', CP_BULINHA).single()
if (!cp) { console.error('CP do Bulinha nao encontrada'); process.exit(1) }
const residual = Number((Number(cp.valor) - somaFaturas).toFixed(2))
console.log(`\nDIVIDA  ${brl(cp.valor)}  (${cp.descricao.slice(0, 56)}) — status atual: ${cp.status}`)
console.log(`FATURAS ${brl(somaFaturas)}  (VISA + MASTERCARD debitadas em 24/08, confirmadas no extrato)`)
console.log(`RESIDUAL ${brl(residual)} -> lancado como desconto, titulo encerrado\n`)

if (residual < -0.005) { console.error('As faturas superam a divida — nao encerrar automaticamente, revisar a mao.'); process.exit(1) }

const tags = [...new Set([...(cp.tags || []).filter(t => t !== 'retido-por-decisao'), 'quitado-por-fatura-cartao'])]
const nota = `[QUITADO 24/08] Encerrado contra as faturas de cartao debitadas em 24/08/2026 e confirmadas no extrato Sicoob: VISA ${brl(5949.84)} + MASTERCARD ${brl(1380.13)} = ${brl(somaFaturas)}. Residual de ${brl(residual)} lancado como desconto. Nao houve saida de caixa alem das proprias faturas — 100% das compras nesses cartoes tem portador FELIPE V ANDRADE.`

console.log('CP  ' + cp.status + ' -> pago | valor_pago ' + brl(somaFaturas) + ' | desconto ' + brl(residual) + ' | forma cartao | data 2026-08-24')
console.log('tags: ' + JSON.stringify(tags))
if (APPLY) {
  const { error } = await sb.from('erp_contas_pagar').update({
    status: 'pago', valor_pago: somaFaturas, desconto: residual,
    data_pagamento: '2026-08-24', forma_pagamento: 'cartao', tags,
    observacoes: ((cp.observacoes || '') + ' ' + nota).trim(),
  }).eq('id', CP_BULINHA)
  if (error) { console.error('ERRO: ' + error.message); process.exit(1) }
  console.log('\nAPLICADO.')
} else {
  console.log('\nDRY-RUN. Use --apply para gravar.')
}
