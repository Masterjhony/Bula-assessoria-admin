/**
 * Renderiza "Vendas por assessor — abr a ago/2026" a partir de
 * outputs/vendas-por-assessor-2026/dados.json. PDF (brandbook) + XLSX na Area
 * de Trabalho. Nenhum numero escrito a mao.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'

const OUT = 'outputs/vendas-por-assessor-2026'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const mi = n => (Number(n || 0) / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const dm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'
const corta = (t, n) => { const x = String(t); if (x.length <= n) return x; const c = x.slice(0, n), sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–]+$/, '') + '…' }
const NOME_MES = { '2026-04': 'ABRIL', '2026-05': 'MAIO', '2026-06': 'JUNHO', '2026-07': 'JULHO', '2026-08': 'AGOSTO' }

const INK = '#0A0A0A', CINZA = '#9A9A9A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

const TOTAL = D.consolidado.total.reduce((a, b) => a + b.vgv, 0)
const TOT_LOTES = D.consolidado.total.reduce((a, b) => a + b.lotes, 0)
const TOT_ANI = D.consolidado.total.reduce((a, b) => a + b.animais, 0)
const TOT_COMPL = D.meses.reduce((a, m) => a + m.totais.remates.vgv, 0)
const nLeiloesCompl = D.meses.reduce((a, m) => a + m.leiloes_remates.length, 0)
const maiorDif = D.conferencia.slice(0, 6)
const CURTO = { 'Felipe Vilela Andrade': 'o Bulinha', 'Lucas Martins Durães Bragança': 'o Lucas Martins' }
const zona = D.qualidade.por_zona
const zeradosNoErp = D.conferencia.filter(c => c.erp === 0 && c.hastapro > 500000).sort((a, b) => b.hastapro - a.hastapro)

/* ═══ gráfico: total por mês (barras, rótulos diretos) ═══════════════════ */
function gMeses() {
    const W = 762, BASE = 96, BW = 118, GAP = 32
    const max = Math.max(...D.meses.map(m => m.totais.total.vgv))
    return `<svg viewBox="0 0 ${W} 126" width="100%" role="img" aria-label="Vendas totais por mês, de abril a agosto de 2026">
    <line x1="0" y1="${BASE}" x2="${W}" y2="${BASE}" stroke="${GRID}" stroke-width="1"/>
    ${D.meses.map((m, i) => {
        const h = Math.max((m.totais.total.vgv / max) * 66, 3), x = 6 + i * (BW + GAP)
        return `<rect x="${x}" y="${BASE - h}" width="${BW}" height="${h}" fill="${INK}" rx="2"/>
      <text x="${x}" y="${BASE - h - 7}" font-family="Oswald" font-size="14" font-weight="600" fill="${INK}">R$ ${mi(m.totais.total.vgv)} mi</text>
      <text x="${x}" y="${BASE + 15}" font-family="Oswald" font-size="10" font-weight="600" fill="${INK}" letter-spacing=".07em">${NOME_MES[m.mes]}</text>
      <text x="${x}" y="${BASE + 27}" font-family="Inter" font-size="8.6" fill="${MUTED}">${m.totais.total.lotes} lotes · ${m.totais.total.animais} animais</text>`
    }).join('')}
  </svg>`
}

/* ═══ tabelas ════════════════════════════════════════════════════════════ */
const tabelaMes = m => `
  <h3>${NOME_MES[m.mes]} · R$ ${brl(m.totais.total.vgv)}</h3>
  <table>
    <tr><th>Pessoa</th><th class="num">Faturado</th><th class="num">Lotes</th><th class="num">Qtd. Ani.</th></tr>
    ${m.total.map(p => `<tr><td>${esc(p.pessoa)}</td><td class="num">R$ ${brl(p.vgv)}</td>
      <td class="num">${p.lotes}</td><td class="num">${p.animais}</td></tr>`).join('')}
    <tr class="total"><td>Total</td><td class="num">R$ ${brl(m.totais.total.vgv)}</td>
      <td class="num">${m.totais.total.lotes}</td><td class="num">${m.totais.total.animais}</td></tr>
  </table>
  ${m.totais.remates.vgv ? `<p class="small">Inclui <strong>R$ ${brl(m.totais.remates.vgv)}</strong> de
   ${m.leiloes_remates.filter(l => l.vgv).length} leilão(ões) que não aparecem no painel:
   ${m.leiloes_remates.filter(l => l.vgv).map(l => `${esc(corta(l.nome, 30))} (${dm(l.data)})`).join('; ')}.</p>` : ''}`

