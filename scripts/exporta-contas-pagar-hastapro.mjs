import Firebird from 'node-firebird'
import ExcelJS from 'exceljs'
import fs from 'fs'

/**
 * Exporta as CONTAS A PAGAR da Bula Assessoria (HastaPro, FIL_CODIGO '2') para XLSX.
 * SOMENTE LEITURA no Firebird do fornecedor — nunca escrever.
 *
 *   node scripts/exporta-contas-pagar-hastapro.mjs "C:/caminho/arquivo.xlsx"
 */

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

const opts = {
  host: env.HASTAPRO_HOST, port: Number(env.HASTAPRO_PORT || 3050), database: env.HASTAPRO_DATABASE,
  user: env.HASTAPRO_USER || 'SYSDBA', password: env.HASTAPRO_PASSWORD, encoding: 'NONE',
}
// banco em WIN1252: strings chegam como Buffer e precisam de latin1, senao vira mojibake
const decode = v => (Buffer.isBuffer(v) ? v.toString('latin1').trim() : (v instanceof Date ? v.toISOString().slice(0, 10) : v))
const linha = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, decode(v)]))

async function extrai() {
  const db = await new Promise((res, rej) => Firebird.attach(opts, (e, d) => (e ? rej(e) : res(d))))
  const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => (e ? rej(e) : res((r || []).map(linha)))))
  try {
    return {
      titulos: await q(`
        SELECT TIT_CODIGO, TIT_TIPO, TIT_DESCRICAO, TIT_VALOR, TIT_VALOR_REAL, TIT_ORIGEM,
               TIT_FORNECEDOR, TIT_CLIENTE, LOT_LOTE, TIT_DOCUMENTO, TIT_NOTAFISCAL,
               TIT_DT_EMISSAO, TIT_DT_VENCTO, TIT_DT_COMPETENCIA, TIT_STATUS,
               FCT_CODIGO, FCC_CODIGO, TIT_PARCELA, TIT_PARCELAS_TOTAL, LEI_CODIGO,
               TIT_OCULTO, TIT_TITULO_PAI, USU_CODIGO,
               CAST(TIT_OBSERVACAO AS VARCHAR(2000)) AS OBS
        FROM FIN_TITULOS WHERE FIL_CODIGO = '2' AND TIT_TIPO = 'D' ORDER BY TIT_DT_VENCTO`),
      cats: await q(`SELECT FCT_CODIGO, FCT_DESCRICAO, FCT_TIPO, FCT_CODIGO_PAI FROM FIN_CATEGORIAS`),
      clis: await q(`SELECT CLI_CODIGO, CLI_NOME, CLI_CPFCNPJ, CLI_UF FROM CLIENTES`),
      pres: await q(`SELECT PRE_CODIGO, PRE_NOME, PRE_CPF, PRE_FUNCAO FROM PRESTADORES`),
      leis: await q(`SELECT LEI_CODIGO, LEI_NOME, LEI_DATA, LEI_LOCAL, LEI_UF FROM LEILAO`),
      usus: await q(`SELECT USU_CODIGO, USU_NOME FROM USUARIOS`),
      movs: await q(`
        SELECT M.TIT_CODIGO, M.MOV_PAGODIA, M.MOV_VALOR, M.MOV_JUROS, M.MOV_DESCONTO,
               M.MOV_PAGAMENTO, M.MOV_DOCUMENTO, C.FCO_DESCRICAO
        FROM FIN_MOVIMENTO M
        LEFT JOIN FIN_CONTAS C ON C.FCO_CODIGO = M.FCO_CODIGO
        WHERE M.TIT_CODIGO IN (SELECT TIT_CODIGO FROM FIN_TITULOS WHERE FIL_CODIGO = '2' AND TIT_TIPO = 'D')`),
    }
  } finally {
    try { db.detach() } catch { /* conexao ja caiu */ }
  }
}

const D = await extrai()

const HOJE = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')
const HOJE_BR = HOJE.toLocaleDateString('pt-BR')
const s = v => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim())
const num = v => Number(v || 0)

