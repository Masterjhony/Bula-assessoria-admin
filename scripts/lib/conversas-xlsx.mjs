/**
 * Apresentação .xlsx compartilhada das conversas (colunas, cores, formatação).
 * Usado pelo resumo geral e pela divisão por assessor, pra manter o mesmo visual.
 */
import { strv } from './conversas-core.mjs'

export const PALETTE = {
    INK: 'FF141414',       // preto grafite (cabeçalho)
    GOLD: 'FFC9A84C',      // dourado fosco do brandbook (acento cirúrgico)
    ZEBRA: 'FFF5F5F3',
    GOLD_SOFT: 'FFFBF3DA',
    HOT: 'FFF3D9A6',
    WARM: 'FFEFE4C4',
    RED: 'FFF3C6C6',
}

export const COLS = [
    { h: 'Prioridade', k: 'score', w: 11 },
    { h: '🔥', k: 'peixe', w: 5 },
    { h: 'Nome', k: 'nome', w: 26 },
    { h: 'WhatsApp', k: 'wa', w: 22 },
    { h: 'Cidade/UF', k: 'local', w: 18 },
    { h: 'Cabeças', k: 'cab', w: 10 },
    { h: 'Interesse', k: 'interesse', w: 22 },
    { h: 'Nível (IA)', k: 'nivel', w: 13 },
    { h: 'Etapa', k: 'stage', w: 20 },
    { h: 'MQL', k: 'mql', w: 7 },
    { h: 'Tem I.E.', k: 'ie', w: 9 },
    { h: 'Msgs lead', k: 'nIn', w: 10 },
    { h: 'Msgs Bula', k: 'nOut', w: 10 },
    { h: 'Docs', k: 'docs', w: 16 },
    { h: 'Resumo da conversa (IA)', k: 'resumo', w: 60 },
    { h: 'Sinais de compra (IA)', k: 'sinais', w: 34 },
    { h: 'Objeções (IA)', k: 'objecoes', w: 28 },
    { h: 'Próxima ação (IA)', k: 'proxima', w: 40 },
    { h: 'Última interação', k: 'ultima', w: 15 },
    { h: 'Origem/Campanha', k: 'origem', w: 24 },
]

export function rowFor(c, { semIa = false } = {}) {
    const l = c.lead || {}, ia = c.ia || {}
    const foneRaw = strv(l.celular) || strv(l.telefone) || strv(c.phone)
    const foneDig = foneRaw.replace(/\D/g, '')
    const wa = foneDig ? `https://wa.me/${foneDig.startsWith('55') ? foneDig : '55' + foneDig}` : ''
    const local = [strv(l.cidade), strv(l.estado)].filter(Boolean).join('/')
    const interesse = strv(l.interesse_principal) || strv(l.interesse) || strv(l.o_que_busca)
    const docsTxt = c.doc.count ? `${c.doc.count} (${[...c.doc.tipos].join(', ')})` : '—'
    const ultima = strv(l.last_whatsapp_at) || strv(c.list.at(-1)?.created_at)
    return {
        score: c.score,
        peixe: c.peixe ? '🔥' : '',
        nome: strv(l.nome) || c.name || '(sem nome)',
        wa: { text: foneRaw || '—', hyperlink: wa || undefined },
        local,
        cab: c.cab || '',
        interesse,
        nivel: c.nivel || (semIa ? '—' : ''),
        stage: c.stage,
        mql: l.is_mql ? 'Sim' : '',
        ie: c.temIe ? 'Sim' : 'Não',
        nIn: c.nIn,
        nOut: c.nOut,
        docs: docsTxt,
        resumo: strv(ia.resumo) || (ia._erro ? '(falha IA)' : ''),
        sinais: strv(ia.sinais_compra),
        objecoes: strv(ia.objecoes),
        proxima: strv(ia.proxima_acao),
        ultima: ultima ? ultima.slice(0, 10) : '',
        origem: [strv(l.origem) || strv(l.source), strv(l.campaign)].filter(Boolean).join(' · '),
    }
}

/** Formata uma worksheet (cabeçalho fixo, filtros, zebra, destaque de peixe). */
export function styleSheet(ws, rows) {
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
        for (const key of ['score', 'peixe', 'cab', 'nivel', 'mql', 'ie', 'nIn', 'nOut', 'ultima']) {
            row.getCell(key).alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
        }
        row.getCell('score').font = { bold: true, size: 12 }
        const nv = row.getCell('nivel')
        if (r.nivel === 'Quente') { nv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.HOT } }; nv.font = { bold: true } }
        else if (r.nivel === 'Morno') nv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.WARM } }
        else if (r.nivel === 'Sem interesse') nv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PALETTE.RED } }
        const waCell = row.getCell('wa')
        if (r.wa?.hyperlink) waCell.font = { color: { argb: 'FF1155CC' }, underline: true }
    })
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS.length } }
    ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }]
    const last = ws.rowCount
    if (last > 1) {
        ws.addConditionalFormatting({
            ref: `A2:A${last}`,
            rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 100 }], color: { argb: PALETTE.GOLD }, gradient: false }],
        })
    }
}
