/**
 * FINANCEIRO FAZENDA — planilha de controle (XLSX) a partir de dados.json.
 *
 * A planilha é VIVA: Resumo, Acerto e Animais somam a aba Lançamentos por
 * fórmula (SUMIFS/SUMPRODUCT). Quem for alimentar o controle só acrescenta
 * linhas em Lançamentos — nada de mexer nas abas de resumo.
 *
 *   node scripts/fazenda/gera-xlsx-financeiro-fazenda.mjs
 *   → outputs/financeiro-fazenda/Controle Financeiro Fazenda.xlsx
 */
import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'

const OUT = 'outputs/financeiro-fazenda'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))
const EXPORT_TXT = process.argv[2] || ''   // caminho do .txt exportado do WhatsApp (opcional)

const BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
const PCT = '0.0%'
const DATA = 'dd/mm/yyyy'
const INK = 'FF0A0A0A', WHITE = 'FFFFFFFF', GRID = 'FFD9D9D9', SOFT = 'FFF3F3F3', GREEN = 'FF1B5E20', GREEN_SOFT = 'FFE8F5E9', AMBER_SOFT = 'FFFFF4E0', RED_SOFT = 'FFFDECEA', BLUE_SOFT = 'FFE7F0FA'
const nomeDe = id => (D.membros.find(m => m.id === id) || {}).nome || id || ''
const catDe = id => (D.categorias.find(c => c.id === id) || {}).nome || id || ''
const dt = s => s ? new Date(`${s.slice(0, 10)}T12:00:00Z`) : null
const STATUS_LABEL = { pago: 'Pago', comprometido: 'Comprometido', pendente: 'A pagar' }

const wb = new ExcelJS.Workbook()
wb.creator = 'Financeiro Fazenda'
wb.created = new Date(D.geradoEm)

/* resultados em cache: o Excel recalcula ao abrir, mas visualizadores que não
 * calculam (preview do Windows, Drive, celular) já mostram os números certos */
const T = D.totais
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const PADRAO = { marcelo: 0.5, matheus: 0.5, mafe: 0, joao: 0 }
const resAcerto = Object.fromEntries(D.membros.map(m => [m.id, r2(T.porPagador[m.id] - (PADRAO[m.id] ?? 0) * T.pago)]))
const catRes = id => D.porCategoria.find(c => c.id === id) || { pago: 0, comprometido: 0, pendente: 0 }
const ORDEM = ['Resumo', 'Lançamentos', 'Pendências', 'Acerto', 'Animais', 'Fornecedores', 'Categorias', 'Histórico do grupo']

