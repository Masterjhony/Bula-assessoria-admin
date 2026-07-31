/**
 * Reestrutura a planilha "Leads JMP - Bula Assessoria" para 5 abas:
 *   LEADS GERAIS (base única, com Etapa e Atendido por) + TOUROS | FEMEAS | EMBRIÕES | OUTROS
 * (as 4 últimas são recortes da LEADS GERAIS por interesse).
 *
 * Consolida TODAS as abas de lead que existiam (landings, dumps crus do Meta,
 * listas soltas, abas por assessor, cadastro), deduplica por telefone/e-mail,
 * remove leads de teste e apaga o que não é lead.
 *
 * Uso:  node scripts/reestrutura-planilha-leads.mjs           (simulação)
 *       node scripts/reestrutura-planilha-leads.mjs --apply   (aplica)
 *
 * Antes de aplicar, rode o backup: outputs/backup-planilha-leads-*.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { google } from 'googleapis'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')

// ── layout único das 5 abas ──────────────────────────────────────────────────
const LAYOUT = [
    'Etapa', 'Atendido por', 'Data', 'Nome', 'WhatsApp', 'E-mail', 'UF', 'Zona', 'Cidade',
    'Momento', 'Cabeças', 'Inscrição Estadual', 'Interesse', 'Qtd. desejada', 'Lead ID',
    'Origem', 'utm_source', 'utm_campaign', 'utm_content', 'ad-id', 'Observações',
]
// Só a LEADS GERAIS carrega os metadados de mídia. Tem de bater EXATAMENTE com
// PERPETUO_HEADER de src/lib/jmp-sheets.ts — é o cabeçalho que o append do lead
// novo espera encontrar (resolve por nome, mas coluna que falta ele acrescenta).
const META_EXTRA = [
    'utm_medium', 'id', 'created_time', 'ad_name', 'adset_name', 'campaign_name',
    'form_name', 'platform', 'lead de teste', 'lead_status',
]
const GERAIS_TAB = 'LEADS GERAIS'
const INTERESSE_TABS = { touros: 'TOUROS', femeas: 'FEMEAS', embrioes: 'EMBRIÕES', outros: 'OUTROS' }

// ── helpers ──────────────────────────────────────────────────────────────────
const S = v => String(v ?? '').trim()
const deaccent = s => S(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = s => deaccent(s).toLowerCase().replace(/\s+/g, ' ').trim()
const digits = s => S(s).replace(/\D+/g, '')
const nucleo = s => { const d = digits(s).replace(/^55/, ''); return d.length >= 8 ? d.slice(-8) : '' }

const UF_BY_NAME = new Map(Object.entries({
    'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA', 'ceara': 'CE',
    'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO', 'maranhao': 'MA',
    'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', 'para': 'PA',
    'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ',
    'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondonia': 'RO', 'roraima': 'RR',
    'santa catarina': 'SC', 'sao paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
}))
const toUF = v => {
    const s = deaccent(v)
    if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase()
    return UF_BY_NAME.get(s.toLowerCase()) ?? ''
}
const ZONA = {
    Norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'], Nordeste: ['AL', 'BA', 'CE', 'PB', 'PE', 'PI', 'RN', 'SE'],
    Sudeste: ['ES', 'MG', 'RJ', 'SP'], Sul: ['PR', 'RS', 'SC'], 'Centro-Oeste': ['DF', 'GO', 'MT', 'MS'],
}
const zonaDaUF = uf => {
    const u = S(uf).toUpperCase()
    if (u === 'MA') return 'Maranhão'
    for (const [z, ufs] of Object.entries(ZONA)) if (ufs.includes(u)) return z
    return ''
}
const fone = raw => {
    const d = digits(S(raw).replace(/^p:/, '')).replace(/^55/, '')
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
    return d ? `(${d.slice(0, 2)}) ${d.slice(2)}` : ''
}
// dd/mm/aaaa, hh:mm  → Date
const parseData = v => {
    const s = S(v)
    let m = /^(\d{2})\/(\d{2})\/(\d{4})[, ]+(\d{1,2}):(\d{2})/.exec(s)
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5])
    m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
    if (m) return new Date(+m[3], +m[2] - 1, +m[1])
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); return isNaN(d) ? null : d }
    return null
}
const fmtData = d => d
    ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}, ` +
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : ''

// ── vocabulário ──────────────────────────────────────────────────────────────
const INTERESSE_LABEL = new Map([
    ['touros', 'Touros'], ['touros-po', 'Touros'], ['touros_po', 'Touros'], ['touro', 'Touros'],
    ['bezerras-po', 'Bezerras PO'], ['bezerras_po', 'Bezerras PO'], ['bezerras po', 'Bezerras PO'],
    ['matrizes-po', 'Matrizes PO'], ['matrizes_po', 'Matrizes PO'], ['matrizes po', 'Matrizes PO'],
    ['novilhas', 'Matrizes PO'], ['femeas', 'Matrizes PO'],
    ['embrioes', 'Embriões'], ['embrião', 'Embriões'], ['embrioes-po', 'Embriões'],
    ['semen', 'Sêmen'],
    ['nao_sei_ainda.', 'Não sei ainda'], ['nao sei ainda.', 'Não sei ainda'], ['nao sei ainda', 'Não sei ainda'],
    ['nao-sei', 'Não sei ainda'], ['nao_sei', 'Não sei ainda'], ['nao sei', 'Não sei ainda'],
    ['false', ''], ['', ''],
])
const rotulaInteresse = raw => {
    const k = norm(raw)
    if (INTERESSE_LABEL.has(k)) return INTERESSE_LABEL.get(k)
    if (/test lead|dummy data/i.test(k)) return ''
    if (/embri/.test(k)) return 'Embriões'
    if (/touro/.test(k)) return 'Touros'
    if (/bezerr/.test(k)) return 'Bezerras PO'
    if (/matriz|novilh|femea|vaca/.test(k)) return 'Matrizes PO'
    if (/semen|semem/.test(k)) return 'Sêmen'
    if (/nao sei|não sei/.test(k)) return 'Não sei ainda'
    // linha desalinhada de aba velha (id do form, uuid, texto solto): não é
    // interesse — deixa em branco e o lead cai em OUTROS.
    return ''
}
/**
 * De onde o lead veio, em português de gente: landing própria, campanha do
 * Meta ou lista antiga. `form_name` distingue landing de formulário do Meta.
 */
