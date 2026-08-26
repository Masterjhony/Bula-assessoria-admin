/**
 * Converte a planilha "Leads - Bula Assessoria" em cards no CRM.
 *
 * As landings de touros e São Geraldo gravam SÓ na planilha — nunca entraram no
 * `crm_leads`. O resultado é que 946 pessoas que levantaram a mão estão numa aba
 * do Drive e não aparecem para ninguém no CRM: não entram em funil, não recebem
 * atendimento e não contam em métrica nenhuma.
 *
 * Aqui a planilha é a fonte e o CRM é o espelho. Roda quantas vezes quiser: o
 * telefone normalizado é a chave, e quem já está no CRM não vira card novo.
 *
 * O TELEFONE É A CHAVE, e ele precisa estar no formato canônico do CRM (só
 * dígitos, com DDI). Comparar do jeito que a planilha escreve — "(89) 98826-0103"
 * — não casa com nada e duplicaria a base inteira.
 *
 * O lead nasce em ENTRADA, como todo lead novo: quem decide que ele vira CONEXÃO
 * é o atendimento, não a importação.
 *
 *   npx tsx scripts/sincroniza-planilha-leads-crm.mts           (dry-run)
 *   npx tsx scripts/sincroniza-planilha-leads-crm.mts --apply
 */
import fs from 'node:fs'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})
const APPLY = process.argv.includes('--apply')

const SHEET_ID = '1caFGyHlqF-fic0y5zsnO1GRty4J61upMcjVI8e8V5F8'
const ABAS = [
    { aba: 'LEADS GERAIS', source: 'planilha-leads-gerais', interesse: null },
    { aba: 'TOUROS', source: 'planilha-touros', interesse: 'Touros' },
    { aba: 'FEMEAS', source: 'planilha-femeas', interesse: 'Fêmeas' },
    { aba: 'EMBRIÕES', source: 'planilha-embrioes', interesse: 'Embriões' },
    { aba: 'OUTROS', source: 'planilha-outros', interesse: null },
] as const

/** Telefone canônico do CRM: só dígitos, com DDI 55. */
function telCanonico(bruto: unknown): string | null {
    let d = String(bruto ?? '').replace(/\D/g, '').replace(/^0+/, '')
    if (d.length >= 10 && !d.startsWith('55')) d = '55' + d
    return d.length >= 12 && d.length <= 13 ? d : null
}
const limpa = (v: unknown) => {
    const s = String(v ?? '').trim()
    return s && s !== '-' && s.toLowerCase() !== 'n/a' ? s : null
}
/**
 * Faixa vira o PISO: "101 a 300 cabeças" → 101, "mais de 500" → 500, "1 a 50" → 1.
 * O piso é o único número que a planilha realmente afirma, e é o que mantém a
 * regra de MQL honesta: "51 a 100" não vira MQL por arredondamento para cima.
 */
function cabecas(v: unknown): number | null {
    const s = String(v ?? '')
    const nums = s.match(/\d+/g)
    if (!nums?.length) return null
    return Number(nums[0])
}
const SIM = /^(sim|s|yes|true|tenho)/i

// ── planilha ───────────────────────────────────────────────────────────────
const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON!),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
})
const sheets = google.sheets({ version: 'v4', auth })

// ── CRM: telefones que já existem ──────────────────────────────────────────
async function todos<T>(tabela: string, sel: string): Promise<T[]> {
    const out: T[] = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from(tabela).select(sel).range(from, from + 999)
        if (error) throw new Error(`${tabela}: ${error.message}`)
        out.push(...((data ?? []) as unknown as T[]))
        if (!data || data.length < 1000) break
    }
    return out
}
const noCrm = new Set(
    (await todos<{ telefone: string | null }>('crm_leads', 'telefone'))
        .map(l => telCanonico(l.telefone)).filter(Boolean) as string[])
console.log(`CRM hoje: ${noCrm.size} telefones`)

type Novo = Record<string, unknown> & { telefone: string; nome: string }
const novos: Novo[] = []
const vistos = new Set<string>()
let semTelefone = 0, jaNoCrm = 0

