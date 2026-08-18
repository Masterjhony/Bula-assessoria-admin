// Validacao dos 5 titulos candidatos a baixa. SOMENTE LEITURA.
// 4 angulos: (1) estado atual no HastaPro, (2) gemeos/duplicidade, (3) pagamento
// no nosso ERP, (4) extrato bancario, (5) conferencia do calculo 3% pelo fechamento.
import { readFileSync } from 'node:fs'
import Firebird from 'node-firebird'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf-8').split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const options = {
  host: env.HASTAPRO_HOST, port: Number(env.HASTAPRO_PORT || 3050), database: env.HASTAPRO_DATABASE,
  user: env.HASTAPRO_USER, password: env.HASTAPRO_PASSWORD, lowercase_keys: false, encoding: 'NONE',
}
const q = (db, sql) => new Promise((res, rej) => db.query(sql, [], (e, r) => (e ? rej(e) : res(r))))
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null)
const fmt = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const ALVOS = [
  { tit: '260623165610043', valor: 2196, leilao: 'Jacamim Fêmeas 07/06', erp: '8o JACAMIM FEMEAS' },
  { tit: '260623165358207', valor: 2475, leilao: 'Santa Nice 06/06', erp: 'MATRIZES SANTA NICE' },
  { tit: '260623165759123', valor: 1989, leilao: 'Seleção Nelore FLOC 15/06', erp: 'SELECAO NELORE FLOC' },
  { tit: '260710150456134', valor: 3360, leilao: 'Touros Matinha 21/06', erp: 'TOUROS MATINHA' },
  { tit: '260710085957577', valor: 2793, leilao: 'Camparino 06/06', erp: 'TOUROS CAMPARINO' },
]

const db = await new Promise((res, rej) => Firebird.attach(options, (e, d) => (e ? rej(e) : res(d))))
try {
  const cli = Object.fromEntries((await q(db, 'SELECT CLI_CODIGO,CLI_NOME FROM CLIENTES')).map((c) => [c.CLI_CODIGO, (c.CLI_NOME || '').trim()]))
  const lei = Object.fromEntries((await q(db, 'SELECT LEI_CODIGO,LEI_NOME,LEI_DATA FROM LEILAO')).map((l) => [l.LEI_CODIGO, { n: l.LEI_NOME, d: iso(l.LEI_DATA) }]))

  console.log('=== 1) ESTADO ATUAL DOS 5 TITULOS ===')
  for (const a of ALVOS) {
    const r = (await q(db, `SELECT * FROM FIN_TITULOS WHERE TIT_CODIGO='${a.tit}'`))[0]
    if (!r) { console.log(` ${a.tit}: NAO EXISTE MAIS`); continue }
    const mov = await q(db, `SELECT * FROM FIN_MOVIMENTO WHERE TIT_CODIGO='${a.tit}'`)
    console.log(` ${a.tit} | ${String(fmt(r.TIT_VALOR)).padStart(9)} | ${r.TIT_STATUS.padEnd(7)} | venc ${iso(r.TIT_DT_VENCTO)} | ${cli[r.TIT_FORNECEDOR]} | ${lei[r.LEI_CODIGO]?.n || 'sem leilao'} | movimentos: ${mov.length} | filial ${r.FIL_CODIGO} | tipo ${r.TIT_TIPO}`)
    if (Number(r.TIT_VALOR) !== a.valor) console.log(`   !! valor divergente do esperado (${fmt(a.valor)})`)
  }

  console.log('\n=== 2) GEMEOS: outro titulo com o MESMO valor na filial 2 ===')
  for (const a of ALVOS) {
    const g = await q(db, `SELECT TIT_CODIGO,TIT_DESCRICAO,TIT_VALOR,TIT_STATUS,TIT_DT_VENCTO,TIT_FORNECEDOR,LEI_CODIGO
      FROM FIN_TITULOS WHERE FIL_CODIGO='2' AND TIT_TIPO='D' AND TIT_VALOR=${a.valor} AND TIT_CODIGO<>'${a.tit}'`)
    if (!g.length) { console.log(` ${fmt(a.valor)} -> nenhum gemeo. OK`); continue }
    console.log(` ${fmt(a.valor)} -> ${g.length} outro(s):`)
    for (const x of g) console.log(`    ${x.TIT_CODIGO} | ${x.TIT_STATUS.padEnd(7)} | venc ${iso(x.TIT_DT_VENCTO)} | ${String(x.TIT_DESCRICAO || '').trim()} | ${cli[x.TIT_FORNECEDOR]} | ${lei[x.LEI_CODIGO]?.n || 'sem leilao'}`)
  }
} finally { db.detach() }

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

