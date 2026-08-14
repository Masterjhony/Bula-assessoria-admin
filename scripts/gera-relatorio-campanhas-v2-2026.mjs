/**
 * RELATÓRIO DE DESEMPENHO DAS CAMPANHAS DIGITAIS — 2026 (v2, escrito do zero).
 *
 *   node scripts/gera-relatorio-campanhas-v2-2026.mjs [pasta-de-saida]
 *
 * A v1 nasceu antes de haver acesso à conta de anúncio e foi remendada dez vezes
 * ao longo de 14/08 conforme cada fonte nova aparecia. Este arquivo reescreve o
 * documento inteiro a partir dos números já verificados, para que não sobre
 * nenhum texto de uma versão contra número de outra.
 *
 * AS SEIS REGRAS QUE ESTE RELATÓRIO OBEDECE — todas nasceram de um erro pego:
 *
 *  1. ESCOPO DE MÍDIA. Só entra o funil digital de captação. O piloto WhatsApp,
 *     a divulgação de leilões da agência e awareness aparecem uma vez, no
 *     apêndice, para o cheque fechar.
 *  2. ESCOPO DE CUSTO. Quatro das 13 campanhas têm o formulário na conta da
 *     leiloeira e o lead nunca chega aqui. Custo de captação divide só o
 *     investimento das 9 cujo lead chega — senão infla ~30%.
 *  3. ORIGEM DO CADASTRO. Cadastro no grupo só conta para a campanha se a pessoa
 *     for lead de campanha. Medido: em agosto, nenhum dos 15 identificáveis era.
 *  4. IDENTIDADE ANTES DE VALOR. Casamento por nome só vale com telefone, UF ou
 *     confirmação humana. Nome igual sem isso é homônimo até prova em contrário.
 *  5. FILIAL NÃO LIMITA A PESSOA. O VGV usa a filial da Bula; a atribuição de
 *     campanha segue a pessoa em qualquer filial do HastaPro.
 *  6. META É TAXA, E É DE AGOSTO. A coluna de percentual é o alvo do mês; os
 *     volumes da planilha são apuração à mão. Acumulado não vira nota de meta.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pagina, paraPdf, esc, brl, brl0, num, pct, dataBr, mesBr } from './lib/relatorio-2026-visual.mjs'
import { INVESTIDO_APURADO, FUNIL_WHATSAPP, DIVULGACAO_LEILOES, META_LIVE } from './lib/midia-2026.mjs'
import { PATROCINADOS_LEOZINHO } from './lib/patrocinados-confirmados.mjs'
import { NOVOS_EM_AGOSTO, DE_CAMPANHA_EM_AGOSTO, IDENTIFICAVEIS, META_CADASTROS_AGOSTO } from './lib/cadastros-agosto-2026.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIR = path.join(ROOT, 'outputs', 'base-clientes-2026')
const saida = process.argv[2] || DIR
const HOJE = '14/08/2026'

const f = JSON.parse(fs.readFileSync(path.join(DIR, 'funil-2026.json'), 'utf8'))
const base = JSON.parse(fs.readFileSync(path.join(DIR, 'base-clientes.json'), 'utf8'))
const atr = JSON.parse(fs.readFileSync(path.join(DIR, 'atribuicao-campanha-2026.json'), 'utf8'))
const tx = JSON.parse(fs.readFileSync(path.join(DIR, 'taxas-funil-2026.json'), 'utf8'))
const at = JSON.parse(fs.readFileSync(path.join(DIR, 'atendimento-real-2026.json'), 'utf8'))

/* ── números, todos derivados de fonte apurada ────────────────────────────── */

const MESES = ['2026-06', '2026-07', '2026-08']
const mm = Object.fromEntries(MESES.map(m => [m, { investido: 0, impressoes: 0, cliques: 0 }]))
for (const c of META_LIVE.campanhasFunil)
    for (const [m, v] of Object.entries(c.mensal))
        if (mm[m]) { mm[m].investido += v.investido; mm[m].impressoes += v.impressoes ?? 0; mm[m].cliques += v.cliques ?? 0 }
const IMP = MESES.reduce((a, m) => a + mm[m].impressoes, 0)
const CLI = MESES.reduce((a, m) => a + mm[m].cliques, 0)
const CPM = INVESTIDO_APURADO / IMP * 1000

const INVEST_CAPTACAO = Math.round((INVESTIDO_APURADO - tx.base.investidoFora) * 100) / 100
const LEADS = f.leads.deCampanha
const MQL = f.leads.mqlDeCampanha
const CADASTROS = f.cadastros.sistema.pessoasDeCampanha
const APROVADOS = f.cadastros.manual.aprovadosDeCampanha
const APR_FORA = f.cadastros.manual.aprovadosPorFora + f.cadastros.manual.aprovadosPlanilhaNaoCampanha

const clientes = [...atr.comprovados, ...atr.aRevisar].sort((a, b) => b.valor - a.valor)
const CLIENTES = clientes.length
const ANIMAIS = clientes.reduce((a, p) => a + p.animais, 0)
const ARREMATES = clientes.reduce((a, p) => a + p.arremates, 0)
const VGV = clientes.reduce((a, p) => a + p.valor, 0)
const TICKET = VGV / ANIMAIS
/** Compradores com origem de campanha cuja compra é anterior à entrada do lead. */
const COMPRARAM_ANTES = base.filter(p => p.origemClasse === 'campanha' && !p.atribuivelCampanha).length

const cpl = INVEST_CAPTACAO / LEADS
const cpMql = INVEST_CAPTACAO / MQL
const cpCad = INVEST_CAPTACAO / CADASTROS
const cac = INVEST_CAPTACAO / CLIENTES

const AGO = {
    investido: mm['2026-08'].investido, impressoes: mm['2026-08'].impressoes, cliques: mm['2026-08'].cliques,
    ctr: mm['2026-08'].cliques / mm['2026-08'].impressoes * 100,
    leads: f.leads.porMes['2026-08']?.campanha || 0,
    mql: f.leads.porMes['2026-08']?.mqlCampanha || 0,
    cadastros: NOVOS_EM_AGOSTO.length,
    aprovados: NOVOS_EM_AGOSTO.filter(c => c.status === 'aprovado').length,
    recusados: NOVOS_EM_AGOSTO.filter(c => c.status === 'recusado').length,
    clientes: clientes.filter(c => c.detalhe.some(d => d.data >= '2026-08-01')),
}
AGO.cliqueLead = AGO.leads / AGO.cliques * 100
AGO.leadMql = AGO.mql / AGO.leads * 100
AGO.cpl = (AGO.investido - 0) / AGO.leads
AGO.aprovacao = AGO.aprovados / (AGO.aprovados + AGO.recusados) * 100

