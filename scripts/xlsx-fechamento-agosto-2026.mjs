/**
 * Workbook formatado do fechamento de vendas — a apresentação, separada da apuração.
 *
 * Lê outputs/fechamento-agosto-2026/dados.json (gerado por
 * scripts/fechamento-agosto-2026-final.mjs) e monta o XLSX com estilo: capa
 * com índice clicável, cabeçalho preto fixo por aba, zebra, formato de moeda,
 * filtro, painel congelado e área de impressão. Nenhum número é calculado
 * aqui — se a conta mudar, muda no script da apuração, não neste.
 *
 * Brandbook: preto #0A0A0A, cinzas e branco. O dourado #C9A84C entra só como
 * fio na capa, no topo de cada aba e no marcador de atenção — o chefe rejeitou
 * dourado decorativo em 01/07 e o brandbook o permite como acento cirúrgico.
 * Tipografia: Segoe UI (o Oswald do brandbook não está instalado na máquina).
 *
 * ⚠ UMA TABELA POR GRADE DE COLUNAS. Largura é propriedade da COLUNA, não da
 * tabela: duas tabelas com larguras diferentes na mesma aba faziam a segunda
 * apagar a primeira (o "Observação" do Resumo virava uma tira de 14). Quando
 * uma aba tiver dois blocos, o segundo passa `larguras: false` e reusa a grade.
 *
 *   node scripts/xlsx-fechamento-agosto-2026.mjs [destino.xlsx]
 */
import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'

/* ── design tokens ───────────────────────────────────────────────────────── */
const FONTE = 'Segoe UI'
const PRETO = 'FF0A0A0A', GRAFITE = 'FF3A3A3A', CINZA = 'FF6B6B6B'
const ZEBRA = 'FFFAFAFA', BANDA = 'FFEFEFEF', LINHA = 'FFE2E2E2'
const DOURADO = 'FFC9A84C', DOURADO_CLARO = 'FFFBF6E9'
const MOEDA = '#,##0.00;-#,##0.00'
const MOEDA0 = '#,##0'
const PCT = '0.00%'
const INT = '#,##0'

const T = {
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
const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const bordaBase = { bottom: { style: 'hair', color: { argb: LINHA } } }
const colLetra = i => { let s = '', n = i; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26 } return s }

/* ── helpers ─────────────────────────────────────────────────────────────── */
/** Faixa preta no topo da aba com fio dourado. Devolve a linha do conteúdo. */
function cabecalho(ws, titulo, subtitulo, nCols) {
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
function bloco(ws, linha, texto, nCols) {
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
 * `opts.larguras:false` reusa a grade já definida na aba.
 */
function tabela(ws, linha, cols, linhas, opts = {}) {
    const head = ws.getRow(linha)
    cols.forEach((c, i) => {
        const cell = head.getCell(i + 1)
        cell.value = c.t
        cell.font = T.th
        cell.fill = fill(PRETO)
        cell.alignment = { vertical: 'middle', horizontal: c.al === 'r' ? 'right' : (c.al === 'c' ? 'center' : 'left'), wrapText: true, indent: c.al ? 0 : 1 }
    })
    head.height = 28
    if (opts.larguras !== false) cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.w })

    let r = linha
    linhas.forEach((item, idx) => {
        r++
        const row = ws.getRow(r)
        const ehTotal = !!item.__total
        cols.forEach((c, i) => {
            const cell = row.getCell(i + 1)
            const v = item[c.k]
            cell.value = v === undefined || v === '' ? null : v
            const atencao = typeof v === 'string' && /^(ATENÇÃO|SIM|não bate)$/i.test(v)
            cell.font = ehTotal ? T.total : (atencao ? T.atencao : (c.muted ? T.tdMuted : T.td))
            if (c.fmt && typeof v === 'number') cell.numFmt = c.fmt
            cell.alignment = {
                vertical: 'top', horizontal: c.al === 'r' ? 'right' : (c.al === 'c' ? 'center' : 'left'),
                wrapText: c.wrap !== false, indent: c.al ? 0 : 1,
            }
            cell.border = ehTotal
                ? { top: { style: 'thin', color: { argb: PRETO } }, bottom: { style: 'hair', color: { argb: LINHA } } }
                : bordaBase
            if (ehTotal) cell.fill = fill(BANDA)
            else if (item.__destaque) cell.fill = fill(DOURADO_CLARO)
            else if (idx % 2) cell.fill = fill(ZEBRA)
        })
    })

    if (opts.filtro !== false && linhas.length > 3) ws.autoFilter = { from: { row: linha, column: 1 }, to: { row: r, column: cols.length } }
    if (opts.congela !== false) ws.views = [{ state: 'frozen', xSplit: opts.congelaCol ?? 0, ySplit: linha, topLeftCell: `${colLetra((opts.congelaCol ?? 0) + 1)}${linha + 1}`, showGridLines: false, activeCell: 'A1' }]
    return r + 1
}

/** Parágrafo de rodapé da aba. */
function nota(ws, linha, texto, nCols) {
    ws.mergeCells(`A${linha}:${colLetra(nCols)}${linha}`)
    const c = ws.getCell(`A${linha}`)
    c.value = texto
    c.font = T.tdMuted
    c.alignment = { vertical: 'top', wrapText: true, indent: 1 }
    const largura = Array.from({ length: nCols }, (_, i) => ws.getColumn(i + 1).width || 8).reduce((a, b) => a + b, 0)
    ws.getRow(linha).height = Math.max(16, Math.ceil(texto.length / Math.max(40, largura)) * 13)
    return linha + 2
}

