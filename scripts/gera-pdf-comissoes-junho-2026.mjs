// Gera PDF do Relatório de Comissões dos Assessores — Junho/2026 (conciliação com
// as planilhas de fechamento dos próprios assessores, pasta "Fechamento assessores 0626")
// direto na Área de Trabalho. Padrão brandbook preto-e-branco.
// Snapshot estático da conciliação de 22/07/2026 (script ajusta-comissoes-junho-planilhas-assessores).
// Uso: node scripts/gera-pdf-comissoes-junho-2026.mjs
import { join } from 'node:path'
import { homedir } from 'node:os'
import { chromium } from 'playwright'

const brl = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// status: ok (confere/ajustado), conferir (pendente decisão), fora (fora do ERP), novo (faltava no sistema)
const D = [
  { l: 'Cachoeirão — Destaques da Safra (03/06)', antes: 1818, depois: 1818, m: 'Confere com a planilha (lotes 42, 27 e 7 — 90.900 × 2%).' },
  { l: 'Matrizes Santa Nice (06/06)', antes: 3360, depois: 3360, st: 'conferir', m: 'NÃO consta na planilha do Douglas. CP mantido com flag "CONFERIR ANTES DE PAGAR" — confirmar se as 4 vendas (168.000) foram canceladas ou se ele esqueceu de listar.' },
  { l: 'Jacamim Fêmeas (07/06)', antes: 390, depois: 390, m: 'Confere (lote 73 — 19.500 × 2%).' },
  { l: 'Flor do Aratau (07/06)', antes: 0, depois: 0, st: 'fora', extra: 5674.5, m: '"Vendi 14 animais" (312.300) — estava como "Não informado" no sistema, reatribuído ao Douglas. Comissão 0,5% sobre o faturamento total do leilão (1.134.900) = R$ 5.674,50, paga pela BULA REMATES — fora do ERP da Assessoria.' },
  { l: 'Nelore Tresmar (11/06)', antes: 0, depois: 600, st: 'novo', m: 'Lote 17 (Luciano Pereira, 30.000 × 2%) não estava no sistema. Fechamento atualizado e CP criado.' },
  { l: 'JMP Bezerras (13/06)', antes: 2520, depois: 2520, st: 'conferir', m: 'NÃO consta na planilha do Douglas. CP mantido com flag "CONFERIR ANTES DE PAGAR" — confirmar se a venda (126.000) foi cancelada.' },
  { l: 'JMP Touros (14/06)', antes: 5642, depois: 4682, m: 'Venda cancelada: VGV caiu de 282.100 para 234.100 (−48.000). Ficaram lotes 221, 188, 87 e 80.' },
  { l: 'Seleção Nelore FLOC (15/06)', antes: 1248, depois: 612, m: 'Atribuição corrigida: lotes 24, 17e23 e 30 eram do Fábio; Douglas fica com lotes 11 e 13 (30.600 × 2%). VGV total do leilão não mudou — era troca, não cancelamento.' },
  { l: 'Kriz Matrizes (16/06)', antes: 5700, depois: 5220, st: 'novo', m: 'Venda cancelada: VGV caiu de 285.000 para 261.000 (−24.000). CP não existia no ERP — criado.' },
  { l: 'Touros Terra Brava (16–18/06)', antes: 1686, depois: 1686, m: 'Confere (lotes 96, 42, 8 e 57 — 84.300 × 2%).' },
  { l: 'Matrizes KatiSpera (20/06)', antes: 3702, depois: 3300, m: 'Cancelamento: VGV caiu de 185.100 para 165.000 (−20.100). Ficaram lotes 89 e 91 (5+5 fêmeas, Mauro Cesar).' },
  { l: 'MEAB & Fazenda Modelo (23/06)', antes: 9042, depois: 10185, st: 'novo', m: 'VGV caiu de 452.100 para 434.100 (−18.000), mas a comissão SOBE: lotes 16 e 14 (Henrique Areas, 50.100) pagam 5% (= 2.505) e os demais 384.000 pagam 2% (= 7.680). CP não existia — criado.' },
]
const F = [
  { l: 'Cachoeirão — Destaques da Safra (03/06)', antes: 1008, depois: 1008, m: 'Confere (lotes 40 e 17 — 33.600 × 3%).' },
  { l: 'Touros Camparino (06/06)', antes: 4410, depois: 2793, m: 'CP estava provisionado em 4.410 (base 147.000). Planilha: lotes 58, 68, 32 e 14 em 14 parcelas = 93.100 × 3%. O lote 32 (24.500) estava como "Não informado" no fechamento — era dele.' },
  { l: 'Matrizes Santa Nice (06/06)', antes: 2475, depois: 2475, m: 'Confere (lotes 48 e 46 — 82.500 × 3%).' },
  { l: 'Nelore São Francisco — FSF (07/06)', antes: 2100, depois: 2100, m: 'Confere (4 lotes — 70.000 × 3%).' },
  { l: 'Flor do Aratau (07/06)', antes: 648, depois: 639, pend: 4284, m: 'Pago: lote 05 (André Caetano, 21.300 × 3% = 639; antes 21.600). PENDENTE: ele reivindica o lote 01 (123.000 × 3% = 3.690) + corte 40 fêmeas (118.800 × 0,5% = 594), mas a regra do áudio de 30/06 dá a comissão do lote 01 ao Gustavo Rusa.' },
  { l: 'Jacamim Fêmeas (07/06)', antes: 1593, depois: 2196, m: 'Sistema tinha 2 lotes; planilha traz 3 (55 e 44 Nelore Beca + 83 Nelore Zibungo) = 73.200 × 3%.' },
  { l: 'Matrizes Tresmar (10–11/06)', antes: 900, depois: 900, m: 'Confere (lote 29, João Pereira — 30.000 × 3%).' },
  { l: 'JMP Touros (14/06)', antes: 39360, depois: 39450, m: 'Base subiu de 1.312.000 para 1.315.000 (planilha, 9 lotes incl. 1001/1003/1005 Tera Confinamento).' },
  { l: 'Seleção Nelore FLOC (15/06)', antes: 1035, depois: 1989, m: 'Atribuição corrigida: 3 lotes (24, 17e23, 30 — Adenilson Tedesco/Francisco Alex) = 66.300 × 3%.' },
  { l: 'Touros Terra Brava (16–18/06)', antes: 2412, depois: 1800, m: 'Venda cancelada: VGV caiu de 80.400 para 60.000 (−20.400). Ficaram lotes 37, 138 e 59 (Agenor).' },
  { l: 'Fazenda Rio Bonito (20/06)', antes: 495, depois: 495, m: 'Confere (lote 36 — 16.500 × 3%).' },
  { l: 'Touros Matinha (21/06)', antes: 2520, depois: 3360, m: 'BAT 13 (5 animais, Guy Rangel) é em 40 parcelas, não 30: base 112.000 × 3%.' },
  { l: 'MEAB & Fazenda Modelo (23/06)', antes: 2421, depois: 2421, st: 'conferir', m: 'A própria planilha do Fábio marca os 3 lotes (Rodrigo Rocha, 80.700) como "VENDA SEM APROVAÇÃO", fora do total dele. CP mantido aguardando decisão (já tinha flag de validação da receita MEAB).' },
  { l: 'Nelore Magda (28/06)', antes: 1440, depois: 1440, m: 'Confere (lote 25, Klaus — 48.000 × 3%).' },
]
const L = [
  { l: 'Cachoeirão — Destaques da Safra (03/06)', antes: 360, depois: 360, m: 'Confere (lote 28, José Armando — 18.000 × 2%).' },
  { l: 'Touros Camparino (06/06)', antes: 840, depois: 392, m: 'CP estava provisionado em 840 (base 42.000). Planilha e fechamento: só lote 82 (PHB) — 19.600 × 2%.' },
  { l: 'Jacamim Fêmeas (07/06)', antes: 990, depois: 990, m: 'Confere (lotes 112 e 54, Elias — 49.500 × 2%).' },
  { l: 'Nelore Tresmar (11/06)', antes: 0, depois: 2520, st: 'novo', m: 'Lotes 1 (2.200×30) e 15 (2.000×30), comprador Joel = 126.000 × 2%. Não estavam no sistema — fechamento atualizado e CP criado.' },
  { l: 'JMP Touros (14/06)', antes: 8400, depois: 8400, m: 'Confere (lotes 270, 21 e 257 — 420.000 × 2%).' },
  { l: 'Kriz Matrizes (16/06)', antes: 2652, depois: 2652, st: 'novo', m: 'Fechamento conferia (132.600 × 2%), mas o CP não existia no ERP — criado.' },
  { l: 'MEAB & Fazenda Modelo (23/06)', antes: 2292, depois: 2292, st: 'novo', m: 'Fechamento conferia (114.600 × 2%), mas o CP não existia no ERP — criado.' },
  { l: 'Nelore Magda (28/06)', antes: 1260, depois: 1260, m: 'Confere (2 lotes 24 — 63.000 × 2%).' },
]

