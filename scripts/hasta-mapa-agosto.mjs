// MAPA de agosto/2026: o que ja esta lancado no HastaPro x o que falta lancar,
// tendo como fonte o EXTRATO CONCILIADO (a descricao das transacoes e' a verdade,
// categoria nao). SOMENTE LEITURA nos dois lados.
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
  [/FABIO.*OMENA|OMENA.*GAIA|FO ASSESSORIA/, 'FABIO OMENA'],
  [/FELIPE VILELA ANDRADE|BULINHA/, 'BULINHA'],
  [/DOUGLAS BISPO/, 'DOUGLAS BISPO'],
  [/LEONARDO SERAFIM/, 'LEONARDO SERAFIM'],
  [/RUSA/, 'GUSTAVO RUSA'],
  [/PERALTA/, 'PERALTA'],
  [/VALERIA BORGES/, 'VALERIA'],
  [/ADILSON|ADN VIAGENS/, 'ADILSON (ADN)'],
  [/BUSSE/, 'BUSSE HOTELARIA'],
  [/CLICKWEB|CLICK WEB/, 'CLICKWEB'],
  [/FORMULA DO BOI/, 'FORMULA DO BOI'],
  [/LUCAS MARTINS/, 'LUCAS MARTINS'],
  [/MATHEUS/, 'MATHEUS'],
  [/JOAO ANTONIO/, 'JOAO ANTONIO'],
  [/NANE|ANDRESSA/, 'NANE'],
]
const quem = (s) => { const n = norm(s); for (const [re, nome] of PESSOA) if (re.test(n)) return nome; return null }

// ─── 1) Extrato conciliado de agosto (nossa verdade) ─────────────────────────
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: mov } = await sb.from('erp_movimentos_bancarios')
  .select('data,tipo,descricao,valor,status_conciliacao,conta_pagar_id,observacoes')
  .gte('data', '2026-08-01').lte('data', '2026-08-31').order('data')
const saidas = (mov || []).filter((m) => m.tipo === 'saida')
console.log(`EXTRATO AGOSTO: ${(mov || []).length} lancamentos | saidas: ${saidas.length} | R$ ${fmt(saidas.reduce((s, m) => s + Number(m.valor), 0))}\n`)

// ─── 2) HastaPro: abertos e pagos com baixa em agosto ────────────────────────
const db = await new Promise((res, rej) => Firebird.attach(options, (e, d) => (e ? rej(e) : res(d))))
let abertos = []; let pagosAgo = []
try {
  const cli = await q(db, 'SELECT CLI_CODIGO, CLI_NOME FROM CLIENTES')
  const cliDe = Object.fromEntries(cli.map((c) => [c.CLI_CODIGO, (c.CLI_NOME || '').trim()]))
  const leis = await q(db, 'SELECT LEI_CODIGO, LEI_NOME FROM LEILAO')
  const leiDe = Object.fromEntries(leis.map((l) => [l.LEI_CODIGO, l.LEI_NOME]))

  abertos = (await q(db, `SELECT TIT_CODIGO, TIT_DESCRICAO, TIT_VALOR, TIT_DT_VENCTO, TIT_FORNECEDOR, LEI_CODIGO
    FROM FIN_TITULOS WHERE FIL_CODIGO='2' AND TIT_TIPO='D' AND TIT_STATUS<>'PAGO' ORDER BY TIT_DT_VENCTO`))
    .map((r) => ({ tit: r.TIT_CODIGO, desc: String(r.TIT_DESCRICAO || '').trim(), valor: Number(r.TIT_VALOR), venc: iso(r.TIT_DT_VENCTO), forn: cliDe[r.TIT_FORNECEDOR] || '', pessoa: quem(cliDe[r.TIT_FORNECEDOR]), leilao: leiDe[r.LEI_CODIGO] || null }))

  pagosAgo = (await q(db, `SELECT t.TIT_CODIGO, t.TIT_DESCRICAO, t.TIT_VALOR, t.TIT_FORNECEDOR, m.MOV_PAGODIA, m.MOV_PAGAMENTO
    FROM FIN_TITULOS t JOIN FIN_MOVIMENTO m ON m.TIT_CODIGO = t.TIT_CODIGO
    WHERE t.FIL_CODIGO='2' AND t.TIT_TIPO='D' AND t.TIT_STATUS='PAGO'
      AND m.MOV_PAGODIA >= '2026-08-01' AND m.MOV_PAGODIA <= '2026-08-31'`))
    .map((r) => ({ tit: r.TIT_CODIGO, desc: String(r.TIT_DESCRICAO || '').trim(), valor: Number(r.TIT_VALOR), forn: cliDe[r.TIT_FORNECEDOR] || '', pessoa: quem(cliDe[r.TIT_FORNECEDOR]), pago: iso(r.MOV_PAGODIA), forma: r.MOV_PAGAMENTO }))
} finally { db.detach() }

