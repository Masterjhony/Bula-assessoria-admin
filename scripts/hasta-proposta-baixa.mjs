// Monta a PROPOSTA de baixa no HastaPro: casa cada titulo em aberto (FIL 2) com
// o pagamento correspondente no nosso ERP por (pessoa + valor + leilao).
// SOMENTE LEITURA. Nada e' escrito em lugar nenhum.
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
const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

// apelido canonico de quem recebe
const PESSOA = [
  [/FABIO.*OMENA|OMENA.*GAIA/, 'FABIO OMENA'],
  [/FELIPE VILELA ANDRADE/, 'BULINHA'],
  [/DOUGLAS BISPO/, 'DOUGLAS BISPO'],
  [/LEONARDO SERAFIM/, 'LEONARDO SERAFIM'],
  [/RUSA/, 'GUSTAVO RUSA'],
  [/PERALTA/, 'PERALTA'],
  [/VALERIA BORGES/, 'VALERIA'],
  [/ADILSON/, 'ADILSON (ADN VIAGENS)'],
  [/BUSSE/, 'BUSSE HOTELARIA'],
  [/CLICKWEB|CLICK WEB/, 'CLICKWEB'],
  [/FORMULA DO BOI/, 'FORMULA DO BOI (ambiguo)'],
]
const quem = (s) => { const n = norm(s); for (const [re, nome] of PESSOA) if (re.test(n)) return nome; return n }
const STOP = new Set(['LEILAO', 'VIRTUAL', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'ETAPA', 'EDICAO', 'NELORE', 'LEILOES', 'COMISSAO', 'VENDA', 'ASSESSORIA'])
const tokens = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+O?$/.test(w)))

// ─── HastaPro ────────────────────────────────────────────────────────────────
const db = await new Promise((res, rej) => Firebird.attach(options, (e, d) => (e ? rej(e) : res(d))))
let abertos = []
try {
  const cli = await q(db, 'SELECT CLI_CODIGO, CLI_NOME FROM CLIENTES')
  const cliDe = Object.fromEntries(cli.map((c) => [c.CLI_CODIGO, c.CLI_NOME]))
  const leis = await q(db, 'SELECT LEI_CODIGO, LEI_NOME, LEI_DATA FROM LEILAO')
  const leiDe = Object.fromEntries(leis.map((l) => [l.LEI_CODIGO, { nome: l.LEI_NOME, data: iso(l.LEI_DATA) }]))
  const rows = await q(db, `SELECT TIT_CODIGO, TIT_DESCRICAO, TIT_VALOR, TIT_DT_VENCTO, TIT_FORNECEDOR, LEI_CODIGO
    FROM FIN_TITULOS WHERE FIL_CODIGO='2' AND TIT_TIPO='D' AND TIT_STATUS <> 'PAGO' ORDER BY TIT_DT_VENCTO`)
  abertos = rows.map((r) => ({
    tit: r.TIT_CODIGO, desc: String(r.TIT_DESCRICAO || '').trim(), valor: Number(r.TIT_VALOR), venc: iso(r.TIT_DT_VENCTO),
    fornRaw: (cliDe[r.TIT_FORNECEDOR] || '').trim(), pessoa: quem(cliDe[r.TIT_FORNECEDOR]),
    leilao: leiDe[r.LEI_CODIGO]?.nome || null, leilaoData: leiDe[r.LEI_CODIGO]?.data || null,
  }))
} finally { db.detach() }

// ─── Nosso ERP ───────────────────────────────────────────────────────────────
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const { data: cp } = await sb.from('erp_contas_pagar').select('*').gte('vencimento', '2026-05-01').limit(2000)
const pagos = (cp || []).filter((c) => c.status === 'pago' && c.data_pagamento)
  .map((c) => ({ desc: c.descricao, valor: Number(c.valor_pago || c.valor), pago_em: c.data_pagamento, forma: c.forma_pagamento, pessoa: quem(c.descricao), tk: tokens(c.descricao) }))

const usados = new Set()
const linhas = abertos.map((a) => {
  const tkA = tokens(`${a.leilao || ''} ${a.desc}`)
  const cands = pagos
    .map((p, i) => {
      if (Math.abs(p.valor - a.valor) > 0.02) return null
      const inter = [...tkA].filter((t) => p.tk.has(t)).length
      const mesmaPessoa = p.pessoa === a.pessoa
      if (!mesmaPessoa && inter === 0) return null
      return { i, p, inter, mesmaPessoa, score: (mesmaPessoa ? 2 : 0) + Math.min(inter, 3) }
    })
    .filter(Boolean).sort((x, y) => y.score - x.score)
  const top = cands[0]
  let classe = 'C_SEM_PAGAMENTO'
  if (top && top.mesmaPessoa && top.inter > 0) classe = 'A_CASADO'
  else if (top) classe = 'B_REVISAR'
  const dup = top && usados.has(top.i)
  if (top && classe === 'A_CASADO') usados.add(top.i)
  return {
    classe: dup ? 'B_REVISAR' : classe,
    tit: a.tit, venc: a.venc, valor: a.valor, desc: a.desc, fornecedor: a.fornRaw, pessoa: a.pessoa,
    leilao: a.leilao, erp_desc: top?.p.desc || null, erp_pago_em: top?.p.pago_em || null, erp_forma: top?.p.forma || null,
    nota: dup ? 'o mesmo pagamento do ERP ja foi usado por outro titulo — possivel duplicidade no HastaPro' : (top && !top.mesmaPessoa ? 'valor bate mas o favorecido diverge' : ''),
  }
})

const fmt = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const grupo = (c) => linhas.filter((l) => l.classe === c)
for (const c of ['A_CASADO', 'B_REVISAR', 'C_SEM_PAGAMENTO']) {
  const g = grupo(c)
  console.log(`\n### ${c}: ${g.length} titulos | R$ ${fmt(g.reduce((s, l) => s + l.valor, 0))}`)
  for (const l of g) console.log(`  ${l.venc} | ${String(fmt(l.valor)).padStart(10)} | ${l.pessoa.padEnd(22)} | ${l.desc.slice(0, 42).padEnd(42)} | ${(l.leilao || 'sem leilao').slice(0, 38).padEnd(38)} | ${l.erp_pago_em ? `pago ${l.erp_pago_em} (${l.erp_forma || 's/forma'})` : ''} ${l.nota}`)
}

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Proposta baixa HastaPro')
XLSX.writeFile(wb, `${SCRATCH}/proposta-baixa-hastapro.xlsx`)
writeFileSync(`${SCRATCH}/proposta-baixa-hastapro.json`, JSON.stringify(linhas, null, 1), 'utf-8')
console.log('\nArquivos ->', SCRATCH)