const rotulaOrigem = r => {
    const form = S(r.formName)
    if (/^landing/i.test(form)) {
        if (/s[ãa]o geraldo/i.test(form)) return 'Landing São Geraldo'
        if (/touros/i.test(form)) return 'Landing Touros'
        return form
    }
    const campanha = S(r.campaignName) || S(r.adsetName)
    if (S(r.metaId) || form) return campanha ? `Meta — ${campanha}` : `Meta — ${form}`
    return ''
}

/** aba de destino do lead — um lead entra em UMA aba só (prioridade: touros > fêmeas > embriões) */
const abaDoInteresse = (interesse, qtd) => {
    const t = norm(interesse) + ' ' + norm(qtd)
    if (/touro/.test(t)) return 'touros'
    if (/bezerr|matriz|novilh|femea|vaca/.test(t)) return 'femeas'
    if (/embri/.test(t)) return 'embrioes'
    return 'outros'
}
const META_MOMENTO = new Map([
    ['não_trabalho,_quero_aprender', 'Não trabalho, quero aprender'], ['nao_trabalho,_quero_aprender', 'Não trabalho, quero aprender'],
    ['trabalho_com_pecuária_de_corte', 'Pecuária de corte'], ['trabalho_com_pecuaria_de_corte', 'Pecuária de corte'],
    ['trabalho_com_corte_e_po', 'Corte e PO'], ['sou_criador_renomado_de_po', 'Criador renomado de PO'],
])
const MOMENTO_LABEL = new Map([
    ['pecuaria-de-corte', 'Pecuária de corte'], ['corte-e-po', 'Corte e PO'],
    ['criador-renomado-po', 'Criador renomado de PO'], ['nao-trabalho-quero-aprender', 'Não trabalho, quero aprender'],
])
const rotulaMomento = raw => {
    const k = norm(raw)
    if (/test lead|dummy data/i.test(k)) return ''
    return META_MOMENTO.get(S(raw).toLowerCase()) ?? MOMENTO_LABEL.get(k) ?? S(raw)
}
const META_CABECAS = new Map([['0-50', '1 a 50 cabeças'], ['51-100', '51 a 100 cabeças'], ['101-300', '101 a 300 cabeças'], ['301-500', '301 a 500 cabeças'], ['500+', 'mais de 500 cabeças'], ['nenhuma', 'nenhuma']])
const CABECAS_LABEL = new Map([['0-50', '1 a 50 cabeças'], ['50-100', '51 a 100 cabeças'], ['100-300', '101 a 300 cabeças'], ['300-500', '301 a 500 cabeças'], ['500+', 'mais de 500 cabeças']])
const rotulaCabecas = raw => {
    const k = norm(raw)
    if (/test lead|dummy data/i.test(k)) return ''
    return META_CABECAS.get(k) ?? CABECAS_LABEL.get(k) ?? S(raw)
}
const META_QTD = new Map([['0-5', '1 a 5'], ['1-5', '1 a 5'], ['6-10', '6 a 10'], ['11-20', '11 a 20'], ['21-50', '21 a 50'], ['50+', 'mais de 50']])
const rotulaIE = raw => {
    const k = norm(raw)
    if (k === 'sim' || k === 'true') return 'Sim'
    if (k === 'nao' || k === 'false') return 'Não'
    return ''
}

