// Análise: compensa pagar 5% de comissão ao parceiro Gustavo Rusa?
// Gera PDF na Área de Trabalho. Números apurados por scripts/analise-parceria-rusa-2026.mjs
// (2026, lotes com receita_bula lançada) e pela planilha "RUSA - AGOSTO.xlsx".
// Uso: node scripts/gera-pdf-analise-rusa-2026.mjs
import { join } from 'node:path'
import { homedir } from 'node:os'
import { chromium } from 'playwright'

const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = (n) => Math.round(Number(n)).toLocaleString('pt-BR')
const pc = (n, d = 2) => (Number(n) * 100).toFixed(d).replace('.', ',') + '%'
const IMPOSTO = 0.18

// ── Apurado em 2026 (só leilões com receita_bula lançada) ────────────────────
const R = { vgv: 1131000, receita: 92462.33, com: 56550, pct: 0.05 }
const A = { vgv: 17314108.80, receita: 930727.59, com: 346282.18, pct: 0.02 }
for (const x of [R, A]) {
  x.imposto = x.receita * IMPOSTO
  x.margem = x.receita - x.com - x.imposto
  x.fatiaCom = x.com / x.receita
  x.fatiaBula = x.margem / x.receita
  x.margemPorMi = x.margem / x.vgv * 1e6
  x.taxaAcordo = x.receita / x.vgv
}
// break-even: margem = VGV × (0,82·t − c) = 0  →  t = c / 0,82
const be = (c) => c / (1 - IMPOSTO)

// ── Agosto: o que ele está cobrando ──────────────────────────────────────────
const AGO = { lotes: 17, vgv: 1628000, com: 76960 }
AGO.pctEfetivo = AGO.com / AGO.vgv
const cenario = (t, c) => AGO.vgv * ((1 - IMPOSTO) * t - c)
const ACORDO_MEDIANA = 0.05, ACORDO_POND = 0.055

const LOTES = [
  ['05/07', 'Naviraí Matrizes', 2, 85500, 0.05, 4275, 4275, -769.50],
  ['11/07', 'EAO Baviera Fêmeas', 6, 262500, 0.086, 22563.43, 13125, 5377.01],
  ['16/07', 'Naviraí 2ª etapa', 1, 27600, 0.05, 1380, 1380, -248.40],
  ['20/07', 'Guadalupe Touros (seg)', 2, 64200, 0.05, 3210, 3210, -577.80],
  ['25/07', 'Genética Aditiva Fêmeas', 3, 56700, 0.1114, 6318.90, 2835, 2346.50],
  ['07/08', '2º LS Galeria', 2, 456000, 0.1004, 45790, 22800, 14747.80],
  ['08/08', '14º Pérolas do Tapajós', 1, 90000, 0.05, 4500, 4500, -810.00],
  ['09/08', 'Nelore Paranã Produtividade', 2, 88500, 0.05, 4425, 4425, -796.50],
]

const COMPRADORES = [
  ['Diego Benitah Batista', 'Faz. Paraíso do Acará / Nelore FPA', 19, 1820100, '25/01', 'jan, mar, abr, mai, jun, ago', 'recorrente'],
  ['Dr. Celso Lopes', 'Nelore Grão Pará / Flor de Minas', 28, 1118100, '02/05', 'mai, jun, jul, ago', 'recorrente'],
  ['José Fabio', 'Nelore Pérola', 9, 1176000, '16/08', 'ago', 'novo'],
  ['Itajaí / Parazão', 'Welton Borges de Miranda', 7, 788000, '19/04', 'abr, mai, jun', 'parou'],
  ['Alfredo José Cardoso', 'Faz. Galopeira', 3, 263309, '14/04', 'abr, jun, ago', 'esporádico'],
  ['Pedro Pontes', 'Nelore São Caetano', 4, 131500, '06/06', 'jun, jul', 'esporádico'],
  ['Anésio Santarém', 'Faz. Córrego da Onça', 2, 64200, '20/07', 'jul', 'esporádico'],
]

