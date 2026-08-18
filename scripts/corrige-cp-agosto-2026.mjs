/**
 * Correcoes no CP de agosto/2026 apontadas pelo Joao em 11/08:
 *
 *  1) O estimado de R$ 6.500 de "passagens, diarias e alimentacao" da Expogenetica
 *     E os dois bilhetes de 22/08 (R$ 6.178,45). Era contagem dobrada -> cancela o estimado.
 *  2) Despesa operacional de leilao so existe quando e PRESENCIAL (alguem viaja e
 *     paga-se passagem/hospedagem). Refaz a estimativa dos leiloes de agosto usando
 *     a coluna `presencial` do cronograma, zerando os virtuais.
 *  3) Aluguel do escritorio NAO se paga (confirmado no WhatsApp). Maquina de cafe:
 *     R$ 150,00 e a ULTIMA vez -> cancela as recorrencias de set a dez.
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

const cancela = async (filtro, motivo, rotulo) => {
  let q = sb.from('erp_contas_pagar').select('id,descricao,valor,vencimento,observacoes,status')
  for (const [op, col, val] of filtro) q = q[op](col, val)
  const { data } = await q
  for (const cp of (data || []).filter(c => c.status !== 'cancelado' && c.status !== 'pago')) {
    console.log('CANCELA  ' + cp.vencimento + '  ' + Number(cp.valor).toFixed(2).padStart(10) + '  ' + cp.descricao.slice(0, 66))
    if (APPLY) {
      const { error } = await sb.from('erp_contas_pagar').update({
        status: 'cancelado',
        observacoes: ((cp.observacoes || '') + ' [CORRECAO 11/08 - ' + rotulo + '] ' + motivo).trim(),
      }).eq('id', cp.id)
      if (error) { console.error('  ERRO:', error.message); process.exitCode = 1 }
    }
  }
}

/* ---------- 1) contagem dobrada da passagem da Expogenetica ---------- */
console.log('--- 1) Expogenetica: passagem estimada x bilhetes reais ---')
await cancela([['eq', 'numero_documento', 'desp-expo:equipe']],
  'CANCELADO: esta estimativa de R$ 6.500 era exatamente as passagens da Expogenetica, que ja estao lancadas pelo valor real nos dois bilhetes da ADN Viagens com vencimento em 22/08 (Leonardo R$ 1.981,58 + Fabio Omena Gaia R$ 4.196,87 = R$ 6.178,45). Estava contando duas vezes.',
  'contagem dobrada')

/* ---------- 2) despesa de leilao so em presencial ---------- */
console.log('\n--- 2) despesa operacional so em leilao presencial ---')
await cancela([['eq', 'numero_documento', 'desp-leiloes:ago']],
  'CANCELADO: a estimativa cobria os 11 leiloes restantes indistintamente. Regra correta: so ha despesa operacional quando o leilao e PRESENCIAL (alguem viaja e paga-se passagem/hospedagem). Substituido pelas linhas por bloco de viagem presencial.',
  'so presencial')

const { data: crono } = await sb.from('cronograma_leiloes')
  .select('data,nome,presencial').gte('data', '2026-08-12').lte('data', '2026-08-31').order('data')
const classe = p => {
  const s = (p || '').trim().toUpperCase()
  if (s === 'VIRTUAL') return 'VIRTUAL'
  if (s === '') return 'INDEFINIDO'
  return 'PRESENCIAL'
}
console.log('\nModalidade dos leiloes de 12 a 31/08 (coluna `presencial` do cronograma):')
const cont = { VIRTUAL: 0, PRESENCIAL: 0, INDEFINIDO: 0 }
for (const x of crono || []) {
  const c = classe(x.presencial); cont[c]++
  console.log('  ' + c.padEnd(11) + x.data + '  ' + x.nome.slice(0, 52))
}
console.log('  => ' + cont.PRESENCIAL + ' presenciais, ' + cont.VIRTUAL + ' virtuais, ' + cont.INDEFINIDO + ' sem modalidade')

