// Gera "Fechamento_Leiloes_JMP_2026.xlsx" (na raiz do projeto): workbook
// elaborado e formatado dos dois leilões JMP (touros 14/06 e bezerras/fêmeas 13/06).
//
// Consulta os fechamentos + contas a pagar (comissões) + contas a receber direto
// do Supabase e o faturamento da leiloeira ("Somatória - Leilões JMP 2026").
//
// Requer a lib exceljs (utilitário de relatório, fora do build do app):
//   npm i exceljs            (ou: npm i exceljs --no-save)
// Uso: node scripts/gera-xlsx-fechamento-jmp.mjs
import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const D = {}
{
  const { data, error } = await sb.from('bula_leilao_fechamento').select('*').in('data', ['2026-06-13', '2026-06-14'])
  if (error) throw error
  D.fechamentos = data
}
{
  const { data, error } = await sb.from('erp_contas_pagar')
    .select('*, fornecedor:erp_pessoas!fornecedor_id(nome), centro:erp_centros_custo!centro_custo_id(nome,codigo)')
    .ilike('numero_documento', 'BULA-2026-CP-COM-JMP%')
  if (error) throw error
  D.comissoes = data
}
{
  const { data, error } = await sb.from('erp_contas_receber')
    .select('*, cliente:erp_pessoas!cliente_id(nome)')
    .ilike('numero_documento', 'BULA-2026-CR-JMP%')
  if (error) throw error
  D.receber = data
}
const fTouros = D.fechamentos.find((f) => f.data === '2026-06-14')
const fBez = D.fechamentos.find((f) => f.data === '2026-06-13')

// ---- Paleta / estilos ----
const INK = 'FF14110B', GOLD = 'FFC8A96E', GOLD_SOFT = 'FFE9DCC2', BAND = 'FFF7F3EC'
const LINE = 'FFDED0B4', GREEN = 'FF2E7D32'
const MONEY = 'R$ #,##0.00', PCT = '0.00%', INT = '#,##0'
const thin = { style: 'thin', color: { argb: LINE } }
const allBorders = { top: thin, left: thin, bottom: thin, right: thin }
const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria'
wb.created = new Date('2026-06-16T12:00:00Z')
const col = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26 } return s }

function titleBar(ws, text, sub, ncols) {
  ws.mergeCells(`A1:${col(ncols)}1`)
  const t = ws.getCell('A1')
  t.value = text
  t.font = { name: 'Calibri', size: 18, bold: true, color: { argb: GOLD } }
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  ws.getRow(1).height = 34
  ws.mergeCells(`A2:${col(ncols)}2`)
  const s = ws.getCell('A2')
  s.value = sub
  s.font = { name: 'Calibri', size: 10.5, italic: true, color: { argb: GOLD_SOFT } }
  s.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
  ws.getRow(2).height = 20
}
function sectionRow(ws, rowIdx, text, ncols) {
  ws.mergeCells(`A${rowIdx}:${col(ncols)}${rowIdx}`)
  const c = ws.getCell(`A${rowIdx}`)
  c.value = text
  c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: INK } }
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_SOFT } }
  c.border = { bottom: { style: 'medium', color: { argb: GOLD } } }
  ws.getRow(rowIdx).height = 24
}
function headerCells(ws, rowIdx, headers) {
  const row = ws.getRow(rowIdx)
  headers.forEach((h, i) => {
    const c = row.getCell(i + 1)
    c.value = h
    c.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: GOLD } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } }
    c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center', wrapText: true, indent: i === 0 ? 1 : 0 }
    c.border = allBorders
  })
  row.height = 26
}
function dataTable(ws, startRow, data, fmts, opts = {}) {
  data.forEach((rowArr, r) => {
    const row = ws.getRow(startRow + r)
    const isTotal = opts.totalRows && opts.totalRows.includes(r)
    rowArr.forEach((val, i) => {
      const c = row.getCell(i + 1)
      c.value = val
      const fmt = fmts[i]
      if (fmt === 'money') c.numFmt = MONEY
      else if (fmt === 'pct') c.numFmt = PCT
      else if (fmt === 'int') c.numFmt = INT
      c.font = { name: 'Calibri', size: 10, bold: !!isTotal, color: { argb: isTotal ? INK : 'FF222222' } }
      c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : (fmt === 'text' ? 'left' : 'right'), indent: i === 0 ? 1 : 0, wrapText: !!opts.wrap }
      c.border = allBorders
      if (isTotal) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_SOFT } }
      else if (r % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }
    })
    row.height = isTotal ? 22 : 18
  })
  return startRow + data.length
}
const N = (n) => Number(n || 0)

