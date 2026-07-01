// Gera uma planilha XLSX bem elaborada com o estado da conciliação bancária
// (Sicoob + Sicredi) para validação com o financeiro. 01/07/2026.
// Saída: área de trabalho.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const OUT = 'C:/Users/Notebook-Acer/Desktop/Conciliacao Bancaria Bula - 01-07-2026 (v2 - com transferencias).xlsx'

const DARK = 'FF111827', GRAY = 'FF374151', LIGHT = 'FFF3F4F6', GREEN = 'FF1E7D46', RED = 'FFB91C1C', AMBER = 'FFB45309', BLUE = 'FF2563EB', BORDER = 'FFD1D5DB'
const tipoLabel = { entrada: 'Entrada', saida: 'Saída', transferencia: 'Transferência' }
const tipoCor = { entrada: GREEN, saida: RED, transferencia: BLUE }
const money = 'R$ #,##0.00'
const dref = (m, t) => t

function motivo(obs, desc) {
  const o = obs || ''
  const mm = o.match(/(?:Benefici[^:]*|Recebedor|Pagador|Comerciante|Transf[^:]*)\s*:[^|]*?\)\s*[-–]\s*([^|]+)/i)
  if (mm && mm[1].trim()) return mm[1].trim()
  const dm = (desc || '').match(/\s[-–]\s(.+)$/)
  return dm ? dm[1].trim() : ''
}

// ── dados ───────────────────────────────────────────────────────────────────
const [{ data: movs }, { data: crAll }, { data: cpAll }] = await Promise.all([
  sb.from('erp_movimentos_bancarios').select('id,data,valor,tipo,descricao,observacoes,status_conciliacao,conta_bancaria_id,conta_pagar_id,conta_receber_id,pessoa:erp_pessoas!pessoa_id(nome,documento),categoria:erp_categorias!categoria_id(nome),conta:erp_contas_bancarias!conta_bancaria_id(nome)').order('data', { ascending: true }),
  sb.from('erp_contas_receber').select('id,descricao,valor,status,emissao,vencimento,data_recebimento,numero_documento,cli:erp_pessoas!cliente_id(nome)'),
  sb.from('erp_contas_pagar').select('id,descricao,valor,status,emissao,vencimento,data_pagamento,numero_documento,forn:erp_pessoas!fornecedor_id(nome)'),
])
const crById = new Map((crAll || []).map((t) => [t.id, t]))
const cpById = new Map((cpAll || []).map((t) => [t.id, t]))
const banco = (m) => (m.conta && m.conta.nome || '').split(' ')[0]
const tituloVinc = (m) => m.conta_pagar_id ? `CP: ${(cpById.get(m.conta_pagar_id)?.descricao || '').slice(0, 40)}` : (m.conta_receber_id ? `CR: ${(crById.get(m.conta_receber_id)?.descricao || '').slice(0, 40)}` : '')

// ── workbook ────────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook()
wb.creator = 'Bula ERP'; wb.created = new Date('2026-07-01T12:00:00Z')

function titleBar(ws, text, span) {
  ws.mergeCells(1, 1, 1, span)
  const c = ws.getCell(1, 1); c.value = text
  c.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } }
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 30
}
function headerRow(ws, rowIdx, cols) {
  const r = ws.getRow(rowIdx)
  cols.forEach((h, i) => { const c = r.getCell(i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } }; c.alignment = { vertical: 'middle', wrapText: true }; c.border = { bottom: { style: 'thin', color: { argb: BORDER } } } })
  r.height = 22
}

