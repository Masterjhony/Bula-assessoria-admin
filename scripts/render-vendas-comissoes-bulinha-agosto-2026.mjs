/**
 * Renderiza "Vendas e Comissões do Bulinha — Agosto/2026" a partir de
 * outputs/bulinha-agosto-2026/dados.json. PDF A4 na Área de Trabalho.
 *
 * Nenhum número escrito à mão: VGV e lote saem do HastaPro, comissão e títulos
 * do ERP, fatura de cartão da leitura do Sicoob IB. Onde há duas leituras, as
 * duas aparecem — não escolho por conta própria.
 *
 * Brandbook: preto/grafite/branco, Oswald nos títulos, dourado só como acento.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'

const OUT = 'outputs/bulinha-agosto-2026'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const dma = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—'
const dm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'
const corta = (t, n) => { const x = String(t); if (x.length <= n) return x
    const c = x.slice(0, n), sp = c.lastIndexOf(' ')
    return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–]+$/, '') + '…' }
const leilao = (t, n = 42) => corta(String(t).replace(/^(\d+[º°]\s*)?LEIL[ÃA]O\s+(VIRTUAL\s+)?/i, '')
    .replace(/\s*[-–]\s*\d{2}\/\d{2}\/\d{4}\s*$/, ''), n)
const pctS = p => (Number(p) * 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + '%'
const sinal = n => (n < 0 ? '−' : '+') + brl(Math.abs(n))
const pc = (n, d = 1) => Number(n).toFixed(d).replace(/\.?0+$/, '').replace('.', ',') + '%'

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

/* ── recortes ────────────────────────────────────────────────────────────── */
const fil2 = D.lotes.filter(l => l.filial === '2')
const fil01 = D.lotes.filter(l => l.filial === '01')
const MES = ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/* FIL 01 agrupado por leilão — 23 lotes em 4 pregões */
const porLeilao = []
for (const l of fil01) {
    let g = porLeilao.find(x => x.leilao === l.leilao && x.data === l.data)
    if (!g) porLeilao.push(g = { leilao: l.leilao, data: l.data, lotes: [], vgv: 0, animais: 0 })
    g.lotes.push(l.lote); g.vgv = r2(g.vgv + l.vgv); g.animais += l.qtd
}
porLeilao.sort((a, b) => b.vgv - a.vgv)

/* série do ano por filial */
const serieMes = []
for (const s of D.serie) {
    let g = serieMes.find(x => x.mes === s.mes)
    if (!g) serieMes.push(g = { mes: s.mes, f2: 0, f01: 0, n2: 0, n01: 0 })
    if (s.filial === '2') { g.f2 = s.vgv; g.n2 = s.lotes } else { g.f01 = s.vgv; g.n01 = s.lotes }
}
serieMes.sort((a, b) => a.mes - b.mes)
const anoF2 = r2(serieMes.reduce((s, m) => s + m.f2, 0))
const anoF01 = r2(serieMes.reduce((s, m) => s + m.f01, 0))
const maxSerie = Math.max(...serieMes.map(m => m.f2 + m.f01))

/* cartão */
const fatAgo = D.cartao.faturas.filter(f => f.competencia === '2026-08')
const fatJul = D.cartao.faturas.filter(f => f.competencia === '2026-07')
const totalCompras = r2(Object.values(D.cartao.por_portador).reduce((s, v) => s + v, 0))
const pctFelipe = (100 * (D.cartao.por_portador['FELIPE V ANDRADE'] || 0) / totalCompras)

/* Remates: o São Geraldo é o número grande da relação */
const crSG = D.remates.aberto.find(c => /SAO GERALDO/i.test(c.descricao))
const SG_PLANILHA = { pct: 0.01, base: 5019800 }                 // planilha FINANCEIRO BULA 2026
const SG_BULINHA = { pct: 0.005, base: 4980800, valor: 24904 }   // ele, no grupo, 31/08
const sgDiferenca = r2((crSG?.restante ?? 0) - SG_BULINHA.valor)
const crVencida = D.remates.aberto.find(c => /NELORACO/i.test(c.descricao))

/* extrato: o que passou entre as duas pontas em agosto */
const mvAgo = D.extrato.filter(m => m.data >= '2026-08-01' && m.data <= '2026-08-31')
const pagoAEle = D.extrato.filter(m => /FELIPE VILELA ANDRADE/i.test(m.descricao) && m.tipo === 'saida')

