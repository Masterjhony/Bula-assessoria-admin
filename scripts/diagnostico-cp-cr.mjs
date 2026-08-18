/**
 * DIAGNÓSTICO AMPLO DE CONTAS A PAGAR / A RECEBER (18/08/2026).
 *
 * Premissa (ordem do João): o EXTRATO CONCILIADO é a verdade. Os títulos só
 * valem se batem com o que entrou/saiu do banco. Este script não altera nada —
 * só confronta as duas visões e lista o que está incoerente:
 *
 *   A. Regime: total de títulos com vencimento no mês N x total pago/recebido
 *      no extrato no mês N e no mês N+1 (revela defasagem sistemática entre
 *      competência e caixa, por categoria).
 *   B. Títulos em aberto/vencidos cujo pagamento JÁ existe no extrato
 *      (mesmo valor, janela de ±25 dias) — obrigação duplicada no painel.
 *   C. Movimentos de caixa relevantes SEM título — despesa/receita que nunca
 *      foi provisionada (o painel subestima o mês).
 *   D. Títulos 'orcamento' com vencimento vencido — pré-lançamento que virou
 *      dívida fantasma.
 *   E. Datas: para cada categoria, o dia típico do pagamento real x o dia do
 *      vencimento cadastrado.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const r2 = n => Math.round(Number(n || 0) * 100) / 100
const brl = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const dia = d => String(d || '').slice(0, 10)
const mes = d => String(d || '').slice(0, 7)
const HOJE = new Date().toISOString().slice(0, 10)
const diffDias = (a, b) => Math.round((new Date(dia(a) + 'T00:00:00') - new Date(dia(b) + 'T00:00:00')) / 86400000)

async function all(table, cols, filtro = q => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filtro(sb.from(table).select(cols)).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

const cats = await all('erp_categorias', 'id,nome,dre_grupo')
const catNome = new Map(cats.map(c => [c.id, c.nome]))
const movs = await all('erp_movimentos_bancarios', 'id,data,tipo,valor,categoria_id,descricao,conta_pagar_id,conta_receber_id')
const cps = await all('erp_contas_pagar', 'id,descricao,vencimento,valor,valor_pago,data_pagamento,status,categoria_id,tags')
const crs = await all('erp_contas_receber', 'id,descricao,vencimento,valor,valor_recebido,data_recebimento,status,categoria_id')

const vivos = t => t.status !== 'cancelado'
const abertos = t => ['aberto', 'parcial', 'vencido'].includes(t.status)
const TRANSF = /transfer/i

console.log('═══════════ A. REGIME: TÍTULO (competência) x EXTRATO (caixa) ═══════════')
{
  // por categoria e mês: soma de títulos vencendo no mês x soma paga no extrato
  const linhas = new Map() // `${cat}|${mes}` -> { tit, cxMes, cxProx }
  const add = (k, campo, v) => {
    const cur = linhas.get(k) || { tit: 0, cx: 0 }
    cur[campo] += v
    linhas.set(k, cur)
  }
  for (const t of cps.filter(vivos)) add(`${catNome.get(t.categoria_id) || '—'}|${mes(t.vencimento)}`, 'tit', Number(t.valor || 0))
  for (const m of movs.filter(m => m.tipo === 'saida')) {
    const c = catNome.get(m.categoria_id) || '—'
    if (TRANSF.test(c)) continue
    add(`${c}|${mes(m.data)}`, 'cx', Number(m.valor || 0))
  }
  // agrega por categoria: quantos meses o caixa casa melhor com o mês seguinte
  const porCat = new Map()
  for (const [k, v] of linhas) {
    const [cat, ms] = k.split('|')
    const cur = porCat.get(cat) || []
    cur.push({ ms, ...v })
    porCat.set(cat, cur)
  }
  const suspeitas = []
  for (const [cat, arr] of porCat) {
    arr.sort((a, b) => a.ms.localeCompare(b.ms))
    let casaMesmo = 0, casaProx = 0, comparados = 0
    for (let i = 0; i < arr.length - 1; i++) {
      const t = arr[i].tit, cxA = arr[i].cx, cxB = arr[i + 1]?.cx ?? 0
      if (t < 500) continue
      comparados++
      const dMesmo = Math.abs(cxA - t) / t
      const dProx = Math.abs(cxB - t) / t
      if (dProx < dMesmo && dProx < 0.05) casaProx++
      else if (dMesmo < 0.05) casaMesmo++
    }
    if (comparados >= 2 && casaProx > casaMesmo) {
      suspeitas.push({ cat, casaProx, casaMesmo, comparados })
    }
  }
  if (!suspeitas.length) console.log('  nenhuma defasagem sistemática competência→caixa detectada')
  for (const s of suspeitas) {
    console.log(`  ⚠ ${s.cat}: o valor do mês do VENCIMENTO casa com o pagamento do MÊS SEGUINTE em ${s.casaProx}/${s.comparados} meses`)
    console.log('     → o vencimento cadastrado é a competência, não a data real de pagamento')
    const arr = porCat.get(s.cat)
    for (const a of arr.slice(-6)) console.log(`       ${a.ms}: títulos ${brl(a.tit)} · saiu do banco ${brl(a.cx)}`)
  }
}

console.log('\n═══════════ B. TÍTULO EM ABERTO COM PAGAMENTO JÁ NO EXTRATO ═══════════')
{
  const usados = new Set(movs.filter(m => m.conta_pagar_id).map(m => m.conta_pagar_id))
  const livres = movs.filter(m => m.tipo === 'saida' && !m.conta_pagar_id)
  let n = 0
  for (const t of cps.filter(abertos)) {
    const alvo = r2(Number(t.valor || 0) - Number(t.valor_pago || 0))
    if (alvo <= 0.01) continue
    const cand = livres.filter(m => Math.abs(Number(m.valor) - alvo) < 0.01 && Math.abs(diffDias(m.data, t.vencimento)) <= 25)
    if (!cand.length) continue
    n++
    if (n <= 25) {
      console.log(`  ~ ${dia(t.vencimento)} ${t.descricao.slice(0, 58)} ${brl(alvo)}`)
      for (const c of cand.slice(0, 2)) console.log(`      candidato no extrato: ${dia(c.data)} ${brl(c.valor)} · ${String(c.descricao).slice(0, 60)}`)
    }
  }
  console.log(`  → ${n} títulos em aberto com pagamento equivalente já no extrato`)
  void usados
}

console.log('\n═══════════ C. CAIXA SEM TÍTULO (por categoria/mês, ≥ R$ 3 mil) ═══════════')
{
  const semTit = new Map()
  for (const m of movs.filter(m => m.tipo === 'saida' && !m.conta_pagar_id)) {
    const c = catNome.get(m.categoria_id) || '—'
    if (TRANSF.test(c)) continue
    const k = `${c}|${mes(m.data)}`
    const cur = semTit.get(k) || { v: 0, n: 0 }
    cur.v += Number(m.valor || 0); cur.n++
    semTit.set(k, cur)
  }
  const top = [...semTit.entries()].filter(([, v]) => v.v >= 3000).sort((a, b) => b[1].v - a[1].v).slice(0, 20)
  for (const [k, v] of top) console.log(`  ${k.replace('|', ' · ')}: ${brl(v.v)} em ${v.n} movimentos sem título`)
  const totalSem = [...semTit.values()].reduce((s, v) => s + v.v, 0)
  const totalSai = movs.filter(m => m.tipo === 'saida' && !TRANSF.test(catNome.get(m.categoria_id) || '')).reduce((s, m) => s + Number(m.valor || 0), 0)
  console.log(`  → ${brl(totalSem)} de ${brl(totalSai)} (${Math.round(totalSem / totalSai * 100)}%) das saídas não têm título vinculado`)
}

console.log('\n═══════════ D. ORÇAMENTO VENCIDO / TÍTULO FANTASMA ═══════════')
{
  const orc = cps.filter(t => abertos(t) && Array.isArray(t.tags) && t.tags.includes('orcamento'))
  const vencido = orc.filter(t => dia(t.vencimento) < HOJE)
  console.log(`  ${orc.length} títulos marcados 'orcamento' em aberto (${brl(orc.reduce((s, t) => s + Number(t.valor || 0), 0))})`)
  console.log(`  ${vencido.length} deles já venceram (${brl(vencido.reduce((s, t) => s + Number(t.valor || 0), 0))})`)
  for (const t of vencido.slice(0, 12)) console.log(`    · ${dia(t.vencimento)} ${t.descricao.slice(0, 60)} ${brl(t.valor)}`)
}

console.log('\n═══════════ E. DIA TÍPICO: pagamento real x vencimento cadastrado ═══════════')
{
  const porCat = new Map()
  for (const t of cps.filter(t => t.status === 'pago' && t.data_pagamento && t.vencimento)) {
    const c = catNome.get(t.categoria_id) || '—'
    const cur = porCat.get(c) || []
    cur.push(diffDias(t.data_pagamento, t.vencimento))
    porCat.set(c, cur)
  }
  for (const [c, arr] of [...porCat.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12)) {
    const ord = [...arr].sort((a, b) => a - b)
    const mediana = ord[Math.floor(ord.length / 2)]
    const flag = Math.abs(mediana) >= 5 ? '  ⚠ vencimento fora da data real' : ''
    console.log(`  ${c}: ${arr.length} baixas · mediana de ${mediana >= 0 ? '+' : ''}${mediana} dia(s) entre vencimento e pagamento${flag}`)
  }
}

console.log('\n═══════════ F. CONTAS A RECEBER: título x extrato ═══════════')
{
  const livres = movs.filter(m => m.tipo === 'entrada' && !m.conta_receber_id)
  let n = 0
  for (const t of crs.filter(abertos)) {
    const alvo = r2(Number(t.valor || 0) - Number(t.valor_recebido || 0))
    if (alvo <= 0.01) continue
    const cand = livres.filter(m => Math.abs(Number(m.valor) - alvo) < 0.01 && Math.abs(diffDias(m.data, t.vencimento)) <= 30)
    if (!cand.length) continue
    n++
    console.log(`  ~ ${dia(t.vencimento)} ${t.descricao.slice(0, 55)} ${brl(alvo)}`)
    for (const c of cand.slice(0, 2)) console.log(`      candidato no extrato: ${dia(c.data)} ${brl(c.valor)} · ${String(c.descricao).slice(0, 55)}`)
  }
  console.log(`  → ${n} recebíveis em aberto com entrada equivalente já no extrato`)

  const entradasSemTit = movs.filter(m => m.tipo === 'entrada' && !m.conta_receber_id && !TRANSF.test(catNome.get(m.categoria_id) || ''))
  const tot = entradasSemTit.reduce((s, m) => s + Number(m.valor || 0), 0)
  console.log(`  → ${brl(tot)} em ${entradasSemTit.length} entradas sem título de recebível`)
}
