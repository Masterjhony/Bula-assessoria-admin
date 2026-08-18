/**
 * CONFERÊNCIA DE COMISSÕES POR COMPETÊNCIA (18/08/2026).
 *
 * REGRA (confirmada com o João e no histórico do ERP): a comissão dos leilões
 * do mês N é paga no DIA 25 do mês N+1. Quando 25 cai em fim de semana ou
 * feriado, vai para o próximo dia útil (o histórico mostra 26/10 e 28/12).
 *
 * O script compara, por competência:
 *   devido  = bula_leilao_fechamento.por_assessor[].comissao
 *   lançado = erp_contas_pagar com descrição "COMISSAO <leilão> - <assessor>"
 * e lista o que falta lançar, sobra, ou está com vencimento fora da regra.
 *
 * Uso: node scripts/confere-comissoes-mes.mjs 2026-07 [--apply]
 *   --apply cria os títulos que faltam (vencimento na regra) e corrige o
 *   vencimento dos que estão fora dela. Nunca mexe em título já pago.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const COMPETENCIA = (process.argv.find(a => /^\d{4}-\d{2}$/.test(a)) || '2026-07')

const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const mk = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// nomes canônicos (espelho de src/lib/assessor-normalize.ts)
const CANON = new Map([
  ['fabio omena', 'FÁBIO OMENA'], ['fabio omena gaia', 'FÁBIO OMENA'], ['fabio de omena gaia', 'FÁBIO OMENA'],
  ['leo', 'LEONARDO SERAFIM'], ['leo serafim', 'LEONARDO SERAFIM'], ['leonardo serafim', 'LEONARDO SERAFIM'],
  ['lm assessoria', 'LEONARDO SERAFIM'], ['mateus alves', 'MATHEUS ALVES'],
  ['bulinha felipe andrade', 'BULINHA (FELIPE ANDRADE)'], ['felipe vilela andrade', 'BULINHA (FELIPE ANDRADE)'],
])
const canon = n => CANON.get(mk(n)) || String(n || '').toUpperCase().trim()
const chaveAss = n => mk(canon(n))   // comparação insensível a acento/caixa

/** Dia 25 do mês seguinte; se cair sáb/dom, joga para a segunda-feira. */
function vencimentoDaRegra(competencia) {
  const [a, m] = competencia.split('-').map(Number)
  const ano = m === 12 ? a + 1 : a
  const mes = m === 12 ? 1 : m + 1
  const d = new Date(Date.UTC(ano, mes - 1, 25))
  const dow = d.getUTCDay()
  if (dow === 6) d.setUTCDate(27)      // sábado → segunda
  else if (dow === 0) d.setUTCDate(26) // domingo → segunda
  return d.toISOString().slice(0, 10)
}
const VENC = vencimentoDaRegra(COMPETENCIA)
// EXCEÇÃO conhecida: a comissão da Nane é acumulada e paga em 28/12 (tags
// 'nane-acumulado'/'diferido'). Não entra na regra do dia 25.
const ehDiferido = t => Array.isArray(t.tags) && (t.tags.includes('nane-acumulado') || t.tags.includes('diferido'))

const ini = `${COMPETENCIA}-01`
const fim = new Date(Date.UTC(Number(COMPETENCIA.slice(0, 4)), Number(COMPETENCIA.slice(5, 7)), 0)).toISOString().slice(0, 10)

const { data: fes } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,comissao_assessoria,por_assessor').gte('data', ini).lte('data', fim).order('data')
const { data: titulos } = await sb.from('erp_contas_pagar')
  .select('id,descricao,vencimento,valor,status,data_pagamento,tags').ilike('descricao', 'COMISSAO%').neq('status', 'cancelado')
const { data: catRow } = await sb.from('erp_categorias').select('id').eq('nome', 'Comissão Funcionário').single()
const { data: ccRow } = await sb.from('erp_centros_custo').select('id').eq('nome', 'Comissão Assessores').single()
const { data: ccParc } = await sb.from('erp_centros_custo').select('id').eq('nome', 'Comissão Parceiros Comerciais').single()

/** "COMISSAO <leilão> - <ASSESSOR> (2%)" → { leilao, assessor } */
function parseTitulo(desc) {
  const s = String(desc || '').replace(/^COMISSAO\s+/i, '').replace(/\s*\(\s*[\d.,]+\s*%\s*\)\s*$/i, '').trim()
  const i = s.lastIndexOf(' - ')
  if (i < 0) return { leilao: mk(s), assessor: '' }
  return { leilao: mk(s.slice(0, i)), assessor: chaveAss(s.slice(i + 3)) }
}
const idxTitulo = new Map()
for (const t of titulos || []) {
  const p = parseTitulo(t.descricao)
  const k = `${p.leilao}|${p.assessor}`
  const cur = idxTitulo.get(k) || []
  cur.push(t)
  idxTitulo.set(k, cur)
}

console.log(`COMPETÊNCIA ${COMPETENCIA} · vencimento pela regra: ${VENC} (dia 25 do mês seguinte, ajustado p/ dia útil)\n`)

let devidoTotal = 0, lancadoTotal = 0
const faltando = [], foraDaRegra = [], atribuicaoDiverge = []

// título por leilão (para saber se o total do evento já está lançado)
const porLeilao = new Map()
for (const t of titulos || []) {
  const k = parseTitulo(t.descricao).leilao
  const cur = porLeilao.get(k) || []
  cur.push(t)
  porLeilao.set(k, cur)
}

const devidoPorNome = new Map()
for (const f of fes || []) {
  const k = mk(f.nome)
  const cur = devidoPorNome.get(k) || new Map()
  for (const a of (f.por_assessor || [])) {
    const ka = chaveAss(a.nome)
    cur.set(ka, r2((cur.get(ka) || 0) + (Number(a.comissao) || 0)))
  }
  devidoPorNome.set(k, cur)
}
const nomeJaVisto = new Set()

