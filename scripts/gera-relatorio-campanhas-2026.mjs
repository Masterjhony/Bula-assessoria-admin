/**
 * RELATÓRIO 2026 — DESEMPENHO DAS CAMPANHAS E CONVERSÃO (PDF).
 *
 *   node scripts/gera-relatorio-campanhas-2026.mjs [pasta-de-saida]
 *
 * Responde, nesta ordem, o que a diretoria pediu: quantos leads entraram,
 * quantos são qualificados, quantos cadastros submetemos, quantos foram
 * aprovados, quantos desses compraram e quanto venderam — além de custo por
 * cadastro e CAC — e compara o realizado com o FUNIL-META mensal da diretoria.
 *
 * Desde 14/08 o investimento vem AO VIVO da Meta (conector MCP com acesso às
 * contas da BM Bula 360) — não é mais piso de snapshot. Cada número do funil
 * carrega a fonte, e a seção de triangulação mostra com que outras fontes cada
 * variável foi conferida e qual foi o veredito.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pagina, paraPdf, esc, brl, brl0, num, pct, dataBr, mesBr } from './lib/relatorio-2026-visual.mjs'
import {
    CAMPANHAS, INVESTIDO_APURADO, LEADS_META, FUNIL_WHATSAPP,
    DIVULGACAO_LEILOES, META_LIVE, PRIMEIRA_CAMPANHA_FUNIL,
} from './lib/midia-2026.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const saida = process.argv[2] || DIR

const f = JSON.parse(fs.readFileSync(path.join(DIR, 'funil-2026.json'), 'utf8'))
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base-clientes.json'), 'utf8'))
const leiloes = JSON.parse(fs.readFileSync(path.join(DIR, 'leiloes-2026.json'), 'utf8'))

const HOJE = '14/08/2026'

/* ── números derivados ────────────────────────────────────────────────────── */

const vgvPorMes = {}
for (const l of leiloes) { const k = l.data.slice(0, 7); vgvPorMes[k] = (vgvPorMes[k] || 0) + l.vgv }
const mesesVgv = Object.keys(vgvPorMes).sort()
const VGV_UNIVERSO = Math.round(leiloes.reduce((a,l)=>a+l.vgv,0)*100)/100
const SEM_COMPRADOR = Math.round((VGV_UNIVERSO - f.compradores.vgv)*100)/100
const vgvSemFunil = mesesVgv.filter(m => m < '2026-06').reduce((a, m) => a + vgvPorMes[m], 0)

const cadastrosSubmetidos = f.cadastros.sistema.pessoas
const aprovadosTotal = f.cadastros.manual.aprovados
const custoPorCadastro = INVESTIDO_APURADO / cadastrosSubmetidos
const custoPorAprovado = INVESTIDO_APURADO / aprovadosTotal
const cacAtribuivel = f.conversao.atribuiveis ? INVESTIDO_APURADO / f.conversao.atribuiveis : null
const cpl = INVESTIDO_APURADO / f.leads.deCampanha
const cpMql = INVESTIDO_APURADO / f.leads.mqlDeCampanha

const campanhasOrdenadas = [...CAMPANHAS].sort((a, b) => b.investido - a.investido)
const leadsPlanilhaPorCampanha = Object.entries(f.leads.porCampanha).sort((a, b) => b[1].leads - a[1].leads)

/* Agregados mensais do funil digital, direto do dump ao vivo da Meta. */
const MESES_FUNIL = ['2026-06', '2026-07', '2026-08']
const metaMes = {}
for (const m of MESES_FUNIL) metaMes[m] = { investido: 0, impressoes: 0, cliques: 0, leadsMeta: 0 }
for (const c of META_LIVE.campanhasFunil) {
    for (const [m, v] of Object.entries(c.mensal)) {
        metaMes[m].investido += v.investido
        metaMes[m].impressoes += v.impressoes ?? 0
        metaMes[m].cliques += v.cliques ?? 0
        metaMes[m].leadsMeta += v.leadsMeta ?? 0
    }
}
const IMPRESSOES_FUNIL = Object.values(metaMes).reduce((a, v) => a + v.impressoes, 0)
const CLIQUES_FUNIL = Object.values(metaMes).reduce((a, v) => a + v.cliques, 0)

/** O funil-meta MENSAL da diretoria (imagem de 14/08/2026), transcrito na íntegra. */
const ALVO = {
    investimento: 6500, impressoes: 650000, cliques: 7800, acessos: 5850, leads: 702,
    mql: 140.4, cadastros: 56.16, aprovados: 33.696, compram: 13.5,
    animais: 40, ticket: 25000, faturamento: 1010880,
    cpl: 9.26, cpmql: 46.30, custoCadastro: 115.74, custoVenda: 160.75,
}

/* ── blocos ───────────────────────────────────────────────────────────────── */

const capa = `
<div class="cap">
  <div>
    <h1>Campanhas e conversão — 2026</h1>
    <div class="sub">Do investimento em mídia ao arremate: quantos leads entraram, quantos se qualificaram,
      quantos cadastros foram submetidos e aprovados, e quanto disso virou venda de verdade — agora com o
      investimento puxado ao vivo das contas de anúncio.</div>
  </div>
  <div class="meta">
    Bula Assessoria<br>Base: 01/01 a 14/08/2026<br>Emitido em ${HOJE}
    <div class="tot" style="margin-top:6px">${brl0(VGV_UNIVERSO)}<small>arrematado com cobertura Bula em ${num(leiloes.length)} leilões</small></div>
  </div>
</div>`

