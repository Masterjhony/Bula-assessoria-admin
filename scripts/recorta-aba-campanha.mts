/**
 * Recorta uma campanha para a aba própria dela — e TIRA esses leads da aba do
 * interesse, que é o que "aba própria" significa desde 09/09/2026 (pedido do
 * dono para o Nelore Visual): uma fila de trabalho só por lead.
 *
 * A regra de quem é da campanha tem UM dono: `abaDaCampanha()`/`ABAS_CAMPANHA`
 * em src/lib/jmp-sheets.ts. Este script não decide nada — ele só executa o que
 * o cron passa a fazer sozinho daqui pra frente, e faz o que o cron NÃO faz:
 * apagar linha (o cron é append-only de propósito).
 *
 * ⚠ ORDEM: subir o código PRIMEIRO, rodar isto DEPOIS. Com o código antigo em
 * produção, a passada seguinte do cron devolve os leads para a aba do interesse
 * — foi o que aconteceu em 31/07 com 3 leads movidos na mão.
 *
 * As colunas da equipe (Etapa/Atendido por/Observações) vão junto: se a linha
 * da aba de campanha estiver vazia e a do interesse tiver anotação, a anotação
 * é copiada ANTES de a linha antiga ser apagada. Sem isso, mover lead
 * trabalhado apagaria o trabalho.
 *
 *   npx tsx scripts/recorta-aba-campanha.mts                      (simulação)
 *   npx tsx scripts/recorta-aba-campanha.mts --apply
 *   npx tsx scripts/recorta-aba-campanha.mts --aba "Nelore Visual" --apply
 */
import fs from 'node:fs'
import { google } from 'googleapis'

// As envs precisam estar em process.env ANTES de o módulo da lib carregar —
// import de ESM é içado, então a lib entra por import() dinâmico lá embaixo.
for (const linha of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    if (!linha || linha.startsWith('#') || !linha.includes('=')) continue
    const i = linha.indexOf('=')
    const k = linha.slice(0, i).trim()
    if (!process.env[k]) process.env[k] = linha.slice(i + 1).trim().replace(/^"|"$/g, '')
}

const {
    ABAS_CAMPANHA, ABAS_INTERESSE, LEADS_GERAIS_TAB, abaDaCampanha, chaveDoLead,
    getSheetInfo, syncAbasPorInteresse, tomaTravaDeCura, liberaTravaDeCura,
} = await import('../src/lib/jmp-sheets')

const APPLY = process.argv.includes('--apply')
const filtro = (() => {
    const i = process.argv.indexOf('--aba')
    return i >= 0 ? process.argv[i + 1] : null
})()
const alvos = ABAS_CAMPANHA.filter(c => !filtro || c.tab === filtro)
if (!alvos.length) {
    console.error(`Nenhuma aba de campanha chamada "${filtro}". Conhecidas: ${ABAS_CAMPANHA.map(c => c.tab).join(', ')}`)
    process.exit(1)
}

const info = await getSheetInfo()
if (!info) { console.error('planilha não provisionada (jmp_config key=sheets)'); process.exit(1) }
const spreadsheetId = info.spreadsheetId