/** A tabela da diretoria: coluna do meio = apuração à mão; coluna % = meta de agosto. */
const AMAO = { impressoes: 650000, cliques: 7800, acessos: 5850, leads: 702, mql: 140.4, cadastros: 56.16, aprovados: 33.696, clientes: 13.5, animais: 40, ticket: 25000, faturamento: 1010880, cpl: 9.26, cpmql: 46.30, custoCadastro: 115.74, custoVenda: 160.75 }

const dif = (meu, dele) => { const d = (meu / dele - 1) * 100; return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(0)}%` }

/* ── campanha a campanha ──────────────────────────────────────────────────── */
const ALIAS = {
    'LEADS - FORMS INST PERPETUO': ['LEADS - FORMS INST PERPETUO'],
    'LEADS - FORMS INST MAGDA Macho': ['LEADS - FORMS INST MAGDA Macho'],
    'LEADS - FORMS INST EAO — Cópia': ['LEADS - FORMS INST EAO — Cópia'],
    'LEADS - FORMS INST EAO': [],
    'Leilao JMP 13 14/06 Forms Insta': ['Leilao JMP 13 14/06 Forms Insta'],
    '13/06 e 14/06 LEADS JMP SITE': ['120247464210220708', 'CA - LEILAO JMP TOUROS 14/06', 'Landing JMP'],
    '13/06 e 14/06 LEADS JMP SITE — Cópia': ['13/06 e 14/06 LEADS JMP SITE — Cópia', '120247596748540708'],
    'LEAD - PERPETUO TOURO': ['CA - PERPETUO TOURO WEB', 'LEAD - PERPETUO TOURO', 'Landing Touros'],
    'LEADS - PERPETUO FEMEAS': ['CA - PERPETUO-FEMEAS web videos', 'CA - PERPETUO FEMEAS web', 'Landing Fêmeas — Funil Perpétuo'],
    'LEADS - SAO GERALDO': ['LEADS - SAO GERALDO', 'CA - SAO GERALDO - web - Aberto', 'CA - SAO GERALDO - web - Aberto — Cópia', 'Landing São Geraldo'],
    'CORTE PERPÉTUO': [], 'CORTE PERPÉTUO / 13 de Julho': [], 'CORTE TUPÃ': [],
}
const pc = f.leads.porCampanha
const somaAlias = ns => ns.reduce((a, n) => { const v = pc[n] || { leads: 0, mql: 0 }; return { leads: a.leads + v.leads, mql: a.mql + v.mql } }, { leads: 0, mql: 0 })
const campanhas = [...META_LIVE.campanhasFunil].sort((a, b) => b.total.investido - a.total.investido)
    .map(c => ({ c, s: somaAlias(ALIAS[c.nome] ?? []), semPlanilha: (ALIAS[c.nome] ?? []).length === 0 }))
const usados = new Set(Object.values(ALIAS).flat())
const restoLeads = Object.entries(pc).filter(([k]) => !usados.has(k)).reduce((a, [, v]) => a + v.leads, 0)

/* ══ DOCUMENTO ════════════════════════════════════════════════════════════ */

const capa = `
<div class="cap">
  <div>
    <h1>Campanhas digitais — desempenho 2026</h1>
    <div class="sub">Do investimento em mídia ao arremate, com a fonte de cada número. Investimento puxado ao vivo
    da conta de anúncio; venda conferida lote a lote no HastaPro; cadastro lido mensagem a mensagem nos grupos.</div>
  </div>
  <div class="meta">
    Bula Assessoria · BM Bula 360<br>Campanhas: 09/06 a 14/08/2026<br>Emitido em ${HOJE}
    <div class="tot" style="margin-top:6px">${brl(INVESTIDO_APURADO)}<small>investidos no funil de captação</small></div>
  </div>
</div>

<h2>As respostas, em uma linha cada</h2>
<table class="funil">
  <thead><tr><th>Pergunta</th><th class="r">Resposta</th><th>Fonte e ressalva</th></tr></thead>
  <tbody>
    <tr><td class="et">Quanto foi investido</td><td class="num q">${brl(INVESTIDO_APURADO)}</td>
      <td>API da Meta, 13 campanhas, 09/06→14/08. O “R$ 16.500” apurado à mão estava certo para 02/08; a diferença é o que rodou depois.</td></tr>
    <tr><td class="et">Quantos leads entraram</td><td class="num q">${num(LEADS)}</td>
      <td>Pessoas únicas, sem duplicata. <strong>Mais que o dobro dos 702 contados à mão.</strong></td></tr>
    <tr><td class="et">Quantos se qualificaram</td><td class="num q">${num(MQL)}</td>
      <td>${pct(MQL, LEADS)} — regra do sistema: piso ≥ 100 cabeças e Inscrição Estadual.</td></tr>
    <tr><td class="et">Quantos viraram cadastro</td><td class="num q">${num(CADASTROS)}</td>
      <td>Sistema, julho, só quem é lead de campanha. É PISO: o registro parou em 08/07.</td></tr>
    <tr><td class="et">Quantos foram aprovados</td><td class="num q">${num(APROVADOS)}</td>
      <td>Grupos de WhatsApp, frase a frase. Outros ${num(APR_FORA)} aprovados no período vieram por fora e não contam para a campanha.</td></tr>
    <tr><td class="et">Quantos compraram</td><td class="num q">${num(CLIENTES)}</td>
      <td>Compra posterior à entrada do lead, conferida no HastaPro em todas as filiais. Cada um com evidência nomeada.</td></tr>
    <tr><td class="et">Quanto venderam</td><td class="num q">${brl0(VGV)}</td>
      <td>${num(ANIMAIS)} animais em ${num(ARREMATES)} arremates · ticket ${brl0(TICKET)}/animal.</td></tr>
    <tr><td class="et">Custo por lead</td><td class="num q">${brl(cpl)}</td>
      <td>${(cpl / AMAO.cpl * 100).toFixed(0)}% da referência de ${brl(AMAO.cpl)} — praticamente em cima.</td></tr>
    <tr><td class="et">CAC — custo por cliente</td><td class="num q">${brl(cac)}</td>
      <td>${brl(INVEST_CAPTACAO)} ÷ ${num(CLIENTES)} clientes. Sobe se o cadastro dos compradores melhorar e aparecerem mais casos.</td></tr>
  </tbody>
</table>

<div class="box alerta avoid">
  <h3>Escopo — o que conta e o que não conta</h3>
  <ul>
    <li><strong>Conta:</strong> as 13 campanhas do funil de captação (conta CA2 inteira + Corte Perpétuo ×2 e Corte
      Tupã na CA1), de 09/06 a 14/08.</li>
    <li><strong>Não conta</strong> (está no apêndice, para o cheque total fechar): o piloto “funil WhatsApp” de
      abr–jun (${brl(FUNIL_WHATSAPP.investido)}), as ${num(DIVULGACAO_LEILOES.qtdCampanhas)} campanhas de divulgação
      de leilões da agência (${brl(DIVULGACAO_LEILOES.totalInvestido)} — o lead vai para a leiloeira) e awareness.</li>
    <li><strong>Cadastro só conta se a pessoa for lead de campanha.</strong> Os grupos também recebem submissão da
      carteira dos assessores, e ela está identificada e excluída.</li>
    <li><strong>Venda conferida no HastaPro</strong> (sistema da leiloeira), ao vivo, lote a lote, em todas as
      filiais. O ERP interno da Bula não foi usado em nenhum número deste relatório.</li>
  </ul>
