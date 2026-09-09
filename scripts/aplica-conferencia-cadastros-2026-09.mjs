/**
 * APLICA na aba CADASTROS o resultado da conferência de compras.
 *
 *   node scripts/aplica-conferencia-cadastros-2026-09.mjs          # simulação
 *   node scripts/aplica-conferencia-cadastros-2026-09.mjs --apply  # grava
 *
 * O que ele escreve — e só isso:
 *   1. Coluna "Já comprou?" ganha TEXTO em todas as linhas (hoje a resposta é
 *      só a cor de fundo, e por isso some em qualquer leitura ou soma):
 *        SIM      + verde   — compra confirmada no ERP/fechamento/pregão/carteira
 *        NÃO      + vermelho
 *        CONFERIR + âmbar   — está marcada como comprou e não há lastro em base nossa
 *   2. Células VAZIAS das colunas de trabalho recebem o valor que já existe em
 *      base nossa (planilha de leads, CRM, HastaPro, AgRisk, grupo da leiloeira).
 *
 * O que ele NÃO faz, de propósito:
 *   • não sobrescreve célula preenchida — CPF errado, duplicata e afins saem em
 *     lista para decisão de quem é dono do dado;
 *   • não apaga linha nenhuma;
 *   • não usa proposta cujo registro de origem está em NOME DE OUTRA PESSOA
 *     (telefone de casa/sócio) — essas ficam para conferência manual.
 *
 * Antes de gravar tira backup completo (valores + cores) em
 * outputs/conferencia-compras-cadastros-2026-09/backup-aba-<timestamp>.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { google } from 'googleapis'
import { ROOT, carregaEnv, SID, ABA, N, dig } from './lib/compras-cadastros-2026-09.mjs'

carregaEnv()
const APPLY = process.argv.includes('--apply')
const DADOS = path.join(ROOT, 'outputs', 'conferencia-compras-cadastros-2026-09')
const R = JSON.parse(fs.readFileSync(path.join(DADOS, 'resultado.json'), 'utf8'))

const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
let creds
try { creds = JSON.parse(raw) } catch {
    creds = { client_email: raw.match(/"client_email"\s*:\s*"([^"]+)"/)?.[1], private_key: raw.match(/"private_key"\s*:\s*"([\s\S]*?)"\s*[,}]/)?.[1] }
}
const auth = new google.auth.JWT({ email: creds.client_email, key: creds.private_key.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
const sheets = google.sheets({ version: 'v4', auth })

/* ── 1. lê a aba AGORA (valores + cores + validação) e tira backup ────────── */
const meta = await sheets.spreadsheets.get({ spreadsheetId: SID, includeGridData: false })
const aba = meta.data.sheets.find(s => s.properties.title === ABA)
if (!aba) { console.error(`aba ${ABA} não encontrada`); process.exit(1) }
const SHEET_ID = aba.properties.sheetId

const grid = await sheets.spreadsheets.get({
    spreadsheetId: SID, includeGridData: true, ranges: [`${ABA}!A1:R120`],
    fields: 'sheets(data(rowData(values(formattedValue,effectiveFormat(backgroundColor),dataValidation))))',
})
const rowData = grid.data.sheets[0].data[0].rowData || []
const hex = c => c ? '#' + [c.red, c.green, c.blue].map(v => Math.round((v ?? 0) * 255).toString(16).padStart(2, '0')).join('') : ''
const vivo = rowData.map((r, i) => ({
    linha: i + 1,
    valores: (r.values || []).map(v => v.formattedValue ?? ''),
    cores: (r.values || []).map(v => hex(v.effectiveFormat?.backgroundColor)),
}))
const H = vivo[0].valores
const col = n => H.indexOf(n)
const validacoes = (rowData[1]?.values || []).map(v => v.dataValidation?.condition?.type || '')
const carimbo = new Date().toISOString().replace(/[:.]/g, '-')
const arqBackup = path.join(DADOS, `backup-aba-${carimbo}.json`)
fs.writeFileSync(arqBackup, JSON.stringify({ quando: new Date().toISOString(), sheetId: SHEET_ID, header: H, validacoes, linhas: vivo }, null, 1))
console.log(`backup: ${path.relative(ROOT, arqBackup)}`)
console.log('checkbox nas colunas:', H.map((h, i) => validacoes[i] === 'BOOLEAN' ? h : null).filter(Boolean).join(', ') || 'nenhuma')

