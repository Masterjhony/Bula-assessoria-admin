/**
 * "AGOSTO NO SISTEMA — ANTES E DEPOIS": como o fechamento de agosto/2026 fica
 * depois de aplicar SÓ o que já está provado, e qual a faixa do que ainda
 * depende de validação. PDF (brandbook) na Área de Trabalho.
 *
 * Pedido do João em 01/09/2026, depois da verificação ficha x HastaPro que
 * elucidou 5 dos 6 lançamentos ambíguos (commit c1273cd).
 *
 * O QUE É "CERTEZA" AQUI: operação cuja origem foi provada lote a lote — o
 * lote existe no HastaPro com número, lance, pisteiro e comprador, e a ficha
 * do grupo bate. O que depende de decisão de gente (regra da Remates, valor
 * do Engenho da Serra, ficha de 17/08) fica separado, na faixa.
 *
 * Números derivados de outputs/vendas-agosto-2026/dados.json; a comissão
 * projetada usa o percentual real de cada assessor (D.comissao_pct).
 *
 * Uso: node scripts/gera-projecao-fechamento-agosto-2026.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'

const D = JSON.parse(fs.readFileSync('outputs/vendas-agosto-2026/dados.json', 'utf8'))

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const sg = n => (n >= 0 ? '+ ' : '− ') + brl0(Math.abs(n))
const dm = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—'
const corta = (t, n) => { const x = String(t); if (x.length <= n) return x; const c = x.slice(0, n), sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–]+$/, '') + '…' }
const pct1 = n => n.toFixed(1).replace('.', ',')
const pct2 = n => n.toFixed(2).replace('.', ',')

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C', VERM = '#A33'
const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

/* ── comissão pelo percentual real de cada um ───────────────────────────── */
const PCT = D.comissao_pct
const comissaoDe = (pisteiro, vgv) => (Number(PCT[pisteiro] ?? 2) / 100) * vgv
const lotesDe = (nome, data) => [...D.lotes_detalhe.hp2, ...D.lotes_detalhe.hp01_bula].filter(l => l.leilao === nome && l.data === data)

/* ── 1. CRIAR — os 7 pregões com venda e sem fechamento ─────────────────── */
const criar = D.cruzamento.filter(c => !c.erp).map(c => {
    const L = lotesDe(c.leilao, c.data)
    return {
        data: c.data, nome: c.leilao, filial: c.filial, vgv: c.hp.vgv, lotes: c.hp.lotes,
        comissao: L.reduce((s, l) => s + comissaoDe(l.pisteiro, l.vgv), 0),
        quem: [...new Set(L.map(l => l.pisteiro))],
    }
})

/* ── 2. ACRESCENTAR LOTE em fechamento que já existe ────────────────────── */
const acrescentar = D.lotes_divergentes.filter(x => x.tipo === 'so_no_hastapro').map(x => ({
    data: x.data, nome: x.leilao, lote: x.lote, vgv: x.vgv_hp, quem: x.assessor_hp,
    comissao: comissaoDe(x.assessor_hp, x.vgv_hp),
}))

/* ── 3. TIRAR lote que é de outro leilão / duplicado ────────────────────── */
const tirar = [
    { data: '2026-08-23', nome: '28º LEILÃO NAVIRAÍ CAMPARINO - REPRODUTORES', lote: '21', vgv: 105000, comissao: 2100,
      porque: 'é do 6º Excelência Genética — vai para o fechamento novo, não some do mês' },
    { data: '2026-08-22', nome: 'LEILÃO NAVIRAÍ CAMPARINO - MATRIZES ESSÊNCIA', lote: '9', vgv: 33000, comissao: 660,
      porque: 'é o lote 09 do Pepitas Colonial, que já o contém — duplicata' },
]

/* ── 4. APAGAR fechamento inteiro (duplicata comprovada) ────────────────── */
const apagar = [
    { data: '2026-08-20', nome: 'LEILÃO NELORE PARANÃ E CASABRANCA EXPOGENÉTICA', vgv: 84000, lotes: 1, comissao: 1680,
      porque: 'é o lote 09 do CEN & Fazenda Modelo, já lançado lá (a ficha diz “leilão modelo”)' },
    { data: '2026-08-21', nome: 'FÊMEAS JMP', vgv: 41400, lotes: 1, comissao: 828,
      porque: 'é o lote 48 do Shopping Naviraí de 15/08, repostado seis dias depois' },
]

