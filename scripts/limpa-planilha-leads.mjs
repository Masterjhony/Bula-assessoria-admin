/**
 * Faxina de vocabulário e de lixo nas 5 abas da planilha de leads.
 *
 * Conserta o que a consolidação de 31/07 deixou torto ou herdou das abas
 * antigas, SEM mexer no que é dado do lead:
 *  · Momento/Cabeças/Qtd. desejada/utm_source com dois vocabulários (slug do
 *    Meta convivendo com o rótulo em português);
 *  · células com lixo de linha desalinhada (`c:1202…`, `f:2449…`, nome de
 *    campanha dentro de "Cabeças", nome de pessoa dentro de "E-mail");
 *  · "Atendido por" com o mesmo assessor escrito de 4 jeitos, e recado da
 *    equipe ("Não tem frete SC") ocupando a coluna do nome — vai pra
 *    Observações;
 *  · telefone com DDI grudado.
 *
 * Uso:  node scripts/limpa-planilha-leads.mjs           (simulação)
 *       node scripts/limpa-planilha-leads.mjs --apply
 */
import { readFileSync } from 'node:fs'
import { google } from 'googleapis'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const S = v => String(v ?? '').trim()
const deaccent = s => S(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
const norm = s => deaccent(s).toLowerCase().replace(/[^a-z0-9]/g, '')

// ── vocabulário canônico ─────────────────────────────────────────────────────
const MOMENTO = new Map([
    ['naotrabalhoqueroaprender', 'Não trabalho, quero aprender'],
    ['trabalhocompecuariadecorte', 'Pecuária de corte'],
    ['pecuariadecorte', 'Pecuária de corte'],
    ['trabalhocomcorteepo', 'Corte e PO'],
    ['corteepo', 'Corte e PO'],
    ['soucriadorrenomadodepo', 'Criador renomado de PO'],
    ['criadorrenomadodepo', 'Criador renomado de PO'],
])
const CABECAS = new Map([
    ['050', '1 a 50 cabeças'], ['51100', '51 a 100 cabeças'], ['101300', '101 a 300 cabeças'],
    ['301500', '301 a 500 cabeças'], ['500', 'mais de 500 cabeças'],
    ['50100', '51 a 100 cabeças'], ['100300', '101 a 300 cabeças'], ['300500', '301 a 500 cabeças'],
])
// Assessor escrito de qualquer jeito → nome canônico (ver memória assessores-divisao-por-zona)
const ASSESSOR = new Map([
    ['joao', 'João Antônio'], ['joaoantonio', 'João Antônio'],
    ['marcelo', 'Marcelo Carneiro'], ['marcelocarneiro', 'Marcelo Carneiro'],
    ['bispo', 'Douglas Bispo'], ['douglas', 'Douglas Bispo'], ['douglasbispo', 'Douglas Bispo'],
    ['serafim', 'Leonardo Serafim'], ['leonardoserafim', 'Leonardo Serafim'], ['leozinho', 'Leonardo Serafim'],
    ['omena', 'Fábio Omena'], ['fabioomena', 'Fábio Omena'], ['fabioomenagaia', 'Fábio Omena'], ['fabiomena', 'Fábio Omena'],
])
/** Valor que claramente não é dado de lead: id do Meta, uuid, nome de campanha. */
const ehLixo = v => {
    const x = S(v)
    if (!x) return false
    return /^(l|c|f|ag|as|p):\d/i.test(x)
        || /^\d{10,}$/.test(x)
        || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(x)
        || /^(leads|leilao|video|ca )/i.test(x)
        || /^\d{4}-\d{2}-\d{2}T/.test(x)
        || /^\/+$/.test(x)
        || /test lead|dummy data/i.test(x)
}
const arrumaTelefone = raw => {
    const x = S(raw)
    if (!x) return x
    let d = x.replace(/\D+/g, '')
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2)      // DDI grudado
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
    return x                                                      // curto/estranho: não invento dígito
}
const arrumaQtd = raw => {
    const x = S(raw)
    if (!x) return x
    if (/ainda|nao sei|não sei/i.test(x)) return 'ainda não sei'
    if (/^0-5$/.test(x)) return '1 a 5'
    return x.replace(/^Mais de/, 'mais de')
}
/**
 * Nome do Instagram em letra estilizada do Unicode (𝐈𝐯𝐚𝐧 → Ivan). NFKC devolve
 * a letra normal — sem isso ninguém acha o lead buscando o nome dele.
 */
const SMALL_CAPS = new Map(Object.entries({
    'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i',
    'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p', 'ʀ': 'r', 'ꜱ': 's',
    'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
}))
const arrumaNome = raw => {
    const base = S(raw).normalize('NFKC').replace(/\s+/g, ' ').trim()
    // small caps (ɢᴜꜱᴛᴀᴠᴏ) o NFKC não cobre — são letras fonéticas, não variantes
    const convertido = [...base].map(c => SMALL_CAPS.get(c) ?? c).join('')
    if (convertido === base) return base
    // veio tudo em minúscula: devolve capitalizado, como nome de gente
    return convertido.replace(/(^|\s)(\p{L})/gu, (m, sp, l) => sp + l.toUpperCase())
}