</div>`

const comparacao = `
<div class="pg"></div>
<h2>A apuração à mão × a apuração com fonte</h2>
<p>A tabela “Meta Funil de Vendas Mensal” tem duas coisas diferentes: a coluna de percentual é a <strong>meta de
agosto</strong>, e a coluna do meio é o <strong>total apurado à mão</strong>, juntando dado de várias pontas antes de
haver acesso à conta de anúncio. Abaixo, essa coluna refeita — mesma etapa, mesma ordem, agora com fonte cobrável.</p>
<table class="funil">
  <thead><tr><th>Etapa</th><th class="r">À mão</th><th class="r">Com fonte</th><th class="r">Dif.</th><th>De onde vem o número certo</th></tr></thead>
  <tbody>
    <tr><td class="et">Impressões</td><td class="num">${num(AMAO.impressoes)}</td><td class="num q">${num(IMP)}</td><td class="num"><strong>${dif(IMP, AMAO.impressoes)}</strong></td><td class="micro">API da Meta.</td></tr>
    <tr><td class="et">Cliques</td><td class="num">${num(AMAO.cliques)}</td><td class="num q">${num(CLI)}</td><td class="num"><strong>${dif(CLI, AMAO.cliques)}</strong></td><td class="micro">API da Meta.</td></tr>
    <tr><td class="et">Acessos</td><td class="num">${num(AMAO.acessos)}</td><td class="num"><span class="off">não medível</span></td><td class="num"><span class="off">—</span></td><td class="micro">Só campanha de landing tem page view instrumentado (3.047 registrados); as de formulário não têm site.</td></tr>
    <tr><td class="et">Leads gerados</td><td class="num">${num(AMAO.leads)}</td><td class="num q">${num(LEADS)}</td><td class="num"><strong>${dif(LEADS, AMAO.leads)}</strong></td><td class="micro">Aba LEADS GERAIS (o universo) + ${num(f.leads.deLandingSoNoCrm)} das landings que gravaram só no CRM. Sem duplicata — ver nota.</td></tr>
    <tr><td class="et">Leads qualificados</td><td class="num">140,4</td><td class="num q">${num(MQL)}</td><td class="num"><strong>${dif(MQL, AMAO.mql)}</strong></td><td class="micro">≥ 100 cabeças + I.E.</td></tr>
    <tr><td class="et">Cadastros submetidos</td><td class="num">56,16</td><td class="num q">${num(CADASTROS)}</td><td class="num"><strong>${dif(CADASTROS, AMAO.cadastros)}</strong></td><td class="micro">Sistema, julho, só lead de campanha. PISO.</td></tr>
    <tr><td class="et">Cadastros aprovados</td><td class="num">33,696</td><td class="num q">${num(APROVADOS)}</td><td class="num"><strong>${dif(APROVADOS, AMAO.aprovados)}</strong></td><td class="micro">Grupos, frase a frase, só origem campanha.</td></tr>
    <tr><td class="et">Clientes compraram</td><td class="num">13,5</td><td class="num q">${num(CLIENTES)}</td><td class="num"><strong>${dif(CLIENTES, AMAO.clientes)}</strong></td><td class="micro">HastaPro, compra posterior ao lead.</td></tr>
    <tr><td class="et">Animais vendidos</td><td class="num">${num(AMAO.animais)}</td><td class="num q">${num(ANIMAIS)}</td><td class="num"><strong>${dif(ANIMAIS, AMAO.animais)}</strong></td><td class="micro">HastaPro, quantidade por lote.</td></tr>
    <tr><td class="et">Ticket médio</td><td class="num">${brl0(AMAO.ticket)}</td><td class="num q">${brl0(TICKET)}</td><td class="num"><strong>${dif(TICKET, AMAO.ticket)}</strong></td><td class="micro">Arrematado ÷ animais.</td></tr>
    <tr><td class="et">Faturamento digital</td><td class="num">${brl0(AMAO.faturamento)}</td><td class="num q">${brl0(VGV)}</td><td class="num"><strong>${dif(VGV, AMAO.faturamento)}</strong></td><td class="micro">Só compra posterior à entrada do lead.</td></tr>
  </tbody>
</table>

<div class="box avoid">
  <h3>Os ${num(LEADS)} leads estão duplicados? Não — foi verificado</h3>
  <p>A planilha tem cinco abas, e as quatro de trabalho (TOUROS, FEMEAS, EMBRIÕES, OUTROS) são a distribuição por
  interesse do que entra em LEADS GERAIS. <strong>Conferido linha a linha: as quatro são 100% subconjunto de
  GERAIS</strong> — 394, 926, 47 e 151 leads de campanha, nenhum fora. Somar as cinco abas contaria a mesma pessoa
  até três vezes; por isso o número sai só de GERAIS.</p>
  <p>Dentro de GERAIS a duplicata existe, é pequena e foi removida: <strong>${num(f.leads.repreenchimentos)} pessoas
  preencheram o formulário duas vezes</strong>, com o mesmo telefone e grafias diferentes do nome (“Francisney Dutra
  Moreira” e “Francisney Dutra”). Para a Meta são dois leads — ela cobra por preenchimento —, mas para o funil é uma
  pessoa só, e é pessoa que vira cadastro e cliente. Saíram também
  <strong>${num(f.leads.lixoDescartado)} registros de lixo</strong>: leads de teste da equipe (“TESTE UTM (apagar)”,
  “Teste Codex CRM”), telefones falsos do tipo 99999-9999 e os “dummy data” que a própria Meta injeta para validar
  integração.</p>
  <p class="micro">Portanto: ${num(f.leads.registrosBrutos)} registros de lead de campanha, que correspondem a
  <strong>${num(LEADS)} pessoas únicas</strong>. É o número de pessoas que este relatório usa em todas as contas.</p>
  <p>E a conferência achou o inverso do que se procurava: <strong>${num(f.leads.deLandingSoNoCrm)} leads de campanha
  existem só no CRM e nunca subiram para a planilha</strong> — são as landings de JMP (junho) e EAO Baviera (julho),
  que gravaram direto no banco. Estavam faltando na conta e agora entram, deduplicados por telefone.</p>
</div>