const foot = p => `<div class="pfoot"><span>Bula Assessoria · Vendas e comissões do Bulinha — Agosto/2026</span>
  <span>Apurado em ${dma(D.geradoEm)} · HastaPro FIL '2' e '01' + ERP + Sicoob</span><span>${p}</span></div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Bula — Vendas e Comissões do Bulinha: Agosto 2026</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Arial, sans-serif; color: ${INK}; margin: 0; font-size: 10.2px; line-height: 1.52; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1,h2,h3 { font-family: Oswald, "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: .022em; font-weight: 600; margin: 0; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 13mm 17mm; position: relative; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .pfoot { position: absolute; left: 13mm; right: 13mm; bottom: 7mm; font-size: 7.4px; color: #A6A6A6;
           display: flex; justify-content: space-between; border-top: 1px solid ${GRID}; padding-top: 2mm; }
  .capa { background: ${INK}; color: #fff; padding: 30mm 20mm 20mm; display: flex; flex-direction: column; }
  .capa img { width: 42mm; margin-bottom: 20mm; }
  .capa h1 { font-size: 38px; line-height: 1.06; color: #fff; font-weight: 700; }
  .capa .sub { font-size: 12.4px; color: #B5B5B5; margin-top: 8mm; max-width: 144mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
  .capa .rule { width: 26mm; height: 3px; background: ${GOLD}; margin: 9mm 0; }
  .capa .meta { margin-top: auto; flex-wrap: wrap; row-gap: 6mm; display: flex; gap: 10mm; border-top: 1px solid #2A2A2A; padding-top: 6mm; }
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
  .tiles.t3 { grid-template-columns: repeat(3,1fr); }
  .tiles.t2 { grid-template-columns: repeat(2,1fr); }
  .tile { border: 1px solid ${GRID}; border-top: 3px solid ${INK}; padding: 3.4mm 3.4mm 3mm; }
  .tile .k { font-size: 8px; text-transform: uppercase; letter-spacing: .085em; color: ${MUTED}; margin-bottom: 1.6mm; line-height: 1.3; min-height: 5.6mm; }
  .tile .v { font-family: Oswald, sans-serif; font-size: 19px; font-weight: 600; line-height: 1; }
  .tile .v .cur { font-size: 11px; font-weight: 500; color: ${MUTED}; margin-right: 1px; }
  .tile .d { font-size: 8.4px; color: ${MUTED}; margin-top: 1.6mm; line-height: 1.4; }
  .tile.gold { border-top-color: ${GOLD}; }
  .tile.dark { background: ${INK}; border-color: ${INK}; }
  .tile.dark .k { color: #9A9A9A; } .tile.dark .v { color: #fff; } .tile.dark .d { color: #B5B5B5; }
  .tile.dark .v .cur { color: #8A8A8A; }
  .box { border: 1px solid ${GRID}; padding: 4mm 4.4mm; margin: 4mm 0; }
  .box.dark { background: ${INK}; color: #fff; border-color: ${INK}; }
  .box.dark .t { color: ${GOLD}; }
  .box.dark p, .box.dark li { color: #D8D8D8; }
  .box.dark strong { color: #fff; }
  .box.rule { border: none; border-left: 3px solid ${INK}; padding: 1mm 0 1mm 4mm; }
  .box.gold { border-left: 3px solid ${GOLD}; border-top: 1px solid ${GRID}; border-right: 1px solid ${GRID}; border-bottom: 1px solid ${GRID}; background: #FDFBF5; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; margin-bottom: 2.2mm; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 9.3px; margin: 3mm 0; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.4px; letter-spacing: .07em; font-weight: 600;
       border-bottom: 1.4px solid ${INK}; padding: 2mm 1.8mm; }
  td { padding: 1.7mm 1.8mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.ctr, th.ctr { text-align: center; }
  tr.destaque td { background: #F6F6F6; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  tr.sub td { border-top: 1px solid ${MUTED}; font-weight: 600; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  table.tight td { padding: 1.25mm 1.8mm; }
  table.tight th { padding: 1.6mm 1.8mm; }
  .tag { display: inline-block; font-size: 7.6px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em;
         border: 1px solid ${MUTED}; color: ${MUTED}; padding: .3mm 1.4mm; border-radius: 2px; }
  .tag.ok { border-color: ${INK}; color: ${INK}; }
  .tag.g { border-color: ${GOLD}; color: #8A7226; background: #FBF6E8; }
  .tag.n { border-color: #B33; color: #B33; }
  .bars { margin: 3mm 0 4mm; }
  .bar { display: grid; grid-template-columns: 9mm 1fr 26mm; align-items: center; gap: 2mm; margin-bottom: 1.4mm; font-size: 8.6px; }
  .bar .lb { font-family: Oswald, sans-serif; text-transform: uppercase; color: ${MUTED}; letter-spacing: .06em; }
  .bar .tr { background: #F2F2F2; height: 4.6mm; position: relative; }
  .bar .s1 { position: absolute; left: 0; top: 0; bottom: 0; background: ${INK}; }
  .bar .s2 { position: absolute; top: 0; bottom: 0; background: ${GOLD}; }
  .bar .vl { text-align: right; font-variant-numeric: tabular-nums; color: ${MUTED}; }
  .bar.hi .lb, .bar.hi .vl { color: ${INK}; font-weight: 600; }
  .leg { font-size: 8.2px; color: ${MUTED}; display: flex; gap: 5mm; margin-top: 1mm; }
  .leg i { display: inline-block; width: 3mm; height: 3mm; margin-right: 1.2mm; vertical-align: -.4mm; }
  .zap { border-left: 3px solid ${GRID}; padding-left: 3.4mm; margin: 2mm 0 3mm; }
  .zap .l { margin-bottom: 1.2mm; }
  .zap .l b { font-weight: 600; }
  code { font-family: "Consolas", monospace; font-size: 8.6px; background: #F4F4F4; padding: .2mm 1mm; }
  em { font-style: normal; font-family: "Consolas", monospace; font-size: 8.8px; }
</style></head><body>

<!-- ══════════════════ CAPA ══════════════════ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Vendas e comissões<br>do Bulinha<br><span style="color:${GOLD}">Agosto de 2026</span></h1>
  <div class="rule"></div>
  <div class="sub">Ele pôs <strong style="color:#fff">R$ ${brl0(D.vendas.total)}</strong> na pista em agosto, mas
  <strong style="color:#fff">R$ ${brl0(D.vendas.fil01.vgv)} disso</strong> foi em pregão da própria Bula Remates, que não
  comissiona. A cobertura da Assessoria foram <strong style="color:#fff">R$ ${brl0(D.vendas.fil2.vgv)}</strong> em 2 lotes —
  <strong style="color:#fff">R$ ${brl(D.comissao.devida)}</strong> de comissão a 2%. Como a fatura do cartão da Bula que vence
  em 22/09 é gasto dele e soma R$ ${brl(D.cartao.fatura_conhecida)}, pelo critério dos acertos anteriores
  <strong style="color:#fff">ele não tem a receber — fica devendo</strong>.</div>
  <div class="meta">
    <div><span>Pessoa</span><strong>${esc(D.pessoa.nome)}</strong></div>
    <div><span>Comissão</span><strong>${pctS(D.pessoa.pct)} sobre cobertura</strong></div>
    <div><span>Período</span><strong>01–31/08/2026</strong></div>
    <div><span>Ciclo</span><strong>25/09/2026</strong></div>
    <div><span>Apurado em</span><strong>${dma(D.geradoEm)}</strong></div>
  </div>
</section>

<!-- ══════════════════ 1. A RESPOSTA ══════════════════ -->
<section class="page">
  <div class="head"><h2>A resposta em números</h2><div class="n">01 · Agosto 2026</div></div>

  <p class="lead">A pergunta tem duas metades que <strong>não se somam</strong>. “Quanto vendeu” é o que ele pôs na pista.
  “Quanto tem a receber” é só a parte dessa venda que a Bula Assessoria cobre — e menos o cartão.</p>

  <div class="tiles">
    <div class="tile"><div class="k">Vendas na pista (25 lotes)</div>
      <div class="v"><span class="cur">R$</span>${brl0(D.vendas.total)}</div>
      <div class="d">HastaPro, as duas filiais</div></div>
    <div class="tile gold"><div class="k">Cobertura Bula Assessoria</div>
      <div class="v"><span class="cur">R$</span>${brl0(D.vendas.fil2.vgv)}</div>
      <div class="d">FIL '2' · ${D.vendas.fil2.lotes} lotes · é a base da comissão</div></div>
    <div class="tile"><div class="k">Comissão devida a ${pctS(D.comissao.pct)}</div>
      <div class="v"><span class="cur">R$</span>${brl(D.comissao.devida)}</div>
      <div class="d">${brl(D.comissao.firme)} firmes + ${brl(D.comissao.disputa)} em disputa</div></div>
    <div class="tile dark"><div class="k">Saldo do acerto</div>
      <div class="v">${sinal(D.saldo.com_lote11_fatura_real)}</div>
      <div class="d">depois da fatura de cartão de 22/09</div></div>
  </div>

  <div class="box dark">
    <div class="t">A frase curta para responder no grupo</div>
    <p style="margin-bottom:0">O Bulinha vendeu <strong>R$ ${brl0(D.vendas.total)}</strong> em agosto, mas
    <strong>${pc(100 * D.vendas.fil01.vgv / D.vendas.total, 0)}</strong> foi na pista da Bula Remates, onde ele não
    comissiona. Pela Assessoria foram <strong>R$ ${brl0(D.vendas.fil2.vgv)}</strong> em 2 lotes, o que dá
    <strong>R$ ${brl(D.comissao.devida)}</strong> de comissão. Só que a fatura do cartão da Bula que vence em 22/09 é gasto
    dele e está em <strong>R$ ${brl(D.cartao.fatura_conhecida)}</strong> — então, no acerto,
    <strong>ele não recebe: fica devendo ${brl(Math.abs(D.saldo.com_lote11_fatura_real))}</strong>. O dinheiro grande dessa
    relação não é a comissão dele, é a <strong>R$ ${brl0(D.remates.total_aberto)}</strong> que a Bula Remates deve à Bula.</p>
  </div>

  <h3>Por que R$ 720 mil de venda dele não geram um centavo de comissão</h3>
  <p>São duas filiais no HastaPro, e a diferença entre elas é <strong>quem é a leiloeira</strong> —
  não o tamanho do lote nem quem estava na pista.</p>

  <table>
    <thead><tr><th>Filial</th><th>O que é</th><th class="ctr">Lotes</th><th class="num">VGV agosto</th>
      <th class="ctr">Comissiona?</th><th class="num">Comissão</th></tr></thead>
    <tbody>
      <tr class="destaque"><td><strong>FIL '2'</strong></td>
        <td><strong>Bula Assessoria</strong> — cobertura da equipe em leilão de terceiro</td>
        <td class="ctr">${D.vendas.fil2.lotes}</td><td class="num"><strong>${brl(D.vendas.fil2.vgv)}</strong></td>
        <td class="ctr"><span class="tag ok">Sim, ${pctS(D.comissao.pct)}</span></td>
        <td class="num"><strong>${brl(D.comissao.devida)}</strong></td></tr>
      <tr><td><strong>FIL '01'</strong></td>
        <td><strong>Bula Remates</strong> — pregão da leiloeira do próprio Felipe</td>
        <td class="ctr">${D.vendas.fil01.lotes}</td><td class="num">${brl(D.vendas.fil01.vgv)}</td>
        <td class="ctr"><span class="tag n">Não, 0%</span></td><td class="num">0,00</td></tr>
      <tr class="total"><td colspan="2">Total na pista</td><td class="ctr">${D.lotes.length}</td>
        <td class="num">${brl(D.vendas.total)}</td><td></td><td class="num">${brl(D.comissao.devida)}</td></tr>
    </tbody>
  </table>

  <div class="box rule">
    <p style="margin-bottom:2mm"><strong>A regra, com data e autor.</strong> O chefe fixou em <strong>23/07/2026</strong>:
    o Bulinha tem os 2% normais como qualquer pisteiro, e a exceção é estreita — <strong>só em leilão cuja leiloeira é a
    Bula Remates ele não tem comissão</strong>. Em <strong>26/08</strong> isso virou régua no importador
    (<em>PISTA_DA_REMATES</em>): num pregão da própria Remates, Bulinha, Peralta, Lucas Martins e Laila estão na pista
    <strong>pela Remates</strong> — estar na folha da Bula não basta. É a mesma régua que segurou o São Geraldo de 01/08
    em R$ 375.800 de cobertura em vez de R$ 1,83 milhão.</p>
    <p class="small" style="margin-bottom:0">⚠ <strong>A armadilha que já custou uma reversão:</strong> o PDF “Listagem
    Vendas Assessores/Pisteiros” mostra as vendas dele a “Recinto × 0,00%”. Isso é o que <strong>a leiloeira</strong> paga a
    ele — não significa que a Bula não deva os 2%. Junho de 2026 foi zerado por causa dessa leitura e teve de ser revertido
    inteiro. Aqui o critério é a <strong>filial do leilão</strong>, não o percentual do PDF.</p>
  </div>

  <h3>O que ele tem a receber, linha por linha</h3>
  <table class="tight">
    <thead><tr><th>Origem</th><th>Base</th><th class="num">Valor</th><th>Situação</th></tr></thead>
    <tbody>
      <tr><td>Comissão de agosto — firme</td><td>6º Excelência Genética, lote 21 · R$ 105.000 a 2%</td>
        <td class="num">${brl(D.comissao.firme)}</td><td>reconhecida no fechamento; <strong>sem título no ERP</strong></td></tr>
      <tr><td>Comissão de agosto — em disputa</td><td>Naviraí Essência, lote 11 · R$ 93.000 a 2%</td>
        <td class="num">${brl(D.comissao.disputa)}</td><td>o ERP credita “Peralta / Bula”, o HastaPro dá a ele</td></tr>
      <tr><td>Comissão de julho</td><td>FIL '2' em julho = R$ 0 (os 25 lotes dele foram todos da Remates)</td>
        <td class="num">0,00</td><td>nada devido</td></tr>
      <tr><td>Saldo anterior</td><td>residual de R$ 7.392,00 do acerto de junho</td>
        <td class="num">0,00</td><td>quitado em 24/08 (7.329,97 por fatura + 62,03 de desconto)</td></tr>
      <tr class="sub"><td colspan="2">Bruto a receber</td><td class="num">${brl(D.comissao.devida)}</td><td></td></tr>
      <tr><td>(−) Fatura de cartão de 22/09</td>
        <td>${fatAgo.map(f => `${f.bandeira} ${f.final} ${brl(f.proxima)}`).join(' + ')}</td>
        <td class="num">−${brl(D.cartao.fatura_conhecida)}</td><td>100% das compras têm portador dele</td></tr>
      <tr class="total"><td colspan="2">Saldo</td><td class="num">${sinal(D.saldo.com_lote11_fatura_real)}</td>
        <td><strong>ele deve à Bula</strong></td></tr>
    </tbody>
  </table>
  ${foot('Página 1 de 5')}
</section>

<!-- ══════════════════ 2. AS VENDAS ══════════════════ -->
<section class="page">
  <div class="head"><h2>As vendas, lote a lote</h2><div class="n">02 · HastaPro</div></div>

  <h3>FIL '2' — Bula Assessoria · a base da comissão</h3>
  <p>Dois lotes, o mesmo comprador principal nos dois. É todo o volume comissionável dele no mês —
  <strong>${pc(100 * D.vendas.fil2.vgv / 7740000)}</strong> dos R$ 7,74 milhões que a Bula fechou em agosto.</p>
  <table>
    <thead><tr><th class="ctr">Data</th><th>Leilão</th><th class="ctr">Lote</th><th class="num">Lance</th>
      <th class="ctr">×</th><th class="num">VGV</th><th>Comprador</th><th class="num">2%</th></tr></thead>
    <tbody>
      ${fil2.map(l => `<tr><td class="ctr">${dm(l.data)}</td><td>${esc(leilao(l.leilao, 34))}</td>
        <td class="ctr"><strong>${esc(l.lote)}</strong></td><td class="num">${brl(l.lance)}</td>
        <td class="ctr">${l.mult}</td><td class="num"><strong>${brl(l.vgv)}</strong></td>
        <td>${esc(corta(l.comprador ?? '—', 26))}</td><td class="num">${brl(r2(l.vgv * 0.02))}</td></tr>`).join('')}
      <tr class="total"><td colspan="5">Total FIL '2'</td><td class="num">${brl(D.vendas.fil2.vgv)}</td><td></td>
        <td class="num">${brl(D.comissao.devida)}</td></tr>
    </tbody>
  </table>
  <p class="small">O lote 21 do Excelência é o único do mês em que o <strong>próprio HastaPro grava comissão de 2%</strong>
  (<em>ASSESSORIA.COMISSAO = 2</em>) — nos outros 24 o campo vem zerado. Foi decisão do Marcelo:
  “Bula recebe 2% também… nesse caso as vendas serão pagas ao Bulinha”.</p>

  <h3>FIL '01' — Bula Remates · não comissiona</h3>
  <p>Vinte e três lotes em quatro pregões da leiloeira dele. Entram no relatório para responder “quanto vendeu”,
  e ficam fora da comissão.</p>
  <table class="tight">
    <thead><tr><th class="ctr">Data</th><th>Pregão da Bula Remates</th><th class="ctr">Lotes</th>
      <th>Números</th><th class="ctr">Animais</th><th class="num">VGV</th></tr></thead>
    <tbody>
      ${porLeilao.map(g => `<tr><td class="ctr">${dm(g.data)}</td><td>${esc(leilao(g.leilao, 40))}</td>
        <td class="ctr">${g.lotes.length}</td><td class="small" style="color:${MUTED}">${esc(g.lotes.join(' · '))}</td>
        <td class="ctr">${g.animais}</td><td class="num">${brl(g.vgv)}</td></tr>`).join('')}
      <tr class="total"><td colspan="2">Total FIL '01'</td><td class="ctr">${D.vendas.fil01.lotes}</td><td></td>
        <td class="ctr">${D.vendas.fil01.animais}</td><td class="num">${brl(D.vendas.fil01.vgv)}</td></tr>
    </tbody>
  </table>
  <p class="small">Um detalhe que confirma a natureza da FIL '01': no <strong>Só Criador de 11/08, lote 105</strong>
  (R$ 2.600), o pisteiro e o comprador são <strong>a mesma pessoa</strong> — ele. Na pista da própria leiloeira, o
  <em>LOT_PISTEIRO</em> às vezes é o vendedor da Remates e às vezes o próprio comprador; é mais uma razão para essa
  filial não virar base de comissão da Assessoria.</p>

  <h3>Agosto no ano dele</h3>
  <p>Agosto foi <strong>o mês mais fraco de 2026</strong> nas duas filiais — a FIL '01' caiu de R$ 4,85 milhões em junho
  para R$ 720 mil, e a FIL '2' só teve movimento em 4 dos 8 meses.</p>
  <div class="bars">
    ${serieMes.map(m => { const tot = m.f2 + m.f01, w = 100 * tot / maxSerie, w2 = 100 * m.f01 / maxSerie
        return `<div class="bar${m.mes === 8 ? ' hi' : ''}"><div class="lb">${MES[m.mes]}</div>
          <div class="tr"><div class="s1" style="width:${w2.toFixed(2)}%"></div>
          <div class="s2" style="left:${w2.toFixed(2)}%;width:${(w - w2).toFixed(2)}%"></div></div>
          <div class="vl">${brl0(tot)}</div></div>` }).join('')}
    <div class="leg"><span><i style="background:${INK}"></i>FIL '01' Bula Remates — R$ ${brl0(anoF01)} no ano</span>
      <span><i style="background:${GOLD}"></i>FIL '2' Assessoria — R$ ${brl0(anoF2)} no ano</span></div>
  </div>
  <p class="small">Só a faixa dourada comissiona. No ano, a base de comissão dele é <strong>R$ ${brl0(anoF2)}</strong> —
  ${pc(100 * anoF2 / (anoF2 + anoF01), 0)} de tudo que ele pôs na pista.</p>
  ${foot('Página 2 de 5')}
</section>

<!-- ══════════════════ 3. O QUE TRAVA ══════════════════ -->
<section class="page">
  <div class="head"><h2>O que trava a comissão</h2><div class="n">03 · Decisões</div></div>

  <p class="lead">Dos R$ ${brl(D.comissao.devida)}, <strong>${brl(D.comissao.firme)} são firmes</strong> e
  <strong>${brl(D.comissao.disputa)} dependem de uma decisão</strong>. E nenhum dos dois virou título — o ciclo do dia 25
  não tem o nome dele.</p>

  <h3>1 · O lote 11 do Naviraí Essência (22/08) — R$ 93.000</h3>
  <div class="box gold">
    <div class="t">Duas fontes, dois nomes</div>
    <p><strong>O HastaPro</strong> registra o pisteiro como <em>Felipe Vilela Andrade</em>.
    <strong>O ERP</strong> gravou o lance como <strong>“Peralta / Bula”</strong> — o rótulo que veio da ficha do WhatsApp.
    São R$ 1.860 de comissão que vão para um ou para o outro.</p>
    <p style="margin-bottom:0"><strong>O precedente aponta para o Bulinha.</strong> O lote 21 do Excelência tinha
    <em>exatamente o mesmo rótulo</em> “Peralta / Bula”, e o Marcelo resolveu: “Bula recebe 2% também… nesse caso as vendas
    serão pagas ao Bulinha”. O HastaPro já está com o Bulinha nos dois. Aplicar a mesma leitura ao lote 11 é coerência,
    não arbitragem — mas o relatório do Peralta de 31/08 lista esse lote como pedido <strong>dele</strong>, então a
    palavra final é da diretoria.</p>
  </div>
  <table class="tight">
    <thead><tr><th>Leitura</th><th class="num">Bulinha</th><th class="num">Peralta</th><th>Consequência</th></tr></thead>
    <tbody>
      <tr class="destaque"><td>Vale o HastaPro (e o precedente do lote 21)</td><td class="num"><strong>${brl(D.comissao.devida)}</strong></td>
        <td class="num">0,00</td><td>o Peralta perde R$ 1.860 do que pediu em 01/09</td></tr>
      <tr><td>Vale o rótulo do ERP</td><td class="num">${brl(D.comissao.firme)}</td><td class="num">1.860,00</td>
        <td>fica a divergência HastaPro × ERP em aberto no lote</td></tr>
    </tbody>
  </table>

  <h3>2 · A comissão de agosto não está no ciclo do dia 25</h3>
  <p>O ERP tem <strong>${D.erp.ciclo_25_09.length} títulos de comissão</strong> com vencimento em
  <strong>25/09</strong>, somando R$ ${brl(D.erp.ciclo_25_09.reduce((s, c) => s + c.valor, 0))} — e são
  <strong>só de Douglas, Fábio e Leonardo</strong>. O Bulinha não tem nenhum, nem o firme de R$ ${brl(D.comissao.firme)}.
  A comissão dele está reconhecida no fechamento e <strong>nunca virou conta a pagar</strong>.</p>
  <p class="small">Não é caso isolado: dos R$ 201.031,80 de comissão gravados nos 33 fechamentos de agosto, só
  R$ 40.780 viraram título. O ciclo de 25/09 ainda vai ser gerado, e é nele que isso se corrige.</p>

  <h3>3 · A hipótese que mudaria tudo — e que hoje não está aplicada</h3>
  <div class="box rule">
    <p style="margin-bottom:0">Em <strong>05/08</strong> o Grupo Financeiro fixou que <strong>venda de PO em leilão da
    Bula Remates paga 1% para todos</strong>. Se essa regra alcançasse o Bulinha, a FIL '01' dele deixaria de ser zero:
    <strong>R$ ${brl(D.comissao.se_fosse_1pct_remates)}</strong> (1% de R$ ${brl0(D.vendas.fil01.vgv)}) — quase o dobro do
    que ele receberia de tudo o mais somado. <strong>Hoje não está aplicada a ninguém da pista da Remates</strong>: o
    fechamento de agosto tratou os R$ 538.800 de Bulinha, Lucas, Peralta e Laila no Melhoradores como cobertura zero, e a
    justificativa registrada foi “ngm dos meninos vendeu”. Fica como pergunta explícita, porque é a maior alavanca do
    número dele.</p>
  </div>

  <h3>4 · Nada devido de julho — e por quê</h3>
  <p>Em julho ele pôs <strong>R$ ${brl0(D.julho.find(j => j.filial === '01')?.vgv ?? 0)}</strong> na pista em
  ${D.julho.find(j => j.filial === '01')?.lotes ?? 0} lotes, <strong>todos na FIL '01'</strong> (Nelore Kriz, Só Criador,
  Neloraço, Irmãos Hipólito). A FIL '2' de julho foi <strong>R$ 0,00</strong>. Não existe comissão de julho a cobrar,
  e é por isso que ele não aparece nos R$ 19.977 do ciclo de julho em aberto.</p>

  <h3>Histórico de comissão paga a ele em 2026</h3>
  <table class="tight">
    <thead><tr><th class="ctr">Venc.</th><th>Título</th><th class="num">Valor</th><th class="num">Pago</th><th>Como</th></tr></thead>
    <tbody>
      ${D.erp.contas_pagar.filter(c => /COMISS|SALDO DEVIDO/i.test(c.descricao))
        .sort((a, b) => Number(/SALDO DEVIDO/i.test(a.descricao)) - Number(/SALDO DEVIDO/i.test(b.descricao))).map(c => `<tr>
        <td class="ctr">${dm(c.vencimento)}</td><td>${esc(corta(c.descricao.replace(/\s*-\s*BULINHA.*$/i, ''), 52))}</td>
        <td class="num">${brl(c.valor)}</td><td class="num">${brl(c.valor_pago)}</td>
        <td class="small">${Number(c.desconto) > 0 ? `${brl(c.desconto)} de desconto` : (c.forma_pagamento === 'cartao' ? 'compensado por fatura' : 'PIX')}</td></tr>`).join('')}
      <tr class="total"><td colspan="2">Comissão de maio+junho, acertada em julho</td>
        <td class="num">${brl(r2(D.erp.contas_pagar.filter(c => /COMISS/i.test(c.descricao)).reduce((s, c) => s + Number(c.valor), 0)))}</td>
        <td class="num"></td><td></td></tr>
    </tbody>
  </table>
  <p class="small">Os R$ 58.872,00 de maio+junho foram pagos em julho <strong>com desconto dos gastos dele no cartão da
  empresa</strong> — PIX de R$ 38.000 em 13/07 e R$ 51.871,50 em 17/07. O residual de R$ 7.392,00 que sobrou foi quitado
  em 24/08 pelas duas faturas de cartão (R$ 7.329,97), com R$ 62,03 lançados como desconto.
  <strong>É esse o critério que já vem sendo praticado — comissão menos cartão.</strong></p>
  ${foot('Página 3 de 5')}
</section>

<!-- ══════════════════ 4. O CARTÃO E A REMATES ══════════════════ -->
<section class="page">
  <div class="head"><h2>O cartão e a conta da Remates</h2><div class="n">04 · O outro lado</div></div>

  <h3>O cartão da Bula é, na prática, o cartão dele</h3>
  <p>Das <strong>${brl0(D.cartao.compras_n)} compras</strong> lançadas nos dois cartões da
  Bula (R$ ${brl(D.cartao.compras_total)}), <strong>${pc(pctFelipe)}</strong> têm portador
  <strong>FELIPE V ANDRADE</strong> — R$ ${brl(D.cartao.por_portador['FELIPE V ANDRADE'])}. As únicas linhas com outro
  portador são anuidade e seguro (R$ ${brl(D.cartao.por_portador['CONTA'] ?? 0)}). Os cartões são titulados à
  <em>BULA ASSESSORIA PECUARIA LTDA</em>, mas o portador é sempre ele — e o extrato do Sicoob traz literalmente o
  cabeçalho <strong>“GASTOS DE FELIPE V ANDRADE”</strong>.</p>

  <table>
    <thead><tr><th class="ctr">Comp.</th><th>Cartão</th><th class="num">Fatura</th><th class="ctr">Venc.</th>
      <th>Status</th><th class="num">Próxima fatura</th></tr></thead>
    <tbody>
      ${[...fatJul, ...fatAgo].map(f => `<tr${f.competencia === '2026-08' ? ' class="destaque"' : ''}>
        <td class="ctr">${esc(f.mes.slice(0, 3))}</td><td>${esc(f.bandeira)} ${esc(f.final)}</td>
        <td class="num">${brl(f.total)}</td><td class="ctr">${dm(f.vencimento)}</td>
        <td>paga em ${dm(f.pagamento)}</td><td class="num">${f.proxima ? brl(f.proxima) : '—'}</td></tr>`).join('')}
      <tr class="total"><td colspan="2">A fatura que vence em <strong>22/09</strong></td><td class="num"></td>
        <td class="ctr"></td><td class="small">leitura do Sicoob IB em 26/08</td>
        <td class="num">${brl(D.cartao.fatura_conhecida)}</td></tr>
    </tbody>
  </table>
  <p class="small">⚠ O ERP carrega a previsão de setembro em <strong>R$ ${brl(D.cartao.previsao_erp)}</strong>
  (<em>origem = estimativa</em>, repetindo o valor de agosto). O número acima é melhor: veio do extrato detalhado lido no
  Internet Banking em 26/08, que mostrava “próxima fatura” de R$ ${brl(fatAgo.find(f => f.bandeira === 'Mastercard')?.proxima)} e
  R$ ${brl(fatAgo.find(f => f.bandeira === 'Visa')?.proxima)}. <strong>Ainda pode subir</strong> — a fatura só fechou em 12/09.</p>

  <h3>As quatro leituras do saldo</h3>
  <table class="tight">
    <thead><tr><th>Comissão reconhecida</th><th class="num">Fatura conhecida (${brl(D.cartao.fatura_conhecida)})</th>
      <th class="num">Previsão do ERP (${brl(D.cartao.previsao_erp)})</th></tr></thead>
    <tbody>
      <tr class="destaque"><td>Com o lote 11 — R$ ${brl(D.comissao.devida)}</td>
        <td class="num"><strong>${sinal(D.saldo.com_lote11_fatura_real)}</strong></td>
        <td class="num">${sinal(D.saldo.com_lote11_previsao_erp)}</td></tr>
      <tr><td>Sem o lote 11 — R$ ${brl(D.comissao.firme)}</td>
        <td class="num">${sinal(D.saldo.sem_lote11_fatura_real)}</td>
        <td class="num">${sinal(D.saldo.sem_lote11_previsao_erp)}</td></tr>
    </tbody>
  </table>
  <p><strong>Nas quatro leituras o saldo é negativo para ele.</strong> A conclusão não depende de qual decisão se tome no
  lote 11 nem de qual valor de fatura se use: <strong>não há PIX a fazer para o Bulinha no ciclo de 25/09</strong>.
  O que existe é uma fatura maior que a comissão, entre R$ ${brl(Math.abs(D.saldo.com_lote11_fatura_real))} e
  R$ ${brl(Math.abs(D.saldo.sem_lote11_previsao_erp))} a favor da Bula.</p>

  <h3>⭐ O número grande dessa relação não é a comissão — é a Bula Remates</h3>
  <p>A Bula Remates deve <strong>R$ ${brl(D.remates.total_aberto)}</strong> à Bula Assessoria. É
  <strong>${(D.remates.total_aberto / D.comissao.devida).toFixed(0)}×</strong> a comissão de agosto dele.</p>
  <table>
    <thead><tr><th>Título</th><th class="ctr">Venc.</th><th class="num">Valor</th><th class="num">Recebido</th>
      <th class="num">Em aberto</th><th>Status</th></tr></thead>
    <tbody>
      ${D.remates.aberto.map(c => `<tr><td>${esc(corta(c.descricao, 46))}</td><td class="ctr">${dm(c.vencimento)}</td>
        <td class="num">${brl(c.valor)}</td><td class="num">${brl(c.recebido)}</td>
        <td class="num"><strong>${brl(c.restante)}</strong></td>
        <td><span class="tag ${c.status === 'vencido' ? 'n' : ''}">${esc(c.status)}</span></td></tr>`).join('')}
      <tr class="total"><td colspan="4">Total em aberto</td><td class="num">${brl(D.remates.total_aberto)}</td><td></td></tr>
    </tbody>
  </table>

  <div class="box dark">
    <div class="t">A divergência de R$ ${brl0(sgDiferenca)} no São Geraldo</div>
    <p>O CR aberto do <strong>Leilão Touros Fazenda São Geraldo (01/08)</strong> está em
    <strong>R$ ${brl(crSG?.restante ?? 0)}</strong> — que é <strong>1% de R$ ${brl0(SG_PLANILHA.base)}</strong>, o critério
    da planilha FINANCEIRO BULA 2026.</p>
    <p style="margin-bottom:0">Mas em <strong>31/08</strong> o próprio Bulinha disse no grupo que o São Geraldo é
    <strong>0,5% de R$ ${brl0(SG_BULINHA.base)} = R$ ${brl(SG_BULINHA.valor)}</strong> — “só me mandar a NF”. São
    <strong>R$ ${brl(sgDiferenca)} de diferença</strong>, com vencimento em <strong>${dma(crSG?.vencimento)}</strong>, e é
    de longe o maior número em jogo entre a Bula e a Remates. <strong>Decidir isso vale ${(sgDiferenca / D.comissao.devida).toFixed(0)}×
    mais que decidir o lote 11.</strong></p>
  </div>

  <h3>O dinheiro que passou entre as duas pontas em agosto</h3>
  <table class="tight">
    <thead><tr><th class="ctr">Data</th><th class="ctr">Sentido</th><th class="num">Valor</th><th>Histórico do extrato</th></tr></thead>
    <tbody>
      ${mvAgo.map(m => `<tr><td class="ctr">${dm(m.data)}</td>
        <td class="ctr"><span class="tag ${m.tipo === 'saida' ? '' : 'ok'}">${m.tipo === 'saida' ? 'saiu' : 'entrou'}</span></td>
        <td class="num">${brl(m.valor)}</td><td class="small">${esc(corta(m.descricao, 66))}</td></tr>`).join('')}
    </tbody>
  </table>
  <p class="small">Os R$ 19.810,50 de <strong>20/08</strong> (“ACERTO BULA ASSESSORIA”) já entraram — a dívida da Remates
  que constava nesse valor <strong>está paga</strong>; o que resta em aberto são os dois títulos da tabela acima.
  E <strong>não houve nenhum PIX para o Felipe em agosto</strong>: os últimos foram os de 13 e 17/07.</p>
  ${foot('Página 4 de 5')}
</section>

<!-- ══════════════════ 5. DECISÕES E MÉTODO ══════════════════ -->
<section class="page">
  <div class="head"><h2>Decisões e método</h2><div class="n">05 · Fechamento</div></div>

  <h3>O que precisa de decisão sua</h3>
  <table>
    <thead><tr><th class="ctr">#</th><th>Decisão</th><th class="num">Vale</th><th>Recomendação</th></tr></thead>
    <tbody>
      <tr class="destaque"><td class="ctr">1</td>
        <td><strong>São Geraldo (01/08): 1% ou 0,5%?</strong><br>
        <span class="small">CR de ${brl(crSG?.restante ?? 0)} (planilha, 1%) × ${brl(SG_BULINHA.valor)} (ele, 0,5%)</span></td>
        <td class="num"><strong>${brl(sgDiferenca)}</strong></td>
        <td class="small">Vence em ${dma(crSG?.vencimento)}. É o maior número da relação — fechar antes de emitir a NF.</td></tr>
      <tr><td class="ctr">2</td>
        <td><strong>Neloraço PO (25/07)</strong><br><span class="small">recebido ${brl(crVencida?.recebido ?? 0)} de ${brl(crVencida?.valor ?? 0)}</span></td>
        <td class="num">${brl(crVencida?.restante ?? 0)}</td>
        <td class="small">Vencido desde ${dma(crVencida?.vencimento)}. Cobrar ou fechar por encontro de contas.</td></tr>
      <tr><td class="ctr">3</td>
        <td><strong>Lote 11 do Naviraí Essência: Bulinha ou Peralta?</strong></td>
        <td class="num">${brl(D.comissao.disputa)}</td>
        <td class="small">O HastaPro e o precedente do lote 21 apontam para o Bulinha; o Peralta pediu esse lote em 01/09.</td></tr>
      <tr><td class="ctr">4</td>
        <td><strong>A regra de 05/08 (“PO na Remates = 1% para todos”) alcança ele?</strong></td>
        <td class="num">${brl(D.comissao.se_fosse_1pct_remates)}</td>
        <td class="small">Hoje não está aplicada a ninguém da pista da Remates. Se passar a valer, muda Peralta, Lucas e Laila também.</td></tr>
      <tr><td class="ctr">5</td>
        <td><strong>Lançar a comissão de agosto como título</strong></td>
        <td class="num">${brl(D.comissao.devida)}</td>
        <td class="small">Reconhecida no fechamento e sem CP. Entra no ciclo de 25/09 e casa contra a fatura de 22/09.</td></tr>
    </tbody>
  </table>

  <div class="box gold">
    <div class="t">O caminho mais limpo</div>
    <p style="margin-bottom:0">Fechar tudo por <strong>encontro de contas</strong>, como já se fez em julho e em 24/08:
    a comissão de agosto (R$ ${brl(D.comissao.devida)}) abate a fatura de 22/09 (R$ ${brl(D.cartao.fatura_conhecida)}),
    sobra R$ ${brl(Math.abs(D.saldo.com_lote11_fatura_real))} contra ele, e esse resíduo entra no acerto do São Geraldo —
    onde a Remates ainda deve entre R$ ${brl0(SG_BULINHA.valor)} e R$ ${brl0(crSG?.restante ?? 0)}. <strong>Um único
    lançamento resolve as duas pontas e nenhum PIX precisa sair.</strong></p>
  </div>

  <h3>Como este relatório foi apurado</h3>
  <ul>
    <li><strong>HastaPro</strong> (Firebird, somente leitura): <em>LOTES</em> × <em>LEILAO</em> pelo <em>LOT_PISTEIRO</em>,
    nos dois códigos do Bulinha — ${D.pessoa.codigos_hastapro.map(c => `<em>${esc(c)}</em>`).join(' e ')}. Filtrar por
    “%FELIPE%” <strong>não serve</strong>: existem 8 Felipes em <em>PRESTADORES</em>, incluindo o Peralta
    (<em>Luiz Felipe Peralta Garcez</em>) e um <em>Felipe Gonçalves Santos</em> que também tem lote em agosto.</li>
    <li><strong>VGV = <em>LOT_TOTAL</em></strong>, que o HastaPro nunca recalcula. O multiplicador da tabela é derivado
    dele, não de <em>CON_PARCELAS</em> — em agosto os dois divergiram em vários lotes, e quem manda é o total.</li>
    <li><strong>Comissão</strong>: <em>ASSESSORIA</em> com <em>TIPO='VENDA'</em> dá o percentual gravado no lote;
    <em>bula_leilao_fechamento.por_assessor</em> dá o que o ERP reconheceu. Onde os dois divergem, os dois aparecem.</li>
    <li><strong>ERP</strong>: <em>erp_contas_pagar</em>, <em>erp_contas_receber</em>, <em>erp_cartao_faturas</em>,
    <em>erp_cartao_lancamentos</em> e <em>erp_movimentos_bancarios</em>.</li>
    <li><strong>Cartão</strong>: a fatura de 22/09 vem do campo “próxima fatura” lido no Sicoob Internet Banking em
    26/08 — dado, não estimativa. A previsão do ERP para a mesma data é <em>origem = estimativa</em>.</li>
    <li>Reprodução: <code>node scripts/gera-vendas-comissoes-bulinha-agosto-2026.mjs</code> e
    <code>node scripts/render-vendas-comissoes-bulinha-agosto-2026.mjs</code>.</li>
  </ul>

  <h3>O que este relatório não afirma</h3>
  <ul>
    <li>Não trata a FIL '01' como venda perdida: <strong>ela é receita da Bula Remates</strong>, empresa dele. O relatório
    só diz que ela não gera comissão <em>da Bula Assessoria</em>.</li>
    <li>Não decide o lote 11 nem o percentual do São Geraldo — mostra as duas leituras e o que cada uma custa.</li>
    <li>Não considera gasto de cartão feito entre 13/08 e 12/09 além do que o Sicoob já mostrava em 26/08.
    <strong>A fatura de 22/09 pode vir maior</strong>, e nesse caso o saldo contra ele aumenta.</li>
  </ul>
  ${foot('Página 5 de 5')}
</section>
</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)

const destino = path.join(os.homedir(), 'Desktop', 'Bula - Vendas e Comissoes do Bulinha - Agosto 2026.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: destino, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
await browser.close()
console.log('HTML →', path.join(OUT, 'relatorio.html'))
console.log('PDF  →', destino)
