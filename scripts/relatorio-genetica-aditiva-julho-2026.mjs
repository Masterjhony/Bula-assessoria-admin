// Relatorio de vendas da Bula Assessoria no 23o Mega Leilao Genetica Aditiva
// (1a etapa Femeas 25/07/2026 e 2a etapa Touros 26/07/2026) — documento para
// enviar a leiloeira (Claudinei Sandim) junto com a cobranca de julho.
//
// FONTES CRUZADAS (as tres batem 1:1 nos 12 lotes / R$ 292.200):
//   1. HastaPro / Firebird — LOTES+COMPRADORES+VENDEDORES da FIL '2'
//      (Bula Assessoria), leiloes 260726225448441 e 260726225938250.
//   2. ERP web-bula (Supabase) — bula_leilao_fechamento origem='hastapro'
//      (56.700 / 3 lotes e 235.500 / 9 lotes).
//   3. Grupo de WhatsApp "Lances Genetica Aditiva" — bula_leilao_vendas
//      (8 dos 12 lotes; usado para completar fazenda/cidade/UF do comprador).
//   Faturamento total de cada etapa: planilha FINANCEIRO BULA 2026, aba
//   Leiloes, linhas 103 e 104.
//
// Diretiva do chefe p/ relatorio de leiloeira (30/06/2026): "o que for interno
// tira" — sem assessor, comissao, sobra ou imposto. Identidade preto e branco.
//
// Uso: node scripts/relatorio-genetica-aditiva-julho-2026.mjs

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const DESKTOP = 'C:/Users/Notebook-Acer/Desktop'
const OUT_DIR = join(DESKTOP, 'Genetica Aditiva - Julho 2026')
mkdirSync(OUT_DIR, { recursive: true })

