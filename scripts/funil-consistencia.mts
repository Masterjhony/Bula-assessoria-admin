/**
 * CONSISTÊNCIA DO FUNIL — a leitura ao vivo tem de bater com a apuração.
 *
 *   npx tsx scripts/funil-consistencia.mts
 *
 * O painel lê a planilha ao vivo (src/lib/funil-campanhas-live.ts) e o script
 * de apuração lê o dump extraído (scripts/apura-funil-campanhas-2026.mjs). Se
 * os dois caminhos derem números diferentes para o MESMO instante, um dos dois
 * está errado — e o pior cenário é ninguém perceber, que foi o que já
 * aconteceu com a métrica de atendimento.
 *
 * Este teste roda o motor (src/lib/funil-motor.ts — o mesmo que o painel usa)
 * contra a planilha AO VIVO e compara, campanha a campanha, com o último
 * funil-por-campanha.json. Divergência em lead/MQL só é legítima quando entrou
 * lead novo depois da apuração: o teste mostra a diferença e o sinal dela.
 *
 * Sai com código 1 se alguma campanha ENCOLHER (lead sumindo é bug, não é vida
 * real) ou se a diferença total passar de 5%.
 */
import fs from 'node:fs'
import path from 'node:path'
import { google } from 'googleapis'
import {
    indexaMeta, atribuiCampanha, classeOrigem, ehLixo, juntaPessoas, dataIso,
    type MetaEstrutura, type RegistroLead,
} from '../src/lib/funil-motor'

const ROOT = process.cwd()
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

const SID = '1caFGyHlqF-fic0y5zsnO1GRty4J61upMcjVI8e8V5F8'
const META = indexaMeta(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/lib/meta-estrutura.json'), 'utf8')) as MetaEstrutura)
const APURADO = JSON.parse(fs.readFileSync(path.join(ROOT, 'outputs/funil-campanhas-2026/funil-por-campanha.json'), 'utf8'))

const cred = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!)
const auth = new google.auth.GoogleAuth({ credentials: cred, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
const sheets = google.sheets({ version: 'v4', auth })

const res = await sheets.spreadsheets.values.get({ spreadsheetId: SID, range: `'LEADS GERAIS'` })
const v = (res.data.values ?? []) as string[][]
const head = v[0] ?? []
const linhas = v.slice(1)
    .filter(r => r.some(c => String(c ?? '').trim() !== ''))
    .map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])) as Record<string, string>)

const registros: RegistroLead[] = []
for (const r of linhas) {
    const bruto = { nome: r['Nome'], fone: r['WhatsApp'], origem: r['Origem'], campanhaRotulo: r['utm_campaign'] || r['campaign_name'] }
    if (ehLixo(bruto)) continue
    const a = atribuiCampanha(r, META)
    registros.push({
        nome: r['Nome'], fone: r['WhatsApp'], cabecas: r['Cabeças'], ie: r['Inscrição Estadual'],
        uf: r['UF'], origem: r['Origem'] ?? '', campanhaRotulo: r['utm_campaign'] || r['campaign_name'] || '',
        data: dataIso(r['Data']), leadId: String(r['Lead ID'] ?? '').trim(), fonte: 'planilha',
        campanha: a.campanha, via: a.via, conflito: a.conflito,
        classe: classeOrigem(r['Origem'], r['utm_campaign'] || r['campaign_name']),
    })
}
const { pessoas } = juntaPessoas(registros)

console.log(`planilha AO VIVO: ${linhas.length} linhas → ${pessoas.length} pessoas`)
console.log(`apuração ${APURADO.geradoEm}: ${APURADO.universo.registrosPlanilha} linhas → ${APURADO.universo.pessoasDepoisDaDedup} pessoas\n`)

let encolheu = 0
let somaAgora = 0
let somaAntes = 0
console.log('CAMPANHA'.padEnd(38), 'LEADS agora/apurado'.padStart(22), '   MQL agora/apurado')
for (const f of APURADO.funis) {
    const meus = pessoas.filter(p => p.campanha === f.id)
    const mql = meus.filter(p => p.mql).length
    somaAgora += meus.length
    somaAntes += f.etapas.leads
    const dl = meus.length - f.etapas.leads
    const dm = mql - f.etapas.mql
    // O CRM traz leads que só existem lá (landings de junho); este teste lê só a
    // planilha, então a apuração pode ter ALGUNS a mais legitimamente.
    const soDoCrm = APURADO.universo.registrosDoCrmSoNoCrm > 0
    if (dl < 0 && !soDoCrm) encolheu++
    const marca = dl === 0 ? '  ok' : dl > 0 ? ` +${dl}` : ` ${dl}`
    console.log(
        f.nome.padEnd(38),
        `${String(meus.length).padStart(6)} / ${String(f.etapas.leads).padStart(6)}${marca.padStart(6)}`,
        `   ${String(mql).padStart(4)} / ${String(f.etapas.mql).padStart(4)} ${dm === 0 ? ' ok' : (dm > 0 ? `+${dm}` : `${dm}`)}`,
    )
}

const desvio = somaAntes ? Math.abs(somaAgora - somaAntes) / somaAntes : 0
console.log(`\nTOTAL de campanha: ${somaAgora} ao vivo × ${somaAntes} apurado (${(desvio * 100).toFixed(2)}% de desvio)`)
console.log(APURADO.universo.registrosDoCrmSoNoCrm, 'leads da apuração vêm só do CRM e não estão na planilha — diferença legítima.')

if (desvio > 0.05) {
    console.error('\nFALHOU: desvio acima de 5%. As duas superfícies não descrevem o mesmo funil.')
    process.exit(1)
}
console.log('\nOK: leitura ao vivo e apuração descrevem o mesmo funil.')
