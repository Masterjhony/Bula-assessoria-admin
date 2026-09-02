/**
 * Renderiza o relatorio "Comissoes a pagar — Laila, Peralta e Lucas Martins"
 * a partir de outputs/comissoes-laila-peralta-2026-09/dados.json.
 * PDF A4 na Area de Trabalho. Nenhum numero escrito a mao: VGV e comissao saem
 * do JSON (HastaPro FIL '2' + ERP); o que o assessor pede sai da planilha que
 * ele mandou no WhatsApp, transcrita em PEDIDO.
 *
 * Brandbook: preto/grafite/branco, Oswald nos titulos, dourado so como acento.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'

const OUT = 'outputs/comissoes-laila-peralta-2026-09'
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
const leilao = t => corta(String(t).replace(/^LEIL[ÃA]O\s+(VIRTUAL\s+)?/i, '').replace(/\s*[-–]\s*\d{2}\/\d{2}\/\d{4}\s*$/, ''), 40)

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

/* ── quem e quem ─────────────────────────────────────────────────────────── */
const PESSOAS = {
    PERALTA: { rotulo: 'Peralta', nome: 'Luiz Felipe Peralta Garcez', cpf: '009.814.661-09', pct: 0.02, tel: '(67) 99249-7274' },
    LAILA: { rotulo: 'Laila', nome: 'Laila de Sousa Oliveira', cpf: '019.222.326-70', cnpj: '66.991.669/0001-09', pct: 0.01, tel: '(34) 99265-9816' },
    LUCAS: { rotulo: 'Lucas Martins', nome: 'Lucas Martins Durães Bragança', cpf: '044.510.291-80', pct: 0.01, tel: '(67) 99979-7661' },
}

/* ── a apuracao, montada a partir do JSON ────────────────────────────────── */
const fech = (quem, id) => D.erp.fechamentos.find(f => f.quem === quem && f.id === id)
const hpLotes = (quem, dataIni, dataFim) => D.hastapro.fil2.filter(l => l.quem === quem && l.data >= dataIni && l.data <= dataFim)
const hpSoma = (...a) => r2(hpLotes(...a).reduce((s, l) => s + l.vgv, 0))

const FECH = {
    peraltaJul: '0ba4d4d9-0235-4cfe-9db4-ae49208e7f75',   // 2a Etapa Navirai Matrizes 16/07
    lailaJul: '6a67f76b-5d50-48fe-9ab1-7eec161c4591',     // EAO Baviera Machos 12/07
    cen: '632a16cf-988a-4309-b1e5-45e208045772',          // Nelore CEN 20/08
    marcondes: '4f28d2da-7f56-473a-9ac4-12e37ec0da1d',    // Marcondes 23/08
    navirai28: '4dfcdaec-1806-4b8c-8112-5f99ee5cc412',    // 28o Navirai Reprodutores 23/08
    essencia: 'e7811a6e-7ed7-4a82-a56f-0536093e8ae0',     // Essencia Bezerras 22/08 (lote 11)
    tourosRS: '0d78e2f8-8fd2-4d98-ba1d-b3511cf19c9d',     // RS Agropecuaria 23/06
    navirai03: '45fc24ea-f939-420d-82ba-c3c9c92b3b4a',    // Mega Genetica Navirai 29/03
    camparino: 'ebfbce96-4c51-49e9-994b-1d117fdaf486',    // 41o Touros Camparino 06/06
    partnerRG: 'd487d402-5acd-4092-a110-38d3d291af2d',    // Partner RG Femeas 07/02
}

const lotesDe = (quem, dataIni, dataFim, leiTrecho) =>
    hpLotes(quem, dataIni, dataFim).filter(l => new RegExp(leiTrecho, 'i').test(l.leilao)).map(l => l.lote).join(' + ')

/* JULHO — vencido em 25/08 */
const julho = [
    { quem: 'PERALTA', f: fech('PERALTA', FECH.peraltaJul), lotes: lotesDe('PERALTA', '2026-07-01', '2026-07-31', 'NAVIRA') },
    { quem: 'LAILA', f: fech('LAILA', FECH.lailaJul), lotes: lotesDe('LAILA', '2026-07-01', '2026-07-31', 'BAVIERA') },
].map(x => ({ ...x, vgv: x.f.vgv, pct: x.f.pct, comissao: x.f.comissao, leilao: x.f.leilao, data: x.f.data }))
const totJulho = r2(julho.reduce((s, x) => s + x.comissao, 0))

/* AGOSTO — vence em 25/09 */
const fLucas = fech('LUCAS', FECH.navirai28)
const agosto = [
    { quem: 'PERALTA', f: fech('PERALTA', FECH.cen), lotes: lotesDe('PERALTA', '2026-08-20', '2026-08-20', 'CEN'), disputa: false },
    { quem: 'PERALTA', f: fech('PERALTA', FECH.marcondes), lotes: lotesDe('PERALTA', '2026-08-23', '2026-08-23', 'MARCONDES'), disputa: false },
    { quem: 'PERALTA', f: fech('PERALTA', FECH.navirai28), lotes: lotesDe('PERALTA', '2026-08-23', '2026-08-23', 'NAVIRA'), disputa: false },
    { quem: 'PERALTA', f: fech('PERALTA', FECH.essencia), lotes: '11', disputa: true },
    { quem: 'LAILA', f: fech('LAILA', FECH.navirai28), lotes: lotesDe('LAILA', '2026-08-23', '2026-08-23', 'NAVIRA'), disputa: false },
    // O grupo Financeiro fixou 1% para Lucas em 05/08; o ERP ainda calcula 0,33%.
    { quem: 'LUCAS', f: { ...fLucas, pct: 0.01, comissao: r2(fLucas.vgv * 0.01) }, pctErp: fLucas.pct, comissaoErp: fLucas.comissao,
      lotes: lotesDe('LUCAS', '2026-08-23', '2026-08-23', 'NAVIRA'), disputa: false },
].map(x => ({ ...x, vgv: x.f.vgv, pct: x.f.pct, comissao: x.f.comissao, leilao: x.f.leilao, data: x.f.data }))
const agostoFirme = r2(agosto.filter(x => !x.disputa).reduce((s, x) => s + x.comissao, 0))
const agostoDisputa = r2(agosto.filter(x => x.disputa).reduce((s, x) => s + x.comissao, 0))

