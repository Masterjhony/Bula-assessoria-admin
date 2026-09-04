/**
 * Conciliação Sicoob 04/09/2026.
 *
 * Fonte: "sicoob_2026_09_04_17_03_38.pdf" (período 28/08–04/09, saldo final
 * 17.652,19 em 04/09), baixado pelo João em 04/09 17:03, convertido por
 * scripts/sicoob-pdf-para-csv.mjs (validação por saldo OK) e importado por
 * scripts/importa-extrato.mts (6 novos / 16 deduplicados).
 *
 * Os 6 lançamentos novos são todos do dia 04/09 e todos SAÍDA — nenhum crédito
 * entrou. Isso confirma o que o João disse: o Santa Nazaré (5.714,00, atrasado
 * de maio) estava previsto para hoje e NÃO pagou.
 *
 * Os três reembolsos somam exatamente 10.874,24, que é o valor que o João
 * anunciou no grupo às 16:46 como "Reembolsos ref Agosto" — ver a memória
 * `reembolsos-agosto-2026-apuracao`.
 *
 *   node scripts/concilia-sicoob-2026-09-04.mjs           # simula
 *   node scripts/concilia-sicoob-2026-09-04.mjs --apply   # grava
 */
import { readFileSync } from 'node:fs'
import pg from 'pg'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('='))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const APPLY = process.argv.includes('--apply')
const brl = n => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

const catId = async nome => (await c.query(`select id from erp_categorias where nome=$1 and ativo`, [nome])).rows[0]?.id
const pessoaPorDoc = async pref => (await c.query(
  `select id, nome from erp_pessoas where regexp_replace(coalesce(documento,''),'[^0-9]','','g') like $1 limit 1`, [pref + '%'])).rows[0]
const pessoaPorNome = async n => (await c.query(`select id, nome from erp_pessoas where nome ilike $1 limit 1`, [n])).rows[0]

const OPERACIONAL = await catId('Despesa Operacional Leilão')
const MARKETING = await catId('Marketing e Publicidade')
const OUTRAS = await catId('Outras Despesas')

const facebook = await pessoaPorDoc('13347016')
const fabio = await pessoaPorDoc('59791094')
const douglas = await pessoaPorDoc('50938748')
const leonardo = await pessoaPorNome('%LEONARDO%')

/** movimento_id → o título que ele quita */
const PLANO = [
  {
    mov: '6257d069-d1bf-4ca4-8aa4-4bc7de10de61', valor: 2500.00,
    desc: 'Marketing - campanha de trafego pago (leilao Jacamim)',
    cat: MARKETING, forn: facebook?.id,
  },
  {
    mov: '05011bf9-429a-4a16-9827-84890b502254', valor: 2877.22,
    desc: 'REEMBOLSO despesas de leiloes agosto/2026 - LEONARDO SERAFIM',
    cat: OPERACIONAL, forn: leonardo?.id,
  },
  {
    mov: 'db3f3d8a-3f88-4704-a102-013fa5cd2a18', valor: 6690.42,
    desc: 'REEMBOLSO despesas de leiloes agosto/2026 - FABIO OMENA',
    cat: OPERACIONAL, forn: fabio?.id,
  },
  {
    mov: 'b22d1fae-28ca-4e68-b34c-2fc17d0af147', valor: 1306.60,
    desc: 'REEMBOLSO despesas de leiloes agosto/2026 - DOUGLAS BISPO',
    cat: OPERACIONAL, forn: douglas?.id,
  },
  {
    mov: '5b91e297-1a07-4e20-a9e4-b6ae713899c6', valor: 2333.33,
    desc: 'Despesas EXPOGENETICA - casa/estrutura Uberaba - 2a parcela',
    cat: OPERACIONAL, forn: null,
  },
  {
    mov: 'a23e8760-1536-4fed-8a1f-d87c309615dc', valor: 20.00,
    desc: 'PIX 12.335.532/0001-69 - NAO IDENTIFICADO (04/09)',
    cat: OUTRAS, forn: null,
    obs: 'Contraparte nao identificada. Classificado em Outras Despesas para nao ficar sem categoria; confirmar com o Joao.',
  },
]

console.log(APPLY ? 'APLICANDO' : '[SIMULACAO — nada gravado]')
console.log(`categorias: operacional=${!!OPERACIONAL} marketing=${!!MARKETING} outras=${!!OUTRAS}`)
console.log(`fornecedores: facebook=${facebook?.nome} fabio=${fabio?.nome} douglas=${douglas?.nome} leonardo=${leonardo?.nome}\n`)

let total = 0
for (const p of PLANO) {
  const m = (await c.query(`select id, data::date d, valor::float v, status_conciliacao, conta_pagar_id
    from erp_movimentos_bancarios where id=$1`, [p.mov])).rows[0]
  if (!m) { console.log(`  !! movimento ${p.mov} nao encontrado`); continue }
  if (Math.abs(m.v - p.valor) > 0.005) { console.log(`  !! valor difere: extrato ${m.v} x plano ${p.valor}`); continue }
  if (m.conta_pagar_id) { console.log(`  .. ja conciliado: ${p.desc}`); continue }
  total += p.valor
  console.log(`  ${brl(p.valor).padStart(14)}  ${p.desc}`)
  if (!APPLY) continue

  const cp = (await c.query(`
    insert into erp_contas_pagar
      (descricao, valor, valor_pago, emissao, vencimento, data_pagamento, status, origem,
       categoria_id, fornecedor_id, conta_bancaria_id, observacoes)
    select $1,$2,$2,'2026-09-04','2026-09-04','2026-09-04','pago','real',$3,$4,
      (select conta_bancaria_id from erp_movimentos_bancarios where id=$5), $6
    returning id`, [p.desc, p.valor, p.cat, p.forn, p.mov, p.obs || null])).rows[0]

  await c.query(`update erp_movimentos_bancarios
    set conta_pagar_id=$1, categoria_id=$2, pessoa_id=$3, status_conciliacao='conciliado', conciliado=true
    where id=$4`, [cp.id, p.cat, p.forn, p.mov])
}

console.log(`\n  total ${brl(total)}`)
const pend = (await c.query(`select count(*)::int n from erp_movimentos_bancarios
  where status_conciliacao<>'conciliado' or categoria_id is null`)).rows[0].n
const saldo = (await c.query(`select saldo_atual::float s from erp_contas_bancarias where nome ilike 'Sicoob%'`)).rows[0].s
console.log(`  movimentos pendentes agora: ${pend}`)
console.log(`  saldo Sicoob: ${brl(saldo)}`)
if (!APPLY) console.log('\nRode de novo com --apply para gravar.')
await c.end()
