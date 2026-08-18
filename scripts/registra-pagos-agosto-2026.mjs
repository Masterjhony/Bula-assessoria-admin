/**
 * Registra em Contas a Pagar pagamentos de agosto que sairam direto pelo banco e
 * ainda nao tinham CP, e amarra cada um ao movimento bancario correspondente:
 *
 *   10/08  R$ 3.500,00  campanha de trafego pago patrocinado  -> Marketing e Publicidade
 *   10/08  R$ 2.700,00  diarias de julho do Matheus           -> Despesa Operacional Leilao
 *   11/08  R$ 2.000,00  aluguel da casa de Uberaba            -> Despesa Operacional Leilao
 *
 * A casa de Uberaba ja existia como um CP unico de R$ 7.000 marcado como parcial.
 * Aqui ele e quebrado em duas linhas, como o gasto realmente acontece (na Expozebu
 * saiu em duas parcelas): a 1a parcela de R$ 2.000 ja paga em 11/08 e o saldo
 * estimado de R$ 5.000 com vencimento em 20/08. Assim a parcela paga aparece no
 * bloco de pagamentos ja feitos, em vez de ficar escondida dentro de um parcial.
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

const CAT = {
  marketing:  '26762d4e-b517-48b9-98f3-155a6421264e', // Marketing e Publicidade
  despLeilao: '562264eb-8134-4990-a56b-d884279acf90', // Despesa Operacional Leilao
}

/* ---------- 1) CP novos, ja pagos ---------- */
const novos = [
  { chave: 'pago-ago:trafego-pago',
    descricao: 'Marketing - campanha de trafego pago patrocinado',
    valor: 3500, data: '2026-08-10', categoria_id: CAT.marketing,
    tags: ['marketing', '2026', 'agosto'],
    movLike: '%Trafego Pago patrocinado%',
    obs: 'Pago em 10/08 por PIX ao CNPJ 13.347.016/0001-17. Lancado a posteriori: a despesa saiu direto pelo banco, sem CP previo.' },
  { chave: 'pago-ago:diarias-matheus-julho',
    descricao: 'Diarias de leilao ref. julho/2026 - MATHEUS',
    valor: 2700, data: '2026-08-10', categoria_id: CAT.despLeilao,
    tags: ['leilao', 'diarias', '2026', 'julho'],
    movLike: '%diarias Matheus%',
    obs: 'Diarias de julho, pagas em 10/08 por PIX. Lancado a posteriori: a despesa saiu direto pelo banco, sem CP previo.' },
]

for (const n of novos) {
  const { data: ja } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', n.chave).limit(1)
  if (ja?.length) { console.log('(ja existe) ' + n.descricao); continue }
  console.log('CP PAGO  + ' + n.data + '  ' + n.valor.toFixed(2).padStart(9) + '  ' + n.descricao)
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').insert({
      descricao: n.descricao, valor: n.valor, valor_pago: n.valor,
      vencimento: n.data, emissao: n.data, data_pagamento: n.data,
      status: 'pago', categoria_id: n.categoria_id, numero_documento: n.chave,
      tags: n.tags, observacoes: '[CP-AGO-2026] ' + n.obs,
    })
    if (error) { console.error('  ERRO:', error.message); process.exitCode = 1 }
  }
}

/* ---------- 2) casa de Uberaba: quebra em 1a parcela paga + saldo ---------- */
const { data: casa } = await sb.from('erp_contas_pagar')
  .select('id,descricao,valor,valor_pago,status,observacoes').eq('numero_documento', 'desp-expo:casa').limit(1)

