// Organograma da Bula Assessoria + atribuições por pessoa.
// Fonte: sessão Baileys `joao-automation` (VPS), history-dumps, whatsapp_messages,
// operational_items, erp_folha_estrutura e erp_contas_pagar. Apurado em 25/08/2026.
// Uso: node scripts/gera-organograma-bula-2026-08-25.mjs
import { join } from 'node:path'
import { homedir } from 'node:os'
import { chromium } from 'playwright'

const OUT = join(homedir(), 'Desktop', 'Organograma e Fluxos - Bula Assessoria (25-08-2026)', '01 - Organograma e Atribuicoes - Bula Assessoria.pdf')

// ── Pessoas: cargo, vínculo, número, evidência de atividade no WhatsApp ──────
const P = {
  bulinha: { curto: 'Bulinha', nome: 'Felipe Vilela Andrade', apelido: '"Bulinha"', cargo: 'Sócio-fundador · Diretor-Geral', vinculo: 'Sócio · comissão 2% s/ venda própria', fone: '(67) 99944-1382', msgs: 2265, grupos: 12,
    faz: 'Dono da Fórmula do Boi. Abre e sustenta o relacionamento com criadores e leiloeiras, atua na pista nos leilões presenciais e é <em>superadmin</em> dos dois grupos-mãe (Lances Bula, criado em set/2023, e Assessores). Decide o que a casa aceita ou recusa como negócio.' },
  marcelo: { curto: 'Marcelo Carneiro', nome: 'Marcelo Carneiro Lucas Pereira', apelido: '', cargo: 'Sócio · Diretor Comercial e de Marketing', vinculo: 'Sócio 15% + 35% do lucro (trimestral, desde jun/26)', fone: '(31) 99414-9161', msgs: 4664, grupos: 31,
    faz: 'É o eixo de coordenação da operação: publica a agenda semanal e a arte consolidada, define e cobra a meta mensal de vendas, conduz a reunião semanal (terça, 9h, Meet), produz e aprova criativos e apresentações comerciais, direciona cada cadastro aprovado a um assessor e fecha o resultado de cada leilão com o time. Administrador de 23 dos 38 grupos internos.' },

  douglas: { curto: 'Douglas Bispo', nome: 'Douglas Bispo Carvalho', apelido: '', cargo: 'Assessor Comercial — Norte + Maranhão', vinculo: 'Folha R$ 12.500 + 2% de comissão (PJ: Bispo Agronegócios / Grupo AgroBispo)', fone: '(99) 98490-1010 · (94) 99194-9797', msgs: 3182, grupos: 11,
    faz: 'Assessoria de compra na sua zona: prospecta, habilita comprador, lança no pregão e reporta a venda no padrão da casa ("Levamos lote X — valor — foi com Douglas Bispo da Bula Assessoria"). Puxa o grupo Lances Mafra e conduz a relação com os promotores do Pará e do Maranhão.' },
  fabio: { curto: 'Fábio Omena', nome: 'Fábio de Omena Gaia', apelido: '', cargo: 'Assessor Comercial — Nordeste (exc. MA) + Sudeste', vinculo: 'Folha R$ 7.000 + 2% (era 3% até junho/26) — PJ: FO Assessoria Pecuária', fone: '(82) 98131-3050 · (67) 99620-0141', msgs: 4315, grupos: 10,
    faz: 'O mais ativo da pista em volume de conversa. Além da assessoria de compra, mantém canal próprio de divulgação (grupo de venda de touros e matrizes com 1.014 participantes), traz cadastro novo e cobra material de leilão junto às leiloeiras.' },
  leonardo: { curto: 'Leonardo Serafim', nome: 'Leonardo Serafim Francisco', apelido: '"Léo"', cargo: 'Assessor Técnico — Centro-Oeste + Sul', vinculo: 'Folha R$ 13.500 + 2% de comissão', fone: '(66) 99939-9319', msgs: 1967, grupos: 14,
    faz: 'Acumula assessoria comercial e a função técnica da casa: classifica os lotes de cada catálogo (A++ / A+ / A) — é essa avaliação que define quais lotes viram GIF e material de divulgação — e roda os acasalamentos no braço de genética (Fórmula do Boi).' },
  peralta: { curto: 'Felipe Peralta', nome: 'Luiz Felipe Peralta Garcez', apelido: '"Peralta"', cargo: 'Assessor de pista', vinculo: 'Comissão 2% por lote (fora da folha; título aberto em ago/26)', fone: '(67) 99249-7274', msgs: 918, grupos: 6,
    faz: 'Trabalha o pregão ao vivo junto com o time. Foi desativado da folha na revisão de 04/08, mas segue com comissão por lote lançada e presença diária nos grupos de lances.' },
  rusa: { curto: 'Gustavo Rusa', nome: 'Gustavo Rusa', apelido: '', cargo: 'Parceiro comercial (direcionamento técnico)', vinculo: 'Comissão 5% sobre os lotes dos compradores dele', fone: '(94) 99162-4126', msgs: 23, grupos: 0,
    faz: 'Não opera dentro dos grupos (saiu do Lances Bula) — a participação dele é declarada na pista, na hora da venda ("com direcionamento técnico do dr. Gustavo Rusa"). É o único parceiro a 5%, e a conta dele só fecha em leilão de acordo alto.' },

  nane: { curto: 'Nane', nome: 'Nane', apelido: '', cargo: 'Assessora — Bula Remates', vinculo: 'Comissão 1–2% (acerto acumulado, pago em dezembro)', fone: '(65) 99975-2333', msgs: 376, grupos: 8,
    faz: 'Vende na pista pelos leilões da casa e da Bula Remates, principalmente nos eventos de fêmeas (Guadalupe, Genética Aditiva).' },
  laila: { curto: 'Laila Oliveira', nome: 'Laila de Sousa Oliveira', apelido: '', cargo: 'Assessora — Bula Remates', vinculo: 'Comissão 1–2%', fone: '(34) 99265-9816 · (67) 99802-1109', msgs: 187, grupos: 5,
    faz: 'Pista e apoio de cadastro nos leilões de fêmeas.' },
  lucasm: { curto: 'Lucas Martins', nome: 'Lucas Martins Durães Bragança', apelido: '', cargo: 'Assessor — Bula Remates', vinculo: 'Comissão 1% s/ venda PO', fone: '(67) 99979-7661', msgs: 499, grupos: 4,
    faz: 'Pista nos leilões da Bula Remates; presença forte no grupo de lances.' },
  valeria: { curto: 'Valéria Borges', nome: 'Valéria Borges', apelido: '', cargo: 'Assessora — Bula Remates', vinculo: 'Comissão 1% s/ venda PO', fone: '—', msgs: 0, grupos: 0,
    faz: 'Vendas reportadas na pista em nome dela; não aparece com número próprio nos grupos analisados.' },

  joaoant: { curto: 'João Antônio', nome: 'João Antônio Salvetti de Oliveira', apelido: '', cargo: 'SDR / Pré-venda', vinculo: 'Folha R$ 2.000 (comissão fixa de R$ 2.000 cancelada em 21/08)', fone: '(67) 99889-4887', msgs: 1176, grupos: 9,
    faz: 'Primeiro contato com o lead de campanha, qualificação e agendamento. É o responsável por 100 leads no CRM — de longe o maior. Também leva cadastro para análise e acompanha leilão.' },
  luana: { curto: 'Luana', nome: 'Luana', apelido: '', cargo: 'SDR / Pré-venda', vinculo: 'Folha R$ 2.000', fone: '(94) 99264-7687', msgs: 18, grupos: 6,
    faz: 'Entrou nos grupos do time em agosto; atendimento de lead ainda em rampa — quase nenhuma fala registrada nos grupos.' },
  pedro: { curto: 'Pedro Pereira', nome: 'Pedro Pereira', apelido: '', cargo: 'SDR / Pré-venda', vinculo: 'Folha R$ 2.000', fone: '(67) 99855-2507', msgs: 4, grupos: 5,
    faz: 'Mesmo estágio da Luana: presente nos grupos, participação ainda mínima.' },

  joaogab: { curto: 'João Gabriel', nome: 'João Gabriel dos Santos dos Anjos', apelido: '', cargo: 'Marketing — Tráfego pago (Meta)', vinculo: 'Folha R$ 2.000', fone: '(31) 98606-9268', msgs: 260, grupos: 4,
    faz: 'Sobe e gerencia as campanhas de touros e fêmeas no gerenciador da Meta, organiza os criativos e pede a verba diária ao financeiro.' },
  renato: { curto: 'Renato Raven', nome: 'Renato Raven', apelido: '', cargo: 'Design — artes e cards', vinculo: 'Prestador', fone: '(67) 99208-0916 · (67) 99871-8632', msgs: 764, grupos: 4,
    faz: 'Produz a arte da agenda semanal e da Expogenética, cards de leilão e peças de campanha. Administrador do grupo de Marketing; a conferência do que ele produz é feita pelo Douglas e pelo Marcelo.' },
  achiles: { curto: 'Achiles', nome: 'Achiles', apelido: '', cargo: 'Criação de páginas e criativos (Fórmula do Boi)', vinculo: 'Prestador', fone: '(31) 98263-9157', msgs: 0, grupos: 1,
    faz: 'Integrado em 2026 para as páginas e criativos dos reprodutores da Fórmula do Boi (Atacante da Matinha, Conan).' },

  joaoedu: { curto: 'João Eduardo', nome: 'João Eduardo Pereira', apelido: '', cargo: 'Tecnologia e Financeiro', vinculo: 'Folha R$ 5.000', fone: '(37) 98404-4850', msgs: 2709, grupos: 38,
    faz: 'Constrói e opera tudo que é sistema: ERP e conciliação bancária, CRM e funis, agente de IA no WhatsApp, servidor Baileys, GIFs de lotes, landing pages e relatórios gerenciais. É a única pessoa presente em todos os 38 grupos internos.' },
  eberts: { curto: 'Matheus Eberts', nome: 'Matheus Henrique Eberts Verdi', apelido: '"Matheus M1"', cargo: 'Tecnologia e Financeiro — sistema da leiloeira', vinculo: 'Folha R$ 6.000', fone: '(44) 99991-9067', msgs: 358, grupos: 11,
    faz: 'Responde pelo HastaPro: cadastro de leilão, lançamento das vendas, fechamento financeiro, faturamento por leilão e por assessor, provisão de contas a receber e configuração das regras de comissão. Também faz análise de cadastro/crédito.' },
  anapaula: { curto: 'Ana Paula', nome: 'Ana Paula Porfírio Munhoz', apelido: '', cargo: 'Administrativo-Financeiro', vinculo: 'Esteve na folha até jun/26 (R$ 6.000); hoje remunerada por acerto', fone: '— (canal 1:1 com o João)', msgs: 214, grupos: 0,
    faz: 'Contas a pagar e a receber no dia a dia: agenda pagamento no banco, lança no HastaPro, confere nota fiscal e despesa de assessor, e faz a cobrança das leiloeiras em atraso. Não participa dos grupos — trabalha por conversa direta.' },

  galassi: { curto: 'Guilherme Galassi', nome: 'Guilherme Galassi Visconti Oliveira', apelido: '', cargo: 'Cadastro e Crédito', vinculo: 'Bula Remates', fone: '(67) 99991-5326', msgs: 156, grupos: 3,
    faz: 'Analisa o comprador antes do leilão: score, inscrição estadual, restrições e protestos, área do imóvel — e emite o veredito "aprovado / recusado" com o limite de lotes. Também trata NF e acerto de comissão com leiloeira.' },

  amormino: { curto: 'Matheus Amormino', nome: 'Matheus Amormino', apelido: '', cargo: 'Operação — Fórmula do Boi', vinculo: 'Comissionado (empresa irmã)', fone: '(31) 97565-9900', msgs: 332, grupos: 18,
    faz: 'Conduz a Aceleradora de Touros: estoque e produção de doses nas centrais parceiras, negociação de preço e frete, cobrança de contrato e material de divulgação dos reprodutores.' },
  juridico: { curto: 'Jurídico (contratos)', nome: 'Jurídico / contratos (FdB)', apelido: '', cargo: 'Contratos de parceria', vinculo: 'Prestador', fone: '(31) 98470-0276', msgs: 20, grupos: 2,
    faz: 'Redige e valida os contratos de parceria comercial de reprodutores e de doadoras da Fórmula do Boi, a partir de um checklist de dados enviado ao time.' },
}