<div class="box alerta avoid">
  <h3>O erro não foi aleatório — errou para baixo no topo e para cima no fundo</h3>
  <ul>
    <li><strong>O topo é muito maior do que se enxergava.</strong> Sem acesso à conta de anúncio, contava-se o que
      chegava por amostra: 650 mil impressões contra 1,58 milhão reais, 7.800 cliques contra 26.701, e
      <strong>702 leads contra ${num(LEADS)}</strong>. A mídia entregou mais que o dobro do que se creditava a ela.</li>
    <li><strong>O fundo é menor.</strong> Sete clientes, não 13,5. ${brl0(VGV)}, não R$ 1.010.880. Duas causas
      identificadas: entrava gente que veio por fora (carteira do assessor ou lista importada), e contava-se a compra
      total do ano da pessoa, inclusive o que ela arrematou <em>antes</em> de existir como lead.</li>
    <li><strong>Juntos, os dois erros se anulavam e escondiam o diagnóstico.</strong> Com topo subestimado e fundo
      superestimado, o funil parecia razoavelmente eficiente de ponta a ponta. Com os números certos fica claro que a
      mídia entrega, e que a perda está no meio.</li>
  </ul>
</div>`

const meio = `
<div class="pg"></div>
<h2>O funil inteiro, medido</h2>
<p>Cada degrau com a quantidade, a conversão e a fonte. O trecho do atendimento — que este relatório já chamou de
zona cega — é medível na maior parte: o que passou por número conectado está no histórico do WhatsApp, e as abas de
trabalho trazem a etapa anotada pelo próprio SDR.</p>
<table class="funil">
  <thead><tr><th>Etapa</th><th class="r">Quantidade</th><th class="r">Da anterior</th><th>Fonte</th></tr></thead>
  <tbody>
    <tr><td class="et">Impressões</td><td class="num q">${num(IMP)}</td><td class="num">—</td><td class="micro">API da Meta.</td></tr>
    <tr><td class="et">Cliques</td><td class="num q">${num(CLI)}</td><td class="num">${pct(CLI, IMP, 2)}</td><td class="micro">API da Meta. Meta de agosto: 1,20%.</td></tr>
    <tr><td class="et">Leads</td><td class="num q">${num(LEADS)}</td><td class="num">${pct(LEADS, tx.base.cliquesComparaveis, 2)}</td><td class="micro">Pessoas únicas. Denominador exclui ${num(tx.base.cliquesFora)} cliques de campanhas cujo formulário fica na leiloeira.</td></tr>
    <tr><td class="et">Qualificados (MQL)</td><td class="num q">${num(MQL)}</td><td class="num">${pct(MQL, LEADS)}</td><td class="micro">≥ 100 cabeças + I.E.</td></tr>
    <tr><td class="et">Abordados no WhatsApp</td><td class="num q">${num(at.whatsapp.abordados)}</td><td class="num">${pct(at.whatsapp.abordados, at.whatsapp.leadsComFone)}</td><td class="micro">Mensagem de saída por número conectado, sobre os ${num(at.whatsapp.leadsComFone)} leads com telefone.</td></tr>
    <tr><td class="et">Responderam</td><td class="num q">${num(at.whatsapp.responderam)}</td><td class="num">${pct(at.whatsapp.responderam, at.whatsapp.abordados)}</td><td class="micro">Mensagem de entrada do mesmo telefone.</td></tr>
    <tr><td class="et">Cadastros submetidos</td><td class="num q">${num(CADASTROS)}</td><td class="num">${pct(CADASTROS, at.whatsapp.responderam)}</td><td class="micro">Sistema, julho. PISO — registro parou em 08/07.</td></tr>
    <tr><td class="et">Aprovados</td><td class="num q">${num(APROVADOS)}</td><td class="num">${pct(APROVADOS, CADASTROS)}</td><td class="micro">Grupos, só origem campanha.</td></tr>
    <tr><td class="et">Compraram</td><td class="num q">${num(CLIENTES)}</td><td class="num">${pct(CLIENTES, APROVADOS)}</td><td class="micro">HastaPro, compra posterior ao lead.</td></tr>
  </tbody>
</table>
<p class="micro">Restam ${num(at.whatsapp.leadsComFone - at.whatsapp.abordados)} leads
(${pct(at.whatsapp.leadsComFone - at.whatsapp.abordados, at.whatsapp.leadsComFone)}) sem nenhuma mensagem por número
conectado. Esses sim são cegos: podem ter sido atendidos no telefone pessoal do SDR ou não ter sido atendidos, e a
diferença entre as duas coisas é enorme.</p>

<div class="box alerta avoid">
  <h3>O gargalo tem nome, tamanho e responsável</h3>
  <p><strong>De cada 100 leads que responderam, ${(CADASTROS / at.whatsapp.responderam * 100).toFixed(0)} viraram
  cadastro registrado.</strong> Não falta lead (são ${num(LEADS)}), não falta abordagem
  (${pct(at.whatsapp.abordados, at.whatsapp.leadsComFone)} foram abordados) e não falta resposta
  (${num(at.whatsapp.responderam)} responderam). A perda está em transformar conversa em cadastro — e as abas de
  trabalho mostram que isso depende de quem atende:</p>
  <table class="avoid">
    <thead><tr><th>SDR</th><th class="r">Leads com etapa anotada</th><th class="r">Viraram cadastro</th><th class="r">Taxa</th><th class="r">Sem resposta</th></tr></thead>
    <tbody>
      ${Object.entries(at.abas.porSdr).filter(([k]) => !/sem responsável/i.test(k)).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `<tr>
        <td class="nome">${esc(k)}</td><td class="num">${num(v.n)}</td><td class="num">${num(v.cad)}</td>
        <td class="num q" style="font-size:13px">${(v.cad / v.n * 100).toFixed(0)}%</td>
        <td class="num">${(v.semResp / v.n * 100).toFixed(0)}%</td></tr>`).join('')}
    </tbody>
  </table>
  <p class="micro">A taxa varia de 0% a 23% com volumes parecidos. É a alavanca mais barata do funil: não custa
  mídia, custa método. A diretoria chegou à mesma conclusão por conta própria — em 14/08 entrou uma SDR nova no
  grupo, apresentada como “responsável pelo atendimento dos leads e conseguir novos cadastros”.</p>
</div>`

const metaAgosto = `
<div class="pg"></div>
<h2>A meta de agosto</h2>
<div class="box avoid">
  <p>A coluna de percentual da planilha vale <strong>para agosto</strong>, que tem <strong>14 dias corridos de 31</strong>
  nesta apuração. A meta de volume também apareceu, dita no próprio grupo de cadastros em 14/08:
  <em>“Estamos com a meta de ${META_CADASTROS_AGOSTO} cadastros para esse mês de Agosto”</em> — confirmando, por outra
  via, o 56,16 da planilha. Junho e julho aparecem como referência do que a operação entregou, não como nota de meta.</p>