// ABA 1 — RESUMO EXECUTIVO
function abaResumo() {
  const ws = wb.addWorksheet('Resumo Executivo', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 40 }, { width: 22 }, { width: 24 }, { width: 22 }, { width: 20 }]
  titleBar(ws, 'FECHAMENTO — LEILÕES NELORE JMP 2026', 'Bula Assessoria  ·  10º Leilão Nelore JMP  ·  Vendedor JBJ Agropecuária  ·  Leiloeira Programa Leilões  ·  13–14 jun 2026', 5)

  const impT = N(fTouros.receita_bula) * 0.18, impB = N(fBez.receita_bula) * 0.18
  const despT = N(fTouros.despesas_variaveis), despB = N(fBez.despesas_variaveis)
  const lucroT = N(fTouros.receita_bula) - N(fTouros.comissao_assessoria) - impT - despT
  const lucroB = N(fBez.receita_bula) - N(fBez.comissao_assessoria) - impB - despB

  sectionRow(ws, 4, 'VISÃO CONSOLIDADA', 5)
  headerCells(ws, 5, ['Indicador', 'Touros (14/06)', 'Bezerras/Fêmeas (13/06)', 'TOTAL JMP', ''])
  const rows = [
    ['Data do leilão', '14/06/2026', '13/06/2026', '13–14/06/2026'],
    ['Modalidade', 'Presencial', 'Presencial', '—'],
    ['Faturamento TOTAL do leilão (leiloeira)', N(fTouros.faturamento_total_leilao), N(fBez.faturamento_total_leilao), N(fTouros.faturamento_total_leilao) + N(fBez.faturamento_total_leilao)],
    ['Animais vendidos no leilão (total)', 922.5, 232.5, 1155],
    ['— VGV da cobertura Bula', N(fTouros.vgv_total), N(fBez.vgv_total), N(fTouros.vgv_total) + N(fBez.vgv_total)],
    ['— Lotes cobertura Bula', fTouros.lotes_vendidos, fBez.lotes_vendidos, fTouros.lotes_vendidos + fBez.lotes_vendidos],
    ['— Animais cobertura Bula', fTouros.animais_vendidos, fBez.animais_vendidos, fTouros.animais_vendidos + fBez.animais_vendidos],
    ['Receita Bula (0,5% do faturamento)', N(fTouros.receita_bula), N(fBez.receita_bula), N(fTouros.receita_bula) + N(fBez.receita_bula)],
    ['(−) Comissão de assessores/pisteiros', N(fTouros.comissao_assessoria), N(fBez.comissao_assessoria), N(fTouros.comissao_assessoria) + N(fBez.comissao_assessoria)],
    ['(=) Sobra bruta', N(fTouros.sobra_bruta), N(fBez.sobra_bruta), N(fTouros.sobra_bruta) + N(fBez.sobra_bruta)],
    ['(−) Imposto estimado (18% da receita)', impT, impB, impT + impB],
    ['(−) Despesas variáveis', despT, despB, despT + despB],
    ['(=) Lucro líquido estimado', lucroT, lucroB, lucroT + lucroB],
  ]
  let r = 6
  rows.forEach((rowArr, idx) => {
    const isLucro = idx === 12, isSobra = idx === 9
    const row = ws.getRow(r)
    rowArr.forEach((val, i) => {
      const c = row.getCell(i + 1)
      c.value = val
      if (i > 0 && typeof val === 'number') {
        if (idx === 3) c.numFmt = '#,##0.0'
        else if (idx === 5 || idx === 6) c.numFmt = INT
        else c.numFmt = MONEY
      }
      const strong = isLucro || isSobra || idx === 2 || idx === 7
      c.font = { name: 'Calibri', size: 10.5, bold: strong, color: { argb: isLucro ? GREEN : 'FF222222' } }
      if (i === 0) c.font = { name: 'Calibri', size: 10.5, bold: strong, color: { argb: 'FF222222' } }
      c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right', indent: i === 0 ? 1 : 0 }
      c.border = allBorders
      if (isLucro) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6EF' } }
      else if (isSobra) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_SOFT } }
      else if (idx % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }
    })
    row.height = 19; r++
  })

  // NOSSO PERCENTUAL DE VENDAS POR CATEGORIA (Machos × Fêmeas)
  r += 1
  sectionRow(ws, r, 'NOSSO PERCENTUAL DE VENDAS POR CATEGORIA — MACHOS × FÊMEAS', 5); r++
  headerCells(ws, r, ['Categoria', 'VGV Bula (cobertura)', 'Faturamento da categoria', 'Participação Bula (penetração)', '% das vendas Bula (mix)']); r++
  const vgvM = N(fTouros.vgv_total), vgvF = N(fBez.vgv_total), vgvTot = vgvM + vgvF
  const fatM = N(fTouros.faturamento_total_leilao), fatF = N(fBez.faturamento_total_leilao), fatTot = fatM + fatF
  const catRows = [
    ['Machos (Touros)', vgvM, fatM, fatM ? vgvM / fatM : 0, vgvTot ? vgvM / vgvTot : 0],
    ['Fêmeas (Bezerras)', vgvF, fatF, fatF ? vgvF / fatF : 0, vgvTot ? vgvF / vgvTot : 0],
    ['TOTAL', vgvTot, fatTot, fatTot ? vgvTot / fatTot : 0, 1],
  ]
  r = dataTable(ws, r, catRows, ['text', 'money', 'money', 'pct', 'pct'], { totalRows: [2] })
  r += 1
  ws.mergeCells(`A${r}:E${r}`)
  const cn = ws.getCell(`A${r}`)
  cn.value = 'Participação Bula = VGV da nossa cobertura ÷ faturamento total da categoria no leilão. Mix = quanto cada categoria representa das nossas vendas.'
  cn.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF666666' } }
  cn.alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(r).height = 28

  // Nota geral
  r += 2
  ws.mergeCells(`A${r}:E${r}`)
  const note = ws.getCell(`A${r}`)
  note.value = 'Acordo Bula × JMP: 0,5% sobre o faturamento total do leilão. Comissão de pisteiros conforme relatório da leiloeira + 2% para o Bulinha (parceiro FdB). Imposto e despesas são estimativas (revisar na conciliação contábil).'
  note.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF666666' } }
  note.alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(r).height = 42
}

