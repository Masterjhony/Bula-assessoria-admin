/**
 * DRE BULA ASSESSORIA 2026 — FECHADA.
 *
 * A DRE anterior (gera-dre-hastapro-2026.mjs) tinha despesa completa e receita
 * pela metade, porque procurava receita em FIN_TITULOS — onde ela nao esta.
 * Esta aqui usa cada fonte no que ela sabe:
 *
 *   RECEITA  ... aba Leiloes da planilha do financeiro: um evento por linha,
 *                com leiloeira, %, valor e o numero da NF. E a lista do que a
 *                Bula COBROU — provada evento a evento contra o HastaPro em
 *                scripts/correlaciona-cobertura-filiais-2026.mjs.
 *   IMPOSTO  ... 18% (ISS 5% + Simples 13%), a convencao da propria planilha.
 *                O realmente pago sai do HastaPro e vai para a conferencia.
 *   COMISSAO ... FIN_TITULOS filial '2', por pessoa.
 *   DESPESAS ... FIN_TITULOS filial '2', classificadas pela natureza.
 *
 * Uso: node scripts/gera-dre-2026-fechada.mjs [caminho-da-planilha.xlsx]
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Firebird from 'node-firebird'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { criaClassificador, gravaXLSX } from './lib/classifica-despesa-hastapro.mjs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

/* ---------------------------------------------------------------- HastaPro */
const fbOpts = {
    host: env.HASTAPRO_HOST, port: Number(env.HASTAPRO_PORT || 3050), database: env.HASTAPRO_DATABASE,
    user: env.HASTAPRO_USER || 'SYSDBA', password: env.HASTAPRO_PASSWORD, encoding: 'NONE',
}
const dec = v => (Buffer.isBuffer(v) ? v.toString('latin1').trim() : (v instanceof Date ? v.toISOString().slice(0, 10) : v))
const db = await new Promise((res, rej) => Firebird.attach(fbOpts, (e, d) => (e ? rej(e) : res(d))))
const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => (e ? rej(e)
    : res((r || []).map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, dec(v)])))))))

const CATS = Object.fromEntries((await q('SELECT FCT_CODIGO,FCT_DESCRICAO FROM FIN_CATEGORIAS')).map(c => [c.FCT_CODIGO, c.FCT_DESCRICAO]))
const CLI = Object.fromEntries((await q('SELECT CLI_CODIGO,CLI_NOME FROM CLIENTES')).map(c => [c.CLI_CODIGO, c.CLI_NOME]))
const PRE = Object.fromEntries((await q('SELECT PRE_CODIGO,PRE_NOME FROM PRESTADORES')).map(p => [p.PRE_CODIGO, p.PRE_NOME]))
const LEI = Object.fromEntries((await q('SELECT LEI_CODIGO,LEI_NOME FROM LEILAO')).map(l => [l.LEI_CODIGO, l.LEI_NOME]))
const titulos = await q(`SELECT T.TIT_CODIGO,T.TIT_TIPO,T.TIT_DESCRICAO,T.TIT_VALOR,T.TIT_FORNECEDOR,
    T.TIT_DT_VENCTO,T.FCT_CODIGO,T.LEI_CODIGO,T.TIT_STATUS,M.MOV_PAGODIA,M.MOV_PAGAMENTO
    FROM FIN_TITULOS T LEFT JOIN FIN_MOVIMENTO M ON M.TIT_CODIGO=T.TIT_CODIGO
    WHERE T.FIL_CODIGO='2' AND T.TIT_DT_VENCTO BETWEEN '2026-01-01' AND '2026-12-31'`)
