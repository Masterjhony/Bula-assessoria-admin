// Planilha de conciliação/visão-geral FOCADA em Abril–Junho/2026.
// Objetivo (pedido do chefe): dentro do universo de transações, separar de forma
// assertiva o que é:
//   • Operação regular (contas a receber/pagar) do fluxo de LEILÕES
//       - recebimentos dos leilões
//       - comissões/repasses a pagar das vendas
//       - despesas dos assessores nos leilões (reembolso de hotel/alimentação/viagem)
//   • Folha (salários fixos)
//   • Despesas fixas de estrutura (aluguel, contabilidade, internet, seguros…)
//   • Impostos
//   • Cartão de crédito (fatura paga — detalhe no módulo Cartões)
//   • GASTOS DO DONO / pessoais (sem relação direta com a operação) — a validar
//   • Transferências entre contas / aplicações (fora do resultado)
//
// Fonte: erp_movimentos_bancarios (Sicoob + Sicredi) — categorias já revisadas no ERP.
// Saída: Área de Trabalho.

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
const DE = '2026-04-01', ATE = '2026-06-30'
const OUT = 'C:/Users/Notebook-Acer/Desktop/Conciliacao Bula - Abril a Junho 2026 (por natureza v2).xlsx'

const DARK = 'FF111827', GRAY = 'FF374151', LIGHT = 'FFF3F4F6', GREEN = 'FF1E7D46', RED = 'FFB91C1C', AMBER = 'FFB45309', BLUE = 'FF2563EB', PURPLE = 'FF6D28D9', BORDER = 'FFD1D5DB'
const money = 'R$ #,##0.00'
const brl0 = (n) => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const tipoLabel = { entrada: 'Entrada', saida: 'Saída', transferencia: 'Transferência' }
const tipoCor = { entrada: GREEN, saida: RED, transferencia: BLUE }

// ── Definição dos baldes (natureza) ─────────────────────────────────────────
const BUCKETS = {
  REC_LEILAO:  { ord: 1,  label: 'Recebimentos de Leilão',            grupo: 'Operação — Leilões', fluxo: 'receita',  cor: GREEN },
  OUT_REC:     { ord: 2,  label: 'Outras Receitas',                    grupo: 'Operação — Leilões', fluxo: 'receita',  cor: GREEN },
  COM_LEILAO:  { ord: 3,  label: 'Comissões / Repasses de Leilão',     grupo: 'Operação — Leilões', fluxo: 'despesa',  cor: RED },
  DESP_LEILAO: { ord: 4,  label: 'Despesas de Leilão / Assessores',    grupo: 'Operação — Leilões', fluxo: 'despesa',  cor: RED },
  FOLHA:       { ord: 5,  label: 'Folha — salários fixos',             grupo: 'Estrutura fixa',     fluxo: 'despesa',  cor: RED },
  ESTRUTURA:   { ord: 6,  label: 'Despesas Fixas de Estrutura',        grupo: 'Estrutura fixa',     fluxo: 'despesa',  cor: RED },
  MARKETING:   { ord: 7,  label: 'Marketing',                          grupo: 'Estrutura fixa',     fluxo: 'despesa',  cor: RED },
  IMPOSTOS:    { ord: 8,  label: 'Impostos',                           grupo: 'Estrutura fixa',     fluxo: 'despesa',  cor: RED },
  CARTAO:      { ord: 9,  label: 'Cartão de Crédito (fatura)',         grupo: 'Estrutura fixa',     fluxo: 'despesa',  cor: RED },
  BANCO:       { ord: 10, label: 'Tarifas & Cooperativa',             grupo: 'Estrutura fixa',     fluxo: 'despesa',  cor: RED },
  DONO:        { ord: 11, label: 'Gastos do Dono / Pessoal',           grupo: 'Não-operacional',    fluxo: 'despesa',  cor: PURPLE },
  REVISAR:     { ord: 12, label: 'Outras Despesas — a revisar',        grupo: 'Não-operacional',    fluxo: 'despesa',  cor: AMBER },
  TRANSF:      { ord: 13, label: 'Transferências / Aplicações',        grupo: 'Fora do resultado',  fluxo: 'neutro',   cor: BLUE },
}

