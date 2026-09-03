/**
 * Estilo dos workbooks da Bula — tokens e helpers de grade para ExcelJS.
 *
 * Brandbook: preto #0A0A0A, cinzas e branco. O dourado #C9A84C entra só como
 * fio (capa, topo da aba, marcador de atenção) — dourado decorativo foi
 * rejeitado pelo chefe em 01/07. Tipografia Segoe UI (o Oswald do brandbook
 * não está instalado nas máquinas).
 *
 * Nasceu em scripts/xlsx-fechamento-agosto-2026.mjs, onde o padrão foi
 * desenhado; aqui vira peça reutilizável.
 *
 * ⚠ UMA TABELA POR GRADE DE COLUNAS. Largura é propriedade da COLUNA, não da
 * tabela: dois blocos com larguras diferentes na mesma aba fazem o segundo
 * apagar a grade do primeiro. Quando a aba tiver dois blocos, o segundo passa
 * `larguras: false` e reusa a grade.
 */
import ExcelJS from 'exceljs'

export const FONTE = 'Segoe UI'
export const PRETO = 'FF0A0A0A', GRAFITE = 'FF3A3A3A', CINZA = 'FF6B6B6B'
export const ZEBRA = 'FFFAFAFA', BANDA = 'FFEFEFEF', LINHA = 'FFE2E2E2'
export const DOURADO = 'FFC9A84C', DOURADO_CLARO = 'FFFBF6E9'
export const VERDE = 'FF2C6539', VERDE_CLARO = 'FFEDF4EE'
export const VERMELHO = 'FF9C2E27', VERMELHO_CLARO = 'FFFBEDEC'
export const MOEDA = '#,##0.00;-#,##0.00'
export const MOEDA_RS = 'R$ #,##0.00;-R$ #,##0.00'
export const MOEDA0 = '#,##0'
export const PCT = '0.00%'
export const PCT0 = '0%'
export const INT = '#,##0'

export const T = {
    marca: { name: FONTE, size: 9, bold: true, color: { argb: DOURADO } },
    titulo: { name: FONTE, size: 20, bold: true, color: { argb: 'FFFFFFFF' } },
    h1: { name: FONTE, size: 11, bold: true, color: { argb: PRETO } },
    th: { name: FONTE, size: 9, bold: true, color: { argb: 'FFFFFFFF' } },
    td: { name: FONTE, size: 10, color: { argb: PRETO } },
    tdMuted: { name: FONTE, size: 9.5, color: { argb: CINZA } },
    total: { name: FONTE, size: 10, bold: true, color: { argb: PRETO } },
    atencao: { name: FONTE, size: 9.5, bold: true, color: { argb: 'FF8A6D1F' } },
    kpiLabel: { name: FONTE, size: 8.5, bold: true, color: { argb: CINZA } },
    kpiValor: { name: FONTE, size: 18, bold: true, color: { argb: PRETO } },
    kpiNota: { name: FONTE, size: 8.5, color: { argb: CINZA } },
}

export const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
export const bordaBase = { bottom: { style: 'hair', color: { argb: LINHA } } }
export const colLetra = i => { let s = '', n = i; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26 } return s }

export function novoWorkbook(titulo) {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Bula Assessoria'
    wb.created = new Date()
    wb.title = titulo
    return wb
}

export const novaAba = (wb, nome) => wb.addWorksheet(nome, { views: [{ showGridLines: false }] })