/** leads de teste — nunca entram na planilha de trabalho */
const ehTeste = r => {
    const n = norm(r.nome), e = norm(r.email)
    if (norm(r.teste) === 'sim') return true
    if (!n) return true
    if (/^\[teste/.test(n) || /test lead|dummy data/.test(n) || /test lead|dummy data/.test(e)) return true
    if (/^(teste|test)\b/.test(n) || n === 'teste' || n === 'test') return true
    if (/@example\.com$/.test(e) || e === 'test@meta.com' || /^teste?@/.test(e)) return true
    if (/^(asd|aaa|xxx|qwe)/.test(n)) return true
    const d = digits(r.whatsapp)
    if (d && /^(\d)\1+$/.test(d.slice(2))) return true          // (33) 33333-3333
    if (/^(\d\d)(\d\d)\2+/.test(d) && d.length >= 10 && new Set(d.slice(2)).size <= 2) return true // 31313-1313
    return false
}

// ── leitura da planilha ──────────────────────────────────────────────────────
const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect(); const { rows: cfg } = await db.query("select value from jmp_config where key='sheets'"); await db.end()
const spreadsheetId = cfg[0].value.spreadsheetId
const creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
const auth = new google.auth.JWT({ email: creds.client_email, key: creds.private_key.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })

const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
const tabsMeta = meta.data.sheets.map(s => s.properties)
const readTab = async title => (await sheets.spreadsheets.values.get({
    spreadsheetId, range: `'${title}'!A1:BZ20000`, valueRenderOption: 'FORMATTED_VALUE',
})).data.values ?? []

// ── extração: cada aba vira uma lista de registros canônicos ─────────────────
const ALIAS = new Map(Object.entries({
    'etapa': 'etapa', 'atendido por': 'atendido', 'sdr': null, 'assessor': 'atendido',
    'data': 'data', 'nome': 'nome', 'nome completo': 'nome', 'full_name': 'nome',
    'e-mail': 'email', 'email': 'email', 'whatsapp': 'whatsapp', 'telefone': 'whatsapp', 'phone': 'whatsapp',
    'uf': 'uf', 'state': 'uf', 'zona': 'zona', 'cidade': 'cidade', 'momento': 'momento',
    'cabecas': 'cabecas', 'n cabecas': 'cabecas', 'no cabecas': 'cabecas', 'nº cabeças': 'cabecas',
    'inscricao estadual': 'ie', 'interesse': 'interesse', 'interese': 'interesse',
    'qtd desejada': 'qtd', 'qtd de touros': 'qtd', 'lead id': 'leadId',
    'utm source': 'utm_source', 'utm campaign': 'utm_campaign', 'utm content': 'utm_content',
    'ad-id': 'adId', 'ad id': 'adId', 'observacoes': 'obs', 'id': 'metaId', 'created time': 'created',
    'ad name': 'adName', 'adset name': 'adsetName', 'campaign name': 'campaignName',
    'form name': 'formName', 'platform': 'platform', 'lead de teste': 'teste',
}))
// Cabeçalho → campo canônico. Tira pontuação ("Qtd. desejada" e "Qtd desejada"
// são a mesma coluna) e underscores ("utm_source" → "utm source").
const chave = h => {
    const k = norm(h).replace(/_/g, ' ').replace(/[?.]/g, '').replace(/\s+/g, ' ').trim()
    return ALIAS.has(k) ? ALIAS.get(k) : null
}
const vazio = () => ({
    etapa: '', atendido: '', data: null, nome: '', whatsapp: '', email: '', uf: '', cidade: '',
    momento: '', cabecas: '', ie: '', interesse: '', qtd: '', leadId: '', origem: '',
    utm_source: '', utm_campaign: '', utm_content: '', adId: '', obs: '',
    metaId: '', created: '', adName: '', adsetName: '', campaignName: '', formName: '', platform: '', teste: '',
})

/** linha crua do conector do Meta (id "l:<n>" na coluna A) */
function daLinhaCruaMeta(row, origemTab) {
    if (!/^l:\d+/.test(S(row[0]))) return null
    const f = i => S(row[i])
    if (!/^\d{4}-\d{2}-\d{2}T/.test(f(1))) return null
    const r = vazio()
    r.metaId = f(0).replace(/^l:/, ''); r.created = f(1)
    r.adName = f(3); r.adsetName = f(5); r.campaignName = f(7); r.formName = f(9); r.platform = f(11)
    r.momento = rotulaMomento(f(12)); r.cabecas = rotulaCabecas(f(13)); r.ie = rotulaIE(f(14))
    r.interesse = rotulaInteresse(f(15))
    const noun = { 'Touros': 'touros', 'Bezerras PO': 'bezerras', 'Matrizes PO': 'matrizes', 'Embriões': 'embriões' }[r.interesse] ?? ''
    const q = META_QTD.get(norm(f(16)))
    r.qtd = q ? (noun ? `${q} ${noun}` : q) : ''
    r.nome = f(17); r.email = f(18); r.whatsapp = fone(f(19)); r.uf = toUF(f(20))
    r.data = parseData(f(1)); r.leadId = r.metaId
    r.utm_source = r.platform === 'ig' ? 'instagram' : r.platform === 'fb' ? 'facebook' : r.platform
    r.utm_campaign = r.adsetName; r.utm_content = r.adName
    r.origem = rotulaOrigem(r) || `Meta — ${origemTab}`
    r.teste = /test lead|dummy data/i.test([f(17), f(12), f(18)].join(' ')) || f(18) === 'test@meta.com' ? 'sim' : ''
    return r
}

/** aba com cabeçalho reconhecível (layout da landing / abas de trabalho) */
function daAbaComCabecalho(values, tab) {
    const header = (values[0] ?? []).map(S)
    const map = header.map(chave)
    // coluna sem cabeçalho mas com cara de e-mail (aba "Touros JMP")
    header.forEach((h, i) => {
        if (map[i] || h) return
        const amostra = values.slice(1, 120).filter(r => /@/.test(S(r[i])))
        if (amostra.length > 20) map[i] = 'email'
    })
    const out = []
    for (const row of values.slice(1)) {
        if (!row.some(c => S(c))) continue
        const cru = daLinhaCruaMeta(row, tab)
        if (cru) { out.push(cru); continue }
        const r = vazio()
        map.forEach((k, i) => { if (k && !S(r[k])) r[k] = S(row[i]) })
        if (!S(r.nome)) continue
        r.data = parseData(r.data)
        r.whatsapp = fone(r.whatsapp); r.uf = toUF(r.uf)
        r.interesse = rotulaInteresse(r.interesse); r.momento = rotulaMomento(r.momento)
        r.cabecas = rotulaCabecas(r.cabecas); r.ie = rotulaIE(r.ie)
        r.origem = rotulaOrigem(r)
        out.push(r)
    }
    return out
}

const extratores = {
    'Página9': values => values.slice(1).filter(r => S(r[0])).map(row => {
        const r = vazio()
        r.nome = S(row[0]).split('|')[0].trim(); r.email = S(row[2]); r.whatsapp = fone(row[3])
        r.uf = toUF(row[4]); r.cabecas = rotulaCabecas(row[5]); r.ie = rotulaIE(row[6])
        const extra = [S(row[1]) && `Fazenda: ${S(row[1])}`, S(row[7]) && `Status: ${S(row[7])}`].filter(Boolean)
        r.obs = extra.join(' | '); r.origem = 'Lista antiga (Página9)'
        return r
    }),
    'Página4': values => values.slice(1).filter(r => S(r[0])).map(row => {
        const r = vazio()
        r.nome = S(row[0]); r.whatsapp = fone(row[1]); r.qtd = S(row[2])
        r.interesse = /touro/i.test(S(row[2])) ? 'Touros' : ''
        r.origem = 'Lista antiga (Página4)'
        return r
    }),
    'Cadastro': values => values.slice(1).filter(r => S(r[5])).map(row => {
        const r = vazio()
        r.nome = S(row[5]); r.email = S(row[4]); r.whatsapp = fone(row[6]); r.uf = toUF(row[7])
        r.cidade = S(row[9]); r.interesse = rotulaInteresse(row[8]); r.qtd = S(row[8])
        r.cabecas = rotulaCabecas(row[10]); r.ie = S(row[12]) ? 'Sim' : ''
        r.atendido = S(row[3]); r.etapa = norm(row[0]) === 'aprovado' ? 'CADASTRO OK' : ''
        r.obs = [
            S(row[0]) && `Programa Leilões: ${S(row[0])}`, S(row[1]) && `Bula Remates: ${S(row[1])}`,
            S(row[2]) && `SDR: ${S(row[2])}`, S(row[11]) && `CPF ${S(row[11])}`,
            S(row[12]) && `IE ${S(row[12])}`, S(row[13]) && `Serasa ${S(row[13])}`,
            S(row[14]) && `Protesto: ${S(row[14])}`, S(row[15]) && S(row[15]) !== '-' && `Valor protesto: ${S(row[15])}`,
        ].filter(Boolean).join(' | ')
        r.origem = 'Cadastro habilitação'
        return r
    }),
}
const IGNORAR = new Set(['Relatorio'])

const brutos = []
const porAba = {}
for (const t of tabsMeta) {
    if (IGNORAR.has(t.title)) { porAba[t.title] = 'ignorada (não é lead)'; continue }
    const values = await readTab(t.title)
    const regs = (extratores[t.title] ?? (v => daAbaComCabecalho(v, t.title)))(values)
    regs.forEach(r => { r._aba = t.title })
    porAba[t.title] = regs.length
    brutos.push(...regs)
}
console.log('== extração por aba ==')
for (const [k, v] of Object.entries(porAba)) console.log(`  ${String(v).padStart(5)}  ${k}`)
console.log(`  ${String(brutos.length).padStart(5)}  TOTAL bruto`)

// ── dedup ────────────────────────────────────────────────────────────────────
// Onde a equipe anota, da mais confiável para a menos: as abas de trabalho da
// campanha vêm antes da aba-arquivo (que quase ninguém edita).
const PRIORIDADE_ABA = ['LEADS TOUROS', 'LEADS SAO GERALDO', 'LEADS DOUGLAS', 'LEADS JOAO ANTONIO', 'Cadastro', 'LEADS BULA - PERPETUO']
const prioridadeAba = aba => {
    const i = PRIORIDADE_ABA.indexOf(aba)
    return i < 0 ? PRIORIDADE_ABA.length : i
}
const testes = brutos.filter(ehTeste)
const vivos = brutos.filter(r => !ehTeste(r))
const keyOf = r => {
    const t = nucleo(r.whatsapp); if (t) return 't:' + t
    const e = norm(r.email); if (e) return 'e:' + e
    return 'n:' + norm(r.nome) + '|' + r.uf
}
const grupos = new Map()
for (const r of vivos) {
    const k = keyOf(r)
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(r)
}
// e-mail também casa (lead que trocou de telefone)
const porEmail = new Map()
for (const [k, g] of grupos) {
    const e = g.map(r => norm(r.email)).find(Boolean)
    if (!e) continue
    if (porEmail.has(e) && porEmail.get(e) !== k) {
        const alvo = porEmail.get(e)
        grupos.get(alvo).push(...g); grupos.delete(k)
    } else porEmail.set(e, k)
}

const ts = r => (r.data ? r.data.getTime() : 0)
function funde(g) {
    const ord = [...g].sort((a, b) => ts(b) - ts(a))   // mais recente primeiro
    const out = vazio()
    out.data = ord.map(r => r.data).filter(Boolean).sort((a, b) => b - a)[0] ?? null
    for (const campo of Object.keys(out)) {
        if (campo === 'data') continue
        const v = ord.map(r => S(r[campo])).find(Boolean)
        out[campo] = v ?? ''
    }
    // observações: junta o que a equipe escreveu em abas diferentes
    const obs = [...new Set(ord.map(r => S(r.obs)).filter(Boolean))]
    out.obs = obs.join(' | ')
    // Etapa/Atendido por: valem as ABAS DE TRABALHO, onde a equipe realmente
    // anota — a aba-arquivo só entra se ninguém tiver anotado nas de trabalho.
    // Descarta lixo do conector do Meta que caiu nessas colunas (l:<id>, ISO).
    for (const campo of ['etapa', 'atendido']) {
        const pref = ord
            .filter(r => S(r[campo]) && !/^l:|^\d{4}-\d{2}-\d{2}T/.test(S(r[campo])))
            .sort((a, b) => prioridadeAba(a._aba) - prioridadeAba(b._aba) || ts(b) - ts(a))
        out[campo] = pref.length ? S(pref[0][campo]) : ''
    }
    out.zona = zonaDaUF(out.uf)
    out._abas = [...new Set(g.map(r => r._aba))]
    out._n = g.length
    return out
}
const leads = [...grupos.values()].map(funde).sort((a, b) => ts(b) - ts(a))
const duplicados = [...grupos.values()].filter(g => g.length > 1)

console.log(`\n== consolidação ==`)
console.log(`  ${brutos.length} linhas → ${leads.length} leads únicos`)
console.log(`  ${testes.length} linhas de teste descartadas`)
console.log(`  ${duplicados.length} pessoas apareciam em mais de uma linha (${brutos.length - testes.length - leads.length} linhas duplicadas fundidas)`)
console.log(`  com Etapa preenchida: ${leads.filter(l => l.etapa).length} | com Atendido por: ${leads.filter(l => l.atendido).length}`)
console.log(`  sem telefone: ${leads.filter(l => !l.whatsapp).length} | sem UF: ${leads.filter(l => !l.uf).length}`)

const buckets = { touros: [], femeas: [], embrioes: [], outros: [] }
for (const l of leads) buckets[abaDoInteresse(l.interesse, l.qtd)].push(l)
console.log('\n== divisão por interesse ==')
for (const [k, v] of Object.entries(buckets)) console.log(`  ${INTERESSE_TABS[k].padEnd(10)} ${v.length}`)
const porInteresse = new Map()
for (const l of leads) porInteresse.set(l.interesse || '(vazio)', (porInteresse.get(l.interesse || '(vazio)') ?? 0) + 1)
console.log('  rótulos:', [...porInteresse].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', '))