// ABA por leilão (detalhe)
function abaLeilao(nomeAba, f, rotulo) {
  const ws = wb.addWorksheet(nomeAba, { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 34 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 16 }]
  titleBar(ws, rotulo, `${f.nome}  ·  ${f.local || ''}`, 8)
  const imp = N(f.receita_bula) * 0.18, desp = N(f.despesas_variaveis)
  const lucro = N(f.receita_bula) - N(f.comissao_assessoria) - imp - desp

  sectionRow(ws, 4, 'RESULTADO FINANCEIRO', 8)
  headerCells(ws, 5, ['Linha', 'Valor', '', '', '', '', '', ''])
  const fin = [
    ['Faturamento total do leilão (leiloeira)', N(f.faturamento_total_leilao)],
    ['VGV da cobertura Bula', N(f.vgv_total)],
    ['Receita Bula (0,5% do faturamento)', N(f.receita_bula)],
    ['(−) Comissão de assessores', N(f.comissao_assessoria)],
    ['(=) Sobra bruta', N(f.sobra_bruta)],
    ['(−) Imposto estimado (18%)', imp],
    ['(−) Despesas variáveis', desp],
    ['(=) Lucro líquido estimado', lucro],
  ]
  let r = 6
  fin.forEach((rowArr, idx) => {
    const row = ws.getRow(r)
    const c0 = row.getCell(1); c0.value = rowArr[0]
    const c1 = row.getCell(2); c1.value = rowArr[1]; c1.numFmt = MONEY
    const strong = idx === 4 || idx === 7 || idx === 2, green = idx === 7
    for (const c of [c0, c1]) { c.border = allBorders; c.alignment = { vertical: 'middle', horizontal: c === c0 ? 'left' : 'right', indent: c === c0 ? 1 : 0 } }
    c0.font = { name: 'Calibri', size: 10.5, bold: strong, color: { argb: 'FF222222' } }
    c1.font = { name: 'Calibri', size: 10.5, bold: strong, color: { argb: green ? GREEN : 'FF222222' } }
    if (green) c0.fill = c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6EF' } }
    else if (idx === 4) c0.fill = c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_SOFT } }
    else if (idx % 2 === 1) c0.fill = c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }
    row.height = 19; r++
  })

  r += 1
  sectionRow(ws, r, 'COMISSÕES POR ASSESSOR / PISTEIRO', 8); r++
  headerCells(ws, r, ['Assessor', 'Empresa', 'Lotes', 'Animais', 'VGV', 'Ticket médio', 'Alíquota', 'Comissão']); r++
  const ass = [...(f.por_assessor || [])].sort((a, b) => N(b.vgv) - N(a.vgv))
  const assRows = ass.map((a) => [a.nome, a.empresa || '—', Number(a.transacoes) || 0, Number(a.animais) || 0, N(a.vgv), Math.round(N(a.vgv) / (Number(a.animais) || 1)), Number(a.comissao_pct) || 0, N(a.comissao)])
  assRows.push(['TOTAL', '', ass.reduce((s, a) => s + (Number(a.transacoes) || 0), 0), ass.reduce((s, a) => s + (Number(a.animais) || 0), 0), ass.reduce((s, a) => s + N(a.vgv), 0), '', '', ass.reduce((s, a) => s + N(a.comissao), 0)])
  r = dataTable(ws, r, assRows, ['text', 'text', 'int', 'int', 'money', 'money', 'pct', 'money'], { totalRows: [assRows.length - 1] })

  r += 2
  sectionRow(ws, r, 'PRINCIPAIS COMPRADORES (cobertura Bula)', 8); r++
  headerCells(ws, r, ['#', 'Comprador', 'Lotes', 'Animais', 'VGV', '', '', '']); r++
  const comp = [...(f.compradores || [])].sort((a, b) => N(b.vgv) - N(a.vgv))
  r = dataTable(ws, r, comp.map((c, i) => [i + 1, c.comprador, Number(c.lotes) || 0, Number(c.animais) || 0, N(c.vgv)]), ['int', 'text', 'int', 'int', 'money'])

  r += 2
  sectionRow(ws, r, 'LANCES ITEMIZADOS (cobertura Bula)', 8); r++
  headerCells(ws, r, ['Lote', 'Comprador', 'Animais', 'VGV', 'Assessor', 'Empresa', 'Vendedor', '']); r++
  const lances = [...(f.lances || [])].sort((a, b) => N(b.vgv) - N(a.vgv))
  r = dataTable(ws, r, lances.map((l) => [l.lote, l.comprador, Number(l.animais) || 0, N(l.vgv), l.assessor, l.empresa || '', l.vendedor || '', '']), ['text', 'text', 'int', 'money', 'text', 'text', 'text', 'text'])
  ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 2 }]
}

