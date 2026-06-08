// Gera PDF executivo com fechamentos sem faturamento total informado.
//
// Uso:
//   node scripts/gerar-relatorio-leiloes-sem-faturamento.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const outDir = join(root, 'relatorios')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const now = new Date()
const generatedAt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
}).format(now)

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
})
const int = (v) => Number(v || 0).toLocaleString('pt-BR')
const pctLabel = (v) => v == null ? '-' : `${(Number(v) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
const shortDate = (s) => {
  const [y, m, d] = String(s || '').slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : '-'
}
const moneyShort = (v) => {
  const n = Number(v || 0)
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
  if (n >= 1_000) return `R$ ${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
  return brl(n)
}

const { data, error } = await supabase
  .from('bula_leilao_fechamento')
  .select('id,nome,data,local,lotes_ofertados,lotes_vendidos,animais_vendidos,vgv_total,faturamento_total_leilao,acordo_pct_faturamento,acordo_pct_venda_cobertura,acordo_descricao,receita_bula,comissao_assessoria,sobra_bruta,por_assessor,observacoes')
  .order('data', { ascending: false })
if (error) throw new Error(error.message)

const all = data ?? []
const missing = all
  .filter((f) => !f.faturamento_total_leilao || Number(f.faturamento_total_leilao) === 0)
  .map((f) => {
    const acordo = String(f.acordo_descricao || '').toLowerCase()
    const dependeFaturamento = Boolean(f.acordo_pct_faturamento) || acordo.includes('faturamento') || acordo.includes('participacao') || acordo.includes('participação')
    const acordoAusente = !f.acordo_descricao && f.acordo_pct_faturamento == null && f.acordo_pct_venda_cobertura == null
    const receitaZerada = !Number(f.receita_bula || 0)
    let prioridade = 'MEDIA'
    if (receitaZerada || acordoAusente) prioridade = 'ALTA'
    else if (dependeFaturamento) prioridade = 'ALTA'

    const faltante = acordoAusente
      ? 'Faturamento total e acordo comercial'
      : dependeFaturamento
        ? 'Faturamento total para recalcular receita/cobertura'
        : 'Faturamento total para medir cobertura'

    const assessores = (f.por_assessor || [])
      .map((a) => String(a?.nome || '').trim())
      .filter(Boolean)
      .slice(0, 5)
      .join(', ')

    return {
      ...f,
      prioridade,
      faltante,
      assessores: assessores || '-',
      dependeFaturamento,
      acordoAusente,
      receitaZerada,
    }
  })

const high = missing.filter((f) => f.prioridade === 'ALTA')
const medium = missing.filter((f) => f.prioridade !== 'ALTA')
const sum = (arr, key) => arr.reduce((acc, item) => acc + Number(item[key] || 0), 0)
const totalVgv = sum(missing, 'vgv_total')
const totalReceita = sum(missing, 'receita_bula')
const totalComissao = sum(missing, 'comissao_assessoria')
const coberturaSemBase = missing.reduce((acc, f) => acc + Number(f.lotes_vendidos || 0), 0)

const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
const W = doc.internal.pageSize.getWidth()
const H = doc.internal.pageSize.getHeight()
const M = 36
const bronze = [166, 139, 75]
const dark = [16, 17, 17]
const muted = [88, 96, 108]
const soft = [244, 241, 232]
const line = [222, 226, 230]
const red = [178, 65, 65]

function addLogo(x, y, w) {
  const p = join(root, 'public', 'logo-bula.png')
  if (!existsSync(p)) return
  try {
    const b64 = readFileSync(p).toString('base64')
    doc.addImage(`data:image/png;base64,${b64}`, 'PNG', x, y, w, w * 0.42)
  } catch {
    // Logo is optional for this report.
  }
}

function footer() {
  const page = doc.getNumberOfPages()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...muted)
  doc.text(`Bula Assessoria | Relatorio gerado em ${generatedAt}`, M, H - 20)
  doc.text(`Pagina ${page}`, W - M, H - 20, { align: 'right' })
}

function header(title, subtitle = '') {
  doc.setFillColor(...dark)
  doc.rect(0, 0, W, 104, 'F')
  addLogo(M, 24, 94)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.setTextColor(255, 255, 255)
  doc.text(title, M + 114, 45)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(216, 210, 194)
  doc.text(subtitle, M + 114, 64)
  doc.setDrawColor(...bronze)
  doc.setLineWidth(2)
  doc.line(M + 114, 78, W - M, 78)
}

