/**
 * DIVISÃO DOS MELHORES LEADS POR ASSESSOR (região)
 * ------------------------------------------------
 * Pega os "peixes grandes" (leads mais promissores das conversas do atendimento)
 * e divide entre os assessores conforme a regra de zonas definida pelo chefe:
 *
 *   • Douglas   → Norte (AC, AM, AP, PA, RO, RR, TO) + MARANHÃO
 *   • Fábio Mena→ Nordeste (menos MA) + Sudeste (ES, MG, RJ, SP)
 *   • Leozinho  → Centro-Oeste (MS, MT, GO, DF) + Sul (PR, RS, SC)
 *
 * A UF vem do cadastro (estado); quando falta, é inferida pelo DDD do telefone.
 * Leads sem UF identificável vão para a aba "A definir".
 *
 * Saída: planilha .xlsx na Área de Trabalho, com 1 aba por assessor + resumo.
 *
 *   node scripts/gera-planilha-por-assessor.mjs
 *   node scripts/gera-planilha-por-assessor.mjs --min 40   # inclui score >= 40 (mais volume)
 */
import path from 'node:path'
import os from 'node:os'
import ExcelJS from 'exceljs'
import { coletaConversas, strv, canon } from './lib/conversas-core.mjs'
import { PALETTE, styleSheet, rowFor } from './lib/conversas-xlsx.mjs'

const args = process.argv.slice(2)
const semIa = args.includes('--sem-ia')
const minScore = Number((args[args.indexOf('--min') + 1]) || 0) || 0 // 0 = só peixes grandes

// ── UF: normalização (nome → sigla) e inferência por DDD ─────────────────────
const NOME_UF = {
    acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
    'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
    'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
    paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
    'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
    'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
}
const SIGLAS = new Set(Object.values(NOME_UF))
const DDD_UF = {
    11: 'SP', 12: 'SP', 13: 'SP', 14: 'SP', 15: 'SP', 16: 'SP', 17: 'SP', 18: 'SP', 19: 'SP',
    21: 'RJ', 22: 'RJ', 24: 'RJ', 27: 'ES', 28: 'ES',
    31: 'MG', 32: 'MG', 33: 'MG', 34: 'MG', 35: 'MG', 37: 'MG', 38: 'MG',
    41: 'PR', 42: 'PR', 43: 'PR', 44: 'PR', 45: 'PR', 46: 'PR',
    47: 'SC', 48: 'SC', 49: 'SC', 51: 'RS', 53: 'RS', 54: 'RS', 55: 'RS',
    61: 'DF', 62: 'GO', 64: 'GO', 63: 'TO', 65: 'MT', 66: 'MT', 67: 'MS',
    68: 'AC', 69: 'RO', 71: 'BA', 73: 'BA', 74: 'BA', 75: 'BA', 77: 'BA', 79: 'SE',
    81: 'PE', 87: 'PE', 82: 'AL', 83: 'PB', 84: 'RN', 85: 'CE', 88: 'CE', 86: 'PI', 89: 'PI',
    91: 'PA', 93: 'PA', 94: 'PA', 92: 'AM', 97: 'AM', 95: 'RR', 96: 'AP', 98: 'MA', 99: 'MA',
}
function ufDe(c) {
    const l = c.lead || {}
    const raw = strv(l.estado).trim()
    if (raw) {
        const up = raw.toUpperCase()
        if (up.length === 2 && SIGLAS.has(up)) return up
        const norm = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        if (NOME_UF[norm]) return NOME_UF[norm]
    }
    // fallback: DDD do telefone canônico (DDD = 2 primeiros dígitos)
    const key = canon(strv(l.celular) || strv(l.telefone) || strv(c.phone))
    const ddd = parseInt(key.slice(0, 2), 10)
    return DDD_UF[ddd] || ''
}

// ── Regra de zonas → assessor ────────────────────────────────────────────────
const NORTE = new Set(['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'])
const NORDESTE = new Set(['AL', 'BA', 'CE', 'PB', 'PE', 'PI', 'RN', 'SE']) // MA é exceção → Douglas
const SUDESTE = new Set(['ES', 'MG', 'RJ', 'SP'])
const SUL = new Set(['PR', 'RS', 'SC'])
const CENTRO_OESTE = new Set(['DF', 'GO', 'MT', 'MS'])
function assessorDe(uf) {
    if (!uf) return null
    if (uf === 'MA' || NORTE.has(uf)) return 'Douglas'
    if (NORDESTE.has(uf) || SUDESTE.has(uf)) return 'Fábio Mena'
    if (CENTRO_OESTE.has(uf) || SUL.has(uf)) return 'Leozinho'
    return null
}
const ZONA = (uf) => uf === 'MA' ? 'Maranhão (Norte→Douglas)'
    : NORTE.has(uf) ? 'Norte' : NORDESTE.has(uf) ? 'Nordeste' : SUDESTE.has(uf) ? 'Sudeste'
    : CENTRO_OESTE.has(uf) ? 'Centro-Oeste' : SUL.has(uf) ? 'Sul' : '—'