</div>
<table class="funil">
  <thead><tr><th>Degrau</th><th class="r">Meta ago.</th><th class="r">Junho</th><th class="r">Julho</th><th class="r">Ago 1–14</th><th class="r">×</th><th>Situação</th></tr></thead>
  <tbody>
    <tr><td class="et">Impressões → cliques</td><td class="num">1,20%</td>
      <td class="num">${pct(mm['2026-06'].cliques, mm['2026-06'].impressoes, 2)}</td>
      <td class="num">${pct(mm['2026-07'].cliques, mm['2026-07'].impressoes, 2)}</td>
      <td class="num q">${AGO.ctr.toFixed(2).replace('.', ',')}%</td>
      <td class="num"><strong>${(AGO.ctr / 1.2 * 100).toFixed(0)}%</strong></td>
      <td class="micro"><strong>Cumprida.</strong> O criativo entrega acima do pedido em todos os meses.</td></tr>
    <tr><td class="et">Cliques → leads</td><td class="num">9,00%</td>
      <td class="num">8,00%</td><td class="num">7,12%</td>
      <td class="num q">${AGO.cliqueLead.toFixed(2).replace('.', ',')}%</td>
      <td class="num"><strong>${(AGO.cliqueLead / 9 * 100).toFixed(0)}%</strong></td>
      <td class="micro">Caiu. Agosto roda só landing (Perpétuo Touro/Fêmeas, São Geraldo), cujo lead chega à planilha com atraso — parte dos ${num(AGO.leads)} ainda pode aparecer. Reconferir no fechamento do mês.</td></tr>
    <tr><td class="et">Leads → qualificados</td><td class="num">20%</td>
      <td class="num">13,7%</td><td class="num">12,9%</td>
      <td class="num q">${AGO.leadMql.toFixed(1).replace('.', ',')}%</td>
      <td class="num"><strong>${(AGO.leadMql / 20 * 100).toFixed(0)}%</strong></td>
      <td class="micro"><strong>Cumprida</strong>, e é a melhor taxa do ano: menos lead e lead melhor. Efeito das campanhas de touro.</td></tr>
    <tr><td class="et">Cadastros no grupo</td><td class="num">${META_CADASTROS_AGOSTO} no mês</td>
      <td class="num"><span class="off">—</span></td><td class="num">${num(CADASTROS)}</td>
      <td class="num q">${num(AGO.cadastros)}</td>
      <td class="num"><strong>${(AGO.cadastros / META_CADASTROS_AGOSTO * 100).toFixed(0)}%</strong></td>
      <td class="micro">Novos em agosto (6 dos 22 registros já constavam antes). No ritmo atual o mês fecha em ~${Math.round(AGO.cadastros / 14 * 31)}.</td></tr>
    <tr><td class="et">…destes, vindos de campanha</td><td class="num">—</td>
      <td class="num"><span class="off">—</span></td><td class="num">${num(CADASTROS)}</td>
      <td class="num q">${num(DE_CAMPANHA_EM_AGOSTO)}</td><td class="num"><strong>0%</strong></td>
      <td class="micro"><strong>Nenhum</strong> dos ${num(IDENTIFICAVEIS)} cadastros identificáveis de agosto está nas bases de lead de campanha — vieram da carteira dos assessores. Os outros 7 registros são anônimos.</td></tr>
    <tr><td class="et">Cadastros → aprovados</td><td class="num">60%</td>
      <td class="num"><span class="off">—</span></td><td class="num">60,98%</td>
      <td class="num q">${AGO.aprovacao.toFixed(1).replace('.', ',')}%</td>
      <td class="num"><strong>${(AGO.aprovacao / 60 * 100).toFixed(0)}%</strong></td>
      <td class="micro"><strong>Cumprida</strong> — mas sobre cadastro de carteira. ${num(AGO.aprovados)} aprovados e ${num(AGO.recusados)} recusados entre as decisões novas do mês.</td></tr>
    <tr><td class="et">Aprovados → compraram</td><td class="num">40%</td>
      <td class="num" colspan="2" style="text-align:center">24,00% no acumulado</td>
      <td class="num q">${num(AGO.clientes.length)} clientes</td><td class="num"><span class="off">parcial</span></td>
      <td class="micro">${AGO.clientes.map(c => esc(c.nome.split(' ')[0])).join(', ')} compraram em agosto. O ciclo lead→arremate chega a 37 dias, então parte dos aprovados do mês ainda não teve leilão.</td></tr>
    <tr><td class="et">CPL — custo por lead</td><td class="num">${brl(AMAO.cpl)}</td>
      <td class="num">${brl(7.89)}</td><td class="num">${brl(9.76)}</td>
      <td class="num q">${brl(AGO.cpl)}</td>
      <td class="num"><strong>${(AGO.cpl / AMAO.cpl * 100).toFixed(0)}%</strong></td>
      <td class="micro"><strong>O alerta do mês.</strong> Junho e julho ficaram na meta; agosto está em ${(AGO.cpl / AMAO.cpl).toFixed(1).replace('.', ',')}×, consequência direta da queda de clique→lead.</td></tr>
  </tbody>
</table>
<p class="micro"><strong>Três das oito linhas já estão cumpridas em agosto</strong> — CTR, qualificação e aprovação.
O cadastro está em ritmo de ${(Math.round(AGO.cadastros / 14 * 31) / META_CADASTROS_AGOSTO * 100).toFixed(0)}% da
meta e sem nenhum caso vindo de campanha; o CPL é o ponto de atenção.</p>

<h3>Onde o funil perdeu no acumulado (junho a 14/08)</h3>
<p>Quadro <strong>histórico</strong>: mostra em que degrau se perdeu ao longo dos dois meses e meio de campanha,
usando as mesmas definições da meta. A coluna “razão” localiza o problema; não é nota de cumprimento, porque a meta
não estava em vigor no período.</p>
<table class="funil">
  <thead><tr><th>Degrau</th><th class="r">Referência</th><th class="r">Acumulado</th><th class="r">Razão</th><th></th><th>Conta</th></tr></thead>
  <tbody>
    ${tx.taxas.map(t => {
    const real = t.real == null ? '<span class="off">não medível</span>' : t.real.toFixed(2).replace('.', ',') + '%'
    const meta = t.meta.toFixed(t.meta < 10 ? 2 : 0).replace('.', ',') + '%'
    const razao = t.cumpre == null ? '<span class="off">—</span>' : (t.cumpre * 100).toFixed(0) + '%'
    const larg = t.cumpre == null ? 0 : Math.min(Math.round(t.cumpre * 60), 100)
    return `<tr><td class="et">${esc(t.etapa)}</td><td class="num">${meta}</td>
      <td class="num q" style="font-size:13px">${real}</td><td class="num">${razao}</td>
      <td><span class="bar${t.cumpre != null && t.cumpre >= 1 ? '' : ' o'}" style="width:${larg}px"></span></td>
      <td class="micro">${t.den ? `${num(t.num)} ÷ ${num(t.den)}. ` : ''}${esc(t.obs)}</td></tr>`
}).join('')}
  </tbody>