/** Faixa preta no topo da aba com fio dourado. Devolve a linha do conteúdo. */
export function cabecalho(ws, titulo, subtitulo, nCols) {
    const fim = colLetra(nCols)
    ws.mergeCells(`A1:${fim}1`); ws.mergeCells(`A2:${fim}2`); ws.mergeCells(`A3:${fim}3`)
    const t = ws.getCell('A1')
    t.value = titulo.toUpperCase()
    t.font = { name: FONTE, size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
    t.alignment = { vertical: 'middle', indent: 1 }
    const s = ws.getCell('A2')
    s.value = subtitulo
    s.font = { name: FONTE, size: 9, color: { argb: 'FFDADADA' } }
    s.alignment = { vertical: 'middle', indent: 1, wrapText: true }
    for (let c = 1; c <= nCols; c++) {
        ws.getCell(1, c).fill = fill(PRETO)
        ws.getCell(2, c).fill = fill(PRETO)
        ws.getCell(3, c).fill = fill(DOURADO)
    }
    ws.getRow(1).height = 26; ws.getRow(2).height = 16; ws.getRow(3).height = 3; ws.getRow(4).height = 7
    return 5
}

/** Título de bloco dentro da aba. */
export function bloco(ws, linha, texto, nCols) {
    ws.mergeCells(`A${linha}:${colLetra(nCols)}${linha}`)
    const c = ws.getCell(`A${linha}`)
    c.value = texto.toUpperCase(); c.font = T.h1
    c.alignment = { vertical: 'middle', indent: 1 }
    for (let k = 1; k <= nCols; k++) ws.getCell(linha, k).border = { bottom: { style: 'thin', color: { argb: PRETO } } }
    ws.getRow(linha).height = 22
    return linha + 1
}

/**
 * Tabela. `cols` = [{ t, k, w, fmt, al: 'r'|'c', wrap, muted }].
 * Linha com `__total` fecha o bloco; `__destaque` pinta de dourado claro;
 * `__cor` ('verde'|'vermelho') pinta a linha inteira.
 * `opts.larguras:false` reusa a grade já definida na aba.
 */
export function tabela(ws, linha, cols, linhas, opts = {}) {
    const head = ws.getRow(linha)
    cols.forEach((c, i) => {
        const cell = head.getCell(i + 1)
        cell.value = c.t
        cell.font = T.th
        cell.fill = fill(PRETO)
        cell.alignment = { vertical: 'middle', horizontal: c.al === 'r' ? 'right' : (c.al === 'c' ? 'center' : 'left'), wrapText: true, indent: c.al ? 0 : 1 }
    })
    head.height = opts.alturaCabecalho ?? 28
    if (opts.larguras !== false) cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.w })

    let r = linha
    linhas.forEach((item, idx) => {
        r++
        const row = ws.getRow(r)
        const ehTotal = !!item.__total
        if (item.__altura) row.height = item.__altura
        cols.forEach((c, i) => {
            const cell = row.getCell(i + 1)
            const v = item[c.k]
            cell.value = v === undefined || v === '' ? null : v
            const atencao = typeof v === 'string' && /^(ATENÇÃO|SIM|não bate|sem comprovante)$/i.test(v)
            cell.font = ehTotal ? T.total : (atencao ? T.atencao : (c.muted ? T.tdMuted : T.td))
            if (c.fmt && (typeof v === 'number' || (v && typeof v === 'object' && v.formula))) cell.numFmt = c.fmt
            cell.alignment = {
                vertical: 'top', horizontal: c.al === 'r' ? 'right' : (c.al === 'c' ? 'center' : 'left'),
                wrapText: c.wrap !== false, indent: c.al ? 0 : 1,
            }
            cell.border = ehTotal
                ? { top: { style: 'thin', color: { argb: PRETO } }, bottom: { style: 'hair', color: { argb: LINHA } } }
                : bordaBase
            if (ehTotal) cell.fill = fill(BANDA)
            else if (item.__cor === 'verde') cell.fill = fill(VERDE_CLARO)
            else if (item.__cor === 'vermelho') cell.fill = fill(VERMELHO_CLARO)
            else if (item.__destaque) cell.fill = fill(DOURADO_CLARO)
            else if (idx % 2) cell.fill = fill(ZEBRA)
        })
    })

    if (opts.filtro !== false && linhas.length > 3) ws.autoFilter = { from: { row: linha, column: 1 }, to: { row: r, column: cols.length } }
    if (opts.congela !== false) ws.views = [{ state: 'frozen', xSplit: opts.congelaCol ?? 0, ySplit: linha, topLeftCell: `${colLetra((opts.congelaCol ?? 0) + 1)}${linha + 1}`, showGridLines: false, activeCell: 'A1' }]
    return r + 1
}

/** Parágrafo de rodapé/observação da aba. */
export function nota(ws, linha, texto, nCols) {
    ws.mergeCells(`A${linha}:${colLetra(nCols)}${linha}`)
    const c = ws.getCell(`A${linha}`)
    c.value = texto
    c.font = T.tdMuted
    c.alignment = { vertical: 'top', wrapText: true, indent: 1 }
    const largura = Array.from({ length: nCols }, (_, i) => ws.getColumn(i + 1).width || 8).reduce((a, b) => a + b, 0)
    ws.getRow(linha).height = Math.max(16, Math.ceil(texto.length / Math.max(40, largura)) * 13)
    return linha + 2
}