const arrumaOrigem = raw => {
    const x = S(raw)
    if (/^meta\s*—?\s*$/i.test(x)) return 'Meta'
    return x
}
const arrumaUtmSource = raw => {
    const x = S(raw).toLowerCase()
    if (x === 'ig') return 'instagram'
    if (x === 'fb') return 'facebook'
    return S(raw)
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── planilha ─────────────────────────────────────────────────────────────────
const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await db.connect(); const { rows: cfg } = await db.query("select value from jmp_config where key='sheets'"); await db.end()
const spreadsheetId = cfg[0].value.spreadsheetId
const creds = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
const auth = new google.auth.JWT({ email: creds.client_email, key: creds.private_key.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })
const colName = i => { let n = i + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }

const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
const abas = meta.data.sheets.map(s => s.properties.title)
const contagem = {}
const conta = k => { contagem[k] = (contagem[k] ?? 0) + 1 }

for (const tab of abas) {
    const v = (await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!A1:AE20000` })).data.values ?? []
    if (!v.length) continue
    const h = v[0].map(S)
    const ix = n => h.findIndex(x => x.toLowerCase() === n.toLowerCase())
    const C = {
        etapa: ix('Etapa'), atend: ix('Atendido por'), nome: ix('Nome'), tel: ix('WhatsApp'),
        mail: ix('E-mail'), mom: ix('Momento'), cab: ix('Cabeças'), qtd: ix('Qtd. desejada'),
        origem: ix('Origem'), obs: ix('Observações'), utm: ix('utm_source'),
    }
    const linhas = v.slice(1).map(r => [...r])
    const largura = h.length
    for (const r of linhas) {
        while (r.length < largura) r.push('')
        const set = (i, valor) => { if (i >= 0 && S(r[i]) !== S(valor)) { r[i] = valor; return true } return false }

        // Momento
        if (C.mom >= 0) {
            const atual = S(r[C.mom])
            if (ehLixo(atual)) { if (set(C.mom, '')) conta('momento: lixo removido') }
            else { const canon = MOMENTO.get(norm(atual)); if (canon && set(C.mom, canon)) conta('momento: vocabulário unificado') }
        }
        // Cabeças
        if (C.cab >= 0) {
            const atual = S(r[C.cab])
            if (ehLixo(atual)) { if (set(C.cab, '')) conta('cabeças: lixo removido') }
            else { const canon = CABECAS.get(norm(atual)); if (canon && set(C.cab, canon)) conta('cabeças: vocabulário unificado') }
        }
        // Qtd. desejada
        if (C.qtd >= 0) {
            const atual = S(r[C.qtd])
            if (ehLixo(atual)) { if (set(C.qtd, '')) conta('qtd: lixo removido') }
            else if (set(C.qtd, arrumaQtd(atual))) conta('qtd: vocabulário unificado')
        }
        // Nome em letra estilizada do Instagram
        if (C.nome >= 0 && set(C.nome, arrumaNome(r[C.nome]))) conta('nome destravado do Unicode')
        // E-mail: só e-mail de verdade
        if (C.mail >= 0) {
            const atual = S(r[C.mail])
            if (atual && !EMAIL_RE.test(atual) && set(C.mail, '')) conta('e-mail inválido removido')
        }
        // WhatsApp
        if (C.tel >= 0 && set(C.tel, arrumaTelefone(r[C.tel]))) conta('telefone reformatado')
        // utm_source
        if (C.utm >= 0 && set(C.utm, arrumaUtmSource(r[C.utm]))) conta('utm_source unificado')
        // Origem
        if (C.origem >= 0 && set(C.origem, arrumaOrigem(r[C.origem]))) conta('origem arrumada')
        // Atendido por: nome do assessor OU recado da equipe (que vai pra Observações)
        if (C.atend >= 0) {
            const atual = S(r[C.atend])
            if (atual) {
                if (ehLixo(atual)) { if (set(C.atend, '')) conta('atendido por: lixo removido') }
                else {
                    const canon = ASSESSOR.get(norm(atual.replace(/-.*$/, '')))
                    if (canon) {
                        const resto = atual.includes('-') ? atual.split('-').slice(1).join('-').trim() : ''
                        if (set(C.atend, canon)) conta('atendido por: nome unificado')
                        if (resto && C.obs >= 0) {
                            const obs = S(r[C.obs])
                            if (!obs.toLowerCase().includes(resto.toLowerCase())) {
                                set(C.obs, obs ? `${obs} | ${resto}` : resto); conta('observação recuperada do "Atendido por"')
                            }
                        }
                    } else if (C.obs >= 0 && atual.split(/\s+/).length > 2) {
                        // recado, não nome ("Não tem frete SC")
                        const obs = S(r[C.obs])
                        set(C.obs, obs ? `${obs} | ${atual}` : atual)
                        set(C.atend, ''); conta('recado movido para Observações')
                    }
                }
            }
        }
    }

    // grava só as colunas que mudaram
    const mudou = []
    for (const [campo, i] of Object.entries(C)) {
        if (i < 0) continue
        const antes = v.slice(1).map(r => S(r?.[i]))
        const depois = linhas.map(r => S(r[i]))
        if (antes.length !== depois.length || antes.some((a, k) => a !== depois[k])) mudou.push([campo, i])
    }
    console.log(`${tab}: ${mudou.length ? mudou.map(([c]) => c).join(', ') : 'nada a mudar'}`)
    if (APPLY) {
        for (const [, i] of mudou) {
            await sheets.spreadsheets.values.update({
                spreadsheetId, range: `'${tab}'!${colName(i)}2:${colName(i)}${linhas.length + 1}`,
                valueInputOption: 'RAW', requestBody: { values: linhas.map(r => [r[i] ?? '']) },
            })
        }
    }
}

console.log('\n== correções ==')
Object.entries(contagem).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(5)}  ${k}`))
if (!APPLY) console.log('\nSIMULAÇÃO — rode com --apply')
