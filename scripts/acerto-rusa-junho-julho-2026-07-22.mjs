// Acerto GUSTAVO RUSA conforme lista do chefe (22/07/2026):
//   ✅ pagos = R$ 64.945 — bate exato com o CP BULA-2026-CP-COM-RUSA-MAIJUN (pago 30/06).
//   ⛔️ em aberto = R$ 17.400: Matrizes Navirai 16/07 (4.275) + Fêmeas EAO 11/07 (13.125).
//
// O que faz:
//   1. Santa Nice 06/06 + JMP Bezerras 13/06: as vendas que haviam sido marcadas
//      como "canceladas" (lotes dos compradores Dr Celso Lopes / Pedro Pontes / C+4)
//      são na verdade VENDAS DO RUSA — reatribui os lances a ele, restaura o
//      vgv_total e cria entrada por_assessor com comissão 0 (os 5% já foram pagos
//      no acerto MAIJUN; zerada p/ não duplicar). Douglas segue fora (28.493 ok).
//   2. EAO Fêmeas 11/07: lotes 20/27/28/31/36 (Dr Celso) + 135 (Pedro Pontes)
//      saem do Douglas (307.500 -> 45.000; 2% -> 900) e viram Gustavo Rusa
//      (262.500 a 5% = 13.125).
//   3. Cria 2 CPs abertos venc. 27/07: EAO Fêmeas 13.125 + Matrizes Navirai 4.275
//      (fechamento do Navirai 16/07 ainda não cadastrado — só o CP, com nota).
//
// Uso: node scripts/acerto-rusa-junho-julho-2026-07-22.mjs --apply   (sem flag = dry-run)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.argv.includes('--apply')
const MARK = '[ACERTO-RUSA 22/07]'
const RUSA_ID = 'a2c9ec8c-27c0-40f4-a944-0cdcf25c6134'
const CAT_ID = '5dcdc58a-d81b-4a4c-a81a-5e703e6a1a90'
const r2 = (n) => Math.round(n * 100) / 100

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
console.log(APPLY ? '>>> APPLY' : '>>> DRY-RUN (use --apply)')

async function getFech(id) {
  const { data, error } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,vgv_total,comissao_assessoria,por_assessor,lances').eq('id', id).single()
  if (error) throw error
  return data
}
async function saveFech(id, patch) {
  if (!APPLY) return
  const { error } = await sb.from('bula_leilao_fechamento').update(patch).eq('id', id)
  if (error) throw error
}

// --- 1a. Santa Nice: lances cancelados (ex-Douglas) -> Gustavo Rusa, vgv restaurado ---
{
  const f = await getFech('982e286e-7741-480a-bfc9-cf01f7f428ce')
  if ((f.por_assessor || []).some((a) => /RUSA/i.test(a.nome || ''))) console.log('= Santa Nice: Rusa já lançado')
  else {
    const lances = (f.lances || []).map((v) => v && v.cancelada && /DOUGLAS/i.test(v.assessor || '')
      ? { lote: v.lote, comprador: v.comprador, uf: v.uf, animais: v.animais, vgv: v.vgv, assessor: 'Gustavo Rusa' } : v)
    const rusaLances = lances.filter((v) => v && v.assessor === 'Gustavo Rusa')
    const vgvRusa = rusaLances.reduce((s, v) => s + (Number(v.vgv) || 0), 0)
    const ass = [...(f.por_assessor || []), {
      vgv: vgvRusa, nome: 'Gustavo Rusa', empresa: 'Outro', comissao: 0, comissao_pct: 0.05,
      animais: rusaLances.reduce((s, v) => s + (Number(v.animais) || 0), 0), transacoes: rusaLances.length,
      observacao: `${MARK} Lotes 38/15/5 (Dr Celso Lopes) + 47 (Pedro Pontes) — vendas do Rusa, não cancelamento. 5% (R$ 8.400) JÁ PAGO no acerto maio/junho (CP BULA-2026-CP-COM-RUSA-MAIJUN, 64.945, pago 30/06) — comissão zerada aqui p/ não duplicar.`,
    }].sort((a, b) => (Number(b.vgv) || 0) - (Number(a.vgv) || 0)).map((a, i) => ({ ...a, posicao: i + 1 }))
    const vgvTotal = r2(ass.reduce((s, a) => s + (Number(a.vgv) || 0), 0))
    console.log(`Santa Nice: Rusa +${vgvRusa} (${rusaLances.length} lances restaurados); vgv_total ${f.vgv_total} -> ${vgvTotal}; comissao mantida ${f.comissao_assessoria}`)
    await saveFech(f.id, { por_assessor: ass, vgv_total: vgvTotal, lances })
  }
}