/* ── helpers de estilo ───────────────────────────────────────────────────── */
const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } })
const thin = { style: 'thin', color: { argb: GRID } }
const border = { top: thin, left: thin, bottom: thin, right: thin }
function header(ws, row, cols, opts = {}) {
  const r = ws.getRow(row)
  cols.forEach((c, i) => {
    const cell = r.getCell(i + 1)
    cell.value = c
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 }
    cell.fill = fill(opts.cor || INK)
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = border
  })
  r.height = opts.altura || 30
}
function titulo(ws, texto, sub) {
  ws.getCell('A1').value = texto
  ws.getCell('A1').font = { bold: true, size: 16 }
  ws.getRow(1).height = 26
  if (sub) { ws.getCell('A2').value = sub; ws.getCell('A2').font = { size: 9, color: { argb: 'FF6E6E6E' }, italic: true } }
}
function secao(ws, row, texto, span = 6) {
  ws.mergeCells(row, 1, row, span)
  const c = ws.getCell(row, 1)
  c.value = texto
  c.font = { bold: true, size: 11, color: { argb: WHITE } }
  c.fill = fill(GREEN)
  c.alignment = { vertical: 'middle' }
  ws.getRow(row).height = 20
}
function bodyRow(ws, row, ncols, opts = {}) {
  const r = ws.getRow(row)
  for (let i = 1; i <= ncols; i++) {
    const cell = r.getCell(i)
    cell.border = border
    cell.alignment = { vertical: 'top', wrapText: true, ...(cell.alignment || {}) }
    if (opts.zebra && row % 2 === 0) cell.fill = fill(SOFT)
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1 · LANÇAMENTOS (a tabela-mãe)
 * ═══════════════════════════════════════════════════════════════════════════ */
const L = wb.addWorksheet('Lançamentos', { views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }] })
titulo(L, 'LANÇAMENTOS — todas as despesas da fazenda', 'Uma linha por despesa. Se dois pagaram a mesma conta, use as colunas Pagou 1 / Pagou 2. Status: Pago = dinheiro saiu · Comprometido = fechado, ainda vai sair · A pagar = saldo devido. Comprovante = nome do arquivo na pasta "03 - Comprovantes".')
const LCOLS = ['Nº', 'Data', 'Status', 'Categoria', 'Descrição', 'Fornecedor / beneficiário', 'Local', 'Documento', 'Lote', 'Valor (R$)', 'Pagou 1', 'Valor 1 (R$)', 'Forma 1', 'Pagou 2', 'Valor 2 (R$)', 'Forma 2', 'Pagador presumido?', 'Comprovante (arquivo)', 'Postado por', 'Postado em', 'Observações']
header(L, 4, LCOLS)
const LW = [5, 11, 13, 26, 52, 30, 20, 20, 10, 14, 12, 13, 22, 12, 13, 18, 11, 40, 12, 16, 60]
LW.forEach((w, i) => { L.getColumn(i + 1).width = w })
const NOMES = D.membros.map(m => m.nome)
let r = 5
const ordenados = [...D.lancamentos].sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id)
for (const l of ordenados) {
  const [p1, p2] = l.pagamentos
  const row = L.getRow(r)
  row.values = [
    l.id, dt(l.data), STATUS_LABEL[l.status], catDe(l.categoria), l.descricao, l.fornecedor, l.local || '', l.documento || '', l.lote || '',
    l.valor,
    p1 ? nomeDe(p1.quem) : '', p1 ? p1.valor : null, p1 ? p1.forma : '',
    p2 ? nomeDe(p2.quem) : '', p2 ? p2.valor : null, p2 ? p2.forma : '',
    l.pagamentos.some(p => p.presumido) ? 'sim' : '',
    (l.comprovante || []).map(f => D.arquivos?.[f] || f).join(' ; '),
    nomeDe(l.postadoPor), l.postadoEm, l.obs || '',
  ]
  row.getCell(2).numFmt = DATA
  for (const c of [10, 12, 15]) row.getCell(c).numFmt = BRL
  bodyRow(L, r, LCOLS.length, { zebra: true })
  row.getCell(1).alignment = { horizontal: 'center', vertical: 'top' }
  row.getCell(3).alignment = { horizontal: 'center', vertical: 'top' }
  const st = row.getCell(3)
  st.fill = fill(l.status === 'pago' ? GREEN_SOFT : l.status === 'comprometido' ? AMBER_SOFT : RED_SOFT)
  st.font = { bold: true, color: { argb: l.status === 'pago' ? GREEN : l.status === 'comprometido' ? 'FF8A5A00' : 'FFB3261E' } }
  if (row.getCell(17).value === 'sim') row.getCell(17).fill = fill(AMBER_SOFT)
  r++
}
const L_FIRST = 5, L_LAST = r - 1
// linhas em branco já formatadas para a próxima despesa (com as mesmas validações)
const L_TEMPLATE_END = L_LAST + 200
for (let i = L_LAST + 1; i <= L_TEMPLATE_END; i++) {
  const row = L.getRow(i)
  row.getCell(2).numFmt = DATA
  for (const c of [10, 12, 15]) row.getCell(c).numFmt = BRL
}
// validações (listas suspensas) para a tabela inteira, inclusive linhas vazias
L.dataValidations.add(`C${L_FIRST}:C${L_TEMPLATE_END}`, { type: 'list', allowBlank: true, formulae: ['"Pago,Comprometido,A pagar"'], showErrorMessage: true, errorTitle: 'Status', error: 'Use Pago, Comprometido ou A pagar.' })
L.dataValidations.add(`D${L_FIRST}:D${L_TEMPLATE_END}`, { type: 'list', allowBlank: true, formulae: [`=Categorias!$A$5:$A$${4 + D.categorias.length}`], showErrorMessage: true, errorTitle: 'Categoria', error: 'Escolha uma categoria da aba Categorias (ou cadastre lá primeiro).' })
L.dataValidations.add(`K${L_FIRST}:K${L_TEMPLATE_END}`, { type: 'list', allowBlank: true, formulae: [`=Acerto!$A$6:$A$${5 + D.membros.length}`] })
L.dataValidations.add(`N${L_FIRST}:N${L_TEMPLATE_END}`, { type: 'list', allowBlank: true, formulae: [`=Acerto!$A$6:$A$${5 + D.membros.length}`] })
L.autoFilter = { from: { row: 4, column: 1 }, to: { row: L_TEMPLATE_END, column: LCOLS.length } }
// total vivo no topo (SUBTOTAL respeita o filtro)
L.getCell('I3').value = 'Total filtrado:'
L.getCell('I3').font = { bold: true }
L.getCell('I3').alignment = { horizontal: 'right' }
L.getCell('J3').value = { formula: `SUBTOTAL(109,J${L_FIRST}:J${L_TEMPLATE_END})`, result: T.geral }
L.getCell('J3').numFmt = BRL
L.getCell('J3').font = { bold: true }
L.getCell('L3').value = { formula: `SUBTOTAL(109,L${L_FIRST}:L${L_TEMPLATE_END})`, result: r2(D.lancamentos.flatMap(l => l.pagamentos.slice(0, 1)).reduce((x, p) => x + p.valor, 0)) }
L.getCell('L3').numFmt = BRL
L.getCell('O3').value = { formula: `SUBTOTAL(109,O${L_FIRST}:O${L_TEMPLATE_END})`, result: r2(D.lancamentos.flatMap(l => l.pagamentos.slice(1, 2)).reduce((x, p) => x + p.valor, 0)) }
L.getCell('O3').numFmt = BRL
// checagem: Valor 1 + Valor 2 tem que bater com Valor quando Status = Pago
L.getCell('P3').value = { formula: `IF(ROUND(SUMPRODUCT((C${L_FIRST}:C${L_TEMPLATE_END}="Pago")*(J${L_FIRST}:J${L_TEMPLATE_END}-L${L_FIRST}:L${L_TEMPLATE_END}-O${L_FIRST}:O${L_TEMPLATE_END})),2)=0,"✔ pagamentos batem com os valores","⚠ há linha Pago cujo Valor 1 + Valor 2 ≠ Valor")`, result: '✔ pagamentos batem com os valores' }
L.getCell('P3').font = { italic: true, size: 9 }
L.mergeCells('P3:U3')

