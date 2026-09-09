/**
 * CRUZAMENTO — aba CADASTROS ("Leads - Bula Assessoria") × quem realmente comprou.
 *
 * Pedido do chefe (09/09/2026): validar, linha a linha, quais cadastros vindos
 * dos leads compraram e quais não compraram — e completar o que dá para
 * completar com as nossas próprias bases.
 *
 * Somente LEITURA. Nada é escrito na planilha por este módulo.
 *
 * As cinco fontes de compra (nenhuma sozinha fecha a conta):
 *   1. HastaPro/Firebird (COMPRADORES × LOTES × LEILAO) — as duas filiais,
 *      FIL '01' (Bula Remates) e FIL '2' (Bula Assessoria). É o registro do ERP.
 *   2. bula_leilao_fechamento — os fechamentos do sistema (compradores + lances).
 *   3. bula_leilao_vendas — o lance cantado no grupo (pega o pregão que ainda
 *      não virou fechamento; o valor ali é a PARCELA, não o VGV).
 *   4. clientes.compras_manuais — a compra registrada pelo assessor na carteira.
 *   5. (contexto) clientes/crm_leads/AgRisk — não provam compra, mas identificam.
 *
 * ⚠ A régua: "não comprou" aqui quer dizer "não comprou em leilão que passou
 * pela Bula". Compra feita direto com outra leiloeira não existe em base nossa.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import Firebird from 'node-firebird'
import { google } from 'googleapis'

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SID = '1caFGyHlqF-fic0y5zsnO1GRty4J61upMcjVI8e8V5F8'   // Leads - Bula Assessoria
export const ABA = 'CADASTROS'
const VERDE = '#34a853', VERMELHO = '#ff0000'

export function carregaEnv() {
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
}

/* ── normalizadores ───────────────────────────────────────────────────────── */
export const dig = s => String(s ?? '').replace(/\D/g, '')
export const nuc = s => { const d = dig(s).replace(/^55/, ''); return d.length >= 8 ? d.slice(-8) : '' }
export const N = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const STOP = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'JR', 'JUNIOR', 'NETO', 'FILHO', 'LTDA', 'ME', 'EPP', 'SR', 'SRA', 'FAZENDA', 'AGROPECUARIA'])
export const toks = s => [...new Set(N(s).split(' ').filter(t => t.length >= 3 && !STOP.has(t)))]
export function cpfValido(c) {
    const s = dig(c)
    if (s.length === 14) return true                        // CNPJ: não valida dígito aqui
    if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false
    const d = s.split('').map(Number)
    let a = 0; for (let i = 0; i < 9; i++) a += d[i] * (10 - i)
    let r = (a * 10) % 11; if (r === 10) r = 0; if (r !== d[9]) return false
    a = 0; for (let i = 0; i < 10; i++) a += d[i] * (11 - i)
    r = (a * 10) % 11; if (r === 10) r = 0; return r === d[10]
}
const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v) }

