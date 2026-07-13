/**
 * RESUMO GERAL DAS CONVERSAS DO ATENDIMENTO (WhatsApp / concierge IA)
 * ------------------------------------------------------------------
 * Varre todas as conversas reais do sistema (leads que de fato responderam),
 * cruza com a qualificação do CRM (cabeças, I.E., interesse, etapa, documentos)
 * e usa a IA para resumir cada conversa + classificar o nível de interesse.
 * Calcula um SCORE DE PRIORIDADE por lead pra separar os "peixes grandes".
 *
 * Saída: planilha .xlsx na Área de Trabalho, com 3 abas:
 *   1) Conversas        — tudo, ranqueado por prioridade
 *   2) 🔥 Peixes Grandes — só os quentes/grandes
 *   3) Panorama         — números gerais
 *
 *   node scripts/gera-resumo-conversas-atendimento.mjs
 *   node scripts/gera-resumo-conversas-atendimento.mjs --sem-ia   # pula a IA (rápido)
 *   node scripts/gera-resumo-conversas-atendimento.mjs --max 100  # limita conversas
 */
import path from 'node:path'
import os from 'node:os'
import ExcelJS from 'exceljs'
import { coletaConversas, strv } from './lib/conversas-core.mjs'
import { PALETTE, styleSheet, rowFor } from './lib/conversas-xlsx.mjs'

const args = process.argv.slice(2)
const semIa = args.includes('--sem-ia')
const max = Number((args[args.indexOf('--max') + 1]) || 0) || 0

const { conversas } = await coletaConversas({ semIa, max, log: (s) => console.log(s) })

console.log('→ Gerando planilha…')
const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria'
wb.created = new Date()

const wsAll = wb.addWorksheet('Conversas', { views: [{ showGridLines: false }] })
styleSheet(wsAll, conversas.map((c) => rowFor(c, { semIa })))

const peixes = conversas.filter((c) => c.peixe)
const wsPeixe = wb.addWorksheet('🔥 Peixes Grandes', { views: [{ showGridLines: false }] })
styleSheet(wsPeixe, peixes.map((c) => rowFor(c, { semIa })))

// ── Panorama ─────────────────────────────────────────────────────────────────
const wsP = wb.addWorksheet('Panorama', { views: [{ showGridLines: false }] })
wsP.columns = [{ width: 42 }, { width: 22 }]
const cont = (fn) => conversas.filter(fn).length
const totalCab = conversas.reduce((a, c) => a + (c.cab || 0), 0)
const panor = [
    ['PANORAMA DAS CONVERSAS DO ATENDIMENTO', ''],
    ['Gerado em', new Date().toLocaleString('pt-BR')],
    ['', ''],
    ['Conversas reais (lead respondeu)', conversas.length],
    ['🔥 Peixes grandes', peixes.length],
    ['Leads MQL (≥100 cabeças + I.E.)', cont((c) => c.lead?.is_mql)],
    ['', ''],
    ['Nível QUENTE', cont((c) => c.nivel === 'Quente')],
    ['Nível MORNO', cont((c) => c.nivel === 'Morno')],
    ['Nível FRIO', cont((c) => c.nivel === 'Frio')],
    ['Sem interesse', cont((c) => c.nivel === 'Sem interesse')],
    ['', ''],
    ['Com documentos enviados', cont((c) => c.doc.count > 0)],
    ['Com I.E.', cont((c) => c.temIe)],
    ['Etapa Cadastro', cont((c) => c.stage === 'Cadastro')],
    ['Etapa Informações Captadas', cont((c) => c.stage === 'Informações Captadas')],
    ['', ''],
    ['Total de cabeças (soma declarada)', totalCab.toLocaleString('pt-BR')],
    ['Conversa mais engajada (msgs do lead)', conversas.reduce((m, c) => Math.max(m, c.nIn), 0)],
]
panor.forEach((r, i) => {
    const row = wsP.addRow(r)
    if (i === 0) {
        row.height = 26
        row.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
        row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.INK } }
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.INK } }
        wsP.mergeCells(1, 1, 1, 2)
        row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' }
        row.getCell(1).border = { bottom: { style: 'medium', color: { argb: PALETTE.GOLD } } }
    } else {
        row.getCell(1).font = { bold: /^(Conversas reais|🔥|Nível QUENTE|Com documentos)/.test(String(r[0])) }
        row.getCell(2).font = { bold: true }
        row.getCell(2).alignment = { horizontal: 'right' }
    }
})

const hoje = new Date().toISOString().slice(0, 10)
const outPath = path.join(os.homedir(), 'Desktop', `Resumo-Conversas-Atendimento-${hoje}.xlsx`)
await wb.xlsx.writeFile(outPath)

console.log('\n✅ Planilha gerada:')
console.log('   ' + outPath)
console.log(`   ${conversas.length} conversas · ${peixes.length} peixes grandes`)
console.log('\nTop 10 por prioridade:')
for (const c of conversas.slice(0, 10)) {
    const l = c.lead || {}
    console.log(`   ${String(c.score).padStart(3)} ${c.peixe ? '🔥' : '  '} ${(strv(l.nome) || c.name || '?').slice(0, 28).padEnd(28)} ${String(c.cab || '').padStart(4)}cab ${c.nivel || ''}`)
}
