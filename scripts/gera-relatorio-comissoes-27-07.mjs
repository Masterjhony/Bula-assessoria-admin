// Relatório de COMISSÕES A PAGAR — pagamento 27/07/2026.
//
// Base (definida pelo chefe em 23/07):
//  · Demais assessores: exatamente o que a página Bônus e Comissionamento
//    mostra no filtro de JUNHO (agregação dos fechamentos = mesma fonte).
//  · Gustavo Rusa: junho está quitado (48.895,44 pagos); entra o saldo de
//    JULHO — R$ 23.490,00 dos lotes dos compradores dele (Dr Celso Lopes /
//    Pedro Pontes) a 5%.
//  · Bulinha: planilha COMISSÃO BULINHA (mai+jun = 58.872,00) MENOS os gastos
//    do cartão dele (VISA E MASTER 22/05, 22/06 e 22/07 = 51.479,47), que
//    abatem do valor a receber. Líquido: R$ 7.392,53.
//
// Saída: outputs/relatorio-comissoes-pagar-2026-07-27.{html,pdf}
// Uso: node scripts/gera-relatorio-comissoes-27-07.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const r2 = (n) => Math.round(Number(n) * 100) / 100
const dt = (d) => String(d || '').split('-').reverse().join('/')

// --- mesma resolução de comissão da página (flComissaoAssessores) ---
function comissaoAssessores(f) {
  const ass = (f.por_assessor || []).filter((a) => a && (a.nome || a.vgv))
  const total = Number(f.comissao_assessoria) || 0
  const isReal = (a) => a.comissao != null && a.comissao !== '' && !Number.isNaN(Number(a.comissao))
  let realSum = 0, vgvNonReal = 0
  for (const a of ass) { if (isReal(a)) realSum += Number(a.comissao); else vgvNonReal += Number(a.vgv) || 0 }
  const remaining = Math.max(0, total - realSum)
  return ass.map((a) => {
    const vgv = Number(a.vgv) || 0, real = isReal(a)
    return { ...a, _vgv: vgv, _comissao: real ? Number(a.comissao) : (vgvNonReal > 0 ? remaining * (vgv / vgvNonReal) : 0) }
  })
}
const CANON = {
  'FABIO OMENA': 'Fábio Omena', 'FABIO OMENNA': 'Fábio Omena',
  'LEO': 'Leonardo Serafim', 'LEONARDO': 'Leonardo Serafim', 'LEO SERAFIM': 'Leonardo Serafim', 'LM ASSESSORIA': 'Leonardo Serafim',
  'BULINHA': 'Bulinha (Felipe Andrade)', 'FELIPE ANDRADE': 'Bulinha (Felipe Andrade)',
  'FELIPE VILELA ANDRADE': 'Bulinha (Felipe Andrade)', 'FELIPE VILELA ANDRADE BULINHA': 'Bulinha (Felipe Andrade)',
  'BULINHA FELIPE ANDRADE': 'Bulinha (Felipe Andrade)', 'MATEUS ALVES': 'Matheus Alves',
}
const nk = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const canon = (s) => CANON[nk(s)] || String(s || '').trim()

const { data: fechs, error } = await sb.from('bula_leilao_fechamento').select('*').order('data')
if (error) { console.error(error.message); process.exit(1) }

// ---- JUNHO em aberto, por pessoa (exclui Bulinha e Rusa: blocos próprios) ----
const junho = new Map()
for (const f of fechs || []) {
  if (!String(f.data || '').startsWith('2026-06')) continue
  for (const a of comissaoAssessores(f)) {
    if (a.pago === true || !(a._comissao > 0.001)) continue
    const nome = canon(a.nome)
    if (/Bulinha|Gustavo Rusa/i.test(nome)) continue
    if (!junho.has(nome)) junho.set(nome, { nome, total: 0, itens: [] })
    const g = junho.get(nome)
    g.total = r2(g.total + a._comissao)
    g.itens.push({ data: f.data, leilao: f.nome, vgv: a._vgv, pct: a.comissao_pct, valor: r2(a._comissao) })
  }
}