const alerta = `
<div class="box alerta avoid">
  <h3>Leia isto antes dos números</h3>
  <p>Três fatos da operação mudam o sentido de qualquer percentual abaixo. Nenhum deles é erro de
  apuração — ignorá-los produziria um relatório bonito e falso.</p>
  <ul>
    <li><strong>O investimento agora é oficial, direto da Meta.</strong> Em 14/08 o conector ganhou acesso às
      contas da BM Bula 360 e o ano inteiro foi puxado ao vivo, campanha a campanha, mês a mês. O funil digital
      soma <strong>${brl(INVESTIDO_APURADO)}</strong> — o valor de ${brl0(16500)} usado no relatório interno era o
      retrato correto de 02/08; de lá pra cá as campanhas de touros, fêmeas e São Geraldo continuaram rodando.</li>
    <li><strong>Não existe captação na planilha antes de junho.</strong> O primeiro lead é de
      ${dataBr(f.leads.primeiraData)} e a primeira campanha do funil subiu em ${dataBr(PRIMEIRA_CAMPANHA_FUNIL)}.
      (Houve um piloto anterior: o “funil WhatsApp” de abril–junho, ${brl(FUNIL_WHATSAPP.investido)} e
      ${num(FUNIL_WHATSAPP.leadsMeta)} leads que caíam direto no WhatsApp — contado à parte.) Só que a Bula vendeu
      <strong>${brl0(vgvSemFunil)}</strong> de janeiro a maio — ${pct(vgvSemFunil, VGV_UNIVERSO)} do ano — sem funil de
      mídia. Comparar “leads do ano” com “vendas do ano” mistura sete meses de venda com dois meses e meio de captação.</li>
    <li><strong>Desde 08/07 as aprovações das leiloeiras não entram mais no sistema.</strong> O registro
      automático só entende a ficha “#CAD”; o que veio depois está apurado à mão sobre os grupos de WhatsApp,
      com a frase que sustenta cada decisão. Por isso há dois números de cadastro nesta página, e não um.</li>
  </ul>
</div>`

const cards = `
<div class="cards avoid">
  <div class="card"><div class="z">Leads captados</div><div class="n">${num(f.leads.total)}<small>${num(f.leads.deCampanha)} de campanha · jun a ago</small></div></div>
  <div class="card"><div class="z">Qualificados (MQL)</div><div class="n">${num(f.leads.mql)}<small>${pct(f.leads.mql, f.leads.total)} dos leads</small></div></div>
  <div class="card"><div class="z">Cadastros submetidos</div><div class="n">${num(cadastrosSubmetidos)}<small>pessoas, no sistema (julho)</small></div></div>
  <div class="card"><div class="z">Aprovados</div><div class="n">${num(aprovadosTotal)}<small>apuração dos grupos até 01/08</small></div></div>
  <div class="card"><div class="z">Compraram</div><div class="n">${num(f.conversao.aprovadosQueCompraram)}<small>dos aprovados, ${brl0(f.conversao.vgvDosAprovados)}</small></div></div>
</div>`

