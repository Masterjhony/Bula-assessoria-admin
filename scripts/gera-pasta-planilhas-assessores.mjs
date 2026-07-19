/**
 * PASTA DE PLANILHAS POR ASSESSOR — um ARQUIVO .xlsx caprichado para cada um.
 * ---------------------------------------------------------------------------
 * Evolução do gera-planilha-por-assessor.mjs (que gerava 1 arquivo com abas):
 * o chefe pediu uma pasta com uma planilha POR assessor, com os leads mais
 * qualificados e com maior probabilidade de compra. A seleção agora soma o
 * TERMÔMETRO do concierge (extra_data.lead_score: prontidão % + gargalo) ao
 * score de conversa da IA.
 *
 * Zonas (regra do chefe):
 *   • Douglas    → Norte (AC, AM, AP, PA, RO, RR, TO) + MARANHÃO
 *   • Fábio Mena → Nordeste (menos MA) + Sudeste (ES, MG, RJ, SP)
 *   • Leozinho   → Centro-Oeste (MS, MT, GO, DF) + Sul (PR, RS, SC)
 * UF do cadastro; sem UF, inferida pelo DDD. Sem UF identificável → arquivo
 * "A-definir.xlsx" na mesma pasta.
 *
 *   node scripts/gera-pasta-planilhas-assessores.mjs
 *   node scripts/gera-pasta-planilhas-assessores.mjs --min 40   # mais volume
 *   node scripts/gera-pasta-planilhas-assessores.mjs --sem-ia   # sem análise IA nova
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import ExcelJS from 'exceljs'
import { coletaConversas, strv, canon } from './lib/conversas-core.mjs'
import { PALETTE, rowFor } from './lib/conversas-xlsx.mjs'
// Termômetro (equação de conversão) — lib TS; rodar o script com `npx tsx`.
import { computeLeadScore } from '../src/lib/lead-score'

const args = process.argv.slice(2)
const semIa = args.includes('--sem-ia')
const minScore = Number((args[args.indexOf('--min') + 1]) || 0) || 0

// ── UF: normalização e inferência por DDD (mesma régua do script original) ───
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
    const key = canon(strv(l.celular) || strv(l.telefone) || strv(c.phone))
    const ddd = parseInt(key.slice(0, 2), 10)
    return DDD_UF[ddd] || ''
}

const NORTE = new Set(['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'])
const NORDESTE = new Set(['AL', 'BA', 'CE', 'PB', 'PE', 'PI', 'RN', 'SE'])
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
const ZONA = (uf) => uf === 'MA' ? 'Maranhão'
    : NORTE.has(uf) ? 'Norte' : NORDESTE.has(uf) ? 'Nordeste' : SUDESTE.has(uf) ? 'Sudeste'
        : CENTRO_OESTE.has(uf) ? 'Centro-Oeste' : SUL.has(uf) ? 'Sul' : '—'
const REGRAS = {
    'Douglas': 'Norte + Maranhão',
    'Fábio Mena': 'Nordeste (exc. MA) + Sudeste',
    'Leozinho': 'Centro-Oeste + Sul',
}

// ── Colunas: as do relatório padrão + termômetro e UF/Zona ───────────────────
const GARGALO_LABEL = {
    valor: 'Valor percebido', confianca: 'Confiança', facilidade: 'Facilidade',
    momento: 'Momento', progresso: 'Progresso', atrito: 'Atrito restante',
}
const COLS = [
    { h: 'Prioridade', k: 'score', w: 11 },
    { h: '🔥', k: 'peixe', w: 5 },
    { h: 'Prontidão', k: 'prontidao', w: 11 },
    { h: 'Gargalo', k: 'gargalo', w: 15 },
    { h: 'Nome', k: 'nome', w: 26 },
    { h: 'WhatsApp', k: 'wa', w: 22 },
    { h: 'UF', k: 'uf', w: 6 },
    { h: 'Zona', k: 'zona', w: 13 },
    { h: 'Cidade', k: 'cidade', w: 16 },
    { h: 'Cabeças', k: 'cab', w: 10 },
    { h: 'Interesse', k: 'interesse', w: 20 },
    { h: 'Nível (IA)', k: 'nivel', w: 12 },
    { h: 'Etapa', k: 'stage', w: 19 },
    { h: 'MQL', k: 'mql', w: 7 },
    { h: 'Tem I.E.', k: 'ie', w: 9 },
    { h: 'Msgs lead', k: 'nIn', w: 10 },
    { h: 'Docs', k: 'docs', w: 15 },
    { h: 'Resumo da conversa (IA)', k: 'resumo', w: 58 },
    { h: 'Sinais de compra (IA)', k: 'sinais', w: 32 },
    { h: 'Objeções (IA)', k: 'objecoes', w: 26 },
    { h: 'Próxima ação (IA)', k: 'proxima', w: 38 },
    { h: 'Última interação', k: 'ultima', w: 14 },
]

function scoreDe(c) {
    const l = c.lead || {}
    const xd = l.extra_data || {}
    // Snapshot gravado pelo concierge (pós-18/07) tem prioridade; para conversa
    // anterior ao termômetro, computa a MESMA equação com os dados atuais.
    const ls = xd.lead_score
    if (ls && typeof ls.prob === 'number') return { ...ls, estimado: false }
    const calc = computeLeadScore({
        interesse: strv(l.interesse_principal) || strv(l.interesse) || strv(l.o_que_busca) || null,
        objetivo: strv(xd.objetivo_compra_resumido) || null,
        urgencia: strv(xd.urgencia_compra) || null,
        msgsLead: c.nIn || 0,
        cpfPresente: strv(l.cpf).replace(/\D/g, '').length === 11,
        docsRecebidos: c.doc?.count || 0,
        aceitouAssessoria: xd.aceitou_assessoria === true,
        objecaoTipo: strv(xd.objecao_tipo) || null,
        retomadaCombinada: Boolean(xd.retomada_combinada_at),
        checklist: null,
    })
    return { ...calc, estimado: true }
}

function rowAssessor(c) {
    const base = rowFor(c, { semIa })
    const ls = scoreDe(c)
    return {
        ...base,
        prontidao: `${Math.round(ls.prob * 100)}%${ls.estimado ? '*' : ''}`,
        gargalo: ls.gargalo ? (GARGALO_LABEL[ls.gargalo] || ls.gargalo) : '—',
        uf: c._uf || '—',
        zona: c._zona || '—',
        cidade: strv(c.lead?.cidade),
        _probNum: ls.prob,
    }
}

function styleLeads(ws, rows) {
    ws.columns = COLS.map((c) => ({ header: c.h, key: c.k, width: c.w }))
    const head = ws.getRow(1)
    head.height = 26
    head.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.INK } }
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' }
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        cell.border = { bottom: { style: 'medium', color: { argb: PALETTE.GOLD } } }
    })
    rows.forEach((r, i) => {
        const row = ws.addRow(r)
        row.height = 42
        const zebra = i % 2 === 1
        row.eachCell((cell) => {
            cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
            if (zebra && !r.peixe) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.ZEBRA } }
            cell.border = { bottom: { style: 'hairline', color: { argb: 'FFDDDDDD' } } }
        })
        if (r.peixe) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.GOLD_SOFT } } })
        for (const key of ['score', 'peixe', 'prontidao', 'gargalo', 'uf', 'zona', 'cab', 'nivel', 'mql', 'ie', 'nIn', 'ultima']) {
            row.getCell(key).alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
        }
        row.getCell('score').font = { bold: true, size: 12 }
        row.getCell('prontidao').font = { bold: true }
        const nv = row.getCell('nivel')
        if (r.nivel === 'Quente') { nv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.HOT } }; nv.font = { bold: true } }
        else if (r.nivel === 'Morno') nv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.WARM } }
        else if (r.nivel === 'Sem interesse') nv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.RED } }
        const waCell = row.getCell('wa')
        if (r.wa?.hyperlink) waCell.font = { color: { argb: 'FF1155CC' }, underline: true }
    })
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS.length } }
    ws.views = [{ state: 'frozen', xSplit: 5, ySplit: 1 }]
    const last = ws.rowCount
    if (last > 1) {
        ws.addConditionalFormatting({
            ref: `A2:A${last}`,
            rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 100 }], color: { argb: PALETTE.GOLD }, gradient: false }],
        })
    }
}

// Capa de cada arquivo: quem é, regra da zona, totais e os 3 primeiros da fila.
function abaCapa(wb, nome, arr, regra) {
    const ws = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] })
    ws.columns = [{ width: 30 }, { width: 60 }]
    const title = ws.addRow([`LEADS PRIORITÁRIOS — ${nome.toUpperCase()}`])
    title.height = 30
    ws.mergeCells(1, 1, 1, 2)
    title.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
    title.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.INK } }
    title.getCell(1).border = { bottom: { style: 'medium', color: { argb: PALETTE.GOLD } } }
    title.getCell(1).alignment = { vertical: 'middle', indent: 1 }
    const linhas = [
        ['Zona de atuação', regra],
        ['Gerado em', new Date().toLocaleString('pt-BR')],
        ['Leads na planilha', String(arr.length)],
        ['Cabeças somadas', arr.reduce((a, c) => a + (c.cab || 0), 0).toLocaleString('pt-BR')],
        ['Quentes (IA)', String(arr.filter((c) => c.nivel === 'Quente').length)],
        ['MQL', String(arr.filter((c) => c.lead?.is_mql).length)],
        ['', ''],
        ['COMECE POR AQUI', 'Os 3 primeiros da fila (maior prioridade + prontidão):'],
    ]
    for (const [a, b] of linhas) {
        const r = ws.addRow([a, b])
        if (a && b && a !== 'COMECE POR AQUI') { r.getCell(1).font = { bold: true } }
        if (a === 'COMECE POR AQUI') {
            r.getCell(1).font = { bold: true, color: { argb: 'FF9A6A00' } }
        }
    }
    for (const c of arr.slice(0, 3)) {
        const base = rowAssessor(c)
        const r = ws.addRow([`${base.nome} (${base.uf})`, `${base.prontidao} pronto · ${base.cab || '?'} cabeças · ${strv(c.ia?.proxima_acao) || 'ver planilha'}`])
        r.getCell(1).font = { bold: true }
        r.getCell(2).alignment = { wrapText: true }
        r.height = 30
        r.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.GOLD_SOFT } } })
    }
    ws.addRow([])
    ws.addRow(['Como usar', 'Aba "Leads": ordenada por prioridade. Coluna WhatsApp tem link direto. "Próxima ação (IA)" diz o que fazer com cada um. Filtros ativos no cabeçalho. Prontidão com * = estimada pela equação (conversa anterior ao termômetro).'])
        .getCell(2).alignment = { wrapText: true }
}

// ── Execução ─────────────────────────────────────────────────────────────────
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

const hoje = new Date().toISOString().slice(0, 10)
const pasta = path.join(os.homedir(), 'Desktop', `Leads-Prioritarios-por-Assessor-${hoje}`)
fs.mkdirSync(pasta, { recursive: true })

async function arquivoAssessor(nome, arr, regra) {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Bula Assessoria'
    wb.created = new Date()
    // fila: prioridade da conversa → prontidão do termômetro → porte
    const ordenado = [...arr].sort((a, b) => {
        const pa = rowAssessor(a)._probNum, pb = rowAssessor(b)._probNum
        return b.score - a.score || pb - pa || (b.cab || 0) - (a.cab || 0)
    })
    abaCapa(wb, nome, ordenado, regra)
    const ws = wb.addWorksheet('Leads', { views: [{ showGridLines: false }] })
    styleLeads(ws, ordenado.map(rowAssessor))
    const slug = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-')
    const file = path.join(pasta, `${slug}.xlsx`)
    await wb.xlsx.writeFile(file)
    return file
}

console.log('→ Gerando arquivos…')
for (const nome of ['Douglas', 'Fábio Mena', 'Leozinho']) {
    const f = await arquivoAssessor(nome, grupos[nome], REGRAS[nome])
    console.log(`   ${nome.padEnd(12)} ${String(grupos[nome].length).padStart(3)} leads → ${path.basename(f)}`)
}
if (adefinir.length) {
    const f = await arquivoAssessor('A definir', adefinir, 'UF não identificada — distribuir manualmente')
    console.log(`   ${'A definir'.padEnd(12)} ${String(adefinir.length).padStart(3)} leads → ${path.basename(f)}`)
}
console.log(`\n✅ Pasta pronta: ${pasta}`)