console.log('\n=== 3) PAGAMENTO NO NOSSO ERP (Fabio, agosto) ===')
const { data: cp } = await sb.from('erp_contas_pagar').select('descricao,valor,valor_pago,status,data_pagamento,forma_pagamento,observacoes')
  .gte('data_pagamento', '2026-08-01').lte('data_pagamento', '2026-08-31').limit(500)
const fabio = (cp || []).filter((c) => /F[ÁA]BIO|FABIO|OMENA/i.test(c.descricao || ''))
let somaFabio = 0
for (const c of fabio.sort((a, b) => a.descricao.localeCompare(b.descricao))) {
  somaFabio += Number(c.valor_pago || c.valor)
  const alvo = ALVOS.find((a) => Math.abs(a.valor - Number(c.valor_pago || c.valor)) < 0.02)
  console.log(` ${c.data_pagamento} | ${String(fmt(c.valor_pago || c.valor)).padStart(10)} | ${c.status.padEnd(5)} | ${c.forma_pagamento || '-'} | ${c.descricao}${alvo ? '   <== casa com titulo ' + alvo.tit : ''}`)
}
console.log(` TOTAL pago ao Fabio em agosto (ERP): ${fmt(somaFabio)}`)

console.log('\n=== 4) EXTRATO BANCARIO (saidas p/ Fabio em agosto) ===')
const { data: mov } = await sb.from('erp_movimentos_bancarios').select('data,descricao,valor,tipo,status_conciliacao')
  .gte('data', '2026-08-01').lte('data', '2026-08-31').eq('tipo', 'saida')
const extFabio = (mov || []).filter((m) => /OMENA|59\.?791\.?094/i.test(m.descricao || ''))
let somaExt = 0
for (const m of extFabio) { somaExt += Number(m.valor); console.log(` ${m.data} | ${String(fmt(m.valor)).padStart(11)} | ${m.status_conciliacao} | ${m.descricao}`) }
console.log(` TOTAL saido para o Fabio no banco em agosto: ${fmt(somaExt)}`)
console.log(` Soma dos 5 titulos a baixar: ${fmt(ALVOS.reduce((s, a) => s + a.valor, 0))}  -> cabe dentro do que saiu? ${somaExt >= ALVOS.reduce((s, a) => s + a.valor, 0) ? 'SIM' : 'NAO'}`)

console.log('\n=== 5) CONFERENCIA DO CALCULO (3% sobre a venda do Fabio no fechamento) ===')
const { data: fech } = await sb.from('bula_leilao_fechamento').select('nome,data,por_assessor,vgv_total')
  .gte('data', '2026-06-01').lte('data', '2026-06-30')
for (const a of ALVOS) {
  const cand = (fech || []).filter((f) => {
    const n = (f.nome || '').toUpperCase()
    if (/JACAMIM/.test(a.erp)) return /JACAMIM/.test(n)
    if (/SANTA NICE/.test(a.erp)) return /SANTA NICE/.test(n)
    if (/FLOC/.test(a.erp)) return /FLOC/.test(n)
    if (/MATINHA/.test(a.erp)) return /MATINHA/.test(n)
    if (/CAMPARINO/.test(a.erp)) return /CAMPARINO/.test(n)
    return false
  })
  if (!cand.length) { console.log(` ${a.erp}: fechamento nao encontrado em junho`); continue }
  for (const f of cand) {
    const pa = f.por_assessor || {}
    const chaveFabio = Object.keys(pa).find((k) => /F[ÁA]BIO|OMENA/i.test(k))
    const val = chaveFabio ? pa[chaveFabio] : null
    const base = typeof val === 'object' ? (val.vgv ?? val.valor ?? val.total) : val
    const esperado3 = base ? Number(base) * 0.03 : null
    console.log(` ${f.data} | ${(f.nome || '').slice(0, 46).padEnd(46)} | Fabio no fechamento: ${base != null ? fmt(base) : '(sem)'} | 3% = ${esperado3 != null ? fmt(esperado3) : '-'} | titulo = ${fmt(a.valor)} ${esperado3 != null && Math.abs(esperado3 - a.valor) < 1 ? '  BATE' : ''}`)
  }
}
