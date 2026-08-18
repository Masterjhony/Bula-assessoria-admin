// Relatorio de COBRANCAS de julho/2026 — leiloes, valores e contatos.
// Fontes: planilha "FINANCEIRO BULA 2026" (aba Leiloes, linhas 88-104, Drive),
// bula_leilao_fechamento (Supabase), HastaPro (dump de clientes) e WhatsApp
// (contatos passados pela Ana Paula em 06/08 + grupos de parceria).
// Saida: PDF + XLSX na area de trabalho.

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'

const DESKTOP = 'C:/Users/Notebook-Acer/Desktop'
const OUT = join(DESKTOP, 'Cobrancas Julho 2026')
mkdirSync(OUT, { recursive: true })

const logoB64 = readFileSync('public/logo-bula-assessoria-white.png').toString('base64')

const brl = (n) => (n == null ? '—' : `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const brl0 = (n) => (n == null ? '—' : `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`)

// ─── Leiloes de julho (planilha, linhas 88-104) ──────────────────────────────
const LINHAS = [
  { n: 88, data: '05/07', leilao: 'NAVIRAÍ MATRIZES', marca: 'Naviraí', fat: null, venda: 168000, criterio: '5% da venda', receita: 8400, status: 'COBRAR' },
  { n: 89, data: '07/07', leilao: 'LEILÃO TOUROS NELORE KIRZ', marca: 'Bula Remates', fat: 1016400, venda: 99600, criterio: '1% do VGV', receita: 10164, status: 'A RECEBER 20/08' },
  { n: 90, data: '07/07', leilao: 'LEILÃO BEZERROS TOP MATINHA', marca: 'Rancho da Matinha', fat: null, venda: null, criterio: '—', receita: null, status: 'SEM VENDAS' },
  { n: 91, data: '09/07', leilao: 'MEGA EAO BAVIERA — ASPIRAÇÕES', marca: 'EAO', fat: 4185000, venda: 0, criterio: '0,33% do faturamento', receita: null, status: 'SEM VENDAS' },
  { n: 92, data: '10/07', leilao: 'MEGA EAO BAVIERA — FÊMEAS', marca: 'EAO', fat: 14714090, venda: 545900, criterio: '0,33% do faturamento', receita: 48556.5, status: 'COBRAR' },
  { n: 93, data: '11/07', leilao: 'MEGA EAO BAVIERA — TOUROS', marca: 'EAO', fat: null, venda: 366300, criterio: '0,33% do faturamento', receita: null, status: 'COBRAR' },
  { n: 94, data: '12/07', leilao: 'LEILÃO NELORE SORRISO — ETAPA FÊMEAS', marca: 'e-Rural', fat: null, venda: 159000, criterio: '5% da venda', receita: 7950, status: 'COBRAR' },
  { n: 95, data: '14/07', leilao: 'SANTA CRUZ — 1ª ETAPA', marca: 'Santa Cruz', fat: null, venda: 123600, criterio: 'escalonado por cobertura', receita: null, status: 'EM FECHAMENTO' },
  { n: 96, data: '15/07', leilao: 'SANTA CRUZ — 2ª ETAPA', marca: 'Santa Cruz', fat: null, venda: 42600, criterio: 'escalonado por cobertura', receita: null, status: 'EM FECHAMENTO' },
  { n: 97, data: '16/07', leilao: 'NAVIRAÍ MATRIZES — 2ª ETAPA', marca: 'Naviraí', fat: null, venda: 158700, criterio: '5% da venda', receita: 7935, status: 'COBRAR' },
  { n: 98, data: '17/07', leilao: '20º GUADALUPE — Doadoras e Aspirações', marca: 'Guadalupe', fat: null, venda: null, criterio: '5% da venda', receita: null, status: 'SEM VENDAS' },
  { n: 99, data: '18/07', leilao: '20º GUADALUPE — Fêmeas', marca: 'Guadalupe', fat: 4387850, venda: 60000, criterio: '5% da venda', receita: 3000, status: 'EM FECHAMENTO' },
  { n: 100, data: '19/07', leilao: '20º GUADALUPE — Touros', marca: 'Guadalupe', fat: 3952180, venda: 299100, criterio: '0,75% do VGV (10 a 15 touros)', receita: 29641.35, status: 'EM FECHAMENTO' },
  { n: 101, data: '19/07', leilao: 'SANTA CRUZ', marca: 'Santa Cruz', fat: null, venda: 247200, criterio: 'escalonado por cobertura', receita: null, status: 'EM FECHAMENTO' },
  { n: 102, data: '25/07', leilao: '30º NELORAÇO PO (Irmãos Hipólito)', marca: 'Bula Remates', fat: 2515500, venda: 0, criterio: '1% do VGV', receita: 25155, status: 'A RECEBER 20/08' },
  { n: 103, data: '25/07', leilao: '23º MEGA GENÉTICA ADITIVA — FÊMEAS', marca: 'Genética Aditiva', fat: 1805400, venda: 56700, criterio: '0,35% do VGV', receita: 6318.9, status: 'COBRAR' },
  { n: 104, data: '26/07', leilao: '23º MEGA GENÉTICA ADITIVA — TOUROS', marca: 'Genética Aditiva', fat: 4288750, venda: 235500, criterio: '0,5% do VGV', receita: 21443.75, status: 'COBRAR' },
]

const soma = (f) => LINHAS.filter(f).reduce((s, l) => s + (l.receita || 0), 0)
const TOT_COBRAR = soma((l) => l.status === 'COBRAR')
const TOT_FECHANDO = soma((l) => l.status === 'EM FECHAMENTO')
const TOT_RECEBER = soma((l) => l.status.startsWith('A RECEBER'))
const TOT_GERAL = TOT_COBRAR + TOT_FECHANDO + TOT_RECEBER

// ─── Contatos ────────────────────────────────────────────────────────────────
const CONTATOS = [
  { marca: 'EAO', pessoa: 'Max Pereira — Gerente Comercial', tel: '+55 34 9672-7349', canal: 'WhatsApp', fonte: 'Ana Paula (WhatsApp, 06/08)', obs: 'Contato comercial do Mega EAO Baviera.' },
  { marca: 'EAO', pessoa: 'EAO Empreendimentos (institucional)', tel: '(73) 99859-4839', canal: 'Telefone / helio@eaoempreendimentos.com', fonte: 'HastaPro / cadastro Bula', obs: 'Usar para NF e cobrança formal.' },
  { marca: 'Naviraí', pessoa: 'Elvis (Naviraí)', tel: '+55 34 9294-9959', canal: 'WhatsApp', fonte: 'Ana Paula (WhatsApp, 06/08)', obs: 'Contato dos leilões Naviraí desde março.' },
  { marca: 'Naviraí', pessoa: 'Chácara Naviraí — financeiro', tel: '(67) 98158-0001', canal: 'Telefone / financeiro.stm@chacaranavirai.com.br', fonte: 'HastaPro / cadastro Bula', obs: 'Financeiro da fazenda.' },
  { marca: 'Santa Cruz', pessoa: 'Nelore Santa Cruz', tel: '+55 61 8626-1377', canal: 'WhatsApp', fonte: 'Ana Paula (WhatsApp, 06/08)', obs: 'Cobre as 3 etapas de julho (14, 15 e 19).' },
  { marca: 'Genética Aditiva', pessoa: 'Claudinei Sandim', tel: '+55 67 9984-6958', canal: 'WhatsApp', fonte: 'Ana Paula (WhatsApp, 06/08)', obs: 'Também está no grupo "Lances Genética Aditiva".' },
  { marca: 'e-Rural (Nelore Sorriso)', pessoa: 'Vivian Lutgard', tel: '+55 65 9325-4687', canal: 'WhatsApp — grupo "PARCERIA BULA e ERURAL"', fonte: 'Grupo do WhatsApp (admin) + histórico da planilha', obs: '"VIVIAN" é o contato da e-Rural na planilha desde janeiro.' },
  { marca: 'Bula Remates (Kirz e Neloraço)', pessoa: 'Lucas Martins — Bula Remates', tel: 'grupo "Cadastros Bula Remates"', canal: 'WhatsApp', fonte: 'Ana Paula: "Kriz e Neloraço — acredito que seja remates"', obs: 'Acerto interno com a Bula Remates; vencimento 20/08.' },
  { marca: 'Guadalupe', pessoa: 'A CONFIRMAR', tel: '—', canal: 'grupo "LANCES GUADALUPE"', fonte: '—', obs: 'Sem contato salvo. Candidata no grupo: Valéria Borges +55 67 9601-4226. Histórico da planilha: Thiago / Marcelo / Murilo.' },
]

const PENDENCIAS = [
  { t: 'EAO — Touros 11/07 sem faturamento informado', d: 'A cobrança é 0,33% do faturamento total do dia e a leiloeira nunca informou esse número. Cobertura Bula do dia: R$ 366.300. Pedir o faturamento ao Max antes de emitir.', v: 'a apurar' },
  { t: 'EAO — Aspirações 09/07 marcado como "sem vendas"', d: 'O faturamento do dia foi R$ 4.185.000. No leilão de aspirações de março (09/03), sem venda da Bula, os 0,33% foram cobrados assim mesmo (R$ 1.831,50). Pelo mesmo critério cabe cobrança.', v: '≈ R$ 13.810,50' },
  { t: 'Santa Cruz — 3 etapas em fechamento', d: 'Cobertura somada de R$ 413.400 (14, 15 e 19/07) sem faturamento total informado. Aplicando a faixa de 0 a 3% (5% do que vender), dá ≈ R$ 20.670. Pedir o faturamento das 3 etapas.', v: '≈ R$ 20.670' },
  { t: 'Guadalupe — fechamento e contato', d: 'Fêmeas e Touros seguem "em fechamento" na planilha, com valores já calculados (R$ 32.641,35). Falta o contato da leiloeira para disparar a cobrança.', v: 'R$ 32.641,35' },
]

const DIVERGENCIAS = [
  { t: 'Genética Aditiva — Fêmeas (25/07)', d: 'Cobertura R$ 56.700 sobre faturamento de R$ 1.805.400 = 3,14%, faixa "3% a 5% → 0,3% do VGV" = R$ 5.416,20. A planilha aplicou 0,35% = R$ 6.318,90.', dif: '+ R$ 902,70 a favor da Bula' },
  { t: 'Kirz (07/07) — Bula Remates', d: 'Cobertura R$ 99.600 sobre R$ 1.016.400 = 9,8%, faixa "5% a 12,5% → 0,5% do VGV" = R$ 5.082. A planilha aplicou 1% = R$ 10.164.', dif: '+ R$ 5.082,00 a favor da Bula' },
  { t: 'Neloraço (25/07) — Bula Remates', d: 'Venda Bula lançada como R$ 0 na planilha (0% de cobertura → "5% do que vender" = R$ 0), mas foi aplicado 1% do VGV = R$ 25.155. O sistema registrou 1 lote / R$ 28.500 de cobertura.', dif: 'conferir critério com o Felipe' },
  { t: 'EAO Fêmeas — cobertura divergente', d: 'O fechamento no sistema tem VGV de cobertura de R$ 564.900; a planilha traz R$ 545.900.', dif: 'R$ 19.000 — muda comissão, não muda a cobrança' },
  { t: 'EAO — datas', d: 'A planilha registra 09, 10 e 11/07; os fechamentos no sistema estão em 11 e 12/07.', dif: 'alinhar antes de citar a data na NF' },
]

// ─── HTML ────────────────────────────────────────────────────────────────────
const badge = (s) => {
  const cls = s === 'COBRAR' ? 'b-cobrar' : s === 'EM FECHAMENTO' ? 'b-fech' : s.startsWith('A RECEBER') ? 'b-rec' : 'b-sem'
  return `<span class="badge ${cls}">${s}</span>`
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Cobranças Julho 2026 — Bula Assessoria</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color:#111; margin:0; font-size:9.6pt; }
  h1,h2 { font-family:"Oswald","Segoe UI",Arial,sans-serif; text-transform:uppercase; letter-spacing:.04em; margin:0; }
  .capa { background:#000; color:#fff; padding:26px 24px; margin-bottom:18px; }
  .capa img { height:34px; margin-bottom:16px; }
  .capa h1 { font-size:26pt; line-height:1.1; }
  .capa p { color:#c9c9c9; margin:8px 0 0; font-size:10pt; }
  .kpis { display:flex; gap:10px; margin:16px 0 20px; }
  .kpi { flex:1; border:1px solid #111; padding:10px 12px; }
  .kpi .l { font-size:7.6pt; text-transform:uppercase; letter-spacing:.06em; color:#555; }
  .kpi .v { font-family:"Oswald",Arial,sans-serif; font-size:14pt; margin-top:3px; }
  .kpi.dark { background:#111; color:#fff; } .kpi.dark .l { color:#bbb; }
  h2 { font-size:12.5pt; border-bottom:2px solid #111; padding-bottom:5px; margin:20px 0 10px; }
  h2 .g { color:#C9A84C; }
  table { width:100%; border-collapse:collapse; font-size:8.4pt; }
  th { background:#111; color:#fff; text-align:left; padding:6px; font-weight:600; text-transform:uppercase; font-size:7.2pt; letter-spacing:.04em; }
  td { padding:5px 6px; border-bottom:1px solid #ddd; vertical-align:top; }
  tr:nth-child(even) td { background:#fafafa; }
  .num { text-align:right; white-space:nowrap; }
  .badge { font-size:6.8pt; padding:2px 5px; border:1px solid #111; text-transform:uppercase; white-space:nowrap; }
  .b-cobrar { background:#111; color:#fff; }
  .b-fech { background:#fff; color:#111; }
  .b-rec { background:#eee; color:#111; border-color:#999; }
  .b-sem { color:#888; border-color:#ccc; }
  tfoot td { border-top:2px solid #111; font-weight:700; background:#fff !important; }
  .card { border-left:3px solid #111; padding:7px 11px; margin:7px 0; background:#fafafa; page-break-inside:avoid; }
  .card .t { font-weight:700; }
  .card .v { float:right; font-family:"Oswald",Arial,sans-serif; }
  .nota { font-size:8pt; color:#555; margin-top:5px; }
  .rodape { margin-top:22px; padding-top:8px; border-top:1px solid #ccc; font-size:7.6pt; color:#666; }
</style></head><body>

<div class="capa">
  <img src="data:image/png;base64,${logoB64}">
  <h1>Cobranças<br>Julho / 2026</h1>
  <p>Leilões, valores e contatos para iniciar a cobrança — emitido em 12/08/2026</p>
</div>

<div class="kpis">
  <div class="kpi dark"><div class="l">Cobrar agora</div><div class="v">${brl(TOT_COBRAR)}</div></div>
  <div class="kpi"><div class="l">Em fechamento</div><div class="v">${brl(TOT_FECHANDO)}</div></div>
  <div class="kpi"><div class="l">A receber 20/08</div><div class="v">${brl(TOT_RECEBER)}</div></div>
  <div class="kpi"><div class="l">Total julho mapeado</div><div class="v">${brl(TOT_GERAL)}</div></div>
</div>

<h2>1. Quadro de cobrança <span class="g">—</span> 17 leilões</h2>
<table>
<thead><tr>
  <th>#</th><th>Data</th><th>Leilão</th><th>Marca</th>
  <th class="num">Faturamento</th><th class="num">Vendas Bula</th><th>Critério</th>
  <th class="num">A cobrar</th><th>Status</th>
</tr></thead>
<tbody>
${LINHAS.map((l) => `<tr>
  <td>${l.n}</td><td>${l.data}</td><td>${l.leilao}</td><td>${l.marca}</td>
  <td class="num">${l.fat ? brl0(l.fat) : '—'}</td>
  <td class="num">${l.venda != null ? brl0(l.venda) : '—'}</td>
  <td>${l.criterio}</td>
  <td class="num"><b>${l.receita ? brl(l.receita) : '—'}</b></td>
  <td>${badge(l.status)}</td>
</tr>`).join('')}
</tbody>
<tfoot>
  <tr><td colspan="7">TOTAL MAPEADO EM JULHO</td><td class="num">${brl(TOT_GERAL)}</td><td></td></tr>
</tfoot>
</table>
<p class="nota">Fonte: planilha <b>FINANCEIRO BULA 2026</b> (aba Leilões, linhas 88 a 104), conferida contra os fechamentos do sistema Bula. Traço em <i>A cobrar</i> = valor ainda depende de dado que a leiloeira não passou.</p>

<h2>2. Contatos para a cobrança</h2>
<table>
<thead><tr><th>Marca</th><th>Contato</th><th>Telefone</th><th>Canal</th><th>Origem do dado</th></tr></thead>
<tbody>
${CONTATOS.map((c) => `<tr>
  <td><b>${c.marca}</b></td><td>${c.pessoa}</td><td style="white-space:nowrap">${c.tel}</td>
  <td>${c.canal}</td><td>${c.fonte}<div class="nota">${c.obs}</div></td>
</tr>`).join('')}
</tbody></table>

<h2>3. Pendências que travam dinheiro</h2>
${PENDENCIAS.map((p) => `<div class="card"><span class="v">${p.v}</span><div class="t">${p.t}</div><div class="nota">${p.d}</div></div>`).join('')}

<h2>4. Divergências a conferir antes de emitir</h2>
${DIVERGENCIAS.map((d) => `<div class="card"><span class="v">${d.dif}</span><div class="t">${d.t}</div><div class="nota">${d.d}</div></div>`).join('')}

<h2>5. Ordem sugerida de disparo</h2>
<table>
<thead><tr><th>Ordem</th><th>Quem</th><th>O que cobrar</th><th class="num">Valor</th><th>Observação</th></tr></thead>
<tbody>
<tr><td>1</td><td>Max Pereira — EAO</td><td>Fêmeas 10/07</td><td class="num">${brl(48556.5)}</td><td>No mesmo contato, pedir o faturamento dos dias 09 (aspirações) e 11 (touros).</td></tr>
<tr><td>2</td><td>Claudinei — Genética Aditiva</td><td>Fêmeas 25/07 + Touros 26/07</td><td class="num">${brl(6318.9 + 21443.75)}</td><td>Conferir antes se fêmeas é 0,30% ou 0,35%.</td></tr>
<tr><td>3</td><td>Elvis — Naviraí</td><td>Matrizes 05/07 + 2ª etapa 16/07</td><td class="num">${brl(8400 + 7935)}</td><td>Cobrança única das duas etapas.</td></tr>
<tr><td>4</td><td>Vivian — e-Rural</td><td>Nelore Sorriso fêmeas 12/07</td><td class="num">${brl(7950)}</td><td>Pelo grupo PARCERIA BULA e ERURAL.</td></tr>
<tr><td>5</td><td>Nelore Santa Cruz</td><td>Etapas 14, 15 e 19/07</td><td class="num">a apurar</td><td>Pedir o faturamento das 3 etapas para fechar o percentual.</td></tr>
<tr><td>6</td><td>Guadalupe (contato a confirmar)</td><td>Fêmeas 18/07 + Touros 19/07</td><td class="num">${brl(32641.35)}</td><td>Valor já calculado; falta o contato.</td></tr>
<tr><td>7</td><td>Bula Remates (Felipe / Lucas)</td><td>Kirz 07/07 + Neloraço 25/07</td><td class="num">${brl(35319)}</td><td>Acerto interno, vencimento 20/08.</td></tr>
</tbody></table>

<div class="rodape">
  Bula Assessoria — documento interno de cobrança. Fontes: planilha FINANCEIRO BULA 2026 (Drive, atualizada em 11/08/2026),
  fechamentos do sistema Bula, base HastaPro e contatos confirmados no WhatsApp (conversa com a Ana Paula em 06/08/2026 e grupos de parceria).
</div>
</body></html>`

const htmlPath = join(OUT, 'Cobrancas-Julho-2026-Bula.html')
writeFileSync(htmlPath, html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({
  path: join(OUT, 'Cobrancas-Julho-2026-Bula.pdf'),
  format: 'A4',
  printBackground: true,
  margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
})
await browser.close()

// ─── XLSX ────────────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(LINHAS.map((l) => ({
  '#': l.n,
  Data: `${l.data}/2026`,
  Leilão: l.leilao,
  Marca: l.marca,
  'Faturamento do leilão': l.fat,
  'Vendas Bula': l.venda,
  'Critério do acordo': l.criterio,
  'Valor a cobrar': l.receita,
  Status: l.status,
}))), 'Cobranças Julho')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(CONTATOS.map((c) => ({
  Marca: c.marca, Contato: c.pessoa, Telefone: c.tel, Canal: c.canal, Origem: c.fonte, Observação: c.obs,
}))), 'Contatos')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(PENDENCIAS.map((p) => ({
  Pendência: p.t, Detalhe: p.d, 'Valor estimado': p.v,
}))), 'Pendências')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DIVERGENCIAS.map((d) => ({
  Item: d.t, Detalhe: d.d, Impacto: d.dif,
}))), 'Divergências')
XLSX.writeFile(wb, join(OUT, 'Cobrancas-Julho-2026-Bula.xlsx'))

console.log('OK ->', OUT)
console.log('Cobrar agora:', brl(TOT_COBRAR), '| Em fechamento:', brl(TOT_FECHANDO), '| A receber:', brl(TOT_RECEBER), '| Total:', brl(TOT_GERAL))
