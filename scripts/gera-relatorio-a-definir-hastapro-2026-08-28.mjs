/**
 * "A DEFINIR" no comissionamento — validacao lote a lote no HastaPro e
 * conciliacao com o que ja foi pago (28/08/2026).
 *
 * Fontes: HastaPro Firebird (LOTES.LOT_PISTEIRO + tabela ASSESSORIA, FIL '2'),
 * bula_leilao_fechamento, bula_leilao_vendas (grupo de lances) e erp_contas_pagar.
 * A apuracao foi feita nos scripts _adef-*.mjs; aqui fica o consolidado + PDF.
 *
 * Uso: node scripts/gera-relatorio-a-definir-hastapro-2026-08-28.mjs
 */
import { chromium } from 'playwright'
import fs from 'fs'

const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const OUT = 'outputs/a-definir-hastapro-2026-08-28'

// Os 43 lotes que hoje caem em "A definir", com o que o HastaPro diz de cada um.
// st: pago | apagar | fora | outro-leilao | duplicata | orfao
const L = [
  // 29/01 BEEM — HastaPro: leilao inteiro do Fabio
  { d: '29/01', ev: 'LEILÃO TOUROS BEEM', lo: '19', vgv: 12600, cp: 'Josimarcos Ferreira', hp: 'Fabio de Omena Gaia', ass: 'Fábio Omena', pct: 0.03, st: 'apagar' },
  { d: '29/01', ev: 'LEILÃO TOUROS BEEM', lo: '25', vgv: 12600, cp: 'Josimarcos Ferreira', hp: 'Fabio de Omena Gaia', ass: 'Fábio Omena', pct: 0.03, st: 'apagar' },
  // 01/02 KATAYAMA
  { d: '01/02', ev: 'KATAYAMA ABERTURA DE SAFRA', lo: '02', vgv: 12400, cp: 'Gilmar Couto Soares', hp: 'Fabio de Omena Gaia', ass: 'Fábio Omena', pct: 0.03, st: 'apagar' },
  { d: '01/02', ev: 'KATAYAMA ABERTURA DE SAFRA', lo: '03', vgv: 16000, cp: 'Valdir Scherer', hp: 'Douglas Bispo Carvalho', ass: 'Douglas Bispo', pct: 0.02, st: 'apagar' },
  { d: '01/02', ev: 'KATAYAMA ABERTURA DE SAFRA', lo: '10', vgv: 20000, cp: 'Valdir Scherer', hp: 'Douglas Bispo Carvalho', ass: 'Douglas Bispo', pct: 0.02, st: 'apagar' },
  // 08/02 PARTNER RG TOUROS
  { d: '08/02', ev: 'PARTNER RG - TOUROS', lo: '93', vgv: 18000, cp: 'Breno José', hp: 'Douglas Bispo Carvalho', ass: 'Douglas Bispo', pct: 0.02, st: 'apagar' },
  // 01/03 MATINHA
  { d: '01/03', ev: 'VIRTUAL TOUROS MATINHA', lo: '109', vgv: 23100, cp: 'Edmilson F. de Souza', hp: 'Fabio de Omena Gaia', ass: 'Fábio Omena', pct: 0.03, st: 'apagar' },
  // 07/04 TOP GENETICA
  { d: '07/04', ev: '2º TOP GENÉTICA', lo: '19', vgv: 18000, cp: 'Jonauto Freitas Costa', hp: '(lote existe, pisteiro vazio)', ass: null, pct: 0.03, st: 'orfao' },
  // 09/05 32o 4R — Bulinha
  ...['42', '43', '44'].map((lo) => ({ d: '09/05', ev: '32º LEILÃO 4R', lo, vgv: 22500, cp: 'Avelino / Ademar', hp: 'Felipe Vilela Andrade', ass: 'Bulinha (Felipe Andrade)', pct: 0.02, st: 'pago', ref: 'CP 10.206,00 pago 17/07' })),
  ...['66', '67', '68'].map((lo) => ({ d: '09/05', ev: '32º LEILÃO 4R', lo, vgv: 19200, cp: 'Vinicius Maudaner', hp: 'Felipe Vilela Andrade', ass: 'Bulinha (Felipe Andrade)', pct: 0.02, st: 'pago', ref: 'CP 10.206,00 pago 17/07' })),
  { d: '09/05', ev: '32º LEILÃO 4R', lo: '54', vgv: 18000, cp: 'Vinicius Maudaner', hp: 'Felipe Vilela Andrade', ass: 'Bulinha (Felipe Andrade)', pct: 0.02, st: 'pago', ref: 'CP 10.206,00 pago 17/07' },
  ...['72', '73', '74'].map((lo) => ({ d: '09/05', ev: '32º LEILÃO 4R', lo, vgv: 20400, cp: 'Vinicius Maudaner', hp: 'Felipe Vilela Andrade', ass: 'Bulinha (Felipe Andrade)', pct: 0.02, st: 'pago', ref: 'CP 10.206,00 pago 17/07' })),
  { d: '09/05', ev: '32º LEILÃO 4R', lo: '40', vgv: 24000, cp: 'Ailton Gabriel de Sousa', hp: 'Fabio de Omena Gaia', ass: 'Fábio Omena', pct: 0.03, st: 'apagar' },
  { d: '09/05', ev: '32º LEILÃO 4R', lo: '94', vgv: 49500, cp: 'Givaldo Ferreira Neves', hp: 'Fabio de Omena Gaia', ass: 'Fábio Omena', pct: 0.03, st: 'apagar' },
  { d: '09/05', ev: '32º LEILÃO 4R', lo: '123', vgv: 48000, cp: 'Cristiano C. de A. Brito', hp: '(lote existe, pisteiro vazio)', ass: null, pct: 0.02, st: 'orfao' },
  // 15/05 JEM
  { d: '15/05', ev: '2º TOUROS JEM', lo: '01', vgv: 64500, cp: '(comprador nao lancado)', hp: 'Felipe Vilela Andrade', ass: 'Bulinha (Felipe Andrade)', pct: 0.02, st: 'pago', ref: 'CP 2.550,00 pago 17/07' },
  { d: '15/05', ev: '2º TOUROS JEM', lo: '05', vgv: 31500, cp: '(comprador nao lancado)', hp: 'Felipe Vilela Andrade', ass: 'Bulinha (Felipe Andrade)', pct: 0.02, st: 'pago', ref: 'CP 2.550,00 pago 17/07' },
  { d: '15/05', ev: '2º TOUROS JEM', lo: '08', vgv: 31500, cp: '(comprador nao lancado)', hp: 'Felipe Vilela Andrade', ass: 'Bulinha (Felipe Andrade)', pct: 0.02, st: 'pago', ref: 'CP 2.550,00 pago 17/07' },
  // 13/06 BEZERRAS JMP
  { d: '13/06', ev: 'BEZERRAS NELORE JMP', lo: '10', vgv: 39000, cp: 'Elvio Severino Pereira', hp: 'Felipe Vilela Andrade', ass: 'Bulinha (Felipe Andrade)', pct: 0.02, st: 'pago', ref: 'CP 1.260,00 pago 17/07' },
  { d: '13/06', ev: 'BEZERRAS NELORE JMP', lo: '34', vgv: 24000, cp: 'Elvio Severino Pereira', hp: 'Felipe Vilela Andrade', ass: 'Bulinha (Felipe Andrade)', pct: 0.02, st: 'pago', ref: 'CP 1.260,00 pago 17/07' },
  // 14/06 JMP TOUROS
  { d: '14/06', ev: '10º NELORE JMP - TOUROS', lo: '179', vgv: 107200, cp: 'Sampaio', hp: 'Felipe Vilela Andrade', ass: 'Bulinha (Felipe Andrade)', pct: 0.02, st: 'pago', ref: 'CP 30.256,00 pago 17/07' },
  { d: '14/06', ev: '10º NELORE JMP - TOUROS', lo: '180', vgv: 80400, cp: 'Sampaio', hp: 'Felipe Vilela Andrade', ass: 'Bulinha (Felipe Andrade)', pct: 0.02, st: 'pago', ref: 'CP 30.256,00 pago 17/07' },
  { d: '14/06', ev: '10º NELORE JMP - TOUROS', lo: '69', vgv: 25500, cp: 'Borges Guia Lopes da Laguna', hp: 'Felipe Vilela Andrade', ass: 'Bulinha (Felipe Andrade)', pct: 0.02, st: 'pago', ref: 'CP 30.256,00 pago 17/07' },
  { d: '14/06', ev: '10º NELORE JMP - TOUROS', lo: '1001', vgv: 500000, cp: 'Guilherme Carvalho e Marcelo', hp: 'Fabio de Omena Gaia', ass: 'Fábio Omena', pct: 0.03, st: 'pago', ref: 'CP 39.450,00 pago 10/08' },
  { d: '14/06', ev: '10º NELORE JMP - TOUROS', lo: '1003', vgv: 380000, cp: 'Guilherme Carvalho e Marcelo', hp: 'Fabio de Omena Gaia', ass: 'Fábio Omena', pct: 0.03, st: 'pago', ref: 'CP 39.450,00 pago 10/08' },
  { d: '14/06', ev: '10º NELORE JMP - TOUROS', lo: '1005', vgv: 240000, cp: 'Guilherme Carvalho e Marcelo', hp: 'Fabio de Omena Gaia', ass: 'Fábio Omena', pct: 0.03, st: 'pago', ref: 'CP 39.450,00 pago 10/08' },
  ...['243', '244', '245', '246'].map((lo) => ({ d: '14/06', ev: '10º NELORE JMP - TOUROS', lo, vgv: 80000, cp: 'Fernando Diniz (Est. Lucatti)', hp: 'Lucas Martins Durães Bragança', ass: 'Lucas Martins', pct: 0.005, st: 'pago', ref: 'CP 2.578,50 pago 10/07 (0,5%)' })),
  // 19/07 GUADALUPE TOUROS
  { d: '19/07', ev: '20º GUADALUPE - TOUROS', lo: '99', vgv: 19500, cp: 'Elielton Taveira (Faz. Caiçara)', hp: 'leilão sem lote lançado no HastaPro', ass: null, pct: 0.02, st: 'orfao', ref: 'CP 390,00 vencido 25/08 — não pago' },
  // 20/08 PARANA E CASABRANCA
  { d: '20/08', ev: 'NELORE PARANÃ E CASABRANCA', lo: '9', vgv: 84000, cp: '7P Agro (grupo) / Fernando C. P. Carneiro (HP)', hp: 'Luiz Felipe Peralta Garcez', ass: 'Peralta', pct: 0.02, st: 'duplicata', ref: 'já fechado em NELORE CEN & FAZ. MODELO — comissão 1.680,00 lançada lá' },
  // 23/08 NAVIRAI REPRODUTORES
  { d: '23/08', ev: '28º NAVIRAÍ CAMPARINO REPR.', lo: '16', vgv: 48000, cp: 'Ângelo Munhoz (Nelore Ferradura)', hp: 'Lucas Martins Durães Bragança', ass: 'Lucas Martins', pct: 0.01, st: 'apagar' },
  { d: '23/08', ev: '28º NAVIRAÍ CAMPARINO REPR.', lo: '117', vgv: 48000, cp: 'Armindo Martins (Agrop. RMC)', hp: 'Lucas Martins Durães Bragança', ass: 'Lucas Martins', pct: 0.01, st: 'apagar' },
  { d: '23/08', ev: '28º NAVIRAÍ CAMPARINO REPR.', lo: '30', vgv: 42000, cp: 'Liberato A. Serafini Filho', hp: 'Luiz Felipe Peralta Garcez', ass: 'Peralta', pct: 0.02, st: 'apagar' },
  { d: '23/08', ev: '28º NAVIRAÍ CAMPARINO REPR.', lo: '22', vgv: 63000, cp: 'Gustavo Barretto (Faz. São Francisco)', hp: 'MARCELO MOURA (M3 Assessoria)', ass: '— fora da Bula', pct: 0, st: 'fora' },
  { d: '23/08', ev: '28º NAVIRAÍ CAMPARINO REPR.', lo: '21', vgv: 105000, cp: 'Joel de Assis Gouvêa Jr. (Faz. Giovanna)', hp: 'Felipe Vilela Andrade (HP) × "Peralta / Bula" (grupo)', ass: 'a decidir', pct: 0.02, st: 'outro-leilao', ref: 'é do 6º LEILÃO EXCELÊNCIA GENÉTICA (23/08), sem fechamento no ERP' },
]

