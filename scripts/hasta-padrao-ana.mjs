// Engenharia reversa do padrao de lancamento da Ana (usuario 48) na filial 2.
// SOMENTE LEITURA. Objetivo: baixar do mesmo jeito que ela baixa.
import { readFileSync } from 'node:fs'
import Firebird from 'node-firebird'

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
const pct = (a, b) => `${a}/${b} (${Math.round((a / b) * 100)}%)`

const db = await new Promise((res, rej) => Firebird.attach(options, (e, d) => (e ? rej(e) : res(d))))
try {
  const cli = Object.fromEntries((await q(db, 'SELECT CLI_CODIGO,CLI_NOME FROM CLIENTES')).map((c) => [c.CLI_CODIGO, (c.CLI_NOME || '').trim()]))
  const cat = Object.fromEntries((await q(db, 'SELECT FCT_CODIGO,FCT_DESCRICAO FROM FIN_CATEGORIAS')).map((c) => [c.FCT_CODIGO, c.FCT_DESCRICAO]))

  const rows = await q(db, `SELECT t.TIT_CODIGO,t.TIT_DESCRICAO,t.TIT_VALOR,t.TIT_DOCUMENTO,t.TIT_DT_VENCTO,t.TIT_DT_EMISSAO,
      t.TIT_DT_COMPETENCIA,t.FCT_CODIGO,t.LEI_CODIGO,t.TIT_FORNECEDOR,t.USU_CODIGO,t.TIT_ALTERACAO,t.TIT_NOTAFISCAL,t.FCC_CODIGO,
      m.MOV_PAGODIA,m.MOV_PAGAMENTO,m.MOV_VALOR,m.MOV_JUROS,m.MOV_DESCONTO,m.MOV_DOCUMENTO,m.FCO_CODIGO,m.USU_CODIGO AS MOV_USU
    FROM FIN_TITULOS t JOIN FIN_MOVIMENTO m ON m.TIT_CODIGO=t.TIT_CODIGO
    WHERE t.FIL_CODIGO='2' AND t.TIT_TIPO='D' AND t.TIT_STATUS='PAGO'`)

  const com = rows.filter((r) => /COMISS/i.test(r.TIT_DESCRICAO || ''))
  console.log(`Baixas de despesa na filial 2: ${rows.length} | dessas, comissao: ${com.length}\n`)

  console.log('=== FORMA DE PAGAMENTO (so comissoes) ===')
  const f = {}; for (const r of com) f[r.MOV_PAGAMENTO || '(vazio)'] = (f[r.MOV_PAGAMENTO || '(vazio)'] || 0) + 1
  for (const [k, v] of Object.entries(f).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)} ${k}`)

  console.log('\n=== DATA DO PAGAMENTO x VENCIMENTO (comissoes) ===')
  let igual = 0; let depois = 0; let antes = 0
  for (const r of com) {
    const p = iso(r.MOV_PAGODIA); const v = iso(r.TIT_DT_VENCTO)
    if (p === v) igual++; else if (p > v) depois++; else antes++
  }
  console.log(`  pago na data do vencimento: ${pct(igual, com.length)}`)
  console.log(`  pago DEPOIS (ela poe a data real): ${pct(depois, com.length)}`)
  console.log(`  pago antes: ${pct(antes, com.length)}`)

  console.log('\n=== CAMPOS PREENCHIDOS (comissoes pagas) ===')
  const cnt = (fn) => com.filter(fn).length
  console.log(`  TIT_DOCUMENTO (NF): ${pct(cnt((r) => r.TIT_DOCUMENTO), com.length)}`)
  console.log(`  MOV_DOCUMENTO: ${pct(cnt((r) => r.MOV_DOCUMENTO), com.length)}`)
  console.log(`  FCO_CODIGO (conta bancaria na baixa): ${pct(cnt((r) => r.FCO_CODIGO), com.length)}`)
  console.log(`  FCC_CODIGO (centro de custo): ${pct(cnt((r) => r.FCC_CODIGO), com.length)}`)
  console.log(`  LEI_CODIGO (leilao): ${pct(cnt((r) => r.LEI_CODIGO), com.length)}`)
  console.log(`  juros ou desconto <> 0: ${pct(cnt((r) => Number(r.MOV_JUROS) || Number(r.MOV_DESCONTO)), com.length)}`)
  console.log(`  MOV_VALOR = TIT_VALOR (baixa integral): ${pct(cnt((r) => Math.abs(Number(r.MOV_VALOR) - Number(r.TIT_VALOR)) < 0.01), com.length)}`)
  console.log(`  competencia = vencimento: ${pct(cnt((r) => iso(r.TIT_DT_COMPETENCIA) === iso(r.TIT_DT_VENCTO)), com.length)}`)

  console.log('\n=== FORMATO DO CAMPO DOCUMENTO (as NFs que ela usa) ===')
  const docs = {}; for (const r of rows) if (r.TIT_DOCUMENTO) docs[String(r.TIT_DOCUMENTO).trim()] = (docs[String(r.TIT_DOCUMENTO).trim()] || 0) + 1
  console.log('  ' + Object.entries(docs).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => `${k}(${v})`).join('  '))

  console.log('\n=== QUEM LANCA ===')
  const u = {}; for (const r of rows) u[`tit:${r.USU_CODIGO} mov:${r.MOV_USU}`] = (u[`tit:${r.USU_CODIGO} mov:${r.MOV_USU}`] || 0) + 1
  for (const [k, v] of Object.entries(u).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`  ${String(v).padStart(4)} ${k}`)

  console.log('\n=== ULTIMAS 12 BAIXAS DE COMISSAO (o modelo a imitar) ===')
  for (const r of com.sort((a, b) => String(b.MOV_PAGODIA).localeCompare(String(a.MOV_PAGODIA))).slice(0, 12)) {
    console.log(`  pago ${iso(r.MOV_PAGODIA)} (venc ${iso(r.TIT_DT_VENCTO)}) | ${String(Number(r.TIT_VALOR).toLocaleString('pt-BR', { minimumFractionDigits: 2 })).padStart(10)} | ${String(r.MOV_PAGAMENTO).padEnd(16)} | doc:${String(r.TIT_DOCUMENTO || '-').padEnd(8)} | cat:${String(cat[r.FCT_CODIGO] || '-').padEnd(12)} | ${cli[r.TIT_FORNECEDOR]}`)
  }
} finally { db.detach() }
