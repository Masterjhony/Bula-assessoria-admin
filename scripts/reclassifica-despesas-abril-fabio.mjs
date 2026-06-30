// Reclassifica "DESPESAS ABRIL FABIO" de "Comissão Funcionário" para
// "Despesa Operacional Leilão" — reembolso de viagem/combustível não é comissão
// e estava inflando a linha de comissão no DRE. Alinha com o lançamento de junho.
// Uso: DRY_RUN=1 node scripts/reclassifica-despesas-abril-fabio.mjs | sem DRY_RUN grava.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const CAT_OP_LEILAO = '562264eb-8134-4990-a56b-d884279acf90' // Despesa Operacional Leilão
const CC_COMISSAO = '52dd8ed0-0c0a-4524-86bd-01dc121487b3'   // COM02 Comissão Assessores
const PLANO_ADM = '8689266d-f98d-475d-ae09-5e8369a55640'     // 4.3 Despesas Administrativas

const { data: rows } = await sb.from('erp_contas_pagar').select('id,descricao,valor,categoria_id').ilike('descricao', '%DESPESAS ABRIL FABIO%')
console.log('Encontrados:', (rows || []).length)
for (const r of rows || []) console.log('  ', r.id, r.descricao, r.valor, 'cat=' + r.categoria_id)
if (!rows?.length) { console.log('Nada a fazer.'); process.exit(0) }
if (DRY_RUN) { console.log('[DRY_RUN] não gravado.'); process.exit(0) }
for (const r of rows) {
  const { error } = await sb.from('erp_contas_pagar').update({ categoria_id: CAT_OP_LEILAO, centro_custo_id: CC_COMISSAO, plano_conta_id: PLANO_ADM, updated_at: new Date().toISOString() }).eq('id', r.id)
  if (error) { console.error('Erro:', error.message); process.exit(1) }
  console.log('-> reclassificado', r.id)
}
console.log('OK.')
