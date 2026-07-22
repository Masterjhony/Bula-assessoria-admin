// Planilha "COMISSAO LEONARDO" (chefe, 22/07): junho do Leo = R$ 21.788.
// Única divergência vs sistema: Santa Nice ex-dupla ("eram do Marcelo")
// cai de 279.000/5.580 para 94.500/1.890 (2%). Ajusta fechamento + CP.
// Uso: node scripts/ajusta-leo-santa-nice-2026-07-22.mjs --apply   (sem flag = dry-run)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const MARK = '[PLANILHA-LEO 22/07]'
const r2 = (n) => Math.round(n * 100) / 100

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
console.log(APPLY ? '>>> APPLY' : '>>> DRY-RUN (use --apply)')

const ID = '982e286e-7741-480a-bfc9-cf01f7f428ce' // Santa Nice 06/06
const { data: f, error } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,vgv_total,comissao_assessoria,por_assessor').eq('id', ID).single()
if (error) throw error
const leo = (f.por_assessor || []).find((a) => /^LEONARDO SERAFIM$/i.test((a.nome || '').trim()))
if (!leo) { console.log('!! entrada do Leonardo não encontrada'); process.exit(1) }
if (leo.vgv === 94500) { console.log('= já ajustado (94.500)'); process.exit(0) }

console.log(`Santa Nice/Leonardo: vgv ${leo.vgv} -> 94500, comissao ${leo.comissao} -> 1890`)
leo.vgv = 94500; leo.comissao = 1890; leo.comissao_pct = 0.02
leo.observacao = `${MARK} Planilha COMISSAO LEONARDO (chefe 22/07): vendas ex-Marcelo em Santa Nice valem 94.500 x 2% = 1.890 (antes 279.000/5.580 — diferença de 184.500 não confirmada na planilha; lances do pregão mantidos p/ auditoria). ${leo.observacao || ''}`.trim()

const ass = (f.por_assessor || []).sort((a, b) => (Number(b.vgv) || 0) - (Number(a.vgv) || 0)).map((a, i) => ({ ...a, posicao: i + 1 }))
const vgvTotal = r2(ass.reduce((s, a) => s + (Number(a.vgv) || 0), 0))
const comTotal = r2(ass.reduce((s, a) => s + (Number(a.comissao) || 0), 0))
console.log(`vgv_total ${f.vgv_total} -> ${vgvTotal}; comissao_assessoria ${f.comissao_assessoria} -> ${comTotal}`)
if (APPLY) {
  const { error: e2 } = await sb.from('bula_leilao_fechamento')
    .update({ por_assessor: ass, vgv_total: vgvTotal, comissao_assessoria: comTotal }).eq('id', ID)
  if (e2) throw e2
}

const DOC = 'BULA-2026-CP-COM-SANTA-NICE-MARCELO-CARNEIRO-LEONARD'
const { data: cp } = await sb.from('erp_contas_pagar').select('id,valor,status,observacoes').eq('numero_documento', DOC).maybeSingle()
if (!cp) console.log('!! CP não encontrado:', DOC)
else if (cp.status === 'pago') console.log(`!! CP já PAGO (${cp.valor}) — conferir manualmente`)
else {
  console.log(`CP ${DOC}: ${cp.valor} -> 1890`)
  if (APPLY) {
    const { error: e3 } = await sb.from('erp_contas_pagar')
      .update({ valor: 1890, observacoes: `${MARK} Ajustado de 5.580 p/ 1.890 (base 94.500 x 2%) conforme planilha COMISSAO LEONARDO. Junho do Leo fecha em 21.788.\n${cp.observacoes || ''}`.trim() }).eq('id', cp.id)
    if (e3) throw e3
  }
}
console.log('Feito.' + (APPLY ? ' Leo junho: 18.866 + 1.890 + 1.032 = 21.788.' : ' (dry-run)'))