function card(x, y, w, h, label, value, hint, color = bronze) {
  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(226, 226, 226)
  doc.roundedRect(x, y, w, h, 6, 6, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...color)
  doc.text(String(value), x + 14, y + 31)
  doc.setFontSize(7.5)
  doc.setTextColor(...muted)
  doc.text(String(label).toUpperCase(), x + 14, y + 49)
  if (hint) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(hint, x + 14, y + 65, { maxWidth: w - 28 })
  }
}

header(
  'Leiloes sem faturamento total',
  'Relacao atualizada para corrigir cobertura, receita por acordo e acompanhamento financeiro.',
)

doc.setFillColor(...soft)
doc.rect(0, 104, W, H - 104, 'F')

doc.setFont('helvetica', 'bold')
doc.setFontSize(10)
doc.setTextColor(...dark)
doc.text('Resumo executivo', M, 132)

const gap = 10
const cw = (W - M * 2 - gap * 3) / 4
card(M, 146, cw, 78, 'sem faturamento', missing.length, `${all.length} fechamentos analisados`, red)
card(M + (cw + gap), 146, cw, 78, 'prioridade alta', high.length, 'impacta receita/acordo ou esta zerado', red)
card(M + (cw + gap) * 2, 146, cw, 78, 'VGV cobertura', moneyShort(totalVgv), `${int(coberturaSemBase)} lotes vendidos sem base`, bronze)
card(M + (cw + gap) * 3, 146, cw, 78, 'receita atual', moneyShort(totalReceita), `${brl(totalComissao)} em comissoes apuradas`, bronze)

doc.setFont('helvetica', 'normal')
doc.setFontSize(9)
doc.setTextColor(...muted)
doc.text(
  'Criterio: fechamentos em bula_leilao_fechamento com faturamento_total_leilao vazio ou zero. ' +
  'Prioridade alta quando o acordo depende do faturamento, a receita esta zerada ou o acordo ainda nao esta descrito.',
  M,
  252,
  { maxWidth: W - M * 2 },
)

doc.setFont('helvetica', 'bold')
doc.setFontSize(10)
doc.setTextColor(...dark)
doc.text('Lista priorizada', M, 292)

autoTable(doc, {
  startY: 306,
  margin: { left: M, right: M },
  head: [['Pri.', 'Data', 'Leilao', 'Lotes', 'VGV Bula', 'Receita atual', 'Acordo / falta']],
  body: missing.map((f) => [
    f.prioridade,
    shortDate(f.data),
    f.nome,
    `${int(f.lotes_vendidos)}/${int(f.lotes_ofertados)} | ${int(f.animais_vendidos)} anim.`,
    brl(f.vgv_total),
    brl(f.receita_bula),
    `${f.acordo_descricao || 'Acordo nao informado'}\nFalta: ${f.faltante}`,
  ]),
  styles: {
    font: 'helvetica',
    fontSize: 7.3,
    cellPadding: 5,
    valign: 'top',
    textColor: [32, 36, 42],
    lineColor: line,
    lineWidth: 0.4,
  },
  headStyles: {
    fillColor: dark,
    textColor: [255, 255, 255],
    fontStyle: 'bold',
    fontSize: 7.5,
  },
  alternateRowStyles: { fillColor: [250, 250, 248] },
  columnStyles: {
    0: { cellWidth: 31, halign: 'center', fontStyle: 'bold' },
    1: { cellWidth: 50 },
    2: { cellWidth: 138, fontStyle: 'bold' },
    3: { cellWidth: 58 },
    4: { cellWidth: 62, halign: 'right' },
    5: { cellWidth: 62, halign: 'right' },
    6: { cellWidth: W - M * 2 - 31 - 50 - 138 - 58 - 62 - 62 },
  },
  didParseCell: (hook) => {
    if (hook.section === 'body' && hook.column.index === 0) {
      const pri = hook.cell.raw
      hook.cell.styles.textColor = pri === 'ALTA' ? red : bronze
    }
  },
})

footer()

doc.addPage()
header('Detalhamento para cobranca', 'Itens que precisam de faturamento total para fechar cobertura e conferencia.')
doc.setFillColor(...soft)
doc.rect(0, 104, W, H - 104, 'F')

doc.setFont('helvetica', 'bold')
doc.setFontSize(10)
doc.setTextColor(...dark)
doc.text('Prioridade alta', M, 132)

