// "Comissão a Pagar" tem que mostrar o que está EM ABERTO. As comissões do Rusa
// de maio/junho já foram quitadas no acerto consolidado (CP BULA-2026-CP-COM-
// RUSA-MAIJUN, R$ 64.945, pago 30/06) — ficam marcadas como pagas (pago: true)
// e saem do "a pagar", sem sumir do histórico do leilão.
//
// Em aberto do Rusa = R$ 17.400 (lista ⛔️ do chefe):
//   EAO Baviera Fêmeas 11/07 = 13.125 (já lançado)
//   2ª Etapa Naviraí Matrizes 16/07 = 4.275 (lançado aqui — só existia o CP)
//
// Uso: node scripts/marca-comissoes-pagas-rusa-2026-07-22.mjs --apply  (sem flag = dry-run)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const PAGO_REF = 'Acerto maio/junho — CP BULA-2026-CP-COM-RUSA-MAIJUN (R$ 64.945,00), pago em 30/06/2026.'
const r2 = (n) => Math.round(n * 100) / 100

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
console.log(APPLY ? '>>> APPLY' : '>>> DRY-RUN (use --apply)')

// 1) Rusa em mai/jun -> pago
const { data: fechs, error } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,por_assessor').gte('data', '2026-05-01').lt('data', '2026-07-01').order('data')
if (error) throw error
let totalPago = 0
for (const f of fechs) {
  const ass = JSON.parse(JSON.stringify(f.por_assessor || []))
  const rusa = ass.find((a) => /RUSA/i.test(a.nome || ''))
  if (!rusa || !(Number(rusa.comissao) > 0) || rusa.pago === true) continue
  rusa.pago = true
  rusa.pago_ref = PAGO_REF
  totalPago += Number(rusa.comissao)
  console.log(`${f.data} ${f.nome.slice(0, 45)}: Rusa ${rusa.comissao} -> PAGO`)
  if (APPLY) {
    const { error: e2 } = await sb.from('bula_leilao_fechamento').update({ por_assessor: ass }).eq('id', f.id)
    if (e2) throw e2
  }
}
console.log(`Total marcado como pago: ${r2(totalPago)}`)

// 2) Naviraí Matrizes 16/07 — Rusa 4.275 (lotes 8 e 80, Dr Celso Lopes)
{
  const ID = '0ba4d4d9-0235-4cfe-9db4-ae49208e7f75'
  const { data: f, error: e3 } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,vgv_total,comissao_assessoria,por_assessor').eq('id', ID).single()
  if (e3) throw e3
  if ((f.por_assessor || []).some((a) => /RUSA/i.test(a.nome || ''))) console.log('\n= Naviraí: Rusa já lançado')
  else {
    const ass = [...(f.por_assessor || []), {
      vgv: 85500, nome: 'Gustavo Rusa', empresa: 'Bula Assessoria', comissao: 4275, comissao_pct: 0.05,
      animais: 2, transacoes: 2, ticket_medio: 42750,
      observacao: '[LISTA-RUSA 22/07] Lotes 8 (1.550) e 80 (1.300) Dr Celso Lopes = 2.850 × 30 = 85.500 × 5%. Item ⛔️ EM ABERTO da lista do chefe. CP BULA-2026-CP-COM-RUSA-NAVIRAI-MATRIZES-JUL (venc. 27/07).',
    }].sort((a, b) => (Number(b.vgv) || 0) - (Number(a.vgv) || 0)).map((a, i) => ({ ...a, posicao: i + 1 }))
    const vgvTotal = r2(ass.reduce((s, a) => s + (Number(a.vgv) || 0), 0))
    const comTotal = r2(ass.reduce((s, a) => s + (Number(a.comissao) || 0), 0))
    console.log(`\nNaviraí 16/07: + Rusa 85.500 / 4.275 | vgv ${f.vgv_total} -> ${vgvTotal}, comissao ${f.comissao_assessoria} -> ${comTotal}`)
    if (APPLY) {
      const { error: e4 } = await sb.from('bula_leilao_fechamento')
        .update({ por_assessor: ass, vgv_total: vgvTotal, comissao_assessoria: comTotal }).eq('id', ID)
      if (e4) throw e4
    }
  }
}
console.log('\nEm aberto do Rusa após isso: 13.125 (EAO Fêmeas 11/07) + 4.275 (Naviraí 16/07) = 17.400.')
console.log('Feito.' + (APPLY ? '' : ' (dry-run)'))