/* ── extração ─────────────────────────────────────────────────────────────── */
function auth() {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    let creds
    try { creds = JSON.parse(raw) } catch {
        creds = { client_email: raw.match(/"client_email"\s*:\s*"([^"]+)"/)?.[1], private_key: raw.match(/"private_key"\s*:\s*"([\s\S]*?)"\s*[,}]/)?.[1] }
    }
    return new google.auth.JWT({ email: creds.client_email, key: creds.private_key.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
}

/** A aba CADASTROS: valores + a COR da coluna "Já comprou?" (a resposta é a cor, não texto). */
export async function leAbaCadastros() {
    const sheets = google.sheets({ version: 'v4', auth: auth() })
    const grid = await sheets.spreadsheets.get({
        spreadsheetId: SID, includeGridData: true, ranges: [`${ABA}!A1:R1200`],
        fields: 'sheets(data(rowData(values(formattedValue,effectiveFormat(backgroundColor)))))',
    })
    const rowData = grid.data.sheets[0].data[0].rowData || []
    const hex = c => c ? '#' + [c.red, c.green, c.blue].map(v => Math.round((v ?? 0) * 255).toString(16).padStart(2, '0')).join('') : ''
    const linhas = rowData.map((r, i) => ({
        linha: i + 1,
        valores: (r.values || []).map(v => v.formattedValue ?? ''),
        cores: (r.values || []).map(v => hex(v.effectiveFormat?.backgroundColor)),
    }))
    const H = linhas[0].valores, col = n => H.indexOf(n)
    const dados = linhas.slice(1).filter(r => String(r.valores[col('Nome Completo')] ?? '').trim())
    return dados.map(r => ({
        linha: r.linha,
        mes: r.valores[col('MÊS')] || '', sdr: r.valores[col('SDR')] || '', assessor: r.valores[col('Assessor')] || '',
        marcado: r.cores[col('Já comprou?')] === VERDE ? 'SIM' : r.cores[col('Já comprou?')] === VERMELHO ? 'NÃO' : '',
        nome: String(r.valores[col('Nome Completo')]).trim(),
        interesse: r.valores[col('Interesse')] || '', tel: r.valores[col('Telefone')] || '',
        cidade: r.valores[col('Cidade')] || '', uf: r.valores[col('Estado')] || '', cpfTxt: r.valores[col('CPF')] || '',
        ie: r.valores[col('IE')] || '', score: r.valores[col('SCORE')] || '', pendencias: r.valores[col('PENDÊNCIAS')] || '',
        remates: r.valores[col('BULA REMATES')] || '', erural: r.valores[col('E-RURAL')] || '',
        programa: r.valores[col('PROGRAMA')] || '', campanha: r.valores[col('CAMPANHA')] || '',
    }))
}

export async function leAbasDeLeads() {
    const sheets = google.sheets({ version: 'v4', auth: auth() })
    const out = []
    for (const aba of ['LEADS GERAIS', 'TOUROS', 'FEMEAS', 'BEZERRAS', 'EMBRIÕES', 'OUTROS']) {
        const r = await sheets.spreadsheets.values.get({ spreadsheetId: SID, range: `'${aba}'` })
        const v = r.data.values || []
        const h = (v[0] || []).map(N)
        for (const row of v.slice(1)) {
            if (!row.some(c => String(c || '').trim())) continue
            const g = c => row[h.indexOf(N(c))] || ''
            out.push({
                aba, data: g('Data'), nome: g('Nome'), fone: g('WhatsApp'), email: g('E-mail'), uf: g('UF'), cidade: g('Cidade'),
                interesse: g('Interesse'), ie: g('Inscrição Estadual'), origem: g('Origem'), campanha: g('utm_campaign'),
                campanhaNome: g('campaign_name'), criativo: g('utm_content'), cpf: g('cpf') || g('cpf_(brazil)'),
                etapa: g('Etapa'), atendido: g('Atendido por'),
            })
        }
    }
    return out
}

export async function leHastaPro() {
    const limpa = s => s == null ? null : String(s).replace(/�/g, '?').trim()
    const norm = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? limpa(v) : (v instanceof Date ? v.toISOString().slice(0, 10) : v)]))
    const opts = {
        host: process.env.HASTAPRO_HOST, port: +process.env.HASTAPRO_PORT, database: process.env.HASTAPRO_DATABASE,
        user: process.env.HASTAPRO_USER, password: process.env.HASTAPRO_PASSWORD, lowercase_keys: true,
    }
    const db = await new Promise((res, rej) => Firebird.attach(opts, (e, d) => e ? rej(e) : res(d)))
    const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => e ? rej(e) : res(r.map(norm))))
    try {
        const compras = await q(`
            select l.FIL_CODIGO fil, l.LEI_NOME, l.LEI_DATA, lo.LOT_LOTE, lo.LOT_QTD, lo.LOT_TOTAL,
                   cl.CLI_NOME, cl.CLI_RAZAOSOCIAL, cl.CLI_CPFCNPJ, cl.CLI_UF, cl.CLI_CELULAR, cl.CLI_FONECOM1, cl.CLI_FONERES
              from COMPRADORES c
              join LEILAO l    on l.FIL_CODIGO = c.FIL_CODIGO and l.LEI_CODIGO = c.LEI_CODIGO
              join LOTES  lo   on lo.FIL_CODIGO = c.FIL_CODIGO and lo.LEI_CODIGO = c.LEI_CODIGO and lo.LOT_LOTE = c.LOT_LOTE
              join CLIENTES cl on cl.CLI_CODIGO = c.CLI_CODIGO
             where l.LEI_DATA >= '2025-01-01'`)
        const clientes = await q(`
            select CLI_NOME, CLI_RAZAOSOCIAL, CLI_CPFCNPJ, CLI_RGINSCRICAO, CLI_UF, CLI_CELULAR, CLI_FONECOM1,
                   CLI_FONERES, CLI_EMAIL, CLI_DATACADASTRO, FIL_CODIGO from CLIENTES`)
        return { compras, clientes }
    } finally { db.detach() }
}