function impressao(ws, { paisagem = true, repetir } = {}) {
    ws.pageSetup = {
        orientation: paisagem ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        paperSize: 9, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
        printTitlesRow: repetir,
    }
    ws.headerFooter = { oddFooter: '&L&"Segoe UI,Regular"&8Bula Assessoria · Fechamento de Vendas · Agosto/2026&R&"Segoe UI,Regular"&8&P/&N' }
}

/* ── geração ─────────────────────────────────────────────────────────────── */
export async function geraWorkbook(d, destino) {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Bula Assessoria'
    wb.created = new Date()
    wb.title = 'Fechamento de Vendas — Agosto/2026'
    const dbr = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : ''
    const brl0 = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
    const t = d.totais
    const nova = nome => wb.addWorksheet(nome, { views: [{ showGridLines: false }] })
    const comVenda = d.eventos.filter(e => e.vgv > 0).length

    /* ═══ CAPA ═══════════════════════════════════════════════════════════ */
    const ws0 = wb.addWorksheet('CAPA', { properties: { tabColor: { argb: PRETO } }, views: [{ showGridLines: false }] })
    ws0.getColumn(1).width = 2
    for (let c = 2; c <= 9; c++) ws0.getColumn(c).width = 15.5
    for (let r = 2; r <= 4; r++) ws0.mergeCells(`B${r}:I${r}`)
    for (let r = 2; r <= 5; r++) for (let c = 2; c <= 9; c++) ws0.getCell(r, c).fill = fill(PRETO)
    const marca = ws0.getCell('B2'); marca.value = 'BULA ASSESSORIA'
    marca.font = T.marca; marca.alignment = { vertical: 'middle', indent: 2 }
    const tit = ws0.getCell('B3'); tit.value = 'FECHAMENTO DE VENDAS'
    tit.font = T.titulo; tit.alignment = { vertical: 'middle', indent: 2 }
    const per = ws0.getCell('B4'); per.value = 'Agosto de 2026 · consolidação de todas as fontes'
    per.font = { name: FONTE, size: 11, color: { argb: 'FFDADADA' } }; per.alignment = { vertical: 'middle', indent: 2 }
    ws0.getRow(2).height = 18; ws0.getRow(3).height = 32; ws0.getRow(4).height = 20; ws0.getRow(5).height = 5
    ws0.mergeCells('B6:I6')
    for (let c = 2; c <= 9; c++) ws0.getCell(6, c).fill = fill(DOURADO)
    ws0.getRow(6).height = 4

    let lr = 8
    const kpis = [
        ['VGV LÍQUIDO DE AGOSTO', t.liquido, MOEDA0, `${t.lotes_liquido} lotes · ${comVenda} leilões com venda`],
        ['VENDIDO BRUTO', t.bruto, MOEDA0, `${t.lotes} lotes · ${t.animais} animais`],
        ['CANCELADO', t.cancelado, MOEDA0, 'Matinha 16/08 · 3 lotes do José Fábio'],
        ['% DA AGENDA DIVULGADA', t.liquido / d.meta.agenda_divulgada, PCT, `meta 12% = ${brl0(d.meta.valor)} · bate`],
    ]
    kpis.forEach(([lab, val, fmt, obs], i) => {
        const c1 = 2 + i * 2
        for (const r of [lr, lr + 1, lr + 2]) ws0.mergeCells(r, c1, r, c1 + 1)
        const a = ws0.getCell(lr, c1); a.value = lab; a.font = T.kpiLabel; a.alignment = { indent: 1, vertical: 'middle' }
        const b = ws0.getCell(lr + 1, c1); b.value = val; b.numFmt = fmt; b.font = T.kpiValor; b.alignment = { indent: 1, vertical: 'middle' }
        const c = ws0.getCell(lr + 2, c1); c.value = obs; c.font = T.kpiNota; c.alignment = { indent: 1, vertical: 'top', wrapText: true }
        for (let r = lr; r <= lr + 2; r++) for (let k = c1; k <= c1 + 1; k++) {
            ws0.getCell(r, k).border = {
                top: r === lr ? { style: 'thin', color: { argb: PRETO } } : undefined,
                bottom: r === lr + 2 ? { style: 'hair', color: { argb: LINHA } } : undefined,
                left: k === c1 ? { style: 'medium', color: { argb: i === 0 ? DOURADO : LINHA } } : undefined,
            }
        }
    })
    ws0.getRow(lr).height = 16; ws0.getRow(lr + 1).height = 27; ws0.getRow(lr + 2).height = 26
    lr += 4

    const tituloCapa = (r, txt) => {
        ws0.mergeCells(`B${r}:I${r}`)
        const c = ws0.getCell(`B${r}`); c.value = txt.toUpperCase(); c.font = T.h1
        c.alignment = { vertical: 'middle', indent: 1 }
        for (let k = 2; k <= 9; k++) ws0.getCell(r, k).border = { bottom: { style: 'thin', color: { argb: PRETO } } }
        ws0.getRow(r).height = 21
        return r + 1
    }
    const textoCapa = (r, txt, forte = false) => {
        ws0.mergeCells(`B${r}:I${r}`)
        const c = ws0.getCell(`B${r}`); c.value = txt
        c.font = forte ? { name: FONTE, size: 10.5, bold: true, color: { argb: PRETO } } : { name: FONTE, size: 10, color: { argb: GRAFITE } }
        c.alignment = { vertical: 'top', wrapText: true, indent: 1 }
        ws0.getRow(r).height = Math.max(15, Math.ceil(txt.length / 108) * 14)
        return r + 1
    }

    lr = tituloCapa(lr, 'O número, em uma linha')
    lr = textoCapa(lr, `Vendemos R$ ${brl0(t.bruto)} e cancelamos R$ ${brl0(t.cancelado)}. O mês fecha em R$ ${brl0(t.liquido)}, com a meta de R$ ${brl0(d.meta.valor)} batida.`, true)
    lr = textoCapa(lr, `A conta: painel do HastaPro ${brl0(t.hp2)}, mais a cobertura nos pregões da Bula Remates ${brl0(t.hp01)}, mais ${brl0(t.fora)} que só existem fora do HastaPro, menos ${brl0(t.cancelado)} de cancelamento.`)
    lr++

    lr = tituloCapa(lr, 'O que tem neste arquivo')
    const indice = [
        ['RESUMO', 'Os totais e a escada que leva ao número, passo a passo.'],
        ['META', 'O realizado contra a meta em todas as leituras possíveis.'],
        ['POR LEILÃO', `Os ${d.eventos.length} eventos de agosto lado a lado nas quatro fontes.`],
        ['POR ASSESSOR', 'Quem vendeu, quem cancelou e de onde vem cada parcela.'],
        ['ATRIBUIÇÃO ABERTA', 'Lotes em que Rusa e assessor ainda não estão acertados.'],
        ['LOTE A LOTE', `Os ${t.lotes} lotes com comprador, cota, comissão do HastaPro e evidência.`],
        ['CANCELAMENTOS', 'O que saiu do mês, com a prova de cada baixa.'],
        ['PELA REMATES', 'Lotes da equipe em pregões da Remates que não entram no VGV.'],
        ['RECONCILIAÇÃO', 'Cada fonte fechando ao centavo, diferença por diferença.'],
        ['CONFIABILIDADE', 'Os testes rodados contra o banco e os riscos que sobram.'],
        ['RESOLVIDAS', 'As divergências que morreram, com a prova de cada uma.'],
        ['PENDÊNCIAS', 'O que falta decidir, com quem decide e quanto vale.'],
        ['PLANILHA DRIVE', 'A aba Leilões do FINANCEIRO BULA 2026 como foi lida.'],
        ['ERP', 'Os fechamentos de agosto no web-bula.'],
    ]
    for (const [aba, desc] of indice) {
        ws0.mergeCells(`C${lr}:I${lr}`)
        const a = ws0.getCell(`B${lr}`)
        a.value = { text: aba, hyperlink: `#'${aba}'!A1` }
        a.font = { name: FONTE, size: 9.5, bold: true, color: { argb: PRETO } }
        a.alignment = { vertical: 'middle', indent: 1 }
        const b = ws0.getCell(`C${lr}`)
        b.value = desc; b.font = T.tdMuted; b.alignment = { vertical: 'middle', indent: 1 }
        ws0.getRow(lr).height = 16
        lr++
    }
    lr++
    lr = tituloCapa(lr, 'Fontes e data de corte')
    for (const s of [
        `Gerado em ${new Date(d.geradoEm).toLocaleString('pt-BR')}. Período de 01 a 31 de agosto de 2026.`,
        'HastaPro, banco Firebird em modo somente leitura: LEILAO, LOTES, COMPRADORES, CONDICOES, ASSESSORIA, PRESTADORES e CLIENTES, filiais 2 e 01.',
        'ERP web-bula: bula_leilao_fechamento, bula_leiloes e erp_folha_estrutura.',
        'Planilha FINANCEIRO BULA 2026 no Drive, aba Leilões, versão de 02/09 às 16h46.',
        'WhatsApp pela sessão joao-automation: grupos Financeiro, Lances e Assessores, mais o print do Douglas e a planilha RUSA - AGOSTO do bucket de mídia.',
    ]) lr = textoCapa(lr, s)
    ws0.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } }

    /* ═══ RESUMO ═════════════════════════════════════════════════════════ */
    const ws1 = nova('RESUMO')
    let r1 = cabecalho(ws1, 'Resumo', 'Os totais do mês e a escada que leva ao número. A coluna Acumulado só aparece nos passos da escada.', 5)
    r1 = tabela(ws1, r1, [
        { t: 'Bloco', k: 'bloco', w: 15 },
        { t: 'Item', k: 'item', w: 66 },
        { t: 'Valor', k: 'valor', w: 16, fmt: MOEDA, al: 'r' },
        { t: 'Acumulado', k: 'acum', w: 16, fmt: MOEDA, al: 'r' },
        { t: 'Observação', k: 'obs', w: 60, muted: true },
    ], [
        { bloco: 'O NÚMERO', item: 'VGV LÍQUIDO DE AGOSTO', valor: t.liquido, obs: `${t.lotes_liquido} lotes · ${comVenda} leilões com venda`, __total: true },
        { bloco: '', item: 'Vendido bruto, antes do cancelamento', valor: t.bruto, obs: `${t.lotes} lotes · ${t.animais} animais` },
        { bloco: '', item: 'Cancelamento: Matinha 16/08, 3 lotes do José Fábio', valor: -t.cancelado, obs: 'Douglas em 02/09 às 12:52, único cancelamento das vendas dele' },
        ...d.escada.map(([p, v, a], i) => ({ bloco: i === 0 ? 'A ESCADA' : '', item: p, valor: v, acum: a })),
        { bloco: '', item: 'VGV LÍQUIDO DE AGOSTO', valor: null, acum: t.liquido, __total: true },
        { bloco: 'AS FONTES', item: 'Painel do HastaPro, filial 2', valor: t.hp2, obs: '27 leilões com venda, 128 lotes' },
        { bloco: '', item: 'Cobertura da Assessoria em pregões da Bula Remates', valor: t.hp01, obs: 'São Geraldo, Só Criador 18/08 e Genética São José' },
        { bloco: '', item: 'Fora do HastaPro, com ficha ou print mais segunda fonte', valor: t.fora, obs: 'Katispera 117.000 · Engenho da Serra 53.600 · Sabiá Dourado 629.700' },
        { bloco: '', item: 'ERP em 01/09, antes desta apuração', valor: t.erp_antes, obs: '32 fechamentos' },
        { bloco: '', item: 'ERP hoje', valor: t.erp_hoje, obs: `${d.erp.length} fechamentos. O Sabiá Dourado foi criado; o Matinha ainda está com os 3 lotes cancelados` },
        { bloco: '', item: 'Planilha FINANCEIRO BULA 2026, coluna Vendas Bula', valor: t.planilha, obs: 'lida em 02/09 às 16h46' },
        { bloco: 'EM ABERTO', item: 'LS Galeria, lote 18', valor: t.em_aberto.ls_galeria_lt18, obs: 'única ficha do mês sem par no sistema; pode estar faltando', __destaque: true },
        { bloco: '', item: 'Ventres VIP Matinha: x30 contra x40', valor: t.em_aberto.ventres_x40, obs: 'a leiloeira falou em 84.000 onde o HastaPro tem 63.000', __destaque: true },
        { bloco: '', item: 'Melhoradores: 2 lotes do M1', valor: t.em_aberto.m1, obs: 'comissão zero no HastaPro, por isso ficam fora', __destaque: true },
    ], { filtro: false })
    impressao(ws1, { paisagem: false })

    /* ═══ META ═══════════════════════════════════════════════════════════ */
    const wsM = nova('META')
    let rM = cabecalho(wsM, 'A meta, em todas as leituras', 'Meta de agosto definida pelo Marcelo: 12% de cobertura sobre a agenda divulgada de R$ 57.294.800', 5)
    rM = tabela(wsM, rM, [
        { t: 'Leitura', k: 'leitura', w: 66 },
        { t: 'VGV', k: 'vgv', w: 17, fmt: MOEDA, al: 'r' },
        { t: '% da agenda divulgada', k: 'pd', w: 15, fmt: PCT, al: 'r' },
        { t: '% da agenda completa', k: 'pc', w: 15, fmt: PCT, al: 'r' },
        { t: 'Meta R$ 6.876.000', k: 'bate', w: 16, al: 'c' },
    ], d.meta.leituras.map(l => ({
        leitura: l.leitura, vgv: l.vgv, pd: l.pct_divulgada / 100, pc: l.pct_completa / 100,
        bate: l.bate ? 'bate' : 'não bate', __destaque: /LÍQUIDO/.test(l.leitura),
    })), { filtro: false })
    nota(wsM, rM, 'Só a leitura do painel do HastaPro não bate, e é justamente a única que o fornecedor mostra hoje. Lançar o Sabiá Dourado, o Katispera e o Engenho da Serra no HastaPro resolve isso na origem. A agenda completa de R$ 68.024.400 inclui os dois leilões da Nelore Mafra, que ficam de fora do total divulgado porque as células estão como texto na planilha.', 5)
    impressao(wsM, { paisagem: false })

    /* ═══ POR LEILÃO ═════════════════════════════════════════════════════ */
    const ws2 = nova('POR LEILÃO')
    let r2 = cabecalho(ws2, 'Vendas por leilão', 'Valores brutos, antes do cancelamento. O Matinha 16/08 aparece com os 460.500 vendidos, dos quais 291.000 foram cancelados.', 11)
    const cabLeilao = r2
    r2 = tabela(ws2, r2, [
        { t: 'Data', k: 'data', w: 7, al: 'c' },
        { t: 'Leilão', k: 'leilao', w: 46 },
        { t: 'Leiloeira', k: 'leiloeira', w: 19, muted: true },
        { t: 'Fil.', k: 'filial', w: 6, al: 'c', muted: true },
        { t: 'VGV vendido', k: 'vgv', w: 15, fmt: MOEDA, al: 'r' },
        { t: 'Lotes', k: 'lotes', w: 7, fmt: INT, al: 'r' },
        { t: 'HastaPro', k: 'hp', w: 15, fmt: MOEDA, al: 'r' },
        { t: 'ERP', k: 'erp', w: 15, fmt: MOEDA, al: 'r' },
        { t: 'Planilha', k: 'plan', w: 15, fmt: MOEDA, al: 'r' },
        { t: 'Acordo na planilha', k: 'acordo', w: 21, muted: true },
        { t: 'Notas', k: 'notas', w: 62, muted: true },
    ], [
        ...d.eventos.map(e => ({
            data: dbr(e.data), leilao: e.nome, leiloeira: e.leiloeira, filial: e.filial ?? '',
            vgv: e.vgv || null, lotes: e.lotes || null, hp: e.hastapro_cobertura, erp: e.erp, plan: e.planilha,
            acordo: e.planilha_acordo, notas: e.notas.join(' · '),
            __destaque: /MATINHA EXPOGEN|SABI/i.test(e.nome),
        })),
        { data: '', leilao: 'TOTAL', vgv: t.bruto, lotes: t.lotes, hp: t.hastapro, erp: t.erp_hoje, plan: t.planilha, __total: true },
    ], { congelaCol: 2 })
    nota(ws2, r2, 'A coluna HastaPro traz a cobertura da Bula: na filial 01 apenas os lotes de pisteiro da equipe que não estavam na pista pela Remates. Os pregões inteiros da Remates em agosto somam São Geraldo 4.980.800, Só Criador 11/08 2.881.620, Só Criador 18/08 1.001.790, Melhoradores Corte 1.675.310, Genética São José 1.920.730 e Melhoradores 30 Anos 1.113.900.', 11)
    impressao(ws2, { repetir: `${cabLeilao}:${cabLeilao}` })

    /* ═══ POR ASSESSOR ═══════════════════════════════════════════════════ */
    const ws3 = nova('POR ASSESSOR')
    let r3 = cabecalho(ws3, 'Vendas por assessor', 'Como pisteiro é quem estava na pista. O VGV líquido aplica o direcionamento do Rusa como o Douglas listou na planilha RUSA - AGOSTO e desconta o cancelamento.', 10)
    r3 = tabela(ws3, r3, [
        { t: 'Assessor', k: 'assessor', w: 28 },
        { t: 'VGV líquido', k: 'liq', w: 16, fmt: MOEDA, al: 'r' },
        { t: '% do mês', k: 'pct', w: 10, fmt: PCT, al: 'r' },
        { t: 'Vendido', k: 'vend', w: 16, fmt: MOEDA, al: 'r' },
        { t: 'Cancelado', k: 'canc', w: 14, fmt: MOEDA, al: 'r' },
        { t: 'Lotes', k: 'lotes', w: 7, fmt: INT, al: 'r' },
        { t: 'Como pisteiro', k: 'pist', w: 16, fmt: MOEDA, al: 'r' },
        { t: 'Filial 2', k: 'hp2', w: 15, fmt: MOEDA, al: 'r' },
        { t: 'Remates, filial 01', k: 'hp01', w: 15, fmt: MOEDA, al: 'r' },
        { t: 'Fora do HastaPro', k: 'fora', w: 15, fmt: MOEDA, al: 'r' },
    ], [
        ...d.porAssessor.filter(a => a.final_vgv > 0 || a.pisteiro_vgv > 0).map(a => ({
            assessor: a.assessor, liq: a.liquido_vgv || null, pct: a.pct / 100, vend: a.final_vgv || null,
            canc: a.cancelado || null, lotes: a.lotes || null, pist: a.pisteiro_vgv || null,
            hp2: a.hp2 || null, hp01: a.hp01 || null, fora: a.fora || null, __destaque: !!a.cancelado,
        })),
        { assessor: 'TOTAL', liq: t.liquido, pct: 1, vend: t.bruto, canc: t.cancelado, lotes: t.lotes, pist: t.bruto, hp2: t.hp2, hp01: t.hp01, fora: t.fora, __total: true },
    ], { filtro: false })
    nota(ws3, r3, 'Como pisteiro mostra o total que passou pela mão da pessoa na pista, antes de aplicar o direcionamento do Rusa. Por isso o Douglas aparece com um número maior nessa coluna do que no VGV líquido, e o Rusa aparece com zero.', 10)
    impressao(ws3)

    /* ═══ ATRIBUIÇÃO ABERTA ══════════════════════════════════════════════ */
    const wsAt = nova('ATRIBUIÇÃO ABERTA')
    let rAt = cabecalho(wsAt, 'Atribuição em aberto', 'Não muda o total do mês, muda quem recebe a comissão', 7)
    rAt = tabela(wsAt, rAt, [
        { t: 'Data', k: 'data', w: 7, al: 'c' },
        { t: 'Leilão', k: 'leilao', w: 40 },
        { t: 'Lote', k: 'lote', w: 8, al: 'c' },
        { t: 'VGV', k: 'vgv', w: 16, fmt: MOEDA, al: 'r' },
        { t: 'Comprador', k: 'comprador', w: 32 },
        { t: 'Está no nome de', k: 'pist', w: 20 },
        { t: 'Por que está em aberto', k: 'obs', w: 54, muted: true },
    ], [
        ...d.rusaAberto.map(l => ({
            data: dbr(l.data), leilao: l.leilao, lote: l.lote, vgv: l.vgv,
            comprador: String(l.comprador || '').split(' · ')[0], pist: l.pisteiro,
            obs: 'Comprador da lista de direcionamento do Rusa que não aparece na planilha RUSA - AGOSTO do Douglas',
        })),
        { data: '', leilao: 'TOTAL EM DISPUTA', vgv: d.rusaAberto.reduce((s, l) => s + l.vgv, 0), __total: true },
    ], { filtro: false })
    nota(wsAt, rAt, 'O ERP já credita LS Galeria e Pérolas do Tapajós ao Rusa. O Marcelo pediu em 25/08 para separar as vendas do Rusa e do Douglas de uma vez. A regra vigente é que o comprador define o direcionamento, não quem anunciou na pista.', 7)
    impressao(wsAt)

    /* ═══ LOTE A LOTE ════════════════════════════════════════════════════ */
    const ws4 = nova('LOTE A LOTE')
    const contam = d.lotes.filter(l => l.conta)
    let r4 = cabecalho(ws4, 'Lote a lote', `Os ${contam.length} lotes que compõem o mês. Use o filtro do cabeçalho para isolar leilão, assessor ou fonte.`, 17)
    const cabLote = r4
    r4 = tabela(ws4, r4, [
        { t: 'Data', k: 'data', w: 7, al: 'c' },
        { t: 'Leilão', k: 'leilao', w: 42 },
        { t: 'Fil.', k: 'filial', w: 5, al: 'c', muted: true },
        { t: 'Fonte', k: 'fonte', w: 7, al: 'c', muted: true },
        { t: 'Lote', k: 'lote', w: 7, al: 'c' },
        { t: 'Qtd', k: 'qtd', w: 5, fmt: INT, al: 'r' },
        { t: 'Lance', k: 'lance', w: 11, fmt: MOEDA0, al: 'r' },
        { t: 'Parc.', k: 'parcelas', w: 6, fmt: INT, al: 'r' },
        { t: 'VGV', k: 'vgv', w: 14, fmt: MOEDA, al: 'r' },
        { t: 'Cancelado', k: 'canc', w: 10, al: 'c' },
        { t: 'Pisteiro', k: 'pisteiro', w: 20 },
        { t: 'Assessor final', k: 'final', w: 20 },
        { t: 'Comprador', k: 'comprador', w: 36 },
        { t: 'Direcionamento', k: 'dir', w: 22, muted: true },
        { t: 'Cota', k: 'cota', w: 6, al: 'c', muted: true },
        { t: '% com. HastaPro', k: 'com', w: 9, al: 'r', muted: true },
        { t: 'Observação', k: 'obs', w: 54, muted: true },
    ], contam.map(l => ({
        data: dbr(l.data), leilao: l.leilao, filial: l.filial, fonte: l.fonte, lote: l.lote, qtd: l.qtd || null,
        lance: l.lance || null, parcelas: l.parcelas || null, vgv: l.vgv, canc: l.cancelado ? 'SIM' : '',
        pisteiro: l.pisteiro, final: l.assessor_final, comprador: l.comprador,
        dir: l.rusa || l.rusa_aberto || '', cota: Number.isFinite(l.cota_lote) && l.cota_lote !== 100 ? l.cota_lote + '%' : '',
        com: l.com_hastapro == null ? '' : l.com_hastapro,
        obs: [l.rusa_obs, l.flag, l.cancelado, l.evidencia].filter(Boolean).join(' | '),
        __destaque: !!l.cancelado,
    })), { congelaCol: 2 })
    impressao(ws4, { repetir: `${cabLote}:${cabLote}` })

    /* ═══ CANCELAMENTOS ══════════════════════════════════════════════════ */
    const ws5 = nova('CANCELAMENTOS')
    let r5 = cabecalho(ws5, 'Cancelamentos', 'O que saiu do mês, com a fonte de cada baixa', 7)
    r5 = tabela(ws5, r5, [
        { t: 'Data', k: 'data', w: 7, al: 'c' },
        { t: 'Leilão', k: 'leilao', w: 44 },
        { t: 'Lote', k: 'lote', w: 7, al: 'c' },
        { t: 'VGV', k: 'vgv', w: 16, fmt: MOEDA, al: 'r' },
        { t: 'Comprador', k: 'comprador', w: 32 },
        { t: 'Estava com', k: 'pist', w: 18 },
        { t: 'Prova', k: 'prova', w: 66, muted: true },
    ], [
        ...d.cancelados.map(l => ({ data: dbr(l.data), leilao: l.leilao, lote: l.lote, vgv: l.vgv, comprador: l.comprador, pist: l.pisteiro, prova: l.cancelado })),
        { data: '', leilao: 'TOTAL CANCELADO', vgv: t.cancelado, __total: true },
    ], { filtro: false })
    r5 = nota(ws5, r5, 'No ERP o fechamento do Matinha ainda está com os três lotes: R$ 460.500 de VGV e R$ 19.200 de comissão. Aplicando o cancelamento vai para R$ 169.500 e R$ 4.650, com a comissão do Rusa caindo de 16.650 para 2.100. As contas a pagar abertas de Nane e Douglas são dos lotes que sobram e não mudam. Existe uma conta a receber aberta de R$ 27.375 calculada sobre o VGV antigo que precisa ser revista à parte. O script scripts/cancela-matinha-jose-fabio-2026-08-16.mjs faz a correção e roda em simulação por padrão.', 7)
    nota(ws5, r5, 'Não houve outro cancelamento em agosto. O pedido de desistência da Amanda Carla nos lotes 138, 140 e 141 do Ventres VIP Matinha, aberto em 02/09 às 12h05, foi encerrado às 16h09 com "Resolvido sem cancelamento". Lote defendido ou retirado no pregão já entra no HastaPro com valor zero e nunca chegou a contar: foram cinco em agosto.', 7)
    impressao(ws5)

    /* ═══ PELA REMATES ═══════════════════════════════════════════════════ */
    const ws6 = nova('PELA REMATES')
    const pr = d.lotes.filter(l => l.pela_remates)
    let r6 = cabecalho(ws6, 'Equipe na pista pela Bula Remates', 'Lotes vendidos por gente da equipe em pregões da própria Remates. Por decisão do João em 26/08 não entram no VGV da Assessoria.', 8)
    const cabRem = r6
    r6 = tabela(ws6, r6, [
        { t: 'Data', k: 'data', w: 7, al: 'c' },
        { t: 'Leilão', k: 'leilao', w: 46 },
        { t: 'Lote', k: 'lote', w: 7, al: 'c' },
        { t: 'Qtd', k: 'qtd', w: 5, fmt: INT, al: 'r' },
        { t: 'VGV', k: 'vgv', w: 16, fmt: MOEDA, al: 'r' },
        { t: 'Pisteiro', k: 'pist', w: 20 },
        { t: 'Comprador', k: 'comprador', w: 34 },
        { t: '% que a Remates paga', k: 'com', w: 13, al: 'r' },
    ], [
        ...pr.map(l => ({ data: dbr(l.data), leilao: l.leilao, lote: l.lote, qtd: l.qtd, vgv: l.vgv, pist: l.pisteiro, comprador: l.comprador, com: l.com_hastapro || '', __destaque: l.com_hastapro > 0 })),
        { data: '', leilao: 'TOTAL FORA DO VGV', vgv: pr.reduce((s, l) => s + l.vgv, 0), __total: true },
    ], { congelaCol: 2 })
    nota(ws6, r6, `Por pessoa: ${d.pelaRematesPorPessoa.map(([p, v]) => `${p} ${brl0(v)}`).join(' · ')}. A última coluna é o percentual que a Bula Remates paga ao pisteiro naquele lote, gravado na tabela ASSESSORIA do HastaPro. Nas ${d.qualidade.pela_remates_com_comissao.length} linhas em que ela está preenchida, a regra se confirma sozinha: quem recebe da Remates não é cobertura da Assessoria. Nas outras não há comissão por lote para ninguém, e nesses pregões a Bula recebe um percentual do faturamento inteiro.`, 8)
    impressao(ws6, { repetir: `${cabRem}:${cabRem}` })

    /* ═══ RECONCILIAÇÃO ══════════════════════════════════════════════════ */
    const ws7 = nova('RECONCILIAÇÃO')
    let r7 = cabecalho(ws7, 'Reconciliação das fontes', 'Cada fonte fecha ao centavo no vendido bruto. A diferença de cada uma tem nome.', 4)
    const rotulo = { hastapro: 'HASTAPRO', erp: 'ERP EM 01/09', planilha: 'PLANILHA DO DRIVE' }
    const linhasRecon = []
    for (const [k, rec] of Object.entries(d.recon)) {
        linhasRecon.push({ fonte: rotulo[k] || k.toUpperCase(), item: 'Total da fonte', valor: rec.total, __destaque: true })
        for (const [i, v] of rec.itens) linhasRecon.push({ fonte: '', item: i, valor: v })
        linhasRecon.push({ fonte: '', item: rec.fecha ? 'Fecha no vendido bruto, ao centavo' : 'NÃO FECHA', valor: rec.total + rec.soma, acum: t.bruto, __total: true })
        linhasRecon.push({ fonte: '', item: '' })
    }
    r7 = tabela(ws7, r7, [
        { t: 'Fonte', k: 'fonte', w: 20 },
        { t: 'Item', k: 'item', w: 96 },
        { t: 'Valor', k: 'valor', w: 17, fmt: MOEDA, al: 'r' },
        { t: 'Confere com', k: 'acum', w: 17, fmt: MOEDA, al: 'r' },
    ], linhasRecon, { filtro: false })
    impressao(ws7, { paisagem: false })

    /* ═══ CONFIABILIDADE ═════════════════════════════════════════════════ */
    const ws8 = nova('CONFIABILIDADE')
    let r8 = cabecalho(ws8, 'Confiabilidade', 'Cada linha é uma consulta rodada no HastaPro ao vivo e nos grupos, não uma opinião', 4)
    r8 = tabela(ws8, r8, [
        { t: 'Bloco', k: 'bloco', w: 17 },
        { t: 'O que podia estar errado', k: 'item', w: 44 },
        { t: 'O que foi medido', k: 'medido', w: 104, muted: true },
        { t: 'Resultado', k: 'res', w: 12, al: 'c' },
    ], [
        ...d.confiabilidade.testes.map(([i, c, res]) => ({ bloco: 'TESTE', item: i, medido: c, res, __destaque: res !== 'OK' })),
        ...d.confiabilidade.riscos.map(([i, c]) => ({ bloco: 'RISCO RESIDUAL', item: i, medido: c })),
    ], { filtro: false })
    impressao(ws8, { paisagem: false })

    /* ═══ RESOLVIDAS ═════════════════════════════════════════════════════ */
    const ws9 = nova('RESOLVIDAS')
    let r9 = cabecalho(ws9, 'Divergências resolvidas', 'O que morreu, com a prova. Não precisa voltar à pauta.', 3)
    r9 = tabela(ws9, r9, [
        { t: '#', k: 'n', w: 5, al: 'c', muted: true },
        { t: 'Divergência', k: 'item', w: 48 },
        { t: 'Como se resolveu', k: 'como', w: 114, muted: true },
    ], d.resolvidas.map(([i, c], k) => ({ n: k + 1, item: i, como: c, __destaque: i.startsWith('⚑') })), { filtro: false })
    impressao(ws9, { paisagem: false })

    /* ═══ PENDÊNCIAS ═════════════════════════════════════════════════════ */
    const wsA = nova('PENDÊNCIAS')
    let rA = cabecalho(wsA, 'Pendências', 'O que falta decidir ou lançar, com quem decide e quanto vale. Embaixo, as regras de comissão que o grupo fixou e o ERP ainda não reflete.', 4)
    rA = tabela(wsA, rA, [
        { t: 'Quem decide', k: 'quem', w: 18 },
        { t: 'O quê', k: 'oque', w: 58 },
        { t: 'Contexto', k: 'ctx', w: 92, muted: true },
        { t: 'R$ envolvido', k: 'valor', w: 15, fmt: MOEDA, al: 'r' },
    ], d.pendencias.map(p => ({ quem: p.quem, oque: p.o_que, ctx: p.porque, valor: p.valor })), { filtro: false })
    rA = bloco(wsA, rA + 1, 'Regras de comissão fixadas no grupo que o ERP ainda não reflete', 4)
    tabela(wsA, rA, [
        { t: 'Origem', k: 'quem', w: 18 },
        { t: 'Regra', k: 'oque', w: 58 },
        { t: 'Detalhe', k: 'ctx', w: 92, muted: true },
        { t: '', k: 'valor', w: 15, fmt: MOEDA, al: 'r' },
    ], d.regrasComissao.map(r => {
        const corte = r.indexOf(':')
        return { quem: 'REGRA', oque: (corte > 0 && corte < 90 ? r.slice(0, corte) : r.slice(0, 70)).replace(/^⚑\s*/, ''), ctx: r.replace(/^⚑\s*/, ''), valor: null }
    }), { filtro: false, larguras: false, congela: false })
    impressao(wsA, { paisagem: false })

    /* ═══ PLANILHA DRIVE ═════════════════════════════════════════════════ */
    const wsB = nova('PLANILHA DRIVE')
    let rB = cabecalho(wsB, 'Planilha FINANCEIRO BULA 2026', 'Aba Leilões, agosto, como foi lida no Drive em 02/09 às 16h46', 9)
    rB = tabela(wsB, rB, [
        { t: 'Data', k: 'data', w: 7, al: 'c' },
        { t: 'Leilão', k: 'nome', w: 50 },
        { t: 'Leiloeira', k: 'leiloeira', w: 16, muted: true },
        { t: 'Faturamento', k: 'fat', w: 17, fmt: MOEDA, al: 'r' },
        { t: 'Vendas Bula', k: 'vendas', w: 17, fmt: MOEDA, al: 'r' },
        { t: '% venda', k: 'pv', w: 10, fmt: PCT, al: 'r' },
        { t: '% faturamento', k: 'pf', w: 12, fmt: PCT, al: 'r' },
        { t: 'Receita', k: 'rec', w: 15, fmt: MOEDA, al: 'r' },
        { t: 'Status', k: 'status', w: 22, muted: true },
    ], [
        ...(d.planilha ?? []).map(p => ({ data: dbr(p.data), nome: p.nome, leiloeira: p.leiloeira, fat: p.faturamento, vendas: p.vendas, pv: p.pctVendas, pf: p.pctFat, rec: p.receita, status: p.status })),
        { data: '', nome: 'TOTAL', vendas: t.planilha, rec: (d.planilha ?? []).reduce((s, p) => s + (p.receita || 0), 0), __total: true },
    ], { congelaCol: 2 })
    impressao(wsB)

    /* ═══ ERP ════════════════════════════════════════════════════════════ */
    const wsC = nova('ERP')
    let rC = cabecalho(wsC, 'Fechamentos no ERP', 'Tabela bula_leilao_fechamento, agosto de 2026, lida do banco vivo', 6)
    rC = tabela(wsC, rC, [
        { t: 'Data', k: 'data', w: 7, al: 'c' },
        { t: 'Fechamento', k: 'nome', w: 56 },
        { t: 'VGV', k: 'vgv', w: 17, fmt: MOEDA, al: 'r' },
        { t: 'Origem', k: 'origem', w: 14, al: 'c', muted: true },
        { t: 'Comissão', k: 'com', w: 15, fmt: MOEDA, al: 'r' },
        { t: 'Receita', k: 'rec', w: 15, fmt: MOEDA, al: 'r' },
    ], [
        ...d.erp.map(f => ({ data: dbr(f.data), nome: f.nome, vgv: f.vgv, origem: f.origem, com: f.comissao, rec: f.receita, __destaque: f.origem === 'lances-auto' })),
        { data: '', nome: 'TOTAL', vgv: t.erp_hoje, com: d.erp.reduce((s, f) => s + (f.comissao || 0), 0), rec: d.erp.reduce((s, f) => s + (f.receita || 0), 0), __total: true },
    ], { congelaCol: 2 })
    nota(wsC, rC, 'As linhas destacadas têm origem lances-auto: o fechamento foi montado a partir de ficha ou print do WhatsApp. Quando o leilão for lançado no HastaPro, o importador canônico as substitui sozinho.', 6)
    impressao(wsC)

    await wb.xlsx.writeFile(destino)
    return destino
}

/* ── execução direta ─────────────────────────────────────────────────────── */
if (process.argv[1] && path.basename(process.argv[1]) === 'xlsx-fechamento-agosto-2026.mjs') {
    const dados = JSON.parse(fs.readFileSync('outputs/fechamento-agosto-2026/dados.json', 'utf8'))
    const alvo = process.argv[2] || 'outputs/fechamento-agosto-2026/fechamento-agosto-2026.xlsx'
    fs.mkdirSync(path.dirname(alvo), { recursive: true })
    await geraWorkbook(dados, alvo)
    console.log('XLSX:', alvo)
}
