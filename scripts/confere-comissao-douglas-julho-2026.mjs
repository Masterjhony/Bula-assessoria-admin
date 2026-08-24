// Conferência da planilha de comissão do Douglas Bispo (julho/2026, paga em 25/08)
// contra o HastaPro (LOT_PISTEIRO, FIL 2 e FIL 01), o nosso ERP e a captura ao vivo
// do grupo "Lances Bula" (bula_leilao_vendas). Gera PDF na Área de Trabalho.
//
// v3 (24/08). Os 17 lotes do Rusa já foram separados no sistema. O João confirmou
// que o Anésio Santarém também é comprador direcionado pelo Rusa — a mensagem do
// grupo dizer "foi com Douglas Bispo" é exatamente o padrão, não a exceção.
//
// Uso: node scripts/confere-comissao-douglas-julho-2026.mjs
import { join } from 'node:path'
import { homedir } from 'node:os'
import { chromium } from 'playwright'

const brl = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = (n) => Math.round(Number(n)).toLocaleString('pt-BR')
const PCT = 0.02

// ── Universo de 35 lotes de julho/2026 em que o Douglas aparece em ALGUMA das fontes.
// pl  = VGV na planilha dele
// hp  = VGV no HastaPro com LOT_PISTEIRO Douglas
// erp = VGV no fechamento com assessor Douglas ANTES da separação de 24/08
// g   = classificação (ver LEGENDA)
const L = [
  { d: '05/07', ev: 'Naviraí Matrizes', lo: '08', an: 1, cp: 'Celso Lopes', pl: null, hp: 46500, erp: 46500, g: 'rusa' },
  { d: '05/07', ev: 'Naviraí Matrizes', lo: '80', an: 1, cp: 'Celso Lopes', pl: null, hp: 39000, erp: 39000, g: 'rusa' },
  { d: '05/07', ev: 'Naviraí Matrizes', lo: 'M44', an: 1, cp: 'Marcelo Braga', pl: 28500, hp: null, erp: 28500, g: 'erpso' },
  { d: '07/07', ev: 'Kriz Reprodutores', lo: '37', an: 1, cp: 'Gilson Lopes Bispo', pl: 18000, hp: 18000, erp: null, g: 'hpso' },
  { d: '07/07', ev: 'Kriz Reprodutores', lo: '38', an: 1, cp: 'Gilson Lopes Bispo', pl: 18000, hp: 18000, erp: null, g: 'hpso' },
  { d: '07/07', ev: 'Kriz Reprodutores', lo: '39', an: 1, cp: 'Bruno Fábio F. Machado', pl: 21600, hp: 21600, erp: null, g: 'hpso' },
  { d: '07/07', ev: 'Kriz Reprodutores', lo: '47', an: 1, cp: 'Gilberto P. Sarubi', pl: 22500, hp: 22500, erp: null, g: 'hpso' },
  { d: '11/07', ev: 'EAO Baviera Fêmeas', lo: '20', an: 1, cp: 'Celso Lopes', pl: null, hp: 57000, erp: 57000, g: 'rusa' },
  { d: '11/07', ev: 'EAO Baviera Fêmeas', lo: '27', an: 1, cp: 'Celso Lopes', pl: null, hp: 46500, erp: 46500, g: 'rusa' },
  { d: '11/07', ev: 'EAO Baviera Fêmeas', lo: '28', an: 1, cp: 'Celso Lopes', pl: null, hp: 36000, erp: 36000, g: 'rusa' },
  { d: '11/07', ev: 'EAO Baviera Fêmeas', lo: '31', an: 1, cp: 'Celso Lopes', pl: null, hp: 57000, erp: 57000, g: 'rusa' },
  { d: '11/07', ev: 'EAO Baviera Fêmeas', lo: '36', an: 1, cp: 'Celso Lopes', pl: null, hp: 33000, erp: 33000, g: 'rusa' },
  { d: '11/07', ev: 'EAO Baviera Fêmeas', lo: '135', an: 1, cp: 'Pedro Pontes', pl: null, hp: 33000, erp: 33000, g: 'rusa' },
  { d: '11/07', ev: 'EAO Baviera Fêmeas', lo: 'M13', an: 1, cp: 'Fábio Lopes (Selaria Mineira)', pl: 60000, hp: 60000, erp: 60000, g: 'ok' },
  { d: '12/07', ev: 'EAO Baviera Machos', lo: '348', an: 2, cp: 'Deiglames Oliveira', pl: 42000, hp: 42000, erp: 42000, g: 'ok' },
  { d: '12/07', ev: 'EAO Baviera Machos', lo: '396', an: 3, cp: 'Edilberto P. Sarubi', pl: 60300, hp: 60300, erp: 60300, g: 'ok' },
  { d: '12/07', ev: 'Nelore Sorriso Fêmeas', lo: '02', an: 1, cp: 'Mauro Cesar', pl: 15000, hp: 15000, erp: 15000, g: 'ok' },
  { d: '13/07', ev: 'Nelore Sorriso Fêmeas', lo: '13', an: 4, cp: 'Mauro Cesar', pl: 64000, hp: 64000, erp: 64000, g: 'ok' },
  { d: '13/07', ev: 'Nelore Sorriso Fêmeas', lo: '19', an: 4, cp: 'Mauro Cesar', pl: 64000, hp: 80000, erp: 80000, g: 'menos' },
  { d: '14/07', ev: 'Santa Cruz 1ª etapa', lo: '116', an: 1, cp: 'Francisca Valéria (Faz. Água Limpa)', pl: 25500, hp: 25500, erp: null, g: 'atrib' },
  { d: '15/07', ev: 'Santa Cruz 2ª etapa', lo: '61', an: 1, cp: 'Francisca Valéria (Faz. Água Limpa)', pl: 22500, hp: 22500, erp: 22500, g: 'ok' },
  { d: '15/07', ev: 'Santa Cruz 2ª etapa', lo: '124', an: 1, cp: 'Celso Lopes', pl: null, hp: 20100, erp: 20100, g: 'rusa' },
  { d: '16/07', ev: 'Naviraí 2ª etapa', lo: '33', an: 1, cp: 'Francisca Valéria (Faz. Água Limpa)', pl: 24000, hp: 24000, erp: 24000, g: 'ok' },
  { d: '16/07', ev: 'Naviraí 2ª etapa', lo: '02', an: 1, cp: 'Celso Lopes', pl: null, hp: 28500, erp: 27600, g: 'rusa' },
  { d: '18/07', ev: 'Guadalupe Fêmeas', lo: '52', an: 1, cp: 'Gilberto P. Sarubi', pl: 19500, hp: 19500, erp: 19500, g: 'ok' },
  { d: '19/07', ev: 'Santa Cruz 3ª etapa', lo: '108', an: 1, cp: 'André Luis Caetano Rosa', pl: 25500, hp: 25500, erp: 25500, g: 'ok' },
  { d: '19/07', ev: 'Santa Cruz 3ª etapa', lo: '39', an: 1, cp: 'Celso Lopes', pl: null, hp: 25500, erp: 25500, g: 'rusa' },
  { d: '19/07', ev: 'Santa Cruz 3ª etapa', lo: '42', an: 1, cp: 'Celso Lopes', pl: null, hp: 48600, erp: 48600, g: 'rusa' },
  { d: '19/07', ev: 'Guadalupe Touros (dom)', lo: '01', an: 1, cp: 'Marcelo Braga', pl: 36000, hp: null, erp: 36000, g: 'erpso' },
  { d: '20/07', ev: 'Guadalupe Touros (seg)', lo: '04', an: 1, cp: 'Anésio Santarém', pl: null, hp: null, erp: 36600, g: 'rusa' },
  { d: '20/07', ev: 'Guadalupe Touros (seg)', lo: '91', an: 1, cp: 'Anésio Santarém', pl: null, hp: null, erp: 27600, g: 'rusa' },
  { d: '25/07', ev: 'Genética Aditiva Fêmeas', lo: '18', an: 1, cp: 'Celso Lopes', pl: null, hp: 20100, erp: 20100, g: 'rusa' },
  { d: '25/07', ev: 'Genética Aditiva Fêmeas', lo: '41', an: 1, cp: 'Celso Lopes', pl: null, hp: 18000, erp: 18000, g: 'rusa' },
  { d: '25/07', ev: 'Genética Aditiva Fêmeas', lo: '42', an: 1, cp: 'Celso Lopes', pl: null, hp: 18600, erp: 18600, g: 'rusa' },
  { d: '25/07', ev: 'Neloraço Irmãos Hipólito', lo: '40', an: 1, cp: 'Welton Costa de Brito', pl: 28500, hp: 28500, erp: 28500, g: 'ok' },
]

