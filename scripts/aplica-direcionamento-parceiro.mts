/**
 * APLICA O DIRECIONAMENTO DE PARCEIRO aos fechamentos já lançados.
 *
 * Varre `bula_leilao_fechamento.lances[]`, acha os lotes cujo COMPRADOR está em
 * `src/lib/parceiro-direcionamento.ts` mas que ficaram no nome do assessor que
 * anunciou, e move a comissão para o parceiro — em lances[], por_assessor[],
 * comissao_assessoria, sobra_bruta e nos títulos abertos do ERP.
 *
 * É a ferramenta para rodar SEMPRE que um comprador novo entrar na lista.
 *
 * SEGURANÇA
 * - Dry-run por padrão. `--aplicar` grava, com backup em outputs/.
 * - Só mexe em título com status 'aberto'. Se algum título do fechamento já foi
 *   pago ou cancelado, o fechamento inteiro é classificado como HISTÓRICO e não é
 *   tocado (só reportado) — reescrever mês conciliado quebra o resultado fechado.
 * - NÃO cria título do parceiro. O quanto ele passa a ter direito é reportado; o
 *   lançamento é decisão de quem paga (em julho/2026, por exemplo, o Rusa já tinha
 *   recebido). Use o número do relatório para lançar à mão.
 *
 * Uso:
 *   node scripts/aplica-direcionamento-parceiro.mts                        # audita 2026
 *   node scripts/aplica-direcionamento-parceiro.mts --de=2026-08-01
 *   node scripts/aplica-direcionamento-parceiro.mts --de=2026-07-20 --ate=2026-07-20 --aplicar
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parceiroDoComprador } from '../src/lib/parceiro-direcionamento.ts'

const arg = (k: string, d: string) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1]
const DE = arg('de', '2026-01-01'), ATE = arg('ate', '2026-12-31')
const APLICAR = process.argv.includes('--aplicar')
const MARCA = '[DIRECIONAMENTO-PARCEIRO 24/08]'
const OUT = 'outputs/direcionamento-parceiro-2026-08-24'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100
type Any = Record<string, any>

// % do parceiro vem do cadastro vivo (erp_folha_estrutura), igual ao gerador de
// fechamento; 5% é o fallback do Rusa caso ele saia do cadastro.
const { data: folha } = await sb.from('erp_folha_estrutura').select('nome, apelidos, comissao_pct, ativo')
const pctDe = (nome: string) => {
  const alvo = nome.toLowerCase()
  for (const e of folha ?? []) {
    if (e.ativo === false || e.comissao_pct == null) continue
    const nomes = [e.nome, ...((e.apelidos as string[]) ?? [])].map((n) => String(n || '').toLowerCase())
    if (nomes.includes(alvo)) return Number(e.comissao_pct) / 100
  }
  return 0.05
}

const { data: fechs, error } = await sb.from('bula_leilao_fechamento')
  .select('*').gte('data', DE).lte('data', ATE).order('data')
if (error) throw error
const { data: cpsAll, error: e2 } = await sb.from('erp_contas_pagar')
  .select('*').not('fechamento_id', 'is', null).limit(5000)
if (e2) throw e2

const ativos: Any[] = []
const historicos: Any[] = []
const semTitulo: Any[] = []

for (const f of fechs ?? []) {
  const lances: Any[] = JSON.parse(JSON.stringify(f.lances || []))
  const mover = lances
    .map((l, i) => ({ i, l, d: parceiroDoComprador(l.comprador) }))
    .filter((x) => x.d && !new RegExp(x.d!.parceiro.split(' ')[1] || x.d!.parceiro, 'i').test(String(x.l.assessor || '')))
  if (!mover.length) continue

  const cps = (cpsAll ?? []).filter((c) => c.fechamento_id === f.id && /COMISSAO/i.test(c.descricao || ''))
  const anunciantes = [...new Set(mover.map((x) => String(x.l.assessor || 'A definir')))]
  const cpDe = new Map<string, Any>()
  let bloqueio: string | null = null
  for (const nome of anunciantes) {
    const chave = nome.split(/\s+/)[0]
    const c = cps.filter((x) => new RegExp(chave, 'i').test(x.descricao || ''))
    if (!c.length) { bloqueio = bloqueio || `sem título de comissão para ${nome}`; continue }
    if (c.length > 1) { bloqueio = `${c.length} títulos para ${nome} — ambíguo`; break }
    if (c[0].status !== 'aberto') { bloqueio = `título de ${nome} já ${c[0].status}`; break }
    cpDe.set(nome, c[0])
  }

  const vgvMov = r2(mover.reduce((s, x) => s + Number(x.l.vgv || 0), 0))
  const parceiro = mover[0].d!.parceiro
  const pctParc = pctDe(parceiro)
  const registro = {
    f, mover, vgvMov, parceiro, pctParc, cpDe, bloqueio,
    resumo: `${f.data} · ${String(f.nome).slice(0, 44)}`,
  }
  if (bloqueio && /já (pago|cancelado)|ambíguo/.test(bloqueio)) historicos.push(registro)
  else if (bloqueio) semTitulo.push(registro)
  else ativos.push(registro)
}

// Fechamento sem título nenhum não tem o que quebrar no caixa — dá para corrigir só
// o fechamento, e é o que se quer nos leilões recentes cujo CP ainda não nasceu.
// Fica atrás de flag porque em mês já fechado isso reescreve relatório conciliado.
if (process.argv.includes('--incluir-sem-titulo')) { ativos.push(...semTitulo); semTitulo.length = 0 }

const linhaLotes = (m: Any[]) => m.map((x) => `${x.l.lote} (${brl(Number(x.l.vgv))}, ${x.l.assessor})`).join('; ')

console.log(`\n=== DIRECIONAMENTO DE PARCEIRO · ${DE} a ${ATE} · ${APLICAR ? 'APLICANDO' : 'DRY-RUN'} ===`)

console.log(`\n■ AJUSTÁVEIS AGORA — títulos abertos (${ativos.length} fechamentos)`)
let totalTiraAssessor = 0, totalDaParceiro = 0
for (const a of ativos) {
  const tira = r2(a.mover.reduce((s: number, x: Any) => s + Number(x.l.vgv) * 0.02, 0))
  const da = r2(a.vgvMov * a.pctParc)
  totalTiraAssessor += tira; totalDaParceiro += da
  console.log(`  ${a.resumo}`)
  console.log(`     ${a.mover[0].d.comprador} · lotes ${linhaLotes(a.mover)}`)
  console.log(`     VGV ${brl(a.vgvMov)} → tira ${brl(tira)} do assessor, gera ${brl(da)} para o ${a.parceiro} (${a.pctParc * 100}%)`)
}
console.log(`  TOTAL: −${brl(totalTiraAssessor)} de assessor · ${brl(totalDaParceiro)} de direito do parceiro`)

console.log(`\n■ HISTÓRICO — título já pago/cancelado, NÃO tocado (${historicos.length} fechamentos)`)
let vgvHist = 0
for (const h of historicos) {
  vgvHist += h.vgvMov
  console.log(`  ${h.resumo}  [${h.bloqueio}]`)
  console.log(`     ${h.mover[0].d.comprador} · lotes ${linhaLotes(h.mover)} · VGV ${brl(h.vgvMov)}`)
}
console.log(`  VGV histórico nessa condição: ${brl(vgvHist)} (2% = ${brl(vgvHist * 0.02)})`)

if (semTitulo.length) {
  console.log(`\n■ SEM TÍTULO DE COMISSÃO — fechamento sem CP do assessor (${semTitulo.length})`)
  for (const s of semTitulo) console.log(`  ${s.resumo}  [${s.bloqueio}] · lotes ${linhaLotes(s.mover)}`)
}

if (!APLICAR) { console.log('\nNada gravado. Use --aplicar (e restrinja com --de/--ate).'); process.exit(0) }
if (!ativos.length) { console.log('\nNada a aplicar no período.'); process.exit(0) }

mkdirSync(OUT, { recursive: true })
const stamp = `${DE}_${ATE}`.replace(/-/g, '')
writeFileSync(`${OUT}/_backup-${stamp}.json`, JSON.stringify({
  fechamentos: ativos.map((a) => a.f),
  contas_pagar: ativos.flatMap((a) => [...a.cpDe.values()]),
}, null, 1))
console.log(`\nBackup: ${OUT}/_backup-${stamp}.json`)

for (const a of ativos) {
  const f = a.f
  const lances: Any[] = JSON.parse(JSON.stringify(f.lances || []))
  const porAnunciante = new Map<string, { vgv: number; animais: number; lotes: number }>()
  for (const x of a.mover) {
    const nome = String(x.l.assessor || 'A definir')
    const cur = porAnunciante.get(nome) || { vgv: 0, animais: 0, lotes: 0 }
    cur.vgv += Number(x.l.vgv || 0); cur.animais += Number(x.l.animais || 1); cur.lotes += 1
    porAnunciante.set(nome, cur)
    lances[x.i].anunciado_por = nome
    lances[x.i].assessor = a.parceiro
  }

  let pa: Any[] = JSON.parse(JSON.stringify(f.por_assessor || [])).map((x: Any) => ({ ...x }))
  for (const [nome, mv] of porAnunciante) {
    const i = pa.findIndex((x) => String(x.nome || '').toLowerCase() === nome.toLowerCase())
    if (i < 0) throw new Error(`${a.resumo}: sem entrada de ${nome} em por_assessor`)
    pa[i].vgv = r2(Number(pa[i].vgv) - mv.vgv)
    pa[i].animais = Number(pa[i].animais) - mv.animais
    pa[i].transacoes = Number(pa[i].transacoes) - mv.lotes
    pa[i].comissao = r2(pa[i].vgv * Number(pa[i].comissao_pct ?? 0.02))
    pa[i].ticket_medio = pa[i].animais ? Math.round(pa[i].vgv / pa[i].animais) : 0
  }
  pa = pa.filter((x) => Math.abs(Number(x.vgv)) > 0.005)

  const totMov = [...porAnunciante.values()].reduce((s, m) => ({ vgv: s.vgv + m.vgv, animais: s.animais + m.animais, lotes: s.lotes + m.lotes }), { vgv: 0, animais: 0, lotes: 0 })
  let p = pa.find((x) => String(x.nome || '').toLowerCase() === a.parceiro.toLowerCase())
  if (!p) { p = { nome: a.parceiro, empresa: 'Bula Assessoria', vgv: 0, animais: 0, transacoes: 0 }; pa.push(p) }
  p.vgv = r2(Number(p.vgv || 0) + totMov.vgv)
  p.animais = Number(p.animais || 0) + totMov.animais
  p.transacoes = Number(p.transacoes || 0) + totMov.lotes
  p.comissao_pct = a.pctParc
  p.comissao = r2(p.vgv * a.pctParc)
  p.ticket_medio = p.animais ? Math.round(p.vgv / p.animais) : 0

  const vgvTotal = Number(f.vgv_total) || 0
  pa.sort((x, y) => Number(y.vgv) - Number(x.vgv))
  pa.forEach((x, i) => { x.posicao = i + 1; x.pct_total = vgvTotal ? r2(Number(x.vgv) / vgvTotal * 100) / 100 : 0 })

  const comDepois = r2(pa.reduce((s, x) => s + Number(x.comissao || 0), 0))
  const rec = Number(f.receita_bula) || 0, desp = Number(f.despesas_variaveis) || 0
  const sobraForm = (c: number) => r2(rec - c - rec * 0.18 - desp)
  const sobraAntes = f.sobra_bruta == null ? null : Number(f.sobra_bruta)
  const segue = sobraAntes != null && Math.abs(sobraAntes - sobraForm(Number(f.comissao_assessoria) || 0)) < 0.02
  const obs = `${String(f.observacoes || '').trim()}\n${MARCA} ${a.mover.length} lote(s) — ${linhaLotes(a.mover)} — movidos para ${a.parceiro} (${a.pctParc * 100}%): o comprador é ${a.mover[0].d.comprador}, direcionado pelo parceiro. Quem anunciou na pista não define a comissão. Ver src/lib/parceiro-direcionamento.ts.`.trim()

  const { error: eF } = await sb.from('bula_leilao_fechamento')
    .update({ lances, por_assessor: pa, comissao_assessoria: comDepois, sobra_bruta: segue ? sobraForm(comDepois) : sobraAntes, observacoes: obs })
    .eq('id', f.id)
  if (eF) throw new Error(`fechamento ${a.resumo}: ${eF.message}`)
  console.log(`  ✓ fechamento ${a.resumo} — comissão ${brl(Number(f.comissao_assessoria))} → ${brl(comDepois)}`)

  for (const [nome, mv] of porAnunciante) {
    const c = a.cpDe.get(nome)
    if (!c) { console.log(`     · ${nome}: sem título de comissão neste fechamento — só o fechamento foi corrigido`); continue }
    const novo = r2(Number(c.valor) - mv.vgv * 0.02)
    const nota = `${String(c.observacoes || '').trim()}\n${MARCA} ${novo < 0.005 ? 'CANCELADO' : `Reduzido de ${brl(Number(c.valor))} para ${brl(novo)}`}: lote(s) ${mv.lotes} do comprador ${a.mover[0].d.comprador}, direcionado pelo ${a.parceiro}. A comissão desses lotes é do parceiro (${a.pctParc * 100}%) — pagar os dois é comissão dobrada.`.trim()
    const { error: eC } = await sb.from('erp_contas_pagar')
      .update(novo < 0.005 ? { status: 'cancelado', observacoes: nota } : { valor: novo, observacoes: nota })
      .eq('id', c.id)
    if (eC) throw new Error(`CP ${nome} / ${a.resumo}: ${eC.message}`)
    console.log(`     ✓ título ${nome}: ${brl(Number(c.valor))} → ${novo < 0.005 ? 'CANCELADO' : brl(novo)}`)
  }
  console.log(`     ⚠ ${a.parceiro} passa a ter direito a ${brl(a.vgvMov * a.pctParc)} neste leilão — título NÃO criado, lançar à mão se ainda não foi pago.`)
}