const funil = `
<h2>O funil de 2026, etapa a etapa</h2>
<table class="funil">
  <thead><tr><th>Etapa</th><th class="r">Quantidade</th><th class="r">Da etapa anterior</th><th>Fonte e regra</th></tr></thead>
  <tbody>
    <tr><td class="et">Leads captados</td><td class="num q">${num(f.leads.total)}</td><td class="num">—</td>
      <td>Planilha “Leads - Bula Assessoria”, aba LEADS GERAIS. Inclui ${num(f.leads.porClasse['base-fria'] || 0)} contatos de listas antigas importadas, que <strong>não</strong> são captação de mídia.</td></tr>
    <tr><td class="et">…vindos de campanha</td><td class="num q">${num(f.leads.deCampanha)}</td><td class="num">${pct(f.leads.deCampanha, f.leads.total)}</td>
      <td>Formulário da Meta ou landing page. É este o número que deve ser dividido pelo investimento.</td></tr>
    <tr><td class="et">Qualificados (MQL)</td><td class="num q">${num(f.leads.mqlDeCampanha)}</td><td class="num">${pct(f.leads.mqlDeCampanha, f.leads.deCampanha)}</td>
      <td>Regra oficial do sistema: piso da faixa ≥ 100 cabeças <strong>e</strong> Inscrição Estadual (<code>evaluateMql</code>). Sobre todos os leads, ${num(f.leads.mql)} são MQL.</td></tr>
    <tr><td class="et">Abordados no WhatsApp</td><td class="num q">${num(f.atendimento.pessoas)}</td><td class="num">—</td>
      <td>API oficial da Meta, ${dataBr(f.atendimento.janela[0])} a ${dataBr(f.atendimento.janela[1])}. Regra conferida contra a fatura. Abrange leads de campanha e de base fria.</td></tr>
    <tr><td class="et">Responderam</td><td class="num q">${num(f.atendimento.responderam)}</td><td class="num">${pct(f.atendimento.responderam, f.atendimento.pessoas)}</td>
      <td>Resposta em até 72 h do primeiro disparo.</td></tr>
    <tr><td class="et">Cadastros submetidos</td><td class="num q">${num(cadastrosSubmetidos)}</td><td class="num">${pct(cadastrosSubmetidos, f.atendimento.responderam)}</td>
      <td>${num(f.cadastros.sistema.registros)} envios para ${num(cadastrosSubmetidos)} pessoas, em 2 leiloeiras (Bula Remates e Programa Leilões). Só julho — depois disso o registro parou.</td></tr>
    <tr><td class="et">Aprovados</td><td class="num q">${num(aprovadosTotal)}</td><td class="num"><span class="off">não comparável</span></td>
      <td>Pessoas, não registros: a apuração dos grupos até 01/08 tem ${num(f.cadastros.manual.registros)} registros de aprovação, mas ${num(f.cadastros.manual.registros - aprovadosTotal)} são a mesma pessoa aprovada duas vezes (no grupo e na consolidação). Houve ${num(f.cadastros.manual.recusados)} recusas — ${pct(aprovadosTotal, aprovadosTotal + f.cadastros.manual.recusados)} de aprovação entre as decisões lidas.
      <strong>Não divida por ${num(cadastrosSubmetidos)}:</strong> os aprovados vêm de um universo maior que o registrado no sistema — dividir um pelo outro produziria uma taxa de aprovação falsa. No sistema constam ${num(f.cadastros.sistema.pessoasAprovadas)} pessoas aprovadas.</td></tr>
    <tr><td class="et">Aprovados que compraram</td><td class="num q">${num(f.conversao.aprovadosQueCompraram)}</td><td class="num">${pct(f.conversao.aprovadosQueCompraram, aprovadosTotal)}</td>
      <td>Cruzamento com os ${num(f.compradores.total)} compradores de 2026 por CPF, telefone ou nome.</td></tr>
    <tr><td class="et">Valor comprado por eles</td><td class="num q">${brl0(f.conversao.vgvDosAprovados)}</td><td class="num">${pct(f.conversao.vgvDosAprovados, f.compradores.vgv)}</td>
      <td>Compra total no ano dessas pessoas, incluindo o que compraram antes de serem aprovadas.</td></tr>
  </tbody>
</table>
<p class="micro">A coluna “da etapa anterior” compara etapas que não são estritamente sequenciais — nem todo abordado
saiu de um lead da planilha, e nem todo cadastro nasceu de uma resposta. Serve para dar ordem de grandeza da perda,
não como taxa de conversão contratual.</p>`