const conf = (rows) => rows.filter((r) => r.st !== 'conferir' && r.st !== 'fora').reduce((s, r) => s + r.depois, 0)
const pend = (rows) => rows.reduce((s, r) => s + (r.st === 'conferir' ? r.depois : 0) + (r.pend || 0), 0)
const totD = conf(D), totF = conf(F), totL = conf(L)
const totConf = totD + totF + totL
const totPend = pend(D) + pend(F) + pend(L)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const badge = (r) => r.st === 'conferir' ? '<span class="tag warn">Conferir</span>'
  : r.st === 'novo' ? '<span class="tag">Faltava no sistema</span>'
  : r.st === 'fora' ? '<span class="tag">Fora do ERP</span>'
  : r.pend ? '<span class="tag warn">Pendência à parte</span>' : ''

const linhas = (rows) => rows.map((r) => {
  const diff = r.st === 'fora' ? (r.extra || 0) : r.depois - r.antes
  const diffTxt = r.st === 'fora' ? `+${brl(r.extra)} (Remates)` : diff === 0 ? '=' : (diff > 0 ? '+' : '−') + brl(Math.abs(diff))
  return `<tr>
    <td>${esc(r.l)} ${badge(r)}</td>
    <td class="val">${r.antes ? brl(r.antes) : '—'}</td>
    <td class="val"><strong>${r.st === 'fora' ? '—' : brl(r.depois)}</strong></td>
    <td class="val ${diff < 0 ? 'neg' : diff > 0 || r.st === 'fora' ? 'pos' : ''}">${diffTxt}</td>
    <td><div class="obs">${esc(r.m)}</div></td>
  </tr>`
}).join('')

