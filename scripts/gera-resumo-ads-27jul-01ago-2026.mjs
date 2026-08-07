// Resumo de uma página do leilão São Geraldo — 27/07 a 01/08/2026. Versão para apresentar.
//
// Cruza duas fontes, cada uma na janela exata 27/07 → 01/08:
// - Mídia: export de campanhas do Gerenciador (conta CA2), via lib/midia-27jul-01ago-2026.mjs.
// - Leads e conversão: planilha, aba TOUROS, via apura-leads-27jul-01ago-2026.mjs.
// As duas cobrem o mesmo período, então CPL/CPMQL/custo por habilitado comparam igual com igual.
//
// Uso: node scripts/gera-resumo-ads-27jul-01ago-2026.mjs

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { chromium } from 'playwright'
import { carregaMidia } from './lib/midia-27jul-01ago-2026.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = join(root, 'outputs')
const desktop = join(homedir(), 'Desktop')
const stem = 'resumo-ads-27jul-01ago-2026'
const desktopStem = 'Leilao Sao Geraldo - Resumo - 27-07 a 01-08'

mkdirSync(outputDir, { recursive: true })
const D = JSON.parse(readFileSync(join(outputDir, 'apuracao-leads-27jul-01ago-2026.json'), 'utf8'))
const M = carregaMidia()

const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const int = (v) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pct = (v, d = 0) => `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })}%`
const taxa = (a, b) => pct((a / b) * 100)
const por = (gasto, n) => (n ? brl(gasto / n) : '—')

const C = { black: '#171717', gold: '#C5A34C', gray: '#666666', line: '#e2e2e2', white: '#fff' }

// Uma linha da tabela = uma campanha cruzada com os leads que ela gerou.
const blocos = [
  { nome: 'São Geraldo (leilão)', midia: M.saoGeraldo, leads: D.saoGeraldo, destaque: true },
  { nome: 'Perpétuo Touro', midia: M.perpetuo, leads: D.perpetuo, destaque: false },
]
const totalGasto = M.total.gasto
const T = D.totais

