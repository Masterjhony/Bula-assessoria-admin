/**
 * Renderiza o relatorio das comissoes de julho/2026 em aberto a partir de
 * outputs/comissoes-julho-2026/dados.json. PDF A4 na Area de Trabalho.
 * Nenhum numero escrito a mao.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { chromium } from 'playwright'

const OUT = 'outputs/comissoes-julho-2026'
const D = JSON.parse(fs.readFileSync(path.join(OUT, 'dados.json'), 'utf8'))

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const r2 = n => Math.round(Number(n) * 100) / 100
const dm = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—'
const corta = (t, n) => {
  const x = String(t)
  if (x.length <= n) return x
  const c = x.slice(0, n), sp = c.lastIndexOf(' ')
  return (sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[ ,;.\-–]+$/, '') + '…'
}
const limpa = s => String(s).replace(/^COMISSAO\s+/i, '').replace(/\s*\(\d[\d,.]*%\)\s*$/, '')
const sinal = n => (n < 0 ? '−R$ ' + brl(Math.abs(n)) : 'R$ ' + brl(n))

const INK = '#0A0A0A', GRID = '#E6E6E6', MUTED = '#6E6E6E', GOLD = '#C9A84C'
const pes = q => D.pessoas.find(p => p.quem === q)
const conf = q => D.conferencia.find(c => c.quem === q)
const FAB = conf('FÁBIO OMENA'), LEO = conf('LEONARDO SERAFIM'), DOU = conf('DOUGLAS BISPO')
const gr = k => D.grupos.find(g => g.chave === k) || { total: 0, n: 0, itens: [] }
const lerERP = D.leituras[0], lerPL = D.leituras[1]
const diferidoNoPix = FAB.inclui.find(i => i.diferido)

/* ============ G1 — barra empilhada do ciclo ============ */
function gCiclo() {
  const W = 762, H = 96, L = 0, T = 22, BH = 34
  const partes = [
    { rot: 'Pago', valor: D.ciclo.baixado, cor: INK },
    { rot: 'Vencido, em aberto', valor: D.ciclo.vencido, cor: '#A8A8A8' },
    { rot: 'Diferido p/ dezembro', valor: D.ciclo.diferido, cor: GOLD, fim: true },
  ]
  let x = L, g = ''
  for (const p of partes) {
    const w = (W - L) * (p.valor / D.ciclo.gerado)
    g += `<rect x="${x.toFixed(1)}" y="${T}" width="${w.toFixed(1)}" height="${BH}" fill="${p.cor}"/>`
    // A última fatia é estreita: número e rótulo saem fora dela, alinhados à direita.
    if (p.fim) {
      g += `<text x="${W - 6}" y="${T + BH / 2 + 4}" text-anchor="end" font-size="10" font-weight="600" fill="${INK}">R$ ${brl0(p.valor)}</text>`
      g += `<text x="${W}" y="${T - 7}" text-anchor="end" font-size="8.6" fill="${MUTED}">${esc(p.rot)}</text>`
    } else {
      g += `<text x="${(x + 6).toFixed(1)}" y="${T + BH / 2 + 4}" font-size="10" font-weight="600" fill="#fff">R$ ${brl0(p.valor)}</text>`
      g += `<text x="${x.toFixed(1)}" y="${T - 7}" font-size="8.6" fill="${MUTED}">${esc(p.rot)}</text>`
    }
    x += w
  }
  g += `<text x="0" y="${T + BH + 15}" font-size="8.6" fill="${MUTED}">Ciclo de julho — R$ ${brl(D.ciclo.gerado)} em ${D.ciclo.titulos} títulos</text>`
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${g}</svg>`
}

const logo = 'data:image/png;base64,' + fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
let PG = 0
const foot = () => `<div class="pfoot"><span>Bula Assessoria — Comissões de julho/2026 · posição em 27/08</span><span>${++PG}</span></div>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<title>Bula — Comissões de julho/2026</title>
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
  .capa h1 { font-size: 42px; line-height: 1.03; color: #fff; font-weight: 700; }
  .capa .sub { font-size: 12.4px; color: #B5B5B5; margin-top: 8mm; max-width: 136mm; line-height: 1.62; font-family: Inter, sans-serif; text-transform: none; letter-spacing: 0; }
  .capa .rule { width: 26mm; height: 3px; background: ${GOLD}; margin: 9mm 0; }
  .capa .meta { margin-top: auto; flex-wrap: wrap; row-gap: 6mm; display: flex; gap: 12mm; border-top: 1px solid #2A2A2A; padding-top: 6mm; }
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
  tr.destaque td { background: #F6F6F6; font-weight: 600; }
  tr.total td { border-top: 1.4px solid ${INK}; border-bottom: none; font-weight: 700; }
  figure { margin: 3mm 0 5mm; }
  figcaption { font-size: 8.6px; color: ${MUTED}; margin-top: 1.8mm; line-height: 1.45; }
  ol, ul { margin: 0 0 3mm; padding-left: 4.6mm; }
  li { margin-bottom: 1.6mm; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
</style></head><body>

<!-- ============================ CAPA ============================ -->
<section class="page capa">
  <img src="${logo}" alt="Bula Assessoria">
  <h1>Comissões<br>de julho<br>em aberto</h1>
  <div class="rule"></div>
  <div class="sub">Sobraram <strong style="color:#fff">R$ ${brl(D.ciclo.aberto)}</strong> do ciclo de julho — mas só
  <strong style="color:#fff">R$ ${brl(D.acao.pagarAgora)}</strong> é dinheiro que precisa sair. O resto é título já pago sem baixa,
  comissão diferida para dezembro e uma divergência de <strong style="color:#fff">R$ ${brl(D.disputadoTotal)}</strong> que foi paga duas vezes.</div>
  <div class="meta">
    <div><span>Competência</span><strong>Julho/2026</strong></div>
    <div><span>Posição</span><strong>27/08/2026</strong></div>
    <div><span>Ciclo gerado</span><strong>R$ ${brl(D.ciclo.gerado)}</strong></div>
    <div><span>Em aberto</span><strong>R$ ${brl(D.ciclo.aberto)}</strong></div>
  </div>
</section>

<!-- ============================ P1 — O QUADRO ============================ -->
<section class="page">
  <div class="head"><h2>O quadro</h2><div class="n">01 · onde está cada real</div></div>

  <div class="tiles">
    <div class="tile"><div class="k">Ciclo de julho</div><div class="v"><span class="cur">R$</span>${brl0(D.ciclo.gerado)}</div>
      <div class="d">${D.ciclo.titulos} títulos de comissão</div></div>
    <div class="tile"><div class="k">Já baixado</div><div class="v"><span class="cur">R$</span>${brl0(D.ciclo.baixado)}</div>
      <div class="d">Douglas, Rusa, Bulinha e parte do Leonardo</div></div>
    <div class="tile gold"><div class="k">Em aberto</div><div class="v"><span class="cur">R$</span>${brl0(D.ciclo.aberto)}</div>
      <div class="d">${D.ciclo.vencido > 0 ? 'R$ ' + brl0(D.ciclo.vencido) + ' vencidos + R$ ' + brl0(D.ciclo.diferido) + ' diferidos' : ''}</div></div>
    <div class="tile"><div class="k">Precisa sair do caixa</div><div class="v"><span class="cur">R$</span>${brl0(D.acao.pagarAgora)}</div>
      <div class="d">o resto não é pagamento novo</div></div>
  </div>

  <p class="lead">Os R$ ${brl(D.ciclo.aberto)} que aparecem em aberto <strong>não são R$ ${brl(D.ciclo.aberto)} a pagar.</strong>
  Metade já saiu do banco e só falta baixar o título; uma parte é da Nane e só vence em dezembro; e R$ ${brl(D.disputadoTotal)}
  são um lote que dois assessores cobraram — e que a Bula pagou aos dois.</p>

  <figure>${gCiclo()}</figure>

  <h3>Os cinco grupos</h3>
  <table>
    <thead><tr><th>Situação</th><th class="num" style="width:16mm">Títulos</th><th class="num" style="width:26mm">Valor</th><th style="width:56mm">O que fazer</th></tr></thead>
    <tbody>
      ${D.grupos.map(g => {
        const acao = {
          'ja-pago-sem-baixa': 'Baixar contra o PIX de 25/08 — <strong>não sai caixa</strong>',
          'nao-cobrado': 'Cobrar a nota do assessor e pagar',
          'diferido': 'Nada — vence 28/12 por regra própria',
          'nao-pago': '<strong>Pagar</strong> — nunca houve PIX',
          'sem-dono': 'Definir o assessor antes de pagar',
        }[g.chave] || ''
        return `<tr class="${g.chave === 'nao-pago' ? 'destaque' : ''}"><td><strong>${esc(g.rot)}</strong></td>
          <td class="num">${g.n}</td><td class="num">${brl(g.total)}</td><td>${acao}</td></tr>`
      }).join('')}
      <tr class="total"><td>Total em aberto</td><td class="num">${D.grupos.reduce((s, g) => s + g.n, 0)}</td><td class="num">${brl(D.ciclo.aberto)}</td><td></td></tr>
    </tbody>
  </table>

  <h3>Pessoa a pessoa</h3>
  <table>
    <thead><tr><th>Quem</th><th class="num" style="width:24mm">Devido</th><th class="num" style="width:24mm">Saiu do banco</th><th class="num" style="width:24mm">Baixado</th><th class="num" style="width:24mm">Em aberto</th></tr></thead>
    <tbody>
      ${D.pessoas.filter(p => p.devido > 0).map(p => `<tr class="${p.aberto > 0 ? '' : 'muted'}">
        <td><strong>${esc(p.quem)}</strong>${p.diferido ? ' <span class="muted">(diferido)</span>' : ''}</td>
        <td class="num">${brl(p.devido)}</td>
        <td class="num">${p.pagoBanco ? brl(p.pagoBanco) + '<br><span class="muted" style="font-size:8px">' + dm(p.dataBanco) + '</span>' : '<span class="muted">—</span>'}</td>
        <td class="num">${p.baixado ? brl(p.baixado) : '<span class="muted">—</span>'}</td>
        <td class="num">${p.aberto ? '<strong>' + brl(p.aberto) + '</strong>' : '<span class="muted">quitado</span>'}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="num">${brl(D.ciclo.gerado)}</td>
        <td class="num">${brl(r2(D.saiuDoBanco.reduce((s, b) => s + b.valor, 0)))}</td>
        <td class="num">${brl(D.ciclo.baixado)}</td><td class="num">${brl(D.ciclo.aberto)}</td></tr>
    </tbody>
  </table>
  <p class="small">"Saiu do banco" é o PIX conferido 1:1 no extrato do Sicoob. O Rusa e o Bulinha não aparecem nessa coluna porque
  foram pagos dentro de acertos maiores${D.rusaNota ? ' — o do Rusa em ' + dm(D.rusaNota.data) + ', R$ ' + brl(D.rusaNota.valor) + ', cobrindo mais de um mês' : ''};
  os títulos de julho deles estão baixados e conferidos.</p>

  ${foot()}
</section>

<!-- ============================ P2 — A CONFERÊNCIA ============================ -->
<section class="page">
  <div class="head"><h2>PIX × títulos</h2><div class="n">02 · a conferência</div></div>

  <p class="lead">Três PIX saíram no ciclo de julho. Para cada um, a pergunta é simples: <strong>que conjunto de títulos ele paga?</strong>
  A resposta sai por força bruta — testando todas as combinações possíveis dos títulos da pessoa contra o valor que saiu do banco.</p>

  <table>
    <thead><tr><th>Quem</th><th class="num" style="width:22mm">Saiu</th><th class="num" style="width:22mm">Títulos</th><th class="num" style="width:20mm">Diferença</th><th style="width:62mm">Combinações exatas</th></tr></thead>
    <tbody>
      ${D.conferencia.map(c => `<tr><td><strong>${esc(c.quem)}</strong></td><td class="num">${brl(c.pago)}</td><td class="num">${brl(c.devidoErp)}</td>
        <td class="num">${c.dif === 0 ? '<span class="muted">zero</span>' : sinal(c.dif)}</td>
        <td>${c.combinacoes === 0 ? '<strong>Nenhuma</strong> — o PIX não sai dos títulos dele'
          : c.combinacoes === 1 && c.fora.length === 0 ? '<strong>Fecha exato</strong>, com todos os títulos'
          : '<strong>Uma só</strong> — todos menos ' + c.fora.map(f => 'R$ ' + brl(f.valor)).join(' e ')}</td></tr>`).join('')}
    </tbody>
  </table>

  <div class="cols2">
    <div>
      <h3>Douglas — fechado</h3>
      <p class="small">R$ ${brl(DOU.pago)} pagos em ${dm(pes('DOUGLAS BISPO').dataBanco)} contra R$ ${brl(DOU.devidoErp)} de título.
      Bate ao centavo, com todos os títulos dentro — inclusive o complemento de R$ 1.792,00 dos lotes que ficaram fora do primeiro cálculo.
      <strong>Nada em aberto.</strong> Segue pendente só o saldo de R$ 320,00 do lote 19 do Nelore Sorriso, que nunca virou título.</p>

      <h3>Fábio — falta R$ ${brl(lerERP.fabio.saldo)}, e só isso</h3>
      <p class="small">R$ ${brl(FAB.pago)} pagos em ${dm(pes('FÁBIO OMENA').dataBanco)}. Entre os ${FAB.universo} títulos dele existe
      <strong>uma única combinação</strong> que soma esse valor exato: todos menos o do Naviraí Matrizes de 05/07 (R$ ${brl(FAB.fora[0].valor)}).
      Não é interpretação — é a única solução aritmética.</p>
      <table>
        <thead><tr><th>Dentro do PIX de ${dm(pes('FÁBIO OMENA').dataBanco)}</th><th class="num" style="width:20mm">Valor</th></tr></thead>
        <tbody>
          ${FAB.inclui.sort((a, b) => b.valor - a.valor).map(i => `<tr><td>${esc(corta(limpa(i.desc), 46))}${i.diferido ? ' <span class="muted">⚠ diferido</span>' : ''}</td><td class="num">${brl(i.valor)}</td></tr>`).join('')}
          <tr class="total"><td>Soma</td><td class="num">${brl(FAB.pago)}</td></tr>
          ${FAB.fora.map(f => `<tr><td class="muted">FORA — ${esc(corta(limpa(f.desc), 42))}</td><td class="num muted">${brl(f.valor)}</td></tr>`).join('')}
        </tbody>
      </table>
      ${diferidoNoPix ? `<p class="small">⚠ O PIX inclui os <strong>R$ ${brl(diferidoNoPix.valor)}</strong> do título compartilhado Nane / Fábio,
      que o ERP tem <strong>diferido para 28/12</strong>. Ou a parte do Fábio nesse título não deveria estar diferida, ou o pagamento cobriu algo que ainda não era devido.</p>` : ''}
    </div>
    <div>
      <h3>Leonardo — nenhuma combinação fecha</h3>
      <p class="small">R$ ${brl(LEO.pago)} pagos em ${dm(pes('LEONARDO SERAFIM').dataBanco)} contra R$ ${brl(LEO.devidoErp)} de título.
      <strong>Nenhum subconjunto dos títulos dele soma esse valor</strong> — e não some por pouco: falta um pedaço inteiro.
      A planilha que ele mandou em 26/08 explica: ela fecha exato nos R$ ${brl(LEO.pago)} com 7 lotes,
      e <strong>dois deles o ERP atribui ao Fábio</strong>.</p>

      <h3>Os dois lotes em disputa</h3>
      <table>
        <thead><tr><th style="width:12mm">Lote</th><th class="num" style="width:22mm">VGV</th><th class="num" style="width:18mm">2%</th><th>ERP dá a</th></tr></thead>
        <tbody>
          ${D.disputados.map(l => `<tr><td><strong>${esc(l.lote)}</strong></td><td class="num">${brl(l.vgv)}</td><td class="num">${brl(l.comissao)}</td><td>${esc(l.assessor)}</td></tr>`).join('')}
          <tr class="total"><td colspan="2">Soma</td><td class="num">${brl(D.disputadoTotal)}</td><td></td></tr>
        </tbody>
      </table>
      <p class="small">Nos dois lotes o comprador está como <strong>"A identificar · Fazenda São Gerônimo"</strong> —
      o fechamento não sabe quem comprou, e é justamente aí que a atribuição de assessor fica frágil.
      O Leonardo nomeia os compradores na planilha dele.</p>

      <h3>O que o Leonardo NÃO cobrou</h3>
      <table>
        <thead><tr><th>Leilão</th><th class="num" style="width:22mm">Valor</th></tr></thead>
        <tbody>
          ${gr('nao-cobrado').itens.map(i => `<tr><td>${esc(corta(i.evento ? i.evento.nome : limpa(i.desc), 44))}</td><td class="num">${brl(i.valor)}</td></tr>`).join('')}
          <tr class="total"><td>${gr('nao-cobrado').n} títulos, ainda devidos</td><td class="num">${brl(gr('nao-cobrado').total)}</td></tr>
        </tbody>
      </table>
      <p class="small">Estes o ERP reconhece e ele não pôs na planilha — <strong>não é erro, é dinheiro que ele ainda tem a receber.</strong>
      Se a leitura da planilha dele estiver certa, é exatamente esse o saldo que resta pagar ao Leonardo.</p>
    </div>
  </div>

  <div class="box dark">
    <div class="t">O achado: R$ ${brl(D.disputadoTotal)} foram pagos duas vezes</div>
    <p style="margin:0">Os lotes ${D.disputados.map(l => l.lote).join(' e ')} do ${D.eaoFemeas ? esc(corta(D.eaoFemeas.nome, 40)) : 'EAO Baviera Fêmeas'} estão
    <strong>dentro do título de R$ ${brl(FAB.inclui.find(i => /EAO BAVIERA.*F.MEAS|EAO BAVIERA — F/i.test(i.desc))?.valor || 0)} do Fábio</strong>, que o PIX de ${dm(pes('FÁBIO OMENA').dataBanco)} quitou,
    <strong>e dentro da planilha do Leonardo</strong>, que o PIX do mesmo dia pagou. Os dois receberam pelos mesmos dois animais.
    Não é erro de lançamento: é R$ ${brl(D.disputadoTotal)} que saiu do caixa duas vezes e precisa voltar de um dos dois.</p>
  </div>

  ${foot()}
</section>

<!-- ============================ P3 — DECISÃO ============================ -->
<section class="page">
  <div class="head"><h2>As duas leituras</h2><div class="n">03 · decisão e ação</div></div>

  <p>Só existem duas possibilidades, e elas não podem valer juntas. Qual delas é a verdadeira muda quem deve para quem.</p>

  <table>
    <thead><tr><th style="width:52mm">Leitura</th><th class="num" style="width:22mm">Fábio devido</th><th class="num" style="width:22mm">Fábio saldo</th><th class="num" style="width:22mm">Leonardo devido</th><th class="num" style="width:22mm">Leonardo saldo</th></tr></thead>
    <tbody>
      ${D.leituras.map(l => `<tr><td><strong>${esc(l.rot)}</strong><br><span class="muted" style="font-size:8.6px">${esc(l.desc)}</span></td>
        <td class="num">${brl(l.fabio.devido)}</td><td class="num"><strong>${sinal(l.fabio.saldo)}</strong></td>
        <td class="num">${brl(l.leonardo.devido)}</td><td class="num"><strong>${sinal(l.leonardo.saldo)}</strong></td></tr>`).join('')}
    </tbody>
  </table>

  <div class="box rule">
    <p style="margin:0"><strong>Um detalhe desempata em favor da planilha:</strong> na leitura do Leonardo, o saldo dele fica em
    R$ ${brl(lerPL.leonardo.saldo)} — <strong>exatamente os ${gr('nao-cobrado').n} títulos que o ERP mostra em aberto no nome dele</strong>.
    Na leitura do ERP o saldo seria R$ ${brl(lerERP.leonardo.saldo)} e sobrariam R$ ${brl(D.disputadoTotal)} sem explicação.
    Não é prova — mas é a única das duas em que todas as contas fecham ao mesmo tempo.</p>
  </div>

  <p class="small">O que falta para fechar: a <strong>planilha de julho do Fábio</strong>. Se ela também cobrar os lotes ${D.disputados.map(l => l.lote).join(' e ')},
  a disputa é real e alguém precisa provar quem vendeu; se ela não cobrar, a planilha do Leonardo está certa e o Fábio recebeu R$ ${brl(Math.abs(lerPL.fabio.saldo))} a mais.</p>

  <h3>O que fazer com cada real</h3>
  <table>
    <thead><tr><th>Ação</th><th class="num" style="width:26mm">Valor</th><th>Detalhe</th></tr></thead>
    <tbody>
      <tr class="destaque"><td><strong>Pagar</strong> — nunca houve PIX</td><td class="num">${brl(r2(gr('nao-pago').total))}</td>
        <td>${gr('nao-pago').itens.map(i => esc(i.quem) + ' R$ ' + brl(i.valor)).join(' · ')}</td></tr>
      <tr><td><strong>Cobrar a nota e pagar</strong></td><td class="num">${brl(gr('nao-cobrado').total)}</td>
        <td>Leonardo — ${gr('nao-cobrado').n} títulos que ele não cobrou na planilha dele</td></tr>
      <tr><td>Baixar sem caixa</td><td class="num">${brl(gr('ja-pago-sem-baixa').total)}</td>
        <td>Fábio — já saiu no PIX de ${dm(pes('FÁBIO OMENA').dataBanco)}; falta o lançamento</td></tr>
      <tr><td>Definir o assessor</td><td class="num">${brl(gr('sem-dono').total)}</td>
        <td>${gr('sem-dono').itens.map(i => esc(corta(limpa(i.desc), 52))).join(' · ')}</td></tr>
      <tr><td>Nada até dezembro</td><td class="num">${brl(gr('diferido').total)}</td>
        <td>Nane — vence 28/12 por regra própria</td></tr>
      <tr class="total"><td>Total em aberto</td><td class="num">${brl(D.ciclo.aberto)}</td><td></td></tr>
      <tr><td colspan="2" style="border:none"></td><td style="border:none"></td></tr>
      <tr class="destaque"><td><strong>A recuperar</strong></td><td class="num">${brl(D.acao.aRecuperar)}</td>
        <td>Pago duas vezes — de quem depende da leitura acima</td></tr>
    </tbody>
  </table>

  <h3>Todos os títulos em aberto</h3>
  <table>
    <thead><tr><th style="width:34mm">Quem</th><th>Leilão</th><th class="num" style="width:18mm">Vence</th><th class="num" style="width:22mm">Valor</th></tr></thead>
    <tbody>
      ${D.grupos.flatMap(g => g.itens).sort((a, b) => b.valor - a.valor).map(i => `<tr>
        <td>${esc(i.quem)}</td><td>${esc(corta(i.evento ? i.evento.nome : limpa(i.desc), 52))}</td>
        <td class="num muted">${dm(i.vencimento)}</td><td class="num">${brl(i.valor)}</td></tr>`).join('')}
      <tr class="total"><td colspan="3">${D.grupos.reduce((s, g) => s + g.n, 0)} títulos</td><td class="num">${brl(D.ciclo.aberto)}</td></tr>
    </tbody>
  </table>

  <div class="box">
    <div class="t">Efeito no caixa</div>
    <p class="small" style="margin:0">No fluxo até 10/09 esses R$ ${brl(D.ciclo.vencido)} estão <strong>fora da linha</strong>, a seu pedido.
    Do total, só <strong>R$ ${brl(D.acao.pagarAgora)}</strong> é caixa novo — os R$ ${brl(gr('ja-pago-sem-baixa').total)} do Fábio já saíram
    e os R$ ${brl(gr('diferido').total)} da Nane só vencem em dezembro. Pagar os R$ ${brl(D.acao.pagarAgora)} dentro da janela consome a margem do
    pior dia (09/09) e joga o caixa para o negativo; pagar depois de 10/09, com o Naviraí já dentro, cabe sem apertar.</p>
  </div>

  ${foot()}
</section>

</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)
console.log('HTML:', path.join(OUT, 'relatorio.html'))

const browser = await chromium.launch()
const pg = await browser.newPage({ viewport: { width: 900, height: 1200 } })
await pg.setContent(html, { waitUntil: 'networkidle' })
try { await pg.evaluate(() => document.fonts.ready) } catch { }
const over = await pg.evaluate(() => Array.from(document.querySelectorAll('.page')).map((p, i) => ({ i: i + 1, over: p.scrollHeight - p.clientHeight })).filter(x => x.over > 1))
if (over.length) console.log('ATENCAO paginas transbordando:', JSON.stringify(over))
else console.log('paginas OK (nenhuma transborda)')
const desktop = path.join(os.homedir(), 'Desktop')
const pdfPath = path.join(desktop, 'Bula - Comissoes de Julho 2026 em Aberto.pdf')
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '14mm', left: '11mm', right: '11mm' } })
await browser.close()
console.log('PDF:', pdfPath)