// ---- Bulinha: planilha do chefe menos cartões ----
const BULINHA_COM = [
  { data: '2026-05-03', leilao: 'EAO', base: 703000, valor: 14060 },
  { data: '2026-05-09', leilao: '4R', base: 510300, valor: 10206 },
  { data: '2026-05-15', leilao: 'JEM', base: 127500, valor: 2550 },
  { data: '2026-06-07', leilao: 'JACAMIM', base: 27000, valor: 540 },
  { data: '2026-06-13', leilao: 'JMP BEZERRAS', base: 63000, valor: 1260 },
  { data: '2026-06-14', leilao: 'JMP TOUROS', base: 1512800, valor: 30256 },
]
const BULINHA_CARTAO = [
  { data: '2026-05-22', desc: 'VISA E MASTER', valor: 24683.55 },
  { data: '2026-06-22', desc: 'VISA E MASTER', valor: 16078.47 },
  { data: '2026-07-22', desc: 'VISA E MASTER', valor: 10717.45 },
]
const bulinhaBruto = r2(BULINHA_COM.reduce((s, x) => s + x.valor, 0))
const bulinhaCartao = r2(BULINHA_CARTAO.reduce((s, x) => s + x.valor, 0))
const bulinhaLiquido = r2(bulinhaBruto - bulinhaCartao)

// ---- Rusa: saldo de julho ----
const RUSA = [
  { data: '2026-07-11', leilao: 'MEGA EVENTO EAO BAVIERA — Fêmeas', det: 'Lotes 20, 27, 28, 31, 36 (Dr Celso Lopes) + 135 (Pedro Pontes)', base: 262500, valor: 13125 },
  { data: '2026-07-15', leilao: 'NELORE SANTA CRUZ', det: 'Lote 124 (Dr Celso Lopes)', base: 20100, valor: 1005 },
  { data: '2026-07-16', leilao: '2ª ETAPA NAVIRAÍ MATRIZES', det: 'Lotes 8, 80 e 2 (Dr Celso Lopes)', base: 113100, valor: 5655 },
  { data: '2026-07-19', leilao: 'NELORE SANTA CRUZ', det: 'Lotes 42 e 39 (Dr Celso Lopes)', base: 74100, valor: 3705 },
]
const rusaTotal = r2(RUSA.reduce((s, x) => s + x.valor, 0))

// ---- resumo ----
const linhas = [
  ...[...junho.values()].map((g) => ({ nome: g.nome, valor: g.total, tipo: 'junho', itens: g.itens })),
  { nome: 'Bulinha (Felipe Andrade)', valor: bulinhaLiquido, tipo: 'bulinha' },
  { nome: 'Gustavo Rusa', valor: rusaTotal, tipo: 'rusa' },
].sort((a, b) => b.valor - a.valor)
const totalGeral = r2(linhas.reduce((s, l) => s + l.valor, 0))

const pctTxt = (p) => p != null && p !== '' ? `${(Number(p) * 100).toFixed(2).replace('.', ',').replace(/,00$/, '')}%` : '—'

const blocoJunho = (l) => `
  <section class="pessoa">
    <div class="ph"><h2>${esc(l.nome)}</h2><div class="pt">R$ ${brl(l.valor)}</div></div>
    <table>
      <thead><tr><th style="width:64px">Data</th><th>Leilão</th><th style="width:120px;text-align:right">VGV</th><th style="width:50px;text-align:right">%</th><th style="width:100px;text-align:right">Comissão</th></tr></thead>
      <tbody>
        ${l.itens.sort((a, b) => a.data.localeCompare(b.data)).map((i) => `<tr>
          <td>${dt(i.data)}</td><td>${esc(i.leilao)}</td>
          <td class="money">${i.vgv ? 'R$ ' + brl(i.vgv) : '—'}</td>
          <td class="money">${pctTxt(i.pct)}</td>
          <td class="money">R$ ${brl(i.valor)}</td></tr>`).join('')}
      </tbody>
    </table>
  </section>`