const impostoPagoHp = await q(`SELECT T.TIT_VALOR,T.TIT_DESCRICAO,M.MOV_PAGODIA,T.TIT_DT_VENCTO FROM FIN_TITULOS T
    LEFT JOIN FIN_MOVIMENTO M ON M.TIT_CODIGO=T.TIT_CODIGO
    WHERE T.FIL_CODIGO='2' AND T.TIT_TIPO='D' AND T.TIT_DT_VENCTO>='2026-01-01'
      AND (UPPER(T.TIT_DESCRICAO) LIKE '%SIMPLES%' OR UPPER(T.TIT_DESCRICAO) LIKE '%ISSQN%'
        OR UPPER(T.TIT_DESCRICAO) LIKE '%DASN%' OR UPPER(T.TIT_DESCRICAO) LIKE '%DAS %')`)
db.detach()

const { classifica, cat, fornecedor, mesDe, n, r2 } = criaClassificador({ CATS, CLI, PRE })

/* ------------------------------------------------ RECEITA: a aba Leiloes  */
const XLSX_IN = process.argv[2] || path.join(os.homedir(), 'Downloads', 'FINANCEIRO BULA 2026.xlsx')
const wbIn = new ExcelJS.Workbook()
await wbIn.xlsx.readFile(XLSX_IN)
const wsL = wbIn.worksheets.find(w => /leil/i.test(w.name))
const ch = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const MESNUM = { JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12 }
const val = (row, c) => { const v = row.getCell(c).value; return v && typeof v === 'object' && 'result' in v ? v.result : v }
const EVENTOS = []
wsL.eachRow((row, i) => {
    if (i === 1) return
    const nome = val(row, 3)
    if (!nome) return
    const mes = MESNUM[ch(val(row, 2))] || 0
    const dia = Number(val(row, 1)) || 0
    const receita = n(val(row, 15))
    /* Linha de evento de verdade: tem data, tem receita, nao e total nem parcela. */
    if (!mes || !dia || !receita || /^TOTAL|^\d\/\d /i.test(String(nome))) return
    EVENTOS.push({
        dia, mes, nome: String(nome).trim(), leiloeira: String(val(row, 4) ?? '').trim() || '(não informada)',
        faturamento: n(val(row, 7)), vendasBula: n(val(row, 8)),
        pct: n(val(row, 11)) || n(val(row, 12)), status: String(val(row, 14) ?? '').trim(),
        receita, comissaoPlan: n(val(row, 17)), nf: String(val(row, 19) ?? '').trim(),
    })
})

/* Origem do evento (em que filial esta o leilao) — do correlacionador. */
let ORIGEM = {}
const jsonCorr = 'outputs/cobertura-filiais-2026/correlacao.json'
if (fs.existsSync(jsonCorr)) {
    const C = JSON.parse(fs.readFileSync(jsonCorr, 'utf8'))
    for (const c of C.cobrados_na_fil01 || []) ORIGEM[`${c.dia}|${c.mes}|${ch(c.nome)}`] = 'filial 01 (Remates)'
    for (const c of C.cobrados_sem_leilao || []) ORIGEM[`${c.dia}|${c.mes}|${ch(c.nome)}`] = 'sem leilão no HastaPro'
}
const origemDe = e => ORIGEM[`${e.dia}|${e.mes}|${ch(e.nome)}`] || 'filial 2 (Assessoria)'

/* ---------------------------------------------------------- agregacao     */
const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO']
const SEP = '::'
const zeros = () => Array(13).fill(0)
const acc = {}
const soma = (chave, mes, v) => {
    const a = (acc[chave] ??= zeros())
    a[mes] = r2(a[mes] + n(v)); a[0] = r2(a[0] + n(v))
}
const S = chave => acc[chave] || zeros()
const filhosDe = pref => Object.keys(acc).filter(k => k.startsWith(pref + SEP) && k.split(SEP).length === pref.split(SEP).length + 1)
const ordena = ks => ks.sort((a, b) => S(b)[0] - S(a)[0])
const filhos = pref => ordena(filhosDe(pref)).map(k => ({ nome: k.split(SEP).pop(), serie: S(k) }))
const sub2 = (a, b) => { const r = zeros(); for (let i = 0; i <= 12; i++) r[i] = r2(a[i] - b[i]); return r }
const somaS = (...as) => { const r = zeros(); for (const a of as) for (let i = 0; i <= 12; i++) r[i] = r2(r[i] + a[i]); return r }
const escala = (a, f) => { const r = zeros(); for (let i = 0; i <= 12; i++) r[i] = r2(a[i] * f); return r }