// ── Coleta e filtra os melhores ──────────────────────────────────────────────
const { conversas } = await coletaConversas({ semIa, log: (s) => console.log(s) })
const melhores = conversas.filter((c) => minScore > 0 ? c.score >= minScore : c.peixe)
console.log(`→ ${melhores.length} leads selecionados (${minScore > 0 ? `score ≥ ${minScore}` : 'peixes grandes'}).`)

const grupos = { 'Douglas': [], 'Fábio Mena': [], 'Leozinho': [] }
const adefinir = []
for (const c of melhores) {
    const uf = ufDe(c)
    c._uf = uf
    c._zona = ZONA(uf)
    const a = assessorDe(uf)
    if (a) grupos[a].push(c); else adefinir.push(c)
}

// linha com UF/Zona explícitos (acrescenta ao rowFor padrão)
function rowAssessor(c, semIa) {
    const base = rowFor(c, { semIa })
    return { ...base, local: base.local || c._uf, _uf: c._uf, _zona: c._zona }
}

// ── Planilha ─────────────────────────────────────────────────────────────────
console.log('→ Gerando planilha por assessor…')
const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria'
wb.created = new Date()

// Aba resumo (Divisão)
const wsR = wb.addWorksheet('Divisão', { views: [{ showGridLines: false }] })
wsR.columns = [{ width: 26 }, { width: 14 }, { width: 12 }, { width: 44 }]
const head = wsR.addRow(['DIVISÃO DOS PEIXES GRANDES POR ASSESSOR', '', '', ''])
head.height = 26
wsR.mergeCells(1, 1, 1, 4)
head.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
head.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.INK } }
head.getCell(1).border = { bottom: { style: 'medium', color: { argb: PALETTE.GOLD } } }
head.getCell(1).alignment = { vertical: 'middle' }
wsR.addRow(['Gerado em', new Date().toLocaleString('pt-BR'), '', ''])
wsR.addRow([])
const colHead = wsR.addRow(['Assessor', 'Leads', 'Cabeças', 'Regras de zona'])
colHead.eachCell((cell, col) => {
    if (col > 4) return
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.INK } }
    cell.alignment = { horizontal: col === 1 || col === 4 ? 'left' : 'center' }
})
const somaCab = (arr) => arr.reduce((a, c) => a + (c.cab || 0), 0)
const regras = {
    'Douglas': 'Norte + Maranhão',
    'Fábio Mena': 'Nordeste (exc. MA) + Sudeste',
    'Leozinho': 'Centro-Oeste + Sul',
}
for (const nome of ['Douglas', 'Fábio Mena', 'Leozinho']) {
    const r = wsR.addRow([nome, grupos[nome].length, somaCab(grupos[nome]).toLocaleString('pt-BR'), regras[nome]])
    r.getCell(1).font = { bold: true }
    r.getCell(2).alignment = { horizontal: 'center' }
    r.getCell(3).alignment = { horizontal: 'center' }
}
if (adefinir.length) {
    const r = wsR.addRow(['A definir (sem UF)', adefinir.length, somaCab(adefinir).toLocaleString('pt-BR'), 'UF não identificada — distribuir manualmente'])
    r.getCell(1).font = { bold: true, color: { argb: 'FF9A6A00' } }
    r.getCell(2).alignment = { horizontal: 'center' }
    r.getCell(3).alignment = { horizontal: 'center' }
}
wsR.addRow([])
const tot = wsR.addRow(['TOTAL', melhores.length, somaCab(melhores).toLocaleString('pt-BR'), ''])
tot.eachCell((cell, col) => { if (col <= 3) cell.font = { bold: true } })

// Uma aba por assessor (+ A definir)
function abaAssessor(nome, arr) {
    const ws = wb.addWorksheet(nome, { views: [{ showGridLines: false }] })
    const ordenado = [...arr].sort((a, b) => b.score - a.score || (b.cab || 0) - (a.cab || 0))
    styleSheet(ws, ordenado.map((c) => rowAssessor(c, semIa)))
}
abaAssessor('Douglas', grupos['Douglas'])
abaAssessor('Fábio Mena', grupos['Fábio Mena'])
abaAssessor('Leozinho', grupos['Leozinho'])
if (adefinir.length) abaAssessor('A definir', adefinir)

const hoje = new Date().toISOString().slice(0, 10)
const outPath = path.join(os.homedir(), 'Desktop', `Leads-Peixes-Grandes-por-Assessor-${hoje}.xlsx`)
await wb.xlsx.writeFile(outPath)

console.log('\n✅ Planilha gerada:')
console.log('   ' + outPath)
for (const nome of ['Douglas', 'Fábio Mena', 'Leozinho']) {
    console.log(`   ${nome.padEnd(12)} ${String(grupos[nome].length).padStart(3)} leads · ${String(somaCab(grupos[nome])).padStart(5)} cabeças`)
}
if (adefinir.length) console.log(`   ${'A definir'.padEnd(12)} ${String(adefinir.length).padStart(3)} leads (sem UF)`)