if (casa?.length && Number(casa[0].valor) === 7000) {
  console.log('\nCP       ~ 2026-08-11   2000.00  casa Uberaba -> vira 1a parcela PAGA')
  console.log('CP       + 2026-08-20   5000.00  casa Uberaba -> saldo estimado')
  if (APPLY) {
    const e1 = await sb.from('erp_contas_pagar').update({
      descricao: 'Despesas EXPOGENETICA - casa/estrutura Uberaba - 1a parcela',
      valor: 2000, valor_pago: 2000, vencimento: '2026-08-11', data_pagamento: '2026-08-11',
      status: 'pago', tags: ['leilao', 'expogenetica', '2026', 'agosto'],
      observacoes: '[CP-AGO-2026] 1a parcela do aluguel da casa de Uberaba para a Expogenetica, paga em 11/08 por PIX. Mesmo padrao da Expozebu, onde a casa tambem saiu em duas parcelas.',
    }).eq('id', casa[0].id)
    if (e1.error) { console.error('  ERRO:', e1.error.message); process.exitCode = 1 }

    const e2 = await sb.from('erp_contas_pagar').insert({
      descricao: 'Despesas EXPOGENETICA - casa/estrutura Uberaba - saldo (ESTIMADO)',
      valor: 5000, valor_pago: 0, vencimento: '2026-08-20', emissao: '2026-08-11',
      status: 'aberto', categoria_id: CAT.despLeilao, numero_documento: 'desp-expo:casa-saldo',
      tags: ['a-pagar', 'estimado', 'orcamento', 'leilao', 'expogenetica'],
      observacoes: '[CP-AGO-2026] Saldo estimado da casa de Uberaba. Premissa: total de R$ 7.000 no mesmo padrao da Expozebu/2026 (2 parcelas de R$ 3.500, pagas em 27/03 e 29/04), com R$ 2.000 ja pagos em 11/08.',
    })
    if (e2.error) { console.error('  ERRO:', e2.error.message); process.exitCode = 1 }
  }
} else {
  console.log('\n(casa de Uberaba ja estava quebrada)')
}

/* ---------- 3) amarra os movimentos bancarios aos CP ---------- */
console.log('\n--- vinculo movimento bancario <-> CP ---')
const vincs = [
  ['%Trafego Pago patrocinado%', 'pago-ago:trafego-pago'],
  ['%diarias Matheus%',          'pago-ago:diarias-matheus-julho'],
  ['%aluguel casa expogenetica%', 'desp-expo:casa'],
]
for (const [like, chave] of vincs) {
  const { data: cp } = await sb.from('erp_contas_pagar').select('id,descricao').eq('numero_documento', chave).limit(1)
  const { data: mv } = await sb.from('erp_movimentos_bancarios')
    .select('id,data,valor,descricao,conta_pagar_id').ilike('descricao', like).eq('tipo', 'saida')
  for (const m of mv || []) {
    if (!cp?.length) { console.log('  CP nao encontrado: ' + chave); break }
    console.log('  ' + m.data + '  ' + Number(m.valor).toFixed(2).padStart(9) + '  -> ' + cp[0].descricao.slice(0, 58))
    if (APPLY) {
      const { error } = await sb.from('erp_movimentos_bancarios').update({
        conta_pagar_id: cp[0].id, conciliado: true, status_conciliacao: 'conciliado',
      }).eq('id', m.id)
      if (error) { console.error('    ERRO:', error.message); process.exitCode = 1 }
    }
  }
}

/* ---------- resumo ---------- */
const { data: cp2 } = await sb.from('erp_contas_pagar').select('valor,valor_pago,tags')
  .lte('vencimento', '2026-08-31').in('status', ['aberto', 'vencido', 'parcial'])
const tot = cp2.reduce((s, c) => s + Number(c.valor) - Number(c.valor_pago || 0), 0)
const est = cp2.filter(c => (c.tags || []).includes('estimado')).reduce((s, c) => s + Number(c.valor) - Number(c.valor_pago || 0), 0)
const { data: pg } = await sb.from('erp_contas_pagar').select('valor_pago')
  .eq('status', 'pago').gte('data_pagamento', '2026-08-01').lte('data_pagamento', '2026-08-31')
console.log('\nA pagar ate 31/08: R$ ' + tot.toFixed(2) + '  (firme R$ ' + (tot - est).toFixed(2) + ' + estimado R$ ' + est.toFixed(2) + ')')
console.log('Ja pago em agosto: R$ ' + pg.reduce((s, c) => s + Number(c.valor_pago || 0), 0).toFixed(2) + '  (' + pg.length + ' baixas)')
console.log(APPLY ? 'APLICADO' : 'DRY-RUN')