const CAIXAS = {
  direcao: ['bulinha', 'marcelo'],
  comercial: ['douglas', 'fabio', 'leonardo', 'peralta', 'rusa'],
  remates: ['nane', 'laila', 'lucasm', 'valeria'],
  sdr: ['joaoant', 'luana', 'pedro'],
  mkt: ['joaogab', 'renato', 'achiles'],
  tech: ['joaoedu', 'eberts', 'anapaula'],
  cadastro: ['galassi'],
  fdb: ['amormino', 'juridico'],
}

const PARCEIROS = [
  ['Programa Leilões', 'Leiloeira parceira (PR)', 'Sendy, Márcia Lourenço e Juliane Safra validam o cadastro do comprador no grupo “Cadastros Bula e Programa” e cobram documentação (matrícula, inventário, NIRF).'],
  ['Leiloeiras e promotores', 'Um grupo por evento', 'Guadalupe (Danilo), Nelore Mafra, Genética Aditiva, EAO, Terra Brava, Naviraí, Camparino, Paranã, Colonial, Katispera, Matinha, Santa Nice. Entregam catálogo, ordem de entrada, cards e link da transmissão.'],
  ['Centrais de sêmen', '12 grupos “&lt;Central&gt; ⟷ Fórmula do Boi”', 'Bela Vista, Morro do Café, CPEX, Nelore da Nata, Nelore Visual, Berrante de Ouro, FEGO, R3, Zebu dos Santos, LUDEN, GSOL e Fazenda Limeira — produção de doses, logística e preço.'],
  ['Gustavo Rusa', 'Parceiro de direcionamento', 'Compradores próprios a 5%; sem presença nos grupos.'],
  ['ADN Viagens (Adilson)', 'Passagens e diárias', 'Emissão e remarcação de passagem da equipe; cobrança só pelo WhatsApp dele.'],
  ['Contabilidade', 'Honorários R$ 1.058/mês', 'Escrituração e obrigações do Simples (Anexo III).'],
  ['Plataformas', 'Fornecedores fixos', 'HastaPro (sistema da leiloeira), e-Rural e Remate Web (transmissão), Meta/Facebook (mídia paga), ClickWeb (site).'],
]

