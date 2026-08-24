// Análise da parceria Gustavo Rusa REFEITA sobre o acordo padrão real: a tabela
// de performance (comissão da Bula em degraus, conforme a participação da nossa
// cobertura no faturamento do leilão). Gera PDF na Área de Trabalho.
// Uso: node scripts/gera-pdf-analise-rusa-tabela-performance.mjs
import { join } from 'node:path'
import { homedir } from 'node:os'
import { chromium } from 'playwright'

const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = (n) => Math.round(Number(n)).toLocaleString('pt-BR')
const pc = (n, d = 2) => (Number(n) * 100).toFixed(d).replace('.', ',') + '%'
const IMPOSTO = 0.18
const COM_RUSA = 0.05, COM_ASSESSOR = 0.02

// ── O acordo padrão (foto do WhatsApp, 24/08) ────────────────────────────────
// performance = cobertura da Bula ÷ faturamento total do leilão
const TABELA = [
  { de: 0, ate: 0.03, base: 'cobertura', k: 0.05, rot: 'Abaixo de 3%', com: '5% sobre o que vender' },
  { de: 0.03, ate: 0.05, base: 'faturamento', k: 0.003, rot: '3% a 4,9%', com: '0,3% sobre o faturamento' },
  { de: 0.05, ate: 0.126, base: 'faturamento', k: 0.005, rot: '5% a 12,5%', com: '0,5% sobre o faturamento' },
  { de: 0.126, ate: 0.20, base: 'faturamento', k: 0.0075, rot: '12,6% a 19,9%', com: '0,75% sobre o faturamento' },
  { de: 0.20, ate: 0.25, base: 'faturamento', k: 0.01, rot: '20% a 24,9%', com: '1,00% sobre o faturamento' },
  { de: 0.25, ate: 99, base: 'faturamento', k: 0.015, rot: '25% ou mais', com: '1,50% sobre o faturamento' },
]
const faixaDe = (p) => TABELA.find((t) => p >= t.de && p < t.ate)
/** Receita da Bula expressa como % da própria cobertura — é o que se compara com a comissão. */
const efetiva = (p) => { const t = faixaDe(p); return t.base === 'cobertura' ? t.k : t.k / p }
/** Acordo mínimo para uma comissão c se pagar: c ÷ (1 − imposto). */
const be = (c) => c / (1 - IMPOSTO)
const BE5 = be(COM_RUSA), BE2 = be(COM_ASSESSOR)

// Janelas em que os 5% se pagam
const janelas = TABELA.filter((t) => t.base === 'faturamento')
  .map((t) => ({ t, limite: t.k / BE5 }))
  .filter((x) => x.limite > x.t.de)
  .map((x) => ({ de: x.t.de, ate: Math.min(x.t.ate, x.limite), rot: x.t.com }))
const JAN_DE = Math.min(...janelas.map((j) => j.de)), JAN_ATE = Math.max(...janelas.map((j) => j.ate))

// ── Os 29 leilões de 2026 com faturamento total lançado ──────────────────────
const LEILOES = [
  [0.0104, 16500, '8º Fazenda Rio Bonito'], [0.0172, 189000, 'JMP Bezerras'],
  [0.0300, 134100, 'Terra Brava 50 Anos'], [0.0350, 57600, 'LS Collection'],
  [0.0375, 64500, 'Touros Terra Brava'], [0.0384, 564900, 'EAO Baviera Fêmeas'],
  [0.0417, 432600, 'JMP Supreme'], [0.0440, 177000, 'Matrizes Matinha'],
  [0.0443, 783300, '6º Mega EAO Fêmeas'], [0.0513, 220800, 'Jacamim Fêmeas'],
  [0.0772, 234900, 'Guadalupe Touros'], [0.0847, 101400, 'LS Now'],
  [0.0899, 184100, '41º Touros Camparino'], [0.0974, 127200, 'Matrizes de Vanguarda'],
  [0.1036, 70000, 'Nelore São Francisco'], [0.1179, 834000, '6º Mega EAO Touros'],
  [0.1331, 96900, 'Seleção Nelore Floc'], [0.1842, 183000, 'Nelore Tresmar'],
  [0.1844, 4148708.80, 'JMP Touros'], [0.1890, 216000, 'Santa Nazaré'],
  [0.2050, 175200, 'IPB Prime'], [0.2156, 207000, 'Santa Fé'],
  [0.2674, 1102800, '32º Leilão 4R'], [0.3353, 366000, 'Cachoeirão Destaques'],
  [0.3505, 160800, 'Pintado Raiz'], [0.3795, 508500, 'Pérolas Cachoeirão'],
  [0.4024, 456600, 'Flor do Aratau'], [0.5180, 417600, 'Kriz Matrizes'],
  [0.5194, 653700, 'MEAB & Fazenda Modelo'],
]
const dentro = LEILOES.filter(([p]) => p >= JAN_DE && p <= JAN_ATE)
const fora = LEILOES.filter(([p]) => !(p >= JAN_DE && p <= JAN_ATE))
const sv = (a) => a.reduce((s, x) => s + x[1], 0)
const abaixo3 = LEILOES.filter(([p]) => p < 0.03)