const CAT = Object.fromEntries(D.cats.map(c => [c.FCT_CODIGO, c]))
const catNome = c => (c ? s(CAT[c]?.FCT_DESCRICAO) : '')
const catPai = c => { const p = CAT[c]?.FCT_CODIGO_PAI; return p ? s(CAT[p]?.FCT_DESCRICAO) : '' }
const CLI = Object.fromEntries(D.clis.map(c => [c.CLI_CODIGO, c]))
const PRE = Object.fromEntries(D.pres.map(p => [p.PRE_CODIGO, p]))
const LEI = Object.fromEntries(D.leis.map(l => [l.LEI_CODIGO, l]))
const USU = Object.fromEntries(D.usus.map(u => [s(u.USU_CODIGO), s(u.USU_NOME)]))
const MOV = Object.fromEntries(D.movs.map(m => [m.TIT_CODIGO, m]))

const dt = v => (v ? new Date(v + 'T00:00:00') : null)
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesRef = v => (v ? `${v.slice(0, 4)}-${v.slice(5, 7)} (${MES[+v.slice(5, 7) - 1]}/${v.slice(2, 4)})` : '(sem data)')

const linhas = D.titulos.map(t => {
  const status = s(t.TIT_STATUS)
  const mov = MOV[t.TIT_CODIGO]
  const venc = dt(t.TIT_DT_VENCTO)
  const situacao = status === 'PAGO' ? 'Pago' : (venc && venc < HOJE ? 'Vencido' : 'A vencer')
  const forn = CLI[t.TIT_FORNECEDOR] || null
  const pres = PRE[t.TIT_FORNECEDOR] || null
  const lei = LEI[t.LEI_CODIGO] || null
  const catRaw = catNome(t.FCT_CODIGO)
  return {
    situacao,
    categoria: catRaw || (t.TIT_ORIGEM === 'VE' ? 'COMISSÃO DE VENDA (gerada pelo leilão)' : '(sem categoria)'),
    grupo: catPai(t.FCT_CODIGO),
    descricao: s(t.TIT_DESCRICAO),
    fornecedor: s(forn?.CLI_NOME || pres?.PRE_NOME || ''),
    documentoForn: s(forn?.CLI_CPFCNPJ || pres?.PRE_CPF || ''),
    ufForn: s(forn?.CLI_UF || ''),
    leilao: s(lei?.LEI_NOME || ''),
    dataLeilao: lei?.LEI_DATA ? dt(lei.LEI_DATA) : null,
    ufLeilao: s(lei?.LEI_UF || ''),
    lote: s(t.LOT_LOTE || ''),
    emissao: dt(t.TIT_DT_EMISSAO),
    vencimento: venc,
    competencia: dt(t.TIT_DT_COMPETENCIA),
    mesVencimento: mesRef(t.TIT_DT_VENCTO),
    parcela: `${t.TIT_PARCELA || 1}/${t.TIT_PARCELAS_TOTAL || 1}`,
    valor: num(t.TIT_VALOR),
    valorPago: status === 'PAGO' ? num(t.TIT_VALOR_REAL ?? t.TIT_VALOR) : 0,
    emAberto: status === 'ABERTO' ? num(t.TIT_VALOR) : 0,
    dataPagamento: mov?.MOV_PAGODIA ? dt(mov.MOV_PAGODIA) : null,
    juros: num(mov?.MOV_JUROS),
    desconto: num(mov?.MOV_DESCONTO),
    formaPagamento: s(mov?.MOV_PAGAMENTO || ''),
    documento: s(t.TIT_DOCUMENTO || ''),
    notaFiscal: s(t.TIT_NOTAFISCAL || ''),
    observacao: s(t.OBS || ''),
    origem: t.TIT_ORIGEM === 'VE' ? 'Gerado pela venda' : 'Lançamento manual',
    lancadoPor: USU[s(t.USU_CODIGO)] || '',
    codigo: s(t.TIT_CODIGO),
  }
}).sort((a, b) => (a.vencimento?.getTime() || 0) - (b.vencimento?.getTime() || 0))

const PRETO = 'FF111111', DOURADO = 'FFC9A84C', CINZA = 'FFF4F4F2', BRANCO = 'FFFFFFFF'
const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria'
wb.created = HOJE