const SENS = [0.03, 0.04, ACORDO_MEDIANA, be(AGO.pctEfetivo), 0.07, 0.08, 0.10]
const CEN = [
  ['Manter 5% (o que ele cobra hoje)', AGO.pctEfetivo, be(AGO.pctEfetivo)],
  ['Baixar para 3%', 0.03, be(0.03)],
  ['Igualar aos assessores: 2%', 0.02, be(0.02)],
]

const ck = (n, a, b) => { if (Math.abs(a - b) > 0.02) throw new Error(`TRAVA ${n}: ${a} != ${b}`) }
ck('margem Rusa', R.margem, 19269.11)
ck('margem assessores', A.margem, 416914.45)
ck('break-even Rusa', be(0.05), 0.0609756)
ck('agosto a 5%', cenario(ACORDO_MEDIANA, AGO.pctEfetivo), -10212)
ck('soma lote a lote', LOTES.reduce((s, l) => s + l[7], 0), R.margem)
ck('VGV lote a lote', LOTES.reduce((s, l) => s + l[3], 0), R.vgv)

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Parceria Gustavo Rusa — Vale os 5%?</title>
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
  .cp { color: #4A4C50; }
  .exp { color: #5B5E63; font-size: 7.9px; }
  tfoot td { border-top: 1.5px solid #17181A; border-bottom: none; font-weight: 700; padding-top: 6px; }
  tr.destaque td { background: #F6F6F4; font-weight: 700; }
  .tag { display: inline-block; font-size: 6.6px; text-transform: uppercase; letter-spacing: .04em; border: .5px solid #C3C5C8; color: #6B6E73; padding: 0 4px; border-radius: 2px; white-space: nowrap; }
  .tag.novo { border-color: #C9A84C; color: #9c7f2f; font-weight: 700; }
  .tag.rec { border-color: #17181A; color: #17181A; font-weight: 700; }
  .nota { margin-top: 13px; padding: 10px 12px; background: #F6F6F4; border-left: 3px solid #C9A84C; font-size: 8.4px; color: #3A3C40; border-radius: 0 3px 3px 0; break-inside: avoid; }
  .nota ul { margin: 5px 0 0; padding-left: 15px; }
  .nota li { margin-bottom: 4px; }
  .nota strong { color: #17181A; }
  .form { font-family: ui-monospace, Consolas, monospace; font-size: 9.5px; background: #fff; border: 1px solid #17181A; padding: 7px 10px; border-radius: 3px; display: inline-block; margin: 5px 0; }
  footer { margin-top: 17px; padding-top: 7px; border-top: .5px solid #D9DADD; color: #8A8D92; font-size: 7.5px; display: flex; justify-content: space-between; }
</style></head><body>

<h1>Parceria Gustavo Rusa — vale os 5%?</h1>
<div class="meta">Bula Assessoria · análise de <strong>24/08/2026</strong> · base: todos os lotes dele em 2026 com receita já lançada, mais a planilha "RUSA - AGOSTO.xlsx" que ele enviou hoje</div>
<div class="accent"></div>

<div class="resumo">
  <div class="card warn"><div class="lbl">De cada R$ 100 que os lotes dele geram</div><div class="num">R$ ${brl(R.fatiaCom * 100)}</div><div class="qt">ficam com o Rusa.<br>Imposto leva 18,00 · <strong>a Bula fica com R$ ${brl(R.fatiaBula * 100)}</strong></div></div>
  <div class="card"><div class="lbl">Mesma conta num lote de assessor</div><div class="num">R$ ${brl(A.fatiaCom * 100)}</div><div class="qt">ficam com o assessor.<br>Imposto 18,00 · <strong>a Bula fica com R$ ${brl(A.fatiaBula * 100)}</strong></div></div>
  <div class="card total"><div class="lbl">Acordo mínimo para os 5% se pagarem</div><div class="num">${pc(be(0.05))}</div><div class="qt">O acordo mediano da Bula com as leiloeiras é <strong>5,00%</strong>.<br>Abaixo de ${pc(be(0.05))} o lote dá prejuízo.</div></div>
</div>

<div class="nota" style="border-left-color:#17181A;margin-top:10px">
<strong>Resposta curta: sim, ele está ganhando mais que a Bula — quase três vezes mais.</strong> Nos lotes dele em 2026 a Bula ficou com R$ ${brl(R.margem)} e ele levou R$ ${brl(R.com)}. Mas o problema não é o número dele isolado: é que <strong>a 5% o lote só se paga se a leiloeira estiver pagando mais de ${pc(be(0.05))}</strong> — e mais da metade dos nossos acordos paga 5,00%. Nesses, o lote dá prejuízo <em>mesmo que a venda não existisse sem ele</em>.
</div>

<h2>1. A conta que decide</h2>
<p class="exp" style="margin:0 0 4px">Num lote de VGV <em>V</em>, com acordo de <em>t</em> sobre a cobertura e comissão <em>c</em>, o que sobra para a Bula é a receita menos a comissão menos os 18% de imposto sobre a receita:</p>
<div class="form">margem = V × ( 0,82 × t − c )</div>
<p class="exp" style="margin:4px 0 8px">Ela zera quando <strong>t = c ÷ 0,82</strong>. É o acordo mínimo que cada percentual de comissão exige:</p>
<table>
<thead><tr><th style="width:26%">Comissão</th><th class="val" style="width:18%">Acordo mínimo</th><th>Leitura</th></tr></thead>
<tbody>
<tr><td><strong>Gustavo Rusa — 5%</strong></td><td class="val neg">${pc(be(0.05))}</td><td class="exp">Acima da mediana da casa (5,00%) e acima da média ponderada (${pc(ACORDO_POND)}). <strong>Na maioria dos leilões o lote dele nasce no vermelho.</strong></td></tr>
<tr><td>Assessor — 2%</td><td class="val pos">${pc(be(0.02))}</td><td class="exp">Praticamente qualquer acordo cobre. Por isso a operação com assessor sustenta a casa.</td></tr>
<tr><td>Hipótese 3%</td><td class="val">${pc(be(0.03))}</td><td class="exp">Ainda abaixo da mediana — o lote continua se pagando na maior parte dos leilões.</td></tr>
</tbody></table>

<h2>2. O que de fato aconteceu em 2026</h2>
<p class="exp" style="margin:0 0 6px">Todos os lotes com receita já lançada. A receita de cada lote é a parte que lhe cabe do acordo do leilão (proporcional ao VGV de cobertura).</p>
<table>
<thead><tr><th style="width:22%"></th><th class="val">VGV</th><th class="val">Receita gerada</th><th class="val">Comissão</th><th class="val">Imposto 18%</th><th class="val">Sobra da Bula</th><th class="val">Margem / R$ 1 mi</th></tr></thead>
<tbody>
<tr><td><strong>Lotes do Rusa (5%)</strong></td><td class="val">${brl0(R.vgv)}</td><td class="val">${brl(R.receita)}</td><td class="val neg">${brl(R.com)}</td><td class="val">${brl(R.imposto)}</td><td class="val">${brl(R.margem)}</td><td class="val">${brl(R.margemPorMi)}</td></tr>
<tr><td><strong>Lotes de assessor (2%)</strong></td><td class="val">${brl0(A.vgv)}</td><td class="val">${brl(A.receita)}</td><td class="val">${brl(A.com)}</td><td class="val">${brl(A.imposto)}</td><td class="val pos">${brl(A.margem)}</td><td class="val pos">${brl(A.margemPorMi)}</td></tr>
<tr class="destaque"><td>Divisão de cada R$ 100 de receita</td><td class="val" colspan="2">Rusa: <strong>${brl(R.fatiaCom * 100)}</strong> · Bula: ${brl(R.fatiaBula * 100)}</td><td class="val" colspan="4">Assessor: ${brl(A.fatiaCom * 100)} · Bula: <strong>${brl(A.fatiaBula * 100)}</strong></td></tr>
</tbody></table>
<div class="meta" style="margin-top:6px">Ele responde por <strong>${pc(R.vgv / (R.vgv + A.vgv))} do VGV</strong> e por <strong>${pc(R.com / (R.com + A.com))} do custo de comissão</strong> da casa. Os mesmos lotes dele, pagos a 2%, teriam deixado <strong>R$ ${brl(R.receita - R.vgv * 0.02 - R.imposto)}</strong> em vez de R$ ${brl(R.margem)} — diferença de <strong>R$ ${brl(R.vgv * 0.03)}</strong>.</div>

<h2>3. Leilão a leilão — onde ganha e onde perde</h2>
<table>
<thead><tr><th style="width:6%">Data</th><th style="width:26%">Leilão</th><th class="val">Lotes</th><th class="val">VGV</th><th class="val">Acordo</th><th class="val">Receita</th><th class="val">Rusa 5%</th><th class="val">Margem Bula</th></tr></thead>
<tbody>
${LOTES.map(([d, n, l, v, t, rec, com, m]) => `<tr><td>${d}</td><td>${n}</td><td class="val">${l}</td><td class="val">${brl0(v)}</td><td class="val">${pc(t)}</td><td class="val">${brl(rec)}</td><td class="val">${brl(com)}</td><td class="val ${m < 0 ? 'neg' : 'pos'}">${brl(m)}</td></tr>`).join('')}
</tbody>
<tfoot><tr><td colspan="3">8 leilões</td><td class="val">${brl0(R.vgv)}</td><td class="val">${pc(R.taxaAcordo)}</td><td class="val">${brl(R.receita)}</td><td class="val">${brl(R.com)}</td><td class="val">${brl(R.margem)}</td></tr></tfoot>
</table>
<div class="meta" style="margin-top:6px"><strong>Cinco dos oito leilões dão prejuízo</strong> — são exatamente os de acordo 5,00%. O resultado positivo do conjunto vem de dois eventos de acordo alto (LS Galeria a ${pc(0.1004)} e EAO Baviera a ${pc(0.086)}). Tirando esses dois, os outros seis somam <strong>margem negativa</strong>. A conta dele depende de cair em leilão bom, não da parceria em si.</div>

<h2>4. A planilha de agosto — R$ ${brl(AGO.com)} em um mês</h2>
<p class="exp" style="margin:0 0 6px">${AGO.lotes} lotes · VGV ${brl0(AGO.vgv)} · comissão média ${pc(AGO.pctEfetivo)} (ele aplicou 3% em cinco lotes e 5% nos demais). Como a receita da maioria desses leilões ainda não foi lançada, o resultado depende do acordo de cada um:</p>
<table>
<thead><tr><th style="width:26%">Se o acordo médio de agosto for…</th><th class="val" style="width:16%">Receita gerada</th><th class="val" style="width:16%">Margem da Bula</th><th>Leitura</th></tr></thead>
<tbody>
${SENS.map((t) => {
  const m = cenario(t, AGO.pctEfetivo)
  const destaque = Math.abs(t - ACORDO_MEDIANA) < 0.0001
  return `<tr class="${destaque ? 'destaque' : ''}"><td>${pc(t)}${destaque ? ' — a <strong>mediana</strong> da casa' : ''}${Math.abs(t - be(AGO.pctEfetivo)) < 0.0001 ? ' — o ponto de equilíbrio' : ''}</td><td class="val">${brl(AGO.vgv * t)}</td><td class="val ${m < 0 ? 'neg' : 'pos'}">${brl(m)}</td><td class="exp">${m < -1 ? 'A Bula paga para vender.' : Math.abs(m) < 1 ? 'Empata — trabalha de graça.' : 'Sobra alguma coisa.'}</td></tr>`
}).join('')}
</tbody></table>
<div class="meta" style="margin-top:6px">No cenário mais provável (acordo de 5%, a mediana), agosto <strong>custa R$ ${brl(Math.abs(cenario(ACORDO_MEDIANA, AGO.pctEfetivo)))} à Bula</strong> em vez de render.</div>

<h2>5. Três coisas na planilha dele que precisam de resposta</h2>
<table>
<thead><tr><th style="width:24%">Ponto</th><th class="val" style="width:11%">Valor</th><th>O que achamos</th></tr></thead>
<tbody>
<tr><td><strong>Lote 29 de 21/08 é de outro direcionador</strong></td><td class="val">2.610,00</td><td class="exp">Ele cobra o lote 29 do Matrizes Premium Colonial como dele. A mensagem do grupo, gravada no dia, diz <strong>"Com direcionamento técnico Erik Monteiro"</strong> — não Rusa. E registra parcela <strong>2.600</strong>, não 2.900 (VGV 78.000 e não 87.000). <strong>Não pagar sem esclarecer.</strong></td></tr>
<tr><td><strong>Três leilões não existem no sistema</strong></td><td class="val">24.400,00</td><td class="exp">São Geraldo e 7P Agro 01/08 (lote 1000, 200.000), Reservas Santa Nice 19/08 (lote 4, 216.000) e Matrizes Premium Colonial 21/08 (lote 29, 87.000) — R$ 503.000 de VGV sem fechamento lançado. É o "faltam leilões" dele, mas ao contrário: <strong>falta cadastrar do nosso lado</strong> antes de conferir. O de 19/08 tem captura no grupo; os outros dois não.</td></tr>
<tr><td><strong>Ele mesmo já usa 3%</strong></td><td class="val">—</td><td class="exp">Cinco lotes (Fazenda Araras, Matrizes Premium Colonial e os dois do Pepitas Colonial) vêm a <strong>3%</strong> na planilha dele, não 5%. A taxa já é tratada como negociável por leilão — <strong>é a brecha para renegociar o resto</strong>.</td></tr>
</tbody></table>

<h2>6. Quem são os compradores dele</h2>
<p class="exp" style="margin:0 0 6px">Aqui está a parte que a conta sozinha não mostra: pagar 5% para <em>abrir</em> um comprador é uma coisa; pagar 5% para sempre num comprador que já compra todo mês pela Bula é outra.</p>
<table>
<thead><tr><th style="width:20%">Comprador</th><th style="width:22%">Fazenda / projeto</th><th class="val">Lotes</th><th class="val">VGV 2026</th><th class="val">1ª compra</th><th>Meses ativos</th><th style="width:10%"></th></tr></thead>
<tbody>
${COMPRADORES.map(([n, f, l, v, p, m, t]) => `<tr><td><strong>${n}</strong></td><td class="cp">${f}</td><td class="val">${l}</td><td class="val">${brl0(v)}</td><td class="val">${p}</td><td class="exp">${m}</td><td><span class="tag ${t === 'novo' ? 'novo' : t === 'recorrente' ? 'rec' : ''}">${t}</span></td></tr>`).join('')}
</tbody></table>
<div class="meta" style="margin-top:6px"><strong>Dois compradores (Diego Batista e Celso Lopes) são R$ 2,94 milhões e compram há meses seguidos.</strong> Eles já são clientes da casa na prática — o Celso aparece em quatro meses consecutivos, o Diego em seis. <strong>José Fabio é o oposto</strong>: apareceu em 16/08 e já fez R$ 1,17 milhão num mês — nesse, os 5% se parecem com o que deveriam ser, o preço de abrir uma porta nova.</div>

<h2>7. Ele recebe antes de a Bula receber</h2>
<div class="nota"><ul>
<li><strong>A Bula recebe da leiloeira em leilão + 41 a 47 dias</strong> (média das 80 CR ligadas a fechamento: vencimento em +47, recebimento real em +41).</li>
<li><strong>O Rusa venceu em 27/07</strong> a comissão de julho — dois dias depois do último pregão do mês — e foi pago em 10/08. <strong>Os assessores só vencem em 25/08.</strong> Ele recebe cerca de <strong>29 dias antes</strong> de todo mundo, e cerca de um mês antes de o dinheiro daquelas vendas entrar.</li>
<li>Em 2026 já saíram <strong>R$ 94.480,00</strong> de caixa para ele. Os R$ ${brl(AGO.com)} de agosto vencem antes de a maior parte das vendas de agosto ser recebida — e 25/08 já é o dia mais apertado do mês.</li>
<li>Não é só custo de comissão: é <strong>capital de giro</strong>. A Bula financia a venda dele por cerca de 45 dias.</li>
</ul></div>

<h2>8. O que dá para fazer</h2>
<table>
<thead><tr><th style="width:26%">Cenário</th><th class="val" style="width:15%">Acordo mínimo</th><th class="val" style="width:17%">Margem em agosto*</th><th>Consequência</th></tr></thead>
<tbody>
${CEN.map(([n, c, b]) => {
  const m = cenario(ACORDO_MEDIANA, c)
  return `<tr><td><strong>${n}</strong></td><td class="val">${pc(b)}</td><td class="val ${m < 0 ? 'neg' : 'pos'}">${brl(m)}</td><td class="exp">${c > 0.04 ? 'Só se paga em leilão de acordo alto. Mantém o risco onde está.' : c === 0.03 ? 'Vira positivo na mediana e ainda paga bem acima de um assessor.' : 'Trata o direcionamento como venda comum. É o maior ganho, e o maior risco de ele levar os compradores embora.'}</td></tr>`
}).join('')}
<tr><td><strong>5% só onde o acordo passa de ${pc(be(0.05))}; 2% no resto</strong></td><td class="val">—</td><td class="exp" colspan="2">O meio-termo honesto: ele continua ganhando 5% exatamente nos leilões em que os 5% cabem, e nos demais recebe como qualquer assessor. Aplicado a 2026, teria transformado os cinco leilões negativos em positivos sem tocar nos dois bons. <strong>É o que eu recomendaria levar para a conversa.</strong></td></tr>
</tbody>
</table>
<div class="meta" style="margin-top:6px">* margem sobre os R$ ${brl0(AGO.vgv)} de agosto, supondo o acordo mediano de 5,00%.</div>

<h2>9. Ressalvas — o que esta análise não prova</h2>
<div class="nota"><ul>
<li><strong>Não sei se as vendas existiriam sem ele.</strong> Se existiriam, a conta é direta: deveria ser 2% como todo mundo. Se não existiriam, a alternativa é zero — mas <strong>zero é melhor que negativo</strong>, e a 5% num acordo de 5% o lote é negativo. Por isso a recomendação não depende de responder essa pergunta: <strong>em acordo abaixo de ${pc(be(0.05))} não compensa nos dois casos</strong>.</li>
<li><strong>A receita por lote é rateada.</strong> Em cerca de 90% do VGV o acordo é sobre o <em>faturamento total do leilão</em>, não sobre a cobertura da Bula. Nesses, um lote a mais não aumenta a receita — o rateio proporcional é a atribuição mais generosa possível com ele. Na margem, um lote do Rusa em leilão de faturamento gera <strong>receita zero e custa 5%</strong>.</li>
<li><strong>Agosto é projeção.</strong> A receita da maioria dos leilões de agosto ainda não foi lançada. Lançar os acordos de agosto fecha essa conta de verdade — e é o que eu faria antes de sentar com ele.</li>
<li><strong>Volume tem valor indireto</strong> que não está aqui: a cobertura da Bula é o que sustenta o contrato com a leiloeira, e lote grande do Rusa (o José Fabio fez lances de 3.100 a 7.500 por parcela) aparece no resultado do pregão. Isso não entra na margem, mas conta na relação.</li>
</ul></div>

<footer><span>Bula Assessoria — documento interno de decisão</span><span>Gerado em 24/08/2026 · fontes: fechamentos e contas do ERP, planilha "RUSA - AGOSTO.xlsx", capturas do grupo Lances Bula</span></footer>
</body></html>`

const outPath = join(homedir(), 'Desktop', 'Analise-Parceria-Gustavo-Rusa-2026.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: outPath, format: 'A4', printBackground: true })
await browser.close()
console.log('PDF:', outPath)
console.log(`Rusa fica com ${pc(R.fatiaCom)} da receita | Bula ${pc(R.fatiaBula)} | assessor ${pc(A.fatiaCom)} / Bula ${pc(A.fatiaBula)}`)
console.log(`Break-even Rusa ${pc(be(0.05))} | mediana dos acordos 5,00% | agosto a 5% = ${brl(cenario(ACORDO_MEDIANA, AGO.pctEfetivo))}`)