export async function lePostgres() {
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
    await c.connect()
    const q = async sql => (await c.query(sql)).rows
    try {
        return {
            fechamentos: await q('select nome, data, compradores, lances from bula_leilao_fechamento'),
            vendas: await q('select comprador, lote, valor, leilao_data, assessor, uf, cidade, raw_text from bula_leilao_vendas'),
            clientes: await q('select nome, cpf, telefone, email, cidade, uf, inscricao_estadual, tem_inscricao_estadual, score_credito, assessor, status, compras_manuais from clientes'),
            leads: await q(`select nome, telefone, celular, email, cpf, inscricao_estadual, tem_inscricao_estadual, cidade, estado,
                origem, source, campaign, utm_content, interesse, interesse_principal, score_serasa, data_entrada, created_at, responsavel from crm_leads`),
            cadastroLeiloeira: await q(`select clc.cliente_key, clc.status, clc.codigo, clc.decidido_at, l.nome leiloeira
                from cliente_leiloeira_cadastro clc left join leiloeiras l on l.id = clc.leiloeira_id`),
        }
    } finally { await c.end() }
}

/* ── cruzamento ───────────────────────────────────────────────────────────── */
const semSufixo = s => String(s ?? '').split(/[·|]/)[0].replace(/\s+-\s+.*$/, '').replace(/^\s*sr[a]?\.?\s+/i, '').trim()

export function montaCompras({ hp, pgd }) {
    const compras = []
    for (const c of hp.compras) compras.push({
        fonte: 'HastaPro', filial: c.fil, nome: c.cli_nome, nome2: c.cli_razaosocial, cpf: dig(c.cli_cpfcnpj),
        fones: [c.cli_celular, c.cli_fonecom1, c.cli_foneres].map(nuc).filter(Boolean), uf: c.cli_uf || '',
        data: c.lei_data, evento: c.lei_nome, lote: c.lot_lote, valor: Number(c.lot_total) || 0, animais: Number(c.lot_qtd) || 0,
    })
    for (const f of pgd.fechamentos) {
        const d = String(f.data ?? '').slice(0, 10)
        for (const c of (Array.isArray(f.compradores) ? f.compradores : [])) if (c?.comprador) compras.push({
            fonte: 'Fechamento', filial: '', nome: semSufixo(c.comprador), nome2: '', cpf: '', fones: [], uf: c.uf || '',
            data: d, evento: f.nome, lote: `${c.lotes || '?'} lote(s)`, valor: Number(c.vgv) || 0, animais: Number(c.animais) || 0, agrupado: true,
        })
    }
    for (const v of pgd.vendas) if (v.comprador) compras.push({
        fonte: 'Lance no grupo', filial: '', nome: semSufixo(v.comprador), nome2: '', cpf: '', fones: [], uf: v.uf || '',
        data: String(v.leilao_data ?? '').slice(0, 10), evento: 'pregão (lance no grupo)', lote: v.lote, valor: 0,
        parcela: Number(v.valor) || 0, assessor: v.assessor || '',
    })
    for (const c of pgd.clientes) for (const m of (Array.isArray(c.compras_manuais) ? c.compras_manuais : [])) compras.push({
        fonte: 'Carteira do assessor', filial: '', nome: c.nome, nome2: '', cpf: dig(c.cpf), fones: [c.telefone].map(nuc).filter(Boolean),
        uf: c.uf || '', data: String(m.data ?? '').slice(0, 10), evento: m.leilao || 'compra registrada pelo assessor',
        lote: m.descricao || '', valor: Number(m.valor) || 0, animais: Number(m.cabecas) || 0, assessor: c.assessor || '',
    })
    return compras
}

/** Comparação de nome que RECUSA homônimo em vez de chutar (regra da base de clientes 2026). */
export function fabricaComparador(compras) {
    const freq = new Map()
    for (const c of compras) for (const t of toks(c.nome)) freq.set(t, (freq.get(t) || 0) + 1)
    const raro = t => (freq.get(t) || 0) <= 25
    return function comparaNome(a, b) {
        const A = N(a), B = N(b); if (!A || !B) return null
        const ta = toks(a), tb = toks(b); if (!ta.length || !tb.length) return null
        if (A === B) return 'exato'
        if (ta.length < 2 || tb.length < 2) return null
        if (ta[0] !== tb[0]) return null                      // primeiro nome tem de bater
        const inter = ta.filter(t => tb.includes(t))
        if (inter.length < 2) return null
        const contido = inter.length === Math.min(ta.length, tb.length)
        if (!contido && inter.length < 3) return null
        return inter.some(raro) ? 'forte' : 'fraco'           // fraco = só sobrenome comum; precisa corroborar
    }
}