function tabela(ws, cols, dados, { totalCols = [] } = {}) {
  ws.columns = cols.map(c => ({ header: c.h, key: c.k, width: c.w }))
  const head = ws.getRow(1)
  head.height = 28
  head.eachCell(c => {
    c.font = { bold: true, color: { argb: BRANCO }, size: 10, name: 'Calibri' }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    c.border = { bottom: { style: 'medium', color: { argb: DOURADO } } }
  })
  dados.forEach((d, i) => {
    const r = ws.addRow(d)
    r.height = 17
    r.eachCell({ includeEmpty: true }, (c, n) => {
      const col = cols[n - 1]
      if (!col) return
      c.font = { size: 10, name: 'Calibri' }
      c.alignment = { vertical: 'middle', horizontal: col.a || 'left' }
      if (col.f) c.numFmt = col.f
      if (i % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } }
      c.border = { bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } } }
    })
  })
  if (totalCols.length && dados.length) {
    const r = ws.addRow({})
    r.height = 22
    cols.forEach((col, i) => {
      const c = r.getCell(i + 1)
      c.font = { bold: true, size: 10, color: { argb: BRANCO } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
      c.alignment = { vertical: 'middle', horizontal: col.a || 'left' }
      if (i === 0) c.value = 'TOTAL'
      if (totalCols.includes(col.k)) {
        const L = ws.getColumn(i + 1).letter
        c.value = { formula: `SUM(${L}2:${L}${dados.length + 1})` }
        c.numFmt = col.f
      }
    })
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  if (dados.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }
}

const M = '#,##0.00;[Red]-#,##0.00'
const DFMT = 'dd/mm/yyyy'
const COLS = [
  { h: 'Situação', k: 'situacao', w: 11, a: 'center' },
  { h: 'Categoria', k: 'categoria', w: 30 },
  { h: 'Grupo (categoria pai)', k: 'grupo', w: 22 },
  { h: 'Descrição', k: 'descricao', w: 46 },
  { h: 'Fornecedor / Favorecido', k: 'fornecedor', w: 34 },
  { h: 'CPF / CNPJ', k: 'documentoForn', w: 19, a: 'center' },
  { h: 'UF', k: 'ufForn', w: 5, a: 'center' },
  { h: 'Valor (R$)', k: 'valor', w: 14, a: 'right', f: M },
  { h: 'Valor pago (R$)', k: 'valorPago', w: 14, a: 'right', f: M },
  { h: 'Em aberto (R$)', k: 'emAberto', w: 14, a: 'right', f: M },
  { h: 'Vencimento', k: 'vencimento', w: 12, a: 'center', f: DFMT },
  { h: 'Mês de vencimento', k: 'mesVencimento', w: 17, a: 'center' },
  { h: 'Pagamento', k: 'dataPagamento', w: 12, a: 'center', f: DFMT },
  { h: 'Forma de pagamento', k: 'formaPagamento', w: 19, a: 'center' },
  { h: 'Emissão', k: 'emissao', w: 11, a: 'center', f: DFMT },
  { h: 'Competência', k: 'competencia', w: 12, a: 'center', f: DFMT },
  { h: 'Parcela', k: 'parcela', w: 8, a: 'center' },
  { h: 'Juros (R$)', k: 'juros', w: 11, a: 'right', f: M },
  { h: 'Desconto (R$)', k: 'desconto', w: 12, a: 'right', f: M },
  { h: 'Leilão', k: 'leilao', w: 40 },
  { h: 'Data do leilão', k: 'dataLeilao', w: 13, a: 'center', f: DFMT },
  { h: 'UF leilão', k: 'ufLeilao', w: 9, a: 'center' },
  { h: 'Lote', k: 'lote', w: 8, a: 'center' },
  { h: 'Documento', k: 'documento', w: 18 },
  { h: 'Nota fiscal', k: 'notaFiscal', w: 14 },
  { h: 'Observação', k: 'observacao', w: 44 },
  { h: 'Origem do lançamento', k: 'origem', w: 19, a: 'center' },
  { h: 'Lançado por', k: 'lancadoPor', w: 26 },
  { h: 'Código HastaPro', k: 'codigo', w: 17, a: 'center' },
]
const TOT = ['valor', 'valorPago', 'emAberto', 'juros', 'desconto']

const somaPor = (dados, chave) => {
  const m = new Map()
  for (const l of dados) {
    const k = chave(l) || '(não informado)'
    const a = m.get(k) || { chave: k, qtd: 0, valor: 0, pago: 0, aberto: 0, ultimo: null }
    a.qtd++; a.valor += l.valor; a.pago += l.valorPago; a.aberto += l.emAberto
    if (l.vencimento && (!a.ultimo || l.vencimento > a.ultimo)) a.ultimo = l.vencimento
    m.set(k, a)
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor)
}
const pct = (v, t) => (t ? v / t : 0)
const totalGeral = linhas.reduce((a, l) => a + l.valor, 0)
const totalPago = linhas.reduce((a, l) => a + l.valorPago, 0)
const totalAberto = linhas.reduce((a, l) => a + l.emAberto, 0)
const vencidos = linhas.filter(l => l.situacao === 'Vencido')
const aVencer = linhas.filter(l => l.situacao === 'A vencer')
const vencMin = linhas.find(l => l.vencimento)?.vencimento
const vencMax = [...linhas].reverse().find(l => l.vencimento)?.vencimento
const brDate = d => (d ? d.toLocaleDateString('pt-BR') : '-')

const rs = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] })
rs.columns = [{ width: 3 }, { width: 36 }, { width: 18 }, { width: 15 }, { width: 3 }, { width: 38 }, { width: 16 }, { width: 12 }]
const put = (cell, val, o = {}) => {
  const c = rs.getCell(cell); c.value = val
  c.font = { name: 'Calibri', size: o.size || 10, bold: !!o.bold, color: { argb: o.color || PRETO } }
  c.alignment = { vertical: 'middle', horizontal: o.a || 'left' }
  if (o.f) c.numFmt = o.f
  if (o.border) c.border = { bottom: { style: 'medium', color: { argb: DOURADO } } }
  return c
}
rs.getRow(2).height = 32
put('B2', 'CONTAS A PAGAR — BULA ASSESSORIA', { size: 16, bold: true })
put('B3', 'Fonte: HastaPro (Firebird) · filial 2 = Bula Assessoria · CNPJ 34.791.630/0001-43', { size: 9.5, color: 'FF666666' })
put('B4', `Extraído em 01/09/2026 · ${linhas.length} títulos · vencimentos de ${brDate(vencMin)} a ${brDate(vencMax)}`, { size: 9.5, color: 'FF666666' })