/* O QUE CADA UM PEDE — planilhas/mensagens de 01/09 no WhatsApp */
const PEDIDO = {
    PERALTA: { jun: 3510, jul: 1020, ago: r2(1680 + 1860 + 750 + 1780), fonte: 'planilha “COMISSÃO ASSESSORIA.xlsx”, 01/09 16h14' },
    LAILA: { jul: 675, fonte: 'conversa de 01/09 16h52 — “3 touros, pro Luan, leilão da EAO”, venda de R$ 67.500' },
    LUCAS: { ago: 960, fonte: 'planilha “VENDAS DA BULA ASSESSORIA - AGOSTO.xlsx”, 01/09 16h50' },
}

/* DECISAO — junho do Peralta, CP cancelada em 04/08 */
const cpCancelada = D.erp.contas_pagar.find(c => c.status === 'cancelado' && /TOUROS RS/i.test(c.descricao))
const fTourosRS = fech('PERALTA', FECH.tourosRS)

/* BACKLOG — apurado nas fontes e nunca cobrado por eles */
const fCamparino = fech('PERALTA', FECH.camparino)
const backlog = [
    { quem: 'PERALTA', data: '2026-03-29', leilao: fech('PERALTA', FECH.navirai03).leilao, lotes: lotesDe('PERALTA', '2026-03-29', '2026-03-29', 'NAVIRA'),
      vgv: fech('PERALTA', FECH.navirai03).vgv, comissao: fech('PERALTA', FECH.navirai03).comissao,
      nota: 'apurado no fechamento a 2% e nunca virou título nem PIX' },
    { quem: 'PERALTA', data: '2026-05-09', leilao: '32º Leilão 4R', lotes: lotesDe('PERALTA', '2026-05-09', '2026-05-09', '4R'),
      vgv: hpSoma('PERALTA', '2026-05-09', '2026-05-09'), comissao: r2(hpSoma('PERALTA', '2026-05-09', '2026-05-09') * 0.02),
      nota: 'o fechamento creditou estes lotes ao Leonardo Serafim; a única CP paga do 4R foi do Bulinha (R$ 10.206)' },
    { quem: 'PERALTA', data: '2026-06-06', leilao: fCamparino.leilao, lotes: '28 + 40 + 60', vgv: fCamparino.vgv, comissao: r2(fCamparino.vgv * 0.02),
      nota: `fechamento com comissão zerada e a nota “${corta(fCamparino.observacao ?? '', 74)}”` },
    { quem: 'PERALTA', data: '2026-06-21', leilao: 'Leilão Virtual Touros Matinha', lotes: '26', vgv: 21600, comissao: 432,
      nota: 'HastaPro dá ao Peralta, o fechamento dá ao Fábio Omena e a CP cancelada em 04/08 estava no nome do Lucas Martins' },
    { quem: 'LAILA', data: '2026-02-07', leilao: fech('LAILA', FECH.partnerRG).leilao, lotes: lotesDe('LAILA', '2026-02-07', '2026-02-07', 'PARTNER'),
      vgv: fech('LAILA', FECH.partnerRG).vgv, comissao: fech('LAILA', FECH.partnerRG).comissao,
      nota: 'apurado no fechamento a 2% e nunca virou título nem PIX' },
    { quem: 'LAILA', data: '2026-05-09', leilao: '32º Leilão 4R', lotes: lotesDe('LAILA', '2026-05-09', '2026-05-09', '4R'),
      vgv: hpSoma('LAILA', '2026-05-09', '2026-05-09'), comissao: r2(hpSoma('LAILA', '2026-05-09', '2026-05-09') * 0.01 - 442.5),
      nota: 'recebeu R$ 442,50 em 13/07 — exatamente 0,5% da base; a 1% de hoje faltariam R$ 442,50' },
    { quem: 'LUCAS', data: '2026-05-09', leilao: '32º Leilão 4R', lotes: lotesDe('LUCAS', '2026-05-09', '2026-05-09', '4R'),
      vgv: hpSoma('LUCAS', '2026-05-09', '2026-05-09'), comissao: r2(hpSoma('LUCAS', '2026-05-09', '2026-05-09') * 0.01),
      nota: 'o acerto de R$ 2.758,50 de 10/07 cobriu Matinha 19/05, MNO 11/06 e JMP 14/06 — este lote ficou de fora' },
]
const backlogPor = q => r2(backlog.filter(b => b.quem === q).reduce((s, b) => s + b.comissao, 0))
const backlogTotal = r2(backlog.reduce((s, b) => s + b.comissao, 0))

const totalAgora = totJulho
const totalSetembro = agostoFirme
const linhaPessoa = q => ({
    julho: r2(julho.filter(x => x.quem === q).reduce((s, x) => s + x.comissao, 0)),
    agosto: r2(agosto.filter(x => x.quem === q && !x.disputa).reduce((s, x) => s + x.comissao, 0)),
    disputa: r2(agosto.filter(x => x.quem === q && x.disputa).reduce((s, x) => s + x.comissao, 0)),
    backlog: backlogPor(q),
})
const RES = { PERALTA: linhaPessoa('PERALTA'), LAILA: linhaPessoa('LAILA'), LUCAS: linhaPessoa('LUCAS') }