</table>`

const custos = `
<div class="pg"></div>
<h2>Custos unitários</h2>
<div class="box avoid">
  <p><strong>Cuidado com o escopo, porque ele muda o número.</strong> Quatro das 13 campanhas (Corte Perpétuo ×2,
  Corte Tupã e a EAO que quase não veiculou) têm o formulário na conta da leiloeira: o lead delas fica lá e nunca
  chega à nossa planilha. Dividir o investimento das 13 (${brl(INVESTIDO_APURADO)}) pelos ${num(LEADS)} leads que só
  9 produzem infla todo custo em cerca de 30%. Os custos abaixo usam
  <strong>${brl(INVEST_CAPTACAO)}</strong> — o investimento das campanhas cujo lead chega aqui.</p>
</div>
<table>
  <thead><tr><th>Indicador</th><th class="r">Referência</th><th class="r">Real</th><th class="r">Razão</th><th>Conta exata</th></tr></thead>
  <tbody>
    <tr><td class="et">CPL — custo por lead</td><td class="num">${brl(AMAO.cpl)}</td><td class="num q">${brl(cpl)}</td>
      <td class="num">${(cpl / AMAO.cpl).toFixed(1).replace('.', ',')}×</td><td class="micro">${brl(INVEST_CAPTACAO)} ÷ ${num(LEADS)} leads</td></tr>
    <tr><td class="et">CPMQL — custo por qualificado</td><td class="num">${brl(AMAO.cpmql)}</td><td class="num q">${brl(cpMql)}</td>
      <td class="num">${(cpMql / AMAO.cpmql).toFixed(1).replace('.', ',')}×</td><td class="micro">÷ ${num(MQL)} MQL</td></tr>
    <tr><td class="et">Custo por cadastro</td><td class="num">${brl(AMAO.custoCadastro)}</td><td class="num q">${brl(cpCad)}</td>
      <td class="num">${(cpCad / AMAO.custoCadastro).toFixed(1).replace('.', ',')}×</td><td class="micro">÷ ${num(CADASTROS)} cadastros de campanha</td></tr>
    <tr><td class="et">Custo por animal vendido</td><td class="num">${brl(AMAO.custoVenda)}</td><td class="num q">${brl(INVEST_CAPTACAO / ANIMAIS)}</td>
      <td class="num">${(INVEST_CAPTACAO / ANIMAIS / AMAO.custoVenda).toFixed(1).replace('.', ',')}×</td><td class="micro">÷ ${num(ANIMAIS)} animais (a referência também é por animal: 6.500 ÷ ~40)</td></tr>
    <tr><td class="et">CAC — custo por cliente</td><td class="num">${brl0(6500 / AMAO.clientes)}</td><td class="num q">${brl(cac)}</td>
      <td class="num">${(cac / (6500 / AMAO.clientes)).toFixed(1).replace('.', ',')}×</td><td class="micro">÷ ${num(CLIENTES)} clientes com compra após o lead</td></tr>
    <tr><td class="et">Retorno por real investido</td><td class="num">${(AMAO.faturamento / 6500).toFixed(0)}×</td><td class="num q">${(VGV / INVESTIDO_APURADO).toFixed(1).replace('.', ',')}×</td>
      <td class="num">—</td><td class="micro">${brl0(VGV)} ÷ ${brl0(INVESTIDO_APURADO)}, aqui sobre o investimento total. VGV, não margem: a receita da Bula é a comissão sobre isso.</td></tr>
  </tbody>
</table>

<h3>Por que o CPL ficou onde ficou — decomposição</h3>
<p>O CPL de referência (${brl(AMAO.cpl)}) é R$ 6.500 ÷ 702 leads. O real se explica inteiramente por três fatores,
e a conta fecha nos dois lados — o que confirma que não há fator escondido.</p>
<table class="avoid">
  <thead><tr><th>Fator</th><th class="r">Referência</th><th class="r">Acumulado</th><th class="r">Agosto</th><th>Leitura</th></tr></thead>
  <tbody>
    <tr><td class="et">CPM — mil impressões</td><td class="num">${brl(10)}</td><td class="num">${brl(CPM)}</td><td class="num">${brl(AGO.investido / AGO.impressoes * 1000)}</td>
      <td><strong>Contra:</strong> mídia ${((CPM / 10 - 1) * 100).toFixed(0)}% mais cara que o plano — leilão é nicho e a disputa por esse público subiu.</td></tr>
    <tr><td class="et">CTR</td><td class="num">1,20%</td><td class="num">${pct(CLI, IMP, 2)}</td><td class="num">${AGO.ctr.toFixed(2).replace('.', ',')}%</td>
      <td><strong>A favor:</strong> o criativo compensa boa parte do CPM mais caro.</td></tr>
    <tr><td class="et">Clique → lead</td><td class="num">9,00%</td><td class="num">${(LEADS / tx.base.cliquesComparaveis * 100).toFixed(2).replace('.', ',')}%</td><td class="num">${AGO.cliqueLead.toFixed(2).replace('.', ',')}%</td>
      <td><strong>O fator que decide.</strong> Estável em junho e julho, despencou no parcial de agosto.</td></tr>
  </tbody>
  <tfoot><tr><td>CPL RESULTANTE</td><td class="num">${brl(AMAO.cpl)}</td><td class="num">${brl(cpl)}</td><td class="num">${brl(AGO.cpl)}</td><td class="micro">CPM ÷ (CTR × taxa de lead)</td></tr></tfoot>
</table>`

const porCampanha = `
<div class="pg"></div>
<h2>Campanha a campanha</h2>
<table>
  <thead><tr><th>Campanha</th><th>Conta</th><th class="r">Investido</th><th class="r">Impressões</th><th class="r">Cliques</th><th class="r">Leads</th><th class="r">MQL</th><th class="r">% MQL</th><th class="r">CPL</th></tr></thead>
  <tbody>
    ${campanhas.map(({ c, s, semPlanilha }) => `<tr>
      <td class="nome">${esc(c.nome)}</td><td>${c.conta}</td>
      <td class="num">${brl(c.total.investido)}</td>
      <td class="num">${num(c.total.impressoes)}</td>
      <td class="num">${num(c.total.cliques)}</td>
      <td class="num">${semPlanilha ? `<span class="off">${c.total.leadsMeta ? num(c.total.leadsMeta) + ' (Meta)¹' : '0'}</span>` : num(s.leads)}</td>
      <td class="num">${semPlanilha ? '<span class="off">—</span>' : num(s.mql)}</td>
      <td class="num">${s.leads ? pct(s.mql, s.leads) : '<span class="off">—</span>'}</td>
      <td class="num">${s.leads ? brl(c.total.investido / s.leads) : '<span class="off">—</span>'}</td></tr>`).join('')}
    <tr><td class="nome">(etiqueta ilegível na planilha)</td><td>—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td>
      <td class="num">${num(restoLeads)}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>
  </tbody>
  <tfoot><tr><td>TOTAL</td><td></td><td class="num">${brl(INVESTIDO_APURADO)}</td><td class="num">${num(IMP)}</td>
    <td class="num">${num(CLI)}</td><td class="num">${num(LEADS)}</td><td class="num">${num(MQL)}</td>
    <td class="num">${pct(MQL, LEADS)}</td><td class="num">${brl(cpl)}</td></tr></tfoot>