// ── Agosto ───────────────────────────────────────────────────────────────────
const AGO = { lotes: 17, vgv: 1628000, com: 76960 }
AGO.pctEfetivo = AGO.com / AGO.vgv
// ── Caixa ────────────────────────────────────────────────────────────────────
const DIAS_RECEB = 45, JUROS_MES = 0.02
const floatRusa = 30, floatAssessor = 5   // dias entre pagar a comissão e receber da leiloeira
const custoFloat = AGO.com * JUROS_MES * (floatRusa - floatAssessor) / 30
const CR_ABERTO = 874813.84

const ck = (n, a, b) => { if (Math.abs(a - b) > 0.0001) throw new Error(`TRAVA ${n}: ${a} != ${b}`) }
ck('break-even 5%', BE5, 0.05 / 0.82)
ck('janela inicia em 3%', JAN_DE, 0.03)
ck('janela termina em 8,2%', Math.round(JAN_ATE * 10000) / 10000, 0.082)
ck('efetiva abaixo de 3%', efetiva(0.02), 0.05)
ck('efetiva em 5%', efetiva(0.05), 0.10)
ck('efetiva em 52%', Math.round(efetiva(0.52) * 10000) / 10000, 0.0288)

// ── Gráfico: a curva do que a Bula realmente recebe ──────────────────────────
const W = 700, H = 250, ML = 46, MR = 88, MT = 14, MB = 34
const PW = W - ML - MR, PH = H - MT - MB
const XMAX = 0.30, YMAX = 0.11
const X = (p) => ML + Math.min(p, XMAX) / XMAX * PW
const Y = (v) => MT + PH - Math.min(v, YMAX) / YMAX * PH
const segmentos = []
for (const t of TABELA) {
  const de = t.de, ate = Math.min(t.ate, XMAX)
  if (de >= XMAX) continue
  const pts = []
  const n = t.base === 'cobertura' ? 2 : 60
  for (let i = 0; i <= n; i++) {
    const p = de + (ate - de) * (i / n)
    if (p <= 0) continue
    pts.push(`${X(p).toFixed(1)},${Y(efetiva(p)).toFixed(1)}`)
  }
  if (pts.length > 1) segmentos.push(pts.join(' '))
}
const grafico = `
<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Receita da Bula como % da própria cobertura, conforme a performance no leilão">
  <rect x="${ML}" y="${MT}" width="${PW}" height="${PH}" fill="#FCFCFB"/>
  <rect x="${X(JAN_DE)}" y="${MT}" width="${X(JAN_ATE) - X(JAN_DE)}" height="${PH}" fill="#C9A84C" opacity="0.16"/>
  <text x="${(X(JAN_DE) + X(JAN_ATE)) / 2}" y="${MT + PH - 20}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#8a6f22">janela dos 5%</text>
  <text x="${(X(JAN_DE) + X(JAN_ATE)) / 2}" y="${MT + PH - 10}" text-anchor="middle" font-size="7.5" fill="#8a6f22">3,0% a 8,2%</text>
  ${[0, 0.025, 0.05, 0.075, 0.10].map((v) => `<line x1="${ML}" y1="${Y(v)}" x2="${ML + PW}" y2="${Y(v)}" stroke="#E7E8EA" stroke-width="1"/>
  <text x="${ML - 6}" y="${Y(v) + 3}" text-anchor="end" font-size="8" fill="#8A8D92">${pc(v, 1)}</text>`).join('')}
  ${[0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30].map((p) => `<text x="${X(p)}" y="${MT + PH + 14}" text-anchor="middle" font-size="8" fill="#8A8D92">${pc(p, 0)}</text>`).join('')}
  <line x1="${ML}" y1="${Y(BE5)}" x2="${ML + PW}" y2="${Y(BE5)}" stroke="#17181A" stroke-width="1.5" stroke-dasharray="5 3"/>
  <text x="${ML + PW + 6}" y="${Y(BE5) - 3}" font-size="8.5" font-weight="700" fill="#17181A">${pc(BE5)} — o que</text>
  <text x="${ML + PW + 6}" y="${Y(BE5) + 7}" font-size="8.5" font-weight="700" fill="#17181A">os 5% exigem</text>
  <line x1="${ML}" y1="${Y(BE2)}" x2="${ML + PW}" y2="${Y(BE2)}" stroke="#8A8D92" stroke-width="1" stroke-dasharray="2 3"/>
  <text x="${ML + PW + 6}" y="${Y(BE2) + 3}" font-size="8" fill="#5B5E63">${pc(BE2)} — os 2%</text>
  ${segmentos.map((s) => `<polyline points="${s}" fill="none" stroke="#17181A" stroke-width="2" stroke-linejoin="round"/>`).join('')}
  ${LEILOES.filter(([p]) => p <= XMAX).map(([p, c]) => `<circle cx="${X(p)}" cy="${Y(efetiva(p))}" r="3.6" fill="#17181A" stroke="#FCFCFB" stroke-width="2"/>`).join('')}
  <text x="${ML + PW - 4}" y="${MT + 12}" text-anchor="end" font-size="7.5" fill="#8A8D92">${LEILOES.filter(([p]) => p > XMAX).length} leilões acima de 30% ficam fora do gráfico — todos abaixo da linha</text>
  <text x="${ML + PW / 2}" y="${H - 3}" text-anchor="middle" font-size="8" fill="#5B5E63">performance da Bula no leilão (nossa cobertura ÷ faturamento total)</text>
  <text x="${ML - 6}" y="${MT - 3}" text-anchor="end" font-size="7.5" fill="#5B5E63">receita ÷ cobertura</text>
</svg>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Parceria Gustavo Rusa sob o acordo de performance</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, -apple-system, Segoe UI, sans-serif; color: #17181A; font-size: 9px; line-height: 1.45; margin: 0; }
  h1 { font-family: Oswald, Inter, sans-serif; text-transform: uppercase; letter-spacing: .04em; font-size: 21px; font-weight: 600; margin: 0 0 3px; }
  h2 { font-family: Oswald, Inter, sans-serif; text-transform: uppercase; letter-spacing: .05em; font-size: 11px; font-weight: 600; margin: 17px 0 7px; padding-bottom: 3px; border-bottom: 1px solid #17181A; }
  .meta { color: #5B5E63; font-size: 8.5px; }
  .accent { height: 3px; width: 54px; background: #C9A84C; margin-top: 7px; }
  .resumo { display: flex; gap: 8px; margin: 13px 0 4px; }
  .card { flex: 1; border: 1px solid #D9DADD; border-radius: 4px; padding: 9px 11px; }
  .card .lbl { font-size: 7.2px; text-transform: uppercase; letter-spacing: .05em; color: #5B5E63; }
  .card .num { font-size: 17px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .card .qt { font-size: 7.4px; color: #8A8D92; margin-top: 3px; line-height: 1.4; }
  .card.total { background: #17181A; color: #fff; border-color: #17181A; }
  .card.total .lbl, .card.total .qt { color: #B9BBBF; }
  .card.warn { border-top: 3px solid #C9A84C; }
  table { width: 100%; border-collapse: collapse; font-size: 8.3px; }
  th { text-align: left; font-size: 7.4px; text-transform: uppercase; letter-spacing: .04em; color: #5B5E63; font-weight: 600; border-bottom: 1px solid #17181A; padding: 4px 4px; }
  td { padding: 3.6px 4px; border-bottom: .5px solid #E7E8EA; vertical-align: top; }
  tr { break-inside: avoid; }
  .val { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.val { text-align: right; }
  .neg { color: #B3261E; font-weight: 600; }
  .pos { font-weight: 600; }
  .exp { color: #5B5E63; font-size: 7.9px; }
  .cp { color: #4A4C50; }
  tfoot td { border-top: 1.5px solid #17181A; border-bottom: none; font-weight: 700; padding-top: 6px; }
  tr.ok td { background: #FBF8EF; }
  .fig { border: 1px solid #E7E8EA; border-radius: 4px; padding: 8px 8px 4px; margin-top: 6px; break-inside: avoid; }
  .nota { margin-top: 13px; padding: 10px 12px; background: #F6F6F4; border-left: 3px solid #C9A84C; font-size: 8.4px; color: #3A3C40; border-radius: 0 3px 3px 0; break-inside: avoid; }
  .nota ul { margin: 5px 0 0; padding-left: 15px; }
  .nota li { margin-bottom: 4px; }
  .nota strong { color: #17181A; }
  .form { font-family: ui-monospace, Consolas, monospace; font-size: 9.5px; background: #fff; border: 1px solid #17181A; padding: 7px 10px; border-radius: 3px; display: inline-block; margin: 5px 0; }
  footer { margin-top: 17px; padding-top: 7px; border-top: .5px solid #D9DADD; color: #8A8D92; font-size: 7.5px; display: flex; justify-content: space-between; }
</style></head><body>

<h1>Rusa sob o acordo de performance</h1>
<div class="meta">Bula Assessoria · <strong>24/08/2026</strong> · análise refeita sobre a tabela padrão de comissão por performance, o prazo real de recebimento (≈ ${DIAS_RECEB} dias) e o fato de que o Rusa recebe no <strong>mesmo mês</strong> da venda</div>
<div class="accent"></div>

<div class="resumo">
  <div class="card total"><div class="lbl">Os 5% só se pagam quando a performance fica entre</div><div class="num">${pc(JAN_DE, 1)} e ${pc(JAN_ATE, 1)}</div><div class="qt">Fora dessa janela o lote dele destrói margem — inclusive abaixo de 3%, onde recebemos exatamente os mesmos 5% que pagaríamos a ele.</div></div>
  <div class="card warn"><div class="lbl">Dos nossos leilões medidos, caem na janela</div><div class="num">${(dentro.length / LEILOES.length * 100).toFixed(0)}%</div><div class="qt">${dentro.length} de ${LEILOES.length} leilões · e só <strong>${pc(sv(dentro) / (sv(dentro) + sv(fora)), 1)} do VGV</strong>. Quatro em cada cinco reais vendidos estão fora.</div></div>
  <div class="card"><div class="lbl">Não dá para medir o resto</div><div class="num">72%</div><div class="qt">dos fechamentos não têm o faturamento do leilão lançado — inclusive <strong>13 dos leilões com lote dele</strong>.</div></div>
</div>

<h2>1. O acordo padrão é um degrau, e isso muda tudo</h2>
<p class="exp" style="margin:0 0 5px">A comissão que a leiloeira nos paga depende da nossa <strong>performance</strong> no leilão — quanto do faturamento total passou pela cobertura da Bula. Abaixo de 3% ela é calculada sobre o que vendemos; a partir daí, sobre o faturamento inteiro do pregão:</p>
<table>
<thead><tr><th style="width:16%">Performance</th><th style="width:24%">O que a Bula recebe</th><th class="val" style="width:15%">No início da faixa</th><th class="val" style="width:15%">No fim da faixa</th><th>Leitura</th></tr></thead>
<tbody>
${TABELA.map((t) => {
  const ini = efetiva(Math.max(t.de, 0.001)), fim = efetiva(Math.min(t.ate, 0.55) - 0.0001)
  const paga = ini > BE5
  return `<tr class="${paga ? 'ok' : ''}"><td><strong>${t.rot}</strong></td><td class="cp">${t.com}</td><td class="val">${pc(ini)}</td><td class="val">${pc(t.ate > 1 ? 0.0288 : fim)}</td><td class="exp">${t.base === 'cobertura'
    ? 'Rende <strong>exatamente 5,00%</strong> da cobertura, sempre. É idêntico ao que o Rusa cobra — sobra zero e ainda há 18% de imposto.'
    : paga ? 'Começa acima da linha dos 5% e vai caindo conforme a performance sobe.' : 'A faixa inteira rende menos do que os 5% custam.'}</td></tr>`
}).join('')}
</tbody></table>
<div class="meta" style="margin-top:5px">Os valores das duas colunas de percentual são a receita expressa <strong>como % da nossa própria cobertura</strong> — é assim que ela fica comparável com a comissão que pagamos.</div>

<h2>2. A conta e a linha que ela desenha</h2>
<div class="form">margem = cobertura × ( 0,82 × taxa efetiva − comissão )&nbsp;&nbsp;→&nbsp;&nbsp;zera em taxa = comissão ÷ 0,82</div>
<p class="exp" style="margin:3px 0 0">Com 18% de imposto sobre a receita, uma comissão de <strong>5% exige que o leilão renda ${pc(BE5)}</strong> da cobertura; a de 2% exige apenas ${pc(BE2)}. A curva abaixo é o que a tabela realmente entrega — dente de serra: salta a cada limiar e decai dentro da faixa. Cada ponto é um leilão nosso de 2026.</p>
<div class="fig">${grafico}</div>

<h2>3. Onde nossos leilões caem de fato</h2>
<table>
<thead><tr><th style="width:34%">Situação</th><th class="val" style="width:10%">Leilões</th><th class="val" style="width:14%">Cobertura</th><th class="val" style="width:10%">% do VGV</th><th>O que significa para os 5%</th></tr></thead>
<tbody>
<tr class="ok"><td><strong>Dentro da janela (${pc(JAN_DE, 1)}–${pc(JAN_ATE, 1)})</strong></td><td class="val">${dentro.length}</td><td class="val">${brl0(sv(dentro))}</td><td class="val">${pc(sv(dentro) / (sv(dentro) + sv(fora)), 1)}</td><td class="exp">Aqui os 5% se pagam. Inclui o EAO Baviera Fêmeas (${pc(0.0384)}) e o Guadalupe Touros (${pc(0.0772)}).</td></tr>
<tr><td><strong>Abaixo de 3%</strong></td><td class="val">${abaixo3.length}</td><td class="val">${brl0(sv(abaixo3))}</td><td class="val">${pc(sv(abaixo3) / (sv(dentro) + sv(fora)), 1)}</td><td class="exp"><strong>O pior caso.</strong> Recebemos 5% do que vendemos e pagaríamos 5% a ele — a Bula fica com o imposto para pagar e nada mais.</td></tr>
<tr><td><strong>Acima de ${pc(JAN_ATE, 1)}</strong></td><td class="val">${fora.length - abaixo3.length}</td><td class="val">${brl0(sv(fora) - sv(abaixo3))}</td><td class="val">${pc((sv(fora) - sv(abaixo3)) / (sv(dentro) + sv(fora)), 1)}</td><td class="exp">Quanto melhor a nossa performance, <strong>menos</strong> cada real de cobertura rende — a receita é do faturamento, não da cobertura. No Kriz e no MEAB (${pc(0.518, 1)}) rende ${pc(efetiva(0.518))}.</td></tr>
</tbody>
<tfoot><tr><td>Total medido</td><td class="val">${LEILOES.length}</td><td class="val">${brl0(sv(dentro) + sv(fora))}</td><td class="val">100%</td><td></td></tr></tfoot>
</table>

<h2>4. O que realmente paga volume: o salto de faixa</h2>
<p class="exp" style="margin:0 0 5px">Dentro de uma faixa, um lote a mais quase não muda a receita — ela é uma fatia do faturamento do leilão, não da nossa cobertura. <strong>O que paga é cruzar o limiar</strong>, e aí o ganho é grande e imediato. Num leilão de R$ 10 milhões:</p>
<table>
<thead><tr><th style="width:16%">Cruzar</th><th class="val" style="width:15%">Receita antes</th><th class="val" style="width:15%">Receita depois</th><th class="val" style="width:12%">Ganho</th><th>Leitura</th></tr></thead>
<tbody>
${TABELA.slice(0, -1).map((t, i) => {
  const prox = TABELA[i + 1], p = prox.de, F = 10000000
  const antes = t.base === 'cobertura' ? t.k * p * F : t.k * F
  const dep = prox.k * F
  return `<tr><td><strong>${pc(p, 1)}</strong></td><td class="val">${brl0(antes)}</td><td class="val">${brl0(dep)}</td><td class="val pos">+${((dep / antes - 1) * 100).toFixed(0)}%</td><td class="exp">${i === 0 ? 'A receita <strong>dobra</strong>. É o limiar mais valioso de todos.' : `Vale R$ ${brl0(dep - antes)} de uma vez — muito mais do que a comissão do lote que fez cruzar.`}</td></tr>`
}).join('')}
</tbody></table>
<div class="nota" style="border-left-color:#17181A">
<strong>É aqui que o Rusa vale o que cobra — e só aqui.</strong> Um lote grande dele perto de um limiar pode valer várias vezes a comissão: no exemplo acima, cruzar 5% rende R$ 20.000 de receita nova, e um lote de R$ 200.000 que faça isso custa R$ 10.000 de comissão. <strong>Longe do limiar, o mesmo lote custa 5% e traz quase nada.</strong> A pergunta certa deixou de ser "vale a pena o Rusa?" e passou a ser <strong>"este leilão está perto de subir de faixa?"</strong> — e essa pergunta só se responde com o faturamento do leilão lançado.
</div>

<h2>5. O caixa: ele recebe no mês, nós em ${DIAS_RECEB} dias</h2>
<table>
<thead><tr><th style="width:26%"></th><th style="width:20%">Quando sai / entra</th><th class="val" style="width:16%">Dias de descoberto</th><th>Efeito</th></tr></thead>
<tbody>
<tr><td><strong>Comissão do Rusa</strong></td><td>no mês da própria venda</td><td class="val neg">≈ ${floatRusa} dias</td><td class="exp">Pagamos antes de a leiloeira nos pagar.</td></tr>
<tr><td>Comissão dos assessores</td><td>dia 25 do mês seguinte</td><td class="val">≈ ${floatAssessor} dias</td><td class="exp">Cai praticamente junto com o recebimento.</td></tr>
<tr><td>Recebimento da leiloeira</td><td>leilão + ${DIAS_RECEB} dias</td><td class="val">—</td><td class="exp">Média real medida nas contas a receber ligadas a fechamento: vencimento em +47, recebimento em +41.</td></tr>
</tbody></table>
<div class="nota"><ul>
<li><strong>Em dinheiro, o adiantamento é o menor dos problemas.</strong> Sobre os R$ ${brl(AGO.com)} de agosto, os ~${floatRusa - floatAssessor} dias a mais de descoberto custam cerca de <strong>R$ ${brl(custoFloat)}</strong> a 2% ao mês. A diferença de taxa (5% em vez de 2%) custa <strong>R$ ${brl(AGO.vgv * (COM_RUSA - COM_ASSESSOR))}</strong> nos mesmos lotes — <strong>${Math.round(AGO.vgv * (COM_RUSA - COM_ASSESSOR) / custoFloat)} vezes mais</strong>. O problema é a taxa, não a data.</li>
<li><strong>Mas a data carrega o risco.</strong> Pagando antes de receber, a Bula assume sozinha o risco da leiloeira: se ela atrasar ou não pagar, os 5% já saíram. Hoje há <strong>R$ ${brl(CR_ABERTO)}</strong> de contas a receber em aberto ligadas a fechamento. Ele não tem exposição nenhuma a isso.</li>
<li>E cai no pior dia: o vencimento dele coincide com a virada do mês, e o dia 25 já é o mais apertado do caixa.</li>
</ul></div>

<h2>6. O que eu faria</h2>
<table>
<thead><tr><th style="width:26%">Medida</th><th>Por quê</th></tr></thead>
<tbody>
<tr><td><strong>1. Lançar o faturamento total de todo leilão</strong></td><td class="exp">É a peça que falta em <strong>72% dos fechamentos</strong> — e sem ela não se sabe em que faixa o leilão caiu, nem quanto a leiloeira deve, nem se valeu pagar 5%. Hoje a Bula não consegue conferir a própria receita. <strong>Antes de renegociar qualquer coisa, é isto.</strong></td></tr>
<tr><td><strong>2. Trocar a taxa fixa por uma regra de faixa</strong></td><td class="exp">5% quando a performance do leilão ficar entre ${pc(JAN_DE, 1)} e ${pc(JAN_ATE, 1)}; 2% fora dela. É conhecido no fechamento, é verificável, e alinha o que ele ganha com o que a Bula ganha. Aplicado a 2026, valeria em ${pc(sv(dentro) / (sv(dentro) + sv(fora)), 1)} do VGV.</td></tr>
<tr><td><strong>3. Prêmio por cruzar limiar</strong></td><td class="exp">Se o objetivo é usá-lo para subir de faixa, pague por isso: um bônus quando o leilão cruzar um limiar por causa dos lotes dele. Custa uma fração do ganho (cruzar 5% num leilão de 10 mi rende 20.000) e transforma a parceria em algo que a Bula quer comprar.</td></tr>
<tr><td><strong>4. Alinhar a data ao recebimento</strong></td><td class="exp">Passar o vencimento dele para o dia 25 do mês seguinte, como todo mundo. Vale pouco em juros, mas tira da Bula o financiamento e divide o risco da leiloeira.</td></tr>
</tbody></table>

<h2>7. Ressalvas</h2>
<div class="nota"><ul>
<li><strong>A tabela nem sempre foi aplicada.</strong> Ela bate exato em alguns leilões (Guadalupe Touros: ${pc(0.0772)} → 0,5% × 3.043.180 = R$ 15.215,90; Jacamim: ${pc(0.0513)} → 0,5% × 4.301.900 = R$ 21.509,50), mas vários de 2026 correram em acordos próprios — JMP a 0,5% fixo, EAO a 0,33%, e alguns numa tabela mais generosa que chega a 2,0%. A análise usa a tabela padrão como <strong>regra daqui para a frente</strong>; o histórico é o que está no gráfico.</li>
<li><strong>Agosto não dá para fechar ainda.</strong> Nenhum dos leilões de agosto com lote dele tem o faturamento lançado, então não se sabe a faixa de nenhum — e é por isso que os R$ ${brl(AGO.com)} que ele cobra não têm resposta definitiva hoje. Lançar os faturamentos de agosto resolve.</li>
<li><strong>Um lote a mais também mexe no denominador.</strong> Se o comprador dele não teria comprado sem ele, o faturamento do leilão também sobe — o efeito sobre a performance é menor do que parece, mas a receita das faixas de faturamento sobe junto. Nos dois casos a conclusão não muda: <strong>o valor está no salto de faixa, não no lote.</strong></li>
<li>Não entra aqui o valor de relação com a leiloeira: cobertura alta é o que sustenta o contrato, e lote grande aparece no resultado do pregão. Isso é real e não está na margem.</li>
</ul></div>

<footer><span>Bula Assessoria — documento interno de decisão</span><span>Gerado em 24/08/2026 · tabela de performance conforme o padrão vigente · 29 leilões de 2026 com faturamento lançado</span></footer>
</body></html>`

const outPath = join(homedir(), 'Desktop', 'Analise-Rusa-Acordo-Performance-2026.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: outPath, format: 'A4', printBackground: true })
if (process.env.PNG) { await page.setViewportSize({ width: 900, height: 1400 }); await page.screenshot({ path: process.env.PNG, fullPage: false }) }
await browser.close()
console.log('PDF:', outPath)
console.log(`Janela dos 5%: ${pc(JAN_DE, 1)} a ${pc(JAN_ATE, 1)} | break-even ${pc(BE5)} | dentro: ${dentro.length}/${LEILOES.length} leilões, ${pc(sv(dentro) / (sv(dentro) + sv(fora)), 1)} do VGV`)
console.log(`Float: ${brl(custoFloat)} contra ${brl(AGO.vgv * (COM_RUSA - COM_ASSESSOR))} de diferença de taxa`)
