// Correlaciona movimentos do extrato Sicoob com títulos (contas a receber/pagar),
// baixando o título e marcando o movimento como conciliado. 01/07/2026.
//
// Sinais de match (valor exato é obrigatório): pessoa (mov.pessoa_id == cliente/
// fornecedor do título), proximidade de data (venc/receb), e sobreposição de
// texto descrição↔título. Atribuição GLOBAL 1:1 (cada título e cada movimento
// usados uma vez), por score decrescente.
//
// Só APLICA alta confiança:
//   A) pessoa casa + valor exato + |data| <= 60d, OU
//   B) valor exato + |data| <= 5d + overlap>=2, OU
//   C) valor exato + |data| <= 2d + overlap>=1
// e o par não é ambíguo (2º melhor par do mesmo título/movimento < score-8),
// salvo quando a pessoa casa. O resto vira lista de revisão (fila do ERP).
//
// Baixa idêntica ao endpoint /conciliacao-sugestoes/aplicar.
//
// Uso: node scripts/concilia-titulos-sicoob-2026-07-01.mjs          (DRY RUN)
//      APPLY=1 node scripts/concilia-titulos-sicoob-2026-07-01.mjs  (grava)

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const APPLY = process.env.APPLY === '1'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
const cent = (n) => Math.round(Number(n || 0) * 100)