const blocoBulinha = `
  <section class="pessoa">
    <div class="ph"><h2>Bulinha (Felipe Andrade)</h2><div class="pt">R$ ${brl(bulinhaLiquido)}</div></div>
    <table>
      <thead><tr><th style="width:64px">Data</th><th>Leilão</th><th style="width:120px;text-align:right">Valor</th><th style="width:50px;text-align:right">%</th><th style="width:100px;text-align:right">Comissão</th></tr></thead>
      <tbody>
        ${BULINHA_COM.map((i) => `<tr><td>${dt(i.data)}</td><td>${esc(i.leilao)}</td><td class="money">R$ ${brl(i.base)}</td><td class="money">2%</td><td class="money">R$ ${brl(i.valor)}</td></tr>`).join('')}
        <tr class="sub"><td colspan="4">Subtotal comissões</td><td class="money">R$ ${brl(bulinhaBruto)}</td></tr>
        ${BULINHA_CARTAO.map((i) => `<tr class="deb"><td>${dt(i.data)}</td><td colspan="3">${esc(i.desc)} — gasto no cartão (abate da comissão)</td><td class="money">− R$ ${brl(i.valor)}</td></tr>`).join('')}
        <tr class="sub"><td colspan="4">Subtotal cartão</td><td class="money">− R$ ${brl(bulinhaCartao)}</td></tr>
        <tr class="liq"><td colspan="4">LÍQUIDO A PAGAR</td><td class="money">R$ ${brl(bulinhaLiquido)}</td></tr>
      </tbody>
    </table>
  </section>`

const blocoRusa = `
  <section class="pessoa">
    <div class="ph"><h2>Gustavo Rusa <span class="tag">parceiro · 5%</span></h2><div class="pt">R$ ${brl(rusaTotal)}</div></div>
    <table>
      <thead><tr><th style="width:64px">Data</th><th>Leilão / Lotes</th><th style="width:120px;text-align:right">VGV</th><th style="width:50px;text-align:right">%</th><th style="width:100px;text-align:right">Comissão</th></tr></thead>
      <tbody>
        ${RUSA.map((i) => `<tr><td>${dt(i.data)}</td><td>${esc(i.leilao)}<div class="det">${esc(i.det)}</div></td><td class="money">R$ ${brl(i.base)}</td><td class="money">5%</td><td class="money">R$ ${brl(i.valor)}</td></tr>`).join('')}
        <tr class="liq"><td colspan="4">TOTAL</td><td class="money">R$ ${brl(rusaTotal)}</td></tr>
      </tbody>
    </table>
    <div class="nota-bloco">Junho quitado no acerto de 13/07 (R$ 48.895,44). Este saldo é o item ⛔ do acerto: 88.435,00 − 64.945,00 = 23.490,00.</div>
  </section>`

