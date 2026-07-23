// Gera planilha XLSX das comissões dos assessores em um mês/ano, com uma aba por
// assessor + aba Resumo. Reproduz fielmente a lógica da página COMISSIONAMENTO do
// ERP (src/app/erp/erp.html): flComissaoAssessores() + coAggregate().
//
//   flComissaoAssessores: comissão "real" = por_assessor[].comissao quando informada;
//   os demais rateiam o que sobra (comissao_assessoria − soma dos reais) por VGV.
//   % do leilão = vgv_do_assessor / soma dos vgv do por_assessor daquele leilão.
//
// Diferença deliberada vs. ERP: o ERP agrupa por nome.trim().toUpperCase(), o que
// separa "Fabio Omena" de "Fábio Omena" (mesma pessoa, duas linhas). Aqui o
// agrupamento ignora acentos e aplica ALIASES, consolidando a pessoa.
//
// Uso: MES=06 ANO=2026 node scripts/gera-xlsx-comissoes-assessores.mjs
//      OUT=C:\caminho\arquivo.xlsx para escolher o destino.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

const MES = process.env.MES || '06'
const ANO = process.env.ANO || '2026'
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
const MES_NOME = MESES[Number(MES) - 1]

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.env.OUT || join(homedir(), 'Desktop', `Comissoes_Assessores_${MES_NOME[0].toUpperCase()}${MES_NOME.slice(1)}_${ANO}.xlsx`)

const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// ---------- normalização de nome ----------
const deacc = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
const key = (s) => deacc(s).trim().toUpperCase().replace(/\s+/g, ' ')
// variantes do mesmo assessor -> nome canônico
const ALIASES = {
  'FABIO OMENA': 'Fábio Omena',
  'DOUGLAS BISPO': 'Douglas Bispo',
  'LEONARDO SERAFIM': 'Leonardo Serafim',
  'LEO': 'Leonardo Serafim',
  'MARCELO CARNEIRO / LEONARDO SERAFIM': 'Leonardo Serafim',
  'LM ASSESSORIA': 'Leonardo Serafim',
  'MATEUS ALVES': 'Matheus Alves',
  'BULINHA (FELIPE ANDRADE)': 'Bulinha (Felipe Andrade)',
  'FELIPE VILELA ANDRADE (BULINHA)': 'Bulinha (Felipe Andrade)',
  'NAO INFORMADO': 'Não informado',
}
const canonical = (nome) => ALIASES[key(nome)] || (nome || '').trim()

// ---------- lógica idêntica ao ERP ----------
function flComissaoAssessores(f) {
  const ass = (f.por_assessor || []).filter((a) => a && (a.nome || a.vgv))
  const total = Number(f.comissao_assessoria) || 0
  const isReal = (a) => a.comissao != null && a.comissao !== '' && !Number.isNaN(Number(a.comissao))
  let realSum = 0, vgvNonReal = 0
  for (const a of ass) {
    if (isReal(a)) realSum += Number(a.comissao)
    else vgvNonReal += Number(a.vgv) || 0
  }
  const remaining = Math.max(0, total - realSum)
  return ass.map((a) => {
    const vgv = Number(a.vgv) || 0
    const real = isReal(a)
    const comissao = real ? Number(a.comissao) : (vgvNonReal > 0 ? remaining * (vgv / vgvNonReal) : 0)
    return { ...a, _vgv: vgv, _real: real, _comissao: comissao }
  })
}

const { data: fechs, error } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,local,vgv_total,comissao_assessoria,por_assessor')
  .gte('data', `${ANO}-${MES}-01`).lt('data', `${ANO}-${String(Number(MES) + 1).padStart(2, '0')}-01`)
  .order('data')
if (error) { console.error('Erro Supabase:', error.message); process.exit(1) }

const map = new Map()
for (const f of fechs) {
  const comAss = flComissaoAssessores(f)
  const totalVgv = comAss.reduce((s, a) => s + a._vgv, 0)
  for (const a of comAss) {
    const nome = canonical(a.nome)
    if (!nome) continue
    const k = key(nome)
    const share = totalVgv > 0 ? a._vgv / totalVgv : 0
    let rec = map.get(k)
    if (!rec) { rec = { nome, empresas: new Set(), leiloes: [], vgv: 0, comissao: 0, transacoes: 0, animais: 0, temEstimado: false }; map.set(k, rec) }
    if (a.empresa) rec.empresas.add(a.empresa)
    rec.vgv += a._vgv; rec.comissao += a._comissao
    rec.transacoes += Number(a.transacoes) || 0; rec.animais += Number(a.animais) || 0
    if (!a._real && a._comissao > 0) rec.temEstimado = true
    rec.leiloes.push({
      nome: f.nome, data: f.data, empresa: a.empresa || '', vgv: a._vgv, share,
      comissao: a._comissao, real: a._real, pct: a.comissao_pct,
      transacoes: Number(a.transacoes) || 0, animais: Number(a.animais) || 0,
    })
  }
}
const assessores = [...map.values()].map((r) => ({ ...r, empresas: [...r.empresas] }))
  .sort((a, b) => b.comissao - a.comissao || b.vgv - a.vgv)