autoTable(doc, {
  startY: 148,
  margin: { left: M, right: M },
  head: [['Data', 'Leilao', 'VGV', 'Receita', 'Motivo da pendencia', 'Assess.']],
  body: high.map((f) => [
    shortDate(f.data),
    f.nome,
    brl(f.vgv_total),
    brl(f.receita_bula),
    f.faltante,
    f.assessores,
  ]),
  styles: {
    font: 'helvetica',
    fontSize: 7.5,
    cellPadding: 5,
    valign: 'top',
    lineColor: line,
    lineWidth: 0.4,
  },
  headStyles: { fillColor: red, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [250, 250, 248] },
  columnStyles: {
    0: { cellWidth: 52 },
    1: { cellWidth: 150, fontStyle: 'bold' },
    2: { cellWidth: 70, halign: 'right' },
    3: { cellWidth: 70, halign: 'right' },
    4: { cellWidth: 122 },
    5: { cellWidth: W - M * 2 - 52 - 150 - 70 - 70 - 122 },
  },
})

let y = doc.lastAutoTable.finalY + 24
doc.setFont('helvetica', 'bold')
doc.setFontSize(10)
doc.setTextColor(...dark)
doc.text('Pendentes para cobertura', M, y)

autoTable(doc, {
  startY: y + 14,
  margin: { left: M, right: M },
  head: [['Data', 'Leilao', 'VGV Bula', 'Acordo atual', 'Falta']],
  body: medium.map((f) => [
    shortDate(f.data),
    f.nome,
    brl(f.vgv_total),
    `${pctLabel(f.acordo_pct_faturamento)} fat. | ${pctLabel(f.acordo_pct_venda_cobertura)} venda`,
    f.faltante,
  ]),
  styles: {
    font: 'helvetica',
    fontSize: 7.5,
    cellPadding: 5,
    valign: 'top',
    lineColor: line,
    lineWidth: 0.4,
  },
  headStyles: { fillColor: bronze, textColor: [255, 255, 255], fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [250, 250, 248] },
  columnStyles: {
    0: { cellWidth: 52 },
    1: { cellWidth: 178, fontStyle: 'bold' },
    2: { cellWidth: 74, halign: 'right' },
    3: { cellWidth: 105 },
    4: { cellWidth: W - M * 2 - 52 - 178 - 74 - 105 },
  },
})

footer()

doc.addPage()
header('Checklist de atualizacao', 'Como usar esta relacao para deixar a cobertura certinha.')
doc.setFillColor(...soft)
doc.rect(0, 104, W, H - 104, 'F')

const checklist = [
  ['1', 'Pedir a leiloeira o faturamento total final de cada leilao listado.'],
  ['2', 'Atualizar o campo faturamento_total_leilao no fechamento do sistema.'],
  ['3', 'Recalcular receita Bula quando o acordo tiver percentual sobre faturamento.'],
  ['4', 'Conferir cobertura: VGV Bula dividido pelo faturamento total da leiloeira.'],
  ['5', 'Revisar contas a receber que foram provisionadas antes do faturamento final.'],
  ['6', 'Separar casos com assessor nao informado antes de transformar comissao apurada em conta a pagar.'],
]

autoTable(doc, {
  startY: 132,
  margin: { left: M, right: M },
  body: checklist,
  theme: 'plain',
  styles: { font: 'helvetica', fontSize: 11, cellPadding: 8, valign: 'middle' },
  columnStyles: {
    0: { cellWidth: 28, halign: 'center', fontStyle: 'bold', textColor: bronze },
    1: { cellWidth: W - M * 2 - 28, textColor: dark },
  },
  didDrawCell: (hook) => {
    if (hook.column.index === 0 && hook.section === 'body') {
      doc.setDrawColor(...bronze)
      doc.circle(hook.cell.x + 14, hook.cell.y + hook.cell.height / 2, 11, 'S')
    }
  },
})

doc.setFont('helvetica', 'bold')
doc.setFontSize(10)
doc.setTextColor(...dark)
doc.text('Observacao importante', M, doc.lastAutoTable.finalY + 28)
doc.setFont('helvetica', 'normal')
doc.setFontSize(9)
doc.setTextColor(...muted)
doc.text(
  'Este PDF nao altera dados no banco. Ele e uma foto operacional dos fechamentos que ainda estao sem faturamento total. ' +
  'Alguns leiloes ja tem receita provisionada pela venda da cobertura, mas continuam sem base para calcular a cobertura percentual do leilao inteiro.',
  M,
  doc.lastAutoTable.finalY + 45,
  { maxWidth: W - M * 2 },
)

footer()

const fileName = `relatorio-leiloes-sem-faturamento-${now.toISOString().slice(0, 10)}.pdf`
const output = join(outDir, fileName)
writeFileSync(output, Buffer.from(doc.output('arraybuffer')))
console.log(output)
console.log(JSON.stringify({
  totalFechamentos: all.length,
  semFaturamento: missing.length,
  prioridadeAlta: high.length,
  vgvCoberturaSemFaturamento: totalVgv,
  receitaAtual: totalReceita,
}, null, 2))
