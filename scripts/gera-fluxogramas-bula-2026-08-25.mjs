// Fluxogramas dos processos de trabalho da Bula Assessoria, como eles realmente
// acontecem no WhatsApp. Reconstruídos a partir dos 38 grupos internos da sessão
// `joao-automation` (VPS Baileys), das mensagens ao vivo e da Central Operacional.
// Uso: node scripts/gera-fluxogramas-bula-2026-08-25.mjs
import { join } from 'node:path'
import { homedir } from 'node:os'
import { chromium } from 'playwright'

const OUT = join(homedir(), 'Desktop', 'Organograma e Fluxos - Bula Assessoria (25-08-2026)', '02 - Fluxogramas de Trabalho - Bula Assessoria.pdf')

// step: [ator, ação, canal/sistema, tipo?]  tipo: '' | 'dec' (decisão) | 'auto' (automação) | 'fim'
const FLUXOS = [
  {
    n: 'F1', titulo: 'Captação e qualificação do comprador',
    gatilho: 'Campanha no ar / lead novo', cadencia: 'Contínuo, verba diária',
    grupos: 'Marketing Bula Assessoria · Notificações, Automações e fluxo CRM',
    passos: [
      ['Marcelo', 'Define a campanha e produz o criativo (playbook de touros e de fêmeas)', 'Drive + grupo Marketing'],
      ['João Gabriel', 'Sobe a campanha no gerenciador da Meta e pede a verba do dia', 'Meta Ads'],
      ['João Eduardo', 'Publica/ajusta a landing e paga a verba', 'femeas.bulaassessoria.com · touros'],
      ['Sistema', 'Lead cai na planilha e entra no CRM em ENTRADA', 'CRM · funil por campanha', 'auto'],
      ['Agente de IA', 'Primeira resposta, qualifica (perfil, nº de cabeças, IE) e avisa o dono do lead', 'WhatsApp — modo handoff', 'auto'],
      ['SDR (João Antônio, Luana, Pedro)', 'Assume a conversa, confirma interesse e leilão-alvo', 'WhatsApp 1:1'],
      ['Sistema', 'Distribui por zona: Norte+MA → Douglas · NE(exc.MA)+SE → Fábio · CO+Sul → Leonardo', 'Regra de zona', 'auto'],
      ['Assessor', 'Assume o comprador e leva para a habilitação (F2)', '', 'fim'],
    ],
    obs: 'O grupo de Notificações recebe o resumo diário às 22h30 (leads novos, chamados, respostas, opt-out). Em 30/07 o próprio time registrou o diagnóstico: “lead nenhum respondeu” em 161 chamados — a taxa de resposta do disparo frio é o gargalo declarado, não a geração de lead.',
  },
  {
    n: 'F2', titulo: 'Habilitação do comprador (cadastro e crédito)',
    gatilho: 'Comprador quer dar lance em um leilão', cadencia: 'Todo dia, mais forte na véspera do leilão',
    grupos: 'Cadastros Bula Remates · Cadastros Bula e Programa',
    passos: [
      ['Assessor / SDR', 'Manda CPF-CNPJ, nome, fazenda e inscrição estadual no grupo da leiloeira', 'Grupo de cadastros'],
      ['Guilherme Galassi / Matheus Eberts', 'Consulta score, IE ativa, restrições, protestos e área do imóvel', 'Consulta cadastral'],
      ['Analista', 'Emite o veredito com limite: “APROVADO — 2 lotes” ou “RECUSADO — restrição”', 'Grupo', 'dec'],
      ['Sistema', 'Lê a decisão no grupo e registra no CRM (quando identifica o cadastro)', 'Parser #CAD', 'auto'],
      ['Marcelo', 'Direciona o cadastro aprovado a um assessor nominalmente', 'Grupo'],
      ['Assessor', 'Comprador habilitado, pronto para o pregão (F4)', '', 'fim'],
    ],
    obs: 'Nos leilões do parceiro Programa Leilões, quem aprova é a equipe da leiloeira (Sendy, Márcia, Juliane) — e ela também cobra documento faltante (matrícula, inventário, NIRF). Caso recorrente e sem regra escrita: comprador que usa IE de terceiro — hoje resolvido caso a caso, com procuração ou comodato.',
  },
  {
    n: 'F3', titulo: 'Preparação do leilão — material, avaliação e divulgação',
    gatilho: 'Leilão entra na agenda', cadencia: 'Semanal; diária na Expogenética',
    grupos: 'Lances &lt;Leiloeira&gt; · Bula Assessoria l Assessores · GIFs · Marketing',
    passos: [
      ['Leiloeira / promotor', 'Cria o grupo do evento e envia catálogo, ordem de entrada, cards e link da transmissão', 'Grupo do leilão'],
      ['Leonardo', 'Avalia os lotes e devolve a classificação A++ / A+ / A', 'Grupo dos assessores'],
      ['Marcelo', 'Escolhe o que vira peça e pede os GIFs dos A++', 'Grupo dos assessores'],
      ['João Eduardo', 'Gera os GIFs de lotes com a legenda no padrão da casa e dispara no grupo', '/sistema/gif-lotes → WhatsApp', 'auto'],
      ['Renato Raven', 'Faz a arte da agenda da semana e os cards do evento', 'Grupo Marketing'],
      ['Douglas / Marcelo', 'Conferem card por card antes de publicar', 'Grupo Marketing', 'dec'],
      ['Marcelo', 'Publica a agenda no site e no grupo', 'bulaassessoria.com/agenda', 'fim'],
    ],
    obs: 'A avaliação técnica do Leonardo é o que abastece o marketing — sem ela, não há escolha de lote nem GIF. Quando o material da leiloeira atrasa (“temos alguma coisa da Guadalupe? material?”), o ciclo inteiro trava: é o ponto de dependência externa mais frequente nos grupos.',
  },
  {
    n: 'F4', titulo: 'Pregão ao vivo e registro da venda',
    gatilho: 'Leilão começa', cadencia: '2 a 4 leilões por semana; 12 na Expogenética',
    grupos: 'Lances Bula Assessoria · Lances &lt;Leiloeira&gt;',
    passos: [
      ['Assessor', 'Está com o comprador (presencial ou por telefone) e acompanha a ordem de entrada', 'Pista / WhatsApp'],
      ['Pisteiro da leiloeira', 'Anuncia o lote e o valor corrente no grupo', 'Grupo de lances'],
      ['Assessor', 'Lança pelo comprador e negocia o teto (“vai até 600”, “liberou”)', 'Grupo de lances'],
      ['Assessor', 'Fechou: publica o registro no padrão — “Levamos lote X — valor — 1F/1M — foi com &lt;assessor&gt; da Bula Assessoria — &lt;comprador&gt; — &lt;fazenda/cidade&gt;”', 'Grupo de lances', 'dec'],
      ['Sistema', 'Lê a mensagem, identifica lote, valor, assessor e comprador e cria o fechamento', 'Parser de lances → ERP', 'auto'],
      ['Marcelo', 'Fecha o placar do evento: faturamento do leilão × venda da Bula × % de cobertura', 'Grupo dos assessores', 'fim'],
    ],
    obs: 'O padrão de texto é o que sustenta a apuração — “Levamos…” é o gatilho do sistema. Quando o direcionamento é de parceiro, a própria mensagem declara (“com direcionamento técnico do dr. Gustavo Rusa”), e é isso, não quem estava na pista, que define a comissão.',
  },
  {
    n: 'F5', titulo: 'Fechamento do leilão e apuração de comissão',
    gatilho: 'Leilão encerrado', cadencia: 'Por evento; consolidação mensal',
    grupos: 'Financeiro Bula Assessoria',
    passos: [
      ['Matheus Eberts', 'Cadastra o leilão e lança as vendas no sistema da leiloeira', 'HastaPro'],
      ['Marcelo', 'Pede o fechamento e o faturamento por leilão e por assessor', 'Grupo Financeiro'],
      ['Matheus Eberts', 'Devolve vendas, faturamento e provisiona as contas a receber', 'HastaPro → link'],
      ['João Eduardo', 'Concilia com o ERP, aplica o acordo da leiloeira e apura a comissão de cada assessor', 'ERP'],
      ['Marcelo / João Eduardo', 'Confere lote a lote com a planilha do assessor antes de pagar', 'Planilha × ERP', 'dec'],
      ['Financeiro', 'Comissão vai para pagamento no dia 25 do mês seguinte', 'Contas a pagar', 'fim'],
    ],
    obs: 'Duas fontes convivem: o HastaPro (leiloeira) e o ERP próprio. O percentual depende do vínculo — 2% assessor de folha, 1% equipe Bula Remates, 5% parceiro Rusa, 2% Bulinha mesmo quando o PDF da leiloeira mostra zero. É onde nasce a maior parte das conferências manuais do mês.',
  },
  {
    n: 'F6', titulo: 'Contas a pagar — folha, comissão e despesa de campo',
    gatilho: 'Vencimento ou pedido do assessor', cadencia: 'Folha dia 5 · comissão dia 25 · despesas ao longo do mês',
    grupos: 'Financeiro Bula Assessoria · conversas 1:1',
    passos: [
      ['Assessor', 'Manda nota, planilha de comissão e despesa de viagem', 'WhatsApp 1:1'],
      ['João Eduardo', 'Confere contra o fechamento e lança no ERP', 'ERP'],
      ['Ana Paula', 'Agenda o pagamento no banco e lança o mesmo título no HastaPro', 'Banco + HastaPro'],
      ['Ana Paula / João Eduardo', 'Confirmam a baixa e respondem “feito” no privado', 'WhatsApp 1:1', 'fim'],
    ],
    obs: 'É o fluxo mais frágil do mapa: acontece inteiro em conversa privada, com dois lançamentos manuais do mesmo título (ERP e HastaPro) e sem grupo que registre. A cobrança da própria equipe (“consegue me pagar hoje?”) chega direto no privado, fora de qualquer fila.',
  },
  {
    n: 'F7', titulo: 'Contas a receber — cobrança da leiloeira',
    gatilho: 'Leilão + 45 dias (vencimento automático)', cadencia: 'Semanal',
    grupos: 'Conversas 1:1 com cada leiloeira',
    passos: [
      ['Sistema', 'Cria o título a receber com vencimento de leilão + 45 dias', 'ERP', 'auto'],
      ['Ana Paula / João Eduardo', 'Cobram o contato de cada leiloeira (EAO, Naviraí, Genética Aditiva, e-Rural, Guadalupe)', 'WhatsApp 1:1'],
      ['Leiloeira', 'Envia NF, comprovante ou propõe abatimento contra comissão em aberto', 'WhatsApp'],
      ['João Eduardo', 'Concilia o crédito no extrato e baixa o título', 'ERP + extrato bancário', 'dec'],
      ['Financeiro', 'Recebido — entra no caixa da semana', '', 'fim'],
    ],
    obs: 'O vencimento do sistema é uma convenção, não uma data acordada: só uma minoria dos títulos tem prazo firmado com a leiloeira. Por isso a estatística de pontualidade do ERP não mede pontualidade — mede a própria convenção.',
  },
  {
    n: 'F8', titulo: 'Fórmula do Boi — genética, centrais e contratos',
    gatilho: 'Touro entra em produção ou cliente pede dose', cadencia: 'Contínuo',
    grupos: '12 grupos “&lt;Central&gt; ⟷ Fórmula do Boi” · Fórmula do Boi - Operação',
    passos: [
      ['Central parceira', 'Informa quarentena, coleta e produção de doses de cada reprodutor', 'Grupo da central'],
      ['Matheus Amormino', 'Consolida estoque, negocia preço e frete e leva a demanda do cliente', 'Grupo de operação'],
      ['Marcelo', 'Decide condição comercial (mínimo de doses, custo compartilhado, royalty)', 'Grupo', 'dec'],
      ['Leonardo', 'Roda os acasalamentos das doadoras e define o cruzamento', 'Grupo de operação'],
      ['Jurídico', 'Fecha o contrato de parceria do reprodutor / doadora a partir do checklist', 'WhatsApp'],
      ['Achiles', 'Produz página e criativos do touro para divulgação', 'Site + Drive', 'fim'],
    ],
    obs: 'É uma operação separada da assessoria, com a mesma direção e dois braços de execução (Amormino no comercial, Leonardo no técnico). A logística da dose — quem retira, onde, com botijão — é resolvida caso a caso dentro do grupo de cada central.',
  },
  {
    n: 'F9', titulo: 'Governança semanal e automações',
    gatilho: 'Rotina da casa', cadencia: 'Terça 9h · agenda semanal · resumo diário 22h30',
    grupos: 'Bula Assessoria l Assessores · Notificações, Automações e fluxo CRM',
    passos: [
      ['Marcelo', 'Convoca e conduz a reunião semanal (logística, metas do mês, agenda do mês seguinte)', 'Google Meet, terça 9h'],
      ['Marcelo', 'Publica a agenda da semana e a meta de vendas do mês', 'Grupo dos assessores'],
      ['Time', 'Reporta venda por venda; o placar da meta é atualizado a cada leilão', 'Grupo dos assessores'],
      ['Agente de IA (nº operacional)', 'Responde consulta de ERP/CRM da equipe por WhatsApp; alteração só depois de um “sim”', 'WhatsApp @bula', 'auto'],
      ['Sistema', 'Resumo do dia às 22h30, aviso de lead que respondeu e agenda semanal automática', 'Cron → grupo', 'auto'],
      ['Direção', 'Decide o que a semana seguinte trabalha (quais leilões e-Rural, onde guardar cartucho)', '', 'fim'],
    ],
    obs: 'A meta é gerida abertamente no grupo: em 22/08, R$ 4,34 mi vendidos contra R$ 6,876 mi de meta, com o restante cobrado leilão a leilão. É a única rotina de gestão formalizada — não há ritual equivalente para financeiro, cadastro ou pós-venda.',
  },
]