/* ── 5. CRIAR o que só existe no WhatsApp ───────────────────────────────── */
const engenho = { data: '2026-08-29', nome: 'NELORE PINTADO ENGENHO DA SERRA', vgv: 53600, lotes: 4, comissao: 1072, quem: 'Douglas Bispo' }

/* ── as somas ───────────────────────────────────────────────────────────── */
const ERP = D.fontes.erp.vgv, ERP_FECH = D.fontes.erp.fechamentos, ERP_LOTES = 125
const COM_HOJE = D.financeiro.comissao_assessores
const sum = (a, k) => a.reduce((s, x) => s + (x[k] || 0), 0)

const entra = sum(criar, 'vgv') + sum(acrescentar, 'vgv')
const sai = sum(apagar, 'vgv') + sum(tirar, 'vgv')
const VGV_CERTO = ERP + entra - sai + engenho.vgv
const FECH_CERTO = ERP_FECH + criar.length + 1 - apagar.length
const LOTES_CERTO = ERP_LOTES + sum(criar, 'lotes') + acrescentar.length + engenho.lotes - sum(apagar, 'lotes') - tirar.length
const COM_CERTO = COM_HOJE + sum(criar, 'comissao') + sum(acrescentar, 'comissao') + engenho.comissao - sum(apagar, 'comissao') - sum(tirar, 'comissao')

/* ── o que falta validar, com faixa de impacto ──────────────────────────── */
const KATISPERA = { vgv: 117000, comissao: 5850 }
const VALIDAR = [
    {
        t: 'A ficha de 17/08 lançada como “Katispera”', v: '− 117.000  ou  0',
        quem: 'Matheus (quem lança no HastaPro)',
        d: 'Não existe leilão nenhum em 17/08 no HastaPro, nem um lote de agosto com lance 3.900 ou total 117.000. O texto é idêntico ao das quatro fichas de 16/08 que são do Matinha (mesmo comprador: José Fábio / Nelore Pérola / Santarém-PA). Se for venda do Matinha nunca lançada, o fechamento vira lote do Matinha e o mês NÃO muda; se for fantasma, saem 117.000 e 5.850 de comissão.',
    },
    {
        t: 'O valor do Engenho da Serra', v: '− 2.500  ou  0',
        quem: 'Marcelo × ficha do Douglas',
        d: 'A ficha dá 53.600 (parcela ×40); o Marcelo anunciou 51.100. Muda a comissão do Douglas em R$ 50 e o VGV do mês em 2.500.',
    },
    {
        t: 'O Sabiá Dourado teve venda própria?', v: '0  ou  +?',
        quem: 'Douglas',
        d: 'Os dois lotes do print são do Ventres VIP Matinha (provado por comprador, por rótulo do Matheus e pela ausência do leilão no HastaPro). Falta só ele dizer se vendeu mais alguma coisa lá além desses.',
    },
    {
        t: 'A cobertura em pregão da Bula Remates conta?', v: '± 640.700 no painel',
        quem: 'Diretoria',
        d: 'São 3 pregões (São Geraldo, Só Criador, São José) em que a Assessoria cobriu lote dentro de leilão da nossa própria leiloeira. O fechamento deve existir de qualquer jeito; o que se decide é se o número entra no painel e na meta.',
    },
    {
        t: 'Os 2 lotes do Matheus no Melhoradores 30 Anos', v: '± 39.000',
        quem: 'Diretoria',
        d: 'Lotes 32 e 42, comprador Juliano Queiroz. Ele não está na lista da pista da Remates — é o caso novo que a regra atual não cobre.',
    },
    {
        t: 'A atribuição de 16 lotes', v: '0 no mês · R$ 1.639.500 de dono',
        quem: 'Diretoria (regra do Rusa) + HastaPro',
        d: '11 lotes de direcionamento do Rusa, 4 em “A definir” (o HastaPro já sabe quem foi) e 1 conflito Bulinha × Peralta. Não move o total do mês; move ranking e comissão.',
    },
    {
        t: 'Comissão do Matinha 16/08', v: '− 19.200 (ou − 16.650)',
        quem: 'Marcelo',
        d: 'O José Fábio tem crédito lá e não vamos receber nada. Definir se cai só a parte do Rusa ou o fechamento inteiro.',
    },
    {
        t: 'Percentual do Lucas Martins', v: '± 643',
        quem: 'Grupo Financeiro',
        d: 'Cadastro diz 0,33%, a decisão de 05/08 diz 1%. Sobre os R$ 96.000 dele são R$ 316,80 ou R$ 960.',
    },
    {
        t: 'Acordo e faturamento em 19 fechamentos', v: 'R$ 112.708 de comissão sem receita',
        quem: 'Financeiro',
        d: 'Sem acordo e sem faturamento do leilão a receita da Bula não é calculada. Quase toda a Expogenética está assim.',
    },
]

