/**
 * CONFERÊNCIA DIRETA NO HASTAPRO — a lista de patrocinados do Leozinho.
 *
 *   node scripts/confere-leozinho-hastapro.mjs
 *
 * A diretoria mandou (14/08) a lista de 5 clientes "provenientes de
 * patrocinados" do Leonardo. Três deles não apareciam no extrato que o
 * pipeline usa — e a causa apareceu aqui: parte das compras está na filial
 * '01' (Bula Remates), que a montagem da base de clientes exclui de propósito.
 *
 * Este script vai ao ERP ao vivo SEM filtro de filial, resolve o nome do
 * pisteiro e lista TUDO do Leozinho no ano, para conferir a lista item a item.
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
const dia = d => new Date(d).toISOString().slice(0, 10)

const db = await new Promise((res, rej) => Firebird.attach(opts, (e, d) => e ? rej(e) : res(d)))
const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => e ? rej(e) : res(r.map(norm))))

const LEOZINHO = '251031200406473'

try {
    /* 1. quem é quem entre os pisteiros */
    console.log('PISTEIROS (nome ↔ código)')
    const cols = await q(`select rdb$field_name f from rdb$relation_fields where rdb$relation_name = 'PISTEIROS'`)
    const campos = cols.map(c => String(c.f).trim())
    console.log('  campos de PISTEIROS:', campos.join(', '))
    const nomeCampo = campos.find(c => /NOME/.test(c))
    const codCampo = campos.find(c => /CODIGO/.test(c))
    if (nomeCampo && codCampo) {
        for (const p of await q(`select ${codCampo}, ${nomeCampo} from PISTEIROS`)) {
            const cod = String(p[codCampo.toLowerCase()] ?? '')
            console.log(`  ${cod === LEOZINHO ? '>>>' : '   '} ${cod.padEnd(20)} ${p[nomeCampo.toLowerCase()]}`)
        }
    }

    /* 2. tudo do Leozinho em 2026, TODAS as filiais */
    console.log(`\n${'='.repeat(92)}\nTUDO DO PISTEIRO ${LEOZINHO} EM 2026 (todas as filiais)`)
    const linhas = await q(`
        select l.FIL_CODIGO fil, l.LEI_NOME, l.LEI_DATA, lo.LOT_LOTE, lo.LOT_QTD, lo.LOT_TOTAL,
               c.COP_PORCENTAGEM, cl.CLI_NOME, cl.CLI_CODIGO, cl.CLI_CPFCNPJ, cl.CLI_UF, cl.CLI_CELULAR
          from LOTES lo
          join LEILAO l    on l.FIL_CODIGO = lo.FIL_CODIGO and l.LEI_CODIGO = lo.LEI_CODIGO
          left join COMPRADORES c on c.FIL_CODIGO = lo.FIL_CODIGO and c.LEI_CODIGO = lo.LEI_CODIGO and c.LOT_LOTE = lo.LOT_LOTE
          left join CLIENTES cl on cl.CLI_CODIGO = c.CLI_CODIGO
         where lo.LOT_PISTEIRO = '${LEOZINHO}' and l.LEI_DATA >= '2026-01-01'
         order by l.LEI_DATA, lo.LOT_LOTE`)
    let tv = 0, ta = 0
    for (const r of linhas) {
        const val = Number(r.lot_total) * (Number(r.cop_porcentagem ?? 100) / 100)
        tv += val; ta += Number(r.lot_qtd || 0)
        console.log(`  FIL ${String(r.fil).padEnd(2)} | ${dia(r.lei_data)} | ${String(r.lei_nome).slice(0, 40).padEnd(40)} | lt ${String(r.lot_lote).padStart(4)} | q ${String(r.lot_qtd).padStart(3)} | ${brl(r.lot_total).padStart(13)} | %${String(r.cop_porcentagem ?? '-').padStart(4)} | ${r.cli_nome ?? '(sem comprador)'} ${r.cli_uf ?? ''}`)
    }
    console.log(`  TOTAL: ${linhas.length} lotes, ${ta} animais, R$ ${brl(tv)}`)

    /* 3. caça aos nomes que faltam, por grafia solta */
    console.log(`\n${'='.repeat(92)}\nCAÇA POR GRAFIA (TALES/TALLES/THALES e JOSE LUIZ), 2026, todas as filiais`)
    for (const padrao of ['%TALES%', '%TALLES%', '%THALES%', '%JOSE LUIZ%', '%JOSÉ LUIZ%']) {
        const achados = await q(`
            select l.FIL_CODIGO fil, l.LEI_NOME, l.LEI_DATA, lo.LOT_LOTE, lo.LOT_QTD, lo.LOT_TOTAL,
                   lo.LOT_PISTEIRO, cl.CLI_NOME, cl.CLI_CODIGO, cl.CLI_UF
              from COMPRADORES c
              join LEILAO l    on l.FIL_CODIGO = c.FIL_CODIGO and l.LEI_CODIGO = c.LEI_CODIGO
              join LOTES lo    on lo.FIL_CODIGO = c.FIL_CODIGO and lo.LEI_CODIGO = c.LEI_CODIGO and lo.LOT_LOTE = c.LOT_LOTE
              join CLIENTES cl on cl.CLI_CODIGO = c.CLI_CODIGO
             where upper(cl.CLI_NOME) like '${padrao}' and l.LEI_DATA >= '2026-01-01'
             order by l.LEI_DATA`)
        console.log(`  ${padrao}: ${achados.length} lote(s)`)
        for (const r of achados) {
            console.log(`    FIL ${String(r.fil).padEnd(2)} | ${dia(r.lei_data)} | ${String(r.lei_nome).slice(0, 38).padEnd(38)} | lt ${String(r.lot_lote).padStart(4)} | q ${r.lot_qtd} | ${brl(r.lot_total).padStart(12)} | pist ${r.lot_pisteiro === LEOZINHO ? 'LEOZINHO' : (r.lot_pisteiro ?? '-')} | ${r.cli_nome} ${r.cli_uf ?? ''}`)
        }
    }

    /* 4. o leilão São Geraldo inteiro — é campanha nossa e está na FIL 01 */
    console.log(`\n${'='.repeat(92)}\nLEILÃO SÃO GERALDO 01/08 (campanha nossa) — compradores, todas as filiais`)
    for (const r of await q(`
        select l.FIL_CODIGO fil, l.LEI_NOME, l.LEI_DATA, lo.LOT_LOTE, lo.LOT_QTD, lo.LOT_TOTAL,
               lo.LOT_PISTEIRO, cl.CLI_NOME, cl.CLI_UF
          from COMPRADORES c
          join LEILAO l    on l.FIL_CODIGO = c.FIL_CODIGO and l.LEI_CODIGO = c.LEI_CODIGO
          join LOTES lo    on lo.FIL_CODIGO = c.FIL_CODIGO and lo.LEI_CODIGO = c.LEI_CODIGO and lo.LOT_LOTE = c.LOT_LOTE
          join CLIENTES cl on cl.CLI_CODIGO = c.CLI_CODIGO
         where upper(l.LEI_NOME) like '%SÃO GERALDO%' and l.LEI_DATA >= '2026-01-01'
         order by lo.LOT_LOTE`)) {
        console.log(`  FIL ${String(r.fil).padEnd(2)} | ${dia(r.lei_data)} | lt ${String(r.lot_lote).padStart(4)} | q ${String(r.lot_qtd).padStart(2)} | ${brl(r.lot_total).padStart(12)} | pist ${r.lot_pisteiro === LEOZINHO ? 'LEOZINHO' : (r.lot_pisteiro ?? '-')} | ${r.cli_nome} ${r.cli_uf ?? ''}`)
    }
} finally { db.detach() }