const soma = (k, f = () => true) => L.filter(f).reduce((s, r) => s + (r[k] || 0), 0)
// devido = tudo que é do Douglas: o universo menos os lotes do Rusa, pelo maior valor
// documentado de cada lote (HastaPro/ERP mandam no lote 19; a planilha não).
const devidoVgv = (r) => r.g === 'rusa' ? 0 : Math.max(r.pl || 0, r.hp || 0, r.erp || 0)

const VGV_PL = soma('pl'), VGV_HP = soma('hp'), VGV_ERP = soma('erp')
const VGV_RUSA = soma('erp', (r) => r.g === 'rusa')
const VGV_ERP_HOJE = VGV_ERP - VGV_RUSA
const VGV_DEVIDO = L.reduce((s, r) => s + devidoVgv(r), 0)
const COM_PL = VGV_PL * PCT, COM_ERP = VGV_ERP * PCT
const COM_ERP_HOJE = VGV_ERP_HOJE * PCT, DEVIDO = VGV_DEVIDO * PCT

const comRusa = VGV_RUSA * PCT
const comKriz = soma('pl', (r) => r.g === 'hpso') * PCT
const com116 = soma('pl', (r) => r.g === 'atrib') * PCT
const difSorriso = (soma('erp', (r) => r.g === 'menos') - soma('pl', (r) => r.g === 'menos')) * PCT

