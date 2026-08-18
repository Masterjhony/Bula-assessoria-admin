/**
 * Regra do Joao (11/08/2026): a Nane nao recebe comissao mes a mes. O valor vai
 * sendo acumulado a parte e e pago de uma vez em dezembro.
 *
 * Move todo CP de comissao da Nane para 28/12/2026 (o dia 25 cai no Natal; 28/12
 * ja e a data usada no ERP para a comissao de dezembro) e marca com a tag
 * `nane-acumulado` para dar pra somar o montante a qualquer momento.
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
const VENC_DEZ = '2026-12-28'

const { data: cps } = await sb.from('erp_contas_pagar')
  .select('id,vencimento,descricao,valor,status,vendedor,tags,observacoes')
  .ilike('vendedor', '%NANE%').neq('status', 'pago').neq('status', 'cancelado').order('vencimento')

let total = 0
for (const cp of cps || []) {
  if (cp.vencimento === VENC_DEZ) { console.log('(ja diferido) ' + cp.descricao.slice(0, 70)); total += Number(cp.valor); continue }
  total += Number(cp.valor)
  const conjunto = /\//.test(cp.vendedor || '')
  console.log('DIFERE  ' + cp.vencimento + ' -> ' + VENC_DEZ + '  ' + Number(cp.valor).toFixed(2).padStart(9) +
    '  ' + (cp.vendedor || '').padEnd(20) + (conjunto ? ' [LOTE COMPARTILHADO]' : ''))
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').update({
      vencimento: VENC_DEZ,
      tags: [...new Set([...(cp.tags || []), 'nane-acumulado', 'diferido'])],
      observacoes: ((cp.observacoes || '') +
        ' [REGRA NANE 11/08] A Nane nao recebe mes a mes: a comissao fica acumulada a parte e e paga de uma vez em dezembro. Vencimento remarcado de ' +
        cp.vencimento + ' para ' + VENC_DEZ + '.' +
        (conjunto ? ' ATENCAO: lote compartilhado com o Fabio Omena - definir a divisao antes de pagar; se for meio a meio, R$ ' +
          (Number(cp.valor) / 2).toFixed(2) + ' sao do Fabio e poderiam sair antes.' : '')).trim(),
    }).eq('id', cp.id)
    if (error) { console.error('  ERRO:', error.message); process.exitCode = 1 }
  }
}

console.log('\nMontante da Nane acumulado para dezembro: R$ ' + total.toFixed(2))
console.log(APPLY ? 'APLICADO' : 'DRY-RUN')