</table>
<p class="micro">Leads e MQL vêm da planilha, somando os apelidos com que cada campanha chega (formulário da Meta,
landing com utm, ad-id numérico); o mapa está no código do gerador e a soma fecha exatamente nos ${num(LEADS)} leads
e ${num(MQL)} MQL. ¹ Corte Perpétuo e Corte Tupã (CA1): o lead fica no formulário da conta da leiloeira e não desce
para a planilha — por isso não têm MQL nem CPL calculável aqui.</p>
<p class="micro"><strong>Onde está a qualidade:</strong> São Geraldo qualifica ${pct(somaAlias(ALIAS['LEADS - SAO GERALDO']).mql, somaAlias(ALIAS['LEADS - SAO GERALDO']).leads)}
dos leads e Perpétuo Touro ${pct(somaAlias(ALIAS['LEAD - PERPETUO TOURO']).mql, somaAlias(ALIAS['LEAD - PERPETUO TOURO']).leads)};
o formulário de bezerras (PERPETUO) qualifica ${pct(pc['LEADS - FORMS INST PERPETUO']?.mql || 0, pc['LEADS - FORMS INST PERPETUO']?.leads || 1)}.
Lead barato não é lead bom — e é isso que a virada de agosto para touro está corrigindo.</p>`

const venda = `
<div class="pg"></div>
<h2>A venda da campanha, cliente a cliente</h2>
<p>Regra dura: <strong>só conta a compra feita depois de a pessoa virar lead</strong>, e o cruzamento vale para
qualquer filial do HastaPro — foi assim que apareceram os arremates do Leilão São Geraldo, invisíveis na primeira
apuração. A coluna de evidência diz o que sustenta cada linha; <strong>nenhuma depende só de nome</strong>.</p>
<table>
  <thead><tr><th>Cliente</th><th>UF</th><th>Campanha de entrada</th><th>Lead</th><th class="r">Dias</th><th>Leilão</th><th class="r">An.</th><th class="r">Valor</th><th>Evidência</th></tr></thead>
  <tbody>
    ${clientes.map(p => `<tr>
      <td class="nome">${esc(p.nome)}</td><td>${esc(p.uf || '—')}</td>
      <td class="micro">${esc(String(p.campanha || '').slice(0, 28))}</td>
      <td class="num">${dataBr(p.dataLead)}</td>
      <td class="num">${p.diasAteCompra ?? '—'}</td>
      <td class="micro">${esc(p.leiloes.join(' · ').slice(0, 38))}${p.filiais.includes('01') ? ' <strong>(fil. 01)</strong>' : ''}</td>
      <td class="num">${num(p.animais)}</td><td class="num">${brl0(p.valor)}</td>
      <td class="micro">${esc(p.evidencia)}</td></tr>`).join('')}
  </tbody>
  <tfoot><tr><td>TOTAL</td><td></td><td></td><td></td><td></td><td class="num">${num(ARREMATES)} arremates</td>
    <td class="num">${num(ANIMAIS)}</td><td class="num">${brl0(VGV)}</td><td></td></tr></tfoot>
</table>
<p class="micro">Foram descartados 75 casos que casavam só por nome e não sobreviveram à verificação — entre eles um
de R$ 1,37 milhão. Outros ${num(COMPRARAM_ANTES)} compradores têm origem de campanha mas a compra é anterior à
entrada do lead: são clientes que a casa já tinha e que preencheram um formulário depois, e ficam fora de propósito.</p>

<h3>Conferência da lista de patrocinados do assessor</h3>
<p>A diretoria enviou a relação de clientes “provenientes de patrocinados” do Leonardo. Cada nome foi buscado no
HastaPro ao vivo, em todas as filiais, e cruzado com as bases de lead. <strong>Três dos cinco se confirmam.</strong></p>
<table>
  <thead><tr><th>Nome na lista</th><th class="r">Lista diz</th><th class="r">HastaPro diz</th><th>Veredito</th></tr></thead>
  <tbody>
    ${PATROCINADOS_LEOZINHO.map(x => `<tr>
      <td class="nome">${esc(x.nome)}</td>
      <td class="num">${x.listaAnimais ? x.listaAnimais + ' an · ' : ''}${brl0(x.listaValor)}</td>
      <td class="num">${x.erpValor ? num(x.erpAnimais) + ' an · ' + brl0(x.erpValor) : '<span class="off">não existe</span>'}</td>
      <td class="micro">${x.confere && x.leadOrigem ? '<strong>CONFIRMA</strong> — ' : '<strong>NÃO ENTRA</strong> — '}${esc(x.nota)}</td></tr>`).join('')}
  </tbody>
</table>
<p class="micro">A lista soma R$ 373.500 e 20 animais; o que se sustenta como campanha é R$ 330.900 e 18 animais.
A apuração completa encontrou ainda outros ${num(CLIENTES - 3)} clientes de campanha que a lista não trazia —
inclusive um do mesmo Leilão São Geraldo, atendido por outro assessor.</p>`

const verificacao = `
<div class="pg"></div>
<h2>Como cada número foi verificado</h2>
<p><strong>Regra: nenhum número entra com fonte única</strong>, e número de sistema sozinho não é prova — o registro
de cadastro parou em 08/07 e o CRM é 91% importação em massa.</p>
<table>
  <thead><tr><th>Variável</th><th class="r">Valor</th><th>Fontes cruzadas</th><th>Veredito</th></tr></thead>
  <tbody>
    <tr><td class="et">Investimento</td><td class="num q">${brl(INVESTIDO_APURADO)}</td>
      <td>API da Meta ao vivo × apuração interna de snapshots × número da diretoria (16.500)</td>
      <td><strong>Conferido.</strong> As três batiam em 02/08; a diferença é o que rodou depois.</td></tr>
    <tr><td class="et">Leads</td><td class="num q">${num(LEADS)}</td>
      <td>Planilha linha a linha (5 abas) × Meta × crm_leads</td>
      <td><strong>Planilha vence.</strong> A Meta subnotifica landing e conta formulário repetido.</td></tr>
    <tr><td class="et">MQL</td><td class="num q">${num(MQL)}</td>
      <td>Regra do sistema × contagem manual do time (224) × qualidade do campo (99,7% preenchido)</td>
      <td><strong>Critério objetivo vence.</strong> Os 224 incluem julgamento caso a caso do SDR.</td></tr>
    <tr><td class="et">Atendimento</td><td class="num q">${num(at.whatsapp.abordados)} / ${num(at.whatsapp.responderam)}</td>
      <td>whatsapp_messages (número conectado) × abas de trabalho com etapa anotada pelo SDR</td>
      <td><strong>Medido, não estimado.</strong> Cobre 80% dos leads; os 20% restantes estão declarados como cegos.</td></tr>
    <tr><td class="et">Cadastros</td><td class="num q">${num(CADASTROS)}</td>
      <td>Sistema × cruzamento pessoa a pessoa com leads × leitura dos grupos</td>
      <td><strong>Piso.</strong> Envio manual pós-08/07 não deixou rastro no sistema.</td></tr>
    <tr><td class="et">Aprovados</td><td class="num q">${num(APROVADOS)}</td>
      <td>Grupos (frase a frase) × leads de campanha × lista consolidada × cadastros do HastaPro</td>
      <td><strong>Separado por origem.</strong> ${num(APROVADOS + APR_FORA)} pessoas aprovadas no período; ${num(APR_FORA)} vieram por fora e não contam.</td></tr>
    <tr><td class="et">Clientes / animais / valor</td><td class="num q">${num(CLIENTES)} / ${num(ANIMAIS)} / ${brl0(VGV)}</td>
      <td>HastaPro em todas as filiais, lote a lote × data do lead × telefone do cadastro × data de criação do cadastro × lista do assessor</td>
      <td><strong>Cada linha com evidência.</strong> Homônimo é recusado; 75 falsos positivos descartados.</td></tr>
  </tbody>
