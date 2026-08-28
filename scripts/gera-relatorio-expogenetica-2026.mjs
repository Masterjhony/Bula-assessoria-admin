/**
 * RELATÓRIO DA EXPOGENÉTICA 2026 — PDF + XLSX na Área de Trabalho.
 * Formato exatamente como pedido pelo chefe no grupo (26/08).
 * Roda a apuração (scripts/apura-expogenetica-2026.mjs) e desenha o documento.
 */
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'
import fs from 'node:fs'
import path from 'node:path'

const DESKTOP = 'C:/Users/Notebook-Acer/Desktop'
const OUT = 'outputs/relatorio-expogenetica-2026'
const TMP = path.join(OUT, 'apuracao.json')
const HOJE = '28/08/2026'

fs.mkdirSync(OUT, { recursive: true })
execFileSync('node', ['scripts/apura-expogenetica-2026.mjs', '--json', TMP], { stdio: 'inherit' })
const D = JSON.parse(fs.readFileSync(TMP, 'utf8'))
const { P, FEIRA_ABCZ, leiloes, assessores, custos, C, T, dre, M1, EXCLUIDOS, NFS_AGOSTO, TERRA_BRAVA } = D

const brl = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const brl0 = n => `R$ ${Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
const num = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (n, c = 2) => `${(Number(n || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })}%`
const dt = s => s.slice(8, 10) + '/' + s.slice(5, 7)
const mi = n => `R$ ${(n / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`

/* ── o custo do parceiro: quanto a 5% do Rusa pesa contra os 2% de assessor ── */
const rusa = assessores.find(a => a.nome === 'Gustavo Rusa')
const rusaSe2 = rusa ? Math.round(rusa.venda * 0.02 * 100) / 100 : 0
const rusaExtra = rusa ? Math.round((rusa.comissao - rusaSe2) * 100) / 100 : 0
const lucroSemRusa = Math.round((dre.lucro + rusaExtra) * 100) / 100

const logo = fs.readFileSync('public/logo-bula-assessoria-white.png').toString('base64')
const sinal = n => n < 0 ? 'neg' : 'pos'
const maxVenda = Math.max(...assessores.map(a => a.venda))

const linhasAss = assessores.map(a => `<tr>
  <td><b>${a.nome}</b>${a.semPct ? '<span class="mk">*</span>' : ''}${a.nome === 'Gustavo Rusa' ? '<div class="sub small">parceiro — comissão por direcionamento de comprador</div>' : ''}${a.diferido ? `<div class="sub small">${a.diferido.nota}</div>` : ''}</td>
  <td class="num">${a.pregoes}</td>
  <td class="num">${a.lotes}</td>
  <td class="num">${a.animais}</td>
  <td class="num"><div class="bar"><span style="width:${(a.venda / maxVenda * 100).toFixed(1)}%"></span></div>${brl0(a.venda)}</td>
  <td class="num">${pct(a.venda / T.venda, 1)}</td>
  <td class="num">${pct(a.pct, 0)}</td>
  <td class="num"><b>${num(a.comissao)}</b></td></tr>`).join('')

const tagReceita = l => l.receitaTipo === 'sem venda' ? ''
  : /cobrança emitida/.test(l.receitaTipo) ? '<span class="tag t-ok">emitida</span>'
  : /corrigir/.test(l.receitaTipo) ? '<span class="tag t-fix">a corrigir</span>'
  : '<span class="tag t-est">estimada</span>'

const linhasLei = leiloes.map(l => `<tr class="${l.venda ? '' : 'zero'}">
  <td class="ctr">${dt(l.data)}</td>
  <td>${l.nome}${l.ord ? '' : '<span class="mk">†</span>'}${l.obs ? `<div class="sub small">${l.obs}</div>` : ''}</td>
  <td class="num sub">${l.fatPregao ? brl0(l.fatPregao) : '—'}</td>
  <td class="num">${l.venda ? brl0(l.venda) : '—'}</td>
  <td class="num sub">${l.venda && l.fatPregao ? pct(l.venda / l.fatPregao, 1) : '—'}</td>
  <td class="num">${l.lotes.length || '—'}</td>
  <td class="num">${l.venda ? num(l.receita) : '—'}</td>
  <td class="ctr">${tagReceita(l)}</td>
  <td class="num">${l.venda ? num(l.comissaoPaga) : '—'}</td></tr>`).join('')

/* leilões no vermelho: recalculados a cada rodada, nunca listados à mão */
const negativos = leiloes.filter(l => l.venda && l.margemContrib < 0).sort((a, b) => a.margemPctVenda - b.margemPctVenda)
const negSoma = Math.round(negativos.reduce((s2, l) => s2 + l.margemContrib, 0) * 100) / 100

/* praça que passou sem cobertura da Bula */
const semCob = leiloes.filter(l => !l.venda && l.fatPregao)
const somaSemCob = semCob.reduce((s, l) => s + l.fatPregao, 0)

const linhasCriterio = leiloes.filter(l => l.venda).map(l => `<tr>
  <td>${l.nome}</td>
  <td class="num">${pct(l.receitaPct)}</td>
  <td class="small">${l.receitaNota}</td>
  <td class="num">${num(l.receita)}</td></tr>`).join('')

/* Cada regra deste fechamento e a mensagem do grupo Financeiro que a define.
 * É o rastro que permite conferir o relatório sem abrir o WhatsApp. */
const DECISOES = [
  { quando: '26/08 12:51', quem: 'Marcelo', regra: 'Acordo HoRa: 4% da venda',
    efeito: `receita do HoRa de ${brl(1200)} para ${brl(960)}` },
  { quando: '26/08 12:51', quem: 'Marcelo', regra: 'Acordo Araras: 3% da venda',
    efeito: `receita do Araras de ${brl(4350)} para ${brl(2610)}` },
  { quando: '26/08 18:19', quem: 'Marcelo', regra: 'Estadia de 8.000 na casa de Uberaba',
    efeito: `${brl(2000)} pagos, ${brl(6000)} a lançar` },
  { quando: '26/08 21:20', quem: 'Marcelo', regra: '"Não é lucro líquido, errei. É lucro bruto"',
    efeito: 'resultado da DRE renomeado — não carrega estrutura nem folha' },
  { quando: '27/08 21:06', quem: 'Marcelo', regra: 'Santa Nice: acordo é 5%, não 5,7%',
    efeito: `receita de ${brl(16929)} para ${brl(14850)}` },
  { quando: '27/08 21:06', quem: 'Marcelo', regra: 'Fazenda Modelo (Top Cen): 3%',
    efeito: `receita de ${brl(4504.5)} para ${brl(3510)}` },
  { quando: '27/08 21:06', quem: 'Marcelo', regra: 'Nacional Premium e Pepitas: 3%',
    efeito: `receita de ${brl(26025)} para ${brl(15615)} nos dois somados` },
  { quando: '27/08 21:06', quem: 'Marcelo', regra: 'Reembolso da equipe: considerar 5.000',
    efeito: `linha de reembolso fixada em ${brl(5000)}` },
  { quando: '27/08 21:09', quem: 'Marcelo', regra: '"Não paga 2% para Nane"',
    efeito: `os ${brl(6150)} dela seguem no custo, mas o desembolso é 28/12, não 25/09` },
  { quando: '27/08 21:23', quem: 'Guilherme', regra: 'Peralta e Bula: 2%, pago ao Bulinha',
    efeito: 'lote 21 do Excelência Genética mantido a 2%' },
  { quando: '28/08', quem: 'João', regra: 'Fêmeas JMP fora do fechamento (duplicata do lote 48 do Shopping Naviraí)',
    efeito: `−${brl(41400)} de venda e −${brl(828)} de comissão` },
  { quando: '28/08 16:46', quem: 'Marcelo', regra: 'Matheus Alves (CPD da Remates) não recebe comissão de venda',
    efeito: 'sem efeito nesta feira — nenhum lote no nome dele no HastaPro' },
]

const GRUPO = { transporte: 'Transporte', estadia: 'Estadia', alimentacao: 'Alimentação', outros: 'Outros' }
const linhasCusto = custos.map(c => `<tr class="${c.situacao === 'pago' ? '' : 'est'}">
  <td>${GRUPO[c.grupo]}</td><td>${c.item}</td>
  <td class="num">${num(c.valor)}</td>
  <td class="ctr"><span class="tag ${c.situacao === 'pago' ? 't-ok' : c.situacao === 'estimado' ? 't-est' : 't-fix'}">${c.situacao}</span></td>
  <td class="sub small">${c.fonte}</td></tr>`).join('')

const dreRow = (rot, v, o = {}) => `<tr class="${o.cls || ''}">
  <td>${rot}</td>
  <td class="num">${o.neg ? `(${num(v)})` : num(v)}</td>
  <td class="num sub">${o.hidePct ? '' : pct(v / dre.faturamento, 1)}</td></tr>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, Arial, sans-serif; color: #16181d; font-size: 9pt; line-height: 1.45; }
  .page { padding: 10mm 13mm 8mm; }
  .brk { page-break-before: always; }
  h1,h2,h3,.k,.tag,th,.v { font-family: Oswald, Arial, sans-serif; text-transform: uppercase; letter-spacing: .04em; font-weight: 500; }
  header { background: #0c0d10; color: #fff; padding: 11mm 13mm 8mm; }
  header img { height: 32px; opacity: .95; }
  header h1 { font-size: 21pt; margin-top: 6mm; line-height: 1.05; letter-spacing: .02em; }
  header .gold { color: #C9A84C; }
  header .sub { color: #9aa0aa; font-size: 8.4pt; margin-top: 3.5mm; line-height: 1.5; }
  h2 { font-size: 11.5pt; margin: 6mm 0 2.5mm; padding-bottom: 1.8mm; border-bottom: 1.5pt solid #0c0d10; }
  h2 .n { color: #C9A84C; margin-right: 2.5mm; }
  h2:first-child { margin-top: 0; }
  h3 { font-size: 9pt; margin: 5mm 0 2mm; color: #4a5058; }
  p { margin-bottom: 2.5mm; }
  .lead { font-size: 9.8pt; }
  table { width: 100%; border-collapse: collapse; margin: 2.5mm 0 2mm; }
  th { font-size: 7.2pt; text-align: left; color: #5a616e; border-bottom: 1pt solid #c2c6cd; padding: 2mm; }
  td { padding: 1.7mm 2mm; border-bottom: .4pt solid #e8eaee; vertical-align: middle; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.ctr, th.ctr { text-align: center; }
  .sub { color: #6b727f; } .small { font-size: 7.4pt; line-height: 1.35; }
  tr.zero td { color: #a4a9b2; } tr.est td { background: #fcfaf4; }
  tfoot td { border-top: 1.2pt solid #0c0d10; border-bottom: none; font-weight: 600; padding-top: 2.4mm; }
  .bar { display: inline-block; width: 22mm; height: 1.7mm; background: #eceef1; border-radius: 1mm; margin-right: 2.5mm; vertical-align: middle; overflow: hidden; }
  .bar span { display: block; height: 100%; background: #0c0d10; }
  .tag { font-size: 6.6pt; padding: .7mm 1.8mm; border-radius: 1.5mm; white-space: nowrap; }
  .t-ok { background: #e6efe8; color: #2c6539; }
  .t-est { background: #f7efd9; color: #86680f; }
  .t-fix { background: #fbeae8; color: #9c2e27; }
  .mk { color: #C9A84C; font-weight: 600; }
  .cards { display: flex; gap: 3mm; margin: 4mm 0 2mm; }
  .card { flex: 1; border: .6pt solid #d7dade; border-radius: 2mm; padding: 3mm; }
  .card .k { font-size: 6.9pt; color: #6b727f; }
  .card .v { font-size: 15pt; margin-top: 1.5mm; letter-spacing: 0; }
  .card .d { font-size: 7.1pt; color: #6b727f; margin-top: 1mm; line-height: 1.35; }
  .card.dark { background: #0c0d10; border-color: #0c0d10; }
  .card.dark .k { color: #9aa0aa; } .card.dark .v { color: #fff; } .card.dark .d { color: #9aa0aa; }
  .card.gold { border-color: #C9A84C; border-width: 1pt; }
  .card.gold .v { color: #8a6d1f; }
  .neg { color: #9c2e27; } .pos { color: #2c6539; }
  .box { border-left: 2.2pt solid #C9A84C; background: #faf8f2; padding: 3mm 4mm; margin: 3mm 0; }
  .box .k { font-size: 8.2pt; margin-bottom: 1.5mm; }
  .box.dark { border-left-color: #0c0d10; background: #f4f5f7; }
  ul { margin: 1.5mm 0 2mm 4.5mm; } li { margin-bottom: 1.5mm; }
  /* DRE */
  .dre { border: .8pt solid #0c0d10; border-radius: 2mm; overflow: hidden; margin: 3mm 0; }
  .dre table { margin: 0; }
  .dre th { background: #0c0d10; color: #fff; font-size: 7.4pt; padding: 2.4mm 4mm; border: none; }
  .dre td { padding: 2.2mm 4mm; font-size: 9.4pt; }
  .dre tr.ind td:first-child { padding-left: 8mm; color: #3d434c; }
  .dre tr.sub-t td { border-top: 1pt solid #0c0d10; border-bottom: none; font-weight: 600;
       font-family: Oswald, Arial, sans-serif; text-transform: uppercase; letter-spacing: .03em; }
  .dre tr.final td { background: #0c0d10; color: #fff; font-family: Oswald, Arial, sans-serif;
       text-transform: uppercase; letter-spacing: .04em; font-size: 12pt; border: none; padding: 3.2mm 4mm; }
  .dre tr.final td .sub { color: #9aa0aa; }
  footer { margin-top: 6mm; padding-top: 2.5mm; border-top: .6pt solid #d7dade; font-size: 7.1pt; color: #8b919c; line-height: 1.5; }
</style></head><body>

<header>
  <img src="data:image/png;base64,${logo}">
  <h1>Expogenética 2026<br><span class="gold">Fechamento, Comissões e DRE</span></h1>
  <div class="sub">Bula Assessoria · ${FEIRA_ABCZ.edicao} ExpoGenética, Uberaba/MG · agenda comercial de 10 a 23/08 · apuração de ${HOJE}<br>
  A venda vem do HastaPro lote a lote e está conferida contra duas fontes independentes. A comissão recebida usa o acordo de cada
  leiloeira, com os percentuais confirmados no grupo Financeiro. A comissão paga segue o comprador, não quem anunciou na pista.</div>
</header>

<div class="page">

<div class="cards">
  <div class="card dark"><div class="k">Vendas da Bula</div><div class="v">${brl0(T.venda)}</div>
    <div class="d">${T.lotes} lotes · ${T.animais} animais em ${D.comVenda} pregões<br>${pct(T.participacao, 1)} dos ${mi(FEIRA_ABCZ.faturamento)} da feira</div></div>
  <div class="card"><div class="k">Comissão recebida</div><div class="v">${brl0(dre.faturamento)}</div>
    <div class="d">${pct(dre.faturamento / T.venda, 1)} da venda<br>${brl0(T.receitaEmitida)} já cobrados, ${brl0(T.receitaEstimada)} a emitir</div></div>
  <div class="card"><div class="k">Comissão paga</div><div class="v">${brl0(dre.comissoes)}</div>
    <div class="d">${pct(dre.comissoes / dre.faturamento, 0)} do que a Bula recebe<br>${brl0(dre.comissoesNoCiclo)} vencem em 25/09; ${brl0(dre.comissoesDiferidas)} só em 28/12</div></div>
  <div class="card gold"><div class="k">Lucro bruto</div><div class="v">${brl0(dre.lucro)}</div>
    <div class="d">${pct(dre.lucro / dre.faturamento, 1)} do faturamento<br>${pct(dre.margem, 2)} da venda</div></div>
</div>

<h2><span class="n">01</span>Vendas e comissão por assessor</h2>
<table>
  <thead><tr><th>Assessor</th><th class="num">Pregões</th><th class="num">Lotes</th><th class="num">Animais</th>
    <th class="num">Vendas</th><th class="num">Part.</th><th class="num">%</th><th class="num">Comissão paga</th></tr></thead>
  <tbody>${linhasAss}</tbody>
  <tfoot><tr><td>Total</td><td class="num">${D.comVenda}</td><td class="num">${T.lotes}</td><td class="num">${T.animais}</td>
    <td class="num">${brl0(T.venda)}</td><td class="num">100%</td><td class="num"></td><td class="num">${num(dre.comissoes)}</td></tr></tfoot>
</table>
<p class="sub small"><span class="mk">*</span> Marcelo Moura assinou 1 lote de ${brl0(63000)} no 28º Naviraí mas não está no cadastro de folha —
a comissão foi provisionada pelo padrão de 2% e precisa ser confirmada.
A comissão segue o <b>comprador</b>, não quem anunciou na pista: lote de comprador direcionado pelo Gustavo Rusa paga 5% a ele e nada ao assessor.
<b>Nane:</b> os ${brl(dre.comissoesDiferidas)} dela entram no custo da feira, mas não saem do caixa em setembro — a comissão dela acumula
e é paga de uma vez em <b>28/12</b>. Se a instrução de 27/08 for zerar a comissão dela, e não só adiá-la, o lucro bruto sobe para
${brl(dre.lucro + dre.comissoesDiferidas)}.</p>

<div class="box">
  <div class="k">O parceiro levou ${pct(rusa.comissao / dre.comissoes, 0)} da comissão sobre ${pct(rusa.venda / T.venda, 0)} da venda</div>
  <p style="margin:0">Os ${rusa.lotes} lotes de compradores direcionados pelo Gustavo Rusa somam <b>${brl0(rusa.venda)}</b> e pagam 5% —
  <b>${brl(rusa.comissao)}</b>. Nos mesmos lotes, um assessor da casa receberia 2% (${brl(rusaSe2)}).
  A diferença de <b>${brl(rusaExtra)}</b> é o custo do direcionamento: sem ele, o lucro da feira teria sido
  <b>${brl(lucroSemRusa)}</b> em vez de ${brl(dre.lucro)}.</p>
</div>

</div>

<div class="page brk">

<h2><span class="n">02</span>Faturamento, comissão recebida e comissão paga — por leilão</h2>
<table>
  <thead><tr><th class="ctr">Data</th><th>Leilão</th><th class="num">Faturamento<br>do pregão</th><th class="num">Vendas<br>da Bula</th>
    <th class="num">Cob.</th><th class="num">Lotes</th>
    <th class="num">Comissão<br>recebida</th><th class="ctr">Situação</th><th class="num">Comissão<br>paga</th></tr></thead>
  <tbody>${linhasLei}</tbody>
  <tfoot><tr><td colspan="3">Total — ${leiloes.length} pregões</td>
    <td class="num">${brl0(T.venda)}</td><td></td><td class="num">${T.lotes}</td>
    <td class="num">${num(dre.faturamento)}</td><td></td><td class="num">${num(dre.comissoes)}</td></tr></tfoot>
</table>
<p class="sub small"><b>Faturamento do pregão</b> é o resultado do leilão inteiro, apurado pela ABCZ e pelos replays das leiloeiras;
<b>vendas da Bula</b> é o que a equipe cobriu dentro dele, e <b>Cob.</b> é a fatia que isso representa. A comissão da Bula incide
sobre a venda coberta, exceto no Genética Aditiva, cujo acordo é sobre o faturamento total.
<span class="mk">†</span> pregão que a equipe operou no período mas que <b>não integra a agenda oficializada pela ABCZ</b>:
somam ${brl0(T.foraAgenda.venda)} de venda. Só a agenda oficial: ${brl0(T.oficial.venda)} em ${T.oficial.n} pregões.</p>

<div class="box">
  <div class="k">${D.semVenda} pregões da agenda oficial passaram sem uma única venda da Bula</div>
  <p>Guadalupe (10/08), Elo de Prova (12/08), Mega Genética EAO (14/08) e Agronova/Nelore Mafra (18/08) não geraram nenhum
  lote para a assessoria. Juntos, esses quatro pregões movimentaram <b>${brl0(somaSemCob)}</b> — praça em que a equipe
  estava presente, com casa e passagem já pagas, e não converteu nada. Vale conferir com os assessores se houve venda
  não reportada antes de fechar o mês.</p>
  <p style="margin:0"><b>Um deles merece checagem imediata:</b> o pregão de 18/08 é o "Leilão Agronova e JMP", que faturou
  ${brl0(3233000)}. O acordo com o JMP paga <b>0,5% do faturamento total, independentemente da cobertura</b> — se a Bula
  assessorou esse leilão, há cerca de ${brl0(16165)} de receita que não foi faturada e não está nesta DRE.</p>
</div>

<h2><span class="n">03</span>Margem de contribuição por leilão</h2>
<p class="sub small">Vendas · comissão recebida · (−) imposto · (−) comissão paga = <b>margem de contribuição</b>. Os custos de
campo não entram aqui: são da viagem inteira e não se dividem por pregão sem critério de rateio. A soma desta coluna
(${brl(T.margemContrib)}) menos os ${brl(C.total)} de custos de campo é exatamente o lucro bruto da DRE.</p>
<table>
  <thead><tr><th>Leilão</th><th class="num">Vendas</th><th class="num">Comissão<br>recebida</th><th class="num">(−) Imposto</th>
    <th class="num">(−) Comissão<br>paga</th><th class="num">Margem de<br>contribuição</th><th class="num">% da<br>venda</th></tr></thead>
  <tbody>${leiloes.filter(l => l.venda).sort((a, b) => b.margemContrib - a.margemContrib).map(l => `<tr class="${l.margemContrib < 0 ? 'est' : ''}">
    <td>${l.nome}</td>
    <td class="num">${brl0(l.venda)}</td>
    <td class="num">${num(l.receita)}</td>
    <td class="num sub">(${num(l.imposto)})</td>
    <td class="num sub">(${num(l.comissaoPaga)})</td>
    <td class="num ${l.margemContrib < 0 ? 'neg' : ''}"><b>${num(l.margemContrib)}</b></td>
    <td class="num ${l.margemContrib < 0 ? 'neg' : ''}">${pct(l.margemPctVenda)}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td>Total</td><td class="num">${brl0(T.venda)}</td><td class="num">${num(dre.faturamento)}</td>
    <td class="num">(${num(T.imposto)})</td><td class="num">(${num(dre.comissoes)})</td>
    <td class="num">${num(T.margemContrib)}</td><td class="num">${pct(T.margemContrib / T.venda)}</td></tr></tfoot>
</table>

<div class="box alert">
  <div class="k">${negativos.length} pregões fecharam no vermelho — e há uma regra por trás</div>
  <p>${negativos.map(l => `<b>${l.nome}</b> (${pct(l.margemPctVenda)})`).join(', ')} deram margem de contribuição negativa,
  somando <b>${brl(negSoma)}</b> de prejuízo antes dos custos de campo. A conta que decide isso é uma só: sobre cada real
  vendido a Bula fica com <b>0,82 × (o que recebe do criador) − (o que paga de comissão)</b>. Ou seja,
  <b>o percentual recebido precisa ser pelo menos o percentual pago dividido por 0,82</b> — pagar 5% ao parceiro exige
  receber 6,10%; pagar 2% exige receber 2,44%.</p>
  <p style="margin:0">Os dois caminhos para o vermelho aparecem lado a lado nesta tabela. <b>Direcionamento do parceiro:</b>
  Baby de Prova e Fazenda Araras venderam quase tudo para comprador do Gustavo Rusa — recebe-se 5% ou menos e paga-se 5%,
  o que trava a margem em torno de −0,90% (e em −2,54% no Araras, onde o acordo com a leiloeira é de 3%).
  <b>Acordo apertado com a leiloeira:</b> Santa Nice, Matinha e Noite Nacional não dependem do parceiro — a comissão paga
  simplesmente chegou perto ou passou dos 82% da comissão recebida. Onde o assessor é da casa e o acordo é de 5%, a mesma
  conta deixa <b>+2,10%</b>, que é a margem do Genética Aditiva, do Marcondes e do Excelência Genética.</p>
</div>

<h3>De onde vem cada comissão recebida</h3>
<table>
  <thead><tr><th>Leilão</th><th class="num">%</th><th>Critério</th><th class="num">Valor</th></tr></thead>
  <tbody>${linhasCriterio}</tbody>
  <tfoot><tr><td colspan="3">Total</td><td class="num">${num(dre.faturamento)}</td></tr></tfoot>
</table>
<p class="sub small">Onde há cobrança emitida no ERP, o valor é o da cobrança. Onde não há, vale o acordo confirmado com a leiloeira;
sem acordo registrado, o percentual que <b>aquele criador</b> pagou à Bula em 2026, e sem histórico, 5% — a mediana das 98 cobranças de 2026.</p>

<div class="box alert">
  <div class="k">Terra Brava: de onde saíram os 11,19%</div>
  <p>Os <b>${pct(TERRA_BRAVA.pctEmitido)}</b> não são acordo desta edição. A cobrança foi gerada em 18/08 a partir do fechamento e
  <b>herdou o percentual de junho</b>: a NF 615 do Terra Brava de 16/06 saiu por ${brl(7215)}, que é <b>0,5% do faturamento de
  ${brl0(1443000)}</b> daquele pregão — dividido pela cobertura de uma etapa só (${brl0(64500)}), dá exatamente 11,19%. É um número
  de conversão, não de contrato.</p>
  <p style="margin:0">Pela <b>tabela padrão de performance</b>, o pregão de 15/08 tem cobertura de ${brl0(TERRA_BRAVA.venda)} sobre
  faturamento de ${brl0(TERRA_BRAVA.faturamento)} — performance de <b>${pct(TERRA_BRAVA.performance, 2)}</b>, faixa de
  ${TERRA_BRAVA.faixa}, o que dá <b>${brl(TERRA_BRAVA.tabela)}</b>. A cobrança aberta no ERP está
  <b class="neg">${brl(TERRA_BRAVA.diferenca)} acima</b> disso. Este relatório mantém o valor emitido porque é o que a Bula tem a
  receber hoje; se a tabela prevalecer, a receita da feira cai para ${brl(dre.faturamento - TERRA_BRAVA.diferenca)} e o lucro bruto
  para ${brl(dre.lucro - TERRA_BRAVA.diferenca * 0.82)}. <b>Falta confirmar o acordo desta edição com a leiloeira</b> — é o mesmo
  tipo de erro já corrigido na NF 636 da Genética Aditiva.</p>
</div>

</div>

<div class="page brk">

<h2><span class="n">04</span>Custos da feira</h2>
<table>
  <thead><tr><th>Grupo</th><th>Item</th><th class="num">Valor</th><th class="ctr">Situação</th><th>Origem do número</th></tr></thead>
  <tbody>${linhasCusto}</tbody>
  <tfoot><tr><td colspan="2">Transporte ${num(C.transporte)} · Estadia ${num(C.estadia)} · Alimentação ${num(C.alimentacao)} · Outros ${num(C.outros)}</td>
    <td class="num">${num(C.total)}</td><td colspan="2"></td></tr></tfoot>
</table>
<p class="sub small"><b>Transporte e uniformes</b> são valores fechados: saíram do caixa e estão conciliados no extrato.
Os dois PIX de 17/07 à ADN Viagens (${brl(2081.92)} e ${brl(2421.43)}) ficaram fora por decisão sua em 18/08 — não são desta feira.</p>

<div class="box">
  <div class="k">Estadia e reembolso — valores definidos pelo Marcelo no grupo Financeiro</div>
  <p><b>Estadia (${brl0(C.estadia)}).</b> A casa de Uberaba cobriu o período de 14 a 24/08. O ERP tem só a 1ª parcela de
  ${brl0(2000)} lançada — faltam <b>${brl0(P.casaTotal - 2000)}</b> virar conta a pagar. Serve de referência a casa da
  Expozebu, mesma cidade e mesmo formato, que custou ${brl0(P.casaExpozebu)} em duas parcelas.</p>
  <p style="margin:0"><b>Reembolso da equipe (${brl0(C.alimentacao)}).</b> Valor fixado por você em 27/08 ("reembolso da equipe é menor,
  pode considerar 5.000"). É a única linha inteiramente projetada: a prestação de contas da viagem só chega na primeira semana de
  setembro, e é ela que fecha a despesa operacional do evento. Se vier no teto da faixa histórica (${brl0(P.alimentacaoMax)}), o
  lucro bruto cai de ${brl(dre.lucro)} para ${brl(dre.lucro - (P.alimentacaoMax - C.alimentacao))}.</p>
</div>

<h2><span class="n">05</span>DRE da Expogenética</h2>
<div class="dre">
<table>
  <thead><tr><th>Conta</th><th class="num">Valor</th><th class="num">% do faturamento</th></tr></thead>
  <tbody>
    ${dreRow('<b>Faturamento</b> (comissão recebida)', dre.faturamento)}
    ${dreRow('Imposto (18%)', dre.imposto, { neg: true, cls: 'ind' })}
    ${dreRow('Faturamento líquido', dre.liquido, { cls: 'sub-t' })}
    ${dreRow('Comissões de assessores', dre.comissoes, { neg: true, cls: 'ind' })}
    ${dreRow('Custos de transporte', dre.transporte, { neg: true, cls: 'ind' })}
    ${dreRow('Custos de estadia', dre.estadia, { neg: true, cls: 'ind' })}
    ${dreRow('Custos de alimentação', dre.alimentacao, { neg: true, cls: 'ind' })}
    ${dreRow('Outros custos (uniformes)', dre.outros, { neg: true, cls: 'ind' })}
    <tr class="final"><td>Lucro bruto</td><td class="num">${num(dre.lucro)}</td>
      <td class="num"><span class="sub">${pct(dre.lucro / dre.faturamento, 1)}</span></td></tr>
  </tbody>
</table>
</div>
<p class="sub small">Imposto de 18% sobre a receita — critério padrão dos fechamentos do ERP (Simples Nacional Anexo III + ISS).
A DRE cobre a operação inteira da equipe no período, porque os custos de viagem também são da operação inteira.
O resultado é <b>lucro bruto</b>, e não líquido: não carrega estrutura, folha nem a distribuição do sócio.</p>

<div class="box dark">
  <div class="k">Como ler este resultado</div>
  <p>De cada real que a Bula vendeu na feira, sobraram <b>${pct(dre.margem, 2)}</b> de lucro bruto. A feira se paga, mas com folga
  pequena: <b>${pct(dre.comissoes / dre.liquido, 0)} do faturamento líquido vai para comissão</b> e os custos de campo
  (${brl0(C.total)}) consomem outros ${pct(C.total / dre.liquido, 0)}.</p>
  <p style="margin:0"><b>E nada disso é caixa ainda.</b> O relatório de NFS-e da Prefeitura de Campo Grande emitido em
  ${NFS_AGOSTO.emitidoEm} mostra ${NFS_AGOSTO.quantidade} notas da Bula Assessoria no mês, somando ${brl(NFS_AGOSTO.total)} —
  e <b>nenhuma delas é da Expogenética</b>: são todas de leilões de julho. Dos ${brl0(dre.faturamento)} de comissão apurados aqui,
  ${brl0(T.receitaEmitida)} têm cobrança aberta no ERP e ${brl0(T.receitaEstimada)} ainda não viraram nem cobrança nem nota.
  A comissão paga, essa sim, já é compromisso: ${brl0(dre.comissoesNoCiclo)} vencem em 25/09.</p>
</div>

<h3>O que foi faturado em agosto — relatório de NFS-e da Prefeitura</h3>
<table>
  <thead><tr><th class="ctr">NF</th><th class="ctr">Emissão</th><th>Refere-se a</th><th class="num">Valor</th></tr></thead>
  <tbody>${NFS_AGOSTO.notas.map(n => `<tr><td class="ctr">${n.nf}</td><td class="ctr sub">${n.emissao}</td>
    <td class="sub">${n.refere}</td><td class="num">${num(n.valor)}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="3">Total — ${NFS_AGOSTO.quantidade} notas, nenhuma da Expogenética</td>
    <td class="num">${num(NFS_AGOSTO.total)}</td></tr></tfoot>
</table>
<p class="sub small">Relatório de Nota Fiscal emitido pela Prefeitura de Campo Grande em ${NFS_AGOSTO.emitidoEm} para o CNPJ
34.791.630/0001-43, cobrindo as emissões de 01/08 a 27/08. É a prova de que a receita desta feira ainda é <b>inteiramente
futura</b>: nenhuma das ${NFS_AGOSTO.quantidade} notas do mês corresponde a um pregão da Expogenética.</p>


</div>

<div class="page brk">

<h2><span class="n">06</span>O que precisa ser resolvido</h2>
<ul>
  <li><b>Emitir as cobranças que faltam.</b> Dos ${D.comVenda} pregões com venda, só 3 têm conta a receber no ERP
      (${brl0(T.receitaEmitida)}). Os outros ${brl0(T.receitaEstimada)} estão apurados mas não cobrados — e nenhuma nota
      da feira foi emitida até ${NFS_AGOSTO.emitidoEm}.</li>
  <li><b>Confirmar o acordo do Terra Brava desta edição.</b> A cobrança aberta (${brl(TERRA_BRAVA.emitido)}) usa um percentual
      herdado de junho; pela tabela padrão o valor seria ${brl(TERRA_BRAVA.tabela)}. Enquanto não houver acordo registrado,
      ${brl(TERRA_BRAVA.diferenca)} de receita ficam em aberto nos dois sentidos.</li>
  <li><b>Corrigir a cobrança do Matinha.</b> Foi emitida por ${brl(27375)} (5% sobre ${brl0(547500)}), mas o lote 22
      (${brl0(87000)}) pertence ao Fazenda Araras — confirmado no HastaPro. O valor certo é ${brl(23025)}.</li>
  <li><b>Lançar os títulos de comissão de agosto</b>, que vencem em 25/09. Hoje há título para apenas ${brl(4692)} dos
      ${brl(dre.comissoes)} devidos — e a comissão do Gustavo Rusa (${brl(rusa.comissao)}) não tem título nenhum.</li>
  <li><b>Genética Aditiva e JMP cobram sobre o faturamento total do pregão</b>, não sobre a venda da Bula — e esse
      faturamento não está registrado em lugar nenhum. Enquanto não estiver, os ${brl(24270)} desses dois são estimativa fraca.</li>
  <li><b>Definir o lote 22 do 28º Naviraí</b> (${brl0(63000)}, em nome de Marcelo Moura). Os compradores — Marcelo e
      Gustavo Sarmento, Fazenda São Francisco, Cabaceira do Paraguaçu/BA — foram descritos no grupo como clientes
      preferenciais do próprio Naviraí. Se a Bula não cobra sobre ele, saem ${brl(3150)} da receita e ${brl(1260)} da
      comissão. Marcelo Moura também não está no cadastro de folha.</li>
  <li><b>Terra Brava:</b> a comissão do Fábio está marcada como "conferir autoria" desde 18/08 — parte das vendas pode ter
      sido do Mateus.</li>
  <li><b>Lançar no ERP o saldo da casa</b> (${brl0(P.casaTotal - 2000)}) e cobrar a prestação de contas da equipe, para a
      alimentação sair de estimativa.</li>
  <li><b>KatiSpera não existe no HastaPro</b> — entrou só pelo grupo de lances, e também não aparece no consolidado de vendas
      publicado no grupo em 27/08. Já tem cobrança emitida de ${brl(7020)}; confirmar o VGV com a leiloeira antes de fechar o mês.</li>
  <li><b>Fêmeas JMP saiu deste fechamento</b> (${brl0(EXCLUIDOS[0].venda)} de venda e ${brl(EXCLUIDOS[0].comissao)} de comissão).
      ${EXCLUIDOS[0].motivo}</li>
  <li><b>Juntar as duas grafias do Douglas no painel de vendas por assessor.</b> No relatório de agosto ele aparece duas vezes —
      "Douglas Bispo" (${brl0(1600700)}, 35 lotes) e "DOUGLAS BISPO" (${brl0(968600)}, 15 lotes) —, o que infla a lista de top
      assessores e atrapalha a conferência Douglas × Rusa. Nesta apuração da feira o nome já está unificado.</li>
  <li><b>Matheus Alves (CPD da Bula Remates) não recebe comissão</b> — decisão sua e do Bula em 28/08. Nenhum lote desta feira
      está no nome dele no HastaPro, então o fechamento da Expogenética não muda; a regra vale para o resto de agosto.</li>
</ul>

</div>

<div class="page brk">

<h2><span class="n">07</span>Conferência contra fontes independentes</h2>
<p>A venda deste relatório foi lida do <b>HastaPro, lote a lote</b>. Para não depender de uma fonte só, cada pregão foi
conferido contra <b>duas apurações feitas por outros caminhos</b>: o consolidado de vendas que o Matheus publicou no grupo
Financeiro em 27/08 e o fechamento montado a partir dos <b>replays das leiloeiras</b>.</p>

<h3>Fonte 2 — consolidado de vendas publicado no grupo (27/08)</h3>
<table>
  <thead><tr><th>Leilão</th><th class="num">Este relatório</th><th class="num">Consolidado<br>do grupo</th><th class="num">Diferença</th></tr></thead>
  <tbody>
    ${M1.batem.map(x => `<tr><td>${x.nome}</td><td class="num">${brl0(x.apurado)}</td>
      <td class="num">${brl0(x.externo)}</td><td class="num pos">confere</td></tr>`).join('')}
    ${M1.divergem.map(x => `<tr class="est"><td><b>${x.nome}</b></td><td class="num">${brl0(x.apurado)}</td>
      <td class="num">${brl0(x.externo)}</td><td class="num neg">${brl0(x.dif)}</td></tr>`).join('')}
    ${M1.ausentes.map(x => `<tr class="est"><td><b>${x.nome}</b></td><td class="num">${brl0(x.apurado)}</td>
      <td class="num sub">não consta</td><td class="num neg">${brl0(x.apurado)}</td></tr>`).join('')}
  </tbody>
</table>
<div class="box">
  <div class="k">${M1.batem.length} dos ${D.comVenda} pregões batem ao centavo — ${pct(M1.pctBatem, 0)} da venda</div>
  <p style="margin:0">Esta é a conferência mais forte do relatório: o número que a equipe usa no dia a dia e o número apurado
  aqui, lote a lote, são <b>o mesmo em ${M1.batem.length} dos ${D.comVenda} pregões</b>. Ela também resolve a divergência que
  vinha desde 25/08 no <b>28º Naviraí Camparino</b>: o consolidado de 25/08 trazia ${brl0(871500)} (22 lotes) e o de 27/08 já
  traz ${brl0(940500)} (23 lotes) — o mesmo valor que o HastaPro registra e que este relatório usa. A única exceção é o
  <b>KatiSpera</b>, que não aparece em nenhuma das duas fontes externas e vive apenas do grupo de lances e da cobrança emitida.</p>
</div>

<h3>Fonte 3 — fechamento reconstruído dos replays das leiloeiras (25/08)</h3>
<table>
  <thead><tr><th>Leilão</th><th class="num">Este relatório<br>(HastaPro)</th><th class="num">Replay das<br>leiloeiras</th><th class="num">Diferença</th></tr></thead>
  <tbody>
    ${D.R.batem.map(x => `<tr><td>${x.nome}</td><td class="num">${brl0(x.apurado)}</td>
      <td class="num">${brl0(x.externo)}</td><td class="num pos">confere</td></tr>`).join('')}
    ${D.R.divergem.map(x => `<tr class="est"><td><b>${x.nome}</b></td><td class="num">${brl0(x.apurado)}</td>
      <td class="num">${brl0(x.externo)}</td><td class="num neg">${brl0(x.dif)}</td></tr>`).join('')}
    ${D.R.ausentes.map(x => `<tr class="est"><td><b>${x.nome}</b></td><td class="num">${brl0(x.apurado)}</td>
      <td class="num sub">não consta</td><td class="num neg">${brl0(x.apurado)}</td></tr>`).join('')}
  </tbody>
  <tfoot><tr><td>Total</td><td class="num">${brl0(T.venda)}</td><td class="num">${brl0(D.R.totalExterno)}</td>
    <td class="num">${brl0(T.venda - D.R.totalExterno)}</td></tr></tfoot>
</table>

<div class="box">
  <div class="k">${D.R.batem.length} dos ${D.comVenda} pregões batem ao centavo — ${pct(D.R.pctBatem, 0)} da venda</div>
  <p>Duas apurações feitas por caminhos diferentes chegaram ao mesmo número em ${D.R.batem.length} pregões, somando
  <b>${brl0(D.R.vlrBatem)}</b>. As ${D.R.divergem.length + D.R.ausentes.length} exceções são todas conhecidas e têm explicação —
  e uma quarta venda, o Fêmeas JMP, já saiu do fechamento por causa desta conferência:</p>
  <ul style="margin-bottom:0">
    <li><b>28º Naviraí Camparino</b> — três números para o mesmo pregão: ${brl0(940500)} no HastaPro (23 lotes),
        ${brl0(871500)} no fechamento por replay (22 vendas) e ${brl0(948000)} no fechamento automático do grupo.
        Adotei o HastaPro por ser o registro da leiloeira. Parte da diferença já foi resolvida no grupo em 26/08: o
        <b>lote 20 é de R$ 1.400 e não R$ 1.200</b> (${brl0(42000)}, Fábio Omena, Marco Túlio Severino) — valor que este
        relatório já usa. Falta o <b>lote 22 (${brl0(63000)}, ${brl0(2100)} × 30)</b>, lançado em nome de Marcelo Moura:
        os compradores são "clientes preferenciais do Naviraí", então é preciso definir se a Bula recebe e paga comissão
        sobre ele antes de fechar o mês.</li>
    <li><b>Matrizes Premium KatiSpera</b> (${brl0(117000)}) — está na agenda oficial e <b>já tem cobrança emitida de
        ${brl(7020)}</b> no ERP, mas não existe no HastaPro nem no replay. <b>Atenção ao número de ${brl0(185100)}</b> que
        circulou no grupo em 26/08: esse é o VGV do <i>3º Leilão Matrizes KatiSpera de 20/06</i> — outro pregão, que rendeu
        ${brl(11106)} de comissão a 6%. Confirmar qual é o valor desta edição antes de mexer na cobrança.</li>
    <li><b>6º Excelência Genética</b> (${brl0(105000)}) — <b>já confirmado no grupo em 26/08</b>: lote 21, R$ 3.500 × 30,
        comprador Magda / J. Gouvea, venda de Peralta/Bula, comissão de 2% a ser paga ao Bulinha. Está no HastaPro e na
        agenda oficial (ORD 32); a ausência no replay era lacuna da fonte, não venda inexistente.</li>
    <li><b>Fêmeas JMP</b> (${brl0(EXCLUIDOS[0].venda)}) — <b>excluído deste fechamento</b>. Não está na agenda da ABCZ, não está
        no HastaPro, não está no replay e não está no consolidado do grupo. O valor é idêntico ao do lote 48 do Shopping Naviraí,
        do mesmo assessor: era o mesmo lote contado duas vezes pelo parser. Sai ${brl0(EXCLUIDOS[0].venda)} da venda e
        ${brl(EXCLUIDOS[0].comissao)} da comissão.</li>
  </ul>
</div>
<p class="sub small">Se as vendas não confirmadas (${brl0(D.R.vlrAusentes)}) forem excluídas e o 28º Naviraí for ajustado
ao replay, a venda cai para ${brl0(D.R.totalExterno)} e o lucro bruto para cerca de
${brl0(dre.lucro - (T.venda - D.R.totalExterno) * (dre.faturamento / T.venda * 0.82 - dre.comissoes / T.venda))}.
O resultado da feira continua positivo nos dois cenários.</p>

<h3>O que esta apuração corrigiu no sistema</h3>
<p>Ler o HastaPro lote a lote em vez de usar os fechamentos automáticos do grupo de WhatsApp corrigiu três erros que
estavam no ERP: um lote de ${brl0(84000)} contado duas vezes — o grupo não separa pregões do mesmo dia e criou um
fechamento "Paranã e Casabranca" com o lote do Top Cen —, o Naviraí de Matrizes inflado em ${brl0(33000)}, e o
6º Excelência Genética (${brl0(105000)}), que não estava em relatório nenhum.</p>
<p>A comissão foi recalculada pela regra do comprador, que estava aplicada em apenas 3 dos 17 fechamentos do ERP. Isso moveu
${brl0(502500)} de venda dos assessores para o parceiro e aumentou a comissão devida em ${brl0(13722)} — dinheiro que
seria pago errado se o fechamento de agosto saísse como está no sistema hoje.</p>

<h2><span class="n">08</span>De onde vem cada regra deste fechamento</h2>
<p class="sub small">Nenhum percentual deste relatório é arbitrado. Cada um tem uma decisão registrada no grupo Financeiro,
com data e autor — é o que permite conferir o número sem reabrir a conversa.</p>
<table>
  <thead><tr><th class="ctr">Quando</th><th class="ctr">Quem</th><th>Regra aplicada</th><th>Efeito neste fechamento</th></tr></thead>
  <tbody>${DECISOES.map(d => `<tr><td class="ctr sub">${d.quando}</td><td class="ctr sub">${d.quem}</td>
    <td>${d.regra}</td><td class="sub small">${d.efeito}</td></tr>`).join('')}</tbody>
</table>

<footer>
  Bula Assessoria · ${FEIRA_ABCZ.edicao} ExpoGenética (Uberaba/MG, agenda comercial de 10 a 23/08/2026) · fechamento gerado em ${HOJE}.<br>
  Fontes: HastaPro (filial 2, lote a lote), contas a receber e a pagar do ERP, relatório de NFS-e da Prefeitura de Campo Grande
  (27/08), consolidado de vendas publicado no grupo Financeiro (27/08), fechamento por replay das leiloeiras (25/08), decisões
  do grupo Financeiro de 26 a 28/08, cadastro de folha e agenda oficializada da ABCZ.
  Valores estimados estão marcados linha a linha e explicados na seção de critério.
</footer>

</div>
</body></html>`

fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)

const browser = await chromium.launch()
const pg = await browser.newPage()
await pg.setContent(html, { waitUntil: 'networkidle' })
const pdfPath = path.join(DESKTOP, 'Bula - Expogenetica 2026 - Fechamento e DRE.pdf')
await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } })
await pg.setViewportSize({ width: 794, height: 1123 })
await pg.screenshot({ path: path.join(OUT, 'preview.png'), fullPage: true })
await browser.close()

/* ── XLSX ── */
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(assessores.map(a => ({
  Assessor: a.nome, 'Pregões': a.pregoes, Lotes: a.lotes, Animais: a.animais,
  'Vendas': a.venda, 'Participação': a.venda / T.venda, '% comissão': a.pct, 'Comissão paga': a.comissao,
}))), 'Por assessor')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leiloes.map(l => ({
  Data: l.data, 'Leilão': l.nome, 'Agenda oficial ABCZ': l.ord ? `ORD ${l.ord}` : 'não',
  'Faturamento do pregão': l.fatPregao || null,
  'Vendas da Bula': l.venda, 'Cobertura': l.venda && l.fatPregao ? l.venda / l.fatPregao : null,
  Lotes: l.lotes.length, Animais: l.animais,
  'Comissão recebida': l.receita, '%': l.receitaPct || null, 'Situação': l.receitaTipo,
  'Critério': l.receitaNota || '', 'Comissão paga': l.comissaoPaga,
}))), 'Por leilão')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leiloes.filter(l => l.venda).map(l => ({
  Data: l.data, 'Leilão': l.nome, 'Vendas': l.venda, 'Comissão recebida': l.receita,
  '(-) Imposto 18%': -l.imposto, '(-) Comissão paga': -l.comissaoPaga,
  'Margem de contribuição': l.margemContrib, '% da venda': l.margemPctVenda,
})).concat([{ Data: '', 'Leilão': 'TOTAL', 'Vendas': T.venda, 'Comissão recebida': dre.faturamento,
  '(-) Imposto 18%': -T.imposto, '(-) Comissão paga': -dre.comissoes,
  'Margem de contribuição': T.margemContrib, '% da venda': T.margemContrib / T.venda },
  { Data: '', 'Leilão': '(-) custos de campo', 'Margem de contribuição': -C.total },
  { Data: '', 'Leilão': 'LUCRO BRUTO', 'Margem de contribuição': dre.lucro }])), 'Margem de contribuição')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
  { Conta: 'FATURAMENTO (comissão recebida)', Valor: dre.faturamento },
  { Conta: 'Imposto (18%)', Valor: -dre.imposto },
  { Conta: 'FATURAMENTO LÍQUIDO', Valor: dre.liquido },
  { Conta: 'Comissões de assessores', Valor: -dre.comissoes },
  { Conta: 'Custos de transporte', Valor: -dre.transporte },
  { Conta: 'Custos de estadia', Valor: -dre.estadia },
  { Conta: 'Custos de alimentação', Valor: -dre.alimentacao },
  { Conta: 'Outros custos (uniformes)', Valor: -dre.outros },
  { Conta: 'LUCRO BRUTO', Valor: dre.lucro },
  { Conta: '', Valor: null },
  { Conta: 'Comissão que vence em 25/09', Valor: dre.comissoesNoCiclo },
  { Conta: 'Comissão diferida para 28/12 (Nane)', Valor: dre.comissoesDiferidas },
  { Conta: 'Receita com cobrança emitida no ERP', Valor: T.receitaEmitida },
  { Conta: 'Receita ainda sem cobrança', Valor: T.receitaEstimada },
  { Conta: 'Faturado em NFS-e no mês (nenhuma da feira)', Valor: NFS_AGOSTO.total },
]), 'DRE')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(DECISOES.map(d => ({
  Quando: d.quando, Quem: d.quem, 'Regra aplicada': d.regra, 'Efeito no fechamento': d.efeito,
}))), 'Decisões')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(custos.map(c => ({
  Grupo: GRUPO[c.grupo], Item: c.item, Valor: c.valor, 'Situação': c.situacao, Origem: c.fonte,
}))), 'Custos')
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leiloes.flatMap(l => l.lotes.map(t => ({
  Data: l.data, 'Leilão': l.nome, Lote: t.lote, Animais: t.animais, VGV: t.vgv,
  'Anunciou na pista': t.anunciante, Comprador: t.comprador, Fazenda: t.fazenda, UF: t.uf,
  'Direcionado por': t.quemDirecionou || '', 'Comissão de': t.assessor, '%': t.pct, 'Comissão': t.comissao,
})))), 'Lotes')
let xlsxPath = path.join(DESKTOP, 'Bula - Expogenetica 2026 - Fechamento e DRE.xlsx')
try { XLSX.writeFile(wb, xlsxPath) } catch (e) {
  if (e.code !== 'EBUSY') throw e
  xlsxPath = xlsxPath.replace(/\.xlsx$/, ' (atualizado).xlsx'); XLSX.writeFile(wb, xlsxPath)
}
console.log('\nPDF  ->', pdfPath)
console.log('XLSX ->', xlsxPath)
