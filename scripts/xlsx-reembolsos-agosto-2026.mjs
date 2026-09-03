/**
 * Workbook dos reembolsos de agosto/2026 — a planilha que vai para o chefe validar.
 *
 * Os números vêm de scripts/dados-reembolsos-agosto-2026.mjs (apuração nas DMs
 * do WhatsApp + comprovantes do bucket). Aqui só tem apresentação: capa com
 * KPI e índice, aba de APROVAÇÃO com campo de decisão, lançamento a lançamento,
 * rateio por leilão, cobertura de comprovante, pendências e rastro.
 *
 *   node scripts/xlsx-reembolsos-agosto-2026.mjs [destino.xlsx]
 */
import fs from 'node:fs'
import path from 'node:path'
import {
    FONTE, PRETO, GRAFITE, CINZA, LINHA, DOURADO, DOURADO_CLARO, BANDA,
    MOEDA, MOEDA_RS, PCT0, T, fill, colLetra, novoWorkbook, novaAba,
    cabecalho, bloco, tabela, nota, caixa, listaMerge, impressao,
} from './lib/xlsx-brand.mjs'
import { META, ASSESSORES, ITENS, EVENTOS, PENDENCIAS, RASTRO } from './dados-reembolsos-agosto-2026.mjs'

const RODAPE = 'Bula Assessoria · Reembolsos de agosto/2026 · apurado em 03/09/2026'
const r2 = n => Math.round(n * 100) / 100
const brl = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const brl0 = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`

/* ── agregações ──────────────────────────────────────────────────────────── */
const TODOS = ASSESSORES.flatMap(a => ITENS[a.id].map(i => ({ ...i, quem: a.nome.split(' ')[0], id: a.id })))
const soma = arr => r2(arr.reduce((s, i) => s + i.valor, 0))
const A_PAGAR = r2(ASSESSORES.reduce((s, a) => s + a.liquido, 0))
const DECLARADO = r2(ASSESSORES.reduce((s, a) => s + a.bruto, 0))
const ABATIDO = r2(ASSESSORES.reduce((s, a) => s + a.abatimento, 0))
const COMPENSADO = soma(TODOS.filter(i => i.evento === 'perolas'))
const TOTAL_LINHAS = soma(TODOS)

const COMP_LABEL = {
    ok: 'documento fiscal',
    divergente: 'nota diverge do pedido',
    parcial: 'comprovado em parte',
    fraco: 'sem nota fiscal',
    nao: 'sem comprovante',
}
const compDe = id => {
    const it = ITENS[id]
    const g = k => soma(it.filter(i => i.comp === k))
    return { ok: g('ok'), divergente: g('divergente'), parcial: g('parcial'), fraco: g('fraco'), nao: g('nao'), total: soma(it), n: it.length }
}
const COMP = Object.fromEntries(ASSESSORES.map(a => [a.id, compDe(a.id)]))
const COM_DOC = soma(TODOS.filter(i => i.comp === 'ok'))
const SEM_DOC = soma(TODOS.filter(i => i.comp === 'nao'))
const MEIO_DOC = r2(TOTAL_LINHAS - COM_DOC - SEM_DOC)

const porEvento = Object.keys(EVENTOS).map(k => {
    const itens = TODOS.filter(i => i.evento === k)
    return {
        k, ...EVENTOS[k], total: soma(itens), n: itens.length,
        douglas: soma(itens.filter(i => i.id === 'douglas')),
        fabio: soma(itens.filter(i => i.id === 'fabio')),
        leonardo: soma(itens.filter(i => i.id === 'leonardo')),
    }
}).filter(e => e.total > 0).sort((a, b) => b.total - a.total)
const EXPO = r2((porEvento.find(e => e.k === 'expo')?.total || 0) + (porEvento.find(e => e.k === 'misto')?.total || 0) + 155.30)

/* ── workbook ────────────────────────────────────────────────────────────── */
const wb = novoWorkbook('Reembolsos — Agosto/2026')

/* ═══ CAPA ═══════════════════════════════════════════════════════════════ */
const ws0 = wb.addWorksheet('CAPA', { properties: { tabColor: { argb: PRETO } }, views: [{ showGridLines: false }] })
ws0.getColumn(1).width = 2
for (let c = 2; c <= 9; c++) ws0.getColumn(c).width = 15.5
for (let r = 2; r <= 4; r++) ws0.mergeCells(`B${r}:I${r}`)
for (let r = 2; r <= 5; r++) for (let c = 2; c <= 9; c++) ws0.getCell(r, c).fill = fill(PRETO)
const marca = ws0.getCell('B2'); marca.value = 'BULA ASSESSORIA'
marca.font = T.marca; marca.alignment = { vertical: 'middle', indent: 2 }
const tit = ws0.getCell('B3'); tit.value = 'REEMBOLSOS DA EQUIPE'
tit.font = T.titulo; tit.alignment = { vertical: 'middle', indent: 2 }
const per = ws0.getCell('B4'); per.value = 'Agosto de 2026 · Douglas Bispo, Fábio Omena e Leonardo Serafim'
per.font = { name: FONTE, size: 11, color: { argb: 'FFDADADA' } }; per.alignment = { vertical: 'middle', indent: 2 }
ws0.getRow(2).height = 18; ws0.getRow(3).height = 32; ws0.getRow(4).height = 20; ws0.getRow(5).height = 5
ws0.mergeCells('B6:I6')
for (let c = 2; c <= 9; c++) ws0.getCell(6, c).fill = fill(DOURADO)
ws0.getRow(6).height = 4

let lr = 8
const kpis = [
    ['A PAGAR HOJE', A_PAGAR, MOEDA_RS, `declarado ${brl0(DECLARADO)} menos ${brl0(ABATIDO)} que o Douglas devolve`],
    ['COM DOCUMENTO FISCAL', COM_DOC / TOTAL_LINHAS, PCT0, `${brl0(COM_DOC)} de ${brl0(TOTAL_LINHAS)} lançados`],
    ['SEM NENHUM COMPROVANTE', SEM_DOC, MOEDA_RS, 'tudo do Fábio — alimentação, ASJ e táxis'],
    ['REEMBOLSO DA EXPOGENÉTICA', EXPO, MOEDA_RS, 'o fechamento da feira previa R$ 5.000'],
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
lr = textoCapa(lr, `Os três mandaram ${brl(DECLARADO)} de reembolso de agosto. Descontando os ${brl(ABATIDO)} que o Douglas devolve, saem hoje ${brl(A_PAGAR)}: Douglas ${brl(ASSESSORES[0].liquido)}, Fábio ${brl(ASSESSORES[1].liquido)} e Leonardo ${brl(ASSESSORES[2].liquido)}.`, true)
lr = textoCapa(lr, `O Douglas mandou dois relatórios. O de 12/08 (Pérolas do Tapajós, ${brl(COMPENSADO)}) NÃO entra: ele comprou as passagens da Expogenética das quatro pessoas e compensou — sobram ${brl(ABATIDO)} a favor da Bula, já abatidos do relatório de 28/08.`)
lr = textoCapa(lr, `Nenhum destes reembolsos estava lançado no ERP. As estimativas de R$ 6.500 (equipe da feira) e R$ 13.500 (demais leilões de agosto) foram canceladas no saneamento de 31/08.`)
lr++

lr = tituloCapa(lr, 'O que tem neste arquivo')
const indice = [
    ['APROVAÇÃO', 'A folha de decisão: o que pagar para cada um, com campo para o seu OK.'],
    ['POR LEILÃO', 'A que leilão cada despesa pertence, com o peso sobre o VGV do pregão.'],
    ['COMPROVAÇÃO', 'Quanto de cada reembolso tem nota fiscal — e quanto veio só na planilha.'],
    ['LANÇAMENTOS', `Os ${TODOS.length} lançamentos, um a um, com o documento que sustenta cada um.`],
    ['PENDÊNCIAS', 'O que precisa de decisão antes ou depois do pagamento.'],
    ['RASTRO', 'Quando cada arquivo chegou pelo WhatsApp.'],
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
    `Apurado em ${META.hoje}, cobrindo as despesas de 03 a 30 de agosto de 2026.`,
    'Conversas 1:1 do WhatsApp na sessão Baileys joao-automation (operational_items), com os anexos baixados do bucket whatsapp-media: planilhas de despesa, cupons, notas de serviço e os áudios em que o Douglas explica o abatimento.',
    'Cada valor é o que o próprio assessor declarou na planilha dele; a coluna de comprovante reflete o documento recebido e lido, um a um.',
    'Conferência no ERP: erp_contas_pagar (o que já foi pago da feira e os reembolsos de julho) e bula_leilao_fechamento + cronograma_leiloes (a que leilão cada despesa pertence).',
]) lr = textoCapa(lr, s)
ws0.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } }

/* ═══ APROVAÇÃO ══════════════════════════════════════════════════════════ */
{
    const ws = novaAba(wb, 'APROVAÇÃO')
    const cols = [
        { t: 'Assessor', k: 'quem', w: 22 },
        { t: 'Recebe em', k: 'destino', w: 40, muted: true },
        { t: 'Declarado', k: 'bruto', w: 15, fmt: MOEDA_RS, al: 'r' },
        { t: 'Abatimento', k: 'abate', w: 14, fmt: MOEDA_RS, al: 'r' },
        { t: 'A PAGAR', k: 'liquido', w: 16, fmt: MOEDA_RS, al: 'r' },
        { t: 'Com nota', k: 'cobertura', w: 10, fmt: PCT0, al: 'c' },
        { t: 'Decisão', k: 'decisao', w: 16, al: 'c' },
        { t: 'Observação do chefe', k: 'obs', w: 34 },
    ]
    let r = cabecalho(ws, 'Aprovação de pagamento', `Reembolsos de agosto/2026 · marque a decisão na coluna Decisão · total a pagar ${brl(A_PAGAR)}`, cols.length)
    const linhas = ASSESSORES.map(a => {
        const c = COMP[a.id]
        return {
            quem: a.nome, destino: a.pix.split(' — ')[0], bruto: a.bruto,
            abate: a.abatimento ? -a.abatimento : null, liquido: a.liquido,
            cobertura: (c.ok + c.divergente) / c.total, decisao: null, obs: null,
            __altura: 30,
        }
    })
    const primeira = r + 1
    const ultima = r + linhas.length
    linhas.push({
        quem: 'TOTAL A PAGAR', destino: null,
        bruto: { formula: `SUM(C${primeira}:C${ultima})`, result: DECLARADO },
        abate: { formula: `SUM(D${primeira}:D${ultima})`, result: -ABATIDO },
        liquido: { formula: `SUM(E${primeira}:E${ultima})`, result: A_PAGAR },
        __total: true,
    })
    r = tabela(ws, r, cols, linhas)

    // dropdown de decisão
    for (let i = primeira; i <= ultima; i++) {
        ws.getCell(`G${i}`).dataValidation = {
            type: 'list', allowBlank: true, formulae: ['"APROVADO,AJUSTAR,NÃO PAGAR"'],
            showErrorMessage: true, errorTitle: 'Escolha uma opção', error: 'APROVADO, AJUSTAR ou NÃO PAGAR.',
        }
        ws.getCell(`G${i}`).fill = fill(DOURADO_CLARO)
        ws.getCell(`H${i}`).fill = fill(DOURADO_CLARO)
        for (const col of ['G', 'H']) ws.getCell(`${col}${i}`).border = { bottom: { style: 'hair', color: { argb: LINHA } }, left: { style: 'thin', color: { argb: DOURADO } } }
    }

    r++
    r = caixa(ws, r, 'O que não entra neste pagamento',
        `14º Pérolas do Tapajós — relatório que o Douglas mandou em 12/08, ${brl(COMPENSADO)}. Ele comprou as passagens da Expogenética das quatro pessoas no mesmo dia e compensou uma coisa na outra; sobraram ${brl(ABATIDO)} a favor da Bula, que estão abatidos acima. Pagar esse relatório agora seria pagar duas vezes.`,
        cols.length)

    r = bloco(ws, r, 'As duas decisões que valem dinheiro', cols.length)
    r = listaMerge(ws, r, PENDENCIAS.filter(p => p.grau === 'alto').map(p => ({
        rotulo: p.quem, texto: `${p.titulo}. ${p.texto}`,
    })), cols.length)

    r++
    r = nota(ws, r, `Chaves de pagamento completas — Douglas: ${ASSESSORES[0].pix}. Fábio: ${ASSESSORES[1].pix}. Leonardo: ${ASSESSORES[2].pix}.`, cols.length)
    nota(ws, r, 'Notas fiscais: o Douglas e o Leonardo emitiram a do mensal em 01/09; o Fábio ainda não emitiu a dele. Nenhum dos três emite nota do reembolso — reembolso é ressarcimento de despesa, não serviço.', cols.length)
    impressao(ws, { paisagem: true, repetir: '5:5', rodape: RODAPE })
}

/* ═══ POR LEILÃO ═════════════════════════════════════════════════════════ */
{
    const ws = novaAba(wb, 'POR LEILÃO')
    const cols = [
        { t: 'Leilão / evento', k: 'nome', w: 46 },
        { t: 'Data', k: 'data', w: 15, al: 'c', muted: true },
        { t: 'Natureza', k: 'tipo', w: 13, al: 'c', muted: true },
        { t: 'VGV do pregão', k: 'vgv', w: 16, fmt: MOEDA_RS, al: 'r' },
        { t: 'Douglas', k: 'douglas', w: 14, fmt: MOEDA_RS, al: 'r' },
        { t: 'Fábio', k: 'fabio', w: 14, fmt: MOEDA_RS, al: 'r' },
        { t: 'Leonardo', k: 'leonardo', w: 14, fmt: MOEDA_RS, al: 'r' },
        { t: 'Total', k: 'total', w: 15, fmt: MOEDA_RS, al: 'r' },
        { t: '% do VGV', k: 'pct', w: 10, fmt: '0.00%', al: 'r' },
        { t: 'Como ler', k: 'nota', w: 62, muted: true },
    ]
    let r = cabecalho(ws, 'Em que leilão a despesa entra', 'Cada linha do relatório dos três, atribuída ao evento que gerou a viagem. Rateio de multi-leilão é decisão do financeiro.', cols.length)
    const linhas = porEvento.map(e => ({
        nome: e.nome, data: e.data, tipo: e.tipo, vgv: e.vgv || null,
        douglas: e.douglas || null, fabio: e.fabio || null, leonardo: e.leonardo || null,
        total: e.total, pct: e.vgv ? e.total / e.vgv : null, nota: e.nota,
        __destaque: e.k === 'expo', __altura: 32,
    }))
    linhas.push({
        nome: 'TOTAL LANÇADO (inclui o Pérolas já compensado)', vgv: null,
        douglas: COMP.douglas.total, fabio: COMP.fabio.total, leonardo: COMP.leonardo.total,
        total: TOTAL_LINHAS, __total: true,
    })
    r = tabela(ws, r, cols, linhas)
    r++
    r = caixa(ws, r, 'A Expogenética bateu na estimativa',
        `Somando o que os três gastaram na feira — a hospedagem mista do Douglas por inteiro e a fatia de Uber de Uberaba do Fábio — o reembolso de equipe fica em ${brl(EXPO)}. O fechamento da feira, de 28/08, trabalhou com R$ 5.000. A diferença cabe no arredondamento: o custo da Expogenética não muda.`,
        cols.length)
    nota(ws, r, 'Passagem aérea e a casa de Uberaba não estão aqui: já foram pagas à parte (bilhetes do Fábio R$ 4.196,87 e do Leonardo R$ 1.981,58 em 21/08, reemissão R$ 5.026,34 em 14/08, casa R$ 2.000 em 11/08, uniformes R$ 480).', cols.length)
    impressao(ws, { paisagem: true, repetir: '5:5', rodape: RODAPE })
}

/* ═══ COMPROVAÇÃO ════════════════════════════════════════════════════════ */
{
    const ws = novaAba(wb, 'COMPROVAÇÃO')
    const cols = [
        { t: 'Assessor', k: 'quem', w: 24 },
        { t: 'Lançamentos', k: 'n', w: 12, al: 'c' },
        { t: 'Documento fiscal', k: 'ok', w: 16, fmt: MOEDA, al: 'r' },
        { t: 'Nota diverge', k: 'div', w: 14, fmt: MOEDA, al: 'r' },
        { t: 'Comprovado em parte', k: 'parcial', w: 16, fmt: MOEDA, al: 'r' },
        { t: 'Sem nota fiscal', k: 'fraco', w: 14, fmt: MOEDA, al: 'r' },
        { t: 'Sem comprovante', k: 'nao', w: 16, fmt: MOEDA, al: 'r' },
        { t: 'Total', k: 'total', w: 16, fmt: MOEDA_RS, al: 'r' },
        { t: 'Cobertura', k: 'cob', w: 11, fmt: PCT0, al: 'c' },
        { t: 'Leitura', k: 'obs', w: 58, muted: true },
    ]
    let r = cabecalho(ws, 'O que tem comprovante', `Dos ${brl(TOTAL_LINHAS)} lançados, ${brl(COM_DOC)} vieram com documento fiscal legível e ${brl(SEM_DOC)} vieram só como linha de planilha.`, cols.length)
    const leitura = {
        douglas: '19 lançamentos, 19 documentos. As duas hospedagens de Marabá saíram com NFS-e em nome da Bula. Só o jantar de R$ 232,00 é recibo manuscrito.',
        fabio: 'Mandou o hotel, 20 recibos da 99, o print do iFood e uma nota de consumo. Alimentação, os três abastecimentos do ASJ e os oito táxis-aeroporto vieram sem nada.',
        leonardo: 'Todos os onze lançamentos com cupom, nota ou contrato. Aluguel e pedágio somados batem exatamente com o total do contrato da Localiza.',
    }
    const linhas = ASSESSORES.map(a => {
        const c = COMP[a.id]
        return {
            quem: a.nome, n: c.n, ok: c.ok || null, div: c.divergente || null, parcial: c.parcial || null,
            fraco: c.fraco || null, nao: c.nao || null, total: c.total, cob: (c.ok + c.divergente) / c.total,
            obs: leitura[a.id], __altura: 44, __cor: c.nao > 1000 ? 'vermelho' : (c.nao ? undefined : 'verde'),
        }
    })
    linhas.push({
        quem: 'TOTAL', n: TODOS.length,
        ok: COM_DOC, div: soma(TODOS.filter(i => i.comp === 'divergente')),
        parcial: soma(TODOS.filter(i => i.comp === 'parcial')), fraco: soma(TODOS.filter(i => i.comp === 'fraco')),
        nao: SEM_DOC, total: TOTAL_LINHAS, cob: (COM_DOC + soma(TODOS.filter(i => i.comp === 'divergente'))) / TOTAL_LINHAS,
        __total: true,
    })
    r = tabela(ws, r, cols, linhas, { filtro: false })
    r++
    r = bloco(ws, r, 'O que significa cada marcação', cols.length)
    r = listaMerge(ws, r, [
        { rotulo: 'documento fiscal', texto: 'NFC-e, NFS-e, BP-e, contrato ou extrato oficial, lido e conferido contra a linha do relatório.', valor: COM_DOC },
        { rotulo: 'nota diverge do pedido', texto: 'O documento existe, mas o valor não é o mesmo que foi pedido — o hotel do leilão LS.', valor: soma(TODOS.filter(i => i.comp === 'divergente')) },
        { rotulo: 'comprovado em parte', texto: 'A linha soma várias corridas e os recibos entregues cobrem só uma parte.', valor: soma(TODOS.filter(i => i.comp === 'parcial')) },
        { rotulo: 'sem nota fiscal', texto: 'Tem prova de gasto (recibo manuscrito, nota com data fora do período), mas não serve como documento fiscal do mês.', valor: soma(TODOS.filter(i => i.comp === 'fraco')) },
        { rotulo: 'sem comprovante', texto: 'Só existe a linha na planilha do assessor. Nada foi anexado.', valor: SEM_DOC },
    ], cols.length, { fmt: MOEDA_RS })
    r++
    nota(ws, r, 'Todos os comprovantes recebidos estão na subpasta Comprovantes, ao lado deste arquivo, separados por assessor — os cupons e notas lidos um a um, mais as planilhas de despesa e as notas do mensal que vieram na mesma conversa.', cols.length)
    impressao(ws, { paisagem: true, repetir: '5:5', rodape: RODAPE })
}

/* ═══ LANÇAMENTOS ════════════════════════════════════════════════════════ */
{
    const ws = novaAba(wb, 'LANÇAMENTOS')
    const cols = [
        { t: 'Assessor', k: 'quem', w: 12 },
        { t: 'Data', k: 'data', w: 10, al: 'c' },
        { t: 'Despesa', k: 'desc', w: 46 },
        { t: 'Leilão / evento', k: 'evento', w: 34, muted: true },
        { t: 'Comprovante', k: 'comp', w: 20, al: 'c' },
        { t: 'Entra no pagamento de hoje', k: 'entra', w: 16, al: 'c' },
        { t: 'Valor', k: 'valor', w: 15, fmt: MOEDA_RS, al: 'r' },
        { t: 'Documento / observação', k: 'obs', w: 66, muted: true },
    ]
    let r = cabecalho(ws, 'Lançamento a lançamento', `Os ${TODOS.length} itens declarados pelos três, na ordem de cada relatório. Use o filtro do cabeçalho para isolar assessor, evento ou situação do comprovante.`, cols.length)
    const linhas = TODOS.map(i => ({
        quem: i.quem, data: i.data, desc: i.desc, evento: EVENTOS[i.evento].nome,
        comp: COMP_LABEL[i.comp], entra: i.evento === 'perolas' ? 'não — compensado' : 'sim', valor: i.valor, obs: i.obs || null,
        __cor: i.comp === 'nao' ? 'vermelho' : undefined,
    }))
    const p = r + 1, u = r + linhas.length
    linhas.push({
        quem: 'TOTAL', desc: 'inclui o relatório de 12/08 do Douglas, que já foi compensado',
        entra: 'a pagar hoje', valor: { formula: `SUM(G${p}:G${u})`, result: TOTAL_LINHAS },
        __total: true,
    })
    r = tabela(ws, r, cols, linhas, { congelaCol: 2 })
    r++
    nota(ws, r, 'As linhas em vermelho claro não têm nenhum comprovante anexado — são todas do Fábio.', cols.length)
    impressao(ws, { paisagem: true, repetir: '5:5', rodape: RODAPE })
}

/* ═══ PENDÊNCIAS ═════════════════════════════════════════════════════════ */
{
    const ws = novaAba(wb, 'PENDÊNCIAS')
    const cols = [
        { t: 'Quando', k: 'grau', w: 22, al: 'c' },
        { t: 'Quem', k: 'quem', w: 12, al: 'c' },
        { t: 'Ponto', k: 'titulo', w: 46 },
        { t: 'Detalhe', k: 'texto', w: 96, muted: true },
        { t: 'Decisão', k: 'decisao', w: 16, al: 'c' },
    ]
    const GRAU = { alto: 'DECIDE ANTES DE PAGAR', medio: 'CONFERE', baixo: 'ANOTA', info: 'CONTEXTO' }
    let r = cabecalho(ws, 'O que precisa de decisão', 'Duas coisas mudam o valor de hoje; o resto é conferência e contexto para o mês que vem.', cols.length)
    const linhas = PENDENCIAS.map(p => ({
        grau: GRAU[p.grau], quem: p.quem, titulo: p.titulo, texto: p.texto, decisao: null,
        __altura: 44, __cor: p.grau === 'alto' ? 'vermelho' : undefined,
    }))
    const p0 = r + 1, u0 = r + linhas.length
    r = tabela(ws, r, cols, linhas, { filtro: false })
    for (let i = p0; i <= u0; i++) {
        ws.getCell(`E${i}`).dataValidation = {
            type: 'list', allowBlank: true, formulae: ['"OK,RESOLVER,IGNORAR"'],
            showErrorMessage: true, errorTitle: 'Escolha uma opção', error: 'OK, RESOLVER ou IGNORAR.',
        }
        ws.getCell(`E${i}`).fill = fill(DOURADO_CLARO)
        ws.getCell(`E${i}`).border = { bottom: { style: 'hair', color: { argb: LINHA } }, left: { style: 'thin', color: { argb: DOURADO } } }
    }
    impressao(ws, { paisagem: true, repetir: '5:5', rodape: RODAPE })
}

/* ═══ RASTRO ═════════════════════════════════════════════════════════════ */
{
    const ws = novaAba(wb, 'RASTRO')
    const cols = [
        { t: 'Quando', k: 'quando', w: 14, al: 'c' },
        { t: 'Quem', k: 'quem', w: 14, al: 'c' },
        { t: 'O que chegou', k: 'o', w: 110 },
    ]
    let r = cabecalho(ws, 'Rastro no WhatsApp', 'Tudo o que sustenta esta planilha veio das conversas 1:1 da sessão joao-automation, com anexo guardado no bucket.', cols.length)
    r = tabela(ws, r, cols, RASTRO.map(x => ({ ...x, __altura: 22 })), { filtro: false })
    r++
    nota(ws, r, 'Só Douglas, Fábio e Leonardo têm conversa 1:1 capturada pela Central. Peralta, Nane, Laila e Lucas não aparecem aqui — por esta fonte não dá para afirmar que não enviaram nada.', cols.length)
    impressao(ws, { paisagem: false, rodape: RODAPE })
}

/* ── grava ───────────────────────────────────────────────────────────────── */
const destino = process.argv[2] || 'C:/Users/Notebook-Acer/Desktop/Bula - Reembolsos Agosto 2026 (03-09-2026)/Bula - Reembolsos Agosto 2026.xlsx'
fs.mkdirSync(path.dirname(destino), { recursive: true })
await wb.xlsx.writeFile(destino)
console.log('XLSX :', destino)
console.log(`abas: ${wb.worksheets.map(w => w.name).join(' · ')}`)
console.log(`a pagar ${brl(A_PAGAR)} · lançado ${brl(TOTAL_LINHAS)} · com nota ${brl(COM_DOC)} · sem comprovante ${brl(SEM_DOC)}`)