const midia = `
<div class="pg"></div>
<h2>Investimento em mídia — oficial, ao vivo da Meta (14/08)</h2>
<table>
  <thead><tr><th>Campanha</th><th>Conta</th><th class="r">Investido</th><th class="r">Impressões</th><th class="r">Cliques</th><th class="r">Leads (Meta)</th><th class="r">CPL Meta</th></tr></thead>
  <tbody>
    ${campanhasOrdenadas.map(c => `<tr>
      <td class="nome">${esc(c.nome)}</td><td>${c.conta}</td>
      <td class="num">${brl(c.investido)}</td>
      <td class="num">${num(c.impressoes)}</td>
      <td class="num">${num(c.cliques)}</td>
      <td class="num">${c.obsLeads ? '<span class="off">landing¹</span>' : num(c.leads)}</td>
      <td class="num">${c.leads && !c.obsLeads ? brl(c.investido / c.leads) : '<span class="off">—</span>'}</td></tr>`).join('')}
  </tbody>
  <tfoot><tr><td>FUNIL DIGITAL (13 campanhas)</td><td></td><td class="num">${brl(INVESTIDO_APURADO)}</td>
    <td class="num">${num(IMPRESSOES_FUNIL)}</td><td class="num">${num(CLIQUES_FUNIL)}</td>
    <td class="num">${num(LEADS_META)}</td><td class="num">—</td></tr></tfoot>
</table>
<p class="micro">¹ Campanhas de landing própria (PERPETUO TOURO/FEMEAS, JMP SITE): o lead cai na planilha pela página,
não no formulário da Meta — a Meta subnotifica de propósito. Para julgá-las, use os leads da planilha (tabela adiante).
Extração: conector Meta Ads MCP, nível campanha, 01/01→14/08, contas CA1/CA2 da BM Bula 360
(<code>fontes/meta-live-2026-08-14.json</code>).</p>

<table class="avoid">
  <thead><tr><th>Mês</th><th class="r">Investido</th><th class="r">Impressões</th><th class="r">Cliques</th><th class="r">CTR</th><th class="r">Leads planilha</th><th class="r">CPL do mês</th></tr></thead>
  <tbody>
    ${MESES_FUNIL.map(m => {
        const v = metaMes[m]; const lp = f.leads.porMes[m]?.campanha || 0
        return `<tr><td class="nome">${mesBr(m)}${m === '2026-08' ? ' (até 14)' : ''}</td>
      <td class="num">${brl(v.investido)}</td><td class="num">${num(v.impressoes)}</td><td class="num">${num(v.cliques)}</td>
      <td class="num">${pct(v.cliques, v.impressoes)}</td><td class="num">${num(lp)}</td>
      <td class="num">${lp ? brl(v.investido / lp) : '—'}</td></tr>`
    }).join('')}
  </tbody>
</table>

<div class="box grey avoid">
  <h3>O que mais saiu das contas em 2026 (fora do funil de cadastros)</h3>
  <ul>
    <li><strong>Funil WhatsApp (abril–junho, conta Formula do Boi):</strong> ${brl(FUNIL_WHATSAPP.investido)} em 3 campanhas
      (“FB - funil whatsapp”), ${num(FUNIL_WHATSAPP.leadsMeta)} leads que caíam direto no WhatsApp — o piloto que antecedeu
      a planilha. Não entra no CPL acima porque esses leads não passam pela planilha.</li>
    <li><strong>Divulgação de leilões pela agência (CA1):</strong> ${brl(DIVULGACAO_LEILOES.totalInvestido)} em
      ${num(DIVULGACAO_LEILOES.qtdCampanhas)} campanhas de leilões e perfis (Cachoeirão, SóCriador, Tresmar, Ribalta…),
      onde o lead vai para a leiloeira, não para a Bula. É verba de divulgação, não de captação própria.</li>
    <li><strong>Awareness:</strong> ${brl(279.30)} (Leilão Santa Casa + leilão 09/05).</li>
  </ul>
</div>

<div class="cards avoid">
  <div class="card"><div class="z">Custo por lead</div><div class="n">${brl(cpl)}<small>${brl(INVESTIDO_APURADO)} ÷ ${num(f.leads.deCampanha)} leads de campanha</small></div></div>
  <div class="card"><div class="z">Custo por lead qualificado</div><div class="n">${brl(cpMql)}<small>÷ ${num(f.leads.mqlDeCampanha)} MQL</small></div></div>
  <div class="card"><div class="z">Custo por cadastro</div><div class="n">${brl(custoPorCadastro)}<small>÷ ${num(cadastrosSubmetidos)} cadastros submetidos</small></div></div>
  <div class="card"><div class="z">Custo por cadastro aprovado</div><div class="n">${brl(custoPorAprovado)}<small>÷ ${num(aprovadosTotal)} aprovados</small></div></div>
  <div class="card"><div class="z">CAC</div><div class="n">${cacAtribuivel ? brl(cacAtribuivel) : '—'}<small>÷ ${num(f.conversao.atribuiveis)} clientes com compra após o lead</small></div></div>
</div>`