const desp = titulos.filter(t => t.TIT_TIPO === 'D')
const classificados = desp.map(t => ({ t, cls: classifica(t), mes: mesDe(t) }))
for (const { t, cls, mes } of classificados) {
    const [g, sub, det] = cls
    soma([g, sub, det].join(SEP), mes, n(t.TIT_VALOR))
    soma([g, sub].join(SEP), mes, n(t.TIT_VALOR))
    soma(g, mes, n(t.TIT_VALOR))
}
for (const e of EVENTOS) {
    soma('REC', e.mes, e.receita)
    soma(['REC', e.leiloeira].join(SEP), e.mes, e.receita)
}
const ULTIMO = Math.max(...EVENTOS.map(e => e.mes), ...classificados.map(c => c.mes).filter(Boolean))
const M = Array.from({ length: ULTIMO }, (_, i) => i + 1)

const RECEITA = S('REC')
const TAXA_IMPOSTO = 0.18
const IMPOSTO = escala(RECEITA, TAXA_IMPOSTO)
const ISS = escala(RECEITA, 0.05)
const SIMPLES = escala(RECEITA, 0.13)
const LIQUIDA = sub2(RECEITA, IMPOSTO)
const COMISSAO = S('COM')
const MARGEM = sub2(LIQUIDA, COMISSAO)
const FIXAS = S('FIX')
const VARIAVEIS = S('VAR')
const LUCRO = sub2(sub2(MARGEM, FIXAS), VARIAVEIS)
const OPER = ['Reembolsos', 'Translado', 'Hospedagem', 'Alimentação', 'Outros']
const OPERACIONAIS = somaS(...OPER.map(o => S(['VAR', `Despesas Operacionais|${o}`].join(SEP))))
/* Imposto realmente pago (HastaPro), para a conferencia. */
const IMPOSTO_PAGO = zeros()
for (const t of impostoPagoHp) {
    const mes = Number(String(t.MOV_PAGODIA || t.TIT_DT_VENCTO).slice(5, 7))
    IMPOSTO_PAGO[mes] += n(t.TIT_VALOR); IMPOSTO_PAGO[0] += n(t.TIT_VALOR)
}

/* ---------------------------------------------------------- workbook      */
const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria'
const PRETO = 'FF0A0A0A', CINZA = 'FFE8E8E8', CINZACLARO = 'FFF5F5F5'
const money = '#,##0.00;[Red]-#,##0.00'
const pctFmt = '0.0%'
const preto = c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }; c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 } }

const ws = wb.addWorksheet('DRE 2026', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] })
ws.getColumn(1).width = 44
const colDe = m => 2 + (m - 1) * 2
for (const m of M) { ws.getColumn(colDe(m)).width = 13; ws.getColumn(colDe(m) + 1).width = 7 }
const COL_TOT = colDe(ULTIMO) + 2
ws.getColumn(COL_TOT).width = 15
ws.getColumn(COL_TOT + 1).width = 7

ws.mergeCells(1, 1, 1, COL_TOT + 1)
const tit = ws.getCell(1, 1)
tit.value = 'DRE BULA ASSESSORIA 2026 — fechada · receita da aba Leilões, despesa do HastaPro (filial 2)'
tit.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
tit.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
tit.alignment = { vertical: 'middle' }
ws.getRow(1).height = 26
ws.mergeCells(2, 1, 2, COL_TOT + 1)
const sub = ws.getCell(2, 1)
sub.value = `${EVENTOS.length} eventos cobrados · imposto provisionado a ${(TAXA_IMPOSTO * 100).toFixed(0)}% (convenção da planilha) · despesa em regime de caixa`
sub.font = { size: 10, color: { argb: 'FF5A5A5A' } }
sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }

const cab = ws.getRow(3)
cab.getCell(1).value = 'DRE BULA ASSESSORIA'
for (const m of M) { cab.getCell(colDe(m)).value = MESES[m - 1]; cab.getCell(colDe(m) + 1).value = '%' }
cab.getCell(COL_TOT).value = 'TOTAL'
cab.getCell(COL_TOT + 1).value = '%'
cab.eachCell(c => { preto(c); c.alignment = { horizontal: 'center' } })
cab.getCell(1).alignment = { horizontal: 'left' }

const LINHAS = []
const put = (nivel, nome, serie, o = {}) => LINHAS.push({ nivel, nome, serie, ...o })
put(0, 'RECEITA BRUTA', RECEITA, { destaque: true })
for (const f of filhos('REC').slice(0, 8)) put(2, f.nome, f.serie)
put(1, '(-) IMPOSTO', IMPOSTO, { pct: RECEITA })
put(2, 'ISS (5%)', ISS)
put(2, 'Simples Nacional (13%)', SIMPLES)
put(0, 'RECEITA LÍQUIDA', LIQUIDA, { destaque: true, pct: RECEITA })
put(1, '(-) CUSTOS DE COMISSÃO', COMISSAO, { pct: RECEITA })
for (const f of filhos('COM')) put(2, f.nome, f.serie)
put(0, 'MARGEM DE CONTRIBUIÇÃO', MARGEM, { destaque: true, pct: RECEITA })
put(1, '(-) DESPESAS FIXAS', FIXAS, { grupo: true, pct: RECEITA })
for (const b of ['Folha de Pagamento', 'Carros', 'Utilitários']) {
    put(2, `(-) ${b}`, S(['FIX', b].join(SEP)), { sub: true })
    for (const f of filhos(['FIX', b].join(SEP))) put(3, f.nome, f.serie)
}
put(1, '(-) DESPESAS VARIÁVEIS', VARIAVEIS, { grupo: true, pct: RECEITA })
for (const b of ['Despesas Trabalhistas', 'Despesas de Diárias', 'Despesas de Marketing']) {
    put(2, `(-) ${b}`, S(['VAR', b].join(SEP)), { sub: true })
    for (const f of filhos(['VAR', b].join(SEP))) put(3, f.nome, f.serie)
}
put(2, '(-) Despesas Operacionais', OPERACIONAIS, { sub: true })
for (const o of OPER) {
    const k = ['VAR', `Despesas Operacionais|${o}`].join(SEP)
    if (!S(k)[0]) continue
    put(3, o, S(k))
    for (const f of filhos(k)) put(4, f.nome, f.serie)
}
put(0, '(-) LUCRO LÍQUIDO', LUCRO, { destaque: true, pct: RECEITA })
put(0, '', zeros())
put(0, 'MEMORANDO — fora do resultado', S('MEMO'), { grupo: true })
for (const f of filhos('MEMO')) put(1, f.nome, f.serie, { sub: true })
put(1, 'Imposto realmente pago (guias no HastaPro)', IMPOSTO_PAGO, { sub: true })

let r = 4
for (const L of LINHAS) {
    const row = ws.getRow(r++)
    row.getCell(1).value = '    '.repeat(Math.max(0, L.nivel - 1)) + L.nome
    if (L.nome) {
        for (const m of [...M, 'T']) {
            const i = m === 'T' ? 0 : m
            const col = m === 'T' ? COL_TOT : colDe(m)
            row.getCell(col).value = r2(L.serie[i]); row.getCell(col).numFmt = money
            if (L.pct && L.pct[i]) { row.getCell(col + 1).value = r2(L.serie[i]) / L.pct[i]; row.getCell(col + 1).numFmt = pctFmt }
        }
    }
    row.font = { bold: L.destaque || L.grupo || L.sub, size: 10, italic: L.nivel >= 4 }
    if (L.destaque) row.eachCell(c => preto(c))
    else if (L.grupo) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } } })
    else if (L.sub) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZACLARO } } })
}

