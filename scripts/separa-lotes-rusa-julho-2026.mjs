// Separa os lotes do Gustavo Rusa (compradores que ele direciona) das vendas do
// Douglas Bispo em julho/2026 — em TODAS as ocorrências: lances[], por_assessor[],
// comissao_assessoria e sobra_bruta do fechamento, e os títulos de comissão do ERP.
//
// Base: conferência de 24/08/2026 (Conferencia-Comissao-Douglas-Julho-2026.pdf).
// Os títulos de 5% do Rusa que cobrem estas mesmas bases JÁ FORAM PAGOS em 10/08
// (PIX 29.535,00 à Rusa Assessoria, NF 34) — este script NÃO cria CP do Rusa.
//
// Uso: node scripts/separa-lotes-rusa-julho-2026.mjs           (dry-run, não grava)
//      node scripts/separa-lotes-rusa-julho-2026.mjs --aplicar (grava + backup)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const APLICAR = process.argv.includes('--aplicar')
const INCLUI_GUADALUPE_20 = process.argv.includes('--com-guadalupe-20')
const MARCA = '[RUSA-SEP 24/08]'
const RUSA = 'Gustavo Rusa'
const PCT_RUSA = 0.05
const OUT = 'outputs/rusa-separacao-2026-08-24'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n) => Math.round(n * 100) / 100
const eqLote = (a, b) => String(a).replace(/^0+/, '').toUpperCase() === String(b).replace(/^0+/, '').toUpperCase()

// Lotes a transferir do Douglas para o Rusa, por fechamento.
// Fonte: comprador do próprio lance + títulos de 5% do Rusa já pagos em 10/08.
const PLANO = [
  { id: 'e058a74f-1b06-46dc-8152-43f682fc5d09', ev: 'Naviraí Matrizes 05/07',    lotes: ['08', '80'],                    cp: 'Celso Lopes' },
  { id: '135016c0-c0be-4e28-b80a-7fca4b759d1e', ev: 'EAO Baviera Fêmeas 11/07',  lotes: ['20', '27', '28', '31', '36', '135'], cp: 'Celso Lopes (5) + Pedro Pontes (1)' },
  { id: '4d2f3c39-a7e6-4a60-97ca-7e9bff637c0c', ev: 'Santa Cruz 15/07',          lotes: ['124'],                         cp: 'Celso Lopes' },
  { id: '0ba4d4d9-0235-4cfe-9db4-ae49208e7f75', ev: 'Naviraí 2ª etapa 16/07',    lotes: ['2'],                           cp: 'Celso Lopes' },
  { id: 'd397ecf6-cb29-4ed3-b4d6-027dd30f4d24', ev: 'Santa Cruz 19/07',          lotes: ['39', '42'],                    cp: 'Celso Lopes' },
  { id: 'ce9612c4-c688-4652-8e31-acd29bf976d0', ev: 'Genética Aditiva 25/07',    lotes: ['18', '41', '42'],              cp: 'Celso Lopes' },
]
// Só entra com --com-guadalupe-20: base inferida (fecha o complemento de 6.045 do
// Rusa) mas NÃO documentada num título. Ver PDF de conferência, divergência 2.
const GUADALUPE_20 = { id: '8ce45792', ev: 'Guadalupe Touros seg. 20/07', lotes: ['4', '91'], cp: 'Anésio Santarém' }

const alvo = [...PLANO]

// ── Lê os fechamentos ────────────────────────────────────────────────────────
const { data: fechs, error } = await sb.from('bula_leilao_fechamento').select('*').in('id', PLANO.map((p) => p.id))
if (error) throw error
if (fechs.length !== PLANO.length) {
  const achados = new Set(fechs.map((f) => f.id))
  throw new Error('fechamento não encontrado: ' + PLANO.filter((p) => !achados.has(p.id)).map((p) => p.ev).join(', '))
}
if (INCLUI_GUADALUPE_20) {
  const { data: g } = await sb.from('bula_leilao_fechamento').select('*').like('id', GUADALUPE_20.id + '%')
  if (!g?.length) throw new Error('fechamento do Guadalupe 20/07 não encontrado')
  fechs.push(g[0]); alvo.push({ ...GUADALUPE_20, id: g[0].id })
}

const { data: cps, error: e2 } = await sb.from('erp_contas_pagar').select('*')
  .in('fechamento_id', alvo.map((p) => p.id))
if (e2) throw e2

const mudancasF = []
const mudancasCP = []
let totalDouglasAntes = 0, totalDouglasDepois = 0