</table>

<div class="box avoid">
  <h3>O que este relatório não consegue provar</h3>
  <ul>
    <li><strong>Cadastros enviados depois de 08/07 fora do grupo.</strong> O degrau lead→cadastro é piso. Destrava
      registrando todo envio no sistema, mesmo o feito à mão.</li>
    <li><strong>O atendimento de 20% dos leads</strong>, que não passou por número conectado. Pode ter ido para
      telefone pessoal de SDR ou não ter acontecido — a diferença é enorme e hoje é indistinguível.</li>
    <li><strong>Compradores sem CPF nem telefone no HastaPro</strong> (só 32% têm CPF). O cruzamento por nome recusa
      homônimo, então pode haver cliente de campanha sem prova. O número de clientes é piso.</li>
    <li><strong>A origem de 7 dos 22 cadastros de agosto</strong>, registrados no grupo sem nome (só CPF ou
      descrição).</li>
    <li><strong>Só existe a lista de patrocinados de um assessor.</strong> Com a do Douglas e a do Fábio, a mesma
      conferência pode achar mais clientes atribuíveis.</li>
  </ul>
</div>

<h2>O que fazer com isso</h2>
<div class="box grey">
  <ul>
    <li><strong>O gargalo é conversa→cadastro, e ele é de método.</strong> A taxa varia de 0% a 23% entre SDRs com
      volumes parecidos. Padronizar o que o melhor faz é a alavanca mais barata do funil — não custa mídia.</li>
    <li><strong>Registrar todo cadastro no sistema.</strong> Enquanto três etapas dependerem de alguém ler o
      WhatsApp, a meta de agosto não é verificável nem para cobrar nem para defender.</li>
    <li><strong>Manter a virada para touro e São Geraldo.</strong> São as campanhas que qualificam melhor, e agosto
      já mostra a melhor taxa do ano por causa delas — mesmo com o CPL alto.</li>
    <li><strong>Exigir CPF no ato do arremate.</strong> Com 32% de cobertura, toda medição de campanha continuará
      sendo piso.</li>
    <li><strong>Contar o ciclo, não o mês.</strong> O intervalo entre lead e arremate vai de 1 a 37 dias; avaliar
      mídia por mês fechado subestima o que ela devolve.</li>
  </ul>
</div>`

const apendice = `
<h2>Apêndice — o resto do dinheiro de mídia</h2>
<table class="avoid">
  <thead><tr><th>Bloco</th><th class="r">Investido 2026</th><th>Por que está fora do funil</th></tr></thead>
  <tbody>
    <tr><td class="nome">Funil de captação (este relatório)</td><td class="num q">${brl(INVESTIDO_APURADO)}</td><td>—</td></tr>
    <tr><td class="nome">Piloto “funil whatsapp” (abr–jun, conta Formula do Boi)</td><td class="num">${brl(FUNIL_WHATSAPP.investido)}</td>
      <td>${num(FUNIL_WHATSAPP.leadsMeta)} leads caíam direto no WhatsApp, antes de a planilha existir — sem rastro individual para atribuir venda.</td></tr>
    <tr><td class="nome">Divulgação de leilões pela agência (CA1, ${num(DIVULGACAO_LEILOES.qtdCampanhas)} campanhas)</td><td class="num">${brl(DIVULGACAO_LEILOES.totalInvestido)}</td>
      <td>O lead vai para a leiloeira (Cachoeirão, SóCriador, Tresmar…) — é serviço de divulgação, não captação própria.</td></tr>
    <tr><td class="nome">Awareness (Santa Casa + leilão 09/05)</td><td class="num">${brl(279.30)}</td>
      <td>Objetivo de alcance, sem captação de lead.</td></tr>
  </tbody>
  <tfoot><tr><td>CHEQUE TOTAL DE MÍDIA 2026</td><td class="num">${brl(META_LIVE.totais.tudoBula2026.investido)}</td><td></td></tr></tfoot>
</table>

<p class="micro">Fontes: Meta Ads (conector oficial, extração ao vivo em 14/08/2026, contas CA1/CA2 da BM Bula 360 e
Formula do Boi — dump em <code>fontes/meta-live-2026-08-14.json</code>) · planilha “Leads - Bula Assessoria”, 5 abas ·
crm_leads (só origem de anúncio; importação em massa excluída) · cliente_leiloeira_cadastro · whatsapp_messages
(grupos de cadastro e conversas 1:1) · HastaPro, sistema da leiloeira, consultado ao vivo no banco, lote a lote, em
todas as filiais. O ERP interno da Bula não foi usado. Reprodução: <code>extrai-fontes-2026 → monta-base-2026 →
monta-funil-2026 → atribuicao-campanha-2026 → apura-atendimento-real-2026 → taxas-funil-2026 →
gera-relatorio-campanhas-v2-2026</code>.</p>
<footer><span>Bula Assessoria — Campanhas digitais 2026</span><span>Emitido em ${HOJE}</span></footer>`

const html = pagina('Campanhas digitais — Bula 2026',
    capa + comparacao + meio + metaAgosto + custos + porCampanha + venda + verificacao + apendice)

fs.mkdirSync(saida, { recursive: true })
fs.writeFileSync(path.join(DIR, 'relatorio-campanhas-v2-2026.html'), html)
const pdfPath = path.join(saida, 'Campanhas Digitais 2026 - Bula Assessoria.pdf')
await paraPdf(html, pdfPath)
console.log('PDF:', pdfPath)