if (!APPLY) {
    console.log('\n-- amostra (10 mais recentes) --')
    leads.slice(0, 10).forEach(l => console.log(`  ${fmtData(l.data)} | ${l.nome} | ${l.whatsapp} | ${l.uf} | ${l.interesse} | etapa=${l.etapa} | ${l.origem} | abas=${l._abas.join('+')}`))
    console.log('\n-- testes descartados --')
    testes.slice(0, 20).forEach(r => console.log(`  ${r._aba}: ${r.nome} | ${r.email} | ${r.whatsapp}`))
    writeFileSync('outputs/reestrutura-preview.json', JSON.stringify({ leads: leads.length, buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])), amostra: leads.slice(0, 50) }, null, 1))
    console.log('\nSIMULAÇÃO — nada foi gravado. Rode com --apply para aplicar.')
    process.exit(0)
}

// ── aplicação ────────────────────────────────────────────────────────────────
const linha = (l, comMeta) => {
    const base = {
        'Etapa': l.etapa, 'Atendido por': l.atendido, 'Data': fmtData(l.data), 'Nome': l.nome,
        'WhatsApp': l.whatsapp, 'E-mail': l.email, 'UF': l.uf, 'Zona': l.zona, 'Cidade': l.cidade,
        'Momento': l.momento, 'Cabeças': l.cabecas, 'Inscrição Estadual': l.ie, 'Interesse': l.interesse,
        'Qtd. desejada': l.qtd, 'Lead ID': l.leadId, 'Origem': l.origem, 'utm_source': l.utm_source,
        'utm_campaign': l.utm_campaign, 'utm_content': l.utm_content, 'ad-id': l.adId, 'Observações': l.obs,
        'utm_medium': '', 'id': l.metaId, 'created_time': l.created, 'ad_name': l.adName,
        'adset_name': l.adsetName, 'campaign_name': l.campaignName, 'form_name': l.formName,
        'platform': l.platform, 'lead de teste': 'Não', 'lead_status': '',
    }
    return (comMeta ? [...LAYOUT, ...META_EXTRA] : LAYOUT).map(h => base[h] ?? '')
}