const CAT_LEILAO = '562264eb-8134-4990-a56b-d884279acf90'
const novas = [
  { chave: 'desp-leilao:colonial-navirai',
    descricao: 'Despesas operacionais - Premium Colonial (21/08) + Navirai Camparino (22 e 23/08) (ESTIMADO)',
    valor: 3000, vencimento: '2026-08-25',
    obs: 'Bloco presencial com Leonardo Serafim, Douglas Bispo e Fabio Omena escalados no cronograma. Premissa: hospedagem e diarias no padrao realizado (R$ 990 para 3 pessoas por diaria de hotel, leilao LS em 07/08) por 3 dias de evento. Passagens nao entram: a equipe ja esta em viagem pelos bilhetes da ADN (ida 13/08, volta 24/08).' },
  { chave: 'desp-leilao:melhoradores',
    descricao: 'Despesas operacionais - Melhoradores Especial 30 Anos, ACRISSUL/Campo Grande (29/08) (ESTIMADO)',
    valor: 3200, vencimento: '2026-08-31',
    obs: 'Leilao marcado como PRESENCIAL no cronograma, fora da janela de viagem da Expogenetica - exige passagem propria. Premissa: passagem R$ 2.000 (media das passagens pagas em 2026: Fabio R$ 1.233,66, Marcelo R$ 2.081,92, Leo R$ 2.421,43) + R$ 1.200 de hospedagem e diarias.' },
]
console.log('')
for (const n of novas) {
  const { data: ja } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', n.chave).limit(1)
  if (ja?.length) { console.log('(ja existe) ' + n.descricao.slice(0, 70)); continue }
  console.log('CP    +  ' + n.vencimento + '  ' + n.valor.toFixed(2).padStart(10) + '  ' + n.descricao.slice(0, 66))
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').insert({
      descricao: n.descricao, valor: n.valor, valor_pago: 0,
      vencimento: n.vencimento, emissao: '2026-08-11', status: 'aberto',
      categoria_id: CAT_LEILAO, numero_documento: n.chave,
      tags: ['a-pagar', 'estimado', 'orcamento', 'leilao', 'presencial'],
      observacoes: '[CP-AGO-2026] ' + n.obs,
    })
    if (error) { console.error('  ERRO:', error.message); process.exitCode = 1 }
  }
}

/* ---------- 3) aluguel e maquina de cafe ---------- */
console.log('\n--- 3) aluguel do escritorio e maquina de cafe ---')
await cancela([['ilike', 'descricao', '%Aluguel do escrit%']],
  'CANCELADO: confirmado no WhatsApp em 11/08 que o aluguel do escritorio NAO tem que ser pago referente ao mes passado ("Nao").',
  'aluguel nao se paga')
await cancela([['ilike', 'descricao', '%quina de caf%'], ['gte', 'vencimento', '2026-09-01']],
  'CANCELADO: confirmado no WhatsApp em 11/08 que a maquina de cafe de R$ 150,00 e a ULTIMA vez ("Cafe sim / 150,00 / Ultima vez"). Recorrencia encerrada em agosto.',
  'cafe: ultima vez')

const { data: cafe } = await sb.from('erp_contas_pagar')
  .select('id,valor,observacoes').ilike('descricao', '%quina de caf%').eq('vencimento', '2026-08-10').limit(1)
if (cafe?.length && !(cafe[0].observacoes || '').includes('ULTIMA')) {
  console.log('MARCA    2026-08-10      150.00  Maquina de cafe -> ultima cobranca')
  if (APPLY) {
    await sb.from('erp_contas_pagar').update({
      observacoes: (cafe[0].observacoes || '') + ' [CORRECAO 11/08] Confirmado no WhatsApp: R$ 150,00 e a ULTIMA cobranca da maquina de cafe.',
    }).eq('id', cafe[0].id)
  }
}

/* ---------- resumo ---------- */
const { data: cp } = await sb.from('erp_contas_pagar').select('valor,valor_pago,tags')
  .lte('vencimento', '2026-08-31').in('status', ['aberto', 'vencido', 'parcial'])
const tot = cp.reduce((s, c) => s + Number(c.valor) - Number(c.valor_pago || 0), 0)
const est = cp.filter(c => (c.tags || []).includes('estimado')).reduce((s, c) => s + Number(c.valor) - Number(c.valor_pago || 0), 0)
console.log('\nA pagar ate 31/08 apos as correcoes: R$ ' + tot.toFixed(2) + '  (estimado R$ ' + est.toFixed(2) + ')')
console.log(APPLY ? 'APLICADO' : 'DRY-RUN')