for (const f of fes || []) {
  if (nomeJaVisto.has(mk(f.nome))) continue   // homônimos: compara uma vez só, somados
  nomeJaVisto.add(mk(f.nome))
  const devidoLeilao = r2([...(devidoPorNome.get(mk(f.nome)) || new Map()).values()].reduce((s2, v) => s2 + v, 0))
  const titulosLeilao = porLeilao.get(mk(f.nome)) || []
  const lancadoLeilao = r2(titulosLeilao.reduce((s2, t) => s2 + Number(t.valor || 0), 0))
  const totalBate = Math.abs(devidoLeilao - lancadoLeilao) <= 0.5 && titulosLeilao.length > 0

  for (const [kAss, valorSomado] of (devidoPorNome.get(mk(f.nome)) || new Map())) {
    const a = (f.por_assessor || []).find(x => chaveAss(x.nome) === kAss) || { nome: kAss }
    const valor = r2(valorSomado)
    if (!valor || valor <= 0) continue
    const nomeAss = canon(a.nome)
    if (/a definir/i.test(nomeAss)) continue
    devidoTotal += valor
    const achados = idxTitulo.get(`${mk(f.nome)}|${kAss}`) || []
    const soma = r2(achados.reduce((s, t) => s + Number(t.valor || 0), 0))
    lancadoTotal += soma
    if (achados.length === 0) {
      // o total do leilão já está lançado: o que diverge é a ATRIBUIÇÃO por
      // pessoa (o alinhamento ao HastaPro passou a usar o pisteiro real).
      // Mexer nisso muda quem recebe — fica como alerta, não como lançamento.
      if (totalBate) atribuicaoDiverge.push({ f, nomeAss, valor, devidoLeilao, lancadoLeilao })
      else faltando.push({ f, nomeAss, valor })
    } else if (Math.abs(soma - valor) > 0.5) {
      if (totalBate) atribuicaoDiverge.push({ f, nomeAss, valor, soma, devidoLeilao, lancadoLeilao })
      else console.log(`  ! ${f.nome.slice(0, 44)} · ${nomeAss}: devido ${brl(valor)} x lançado ${brl(soma)}`)
    } else {
      for (const t of achados) {
        if (t.status !== 'pago' && !ehDiferido(t) && String(t.vencimento).slice(0, 10) !== VENC) {
          foraDaRegra.push({ t, nomeAss })
        }
      }
    }
  }
}

console.log(`\nDevido pelos fechamentos: ${brl(devidoTotal)}`)
console.log(`Lançado em títulos:       ${brl(lancadoTotal)}`)

console.log(`\n=== FALTA LANÇAR (${faltando.length}) ===`)
for (const x of faltando) console.log(`  ${String(x.f.data).slice(0, 10)} ${x.f.nome.slice(0, 46).padEnd(46)} ${x.nomeAss.padEnd(24)} ${brl(x.valor)}`)

console.log(`\n=== ATRIBUIÇÃO DIVERGE (total do leilão bate; muda quem recebe) — ${atribuicaoDiverge.length} ===`)
for (const x of atribuicaoDiverge) {
  console.log(`  ${x.f.nome.slice(0, 46)} · ${x.nomeAss}: fechamento ${brl(x.valor)}${x.soma != null ? ` x título ${brl(x.soma)}` : ' (sem título nesse nome)'}`)
}

console.log(`\n=== VENCIMENTO FORA DA REGRA (${foraDaRegra.length}) ===`)
for (const x of foraDaRegra) console.log(`  ${String(x.t.vencimento).slice(0, 10)} -> ${VENC}  ${x.t.descricao.slice(0, 62)}`)

if (!APPLY) { console.log('\nDRY-RUN. Use --apply para lançar/corrigir.'); process.exit(0) }

const PARCEIROS = /rusa|bulinha|felipe andrade|formula do boi|marcelo carneiro/i
let criados = 0, ajustados = 0
for (const x of faltando) {
  const pct = (x.f.por_assessor || []).find(a => canon(a.nome) === x.nomeAss)?.comissao_pct
  const payload = {
    descricao: `COMISSAO ${x.f.nome} - ${x.nomeAss}${pct ? ` (${r2(pct * 100)}%)` : ''}`,
    valor: x.valor,
    vencimento: VENC,
    emissao: String(x.f.data).slice(0, 10),
    status: 'aberto',
    categoria_id: catRow?.id,
    centro_custo_id: PARCEIROS.test(x.nomeAss) ? ccParc?.id : ccRow?.id,
    fechamento_id: x.f.id,
    observacoes: `[18/08/2026] Comissão do leilão de ${String(x.f.data).slice(0, 10)} (competência ${COMPETENCIA}). Regra: pagamento no dia 25 do mês seguinte.`,
  }
  const { error } = await sb.from('erp_contas_pagar').insert(payload)
  if (error) console.error('  ERRO insert: ' + error.message)
  else { criados++; console.log(`  + ${payload.descricao.slice(0, 70)} ${brl(x.valor)}`) }
}
for (const x of foraDaRegra) {
  const { error } = await sb.from('erp_contas_pagar')
    .update({ vencimento: VENC, observacoes: `[18/08/2026] Vencimento alinhado à regra: comissão do mês ${COMPETENCIA} vence em ${VENC} (dia 25 do mês seguinte).` })
    .eq('id', x.t.id)
  if (error) console.error('  ERRO update: ' + error.message)
  else ajustados++
}
console.log(`\n-> ${criados} títulos criados · ${ajustados} vencimentos alinhados à regra`)
console.log('APLICADO.')