// ===== 1) VISÃO GERAL =====
{
  const ws = wb.addWorksheet('Visão Geral', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 42 }, { width: 22 }, { width: 22 }, { width: 22 }]
  titleBar(ws, 'Conciliação Bancária — Bula Assessoria', 4)
  ws.getCell('A2').value = 'Gerado em 01/07/2026 · Sicoob (conta 1.056-1) + Sicredi (conta 53609-7) · período jan–jun/2026'
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF6B7280' } }
  const sic = movs.filter((m) => m.conta_bancaria_id === SICOOB)
  const scr = movs.filter((m) => m.conta_bancaria_id !== SICOOB)
  const withP = (a) => a.filter((m) => m.pessoa).length
  const rows = [
    [],
    ['Indicador', 'Sicoob', 'Sicredi', 'Total'],
    ['Movimentos', sic.length, scr.length, movs.length],
    ['Com contraparte identificada', withP(sic), withP(scr), withP(movs)],
    ['% identificado', sic.length ? withP(sic) / sic.length : 0, scr.length ? withP(scr) / scr.length : 0, movs.length ? withP(movs) / movs.length : 0],
    ['Entradas (R$)', sum(sic, 'entrada'), sum(scr, 'entrada'), sum(movs, 'entrada')],
    ['Saídas (R$)', sum(sic, 'saida'), sum(scr, 'saida'), sum(movs, 'saida')],
    ['Resultado (Entradas − Saídas)', sum(sic,'entrada')-sum(sic,'saida'), sum(scr,'entrada')-sum(scr,'saida'), sum(movs,'entrada')-sum(movs,'saida')],
    ['Transferências entre contas (R$)', sum(sic, 'transferencia'), sum(scr, 'transferencia'), sum(movs, 'transferencia')],
    [],
    ['Títulos (contas a receber/pagar)', '', '', ''],
    ['Contas a Receber — abertas', (crAll || []).filter((t) => t.status !== 'recebido').length, '', ''],
    ['Contas a Pagar — abertas', (cpAll || []).filter((t) => t.status !== 'pago').length, '', ''],
    ['Títulos baixados SEM lastro bancário (revisar)', semLastro().length, '', ''],
    ['Pessoas cadastradas (contrapartes)', new Set(movs.filter(m=>m.pessoa).map(m=>m.pessoa.nome)).size, '', ''],
  ]
  let r = 3
  for (const row of rows) { const rr = ws.getRow(r); row.forEach((v, i) => rr.getCell(i + 1).value = v); if (r === 4 || r === 13) headerRowInline(rr); r++ }
  // formatos
  ws.getRow(7).eachCell((c, i) => { if (i > 1) c.numFmt = '0.0%' })
  ;[8, 9, 10, 11].forEach((rn) => ws.getRow(rn).eachCell((c, i) => { if (i > 1) c.numFmt = money }))
  ws.getCell('A19').value = 'Como usar: a aba "Pontos a Validar" traz o que precisa de decisão sua/da financeira hoje. "Movimentos" tem tudo, com filtro. Verde = entrada · vermelho = saída · azul = transferência entre contas (não entra no resultado).'
  ws.mergeCells('A19:D21'); ws.getCell('A19').alignment = { wrapText: true, vertical: 'top' }; ws.getCell('A19').font = { color: { argb: 'FF374151' } }
  function headerRowInline(rr) { rr.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } } }) }
}