for (const { aba, source, interesse } of ABAS) {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `'${aba}'` })
    const v = r.data.values ?? []
    const head = (v[0] ?? []).map(h => String(h).trim().toLowerCase())
    const col = (...alt: RegExp[]) => head.findIndex(h => alt.some(re => re.test(h)))
    const iTel = col(/whats|telefone|fone|celular/)
    const iNome = col(/^nome/)
    const iMail = col(/mail/)
    const iUf = col(/^uf$|estado/)
    const iCidade = col(/cidade/)
    const iMomento = col(/momento/)
    const iCab = col(/cabe/)
    const iIe = col(/inscri/)
    const iInteresse = col(/interesse/)
    const iQtd = col(/qtd|quantidade/)
    const iData = col(/^data/)

    const linhas = v.slice(1).filter(x => x.some(c => String(c ?? '').trim() !== ''))
    let novosAba = 0
    for (const linha of linhas) {
        const tel = telCanonico(linha[iTel])
        if (!tel) { semTelefone++; continue }
        if (noCrm.has(tel)) { jaNoCrm++; continue }
        if (vistos.has(tel)) continue      // repetido dentro da própria planilha
        vistos.add(tel)

        const nome = limpa(iNome >= 0 ? linha[iNome] : null) ?? `Lead ${tel.slice(-8)}`
        const ie = iIe >= 0 ? limpa(linha[iIe]) : null
        const temIe = ie ? SIM.test(ie) : null
        const qtd = iCab >= 0 ? cabecas(linha[iCab]) : null
        // MQL da casa: 100+ cabeças E inscrição estadual.
        const mql = !!temIe && (qtd ?? 0) >= 100

        novos.push({
            nome, telefone: tel,
            email: iMail >= 0 ? limpa(linha[iMail]) : null,
            estado: iUf >= 0 ? limpa(linha[iUf]) : null,
            cidade: iCidade >= 0 ? limpa(linha[iCidade]) : null,
            momento_pecuaria: iMomento >= 0 ? limpa(linha[iMomento]) : null,
            quantidade_animais: qtd,
            inscricao_estadual: ie && !SIM.test(ie) ? ie : null,
            tem_inscricao_estadual: temIe,
            interesse_principal: interesse ?? (iInteresse >= 0 ? limpa(linha[iInteresse]) : null),
            o_que_busca: iQtd >= 0 ? limpa(linha[iQtd]) : null,
            is_mql: mql,
            source, origem: `Planilha de leads · aba ${aba}`,
            funnel_id: 'default', stage: 'novo', status: 'ENTRADA',
            data_entrada: iData >= 0 ? dataDaPlanilha(linha[iData]) : null,
        } as Novo)
        novosAba++
    }
    console.log(`  ${aba.padEnd(14)} ${String(linhas.length).padStart(5)} linhas · ${novosAba} card(s) a criar`)
}

/** "20/08/2026, 19:00" → ISO. A planilha escreve em pt-BR. */
function dataDaPlanilha(v: unknown): string | null {
    const s = String(v ?? '').trim()
    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/)
    if (!m) return null
    const [, d, mes, a, h = '12', min = '00'] = m
    const iso = new Date(Number(a), Number(mes) - 1, Number(d), Number(h), Number(min))
    return Number.isNaN(iso.getTime()) ? null : iso.toISOString()
}

console.log(`\n  ja no CRM: ${jaNoCrm}  ·  sem telefone valido: ${semTelefone}  ·  A CRIAR: ${novos.length}`)
const mqls = novos.filter(n => n.is_mql).length
console.log(`  destes, ${mqls} entram como MQL (100+ cabecas e inscricao estadual)`)
console.log('\nAMOSTRA:')
for (const n of novos.slice(0, 8))
    console.log(`   ${String(n.nome).slice(0, 30).padEnd(30)} ${n.telefone}  ${String(n.estado ?? '--').padEnd(3)}` +
        `  ${n.quantidade_animais ?? '?'} cab  ${n.is_mql ? 'MQL' : ''}`)

if (!APPLY) { console.log('\n(dry-run) use --apply para gravar'); process.exit(0) }

let ok = 0
for (let i = 0; i < novos.length; i += 200) {
    const lote = novos.slice(i, i + 200)
    const { error } = await sb.from('crm_leads').insert(lote)
    if (error) { console.error(`  ERRO no lote ${i}: ${error.message}`); continue }
    ok += lote.length
    console.log(`  gravados ${ok}/${novos.length}`)
}
console.log(`\ncards criados: ${ok}`)