const idDaAba = t => tabsMeta.find(x => x.title === t)?.sheetId
const sheetIdPerpetuo = idDaAba('LEADS BULA - PERPETUO')
const sheetIdTouros = idDaAba('LEADS TOUROS')

// cores manuais que a equipe pintou (aba de trabalho) — reaplicadas por lead
const grid = await sheets.spreadsheets.get({
    spreadsheetId, includeGridData: true,
    ranges: [`'LEADS TOUROS'!A1:E200`, `'LEADS BULA - PERPETUO'!A1:F1200`],
})
const coresPorLead = new Map()
for (const sh of grid.data.sheets) {
    for (const rd of sh.data ?? []) {
        (rd.rowData ?? []).slice(1).forEach(rowData => {
            const cells = rowData.values ?? []
            const bg = cells[2]?.effectiveFormat?.backgroundColor ?? {}
            const branco = (bg.red ?? 1) > 0.97 && (bg.green ?? 1) > 0.97 && (bg.blue ?? 1) > 0.97
            if (branco) return
            const tel = cells.map(c => S(c?.formattedValue)).find(v => nucleo(v))
            if (tel) coresPorLead.set(nucleo(tel), bg)
        })
    }
}
console.log(`\ncores manuais capturadas: ${coresPorLead.size} leads`)