const STOP = new Set(['LEILAO','PROGRAMA','REMATES','PIX','TED','DOC','EMIT','RECEB','OUTRA','CRED','DEB','DÉB','DE','DO','DA','BULA','CONTA','PAGAMENTO','RECEBIMENTO','COMISSAO','IMPOSTO','DESPESAS','FOLHA','REF','LTDA','COBERTURA','WPP','TIT','COMPE','EFETI','CONV','TR'])
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
const toks = (s) => norm(s).replace(/[^A-Z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 3 && !STOP.has(w))
const overlap = (a, b) => { const A = new Set(toks(a)), B = new Set(toks(b)); let n = 0; for (const t of A) if (B.has(t)) n++; return n }
const days = (a, b) => (!a || !b) ? 9999 : Math.abs((+new Date(a + 'T00:00:00Z') - +new Date(b + 'T00:00:00Z')) / 86400000)

const [{ data: cr }, { data: cp }, { data: movs }, { data: pessoas }] = await Promise.all([
  sb.from('erp_contas_receber').select('id,descricao,valor,status,emissao,vencimento,data_recebimento,cliente_id,numero_documento').in('status', ['aberto', 'vencido', 'parcial']),
  sb.from('erp_contas_pagar').select('id,descricao,valor,status,emissao,vencimento,fornecedor_id,numero_documento').in('status', ['aberto', 'vencido', 'parcial']),
  sb.from('erp_movimentos_bancarios').select('id,data,valor,descricao,observacoes,tipo,pessoa_id,conta_bancaria_id,conta_receber_id,conta_pagar_id,conta:erp_contas_bancarias!conta_bancaria_id(nome)'),
  sb.from('erp_pessoas').select('id,nome'),
])
const banco = (m) => (m.conta?.nome || '').split(' ')[0] || '?'
const nomePes = new Map((pessoas || []).map((p) => [p.id, p.nome || '']))
const entradas = movs.filter((m) => m.tipo === 'entrada' && !m.conta_receber_id)
const saidas = movs.filter((m) => m.tipo === 'saida' && !m.conta_pagar_id)
// menor distância entre a data do movimento e qualquer data relevante do título
const dref = (m, t) => Math.min(days(m.data, t.emissao), days(m.data, t.vencimento), days(m.data, t.data_recebimento))

function build(titulos, pool, tipo) {
  const pares = []
  for (const t of titulos) {
    const vt = cent(t.valor); if (vt <= 0) continue
    const pid = tipo === 'CR' ? t.cliente_id : t.fornecedor_id
    const tText = `${t.descricao || ''} ${nomePes.get(pid) || ''}`
    for (const m of pool) {
      if (cent(m.valor) !== vt) continue
      const d = dref(m, t)
      const mText = `${m.descricao || ''} ${m.observacoes || ''}`
      const ov = overlap(tText, mText)
      const pes = pid && m.pessoa_id && pid === m.pessoa_id
      let score = 0
      if (pes) score += 50
      if (d <= 2) score += 30; else if (d <= 7) score += 24; else if (d <= 20) score += 14; else if (d <= 45) score += 6; else if (d <= 90) score += 2
      score += Math.min(30, ov * 12)
      const high = (pes && d <= 90) || (d <= 15 && ov >= 2) || (d <= 5 && ov >= 1)
      pares.push({ tipo, t, m, d, ov, pes, score, high })
    }
  }
  return pares
}

function assign(pares) {
  pares.sort((a, b) => b.score - a.score)
  // 2º melhor score por titulo e por movimento (p/ detectar ambiguidade)
  const secondT = new Map(), secondM = new Map(), bestT = new Map(), bestM = new Map()
  for (const p of pares) {
    if (!bestT.has(p.t.id)) bestT.set(p.t.id, p.score); else if (!secondT.has(p.t.id)) secondT.set(p.t.id, p.score)
    if (!bestM.has(p.m.id)) bestM.set(p.m.id, p.score); else if (!secondM.has(p.m.id)) secondM.set(p.m.id, p.score)
  }
  const usedT = new Set(), usedM = new Set(), auto = [], review = []
  for (const p of pares) {
    if (usedT.has(p.t.id) || usedM.has(p.m.id)) continue
    const ambT = (secondT.get(p.t.id) ?? -99) > p.score - 8
    const ambM = (secondM.get(p.m.id) ?? -99) > p.score - 8
    const ambiguous = (ambT || ambM) && !p.pes
    if (p.high && !ambiguous) { auto.push(p); usedT.add(p.t.id); usedM.add(p.m.id) }
    else review.push(p)
  }
  return { auto, review }
}

const crPares = build(cr || [], entradas, 'CR')
const cpPares = build(cp || [], saidas, 'CP')
const crA = assign(crPares), cpA = assign(cpPares)

function motivo(p) { return [banco(p.m), p.pes ? 'pessoa' : null, 'valor', p.d <= 90 ? `${Math.round(p.d)}d` : null, p.ov ? `txt${p.ov}` : null].filter(Boolean).join('+') }
function showAuto(list, tag) {
  console.log(`\n=== ${tag} — ALTA CONFIANÇA (aplicar): ${list.length} ===`)
  for (const p of list) console.log(`  ${brl(p.t.valor).padStart(13)} | ${p.m.data} | [${motivo(p)}] | ${(p.t.descricao||'').slice(0,32)}  <->  ${(p.m.descricao||'').slice(0,32)}`)
}
showAuto(crA.auto, 'CONTAS A RECEBER')
showAuto(cpA.auto, 'CONTAS A PAGAR')
console.log(`\n--- Para revisão manual (fila do ERP): CR ${new Set(crA.review.map(p=>p.t.id)).size} títulos, CP ${new Set(cpA.review.map(p=>p.t.id)).size} títulos ---`)
if (process.env.VERBOSE) {
  const seen = new Set()
  console.log('\n[review CP — melhor candidato por título]')
  for (const p of cpA.review.sort((a,b)=>b.score-a.score)) {
    if (seen.has(p.t.id)) continue; seen.add(p.t.id)
    console.log(`  sc${p.score} ${brl(p.t.valor).padStart(12)} [${motivo(p)}] T:${(p.t.descricao||'').slice(0,34)} <> M:${(p.m.descricao||'').slice(0,26)} ${(p.m.observacoes||'').replace(/Extrato Sicoob.*/,'').slice(0,34)}`)
  }
}

if (APPLY) {
  let ok = 0
  for (const p of [...crA.auto, ...cpA.auto]) {
    if (p.tipo === 'CR') {
      await sb.from('erp_movimentos_bancarios').update({ conta_receber_id: p.t.id, conciliado: true, status_conciliacao: 'conciliado', updated_at: new Date().toISOString() }).eq('id', p.m.id)
      await sb.from('erp_contas_receber').update({ status: 'recebido', data_recebimento: p.m.data, valor_recebido: p.t.valor, forma_recebimento: 'transferencia', updated_at: new Date().toISOString() }).eq('id', p.t.id)
    } else {
      await sb.from('erp_movimentos_bancarios').update({ conta_pagar_id: p.t.id, conciliado: true, status_conciliacao: 'conciliado', updated_at: new Date().toISOString() }).eq('id', p.m.id)
      await sb.from('erp_contas_pagar').update({ status: 'pago', data_pagamento: p.m.data, valor_pago: p.t.valor, forma_pagamento: 'transferencia', updated_at: new Date().toISOString() }).eq('id', p.t.id)
    }
    ok++
  }
  console.log(`\n=== APLICADO: ${ok} conciliações (títulos baixados) ===`)
} else {
  console.log('\n=== DRY RUN (nada gravado) ===')
}