/* ── meta ───────────────────────────────────────────────────────────────── */
const M = D.meta
const painelCerto = VGV_CERTO - D.consolidado.hp01_bula.vgv
const pctCom = VGV_CERTO / M.agenda_divulgada * 100
const pctSem = painelCerto / M.agenda_divulgada * 100

/* ═══════════════════════════════════ HTML ═══════════════════════════════ */
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
  .capa .sub { font-size: 12.4px; color: #B5B5B5; margin-top: 8mm; max-width: 142mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
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
  .box { border: 1px solid ${GRID}; padding: 4mm 4.4mm; margin: 4mm 0; }
  .box.dark { background: ${INK}; color: #fff; border-color: ${INK}; }
  .box.dark .t { color: ${GOLD}; }
  .box.dark p, .box.dark li { color: #D8D8D8; }
  .box.dark strong { color: #fff; }
  .box.rule { border: none; border-left: 3px solid ${INK}; padding: 1mm 0 1mm 4mm; }
  .box.gold { border-left: 3px solid ${GOLD}; border-top: none; border-right: none; border-bottom: none; padding: 1mm 0 1mm 4mm; }
  .box .t { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; margin-bottom: 2.2mm; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 9.3px; margin: 2.5mm 0; }
  th { text-align: left; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.4px; letter-spacing: .07em; font-weight: 600; border-bottom: 1.4px solid ${INK}; padding: 2mm 1.8mm; }
  td { padding: 1.6mm 1.8mm; border-bottom: 1px solid #F0F0F0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  tr.sub td { background: #FAFAFA; font-weight: 600; }
  .neg { color: ${VERM}; }
  .tag { display: inline-block; font-family: Oswald, sans-serif; font-size: 7.4px; letter-spacing: .07em; text-transform: uppercase; border: 1px solid ${GRID}; padding: .4mm 1.4mm; color: ${MUTED}; white-space: nowrap; }
  .tag.ok { border-color: ${INK}; color: ${INK}; }
  .tag.warn { border-color: ${GOLD}; color: #8A7024; background: #FCF8EE; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  table.dense td { padding: 1.05mm 1.8mm; }
  table.dense th { padding: 1.5mm 1.8mm; }
  /* placar antes → depois */
  .placar { display: grid; grid-template-columns: 1fr 12mm 1fr; gap: 0; align-items: stretch; margin: 5mm 0 6mm; border: 1px solid ${GRID}; }
  .placar .col { padding: 4mm 5mm; }
  .placar .col.dep { background: #FAFAFA; border-left: 1px solid ${GRID}; }
  .placar .seta { display: flex; align-items: center; justify-content: center; font-size: 15px; color: ${GOLD}; font-weight: 700; }
  .placar .cap { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.6px; letter-spacing: .1em; color: ${MUTED}; margin-bottom: 3mm; }
  .placar .lin { display: flex; justify-content: space-between; align-items: baseline; padding: 1.6mm 0; border-bottom: 1px solid #EFEFEF; }
  .placar .lin:last-child { border-bottom: none; }
  .placar .lin span { font-size: 9px; color: ${MUTED}; }
  .placar .lin strong { font-family: Oswald, sans-serif; font-size: 14px; font-weight: 600; }
  .placar .lin.big strong { font-size: 18px; }
  .op { border-top: 1px solid ${GRID}; padding: 2.6mm 0 2mm; }
  .op:first-of-type { border-top: 1.4px solid ${INK}; }
  .op .l1 { display: flex; justify-content: space-between; align-items: baseline; gap: 3mm; }
  .op .l1 .nm { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 10.5px; font-weight: 600; }
  .op .l1 .vl { font-family: Oswald, sans-serif; font-size: 11.5px; font-weight: 600; white-space: nowrap; }
  .op .l2 { font-size: 8.6px; color: ${MUTED}; margin-top: .6mm; }`

const foot = p => `<div class="pfoot"><span>Bula Assessoria · Agosto no sistema — antes e depois</span><span>${p}</span></div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<title>Agosto no sistema — antes e depois</title>
<style>${CSS}</style></head><body>

<!-- CAPA -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Agosto no<br>sistema</h1>
  <div class="rule"></div>
  <div class="sub">Como o fechamento fica depois de aplicar <strong>só o que já está provado lote a lote</strong> —
  e o que ainda depende de alguém decidir, com o tamanho exato de cada dúvida.</div>
  <div class="meta">
    <div><span>Hoje no ERP</span><strong>R$ ${brl0(ERP)}</strong></div>
    <div><span>Depois das certezas</span><strong>R$ ${brl0(VGV_CERTO)}</strong></div>
    <div><span>Margem em aberto</span><strong>R$ ${brl0(KATISPERA.vgv + 2500)}</strong></div>
    <div><span>Operações provadas</span><strong>${criar.length + acrescentar.length + tirar.length + apagar.length + 1}</strong></div>
    <div><span>Pontos a validar</span><strong>${VALIDAR.length}</strong></div>
    <div><span>Emitido em</span><strong>01/09/2026</strong></div>
  </div>
</section>

<!-- 1. O PLACAR -->
<section class="page">
  <div class="head"><h2>Como o sistema fica</h2><div class="n">01 · Antes e depois</div></div>

  <p class="lead">Aplicando <strong>apenas o que foi provado</strong> — lote com número, lance, pisteiro e comprador
  batendo entre HastaPro e a ficha do grupo — o fechamento de agosto sai de R$ ${brl0(ERP)} para
  <strong>R$ ${brl0(VGV_CERTO)}</strong>. Nenhuma dessas ${criar.length + acrescentar.length + tirar.length + apagar.length + 1} operações
  depende de decisão de ninguém.</p>

  <div class="placar">
    <div class="col">
      <div class="cap">Hoje</div>
      <div class="lin big"><span>VGV de agosto</span><strong>${brl0(ERP)}</strong></div>
      <div class="lin"><span>Fechamentos</span><strong>${ERP_FECH}</strong></div>
      <div class="lin"><span>Lotes</span><strong>${ERP_LOTES}</strong></div>
      <div class="lin"><span>Comissão comprometida</span><strong>${brl0(COM_HOJE)}</strong></div>
      <div class="lin"><span>Lançamento sem leilão certo</span><strong>5</strong></div>
    </div>
    <div class="seta">→</div>
    <div class="col dep">
      <div class="cap">Depois do que já é certo</div>
      <div class="lin big"><span>VGV de agosto</span><strong>${brl0(VGV_CERTO)}</strong></div>
      <div class="lin"><span>Fechamentos</span><strong>${FECH_CERTO}</strong></div>
      <div class="lin"><span>Lotes</span><strong>${LOTES_CERTO}</strong></div>
      <div class="lin"><span>Comissão comprometida</span><strong>${brl0(COM_CERTO)}</strong></div>
      <div class="lin"><span>Lançamento sem leilão certo</span><strong>1</strong></div>
    </div>
  </div>

  <h3>De onde vem a diferença de R$ ${brl0(VGV_CERTO - ERP)}</h3>
  <table>
    <tr><th>Operação</th><th class="num">Fech.</th><th class="num">Lotes</th><th class="num">VGV</th><th class="num">Comissão</th></tr>
    <tr><td>Criar os ${criar.length} pregões que têm venda e não têm fechamento</td><td class="num">+${criar.length}</td>
      <td class="num">+${sum(criar, 'lotes')}</td><td class="num">${sg(sum(criar, 'vgv'))}</td><td class="num">${sg(sum(criar, 'comissao'))}</td></tr>
    <tr><td>Criar o Engenho da Serra (só existe no WhatsApp)</td><td class="num">+1</td>
      <td class="num">+${engenho.lotes}</td><td class="num">${sg(engenho.vgv)}</td><td class="num">${sg(engenho.comissao)}</td></tr>
    <tr><td>Acrescentar ${acrescentar.length} lotes em fechamento que já existe</td><td class="num">—</td>
      <td class="num">+${acrescentar.length}</td><td class="num">${sg(sum(acrescentar, 'vgv'))}</td><td class="num">${sg(sum(acrescentar, 'comissao'))}</td></tr>
    <tr><td>Tirar ${tirar.length} lotes que são de outro leilão</td><td class="num">—</td>
      <td class="num">−${tirar.length}</td><td class="num">${sg(-sum(tirar, 'vgv'))}</td><td class="num">${sg(-sum(tirar, 'comissao'))}</td></tr>
    <tr><td>Apagar ${apagar.length} fechamentos que são duplicata</td><td class="num">−${apagar.length}</td>
      <td class="num">−${sum(apagar, 'lotes')}</td><td class="num">${sg(-sum(apagar, 'vgv'))}</td><td class="num">${sg(-sum(apagar, 'comissao'))}</td></tr>
    <tr><td class="muted">(o “Katispera” de 17/08 continua onde está, até o Matheus dizer de que pregão é)</td><td class="num">—</td>
      <td class="num">—</td><td class="num muted">${brl0(KATISPERA.vgv)}</td><td class="num muted">${brl0(KATISPERA.comissao)}</td></tr>
    <tr class="total"><td>Resultado</td><td class="num">${FECH_CERTO}</td><td class="num">${LOTES_CERTO}</td>
      <td class="num">R$ ${brl0(VGV_CERTO)}</td><td class="num">R$ ${brl0(COM_CERTO)}</td></tr>
  </table>
  <p class="small">A comissão projetada usa o percentual real de cada assessor no cadastro — 2% para quase todos,
  1% para a Laila, 0,33% para o Lucas Martins (que é justamente um dos pontos a validar).</p>

  <div class="box dark">
    <div class="t">O que isso responde de imediato</div>
    <p>O número de agosto passa a ser <strong>R$ ${brl0(VGV_CERTO)}</strong>, com ${LOTES_CERTO} lotes em ${FECH_CERTO} fechamentos.
    Sobre a agenda divulgada isso dá <strong>${pct2(pctCom)}%</strong> — a meta de 12% <strong>bate</strong>.</p>
    <p>Mas se a leitura for a do painel, que não enxerga a cobertura em pregão da Bula Remates
    (R$ ${brl0(D.consolidado.hp01_bula.vgv)}), agosto fecha em <strong>R$ ${brl0(painelCerto)} = ${pct2(pctSem)}%</strong> e
    <strong>não bate</strong>. Lançar tudo não resolve isso: é decisão, não dado.</p>
    <p style="margin-bottom:0">⚠ Esse R$ ${brl0(VGV_CERTO)} <strong>ainda carrega os R$ ${brl0(KATISPERA.vgv)} do “Katispera” de 17/08</strong>,
    que é o único lançamento sem leilão identificado. Se ele for venda real do Matinha nunca lançada, o valor fica;
    se for fantasma, agosto cai para <strong>R$ ${brl0(VGV_CERTO - KATISPERA.vgv)}</strong> — que é exatamente o número da
    apuração das três fontes mais o Engenho da Serra. Enquanto o Matheus não responde, o mês tem essa margem de R$ ${brl0(KATISPERA.vgv)}.</p>
  </div>
  ${foot('Página 2 de 5')}
</section>

<!-- 2. O QUE JÁ É CERTO -->
<section class="page">
  <div class="head"><h2>O que já está provado</h2><div class="n">02 · Pode executar</div></div>

  <p class="lead">Cada operação abaixo tem o lote identificado no HastaPro com número, lance, pisteiro e comprador,
  e a ficha do grupo batendo. <strong>Não há o que decidir</strong> — só executar, na ordem do fim da página.</p>

  <h3>Criar fechamento — ${criar.length + 1} pregões, R$ ${brl0(sum(criar, 'vgv') + engenho.vgv)}</h3>
  ${[...criar.map(c => ({ ...c })), { ...engenho, filial: '—', quem: [engenho.quem] }].map(c => `
  <div class="op"><div class="l1"><span class="nm">${dm(c.data)} · ${esc(corta(c.nome, 44))}</span>
    <span class="vl">R$ ${brl0(c.vgv)}</span></div>
    <div class="l2">${c.lotes} lote${c.lotes > 1 ? 's' : ''} · ${c.filial !== '—' ? 'filial ‘' + c.filial + '’ · ' : ''}${esc((c.quem || []).map(q => q.split(' ')[0]).join(', '))} · comissão R$ ${brl(c.comissao)}</div></div>`).join('')}

  <h3>Acrescentar lote em fechamento existente — R$ ${brl0(sum(acrescentar, 'vgv'))}</h3>
  <table class="dense">
    <tr><th class="num">Data</th><th>Fechamento</th><th>Lote</th><th>Quem levou</th><th class="num">VGV</th><th class="num">Comissão</th></tr>
    ${acrescentar.map(a => `<tr><td class="num">${dm(a.data)}</td><td>${esc(corta(a.nome, 36))}</td><td>${esc(a.lote)}</td>
      <td>${esc(a.quem.split(' ').slice(0, 2).join(' '))}</td><td class="num">R$ ${brl0(a.vgv)}</td><td class="num">R$ ${brl(a.comissao)}</td></tr>`).join('')}
  </table>
  <p class="small">Os dois do São Geraldo são da Nane e só entram depois de cadastrá-la em <strong>PRESTADORES</strong> no
  HastaPro — hoje ela existe só em CLIENTES e o importador não a reconhece. O mesmo cadastro destrava o Só Criador e o São José.</p>

  <h3>Tirar e apagar — R$ ${brl0(sai)}</h3>
  ${[...tirar.map(t => ({ ...t, tipo: 'Tirar o lote ' + t.lote })), ...apagar.map(a => ({ ...a, tipo: 'Apagar o fechamento' }))].map(o => `
  <div class="op"><div class="l1"><span class="nm">${o.tipo} · ${esc(corta(o.nome, 38))}</span>
    <span class="vl neg">− ${brl0(o.vgv)}</span></div>
    <div class="l2">${dm(o.data)} · ${esc(o.porque)} · comissão − R$ ${brl(o.comissao)}</div></div>`).join('')}

  <div class="box gold">
    <div class="t">A ordem importa em um ponto só</div>
    <p style="margin-bottom:0">O lote 21 tem de <strong>sair do Naviraí antes</strong> de o 6º Excelência Genética ser criado.
    Na ordem inversa os R$ 105.000 contam duas vezes. Todo o resto pode ser executado em qualquer sequência.</p>
  </div>
  ${foot('Página 3 de 5')}
</section>

<!-- 3. O QUE FALTA VALIDAR -->
<section class="page">
  <div class="head"><h2>O que falta validar</h2><div class="n">03 · Depende de decisão</div></div>

  <p class="lead">Nenhum destes é falta de dado do sistema — é falta de alguém dizer. Ao lado de cada um está
  <strong>o tamanho exato da dúvida</strong>, para ninguém tratar um item de R$ 50 como se fosse um de R$ 640 mil.</p>

  ${VALIDAR.map((v, i) => `
  <div class="op"><div class="l1"><span class="nm">${i + 1}. ${esc(v.t)}</span><span class="vl">${esc(v.v)}</span></div>
    <div class="l2" style="margin-bottom:1.2mm">resolve: ${esc(v.quem)}</div>
    <p style="font-size:9.4px;margin:0">${esc(v.d)}</p></div>`).join('')}

  <p class="small" style="margin-top:4mm">Somando as faixas, o VGV de agosto pode variar de
  <strong>R$ ${brl0(VGV_CERTO - KATISPERA.vgv - 2500)}</strong> a <strong>R$ ${brl0(VGV_CERTO)}</strong> conforme os dois
  primeiros itens. Os demais não mexem no total do mês — mexem em quem recebe, em quanto se cobra e em como a meta é lida.</p>
  ${foot('Página 4 de 5')}
</section>

<!-- 4. DEPOIS -->
<section class="page">
  <div class="head"><h2>O sistema depois</h2><div class="n">04 · O que muda na prática</div></div>

  <h3>Em cada tela</h3>
  <table>
    <tr><th>Onde</th><th>Hoje</th><th>Depois</th></tr>
    <tr><td><strong>Fechamento de leilões</strong></td><td class="muted">${ERP_FECH} fechamentos, R$ ${brl0(ERP)}</td>
      <td>${FECH_CERTO} fechamentos, R$ ${brl0(VGV_CERTO)} — sem duplicata e sem lote em leilão errado</td></tr>
    <tr><td><strong>Painel de vendas por assessor</strong></td><td class="muted">a Nane sai em branco nos pregões da Remates</td>
      <td>a Nane aparece com R$ ${brl0(264900)} em 3 pregões, e ${acrescentar.filter(a => !/Regiane|Nane/.test(a.quem)).length} lotes voltam para Leonardo e Peralta</td></tr>
    <tr><td><strong>Comissão de agosto</strong></td><td class="muted">R$ ${brl0(COM_HOJE)}, com R$ ${brl0(sum(apagar, 'comissao') + sum(tirar, 'comissao'))} em cima de venda duplicada</td>
      <td>R$ ${brl0(COM_CERTO)} sobre venda conferida lote a lote</td></tr>
    <tr><td><strong>Meta de agosto</strong></td><td class="muted">sem resposta única</td>
      <td>${pct2(pctCom)}% com a cobertura da Remates · ${pct2(pctSem)}% só pelo painel — a escolha é da diretoria</td></tr>
    <tr><td><strong>Receita da Bula</strong></td><td class="muted">R$ ${brl0(D.financeiro.receita_bula)}, com 19 fechamentos zerados</td>
      <td>só sobe quando acordo e faturamento forem gravados — não é efeito destes lançamentos</td></tr>
  </table>

  <h3>A sequência</h3>
  <ol>
    <li><strong>Cadastrar a Nane em PRESTADORES</strong> no HastaPro — destrava São Geraldo, Só Criador e São José de uma vez.</li>
    <li><strong>Apagar as duas duplicatas</strong> (Paranã/Casabranca e FÊMEAS JMP) e <strong>tirar os dois lotes</strong> (21 do Naviraí, 9 do Naviraí Matrizes).</li>
    <li><strong>Criar os ${criar.length} fechamentos</strong>, o do Excelência Genética depois de o lote 21 ter saído.</li>
    <li><strong>Perguntar ao Matheus</strong> de que pregão é a ficha de 17/08 e resolver o Katispera.</li>
    <li><strong>Fechar os R$ 2.500</strong> do Engenho da Serra e lançá-lo.</li>
    <li><strong>Decidir</strong> a cobertura da Remates, os 2 lotes do Matheus, a atribuição do Rusa e o percentual do Lucas.</li>
    <li><strong>Gravar acordo e faturamento</strong> nos 19 fechamentos zerados e só então gerar a comissão.</li>
  </ol>

  <div class="box dark">
    <div class="t">E para setembro não repetir</div>
    <p>Quatro dos cinco lançamentos errados de agosto têm a mesma causa: <strong>a ficha do grupo não diz de que leilão é</strong>,
    e quando há dois pregões no mesmo dia o sistema chuta pelo evento da agenda.</p>
    <p style="margin-bottom:0">O conserto já existe e está fora do sistema: no grupo <strong>“VENDAS - BULA ASSESSORIA”</strong> o
    Matheus reencaminha cada ficha escrevendo o nome do leilão. Basta pôr o JID
    <code>120363403253244436@g.us</code> na allowlist da sessão <code>joao-automation</code> — o rótulo de quem lança no
    HastaPro passa a chegar junto com a ficha, e o parser deixa de adivinhar.</p>
  </div>
  ${foot('Página 5 de 5')}
</section>
</body></html>`

fs.mkdirSync('outputs/pendencias-agosto-2026', { recursive: true })
fs.writeFileSync('outputs/pendencias-agosto-2026/projecao.html', html)

const desktop = path.join(os.homedir(), 'Desktop')
const pdfPath = path.join(desktop, 'Bula - Agosto no Sistema - Antes e Depois.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ media: 'print' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
const over = await page.evaluate(() => [...document.querySelectorAll('.page')].map((s, i) => s.scrollHeight > s.clientHeight + 2 ? i + 1 : null).filter(Boolean))
await browser.close()

console.log('VGV  ', ERP, '→', VGV_CERTO, '| entra', entra, '| sai', sai, '| engenho', engenho.vgv)
console.log('FECH ', ERP_FECH, '→', FECH_CERTO, '| LOTES', ERP_LOTES, '→', LOTES_CERTO)
console.log('COM  ', COM_HOJE, '→', Math.round(COM_CERTO))
console.log('META ', pct2(pctCom) + '% com Remates ·', pct2(pctSem) + '% só painel')
console.log('paginas estouradas:', over.length ? over : 'nenhuma')
console.log('PDF  →', pdfPath)