// --- 1b. JMP Bezerras: idem (lote 20, C+4, 126.000) ---
{
  const f = await getFech('cd19dba3-792d-42e3-a563-f6025528dd51')
  if ((f.por_assessor || []).some((a) => /RUSA/i.test(a.nome || ''))) console.log('= JMP Bezerras: Rusa já lançado')
  else {
    const lances = (f.lances || []).map((v) => v && v.cancelada && /DOUGLAS/i.test(v.assessor || '')
      ? { lote: v.lote, comprador: v.comprador, uf: v.uf, animais: v.animais, vgv: v.vgv, assessor: 'Gustavo Rusa' } : v)
    const rusaLances = lances.filter((v) => v && v.assessor === 'Gustavo Rusa')
    const vgvRusa = rusaLances.reduce((s, v) => s + (Number(v.vgv) || 0), 0)
    const ass = [...(f.por_assessor || []), {
      vgv: vgvRusa, nome: 'Gustavo Rusa', empresa: 'Outro', comissao: 0, comissao_pct: 0.05,
      animais: rusaLances.reduce((s, v) => s + (Number(v.animais) || 0), 0), transacoes: rusaLances.length,
      observacao: `${MARK} Lote 20 (C+4, 4.200x30) — venda do Rusa, não cancelamento. 5% (R$ 6.300) JÁ PAGO no acerto maio/junho (CP BULA-2026-CP-COM-RUSA-MAIJUN) — comissão zerada aqui p/ não duplicar.`,
    }].sort((a, b) => (Number(b.vgv) || 0) - (Number(a.vgv) || 0)).map((a, i) => ({ ...a, posicao: i + 1 }))
    const vgvTotal = r2(ass.reduce((s, a) => s + (Number(a.vgv) || 0), 0))
    console.log(`JMP Bezerras: Rusa +${vgvRusa}; vgv_total ${f.vgv_total} -> ${vgvTotal}; comissao mantida ${f.comissao_assessoria}`)
    await saveFech(f.id, { por_assessor: ass, vgv_total: vgvTotal, lances })
  }
}