const CADEIA = [
  ['Campanha e lead', 'F1', 'Marketing + SDR'],
  ['Habilitação', 'F2', 'Cadastro e crédito'],
  ['Material e agenda', 'F3', 'Técnico + marketing'],
  ['Pregão', 'F4', 'Assessores na pista'],
  ['Fechamento', 'F5', 'HastaPro + ERP'],
  ['Recebimento', 'F7', 'Cobrança da leiloeira'],
  ['Pagamento', 'F6', 'Comissão e folha'],
]

const stepBox = (s, i) => {
  const [ator, acao, canal, tipo = ''] = s
  return `<div class="st ${tipo}">
    <div class="st-n">${String(i + 1).padStart(2, '0')}</div>
    <div class="st-b">
      <div class="st-a">${ator}</div>
      <div class="st-t">${acao}</div>
      ${canal ? `<div class="st-c">${canal}</div>` : ''}
    </div>
  </div>`
}

const fluxoBloco = (f) => `
<section class="fx">
  <div class="fx-h">
    <div class="fx-n">${f.n}</div>
    <div>
      <h2>${f.titulo}</h2>
      <div class="fx-m"><span><b>Gatilho:</b> ${f.gatilho}</span><span><b>Cadência:</b> ${f.cadencia}</span><span><b>Onde acontece:</b> ${f.grupos}</span></div>
    </div>
  </div>
  <div class="fx-steps">${f.passos.map(stepBox).join('<div class="arrow">›</div>')}</div>
  <div class="fx-o"><b>O que a conversa mostra</b> ${f.obs}</div>
</section>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 11mm 12mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", sans-serif; color: #17181A; font-size: 9px; line-height: 1.45; margin: 0; }
  h1, h2, .fx-n, .kpi b, .cad-t { font-family: Oswald, "Arial Narrow", sans-serif; text-transform: uppercase; letter-spacing: .02em; }
  h1 { font-size: 25px; margin: 0; font-weight: 700; }
  .sub { color: #6E7176; font-size: 9.5px; margin-top: 2px; }
  header { border-bottom: 2px solid #17181A; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
  .selo { font-size: 8px; color: #8A8D92; text-align: right; line-height: 1.6; }
  .selo b { color: #C9A84C; }

  .cadeia { display: flex; align-items: stretch; gap: 0; margin: 6px 0 14px; }
  .cad { flex: 1; background: #17181A; color: #fff; padding: 9px 10px; position: relative; margin-right: 9px; }
  .cad:last-child { margin-right: 0; }
  .cad::after { content: ''; position: absolute; right: -9px; top: 0; border-left: 9px solid #17181A; border-top: 19px solid transparent; border-bottom: 19px solid transparent; }
  .cad:last-child::after { display: none; }
  .cad-t { font-size: 11px; }
  .cad-f { color: #C9A84C; font-size: 8px; font-weight: 600; }
  .cad-s { color: #B9BBBF; font-size: 7.4px; margin-top: 1px; }

  .fx { break-inside: avoid; margin-bottom: 13px; border: 1px solid #E3E4E6; border-left: 3px solid #C9A84C; padding: 9px 11px 10px; background: #FCFCFB; }
  .fx-h { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 8px; }
  .fx-n { background: #17181A; color: #C9A84C; font-size: 15px; padding: 2px 8px; line-height: 1.4; }
  h2 { font-size: 13px; margin: 0; }
  .fx-m { color: #6E7176; font-size: 7.8px; display: flex; gap: 14px; flex-wrap: wrap; margin-top: 2px; }
  .fx-m b { color: #17181A; }

  .fx-steps { display: flex; align-items: stretch; gap: 0; }
  .st { flex: 1; display: flex; gap: 5px; background: #fff; border: 1px solid #D9DADD; border-top: 2px solid #17181A; padding: 6px 7px; }
  .st.dec { border-top-color: #C9A84C; background: #FFFDF6; }
  .st.auto { border-top-color: #6E7176; border-style: dashed; }
  .st.fim { border-top-color: #17181A; background: #17181A; color: #fff; }
  .st.fim .st-a { color: #C9A84C; } .st.fim .st-c, .st.fim .st-n { color: #9A9CA0; }
  .st-n { font-family: Oswald, sans-serif; font-size: 12px; color: #C9CBCF; line-height: 1; }
  .st-a { font-size: 8.2px; font-weight: 700; }
  .st-t { font-size: 7.9px; margin-top: 2px; line-height: 1.35; }
  .st-c { font-size: 7px; color: #8A8D92; margin-top: 3px; font-style: italic; }
  .arrow { align-self: center; color: #C9A84C; font-size: 15px; padding: 0 3px; font-weight: 700; }

  .fx-o { margin-top: 8px; font-size: 8.1px; color: #3A3C40; background: #F2F2EF; padding: 6px 9px; border-left: 2px solid #17181A; }
  .fx-o b { font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.4px; letter-spacing: .04em; margin-right: 5px; }

  .leg { display: flex; gap: 16px; font-size: 7.6px; color: #6E7176; margin: 4px 0 10px; align-items: center; }
  .leg i { display: inline-block; width: 16px; height: 0; border-top: 2px solid #17181A; vertical-align: middle; margin-right: 4px; }
  .leg i.d { border-top-color: #C9A84C; } .leg i.a { border-top: 2px dashed #6E7176; } .leg i.f { border-top-color: #17181A; height: 7px; background: #17181A; }
  .nota { margin-top: 8px; padding: 9px 11px; background: #F6F6F4; border-left: 3px solid #C9A84C; font-size: 8.2px; color: #3A3C40; }
  .pb { break-before: page; }
  footer { margin-top: 10px; padding-top: 6px; border-top: .5px solid #D9DADD; color: #8A8D92; font-size: 7.2px; display: flex; justify-content: space-between; }
</style></head><body>

<header>
  <div><h1>Fluxos de trabalho</h1><div class="sub">Como a Bula opera de fato — reconstruído das conversas de trabalho, não do que deveria ser</div></div>
  <div class="selo">Sessão <b>joao-automation</b> · 38 grupos internos<br>27.868 mensagens · set/2023 a 25/08/2026<br>Retrato de 25 de agosto de 2026</div>
</header>

<div class="cadeia">
  ${CADEIA.map(([t, f, s]) => `<div class="cad"><div class="cad-f">${f}</div><div class="cad-t">${t}</div><div class="cad-s">${s}</div></div>`).join('')}
</div>
<div class="leg"><span><i></i>etapa de execução</span><span><i class="d"></i>ponto de decisão</span><span><i class="a"></i>automação / sistema</span><span><i class="f"></i>entrega do fluxo</span><span>Os fluxos F8 (genética) e F9 (governança) correm em paralelo à cadeia acima.</span></div>

${fluxoBloco(FLUXOS[0])}
${fluxoBloco(FLUXOS[1])}

<div class="pb"></div>
<header><div><h1>Fluxos de trabalho</h1><div class="sub">Preparação do leilão e pregão ao vivo — o núcleo da operação</div></div><div class="selo">F3 · F4</div></header>
${fluxoBloco(FLUXOS[2])}
${fluxoBloco(FLUXOS[3])}

<div class="pb"></div>
<header><div><h1>Fluxos de trabalho</h1><div class="sub">O dinheiro: fechamento, pagamento e cobrança</div></div><div class="selo">F5 · F6 · F7</div></header>
${fluxoBloco(FLUXOS[4])}
${fluxoBloco(FLUXOS[5])}
${fluxoBloco(FLUXOS[6])}

<div class="pb"></div>
<header><div><h1>Fluxos de trabalho</h1><div class="sub">Genética e governança</div></div><div class="selo">F8 · F9</div></header>
${fluxoBloco(FLUXOS[7])}
${fluxoBloco(FLUXOS[8])}

<div class="nota">
  <strong>Onde cada fluxo vive.</strong> A operação inteira roda em grupos de WhatsApp com papéis bem definidos: um grupo por leilão (“Lances &lt;Leiloeira&gt;”) que nasce quando o evento entra na agenda e morre depois dele; dois grupos permanentes de cadastro (um por leiloeira); um grupo de pista histórico (Lances Bula Assessoria, aberto em set/2023, 10.207 mensagens); um de time (Assessores), um de marketing, um de financeiro, um de notificações automáticas e doze com as centrais de sêmen. Fora dos grupos, dois fluxos correm só no privado — contas a pagar (F6) e cobrança (F7).
</div>

<footer><span>Bula Assessoria — Fluxos de trabalho</span><span>Apurado em 25/08/2026 a partir do WhatsApp da operação</span></footer>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
if (process.env.SHOT) { await page.setViewportSize({ width: 1400, height: 990 }); await page.screenshot({ path: process.env.SHOT, fullPage: true }) }
await page.pdf({ path: OUT, format: 'A4', landscape: true, printBackground: true })
await browser.close()
console.log('PDF:', OUT)