for (const p of alvo) {
  const f = fechs.find((x) => x.id === p.id)
  const lances = JSON.parse(JSON.stringify(f.lances || []))
  const paAntes = JSON.parse(JSON.stringify(f.por_assessor || []))

  // 1) lances[]: troca o assessor dos lotes do Rusa
  const movidos = []
  for (const lo of p.lotes) {
    const cand = lances.filter((l) => eqLote(l.lote, lo))
    if (cand.length !== 1) throw new Error(`${p.ev}: lote ${lo} achou ${cand.length} lances (esperado 1)`)
    const l = cand[0]
    if (!/DOUGLAS/i.test(l.assessor || '')) throw new Error(`${p.ev}: lote ${lo} não está com o Douglas (está com "${l.assessor}")`)
    l.assessor = RUSA
    movidos.push({ lote: l.lote, vgv: Number(l.vgv), animais: Number(l.animais || 1), comprador: l.comprador })
  }
  const vgvMov = r2(movidos.reduce((s, m) => s + m.vgv, 0))
  const anMov = movidos.reduce((s, m) => s + m.animais, 0)

  // 2) por_assessor[]: tira do Douglas, soma no Rusa, mantém os outros intactos
  let pa = paAntes.map((a) => ({ ...a }))
  const iD = pa.findIndex((a) => /DOUGLAS/i.test(a.nome || ''))
  if (iD < 0) throw new Error(`${p.ev}: sem entrada do Douglas em por_assessor`)
  const dAntes = r2(Number(pa[iD].vgv) * Number(pa[iD].comissao_pct ?? 0.02))
  totalDouglasAntes += dAntes

  pa[iD].vgv = r2(Number(pa[iD].vgv) - vgvMov)
  pa[iD].animais = Number(pa[iD].animais) - anMov
  pa[iD].transacoes = Number(pa[iD].transacoes) - movidos.length
  pa[iD].comissao = r2(pa[iD].vgv * Number(pa[iD].comissao_pct ?? 0.02))
  const dDepois = pa[iD].comissao
  totalDouglasDepois += dDepois
  if (Math.abs(pa[iD].vgv) < 0.005) pa = pa.filter((_, i) => i !== iD)
  else pa[iD].ticket_medio = pa[iD].animais ? Math.round(pa[iD].vgv / pa[iD].animais) : 0

  const iR = pa.findIndex((a) => /RUSA/i.test(a.nome || ''))
  if (iR >= 0) {
    pa[iR].vgv = r2(Number(pa[iR].vgv) + vgvMov)
    pa[iR].animais = Number(pa[iR].animais) + anMov
    pa[iR].transacoes = Number(pa[iR].transacoes) + movidos.length
  } else {
    pa.push({ nome: RUSA, empresa: 'Bula Assessoria', vgv: vgvMov, animais: anMov, transacoes: movidos.length, comissao_pct: PCT_RUSA, comissao: 0, posicao: 0, pct_total: 0, ticket_medio: 0 })
  }
  const r = pa.find((a) => /RUSA/i.test(a.nome || ''))
  r.comissao_pct = PCT_RUSA
  r.comissao = r2(r.vgv * PCT_RUSA)
  r.ticket_medio = r.animais ? Math.round(r.vgv / r.animais) : 0

  const vgvTotal = Number(f.vgv_total) || 0
  pa.sort((a, b) => Number(b.vgv) - Number(a.vgv))
  pa.forEach((a, i) => { a.posicao = i + 1; a.pct_total = vgvTotal ? r2(Number(a.vgv) / vgvTotal * 100) / 100 : 0 })

  // 3) comissao_assessoria e sobra_bruta
  const comAntes = Number(f.comissao_assessoria) || 0
  const comDepois = r2(pa.reduce((s, a) => s + Number(a.comissao || 0), 0))
  const rec = Number(f.receita_bula) || 0
  const desp = Number(f.despesas_variaveis) || 0
  const sobraCalc = (c) => r2(rec - c - rec * 0.18 - desp)
  // só recalcula a sobra se a atual seguir a fórmula (senão é número manual, não toco)
  const sobraAntes = f.sobra_bruta == null ? null : Number(f.sobra_bruta)
  const segueFormula = sobraAntes != null && Math.abs(sobraAntes - sobraCalc(comAntes)) < 0.02
  const sobraDepois = segueFormula ? sobraCalc(comDepois) : sobraAntes

  const obs = `${String(f.observacoes || '').trim()}\n${MARCA} ${movidos.length} lote(s) transferido(s) do Douglas Bispo para o Gustavo Rusa (5%): ${movidos.map((m) => m.lote).join(', ')} — comprador ${p.cp}, VGV ${brl(vgvMov)}. A comissão de 5% do Rusa sobre esta base já foi paga em 10/08/2026 (PIX 29.535,00 à Rusa Assessoria, NF 34); o CP do Douglas foi reduzido no mesmo ato. Conferência de 24/08/2026.`.trim()

  mudancasF.push({
    p, f, movidos, vgvMov,
    patch: { lances, por_assessor: pa, comissao_assessoria: comDepois, sobra_bruta: sobraDepois, observacoes: obs },
    comAntes, comDepois, dAntes, dDepois, sobraAntes, sobraDepois, segueFormula,
    rusaCom: r.comissao,
  })

  // 4) título de comissão do Douglas
  const cpD = cps.filter((c) => c.fechamento_id === p.id && /DOUGLAS/i.test(c.descricao || '') && /COMISSAO/i.test(c.descricao || ''))
  if (cpD.length !== 1) throw new Error(`${p.ev}: achou ${cpD.length} CP de comissão do Douglas (esperado 1)`)
  const c = cpD[0]
  if (c.status !== 'aberto') throw new Error(`${p.ev}: CP do Douglas não está aberto (status ${c.status}) — não mexer`)
  if (Math.abs(Number(c.valor) - dAntes) > 0.02) throw new Error(`${p.ev}: CP ${brl(c.valor)} != comissão do fechamento ${brl(dAntes)}`)
  mudancasCP.push({ p, c, de: Number(c.valor), para: dDepois, zerar: dDepois < 0.005 })
}