let r = 6
const kpi = (lin, rot, val, obs) => {
  rs.getRow(lin).height = 21
  put(`B${lin}`, rot, { bold: true })
  put(`C${lin}`, val, { a: 'right', f: M, bold: true })
  put(`D${lin}`, obs, { a: 'right', size: 9, color: 'FF666666' })
}
put(`B${r}`, 'POSIÇÃO GERAL', { bold: true, size: 11, border: true }); put(`C${r}`, '', { border: true }); put(`D${r}`, '', { border: true }); r += 1
kpi(r++, 'Total lançado (todos os títulos)', totalGeral, `${linhas.length} títulos`)
kpi(r++, 'Já pago', totalPago, `${linhas.filter(l => l.situacao === 'Pago').length} títulos`)
kpi(r++, 'Em aberto', totalAberto, `${linhas.filter(l => l.emAberto > 0).length} títulos`)
kpi(r++, `   Em aberto — vencido (até ${HOJE_BR})`, vencidos.reduce((a, l) => a + l.valor, 0), `${vencidos.length} títulos`)
kpi(r++, '   Em aberto — a vencer', aVencer.reduce((a, l) => a + l.valor, 0), `${aVencer.length} títulos`)
r += 1

put(`B${r}`, 'POR MÊS DE VENCIMENTO', { bold: true, size: 11, border: true }); put(`C${r}`, 'Total (R$)', { bold: true, a: 'right', border: true }); put(`D${r}`, 'Em aberto (R$)', { bold: true, a: 'right', border: true }); r += 1
for (const m of somaPor(linhas, l => l.mesVencimento).sort((a, b) => a.chave.localeCompare(b.chave))) {
  put(`B${r}`, m.chave); put(`C${r}`, m.valor, { a: 'right', f: M }); put(`D${r}`, m.aberto, { a: 'right', f: M }); r++
}
r += 1
put(`B${r}`, 'FORMA DE PAGAMENTO (títulos pagos)', { bold: true, size: 11, border: true }); put(`C${r}`, 'Total (R$)', { bold: true, a: 'right', border: true }); put(`D${r}`, 'Títulos', { bold: true, a: 'right', border: true }); r += 1
for (const m of somaPor(linhas.filter(l => l.situacao === 'Pago'), l => l.formaPagamento)) {
  put(`B${r}`, m.chave); put(`C${r}`, m.pago, { a: 'right', f: M }); put(`D${r}`, m.qtd, { a: 'right' }); r++
}