/** Caixa de destaque (fundo dourado claro, fio dourado à esquerda). */
export function caixa(ws, linha, titulo, texto, nCols) {
    const fim = colLetra(nCols)
    ws.mergeCells(`A${linha}:${fim}${linha}`)
    ws.mergeCells(`A${linha + 1}:${fim}${linha + 1}`)
    const t = ws.getCell(`A${linha}`)
    t.value = titulo.toUpperCase(); t.font = { name: FONTE, size: 9.5, bold: true, color: { argb: 'FF8A6D1F' } }
    t.alignment = { vertical: 'middle', indent: 1 }
    const c = ws.getCell(`A${linha + 1}`)
    c.value = texto; c.font = { name: FONTE, size: 10, color: { argb: GRAFITE } }
    c.alignment = { vertical: 'top', wrapText: true, indent: 1 }
    const largura = Array.from({ length: nCols }, (_, i) => ws.getColumn(i + 1).width || 8).reduce((a, b) => a + b, 0)
    ws.getRow(linha).height = 18
    ws.getRow(linha + 1).height = Math.max(16, Math.ceil(texto.length / Math.max(40, largura)) * 13.5)
    for (let k = 1; k <= nCols; k++) for (const r of [linha, linha + 1]) {
        ws.getCell(r, k).fill = fill(DOURADO_CLARO)
        if (k === 1) ws.getCell(r, k).border = { left: { style: 'medium', color: { argb: DOURADO } } }
    }
    return linha + 3
}

/**
 * Bloco secundário dentro de uma aba que já tem grade definida: rótulo na
 * coluna A, texto mesclado no miolo e (opcional) valor na última coluna.
 * Existe porque largura é propriedade da COLUNA — uma segunda tabela com
 * larguras próprias apagaria a grade da primeira.
 */
export function listaMerge(ws, linha, itens, nCols, opts = {}) {
    const temValor = itens.some(i => i.valor !== undefined && i.valor !== null)
    const cTexto = 2
    const cTextoFim = temValor ? nCols - 1 : nCols
    const larguraTexto = Array.from({ length: cTextoFim - cTexto + 1 }, (_, i) => ws.getColumn(cTexto + i).width || 8).reduce((a, b) => a + b, 0)
    let r = linha
    itens.forEach((item, idx) => {
        ws.mergeCells(r, cTexto, r, cTextoFim)
        const a = ws.getCell(r, 1)
        a.value = item.rotulo
        a.font = { name: FONTE, size: 9.5, bold: true, color: { argb: PRETO } }
        a.alignment = { vertical: 'top', wrapText: true, indent: 1 }
        const b = ws.getCell(r, cTexto)
        b.value = item.texto
        b.font = { name: FONTE, size: 9.5, color: { argb: GRAFITE } }
        b.alignment = { vertical: 'top', wrapText: true, indent: 1 }
        if (temValor) {
            const v = ws.getCell(r, nCols)
            v.value = item.valor ?? null
            if (opts.fmt) v.numFmt = opts.fmt
            v.font = { name: FONTE, size: 10, bold: true, color: { argb: PRETO } }
            v.alignment = { vertical: 'top', horizontal: 'right' }
        }
        for (let k = 1; k <= nCols; k++) {
            const cell = ws.getCell(r, k)
            cell.border = bordaBase
            if (idx % 2) cell.fill = fill(ZEBRA)
        }
        ws.getRow(r).height = Math.max(16, Math.ceil(item.texto.length / Math.max(40, larguraTexto * 1.05)) * 13.5)
        r++
    })
    return r + 1
}

export function impressao(ws, { paisagem = true, repetir, rodape } = {}) {
    ws.pageSetup = {
        orientation: paisagem ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        paperSize: 9, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
        printTitlesRow: repetir,
    }
    if (rodape) ws.headerFooter = { oddFooter: `&L&"${FONTE},Regular"&8${rodape}&R&"${FONTE},Regular"&8&P/&N` }
}