const LOGO = `data:image/png;base64,${readFileSync(join(root, 'public', 'logo-bula-assessoria-white.png')).toString('base64')}`
const brl = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const brl0 = (n) => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const pct = (n) => `${(n * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

const PARCELAS = 30 // condicao do leilao: 30x no boleto (catalogo das duas etapas)

const ETAPAS = [
  {
    id: 'femeas',
    titulo: '1ª Etapa — Fêmeas Nelore PO',
    data: '25/07/2026',
    modalidade: 'Leilão Virtual',
    categoria: 'fêmea',
    faturamento: 1805400,
    pctAcordo: 0.0035,
    lotes: [
      { lote: '18', parcela: 670, comprador: 'Nelore Grão Pará — Dr. Celso Lopes', fazenda: 'Fazenda Flor de Minas', local: 'Ourilândia do Norte / PA' },
      { lote: '41', parcela: 600, comprador: 'Nelore Grão Pará — Dr. Celso Lopes', fazenda: 'Fazenda Flor de Minas', local: 'Ourilândia do Norte / PA' },
      { lote: '42', parcela: 620, comprador: 'Nelore Grão Pará — Dr. Celso Lopes', fazenda: 'Fazenda Flor de Minas', local: 'Ourilândia do Norte / PA' },
    ],
  },
  {
    id: 'touros',
    titulo: '2ª Etapa — Touros Nelore PO',
    data: '26/07/2026',
    modalidade: 'Leilão Virtual',
    categoria: 'touro',
    faturamento: 4288750,
    pctAcordo: 0.005,
    lotes: [
      { lote: '11', parcela: 1050, comprador: 'Izanélio José de Rezende Júnior', fazenda: 'Fazenda Rancho Alegre', local: 'Campo Grande / MS' },
      { lote: '15', parcela: 820, comprador: 'Santini Basso', fazenda: '—', local: 'Bandeirantes / MS' },
      { lote: '29', parcela: 1000, comprador: 'Celso Camargo', fazenda: 'Fazenda Boa Esperança', local: 'Cassilândia / MS' },
      { lote: '42', parcela: 1070, comprador: 'Gabriel Peruchi', fazenda: 'Fazenda Bela Vista', local: 'Ecoporanga / ES' },
      { lote: '56', parcela: 870, comprador: 'Thiago Passos', fazenda: 'Fazenda Dois Irmãos', local: 'MS' },
      { lote: '71', parcela: 770, comprador: 'Santini Basso', fazenda: '—', local: 'Bandeirantes / MS' },
      { lote: '81', parcela: 870, comprador: 'Thiago Passos', fazenda: 'Fazenda Dois Irmãos', local: 'MS' },
      { lote: '88', parcela: 700, comprador: 'Jahir Schulter', fazenda: 'Fazenda Canta Galo', local: 'MT' },
      { lote: '92', parcela: 700, comprador: 'Jahir Schulter', fazenda: 'Fazenda Canta Galo', local: 'MT' },
    ],
  },
]

// ─── Derivados ───────────────────────────────────────────────────────────────
for (const e of ETAPAS) {
  e.lotes.forEach((l) => { l.vgv = l.parcela * PARCELAS })
  e.vgv = e.lotes.reduce((s, l) => s + l.vgv, 0)
  e.compradores = new Set(e.lotes.map((l) => l.comprador)).size
  e.estados = new Set(e.lotes.map((l) => l.local.split('/').pop().trim())).size
  e.cobertura = e.vgv / e.faturamento
  e.aFaturar = Math.round(e.faturamento * e.pctAcordo * 100) / 100
}
const TOT_LOTES = ETAPAS.reduce((s, e) => s + e.lotes.length, 0)
const TOT_VGV = ETAPAS.reduce((s, e) => s + e.vgv, 0)
const TOT_FATURAR = ETAPAS.reduce((s, e) => s + e.aFaturar, 0)
const TOT_COMPRADORES = new Set(ETAPAS.flatMap((e) => e.lotes.map((l) => l.comprador))).size
const EMISSAO = '14/08/2026'

// ─── HTML ────────────────────────────────────────────────────────────────────
const tabela = (e) => `
  <table>
    <thead><tr>
      <th style="width:44px">Lote</th><th style="width:64px">Animal</th><th>Comprador</th>
      <th style="width:150px">Fazenda</th><th style="width:132px">Localidade</th>
      <th style="width:80px" class="right">Parcela</th><th style="width:50px" class="right">Prazo</th>
      <th style="width:92px" class="right">Valor total</th>
    </tr></thead>
    <tbody>
      ${e.lotes.map((l) => `<tr>
        <td class="lote">${l.lote}</td><td>1 ${e.categoria}</td><td>${l.comprador}</td>
        <td>${l.fazenda}</td><td>${l.local}</td>
        <td class="right">${brl(l.parcela)}</td><td class="right">${PARCELAS}×</td>
        <td class="right strong">${brl(l.vgv)}</td>
      </tr>`).join('')}
      <tr class="total-geral"><td colspan="7">TOTAL — ${e.lotes.length} LOTES • ${e.lotes.length} ANIMAIS</td><td class="right">${brl(e.vgv)}</td></tr>
    </tbody>
  </table>`

const secaoEtapa = (e) => `
  <div class="secao etapa">
    <h2>${e.titulo} <span class="data">• ${e.data} • ${e.modalidade}</span></h2>
    <div class="resumo">
      <div class="card"><div class="num">${e.lotes.length}</div><div class="desc">Lotes vendidos</div></div>
      <div class="card"><div class="num">${e.compradores}</div><div class="desc">${e.compradores === 1 ? 'Comprador' : 'Compradores'}</div></div>
      <div class="card"><div class="num">${e.estados}</div><div class="desc">${e.estados === 1 ? 'Estado' : 'Estados'}</div></div>
      <div class="card destaque"><div class="num">${brl0(e.vgv)}</div><div class="desc">Vendido pela Bula</div></div>
    </div>
    ${tabela(e)}
  </div>`

const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório de Vendas — Genética Aditiva • Julho 2026</title>
<style>
  :root{--preto:#111;--preto-puro:#000;--grafite:#2b2b2b;--cinza:#6b6b6b;--cinza-claro:#f4f3f1;--linha:#dcdad4;}
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;color:#1a1a1a;background:#fff;font-size:11px;}
  .header{background:var(--preto-puro);color:#fff;padding:30px 44px 26px;display:flex;justify-content:space-between;align-items:center;}
  .header .titulo h1{font-size:21px;font-weight:700;letter-spacing:.3px;margin-bottom:5px;}
  .header .titulo .sub{font-size:11px;color:#c9c9c9;letter-spacing:1.6px;text-transform:uppercase;}
  .header .logo-box img{height:46px;display:block;}
  .faixa{background:var(--cinza);height:4px;}
  .cliente{display:flex;justify-content:space-between;padding:18px 44px;background:var(--cinza-claro);border-bottom:1px solid var(--linha);}
  .cliente .campo .label{font-size:8.5px;text-transform:uppercase;letter-spacing:1.2px;color:var(--cinza);margin-bottom:3px;}
  .cliente .campo .valor{font-size:12.5px;font-weight:600;color:var(--preto);}
  .resumo{display:flex;gap:14px;margin-bottom:14px;}
  .card{flex:1;border:1px solid var(--linha);border-top:3px solid var(--cinza);border-radius:8px;padding:11px 12px 9px;text-align:center;background:#fff;}
  .card.destaque{border-top-color:var(--preto-puro);background:var(--cinza-claro);}
  .card .num{font-size:19px;font-weight:700;color:var(--preto);margin-bottom:2px;}
  .card.destaque .num{color:var(--preto-puro);}
  .card .desc{font-size:8.5px;text-transform:uppercase;letter-spacing:1px;color:var(--cinza);}
  .secao{padding:20px 44px 0;}
  .secao.etapa{page-break-inside:avoid;}
  .secao h2{font-size:13px;color:var(--preto);text-transform:uppercase;letter-spacing:1.4px;border-bottom:2px solid var(--preto);padding-bottom:6px;margin-bottom:14px;}
  .secao h2 .data{font-weight:400;letter-spacing:.6px;color:var(--cinza);text-transform:none;font-size:11px;}
  table{width:100%;border-collapse:collapse;}
  thead th{background:var(--preto);color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.8px;padding:8px 9px;text-align:left;}
  thead th.right,td.right{text-align:right;}
  tbody td{padding:7px 9px;border-bottom:1px solid var(--linha);font-size:10.5px;vertical-align:top;}
  td.lote{font-weight:700;color:var(--preto);}
  td.strong{font-weight:700;color:var(--preto);}
  tr.total-geral td{background:var(--preto-puro);color:#fff;font-weight:700;font-size:12px;padding:11px 9px;}
  tr.total-geral td.right{white-space:nowrap;}
  tr{page-break-inside:avoid;}
  .cobranca{margin:24px 44px 0;border:1px solid var(--linha);border-radius:10px;overflow:hidden;page-break-inside:avoid;}
  .cobranca .topo{background:var(--grafite);color:#fff;padding:10px 16px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;}
  .cobranca table{font-size:10.5px;}
  .cobranca thead th{background:var(--cinza-claro);color:var(--preto);border-bottom:1px solid var(--linha);white-space:nowrap;}
  .cobranca tbody td{padding:8px 12px;}
  .cobranca td.right{white-space:nowrap;}
  .cobranca tr.fim td{background:var(--preto-puro);color:#fff;font-weight:700;font-size:12.5px;padding:12px;}
  .nota{margin:16px 44px 0;background:var(--cinza-claro);border-left:4px solid var(--preto);border-radius:0 6px 6px 0;padding:11px 14px;font-size:9.5px;color:var(--cinza);line-height:1.6;}
  .nota b{color:var(--preto);}
  .footer{margin-top:26px;background:var(--preto-puro);color:#c9c9c9;padding:14px 44px;display:flex;justify-content:space-between;align-items:center;font-size:9px;letter-spacing:.6px;}
  .footer strong{color:#fff;}
</style></head><body>
  <div class="header">
    <div class="titulo"><h1>Relatório de Vendas — Bula Assessoria</h1><div class="sub">23º Mega Leilão Genética Aditiva • Julho de 2026</div></div>
    <div class="logo-box"><img src="${LOGO}" alt="Bula Assessoria"></div>
  </div>
  <div class="faixa"></div>

  <div class="cliente">
    <div class="campo"><div class="label">Leiloeira</div><div class="valor">Genética Aditiva</div></div>
    <div class="campo"><div class="label">Evento</div><div class="valor">23º Mega Leilão Genética Aditiva</div></div>
    <div class="campo"><div class="label">Etapas</div><div class="valor">25 e 26/07/2026 • Virtual</div></div>
    <div class="campo"><div class="label">Emissão</div><div class="valor">${EMISSAO}</div></div>
  </div>

  <div class="secao">
    <h2>Resumo consolidado</h2>
    <div class="resumo">
      <div class="card"><div class="num">${TOT_LOTES}</div><div class="desc">Lotes vendidos</div></div>
      <div class="card"><div class="num">${TOT_COMPRADORES}</div><div class="desc">Compradores</div></div>
      <div class="card"><div class="num">2</div><div class="desc">Etapas assessoradas</div></div>
      <div class="card destaque"><div class="num">${brl0(TOT_VGV)}</div><div class="desc">Total vendido pela Bula</div></div>
    </div>
  </div>

  ${ETAPAS.map(secaoEtapa).join('')}

  <div class="cobranca">
    <div class="topo">Valor a faturar — Assessoria Bula</div>
    <table>
      <thead><tr>
        <th>Etapa</th><th class="right">Faturamento do leilão</th><th class="right">Vendido pela Bula</th>
        <th class="right">Acordo</th><th class="right">Valor a faturar</th>
      </tr></thead>
      <tbody>
        ${ETAPAS.map((e) => `<tr>
          <td>${e.titulo} — ${e.data}</td>
          <td class="right">${brl(e.faturamento)}</td>
          <td class="right">${brl(e.vgv)}</td>
          <td class="right">${pct(e.pctAcordo)} do faturamento</td>
          <td class="right strong">${brl(e.aFaturar)}</td>
        </tr>`).join('')}
        <tr class="fim"><td colspan="4">TOTAL A FATURAR — 23º MEGA GENÉTICA ADITIVA</td><td class="right">${brl(TOT_FATURAR)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="nota">
    Relação dos lotes arrematados por compradores conduzidos pela equipe da <b>Bula Assessoria</b> nas duas etapas do
    23º Mega Leilão Genética Aditiva. Valores em reais (BRL); o valor total de cada lote corresponde à parcela
    multiplicada pelo prazo do leilão (<b>${PARCELAS}×</b>). O valor a faturar segue o acordo comercial vigente entre a
    <b>Genética Aditiva</b> e a <b>Bula Assessoria</b>, aplicado sobre o faturamento total de cada etapa.
    Dados conferidos contra o sistema de leilões e o registro de vendas da Bula.
  </div>

  <div class="footer">
    <div><strong>Bula Assessoria Pecuária</strong></div>
    <div>Documento emitido em ${EMISSAO}</div>
  </div>
</body></html>`