const RISCOS = [
  ['Coordenação concentrada em uma pessoa', 'O Marcelo é administrador de 23 dos 38 grupos internos e origem de 4.664 das 27.868 mensagens. Agenda, meta, material e direcionamento de cadastro passam todos por ele — se ele para, a operação para junto.'],
  ['Tecnologia com ponto único', 'O João Eduardo é a única pessoa nos 38 grupos e o único operador de ERP, CRM, servidor do WhatsApp, agente de IA e relatórios. Não há segunda pessoa capaz de sustentar essas rotinas.'],
  ['Pré-venda ainda não engrenou', 'Luana (18 mensagens) e Pedro (4) já estão na folha e nos grupos desde agosto, mas praticamente não aparecem na operação. O João Antônio responde sozinho por 100 dos 128 leads com dono no CRM.'],
  ['Financeiro fora da folha, no centro do fluxo', 'A Ana Paula agenda pagamento, lança no HastaPro e cobra leiloeira — mas saiu da folha em julho e trabalha só por conversa 1:1, sem grupo e sem registro compartilhado.'],
  ['Habilitação depende de duas pessoas e de um parceiro', 'Guilherme Galassi e Matheus Eberts respondem por toda a análise de crédito da Bula Remates; nos leilões do Programa Leilões, quem aprova é a equipe da leiloeira parceira. Sem eles, o comprador não entra no pregão.'],
  ['Pós-venda sem dono', 'Nenhum grupo interno trata entrega, frete e acerto do animal depois do martelo — o assunto aparece disperso nos grupos de lances e nas conversas privadas.'],
]

