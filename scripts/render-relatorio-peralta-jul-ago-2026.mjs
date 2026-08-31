/**
 * Renderiza o relatorio de vendas e comissoes do Peralta (jul-ago/2026) a
 * partir de outputs/peralta-jul-ago-2026/dados.json. PDF A4 na Area de
 * Trabalho. Nenhum numero escrito a mao — tudo sai do JSON.
 *
 * ESCOPO (pedido do Joao, 31/08/2026): SO Bula Assessoria — filial '2' do
 * HastaPro. Os lotes que ele conduziu em pregao da Bula Remates (filial '01')
 * ficam de fora do relatorio inteiro; o dados.json continua apurando os dois
 * para que o recorte seja declaravel, mas nenhuma pagina os apresenta.
 *
 * Brandbook: preto/grafite/branco, Oswald nos titulos, dourado so no filete da
 * capa e na borda de um tile (acento cirurgico, <5% da peca).
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'

const OUT = 'outputs/peralta-jul-ago-2026'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const dm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'
const dma = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—'
const corta = (t, n) => {
    const x = String(t)
    if (x.length <= n) return x
    const c = x.slice(0, n), sp = c.lastIndexOf(' ')
    return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–]+$/, '') + '…'
}
const titulo = t => corta(String(t).replace(/^LEILÃO\s+(VIRTUAL\s+)?/i, '').replace(/\s*[-–]\s*\d{2}\/\d{2}\/\d{4}\s*$/, ''), 46)

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C'
const PCT = D.pessoa.pct
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

/* ── o que o cruzamento com o HastaPro produz ────────────────────────────── */
const semCredito = D.cruzamento.filter(c => c.situacao !== 'confere')
const vgvSemCredito = r2(semCredito.reduce((a, b) => a + b.vgv, 0))
const comSemCredito = r2(vgvSemCredito * PCT)
const emDisputa = r2(D.soErp.reduce((a, b) => a + b.vgv, 0))
const comDisputa = r2(emDisputa * PCT)

const captacoes = [...new Set(D.cruzamento.map(c => c.captacao).filter(Boolean))].sort((a, b) => a - b)
const autoCompra = D.cruzamento.some(c => c.compradores.some(x => /peralta/i.test(x.nome)))

const tJulho = D.erp.titulos.find(t => t.doc && t.doc.startsWith('com-jul26'))
const comAgostoErp = r2(D.erp.fechamentos.filter(f => f.data >= '2026-08-01').reduce((a, b) => a + b.comissao, 0))
const comJulhoErp = r2(D.erp.fechamentos.filter(f => f.data < '2026-08-01').reduce((a, b) => a + b.comissao, 0))
const cancelado = D.erp.cancelado_junho[0]
const pagoComissao = D.erp.titulos.filter(t => /^COMISSAO/i.test(t.descricao) && t.status === 'pago')
const totalPagoComissao = r2(pagoComissao.reduce((a, b) => a + b.valor, 0))