const RANGE = col => `Lançamentos!$${col}$${L_FIRST}:$${col}$${L_TEMPLATE_END}`
const R = { status: RANGE('C'), cat: RANGE('D'), valor: RANGE('J'), p1: RANGE('K'), v1: RANGE('L'), p2: RANGE('N'), v2: RANGE('O'), lote: RANGE('I'), data: RANGE('B') }

/* ═══════════════════════════════════════════════════════════════════════════
 * 2 · RESUMO
 * ═══════════════════════════════════════════════════════════════════════════ */
const S = wb.addWorksheet('Resumo', { views: [{ showGridLines: false }] })
titulo(S, 'FINANCEIRO FAZENDA — RESUMO', `Fazenda em ${D.fazenda.local} · período ${D.periodo.de.split('-').reverse().join('/')} a ${D.periodo.ate.split('-').reverse().join('/')} · fonte: grupo de WhatsApp "${D.grupo.nome}" (export de 15/09/2026). Tudo aqui é fórmula sobre a aba Lançamentos.`)
S.getColumn(1).width = 44; S.getColumn(2).width = 18; S.getColumn(3).width = 18; S.getColumn(4).width = 18; S.getColumn(5).width = 18; S.getColumn(6).width = 60
let s = 4
secao(S, s++, 'POSIÇÃO GERAL')
const kv = (k, f, fmt = BRL, nota = '', res) => {
  S.getCell(s, 1).value = k
  S.getCell(s, 2).value = typeof f === 'string' ? { formula: f, result: res } : f
  S.getCell(s, 2).numFmt = fmt
  S.getCell(s, 2).font = { bold: true }
  S.getCell(s, 6).value = nota
  S.getCell(s, 6).font = { size: 9, color: { argb: 'FF6E6E6E' } }
  bodyRow(S, s, 2)
  s++
}
kv('Total já pago (dinheiro que saiu)', `SUMIFS(${R.valor},${R.status},"Pago")`, BRL, 'soma dos lançamentos com Status = Pago', T.pago)
kv('Comprometido (fechado, ainda vai sair)', `SUMIFS(${R.valor},${R.status},"Comprometido")`, BRL, 'box do banheiro em 7x', T.comprometido)
kv('A pagar (saldos devidos)', `SUMIFS(${R.valor},${R.status},"A pagar")`, BRL, 'saldo das bezerras de JP + saldo da MH Leilões', T.pendente)
kv('TOTAL DA OPERAÇÃO (pago + comprometido + a pagar)', `B${s - 3}+B${s - 2}+B${s - 1}`, BRL, '', T.geral)
S.getCell(s - 1, 1).font = { bold: true }
s++
secao(S, s++, 'QUEM PAGOU O QUÊ (só o que já saiu)')
header(S, s++, ['Pessoa', 'Pagou (R$)', '% do total', '', '', 'Como'], { cor: 'FF3A3A3A', altura: 18 })
const primeiraPessoa = s
for (const m of D.membros) {
  S.getCell(s, 1).value = m.nome
  S.getCell(s, 2).value = { formula: `SUMIFS(${R.v1},${R.p1},A${s},${R.status},"Pago")+SUMIFS(${R.v2},${R.p2},A${s},${R.status},"Pago")`, result: T.porPagador[m.id] }
  S.getCell(s, 2).numFmt = BRL
  S.getCell(s, 3).value = { formula: `IF($B$${primeiraPessoa + D.membros.length}=0,0,B${s}/$B$${primeiraPessoa + D.membros.length})`, result: T.pago ? T.porPagador[m.id] / T.pago : 0 }
  S.getCell(s, 3).numFmt = PCT
  S.getCell(s, 6).value = m.papel
  S.getCell(s, 6).font = { size: 9, color: { argb: 'FF6E6E6E' } }
  bodyRow(S, s, 3, { zebra: true }); s++
}
S.getCell(s, 1).value = 'Total'; S.getCell(s, 1).font = { bold: true }
S.getCell(s, 2).value = { formula: `SUM(B${primeiraPessoa}:B${s - 1})`, result: T.pago }; S.getCell(s, 2).numFmt = BRL; S.getCell(s, 2).font = { bold: true }
S.getCell(s, 3).value = { formula: `SUM(C${primeiraPessoa}:C${s - 1})`, result: 1 }; S.getCell(s, 3).numFmt = PCT
bodyRow(S, s, 3); s += 2