const hoje = new Date().toLocaleDateString('pt-BR')
const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Comissões a Pagar — 27/07/2026</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#111; background:#fff; font-size:11.5px; padding:32px 36px; }
  .head { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #111; padding-bottom:13px; }
  .brand { font-size:21px; font-weight:800; letter-spacing:3px; text-transform:uppercase; }
  .brand small { display:block; font-size:9px; letter-spacing:2px; color:#555; font-weight:400; margin-top:2px; }
  .meta { text-align:right; font-size:10px; color:#444; line-height:1.5; }
  .rule { height:2px; background:#C9A84C; width:64px; margin:6px 0 18px; }
  h1 { font-size:16px; text-transform:uppercase; letter-spacing:2px; margin-bottom:3px; }
  .sub-t { font-size:10.5px; color:#555; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#555; border-bottom:1.5px solid #111; padding:5px 7px; }
  td { padding:5px 7px; border-bottom:1px solid #ddd; vertical-align:top; }
  .money { text-align:right; font-variant-numeric: tabular-nums; white-space:nowrap; }
  .resumo td { font-size:12px; }
  .resumo .tot td { font-weight:800; font-size:13.5px; border-top:2.5px solid #111; border-bottom:none; padding-top:9px; }
  .pessoa { margin-top:20px; page-break-inside:avoid; }
  .ph { display:flex; justify-content:space-between; align-items:baseline; background:#111; color:#fff; padding:6px 10px; }
  .ph h2 { font-size:12px; text-transform:uppercase; letter-spacing:1.5px; }
  .tag { font-size:8.5px; letter-spacing:1px; color:#C9A84C; margin-left:6px; }
  .pt { font-size:13px; font-weight:800; font-variant-numeric: tabular-nums; }
  tr.sub td { font-weight:700; background:#f2f2f2; }
  tr.deb td { color:#444; }
  tr.liq td { font-weight:800; font-size:12.5px; border-top:2px solid #111; background:#fafafa; }
  .det { font-size:9px; color:#666; margin-top:1px; }
  .nota-bloco { font-size:9.5px; color:#555; padding:5px 7px; background:#f7f7f7; border-left:2px solid #C9A84C; margin-top:4px; }
  .notas { margin-top:22px; font-size:10px; color:#444; line-height:1.7; border-top:1px solid #ccc; padding-top:10px; }
  .foot { margin-top:22px; display:flex; justify-content:space-between; font-size:9px; color:#777; border-top:1px solid #ccc; padding-top:8px; }
</style></head><body>
  <div class="head">
    <div class="brand">Bula Assessoria<small>Assessoria Pecuária</small></div>
    <div class="meta">Relatório de comissões a pagar<br>Gerado em ${hoje}</div>
  </div>
  <div class="rule"></div>
  <h1>Comissões a Pagar — 27/07/2026</h1>
  <div class="sub-t">Ciclo do mês (dia 25 cai no sábado → pagamento no próximo dia útil, segunda 27/07).</div>

  <table class="resumo">
    <thead><tr><th>Beneficiário</th><th style="width:150px">Referência</th><th style="width:140px;text-align:right">Valor a Pagar</th></tr></thead>
    <tbody>
      ${linhas.map((l) => `<tr><td>${esc(l.nome)}</td><td style="color:#666">${l.tipo === 'rusa' ? 'Julho/2026' : l.tipo === 'bulinha' ? 'Maio+Junho, líq. cartão' : 'Junho/2026'}</td><td class="money"><strong>R$ ${brl(l.valor)}</strong></td></tr>`).join('')}
      <tr class="tot"><td colspan="2">TOTAL GERAL</td><td class="money">R$ ${brl(totalGeral)}</td></tr>
    </tbody>
  </table>

  ${linhas.map((l) => l.tipo === 'bulinha' ? blocoBulinha : l.tipo === 'rusa' ? blocoRusa : blocoJunho(l)).join('')}

  <div class="notas">
    <strong>Notas</strong><br>
    · <strong>Bulinha</strong>: comissões de maio e junho somam R$ ${brl(bulinhaBruto)}; os gastos do cartão (VISA e Master de 22/05, 22/06 e 22/07, R$ ${brl(bulinhaCartao)}) abatem do valor a receber, resultando em R$ ${brl(bulinhaLiquido)} líquidos.<br>
    · <strong>Gustavo Rusa</strong>: junho foi quitado em 13/07 (R$ 48.895,44); o valor aqui é o saldo de julho dos lotes dos compradores dele.<br>
    · Demais assessores: comissões de junho/2026 em aberto, conforme apurado no Bônus e Comissionamento.
  </div>
  <div class="foot"><span>Bula Assessoria — documento de uso interno</span><span>Comissões · pagamento 27/07/2026</span></div>
</body></html>`

mkdirSync(join(root, 'outputs'), { recursive: true })
const htmlPath = join(root, 'outputs', 'relatorio-comissoes-pagar-2026-07-27.html')
const pdfPath = join(root, 'outputs', 'relatorio-comissoes-pagar-2026-07-27.pdf')
writeFileSync(htmlPath, html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } })
await browser.close()

for (const l of linhas) console.log(`  ${l.nome.padEnd(28)} R$ ${brl(l.valor).padStart(12)}`)
console.log(`  ${'TOTAL GERAL'.padEnd(28)} R$ ${brl(totalGeral).padStart(12)}`)
console.log(`\nPDF: ${pdfPath}`)