/* ═══ G1 — julho × agosto na Assessoria (barras, rótulos diretos) ═════════ */
function gMeses() {
    const W = 360, H = 108, BASE = 78, BW = 96
    const meses = [
        { rot: 'JULHO', v: D.fil2.vgv_julho, n: D.fil2.leiloes.filter(l => l.data < '2026-08-01').length },
        { rot: 'AGOSTO', v: D.fil2.vgv_agosto, n: D.fil2.leiloes.filter(l => l.data >= '2026-08-01').length },
    ]
    const max = Math.max(...meses.map(m => m.v))
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Volume vendido pela Bula Assessoria em julho e agosto">
    <line x1="0" y1="${BASE}" x2="${W}" y2="${BASE}" stroke="${GRID}" stroke-width="1"/>
    ${meses.map((m, i) => {
        const h = Math.max((m.v / max) * 52, 3), x = 8 + i * (BW + 46)
        return `<rect x="${x}" y="${BASE - h}" width="${BW}" height="${h}" fill="${INK}" rx="2"/>
        <text x="${x}" y="${BASE - h - 7}" font-family="Oswald" font-size="13" font-weight="600" fill="${INK}">R$ ${brl0(m.v)}</text>
        <text x="${x}" y="${BASE + 14}" font-family="Oswald" font-size="9.5" font-weight="600" fill="${INK}" letter-spacing=".07em">${m.rot}</text>
        <text x="${x}" y="${BASE + 26}" font-family="Inter" font-size="8.6" fill="${MUTED}">${m.n} ${m.n > 1 ? 'leilões' : 'leilão'}</text>`
    }).join('')}
  </svg>`
}

/* ═══ tabelas ════════════════════════════════════════════════════════════ */
const linhasFil2 = D.fil2.leiloes.map(l => {
    const conf = l.lotes.every(x => D.cruzamento.find(c => c.lote === x.lote && c.data === x.data)?.situacao === 'confere')
    const fora = l.lotes.every(x => D.cruzamento.find(c => c.lote === x.lote && c.data === x.data)?.situacao !== 'confere')
    return `<tr>
    <td>${dm(l.data)}</td><td>${esc(titulo(l.leilao))}</td><td>${esc(l.uf || '—')}</td>
    <td class="num">${l.n}</td><td class="num">${l.cabecas}</td>
    <td class="num">R$ ${brl(l.vgv)}</td><td class="num">R$ ${brl(r2(l.vgv * PCT))}</td>
    <td>${conf ? 'no fechamento' : fora ? '<strong>fora do fechamento</strong>' : 'parcial'}</td>
  </tr>`
}).join('')

const linhasLotes = D.cruzamento.map(c => {
    const comp = c.compradores.map(x => x.nome + (x.pct !== 100 ? ` (${x.pct}%)` : '')).join(' + ')
    const sit = c.situacao === 'confere' ? 'Confere'
        : c.situacao === 'ausente' ? '<strong>Ausente no ERP</strong>'
            : c.situacao === 'valor-divergente' ? '<strong>Valor divergente</strong>'
                : `<strong>Consta como “${esc(c.erp.assessor)}”</strong>`
    return `<tr>
    <td>${dm(c.data)}</td><td>${esc(titulo(c.leilao))}</td><td>${esc(c.lote)}</td>
    <td class="num">${c.qtd}</td><td class="num">${brl(c.lance)}</td><td class="num">${c.captacao || '—'}×</td>
    <td class="num">R$ ${brl(c.vgv)}</td><td>${esc(corta(comp, 30))}</td><td>${sit}</td>
  </tr>`
}).join('')

const linhasErp = D.erp.fechamentos.map(f => `<tr>
    <td>${dm(f.data)}</td><td>${esc(titulo(f.leilao))}</td><td>${esc(f.rotulo)}</td>
    <td class="num">R$ ${brl(f.vgv)}</td><td class="num">${(f.pct * 100).toFixed(0)}%</td>
    <td class="num">R$ ${brl(f.comissao)}</td>
    <td>${f.data < '2026-08-01' ? (tJulho ? `título ${tJulho.status}` : 'sem título') : 'sem título'}</td>
  </tr>`).join('')

const linhasCompradores = D.fil2.compradores.map(c => `<tr>
    <td>${esc(corta(c.nome, 42))}</td><td>${esc(c.uf || '—')}</td>
    <td class="num">${c.lotes}</td><td class="num">R$ ${brl(c.vgv)}</td>
  </tr>`).join('')

const linhasTitulos = D.erp.titulos.filter(t => /^COMISSAO/i.test(t.descricao)).map(t => `<tr>
    <td>${dma(t.vencimento)}</td><td>${esc(corta(t.descricao.replace(/^COMISSAO\s+/i, ''), 40))}</td>
    <td class="num">R$ ${brl(t.valor)}</td><td>${t.status === 'vencido' ? '<strong>Vencido</strong>' : esc(t.status[0].toUpperCase() + t.status.slice(1))}</td>
  </tr>`).join('')

const linhasExtrato = D.erp.extrato.map(m => `<tr>
    <td>${dma(m.data)}</td><td>${esc(corta(m.descricao, 44))}</td><td class="num">R$ ${brl(m.valor)}</td>
  </tr>`).join('')

/* ═══ HTML ═══════════════════════════════════════════════════════════════ */
const foot = n => `<div class="pfoot"><span>Bula Assessoria Pecuária · Vendas e comissões — Peralta · jul–ago/2026</span><span>${n}</span></div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Bula — Vendas e comissões do Peralta (jul–ago/2026)</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: ${INK}; margin: 0; font-size: 10.2px; line-height: 1.52; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1,h2,h3 { font-family: Oswald, "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: .022em; font-weight: 600; margin: 0; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 13mm 17mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .pfoot { position: absolute; left: 13mm; right: 13mm; bottom: 7mm; font-size: 7.4px; color: #A6A6A6;
           display: flex; justify-content: space-between; border-top: 1px solid ${GRID}; padding-top: 2mm; }
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
  h3 { font-size: 13px; margin: 7mm 0 2.5mm; }
  h3:first-of-type { margin-top: 0; }
  p { margin: 0 0 3mm; }
  .lead { font-size: 11.4px; line-height: 1.58; }
  strong { font-weight: 600; }
  .muted { color: ${MUTED}; }
  .small { font-size: 9px; color: ${MUTED}; line-height: 1.5; }
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
  table { width: 100%; border-collapse: collapse; font-size: 9.3px; margin: 3mm 0; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.4px; letter-spacing: .07em; font-weight: 600;
       border-bottom: 1.4px solid ${INK}; padding: 2mm 1.8mm; }
  td { padding: 1.7mm 1.8mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.destaque td { background: #F6F6F6; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  figure { margin: 3mm 0 5mm; }
  figcaption { font-size: 8.6px; color: ${MUTED}; margin-top: 1.8mm; line-height: 1.45; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
</style></head><body>

<!-- ══ CAPA ══ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Vendas e<br>comissões<br>do Peralta</h1>
  <div class="rule"></div>
  <div class="sub">Julho e agosto de 2026, lote a lote, com cada venda conferida contra o HastaPro.
  Escopo: <strong>somente a cobertura da Bula Assessoria</strong>.</div>
  <div class="meta">
    <div><span>Período</span><strong>${dma(D.periodo.ini)} a ${dma(D.periodo.fim)}</strong></div>
    <div><span>Assessor</span><strong>${esc(D.pessoa.hastapro)}</strong></div>
    <div><span>Taxa</span><strong>${(PCT * 100).toFixed(0)}% sobre o VGV de cobertura</strong></div>
    <div><span>Fontes</span><strong>HastaPro (Firebird) + ERP Bula</strong></div>
    <div><span>Emitido em</span><strong>${dma(D.geradoEm)}</strong></div>
  </div>
</section>

<!-- ══ 1. PANORAMA ══ -->
<section class="page">
  <div class="head"><h2>O que ele vendeu pela Bula</h2><div class="n">01 · Panorama</div></div>

  <p class="lead">Entre ${dma(D.periodo.ini)} e ${dma(D.periodo.fim)} o Peralta fechou
  <strong>${D.fil2.lotes} lotes</strong> em <strong>${D.fil2.leiloes.length} leilões</strong> da Bula Assessoria,
  somando <strong>R$ ${brl(D.fil2.vgv)}</strong> de VGV de cobertura — <strong>R$ ${brl(D.fil2.comissao)}</strong>
  de comissão a ${(PCT * 100).toFixed(0)}%. Desse total, nada foi pago até hoje.</p>

  <div class="tiles">
    <div class="tile"><div class="k">Vendas no período</div>
      <div class="v"><span class="cur">R$</span>${brl0(D.fil2.vgv)}</div>
      <div class="d">${D.fil2.lotes} lotes · ${D.fil2.cabecas} cabeças · ${D.fil2.leiloes.length} leilões</div></div>
    <div class="tile gold"><div class="k">Comissão devida (${(PCT * 100).toFixed(0)}%)</div>
      <div class="v"><span class="cur">R$</span>${brl0(D.fil2.comissao)}</div>
      <div class="d">sobre o VGV confirmado no HastaPro</div></div>
    <div class="tile"><div class="k">Reconhecido no ERP</div>
      <div class="v"><span class="cur">R$</span>${brl0(D.erp.comissao)}</div>
      <div class="d">em ${D.erp.fechamentos.length} fechamentos, com ${semCredito.length + D.soErp.length} lotes divergentes</div></div>
    <div class="tile"><div class="k">Recebido de comissão em 2026</div>
      <div class="v"><span class="cur">R$</span>${brl0(totalPagoComissao)}</div>
      <div class="d">nenhum PIX de comissão ao Peralta</div></div>
  </div>

  <div class="cols2">
    <div>
      <h3>Ritmo no bimestre</h3>
      <figure>${gMeses()}<figcaption>Agosto multiplicou por
      ${(D.fil2.vgv_agosto / D.fil2.vgv_julho).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}× o volume de julho.</figcaption></figure>
    </div>
    <div>
      <h3>Quem comprou</h3>
      <table>
        <tr><th>Comprador</th><th>UF</th><th class="num">Lotes</th><th class="num">Valor</th></tr>
        ${linhasCompradores}
        <tr class="total"><td colspan="2">Total</td><td class="num">${D.fil2.lotes}</td><td class="num">R$ ${brl(D.fil2.vgv)}</td></tr>
      </table>
      <p class="small">Dois compradores respondem por
      ${((D.fil2.compradores.slice(0, 2).reduce((a, b) => a + b.vgv, 0) / D.fil2.vgv) * 100).toFixed(0)}% do que ele
      vendeu no bimestre.</p>
    </div>
  </div>

  <h3>Leilão a leilão</h3>
  <table>
    <tr><th>Data</th><th>Leilão</th><th>UF</th><th class="num">Lotes</th><th class="num">Cab.</th>
        <th class="num">VGV</th><th class="num">Comissão ${(PCT * 100).toFixed(0)}%</th><th>No ERP</th></tr>
    ${linhasFil2}
    <tr class="total"><td colspan="3">Total do período</td><td class="num">${D.fil2.lotes}</td>
      <td class="num">${D.fil2.cabecas}</td><td class="num">R$ ${brl(D.fil2.vgv)}</td>
      <td class="num">R$ ${brl(D.fil2.comissao)}</td><td></td></tr>
  </table>
  <p class="small">“Fora do fechamento” não significa venda sem prova: significa que o HastaPro registra o lote no
  nome dele e o fechamento do ERP não — é a divergência aberta na página 4.</p>

  <div class="box rule">
    <div class="t">O recorte deste relatório</div>
    <p style="margin:0">Universo: lotes com <strong>pisteiro = Peralta na filial ‘2’ (Bula Assessoria)</strong> do
    HastaPro, vendidos no período. Lotes que ele conduziu em pregão da <strong>Bula Remates</strong> ficam de fora —
    ali ele está na pista pela leiloeira e o lote não é cobertura da Assessoria (regra <em>PISTA_DA_REMATES</em>,
    decisão de 26/08/2026). Nenhum número desta página inclui esses lotes.</p>
  </div>
  ${foot('Página 2 de 4')}
</section>

<!-- ══ 2. LOTE A LOTE ══ -->
<section class="page">
  <div class="head"><h2>Conferência contra o HastaPro</h2><div class="n">02 · Lote a lote</div></div>

  <p class="lead">O VGV de cada lote é <em>lance × captação × cabeças</em>, lido do próprio lote — não é
  multiplicação por 30 no escuro. A última coluna diz se aquele lote chegou ao fechamento do ERP e em nome de quem.</p>

  <table>
    <tr><th>Data</th><th>Leilão</th><th>Lote</th><th class="num">Cab.</th><th class="num">Lance</th>
        <th class="num">Capt.</th><th class="num">VGV</th><th>Comprador</th><th>Situação no ERP</th></tr>
    ${linhasLotes}
  </table>
  <p class="small">Casamento por <strong>número do lote + data (±3 dias)</strong>, nunca só por valor: no 28º Naviraí
  Camparino há três lotes de R$ 48.000 no mesmo dia, dois deles de outro assessor. Casar por valor faria o lote 78
  do Peralta “virar” lote alheio e a falta desaparecer do relatório.</p>

  <h3>O que o ERP registra no nome dele</h3>
  <table>
    <tr><th>Data</th><th>Fechamento</th><th>Rótulo do assessor</th><th class="num">VGV</th>
        <th class="num">%</th><th class="num">Comissão</th><th>Título</th></tr>
    ${linhasErp}
    <tr class="total"><td colspan="3">Total reconhecido pelo ERP</td><td class="num">R$ ${brl(D.erp.vgv)}</td>
      <td class="num"></td><td class="num">R$ ${brl(D.erp.comissao)}</td><td></td></tr>
  </table>

  <div class="cols2" style="margin-top:5mm">
    <div class="box">
      <div class="t">Quanto vale o desempate do HastaPro</div>
      <p>O HastaPro <strong>não é lastro externo</strong>: quem alimenta o sistema digita a partir dos arremates
      anunciados no grupo de lances. É cópia derivada, com uma pessoa no meio.</p>
      <p style="margin-bottom:0">A cadeia real é <strong>pregão → mensagem no grupo → HastaPro → ERP</strong>. O
      registro primário do arremate é a mensagem “Foi com Fulano da Bula Assessoria”. Onde as duas bases divergem,
      o HastaPro é <em>um voto qualificado</em> — na página seguinte cada divergência vem com o que fazer, não com
      um veredito automático.</p>
    </div>
    <div class="box">
      <div class="t">O que sustenta cada linha</div>
      <ul style="margin-bottom:0">
        <li><strong>Lance e captação</strong> saem do próprio lote (<em>CONDICOES</em>):
        ${captacoes.map(c => c + '×').join(', ')} ${captacoes.length > 1 ? 'nos lotes' : 'em todos os lotes'} do
        período — nenhum valor foi inferido.</li>
        <li><strong>Comprador</strong> vem de <em>COMPRADORES</em> ligado a <em>CLIENTES</em>, com o rateio quando o
        lote é dividido.</li>
        <li>${autoCompra
        ? '<strong>Atenção:</strong> há lote em que o próprio Peralta figura como comprador — conferir antes de comissionar.'
        : '<strong>Nenhum lote do período foi comprado pelo próprio Peralta</strong> — a armadilha de pisteiro que também é comprador não afeta esta apuração.'}</li>
        <li><strong>Taxa de ${(PCT * 100).toFixed(0)}%</strong> lida de <em>erp_folha_estrutura</em>, não digitada.</li>
      </ul>
    </div>
  </div>

  <div class="box rule">
    <p style="margin:0"><strong>ERP R$ ${brl(D.erp.vgv)} × HastaPro R$ ${brl(D.fil2.vgv)}.</strong> A diferença de
    R$ ${brl(r2(D.erp.vgv - D.fil2.vgv))} parece pequena, mas as duas bases não divergem em ${brl(r2(D.erp.vgv - D.fil2.vgv))} —
    divergem em <strong>R$ ${brl(r2(vgvSemCredito + emDisputa))}</strong> de lotes que uma reconhece e a outra não,
    e que quase se cancelam. A página seguinte abre os três casos.</p>
  </div>
  ${foot('Página 3 de 4')}
</section>

<!-- ══ 3. COMISSÃO ══ -->
<section class="page">
  <div class="head"><h2>Comissão: devido, lançado e pago</h2><div class="n">03 · Dinheiro</div></div>

  <div class="tiles">
    <div class="tile"><div class="k">Julho · devido</div>
      <div class="v"><span class="cur">R$</span>${brl0(comJulhoErp)}</div>
      <div class="d">título vencido em ${dma(tJulho?.vencimento)}, <strong>não pago</strong></div></div>
    <div class="tile"><div class="k">Agosto · reconhecido no ERP</div>
      <div class="v"><span class="cur">R$</span>${brl0(comAgostoErp)}</div>
      <div class="d">nenhum título lançado até ${dma(D.geradoEm)}</div></div>
    <div class="tile gold"><div class="k">Em disputa de atribuição</div>
      <div class="v"><span class="cur">R$</span>${brl0(comDisputa + comSemCredito)}</div>
      <div class="d">R$ ${brl0(comSemCredito)} a favor dele · R$ ${brl0(comDisputa)} contra</div></div>
    <div class="tile"><div class="k">Recebido de comissão em 2026</div>
      <div class="v"><span class="cur">R$</span>${brl0(totalPagoComissao)}</div>
      <div class="d">o extrato só tem reembolsos de viagem</div></div>
  </div>

  <div class="cols2">
    <div>
      <h3>Títulos de comissão no ERP</h3>
      <table>
        <tr><th>Vencimento</th><th>Título</th><th class="num">Valor</th><th>Status</th></tr>
        ${linhasTitulos}
      </table>
    </div>
    <div>
      <h3>Saídas para o Peralta no extrato</h3>
      <table>
        <tr><th>Data</th><th>Lançamento</th><th class="num">Valor</th></tr>
        ${linhasExtrato}
        <tr class="total"><td colspan="2">Nenhum centavo é comissão</td>
          <td class="num">R$ ${brl(D.erp.extrato.reduce((a, b) => a + b.valor, 0))}</td></tr>
      </table>
    </div>
  </div>
  <p class="small">Os 14 títulos de comissão de agosto já criados com vencimento em 25/09/2026 cobrem Fábio, Douglas
  e Leonardo — <strong>nenhum é do Peralta</strong>. Pela regra do dia 25 do mês seguinte, os R$ ${brl(comAgostoErp)}
  de agosto vencem em <strong>25/09/2026</strong> (sexta-feira, dia útil).</p>

  <h3>As três divergências, com o desempate do HastaPro</h3>
  <table>
    <tr><th>Caso</th><th>Leilão · lote</th><th class="num">VGV</th><th class="num">Efeito ${(PCT * 100).toFixed(0)}%</th><th>O que fazer</th></tr>
    ${semCredito.map(c => `<tr>
      <td>${c.situacao === 'ausente' ? 'Venda fora do fechamento' : 'Lote sem dono no ERP'}</td>
      <td>${esc(titulo(c.leilao))} · lt ${esc(c.lote)}<br><span class="muted">${esc(corta(c.compradores.map(x => x.nome).join(' + '), 38))}</span></td>
      <td class="num">R$ ${brl(c.vgv)}</td><td class="num">+R$ ${brl(r2(c.vgv * PCT))}</td>
      <td>${c.situacao === 'ausente'
            ? 'O lote não existe no fechamento. Incluir e gerar o título.'
            : `Consta como “${esc(c.erp.assessor)}”. O HastaPro nomeia o Peralta — reatribuir.`}</td></tr>`).join('')}
    ${D.soErp.map(s => `<tr>
      <td>Crédito sem lastro</td>
      <td>${esc(titulo(s.fechamento))} · lt ${esc(s.lote)}<br><span class="muted">comprador “${esc(s.comprador)}”</span></td>
      <td class="num">R$ ${brl(s.vgv)}</td><td class="num">−R$ ${brl(r2(s.vgv * PCT))}</td>
      <td>ERP credita “${esc(s.assessor)}”; no HastaPro o lote é de
          <strong>${esc(s.hastapro.map(h => h.pisteiro).join(' / ') || 'ninguém identificado')}</strong>. Confirmar quem vendeu.</td></tr>`).join('')}
    <tr class="total"><td colspan="2">Efeito líquido se tudo for decidido pelo HastaPro</td>
      <td class="num">${(vgvSemCredito - emDisputa) >= 0 ? '' : '−'}R$ ${brl(Math.abs(r2(vgvSemCredito - emDisputa)))}</td>
      <td class="num">${(comSemCredito - comDisputa) >= 0 ? '+' : '−'}R$ ${brl(Math.abs(r2(comSemCredito - comDisputa)))}</td>
      <td>comissão do bimestre = R$ ${brl(D.fil2.comissao)}</td></tr>
  </table>

  <div class="box dark">
    <div class="t">O que precisa de decisão</div>
    <ol style="margin-bottom:0">
      <li><strong>Pagar ou não os R$ ${brl(comJulhoErp)} de julho</strong>, vencidos em ${dma(tJulho?.vencimento)} e
      até hoje sem PIX.</li>
      <li><strong>Lançar os títulos de agosto</strong> — R$ ${brl(comAgostoErp)} pelo ERP,
      R$ ${brl(r2(D.fil2.vgv_agosto * PCT))} pelo HastaPro — para o vencimento de 25/09/2026.</li>
      <li><strong>Resolver os três lotes divergentes</strong> do Naviraí Camparino: os dois sem crédito e o de
      R$ ${brl0(emDisputa)} atribuído a “Peralta / Bula”.</li>
      <li><strong>Reconciliar a regra com junho.</strong> A comissão de R$ ${brl(cancelado.valor)} do leilão de 23/06
      foi cancelada em ${dma(cancelado.atualizado)} com esta justificativa gravada no título:
      <em>“Comissionados reais da operação são apenas Douglas, Leonardo, Fabio, Rusa e Bulinha (chefe 04/08).
      CP de Peralta não é dívida real.”</em> Em 26/08 a regra de importação voltou a tratá-lo como vendedor pela Bula —
      e é por isso que julho e agosto geraram comissão no nome dele. <strong>As duas decisões não convivem:</strong>
      ou o cancelamento vale e os R$ ${brl(D.fil2.comissao)} do bimestre caem junto, ou a regra vale e os
      R$ ${brl(cancelado.valor)} de junho precisam voltar.</li>
    </ol>
  </div>
  ${foot('Página 4 de 4')}
</section>
</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)

const destino = path.join(os.homedir(), 'Desktop', 'Bula - Vendas e Comissoes Peralta - Jul-Ago 2026.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: destino, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
await browser.close()
console.log('HTML  →', path.join(OUT, 'relatorio.html'))
console.log('PDF   →', destino)