// 1) renomeia PERPETUO → LEADS GERAIS e LEADS TOUROS → TOUROS
const reqs = [
    { updateSheetProperties: { properties: { sheetId: sheetIdPerpetuo, title: GERAIS_TAB, index: 0 }, fields: 'title,index' } },
    { updateSheetProperties: { properties: { sheetId: sheetIdTouros, title: INTERESSE_TABS.touros, index: 1 }, fields: 'title,index' } },
]
// 2) cria as abas que faltam
const criar = [INTERESSE_TABS.femeas, INTERESSE_TABS.embrioes, INTERESSE_TABS.outros]
criar.forEach((title, i) => reqs.push({ addSheet: { properties: { title, index: 2 + i, gridProperties: { rowCount: 1000, columnCount: LAYOUT.length + 2, frozenRowCount: 1 } } } }))
const res1 = await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: reqs } })
const novos = {}
res1.data.replies.filter(r => r.addSheet).forEach(r => { novos[r.addSheet.properties.title] = r.addSheet.properties.sheetId })
console.log('abas renomeadas/criadas:', GERAIS_TAB, INTERESSE_TABS.touros, ...Object.keys(novos))

const sheetIds = {
    [GERAIS_TAB]: sheetIdPerpetuo, [INTERESSE_TABS.touros]: sheetIdTouros,
    [INTERESSE_TABS.femeas]: novos[INTERESSE_TABS.femeas],
    [INTERESSE_TABS.embrioes]: novos[INTERESSE_TABS.embrioes],
    [INTERESSE_TABS.outros]: novos[INTERESSE_TABS.outros],
}

