/**
 * EXTRAÇÃO das fontes brutas para os relatórios de 2026 (pedido da diretoria,
 * 13/08/2026). Grava um JSON por fonte em outputs/base-clientes-2026/fontes/,
 * para que a montagem seja reprodutível e auditável sem bater de novo em
 * Firebird, Postgres e Google Sheets.
 *
 *   node scripts/extrai-fontes-2026.mjs
 *
 * Fontes: HastaPro (Firebird, somente leitura), Supabase (Postgres direto pelo
 * DATABASE_URL) e a planilha "Leads - Bula Assessoria" (Google Sheets).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import Firebird from 'node-firebird'
import { google } from 'googleapis'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'outputs', 'base-clientes-2026', 'fontes')

// env antes de qualquer client (o import é içado, então isto roda aqui mesmo)
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

fs.mkdirSync(OUT, { recursive: true })
const salva = (nome, dados) => {
    fs.writeFileSync(path.join(OUT, `${nome}.json`), JSON.stringify(dados))
    console.log(`  ${nome}: ${Array.isArray(dados) ? dados.length : Object.keys(dados).length}`)
}

/* ── 1. Postgres (Supabase) ───────────────────────────────────────────────── */

async function doPostgres() {
    console.log('Postgres:')
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
    await c.connect()
    const q = async (sql) => (await c.query(sql)).rows
    salva('pg-clientes', await q('select * from clientes'))
    salva('pg-crm-leads', await q(`select id, nome, telefone, celular, email, cpf, inscricao_estadual,
        tem_inscricao_estadual, estado, cidade, origem, source, medium, campaign, utm_content, landing_url,
        interesse, interesse_principal, o_que_busca, quantidade_animais, momento_pecuaria, operacao_pecuaria,
        temperatura, is_mql, stage, status, arquivado, score_serasa, created_at, data_entrada, last_whatsapp_at,
        ultimo_contato, responsavel, assessoria, extra_data, tags_whatsapp from crm_leads`))
    salva('pg-fechamentos', await q('select * from bula_leilao_fechamento'))
    salva('pg-vendas-lances', await q('select * from bula_leilao_vendas'))
    salva('pg-cadastro-leiloeira', await q('select * from cliente_leiloeira_cadastro'))
    salva('pg-leiloeiras', await q('select * from leiloeiras'))
    salva('pg-cronograma', await q('select * from cronograma_leiloes'))
    salva('pg-toques', await q('select * from crm_toques'))
    salva('pg-lead-docs', await q('select * from crm_lead_documentos'))

    // Métrica oficial de atendimento — a MESMA regra do app (não reimplementar aqui).
    const { CTE_ATENDIMENTO } = await import('./lib/atendimento-oficial.mjs')
    salva('pg-atendimento', await q(`${CTE_ATENDIMENTO}
        select k, t, respondeu from resposta`))
    salva('pg-atendimento-origem', await q(`${CTE_ATENDIMENTO}
        select origin, k, t, respondeu from resposta_origem`))
    await c.end()
}

/* ── 2. HastaPro (Firebird, somente leitura) ──────────────────────────────── */

/** O Firebird do fornecedor devolve latin1 quebrado em alguns campos livres. */
const limpa = s => s == null ? null : String(s).replace(/�/g, '?').trim()
const normaliza = r => Object.fromEntries(Object.entries(r).map(([k, v]) =>
    [k, typeof v === 'string' ? limpa(v) : (v instanceof Date ? v.toISOString().slice(0, 10) : v)]))

