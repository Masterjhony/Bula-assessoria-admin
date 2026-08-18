// MAPA PRECISO de agosto: extrato conciliado (agregado, descricao = verdade)
// -> erp_contas_pagar pagos em agosto (detalhado por leilao/pessoa)
// -> titulo do HastaPro (por lote/leilao).
// SOMENTE LEITURA. Serve para decidir o que baixar pela interface.
import { readFileSync, writeFileSync } from 'node:fs'
import Firebird from 'node-firebird'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const SCRATCH = 'C:/Users/Notebook-Acer/AppData/Local/Temp/claude/F--Projetos-Desktop-web-bula/519486df-7958-4176-a25f-16b4a3620d09/scratchpad'
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
const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const PESSOA = [
  [/FABIO.*OMENA|OMENA.*GAIA|FO ASSESSORIA|59 791 094/, 'FABIO OMENA'],
  [/FELIPE VILELA ANDRADE|BULINHA/, 'BULINHA'],
  [/DOUGLAS BISPO/, 'DOUGLAS BISPO'],
  [/LEONARDO SERAFIM/, 'LEONARDO SERAFIM'],
  [/RUSA/, 'GUSTAVO RUSA'],
  [/PERALTA/, 'PERALTA'],
  [/VALERIA BORGES/, 'VALERIA'],
  [/ADILSON|ADN VIAGENS/, 'ADILSON (ADN)'],
  [/BUSSE/, 'BUSSE HOTELARIA'],
  [/CLICKWEB|CLICK WEB/, 'CLICKWEB'],
  [/LUCAS MARTINS/, 'LUCAS MARTINS'],
]
const quem = (s) => { const n = norm(s); for (const [re, nome] of PESSOA) if (re.test(n)) return nome; return null }
const STOP = new Set(['LEILAO', 'VIRTUAL', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'ETAPA', 'EDICAO', 'NELORE', 'COMISSAO', 'VENDA', 'ASSESSORIA', 'REF'])
const tokens = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+O?$/.test(w)))

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: mov } = await sb.from('erp_movimentos_bancarios').select('data,tipo,descricao,valor')
  .gte('data', '2026-08-01').lte('data', '2026-08-31').eq('tipo', 'saida').order('data')
const { data: cpAll } = await sb.from('erp_contas_pagar').select('*').gte('vencimento', '2026-04-01').limit(3000)
const cpAgo = (cpAll || []).filter((c) => c.status === 'pago' && c.data_pagamento >= '2026-08-01' && c.data_pagamento <= '2026-08-31')
  .map((c) => ({ desc: c.descricao, valor: Number(c.valor_pago || c.valor), pago: c.data_pagamento, forma: c.forma_pagamento, pessoa: quem(c.descricao), tk: tokens(c.descricao) }))

const db = await new Promise((res, rej) => Firebird.attach(options, (e, d) => (e ? rej(e) : res(d))))
let abertos = []
try {
  const cli = await q(db, 'SELECT CLI_CODIGO, CLI_NOME FROM CLIENTES')
  const cliDe = Object.fromEntries(cli.map((c) => [c.CLI_CODIGO, (c.CLI_NOME || '').trim()]))
  const leis = await q(db, 'SELECT LEI_CODIGO, LEI_NOME FROM LEILAO')
  const leiDe = Object.fromEntries(leis.map((l) => [l.LEI_CODIGO, l.LEI_NOME]))
  abertos = (await q(db, `SELECT TIT_CODIGO, TIT_DESCRICAO, TIT_VALOR, TIT_DT_VENCTO, TIT_FORNECEDOR, LEI_CODIGO
    FROM FIN_TITULOS WHERE FIL_CODIGO='2' AND TIT_TIPO='D' AND TIT_STATUS<>'PAGO'`))
    .map((r) => ({ tit: r.TIT_CODIGO, desc: String(r.TIT_DESCRICAO || '').trim(), valor: Number(r.TIT_VALOR), venc: iso(r.TIT_DT_VENCTO), forn: cliDe[r.TIT_FORNECEDOR] || '', pessoa: quem(cliDe[r.TIT_FORNECEDOR]), leilao: leiDe[r.LEI_CODIGO] || null }))
} finally { db.detach() }

