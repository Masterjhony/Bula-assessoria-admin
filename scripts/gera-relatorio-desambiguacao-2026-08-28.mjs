/**
 * Desambiguação do comissionamento — quem é quem nos nomes estranhos da tela.
 * Apuração de 28/08/2026 contra HastaPro (FIL '2' Bula Assessoria e FIL '01'
 * Bula Remates), captura do grupo de lances (com o remetente de cada mensagem),
 * planilhas de comissão dos assessores, CRM e contas a pagar.
 *
 * Uso: node scripts/gera-relatorio-desambiguacao-2026-08-28.mjs
 */
import { chromium } from 'playwright'
import fs from 'fs'

const OUT = 'outputs/desambiguacao-comissoes-2026-08-28'
const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Desambiguação do comissionamento</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Inter:wght@400;600;700&display=swap');
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Inter',Arial,sans-serif; color:#111; font-size:10px; line-height:1.5; }
.head { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #111; padding-bottom:9px; }
.brand { font-family:'Oswald',sans-serif; font-size:19px; letter-spacing:2px; text-transform:uppercase; font-weight:600; }
.brand small { color:#C9A84C; }
.doc { text-align:right; font-size:9px; color:#555; text-transform:uppercase; letter-spacing:1px; }
h1 { font-family:'Oswald',sans-serif; font-size:17px; text-transform:uppercase; letter-spacing:1px; margin:13px 0 3px; }
.sub { color:#555; font-size:10px; margin-bottom:12px; }
h2 { font-family:'Oswald',sans-serif; font-size:12.5px; text-transform:uppercase; letter-spacing:1px; margin:17px 0 7px; border-left:3px solid #C9A84C; padding-left:7px; }
h3 { font-family:'Oswald',sans-serif; font-size:11px; text-transform:uppercase; letter-spacing:.5px; margin:12px 0 4px; }
table { width:100%; border-collapse:collapse; margin:5px 0 3px; }
th { text-align:left; font-size:8px; text-transform:uppercase; letter-spacing:.5px; color:#555; border-bottom:2px solid #111; padding:4px 5px; }
td { border-bottom:1px solid #e6e6e6; padding:4px 5px; vertical-align:top; }
.r { text-align:right; white-space:nowrap; }
tfoot td { border-top:2px solid #111; border-bottom:0; font-weight:700; }
tr { page-break-inside:avoid; }
.ok { color:#4d7a3e; font-weight:600; } .bad { color:#C0504D; font-weight:600; } .warn { color:#A8791F; font-weight:600; }
.box { border:1px solid #ccc; padding:9px 11px; margin:7px 0; }
.box.g { border-left:3px solid #C9A84C; }
.box.r { border-left:3px solid #C0504D; }
ul, ol { margin:2px 0 2px 16px; } li { margin-bottom:3px; }
.small { font-size:9px; color:#666; }
.foot { margin-top:18px; padding-top:7px; border-top:1px solid #ccc; font-size:8px; color:#777; display:flex; justify-content:space-between; }
.pb { page-break-before:always; }
.kv { display:flex; gap:6px; margin:2px 0; } .kv b { min-width:112px; font-size:9px; text-transform:uppercase; letter-spacing:.5px; color:#666; font-weight:600; }
</style></head><body>
<div class="head">
  <div class="brand">Bula <small>Assessoria</small></div>
  <div class="doc">Comissionamento — desambiguação de assessores<br>28/08/2026</div>
</div>
<h1>Quem é quem: os três nomes estranhos da tela</h1>
<div class="sub">Cada caso foi conferido no HastaPro (<b>FIL '2' = Bula Assessoria</b>, <b>FIL '01' = Bula Remates</b> — são bancos diferentes e não podem ser somados), na captura do grupo de lances com o <b>remetente de cada mensagem</b>, nas planilhas de comissão que os assessores mandaram e nas contas a pagar. Dois fecharam com prova; um continua em aberto e explico exatamente por quê.</div>

<h2>1 · "Fabricio Hyppolito" — não é assessor, é o comprador ✔ corrigido</h2>
<div class="box g">
<div class="kv"><b>Era</b><span>Destaques da Safra Nelore Cachoeirão (03/06), lote 43 — assessor "Fabricio Hyppolito", comprador "Arthur Lopes", R$ 16.500 (1 animal), comissão R$ 330.</span></div>
<div class="kv"><b>É</b><span>Comprador <b>FABRICIO OSÓRIO HYPPOLITO</b> (Faz. Sabiá Dourado/PA, cliente HastaPro 251010095116153) · assessor <b>Bulinha (Felipe Vilela Andrade)</b> · <b>3 animais × R$ 550 × 30 = R$ 49.500</b>.</span></div>
<div class="kv"><b>Prova</b><span>No HastaPro o lote 43 tem <i>LOT_PISTEIRO</i> e <i>ASSESSORIA/VENDA</i> = Felipe Vilela Andrade, e o comprador é o Fabricio. Ele tem <b>26 compras</b> na base (5 só nesse leilão: lotes 19, 20, 43, 44 e 45, todas com o Bulinha). O R$ 16.500 do ERP era o valor <b>por animal</b>. "Arthur Lopes" é comprador de outro evento — o lote M5 do 2º LS Now (30/05), onde o Fabricio aparece como pisteiro; os dois nomes vieram grudados de lá.</span></div>
<div class="kv"><b>Comissão</b><span>O Cachoeirão é da <b>BULA REMATES</b> (cronograma e FIL '01' confirmam) → pela regra do chefe de 23/07 o <b>Bulinha não recebe comissão em leilão da Bula Remates</b>: <b>0%</b>. A CP de R$ 330 já estava cancelada desde 27/07 — a tela é que continuava pedindo.</span></div>
</div>

<h2>2 · "Nane / Fábio Omena" — venda conjunta, comissão do Fábio ✔ corrigido</h2>
<div class="box g">
<div class="kv"><b>Era</b><span>20º Guadalupe Touros (19/07), lote 60 — assessor "Nane / Fábio Omena", R$ 21.000, comissão R$ 420.</span></div>
<div class="kv"><b>É</b><span><b>Fábio Omena</b> (decisão do João em 28/08). Comprador: Sr. Reinaldo e dona Maria Tavares, Faz. Nossa Senhora de Fátima, Vila Bela/MT.</span></div>
<div class="kv"><b>Prova</b><span>A mensagem do grupo declara os dois ("Foi com a Nane e com o Fábio Omena"), mas <b>o lote 25 do mesmo pregão tem o mesmo comprador</b> e diz "Com Fábio Omena da Bula assessoria" — o cliente é dele. E os R$ 420 <b>já foram baixados</b> contra o PIX de R$ 8.826,00 pago ao Fábio em 25/08.</span></div>
<div class="kv"><b>Efeito</b><span>Nenhum ajuste financeiro. O Fábio passa a somar R$ 42.000 nesse leilão (R$ 840) e a linha dupla some da tela.</span></div>
</div>

<h2>3 · "Peralta / Bula" — as duas fontes discordam ⚠ em aberto</h2>
<div class="box r">
<div class="kv"><b>Em jogo</b><span>Lote 11 do Naviraí Essência (22/08, R$ 93.000) e lote 21 do 6º Excelência Genética (23/08, R$ 105.000) — mesmo comprador, <b>Condomínio Magda e Jacamim</b>. Comissão de <b>R$ 3.960</b> (2%).</span></div>
<div class="kv"><b>HastaPro diz</b><span><b>Bulinha</b> (Felipe Vilela Andrade) como pisteiro e como ASSESSORIA/VENDA nos dois lotes. Compradores: Valdemar Pissinatti Guerra (Faz. Magda) + Marcos Martins Villela no lote 11; Valdemar + Joel de Assis Gouvêa Jr. no lote 21 — compra em condomínio, o que casa com "Condomínio Magda e jacamim".</span></div>
<div class="kv"><b>O grupo diz</b><span><b>Peralta</b>. As duas mensagens são do <b>próprio Felipe Peralta</b> (verificado pelo remetente), assinadas "Peralta / Bula". Na mesma semana ele mandou outras quatro no mesmo formato — lote 9 do Fazenda Modelo, lote 1 do Marcondes, lotes 30 e 78 do Naviraí — e <b>em todas o HastaPro confirma que o pisteiro era ele</b>.</span></div>
<div class="kv"><b>O que pesa</b><span>O Bulinha tem <b>exatamente esses 2 lotes</b> na Bula Assessoria em julho e agosto — ele operou março (6), maio (37) e junho (36) e parou. Não reivindicou nada no grupo. O CRM não tem responsável para nenhum dos dois compradores, e nenhum deles tem histórico anterior que aponte um assessor (o Joel Gouvêa comprou 8 vezes antes, sempre com o <b>Leonardo</b>).</span></div>
<div class="kv"><b>Conclusão</b><span>As fontes não desempatam. A leitura mais consistente é <b>Peralta</b> (declaração assinada na hora, padrão idêntico ao dos outros quatro lotes dele), com o registro da leiloeira tendo ficado no nome do Bulinha. Mas isso é leitura, não prova — <b>uma pergunta ao Peralta e ao Bulinha encerra</b>. Há tempo: a comissão de agosto só vence em 25/09.</span></div>
</div>

<div class="pb"></div>
<h2>O que mudou na tela</h2>
<table>
  <thead><tr><th>Linha que existia</th><th class="r">VGV</th><th class="r">Comissão</th><th>Virou</th></tr></thead>
  <tbody>
    <tr><td>Fabricio Hyppolito</td><td class="r">16.500,00</td><td class="r">330,00</td><td><b>Bulinha (Felipe Andrade)</b> — R$ 49.500, comissão 0 (leilão da Bula Remates)</td></tr>
    <tr><td>Nane / Fábio Omena</td><td class="r">21.000,00</td><td class="r">420,00</td><td><b>Fábio Omena</b> — soma nos R$ 42.000 dele no Guadalupe Touros</td></tr>
    <tr><td>Com Douglas Bispo - Bula Assessoria - Julimar Belarmino</td><td class="r">33.000,00</td><td class="r">660,00</td><td><b>Douglas Bispo</b> — Julimar é o comprador (HastaPro + planilha COMISSAO AGOSTO do próprio Douglas)</td></tr>
    <tr><td>Fábio Omena Gaia <span class="small">(linha separada de "Fábio Omena")</span></td><td class="r">2.150.660,00</td><td class="r">43.013,20</td><td>Fundiu no <b>Fábio Omena</b> — faltava o apelido no cadastro de Equipe</td></tr>
    <tr><td>Laila Oliveira <span class="small">(linha separada de "Laila")</span></td><td class="r">127.500,00</td><td class="r">1.875,00</td><td>Fundiu na <b>Laila</b> — mesma causa</td></tr>
    <tr><td>Peralta / Bula</td><td class="r">93.000,00</td><td class="r">1.860,00</td><td class="bad">Mantido — pendente da decisão acima</td></tr>
  </tbody>
</table>
<div class="small">A tela saiu de <b>17 para 13 assessores</b>. O Bulinha, que não aparecia em lugar nenhum apesar de ser o terceiro maior beneficiário de comissão paga do ano (R$ 66.264 em títulos), passou a existir nela.</div>

<h2>O que ficou pendente (e o número de cada coisa)</h2>
<table>
  <thead><tr><th>Pendência</th><th>Situação</th><th class="r">Valor</th></tr></thead>
  <tbody>
    <tr><td>Lotes 11 e 21 — Condomínio Magda/Jacamim</td><td>Peralta (grupo) × Bulinha (HastaPro). Vence 25/09.</td><td class="r">3.960,00</td></tr>
    <tr><td>Cachoeirão 03/06 — cobertura não lançada</td><td>O HastaPro tem <b>30 lotes de assessores Bula (R$ 710.700)</b> nesse leilão; o fechamento tem 7. Faltam <b>Bulinha 17 lotes (R$ 431.400, 0% por ser Bula Remates)</b>, Laila 4 (R$ 78.000), Lucas 1 (R$ 22.500), Valéria 1 (R$ 18.300) e Peralta 1 (R$ 18.000).</td><td class="r">360,00 <span class="small">(Peralta, 2%)</span><br><span class="small">+ Laila/Lucas/Valéria: 1.188 a 1% ou 594 a 0,5%</span></td></tr>
    <tr><td>Gustavo Rusa no leilão errado</td><td>Os R$ 207.000 lançados no Cachoeirão de 03/06 são, lote a lote (01, 02 e ASP01B), do <b>Pérolas Cachoeirão de 14/04</b>. Ele já recebeu — o que está errado é a alocação por evento, que infla o custo de um leilão e esvazia o do outro.</td><td class="r">10.350,00 <span class="small">(realocar)</span></td></tr>
    <tr><td>"Matheus Amormino" dentro do Marcelo Carneiro</td><td>No HastaPro é pisteiro próprio (R$ 21.000 no Pérolas 14/04), mas o cadastro de Equipe o traz como apelido do Marcelo — regra de pagamento da FdB, não identidade. Sem ajuste; fica registrado.</td><td class="r">—</td></tr>
    <tr><td>Valéria Borges fora do cadastro de Equipe</td><td>Aparece nos fechamentos (R$ 75.300 / R$ 753) e tem CNPJ, mas não tem linha em Equipe — por isso não herda empresa nem percentual.</td><td class="r">—</td></tr>
  </tbody>
</table>

<h2>Uma regra que vale escrever</h2>
<div class="box">
<b>FIL '01' é BULA REMATES; FIL '2' é BULA ASSESSORIA</b> — são duas empresas dentro do mesmo HastaPro (CNPJ 50.059.339/0001-31 e 34.791.630/0001-43; ainda existe a FIL '3' no CPF do Felipe Vilela Andrade, hoje vazia). A Remates tem os vendedores dela e vende por conta própria: um lote na FIL '01' <b>não é</b> cobertura da Assessoria só porque tem um pisteiro conhecido no campo. Nos leilões da Remates o Bulinha não recebe comissão (regra do chefe de 23/07) — os demais recebem normal. Foi exatamente essa confusão que colocou o comprador no lugar do assessor no lote 43 do Cachoeirão.
</div>

<div class="foot"><span>Bula Assessoria — desambiguação do comissionamento</span><span>HastaPro FIL 01/02 · grupo de lances (com remetente) · planilhas dos assessores · CRM · contas a pagar</span></div>
</body></html>`

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(`${OUT}/relatorio.html`, html)
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: `${OUT}/DESAMBIGUACAO-COMISSOES-2026-08-28.pdf`, format: 'A4', printBackground: true })
await browser.close()
console.log('PDF:', `${OUT}/DESAMBIGUACAO-COMISSOES-2026-08-28.pdf`)
