/**
 * DIAGNÓSTICO — o que a base de clientes perde por só olhar a filial '2'.
 *
 *   node scripts/diagnostico-filial-hastapro.mjs
 *
 * A lista de patrocinados do Leozinho (14/08) tem 3 clientes que não apareciam
 * na apuração. Todos os 3 compraram em leilões da filial '01' — que a montagem
 * exclui por premissa ("FIL 2 é a cobertura Bula"). Este script testa essa
 * premissa: descobre o nome de cada pisteiro, mede quanto de FIL '01' foi
 * atendido por pisteiro da equipe Bula, e lista os leilões envolvidos.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Firebird from 'node-firebird'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env.local', '.env']) {
    const p = path.join(ROOT, f)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (!m) continue
        let v = m[2].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
        if (!(m[1] in process.env)) process.env[m[1]] = v
    }
}
const opts = {
    host: process.env.HASTAPRO_HOST, port: +process.env.HASTAPRO_PORT,
    database: process.env.HASTAPRO_DATABASE, user: process.env.HASTAPRO_USER,
    password: process.env.HASTAPRO_PASSWORD, lowercase_keys: true,
}
const txt = v => (Buffer.isBuffer(v) ? v.toString('latin1') : v)
const norm = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, txt(v)]))
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const db = await new Promise((res, rej) => Firebird.attach(opts, (e, d) => e ? rej(e) : res(d)))
const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => e ? rej(e) : res(r.map(norm))))

try {
    /* 1. onde mora o nome do pisteiro */
    const tabs = await q(`select rdb$relation_name t from rdb$relations
        where rdb$system_flag = 0 and (rdb$relation_name like '%PIST%' or rdb$relation_name like '%VEND%'
           or rdb$relation_name like '%FUNC%' or rdb$relation_name like '%COLAB%' or rdb$relation_name like '%USU%')`)
    console.log('TABELAS candidatas:', tabs.map(t => String(t.t).trim()).join(', ') || '(nenhuma)')
    for (const t of tabs) {
        const nome = String(t.t).trim()
        const cs = await q(`select rdb$field_name f from rdb$relation_fields where rdb$relation_name = '${nome}'`)
        console.log(`  ${nome}: ${cs.map(c => String(c.f).trim()).join(', ')}`)
    }

    /* 2. filiais existentes e peso de cada uma em 2026 */
    console.log(`\n${'='.repeat(90)}\nFILIAIS EM 2026 (lotes com comprador)`)
    for (const r of await q(`
        select l.FIL_CODIGO fil, count(*) lotes, sum(lo.LOT_TOTAL * (coalesce(c.COP_PORCENTAGEM,100)/100)) total,
               count(distinct l.LEI_CODIGO) leiloes
          from COMPRADORES c
          join LEILAO l on l.FIL_CODIGO = c.FIL_CODIGO and l.LEI_CODIGO = c.LEI_CODIGO
          join LOTES lo on lo.FIL_CODIGO = c.FIL_CODIGO and lo.LEI_CODIGO = c.LEI_CODIGO and lo.LOT_LOTE = c.LOT_LOTE
         where l.LEI_DATA >= '2026-01-01'
         group by l.FIL_CODIGO`)) {
        console.log(`  FIL ${String(r.fil).padEnd(3)} | ${String(r.leiloes).padStart(3)} leilões | ${String(r.lotes).padStart(5)} lotes | R$ ${brl(r.total)}`)
    }

    /* 3. os pisteiros que atuam nas DUAS filiais — são a equipe Bula */
    console.log(`\n${'='.repeat(90)}\nPISTEIROS QUE ATUAM NAS DUAS FILIAIS (equipe Bula) — 2026`)
    const porPist = await q(`
        select lo.LOT_PISTEIRO pist, l.FIL_CODIGO fil, count(*) lotes,
               sum(lo.LOT_TOTAL * (coalesce(c.COP_PORCENTAGEM,100)/100)) total
          from COMPRADORES c
          join LEILAO l on l.FIL_CODIGO = c.FIL_CODIGO and l.LEI_CODIGO = c.LEI_CODIGO
          join LOTES lo on lo.FIL_CODIGO = c.FIL_CODIGO and lo.LEI_CODIGO = c.LEI_CODIGO and lo.LOT_LOTE = c.LOT_LOTE
         where l.LEI_DATA >= '2026-01-01' and lo.LOT_PISTEIRO is not null
         group by lo.LOT_PISTEIRO, l.FIL_CODIGO`)
    const mapa = {}
    for (const r of porPist) {
        const p = String(r.pist).trim()
        mapa[p] = mapa[p] || {}
        mapa[p][String(r.fil).trim()] = { lotes: +r.lotes, total: +r.total }
    }
    let fil01DeQuemTambemEstaEmFil2 = 0
    for (const [p, f] of Object.entries(mapa).sort((a, b) => (b[1]['01']?.total || 0) - (a[1]['01']?.total || 0))) {
        const emDuas = f['2'] && f['01']
        if (emDuas) fil01DeQuemTambemEstaEmFil2 += f['01'].total
        console.log(`  ${emDuas ? '>>>' : '   '} ${p.padEnd(20)} FIL2: ${String(f['2']?.lotes ?? 0).padStart(4)} lotes R$ ${brl(f['2']?.total ?? 0).padStart(15)}  |  FIL01: ${String(f['01']?.lotes ?? 0).padStart(4)} lotes R$ ${brl(f['01']?.total ?? 0).padStart(15)}`)
    }
    console.log(`\n  >>> FIL '01' atendido por pisteiro que TAMBÉM atua na FIL '2': R$ ${brl(fil01DeQuemTambemEstaEmFil2)}`)

    /* 4. os leilões de FIL 01 que são campanha nossa (São Geraldo, JMP, Perpétuo…) */
    console.log(`\n${'='.repeat(90)}\nLEILÕES DA FIL '01' EM 2026 (nome, data, VGV) — para achar os que a Bula divulgou`)
    for (const r of await q(`
        select l.LEI_NOME, l.LEI_DATA, count(*) lotes,
               sum(lo.LOT_TOTAL * (coalesce(c.COP_PORCENTAGEM,100)/100)) total
          from COMPRADORES c
          join LEILAO l on l.FIL_CODIGO = c.FIL_CODIGO and l.LEI_CODIGO = c.LEI_CODIGO
          join LOTES lo on lo.FIL_CODIGO = c.FIL_CODIGO and lo.LEI_CODIGO = c.LEI_CODIGO and lo.LOT_LOTE = c.LOT_LOTE
         where l.LEI_DATA >= '2026-01-01' and l.FIL_CODIGO = '01'
         group by l.LEI_NOME, l.LEI_DATA order by l.LEI_DATA`)) {
        console.log(`  ${new Date(r.lei_data).toISOString().slice(0, 10)} | ${String(r.lei_nome).slice(0, 52).padEnd(52)} | ${String(r.lotes).padStart(4)} lotes | R$ ${brl(r.total)}`)
    }
} finally { db.detach() }