function abaComissoes() {
  const ws = wb.addWorksheet('Comissões a Pagar', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 30 }, { width: 26 }, { width: 22 }, { width: 40 }, { width: 16 }, { width: 12 }, { width: 30 }]
  titleBar(ws, 'COMISSÕES A PAGAR — LEILÕES JMP', 'Contas a pagar lançadas no ERP · vencimento 25/07/2026 · categoria Comissão Funcionário', 7)
  sectionRow(ws, 4, 'LANÇAMENTOS', 7)
  headerCells(ws, 5, ['Fornecedor (assessor)', 'Centro de custo', 'Leilão', 'Descrição', 'Valor', 'Status', 'Documento'])
  const rows = [...D.comissoes].sort((a, b) => N(b.valor) - N(a.valor)).map((c) => [
    c.fornecedor?.nome || '—', c.centro ? `${c.centro.codigo} ${c.centro.nome}` : '—',
    /TOUROS/i.test(c.numero_documento) ? 'Touros 14/06' : 'Bezerras/Fêmeas 13/06',
    c.descricao, N(c.valor), c.status, c.numero_documento,
  ])
  rows.push(['TOTAL', '', '', '', D.comissoes.reduce((s, c) => s + N(c.valor), 0), '', ''])
  dataTable(ws, 6, rows, ['text', 'text', 'text', 'text', 'money', 'text', 'text'], { totalRows: [rows.length - 1] })
  ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 5 }]
}