/* ----------------------------------------------- aba Receita por evento   */
const wr = wb.addWorksheet('Receita por evento', { views: [{ state: 'frozen', ySplit: 1 }] })
const RC = [['Mês', 12], ['Dia', 6], ['Evento', 46], ['Leiloeira', 18], ['Onde está o leilão', 22],
    ['Faturamento do leilão', 18], ['Vendas Bula', 16], ['%', 8], ['Receita', 14], ['Status', 16], ['NF / observação', 26]]
wr.getRow(1).values = RC.map(c => c[0])
RC.forEach((c, i) => { wr.getColumn(i + 1).width = c[1] })
wr.getRow(1).eachCell(c => preto(c))
let rr = 2
for (const e of EVENTOS.sort((a, b) => a.mes - b.mes || a.dia - b.dia))
    wr.getRow(rr++).values = [MESES[e.mes - 1], e.dia, e.nome, e.leiloeira, origemDe(e),
        r2(e.faturamento), r2(e.vendasBula), e.pct, r2(e.receita), e.status, e.nf]
for (const c of [6, 7, 9]) wr.getColumn(c).numFmt = money
wr.getColumn(8).numFmt = pctFmt
wr.autoFilter = { from: { row: 1, column: 1 }, to: { row: rr - 1, column: RC.length } }
const tr = wr.getRow(rr + 1)
tr.getCell(3).value = `${EVENTOS.length} eventos`
tr.getCell(9).value = r2(RECEITA[0]); tr.getCell(9).numFmt = money
tr.font = { bold: true }

/* ------------------------------------------------- aba Conferencia        */
const PLAN = {
    'RECEITA BRUTA': [0, 6096.75, 27195.15, 112746.35, 146470.30, 304651.32, 347488.22, 188808.55, 429215.62],
    '(-) IMPOSTO': [0, 1097.41, 4895.13, 20294.34, 26364.65, 54837.24, 62547.88, 33985.54, 74540.72],
    '(-) CUSTOS DE COMISSÃO': [0, 3849, 19344, 53337.80, 50616, 88346, 128408.44, 40021, 154707],
    '(-) DESPESAS FIXAS': [0, 44013.19, 53794.69, 51686.69, 40567.29, 40634.52, 41183.40, 39447.89, 49461.79],
    '(-) DESPESAS VARIÁVEIS': [0, 0, 1265.70, 35914.06, 31577.43, 0, 173.40, 12187.88, 22468],
    '(-) LUCRO LÍQUIDO': [0, -42862.86, -52104.37, -48486.54, -2655.07, 120833.56, 115175.10, 63166.24, 128038.11],
}
const wc = wb.addWorksheet('Conferência x Planilha', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] })
wc.getColumn(1).width = 30
wc.mergeCells(1, 1, 1, 2 + M.length * 3 + 3)
wc.getCell(1, 1).value = 'A DRE do financeiro × esta DRE — a diferença de cada linha'
wc.getCell(1, 1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
wc.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
const hc = wc.getRow(2)
hc.getCell(1).value = 'LINHA'
for (const m of M) {
    const c0 = 2 + (m - 1) * 3
    hc.getCell(c0).value = `${MESES[m - 1].slice(0, 3)} planilha`; hc.getCell(c0 + 1).value = 'fechada'; hc.getCell(c0 + 2).value = 'dif.'
    for (const k of [0, 1, 2]) wc.getColumn(c0 + k).width = 13
}
const CT = 2 + M.length * 3
hc.getCell(CT).value = 'TOTAL planilha'; hc.getCell(CT + 1).value = 'TOTAL fechada'; hc.getCell(CT + 2).value = 'dif.'
for (const k of [0, 1, 2]) wc.getColumn(CT + k).width = 16
hc.eachCell(c => { preto(c); c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }; c.alignment = { horizontal: 'center' } })
const CONF = [['RECEITA BRUTA', RECEITA], ['(-) IMPOSTO', IMPOSTO], ['(-) CUSTOS DE COMISSÃO', COMISSAO],
    ['(-) DESPESAS FIXAS', FIXAS], ['(-) DESPESAS VARIÁVEIS', VARIAVEIS], ['(-) LUCRO LÍQUIDO', LUCRO]]