const CAT_BUCKET = {
  'Recebimento Cliente': 'REC_LEILAO', 'Comissoes Recebidas': 'REC_LEILAO', 'Comissao Leilao': 'REC_LEILAO',
  'Outras Receitas': 'OUT_REC', 'Estorno Cartao': 'OUT_REC',
  'Repasse Assessorias/Parceiros': 'COM_LEILAO', 'Comissão Funcionário': 'COM_LEILAO',
  'Despesa Operacional Leilão': 'DESP_LEILAO', 'Viagem/Passagens': 'DESP_LEILAO', 'Alimentacao/Refeicoes': 'DESP_LEILAO', 'Transporte (Apps)': 'DESP_LEILAO', 'Combustivel': 'DESP_LEILAO',
  'Folha de Pagamento': 'FOLHA',
  'Servicos de Terceiros': 'ESTRUTURA', 'Energia/Agua/Telefone': 'ESTRUTURA', 'Seguros': 'ESTRUTURA', 'Software/Assinaturas': 'ESTRUTURA', 'Material de Escritorio': 'ESTRUTURA', 'Manutencao': 'ESTRUTURA', 'Aluguel': 'ESTRUTURA',
  'Marketing e Publicidade': 'MARKETING',
  'Impostos e Taxas': 'IMPOSTOS',
  'Cartão de Crédito': 'CARTAO',
  'Tarifas Bancarias': 'BANCO', 'Integralizacao Capital Cooperativa': 'BANCO',
  'Resgate Aplicacao Financeira': 'TRANSF', 'Aplicacao Financeira': 'TRANSF', 'Transferencias Internas - Entrada': 'TRANSF', 'Transferencias Internas - Saida': 'TRANSF',
}

// Sub-classificador para "Outras Despesas" / "REEMBOLSO" (texto livre)
function subClassificaOutras(texto) {
  const t = (texto || '').toLowerCase()
  if (/casa uberaba|uberaba|im[oó]vel|apartament/.test(t)) return { b: 'DONO', nota: 'imóvel/casa — pessoal' }
  if (/studio runners|academia|esporte e saude|smart ?fit|personal/.test(t)) return { b: 'DONO', nota: 'academia — pessoal' }
  if (/cons[oó]rcio/.test(t)) return { b: 'DONO', nota: 'consórcio — confirmar se pessoal' }
  if (/cef matriz|caixa economica|financiamento/.test(t)) return { b: 'DONO', nota: 'financiamento/Caixa — confirmar se pessoal' }
  if (/faxina|limpeza|diaria limpeza|escritorio/.test(t)) return { b: 'ESTRUTURA', nota: 'limpeza/escritório — estrutura' }
  if (/qms internacional|assinatura|software|licenca/.test(t)) return { b: 'ESTRUTURA', nota: 'software/assinatura' }
  return { b: 'REVISAR', nota: 'sem descrição clara — confirmar natureza' }
}

function motivo(obs, desc) {
  const o = obs || ''
  const mm = o.match(/(?:Benefici[^:]*|Recebedor|Pagador|Comerciante|Transf[^:]*)\s*:[^|]*?\)\s*[-–]\s*([^|]+)/i)
  if (mm && mm[1].trim()) return mm[1].trim()
  const dm = (desc || '').match(/\s[-–]\s(.+)$/)
  return dm ? dm[1].trim() : (desc || '')
}

function classifica(m) {
  if (m.tipo === 'transferencia') return { b: 'TRANSF', nota: '' }
  const cat = m.categoria?.nome || ''
  const direct = CAT_BUCKET[cat]
  if (direct && direct !== undefined) {
    if (cat === 'Outras Despesas' || cat === 'REEMBOLSO') { /* fallthrough */ } else return { b: direct, nota: '' }
  }
  if (cat === 'Outras Despesas' || cat === 'REEMBOLSO' || !direct) {
    if (cat === 'Outras Despesas' || cat === 'REEMBOLSO') {
      const texto = `${m.pessoa?.nome || ''} ${motivo(m.observacoes, m.descricao)} ${m.descricao || ''}`
      return subClassificaOutras(texto)
    }
    // categoria desconhecida
    return { b: 'REVISAR', nota: `categoria "${cat}" não mapeada` }
  }
  return { b: direct, nota: '' }
}

// ── Dados ───────────────────────────────────────────────────────────────────
const { data: movs, error } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,valor,tipo,descricao,observacoes,status_conciliacao,conta_pagar_id,conta_receber_id,pessoa:erp_pessoas!pessoa_id(nome,documento),categoria:erp_categorias!categoria_id(nome),conta:erp_contas_bancarias!conta_bancaria_id(nome)')
  .gte('data', DE).lte('data', ATE).order('data', { ascending: true })
if (error) { console.error(error.message); process.exit(1) }

// enriquece com balde
for (const m of movs) { const c = classifica(m); m._b = c.b; m._nota = c.nota }
const banco = (m) => (m.conta?.nome || '').split(' ')[0]