let r2 = 6
put(`F${r2}`, 'TOP 15 CATEGORIAS', { bold: true, size: 11, border: true }); put(`G${r2}`, 'Total (R$)', { bold: true, a: 'right', border: true }); put(`H${r2}`, '% total', { bold: true, a: 'right', border: true }); r2 += 1
for (const c of somaPor(linhas, l => l.categoria).slice(0, 15)) {
  put(`F${r2}`, c.chave); put(`G${r2}`, c.valor, { a: 'right', f: M }); put(`H${r2}`, pct(c.valor, totalGeral), { a: 'right', f: '0.0%' }); r2++
}
r2 += 1
put(`F${r2}`, 'TOP 15 FORNECEDORES', { bold: true, size: 11, border: true }); put(`G${r2}`, 'Total (R$)', { bold: true, a: 'right', border: true }); put(`H${r2}`, '% total', { bold: true, a: 'right', border: true }); r2 += 1
for (const c of somaPor(linhas, l => l.fornecedor).slice(0, 15)) {
  put(`F${r2}`, c.chave); put(`G${r2}`, c.valor, { a: 'right', f: M }); put(`H${r2}`, pct(c.valor, totalGeral), { a: 'right', f: '0.0%' }); r2++
}

tabela(wb.addWorksheet('Contas a Pagar'), COLS, linhas, { totalCols: TOT })
tabela(wb.addWorksheet('Em Aberto'), COLS, linhas.filter(l => l.emAberto > 0), { totalCols: TOT })
tabela(wb.addWorksheet('Pagas'), COLS, linhas.filter(l => l.situacao === 'Pago'), { totalCols: TOT })

const AGG = [
  { h: '', k: 'chave', w: 44 },
  { h: 'Títulos', k: 'qtd', w: 9, a: 'center' },
  { h: 'Total (R$)', k: 'valor', w: 16, a: 'right', f: M },
  { h: 'Pago (R$)', k: 'pago', w: 16, a: 'right', f: M },
  { h: 'Em aberto (R$)', k: 'aberto', w: 16, a: 'right', f: M },
  { h: '% do total', k: 'part', w: 11, a: 'right', f: '0.0%' },
  { h: 'Último vencimento', k: 'ultimo', w: 17, a: 'center', f: DFMT },
]
const aggRows = arr => arr.map(a => ({ ...a, part: pct(a.valor, totalGeral) }))
const mkAgg = (nome, rotulo, chave, dados = linhas) => {
  const cols = [{ ...AGG[0], h: rotulo }, ...AGG.slice(1)]
  tabela(wb.addWorksheet(nome), cols, aggRows(somaPor(dados, chave)), { totalCols: ['qtd', 'valor', 'pago', 'aberto'] })
}
mkAgg('Por Categoria', 'Categoria', l => l.categoria)
mkAgg('Por Fornecedor', 'Fornecedor / Favorecido', l => l.fornecedor)
mkAgg('Por Mês', 'Mês de vencimento', l => l.mesVencimento)
mkAgg('Por Leilão', 'Leilão', l => l.leilao, linhas.filter(l => l.leilao))