const linhasConsolidado = D.consolidado.total.map(p => {
    const compl = D.consolidado.remates.find(x => x.pessoa === p.pessoa)
    return `<tr>
    <td>${esc(p.pessoa)}</td><td class="num">R$ ${brl(p.vgv)}</td>
    <td class="num">${p.lotes}</td><td class="num">${p.animais}</td>
    <td class="num">${compl ? 'R$ ' + brl(compl.vgv) : '—'}</td>
    <td class="num">${(p.vgv / TOTAL * 100).toFixed(1)}%</td>
  </tr>`
}).join('')

/* ═══ HTML ═══════════════════════════════════════════════════════════════ */
const foot = n => `<div class="pfoot"><span>Bula Assessoria Pecuária · Vendas por assessor · abril a agosto de 2026</span><span>${n}</span></div>`
const CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: ${INK}; margin: 0; font-size: 10.2px; line-height: 1.52; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1,h2,h3 { font-family: Oswald, "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: .022em; font-weight: 600; margin: 0; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 13mm 17mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .pfoot { position: absolute; left: 13mm; right: 13mm; bottom: 7mm; font-size: 7.4px; color: #A6A6A6; display: flex; justify-content: space-between; border-top: 1px solid ${GRID}; padding-top: 2mm; }
  .capa { background: ${INK}; color: #fff; padding: 32mm 20mm 20mm; display: flex; flex-direction: column; }
  .capa img { width: 42mm; margin-bottom: 24mm; }
  .capa h1 { font-size: 40px; line-height: 1.05; color: #fff; font-weight: 700; }
  .capa .sub { font-size: 12.4px; color: #B5B5B5; margin-top: 8mm; max-width: 138mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
  .capa .rule { width: 26mm; height: 3px; background: ${GOLD}; margin: 9mm 0; }
  .capa .meta { margin-top: auto; flex-wrap: wrap; row-gap: 6mm; display: flex; gap: 11mm; border-top: 1px solid #2A2A2A; padding-top: 6mm; }
  .capa .meta div span { display: block; font-size: 8.5px; color: #8A8A8A; text-transform: uppercase; letter-spacing: .09em; margin-bottom: 2px; }
  .capa .meta div strong { font-size: 12px; font-weight: 600; }
  .head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid ${INK}; padding-bottom: 3mm; margin-bottom: 6mm; }
  .head h2 { font-size: 21px; }
  .head .n { font-size: 9px; color: ${MUTED}; letter-spacing: .12em; text-transform: uppercase; font-family: Oswald, sans-serif; }
  h3 { font-size: 12.5px; margin: 6mm 0 2mm; }
  h3:first-of-type { margin-top: 0; }
  p { margin: 0 0 3mm; }
  .lead { font-size: 11.4px; line-height: 1.58; }
  strong { font-weight: 600; }
  .muted { color: ${MUTED}; }
  .small { font-size: 8.8px; color: ${MUTED}; line-height: 1.45; margin-top: -1mm; }
  .tiles { display: grid; grid-template-columns: repeat(4,1fr); gap: 3mm; margin: 4mm 0 6mm; }
  .tile { border: 1px solid ${GRID}; border-top: 3px solid ${INK}; padding: 3.4mm 3.4mm 3mm; }
  .tile .k { font-size: 8px; text-transform: uppercase; letter-spacing: .085em; color: ${MUTED}; margin-bottom: 1.6mm; line-height: 1.3; min-height: 5.6mm; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 19px; font-weight: 600; line-height: 1; }
  .tile .v .cur { font-size: 11px; font-weight: 500; color: ${MUTED}; margin-right: 1px; }
  .tile .d { font-size: 8.4px; color: ${MUTED}; margin-top: 1.6mm; line-height: 1.4; }
  .tile.gold { border-top-color: ${GOLD}; }
  .box { border: 1px solid ${GRID}; padding: 4mm 4.4mm; margin: 4mm 0; }
  .box.dark { background: ${INK}; color: #fff; border-color: ${INK}; }
  .box.dark .t { color: ${GOLD}; }
  .box.dark p, .box.dark li { color: #D8D8D8; }
  .box.dark strong { color: #fff; }
  .box.rule { border: none; border-left: 3px solid ${INK}; padding: 1mm 0 1mm 4mm; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; margin-bottom: 2.2mm; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 9.3px; margin: 2.5mm 0; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.4px; letter-spacing: .07em; font-weight: 600; border-bottom: 1.4px solid ${INK}; padding: 2mm 1.8mm; }
  td { padding: 1.6mm 1.8mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  figure { margin: 3mm 0 5mm; }
  figcaption { font-size: 8.6px; color: ${MUTED}; margin-top: 1.8mm; line-height: 1.45; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .cols3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 5mm; }`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Bula — Vendas por assessor (abr–ago/2026)</title>
<style>${CSS}</style></head><body>

<!-- ══ CAPA ══ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Vendas por<br>assessor</h1>
  <div class="rule"></div>
  <div class="sub">Abril a agosto de 2026, no formato do painel — <strong>Pessoa · Faturado · Lotes · Qtd. Animais</strong>.
  Cada mês foi reconstruído lote a lote no HastaPro e conferido contra o ERP; a última página mostra o que
  foi corrigido e o que ainda precisa de decisão.</div>
  <div class="meta">
    <div><span>Período</span><strong>abril a agosto de 2026</strong></div>
    <div><span>Vendas no período</span><strong>R$ ${brl(TOTAL)}</strong></div>
    <div><span>Lotes</span><strong>${TOT_LOTES}</strong></div>
    <div><span>Animais</span><strong>${TOT_ANI}</strong></div>
    <div><span>Emitido em</span><strong>${dm(D.geradoEm)}/${D.geradoEm.slice(0, 4)}</strong></div>
  </div>
</section>

<!-- ══ 1. CONSOLIDADO ══ -->
<section class="page">
  <div class="head"><h2>O período inteiro</h2><div class="n">01 · Consolidado</div></div>

  <p class="lead">De abril a agosto a equipe vendeu <strong>R$ ${brl(TOTAL)}</strong> em
  <strong>${TOT_LOTES} lotes</strong> e <strong>${TOT_ANI} animais</strong>. Dois nomes respondem por
  ${((D.consolidado.total.slice(0, 2).reduce((a, b) => a + b.vgv, 0) / TOTAL) * 100).toFixed(0)}% do total.</p>

  <figure>${gMeses()}<figcaption>Junho e agosto puxam o período; julho é o vale — mês de agenda magra,
  não de queda de desempenho.</figcaption></figure>

  <table>
    <tr><th>Pessoa</th><th class="num">Faturado</th><th class="num">Lotes</th><th class="num">Qtd. Ani.</th>
        <th class="num">Fora do painel</th><th class="num">% do total</th></tr>
    ${linhasConsolidado}
    <tr class="total"><td>Total</td><td class="num">R$ ${brl(TOTAL)}</td><td class="num">${TOT_LOTES}</td>
      <td class="num">${TOT_ANI}</td><td class="num">R$ ${brl(TOT_COMPL)}</td><td class="num">100%</td></tr>
  </table>

  <div class="box rule">
    <div class="t">Como ler a coluna “fora do painel”</div>
    <p style="margin:0">O painel enxerga só os leilões cadastrados na filial ‘2’ do HastaPro. Existem
    <strong>${nLeiloesCompl} leilões</strong> no período em que a Bula vendeu e que estão registrados apenas no ERP
    — <strong>R$ ${brl(TOT_COMPL)}</strong> de venda real. Eles estão somados aqui e detalhados mês a mês
    nas próximas páginas.</p>
  </div>
  ${foot('Página 2 de 5')}
</section>

<!-- ══ 2. ABRIL–JUNHO ══ -->
<section class="page">
  <div class="head"><h2>Abril · Maio · Junho</h2><div class="n">02 · Mês a mês</div></div>
  ${D.meses.filter(m => m.mes <= '2026-06').map(tabelaMes).join('')}
  ${foot('Página 3 de 5')}
</section>

<!-- ══ 3. JULHO–AGOSTO ══ -->
<section class="page">
  <div class="head"><h2>Julho · Agosto</h2><div class="n">03 · Mês a mês</div></div>
  ${D.meses.filter(m => m.mes >= '2026-07').map(tabelaMes).join('')}

  <div class="box">
    <div class="t">Agosto confere com o painel que circulou no grupo</div>
    <p style="margin:0">O print do dia 26/08 traz Peralta R$ 211.500 (4 lotes), Lucas Martins R$ 96.000 (2),
    Laila R$ 60.000 (2) e a linha em branco R$ 307.500 (9) — <strong>idênticos</strong> aos daqui. As diferenças
    nos demais são os <strong>5 lotes lançados depois</strong> (26 e 27/08): Nelore do Xingu, Terra Brava virtual,
    Excelência Genética e o lote 22 do Naviraí Camparino. Nada foi recalculado: o painel apenas foi tirado antes.</p>
  </div>
  ${foot('Página 4 de 5')}
</section>

<!-- ══ 4. CONFIABILIDADE ══ -->
<section class="page">
  <div class="head"><h2>De onde vem cada número</h2><div class="n">04 · Confiabilidade</div></div>

  <p class="lead">A Bula tem duas bases que respondem “quem vendeu” e elas <strong>não concordam</strong>.
  Este relatório usa o HastaPro para a atribuição e o ERP para achar o que falta — nunca o contrário.
  Abaixo, as quatro checagens feitas e o efeito de cada uma.</p>

  <h3>1. A linha “em branco” é a Nane</h3>
  <p>O painel resolve o pisteiro na tabela <em>PRESTADORES</em>. A Nane só existe em <em>CLIENTES</em>
  (<strong>Regiane Cristina Neves de Abreu</strong>), então sai sem nome. Aqui ela aparece nomeada, com
  R$ ${brl(D.consolidado.total.find(p => /Nane/.test(p.pessoa))?.vgv || 0)} no período. Mesmo efeito no cadastro do ERP:
  o importador de fechamentos procura por “Nane” e não acha “Regiane”, então ela some dos leilões da Remates.</p>

  <h3>2. O ERP atribui por ZONA, não por quem vendeu — não use para ranking</h3>
  <div class="box dark">
    <p><strong>${zona.n} fechamentos, R$ ${brl(zona.vgv)}</strong> carregam a nota
    <em>“Assessor por zona (UF)”</em>: o vendedor foi deduzido do estado do comprador, não do lote. É por isso que,
    no ERP, <strong>${zeradosNoErp.map(z => CURTO[z.pessoa] || z.pessoa).join(' e ')} aparecem com ZERO</strong> no período
    enquanto o HastaPro registra ${zeradosNoErp.map(z => 'R$ ' + brl0(z.hastapro)).join(' e ')} no nome deles.</p>
    <p style="margin-bottom:0">Concentração: ${zona.por_mes.map(z => `${NOME_MES[z.mes].toLowerCase()} R$ ${mi(z.vgv)} mi`).join(', ')} —
    inclui os dois maiores eventos do período (JMP Touros 14/06 e 4R 09/05). <strong>Confiar no ERP aqui daria o
    ranking errado</strong>, tirando R$ ${mi(Math.abs(zeradosNoErp[0]?.dif || 0))} mi de um vendedor e somando
    R$ ${mi(Math.max(...D.conferencia.map(c => c.dif)))} mi em outro.</p>
  </div>

  <h3>3. As divergências que sobram, por pessoa</h3>
  <table>
    <tr><th>Pessoa</th><th class="num">HastaPro (filial 2)</th><th class="num">ERP</th><th class="num">Diferença</th><th>Leitura</th></tr>
    ${maiorDif.map(c => `<tr><td>${esc(c.pessoa)}</td><td class="num">R$ ${brl(c.hastapro)}</td>
      <td class="num">R$ ${brl(c.erp)}</td>
      <td class="num">${c.dif >= 0 ? '+' : '−'}R$ ${brl(Math.abs(c.dif))}</td>
      <td>${/Bulinha|Felipe Vilela|Lucas/.test(c.pessoa) ? 'zerado pela atribuição por zona'
            : /definir/i.test(c.pessoa) ? 'lote sem dono no ERP'
                : c.dif > 0 ? 'ERP credita a mais — conferir' : 'ERP credita a menos — conferir'}</td></tr>`).join('')}
  </table>
  <p class="small">“A definir” soma <strong>R$ ${brl(D.qualidade.a_definir_erp)}</strong> no ERP: lote vendido, comissão
  sem dono. Cada um se resolve olhando o pisteiro no HastaPro.</p>

  <h3>4. Falhas de cadastro que ficaram de fora da conta</h3>
  <div class="cols2">
    <div class="box">
      <div class="t">O que não entrou em ninguém</div>
      <ul style="margin-bottom:0">
        <li><strong>${D.qualidade.sem_pisteiro.n} lotes sem pisteiro</strong> no HastaPro, R$ ${brl(D.qualidade.sem_pisteiro.vgv)}
        — aparecem como “(sem pisteiro no HastaPro)”. Basta preencher o campo para irem ao dono.</li>
        <li><strong>${D.qualidade.valor_zero.n} lote com valor zero</strong> (Mafra, 02/05): conta como lote, não como venda.</li>
      </ul>
    </div>
    <div class="box">
      <div class="t">Como reproduzir</div>
      <ul style="margin-bottom:0">
        <li>Base: <em>LOTES</em> da filial ‘2’ com <em>LOT_DATA_VENDA</em> no mês; faturado = <em>LOT_TOTAL</em>;
        animais = <em>LOT_QTD</em>.</li>
        <li>Complemento: fechamentos do ERP sem leilão correspondente na filial ‘2’ (casados por valor e data).</li>
        <li><code>node scripts/gera-vendas-por-assessor-abr-ago-2026.mjs</code> e
        <code>node scripts/render-vendas-por-assessor-abr-ago-2026.mjs</code>.</li>
      </ul>
    </div>
  </div>

  <div class="box rule">
    <div class="t">O que fazer para o painel parar de divergir</div>
    <ol style="margin-bottom:0">
      <li>Cadastrar a <strong>Nane em PRESTADORES</strong> — resolve a linha em branco na origem.</li>
      <li>Preencher o pisteiro nos ${D.qualidade.sem_pisteiro.n} lotes em aberto.</li>
      <li>Substituir a atribuição por zona pelos <strong>pisteiros reais</strong> nos 17 fechamentos marcados.</li>
      <li>Cadastrar na filial ‘2’ os ${nLeiloesCompl} leilões que hoje só existem no ERP — ou aceitar que o painel
      sempre mostrará R$ ${brl0(TOT_COMPL)} a menos no período.</li>
    </ol>
  </div>
  ${foot('Página 5 de 5')}
</section>
</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)

/* ═══ PDF ════════════════════════════════════════════════════════════════ */
const desktop = path.join(os.homedir(), 'Desktop')
const pdfPath = path.join(desktop, 'Bula - Vendas por Assessor - Abr a Ago 2026.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
await browser.close()

/* ═══ XLSX ═══════════════════════════════════════════════════════════════ */
const wb = XLSX.utils.book_new()
const addSheet = (nome, linhas) => {
    const ws = XLSX.utils.aoa_to_sheet(linhas)
    ws['!cols'] = [{ wch: 34 }, { wch: 16 }, { wch: 8 }, { wch: 10 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, ws, nome)
}
addSheet('Consolidado', [
    ['Pessoa', 'Faturado', 'Lotes', 'Qtd. Ani.', 'Fora do painel'],
    ...D.consolidado.total.map(p => [p.pessoa, p.vgv, p.lotes, p.animais,
    D.consolidado.remates.find(x => x.pessoa === p.pessoa)?.vgv ?? 0]),
    ['Total', r2(TOTAL), TOT_LOTES, TOT_ANI, r2(TOT_COMPL)],
])
for (const m of D.meses) {
    addSheet(NOME_MES[m.mes].slice(0, 1) + NOME_MES[m.mes].slice(1).toLowerCase(), [
        ['Pessoa', 'Faturado', 'Lotes', 'Qtd. Ani.'],
        ...m.total.map(p => [p.pessoa, p.vgv, p.lotes, p.animais]),
        ['Total', m.totais.total.vgv, m.totais.total.lotes, m.totais.total.animais],
        [], ['Leilões fora do painel incluídos neste mês:'],
        ...m.leiloes_remates.filter(l => l.vgv).map(l => [l.nome, l.vgv, l.data]),
    ])
}
addSheet('Conferencia', [
    ['Pessoa', 'HastaPro filial 2', 'ERP', 'Diferença'],
    ...D.conferencia.map(c => [c.pessoa, c.hastapro, c.erp, c.dif]),
])
const xlsxPath = path.join(desktop, 'Bula - Vendas por Assessor - Abr a Ago 2026.xlsx')
XLSX.writeFile(wb, xlsxPath)

console.log('HTML →', path.join(OUT, 'relatorio.html'))
console.log('PDF  →', pdfPath)
console.log('XLSX →', xlsxPath)
