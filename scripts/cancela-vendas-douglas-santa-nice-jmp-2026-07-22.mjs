// Confirmação do chefe (22/07): as vendas do Douglas em Santa Nice (168.000) e
// JMP Bezerras (126.000) foram CANCELADAS — a planilha dele (28.493) é a final.
//   - Remove a entrada do Douglas do por_assessor dos 2 fechamentos, recalcula
//     vgv_total/comissao_assessoria e marca os lances dele como cancelada
//     (visíveis riscados na seção "Vendas do pregão").
//   - CPs BULA-2026-CP-COM-SANTA-NICE-DOUGLAS-BISPO (3.360) e
//     BULA-2026-CP-COM-JMP-FEMEAS-DOUGLAS (2.520) -> status 'cancelado' c/ nota.
// Uso: node scripts/cancela-vendas-douglas-santa-nice-jmp-2026-07-22.mjs --apply  (sem flag = dry-run)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const MOTIVO = 'Venda cancelada — confirmado pelo chefe 22/07/2026 (não consta na planilha de fechamento do Douglas; comissão final dele em junho = R$ 28.493).'
const r2 = (n) => Math.round(n * 100) / 100
const isDouglas = (s) => /DOUGLAS/i.test(String(s || ''))

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

console.log(APPLY ? '>>> APPLY' : '>>> DRY-RUN (use --apply)')

const IDS = ['982e286e-7741-480a-bfc9-cf01f7f428ce', 'cd19dba3-792d-42e3-a563-f6025528dd51'] // Santa Nice, JMP Bezerras
for (const id of IDS) {
  const { data: f, error } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,vgv_total,comissao_assessoria,por_assessor,lances').eq('id', id).single()
  if (error) throw error
  const antes = (f.por_assessor || []).find((a) => isDouglas(a.nome))
  if (!antes) { console.log(`= ${f.nome}: Douglas já não está no por_assessor`); continue }
  const ass = (f.por_assessor || []).filter((a) => !isDouglas(a.nome)).map((a, i) => ({ ...a, posicao: i + 1 }))
  const vgvTotal = r2(ass.reduce((s, a) => s + (Number(a.vgv) || 0), 0))
  const comTotal = r2(ass.reduce((s, a) => s + (Number(a.comissao) || 0), 0))
  const lances = (f.lances || []).map((v) => isDouglas(v && v.assessor) && !v.cancelada
    ? { ...v, cancelada: true, cancelada_motivo: MOTIVO, cancelada_em: '2026-07-22' } : v)
  const nCanc = lances.filter((v) => v && v.cancelada && isDouglas(v.assessor)).length
  console.log(`${f.nome}: remove Douglas (vgv ${antes.vgv}, comissao ${antes.comissao}); vgv_total ${f.vgv_total} -> ${vgvTotal}; comissao ${f.comissao_assessoria} -> ${comTotal}; lances cancelados: ${nCanc}`)
  if (APPLY) {
    const { error: e2 } = await sb.from('bula_leilao_fechamento')
      .update({ por_assessor: ass, vgv_total: vgvTotal, comissao_assessoria: comTotal, lances }).eq('id', id)
    if (e2) throw e2
  }
}

for (const doc of ['BULA-2026-CP-COM-SANTA-NICE-DOUGLAS-BISPO', 'BULA-2026-CP-COM-JMP-FEMEAS-DOUGLAS']) {
  const { data: cp, error } = await sb.from('erp_contas_pagar').select('id,valor,status,observacoes').eq('numero_documento', doc).maybeSingle()
  if (error) throw error
  if (!cp) { console.log('!! CP não encontrado:', doc); continue }
  if (cp.status === 'pago') { console.log(`!! ${doc} já PAGO — não alterado, conferir`); continue }
  console.log(`CP ${doc} (${cp.valor}): ${cp.status} -> cancelado`)
  if (APPLY) {
    const { error: e2 } = await sb.from('erp_contas_pagar')
      .update({ status: 'cancelado', observacoes: `[CANCELADO 22/07/2026] ${MOTIVO}\n${cp.observacoes || ''}`.trim() }).eq('id', cp.id)
    if (e2) throw e2
  }
}
console.log('Feito.' + (APPLY ? ' Douglas junho = 28.493 (bate com a planilha).' : ' (dry-run)'))
