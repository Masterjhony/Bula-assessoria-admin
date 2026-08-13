/**
 * RELATÓRIO 2026 — DESEMPENHO DAS CAMPANHAS E CONVERSÃO (PDF).
 *
 *   node scripts/gera-relatorio-campanhas-2026.mjs [pasta-de-saida]
 *
 * Responde, nesta ordem, o que a diretoria pediu em 13/08/2026: quantos leads
 * entraram, quantos são qualificados, quantos cadastros submetemos, quantos
 * foram aprovados, quantos desses compraram e quanto venderam — além de custo
 * por cadastro e CAC.
 *
 * O relatório é escrito para ser lido com desconfiança: cada etapa carrega a
 * fonte, e as duas descontinuidades do ano (não havia captação antes de junho;
 * as aprovações saíram do sistema em 08/07) aparecem na primeira página, não
 * numa nota de rodapé.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pagina, paraPdf, esc, brl, brl0, num, pct, dataBr, mesBr } from './lib/relatorio-2026-visual.mjs'
import { CAMPANHAS, SNAPSHOTS, INVESTIDO_APURADO, APURADO_ATE, PRIMEIRA_CAMPANHA } from './lib/midia-2026.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const saida = process.argv[2] || DIR

const f = JSON.parse(fs.readFileSync(path.join(DIR, 'funil-2026.json'), 'utf8'))
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base-clientes.json'), 'utf8'))
const leiloes = JSON.parse(fs.readFileSync(path.join(DIR, 'leiloes-2026.json'), 'utf8'))

const HOJE = '13/08/2026'

/* ── números derivados ────────────────────────────────────────────────────── */

const vgvPorMes = {}
for (const l of leiloes) { const k = l.data.slice(0, 7); vgvPorMes[k] = (vgvPorMes[k] || 0) + l.vgv }
const mesesVgv = Object.keys(vgvPorMes).sort()
const vgvAte = m => mesesVgv.filter(k => k <= m).reduce((a, k) => a + vgvPorMes[k], 0)
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

/* ── blocos ───────────────────────────────────────────────────────────────── */

const capa = `
<div class="cap">
  <div>
    <h1>Campanhas e conversão — 2026</h1>
    <div class="sub">Do investimento em mídia ao arremate: quantos leads entraram, quantos se qualificaram,
      quantos cadastros foram submetidos e aprovados, e quanto disso virou venda de verdade.</div>
  </div>
  <div class="meta">
    Bula Assessoria<br>Base: 01/01 a 13/08/2026<br>Emitido em ${HOJE}
    <div class="tot" style="margin-top:6px">${brl0(VGV_UNIVERSO)}<small>arrematado com cobertura Bula em 100 leilões</small></div>
  </div>
</div>`

const alerta = `
<div class="box alerta avoid">
  <h3>Leia isto antes dos números</h3>
  <p>Duas descontinuidades do ano mudam o sentido de qualquer percentual abaixo. Nenhuma delas é erro de
  apuração — são fatos da operação, e ignorá-los produziria um relatório bonito e falso.</p>
  <ul>
    <li><strong>Não existe captação registrada antes de junho.</strong> O primeiro lead da planilha é de
      ${dataBr(f.leads.primeiraData)} e a primeira campanha subiu em ${dataBr(PRIMEIRA_CAMPANHA)}. Só que a Bula
      vendeu <strong>${brl0(vgvSemFunil)}</strong> de janeiro a maio — ${pct(vgvSemFunil, VGV_UNIVERSO)} do ano —
      sem nenhum funil de mídia. Comparar “leads do ano” com “vendas do ano” mistura sete meses de venda com
      dois meses e meio de captação.</li>
    <li><strong>Desde 08/07 as aprovações das leiloeiras não entram mais no sistema.</strong> O registro
      automático só entende a ficha “#CAD”; o que veio depois está apurado à mão sobre os grupos de WhatsApp,
      com a frase que sustenta cada decisão. Por isso há dois números de cadastro nesta página, e não um.</li>
    <li><strong>O investimento em mídia é um piso, não o número oficial.</strong> O conector da Meta não está
      autenticado nesta máquina, então o valor vem de snapshots tirados em ${dataBr('2026-07-14')} e
      ${dataBr('2026-08-03')}. Campanha que continuou rodando depois de ${dataBr(APURADO_ATE)} está subcontada —
      o que torna todo custo desta página um <em>piso</em>: o real é igual ou maior.</li>
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
      <strong>Não divida por 53:</strong> os aprovados vêm de um universo maior que o registrado no sistema — dividir um pelo outro produziria uma taxa de aprovação falsa. No sistema constam ${num(f.cadastros.sistema.pessoasAprovadas)} pessoas aprovadas.</td></tr>
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
<h2>Investimento em mídia e custo por etapa</h2>
<table>
  <thead><tr><th>Campanha</th><th>Conta</th><th>Início</th><th class="r">Investido</th><th class="r">Leads (Meta)</th><th class="r">CPL</th><th>Janela apurada</th></tr></thead>
  <tbody>
    ${campanhasOrdenadas.map(c => `<tr>
      <td class="nome">${esc(c.nome)}</td><td>${c.conta}</td><td class="num">${dataBr(c.inicio)}</td>
      <td class="num">${brl(c.investido)}</td>
      <td class="num">${c.leads ? num(c.leads) : '<span class="off">—</span>'}</td>
      <td class="num">${c.leads ? brl(c.investido / c.leads) : '<span class="off">—</span>'}</td>
      <td class="micro">${c.fonte === 'max0714' ? 'acumulado até 14/07' : '01/07 a 02/08'}</td></tr>`).join('')}
  </tbody>
  <tfoot><tr><td>TOTAL APURADO</td><td></td><td></td><td class="num">${brl(INVESTIDO_APURADO)}</td><td class="num">—</td><td class="num">—</td><td class="micro">piso</td></tr></tfoot>
</table>
<p class="micro">Campanhas sem leads reportados (as “JMP SITE” e a “PERPETUO TOURO”) mandavam tráfego para landing page:
o lead existe, mas cai na planilha pela página e não no formulário da Meta — por isso a coluna da Meta fica vazia.
Use os leads da planilha (tabela seguinte) para julgar essas campanhas.</p>

<div class="cards avoid">
  <div class="card"><div class="z">Custo por lead</div><div class="n">${brl(cpl)}<small>${brl(INVESTIDO_APURADO)} ÷ ${num(f.leads.deCampanha)} leads de campanha</small></div></div>
  <div class="card"><div class="z">Custo por lead qualificado</div><div class="n">${brl(cpMql)}<small>÷ ${num(f.leads.mqlDeCampanha)} MQL</small></div></div>
  <div class="card"><div class="z">Custo por cadastro</div><div class="n">${brl(custoPorCadastro)}<small>÷ ${num(cadastrosSubmetidos)} cadastros submetidos</small></div></div>
  <div class="card"><div class="z">Custo por cadastro aprovado</div><div class="n">${brl(custoPorAprovado)}<small>÷ ${num(aprovadosTotal)} aprovados</small></div></div>
  <div class="card"><div class="z">CAC</div><div class="n">${cacAtribuivel ? brl(cacAtribuivel) : '—'}<small>÷ ${num(f.conversao.atribuiveis)} clientes com compra após o lead</small></div></div>
</div>
<p class="micro">Todos os custos acima usam o investimento apurado como piso — se a Meta trouxer valor maior, sobem na
mesma proporção. O CAC é o número mais duro da página e está explicado adiante.</p>`

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
  <tfoot><tr><td>2026 até 13/08</td><td class="num">${num(f.leads.total)}</td><td class="num">${num(f.leads.deCampanha)}</td>
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