// 3) escreve os valores
const escreve = async (tab, lista, comMeta) => {
    const header = comMeta ? [...LAYOUT, ...META_EXTRA] : LAYOUT
    const linhas = lista.map(l => linha(l, comMeta))
    const sheetId = sheetIds[tab]
    const precisa = linhas.length + 20
    const atual = tabsMeta.find(t => t.sheetId === sheetId)?.gridProperties ?? { rowCount: 1000, columnCount: 26 }
    const ajustes = []
    if ((atual.rowCount ?? 0) < precisa) ajustes.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount: precisa } }, fields: 'gridProperties.rowCount' } })
    if ((atual.columnCount ?? 0) < header.length) ajustes.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { columnCount: header.length } }, fields: 'gridProperties.columnCount' } })
    if (ajustes.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: ajustes } })
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${tab}'!A1:BZ20000` })
    await sheets.spreadsheets.values.update({
        spreadsheetId, range: `'${tab}'!A1`, valueInputOption: 'RAW',
        requestBody: { values: [header, ...linhas] },
    })
    console.log(`  ${tab}: ${linhas.length} leads`)
}
console.log('\ngravando abas...')
await escreve(GERAIS_TAB, leads, true)
for (const [k, tab] of Object.entries(INTERESSE_TABS)) await escreve(tab, buckets[k], false)