const g = (st) => L.filter((x) => x.st === st)
const soma = (a) => a.reduce((s, x) => s + x.vgv, 0)
const comis = (a) => a.reduce((s, x) => s + x.vgv * x.pct, 0)
const K = { pago: g('pago'), apagar: g('apagar'), fora: g('fora'), dup: g('duplicata'), outro: g('outro-leilao'), orfao: g('orfao') }
const stLabel = { pago: 'já pago', apagar: 'a pagar', fora: 'fora da Bula', duplicata: 'duplicata', 'outro-leilao': 'leilão errado', orfao: 'sem dono' }
const stCls = { pago: 'ok', apagar: 'warn', fora: 'mut', duplicata: 'bad', 'outro-leilao': 'bad', orfao: 'mut' }

const linhas = L.map((x) => `<tr>
  <td>${x.d}</td><td>${x.ev}</td><td>${x.lo}</td>
  <td class="r">${brl(x.vgv)}</td>
  <td>${x.cp}</td>
  <td>${x.hp}</td>
  <td><b>${x.ass ?? '—'}</b></td>
  <td class="r">${x.pct ? (x.pct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%' : '—'}</td>
  <td class="r">${x.pct ? brl(x.vgv * x.pct) : '—'}</td>
  <td class="${stCls[x.st]}">${stLabel[x.st]}${x.ref ? `<div class="nt">${x.ref}</div>` : ''}</td></tr>`).join('')

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>A definir — validação HastaPro</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Inter:wght@400;600;700&display=swap');
@page { size: A4 landscape; margin: 12mm 10mm; }
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Inter',Arial,sans-serif; color:#111; font-size:9.5px; }
.head { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #111; padding-bottom:9px; }
.brand { font-family:'Oswald',sans-serif; font-size:19px; letter-spacing:2px; text-transform:uppercase; font-weight:600; }
.brand small { color:#C9A84C; }
.doc { text-align:right; font-size:9px; color:#555; text-transform:uppercase; letter-spacing:1px; }
h1 { font-family:'Oswald',sans-serif; font-size:17px; text-transform:uppercase; letter-spacing:1px; margin:13px 0 3px; }
.sub { color:#555; font-size:10px; margin-bottom:11px; max-width:1050px; line-height:1.45; }
h2 { font-family:'Oswald',sans-serif; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:15px 0 6px; border-left:3px solid #C9A84C; padding-left:7px; }
.kpis { display:flex; gap:7px; margin:9px 0 4px; }
.kpi { flex:1; border:1px solid #ccc; padding:7px 9px; }
.kpi b { display:block; font-size:12.5px; margin-top:2px; white-space:nowrap; font-family:'Oswald',sans-serif; }
.kpi span { font-size:7.5px; text-transform:uppercase; letter-spacing:.8px; color:#666; }
.kpi.g { border-color:#C9A84C; }
table { width:100%; border-collapse:collapse; }
th { text-align:left; font-size:7.5px; text-transform:uppercase; letter-spacing:.5px; color:#555; border-bottom:2px solid #111; padding:4px 5px; }
td { border-bottom:1px solid #e6e6e6; padding:3.5px 5px; vertical-align:top; }
.r { text-align:right; white-space:nowrap; }
tfoot td { border-top:2px solid #111; border-bottom:0; font-weight:700; }
tr { page-break-inside:avoid; }
.ok { color:#4d7a3e; font-weight:600; } .warn { color:#A8791F; font-weight:600; }
.bad { color:#C0504D; font-weight:600; } .mut { color:#777; font-weight:600; }
.nt { font-weight:400; color:#777; font-size:7.5px; margin-top:1px; }
ol, ul { margin:0 0 0 15px; } li { margin-bottom:4px; line-height:1.45; }
.box { border:1px solid #ccc; padding:9px 11px; margin-top:8px; line-height:1.5; }
.foot { margin-top:16px; padding-top:7px; border-top:1px solid #ccc; font-size:8px; color:#777; display:flex; justify-content:space-between; }
.pb { page-break-before:always; }
</style></head><body>
<div class="head">
  <div class="brand">Bula <small>Assessoria</small></div>
  <div class="doc">Comissionamento — bloco "A definir"<br>Validação no HastaPro · 28/08/2026</div>
</div>
<h1>Quem são os assessores por trás dos R$ 2.711.600 "a definir"</h1>
<div class="sub">Os 43 lotes que a tela de comissionamento mostra sem assessor foram conferidos um a um no HastaPro (campo <b>LOT_PISTEIRO</b> e tabela <b>ASSESSORIA</b>, filial '2' = cobertura Bula), na captura do grupo de lances e nos títulos de comissão do ERP. <b>40 dos 43 têm dono identificado.</b> A maior parte já foi paga — o rótulo "A definir" existe porque o fechamento não recebeu o nome, não porque o assessor ficou sem receber.</div>

<div class="kpis">
  <div class="kpi g"><span>Lotes analisados</span><b>43 · ${brl(soma(L))}</b></div>
  <div class="kpi"><span>Identificados no HastaPro</span><b>40 · ${brl(soma(L) - soma(K.orfao))}</b></div>
  <div class="kpi"><span>Comissão já paga (25 lotes)</span><b>${brl(comis(K.pago))}</b></div>
  <div class="kpi"><span>A pagar (12 lotes)</span><b>${brl(comis(K.apagar))}</b></div>
  <div class="kpi"><span>Sai do comissionamento</span><b>${brl(comis(K.fora) + 1680)}</b></div>
  <div class="kpi"><span>Sem dono (3 lotes)</span><b>${brl(soma(K.orfao))}</b></div>
</div>

<h2>O que muda nos R$ 8.190 que a tela pede</h2>
<table>
  <thead><tr><th>Leilão</th><th class="r">Hoje na tela</th><th>Veredito da conferência</th><th class="r">Fica</th></tr></thead>
  <tbody>
    <tr><td>20º Guadalupe — Touros (19/07)</td><td class="r">390,00</td><td>Lote 99 (Elielton Taveira) não existe no HastaPro — o leilão inteiro foi cadastrado com zero lotes na filial 2. Só há o registro do grupo, e ele não nomeia assessor. O título de 390,00 venceu em 25/08 e <b>não foi pago</b>.</td><td class="r">390,00</td></tr>
    <tr><td>Nelore Paranã e Casabranca (20/08)</td><td class="r">1.680,00</td><td><b>Duplicata.</b> A mensagem diz "lote 9 / leilão modelo / 2.800 × 30". É o lote 09 do <b>Nelore CEN &amp; Fazenda Modelo</b>, do mesmo dia, já fechado com o <b>Peralta</b> e comissão de 1.680,00 lançada. O mesmo lote está contado duas vezes.</td><td class="r">0,00</td></tr>
    <tr><td>28º Naviraí Camparino Reprodutores (23/08)</td><td class="r">6.120,00</td><td>Lotes 16 e 117 = <b>Lucas Martins</b> (1%, regra do Grupo Financeiro de 05/08) → 960,00 · lote 30 = <b>Peralta</b> (2%) → 840,00 · lote 22 = <b>Marcelo Moura / M3 Assessoria</b>, comprador preferencial da leiloeira → não é cobertura Bula · lote 21 é de <b>outro leilão</b> (abaixo).</td><td class="r">1.800,00</td></tr>
  </tbody>
  <tfoot><tr><td>Total</td><td class="r">8.190,00</td><td>mais 2.100,00 que migram para o 6º Excelência Genética, que ainda não tem fechamento</td><td class="r">2.190,00</td></tr></tfoot>
</table>

<h2>O passivo que a tela não mostra: R$ ${brl(comis(K.apagar))} de comissão identificada e nunca lançada</h2>
<div class="box">
De janeiro a maio, sete lotes ficaram com <b>comissão 0,00</b> no fechamento — não é rateio pendente, é zero gravado. O HastaPro tem o pisteiro de todos: <b>Fábio Omena</b> (BEEM lotes 19 e 25, Katayama 02, Matinha 109, 4R 40 e 94 — R$ 4.026,00 a 3%, o percentual dele até junho) e <b>Douglas Bispo</b> (Katayama 03 e 10, Partner RG 93 — R$ 1.080,00 a 2%). Somando o Naviraí de agosto (Lucas 960,00 + Peralta 840,00), o total identificado a pagar é <b>${brl(comis(K.apagar))}</b>.
<br><br>⚠ <b>Antes de emitir os títulos de jan–mai:</b> existe um pagamento genérico <b>"Despesas — LEILÃO MATINHA" de R$ 5.419,00</b> (quitado em 23/04, fornecedor "ASSESSORES BULA (COMISSÕES)") <b>sem vínculo a fechamento nenhum</b>. BEEM, Katayama e Partner RG não têm título de comissão algum, mas esse acerto solto pode ter absorvido parte do período — conferir antes de pagar de novo.
</div>

<h2>Divergências estruturais encontradas de quebra</h2>
<ul>
  <li><b>Naviraí 23/08 — dois lotes faltando no fechamento:</b> o HastaPro tem 23 lotes (R$ 940.500) e o ERP tem 22 (R$ 948.000). Faltam o <b>lote 12 (R$ 49.500, Leonardo Serafim)</b> e o <b>lote 78 (R$ 48.000, Peralta)</b>; e sobra o lote 21, que é de outro leilão. Corrigido isso, entram +990,00 para o Leonardo e +960,00 para o Peralta.</li>
  <li><b>Lote 21 (R$ 105.000):</b> pertence ao <b>6º Leilão Excelência Genética (23/08)</b> — comprador Joel de Assis Gouvêa Jr., Fazenda Giovanna/SP. O HastaPro registra o pisteiro <b>Felipe Vilela Andrade (Bulinha)</b>; a mensagem do grupo diz <b>"Peralta / Bula"</b>. Precisa da palavra do chefe antes de virar título (R$ 2.100 a 2% para um dos dois).</li>
  <li><b>Matinha 01/03:</b> o único título vinculado a esse fechamento é a comissão do <b>Matinha de 21/06</b> (R$ 3.360 do Fábio) — <i>fechamento_id</i> errado. E o HastaPro atribui os 6 lotes do leilão ao Fábio, enquanto o fechamento dá o lote 68 (R$ 19.500) ao Douglas.</li>
  <li><b>JMP Touros 14/06:</b> o Fábio recebeu R$ 39.450 (3% de R$ 1.315.000), mas o VGV dele no HastaPro é R$ 1.274.500 — R$ 40.500 a mais na base, R$ 1.215 pagos a maior. Vale conferir contra a planilha que originou o pagamento.</li>
</ul>

<div class="pb"></div>
<h2>Os 43 lotes, um a um</h2>
<table>
  <thead><tr><th>Data</th><th>Leilão</th><th>Lote</th><th class="r">VGV</th><th>Comprador</th><th>HastaPro (pisteiro / assessoria)</th><th>Assessor</th><th class="r">%</th><th class="r">Comissão</th><th>Situação</th></tr></thead>
  <tbody>${linhas}</tbody>
  <tfoot><tr><td colspan="3">43 lotes</td><td class="r">${brl(soma(L))}</td><td colspan="4"></td><td class="r">${brl(comis(L))}</td><td></td></tr></tfoot>
</table>

<h2>O que fazer</h2>
<ol>
  <li><b>Cancelar o fechamento "Leilão Nelore Paranã e Casabranca Expogenética" (20/08)</b> — é o lote 09 do Nelore CEN &amp; Fazenda Modelo, já fechado com o Peralta. Enquanto existir, o ERP conta R$ 84.000 de VGV e R$ 1.680 de comissão em dobro.</li>
  <li><b>Nomear os 12 lotes identificados</b> nos fechamentos (Fábio, Douglas, Lucas, Peralta) e emitir os títulos — R$ ${brl(comis(K.apagar))} —, depois de conferir o acerto solto de R$ 5.419,00 de 23/04.</li>
  <li><b>Tirar o lote 22 do Naviraí</b> (Marcelo Moura / M3 Assessoria): comprador preferencial da leiloeira, não é cobertura Bula. Saem R$ 63.000 de VGV e R$ 1.260 de comissão.</li>
  <li><b>Abrir o fechamento do 6º Excelência Genética (23/08)</b> com o lote 21 e decidir entre Bulinha (HastaPro) e Peralta (grupo).</li>
  <li><b>Completar o Naviraí</b> com os lotes 12 (Leonardo) e 78 (Peralta), que o grupo não capturou.</li>
  <li><b>Três lotes seguem sem dono</b> — Top Genética 19 (R$ 18.000, Jonauto Freitas Costa), 4R 123 (R$ 48.000, Cristiano Costa de Andrade Brito) e Guadalupe Touros 99 (R$ 19.500, Elielton Taveira). Nos dois primeiros o lote está no HastaPro com o pisteiro em branco; no terceiro a leiloeira nunca lançou o leilão. Perguntar ao Fábio (levou os outros 10 lotes do Top Genética) e à Guadalupe.</li>
</ol>

<div class="foot"><span>Bula Assessoria — conferência de comissionamento</span><span>HastaPro (FIL 2) · fechamentos · grupo de lances · contas a pagar — 28/08/2026</span></div>
</body></html>`

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(`${OUT}/relatorio.html`, html)
fs.writeFileSync(`${OUT}/dados.json`, JSON.stringify({
  gerado_em: '2026-08-28',
  lotes: L,
  totais: {
    vgv: soma(L), comissao_total: comis(L),
    pago: { lotes: K.pago.length, vgv: soma(K.pago), comissao: comis(K.pago) },
    a_pagar: { lotes: K.apagar.length, vgv: soma(K.apagar), comissao: comis(K.apagar) },
    fora: { lotes: K.fora.length, vgv: soma(K.fora) },
    duplicata: { lotes: K.dup.length, vgv: soma(K.dup), comissao_duplicada: 1680 },
    outro_leilao: { lotes: K.outro.length, vgv: soma(K.outro) },
    orfaos: { lotes: K.orfao.length, vgv: soma(K.orfao) },
  },
}, null, 2))

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: `${OUT}/A-DEFINIR-HASTAPRO-2026-08-28.pdf`, format: 'A4', landscape: true, printBackground: true })
await browser.close()

console.log('PDF:', `${OUT}/A-DEFINIR-HASTAPRO-2026-08-28.pdf`)
console.log('pago    ', K.pago.length, brl(soma(K.pago)), '| comissao', brl(comis(K.pago)))
console.log('a pagar ', K.apagar.length, brl(soma(K.apagar)), '| comissao', brl(comis(K.apagar)))
console.log('fora', K.fora.length, brl(soma(K.fora)), '| dup', K.dup.length, brl(soma(K.dup)), '| outro', K.outro.length, brl(soma(K.outro)), '| orfaos', K.orfao.length, brl(soma(K.orfao)))
console.log('soma geral', brl(soma(L)), '(esperado 2.711.600,00)')