const alvoVsReal = `
<div class="pg"></div>
<h2>Realizado × funil-meta mensal da diretoria</h2>
<p>A tabela abaixo põe o funil-meta mensal (investimento de ${brl0(ALVO.investimento)}/mês) contra o que de fato
aconteceu em cada mês de campanha. Junho e julho investiram na ordem da meta ou acima, e a captação de leads bateu a
meta nos dois meses. A perda não está no topo do funil — está no meio: qualificação abaixo dos 20% planejados e, em
especial, o degrau lead→cadastro.</p>
<table>
  <thead><tr><th>Etapa</th><th class="r">Meta /mês</th><th class="r">Junho</th><th class="r">Julho</th><th class="r">Agosto (1–14)</th><th>Leitura</th></tr></thead>
  <tbody>
    <tr><td class="et">Investimento</td><td class="num">${brl0(ALVO.investimento)}</td>
      <td class="num">${brl0(metaMes['2026-06'].investido)}</td><td class="num">${brl0(metaMes['2026-07'].investido)}</td><td class="num">${brl0(metaMes['2026-08'].investido)}</td>
      <td>Julho investiu ${pct(metaMes['2026-07'].investido - ALVO.investimento, ALVO.investimento)} acima da meta; agosto desacelerou.</td></tr>
    <tr><td class="et">Impressões</td><td class="num">${num(ALVO.impressoes)}</td>
      <td class="num">${num(metaMes['2026-06'].impressoes)}</td><td class="num">${num(metaMes['2026-07'].impressoes)}</td><td class="num">${num(metaMes['2026-08'].impressoes)}</td>
      <td>${pct(metaMes['2026-07'].impressoes, ALVO.impressoes)} da meta no melhor mês — o alcance planejado supõe mais verba de topo.</td></tr>
    <tr><td class="et">Cliques</td><td class="num">${num(ALVO.cliques)} <span class="micro">(CTR 1,2%)</span></td>
      <td class="num">${num(metaMes['2026-06'].cliques)}</td><td class="num">${num(metaMes['2026-07'].cliques)}</td><td class="num">${num(metaMes['2026-08'].cliques)}</td>
      <td>CTR real ${pct(CLIQUES_FUNIL, IMPRESSOES_FUNIL)} — acima do 1,2% planejado. O anúncio atrai; o gargalo não é criativo.</td></tr>
    <tr><td class="et">Leads gerados</td><td class="num">${num(ALVO.leads)} <span class="micro">(12% dos cliques)</span></td>
      <td class="num">${num(f.leads.porMes['2026-06']?.campanha || 0)}</td><td class="num">${num(f.leads.porMes['2026-07']?.campanha || 0)}</td><td class="num">${num(f.leads.porMes['2026-08']?.campanha || 0)}</td>
      <td><strong>Meta batida em junho e julho</strong> (${num(f.leads.porMes['2026-06']?.campanha || 0)} e ${num(f.leads.porMes['2026-07']?.campanha || 0)} × ${num(ALVO.leads)}).</td></tr>
    <tr><td class="et">Leads qualificados</td><td class="num">${num(Math.round(ALVO.mql))} <span class="micro">(20%)</span></td>
      <td class="num">${num(f.leads.porMes['2026-06']?.mqlCampanha || 0)}</td><td class="num">${num(f.leads.porMes['2026-07']?.mqlCampanha || 0)}</td><td class="num">${num(f.leads.porMes['2026-08']?.mqlCampanha || 0)}</td>
      <td>Qualificação real de ${pct(f.leads.mqlDeCampanha, f.leads.deCampanha)} × 20% na meta. O lead barato de formulário derruba a taxa.</td></tr>
    <tr><td class="et">Cadastros submetidos</td><td class="num">${num(Math.round(ALVO.cadastros))} <span class="micro">(40% dos MQL)</span></td>
      <td class="num"><span class="off">—</span></td><td class="num">${num(cadastrosSubmetidos)}</td><td class="num"><span class="off">sem registro</span></td>
      <td>O ano inteiro produziu ~1 mês de meta. É o degrau mais quebrado do funil.</td></tr>
    <tr><td class="et">Cadastros aprovados</td><td class="num">${num(Math.round(ALVO.aprovados))} <span class="micro">(60%)</span></td>
      <td class="num" colspan="3" style="text-align:center">${num(aprovadosTotal)} pessoas no ano (apuração dos grupos)</td>
      <td>~1,5 mês de meta, no ano inteiro.</td></tr>
    <tr><td class="et">Clientes compraram</td><td class="num">13,5 <span class="micro">(40%)</span></td>
      <td class="num" colspan="3" style="text-align:center">${num(f.conversao.atribuiveis)} atribuíveis no ano · ${num(f.conversao.aprovadosQueCompraram)} entre os aprovados</td>
      <td>Meia meta mensal, no acumulado.</td></tr>
    <tr><td class="et">Faturamento digital</td><td class="num">${brl0(ALVO.faturamento)}</td>
      <td class="num" colspan="3" style="text-align:center">${brl0(f.conversao.vgvAtribuivel)} atribuíveis no ano</td>
      <td>${pct(f.conversao.vgvAtribuivel, ALVO.faturamento)} de UM mês de meta.</td></tr>
  </tbody>
</table>
<table class="avoid">
  <thead><tr><th>Custo unitário</th><th class="r">Meta</th><th class="r">Real (jun–14/08)</th><th>Leitura</th></tr></thead>
  <tbody>
    <tr><td class="et">CPL</td><td class="num">${brl(ALVO.cpl)}</td><td class="num">${brl(cpl)}</td>
      <td>${pct(cpl - ALVO.cpl, ALVO.cpl)} acima da meta — razoável para operação nova.</td></tr>
    <tr><td class="et">Custo por MQL</td><td class="num">${brl(ALVO.cpmql)}</td><td class="num">${brl(cpMql)}</td>
      <td>O dobro da meta: consequência direta da taxa de qualificação real × os 20% planejados.</td></tr>
    <tr><td class="et">Custo por cadastro</td><td class="num">${brl(ALVO.custoCadastro)}</td><td class="num">${brl(custoPorCadastro)}</td>
      <td>~3× a meta. É aqui que o funil sangra — não no anúncio.</td></tr>
    <tr><td class="et">Custo por venda</td><td class="num">${brl(ALVO.custoVenda)} <span class="micro">*</span></td><td class="num">${brl(cacAtribuivel)}</td>
      <td>* Os ${brl(ALVO.custoVenda)} da meta são POR ANIMAL (${brl0(ALVO.investimento)} ÷ ~40/mês); o real ao lado é por CLIENTE atribuível — medidas diferentes, propositalmente lado a lado para não se confundirem de novo.</td></tr>
  </tbody>
</table>
<p class="micro">O funil-meta é MENSAL e o realizado tem 2 meses e meio de operação — as colunas de junho/julho comparam
mês contra mês; as linhas de baixo (cadastro, compra, faturamento) mostram o acumulado do ano contra UMA meta mensal,
para deixar visível o tamanho da distância sem escondê-la em médias.</p>`