// 4) formatação + validação da coluna Etapa (as cores dos chips só vêm por cópia)
const fmtReqs = []
for (const [tab, sheetId] of Object.entries(sheetIds)) {
    const n = (tab === GERAIS_TAB ? leads.length : buckets[Object.entries(INTERESSE_TABS).find(([, v]) => v === tab)[0]].length) + 1
    fmtReqs.push(
        { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
        { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.93, blue: 0.93 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } },
        { setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: LAYOUT.length } } } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 2 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } },
        // dropdown de Etapa (com as cores) copiado da aba que já tinha
        { copyPaste: { source: { sheetId: sheetIdTouros, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 }, destination: { sheetId, startRowIndex: 1, endRowIndex: Math.max(n, 2), startColumnIndex: 0, endColumnIndex: 1 }, pasteType: 'PASTE_DATA_VALIDATION' } },
    )
}
await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: fmtReqs } })

// 5) devolve as cores manuais aos leads certos
const corReqs = []
for (const [tab, sheetId] of Object.entries(sheetIds)) {
    const lista = tab === GERAIS_TAB ? leads : buckets[Object.entries(INTERESSE_TABS).find(([, v]) => v === tab)[0]]
    lista.forEach((l, i) => {
        const bg = coresPorLead.get(nucleo(l.whatsapp))
        if (!bg) return
        corReqs.push({ repeatCell: { range: { sheetId, startRowIndex: i + 1, endRowIndex: i + 2, startColumnIndex: 0, endColumnIndex: LAYOUT.length }, cell: { userEnteredFormat: { backgroundColor: bg } }, fields: 'userEnteredFormat.backgroundColor' } })
    })
}
for (let i = 0; i < corReqs.length; i += 200) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: corReqs.slice(i, i + 200) } })
}
console.log(`cores reaplicadas: ${corReqs.length} linhas`)

// 6) apaga as abas que não fazem parte da nova estrutura
const manter = new Set(Object.values(sheetIds))
const apagar = tabsMeta.filter(t => !manter.has(t.sheetId))
await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: apagar.map(t => ({ deleteSheet: { sheetId: t.sheetId } })) } })
console.log(`\nabas removidas (${apagar.length}):`, apagar.map(t => t.title).join(', '))
console.log('\nPRONTO. Estrutura final:', [GERAIS_TAB, ...Object.values(INTERESSE_TABS)].join(' | '))