// ─── 3) Mapa: cada saida do extrato -> situacao no HastaPro ──────────────────
const linhas = saidas.map((m) => {
  const v = Number(m.valor)
  const p = quem(m.descricao)
  const jaLancado = pagosAgo.filter((x) => Math.abs(x.valor - v) < 0.02)
  const candAberto = abertos.filter((a) => Math.abs(a.valor - v) < 0.02)
  const candPessoa = p ? abertos.filter((a) => a.pessoa === p) : []
  const somaPessoa = candPessoa.reduce((s, a) => s + a.valor, 0)

  let situacao; let alvo = ''
  if (jaLancado.length) { situacao = '1_JA_LANCADO'; alvo = jaLancado.map((x) => `${x.desc} (${x.tit})`).join(' | ') }
  else if (candAberto.length === 1) { situacao = '2_FALTA_LANCAR_1x1'; alvo = `${candAberto[0].desc} | ${candAberto[0].forn} | venc ${candAberto[0].venc} | ${candAberto[0].tit}` }
  else if (candAberto.length > 1) { situacao = '3_FALTA_LANCAR_AMBIGUO'; alvo = candAberto.map((a) => `${a.desc} (${a.tit})`).join(' | ') }
  else if (p && candPessoa.length) {
    situacao = Math.abs(somaPessoa - v) < 0.02 ? '4_PAGAMENTO_AGRUPADO' : '5_SEM_TITULO_EXATO'
    alvo = `${p}: ${candPessoa.length} titulos abertos somando R$ ${fmt(somaPessoa)}`
  } else { situacao = '6_SEM_TITULO_NO_HASTA'; alvo = '' }

  return { situacao, data: m.data, valor: v, descricao_extrato: m.descricao, pessoa: p || '', conciliado: m.status_conciliacao, alvo_hastapro: alvo }
})

const ordem = ['1_JA_LANCADO', '2_FALTA_LANCAR_1x1', '3_FALTA_LANCAR_AMBIGUO', '4_PAGAMENTO_AGRUPADO', '5_SEM_TITULO_EXATO', '6_SEM_TITULO_NO_HASTA']
for (const s of ordem) {
  const g = linhas.filter((l) => l.situacao === s)
  if (!g.length) continue
  console.log(`\n### ${s}: ${g.length} | R$ ${fmt(g.reduce((a, l) => a + l.valor, 0))}`)
  for (const l of g) console.log(`  ${l.data} | ${String(fmt(l.valor)).padStart(11)} | ${l.descricao_extrato.slice(0, 72)}\n      -> ${l.alvo_hastapro || '(nada correspondente)'}`)
}

console.log(`\n### HASTAPRO: baixas ja feitas em agosto: ${pagosAgo.length} | R$ ${fmt(pagosAgo.reduce((s, x) => s + x.valor, 0))}`)
for (const x of pagosAgo) console.log(`  pago ${x.pago} | ${String(fmt(x.valor)).padStart(11)} | ${x.desc} | ${x.forn} | ${x.forma}`)

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Extrato ago x HastaPro')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(abertos), 'HastaPro em aberto')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pagosAgo), 'HastaPro baixado em ago')
XLSX.writeFile(wb, 'C:/Users/Notebook-Acer/Desktop/Mapa-HastaPro-Agosto-2026.xlsx')
writeFileSync(`${SCRATCH}/mapa-agosto.json`, JSON.stringify(linhas, null, 1), 'utf-8')
console.log('\nXLSX -> C:/Users/Notebook-Acer/Desktop/Mapa-HastaPro-Agosto-2026.xlsx')