const li = wb.addWorksheet('Leia-me', { views: [{ showGridLines: false }] })
li.columns = [{ width: 3 }, { width: 30 }, { width: 100 }]
const put2 = (cell, val, o = {}) => {
  const c = li.getCell(cell); c.value = val
  c.font = { name: 'Calibri', size: o.size || 10, bold: !!o.bold, color: { argb: o.color || PRETO } }
  c.alignment = { vertical: 'top', horizontal: 'left', wrapText: true }
}
li.getRow(2).height = 30
put2('B2', 'COMO LER ESTA PLANILHA', { size: 14, bold: true })
const notas = [
  ['Fonte', `HastaPro — banco Firebird do fornecedor, tabela FIN_TITULOS (tipo D = a pagar). Extração somente leitura em ${HOJE_BR}.`],
  ['Escopo', 'FIL_CODIGO = 2, que é a Bula Assessoria (CNPJ 34.791.630/0001-43). NÃO inclui a filial 01 (Bula Remates, a leiloeira) nem a 3 (Recorrentes).'],
  ['Recorte', `Todos os títulos a pagar existentes na base: ${linhas.length} títulos, vencimentos de ${brDate(vencMin)} a ${brDate(vencMax)}. O HastaPro só tem financeiro de 2026 para esta filial.`],
  ['Situação', `Pago = status PAGO no HastaPro. Vencido = em aberto com vencimento anterior a ${HOJE_BR}. A vencer = em aberto com vencimento a partir de ${HOJE_BR}. Hoje, todos os títulos em aberto já estão vencidos — o mais recente venceu em ${brDate(vencMax)}.`],
  ['Valor x Valor pago', 'Valor é o valor do título. Valor pago só aparece quando o título está quitado e vem do valor real da baixa (FIN_MOVIMENTO), já com juros e desconto quando houve.'],
  ['Categoria', `Categoria financeira do HastaPro (FIN_CATEGORIAS). ${linhas.filter(l => l.origem === 'Gerado pela venda').length} títulos vêm sem categoria porque são gerados automaticamente pela venda do lote: aparecem como COMISSÃO DE VENDA (gerada pelo leilão) e estão marcados como "Gerado pela venda" na coluna Origem do lançamento.`],
  ['Grupo', 'Categoria pai, quando a categoria está aninhada no plano de contas do HastaPro.'],
  ['Leilão / Lote', 'Preenchidos só nos títulos vinculados a um evento no HastaPro. Despesa de estrutura (folha, escritório, imposto) não tem leilão.'],
  ['Forma de pagamento', 'Vem da baixa (FIN_MOVIMENTO). A conta bancária no HastaPro está cadastrada como CONTA FICTICIA, então não há conciliação bancária útil aqui.'],
  ['Abas', 'Resumo · Contas a Pagar (todos) · Em Aberto · Pagas · Por Categoria · Por Fornecedor · Por Mês · Por Leilão.'],
  ['Filtros', 'Todas as abas de dados têm filtro na primeira linha e cabeçalho congelado. A linha TOTAL soma a coluna inteira: ao filtrar, ela não acompanha o recorte.'],
  ['Atenção', 'O HastaPro é a fonte da operação. Conciliação bancária, fluxo de caixa e receita oficial da Bula ficam no ERP do web-bula; os dois não devem ser somados.'],
]
let rl = 4
for (const [k, v] of notas) {
  put2(`B${rl}`, k, { bold: true }); put2(`C${rl}`, v)
  li.getRow(rl).height = Math.max(17, Math.ceil(v.length / 92) * 15)
  rl++
}

const dest = process.argv[2]
if (!dest) { console.error('uso: node scripts/exporta-contas-pagar-hastapro.mjs "caminho/arquivo.xlsx"'); process.exit(1) }
await wb.xlsx.writeFile(dest)
console.log('OK ->', dest)
console.log(`total ${totalGeral.toFixed(2)} | pago ${totalPago.toFixed(2)} | aberto ${totalAberto.toFixed(2)} | vencido ${vencidos.reduce((a, l) => a + l.valor, 0).toFixed(2)} (${vencidos.length}) | a vencer ${aVencer.reduce((a, l) => a + l.valor, 0).toFixed(2)} (${aVencer.length})`)