const ORDEM = { CPF: 4, telefone: 3, 'nome exato': 2, 'nome forte': 1.5, 'nome fraco': 1 }

export function cruza({ cadastros, compras, hp, pgd, leadsSheet, agrisk, fichas }) {
    const comparaNome = fabricaComparador(compras)
    const porCpf = new Map(), porFone = new Map()
    for (const c of compras) { if (c.cpf) push(porCpf, c.cpf, c); for (const f of c.fones) push(porFone, f, c) }

    const hpCliPorCpf = new Map(), hpCliPorFone = new Map()
    for (const c of hp.clientes) {
        const k = dig(c.cli_cpfcnpj); if (k) push(hpCliPorCpf, k, c)
        for (const f of [c.cli_celular, c.cli_fonecom1, c.cli_foneres].map(nuc).filter(Boolean)) push(hpCliPorFone, f, c)
    }
    const agriskPorCpf = new Map(agrisk.map(a => [dig(a.doc), a]))
    const leadPorFone = new Map(), pgCliPorCpf = new Map(), shPorFone = new Map()
    for (const l of pgd.leads) for (const f of [l.telefone, l.celular].map(nuc).filter(Boolean)) push(leadPorFone, f, l)
    for (const c of pgd.clientes) { const k = dig(c.cpf); if (k.length >= 11) push(pgCliPorCpf, k, c) }
    for (const r of leadsSheet) { const f = nuc(r.fone); if (f) push(shPorFone, f, r) }

    /** casamento por nome só quando é ÚNICO e forte — homônimo devolve null */
    const porNome = (lista, campo, alvo) => {
        const hits = lista.filter(x => ['exato', 'forte'].includes(comparaNome(alvo, campo(x))))
        if (!hits.length) return null
        return new Set(hits.map(x => N(campo(x)))).size === 1 ? hits : null
    }

    return cadastros.map(l => {
        const cpf = dig(l.cpfTxt), fone = nuc(l.tel)
        const ev = new Map()
        const add = (c, via) => {
            const k = `${c.fonte}|${c.evento}|${c.data}|${c.lote}|${N(c.nome)}`
            const p = ev.get(k); if (!p || ORDEM[via] > ORDEM[p.via]) ev.set(k, { ...c, via })
        }
        const cpfDeOutro = []
        if (cpf && porCpf.has(cpf)) for (const c of porCpf.get(cpf)) {
            const cmp = comparaNome(l.nome, c.nome) || (c.nome2 ? comparaNome(l.nome, c.nome2) : null)
            if (cmp) add(c, 'CPF'); else cpfDeOutro.push(c)     // CPF da planilha aparece com OUTRO nome no ERP
        }
        if (fone && porFone.has(fone)) for (const c of porFone.get(fone)) add(c, 'telefone')
        const homonimos = []
        for (const c of compras) {
            const cmp = comparaNome(l.nome, c.nome) || (c.nome2 ? comparaNome(l.nome, c.nome2) : null)
            if (!cmp) continue
            if (cpf && c.cpf && c.cpf !== cpf) { homonimos.push(c); continue }
            add(c, cmp === 'exato' ? 'nome exato' : cmp === 'forte' ? 'nome forte' : 'nome fraco')
        }
        const todas = [...ev.values()].sort((a, b) => String(a.data).localeCompare(String(b.data)))
        const corrobora = p => (p.uf && l.uf && p.uf === l.uf) ||
            (p.assessor && l.assessor && N(p.assessor).split(' ')[0] === N(l.assessor).split(' ')[0])
        const fortes = todas.filter(p => p.via !== 'nome fraco')
        const provas = fortes.length ? fortes : todas.filter(corrobora)
        const doHp = provas.filter(p => p.fonte === 'HastaPro')
        const doFech = provas.filter(p => p.fonte === 'Fechamento')
        const daCart = provas.filter(p => p.fonte === 'Carteira do assessor')
        const soPregao = provas.length > 0 && provas.every(p => p.fonte === 'Lance no grupo')
        const vgv = doHp.length ? doHp.reduce((a, c) => a + c.valor, 0)
            : doFech.length ? doFech.reduce((a, c) => a + c.valor, 0)
                : daCart.reduce((a, c) => a + c.valor, 0)
        const certeza = provas.some(p => p.via === 'CPF') ? 'CPF confere'
            : provas.some(p => p.via === 'telefone') ? 'telefone confere'
                : provas.some(p => p.via === 'nome exato') ? 'nome idêntico'
                    : provas.some(p => p.via === 'nome forte') ? 'nome + sobrenome raro'
                        : provas.length ? 'nome comum + UF/assessor' : ''

        const agr = agriskPorCpf.get(cpf) || agrisk.find(a => N(a.nome) === N(l.nome)) || null
        const hpc = ((cpf && hpCliPorCpf.get(cpf)) || (fone && hpCliPorFone.get(fone)) || porNome(hp.clientes, x => x.cli_nome, l.nome) || [])[0] || null
        const lead = ((fone && leadPorFone.get(fone)) || porNome(pgd.leads, x => x.nome, l.nome) || [])[0] || null
        const sh = ((fone && shPorFone.get(fone)) || porNome(leadsSheet, x => x.nome, l.nome) || [])[0] || null
        const pgc = ((cpf && pgCliPorCpf.get(cpf)) || porNome(pgd.clientes, x => x.nome, l.nome) || [])[0] || null
        const ficha = fichas.filter(f => comparaNome(l.nome, f.nome) || (cpf && dig(f.cpf) === cpf))
        const cadLei = pgd.cadastroLeiloeira.filter(x => (cpf && dig(x.codigo) === cpf) || N(x.cliente_key) === N(l.nome))

        return {
            ...l, cpf, cpfOk: cpf ? cpfValido(cpf) : null,
            comprou: provas.length > 0, certeza, provas, vgv, soPregao,
            eventos: [...new Set(provas.map(p => `${p.data} · ${p.evento}`))],
            primeira: provas[0]?.data || '', ultima: provas[provas.length - 1]?.data || '',
            cpfDeOutro: [...new Set(cpfDeOutro.map(c => c.nome))],
            homonimos: [...new Set(homonimos.map(c => `${c.nome} (CPF ${c.cpf})`))],
            agrisk: agr, hpCliente: hpc, lead, sheetLead: sh, pgCliente: pgc, fichas: ficha, cadLei,
            // quando o registro casado está em OUTRO nome (telefone de casa/sócio), o dado herdado precisa de conferência
            outroNome: {
                sheetLead: sh && N(sh.nome) !== N(l.nome) ? sh.nome : '',
                lead: lead && N(lead.nome) !== N(l.nome) ? lead.nome : '',
                hpCliente: hpc && N(hpc.cli_nome) !== N(l.nome) ? hpc.cli_nome : '',
                pgCliente: pgc && N(pgc.nome) !== N(l.nome) ? pgc.nome : '',
                agrisk: agr && N(agr.nome) !== N(l.nome) ? agr.nome : '',
            },
        }
    })
}