const ROW = (k) => {
  const p = P[k]
  return `<tr>
    <td class="nm"><strong>${p.nome}</strong>${p.apelido ? ` <span class="ap">${p.apelido}</span>` : ''}<div class="fn">${p.fone}</div></td>
    <td class="cg">${p.cargo}<div class="vc">${p.vinculo}</div></td>
    <td class="fz">${p.faz}</td>
    <td class="qt">${p.msgs ? p.msgs.toLocaleString('pt-BR') : '—'}<div class="qs">${p.grupos ? p.grupos + ' grupos' : '&nbsp;'}</div></td>
  </tr>`
}
const BLOCO = (titulo, keys, nota) => `
<h3 class="sec">${titulo}</h3>
${nota ? `<p class="exp">${nota}</p>` : ''}
<table class="pes"><thead><tr><th>Pessoa</th><th>Função e vínculo</th><th>O que faz na prática</th><th class="r">Mensagens</th></tr></thead>
<tbody>${keys.map(ROW).join('')}</tbody></table>`

const card = (k, cls = '') => {
  const p = P[k]
  return `<div class="card ${cls}"><div class="c-nome">${p.curto}</div><div class="c-cargo">${p.cargo.replace(' — ', '<br>')}</div></div>`
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 11mm 12mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", sans-serif; color: #17181A; font-size: 9px; line-height: 1.5; margin: 0; }
  h1, h2, h3, .c-nome, .kpi b { font-family: Oswald, "Arial Narrow", sans-serif; text-transform: uppercase; letter-spacing: .02em; }
  h1 { font-size: 25px; margin: 0; font-weight: 700; }
  .sub { color: #6E7176; font-size: 9.5px; margin-top: 2px; }
  header { border-bottom: 2px solid #17181A; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
  .selo { font-size: 8px; color: #8A8D92; text-align: right; line-height: 1.6; }
  .selo b { color: #C9A84C; }
  h2 { font-size: 14px; margin: 0 0 7px; padding-bottom: 4px; border-bottom: 1px solid #D9DADD; }
  h3.sec { font-size: 11px; margin: 13px 0 5px; color: #17181A; border-left: 3px solid #C9A84C; padding-left: 7px; }
  .exp { color: #4A4D52; margin: 0 0 6px; font-size: 8.6px; }
  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 12px; }
  .kpi { background: #F6F6F4; border-top: 2px solid #17181A; padding: 7px 9px; }
  .kpi b { display: block; font-size: 18px; line-height: 1.1; }
  .kpi span { color: #6E7176; font-size: 7.6px; display: block; margin-top: 2px; }

  /* organograma */
  .org { margin: 4px 0 0; }
  .lin { display: flex; gap: 10px; justify-content: center; }
  .lin .card { max-width: 260px; }
  .card { background: #fff; border: 1px solid #C9CBCF; border-top: 3px solid #17181A; padding: 6px 8px; width: 100%; }
  .card.top { border-top-color: #C9A84C; background: #17181A; color: #fff; }
  .card.top .c-cargo { color: #C7C9CD; }
  .c-nome { font-size: 10.5px; font-weight: 700; }
  .c-nome span { font-weight: 500; color: #8A8D92; }
  .c-cargo { font-size: 7.6px; color: #6E7176; margin-top: 2px; line-height: 1.35; }
  .conn { height: 12px; border-left: 1px solid #A9ACB1; width: 0; margin: 0 auto; }
  .barra { height: 0; border-top: 1px solid #A9ACB1; margin: 0 12%; }
  .area { margin-top: 9px; display: flex; flex-direction: column; gap: 5px; }
  .area-t { align-self: flex-start; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 8.6px; letter-spacing: .06em; color: #17181A; background: #EDEDEA; padding: 2px 7px; display: inline-block; border-left: 3px solid #C9A84C; }
  .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; align-items: start; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

  table { width: 100%; border-collapse: collapse; }
  table.pes th { background: #17181A; color: #fff; font-size: 7.4px; text-transform: uppercase; letter-spacing: .05em; padding: 4px 6px; text-align: left; font-weight: 600; }
  table.pes td { border-bottom: .5px solid #E3E4E6; padding: 5px 6px; vertical-align: top; font-size: 8.3px; }
  table.pes tr:nth-child(even) td { background: #FAFAF9; }
  td.nm { width: 17%; } td.cg { width: 20%; } td.qt { width: 7%; text-align: right; font-variant-numeric: tabular-nums; }
  th.r { text-align: right; }
  .ap { color: #8A8D92; font-weight: 500; }
  .fn, .vc, .qs { color: #8A8D92; font-size: 7.4px; margin-top: 2px; }
  .vc { color: #6E7176; }
  .nota { margin-top: 10px; padding: 9px 11px; background: #F6F6F4; border-left: 3px solid #C9A84C; font-size: 8.2px; color: #3A3C40; }
  .nota ul { margin: 4px 0 0; padding-left: 15px; } .nota li { margin-bottom: 3px; }
  .risco { border-bottom: .5px solid #E3E4E6; padding: 5px 0; font-size: 8.3px; }
  .risco b { display: block; font-family: Oswald, sans-serif; text-transform: uppercase; font-size: 9px; }
  .pb { break-before: page; }
  footer { margin-top: 12px; padding-top: 6px; border-top: .5px solid #D9DADD; color: #8A8D92; font-size: 7.2px; display: flex; justify-content: space-between; }
</style></head><body>

<header>
  <div><h1>Organograma e atribuições</h1><div class="sub">Bula Assessoria · Bula Remates · Fórmula do Boi — retrato de 25 de agosto de 2026</div></div>
  <div class="selo">Apurado no WhatsApp da operação (sessão <b>joao-automation</b>)<br>27.868 mensagens de 38 grupos internos · set/2023 a 25/08/2026<br>Cruzado com folha, contas a pagar, CRM e ERP</div>
</header>

<div class="kpis">
  <div class="kpi"><b>23</b><span>pessoas com função mapeada</span></div>
  <div class="kpi"><b>11</b><span>na folha ou com comissão ativa</span></div>
  <div class="kpi"><b>38</b><span>grupos internos de trabalho</span></div>
  <div class="kpi"><b>43</b><span>grupos do universo Bula</span></div>
  <div class="kpi"><b>8</b><span>frentes de trabalho distintas</span></div>
</div>

<div class="org">
  <div class="lin">${card('bulinha', 'top')}${card('marcelo', 'top')}</div>
  <div class="conn"></div><div class="barra"></div>
  <div class="grid4" style="margin-top:0">
    <div class="area"><div class="area-t">Comercial — pista</div>${CAIXAS.comercial.map(k => card(k)).join('')}</div>
    <div class="area"><div class="area-t">Bula Remates — pista</div>${CAIXAS.remates.map(k => card(k)).join('')}
      <div class="area-t" style="margin-top:7px">Pré-venda (SDR)</div>${CAIXAS.sdr.map(k => card(k)).join('')}</div>
    <div class="area"><div class="area-t">Marketing</div>${CAIXAS.mkt.map(k => card(k)).join('')}
      <div class="area-t" style="margin-top:7px">Cadastro e crédito</div>${CAIXAS.cadastro.map(k => card(k)).join('')}</div>
    <div class="area"><div class="area-t">Tecnologia e financeiro</div>${CAIXAS.tech.map(k => card(k)).join('')}
      <div class="area-t" style="margin-top:7px">Fórmula do Boi</div>${CAIXAS.fdb.map(k => card(k)).join('')}</div>
  </div>
</div>

<div class="nota">
  <strong>Como ler este organograma.</strong> Ele não foi desenhado a partir de cargos declarados, e sim do que cada pessoa realmente faz nos grupos de trabalho da casa. As três marcas convivem na mesma equipe: a <strong>Bula Assessoria</strong> (assessoria de compra ao comprador), a <strong>Bula Remates</strong> (leiloeira do grupo, CNPJ Bula Assessoria Pecuária) e a <strong>Fórmula do Boi</strong> (genética e sêmen, do Bulinha). Quem é da Remates trabalha na mesma pista, com comissão menor (1% sobre venda PO) e sem folha.
</div>

<div class="pb"></div>
<header><div><h1>Atribuições por pessoa</h1><div class="sub">O que cada um entrega, com o volume de conversa que sustenta a leitura</div></div>
<div class="selo">Mensagens = participação nos 38 grupos internos<br>(histórico completo, não só o mês corrente)</div></header>

${BLOCO('Direção e sociedade', CAIXAS.direcao, 'Duas cabeças: o Bulinha responde pelo negócio e pelo relacionamento; o Marcelo pela máquina comercial e de marketing do dia a dia.')}
${BLOCO('Comercial — assessores de pista', CAIXAS.comercial, 'A divisão é por zona geográfica e cada assessor responde pelo ciclo inteiro do seu comprador: prospecção, habilitação, lance no pregão e reporte da venda.')}
${BLOCO('Bula Remates — equipe de pista da leiloeira', CAIXAS.remates, 'Mesmo pregão, vínculo diferente: comissão de 1% sobre venda PO, sem salário fixo.')}

<div class="pb"></div>
<header><div><h1>Atribuições por pessoa</h1><div class="sub">Pré-venda, marketing, tecnologia, financeiro, cadastro e genética</div></div>
<div class="selo">Continuação</div></header>

${BLOCO('Pré-venda (SDR)', CAIXAS.sdr, 'Recebem o lead que a campanha gera, qualificam e entregam ao assessor da zona correspondente.')}
${BLOCO('Marketing', CAIXAS.mkt, 'Direção criativa é do Marcelo; a execução se divide entre tráfego, design e páginas.')}
${BLOCO('Tecnologia e financeiro', CAIXAS.tech, 'Três pessoas para dois sistemas paralelos: o ERP/CRM próprio e o HastaPro da leiloeira.')}
${BLOCO('Cadastro e crédito', CAIXAS.cadastro, 'É o filtro que decide se o comprador entra no pregão — e por quantos lotes.')}
${BLOCO('Fórmula do Boi — genética', CAIXAS.fdb, 'Empresa irmã, mesma equipe de direção, operação própria com as centrais de sêmen.')}

<div class="pb"></div>
<header><div><h1>Parceiros, prestadores e pontos de atenção</h1><div class="sub">Quem está fora da folha mas dentro da operação — e o que a leitura dos grupos expõe</div></div>
<div class="selo">25/08/2026</div></header>

<div class="grid2">
  <div>
    <h2>Parceiros e prestadores</h2>
    <table class="pes"><thead><tr><th>Quem</th><th>Relação</th><th>O que entrega</th></tr></thead><tbody>
    ${PARCEIROS.map(([a, b, c]) => `<tr><td class="nm"><strong>${a}</strong></td><td class="cg">${b}</td><td class="fz">${c}</td></tr>`).join('')}
    </tbody></table>
  </div>
  <div>
    <h2>Pontos de atenção</h2>
    ${RISCOS.map(([t, d]) => `<div class="risco"><b>${t}</b>${d}</div>`).join('')}
  </div>
</div>

<div class="nota">
  <strong>Base e limites desta apuração.</strong>
  <ul>
    <li>Fonte primária: os 38 grupos internos da sessão <em>joao-automation</em> — 27.868 mensagens deduplicadas, de 24/09/2023 a 25/08/2026 — mais as mensagens ao vivo gravadas no banco desde 10/08.</li>
    <li>As conversas privadas (1:1) do número não vieram no histórico do celular: só aparecem as que a Central Operacional captura (Marcelo, Ana Paula, Douglas, João Gabriel, Fábio, Leonardo e João Antônio). Fluxos que vivem só no privado podem estar sub-representados.</li>
    <li>Os participantes chegam como identificador interno do WhatsApp (@lid); os nomes foram resolvidos cruzando o mapeamento do próprio servidor com CRM, clientes, ERP e Central Operacional. 39 dos 114 números dos grupos internos têm nome confirmado — os demais são compradores, promotores e convidados pontuais.</li>
    <li>Vínculo e remuneração vêm da folha canônica do ERP e das contas a pagar de junho a setembro/2026, não de declaração.</li>
  </ul>
</div>

<footer><span>Bula Assessoria — Organograma e atribuições</span><span>Apurado em 25/08/2026 a partir do WhatsApp da operação</span></footer>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
if (process.env.SHOT) { await page.setViewportSize({ width: 1400, height: 990 }); await page.screenshot({ path: process.env.SHOT, fullPage: true }) }
await page.pdf({ path: OUT, format: 'A4', landscape: true, printBackground: true })
await browser.close()
console.log('PDF:', OUT)
