// Cria a CP de folha de JUNHO/2026 da Ana Paula (financeiro) e amarra ao movimento
// do Sicoob de 02/07 (Pix R$ 6.000 "Salario Mes de Junho", ***.308.191-**).
// Ana Paula Porfirio Munhoz — CPF 005.308.191-98 (id 54930f05).
// Espelha as demais CPs BULA-2026-CP-FOLHA-JUN-* (categoria Folha, sem centro de custo).
// Idempotente (CP por numero_documento; link por movimento). DRY_RUN=1 p/ revisar.
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

const FORN_ANAPAULA = '54930f05-2c1b-47a3-bc86-882aba3d784c'
const CAT_FOLHA = '4c79d95f-a8a4-4aff-9f7a-cd82f974c4b3'
const MOV_ID = 'f943b771-fa57-48ab-9677-101ab57794a1'
const DOC = 'BULA-2026-CP-FOLHA-JUN-ANAPAULA'
const VALOR = 6000

const cp = {
  descricao: 'Folha Junho/2026 - ANA PAULA', fornecedor_id: FORN_ANAPAULA, categoria_id: CAT_FOLHA,
  valor: VALOR, emissao: '2026-06-30', vencimento: '2026-06-30', status: 'pago',
  data_pagamento: '2026-07-02', valor_pago: VALOR, forma_pagamento: 'pix',
  numero_documento: DOC, parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
  observacoes: 'Folha jun/2026 Ana Paula Porfirio Munhoz (financeiro). Paga por Pix 02/07 (***.308.191-**). CP criada 06/07 p/ amarrar o pagamento do extrato.',
  tags: ['a-pagar', 'folha', '2026'],
}

console.log(`${DRY_RUN ? '*** DRY RUN ***' : '*** GRAVANDO ***'}  CP folha Ana Paula ${brl(VALOR)}`)
let cpId
const { data: ex } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', DOC).maybeSingle()
if (ex) { cpId = ex.id; console.log('[=] CP ja existe', DOC) }
else if (DRY_RUN) { console.log('[+] criaria CP', DOC) }
else { const { data, error } = await sb.from('erp_contas_pagar').insert(cp).select('id').single(); if (error) throw new Error(error.message); cpId = data.id; console.log('[+] CP criada', cpId) }

if (!DRY_RUN && cpId) {
  const { error } = await sb.from('erp_movimentos_bancarios').update({
    conta_pagar_id: cpId, status_conciliacao: 'conciliado', conciliado: true,
    observacoes: 'Extrato Sicoob 30/06-06/07 (lido 06/07) | Pix 6.000 | Salario jun/2026 ANA PAULA (financeiro, ***.308.191-**) | Conciliacao: casado com CP ' + DOC,
    updated_at: new Date().toISOString(),
  }).eq('id', MOV_ID)
  if (error) throw new Error(error.message)
  console.log('[~] movimento 02/07 6.000 CONCILIADO com', DOC)
}
console.log(DRY_RUN ? '\n[DRY_RUN] nada gravado.' : '\nConcluido.')