function abaReceber() {
  const ws = wb.addWorksheet('Contas a Receber', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 44 }, { width: 22 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 30 }]
  titleBar(ws, 'CONTAS A RECEBER — LEILÕES JMP', 'Receita Bula = 0,5% do faturamento total · cliente Programa Leilões · vencimento D+45', 6)
  sectionRow(ws, 4, 'LANÇAMENTOS', 6)
  headerCells(ws, 5, ['Descrição', 'Cliente', 'Vencimento', 'Valor', 'Status', 'Documento'])
  const rows = [...D.receber].sort((a, b) => N(b.valor) - N(a.valor)).map((c) => [c.descricao, c.cliente?.nome || '—', c.vencimento, N(c.valor), c.status, c.numero_documento])
  rows.push(['TOTAL', '', '', D.receber.reduce((s, c) => s + N(c.valor), 0), '', ''])
  dataTable(ws, 6, rows, ['text', 'text', 'text', 'money', 'text', 'text'], { totalRows: [rows.length - 1] })
  ws.views = [{ showGridLines: false, state: 'frozen', ySplit: 5 }]
}

function abaFaturamento() {
  const ws = wb.addWorksheet('Faturamento Leiloeira', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 34 }, { width: 16 }, { width: 20 }, { width: 22 }]
  titleBar(ws, 'FATURAMENTO DA LEILOEIRA — COMPARATIVO NELORE JMP', 'Fonte: "Somatória – Leilões JMP 2026" (Programa Leilões)', 4)
  sectionRow(ws, 4, 'FÊMEAS / BEZERRAS — 13/06', 4)
  headerCells(ws, 5, ['Categoria', 'Qtd', 'Média', 'Total'])
  let r = dataTable(ws, 6, [
    ['Fêmeas', 35.5, 144507.04, 5130000],
    ['Fêmeas – MULT', 53, 42709.43, 2263600],
    ['Fêmeas – MEGA LOTES', 144, 25022.22, 3603200],
    ['TOTAL FÊMEAS', 232.5, 47298.06, 10996800],
  ], ['text', 'int', 'money', 'money'], { totalRows: [3] })
  r += 1
  sectionRow(ws, r, 'MACHOS / TOUROS — 14/06', 4); r++
  headerCells(ws, r, ['Categoria', 'Qtd', 'Média', 'Total']); r++
  r = dataTable(ws, r, [
    ['Machos', 176, 33279.55, 5857200],
    ['Machos – MULT (QUAD)', 292, 21642.47, 6319600],
    ['Machos – MEGA LOTES', 449, 18106.01, 8129600],
    ['Machos – CENTRAL', 5.5, 398545.45, 2192000],
    ['TOTAL MACHOS', 922.5, 24388.51, 22498400],
  ], ['text', 'int', 'money', 'money'], { totalRows: [4] })
  r += 1
  r = dataTable(ws, r, [['SOMATÓRIA 2026', 1155, 29000.17, 33495200]], ['text', 'int', 'money', 'money'], { totalRows: [0] })
  r += 1
  sectionRow(ws, r, 'ALCANCE', 4); r++
  const alcance = [['Compradores únicos (fêmeas + machos)', 162, 'int'], ['Estados alcançados', 17, 'int'], ['Crescimento faturamento (comparativo)', 0.1647, 'pct']]
  alcance.forEach((rowArr, idx) => {
    const row = ws.getRow(r)
    const c0 = row.getCell(1); c0.value = rowArr[0]
    const c1 = row.getCell(2); c1.value = rowArr[1]; c1.numFmt = rowArr[2] === 'pct' ? PCT : INT
    for (const c of [c0, c1]) { c.border = allBorders; c.font = { name: 'Calibri', size: 10, color: { argb: 'FF222222' } } }
    c0.alignment = { horizontal: 'left', indent: 1, vertical: 'middle' }
    c1.alignment = { horizontal: 'right', vertical: 'middle' }
    if (idx % 2 === 1) c0.fill = c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }
    row.height = 18; r++
  })
}

abaResumo()
abaLeilao('Touros 14-06', fTouros, 'LEILÃO JMP — TOUROS (14/06/2026)')
abaLeilao('Bezerras 13-06', fBez, 'LEILÃO JMP — BEZERRAS/FÊMEAS (13/06/2026)')
abaComissoes()
abaReceber()
abaFaturamento()

const fname = join(root, 'Fechamento_Leiloes_JMP_2026.xlsx')
await wb.xlsx.writeFile(fname)
console.log('OK ->', fname)
