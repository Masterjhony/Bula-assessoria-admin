/**
 * Impostos ref. julho/2026, depois que a guia do ISSQN chegou (11/08).
 *
 *  1) ISSQN vira VALOR FIRME: guia 1674646 da SEFAZ de Campo Grande,
 *     R$ 24.524,81, vencimento 17/08/2026, competencia 07/2026,
 *     receita tributada R$ 490.496,32. Era estimado em R$ 12.000 com venc. 13/08.
 *
 *  2) O Simples (DAS) e recalibrado. A guia revelou que a base tributada de julho
 *     (R$ 490.496,32) foi quase o dobro da de junho (R$ 251.335,60, implicita no
 *     ISSQN de R$ 12.566,78 a 5%). Dois metodos independentes batem:
 *       A) razao DAS/ISSQN dos ultimos 3 meses (2,3019) x R$ 24.524,81 = R$ 56.454
 *       B) aliquota efetiva do DAS de junho (11,40%) x base de julho     = R$ 55.932
 *     Adotado R$ 56.000 (era R$ 28.000).
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

const upd = async (chave, patch, rotulo) => {
  const { data } = await sb.from('erp_contas_pagar')
    .select('id,descricao,valor,vencimento,tags,observacoes,status').eq('numero_documento', chave).limit(1)
  if (!data?.length) { console.log('NAO ENCONTRADO: ' + chave); return }
  const cp = data[0]
  console.log(rotulo)
  console.log('   de: ' + cp.vencimento + '  R$ ' + Number(cp.valor).toFixed(2).padStart(10) + '  ' + cp.descricao)
  console.log('   pa: ' + (patch.vencimento || cp.vencimento) + '  R$ ' + Number(patch.valor).toFixed(2).padStart(10) + '  ' + (patch.descricao || cp.descricao))
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').update({
      ...patch, observacoes: (patch.observacoes || cp.observacoes),
    }).eq('id', cp.id)
    if (error) { console.error('   ERRO:', error.message); process.exitCode = 1 }
  }
}

/* ---------- 1) ISSQN: valor real ---------- */
await upd('imp-jul:issqn', {
  descricao: 'ISSQN ref. julho/2026 - guia 1674646 SEFAZ Campo Grande',
  valor: 24524.81, vencimento: '2026-08-17',
  numero_documento: 'imp-jul:issqn',
  nota_fiscal: '1674646',
  tags: ['a-pagar', 'imposto', '2026', 'julho'],
  observacoes: '[CP-AGO-2026] VALOR FIRME (guia recebida em 11/08). Guia de Recolhimento n. 1674646, Prefeitura Municipal de Campo Grande / SEFAZ. Competencia 07/2026, ISSQN HOMOLOGADO. Receita tributada R$ 490.496,32, aliquota 5,00%. Nao receber apos 17/08/2026. Inscricao municipal 00271430000. Substituiu a estimativa de R$ 12.000,00 com vencimento em 13/08.',
}, '--- 1) ISSQN: estimativa -> guia real ---')

/* ---------- 2) Simples Nacional: recalibrado pela base da guia ---------- */
await upd('imp-jul:simples', {
  descricao: 'Simples Nacional (DAS) ref. julho/2026 (ESTIMADO)',
  valor: 56000, vencimento: '2026-08-20',
  observacoes: '[CP-AGO-2026] ESTIMATIVA RECALIBRADA em 11/08, quando a guia do ISSQN revelou a base tributada real de julho: R$ 490.496,32, quase o dobro da de junho (R$ 251.335,60, implicita no ISSQN de R$ 12.566,78 a 5%). Dois metodos independentes convergem: (A) a razao DAS/ISSQN se manteve em 2,30 nos ultimos tres meses (2,329 / 2,297 / 2,281) e 2,3019 x R$ 24.524,81 da R$ 56.454; (B) a aliquota efetiva do DAS de junho foi 11,40% e 11,40% x R$ 490.496,32 da R$ 55.932. Adotado R$ 56.000. A estimativa anterior de R$ 28.000 partia da receita que entrou em caixa (R$ 301.988) e nao da receita por competencia - por isso ficou pela metade. CONFIRMAR a guia com o contador.',
}, '\n--- 2) Simples Nacional: R$ 28.000 -> R$ 56.000 ---')

/* ---------- resumo ---------- */
const { data: cp } = await sb.from('erp_contas_pagar').select('valor,valor_pago,tags')
  .lte('vencimento', '2026-08-31').in('status', ['aberto', 'vencido', 'parcial'])
const tot = cp.reduce((s, c) => s + Number(c.valor) - Number(c.valor_pago || 0), 0)
const est = cp.filter(c => (c.tags || []).includes('estimado')).reduce((s, c) => s + Number(c.valor) - Number(c.valor_pago || 0), 0)
console.log('\nA pagar ate 31/08: R$ ' + tot.toFixed(2) + '  (firme R$ ' + (tot - est).toFixed(2) + ' + estimado R$ ' + est.toFixed(2) + ')')
console.log(APPLY ? 'APLICADO' : 'DRY-RUN')