// ── Relatório ────────────────────────────────────────────────────────────────
console.log(APLICAR ? '=== APLICANDO ===\n' : '=== DRY-RUN (nada gravado) ===\n')
for (const m of mudancasF) {
  console.log(`● ${m.p.ev}  [${m.p.id.slice(0, 8)}]`)
  console.log(`   lotes → Rusa: ${m.movidos.map((x) => `${x.lote} (${brl(x.vgv)})`).join(', ')}  = ${brl(m.vgvMov)}`)
  console.log(`   Douglas 2%:   ${brl(m.dAntes)} → ${brl(m.dDepois)}${m.dDepois < 0.005 ? '   (sai do fechamento)' : ''}`)
  console.log(`   Rusa 5%:      ${brl(m.rusaCom)}   (já pago em 10/08)`)
  console.log(`   comissao_assessoria: ${brl(m.comAntes)} → ${brl(m.comDepois)}`)
  console.log(`   sobra_bruta:  ${m.sobraAntes == null ? '—' : brl(m.sobraAntes)} → ${m.sobraDepois == null ? '—' : brl(m.sobraDepois)}${m.segueFormula ? '' : '   (valor manual, mantido)'}`)
}
console.log('\n● Títulos de comissão do Douglas (venc. 25/08, todos abertos)')
let cpAntes = 0, cpDepois = 0
for (const m of mudancasCP) {
  cpAntes += m.de; cpDepois += m.para
  console.log(`   ${m.p.ev.padEnd(30)} ${brl(m.de).padStart(10)} → ${m.zerar ? 'CANCELAR' : brl(m.para).padStart(10)}`)
}
console.log(`   ${'TOTAL'.padEnd(30)} ${brl(cpAntes).padStart(10)} → ${brl(cpDepois).padStart(10)}   (−${brl(cpAntes - cpDepois)})`)

if (!APLICAR) { console.log('\nNada foi gravado. Rode com --aplicar para gravar.'); process.exit(0) }

// ── Aplica ───────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true })
writeFileSync(`${OUT}/_backup-antes.json`, JSON.stringify({ gerado_em: '2026-08-24', fechamentos: fechs, contas_pagar: cps }, null, 1))
console.log(`\nBackup: ${OUT}/_backup-antes.json`)

for (const m of mudancasF) {
  const { error: e } = await sb.from('bula_leilao_fechamento').update(m.patch).eq('id', m.p.id)
  if (e) throw new Error(`fechamento ${m.p.ev}: ${e.message}`)
  console.log(`  ✓ fechamento ${m.p.ev}`)
}
for (const m of mudancasCP) {
  const nota = `${String(m.c.observacoes || '').trim()}\n${MARCA} ${m.zerar ? 'CANCELADO' : `Reduzido de ${brl(m.de)} para ${brl(m.para)}`}: lote(s) ${m.p.lotes.join(', ')} são do Gustavo Rusa (comprador ${m.p.cp}), comissionados a 5% e já pagos em 10/08/2026 (PIX 29.535,00, NF 34). Manter o 2% aqui pagaria a mesma venda duas vezes.`.trim()
  const patch = m.zerar
    ? { status: 'cancelado', observacoes: nota }
    : { valor: m.para, observacoes: nota }
  const { error: e } = await sb.from('erp_contas_pagar').update(patch).eq('id', m.c.id)
  if (e) throw new Error(`CP ${m.p.ev}: ${e.message}`)
  console.log(`  ✓ CP ${m.p.ev} ${m.zerar ? '(cancelado)' : `(${brl(m.para)})`}`)
}
console.log('\nOK. Douglas em 25/08:', brl(cpAntes), '→', brl(cpDepois))