/* ── 2. trava de segurança: a aba não pode ter mudado debaixo da apuração ─── */
const cNome = col('Nome Completo')
const problemas = []
for (const r of R) {
    const v = vivo[r.linha - 1]
    if (!v) { problemas.push(`linha ${r.linha} sumiu`); continue }
    if (N(v.valores[cNome]) !== N(r.nome)) problemas.push(`linha ${r.linha}: apuração "${r.nome}" × planilha "${v.valores[cNome]}"`)
}
if (problemas.length) {
    console.error('\nA aba mudou desde a apuração — nada foi escrito:')
    problemas.slice(0, 10).forEach(p => console.error('  ' + p))
    console.error('\nRode de novo: node scripts/gera-conferencia-compras-cadastros-2026-09.mjs --refresh')
    process.exit(1)
}
console.log(`trava ok: ${R.length} linhas conferidas nome a nome`)

/* ── 3. coluna "Já comprou?" ──────────────────────────────────────────────── */
const cJa = col('Já comprou?')
const VERDE = { red: 0.204, green: 0.659, blue: 0.325 }      // #34a853, o verde que já está lá
const VERMELHO = { red: 1, green: 0, blue: 0 }               // #ff0000
const AMBAR = { red: 1, green: 0.851, blue: 0.4 }            // #ffd966 — "conferir", estado novo
const iguais = (a, b) => a && b && ['red', 'green', 'blue'].every(k => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 0.02)
const corAtual = l => { const h = vivo[l - 1].cores[cJa]; return h === '#34a853' ? VERDE : h === '#ff0000' ? VERMELHO : null }

const decisao = R.map(r => {
    const semLastro = r.marcado === 'SIM' && !r.comprou
    return {
        r, texto: r.comprou ? 'SIM' : semLastro ? 'CONFERIR' : 'NÃO',
        cor: r.comprou ? VERDE : semLastro ? AMBAR : VERMELHO,
        mudaCor: !iguais(corAtual(r.linha), r.comprou ? VERDE : semLastro ? AMBAR : VERMELHO),
    }
})

/* ── 4. preenchimento das células vazias ──────────────────────────────────── */
const CAMPO = {
    Telefone: 'tel', Interesse: 'interesse', Cidade: 'cidade', Estado: 'uf', CPF: 'cpfTxt', IE: 'ie',
    SCORE: 'score', 'PENDÊNCIAS': 'pendencias', 'BULA REMATES': 'remates', PROGRAMA: 'programa', CAMPANHA: 'campanha',
}
/** nomes compatíveis = mesma pessoa escrita de outro jeito; incompatíveis = registro de terceiro */
function nomesCompativeis(a, b) {
    const ta = N(a).split(' ').filter(t => t.length >= 3), tb = N(b).split(' ').filter(t => t.length >= 3)
    if (!ta.length || !tb.length) return false
    if (ta[0] !== tb[0]) return false
    const inter = ta.filter(t => tb.includes(t))
    return inter.length >= 2 || inter.length === Math.min(ta.length, tb.length)
}

const preenche = [], recusadas = []
for (const r of R) {
    for (const [coluna, campo] of Object.entries(CAMPO)) {
        const p = r.preencher[coluna]
        if (!p) continue
        const c = col(coluna)
        if (c < 0) continue
        if (String(vivo[r.linha - 1].valores[c] ?? '').trim()) continue        // já preenchida na planilha viva
        if (p.conferir && !nomesCompativeis(r.nome, p.conferir)) { recusadas.push({ ...p, linha: r.linha, nome: r.nome, coluna }); continue }
        preenche.push({ linha: r.linha, coluna, c, valor: p.valor, fonte: p.fonte, nome: r.nome })
    }
}