// ─── PDF ─────────────────────────────────────────────────────────────────────
// HTML fica no repo (outputs/), nao na pasta que o Joao encaminha pra leiloeira.
mkdirSync(join(root, 'outputs'), { recursive: true })
const htmlPath = join(root, 'outputs', 'relatorio-genetica-aditiva-julho-2026.html')
writeFileSync(htmlPath, html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
const pdfPath = join(OUT_DIR, 'Relatorio-Vendas-Bula-Genetica-Aditiva-Julho-2026.pdf')
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } })
if (process.env.PREVIEW) {
  await page.setViewportSize({ width: 794, height: 1123 })
  await page.screenshot({ path: join(process.env.PREVIEW, 'ga-preview.png'), fullPage: true })
}
await page.close()
await browser.close()
console.log('PDF  ->', pdfPath)

// ─── XLSX ────────────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new()

const detalhe = [['Etapa', 'Data', 'Lote', 'Animal', 'Comprador', 'Fazenda', 'Localidade', 'Parcela (R$)', 'Prazo', 'Valor total (R$)']]
for (const e of ETAPAS) {
  for (const l of e.lotes) {
    detalhe.push([e.titulo, e.data, l.lote, `1 ${e.categoria}`, l.comprador, l.fazenda, l.local, l.parcela, `${PARCELAS}x`, l.vgv])
  }
}
detalhe.push([])
detalhe.push(['TOTAL', '', `${TOT_LOTES} lotes`, '', '', '', '', '', '', TOT_VGV])
const wsD = XLSX.utils.aoa_to_sheet(detalhe)
wsD['!cols'] = [{ wch: 30 }, { wch: 11 }, { wch: 7 }, { wch: 10 }, { wch: 34 }, { wch: 24 }, { wch: 24 }, { wch: 13 }, { wch: 7 }, { wch: 15 }]
XLSX.utils.book_append_sheet(wb, wsD, 'Lotes vendidos')