const porCampanhaPlanilha = `
<h2>O que cada frente entregou na nossa planilha</h2>
<table>
  <thead><tr><th>Campanha (como chega na planilha)</th><th class="r">Leads</th><th class="r">Com I.E.</th><th class="r">MQL</th><th class="r">% MQL</th></tr></thead>
  <tbody>
    ${leadsPlanilhaPorCampanha.slice(0, 16).map(([k, v]) => `<tr>
      <td class="nome">${esc(k)}</td><td class="num">${num(v.leads)}</td><td class="num">${num(v.comIe)}</td>
      <td class="num">${num(v.mql)}</td><td class="num">${pct(v.mql, v.leads)}
      <span class="bar" style="width:${Math.round((v.mql / v.leads) * 70)}px"></span></td></tr>`).join('')}
  </tbody>
  <tfoot><tr><td>TOTAL DE CAMPANHA</td><td class="num">${num(f.leads.deCampanha)}</td><td class="num">—</td>
    <td class="num">${num(f.leads.mqlDeCampanha)}</td><td class="num">${pct(f.leads.mqlDeCampanha, f.leads.deCampanha)}</td></tr></tfoot>
</table>
<p class="micro">A leitura importante não é o volume: é a taxa de qualificação. Campanhas de bezerra e de “perpétuo”
trazem muito lead barato e pouco produtor com escala; as de touro trazem menos gente e mais gente certa.</p>`

const porMes = `
<h2>Captação × venda, mês a mês</h2>
<table>
  <thead><tr><th>Mês</th><th class="r">Leads</th><th class="r">De campanha</th><th class="r">MQL</th><th class="r">VGV do mês</th><th>Proporção do VGV</th></tr></thead>
  <tbody>
    ${mesesVgv.map(m => {
    const l = f.leads.porMes[m] || { total: 0, campanha: 0, mql: 0 }
    const maior = Math.max(...mesesVgv.map(k => vgvPorMes[k]))
    return `<tr><td class="nome">${mesBr(m)}</td>
      <td class="num">${l.total ? num(l.total) : '<span class="off">sem captação</span>'}</td>
      <td class="num">${l.campanha ? num(l.campanha) : '<span class="off">—</span>'}</td>
      <td class="num">${l.mql ? num(l.mql) : '<span class="off">—</span>'}</td>
      <td class="num">${brl0(vgvPorMes[m])}</td>
      <td><span class="bar" style="width:${Math.round(vgvPorMes[m] / maior * 120)}px"></span></td></tr>`
}).join('')}
  </tbody>
  <tfoot><tr><td>2026 até 14/08</td><td class="num">${num(f.leads.total)}</td><td class="num">${num(f.leads.deCampanha)}</td>
    <td class="num">${num(f.leads.mql)}</td><td class="num">${brl0(VGV_UNIVERSO)}</td><td></td></tr></tfoot>
</table>
<p class="micro">Os cinco primeiros meses vendem sem nenhum lead registrado. Isso não significa que a mídia não sirva —
significa que, até junho, a venda vinha inteira do relacionamento dos assessores, e é contra essa base que a mídia
precisa provar acréscimo.</p>`

const atribuicao = `
<div class="pg"></div>
<h2>Quanto a campanha realmente vendeu</h2>
<p>Esta é a pergunta que o relatório existe para responder, e é onde quase todo relatório de marketing mente. Um nome
pode aparecer na lista de leads e na lista de compradores sem que um tenha causado o outro — em especial quando o
lead entrou <em>depois</em> da compra. Por isso a apuração tem três níveis, do mais frouxo ao mais duro.</p>
<table>
  <thead><tr><th>Critério</th><th class="r">Clientes</th><th class="r">Valor</th><th>O que significa</th></tr></thead>
  <tbody>
    <tr><td class="nome">VGV total do ano</td><td class="num q">${num(leiloes.length)} leilões</td><td class="num">${brl0(VGV_UNIVERSO)}</td>
      <td>Cobertura Bula em 2026, somando o ERP e os fechamentos que não chegaram a ser lançados nele.</td></tr>
    <tr><td class="nome">Compradores identificados</td><td class="num q">${num(f.compradores.total)}</td><td class="num">${brl0(f.compradores.vgv)}</td>
      <td>Quem tem nome ligado ao arremate. Faltam <strong>${brl0(SEM_COMPRADOR)}</strong> (${pct(SEM_COMPRADOR, VGV_UNIVERSO)}) sem comprador identificável — são leilões que só existem como fechamento, onde só o pódio foi registrado, ou lotes marcados “a identificar”.</td></tr>
    <tr><td class="nome">…que aparecem em alguma base de leads</td><td class="num q">${num(base.filter(p => p.origemClasse).length)}</td>
      <td class="num">${brl0(base.filter(p => p.origemClasse).reduce((a, p) => a + p.volumeCompra, 0))}</td>
      <td>Inclui a lista fria de 13 mil contatos importados — presença na base não é mérito de campanha.</td></tr>
    <tr><td class="nome">…com origem de campanha</td><td class="num q">${num(base.filter(p => p.origemClasse === 'campanha').length)}</td>
      <td class="num">${brl0(base.filter(p => p.origemClasse === 'campanha').reduce((a, p) => a + p.volumeCompra, 0))}</td>
      <td>Vieram de anúncio ou landing — mas ainda sem checar a ordem dos fatos.</td></tr>
    <tr><td class="nome"><strong>…e que compraram DEPOIS de virar lead</strong></td><td class="num q">${num(f.conversao.atribuiveis)}</td>
      <td class="num"><strong>${brl0(f.conversao.vgvAtribuivel)}</strong></td>
      <td><strong>É o único número que a campanha pode reivindicar.</strong> Conta apenas as compras posteriores à entrada do lead.</td></tr>
  </tbody>
</table>

<h3>Os clientes atribuíveis, um a um</h3>
<table>
  <thead><tr><th>Cliente</th><th>Campanha / origem</th><th>Entrou como lead</th><th>1ª compra no ano</th><th class="r">Comprado após o lead</th></tr></thead>
  <tbody>
    ${f.detalhe.atribuiveis.sort((a, b) => b.valor - a.valor).map(a => {
        const jaEraCliente = a.primeiraCompra && dataBr(a.primeiraCompra) && String(a.primeiraCompra) < String(a.lead).slice(0, 10)
        return `<tr>
      <td class="nome">${esc(a.nome)}</td><td>${esc(a.campanha || '—')}</td>
      <td class="num">${esc(String(a.lead).slice(0, 10))}</td>
      <td class="num">${dataBr(a.primeiraCompra)}${jaEraCliente ? ' <span class="micro">(já era cliente)</span>' : ''}</td>
      <td class="num">${brl0(a.valor)}</td></tr>`
    }).join('')}
  </tbody>
  <tfoot><tr><td>TOTAL</td><td></td><td></td><td></td><td class="num">${brl0(f.conversao.vgvAtribuivel)}</td></tr></tfoot>
</table>
<p class="micro">Onde a 1ª compra do ano é anterior à entrada do lead, a pessoa já comprava antes e a coluna da direita
conta <strong>apenas</strong> o que ela arrematou depois de virar lead — a campanha leva crédito pelo incremento, não
pela carteira que já existia.</p>
<p class="micro">Outros ${num(base.filter(p => p.origemClasse === 'campanha' && !p.atribuivelCampanha).length)} compradores
têm origem de campanha mas a compra é anterior à entrada do lead — são clientes que a Bula já tinha e que preencheram
um formulário depois. Estão na planilha, marcados, e de propósito fora desta conta.</p>`