const ck = (nome, a, b) => { if (Math.abs(a - b) > 0.005) throw new Error(`TRAVA ${nome}: ${a} != ${b}`) }
ck('planilha', COM_PL, 11908)
ck('HastaPro VGV', VGV_HP, 1074300)
ck('ERP antes', COM_ERP, 21930)
ck('lotes do Rusa em julho', VGV_RUSA, 590700)
ck('Rusa a 5% = o PIX de 10/08', VGV_RUSA * 0.05, 29535)
ck('ERP hoje (pós separação Rusa)', COM_ERP_HOJE, 10116)
ck('devido', DEVIDO, 12228)
ck('ponte planilha→devido', COM_PL + difSorriso, DEVIDO)
ck('ponte ERP hoje→devido', COM_ERP_HOJE + comKriz + com116, DEVIDO)

const CP_ABERTOS_HOJE = 30192  // comissões abertas em 25/08 depois da separação

const TAG = {
  ok: ['confere', ''],
  rusa: ['→ Rusa · feito', 'warn'],
  erpso: ['só no ERP', ''],
  hpso: ['falta no ERP', 'alert'],
  atrib: ['atribuição', 'alert'],
  menos: ['a menor', 'alert'],
}
const tag = (g) => `<span class="tag ${TAG[g][1]}">${TAG[g][0]}</span>`
const cel = (v) => v == null ? '<span class="nil">—</span>' : brl0(v)

const linhas = L.map((r) => `<tr class="${r.g === 'ok' ? '' : 'x'}">
  <td>${r.d}</td><td>${r.ev}</td><td class="lo">${r.lo}</td><td class="val">${r.an}</td>
  <td class="cp">${r.cp}</td>
  <td class="val ${r.pl == null ? '' : 'b'}">${cel(r.pl)}</td>
  <td class="val">${cel(r.hp)}</td>
  <td class="val">${cel(r.erp)}</td>
  <td class="val b">${devidoVgv(r) ? brl0(devidoVgv(r)) : '<span class="nil">—</span>'}</td>
  <td>${tag(r.g)}</td></tr>`).join('')