const kpi = (rotulo, valor, nota, ouro) => `
  <div class="kpi${ouro ? ' ouro' : ''}">
    <div class="r">${rotulo}</div>
    <div class="v">${valor}</div>
    <div class="n">${nota}</div>
  </div>`

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Leilão São Geraldo — resumo — 27/07 a 01/08/2026</title>
<style>
  @page { size: A4; margin: 11mm 11mm 9mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: ${C.black}; font-size: 10pt; line-height: 1.45; }
  .capa { background: ${C.black}; color: ${C.white}; padding: 16px 18px 14px; }
  .capa h1 { margin: 0; font-size: 17pt; text-transform: uppercase; letter-spacing: 0.05em; }
  .capa .s { color: #c9c9c9; font-size: 9.2pt; margin-top: 5px; }
  .regua { height: 4px; background: ${C.gold}; margin-bottom: 16px; }
  h2 { font-size: 9.4pt; text-transform: uppercase; letter-spacing: 0.1em; color: ${C.gray};
       margin: 17px 0 8px; padding-bottom: 4px; border-bottom: 1px solid ${C.line}; }
  .kpis { display: flex; gap: 8px; margin-bottom: 8px; }
  .kpi { flex: 1; border: 1px solid ${C.line}; border-top: 3px solid ${C.black}; padding: 9px 10px 10px; }
  .kpi.ouro { border-top-color: ${C.gold}; background: #fdfbf5; }
  .kpi .r { font-size: 7.4pt; text-transform: uppercase; letter-spacing: 0.09em; color: ${C.gray}; }
  .kpi .v { font-size: 19pt; font-weight: 700; line-height: 1.05; margin-top: 4px; }
  .kpi .n { font-size: 8pt; color: ${C.gray}; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 9.4pt; }
  thead th { background: ${C.black}; color: ${C.white}; font-size: 7.5pt; text-transform: uppercase;
             letter-spacing: 0.06em; padding: 7px 7px; text-align: right; }
  thead th:first-child { text-align: left; }
  tbody td { padding: 7px 7px; text-align: right; border-bottom: 1px solid ${C.line}; }
  tbody td:first-child { text-align: left; }
  tbody tr.destaque { background: #fdfbf5; font-weight: 700; }
  tbody tr.destaque td:first-child { box-shadow: inset 3px 0 0 ${C.gold}; }
  tbody tr.total td { font-weight: 700; border-top: 2px solid ${C.black}; border-bottom: none; }
  ul { margin: 8px 0 0; padding-left: 17px; }
  li { margin-bottom: 6px; }
  .rodape { margin-top: 14px; padding-top: 7px; border-top: 1px solid ${C.line}; font-size: 7.6pt; color: ${C.gray}; }
</style>
</head>
<body>

<div class="capa">
  <h1>Leilão São Geraldo · resultado de mídia</h1>
  <div class="s">27/07 a 01/08/2026 · pregão em 01/08, 12h · Bula Assessoria</div>
</div>
<div class="regua"></div>

<h2>Os números da semana</h2>
<div class="kpis">
  ${kpi('Investido', brl(totalGasto), 'as duas campanhas')}
  ${kpi('Impressões', int(M.total.impressoes), `CPM ${brl(M.total.cpm)}`)}
  ${kpi('Leads', int(T.leads), `${T.mql} qualificados`)}
</div>
<div class="kpis">
  ${kpi('Custo por lead', por(totalGasto, T.leads), `${T.leads} leads`, true)}
  ${kpi('Custo por MQL', por(totalGasto, T.mql), `${T.mql} qualificados`, true)}
  ${kpi('Habilitados', String(T.cadastroOk), `cadastro OK · ${por(totalGasto, T.cadastroOk)} cada`, true)}
</div>

<h2>Onde o dinheiro rendeu</h2>
<table>
  <thead>
    <tr><th>Campanha</th><th>Investido</th><th>Impressões</th><th>Leads</th><th>Custo/lead</th>
      <th>MQL</th><th>Custo/MQL</th><th>Habilit.</th><th>Custo/habilit.</th></tr>
  </thead>
  <tbody>
    ${blocos.map((b) => `<tr${b.destaque ? ' class="destaque"' : ''}>
      <td>${b.nome}</td><td>${brl(b.midia.gasto)}</td><td>${int(b.midia.impressoes)}</td>
      <td>${b.leads.leads}</td><td>${por(b.midia.gasto, b.leads.leads)}</td>
      <td>${b.leads.mql}</td><td>${por(b.midia.gasto, b.leads.mql)}</td>
      <td>${b.leads.cadastroOk}</td><td>${por(b.midia.gasto, b.leads.cadastroOk)}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td>${brl(totalGasto)}</td><td>${int(M.total.impressoes)}</td>
      <td>${T.leads}</td><td>${por(totalGasto, T.leads)}</td><td>${T.mql}</td>
      <td>${por(totalGasto, T.mql)}</td><td>${T.cadastroOk}</td><td>${por(totalGasto, T.cadastroOk)}</td></tr>
  </tbody>
</table>

<h2>O que isso quer dizer</h2>
<ul>
  <li><strong>O perpétuo dá lead barato e comprador caro.</strong> O lead dele sai por
  ${por(M.perpetuo.gasto, D.perpetuo.leads)} contra ${por(M.saoGeraldo.gasto, D.saoGeraldo.leads)} do leilão —
  mas o qualificado custa <strong>${por(M.perpetuo.gasto, D.perpetuo.mql)} contra
  ${por(M.saoGeraldo.gasto, D.saoGeraldo.mql)}</strong>, e o habilitado
  <strong>${por(M.perpetuo.gasto, D.perpetuo.cadastroOk)} contra
  ${por(M.saoGeraldo.gasto, D.saoGeraldo.cadastroOk)}</strong>. Na ponta que vende, o leilão é
  <strong>${(( M.perpetuo.gasto / D.perpetuo.cadastroOk) / (M.saoGeraldo.gasto / D.saoGeraldo.cadastroOk)).toFixed(1).replace('.', ',')}x mais eficiente</strong>.</li>
  <li><strong>A campanha do leilão ficou no ar 3 dos 6 dias</strong> — subiu em 29/07 para um pregão em 01/08 —
  e ainda assim entregou ${taxa(D.saoGeraldo.mql, D.saoGeraldo.leads)} de leads qualificados contra
  ${taxa(D.perpetuo.mql, D.perpetuo.leads)} do perpétuo. Com 6 a 8 dias de janela, o mesmo custo por lead
  compraria o dobro de habilitados.</li>
  <li><strong>${D.porEtapa.find((e) => e.chave === 'NÃO RESPONDEU').mql + D.porEtapa.find((e) => e.chave === 'QUALIFICAÇÃO').mql} dos ${T.mql} qualificados nunca fecharam contato</strong> — ficaram em
  "não respondeu" ou parados na qualificação. São
  <strong>${brl((D.porEtapa.find((e) => e.chave === 'NÃO RESPONDEU').mql + D.porEtapa.find((e) => e.chave === 'QUALIFICAÇÃO').mql) * (totalGasto / T.mql))} de mídia já paga</strong>
  esperando telefone, e 49% dos leads chegam entre 17h e 22h.</li>
</ul>

<div class="rodape">
  <strong>Mídia:</strong> export de campanhas do Gerenciador de Anúncios, conta CA2, período
  ${M.janela.de.split('-').reverse().join('/')} a ${M.janela.ate.split('-').reverse().join('/')} — o gasto cobre
  a janela inteira. O export não traz cliques, então não há CTR aqui; a eficiência de mídia está no CPM.
  <strong>Leads e conversão:</strong> planilha de leads, aba TOUROS, ${T.leads} registros no mesmo período.
  MQL = rebanho ≥ 100 cabeças e inscrição estadual. Habilitado = etapa CADASTRO OK.
  Observação: o Meta não registrou nenhum resultado para a campanha do leilão no próprio painel — a contagem
  de leads deste relatório vem da planilha, não do pixel.
</div>

</body>
</html>`

const htmlPath = join(outputDir, `${stem}.html`)
const pdfPath = join(outputDir, `${stem}.pdf`)
writeFileSync(htmlPath, html, 'utf8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'load' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '11mm', right: '11mm', bottom: '9mm', left: '11mm' } })
await browser.close()

copyFileSync(pdfPath, join(desktop, `${desktopStem}.pdf`))
console.log('PDF:', join(desktop, `${desktopStem}.pdf`))