// ── Correlação com leilões (fechamentos) ────────────────────────────────────
const { data: fechs } = await sb.from('bula_leilao_fechamento').select('nome,data,compradores,por_assessor').order('data')
const normx = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const STOP = new Set(['LTDA', 'AGROPECUARIA', 'FILHO', 'NETO', 'JUNIOR', 'EMPREENDIMENTOS', 'RURAIS', 'PECUARIA', 'ASSESSORIA', 'SILVA', 'SANTOS', 'GRUPO'])
const toksx = (s) => normx(s).split(' ').filter((t) => t.length > 3 && !STOP.has(t))
const fmtDataLeilao = (d) => { const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}` }
// apelido da empresa do assessor no extrato -> nome da pessoa em por_assessor
const ALIAS = [
  { rx: /FO ASSESSORIA|FÁBIO OMENA|FABIO OMENA/i, pes: 'Fábio Omena' },
  { rx: /AGROBISPO|DOUGLAS/i, pes: 'Douglas Bispo' },
  { rx: /L\.?S ASSESSORIA|LEONARDO SERAFIM/i, pes: 'Leonardo Serafim' },
  { rx: /FORMULA DO BOI|BULINHA|FELIPE (VILELA )?ANDRADE/i, pes: 'Bulinha Felipe Andrade' },
  { rx: /MARCELO CARNEIRO/i, pes: 'Marcelo Carneiro' },
  { rx: /MATHEUS|AMORMINO|VERDI/i, pes: 'Matheus Amormino' },
]
const buyerIdx = []
for (const f of fechs || []) for (const c of (f.compradores || [])) { const t = toksx(c.comprador); if (t.length) buyerIdx.push({ t, f, nome: c.comprador }) }
function matchBuyer(nome) {
  const t = toksx(nome); if (!t.length) return null
  let best = null, sc = 0
  for (const b of buyerIdx) { const inter = t.filter((x) => b.t.includes(x)).length; if (inter > sc) { sc = inter; best = b } }
  return best && sc >= 1 ? { leilao: best.f.nome, data: best.f.data } : null
}
function matchAssessorLeiloes(nome, dataMov) {
  const al = ALIAS.find((a) => a.rx.test(nome || ''))
  const pesToks = al ? toksx(al.pes) : toksx(nome)
  if (!pesToks.length) return []
  const lim = new Date(dataMov + 'T00:00:00'); const ini = new Date(lim); ini.setDate(ini.getDate() - 100)
  const hits = new Map()
  for (const f of fechs || []) {
    const fd = new Date(String(f.data).slice(0, 10) + 'T00:00:00')
    if (fd > lim || fd < ini) continue
    for (const a of (f.por_assessor || [])) {
      const at = toksx(a.nome || a.assessor || '')
      if (pesToks.filter((x) => at.includes(x)).length >= 1) hits.set(f.nome, { leilao: f.nome, data: f.data, vgv: a.vgv || 0 })
    }
  }
  return [...hits.values()].sort((a, b) => (b.vgv || 0) - (a.vgv || 0))
}
const val = (m) => Number(m.valor)
const signed = (m) => (m.tipo === 'saida' ? -1 : m.tipo === 'entrada' ? 1 : 0) * val(m)

// agrega por balde
const agg = {}
for (const k of Object.keys(BUCKETS)) agg[k] = { n: 0, ent: 0, sai: 0 }
for (const m of movs) {
  const a = agg[m._b]
  a.n++
  if (m.tipo === 'entrada') a.ent += val(m)
  else if (m.tipo === 'saida') a.sai += val(m)
  else a.sai += 0 // transferência: volume tratado à parte
}
const volTransf = movs.filter((m) => m.tipo === 'transferencia').reduce((s, m) => s + val(m), 0)

// ── Workbook ────────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook()
wb.creator = 'Bula ERP'; wb.created = new Date('2026-07-02T12:00:00Z')

function titleBar(ws, text, span, sub) {
  ws.mergeCells(1, 1, 1, span)
  const c = ws.getCell(1, 1); c.value = text
  c.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } }
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 30
  if (sub) { ws.getCell('A2').value = sub; ws.getCell('A2').font = { italic: true, color: { argb: 'FF6B7280' } } }
}
function headerRow(ws, rowIdx, cols) {
  const r = ws.getRow(rowIdx)
  cols.forEach((h, i) => { const c = r.getCell(i + 1); c.value = h; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } }; c.alignment = { vertical: 'middle', wrapText: true }; c.border = { bottom: { style: 'thin', color: { argb: BORDER } } } })
  r.height = 22
}

// ===== 1) VISÃO GERAL POR NATUREZA =====
{
  const ws = wb.addWorksheet('Visão Geral', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 40 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 10 }]
  titleBar(ws, 'Visão geral por natureza — Abril a Junho/2026', 5, 'Sicoob + Sicredi · gerado em 02/07/2026 · cada transação classificada em 1 balde. Objetivo: separar operação de leilão, estrutura fixa e gastos do dono.')
  headerRow(ws, 4, ['Natureza', 'Entradas', 'Saídas', 'Líquido', 'Qtd'])
  let r = 5
  const grupos = ['Operação — Leilões', 'Estrutura fixa', 'Não-operacional', 'Fora do resultado']
  const ordered = Object.entries(BUCKETS).sort((a, b) => a[1].ord - b[1].ord)
  for (const grupo of grupos) {
    // cabeçalho de grupo
    const gr = ws.getRow(r); gr.getCell(1).value = grupo.toUpperCase()
    gr.eachCell?.(() => {})
    gr.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    for (let ci = 1; ci <= 5; ci++) gr.getCell(ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } }
    r++
    let gEnt = 0, gSai = 0, gN = 0
    for (const [k, b] of ordered) {
      if (b.grupo !== grupo) continue
      const a = agg[k]
      if (a.n === 0) continue
      const rr = ws.getRow(r)
      rr.getCell(1).value = '   ' + b.label
      rr.getCell(2).value = a.ent; rr.getCell(3).value = a.sai
      rr.getCell(4).value = b.fluxo === 'neutro' ? null : a.ent - a.sai
      rr.getCell(5).value = a.n
      ;[2, 3, 4].forEach((ci) => rr.getCell(ci).numFmt = money)
      rr.getCell(1).font = { color: { argb: b.cor }, bold: true }
      gEnt += a.ent; gSai += a.sai; gN += a.n
      r++
    }
    // subtotal do grupo
    if (grupo === 'Fora do resultado') {
      const rr = ws.getRow(r)
      rr.getCell(1).value = '   Volume transferido (Bula↔Bula, aplic./resgate)'
      rr.getCell(3).value = volTransf; rr.getCell(3).numFmt = money
      rr.getCell(1).font = { italic: true, color: { argb: BLUE } }
      r++
    } else {
      const rr = ws.getRow(r)
      rr.getCell(1).value = 'Subtotal ' + grupo
      rr.getCell(2).value = gEnt; rr.getCell(3).value = gSai; rr.getCell(4).value = gEnt - gSai; rr.getCell(5).value = gN
      ;[2, 3, 4].forEach((ci) => { rr.getCell(ci).numFmt = money })
      rr.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } } })
      r++
    }
    r++ // linha em branco
  }
  // Resultado operacional
  const recOp = agg.REC_LEILAO.ent + agg.OUT_REC.ent
  const custoOp = agg.COM_LEILAO.sai + agg.DESP_LEILAO.sai + agg.FOLHA.sai + agg.ESTRUTURA.sai + agg.MARKETING.sai + agg.IMPOSTOS.sai + agg.BANCO.sai
  const rr1 = ws.getRow(r); rr1.getCell(1).value = 'RESULTADO OPERACIONAL (receita − custos do negócio)'
  rr1.getCell(4).value = recOp - custoOp; rr1.getCell(4).numFmt = money
  rr1.getCell(1).font = { bold: true, size: 12 }; rr1.getCell(4).font = { bold: true, size: 12, color: { argb: (recOp - custoOp) >= 0 ? GREEN : RED } }
  r++
  const rr2 = ws.getRow(r); rr2.getCell(1).value = '   (−) Gastos do dono / pessoal'
  rr2.getCell(4).value = -(agg.DONO.sai); rr2.getCell(4).numFmt = money; rr2.getCell(4).font = { color: { argb: PURPLE } }; rr2.getCell(1).font = { color: { argb: PURPLE } }
  r++
  const rr3 = ws.getRow(r); rr3.getCell(1).value = '   (−) A revisar / não classificado'
  rr3.getCell(4).value = -(agg.REVISAR.sai); rr3.getCell(4).numFmt = money; rr3.getCell(4).font = { color: { argb: AMBER } }; rr3.getCell(1).font = { color: { argb: AMBER } }
  r++
  const rr4 = ws.getRow(r); rr4.getCell(1).value = '   (−) Cartão de crédito (fatura paga no período)'
  rr4.getCell(4).value = -(agg.CARTAO.sai); rr4.getCell(4).numFmt = money; rr4.getCell(1).font = { color: { argb: 'FF6B7280' } }; rr4.getCell(4).font = { color: { argb: 'FF6B7280' } }
  r += 2
  ws.getCell(`A${r}`).value = 'Notas: (1) Transferências entre contas e aplicações NÃO entram no resultado — só movem dinheiro entre as contas do grupo. (2) A fatura do cartão é uma saída de caixa real, mas seus itens já estão detalhados no módulo Cartões (não classifiquei item a item aqui para não duplicar). (3) "Gastos do dono / pessoal" e "A revisar" são os pontos que a financeira precisa confirmar — detalhe nas abas próprias.'
  ws.mergeCells(`A${r}:E${r + 3}`); ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' }; ws.getCell(`A${r}`).font = { color: { argb: 'FF374151' } }
}

// ===== 2) MOVIMENTOS CLASSIFICADOS =====
{
  const ws = wb.addWorksheet('Movimentos classificados', { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.columns = [{ width: 11 }, { width: 8 }, { width: 11 }, { width: 14 }, { width: 32 }, { width: 24 }, { width: 30 }, { width: 32 }]
  titleBar(ws, 'Movimentos classificados por natureza — Abr a Jun/2026', 8)
  headerRow(ws, 2, ['Data', 'Banco', 'Tipo', 'Valor', 'Contraparte', 'Natureza', 'Categoria (ERP)', 'Motivo / Nota'])
  let r = 3
  for (const m of movs) {
    const rr = ws.getRow(r)
    rr.getCell(1).value = new Date(m.data + 'T00:00:00'); rr.getCell(1).numFmt = 'dd/mm/yyyy'
    rr.getCell(2).value = banco(m)
    rr.getCell(3).value = tipoLabel[m.tipo] || m.tipo; rr.getCell(3).font = { color: { argb: tipoCor[m.tipo] || GRAY }, bold: true }
    const vc = rr.getCell(4); vc.value = signed(m); vc.numFmt = money; vc.font = { color: { argb: tipoCor[m.tipo] || GRAY } }
    rr.getCell(5).value = m.pessoa?.nome || '(sem contraparte)'; if (!m.pessoa) rr.getCell(5).font = { italic: true, color: { argb: 'FF9CA3AF' } }
    const b = BUCKETS[m._b]
    rr.getCell(6).value = b.label; rr.getCell(6).font = { bold: true, color: { argb: b.cor } }
    rr.getCell(7).value = m.categoria?.nome || ''
    rr.getCell(8).value = m._nota ? `${motivo(m.observacoes, m.descricao)} — [${m._nota}]` : motivo(m.observacoes, m.descricao)
    if (m._b === 'DONO') rr.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E8FF' } }
    if (m._b === 'REVISAR') rr.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E6' } }
    r++
  }
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 8 } }
}

// ===== 3) GASTOS DO DONO / A REVISAR =====
{
  const ws = wb.addWorksheet('Dono e a revisar', { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.columns = [{ width: 11 }, { width: 14 }, { width: 34 }, { width: 22 }, { width: 40 }]
  titleBar(ws, 'Gastos do dono / pessoais e itens a revisar — confirmar com a financeira', 5)
  headerRow(ws, 2, ['Data', 'Valor', 'Contraparte', 'Natureza sugerida', 'Motivo / Por que caiu aqui'])
  let r = 3
  const alvo = movs.filter((m) => m._b === 'DONO' || m._b === 'REVISAR').sort((a, b) => (a._b === b._b ? val(b) - val(a) : a._b === 'DONO' ? -1 : 1))
  for (const m of alvo) {
    const rr = ws.getRow(r)
    rr.getCell(1).value = new Date(m.data + 'T00:00:00'); rr.getCell(1).numFmt = 'dd/mm/yyyy'
    rr.getCell(2).value = val(m); rr.getCell(2).numFmt = money
    rr.getCell(3).value = m.pessoa?.nome || '(sem contraparte)'
    rr.getCell(4).value = BUCKETS[m._b].label; rr.getCell(4).font = { bold: true, color: { argb: BUCKETS[m._b].cor } }
    rr.getCell(5).value = `${motivo(m.observacoes, m.descricao)}${m._nota ? ' — ' + m._nota : ''}`
    rr.alignment = { vertical: 'top', wrapText: true }
    r++
  }
  ws.getCell(`A${r + 1}`).value = 'Estes NÃO entram no resultado operacional do negócio. Roxo = provável gasto pessoal do dono (imóvel, academia, consórcio, financiamento). Amarelo = PIX/pagamentos sem descrição clara — preciso da sua confirmação para classificar como pessoal ou operacional.'
  ws.mergeCells(`A${r + 1}:E${r + 2}`); ws.getCell(`A${r + 1}`).alignment = { wrapText: true, vertical: 'top' }; ws.getCell(`A${r + 1}`).font = { italic: true, color: { argb: 'FF6B7280' } }
}

// ===== 4) FLUXO MENSAL =====
{
  const ws = wb.addWorksheet('Fluxo Mensal', { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.columns = [{ width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 4 }, { width: 20 }]
  titleBar(ws, 'Fluxo de caixa mensal — Abr a Jun/2026', 6)
  headerRow(ws, 2, ['Mês', 'Entradas', 'Saídas', 'Resultado (E−S)', '', 'Transferências (vol.)'])
  const meses = ['2026-04', '2026-05', '2026-06']
  const nome = { '2026-04': 'Abril', '2026-05': 'Maio', '2026-06': 'Junho' }
  const soma = (list, t) => list.filter((m) => m.tipo === t).reduce((s, m) => s + val(m), 0)
  let r = 3
  for (const mm of meses) {
    const list = movs.filter((m) => String(m.data).slice(0, 7) === mm)
    const ent = soma(list, 'entrada'), sai = soma(list, 'saida'), tr = soma(list, 'transferencia')
    const rr = ws.getRow(r)
    rr.getCell(1).value = nome[mm]; rr.getCell(2).value = ent; rr.getCell(3).value = sai; rr.getCell(4).value = ent - sai; rr.getCell(6).value = tr
    ;[2, 3, 4, 6].forEach((ci) => rr.getCell(ci).numFmt = money)
    rr.getCell(2).font = { color: { argb: GREEN } }; rr.getCell(3).font = { color: { argb: RED } }; rr.getCell(6).font = { color: { argb: BLUE } }
    rr.getCell(4).font = { bold: true, color: { argb: (ent - sai) >= 0 ? GREEN : RED } }
    r++
  }
  const rt = ws.getRow(r)
  const tEnt = soma(movs, 'entrada'), tSai = soma(movs, 'saida'), tTr = soma(movs, 'transferencia')
  rt.getCell(1).value = 'TOTAL Abr–Jun'; rt.getCell(2).value = tEnt; rt.getCell(3).value = tSai; rt.getCell(4).value = tEnt - tSai; rt.getCell(6).value = tTr
  ;[2, 3, 4, 6].forEach((ci) => { rt.getCell(ci).numFmt = money; rt.getCell(ci).font = { bold: true } })
  rt.eachCell((c) => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } })
}

// ===== 5) POR CATEGORIA (ERP) =====
{
  const ws = wb.addWorksheet('Por Categoria', { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.columns = [{ width: 36 }, { width: 26 }, { width: 12 }, { width: 10 }, { width: 16 }]
  titleBar(ws, 'Resumo por categoria do ERP — Abr a Jun/2026', 5)
  headerRow(ws, 2, ['Categoria', 'Natureza (balde)', 'Tipo', 'Qtd', 'Total (R$)'])
  const g = new Map()
  for (const m of movs) { const nome = m.categoria?.nome || '(sem categoria)'; const k = `${m.tipo}|${nome}`; const c = g.get(k) || { nome, tipo: m.tipo, b: m._b, n: 0, v: 0 }; c.n++; c.v += val(m); g.set(k, c) }
  const arr = [...g.values()].sort((a, b) => (a.tipo === b.tipo ? b.v - a.v : a.tipo === 'entrada' ? -1 : 1))
  let r = 3
  for (const c of arr) { const rr = ws.getRow(r); rr.getCell(1).value = c.nome; rr.getCell(2).value = BUCKETS[c.b]?.label || c.b; rr.getCell(3).value = tipoLabel[c.tipo]; rr.getCell(3).font = { color: { argb: tipoCor[c.tipo] } }; rr.getCell(4).value = c.n; rr.getCell(5).value = c.v; rr.getCell(5).numFmt = money; r++ }
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 5 } }
}

// ===== 5.5) SICREDI · APLICAÇÃO & LEILÕES =====
{
  const sicrediMovs = movs.filter((m) => /Sicredi/i.test(m.conta?.nome || ''))
  const ws = wb.addWorksheet('Sicredi · Aplicação', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 11 }, { width: 15 }, { width: 30 }, { width: 44 }]
  titleBar(ws, 'Sicredi — aplicação automática & dinheiro dos leilões', 4,
    'Como funciona: todo dinheiro que entra no Sicredi é varrido na hora para a aplicação (saldo fica ~R$ 0). Quando precisam PAGAR algo, resgatam o valor exato da aplicação. Ou seja: RESGATE não é receita nova — é o dinheiro do leilão saindo da aplicação para pagar. Por isso resgate/aplicação ficam FORA do resultado.')

  // A) Recebimentos de leilão que caíram no Sicredi
  let r = 4
  ws.getRow(r).getCell(1).value = 'A) RECEBIMENTOS DE LEILÃO QUE ENTRARAM NO SICREDI (viram aplicação)'
  ws.getRow(r).getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  for (let ci = 1; ci <= 4; ci++) ws.getRow(r).getCell(ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } }
  r++
  headerRow(ws, r, ['Data', 'Valor', 'Pagador', 'Leilão correlacionado']); r++
  const recSic = sicrediMovs.filter((m) => m._b === 'REC_LEILAO')
  let totRec = 0
  for (const m of recSic) {
    const mt = matchBuyer(m.pessoa?.nome); totRec += val(m)
    const rr = ws.getRow(r)
    rr.getCell(1).value = new Date(m.data + 'T00:00:00'); rr.getCell(1).numFmt = 'dd/mm/yyyy'
    rr.getCell(2).value = val(m); rr.getCell(2).numFmt = money; rr.getCell(2).font = { color: { argb: GREEN } }
    rr.getCell(3).value = m.pessoa?.nome || '?'
    rr.getCell(4).value = mt ? `${mt.leilao} (${fmtDataLeilao(mt.data)})` : '— confirmar leilão —'
    if (!mt) rr.getCell(4).font = { italic: true, color: { argb: AMBER } }
    r++
  }
  const rt = ws.getRow(r); rt.getCell(1).value = 'Total recebido no Sicredi'; rt.getCell(2).value = totRec; rt.getCell(2).numFmt = money
  rt.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } } }); r += 2

  // B) Resgates e o que financiaram (por dia)
  ws.getRow(r).getCell(1).value = 'B) RESGATES DA APLICAÇÃO E O QUE FINANCIARAM (dinheiro do leilão saindo para pagar)'
  ws.getRow(r).getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  for (let ci = 1; ci <= 4; ci++) ws.getRow(r).getCell(ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } }
  r++
  headerRow(ws, r, ['Data', 'Resgate no dia', 'Pagamento financiado (beneficiário)', 'Leilão(ões) correlacionado(s)']); r++
  // agrupa por dia: soma resgates e lista saídas relevantes (repasse/comissão/transf)
  const diasSet = [...new Set(sicrediMovs.map((m) => m.data))].sort()
  for (const dia of diasSet) {
    const doDia = sicrediMovs.filter((m) => m.data === dia)
    const resg = doDia.filter((m) => /Resgate/i.test(m.categoria?.nome || '')).reduce((s, m) => s + val(m), 0)
    if (resg <= 0) continue
    const saidas = doDia.filter((m) => m.tipo === 'saida' && val(m) >= 100 && /Repasse|Comiss/i.test(m.categoria?.nome || ''))
    const transfOut = doDia.filter((m) => m.tipo === 'transferencia' && /Transferencias Internas - Saida/i.test(m.categoria?.nome || '') && val(m) >= 100)
    const alvos = [...saidas, ...transfOut]
    if (!alvos.length) {
      const rr = ws.getRow(r); rr.getCell(1).value = new Date(dia + 'T00:00:00'); rr.getCell(1).numFmt = 'dd/mm/yyyy'
      rr.getCell(2).value = resg; rr.getCell(2).numFmt = money; rr.getCell(2).font = { color: { argb: BLUE } }
      rr.getCell(3).value = '(tarifas/uber/seguros/integralização — miúdos)'; rr.getCell(3).font = { italic: true, color: { argb: 'FF9CA3AF' } }
      r++; continue
    }
    let first = true
    for (const m of alvos) {
      const rr = ws.getRow(r)
      if (first) { rr.getCell(1).value = new Date(dia + 'T00:00:00'); rr.getCell(1).numFmt = 'dd/mm/yyyy'; rr.getCell(2).value = resg; rr.getCell(2).numFmt = money; rr.getCell(2).font = { color: { argb: BLUE } }; first = false }
      const isTransf = /Transferencias Internas/i.test(m.categoria?.nome || '')
      const isDono = /FELIPE (VILELA )?ANDRADE|BULINHA/i.test(m.pessoa?.nome || '')
      rr.getCell(3).value = `${brl0(val(m))} → ${m.pessoa?.nome || '?'}${isDono ? '  ⚠ DONO' : isTransf ? '  (→ Sicoob)' : ''}`
      if (isDono) rr.getCell(3).font = { bold: true, color: { argb: PURPLE } }
      if (isTransf && !isDono) rr.getCell(4).value = 'transferência entre contas do grupo'
      else {
        const leiloes = matchAssessorLeiloes(m.pessoa?.nome, m.data)
        rr.getCell(4).value = leiloes.length ? leiloes.slice(0, 3).map((l) => `${l.leilao} (${fmtDataLeilao(l.data)})`).join(' · ') : (isDono ? 'retirada do dono — não é leilão' : '— confirmar —')
        if (!leiloes.length && !isDono) rr.getCell(4).font = { italic: true, color: { argb: AMBER } }
      }
      rr.alignment = { vertical: 'top', wrapText: true }
      r++
    }
  }
  r++
  ws.getCell(`A${r}`).value = 'Leitura: o RESGATE (azul) é o valor tirado da aplicação naquele dia; a coluna ao lado mostra o pagamento que ele bancou. Repasse/Comissão vão para os assessores (Fábio Omena=FO, Douglas Bispo=Agrobispo, Leonardo=L.S, Bulinha=Fórmula do Boi) e são custo dos leilões. ⚠ Em 27/04 um resgate bancou R$ 98.000 para Felipe Vilela Andrade (o dono) — retirada pessoal, não é leilão. O leilão correlacionado é inferido pelos fechamentos do assessor nos ~100 dias anteriores; confirmar caso a caso.'
  ws.mergeCells(`A${r}:D${r + 4}`); ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' }; ws.getCell(`A${r}`).font = { color: { argb: 'FF374151' } }
}

// ===== 6) PONTOS A VALIDAR =====
{
  const ws = wb.addWorksheet('Pontos a Validar', { views: [{ state: 'frozen', ySplit: 2 }] })
  ws.columns = [{ width: 5 }, { width: 30 }, { width: 66 }, { width: 22 }, { width: 30 }]
  titleBar(ws, 'Pontos a validar com a financeira', 5)
  headerRow(ws, 2, ['#', 'Tema', 'O que verificar', 'Valor / Ref.', 'Decisão'])
  const nDono = movs.filter((m) => m._b === 'DONO'), nRev = movs.filter((m) => m._b === 'REVISAR')
  const somaB = (k) => movs.filter((m) => m._b === k).reduce((s, m) => s + val(m), 0)
  const pts = [
    ['Gastos do dono / pessoais', 'Classifiquei como pessoais itens como casa em Uberaba, academia (Studio Runners), consórcio e financiamento Caixa (CEF). Confirmar que NÃO são da operação.', `R$ ${somaB('DONO').toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${nDono.length} mov.)`, ''],
    ['Outras despesas a revisar', 'PIX/pagamentos sem descrição clara caíram em "a revisar". Preciso saber, um a um, se é operação ou gasto do dono — ver aba "Dono e a revisar".', `R$ ${somaB('REVISAR').toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${nRev.length} mov.)`, ''],
    ['Sicredi = caixa dos leilões', 'A conta Sicredi recebe o dinheiro dos leilões, que vira aplicação automática. Os "resgates" (R$ 320 mil no tri) NÃO são receita — é esse dinheiro saindo para pagar assessores/repasses. Ver aba "Sicredi · Aplicação". Confirmar a leitura.', '34 resgates', ''],
    ['⚠ Retirada do dono (R$ 98.000)', 'Em 27/04 um resgate no Sicredi bancou R$ 98.000 transferidos para FELIPE VILELA ANDRADE (dono) e R$ 50.000 para a conta Sicoob. A parte do dono é retirada pessoal? Hoje está como "Transferência interna".', 'R$ 98.000,00', ''],
    ['Sociedade Fórmula do Boi', 'Pagamentos p/ FORMULA DO BOI (repasse/comissão, "sociedade", "comissões abr/mai") — tratei como comissão de leilão a pagar (operacional). Confirmar.', 'R$ 45.136,00 (4 mov.)', ''],
    ['Cartão de crédito', 'DÉB.CONV.DEM.EMPRES = fatura dos cartões Sicoob. É saída de caixa real, mas os itens já estão no módulo Cartões. A fatura pode conter gasto pessoal do dono?', 'R$ 69.212,16 (6 mov.)', ''],
    ['Despesas de leilão / assessores', 'Hotel, passagem, locação (Unidas/Adilson), refeições dos assessores nos leilões — tratei como reembolso operacional. Alguma é adiantamento/comissão?', 'ver balde "Despesas de Leilão"', ''],
    ['Reembolso × comissão (assessores)', 'Alguns pagamentos a assessores oscilam entre reembolso (hotel/refeição) e comissão. Onde estiver dúbio, confirmar a natureza.', '—', ''],
  ]
  let r = 3
  pts.forEach((p, i) => { const rr = ws.getRow(r); rr.getCell(1).value = i + 1; rr.getCell(2).value = p[0]; rr.getCell(3).value = p[1]; rr.getCell(4).value = p[2]; rr.getCell(5).value = p[3]; rr.alignment = { wrapText: true, vertical: 'top' }; rr.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7E6' } }; rr.eachCell((c) => c.border = { bottom: { style: 'hair', color: { argb: BORDER } } }); r++ })
}

await wb.xlsx.writeFile(OUT)
console.log('OK →', OUT)
console.log(`Movimentos Abr–Jun: ${movs.length}`)
for (const [k, b] of Object.entries(BUCKETS).sort((a, b2) => a[1].ord - b2[1].ord)) {
  const a = agg[k]; if (!a.n) continue
  console.log(`  ${b.label.padEnd(38)} | qtd ${String(a.n).padStart(3)} | ent ${a.ent.toFixed(2).padStart(12)} | sai ${a.sai.toFixed(2).padStart(12)}`)
}
