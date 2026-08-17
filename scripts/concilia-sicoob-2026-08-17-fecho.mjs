/**
 * Fecha os 2 movimentos que sobraram pendentes na conciliacao de 17/08.
 *
 * 1) CRED.LIQUIDACAO COBRANCA de R$ 2.800,00 em 11/08 (doc 284069) -> liquidacao do
 *    boleto do LEILAO VIRTUAL TOUROS MATINHA - THIAGO (2/2), venc. 12/08.
 *    Ha DUAS contas a receber de R$ 2.800,00 (1/2 venc 29/07 e 2/2 venc 12/08).
 *    A planilha-mestra do Drive (linha 83) resolve o empate: as parcelas 1/3 e 2/3
 *    constam "RECEBIDO 29/07" e so a 3/3 estava "A RECEBER 12/08". O credito de
 *    11/08 (vespera do vencimento, comportamento normal de boleto) e a 3/3 = (2/2).
 *
 * 2) PIX de R$ 39,00 para 21.986.213/0001-04 em 10/08 - contraparte nao identificada.
 *    Fica classificado como Outras Despesas para sair da fila de pendentes, com nota.
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
const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const TAG = '[CONCILIADO 17/08]'
let erros = 0
const fail = (e, c) => { if (e) { console.error('  ERRO ' + c + ': ' + e.message); erros++ } }

/* 1) boleto de 2.800 -> Matinha Thiago 2/2 */
const { data: cr } = await sb.from('erp_contas_receber')
  .select('id,descricao,valor,status,observacoes').eq('numero_documento', 'BULA-2026-CR-MATINHA-THIAGO-B2').single()
const { data: mv } = await sb.from('erp_movimentos_bancarios').select('id,status_conciliacao')
  .eq('conta_bancaria_id', CONTA).eq('data', '2026-08-11').eq('valor', 2800).eq('tipo', 'entrada').single()

if (cr && cr.status !== 'recebido') {
  console.log('BAIXA CR  2.800,00  ' + cr.descricao)
  if (APPLY) {
    fail((await sb.from('erp_contas_receber').update({
      status: 'recebido', valor_recebido: 2800, data_recebimento: '2026-08-11',
      forma_recebimento: 'boleto', conta_bancaria_id: CONTA,
      observacoes: ((cr.observacoes || '') + ' ' + TAG + ' Liquidado por CRED.LIQUIDACAO COBRANCA de 11/08/2026 (doc 284069, tarifa de cobranca 2,08 no mesmo dia). Vencimento era 12/08 - pagamento na vespera. A parcela 1/2 (venc. 29/07) segue em aberto: a planilha-mestra a da como recebida em 29/07, mas o extrato de 25-31/07 nunca foi importado (ha 2 lancamentos AGREGADOS pendentes nesse periodo) - conferir ao puxar aquele extrato.').trim(),
    }).eq('id', cr.id)).error, 'CR matinha')
    if (mv) fail((await sb.from('erp_movimentos_bancarios').update({
      conta_receber_id: cr.id, conciliado: true, status_conciliacao: 'conciliado',
      categoria_id: 'e74434bd-3366-4015-9268-15d6640cf15f',
      observacoes: TAG + ' Liquidacao do boleto do Leilao Virtual Touros Matinha - Thiago (2/2), venc. 12/08.',
    }).eq('id', mv.id)).error, 'mov boleto')
  }
} else console.log('BAIXA CR = ja recebido / nao encontrada')

/* 2) PIX de 39,00 sem contraparte identificada */
const { data: mv39 } = await sb.from('erp_movimentos_bancarios').select('id,observacoes,status_conciliacao')
  .eq('conta_bancaria_id', CONTA).eq('data', '2026-08-10').eq('valor', 39).eq('tipo', 'saida')
  .ilike('descricao', '%21.986.213%').single()
if (mv39 && mv39.status_conciliacao === 'pendente') {
  console.log('MOV  ~ 39,00 -> classificado (Outras Despesas)')
  if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
    categoria_id: '20c2defd-415c-42cc-8939-fcd8cf104280', conciliado: true, status_conciliacao: 'classificado',
    observacoes: ((mv39.observacoes || '') + ' ' + TAG + ' Contraparte CNPJ 21.986.213/0001-04 nao identificada na base de pessoas; sem titulo correspondente. Classificado como Outras Despesas - reclassificar se o chefe identificar o fornecedor.').trim(),
  }).eq('id', mv39.id)).error, 'mov 39')
} else console.log('MOV  = 39,00 ja classificado / nao encontrado')

const { count } = await sb.from('erp_movimentos_bancarios')
  .select('id', { count: 'exact', head: true })
  .eq('conta_bancaria_id', CONTA).gte('data', '2026-08-01').eq('status_conciliacao', 'pendente')
console.log('\nmovimentos de agosto ainda pendentes: ' + count)
console.log(APPLY ? (erros ? '*** ' + erros + ' erro(s) ***' : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.')