const triangulacao = `
<h2>Como cada número foi conferido (triangulação)</h2>
<p>Regra da apuração: <strong>nenhum número entra com uma fonte só.</strong> Cada variável foi buscada em pelo menos
duas fontes independentes; quando elas divergem, o relatório usa a mais verificável e explica a diferença — em vez de
escolher a mais bonita.</p>
<table>
  <thead><tr><th>Variável</th><th class="r">Valor usado</th><th>Fontes comparadas</th><th>Veredito</th></tr></thead>
  <tbody>
    <tr><td class="et">Investimento (funil)</td><td class="num q">${brl(INVESTIDO_APURADO)}</td>
      <td>API da Meta ao vivo (14/08) × apuração interna de snapshots (16.499,31) × relatório da diretoria (16.500)</td>
      <td><strong>Conferido.</strong> As três batiam em 02/08; o valor ao vivo é maior só porque as campanhas seguiram rodando até hoje.</td></tr>
    <tr><td class="et">Leads de campanha</td><td class="num q">${num(f.leads.deCampanha)}</td>
      <td>Planilha de leads (linha a linha) × Meta (${num(LEADS_META)} “leads” reportados)</td>
      <td><strong>Divergência explicada.</strong> A Meta subnotifica as campanhas de landing (touros/fêmeas/JMP site) e conta formulário repetido; a planilha é a fonte porque é onde o lead vira trabalho.</td></tr>
    <tr><td class="et">Qualificados (MQL)</td><td class="num q">${num(f.leads.mqlDeCampanha)}</td>
      <td>Regra do sistema (≥100 cabeças + I.E., <code>evaluateMql</code>) × contagem da diretoria (224)</td>
      <td><strong>Divergência de critério.</strong> Os 224 incluem qualificação manual do time; pelos critérios do sistema são ${num(f.leads.mqlDeCampanha)} de campanha (${num(f.leads.mql)} no total).</td></tr>
    <tr><td class="et">Cadastros submetidos</td><td class="num q">${num(cadastrosSubmetidos)}</td>
      <td>Sistema (cliente_leiloeira_cadastro) × contagem da diretoria (81)</td>
      <td><strong>Sistema incompleto.</strong> O registro parou em 08/07; os 81 incluem envios manuais posteriores sem rastro. O verdadeiro está no intervalo [${num(cadastrosSubmetidos)}, 81].</td></tr>
    <tr><td class="et">Aprovados</td><td class="num q">${num(aprovadosTotal)}</td>
      <td>Grupos de WhatsApp (frase a frase) × lista consolidada × contagem da diretoria (51)</td>
      <td><strong>Conferido com correção.</strong> Os 51 são registros; 2 pessoas estavam contadas duas vezes → ${num(aprovadosTotal)} pessoas.</td></tr>
    <tr><td class="et">Clientes que compraram</td><td class="num q">${num(f.conversao.atribuiveis)}</td>
      <td>Base de compradores (ERP FIL 2 + fechamentos + carteira) × leads com data × diretoria (13)</td>
      <td><strong>Critério mais duro vence.</strong> Os 13 contam presença nas duas listas; exigindo compra POSTERIOR ao lead sobram ${num(f.conversao.atribuiveis)} (${num(base.filter(p => p.origemClasse === 'campanha').length)} têm origem de campanha sem olhar a ordem dos fatos).</td></tr>
    <tr><td class="et">Faturamento digital</td><td class="num q">${brl0(f.conversao.vgvAtribuivel)}</td>
      <td>Compras pós-lead (ERP, lote a lote) × diretoria (937.900)</td>
      <td><strong>Mesma causa.</strong> Os 937.900 somam a compra total do ano de quem está nas duas listas — inclusive o que foi comprado ANTES do lead existir.</td></tr>
    <tr><td class="et">VGV do ano</td><td class="num q">${brl0(VGV_UNIVERSO)}</td>
      <td>ERP HastaPro (FIL 2, lote a lote) × fechamentos do sistema × planilhas de contas a receber</td>
      <td><strong>Conferido.</strong> União sem dupla contagem: cada leilão é servido por UMA fonte de dinheiro.</td></tr>
  </tbody>
</table>`