/* ── o que dá para preencher ──────────────────────────────────────────────── */
const primeiro = (...vs) => {
    for (const [v, f, conferir] of vs) {
        if (v === undefined || v === null || String(v).trim() === '') continue
        return conferir ? { valor: String(v).trim(), fonte: f, conferir } : { valor: String(v).trim(), fonte: f }
    }
    return null
}
const mascaraCpf = v => {
    const d = dig(v)
    if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
    if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    return String(v ?? '').trim()
}
/** utm_campaign às vezes vem como id numérico do Meta — aí o nome legível é o campaign_name. */
const campanhaLegivel = s => { const t = String(s ?? '').trim(); return /^\d{6,}$/.test(t) ? '' : t }
const simNao = v => /^(sim|true|1|s)$/i.test(String(v ?? '').trim()) ? 'TRUE' : /^(n[ãa]o|false|0|n)$/i.test(String(v ?? '').trim()) ? 'FALSE' : ''
const APROVADO = v => v === 'aprovado' || v === 'ressalva'

export function preenchimento(r) {
    const p = {}
    const põe = (campo, atual, cand) => { if (String(atual ?? '').trim() || !cand) return; p[campo] = cand }
    const o = r.outroNome || {}

    põe('Telefone', r.tel, primeiro(
        [r.sheetLead?.fone, 'planilha de leads', o.sheetLead], [r.lead?.telefone || r.lead?.celular, 'CRM', o.lead],
        [r.agrisk?.tel?.split('·')[0], 'AgRisk', o.agrisk], [r.hpCliente?.cli_celular, 'HastaPro', o.hpCliente],
        [r.pgCliente?.telefone, 'Clientes', o.pgCliente],
    ))
    põe('Interesse', r.interesse, primeiro(
        [r.sheetLead?.interesse, 'planilha de leads', o.sheetLead], [r.lead?.interesse || r.lead?.interesse_principal, 'CRM', o.lead],
    ))
    põe('Cidade', r.cidade, primeiro(
        [r.sheetLead?.cidade, 'planilha de leads', o.sheetLead], [r.lead?.cidade, 'CRM', o.lead],
        [r.agrisk?.cidades?.split('/')[0]?.trim(), 'AgRisk', o.agrisk], [r.pgCliente?.cidade, 'Clientes', o.pgCliente],
    ))
    põe('Estado', r.uf, primeiro(
        [r.sheetLead?.uf, 'planilha de leads', o.sheetLead], [r.lead?.estado, 'CRM', o.lead],
        [r.hpCliente?.cli_uf, 'HastaPro', o.hpCliente], [r.pgCliente?.uf, 'Clientes', o.pgCliente],
    ))
    const cpfCand = primeiro(
        [r.hpCliente?.cli_cpfcnpj, 'HastaPro', o.hpCliente], [r.agrisk?.doc, 'AgRisk', o.agrisk],
        [r.lead?.cpf, 'CRM', o.lead], [r.pgCliente?.cpf, 'Clientes', o.pgCliente], [r.provas.find(x => x.cpf)?.cpf, 'compra no ERP'],
    )
    if (cpfCand && cpfValido(cpfCand.valor)) põe('CPF', r.cpfTxt, { ...cpfCand, valor: mascaraCpf(cpfCand.valor) })
    põe('IE', r.ie, primeiro(
        [simNao(r.sheetLead?.ie), 'planilha de leads', o.sheetLead], [r.hpCliente?.cli_rginscricao ? 'TRUE' : '', 'HastaPro', o.hpCliente],
        [simNao(r.lead?.tem_inscricao_estadual), 'CRM', o.lead], [r.fichas.find(f => f.ie) ? 'TRUE' : '', 'ficha no grupo'],
    ))
    põe('SCORE', r.score, primeiro(
        [r.fichas.map(f => f.ev?.match(/Score\s*(\d{3,4})/i)?.[1]).find(Boolean), 'ficha no grupo'],
        [r.pgCliente?.score_credito, 'Clientes', o.pgCliente], [r.lead?.score_serasa, 'CRM', o.lead],
    ))
    const evTxt = r.fichas.map(f => f.ev || '').join(' ')
    const pend = /sem restri|nao tem nenhuma pendencia|não tem nenhuma pendência/i.test(evTxt) ? { valor: 'NÃO', fonte: 'ficha no grupo' }
        : /restri[çc][ãa]o|d[ií]vida|inadipl|protesto/i.test(evTxt) ? { valor: 'SIM', fonte: 'ficha no grupo' } : null
    põe('PENDÊNCIAS', r.pendencias, pend)
    const grupo = g => {
        const f = r.fichas.filter(x => String(x.grupo || '').includes(g))
        if (!f.length) return null
        if (f.some(x => APROVADO(x.veredito))) return { valor: 'TRUE', fonte: 'grupo da leiloeira' }
        if (f.every(x => x.veredito === 'recusado')) return { valor: 'FALSE', fonte: 'grupo da leiloeira' }
        return null
    }
    const doSistema = nome => {
        const c = r.cadLei.filter(x => N(x.leiloeira).includes(N(nome)))
        if (!c.length) return null
        return c.some(x => x.status === 'aprovado') ? { valor: 'TRUE', fonte: 'sistema (cadastro leiloeira)' } : null
    }
    põe('BULA REMATES', r.remates, grupo('Remates') || doSistema('Bula Remates'))
    põe('PROGRAMA', r.programa, grupo('Programa') || doSistema('Programa'))
    põe('CAMPANHA', r.campanha, primeiro(
        [campanhaLegivel(r.sheetLead?.campanha), 'planilha de leads (utm_campaign)', o.sheetLead],
        [campanhaLegivel(r.sheetLead?.campanhaNome), 'planilha de leads (campaign_name)', o.sheetLead],
        [campanhaLegivel(r.lead?.campaign), 'CRM (campaign)', o.lead],
        [r.sheetLead?.origem, 'planilha de leads (Origem)', o.sheetLead],
        [r.lead?.origem, 'CRM (origem)', o.lead], [r.lead?.source, 'CRM (source)', o.lead],
    ))
    return p
}