let rcc = 3
for (const [nome, serie] of CONF) {
    const row = wc.getRow(rcc++)
    row.getCell(1).value = nome
    const p = PLAN[nome] || zeros()
    const totP = r2(p.reduce((a, b) => a + b, 0))
    for (const m of M) {
        const c0 = 2 + (m - 1) * 3
        row.getCell(c0).value = r2(p[m] || 0); row.getCell(c0).numFmt = money
        row.getCell(c0 + 1).value = r2(serie[m]); row.getCell(c0 + 1).numFmt = money
        const dif = r2((p[m] || 0) - serie[m])
        row.getCell(c0 + 2).value = dif; row.getCell(c0 + 2).numFmt = money
        if (Math.abs(dif) >= 1) row.getCell(c0 + 2).font = { color: { argb: dif > 0 ? 'FFAA3333' : 'FF117744' }, size: 10 }
    }
    row.getCell(CT).value = totP; row.getCell(CT).numFmt = money
    row.getCell(CT + 1).value = r2(serie[0]); row.getCell(CT + 1).numFmt = money
    row.getCell(CT + 2).value = r2(totP - serie[0]); row.getCell(CT + 2).numFmt = money
    row.font = { bold: true, size: 10 }
}
wc.getCell(rcc + 1, 1).value = 'Vermelho: a planilha lançou mais. Verde: esta DRE tem mais.'
wc.getCell(rcc + 2, 1).value = 'A receita difere porque a planilha soma linhas de parcela e de total; aqui cada evento entra uma vez só (ver aba Receita por evento).'
for (const k of [1, 2]) wc.getCell(rcc + k, 1).font = { italic: true, size: 9 }

/* ------------------------------------------------------- aba Base         */
const wbse = wb.addWorksheet('Base - Despesas', { views: [{ state: 'frozen', ySplit: 1 }] })
const COLS = [['Mês', 10], ['Pago em', 12], ['Vencimento', 12], ['Descrição', 46], ['Fornecedor', 30],
    ['Categoria HastaPro', 24], ['Linha da DRE', 32], ['Detalhe', 26], ['Leilão', 32], ['Forma', 18], ['Valor', 14]]
wbse.getRow(1).values = COLS.map(c => c[0])
COLS.forEach((c, i) => { wbse.getColumn(i + 1).width = c[1] })
wbse.getRow(1).eachCell(c => preto(c))
let rb = 2
for (const { t, cls, mes } of classificados.sort((a, b) => String(a.t.MOV_PAGODIA || a.t.TIT_DT_VENCTO).localeCompare(String(b.t.MOV_PAGODIA || b.t.TIT_DT_VENCTO)))) {
    const [g, subn, det] = cls
    const linha = g === 'COM' ? '(-) CUSTOS DE COMISSÃO' : g === 'IMP' ? `(-) IMPOSTO › ${subn}`
        : g === 'MEMO' ? `MEMORANDO › ${subn}` : subn.replace('|', ' › ')
    wbse.getRow(rb++).values = [MESES[mes - 1] || '—', t.MOV_PAGODIA || '', t.TIT_DT_VENCTO || '', t.TIT_DESCRICAO || '',
        fornecedor(t), cat(t) || '(sem categoria)', linha, det, LEI[t.LEI_CODIGO] || '', t.MOV_PAGAMENTO || '', r2(t.TIT_VALOR)]
}
wbse.getColumn(11).numFmt = money
wbse.autoFilter = { from: { row: 1, column: 1 }, to: { row: rb - 1, column: COLS.length } }