const bloco = (titulo, rows, totalConf, notaTotal) => `
<h2>${titulo} <span class="sub">confirmado p/ 27/07: R$ ${brl(totalConf)}</span></h2>
<table>
<thead><tr><th style="width:24%">Leilão</th><th class="val" style="width:10%">Sistema (antes)</th><th class="val" style="width:10%">Ajustado</th><th class="val" style="width:10%">Diferença</th><th>O que aconteceu</th></tr></thead>
<tbody>${linhas(rows)}</tbody>
<tfoot><tr><td>Total confirmado (bate com a planilha do assessor)</td><td></td><td class="val">${brl(totalConf)}</td><td></td><td>${notaTotal || ''}</td></tr></tfoot>
</table>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #17181A; font-size: 10px; line-height: 1.45; margin: 0; }
  header { border-bottom: 2px solid #17181A; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 19px; margin: 0 0 4px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
  .meta { color: #5B5E63; font-size: 9.5px; }
  .accent { height: 3px; width: 54px; background: #C9A84C; margin-top: 8px; }
  h2 { font-size: 12px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; border-left: 4px solid #17181A; padding-left: 8px; }
  h2 .sub { float: right; font-weight: 400; color: #5B5E63; font-size: 9.5px; letter-spacing: 0; text-transform: none; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: #5B5E63; border-bottom: 1.5px solid #17181A; padding: 5px 6px; }
  td { padding: 5px 6px; border-bottom: .5px solid #E4E5E7; vertical-align: top; }
  tr { break-inside: avoid; }
  .val { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.val { text-align: right; }
  .obs { color: #4A4C50; font-size: 8.5px; line-height: 1.4; }
  .neg { color: #17181A; font-weight: 600; }
  .pos { font-weight: 600; }
  .tag { display: inline-block; font-size: 7px; text-transform: uppercase; letter-spacing: .04em; border: .5px solid #17181A; color: #17181A; padding: 0 4px; border-radius: 2px; vertical-align: middle; white-space: nowrap; }
  .tag.warn { border-color: #C9A84C; color: #9c7f2f; font-weight: 700; }
  .resumo { display: flex; gap: 10px; margin-bottom: 14px; }
  .card { flex: 1; border: 1px solid #D9DADD; border-radius: 4px; padding: 9px 11px; }
  .card .lbl { font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: #5B5E63; }
  .card .num { font-size: 15px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .card .qt { font-size: 8px; color: #8A8D92; }
  .card.total { background: #17181A; color: #fff; border-color: #17181A; }
  .card.total .lbl, .card.total .qt { color: #B9BBBF; }
  .card.warn { border-top: 3px solid #C9A84C; }
  tfoot td { border-top: 1.5px solid #17181A; border-bottom: none; font-weight: 700; padding-top: 6px; }
  .nota { margin-top: 14px; padding: 10px 12px; background: #F6F6F4; border-left: 3px solid #C9A84C; font-size: 9px; color: #3A3C40; border-radius: 0 3px 3px 0; break-inside: avoid; }
  .nota ul { margin: 6px 0 0; padding-left: 16px; }
  .nota li { margin-bottom: 4px; }
  footer { margin-top: 18px; padding-top: 8px; border-top: .5px solid #D9DADD; color: #8A8D92; font-size: 8px; display: flex; justify-content: space-between; }
</style></head><body>
<header>
  <h1>Comissões dos Assessores — Junho/2026</h1>
  <div class="meta">Bula Assessoria · Conciliação de 22/07/2026 com as planilhas de fechamento dos próprios assessores (pasta "Fechamento assessores 0626") · Pagamento: 27/07/2026 (dia 25 cai no sábado)</div>
  <div class="accent"></div>
</header>

<div class="resumo">
  <div class="card"><div class="lbl">Douglas Bispo</div><div class="num">R$ ${brl(totD)}</div><div class="qt">bate exato com a planilha dele</div></div>
  <div class="card"><div class="lbl">Fábio Omena</div><div class="num">R$ ${brl(totF)}</div><div class="qt">planilha 64.929 − pendências</div></div>
  <div class="card"><div class="lbl">Leonardo Serafim</div><div class="num">R$ ${brl(totL)}</div><div class="qt">bate exato com a planilha dele</div></div>
  <div class="card warn"><div class="lbl">Pendente de decisão</div><div class="num">R$ ${brl(totPend)}</div><div class="qt">flagado nos títulos — nada pago</div></div>
  <div class="card total"><div class="lbl">Total confirmado 27/07</div><div class="num">R$ ${brl(totConf)}</div><div class="qt">+ R$ 5.674,50 via Bula Remates</div></div>
</div>

${bloco('Douglas Bispo — 2% (5% nos lotes Henrique Areas)', D, totD, 'Planilha dele: R$ 28.493,00 — bate exato. Fora do ERP: + R$ 5.674,50 pela Bula Remates (Flor do Aratau).')}
${bloco('Fábio Omena — 3%', F, totF, 'Planilha itemizada soma R$ 64.929,00; o total digitado nela (64.479) tem erro de fórmula de R$ 450. Diferença p/ cá = pendências abaixo.')}
${bloco('Leonardo Serafim — 2%', L, totL, 'Planilha dele (foto): R$ 18.866,00 — bate exato.')}

<h2>O que ficou de fora (e por quê)</h2>
<table>
<thead><tr><th style="width:18%">Item</th><th class="val" style="width:10%">Valor</th><th>Situação</th></tr></thead>
<tbody>
<tr><td>Douglas × Santa Nice</td><td class="val">3.360,00</td><td><div class="obs">Existe no sistema (4 vendas, 168.000) mas NÃO está na planilha dele. CP mantido em aberto com flag "CONFERIR ANTES DE PAGAR". Se cancelou, cancelar o título; se ele esqueceu, pagar.</div></td></tr>
<tr><td>Douglas × JMP Bezerras (13/06)</td><td class="val">2.520,00</td><td><div class="obs">Mesmo caso: no sistema (126.000) e fora da planilha dele. Flag "CONFERIR ANTES DE PAGAR".</div></td></tr>
<tr><td>Fábio × Flor do Aratau lote 01 + corte</td><td class="val">4.284,00</td><td><div class="obs">Ele reivindica lote 01 (123.000 × 3% = 3.690) e corte 40 fêmeas (118.800 × 0,5% = 594). Conflita com a regra do áudio de 30/06 (comissão do lote 01 é do Gustavo Rusa, 5% já lançada). Mantido FORA do pagamento até decisão do chefe.</div></td></tr>
<tr><td>Fábio × MEAB "venda sem aprovação"</td><td class="val">2.421,00</td><td><div class="obs">3 lotes do Rodrigo Rocha (80.700 × 3%). A própria planilha marca "VENDA SEM APROVAÇÃO", fora do total dele. CP existe, segue aguardando validação.</div></td></tr>
<tr><td>Venda paralela JMP (planilha do Fábio)</td><td class="val">2.889,00</td><td><div class="obs">96.300 em lotes marcados "venda paralela — Marcelo Moura" e "venda Mateus CPD". Não são do Fábio; nenhum CP gerado (Mateus CPD está a 0% no fechamento).</div></td></tr>
<tr><td>Douglas × Flor do Aratau (14 animais)</td><td class="val">5.674,50</td><td><div class="obs">0,5% sobre o faturamento total do leilão (1.134.900). Pago pela BULA REMATES — não entra no ERP da Assessoria (registrado no fechamento do Admin).</div></td></tr>
<tr><td>Bulinha × JMP Touros</td><td class="val">29.986,00</td><td><div class="obs">Situação antiga mantida: fechamento diz 0% (dono da FdB), mas o CP de 2% existe flagado "aguardando validação — receita JMP". Fora do escopo desta conciliação.</div></td></tr>
</tbody>
</table>

<div class="nota"><strong>Notas da conciliação:</strong>
<ul>
<li><strong>Vendas canceladas identificadas</strong> (sistema tinha, planilha não tem mais): JMP Touros/Douglas −48.000 · Kriz/Douglas −24.000 · KatiSpera/Douglas −20.100 · Terra Brava/Fábio −20.400 · MEAB/Douglas −18.000. Total ≈ <strong>R$ 130.500 de VGV cancelado</strong>.</li>
<li><strong>Trocas de atribuição (não eram cancelamento):</strong> FLOC (lotes Douglas ↔ Fábio, VGV do leilão inalterado) e Camparino (lote 32 de 24.500 estava "Não informado" — era do Fábio; VGV inalterado).</li>
<li><strong>Vendas que faltavam no sistema:</strong> Tresmar do Douglas (30.000) e do Leo (126.000) — fechamento atualizado e CPs criados. CPs que não existiam: Kriz e MEAB (Douglas e Leo).</li>
<li><strong>Comissão total de junho nos fechamentos:</strong> R$ 126.353,81 antes → R$ 130.739,81 depois (+4.386,00 — Tresmar que faltava, MEAB a 5%, Matinha 40x e FLOC/Jacamim do Fábio, compensando os cancelamentos).</li>
<li>Tudo que foi alterado carrega o marcador <strong>[FECH-ASSESSORES-0626 22/07]</strong> no Admin (fechamento leilões) e nos títulos do ERP. Nada foi pago nem apagado.</li>
</ul></div>

<footer><span>Bula Assessoria — documento interno</span><span>Gerado em 22/07/2026 · fontes: planilhas dos assessores (21/07) × ERP/Admin</span></footer>
</body></html>`

const outPath = join(homedir(), 'Desktop', 'Comissoes-Assessores-Junho-2026.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: outPath, format: 'A4', printBackground: true })
await browser.close()
console.log('PDF gerado:', outPath)
console.log('Douglas:', brl(totD), '| Fábio:', brl(totF), '| Leo:', brl(totL), '| Confirmado:', brl(totConf), '| Pendente:', brl(totPend))