const ponte = [
  ['Planilha do Douglas', COM_PL, '', '18 lotes · VGV 595.400 × 2% — aritmética conferida linha a linha, sem erro'],
  ['+ Lote 19 do Nelore Sorriso (13/07)', difSorriso, 'mais', 'ele digitou lance 400 (repetiu a linha do lote 13); HastaPro e ERP registram 500 → 80.000, não 64.000'],
  ['= Devido ao Douglas por julho/2026', DEVIDO, 'total', 'VGV 611.400 × 2% · 18 lotes — exatamente os mesmos 18 lotes que ele listou'],
]

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Conferência de Comissão — Douglas Bispo — Julho/2026</title>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 12mm 9mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, -apple-system, Segoe UI, sans-serif; color: #17181A; font-size: 9px; line-height: 1.45; margin: 0; }
  header { margin-bottom: 12px; }
  h1 { font-family: Oswald, Inter, sans-serif; text-transform: uppercase; letter-spacing: .04em; font-size: 20px; font-weight: 600; margin: 0 0 3px; }
  h2 { font-family: Oswald, Inter, sans-serif; text-transform: uppercase; letter-spacing: .05em; font-size: 11px; font-weight: 600; margin: 16px 0 7px; padding-bottom: 3px; border-bottom: 1px solid #17181A; }
  .meta { color: #5B5E63; font-size: 8.5px; }
  .accent { height: 3px; width: 54px; background: #C9A84C; margin-top: 7px; }
  .resumo { display: flex; gap: 8px; margin: 13px 0 4px; }
  .card { flex: 1; border: 1px solid #D9DADD; border-radius: 4px; padding: 8px 10px; }
  .card .lbl { font-size: 7.2px; text-transform: uppercase; letter-spacing: .05em; color: #5B5E63; }
  .card .num { font-size: 15px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .card .qt { font-size: 7.3px; color: #8A8D92; margin-top: 2px; line-height: 1.35; }
  .card.total { background: #17181A; color: #fff; border-color: #17181A; }
  .card.total .lbl, .card.total .qt { color: #B9BBBF; }
  .card.warn { border-top: 3px solid #C9A84C; }
  .card.risc .num { text-decoration: line-through; color: #8A8D92; }
  table { width: 100%; border-collapse: collapse; font-size: 8.2px; }
  th { text-align: left; font-size: 7.4px; text-transform: uppercase; letter-spacing: .04em; color: #5B5E63; font-weight: 600; border-bottom: 1px solid #17181A; padding: 4px 3px; }
  td { padding: 3.3px 3px; border-bottom: .5px solid #E7E8EA; vertical-align: top; }
  tr { break-inside: avoid; }
  tr.x td { background: #FBFAF7; }
  .val { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.val { text-align: right; }
  .b { font-weight: 700; }
  .lo { font-weight: 600; }
  .cp { color: #4A4C50; }
  .nil { color: #C3C5C8; }
  tfoot td { border-top: 1.5px solid #17181A; border-bottom: none; font-weight: 700; padding-top: 6px; }
  .tag { display: inline-block; font-size: 6.5px; text-transform: uppercase; letter-spacing: .04em; border: .5px solid #E7E8EA; color: #A8ABAF; padding: 0 4px; border-radius: 2px; white-space: nowrap; }
  .tag.warn { border-color: #C9A84C; color: #9c7f2f; font-weight: 700; }
  .tag.alert { border-color: #17181A; color: #17181A; font-weight: 700; }
  .ponte td { padding: 5px 6px; }
  .ponte .lbl { font-weight: 600; }
  .ponte .exp { color: #5B5E63; font-size: 7.8px; }
  .ponte tr.total td { border-top: 1.5px solid #17181A; border-bottom: none; font-weight: 700; background: #F6F6F4; }
  .nota { margin-top: 13px; padding: 10px 12px; background: #F6F6F4; border-left: 3px solid #C9A84C; font-size: 8.4px; color: #3A3C40; border-radius: 0 3px 3px 0; break-inside: avoid; }
  .nota ul { margin: 5px 0 0; padding-left: 15px; }
  .nota li { margin-bottom: 4px; }
  .nota strong { color: #17181A; }
  .cit { font-family: ui-monospace, Consolas, monospace; font-size: 7.6px; background: #fff; border: .5px solid #D9DADD; padding: 4px 6px; border-radius: 2px; display: block; margin-top: 3px; color: #17181A; }
  footer { margin-top: 16px; padding-top: 7px; border-top: .5px solid #D9DADD; color: #8A8D92; font-size: 7.5px; display: flex; justify-content: space-between; }
</style></head><body>

<header>
  <h1>Conferência de Comissão — Douglas Bispo</h1>
  <div class="meta">Competência <strong>julho/2026</strong> · pagamento previsto <strong>25/08/2026</strong> · pedido de adiantamento<br>
  Quatro fontes cruzadas lote a lote: planilha "COMISSAO JULHO.xlsx" (enviada por ele) × HastaPro <em>LOT_PISTEIRO</em> (FIL 2 e FIL 01) × fechamentos e contas a pagar do ERP × captura ao vivo do grupo "Lances Bula" no WhatsApp</div>
  <div class="accent"></div>
</header>

<div class="resumo">
  <div class="card"><div class="lbl">Planilha do Douglas</div><div class="num">R$ ${brl(COM_PL)}</div><div class="qt">18 lotes · VGV ${brl0(VGV_PL)}<br>sem erro de conta</div></div>
  <div class="card risc"><div class="lbl">ERP antes da correção</div><div class="num">R$ ${brl(COM_ERP)}</div><div class="qt">30 lotes · VGV ${brl0(VGV_ERP)}<br>incluía lote do Rusa</div></div>
  <div class="card warn"><div class="lbl">ERP hoje (já corrigido)</div><div class="num">R$ ${brl(COM_ERP_HOJE)}</div><div class="qt">24 lotes · VGV ${brl0(VGV_ERP_HOJE)}<br>15 lotes do Rusa transferidos</div></div>
  <div class="card total"><div class="lbl">Devido — a pagar</div><div class="num">R$ ${brl(DEVIDO)}</div><div class="qt">20 lotes · VGV ${brl0(VGV_DEVIDO)}<br>faltam 2 lançamentos no ERP</div></div>
</div>

<h2>Da planilha dele até o valor devido</h2>
<table class="ponte">
<tbody>
${ponte.map(([l, v, t, e]) => `<tr class="${t === 'total' ? 'total' : ''}">
  <td class="lbl" style="width:30%">${l}</td>
  <td class="val" style="width:11%">${brl(v)}</td>
  <td class="exp">${e}</td></tr>`).join('')}
</tbody></table>
<div class="meta" style="margin-top:6px">Pelo outro lado a conta fecha igual: ERP hoje ${brl(COM_ERP_HOJE)} + Kriz ${brl(comKriz)} + lote 116 ${brl(com116)} = <strong>${brl(DEVIDO)}</strong>. As duas diferenças que sobram são <strong>a favor dele</strong>.</div>

<h2>Lote a lote — os 35 lotes de julho em que o Douglas aparece em alguma fonte</h2>
<table>
<thead><tr>
  <th style="width:5%">Data</th><th style="width:16%">Leilão</th><th style="width:4.5%">Lote</th><th class="val" style="width:3.5%">An.</th>
  <th style="width:20%">Comprador</th>
  <th class="val" style="width:8.5%">Planilha</th><th class="val" style="width:8.5%">HastaPro</th><th class="val" style="width:8.5%">ERP (antes)</th>
  <th class="val" style="width:8.5%">Devido</th>
  <th style="width:12%">Situação</th></tr></thead>
<tbody>${linhas}</tbody>
<tfoot><tr>
  <td colspan="5">VGV · 35 lotes</td>
  <td class="val">${brl0(VGV_PL)}</td><td class="val">${brl0(VGV_HP)}</td><td class="val">${brl0(VGV_ERP)}</td><td class="val">${brl0(VGV_DEVIDO)}</td><td></td></tr>
<tr><td colspan="5">Comissão a 2%</td>
  <td class="val">${brl(COM_PL)}</td><td class="val">${brl(VGV_HP * PCT)}</td><td class="val">${brl(COM_ERP)}</td><td class="val">${brl(DEVIDO)}</td><td></td></tr>
</tfoot>
</table>

<h2>Já corrigido no sistema — a regra do direcionamento de parceiro</h2>
<div class="nota" style="border-left-color:#17181A">
<strong>Existe um grupo de compradores direcionado pelo Gustavo Rusa.</strong> Eles são anunciados e arrematados na pista por um assessor da Bula — e a mensagem no grupo diz literalmente <em>"foi com Fulano da Bula Assessoria"</em> — mas a comissão do lote é do <strong>Rusa, a 5%</strong>, e o assessor não recebe os 2%. É a regra do áudio de 30/06, e está na própria planilha de controle do Rusa, que separa a coluna <em>"Assessor venda"</em> da coluna <em>"Direcionamento"</em>: <em>"se pagar Rusa, não pagar Douglas no mesmo caso, para evitar comissão dobrada"</em>.
<ul>
<li><strong>Consequência prática:</strong> nem a mensagem do grupo nem o <em>LOT_PISTEIRO</em> do HastaPro decidem de quem é a comissão — os dois registram quem estava na pista. <strong>Quem manda é o comprador.</strong></li>
<li><strong>Em julho, 17 lotes (VGV ${brl0(VGV_RUSA)})</strong> do Dr. Celso Lopes (14), Pedro Pontes (1) e Anésio Santarém (2) estavam no nome do Douglas. Foram movidos para o Rusa em <em>lances[]</em>, <em>por_assessor[]</em>, <em>comissao_assessoria</em>, <em>sobra_bruta</em> e nos títulos. O título do Douglas caiu de 21.930,00 para <strong>${brl(COM_ERP_HOJE)}</strong>.</li>
<li><strong>Fecha com o caixa:</strong> ${brl0(VGV_RUSA)} × 5% = <strong>R$ ${brl(VGV_RUSA * 0.05)}</strong>, exatamente o PIX pago ao Rusa em 10/08 (NF 34). Antes desta correção sobravam 3.210,00 sem lastro no pagamento dele; com o Anésio dentro, não sobra nada.</li>
<li><strong>A regra virou código:</strong> <em>src/lib/parceiro-direcionamento.ts</em> guarda os compradores direcionados, e o gerador de fechamento automático passa a aplicá-la sozinho — grava o lote no parceiro e registra quem anunciou. Adicionar um comprador é uma linha.</li>
</ul></div>

<h2>Os compradores do Rusa — a lista completa</h2>
<table>
<thead><tr><th style="width:24%">Comprador</th><th style="width:24%">Como aparece</th><th>Onde foi confirmado</th></tr></thead>
<tbody>
<tr><td><strong>Dr. Celso Lopes</strong></td><td class="cp">Nelore Grão Pará · Faz. Flor de Minas · PA</td><td class="exp">Planilha do Rusa (mai–jun) e lista do chefe de 22/07. ⚠ Não confundir com <strong>Celso Camargo</strong> nem com Antonio Celso Chaves Gaiotto.</td></tr>
<tr><td><strong>Pedro Pontes</strong></td><td class="cp">Nelore São Caetano · PA</td><td class="exp">Idem. Em vários lançamentos o nome vem só na fazenda ("A identificar · Fazenda São Caetano").</td></tr>
<tr><td><strong>Diego Benitah Batista</strong></td><td class="cp">Faz. Paraíso do Acará · Nelore FPA · PA</td><td class="exp">Planilha do Rusa (aba "Lances Rusa", leilão Nelore FPA) e observação do CP do Flor do Aratau de 30/06. <strong>É o maior de todos</strong> — 17 lotes em 2026.</td></tr>
<tr><td><strong>Itajaí / Parazão</strong></td><td class="cp">Welton Borges de Miranda, Gustavo Miranda</td><td class="exp">Planilha do Rusa e lista do chefe (JMP Bezerras, EAO Expozebu). ⚠ <strong>Welton Costa de Brito</strong> (Faz. Maravilha) é outra pessoa e é comprador legítimo do Douglas.</td></tr>
<tr><td><strong>Alfredo José Cardoso</strong></td><td class="cp">Faz. Galopeira · PA</td><td class="exp">Lista do chefe 22/07 (Cachoeirão, JMP Touros lote 1004, MEAB).</td></tr>
<tr><td><strong>C+4</strong></td><td class="cp">lotes de aspiração</td><td class="exp">Lista do chefe 22/07 (Cachoeirão, Naviraí Expozebu, JMP Bezerras, MEAB).</td></tr>
<tr><td><strong>Lindoalmir / João Alfredo</strong></td><td class="cp">Faz. Santa Isabel</td><td class="exp">Lista do chefe 22/07 (JMP Touros).</td></tr>
<tr><td><strong>Anésio Santarém</strong></td><td class="cp">Faz. Córrego da Onça · PA</td><td class="exp">Confirmado pelo João em 24/08. ⚠ Casar por "Anésio" ou pela fazenda — <strong>"Santarém" sozinho é cidade do PA</strong> e aparece em endereço de leilão.</td></tr>
</tbody></table>

<h2>Agosto — a mesma dobra, corrigida antes de vencer</h2>
<table>
<thead><tr><th style="width:30%">Leilão</th><th style="width:20%">Comprador</th><th class="val" style="width:11%">VGV</th><th class="val" style="width:13%">Tirado do assessor</th><th class="val" style="width:12%">Direito do Rusa</th></tr></thead>
<tbody>
<tr><td>2º LS Galeria · 07/08</td><td class="cp">Diego B. Batista</td><td class="val">456.000</td><td class="val">9.120,00 <span class="cp">(Fábio)</span></td><td class="val">22.800,00</td></tr>
<tr><td>14º Pérolas do Tapajós · 08/08</td><td class="cp">Alfredo J. Cardoso</td><td class="val">90.000</td><td class="val">1.800,00</td><td class="val">4.500,00</td></tr>
<tr><td>Nelore Paranã Produtividade · 09/08</td><td class="cp">Dr. Celso Lopes</td><td class="val">88.500</td><td class="val">1.770,00</td><td class="val">4.425,00</td></tr>
<tr><td>Matinha Expogenética · 16/08</td><td class="cp">Dr. Celso Lopes</td><td class="val">42.000</td><td class="val">840,00</td><td class="val">2.100,00</td></tr>
<tr><td>Paranã e Casabranca · 20/08</td><td class="cp">Dr. Celso Lopes</td><td class="val">73.500</td><td class="val">1.470,00</td><td class="val">3.675,00</td></tr>
<tr><td>Naviraí Camparino Essência · 22/08</td><td class="cp">Dr. Celso Lopes</td><td class="val">48.000</td><td class="val">960,00</td><td class="val">2.400,00</td></tr>
</tbody>
<tfoot><tr><td colspan="2">6 leilões · vencimento 25/09</td><td class="val">798.000</td><td class="val">15.960,00</td><td class="val">39.900,00</td></tr></tfoot>
</table>
<div class="meta" style="margin-top:6px">Os dois últimos ainda não tinham título gerado — foram corrigidos no fechamento, então o título já nasce certo. <strong>Nenhum título do Rusa foi criado</strong>: o direito dele está reconhecido no fechamento, mas o lançamento a pagar é decisão de quem paga.</div>

<h2>O que falta lançar — as duas diferenças a favor dele</h2>
<table>
<thead><tr><th style="width:20%">Item</th><th class="val" style="width:9%">Comissão</th><th>Racional</th></tr></thead>
<tbody>
<tr><td><strong>Kriz Reprodutores (07/07)</strong></td><td class="val">${brl(comKriz)}</td>
<td class="exp">Lotes 37, 38, 39 e 47 (VGV ${brl0(soma('pl', (r) => r.g === 'hpso'))}) — <strong>o HastaPro confirma os quatro</strong> com LOT_PISTEIRO Douglas, batendo centavo a centavo com a planilha dele. O leilão é da <strong>filial 01 (Bula Remates)</strong> e <strong>não tem fechamento nenhum no nosso sistema</strong>, por isso nunca gerou título. É lacuna de cadastro, não divergência de valor — o Neloraço de 25/07, mesma filial, tem fechamento e título normais.</td></tr>
<tr><td><strong>Lote 116 — Santa Cruz 1ª (14/07)</strong></td><td class="val">${brl(com116)}</td>
<td class="exp">O HastaPro registra o lote com <strong>pisteiro Douglas</strong>; o nosso fechamento lançou no <strong>Leonardo Serafim</strong> (título de 510,00 aberto para 25/08). O comprador é <strong>Francisca Valéria — Fazenda Água Limpa</strong>, o mesmo do lote 61 do dia seguinte, que o ERP já dá ao Douglas. Em 21/08 o mesmo conflito no Naviraí foi resolvido a favor do LOT_PISTEIRO. Transferência: criar o do Douglas e cancelar o do Leonardo, neutro no caixa.</td></tr>
</tbody></table>

<h2>O que ele deixou de cobrar</h2>
<table>
<thead><tr><th style="width:20%">Item</th><th class="val" style="width:9%">Comissão</th><th>Racional</th></tr></thead>
<tbody>
<tr><td><strong>Lote 19 — Nelore Sorriso (13/07)</strong></td><td class="val">${brl(difSorriso)}</td>
<td class="exp">A planilha traz lance <strong>400</strong> (4 animais × 40 parcelas = 64.000) — o mesmo valor que ele digitou na linha do lote 13, logo acima. HastaPro e ERP registram <strong>500</strong> (80.000). Erro de digitação <strong>contra ele mesmo</strong>: faltam 16.000 de VGV. O título de 3.180,00 do Sorriso já está correto no ERP.
<br><br>⚠ Fonte única: não existe captura do grupo para as fêmeas do Sorriso, então aqui é o HastaPro contra a memória dele. Nenhum dos três lotes está pago no HastaPro. Se quiser blindar, é um minuto de conversa com a Sorriso.</td></tr>
</tbody></table>
<div class="meta" style="margin-top:6px"><strong>Fora esse dígito, a planilha dele está perfeita:</strong> os 18 lotes que ele listou são exatamente os 18 lotes que lhe são devidos — ele excluiu por conta própria todos os 17 lotes do Rusa, inclusive os dois do Anésio.</div>

<h2>Fica em aberto</h2>
<div class="nota"><ul>
<li><strong>Lançar o que o Rusa passou a ter direito em agosto:</strong> os R$ ${brl(VGV_RUSA * 0.05)} de julho <em>já foram pagos</em> (PIX de 10/08), mas os <strong>R$ 39.900,00 de agosto</strong> ainda não têm título. O direito está reconhecido nos fechamentos; o CP é decisão de quem paga.</li>
<li><strong>Histórico não tocado (jan–jun):</strong> a varredura achou <strong>mais 22 lotes</strong> de compradores do Rusa lançados em assessor da Bula, em leilões cujos títulos já foram pagos ou cancelados — 407.100 de VGV com título resolvido, e outros 12 fechamentos sem título de comissão nenhum. Na maioria o acerto já foi feito pelo lado do título (o CP do Douglas no Santa Nice, por exemplo, está cancelado); o que ficou desatualizado é o fechamento. Reescrever mês conciliado muda relatório fechado — <strong>por isso o script não toca nesses e a decisão é sua</strong>. O inventário sai com <em>node scripts/aplica-direcionamento-parceiro.mts</em>.</li>
<li><strong>O maior comprador da lista nunca tinha sido marcado:</strong> Diego Benitah Batista (Fazenda Paraíso do Acará / Nelore FPA) tem <strong>17 lotes em 2026</strong> e R$ 1,56 milhão de VGV, quase todos no Douglas e no Fábio. Vale confirmar com o Rusa se todos são direcionamento dele — se forem, há acerto retroativo dos dois lados.</li>
</ul></div>

<div class="nota"><strong>Notas de conferência (não mexem em valor):</strong><ul>
<li>A <strong>aritmética da planilha está correta nas 18 linhas</strong> (lance × parcelas × animais e os 2%); o total de 595.400,00 / 11.908,00 fecha. Todas as diferenças são de <em>escopo</em> e <em>atribuição</em>, não de conta.</li>
<li><strong>Nomes de comprador divergentes</strong>, sem efeito no valor: lotes 37 e 38 do Kriz aparecem como "Rafael Rocha" na planilha e <strong>Gilson Lopes Bispo</strong> no HastaPro; "Zé Fernando" (lotes 116, 61 e 33) é <strong>Francisca Valéria Costa e Costa</strong>; "Gilson Bispo" no lote 108 é <strong>André Luis Caetano Rosa</strong>; "Fábio Machado" é <strong>Bruno Fábio Fernandes Machado</strong>.</li>
<li>O <strong>M44 de 05/07</strong> ("Touros Naviraí" na planilha) é um macho de reoferta vendido num leilão de matrizes — não existe no HastaPro, entrou no nosso sistema em 21/08 após a conferência com a Naviraí. <strong>Está certo e é devido.</strong> Idem o <strong>lote 01 do Guadalupe de domingo (19/07)</strong>: o pregão não existe no HastaPro, só no nosso fechamento.</li>
<li>O <strong>lote 02 do Naviraí de 16/07</strong> aparece com 28.500 no HastaPro e 27.600 no ERP (lance corrigido de 950 para 920 pelo próprio Douglas no grupo). O lote é do Rusa, então a diferença não afeta este pagamento.</li>
<li>Escopo: <strong>julho/2026 e somente o Douglas</strong>. A folha de agosto (12.500,00, venc. 05/09) e as comissões de agosto (venc. 25/09) não entram aqui.</li>
</ul></div>

<footer><span>Bula Assessoria — documento interno de conferência</span><span>Gerado em 24/08/2026 · HastaPro lido em modo somente-leitura</span></footer>
</body></html>`

const outPath = join(homedir(), 'Desktop', 'Conferencia-Comissao-Douglas-Julho-2026.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: outPath, format: 'A4', printBackground: true })
await browser.close()
console.log('PDF:', outPath)
console.log('Planilha', brl(COM_PL), '| ERP antes', brl(COM_ERP), '| ERP hoje', brl(COM_ERP_HOJE), '| DEVIDO', brl(DEVIDO))
console.log('Falta lançar: Kriz', brl(comKriz), '+ lote 116', brl(com116), '| Comissões abertas 25/08 hoje:', brl(CP_ABERTOS_HOJE), '→ com Kriz:', brl(CP_ABERTOS_HOJE + comKriz))
