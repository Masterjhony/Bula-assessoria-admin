// Chefe/Joao Eduardo confirmou em 04/08/2026: o pix de 5.000 de 03/08
// ("salario Julho nfs 3 2026", CPF ***.037.156) e o salario do JOAO EDUARDO,
// que passou de 3.000 para 5.000 desde a competencia JULHO/2026.
//
// Faz: (1) CP Folha Julho JOAO EDUARDO 3.000 -> 5.000, paga 03/08 e vinculada
// ao movimento (que sai de 'pendente' para 'conciliado'); (2) CPs de folha
// ago-dez dele 3.000 -> 5.000; (3) erp_folha_estrutura fixo -> 5.000.
// Idempotente. Uso: DRY_RUN=1 node scripts/folha-joao-eduardo-5000-2026-08-04.mjs
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const now = () => new Date().toISOString()
const MARK = '[FOLHA-JE-5000 04/08]'
const NOTA = 'Joao Eduardo confirmou em 04/08/2026: salario passou de 3.000 para 5.000 desde a competencia julho/2026 (pix 5.000 de 03/08, "salario Julho nfs 3 2026", CPF ***.037.156).'
const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'

console.log(DRY_RUN ? '*** DRY RUN ***\n' : '*** GRAVANDO ***\n')

// 1) CP de julho: 3.000 -> 5.000, paga em 03/08, vinculada ao movimento
const { data: cpJul } = await sb.from('erp_contas_pagar').select('*')
  .ilike('descricao', 'Folha Julho/2026 - JO%O EDUARDO').maybeSingle()
if (!cpJul) throw new Error('CP Folha Julho JOAO EDUARDO nao encontrada')

const { data: mov } = await sb.from('erp_movimentos_bancarios').select('*')
  .eq('conta_bancaria_id', SICOOB).eq('data', '2026-08-03').eq('tipo', 'saida').eq('valor', 5000)
  .ilike('descricao', '%037.156%').maybeSingle()
if (!mov) throw new Error('Movimento de 5.000 de 03/08 nao encontrado')

if (cpJul.status !== 'pago') {
  console.log(`[~] CP ${cpJul.id.slice(0, 8)} Folha Julho JOAO EDUARDO: ${brl(cpJul.valor)} -> ${brl(5000)}, paga 03/08`)
  if (!DRY_RUN) {
    const { error } = await sb.from('erp_contas_pagar').update({
      valor: 5000, valor_pago: 5000, status: 'pago', data_pagamento: '2026-08-03',
      forma_pagamento: 'pix', conta_bancaria_id: SICOOB,
      observacoes: `${cpJul.observacoes ? cpJul.observacoes + ' ' : ''}${MARK} ${NOTA}`, updated_at: now(),
    }).eq('id', cpJul.id)
    if (error) throw new Error(`CP julho: ${error.message}`)
  }
} else console.log('[=] CP de julho ja paga')

if (mov.status_conciliacao !== 'conciliado') {
  console.log(`[~] mov ${mov.id.slice(0, 8)} 5.000 de 03/08 -> conciliado (JOAO EDUARDO)`)
  if (!DRY_RUN) {
    const { error } = await sb.from('erp_movimentos_bancarios').update({
      descricao: 'PIX EMIT.OUTRA IF - salario Julho JOAO EDUARDO (nfs 3 2026)',
      status_conciliacao: 'conciliado', conciliado: true, conta_pagar_id: cpJul.id,
      observacoes: `${mov.observacoes ? mov.observacoes + ' ' : ''}${MARK} ${NOTA}`, updated_at: now(),
    }).eq('id', mov.id)
    if (error) throw new Error(`mov: ${error.message}`)
  }
} else console.log('[=] movimento ja conciliado')

// 2) Folhas ago-dez: 3.000 -> 5.000
const { data: futuras } = await sb.from('erp_contas_pagar').select('id,descricao,valor,status')
  .ilike('descricao', 'Folha %/2026 - JO%O EDUARDO').neq('status', 'pago').neq('status', 'cancelado')
for (const cp of futuras || []) {
  if (Number(cp.valor) === 5000) { console.log(`[=] ${cp.descricao} ja em 5.000`); continue }
  console.log(`[~] ${cp.descricao}: ${brl(cp.valor)} -> ${brl(5000)}`)
  if (!DRY_RUN) {
    const { error } = await sb.from('erp_contas_pagar').update({ valor: 5000, updated_at: now() }).eq('id', cp.id)
    if (error) throw new Error(`${cp.descricao}: ${error.message}`)
  }
}

// 3) Estrutura de folha
const { data: est } = await sb.from('erp_folha_estrutura').select('id,nome,salario_fixo')
  .ilike('nome', 'JO%O EDUARDO').maybeSingle()
if (est && Number(est.salario_fixo) !== 5000) {
  console.log(`[~] estrutura: ${est.nome} fixo ${brl(est.salario_fixo)} -> ${brl(5000)}`)
  if (!DRY_RUN) {
    const { error } = await sb.from('erp_folha_estrutura').update({ salario_fixo: 5000, updated_at: now() }).eq('id', est.id)
    if (error) throw new Error(`estrutura: ${error.message}`)
  }
} else console.log('[=] estrutura ja em 5.000 (ou nao encontrada)')

// Validacao: saldo nao muda (movimento ja existia); folha nova mensal
const { data: rec, error: eRec } = DRY_RUN ? { data: null, error: null } : await sb.rpc('erp_recalc_saldo', { p_conta: SICOOB })
if (eRec) throw new Error(eRec.message)
if (!DRY_RUN) console.log(`\nSaldo Sicoob apos (nao deve mudar): ${brl(rec)} (esperado R$ 500,86)`)
console.log('Folha mensal nova: 7.000 + 13.500 + 3.600 + 5.000 + 2.000 + 2.000 = R$ 33.100,00')
