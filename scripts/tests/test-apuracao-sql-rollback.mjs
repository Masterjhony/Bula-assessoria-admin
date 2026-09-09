import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import pg from 'pg'
import dotenv from 'dotenv'

// Integration tests in temporary schema INSIDE one transaction. Never commits.
// Public tables are only read. LIKE does not copy foreign keys or triggers.
const env = dotenv.parse(fs.readFileSync('.env.local'))
const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const schema = `audit_cp_${randomUUID().replaceAll('-', '')}`
const output = process.argv[2] || path.resolve('outputs/test-apuracao-sql-rollback.json')
const report = { started_at: new Date().toISOString(), schema, isolation: 'transaction + private schema, ROLLBACK always; no public DML', migrations: [], clones: [], tests: [], rollback: false }
const tables = ['erp_contas_pagar', 'erp_contas_receber', 'erp_contas_bancarias', 'erp_movimentos_bancarios', 'erp_movimento_rateios', 'erp_plano_contas', 'erp_lancamentos', 'erp_lancamento_partidas']
let transaction = false
let savepoint = 0
const test = async (name, fn) => {
  const sp = `test_${++savepoint}`
  await c.query(`SAVEPOINT ${sp}`)
  try { await fn(); report.tests.push({ name, pass: true }) }
  catch (error) { report.tests.push({ name, pass: false, error: error.message, code: error.code }) }
  finally { await c.query(`ROLLBACK TO SAVEPOINT ${sp}`); await c.query(`RELEASE SAVEPOINT ${sp}`) }
}
const mustReject = async (sql, params, pattern) => {
  await c.query('SAVEPOINT expected_rejection')
  let rejected = false
  try { await c.query(sql, params) }
  catch (e) { rejected = true; assert.match(e.message, pattern) }
  finally { await c.query('ROLLBACK TO SAVEPOINT expected_rejection'); await c.query('RELEASE SAVEPOINT expected_rejection') }
  assert.ok(rejected, 'Expected database rejection')
}
let banco
const cp = async (patch = {}) => {
  const id = randomUUID()
  const base = { id, descricao: 'Fixture de auditoria isolada', valor: 100, valor_pago: 0, desconto: 0, juros: 0, multa: 0, emissao: '2026-09-09', vencimento: null, status: 'aberto', origem: 'real', tags: [], conta_bancaria_id: banco, recorrencia: 'nenhuma', apuracao: { natureza: 'obrigacao', valor_situacao: 'confirmado' }, ...patch }
  const keys = Object.keys(base)
  await c.query(`INSERT INTO ${schema}.erp_contas_pagar (${keys.join(',')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(',')})`, Object.values(base).map(value => Array.isArray(value) ? JSON.stringify(value) : value))
  return id
}
const pagar = id => c.query(`SELECT ${schema}.erp_registrar_pagamento_apurado($1,$2) AS resultado`, [id, { data_pagamento: '2026-09-09' }])
try {
  await c.connect()
  await c.query('BEGIN')
  transaction = true
  await c.query("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='90s'")
  await c.query(`CREATE SCHEMA ${schema}`)
  for (const [i, table] of tables.entries()) {
    await c.query(`CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`)
    const cols = (await c.query('SELECT column_name,column_default,is_generated,is_identity FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position', [schema, table])).rows
    const sequenceColumns = cols.filter(x => /nextval\(/i.test(x.column_default || ''))
    for (const [j, column] of sequenceColumns.entries()) {
      const localSeq = `${schema}.seq_${i}_${j}`
      await c.query(`CREATE SEQUENCE ${localSeq}`)
      await c.query(`ALTER TABLE ${schema}.${table} ALTER COLUMN ${column.column_name} SET DEFAULT nextval('${localSeq}'::regclass)`)
    }
    const columnList = cols.filter(x => x.is_generated === 'NEVER').map(x => x.column_name).join(',')
    const copied = await c.query(`INSERT INTO ${schema}.${table} (${columnList}) OVERRIDING SYSTEM VALUE SELECT ${columnList} FROM public.${table}`)
    for (const [j, column] of sequenceColumns.entries()) {
      await c.query(`SELECT setval('${schema}.seq_${i}_${j}',greatest(coalesce(max(${column.column_name}),0)+1,1),false) FROM ${schema}.${table}`)
    }
    const remainingExternalSequences = (await c.query("SELECT column_name,column_default FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_default LIKE '%nextval(%'", [schema, table])).rows.filter(x => !x.column_default.includes(schema))
    assert.equal(remainingExternalSequences.length, 0, `External sequence default in ${table}`)
    report.clones.push({ table, rows: copied.rowCount, localized_sequences: sequenceColumns.length })
  }
  for (const filename of ['0085_obrigacoes_apuracao.sql', '0086_pagamento_atomico.sql']) {
    const original = fs.readFileSync(`supabase/migrations/${filename}`, 'utf8')
    assert.ok(!/\bCOMMIT\b/i.test(original), 'Migration must not commit')
    const sql = original.replace(/\bpublic\./gi, `${schema}.`).replace(/search_path\s*=\s*public/gi, `search_path=${schema}`).replace(/NOTIFY\s+pgrst[^;]*;/gi, '')
    assert.ok(!/\bpublic\./i.test(sql), 'Every public reference must be isolated')
    await c.query(sql)
    report.migrations.push({ filename, sha256: createHash('sha256').update(original).digest('hex'), compiled: true })
  }
  banco = (await c.query(`SELECT id FROM ${schema}.erp_contas_bancarias WHERE ativo ORDER BY id LIMIT 1`)).rows[0]?.id
  assert.ok(banco, 'Active bank fixture required')

  await test('CP accepts genuinely unknown due date', async () => {
    const id = await cp()
    const row = (await c.query(`SELECT vencimento FROM ${schema}.erp_contas_pagar WHERE id=$1`, [id])).rows[0]
    assert.equal(row.vencimento, null)
  })
  await test('JSON null classifications and invalid month are rejected', async () => {
    const id = await cp()
    for (const apuracao of [{ natureza: null }, { valor_situacao: null }, { pagamento_situacao: null }, { fontes: null }, { pendencias: null }, { previsao_mes: '2026-19-01' }]) {
      await mustReject(`UPDATE ${schema}.erp_contas_pagar SET apuracao=$2 WHERE id=$1`, [id, apuracao], /inválid/i)
    }
  })
  await test('status-only paid update cannot bypass full liquidation', async () => {
    const id = await cp()
    await mustReject(`UPDATE ${schema}.erp_contas_pagar SET status='pago' WHERE id=$1`, [id], /liquidação integral/)
  })
  await test('uncertain amount blocks direct payment and RPC', async () => {
    const id = await cp({ apuracao: { natureza: 'obrigacao', valor_situacao: 'a_apurar' } })
    await mustReject(`UPDATE ${schema}.erp_contas_pagar SET valor_pago=100,status='pago' WHERE id=$1`, [id], /Conclua a apuração/)
    await mustReject(`SELECT ${schema}.erp_registrar_pagamento_apurado($1,'{}')`, [id], /Conclua a apuração/)
  })
  await test('future projection cannot be paid by RPC', async () => {
    const id = await cp({ origem: 'estimativa', apuracao: { natureza: 'projecao' } })
    await mustReject(`SELECT ${schema}.erp_registrar_pagamento_apurado($1,'{}')`, [id], /projeção/)
  })
  await test('legacy budget JSON tags still block paying a future projection', async () => {
    const id = await cp({ tags: ['orcamento'], apuracao: {} })
    await mustReject(`SELECT ${schema}.erp_registrar_pagamento_apurado($1,'{}')`, [id], /projeção/)
  })
  await test('reported payment must be reconciled instead of generating a second bank debit', async () => {
    const id = await cp({ apuracao: { natureza: 'obrigacao', valor_situacao: 'confirmado', pagamento_situacao: 'informado' } })
    await mustReject(`SELECT ${schema}.erp_registrar_pagamento_apurado($1,'{}')`, [id], /Quitação já informada/)
    const movements = (await c.query(`SELECT count(*)::int AS n FROM ${schema}.erp_movimentos_bancarios WHERE conta_pagar_id=$1`, [id])).rows[0].n
    assert.equal(movements, 0)
  })
  await test('payment larger than balance rejected without mutation', async () => {
    const id = await cp()
    await mustReject(`SELECT ${schema}.erp_registrar_pagamento_apurado($1,'{"valor":101}')`, [id], /não superar/)
    assert.equal(Number((await c.query(`SELECT valor_pago FROM ${schema}.erp_contas_pagar WHERE id=$1`, [id])).rows[0].valor_pago), 0)
  })
  await test('condition requires complete received title AND linked bank credit', async () => {
    const cr = randomUUID()
    await c.query(`INSERT INTO ${schema}.erp_contas_receber(id,descricao,valor,valor_recebido,emissao,vencimento,status,origem) VALUES ($1,'CR condicionado teste',100,0,'2026-09-09','2026-09-09','aberto','real')`, [cr])
    const id = await cp({ apuracao: { natureza: 'obrigacao', valor_situacao: 'confirmado', condicao: { tipo: 'recebimento', titulos_ids: [cr], descricao: 'Segunda parcela' } } })
    await mustReject(`SELECT ${schema}.erp_registrar_pagamento_apurado($1,'{}')`, [id], /integralmente confirmado/)
    await c.query(`UPDATE ${schema}.erp_contas_receber SET valor_recebido=100,status='recebido' WHERE id=$1`, [cr])
    await mustReject(`SELECT ${schema}.erp_registrar_pagamento_apurado($1,'{}')`, [id], /crédito bancário integral/)
    await c.query(`INSERT INTO ${schema}.erp_movimentos_bancarios(conta_bancaria_id,data,tipo,descricao,valor,conta_receber_id,origem) VALUES ($1,'2026-09-09','entrada','Crédito teste',100,$2,'manual')`, [banco, cr])
    await pagar(id)
    assert.equal((await c.query(`SELECT status FROM ${schema}.erp_contas_pagar WHERE id=$1`, [id])).rows[0].status, 'pago')
  })
  await test('reversal and repayment do not duplicate next recurring cycle', async () => {
    const id = await cp({ recorrencia: 'trimestral' })
    await pagar(id)
    await c.query(`SELECT ${schema}.erp_estornar_pagamento_apurado($1)`, [id])
    await pagar(id)
    const rows = (await c.query(`SELECT valor,vencimento,apuracao FROM ${schema}.erp_contas_pagar WHERE apuracao->>'recorrencia_de'=$1`, [id])).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].vencimento, null)
    assert.equal(rows[0].apuracao.natureza, 'projecao')
    assert.equal(rows[0].apuracao.valor_situacao, 'a_apurar')
  })
  await test('bank insert failure rolls back title update atomically', async () => {
    const id = await cp()
    await c.query(`CREATE FUNCTION ${schema}.reject_test_movement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected bank failure'; END $$; CREATE TRIGGER reject_test_movement BEFORE INSERT ON ${schema}.erp_movimentos_bancarios FOR EACH ROW EXECUTE FUNCTION ${schema}.reject_test_movement()`)
    await mustReject(`SELECT ${schema}.erp_registrar_pagamento_apurado($1,'{}')`, [id], /injected bank failure/)
    const row = (await c.query(`SELECT status,valor_pago FROM ${schema}.erp_contas_pagar WHERE id=$1`, [id])).rows[0]
    assert.equal(row.status, 'aberto'); assert.equal(Number(row.valor_pago), 0)
  })
} catch (e) {
  report.fatal = { message: e.message, code: e.code }
} finally {
  if (transaction) { await c.query('ROLLBACK'); report.rollback = true }
  if (transaction) report.schema_absent_after_rollback = (await c.query('SELECT count(*)::int AS n FROM pg_namespace WHERE nspname=$1', [schema])).rows[0].n === 0
  await c.end()
  report.finished_at = new Date().toISOString()
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ tests: report.tests, rollback: report.rollback, schema_absent_after_rollback: report.schema_absent_after_rollback, fatal: report.fatal, output }))
  if (report.fatal || report.tests.some(t => !t.pass) || !report.rollback) process.exitCode = 1
}
