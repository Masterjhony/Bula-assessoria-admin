/**
 * RELATÓRIO 2026 — META ADS: INVESTIMENTO OFICIAL (PDF).
 *
 *   node scripts/gera-relatorio-meta-2026.mjs [pasta-de-saida]
 *
 * O relatório só de mídia: as 4 contas de anúncio, cada campanha, mês a mês,
 * leads reportados pela própria Meta, top regiões — e a conciliação com o
 * "R$ 16.500" do relatório interno da diretoria. Fonte única e auditável:
 * outputs/base-clientes-2026/fontes/meta-live-2026-08-14.json (extração ao
 * vivo do conector oficial, 14/08/2026).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pagina, paraPdf, esc, brl, brl0, num, pct, dataBr, mesBr } from './lib/relatorio-2026-visual.mjs'
import { META_LIVE, INVESTIDO_APURADO, LEADS_META, FUNIL_WHATSAPP, DIVULGACAO_LEILOES } from './lib/midia-2026.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const saida = process.argv[2] || DIR
const HOJE = '14/08/2026'

const fun = META_LIVE.campanhasFunil
const wpp = META_LIVE.campanhasFunilWhatsApp
const awa = META_LIVE.campanhasAwareness
const T = META_LIVE.totais

const MESES = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
const porMes = {}
for (const m of MESES) porMes[m] = { funil: 0, wpp: 0, leadsFunil: 0, leadsWpp: 0 }
for (const c of fun) for (const [m, v] of Object.entries(c.mensal)) { porMes[m].funil += v.investido; porMes[m].leadsFunil += v.leadsMeta ?? 0 }
for (const c of wpp) for (const [m, v] of Object.entries(c.mensal)) { porMes[m].wpp += v.investido; porMes[m].leadsWpp += v.leadsMeta ?? 0 }

const IMP = fun.reduce((a, c) => a + c.total.impressoes, 0)
const CLI = fun.reduce((a, c) => a + c.total.cliques, 0)
const ALC = fun.reduce((a, c) => a + (c.total.alcance || 0), 0)

const capa = `
<div class="cap">
  <div>
    <h1>Meta Ads — investimento oficial 2026</h1>
    <div class="sub">Primeira extração ao vivo das contas de anúncio da Bula (14/08). Cada campanha, cada mês,
    cada real — com a conciliação contra os números que circularam internamente.</div>
  </div>
  <div class="meta">
    Bula Assessoria · BM Bula 360<br>Janela: 01/01 a 14/08/2026<br>Emitido em ${HOJE}
    <div class="tot" style="margin-top:6px">${brl(INVESTIDO_APURADO)}<small>investidos no funil digital de captação</small></div>
  </div>
</div>

<div class="cards avoid">
  <div class="card"><div class="z">Funil digital (13 campanhas)</div><div class="n">${brl0(INVESTIDO_APURADO)}<small>jun–14/08 · CA2 + Corte Perpétuo/Tupã</small></div></div>
  <div class="card"><div class="z">Piloto funil WhatsApp</div><div class="n">${brl0(FUNIL_WHATSAPP.investido)}<small>abr–jun · conta Formula do Boi</small></div></div>
  <div class="card"><div class="z">Divulgação de leilões (agência)</div><div class="n">${brl0(DIVULGACAO_LEILOES.totalInvestido)}<small>${num(DIVULGACAO_LEILOES.qtdCampanhas)} campanhas na CA1 · fora do funil</small></div></div>
  <div class="card"><div class="z">Impressões do funil</div><div class="n">${num(IMP)}<small>${num(CLI)} cliques · CTR ${pct(CLI, IMP)}</small></div></div>
</div>`

const conciliacao = `
<h2>Conciliação: de onde veio cada número que circulou</h2>
<table>
  <thead><tr><th>Número</th><th class="r">Valor</th><th>O que é</th><th>Situação</th></tr></thead>
  <tbody>
    <tr><td class="nome">Relatório interno da diretoria</td><td class="num">R$ 16.500,00</td>
      <td>Investimento das campanhas do funil, apurado à mão até 02/08.</td>
      <td><strong>Correto na data.</strong> Nossa apuração independente de snapshots dava R$ 16.499,31 — diferença de 69 centavos.</td></tr>
    <tr><td class="nome">Oficial ao vivo (este relatório)</td><td class="num q"><strong>${brl(INVESTIDO_APURADO)}</strong></td>
      <td>Mesmo escopo, puxado da API da Meta em 14/08.</td>
      <td>As campanhas PERPETUO TOURO (+R$ 1.019), CORTE PERPÉTUO (+R$ 957), PERPETUO FEMEAS (nova, R$ 579) e SÃO GERALDO seguiram rodando depois de 02/08.</td></tr>
    <tr><td class="nome">Total Bula 2026 (tudo)</td><td class="num">${brl(T.tudoBula2026.investido)}</td>
      <td>Funil + piloto WhatsApp + divulgação de leilões + awareness.</td>
      <td>É o cheque total de mídia do ano — mas só o funil digital deve ser dividido por leads/cadastros.</td></tr>
  </tbody>
</table>
<p class="micro">Por que três números: cada um responde uma pergunta diferente. Custo de captação usa o funil
(${brl(INVESTIDO_APURADO)}); orçamento total de marketing usa o tudo (${brl(T.tudoBula2026.investido)}). Misturá-los é o
erro que este relatório existe para impedir.</p>`

const tabelaFunil = `
<h2>As 13 campanhas do funil, uma a uma</h2>
<table>
  <thead><tr><th>Campanha</th><th>Conta</th><th class="r">Investido</th><th class="r">Impressões</th><th class="r">Alcance</th><th class="r">Cliques</th><th class="r">CTR</th><th class="r">Leads (Meta)</th></tr></thead>
  <tbody>
    ${[...fun].sort((a, b) => b.total.investido - a.total.investido).map(c => `<tr>
      <td class="nome">${esc(c.nome)}</td><td>${c.conta}</td>
      <td class="num">${brl(c.total.investido)}</td>
      <td class="num">${num(c.total.impressoes)}</td>
      <td class="num">${num(c.total.alcance || 0)}</td>
      <td class="num">${num(c.total.cliques)}</td>
      <td class="num">${pct(c.total.cliques, c.total.impressoes)}</td>
      <td class="num">${c.total.obsLeads ? '<span class="off">landing¹</span>' : num(c.total.leadsMeta ?? 0)}</td></tr>`).join('')}
  </tbody>
  <tfoot><tr><td>TOTAL</td><td></td><td class="num">${brl(INVESTIDO_APURADO)}</td><td class="num">${num(IMP)}</td>
    <td class="num">${num(ALC)}</td><td class="num">${num(CLI)}</td><td class="num">${pct(CLI, IMP)}</td><td class="num">${num(LEADS_META)}</td></tr></tfoot>
</table>
<p class="micro">¹ Campanhas de landing própria: a Meta não vê o formulário (ele é nosso), então reporta 0/1 lead.
A conversão real dessas campanhas está na planilha de leads — 80+ leads de PERPETUO TOURO, por exemplo. O alcance
total soma pessoas repetidas entre campanhas; use-o como ordem de grandeza, não como pessoas únicas.</p>

<h3>Mês a mês (funil + piloto WhatsApp)</h3>
<table class="avoid">
  <thead><tr><th>Mês</th><th class="r">Funil digital</th><th class="r">Leads Meta (funil)</th><th class="r">Piloto WhatsApp</th><th class="r">Leads WhatsApp</th><th class="r">Total do mês</th></tr></thead>
  <tbody>
    ${MESES.map(m => `<tr><td class="nome">${mesBr(m)}${m === '2026-08' ? ' (até 14)' : ''}</td>
      <td class="num">${porMes[m].funil ? brl(porMes[m].funil) : '<span class="off">—</span>'}</td>
      <td class="num">${porMes[m].leadsFunil ? num(porMes[m].leadsFunil) : '<span class="off">—</span>'}</td>
      <td class="num">${porMes[m].wpp ? brl(porMes[m].wpp) : '<span class="off">—</span>'}</td>
      <td class="num">${porMes[m].leadsWpp ? num(porMes[m].leadsWpp) : '<span class="off">—</span>'}</td>
      <td class="num">${brl(porMes[m].funil + porMes[m].wpp)}</td></tr>`).join('')}
  </tbody>
  <tfoot><tr><td>2026</td><td class="num">${brl(INVESTIDO_APURADO)}</td><td class="num">${num(LEADS_META)}</td>
    <td class="num">${brl(FUNIL_WHATSAPP.investido)}</td><td class="num">${num(FUNIL_WHATSAPP.leadsMeta)}</td>
    <td class="num">${brl(INVESTIDO_APURADO + FUNIL_WHATSAPP.investido)}</td></tr></tfoot>
</table>`

const contas = `
<div class="pg"></div>
<h2>As contas de anúncio, e o que saiu de cada uma</h2>
<table>
  <thead><tr><th>Conta</th><th>BM</th><th class="r">Gasto 2026</th><th>O que roda nela</th></tr></thead>
  <tbody>
    <tr><td class="nome">CA2 - Bula 360</td><td>BM Bula 360 - Filial</td><td class="num">${brl(14774.72)}</td>
      <td>TODO o funil de cadastros da Bula: EAO, Magda, Perpétuo (forms + landings touros/fêmeas), JMP, São Geraldo.</td></tr>
    <tr><td class="nome">CA1 - Bula 360</td><td>BM Bula 360 - Filial</td><td class="num">${brl(22786.93)}</td>
      <td>Divulgação de leilões e perfis de clientes da agência (${num(DIVULGACAO_LEILOES.qtdCampanhas)} campanhas) + 3 campanhas do funil (Corte Perpétuo ×2, Corte Tupã) + Santa Casa.</td></tr>
    <tr><td class="nome">Formula do Boi!</td><td>Joao Business</td><td class="num">${brl(1362.01)}</td>
      <td>O piloto de abril–junho: “FB - funil whatsapp” (lead caía direto no WhatsApp) e o leilão de 09/05.</td></tr>
    <tr><td class="nome">Bula 1</td><td>BM Bula 360 - Matriz</td><td class="num">${brl(0)}</td>
      <td>Sem gasto em 2026.</td></tr>
  </tbody>
  <tfoot><tr><td>TOTAL 2026</td><td></td><td class="num">${brl(T.tudoBula2026.investido)}</td><td></td></tr></tfoot>
</table>

<h3>As 15 maiores campanhas de divulgação de leilões (CA1, fora do funil)</h3>
<table class="avoid">
  <thead><tr><th>Campanha</th><th class="r">Investido</th></tr></thead>
  <tbody>
    ${DIVULGACAO_LEILOES.maiores.map(c => `<tr><td class="nome">${esc(c.nome)}</td><td class="num">${brl(c.investido)}</td></tr>`).join('')}
  </tbody>
  <tfoot><tr><td>TOTAL das ${num(DIVULGACAO_LEILOES.qtdCampanhas)} campanhas (incl. menores)</td><td class="num">${brl(DIVULGACAO_LEILOES.totalInvestido)}</td></tr></tfoot>
</table>
<p class="micro">Essas campanhas divulgam o leilão (o lead cai na leiloeira) — são o serviço da agência, não a captação
própria da Bula. Estão aqui para o total do cheque fechar e para ninguém somar as duas coisas sem querer.</p>`

const regioes = `
<h2>Onde o funil investiu (CA2, por estado)</h2>
<table>
  <thead><tr><th>UF</th><th class="r">Investido</th><th class="r">Impressões</th><th class="r">Cliques</th><th class="r">CTR</th><th>Proporção</th></tr></thead>
  <tbody>
    ${META_LIVE.regioesCA2_2026.slice(0, 14).map(r => `<tr>
      <td class="nome">${esc(r.regiao)}</td><td class="num">${brl(r.investido)}</td>
      <td class="num">${num(r.impressoes)}</td><td class="num">${num(r.cliques)}</td>
      <td class="num">${pct(r.cliques, r.impressoes)}</td>
      <td><span class="bar" style="width:${Math.round(r.investido / META_LIVE.regioesCA2_2026[0].investido * 110)}px"></span></td></tr>`).join('')}
  </tbody>
</table>
<p class="micro">Leitura contra a divisão comercial: Minas + São Paulo + Bahia concentram ${pct(2153.97 + 2034.78 + 1470.17, 14774.72)}
do investimento da CA2, enquanto o Norte + Maranhão (zona do Douglas, hoje a maior em VGV de leilão) recebem
proporcionalmente menos. Vale cruzar com a página de geografia do relatório 3 antes de decidir a próxima verba.</p>

<p class="micro">Fonte: conector oficial Meta Ads MCP (claude.ai), extração 14/08/2026, contas da BM Bula 360 e Joao
Business. Dump auditável: <code>outputs/base-clientes-2026/fontes/meta-live-2026-08-14.json</code>. Valores em BRL,
janela 01/01–14/08/2026, atribuição padrão da conta.</p>
<footer><span>Bula Assessoria — Meta Ads oficial 2026</span><span>Emitido em ${HOJE}</span></footer>`

const html = pagina('Meta Ads — investimento oficial 2026',
    capa + conciliacao + tabelaFunil + contas + regioes)

fs.mkdirSync(saida, { recursive: true })
fs.writeFileSync(path.join(DIR, 'relatorio-meta-2026.html'), html)
const pdfPath = path.join(saida, '2 - Meta Ads - Investimento Oficial - 2026.pdf')
await paraPdf(html, pdfPath)
console.log('PDF:', pdfPath)