const comPagar = assessores.filter((a) => a.comissao > 0)
const semPagar = assessores.filter((a) => a.comissao <= 0)

// ---------- workbook ----------
const BRL = '"R$" #,##0.00'
const PCT = '0.0%'
const DATA = 'dd/mm/yyyy'
const PRETO = 'FF111111'
const DOURADO = 'FFC9A84C'
const CINZA = 'FFF2F2F2'

const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria'
wb.created = new Date(`${ANO}-${MES}-01T00:00:00Z`)

const titulo = (ws, texto, span) => {
  const r = ws.addRow([texto])
  ws.mergeCells(r.number, 1, r.number, span)
  r.getCell(1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
  r.getCell(1).alignment = { vertical: 'middle' }
  r.height = 26
  return r
}
const cabecalho = (ws, cols) => {
  const r = ws.addRow(cols)
  r.eachCell((c) => {
    c.font = { bold: true, size: 10, color: { argb: PRETO } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } }
    c.border = { bottom: { style: 'thin', color: { argb: DOURADO } } }
    c.alignment = { vertical: 'middle', wrapText: true }
  })
  r.height = 20
  return r
}

// ===== Aba Resumo =====
const resumo = wb.addWorksheet('Resumo', { views: [{ state: 'frozen', ySplit: 4 }] })
resumo.columns = [
  { width: 34 }, { width: 22 }, { width: 10 }, { width: 10 }, { width: 10 },
  { width: 18 }, { width: 16 }, { width: 12 },
]
titulo(resumo, `COMISSÕES DOS ASSESSORES — ${MES_NOME.toUpperCase()}/${ANO}`, 8)
const totalGeral = comPagar.reduce((s, a) => s + a.comissao, 0)
const vgvGeral = assessores.reduce((s, a) => s + a.vgv, 0)
const rSub = resumo.addRow([`${fechs.length} leilões no mês · ${comPagar.length} assessores com comissão · total a pagar R$ ${totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`])
resumo.mergeCells(rSub.number, 1, rSub.number, 8)
rSub.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF666666' } }
resumo.addRow([])
cabecalho(resumo, ['Assessor', 'Empresa(s)', 'Leilões', 'Vendas', 'Animais', 'VGV Intermediado', 'Comissão', 'Cálculo'])

for (const a of assessores) {
  const r = resumo.addRow([
    a.nome, a.empresas.join(' / '), a.leiloes.length, a.transacoes, a.animais,
    a.vgv, a.comissao, a.temEstimado ? 'contém estimado' : 'real',
  ])
  r.getCell(6).numFmt = BRL
  r.getCell(7).numFmt = BRL
  r.getCell(7).font = { bold: true }
  if (a.comissao <= 0) r.eachCell((c) => { c.font = { ...(c.font || {}), color: { argb: 'FF999999' } } })
  r.getCell(8).font = { size: 9, color: { argb: a.temEstimado ? 'FFB07800' : 'FF2E7D32' } }
}
const rTot = resumo.addRow(['TOTAL', '', assessores.reduce((s, a) => s + a.leiloes.length, 0),
  assessores.reduce((s, a) => s + a.transacoes, 0), assessores.reduce((s, a) => s + a.animais, 0),
  vgvGeral, totalGeral, ''])
rTot.eachCell((c) => {
  c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
})
rTot.getCell(6).numFmt = BRL
rTot.getCell(7).numFmt = BRL

resumo.addRow([])
const nota = resumo.addRow(['Comissão "real" = valor informado no fechamento. "Estimado" = rateio do que sobra da comissão total do leilão, proporcional ao VGV.'])
resumo.mergeCells(nota.number, 1, nota.number, 8)
nota.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF666666' } }
if (semPagar.length) {
  const n2 = resumo.addRow([`Sem comissão no mês (só aparecem aqui, sem aba própria): ${semPagar.map((a) => a.nome).join(', ')}.`])
  resumo.mergeCells(n2.number, 1, n2.number, 8)
  n2.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF666666' } }
}