secao(S, s++, 'POR CATEGORIA')
header(S, s++, ['Categoria', 'Pago (R$)', 'Comprometido (R$)', 'A pagar (R$)', 'Total (R$)', 'Grupo'], { cor: 'FF3A3A3A', altura: 18 })
const primeiraCat = s
for (const c of D.categorias) {
  S.getCell(s, 1).value = c.nome
  const cr = catRes(c.id)
  S.getCell(s, 2).value = { formula: `SUMIFS(${R.valor},${R.cat},A${s},${R.status},"Pago")`, result: cr.pago }
  S.getCell(s, 3).value = { formula: `SUMIFS(${R.valor},${R.cat},A${s},${R.status},"Comprometido")`, result: cr.comprometido }
  S.getCell(s, 4).value = { formula: `SUMIFS(${R.valor},${R.cat},A${s},${R.status},"A pagar")`, result: cr.pendente }
  S.getCell(s, 5).value = { formula: `B${s}+C${s}+D${s}`, result: r2(cr.pago + cr.comprometido + cr.pendente) }
  for (const k of [2, 3, 4, 5]) S.getCell(s, k).numFmt = BRL
  S.getCell(s, 5).font = { bold: true }
  S.getCell(s, 6).value = c.grupo
  bodyRow(S, s, 6, { zebra: true }); s++
}
S.getCell(s, 1).value = 'Total'; S.getCell(s, 1).font = { bold: true }
for (const k of [2, 3, 4, 5]) { const col = String.fromCharCode(64 + k); S.getCell(s, k).value = { formula: `SUM(${col}${primeiraCat}:${col}${s - 1})`, result: [T.pago, T.comprometido, T.pendente, T.geral][k - 2] }; S.getCell(s, k).numFmt = BRL; S.getCell(s, k).font = { bold: true } }
bodyRow(S, s, 6); s += 2