async function doHastaPro() {
    console.log('HastaPro:')
    const opts = {
        host: process.env.HASTAPRO_HOST, port: +process.env.HASTAPRO_PORT,
        database: process.env.HASTAPRO_DATABASE, user: process.env.HASTAPRO_USER,
        password: process.env.HASTAPRO_PASSWORD, lowercase_keys: true,
    }
    const db = await new Promise((res, rej) => Firebird.attach(opts, (e, d) => e ? rej(e) : res(d)))
    const q = (sql) => new Promise((res, rej) => db.query(sql, [], (e, r) => e ? rej(e) : res(r.map(normaliza))))
    try {
        // Compras de 2026 com tudo que identifica o comprador. Sem filtro de
        // filial aqui: a separação Bula (FIL '2') x Bula Remates (FIL '01')
        // é decisão da montagem, e ter as duas ajuda a conferir.
        salva('hp-compras-2026', await q(`
            select l.FIL_CODIGO fil, l.LEI_CODIGO lei, l.LEI_NOME, l.LEI_DATA, l.LEI_UF, l.LEI_ESPECIE,
                   lo.LOT_LOTE, lo.LOT_QTD, lo.LOT_TOTAL, lo.LOT_LANCE, lo.LOT_PARCELAS, lo.LOT_TIPO,
                   lo.LOT_ESPECIE, lo.LOT_PISTEIRO, c.COP_PORCENTAGEM, c.CLI_CODIGO,
                   cl.CLI_NOME, cl.CLI_RAZAOSOCIAL, cl.CLI_CPFCNPJ, cl.CLI_RGINSCRICAO, cl.CLI_UF,
                   cl.CLI_CID_CODIGO, cl.CLI_CELULAR, cl.CLI_FONECOM1, cl.CLI_FONERES, cl.CLI_EMAIL,
                   cl.CLI_PESSOA, cl.CLI_DATACADASTRO
              from COMPRADORES c
              join LEILAO l   on l.FIL_CODIGO = c.FIL_CODIGO and l.LEI_CODIGO = c.LEI_CODIGO
              join LOTES lo   on lo.FIL_CODIGO = c.FIL_CODIGO and lo.LEI_CODIGO = c.LEI_CODIGO and lo.LOT_LOTE = c.LOT_LOTE
              join CLIENTES cl on cl.CLI_CODIGO = c.CLI_CODIGO
             where l.LEI_DATA >= '2026-01-01' and l.LEI_DATA < '2027-01-01'`))
        // Cadastro completo do ERP: 70% tem CPF e 64% telefone — é o melhor
        // enriquecedor disponível para os compradores que entraram pelados.
        salva('hp-clientes', await q(`
            select CLI_CODIGO, CLI_NOME, CLI_RAZAOSOCIAL, CLI_CPFCNPJ, CLI_RGINSCRICAO, CLI_UF, CLI_CID_CODIGO,
                   CLI_CELULAR, CLI_FONECOM1, CLI_FONERES, CLI_EMAIL, CLI_EMAIL1, CLI_PESSOA,
                   CLI_DATACADASTRO, CLI_ATIVO, FIL_CODIGO from CLIENTES`))
        salva('hp-fazendas', await q('select CLI_CODIGO, FAZ_NOME, FAZ_UF, FAZ_FONE, FAZ_INSCRICAO, FAZ_CPFCNPJ, FAZ_CID_CODIGO, FAZ_PADRAO from FAZENDAS'))
        salva('hp-pisteiros', await q('select PRE_CODIGO, PRE_NOME, PRE_CPF, PRE_UF from PRESTADORES'))
        salva('hp-cidades', await q('select CID_CODIGO, CID_UF, CID_MUNICIPIO from CIDADES'))
    } finally { db.detach() }
}

/* ── 3. Planilha de leads (Google Sheets) ─────────────────────────────────── */

async function doPlanilha() {
    console.log('Planilha de leads:')
    const cred = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    const auth = new google.auth.GoogleAuth({ credentials: cred, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
    const sheets = google.sheets({ version: 'v4', auth })
    // O id vive em jmp_config; fixo aqui para o extrator não depender do banco.
    const SID = '1caFGyHlqF-fic0y5zsnO1GRty4J61upMcjVI8e8V5F8'
    const out = {}
    for (const aba of ['LEADS GERAIS', 'TOUROS', 'FEMEAS', 'EMBRIÕES', 'OUTROS']) {
        const r = await sheets.spreadsheets.values.get({ spreadsheetId: SID, range: `'${aba}'` })
        const v = r.data.values || []
        out[aba] = { head: v[0] || [], rows: v.slice(1).filter(x => x.some(c => String(c || '').trim() !== '')) }
        console.log(`  ${aba}: ${out[aba].rows.length}`)
    }
    fs.writeFileSync(path.join(OUT, 'planilha-leads.json'), JSON.stringify(out))
}

/* ── main ─────────────────────────────────────────────────────────────────── */

await doPostgres()
await doHastaPro()
await doPlanilha()
console.log(`\nfontes em ${path.relative(ROOT, OUT)}`)