// ===== Uma aba por assessor =====
const sanitize = (n) => n.replace(/[:\\/?*[\]]/g, '-').slice(0, 31)
const usados = new Set()
for (const a of comPagar) {
  let nomeAba = sanitize(a.nome)
  let i = 2
  while (usados.has(nomeAba)) nomeAba = sanitize(`${a.nome} ${i++}`)
  usados.add(nomeAba)

  const ws = wb.addWorksheet(nomeAba, { views: [{ state: 'frozen', ySplit: 7 }] })
  ws.columns = [{ width: 12 }, { width: 52 }, { width: 10 }, { width: 10 }, { width: 18 }, { width: 13 }, { width: 16 }, { width: 11 }]

  titulo(ws, `${a.nome.toUpperCase()} — COMISSÃO ${MES_NOME.toUpperCase()}/${ANO}`, 8)
  const sub = ws.addRow([a.empresas.join(' / ')])
  ws.mergeCells(sub.number, 1, sub.number, 8)
  sub.getCell(1).font = { italic: true, size: 10, color: { argb: 'FF666666' } }
  ws.addRow([])

  // KPIs
  const kLab = ws.addRow(['TOTAL A PAGAR', '', 'VGV INTERMEDIADO', '', 'LEILÕES', '', 'VENDAS / ANIMAIS', ''])
  ws.mergeCells(kLab.number, 1, kLab.number, 2); ws.mergeCells(kLab.number, 3, kLab.number, 4)
  ws.mergeCells(kLab.number, 5, kLab.number, 6); ws.mergeCells(kLab.number, 7, kLab.number, 8)
  kLab.eachCell((c) => { c.font = { size: 8, bold: true, color: { argb: 'FF999999' } } })

  const kVal = ws.addRow([a.comissao, '', a.vgv, '', a.leiloes.length, '', `${a.transacoes} · ${a.animais}`, ''])
  ws.mergeCells(kVal.number, 1, kVal.number, 2); ws.mergeCells(kVal.number, 3, kVal.number, 4)
  ws.mergeCells(kVal.number, 5, kVal.number, 6); ws.mergeCells(kVal.number, 7, kVal.number, 8)
  kVal.getCell(1).numFmt = BRL; kVal.getCell(3).numFmt = BRL
  kVal.getCell(1).font = { size: 13, bold: true, color: { argb: PRETO } }
  kVal.getCell(3).font = { size: 13, bold: true, color: { argb: DOURADO } }
  kVal.getCell(5).font = { size: 13, bold: true }; kVal.getCell(7).font = { size: 13, bold: true }
  kVal.height = 20
  ws.addRow([])

  cabecalho(ws, ['Data', 'Leilão', 'Vendas', 'Animais', 'VGV', '% do Leilão', 'Comissão', 'Cálculo'])
  for (const l of [...a.leiloes].sort((x, y) => x.data.localeCompare(y.data))) {
    const r = ws.addRow([
      new Date(`${l.data}T12:00:00Z`), l.nome, l.transacoes, l.animais, l.vgv, l.share, l.comissao,
      l.real ? 'real' : 'estimado',
    ])
    r.getCell(1).numFmt = DATA
    r.getCell(5).numFmt = BRL
    r.getCell(6).numFmt = PCT
    r.getCell(7).numFmt = BRL
    r.getCell(7).font = { bold: true }
    r.getCell(8).font = { size: 9, color: { argb: l.real ? 'FF2E7D32' : 'FFB07800' } }
  }
  const t = ws.addRow(['', 'TOTAL', a.transacoes, a.animais, a.vgv, null, a.comissao, ''])
  t.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } } })
  t.getCell(5).numFmt = BRL
  t.getCell(7).numFmt = BRL
}

await wb.xlsx.writeFile(OUT)
const brl = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
console.log(`OK — ${OUT}`)
console.log(`${fechs.length} leilões · ${comPagar.length} abas de assessor · total R$ ${brl(totalGeral)}\n`)
for (const a of assessores) {
  console.log(`  ${a.comissao > 0 ? ' ' : '·'} ${brl(a.comissao).padStart(12)} | ${String(a.leiloes.length).padStart(2)} leilões | VGV ${brl(a.vgv).padStart(12)} | ${a.nome}${a.temEstimado ? '  [tem estimado]' : ''}`)
}