secao(S, s++, 'REBANHO — o que os animais custaram até chegar na fazenda')
kv('Valor dos 3 lotes de bezerras (JP + Pompeu 1 + Pompeu 2)', `Animais!F${4 + D.lotes.length + 1}`, BRL, 'aba Animais', T.animais.lotes)
kv('   já pago', `SUMIFS(${R.valor},${R.cat},"Animais — compra",${R.status},"Pago")`, BRL, '', T.animais.pago)
kv('   saldo a pagar', `SUMIFS(${R.valor},${R.cat},"Animais — compra",${R.status},"A pagar")`, BRL, '', T.animais.saldo)
kv('Comissão de compra paga', `SUMIFS(${R.valor},${R.cat},"Animais — comissão de compra",${R.status},"Pago")`, BRL, 'Sindicato Rural de JP, 2,5%; Pompeu 1 já veio com comissão inclusa', T.animais.comissao)
kv('Frete e pedágio pagos', `SUMIFS(${R.valor},${R.cat},"Animais — frete e pedágio",${R.status},"Pago")`, BRL, '', T.animais.frete)
kv('CUSTO TOTAL DOS ANIMAIS POSTOS NA FAZENDA', `B${s - 5}+B${s - 2}+B${s - 1}`, BRL, 'lotes + comissão + frete — sem contar ração, sanidade e brincos', T.animais.custoTotal)
S.getCell(s - 1, 1).font = { bold: true }
kv('Nº de cabeças (preencher na aba Animais)', `IF(SUM(Animais!L5:L${4 + D.lotes.length})=0,"— informar —",SUM(Animais!L5:L${4 + D.lotes.length}))`, '0', 'o grupo não diz quantas cabeças vieram em cada lote', '— informar —')
kv('Custo por cabeça', `IF(ISNUMBER(B${s - 1}),B${s - 2}/B${s - 1},"—")`, BRL, 'custo total ÷ cabeças', '—')
s++
secao(S, s++, 'LINHA DO TEMPO DO GRUPO')
for (const [q, t] of D.timeline) {
  S.getCell(s, 1).value = q; S.getCell(s, 1).font = { bold: true }
  S.mergeCells(s, 2, s, 6)
  S.getCell(s, 2).value = t
  S.getCell(s, 2).alignment = { wrapText: true, vertical: 'top' }
  S.getRow(s).height = Math.max(16, Math.ceil(t.length / 110) * 14)
  s++
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3 · ACERTO ENTRE SÓCIOS
 * ═══════════════════════════════════════════════════════════════════════════ */
const A = wb.addWorksheet('Acerto', { views: [{ showGridLines: false }] })
titulo(A, 'ACERTO ENTRE SÓCIOS', 'O grupo NÃO definiu como as despesas se dividem. Os percentuais em amarelo são PARÂMETRO — ajuste conforme o combinado; o resto recalcula sozinho. Base = só o que já foi pago (Status = Pago).')
A.getColumn(1).width = 38; A.getColumn(2).width = 14; A.getColumn(3).width = 18; A.getColumn(4).width = 18; A.getColumn(5).width = 18; A.getColumn(6).width = 50
secao(A, 4, 'PARTICIPAÇÃO E SALDO', 6)
header(A, 5, ['Pessoa', '% participação', 'Pagou (R$)', 'Cota devida (R$)', 'Saldo (R$)', 'Leitura'], { cor: 'FF3A3A3A', altura: 22 })
let a = 6
const a0 = a
for (const m of D.membros) {
  A.getCell(a, 1).value = m.nome
  A.getCell(a, 2).value = PADRAO[m.id] ?? 0
  A.getCell(a, 2).numFmt = PCT
  A.getCell(a, 2).fill = fill('FFFFF2B3')
  A.getCell(a, 2).font = { bold: true }
  A.getCell(a, 3).value = { formula: `SUMIFS(${R.v1},${R.p1},A${a},${R.status},"Pago")+SUMIFS(${R.v2},${R.p2},A${a},${R.status},"Pago")`, result: T.porPagador[m.id] }
  A.getCell(a, 4).value = { formula: `B${a}*$C$${a0 + D.membros.length}`, result: r2((PADRAO[m.id] ?? 0) * T.pago) }
  A.getCell(a, 5).value = { formula: `C${a}-D${a}`, result: resAcerto[m.id] }
  for (const k of [3, 4, 5]) A.getCell(a, k).numFmt = BRL
  A.getCell(a, 5).font = { bold: true }
  A.getCell(a, 6).value = { formula: `IF(ROUND(E${a},2)>0,"tem a RECEBER dos demais (adiantou mais que a cota)",IF(ROUND(E${a},2)<0,"tem a PAGAR aos demais (pagou menos que a cota)","em dia"))`, result: resAcerto[m.id] > 0 ? 'tem a RECEBER dos demais (adiantou mais que a cota)' : resAcerto[m.id] < 0 ? 'tem a PAGAR aos demais (pagou menos que a cota)' : 'em dia' }
  A.getCell(a, 6).font = { size: 9 }
  bodyRow(A, a, 6, { zebra: true }); a++
}
A.getCell(a, 1).value = 'Total'; A.getCell(a, 1).font = { bold: true }
A.getCell(a, 2).value = { formula: `SUM(B${a0}:B${a - 1})`, result: 1 }; A.getCell(a, 2).numFmt = PCT
A.getCell(a, 3).value = { formula: `SUM(C${a0}:C${a - 1})`, result: T.pago }; A.getCell(a, 3).numFmt = BRL; A.getCell(a, 3).font = { bold: true }
A.getCell(a, 4).value = { formula: `SUM(D${a0}:D${a - 1})`, result: T.pago }; A.getCell(a, 4).numFmt = BRL
A.getCell(a, 5).value = { formula: `SUM(E${a0}:E${a - 1})`, result: 0 }; A.getCell(a, 5).numFmt = BRL
A.getCell(a, 6).value = { formula: `IF(ROUND(B${a},4)<>1,"⚠ os percentuais precisam somar 100%","✔ percentuais somam 100%")`, result: '✔ percentuais somam 100%' }
A.getCell(a, 6).font = { italic: true, size: 9 }
bodyRow(A, a, 6); a += 2
secao(A, a++, 'COMO LER', 6)
for (const t of [
  'Cota devida = % participação × total pago por todos. Saldo = o que a pessoa pagou − a cota dela. Positivo: ela adiantou dinheiro dos outros e tem a receber; negativo: deve aos demais.',
  'Padrão de partida: Marcelo 50% / Matheus 50% (são os dois que rateiam no caderno e pagam os animais). Mafê e João em 0% — assim tudo o que a Mafê adiantou para a casa aparece como "a receber". Troque se o combinado for outro.',
  'Compromissos ainda não pagos (box em 7x, saldos das bezerras) NÃO entram no acerto até virarem Status = Pago com o nome de quem pagou.',
  'Linhas marcadas "pagador presumido = sim" em Lançamentos são as que a conversa não confirma quem pagou (pedidos em dinheiro na Antero e os cupons de BH). Vale conferir antes de fechar o acerto.',
]) { A.mergeCells(a, 1, a, 6); A.getCell(a, 1).value = '• ' + t; A.getCell(a, 1).alignment = { wrapText: true, vertical: 'top' }; A.getRow(a).height = 30; a++ }
a++
secao(A, a++, 'MEMBROS DO GRUPO', 6)
header(A, a++, ['Nome no grupo', 'Telefone', 'Nome no banco / documento', '', '', 'Papel'], { cor: 'FF3A3A3A', altura: 18 })
for (const m of D.membros) {
  A.getCell(a, 1).value = m.nome; A.getCell(a, 2).value = m.telefone; A.mergeCells(a, 3, a, 5); A.getCell(a, 3).value = m.nomeBanco; A.getCell(a, 6).value = m.papel
  A.getCell(a, 6).alignment = { wrapText: true, vertical: 'top' }; A.getRow(a).height = 30
  bodyRow(A, a, 6, { zebra: true }); a++
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 4 · PENDÊNCIAS
 * ═══════════════════════════════════════════════════════════════════════════ */
const P = wb.addWorksheet('Pendências', { views: [{ state: 'frozen', ySplit: 4 }] })
titulo(P, 'PENDÊNCIAS — o que ainda vai sair do caixa ou precisa de decisão', 'A parte de cima vem de Lançamentos (Status ≠ Pago). A de baixo são orçamentos e decisões em aberto no grupo, sem valor fechado. Preencha Prazo e marque Feito quando resolver.')
const PCOLS = ['Item', 'Situação hoje', 'Valor (R$)', 'Prazo / vencimento', 'Responsável', 'Próximo passo', 'Feito?']
header(P, 4, PCOLS)
;[52, 60, 14, 16, 16, 44, 8].forEach((w, i) => { P.getColumn(i + 1).width = w })
let p = 5
for (const l of ordenados.filter(l => l.status !== 'pago')) {
  P.getRow(p).values = [l.descricao, `${STATUS_LABEL[l.status]} · ${l.fornecedor}` + (l.obs ? ` — ${l.obs}` : ''), l.valor, '', nomeDe(l.postadoPor === 'mafe' ? 'mafe' : 'marcelo'), l.status === 'pendente' ? 'Combinar a data e registrar o pagamento em Lançamentos (Status → Pago, com quem pagou).' : 'Definir quem paga as parcelas e registrar cada uma em Lançamentos.', '']
  P.getCell(p, 3).numFmt = BRL
  P.getCell(p, 3).fill = fill(l.status === 'pendente' ? RED_SOFT : AMBER_SOFT)
  bodyRow(P, p, PCOLS.length, { zebra: false }); P.getRow(p).height = 42; p++
}
P.getCell(p, 1).value = 'Total com valor definido'; P.getCell(p, 1).font = { bold: true }
P.getCell(p, 3).value = { formula: `SUM(C5:C${p - 1})`, result: T.aPagar }; P.getCell(p, 3).numFmt = BRL; P.getCell(p, 3).font = { bold: true }
bodyRow(P, p, PCOLS.length); p += 2
secao(P, p++, 'ORÇAMENTOS E DECISÕES EM ABERTO (sem valor fechado)', PCOLS.length)
for (const o of D.orcamentos) {
  P.getRow(p).values = [o.item, o.situacao, o.valorRef, '', nomeDe(o.responsavel), o.proximoPasso, '']
  if (o.valorRef != null) { P.getCell(p, 3).numFmt = BRL; P.getCell(p, 3).fill = fill(BLUE_SOFT) }
  bodyRow(P, p, PCOLS.length); P.getRow(p).height = 54; p++
}
P.getCell(p + 1, 1).value = 'Valores em azul são referência (custo da visita de orçamento, cotação), não compromisso.'
P.getCell(p + 1, 1).font = { italic: true, size: 9, color: { argb: 'FF6E6E6E' } }
P.dataValidations.add(`G5:G${p}`, { type: 'list', allowBlank: true, formulae: ['"sim,não"'] })

/* ═══════════════════════════════════════════════════════════════════════════
 * 5 · ANIMAIS (lotes)
 * ═══════════════════════════════════════════════════════════════════════════ */
const N = wb.addWorksheet('Animais', { views: [{ state: 'frozen', ySplit: 4 }] })
titulo(N, 'ANIMAIS — lotes de bezerras comerciais', 'Pago e Saldo vêm de Lançamentos pela coluna Lote. Preencha o Nº de cabeças (amarelo) para ter o custo por cabeça — o grupo não informa a quantidade.')
const NCOLS = ['Lote', 'Descrição', 'Origem', 'Vendedor', 'Data', 'Valor do lote (R$)', 'Pago (R$)', 'Saldo (R$)', 'Comissão (R$)', 'Frete e pedágio (R$)', 'Custo total (R$)', 'Nº cabeças', 'Custo / cabeça (R$)', 'Observações']
header(N, 4, NCOLS)
;[11, 40, 30, 26, 11, 16, 16, 16, 14, 16, 16, 10, 16, 50].forEach((w, i) => { N.getColumn(i + 1).width = w })
let n = 5
for (const lt of D.lotes) {
  const freteLote = lt.frete != null ? lt.frete : (lt.id === 'POMPEU-1' ? D.fretePompeu : 0)
  N.getRow(n).values = [lt.id, lt.descricao, lt.origem, lt.vendedor, dt(lt.data), lt.valor, null, null, lt.comissao, freteLote, null, lt.cabecas, null,
    [lt.comissaoObs && `Comissão: ${lt.comissaoObs}`, lt.freteObs && `Frete: ${lt.freteObs}`].filter(Boolean).join(' · ')]
  N.getCell(n, 5).numFmt = DATA
  const pagoLote = r2(D.lancamentos.filter(l => l.lote === lt.id && l.categoria === 'animais_compra' && l.status === 'pago').reduce((x, l) => x + l.valor, 0))
  N.getCell(n, 7).value = { formula: `SUMIFS(${R.valor},${R.lote},A${n},${R.cat},"Animais — compra",${R.status},"Pago")`, result: pagoLote }
  N.getCell(n, 8).value = { formula: `F${n}-G${n}`, result: r2(lt.valor - pagoLote) }
  N.getCell(n, 11).value = { formula: `F${n}+I${n}+J${n}`, result: r2(lt.valor + lt.comissao + freteLote) }
  N.getCell(n, 12).fill = fill('FFFFF2B3')
  N.getCell(n, 13).value = { formula: `IF(N(L${n})>0,K${n}/L${n},"—")`, result: '—' }
  for (const k of [6, 7, 8, 9, 10, 11, 13]) N.getCell(n, k).numFmt = BRL
  N.getCell(n, 8).font = { bold: true, color: { argb: 'FFB3261E' } }
  N.getCell(n, 11).font = { bold: true }
  bodyRow(N, n, NCOLS.length, { zebra: true }); N.getRow(n).height = 32; n++
}
N.getCell(n, 1).value = 'Total'; N.getCell(n, 1).font = { bold: true }
const totLote = [T.animais.lotes, T.animais.pago, T.animais.saldo, T.animais.comissao, T.animais.frete, T.animais.custoTotal, 0]
for (const k of [6, 7, 8, 9, 10, 11, 12]) { const col = String.fromCharCode(64 + k); N.getCell(n, k).value = { formula: `SUM(${col}5:${col}${n - 1})`, result: totLote[k - 6] }; N.getCell(n, k).numFmt = k === 12 ? '0' : BRL; N.getCell(n, k).font = { bold: true } }
N.getCell(n, 13).value = { formula: `IF(N(L${n})>0,K${n}/L${n},"—")`, result: '—' }; N.getCell(n, 13).numFmt = BRL
bodyRow(N, n, NCOLS.length)
N.getCell(n + 2, 1).value = 'O frete de Pompeu (1.250,00, pago pelo Matheus em 14/09) atendeu os dois lotes do leilão; está lançado no lote POMPEU-1 para não contar duas vezes.'
N.getCell(n + 2, 1).font = { italic: true, size: 9, color: { argb: 'FF6E6E6E' } }

/* ═══════════════════════════════════════════════════════════════════════════
 * 6 · FORNECEDORES
 * ═══════════════════════════════════════════════════════════════════════════ */
const F = wb.addWorksheet('Fornecedores', { views: [{ state: 'frozen', ySplit: 4 }] })
titulo(F, 'FORNECEDORES E CONTATOS', 'Como aparecem nos comprovantes. Chaves PIX copiadas dos recibos — confira antes de pagar de novo.')
const FCOLS = ['Nome', 'O que fornece / papel', 'CNPJ / CPF', 'Contato', 'PIX', 'Observações']
header(F, 4, FCOLS)
;[40, 34, 24, 44, 46, 44].forEach((w, i) => { F.getColumn(i + 1).width = w })
let f = 5
for (const x of D.fornecedores) { F.getRow(f).values = [x.nome, x.tipo, x.doc, x.contato, x.pix, x.obs]; bodyRow(F, f, FCOLS.length, { zebra: true }); f++ }

/* ═══════════════════════════════════════════════════════════════════════════
 * 7 · CATEGORIAS
 * ═══════════════════════════════════════════════════════════════════════════ */
const C = wb.addWorksheet('Categorias')
titulo(C, 'CATEGORIAS', 'Alimentam a lista suspensa de Lançamentos e a tabela do Resumo. Para criar uma nova, acrescente aqui E na tabela "Por categoria" do Resumo.')
header(C, 4, ['Categoria', 'Grupo', 'Exemplos'])
;[34, 14, 70].forEach((w, i) => { C.getColumn(i + 1).width = w })
const EX = { animais_compra: 'lotes de bezerras, touros, vacas', animais_comissao: 'sindicato rural, leiloeira, corretor', animais_frete: 'caminhão boiadeiro, pedágio', racao: 'sacos de ração, sal mineral, suplemento', sanidade: 'vermífugo, vacinas, agulhas, pistola, botina, chicote', identificacao: 'brincos, aplicador', maquinas: 'motosserra, roçadeira, furadeira, ferramentas', casa_mercado: 'mercado, limpeza, utensílios de cozinha', casa_reforma: 'chuveiro, box, janela, ar-condicionado, cortina', mao_de_obra: 'salário, encargos, diária' }
let c = 5
for (const x of D.categorias) { C.getRow(c).values = [x.nome, x.grupo, EX[x.id] || '']; bodyRow(C, c, 3, { zebra: true }); c++ }

/* ═══════════════════════════════════════════════════════════════════════════
 * 8 · HISTÓRICO DO GRUPO (o .txt exportado, linha a linha)
 * ═══════════════════════════════════════════════════════════════════════════ */
if (EXPORT_TXT && fs.existsSync(EXPORT_TXT)) {
  const H = wb.addWorksheet('Histórico do grupo', { views: [{ state: 'frozen', ySplit: 4 }] })
  titulo(H, 'HISTÓRICO DO GRUPO — export do WhatsApp (15/09/2026)', 'Cada linha é uma mensagem. Anexo = arquivo na pasta "03 - Comprovantes" (nome original do WhatsApp entre parênteses).')
  header(H, 4, ['Data', 'Hora', 'Autor', 'Mensagem', 'Anexo (original)', 'Anexo (na pasta)'])
  ;[11, 7, 24, 90, 26, 60].forEach((w, i) => { H.getColumn(i + 1).width = w })
  const linhas = fs.readFileSync(EXPORT_TXT, 'utf8').replace(/‎/g, '').split(/\r?\n/)
  const re = /^(\d{2}\/\d{2}\/\d{4}) (\d{2}:\d{2}) - (?:([^:]+?): )?(.*)$/
  let h = 5, cur = null
  const flush = () => { if (!cur) return; H.getRow(h).values = [cur.data, cur.hora, cur.autor, cur.texto.trim(), cur.anexo, cur.anexo ? (D.arquivos?.[cur.anexo] || '') : '']; bodyRow(H, h, 6, { zebra: true }); if (cur.texto.length > 90) H.getRow(h).height = Math.min(120, 15 * Math.ceil(cur.texto.length / 90)); h++; cur = null }
  for (const ln of linhas) {
    const m = ln.match(re)
    if (m) { flush(); const an = (m[4].match(/^(\S+\.(?:jpg|jpeg|png|opus|pdf|mp4)) \(arquivo anexado\)/i) || [])[1] || ''; cur = { data: m[1], hora: m[2], autor: m[3] || '(sistema)', texto: an ? m[4].replace(/^\S+ \(arquivo anexado\)\s*/, '') : m[4], anexo: an } }
    else if (cur) cur.texto += '\n' + ln
  }
  flush()
}

/* ── ordem das abas e grava ─────────────────────────────────────────────── */
for (const ws of wb.worksheets) ws.orderNo = ORDEM.indexOf(ws.name) + 1
wb.views = [{ activeTab: 0 }]
const file = path.join(OUT, 'Controle Financeiro Fazenda.xlsx')
await wb.xlsx.writeFile(file)
console.log('ok →', file, `| ${D.lancamentos.length} lançamentos, ${D.lotes.length} lotes, ${D.fornecedores.length} fornecedores`)