/* ------------------------------------------------------- aba Leia-me      */
const wl = wb.addWorksheet('Leia-me')
wl.getColumn(1).width = 3
wl.getColumn(2).width = 120
const brl = v => n(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const txt = (s, o = {}) => {
    const c = wl.getCell(wl.rowCount + 1, 2)
    c.value = s; c.font = { size: o.size || 11, bold: !!o.bold }
    c.alignment = { wrapText: true, vertical: 'top' }
}
txt('DRE BULA ASSESSORIA 2026 — fechada', { bold: true, size: 14 })
txt(`Gerada em ${new Date().toLocaleDateString('pt-BR')} por scripts/gera-dre-2026-fechada.mjs.`)
txt('')
txt('Cada fonte no que ela sabe', { bold: true, size: 12 })
txt(`• RECEITA — a aba Leilões da planilha do financeiro: ${EVENTOS.length} eventos cobrados de janeiro a ${MESES[ULTIMO - 1].toLowerCase()}, R$ ${brl(RECEITA[0])}, um por linha, com leiloeira, %, valor e o número da NF. Linhas de total e de parcela ficam fora, por isso o total aqui é menor que a soma bruta da coluna.`)
txt('• Por que não é o HastaPro: o financeiro dele não é usado para receita por nenhuma das duas empresas — a filial ‘01’ tem 6 títulos de recebimento no ano, R$ 143,00. A receita nasce do lote e da cobrança, não de FIN_TITULOS.')
txt('• IMPOSTO — 18% provisionados (ISS 5% + Simples 13%), a convenção da própria planilha. O que foi realmente pago em guias está no memorando, no fim da DRE, para comparar.')
txt('• COMISSÃO e DESPESAS — FIN_TITULOS da filial ‘2’, em regime de caixa (mês da baixa; sem baixa, o vencimento), classificadas pela NATUREZA e não pela categoria crua. Fatura de cartão vai para o memorando: é liquidação, não despesa.')
txt('')
txt('A coluna "Onde está o leilão"', { bold: true, size: 12 })
txt('Na aba Receita por evento, diz em que filial do HastaPro o evento foi encontrado — resultado do cruzamento feito por scripts/correlaciona-cobertura-filiais-2026.mjs. "filial 01 (Remates)" é receita da Assessoria faturada dentro de pregão da Remates; "sem leilão no HastaPro" é evento de leiloeira de terceiro que ninguém cadastrou. Os dois casos são trabalho de registro, não erro de apuração.')
txt('')
txt('O que ainda não está aqui', { bold: true, size: 12 })
txt('• A NFS-e como árbitro: só temos o Relatório de Nota Fiscal de agosto. Com o do ano, a receita passa a ser conferida contra o que o fisco vê — e janeiro e fevereiro, os meses de maior divergência entre as bases, se resolvem.')
txt('• Despesa que o HastaPro não registra e a planilha registra: aluguel do escritório (R$ 3.292/mês), energia e as ferramentas (Claude, Codex, Supabase, Vercel). A conferência mostra a diferença linha a linha.')

const alvo = path.join(os.homedir(), 'Desktop', 'DRE BULA ASSESSORIA 2026 - fechada.xlsx')
const salvo = await gravaXLSX(wb, alvo)

console.log('eventos:', EVENTOS.length, '| RECEITA', brl(RECEITA[0]))
console.log('IMPOSTO (18%)', brl(IMPOSTO[0]), '| pago em guias', brl(IMPOSTO_PAGO[0]))
console.log('COMISSAO', brl(COMISSAO[0]), '| FIXAS', brl(FIXAS[0]), '| VARIAVEIS', brl(VARIAVEIS[0]))
console.log('LUCRO', brl(LUCRO[0]))
console.log('origem dos eventos:', Object.entries(EVENTOS.reduce((a, e) => { const k = origemDe(e); a[k] = (a[k] || 0) + 1; return a }, {})).map(([k, v]) => `${k}: ${v}`).join(' | '))
console.log('XLSX →', salvo)