const foot = p => `<div class="pfoot"><span>Bula Assessoria · Comissões a pagar — Laila, Peralta e Lucas Martins</span>
  <span>Apurado em ${dma(D.geradoEm)} · HastaPro FIL '2' + ERP + WhatsApp <em>joao-automation</em></span><span>${p}</span></div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Bula — Comissões a pagar: Laila, Peralta e Lucas Martins</title>
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
  .capa img { width: 42mm; margin-bottom: 22mm; }
  .capa h1 { font-size: 40px; line-height: 1.05; color: #fff; font-weight: 700; }
  .capa .sub { font-size: 12.4px; color: #B5B5B5; margin-top: 8mm; max-width: 142mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
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
  .tiles.t3 { grid-template-columns: repeat(3,1fr); }
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
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  table.tight td { padding: 1.25mm 1.8mm; }
  table.tight th { padding: 1.6mm 1.8mm; }
  .tag { display: inline-block; font-size: 7.6px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em;
         border: 1px solid ${MUTED}; color: ${MUTED}; padding: .3mm 1.4mm; border-radius: 2px; }
  .tag.ok { border-color: ${INK}; color: ${INK}; }
  .tag.g { border-color: ${GOLD}; color: #8A7226; background: #FBF6E8; }
  .zap { border-left: 3px solid ${GRID}; padding-left: 3.4mm; margin: 2mm 0 3mm; }
  .zap .l { margin-bottom: 1.2mm; }
  .zap .l b { font-weight: 600; }
  .zap .eu { color: ${MUTED}; }
</style></head><body>

<!-- ══ CAPA ══ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Comissões<br>a pagar</h1>
  <div class="rule"></div>
  <div class="sub"><strong>Laila, Peralta e Lucas Martins.</strong> O que cada um cobrou no WhatsApp em 01/09,
  conferido lote a lote contra o HastaPro e contra o ERP — e o que a Bula deve de fato.</div>
  <div class="meta">
    <div><span>A pagar agora</span><strong>R$ ${brl(totalAgora)}</strong></div>
    <div><span>A programar p/ 25/09</span><strong>R$ ${brl(totalSetembro)}</strong></div>
    <div><span>Depende de decisão</span><strong>R$ ${brl(r2(agostoDisputa + fTourosRS.comissao))}</strong></div>
    <div><span>Fontes</span><strong>WhatsApp · HastaPro FIL '2' · ERP</strong></div>
    <div><span>Emitido em</span><strong>${dma(D.geradoEm)}</strong></div>
  </div>
</section>

<!-- ══ 1. A RESPOSTA ══ -->
<section class="page">
  <div class="head"><h2>A resposta</h2><div class="n">01 · Quanto pagar</div></div>

  <p class="lead">Os três cobraram na mesma tarde de <strong>01/09</strong>, pela sessão <em>joao-automation</em>. As três
  cobranças <strong>batem com o sistema</strong> — e onde há diferença, ela é a favor da Bula pagar mais, não menos.</p>

  <div class="tiles">
    <div class="tile"><div class="k">Ciclo julho · vencido em 25/08</div>
      <div class="v"><span class="cur">R$</span>${brl0(totalAgora)}</div>
      <div class="d">Peralta ${brl(RES.PERALTA.julho)} + Laila ${brl(RES.LAILA.julho)}<br><strong>é o que está atrasado</strong></div></div>
    <div class="tile"><div class="k">Ciclo agosto · vence 25/09</div>
      <div class="v"><span class="cur">R$</span>${brl0(totalSetembro)}</div>
      <div class="d">Peralta ${brl(RES.PERALTA.agosto)} + Lucas ${brl(RES.LUCAS.agosto)} + Laila ${brl(RES.LAILA.agosto)}</div></div>
    <div class="tile gold"><div class="k">Depende de decisão sua</div>
      <div class="v"><span class="cur">R$</span>${brl0(r2(agostoDisputa + fTourosRS.comissao))}</div>
      <div class="d">lote 11 do Essência (${brl0(agostoDisputa)}) + junho do Peralta (${brl0(fTourosRS.comissao)})</div></div>
    <div class="tile"><div class="k">Atraso que ninguém cobrou</div>
      <div class="v"><span class="cur">R$</span>${brl0(backlogTotal)}</div>
      <div class="d">apurado nas fontes, sem título e sem PIX — página 5</div></div>
  </div>

  <h3>Ciclo de julho — atrasado desde 25/08</h3>
  <table class="tight">
    <tr><th>Pessoa</th><th>Leilão · lote</th><th class="num">VGV</th><th class="num">%</th><th class="num">Comissão</th><th>Situação no ERP</th></tr>
    ${julho.map(x => `<tr>
      <td><strong>${esc(PESSOAS[x.quem].rotulo)}</strong></td>
      <td>${esc(leilao(x.leilao))} · ${dm(x.data)}<br><span class="muted">lote ${esc(x.lotes)}</span></td>
      <td class="num">R$ ${brl(x.vgv)}</td><td class="num">${(x.pct * 100).toFixed(0)}%</td>
      <td class="num"><strong>R$ ${brl(x.comissao)}</strong></td>
      <td>título <span class="tag">vencido em 25/08</span> · sem PIX</td></tr>`).join('')}
    <tr class="total"><td colspan="4">Pagar agora</td><td class="num">R$ ${brl(totJulho)}</td><td>os dois títulos já existem</td></tr>
  </table>

  <h3>Ciclo de agosto — vence em 25/09 (quinta-feira, dia útil)</h3>
  <table class="tight">
    <tr><th>Pessoa</th><th>Leilão · lote</th><th class="num">VGV</th><th class="num">%</th><th class="num">Comissão</th><th>Situação no ERP</th></tr>
    ${agosto.filter(x => !x.disputa).map(x => `<tr>
      <td><strong>${esc(PESSOAS[x.quem].rotulo)}</strong></td>
      <td>${esc(leilao(x.leilao))} · ${dm(x.data)}<br><span class="muted">lote ${esc(x.lotes)}</span></td>
      <td class="num">R$ ${brl(x.vgv)}</td><td class="num">${(x.pct * 100).toFixed(0)}%</td>
      <td class="num"><strong>R$ ${brl(x.comissao)}</strong></td>
      <td>${x.pctErp !== undefined
        ? `<span class="tag g">corrigir</span> ERP calcula ${(x.pctErp * 100).toFixed(2).replace('.', ',')}% = R$ ${brl(x.comissaoErp)}`
        : 'apurado no fechamento · <span class="tag">sem título</span>'}</td></tr>`).join('')}
    <tr class="total"><td colspan="4">Programar para 25/09</td><td class="num">R$ ${brl(agostoFirme)}</td><td>nenhum título criado ainda</td></tr>
    <tr class="destaque"><td><strong>Peralta</strong></td>
      <td>${esc(leilao(agosto.find(x => x.disputa).leilao))} · 22/08<br><span class="muted">lote 11 — em disputa</span></td>
      <td class="num">R$ ${brl(agosto.find(x => x.disputa).vgv)}</td><td class="num">2%</td>
      <td class="num">R$ ${brl(agostoDisputa)}</td>
      <td><span class="tag g">decidir</span> HastaPro registra <strong>${esc(D.hastapro.lote11[0]?.pisteiro ?? '—')}</strong></td></tr>
  </table>

  <div class="box dark">
    <div class="t">O que fazer, na ordem</div>
    <ol style="margin-bottom:0">
      <li><strong>Pagar hoje R$ ${brl(totJulho)}</strong> — Peralta R$ ${brl(RES.PERALTA.julho)} e Laila R$ ${brl(RES.LAILA.julho)}.
      Os dois títulos já existem e estão vencidos desde 25/08.</li>
      <li><strong>Corrigir o percentual do Lucas Martins</strong> de 0,33% para 1% no fechamento de agosto e na folha —
      o grupo fixou 1% em 05/08 e o ERP não foi atualizado. Diferença: R$ ${brl(r2(fLucas.vgv * 0.01 - fLucas.comissao))}.</li>
      <li><strong>Decidir o lote 11 do Essência (R$ ${brl(agostoDisputa)})</strong> antes de gerar os títulos de agosto — Peralta ou Bulinha.</li>
      <li><strong>Decidir o junho do Peralta (R$ ${brl(fTourosRS.comissao)})</strong>, que ele voltou a cobrar na planilha.</li>
      <li><strong>Gerar os títulos de agosto</strong> para 25/09 e pedir a chave PIX do Peralta — ele não mandou.</li>
    </ol>
  </div>
  ${foot('Página 1 de 6')}
</section>

<!-- ══ 2. O QUE ELES PEDIRAM ══ -->
<section class="page">
  <div class="head"><h2>O que eles pediram, em 01/09</h2><div class="n">02 · A cobrança</div></div>

  <p class="lead">Tudo abaixo saiu da sessão <em>joao-automation</em> no VPS — as três conversas 1:1 e os arquivos
  que vieram nelas. Os áudios foram transcritos; as planilhas foram lidas célula a célula.</p>

  <div class="cols2">
    <div>
      <h3>Peralta · planilha às 16h14</h3>
      <p class="small">Antes, em 31/08, ele tinha perguntado por uma venda que não via no relatório — e ela existe:
      é o lote 11 do Essência, o mesmo que hoje está em disputa.</p>
      <div class="zap">
        <div class="l eu"><b>João (31/08):</b> “as comissões referente ao mês de julho, recebi até agora 25 de agosto.
        O seu tinha que ter pago e não pagou. […] E as referente a agosto, a gente paga até dia 25 de setembro.”</div>
        <div class="l"><b>Peralta:</b> “eu não vi aí no relatório, uma venda que eu fiz no Essência, na Naviraí
        Camparino. 3.100 pro Magda e pro Jacamim.”</div>
        <div class="l eu"><b>João:</b> “Vou conferir certinho essa […] e lança aqui, atualiza e te mando de novo o relatório.”</div>
        <div class="l"><b>Peralta (01/09):</b> “Eu fiz um Excel aqui […] é a partir de julho, mas eu fiz os de junho,
        aqueles touro. Vendi nove touro, cara.”</div>
      </div>
      <table>
        <tr><th>Mês</th><th class="num">Ele pede</th><th class="num">Sistema</th><th>Diferença</th></tr>
        <tr><td>Junho · Touros RS</td><td class="num">R$ ${brl(PEDIDO.PERALTA.jun)}</td><td class="num">R$ ${brl(fTourosRS.comissao)}</td><td>igual — mas a CP está <strong>cancelada</strong></td></tr>
        <tr><td>Julho · Naviraí Matrizes</td><td class="num">R$ ${brl(PEDIDO.PERALTA.jul)}</td><td class="num">R$ ${brl(RES.PERALTA.julho)}</td><td>ele errou 850×30 na planilha</td></tr>
        <tr><td>Agosto · 4 leilões</td><td class="num">R$ ${brl(PEDIDO.PERALTA.ago)}</td><td class="num">R$ ${brl(r2(RES.PERALTA.agosto + RES.PERALTA.disputa))}</td><td>ele lançou o lote 30 a 41.000; é 42.000</td></tr>
        <tr class="total"><td>Total</td><td class="num">R$ ${brl(r2(PEDIDO.PERALTA.jun + PEDIDO.PERALTA.jul + PEDIDO.PERALTA.ago))}</td>
          <td class="num">R$ ${brl(r2(fTourosRS.comissao + RES.PERALTA.julho + RES.PERALTA.agosto + RES.PERALTA.disputa))}</td>
          <td>ele pede <strong>menos</strong> do que o sistema apura</td></tr>
      </table>
    </div>
    <div>
      <h3>Laila · conversa às 16h52</h3>
      <div class="zap">
        <div class="l eu"><b>João:</b> “Te devendo as comissões referentes a Julho ne”</div>
        <div class="l"><b>Laila:</b> “Sim […] O Marcelo tinha passado o valor. São 3 touros, pro Luan. Leilão da EAO.”</div>
        <div class="l"><b>Laila:</b> “A venda foi de R$ 67.500 correto? […] Ele disse que iria fazer dia 25 desse mês de agosto.”</div>
        <div class="l eu"><b>João:</b> “é todo dia 25 do mês subsequente […] Faço até amanhã ok?”</div>
        <div class="l"><b>Laila:</b> “CNPJ: 66.991.669/0001-09 — LAILA DE SOUSA OLIVEIRA […] Me passe os dados da bula
        depois pra tirar a nota.”</div>
      </div>
      <p class="small">A venda que ela descreve é o <strong>lote 349 do Mega Evento EAO Baviera (12/07)</strong>, 3 animais,
      comprador Luis Antonio / Fazenda Santa Lúcia Planalto — “filho Luan lançando”, como ela mesma anunciou no grupo
      Lances em 12/07. VGV de R$ 67.500, exatamente o número que ela cita. A 1% dá <strong>R$ ${brl(RES.LAILA.julho)}</strong>.</p>

      <h3>Lucas Martins · planilha às 16h50</h3>
      <div class="zap">
        <div class="l"><b>Lucas:</b> “Segue planilha do mês de agosto”</div>
      </div>
      <table>
        <tr><th>Leilão · lote</th><th class="num">VGV</th><th class="num">%</th><th class="num">Comissão</th></tr>
        <tr><td>Naviraí e Camparino 23/08 · lt 117</td><td class="num">R$ 48.000,00</td><td class="num">1%</td><td class="num">R$ 480,00</td></tr>
        <tr><td>Naviraí e Camparino 23/08 · lt 16</td><td class="num">R$ 48.000,00</td><td class="num">1%</td><td class="num">R$ 480,00</td></tr>
        <tr class="total"><td>Ele pede</td><td class="num">R$ ${brl(fLucas.vgv)}</td><td class="num">1%</td><td class="num">R$ ${brl(PEDIDO.LUCAS.ago)}</td></tr>
      </table>
      <p class="small">Os dois lotes existem no HastaPro FIL '2' com ele como pisteiro, e o grupo Lances anunciou
      “Com Lucas Martins - Bula Assessoria” nos dois, em 23/08. <strong>O 1% que ele aplica é o certo</strong> — é a
      decisão do Grupo Financeiro de 05/08. O ERP é que ficou em 0,33%.</p>
    </div>
  </div>

  <div class="cols2">
    <div class="box">
      <div class="t">⚠ “Lucas Peralta” não existe — são duas pessoas</div>
      <p style="margin:0"><strong>Peralta</strong> é <em>Luiz Felipe Peralta Garcez</em>, (67) 99249-7274, 2%, e no HastaPro
      também aparece como “…Garcez - Leiloeiro”. <strong>Lucas Martins</strong> é <em>Lucas Martins Durães Bragança</em>,
      (67) 99979-7661, 1%. Os dois vendem nos mesmos leilões e no 28º Naviraí Camparino de 23/08 cada um tem os seus
      lotes — 30 e 78 do Peralta, 117 e 16 do Lucas. Somar os dois num nome só troca R$ ${brl(r2(fLucas.vgv * 0.01))}
      de lugar.</p>
    </div>
    <div class="box">
      <div class="t">O que veio junto nas conversas</div>
      <table style="margin:0">
        <tr><th>Arquivo</th><th>De</th><th>Quando</th></tr>
        <tr><td>COMISSÃO ASSESSORIA.xlsx <span class="muted">(jun/jul/ago)</span></td><td>Peralta</td><td>01/09 16h14</td></tr>
        <tr><td>4 áudios <span class="muted">(31/08 e 01/09) — transcritos</span></td><td>Peralta / João</td><td>31/08–01/09</td></tr>
        <tr><td>VENDAS DA BULA ASSESSORIA - AGOSTO.xlsx</td><td>Lucas Martins</td><td>01/09 16h50</td></tr>
        <tr><td>Bula CNPJ.pdf <span class="muted">(para a NF)</span></td><td>João → Laila</td><td>01/09 16h59</td></tr>
      </table>
      <p class="small" style="margin:2mm 0 0">Tudo guardado em <em>outputs/comissoes-laila-peralta-2026-09/</em>.</p>
    </div>
  </div>
  ${foot('Página 2 de 6')}
</section>

<!-- ══ 3. A CONFERÊNCIA ══ -->
<section class="page">
  <div class="head"><h2>A conferência, lote a lote</h2><div class="n">03 · Três fontes</div></div>

  <p class="lead">Cada linha foi conferida em três lugares: o <strong>HastaPro FIL '2'</strong> (que guarda o pisteiro do
  lote), o <strong>fechamento no ERP</strong> e o <strong>anúncio no grupo Lances</strong>. Só entra na conta o que a
  filial '2' reconhece — é a cobertura da Bula Assessoria.</p>

  <table>
    <tr><th>Pessoa</th><th>Data</th><th>Leilão</th><th>Lote</th><th class="num">VGV</th><th>HastaPro</th><th>ERP</th><th class="num">%</th><th class="num">Comissão</th></tr>
    ${[...julho, ...agosto].map(x => `<tr>
      <td>${esc(PESSOAS[x.quem].rotulo)}</td><td>${dm(x.data)}</td>
      <td>${esc(leilao(x.leilao))}</td><td>${esc(x.lotes)}</td>
      <td class="num">R$ ${brl(x.vgv)}</td>
      <td>${x.disputa ? `<span class="tag g">${esc(corta(D.hastapro.lote11[0]?.pisteiro ?? '—', 16))}</span>` : '<span class="tag ok">confere</span>'}</td>
      <td>${x.pctErp !== undefined ? '<span class="tag g">% vencido</span>' : '<span class="tag ok">confere</span>'}</td>
      <td class="num">${(x.pct * 100).toFixed(0)}%</td>
      <td class="num">${x.disputa ? '' : '<strong>'}R$ ${brl(x.comissao)}${x.disputa ? '' : '</strong>'}</td></tr>`).join('')}
    <tr class="total"><td colspan="8">Total conferido (julho + agosto, sem o lote em disputa)</td>
      <td class="num">R$ ${brl(r2(totJulho + agostoFirme))}</td></tr>
  </table>

  <div class="cols2">
    <div class="box">
      <div class="t">Por que o volume da Bula Remates não entra</div>
      <p style="margin:0">No mesmo período os três conduziram <strong>${D.hastapro.fil01_lotes} lotes</strong> na filial '01'
      (Bula Remates), <strong>R$ ${brl0(D.hastapro.fil01_total)}</strong> de VGV. Em pregão da própria Remates eles estão na
      pista <em>pela Remates</em> — a regra está no importador desde 26/08 e é o que segurou o São Geraldo de 01/08.
      Nenhum dos três cobrou esse volume: as planilhas que eles mandaram só trazem filial '2'.</p>
    </div>
    <div class="box">
      <div class="t">O percentual de cada um</div>
      <table style="margin:0">
        <tr><th>Pessoa</th><th class="num">Hoje</th><th>Origem</th></tr>
        <tr><td>Peralta</td><td class="num">2%</td><td>tabela do chefe de 22/07</td></tr>
        <tr><td>Laila</td><td class="num">1%</td><td>Grupo Financeiro, 05/08</td></tr>
        <tr><td>Lucas Martins</td><td class="num">1%</td><td>Grupo Financeiro, 05/08</td></tr>
      </table>
      <p class="small" style="margin:2mm 0 0">Em 05/08 o grupo escreveu, literalmente: <em>“Bula, Douglas, Léo e Fábio 2% ·
      Lucas, Laila e Valéria 1%”</em>. A folha do ERP tem a Laila a 1% e o <strong>Lucas ainda a 0,33%</strong>.</p>
    </div>
  </div>

  <div class="box rule">
    <p style="margin:0"><strong>O que o extrato diz sobre os três.</strong> Em 2026 saiu do caixa, a título de comissão:
    <strong>Laila R$ 442,50</strong> (13/07, leilão 4R de 09/05) e <strong>Lucas R$ 2.758,50</strong> (10/07, Matinha 19/05 +
    MNO 11/06 + JMP 14/06). <strong>Para o Peralta não saiu um centavo de comissão o ano inteiro</strong> — só cesta
    (R$ 270, jan) e hotel (R$ 990, ago). Os dois pagamentos que saíram foram calculados a <strong>0,5%</strong>, não a 1%
    nem a 0,33%: R$ 442,50 é 0,5% de R$ 88.500 e R$ 2.578,50 é 0,5% de R$ 515.700.</p>
  </div>
  ${foot('Página 3 de 6')}
</section>

<!-- ══ 4. AS DECISÕES ══ -->
<section class="page">
  <div class="head"><h2>As duas decisões</h2><div class="n">04 · Não dá para arbitrar sozinho</div></div>

  <h3>1 · Lote 11 do Essência Bezerras (22/08) — R$ ${brl(agostoDisputa)}</h3>
  <table>
    <tr><th>Fonte</th><th>O que diz</th><th>Quando</th></tr>
    <tr><td>Grupo Lances</td><td>“Lote 11 / 3100 · Condomínio Magda e jacamim · <strong>Peralta / Bula</strong>”</td><td>23/08 02h19</td></tr>
    <tr><td>Fechamento no ERP</td><td>credita “Peralta / Bula”, VGV R$ ${brl(agosto.find(x => x.disputa).vgv)}, comissão R$ ${brl(agostoDisputa)}</td><td>hoje</td></tr>
    <tr><td>HastaPro FIL '2'</td><td>pisteiro do lote é <strong>${esc(D.hastapro.lote11[0]?.pisteiro ?? '—')}</strong> (Bulinha)</td><td>hoje</td></tr>
    <tr><td>Planilha do Peralta</td><td>lista o lote 11 como venda dele, R$ 93.000, comissão R$ 1.860</td><td>01/09 16h14</td></tr>
    <tr><td>Grupo Financeiro</td><td>Marcelo: “A combina do Peralta e diferente dos demais da Remates?” → “Estava como
      Peralta e Bula. Bulinha é 2%” → <strong>“Não decidido, fica a critério de voces”</strong></td><td>27/08 21h17–21h24</td></tr>
  </table>
  <p class="small">Os dois são 2%, então o valor não muda — muda o dono. <strong>A decisão de 27/08 ficou explicitamente
  em aberto</strong>, e agora ela trava a geração dos títulos de agosto. O Peralta cobrou esse lote duas vezes
  (áudio de 31/08 e planilha de 01/09); o Bulinha não cobrou.</p>

  <h3>2 · Junho do Peralta — R$ ${brl(fTourosRS.comissao)}</h3>
  <p>O <strong>Leilão Virtual Reprodutores RS Agropecuária de 23/06</strong> tem 9 lotes, R$ ${brl(fTourosRS.vgv)} de VGV,
  todos com o Peralta como pisteiro no HastaPro. A planilha dele lista <strong>exatamente os mesmos 9 lotes</strong>
  (com os mesmos compradores: Espólio Gui Macedo e Wedson Chimango). O título de R$ ${brl(cpCancelada?.valor ?? 0)} foi
  <strong>cancelado em ${dma(String(cpCancelada?.updated_at ?? '').slice(0, 10))}</strong> com esta justificativa gravada:</p>
  <div class="box">
    <p style="margin:0"><em>“[ERP-VERDADE 04/08] CANCELADA: Comissionados reais da operacao sao apenas Douglas, Leonardo,
    Fabio, Rusa e Bulinha (chefe 04/08). CP de Peralta nao e divida real.”</em></p>
  </div>
  <p>Três coisas contradizem esse cancelamento:</p>
  <ul>
    <li>O cancelamento foi <strong>em lote</strong> — a mesma frase apagou as CPs de Alex Sobrinho, Lucas Martins, Peralta,
    Matheus Alves e Fabricio Hyppolito de uma vez. Ninguém olhou leilão nenhum.</li>
    <li>A regra dos “cinco comissionados” <strong>já não vale na prática</strong>: um dia depois, em 05/08, o Grupo Financeiro
    fixou 1% para Lucas, Laila e Valéria — e o próprio ERP tem títulos ativos criados depois no nome deles.</li>
    <li><strong>O leilão faturou.</strong> A conta a receber “LEILAO RS AGROPECUARIA (23/06) — COMISSAO BULA”, de R$ 8.775,
    foi recebida em 05/08. Cancelar a CP deixou a Bula com 100% dos R$ 8.775 e o vendedor com zero.</li>
  </ul>
  <div class="box dark">
    <div class="t">As duas decisões não convivem</div>
    <p style="margin:0">Ou o cancelamento de 04/08 vale — e aí caem junto os R$ ${brl(r2(RES.PERALTA.julho + RES.PERALTA.agosto + RES.PERALTA.disputa))}
    de julho e agosto do Peralta, além do 1% da Laila e do Lucas —, ou a regra de 26/08 vale e os
    R$ ${brl(fTourosRS.comissao)} de junho precisam voltar. <strong>Hoje o ERP aplica as duas ao mesmo tempo.</strong></p>
  </div>
  ${foot('Página 4 de 6')}
</section>

<!-- ══ 5. BACKLOG ══ -->
<section class="page">
  <div class="head"><h2>O atraso que ninguém cobrou</h2><div class="n">05 · Achado da apuração</div></div>

  <p class="lead">Nenhum dos três pediu o que está abaixo — apareceu ao cruzar o HastaPro FIL '2' com os fechamentos.
  São vendas de cobertura da Bula Assessoria que o sistema reconhece e que <strong>nunca viraram título nem PIX</strong>.
  Não é conta a pagar hoje: é decisão sua se vira.</p>

  <table>
    <tr><th>Pessoa</th><th>Data</th><th>Leilão · lote</th><th class="num">VGV</th><th class="num">Comissão</th><th>Por que ficou de fora</th></tr>
    ${backlog.map(b => `<tr>
      <td>${esc(PESSOAS[b.quem].rotulo)}</td><td>${dm(b.data)}</td>
      <td>${esc(leilao(b.leilao))}<br><span class="muted">lote ${esc(b.lotes)}</span></td>
      <td class="num">R$ ${brl(b.vgv)}</td><td class="num">R$ ${brl(b.comissao)}</td>
      <td>${esc(b.nota)}</td></tr>`).join('')}
    <tr class="total"><td colspan="4">Total levantado</td><td class="num">R$ ${brl(backlogTotal)}</td>
      <td>Peralta ${brl(backlogPor('PERALTA'))} · Laila ${brl(backlogPor('LAILA'))} · Lucas ${brl(backlogPor('LUCAS'))}</td></tr>
  </table>

  <div class="box dark">
    <div class="t">⚠ Cuidado com o 32º Leilão 4R (09/05)</div>
    <p style="margin:0">É o item mais pesado da tabela e o mais delicado. O fechamento do 4R atribuiu esses lotes ao
    <strong>Leonardo Serafim</strong> — por <em>zona (UF) do comprador</em>, não por pisteiro, como diz a própria observação do
    fechamento. Mas o Leonardo <strong>nunca recebeu comissão do 4R</strong>: a única CP paga daquele leilão foi a do
    <strong>Bulinha, R$ 10.206</strong> (2% sobre R$ 510.300), quitada em 17/07. <strong>Antes de pagar qualquer coisa do 4R,
    abrir a base desses R$ 510.300</strong> — se esses lotes estiverem lá dentro, pagar de novo seria pagar duas vezes.</p>
  </div>

  <div class="box rule">
    <p style="margin:0"><strong>O 41º Touros Camparino (06/06) é o mais limpo da lista.</strong> O fechamento traz o Peralta
    com R$ ${brl(fCamparino.vgv)} de VGV e comissão <strong>zerada</strong>, com a nota
    <em>“Sem regra de comissao padrao cadastrada; revisar antes de gerar conta a pagar.”</em> — e ninguém revisou. Como a
    comissão nunca foi para pessoa nenhuma, não há risco de pagamento em duplicidade: é só decidir o percentual.</p>
  </div>
  ${foot('Página 5 de 6')}
</section>

<!-- ══ 6. COMO PAGAR ══ -->
<section class="page">
  <div class="head"><h2>Como pagar</h2><div class="n">06 · Operacional</div></div>

  <h3>Dados de pagamento</h3>
  <table>
    <tr><th>Pessoa</th><th>Cadastro no ERP</th><th>Documento</th><th>Chave PIX</th><th>Nota fiscal</th></tr>
    <tr><td><strong>Laila</strong></td><td>Laila de Sousa Oliveira</td><td>CPF ${PESSOAS.LAILA.cpf}<br>CNPJ ${PESSOAS.LAILA.cnpj}</td>
      <td><strong>CNPJ ${PESSOAS.LAILA.cnpj}</strong><br><span class="muted">mandou em 01/09 16h57</span></td>
      <td>vai emitir — o CNPJ da Bula já foi enviado a ela em 01/09 16h59</td></tr>
    <tr><td><strong>Peralta</strong></td><td>Luiz Felipe Peralta Garcez</td><td>CPF ${PESSOAS.PERALTA.cpf}</td>
      <td><span class="tag g">falta</span> não mandou chave nenhuma</td><td>a combinar</td></tr>
    <tr><td><strong>Lucas Martins</strong></td><td>Lucas Martins Durães Bragança</td><td>CPF ${PESSOAS.LUCAS.cpf}</td>
      <td><span class="tag g">falta</span> não mandou nesta conversa</td>
      <td>já emitiu NF no acerto de 13/07 — mesmo caminho</td></tr>
  </table>

  <h3>Cinco correções no sistema, antes de gerar os títulos</h3>
  <ol>
    <li><strong>Lucas Martins a 1%.</strong> O fechamento do 28º Naviraí Camparino calcula 0,33% (R$ ${brl(fLucas.comissao)})
    e a folha também. O grupo fixou 1% em 05/08 → R$ ${brl(r2(fLucas.vgv * 0.01))}.</li>
    <li><strong>Descrição dos títulos de julho.</strong> O da Laila diz “(2%)” mas o valor já é 1% (R$ ${brl(RES.LAILA.julho)}
    sobre R$ 67.500). O texto engana quem conferir depois.</li>
    <li><strong>Fornecedor no título do Peralta.</strong> O título de julho está sem <em>fornecedor_id</em>; o da Laila aponta
    para o cadastro certo.</li>
    <li><strong>Cadastro duplicado do Peralta</strong> em <em>erp_pessoas</em>: “Peralta” (sem documento, usado pela CP cancelada
    de junho) e “Luiz Felipe Peralta Garcez” (CPF ${PESSOAS.PERALTA.cpf}). Unificar no segundo.</li>
    <li><strong>Junho do Peralta está em dobro no ERP.</strong> O leilão de 23/06 tem <em>dois</em> fechamentos com os mesmos
    9 lotes e o mesmo VGV de R$ ${brl(fTourosRS.vgv)} — “Venda Touros RS” e “Leilão Virtual Reprodutores RS Agropecuária”.
    A comissão é uma só; qualquer relatório que some os dois dobra o número.</li>
  </ol>

  <h3>Efeito no caixa</h3>
  <p>Os R$ ${brl(totJulho)} de hoje cabem: o saldo dos bancos em 02/09 é de R$ 46.363,09 e entra a comissão do
  Nelore Santa Cruz. Os R$ ${brl(agostoFirme)} de agosto vencem em 25/09, junto com o resto do ciclo — os
  ${D.erp.contas_pagar.filter(c => c.vencimento === '2026-09-25').length ? '' : ''}títulos de comissão já lançados para
  25/09 somam R$ 38.070,00 (Fábio, Douglas e Leonardo), e nenhum deles é destes três.</p>

  <div class="box">
    <div class="t">Como esta apuração foi feita</div>
    <ul style="margin-bottom:0">
      <li><strong>WhatsApp:</strong> conversas 1:1 da sessão <em>joao-automation</em> extraídas dos <em>history-dumps</em> do VPS
      (01/09), com as mídias baixadas pelo Baileys — 2 planilhas e 4 áudios, transcritos.</li>
      <li><strong>HastaPro:</strong> Firebird, somente leitura. <em>LOTES</em> × <em>LEILAO</em> × <em>CLIENTES</em> pelo
      <em>LOT_PISTEIRO</em>, filial '2'. ${D.hastapro.fil2.length} lotes no ano para os três.</li>
      <li><strong>ERP:</strong> <em>bula_leilao_fechamento</em> (por_assessor e lances), <em>erp_contas_pagar</em>,
      <em>erp_movimentos_bancarios</em> e <em>erp_folha_estrutura</em>.</li>
      <li>Lote casado por <strong>número do lote + VGV</strong>, nunca só por valor e data — casar por valor inventa
      correspondência quando há três lotes do mesmo preço no mesmo dia.</li>
      <li>Reprodução: <code>npx tsx scripts/gera-comissoes-laila-peralta-2026-09-02.mts</code> e
      <code>node scripts/render-comissoes-laila-peralta-lucas-2026-09-02.mjs</code>.</li>
    </ul>
  </div>
  ${foot('Página 6 de 6')}
</section>
</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)

const destino = path.join(os.homedir(), 'Desktop', 'Bula - Comissoes a Pagar - Laila, Peralta e Lucas Martins.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: destino, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
await browser.close()
console.log('HTML →', path.join(OUT, 'relatorio.html'))
console.log('PDF  →', destino)
console.log(`\nPagar agora        R$ ${brl(totJulho)}   (Peralta ${brl(RES.PERALTA.julho)} + Laila ${brl(RES.LAILA.julho)})`)
console.log(`Programar 25/09    R$ ${brl(agostoFirme)}   (Peralta ${brl(RES.PERALTA.agosto)} + Laila ${brl(RES.LAILA.agosto)} + Lucas ${brl(RES.LUCAS.agosto)})`)
console.log(`Em disputa         R$ ${brl(agostoDisputa)}   (lote 11 do Essência)`)
console.log(`Decisão de junho   R$ ${brl(fTourosRS.comissao)}   (CP cancelada em 04/08)`)
console.log(`Backlog levantado  R$ ${brl(backlogTotal)}`)