// ===== 2) PONTOS A VALIDAR =====
{
  const ws = wb.addWorksheet('Pontos a Validar', { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.columns = [{ width: 5 }, { width: 26 }, { width: 62 }, { width: 20 }, { width: 40 }]
  titleBar(ws, 'Pontos a validar com a financeira (hoje)', 5)
  headerRow(ws, 2, ['#', 'Tema', 'O que verificar', 'Valor / Ref.', 'Decisão'])
  const pts = [
    ['Assessor — AgroBispo', 'Grupo AgroBispo é o Douglas Bispo? Se sim, os 6 pagamentos são remuneração dele.', 'R$ 28.480,85 (6 mov.)', ''],
    ['Assessor — Douglas', 'Douglas: R$ 871,68 e R$ 1.238,84 estão como REEMBOLSO de leilão (tamanho de hotel/refeição). É reembolso ou comissão?', 'R$ 2.110,52', ''],
    ['Títulos sem lastro', '35 títulos marcados recebido/pago que NÃO têm movimento no extrato (baixados pela planilha). Foram mesmo? por qual canal? — ver aba "Títulos sem lastro".', 'CR R$ 307.066,64 / CP R$ 65.284,00', ''],
    ['CR pendentes', 'Recebíveis com NF emitida aguardando pagamento (conforme conversa): Kito (leilão 09/05), Katayama, Santa Nice.', '—', ''],
    ['Pix pessoa física', 'Pequenos pagamentos a CPF sem correspondência ficaram em "Outras Despesas". Confirmar que é o certo.', 'diversos', ''],
    ['Cliente — Thiago Lombardi', 'Pix recebido de THIAGO LOMBARDI DE M. (CPF 274.881.518-10) — sobrenome truncado no extrato. Quem é / qual leilão?', 'R$ 53.284,45', ''],
    ['Cartões Sicoob', 'DÉB.CONV.DEM.EMPRES = pagamento das faturas dos 2 cartões Sicoob (tratado no módulo Cartões, não duplicar caixa). Conferir.', 'R$ 182.556,52 (12 mov.)', ''],
    ['Seguros', 'DÉB.CONV.SEGUROS recategorizados p/ Seguros; a seguradora entra por convênio (sem nome no extrato). Qual é a seguradora?', 'R$ 1.218,56 (14 mov.)', ''],
  ]
  let r = 3
  pts.forEach((p, i) => { const rr = ws.getRow(r); rr.getCell(1).value = i + 1; rr.getCell(2).value = p[0]; rr.getCell(3).value = p[1]; rr.getCell(4).value = p[2]; rr.getCell(5).value = p[3]; rr.alignment = { wrapText: true, vertical: 'top' }; rr.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E6' } }; rr.eachCell((c) => c.border = { bottom: { style: 'hair', color: { argb: BORDER } } }); r++ })
}

// ===== 3) MOVIMENTOS =====
{
  const ws = wb.addWorksheet('Movimentos', { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.columns = [{ width: 12 }, { width: 9 }, { width: 9 }, { width: 15 }, { width: 34 }, { width: 20 }, { width: 26 }, { width: 14 }, { width: 30 }, { width: 34 }]
  titleBar(ws, 'Movimentos bancários (Sicoob + Sicredi)', 10)
  headerRow(ws, 2, ['Data', 'Banco', 'Tipo', 'Valor', 'Contraparte', 'CNPJ/CPF', 'Categoria', 'Status', 'Título vinculado', 'Motivo / Observação'])
  let r = 3
  for (const m of movs) {
    const rr = ws.getRow(r)
    rr.getCell(1).value = new Date(m.data + 'T00:00:00'); rr.getCell(1).numFmt = 'dd/mm/yyyy'
    rr.getCell(2).value = banco(m)
    rr.getCell(3).value = tipoLabel[m.tipo] || m.tipo
    rr.getCell(3).font = { color: { argb: tipoCor[m.tipo] || GRAY }, bold: true }
    const vc = rr.getCell(4); vc.value = (m.tipo === 'saida' ? -1 : 1) * Number(m.valor); vc.numFmt = money; vc.font = { color: { argb: tipoCor[m.tipo] || GRAY } }
    rr.getCell(5).value = (m.pessoa && m.pessoa.nome) || '(sem contraparte)'
    if (!m.pessoa) rr.getCell(5).font = { italic: true, color: { argb: 'FF9CA3AF' } }
    rr.getCell(6).value = (m.pessoa && m.pessoa.documento) || ''
    rr.getCell(7).value = (m.categoria && m.categoria.nome) || ''
    const st = m.status_conciliacao || 'pendente'
    const sc = rr.getCell(8); sc.value = st[0].toUpperCase() + st.slice(1); sc.font = { color: { argb: st === 'conciliado' ? GREEN : st === 'classificado' ? AMBER : 'FF6B7280' } }
    rr.getCell(9).value = tituloVinc(m)
    rr.getCell(10).value = motivo(m.observacoes, m.descricao)
    if (r % 2 === 0) rr.eachCell((c) => { if (!c.fill || !c.fill.fgColor) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } } })
    r++
  }
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 10 } }
}

// ===== 3.5) FLUXO DE CAIXA MENSAL (3 baldes: entradas / saídas / transferências) =====
{
  const ws = wb.addWorksheet('Fluxo Mensal', { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.columns = [{ width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 4 }, { width: 20 }, { width: 20 }]
  titleBar(ws, 'Fluxo de caixa mensal — 2026 (jan a jun)', 7)
  headerRow(ws, 2, ['Mês', 'Entradas', 'Saídas', 'Resultado (E−S)', '', 'Transferências (vol.)', 'Resultado acum.'])
  const meses = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
  const nomeMes = { '2026-01': 'Janeiro', '2026-02': 'Fevereiro', '2026-03': 'Março', '2026-04': 'Abril', '2026-05': 'Maio', '2026-06': 'Junho' }
  const soma = (list, t) => list.filter((m) => m.tipo === t).reduce((s, m) => s + +m.valor, 0)
  let r = 3, acc = 0
  for (const mm of meses) {
    const list = movs.filter((m) => String(m.data).slice(0, 7) === mm)
    const ent = soma(list, 'entrada'), sai = soma(list, 'saida'), tr = soma(list, 'transferencia')
    acc += ent - sai
    const rr = ws.getRow(r)
    rr.getCell(1).value = nomeMes[mm]
    rr.getCell(2).value = ent; rr.getCell(3).value = sai; rr.getCell(4).value = ent - sai
    rr.getCell(6).value = tr; rr.getCell(7).value = acc
    ;[2, 3, 4, 6, 7].forEach((ci) => rr.getCell(ci).numFmt = money)
    rr.getCell(2).font = { color: { argb: GREEN } }; rr.getCell(3).font = { color: { argb: RED } }; rr.getCell(6).font = { color: { argb: BLUE } }
    rr.getCell(4).font = { bold: true, color: { argb: (ent - sai) >= 0 ? GREEN : RED } }
    r++
  }
  const rt = ws.getRow(r)
  rt.getCell(1).value = 'TOTAL jan–jun'
  const tEnt = soma(movs, 'entrada'), tSai = soma(movs, 'saida'), tTr = soma(movs, 'transferencia')
  rt.getCell(2).value = tEnt; rt.getCell(3).value = tSai; rt.getCell(4).value = tEnt - tSai; rt.getCell(6).value = tTr; rt.getCell(7).value = tEnt - tSai
  ;[2, 3, 4, 6, 7].forEach((ci) => { rt.getCell(ci).numFmt = money; rt.getCell(ci).font = { bold: true } }); rt.eachCell((c) => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } })
  r += 2
  ws.getCell(`A${r}`).value = 'Transferências entre contas (Bula↔Bula, aplicação/resgate de investimento) NÃO entram no resultado — só andam entre as contas do grupo. O "Resultado (E−S)" é o caixa operacional do negócio.'
  ws.mergeCells(`A${r}:G${r + 1}`); ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' }; ws.getCell(`A${r}`).font = { italic: true, color: { argb: 'FF6B7280' } }
}

// ===== 3.6) RESUMO POR CATEGORIA =====
{
  const ws = wb.addWorksheet('Por Categoria', { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.columns = [{ width: 40 }, { width: 12 }, { width: 12 }, { width: 18 }]
  titleBar(ws, 'Resumo por categoria (jan–jun 2026)', 4)
  headerRow(ws, 2, ['Categoria', 'Tipo', 'Qtd', 'Total (R$)'])
  const g = new Map()
  for (const m of movs) { const nome = (m.categoria && m.categoria.nome) || '(sem categoria)'; const k = `${m.tipo}|${nome}`; const c = g.get(k) || { nome, tipo: m.tipo, n: 0, v: 0 }; c.n++; c.v += +m.valor; g.set(k, c) }
  const arr = [...g.values()].sort((a, b) => (a.tipo === b.tipo ? b.v - a.v : a.tipo === 'entrada' ? -1 : 1))
  let r = 3
  for (const c of arr) { const rr = ws.getRow(r); rr.getCell(1).value = c.nome; rr.getCell(2).value = c.tipo === 'entrada' ? 'Receita' : 'Despesa'; rr.getCell(2).font = { color: { argb: c.tipo === 'entrada' ? GREEN : RED } }; rr.getCell(3).value = c.n; rr.getCell(4).value = c.v; rr.getCell(4).numFmt = money; r++ }
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 4 } }
}

// ===== 4) CLASSIFICAÇÃO DE CONTRAPARTES (Fixo/Variável · Recorrente/Ocasional) =====
{
  const ws = wb.addWorksheet('Classificação', { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.columns = [{ width: 38 }, { width: 26 }, { width: 8 }, { width: 8 }, { width: 15 }, { width: 15 }, { width: 16 }, { width: 16 }, { width: 34 }]
  titleBar(ws, 'Classificação de contrapartes — recorrência e natureza', 9)
  headerRow(ws, 2, ['Contraparte', 'Categoria predominante', 'Transações', 'Meses', 'Recorrência', 'Natureza', 'Entradas (R$)', 'Saídas (R$)', 'Observação'])
  const g = new Map()
  for (const m of movs.filter((x) => x.pessoa && x.tipo !== 'transferencia')) {
    const k = m.pessoa.nome
    const c = g.get(k) || { ent: 0, sai: 0, n: 0, datas: [], valores: [], cats: {} }
    if (m.tipo === 'entrada') c.ent += +m.valor; else c.sai += +m.valor
    c.n++; c.datas.push(String(m.data).slice(0, 10)); c.valores.push(+m.valor)
    const cn = (m.categoria && m.categoria.nome) || '—'; c.cats[cn] = (c.cats[cn] || 0) + 1
    g.set(k, c)
  }
  function classifica(c) {
    const meses = new Set(c.datas.map((d) => d.slice(0, 7))).size
    const recorrencia = meses >= 3 ? 'Recorrente' : meses === 2 ? 'Eventual (2 meses)' : 'Ocasional'
    const catNome = Object.entries(c.cats).sort((a, b) => b[1] - a[1])[0][0]
    const vs = c.valores, mean = vs.reduce((a, b) => a + b, 0) / vs.length, mx = Math.max(...vs), mn = Math.min(...vs)
    const estavel = mean > 0 && (mx - mn) / mean < 0.15
    const catFixo = /Aluguel|Energia|Agua|Telefone|Seguro|Tarifa|Software|Assinatura|Contab|Serviços de Terceiros|Integraliza|Folha/i.test(catNome)
    const catVar = /Comiss|Imposto|Repasse|Despesa Operacional|Alimenta|Viagem|Transporte|Combust|Reembolso|Recebimento|Vendas|Outras/i.test(catNome)
    let natureza, obs = ''
    if (meses >= 3 && (estavel || catFixo) && !catVar) { natureza = 'Fixo'; obs = estavel ? 'valor estável todo mês' : 'despesa fixa recorrente' }
    else if (meses >= 3) { natureza = 'Variável'; obs = 'recorrente, valor varia' }
    else { natureza = 'Eventual'; obs = meses === 1 ? 'apareceu 1 mês' : 'poucas ocorrências' }
    return { meses, recorrencia, natureza, catNome, obs }
  }
  const arr = [...g.entries()].map(([nome, c]) => ({ nome, c, cl: classifica(c) })).sort((a, b) => (b.c.sai + b.c.ent) - (a.c.sai + a.c.ent))
  let r = 3
  for (const { nome, c, cl } of arr) {
    const rr = ws.getRow(r)
    rr.getCell(1).value = nome; rr.getCell(2).value = cl.catNome; rr.getCell(3).value = c.n; rr.getCell(4).value = cl.meses
    rr.getCell(5).value = cl.recorrencia; rr.getCell(6).value = cl.natureza
    rr.getCell(7).value = c.ent; rr.getCell(7).numFmt = money; rr.getCell(8).value = c.sai; rr.getCell(8).numFmt = money
    rr.getCell(9).value = cl.obs
    const cor = cl.natureza === 'Fixo' ? 'FF1E7D46' : cl.natureza === 'Variável' ? 'FFB45309' : 'FF6B7280'
    rr.getCell(6).font = { bold: true, color: { argb: cor } }
    rr.getCell(5).font = { color: { argb: cl.recorrencia === 'Recorrente' ? DARK : 'FF9CA3AF' } }
    r++
  }
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 9 } }
  // legenda
  ws.getCell(`A${r + 1}`).value = 'Recorrente = aparece em 3+ meses · Eventual = 2 meses · Ocasional = 1 mês.  Fixo = recorrente com valor estável (aluguel, internet, seguro, contabilidade, financiamento…).  Variável = recorrente mas oscila (comissão %, impostos, reembolsos, refeições).'
  ws.mergeCells(`A${r + 1}:I${r + 2}`); ws.getCell(`A${r + 1}`).alignment = { wrapText: true, vertical: 'top' }; ws.getCell(`A${r + 1}`).font = { italic: true, color: { argb: 'FF6B7280' } }
}

// ===== 5) TÍTULOS SEM LASTRO =====
{
  const ws = wb.addWorksheet('Títulos sem lastro', { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.columns = [{ width: 12 }, { width: 46 }, { width: 30 }, { width: 15 }, { width: 14 }, { width: 22 }]
  titleBar(ws, 'Títulos baixados SEM lastro bancário (conferir)', 6)
  headerRow(ws, 2, ['Tipo', 'Descrição', 'Parte', 'Valor', 'Data baixa', 'Documento'])
  let r = 3
  for (const t of semLastro()) { const rr = ws.getRow(r); rr.getCell(1).value = t.tipo; rr.getCell(2).value = t.descricao; rr.getCell(3).value = t.parte; rr.getCell(4).value = +t.valor; rr.getCell(4).numFmt = money; rr.getCell(5).value = fmtd(t.data); rr.getCell(6).value = t.doc; r++ }
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 6 } }
}

// ===== 6) TÍTULOS EM ABERTO =====
{
  const ws = wb.addWorksheet('Títulos em aberto', { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.columns = [{ width: 12 }, { width: 46 }, { width: 30 }, { width: 15 }, { width: 14 }, { width: 12 }]
  titleBar(ws, 'Contas a receber / pagar em aberto', 6)
  headerRow(ws, 2, ['Tipo', 'Descrição', 'Parte', 'Valor', 'Vencimento', 'Status'])
  let r = 3
  const open = [
    ...(crAll || []).filter((t) => t.status !== 'recebido').map((t) => ({ tipo: 'CR (receber)', d: t.descricao, p: t.cli && t.cli.nome, v: t.valor, venc: t.vencimento, s: t.status })),
    ...(cpAll || []).filter((t) => t.status !== 'pago').map((t) => ({ tipo: 'CP (pagar)', d: t.descricao, p: t.forn && t.forn.nome, v: t.valor, venc: t.vencimento, s: t.status })),
  ].sort((a, b) => String(a.venc).localeCompare(String(b.venc)))
  for (const t of open) { const rr = ws.getRow(r); rr.getCell(1).value = t.tipo; rr.getCell(2).value = t.d; rr.getCell(3).value = t.p || ''; rr.getCell(4).value = +t.v; rr.getCell(4).numFmt = money; rr.getCell(5).value = fmtd(t.venc); rr.getCell(6).value = t.s; r++ }
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 6 } }
}

await wb.xlsx.writeFile(OUT)
console.log('Planilha gerada:', OUT)
console.log('Abas: Visão Geral, Pontos a Validar, Movimentos, Recorrentes, Títulos sem lastro, Títulos em aberto')

// helpers
function sum(list, tipo) { return list.filter((m) => m.tipo === tipo).reduce((s, m) => s + Number(m.valor), 0) }
function fmtd(d) { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}` }
function semLastro() {
  const crL = new Set(movs.filter((m) => m.conta_receber_id).map((m) => m.conta_receber_id))
  const cpL = new Set(movs.filter((m) => m.conta_pagar_id).map((m) => m.conta_pagar_id))
  const out = []
  for (const t of crAll || []) if (t.status === 'recebido' && !crL.has(t.id)) out.push({ tipo: 'CR (receber)', descricao: t.descricao, parte: t.cli && t.cli.nome || '', valor: t.valor, data: t.data_recebimento, doc: t.numero_documento || '' })
  for (const t of cpAll || []) if (t.status === 'pago' && !cpL.has(t.id)) out.push({ tipo: 'CP (pagar)', descricao: t.descricao, parte: t.forn && t.forn.nome || '', valor: t.valor, data: t.data_pagamento, doc: t.numero_documento || '' })
  return out
}