const limites = `
<h2>O que esta apuração não consegue provar</h2>
<div class="box">
  <ul>
    <li><strong>Metade dos compradores não tem telefone nem CPF no ERP.</strong> Dos ${num(f.compradores.total)} compradores,
      ${num(f.compradores.comCpf)} têm CPF (${pct(f.compradores.comCpf, f.compradores.total)}) e ${num(f.compradores.comTelefone)}
      têm telefone (${pct(f.compradores.comTelefone, f.compradores.total)}). Para o resto, o cruzamento com os leads depende
      só do nome — e nome ambíguo foi <em>recusado</em>, não chutado. Conclusão prática: o número de clientes vindos de
      campanha é um <strong>piso</strong>; o teto não é apurável enquanto o cadastro não for completado.</li>
    <li><strong>Nenhum comprador de 2026 tem score de crédito consultado.</strong> Existem ${num(13)} clientes e
      ${num(42)} leads com score na base, e nenhum deles comprou. O score foi consultado no funil novo (junho e julho);
      quem compra ainda vem pelo canal antigo, que não passa por essa consulta.</li>
    <li><strong>As aprovações das leiloeiras pararam de virar registro em 08/07.</strong> O número de aprovados vem de
      leitura manual dos grupos. Enquanto o parser não entender as decisões em texto livre (“cadastro ok”, “aprovado”),
      esta etapa do funil não se mede sozinha.</li>
    <li><strong>O investimento não está fechado.</strong> Falta autenticar o conector da Meta para puxar 2026 inteiro
      nas duas contas. Até lá, todo custo por etapa é piso.</li>
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
      ler o WhatsApp e anotar.</li>
    <li><strong>Contar o ciclo, não o mês.</strong> O intervalo entre virar lead e arrematar, nos casos atribuíveis, vai
      de 1 a 37 dias, com mediana de 6 — mas os dois maiores (30 e 37 dias) mostram que a campanha de junho ainda
      colhia em agosto. Avaliar mídia por mês fechado subestima o que ela devolve.</li>
  </ul>
</div>
<p class="micro">Fontes: HastaPro (ERP, filial Bula Assessoria) · Supabase (crm_leads, clientes, fechamentos,
cliente_leiloeira_cadastro, whatsapp_messages) · planilha “Leads - Bula Assessoria” · apuração manual dos grupos de
cadastro (scripts/lib/cadastros-aprovados-grupos.mjs) · snapshots do conector Meta (${esc(SNAPSHOTS.max0714)}; ${esc(SNAPSHOTS.jan0802)}).
Reprodução: <code>node scripts/extrai-fontes-2026.mjs && node scripts/monta-base-2026.mjs && node scripts/monta-funil-2026.mjs</code>.</p>
<footer><span>Bula Assessoria — Campanhas e conversão 2026</span><span>Emitido em ${HOJE}</span></footer>`

const html = pagina('Campanhas e conversão — Bula 2026',
    capa + alerta + cards + funil + midia + porCampanhaPlanilha + porMes + atribuicao + limites)

fs.mkdirSync(saida, { recursive: true })
const htmlPath = path.join(DIR, 'relatorio-campanhas-2026.html')
fs.writeFileSync(htmlPath, html)
const pdfPath = path.join(saida, '1 - Desempenho das Campanhas e Conversao - 2026.pdf')
await paraPdf(html, pdfPath)
console.log('PDF:', pdfPath)