const limites = `
<h2>O que esta apuração não consegue provar</h2>
<div class="box">
  <ul>
    <li><strong>Metade dos compradores não tem telefone nem CPF no ERP.</strong> Dos ${num(f.compradores.total)} compradores,
      ${num(f.compradores.comCpf)} têm CPF (${pct(f.compradores.comCpf, f.compradores.total)}) e ${num(f.compradores.comTelefone)}
      têm telefone (${pct(f.compradores.comTelefone, f.compradores.total)}). Para o resto, o cruzamento com os leads depende
      só do nome — e nome ambíguo foi <em>recusado</em>, não chutado. Conclusão prática: o número de clientes vindos de
      campanha é um <strong>piso</strong>; o teto não é apurável enquanto o cadastro não for completado.</li>
    <li><strong>Nenhum comprador de 2026 tem score de crédito consultado.</strong> O score foi consultado no funil novo
      (junho e julho); quem compra ainda vem pelo canal antigo, que não passa por essa consulta.</li>
    <li><strong>As aprovações das leiloeiras pararam de virar registro em 08/07.</strong> O número de aprovados vem de
      leitura manual dos grupos. Enquanto o parser não entender as decisões em texto livre (“cadastro ok”, “aprovado”),
      esta etapa do funil não se mede sozinha.</li>
    <li><strong>Cadastros submetidos pós-08/07 não têm rastro.</strong> A diferença entre os ${num(cadastrosSubmetidos)} do
      sistema e os 81 contados pela diretoria é envio manual sem registro — irrecuperável retroativamente.</li>
  </ul>
</div>

<h2>O que fazer com isso</h2>
<div class="box grey">
  <ul>
    <li><strong>Completar cadastro de quem já comprou é a tarefa de maior retorno.</strong> São
      ${num(base.filter(p => !p.cpf || !p.telefone).length)} compradores sem CPF ou sem telefone, e eles respondem por
      ${brl0(base.filter(p => !p.cpf || !p.telefone).reduce((a, p) => a + p.volumeCompra, 0))} de compra em 2026. Sem isso,
      nenhuma medição de campanha melhora — e nenhuma régua de recompra é possível.</li>
    <li><strong>Medir campanha por MQL, não por lead.</strong> O custo por lead varia de poucos reais a dezenas conforme
      a frente; o custo por lead qualificado (${brl(cpMql)}) é o que se compara com o ticket de um arremate.</li>
    <li><strong>Fechar o elo cadastro→aprovação no sistema.</strong> É a única etapa do funil que hoje depende de alguém
      ler o WhatsApp e anotar — e é o degrau onde o realizado mais fica atrás da meta.</li>
    <li><strong>Contar o ciclo, não o mês.</strong> O intervalo entre virar lead e arrematar, nos casos atribuíveis, vai
      de 1 a 37 dias, com mediana de 6 — a campanha de junho ainda colhia em agosto. Avaliar mídia por mês fechado
      subestima o que ela devolve.</li>
  </ul>
</div>
<p class="micro">Fontes: Meta Ads (conector oficial MCP, extração ao vivo 14/08, contas CA1/CA2 BM Bula 360 + Formula do
Boi) · HastaPro (ERP, filial Bula Assessoria) · Supabase (crm_leads, clientes, fechamentos, cliente_leiloeira_cadastro,
whatsapp_messages) · planilha “Leads - Bula Assessoria” · apuração manual dos grupos de cadastro
(scripts/lib/cadastros-aprovados-grupos.mjs). Reprodução: <code>node scripts/extrai-fontes-2026.mjs &&
node scripts/monta-base-2026.mjs && node scripts/monta-funil-2026.mjs</code>.</p>
<footer><span>Bula Assessoria — Campanhas e conversão 2026</span><span>Emitido em ${HOJE}</span></footer>`

const html = pagina('Campanhas e conversão — Bula 2026',
    capa + alerta + cards + funil + midia + alvoVsReal + porCampanhaPlanilha + porMes + atribuicao + triangulacao + limites)

fs.mkdirSync(saida, { recursive: true })
const htmlPath = path.join(DIR, 'relatorio-campanhas-2026.html')
fs.writeFileSync(htmlPath, html)
const pdfPath = path.join(saida, '1 - Desempenho das Campanhas e Conversao - 2026.pdf')
await paraPdf(html, pdfPath)
console.log('PDF:', pdfPath)