// --- 2. EAO Fêmeas 11/07: lotes 20/27/28/31/36/135 saem do Douglas -> Rusa 5% ---
{
  const f = await getFech('135016c0-c0be-4e28-b80a-7fca4b759d1e')
  if ((f.por_assessor || []).some((a) => /RUSA/i.test(a.nome || ''))) console.log('= EAO Fêmeas: Rusa já lançado')
  else {
    const LOTES = new Set(['20', '27', '28', '31', '36', '135'])
    const lances = (f.lances || []).map((v) => v && LOTES.has(String(v.lote)) && /DOUGLAS/i.test(v.assessor || '')
      ? { ...v, assessor: 'Gustavo Rusa' } : v)
    const rusaLances = lances.filter((v) => v && v.assessor === 'Gustavo Rusa')
    const vgvRusa = rusaLances.reduce((s, v) => s + (Number(v.vgv) || 0), 0)
    const dougLances = lances.filter((v) => v && /DOUGLAS/i.test(v.assessor || ''))
    const vgvDoug = dougLances.reduce((s, v) => s + (Number(v.vgv) || 0), 0)
    if (vgvRusa !== 262500 || vgvDoug !== 45000) { console.log(`!! EAO Fêmeas: somas inesperadas (Rusa ${vgvRusa}, Douglas ${vgvDoug}) — abortando este fechamento`) }
    else {
      const ass = (f.por_assessor || []).map((a) => /DOUGLAS/i.test(a.nome || '')
        ? { ...a, vgv: 45000, comissao: 900, transacoes: dougLances.length, animais: dougLances.reduce((s, v) => s + (Number(v.animais) || 0), 0), observacao: `${MARK} Lotes 20/27/28/31/36/135 (262.500) reatribuídos ao Gustavo Rusa (compradores dele, 5%). Douglas fica só com o M13 (45.000 x 2% = 900).` }
        : a)
      ass.push({
        vgv: vgvRusa, nome: 'Gustavo Rusa', empresa: 'Outro', comissao: 13125, comissao_pct: 0.05,
        animais: rusaLances.reduce((s, v) => s + (Number(v.animais) || 0), 0), transacoes: rusaLances.length,
        observacao: `${MARK} Lotes 20/27/28/31/36 (Dr Celso Lopes) + 135 (Pedro Pontes) = 262.500 x 5% = 13.125. CP BULA-2026-CP-COM-RUSA-EAO-FEMEAS-JUL (venc. 27/07).`,
      })
      const ordered = ass.sort((a, b) => (Number(b.vgv) || 0) - (Number(a.vgv) || 0)).map((a, i) => ({ ...a, posicao: i + 1 }))
      const comTotal = r2(ordered.reduce((s, a) => s + (Number(a.comissao) || 0), 0))
      const vgvTotal = r2(ordered.reduce((s, a) => s + (Number(a.vgv) || 0), 0))
      console.log(`EAO Fêmeas: Douglas 307.500->45.000 (6.150->900); Rusa +262.500 (13.125); comissao ${f.comissao_assessoria} -> ${comTotal}; vgv_total ${f.vgv_total} -> ${vgvTotal}`)
      await saveFech(f.id, { por_assessor: ordered, comissao_assessoria: comTotal, vgv_total: vgvTotal, lances })
    }
  }
}

// --- 3. CPs em aberto (venc. 27/07) ---
const CPS = [
  { doc: 'BULA-2026-CP-COM-RUSA-EAO-FEMEAS-JUL', valor: 13125, desc: 'COMISSAO PARCEIRO GUSTAVO RUSA (5%) - MEGA EVENTO EAO BAVIERA FEMEAS - 11/07/2026', obs: 'Lotes 20/27/28/31/36 (Dr Celso Lopes) + 135 (Pedro Pontes), base 262.500 x 5%. Item ⛔️ do acerto do chefe 22/07 (R$ 17.400 em aberto). Vinculado ao fechamento 135016c0-c0be-4e28-b80a-7fca4b759d1e.' },
  { doc: 'BULA-2026-CP-COM-RUSA-NAVIRAI-MATRIZES-JUL', valor: 4275, desc: 'COMISSAO PARCEIRO GUSTAVO RUSA (5%) - MATRIZES NAVIRAI - 16/07/2026', obs: 'Lotes 8 (1.550x30) e 80 (1.300x30) Dr Celso Lopes, base 85.500 x 5%. Item ⛔️ do acerto do chefe 22/07. Fechamento do leilão Matrizes Navirai 16/07 ainda não cadastrado — ao criar, lançar Gustavo Rusa 85.500/4.275.' },
]
for (const c of CPS) {
  const { data: exists } = await sb.from('erp_contas_pagar').select('id,valor,status').eq('numero_documento', c.doc).maybeSingle()
  if (exists) { console.log(`= já existe ${c.doc} (${exists.valor}, ${exists.status})`); continue }
  console.log(`+ CP ${c.doc}: ${c.valor} venc. 2026-07-27`)
  if (APPLY) {
    const { error } = await sb.from('erp_contas_pagar').insert({
      descricao: c.desc, fornecedor_id: RUSA_ID, categoria_id: CAT_ID,
      valor: c.valor, emissao: '2026-07-22', vencimento: '2026-07-27', status: 'aberto',
      numero_documento: c.doc, observacoes: `${MARK} ${c.obs}`,
    })
    if (error) throw error
  }
}
console.log('Feito.' + (APPLY ? '' : ' (dry-run)'))