/* ── 5. relatório do que vai (ou iria) ────────────────────────────────────── */
const mudaTexto = decisao.filter(d => !String(vivo[d.r.linha - 1].valores[cJa] ?? '').trim() || String(vivo[d.r.linha - 1].valores[cJa]).trim().toUpperCase() !== d.texto)
const mudaCor = decisao.filter(d => d.mudaCor)
console.log(`\n"Já comprou?": ${mudaTexto.length} células ganham texto · ${mudaCor.length} mudam de cor`)
for (const d of mudaCor) console.log(`   L${String(d.r.linha).padStart(3)} ${d.r.nome.padEnd(34).slice(0, 34)} ${(vivo[d.r.linha - 1].cores[cJa] === '#34a853' ? 'verde' : vivo[d.r.linha - 1].cores[cJa] === '#ff0000' ? 'vermelho' : 'branco').padEnd(9)} → ${d.texto}`)
const porColuna = {}
for (const p of preenche) porColuna[p.coluna] = (porColuna[p.coluna] || 0) + 1
console.log(`\nPreenchimento: ${preenche.length} células — ${Object.entries(porColuna).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`Recusadas (registro em outro nome): ${recusadas.length}`)
for (const x of recusadas) console.log(`   L${String(x.linha).padStart(3)} ${x.nome.padEnd(30).slice(0, 30)} ${x.coluna.padEnd(12)} "${String(x.valor).slice(0, 28)}" ← registro de ${x.conferir}`)

if (!APPLY) { console.log('\nSIMULAÇÃO — nada foi escrito. Rode com --apply para gravar.'); process.exit(0) }

/* ── 6. grava ─────────────────────────────────────────────────────────────── */
const A1 = (linha, c) => { let n = c + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return `${ABA}!${s}${linha}` }
const data = [
    ...decisao.map(d => ({ range: A1(d.r.linha, cJa), values: [[d.texto]] })),
    ...preenche.map(p => ({ range: A1(p.linha, p.c), values: [[p.valor]] })),
]
for (let i = 0; i < data.length; i += 200) {
    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SID,
        requestBody: { valueInputOption: 'USER_ENTERED', data: data.slice(i, i + 200) },
    })
}
console.log(`\n${data.length} células gravadas`)

const requests = mudaCor.map(d => ({
    repeatCell: {
        range: { sheetId: SHEET_ID, startRowIndex: d.r.linha - 1, endRowIndex: d.r.linha, startColumnIndex: cJa, endColumnIndex: cJa + 1 },
        cell: { userEnteredFormat: { backgroundColor: d.cor } },
        fields: 'userEnteredFormat.backgroundColor',
    },
}))
// o texto tem de ser legível sobre o fundo forte
requests.push({
    repeatCell: {
        range: { sheetId: SHEET_ID, startRowIndex: 1, endRowIndex: R[R.length - 1].linha, startColumnIndex: cJa, endColumnIndex: cJa + 1 },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true, foregroundColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } } } } },
        fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.foregroundColorStyle',
    },
})
// o âmbar é claro: nele o texto fica escuro
for (const d of decisao.filter(x => x.texto === 'CONFERIR')) requests.push({
    repeatCell: {
        range: { sheetId: SHEET_ID, startRowIndex: d.r.linha - 1, endRowIndex: d.r.linha, startColumnIndex: cJa, endColumnIndex: cJa + 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColorStyle: { rgbColor: { red: 0.15, green: 0.11, blue: 0 } } } } },
        fields: 'userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.foregroundColorStyle',
    },
})
await sheets.spreadsheets.batchUpdate({ spreadsheetId: SID, requestBody: { requests } })
console.log(`${mudaCor.length} cores ajustadas + formatação do texto`)
console.log(`\nbackup para desfazer: ${path.relative(ROOT, arqBackup)}`)