const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
const auth = new google.auth.JWT({
    email: creds.client_email,
    key: String(creds.private_key).replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

const norm = (v: unknown) => String(v ?? '').trim()
const chave = (nome: string) => nome.toLowerCase().replace(/[^a-z0-9]/g, '')
/** Aba que ainda não existe (a da campanha, antes do primeiro cron) lê vazia. */
const ler = async (tab: string) => {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!A1:BZ5000` })
        return ((res.data.values ?? []) as string[][]).map(r => r.map(c => norm(c)))
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/Unable to parse range|not found/i.test(msg)) return [] as string[][]
        throw e
    }
}
const colDe = (head: string[], nome: string) =>
    head.findIndex(h => chave(norm(h)) === chave(nome))
/** A1 da coluna (as colunas da equipe vivem no começo da aba, mas não custa cobrir AA+). */
const colA1 = (i: number) => (i < 26 ? '' : String.fromCharCode(64 + Math.floor(i / 26))) + String.fromCharCode(65 + (i % 26))

// 1. Quem é da campanha, segundo a LEADS GERAIS (é ela que tem os nomes de mídia).
const base = await ler(LEADS_GERAIS_TAB)
const bh = base[0] ?? []
const b = (n: string) => colDe(bh, n)
const cols = {
    nome: b('Nome'), tel: b('WhatsApp'), id: b('Lead ID'),
    utmCampaign: b('utm_campaign'), utmContent: b('utm_content'), origem: b('Origem'),
    adId: b('ad-id'), adsetId: b('adset_id'), adName: b('ad_name'),
    adsetName: b('adset_name'), campaignName: b('campaign_name'),
}
const daCampanha = new Map<string, Set<string>>() // aba → chaves dos leads
for (const r of base.slice(1)) {
    const at = (i: number) => (i >= 0 ? norm(r[i]) : '')
    const tab = abaDaCampanha({
        utmCampaign: at(cols.utmCampaign), utmContent: at(cols.utmContent), origem: at(cols.origem),
        adId: at(cols.adId), adsetId: at(cols.adsetId), adName: at(cols.adName),
        adsetName: at(cols.adsetName), campaignName: at(cols.campaignName),
    })
    if (!tab || !alvos.some(c => c.tab === tab)) continue
    const k = chaveDoLead(at(cols.id), at(cols.tel), at(cols.nome))
    daCampanha.set(tab, (daCampanha.get(tab) ?? new Set<string>()).add(k))
}
for (const c of alvos) {
    console.log(`\n=== ${c.tab}: ${(daCampanha.get(c.tab) ?? new Set()).size} lead(s) na ${LEADS_GERAIS_TAB}`)
}

// 2. A aba da campanha precisa estar COMPLETA antes de qualquer linha ser
//    apagada da aba do interesse — quem a enche é o cron. Só chamamos o sync
//    quando falta alguém: o Sheets tem cota de leitura por minuto e o sync
//    relê a planilha inteira, então repetir isso à toa derruba a execução
//    inteira com 429 (aconteceu na estreia).
const jaNaAba = new Map<string, Set<string>>()
for (const campanha of alvos) {
    const vals = await ler(campanha.tab)
    const h = vals[0] ?? []
    const iTel = colDe(h, 'WhatsApp'), iId = colDe(h, 'Lead ID'), iNome = colDe(h, 'Nome')
    const presentes = new Set<string>()
    if (iTel >= 0) {
        for (const r of vals.slice(1)) presentes.add(chaveDoLead(norm(r[iId]), norm(r[iTel]), norm(r[iNome])))
    }
    jaNaAba.set(campanha.tab, presentes)
    const faltam = [...(daCampanha.get(campanha.tab) ?? [])].filter(k => !presentes.has(k)).length
    console.log(`    ${presentes.size} já na aba "${campanha.tab}", ${faltam} faltando`)
}
const precisaSync = alvos.some(c =>
    [...(daCampanha.get(c.tab) ?? [])].some(k => !(jaNaAba.get(c.tab) ?? new Set()).has(k)))
if (APPLY && precisaSync) {
    const r = await syncAbasPorInteresse()
    console.log(`\nsync das abas: ${JSON.stringify(r.appended)} (de ${r.total} leads)${r.falhas?.length ? ` | FALHARAM: ${r.falhas.join(', ')}` : ''}`)
}

// 3. Tira da aba do interesse quem agora é da campanha.
const COLUNAS_DA_EQUIPE = ['Etapa', 'Atendido por', 'Observações']
const trava = APPLY ? await tomaTravaDeCura() : true
if (APPLY && !trava) {
    console.error('trava da auto-cura ocupada — a auto-cura está mexendo na planilha agora. Tente de novo em 2 min.')
    process.exit(1)
}
try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: false })
    const sheetIdDe = new Map((meta.data.sheets ?? []).map(s => [s.properties?.title ?? '', s.properties?.sheetId ?? -1]))

    for (const campanha of alvos) {
        const chaves = daCampanha.get(campanha.tab) ?? new Set<string>()
        if (!chaves.size) continue

        // Linhas já presentes na aba da campanha, por chave.
        const alvo = await ler(campanha.tab)
        const ah = alvo[0] ?? []
        const aTel = colDe(ah, 'WhatsApp'), aId = colDe(ah, 'Lead ID'), aNome = colDe(ah, 'Nome')
        const naCampanha = new Map<string, number>()
        alvo.slice(1).forEach((r, i) => {
            const k = chaveDoLead(norm(r[aId]), norm(r[aTel]), norm(r[aNome]))
            if (!naCampanha.has(k)) naCampanha.set(k, i + 2) // nº da linha na planilha
        })

        const escritas: { range: string; values: string[][] }[] = []
        const apagar: { tab: string; sheetId: number; linha: number; quem: string }[] = []
        const orfaos: string[] = []

        for (const tab of Object.values(ABAS_INTERESSE)) {
            const vals = await ler(tab)
            const h = vals[0] ?? []
            const iTel = colDe(h, 'WhatsApp'), iId = colDe(h, 'Lead ID'), iNome = colDe(h, 'Nome')
            if (iTel < 0) continue
            vals.slice(1).forEach((r, i) => {
                const k = chaveDoLead(norm(r[iId]), norm(r[iTel]), norm(r[iNome]))
                if (!chaves.has(k)) return
                const linhaAlvo = naCampanha.get(k)
                if (!linhaAlvo) { orfaos.push(`${norm(r[iNome])} (${tab})`); return }
                // Anotação da equipe vai junto — só quando o destino está vazio.
                for (const coluna of COLUNAS_DA_EQUIPE) {
                    const ci = colDe(h, coluna), ca = colDe(ah, coluna)
                    if (ci < 0 || ca < 0) continue
                    const daAba = norm(r[ci])
                    const noAlvo = norm((alvo[linhaAlvo - 1] ?? [])[ca])
                    if (!daAba || noAlvo) continue
                    escritas.push({ range: `'${campanha.tab}'!${colA1(ca)}${linhaAlvo}`, values: [[daAba]] })
                }
                apagar.push({ tab, sheetId: sheetIdDe.get(tab) ?? -1, linha: i + 2, quem: norm(r[iNome]) })
            })
        }

        for (const o of orfaos) console.warn(`  ⚠ ainda não está na "${campanha.tab}", não vou apagar: ${o}`)
        for (const a of apagar) console.log(`  ${APPLY ? 'apaga' : 'apagaria'} ${a.tab} L${a.linha}: ${a.quem} → ${campanha.tab}`)
        if (escritas.length) console.log(`  ${APPLY ? 'leva' : 'levaria'} ${escritas.length} anotação(ões) da equipe junto`)

        if (!APPLY || !apagar.length) continue
        if (escritas.length) {
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId, requestBody: { valueInputOption: 'RAW', data: escritas },
            })
        }
        // De baixo para cima: apagar a linha 5 antes da 3 desloca a 3.
        const requests = apagar
            .sort((x, y) => y.linha - x.linha)
            .map(a => ({ deleteDimension: { range: { sheetId: a.sheetId, dimension: 'ROWS', startIndex: a.linha - 1, endIndex: a.linha } } }))
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } })
        console.log(`  ✓ ${apagar.length} linha(s) removida(s) das abas de interesse`)
    }
} finally {
    if (APPLY && trava) await liberaTravaDeCura()
}

console.log(APPLY ? '\nfeito.' : '\nsimulação — nada foi escrito. Rode com --apply.')
process.exit(0)