const resumo = [['Etapa', 'Data', 'Lotes', 'Compradores', 'Vendido pela Bula (R$)', 'Faturamento do leilão (R$)', 'Cobertura Bula', 'Acordo', 'A faturar (R$)']]
for (const e of ETAPAS) {
  resumo.push([e.titulo, e.data, e.lotes.length, e.compradores, e.vgv, e.faturamento, pct(e.cobertura), `${pct(e.pctAcordo)} do faturamento`, e.aFaturar])
}
resumo.push(['TOTAL', '', TOT_LOTES, TOT_COMPRADORES, TOT_VGV, ETAPAS.reduce((s, e) => s + e.faturamento, 0), '', '', TOT_FATURAR])
const wsR = XLSX.utils.aoa_to_sheet(resumo)
wsR['!cols'] = [{ wch: 30 }, { wch: 11 }, { wch: 7 }, { wch: 13 }, { wch: 22 }, { wch: 24 }, { wch: 14 }, { wch: 24 }, { wch: 15 }]
XLSX.utils.book_append_sheet(wb, wsR, 'Resumo e cobranca')

const xlsxPath = join(OUT_DIR, 'Relatorio-Vendas-Bula-Genetica-Aditiva-Julho-2026.xlsx')
XLSX.writeFile(wb, xlsxPath)
console.log('XLSX ->', xlsxPath)
console.log(`\n${TOT_LOTES} lotes • vendido ${brl(TOT_VGV)} • a faturar ${brl(TOT_FATURAR)}`)