// ERP pago em agosto -> titulo aberto (pessoa + valor + leilao)
const usados = new Set()
const ponte = cpAgo.map((p) => {
  const cands = abertos.map((a, i) => {
    if (usados.has(i) || Math.abs(a.valor - p.valor) > 0.02) return null
    const inter = [...tokens(`${a.leilao || ''} ${a.desc}`)].filter((t) => p.tk.has(t)).length
    const mesma = a.pessoa && a.pessoa === p.pessoa
    if (!mesma && inter === 0) return null
    return { i, a, inter, mesma, score: (mesma ? 2 : 0) + Math.min(inter, 3) }
  }).filter(Boolean).sort((x, y) => y.score - x.score)
  const top = cands[0]
  if (top && top.mesma && top.inter > 0) usados.add(top.i)
  return { ...p, tit: top?.a.tit || null, tit_desc: top?.a.desc || null, tit_leilao: top?.a.leilao || null, seguro: !!(top && top.mesma && top.inter > 0) }
})

const linhas = []
console.log(`SAIDAS DO EXTRATO EM AGOSTO: ${mov.length} | R$ ${fmt(mov.reduce((s, m) => s + Number(m.valor), 0))}`)
console.log(`ERP: ${cpAgo.length} contas pagas em agosto | R$ ${fmt(cpAgo.reduce((s, p) => s + p.valor, 0))}`)
console.log(`  destas, com titulo do HastaPro identificado com seguranca: ${ponte.filter((p) => p.seguro).length} | R$ ${fmt(ponte.filter((p) => p.seguro).reduce((s, p) => s + p.valor, 0))}\n`)

for (const m of mov) {
  const p = quem(m.descricao)
  const v = Number(m.valor)
  // parcelas do ERP que explicam essa saida: mesma pessoa, pagas no mesmo dia
  const partes = p ? ponte.filter((x) => x.pessoa === p && x.pago === m.data) : []
  const somaPartes = partes.reduce((s, x) => s + x.valor, 0)
  const comTit = partes.filter((x) => x.seguro)
  console.log(`\n${m.data} | R$ ${fmt(v)} | ${m.descricao.slice(0, 78)}`)
  if (!partes.length) { console.log('   sem detalhamento no ERP para essa saida'); linhas.push({ data: m.data, valor: v, extrato: m.descricao, pessoa: p || '', erp_partes: 0, erp_soma: 0, titulos_casados: 0, acao: 'DECIDIR' }); continue }
  console.log(`   ERP detalha em ${partes.length} lancamento(s) somando R$ ${fmt(somaPartes)}${Math.abs(somaPartes - v) > 0.02 ? `  <-- DIFERENCA de R$ ${fmt(v - somaPartes)}` : '  (fecha)'}`)
  for (const x of partes) console.log(`     ${x.seguro ? 'OK ' : '?? '} R$ ${String(fmt(x.valor)).padStart(10)} | ${x.desc.slice(0, 58)} ${x.tit ? `-> titulo ${x.tit} "${x.tit_desc}"` : '-> SEM TITULO NO HASTAPRO'}`)
  linhas.push({ data: m.data, valor: v, extrato: m.descricao, pessoa: p || '', erp_partes: partes.length, erp_soma: somaPartes, titulos_casados: comTit.length, acao: comTit.length ? 'BAIXAR' : 'DECIDIR' })
}

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Extrato agosto')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ponte.map(({ tk, ...r }) => r)), 'ERP pago ago x titulo')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(abertos), 'HastaPro em aberto')
XLSX.writeFile(wb, 'C:/Users/Notebook-Acer/Desktop/Mapa-HastaPro-Agosto-2026.xlsx')
writeFileSync(`${SCRATCH}/mapa-3pontas.json`, JSON.stringify({ linhas, ponte }, null, 1), 'utf-8')
console.log('\nXLSX -> C:/Users/Notebook-Acer/Desktop/Mapa-HastaPro-Agosto-2026.xlsx')
