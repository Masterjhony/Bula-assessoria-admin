/**
 * Guarda de regressão da métrica de atendimento.
 *
 * Roda as QUATRO superfícies contra o mesmo banco e exige que deem o mesmo
 * número: o módulo TS (aba Métricas, Growth, Relatórios, resumo diário), o SQL
 * compartilhado dos relatórios, o caminho PostgREST que a tela realmente usa, e
 * a referência fechada contra o faturamento da Meta em 11/08/2026 (1.837
 * disparos apurados × 1.832 cobrados por ela).
 *
 * Existe porque a regra vive em dois lugares por necessidade — TypeScript para
 * o app, SQL para os relatórios que falam direto com o Postgres. Duas cópias da
 * mesma regra divergem em silêncio; este script faz a divergência doer.
 *
 * Sai com código 1 se não baterem. Rode depois de mexer em qualquer um dos dois
 * lados (src/lib/atendimento-stats.ts ou scripts/lib/atendimento-oficial.mjs):
 *
 *   node --experimental-strip-types scripts/checks/atendimento-consistencia.mts
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
for (const l of fs.readFileSync(path.join(raiz, '.env.local'), 'utf8').split(/\r?\n/)) {
    const i = l.indexOf('=')
    if (i < 1 || l.startsWith('#')) continue
    process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"|"$/g, '')
}

const { atendimentoResposta, FILTRO_API_OFICIAL } = await import('../../src/lib/atendimento-stats.ts')
const { CTE_ATENDIMENTO } = await import('../lib/atendimento-oficial.mjs')
const { createClient } = await import('@supabase/supabase-js')

/** Referência congelada: o que a apuração fechou contra a fatura da Meta. */
const REF = { pessoas: 1075, disparos: 1837, responderam: 327 }

const db = new pg.Client({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } })
await db.connect()

// 1) módulo TS — aba Métricas, Dashboard de Growth, aba Relatórios, resumo diário
const rows = (await db.query(
    `select phone, direction, status, origin, channel, created_at from whatsapp_messages order by created_at`,
)).rows
const ts = atendimentoResposta(rows as never)

// 2) SQL compartilhado — scripts de relatório
const sql = (await db.query(`${CTE_ATENDIMENTO}
  select (select count(*) from primeiro)::int pessoas,
         (select count(*) from disparo)::int disparos,
         (select count(*) from resposta where respondeu)::int responderam`)).rows[0]
await db.end()

// 3) caminho PostgREST — o que a tela realmente busca, com o filtro na consulta
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const via: unknown[] = []
for (let from = 0; ; from += 1000) {
    const { data } = await supa.from('whatsapp_messages')
        .select('phone, direction, status, origin, channel, created_at')
        .or(FILTRO_API_OFICIAL).not('phone', 'like', '%@g.us')
        .order('created_at').range(from, from + 999)
    if (!data?.length) break
    via.push(...data)
    if (data.length < 1000) break
}
const rest = atendimentoResposta(via as never)

const linhas: [string, number, number, number][] = [
    ['módulo TS (telas)', ts.disparados, ts.disparos, ts.responderam],
    ['SQL (scripts)', sql.pessoas, sql.disparos, sql.responderam],
    ['via PostgREST (.or)', rest.disparados, rest.disparos, rest.responderam],
    ['apuração × fatura Meta', REF.pessoas, REF.disparos, REF.responderam],
]
console.log('fonte                    | pessoas | disparos | responderam')
for (const [n, p, d, r] of linhas) {
    console.log(n.padEnd(24), '|', String(p).padStart(7), '|', String(d).padStart(8), '|', String(r).padStart(11))
}
const ok = linhas.every(([, p, d, r]) => p === REF.pessoas && d === REF.disparos && r === REF.responderam)
console.log(ok ? '\n✓ TODAS AS SUPERFÍCIES CONCORDAM' : '\n✗ DIVERGÊNCIA — investigar antes de confiar em qualquer número')
process.exit(ok ? 0 : 1)
