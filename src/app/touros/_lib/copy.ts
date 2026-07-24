// ─────────────────────────────────────────────────────────────────────────
// Copy comercial da landing de touros.
//
// Tom/claims adaptados de jmp-landing/src/content.ts (já aprovados para EAO/JMP)
// para o contexto PERPÉTUO — sem datas de evento, foco na QUALIDADE do touro e
// da genética. Claims sensíveis marcados com [VALIDAR] devem ser confirmados
// com o cliente antes do go-live (ver Pendências no PLAN.md).
//
// A micro-copy de conscientização (anti-lead-frio) mora aqui e é consumida
// tanto pela seção Conscientizacao quanto pelo Formulario — fonte única.
// ─────────────────────────────────────────────────────────────────────────

export const hero = {
  // Manchete e olho puxam o TOURO (produto), não o serviço. DEP/sumário viram
  // prova, não jargão de abertura — o comprador sério ainda se reconhece.
  eyebrow: 'TOUROS PO NELORE · BULA ASSESSORIA',
  title: 'O touro certo\nmuda o seu rebanho.',
  lead: 'O touro certo puxa peso, precocidade e fertilidade — e se paga no bezerro. A Bula monta, sem custo, uma seleção de touros PO Nelore pro objetivo do seu rebanho.',
  // 3 tópicos curtos: (1) o touro e a prova, (2) o retorno no bezerro,
  // (3) você fecha o touro certo (seleção sem custo — mecanismo verdadeiro).
  leadBullets: [
    'Touros PO Nelore com DEP que comprova o que ele entrega',
    'O touro certo se paga já no primeiro bezerro',
    'A Bula monta sua seleção sem custo — você fecha o touro certo',
  ],
  cta: 'Quero o touro certo pro meu rebanho',
  // [VALIDAR] prova de escala — confirmar número atual com o cliente.
  proof: '+1.000 touros PO apartados ao lado de criatórios de corte e seleção.',
  // Variações de headline para A/B (virar hook do criativo no Meta). Trocar
  // `title` por uma delas ao testar — ver PLAN.md (Fase futura A/B).
  titleVariants: [
    'Touro bonito\nnão é touro bom.',
    'O touro certo\nse paga no bezerro.',
    'O touro que muda\no seu próximo bezerro.',
  ],
}

export const subHero = {
  title: 'Você fecha o touro.\nA Bula garante que é o certo.',
  benefits: [
    // "Grátis" sozinho atrai caçador de brinde (frio). Explicar o PORQUÊ vira
    // sinal de operação profissional e afasta o freebie-seeker (Paid Social).
    // "Sem custo" é da SELEÇÃO/assessoria — o touro você compra na central.
    { strong: true, text: 'A seleção é sem custo — a Bula é paga pelos criatórios e centrais, não por você' },
    { strong: false, text: 'Touros PO com DEP e números do sumário que comprovam a genética' },
    { strong: false, text: 'Curadoria dos touros certos pro objetivo do seu rebanho' },
    { strong: true, text: 'Apoio na habilitação e no pós-compra do touro' },
  ],
}

// Seção de PRODUTO — o TOURO que o comprador leva (não o processo). Foco no
// animal + retorno no bezerro + "seu rebanho" para atrair comprador de escala e
// afastar o curioso. A Bula SELECIONA/aparta o touro — nunca "produz" genética.
export const produto = {
  eyebrow: 'O TOURO QUE VOCÊ LEVA',
  title: 'Não é um touro qualquer. É o touro certo pro seu rebanho.',
  lead: 'Touros PO Nelore escolhidos pelo objetivo do seu plantel e pelos números que comprovam a genética — não pela foto do catálogo.',
  pillars: [
    {
      title: 'Genética que se comprova no papel',
      text: 'Cada touro vem com DEP e números do sumário — você fecha com dado, não com achismo.',
    },
    {
      // [VALIDAR] quais criatórios/parceiros a Bula pode nomear.
      title: 'Procedência que você reconhece',
      text: 'Touros PO apartados ao lado de criatórios de corte e seleção de referência no Nelore.',
    },
    {
      title: 'O touro sob medida pro seu objetivo',
      text: 'Precocidade, fertilidade ou peso: a seleção puxa o traço que o seu rebanho precisa evoluir.',
    },
    {
      // [VALIDAR] qualquer número de ganho/valorização precisa vir do cliente.
      title: 'Retorno que aparece no bezerro',
      text: 'Touro certo melhora ganho de peso e desmama — o que você investe volta no lote vendido.',
    },
  ],
}

export const conscientizacao = {
  eyebrow: 'O QUE ACONTECE DEPOIS',
  title: 'Depois de se cadastrar,\na conversa começa no WhatsApp.',
  // Acordo recíproco + "seleção montada à mão" → o não-comprometido se
  // autoexclui antes de custar mídia; quem fica sente reciprocidade (anti-frio).
  lead: 'Este cadastro abre uma conversa direta com um assessor — não é sorteio nem lista de espera. Cada seleção de touros é montada à mão, uma a uma, então só faz sentido se cadastrar quem realmente vai olhar o WhatsApp e responder.',
  points: [
    {
      title: 'A equipe vai te chamar no WhatsApp',
      text: 'Em até 24h úteis, um assessor da Bula chama você no WhatsApp que você cadastrar. Deixe o número à mão.',
    },
    {
      title: 'É atendimento humano e consultivo',
      text: 'Genética é decisão de longo prazo. Você fala com gente que entende de touro, não com um robô.',
    },
    {
      title: 'Responder rápido é vantagem sua',
      text: 'As seleções são montadas por ordem de resposta. Quem responde o primeiro contato do assessor entra na frente da fila.',
    },
  ],
  commitment: 'O combinado é simples: você responde quando o assessor chamar, e a gente monta a sua seleção de touros. Cadastro que não responde, a gente não consegue atender.',
}

// Páginas de OBRIGADO pós-cadastro, separadas por MQL. URLs distintas permitem
// metas de conversão por URL (Google/Meta) e otimizar a campanha rumo ao lead
// que vale (MQL = ≥100 cabeças + IE). A diferença de copy é sutil — o MQL ganha
// uma linha de prioridade. Ajuste livre com o cliente.
export const obrigado = {
  mql: {
    eyebrow: 'CADASTRO CONFIRMADO',
    title: 'Recebemos seu cadastro.',
    lead: 'Um assessor da Bula vai te chamar no WhatsApp para montar, sem custo, uma seleção de touros pro seu rebanho. Pelo seu perfil, seu contato entra com prioridade no atendimento.',
    note: 'Fique de olho no WhatsApp que você cadastrou — responder rápido garante sua seleção primeiro.',
  },
  lead: {
    eyebrow: 'CADASTRO CONFIRMADO',
    title: 'Recebemos seu cadastro.',
    lead: 'Um assessor da Bula vai te chamar no WhatsApp para montar, sem custo, uma seleção de touros pro seu rebanho.',
    note: 'Fique de olho no WhatsApp que você cadastrou — responder rápido garante sua seleção primeiro.',
  },
} as const

export const form = {
  // Cabeçalho do card (message match + expectativa): O QUE é, que é SEM CUSTO e
  // O QUE acontece depois — pra ninguém preencher sem saber pra quê é o cadastro.
  title: 'Garanta o touro certo pro seu rebanho',
  lead: 'Sem custo: a Bula monta uma seleção de touros PO pro objetivo do seu rebanho e te chama no WhatsApp pra fechar.',
  // Micro-copy de conscientização injetada perto do campo WhatsApp e do submit.
  whatsappHint: 'É por aqui que a equipe vai falar com você. Confirme o número certo.',
  submitHint:
    'Ao enviar, nossa equipe vai te chamar no WhatsApp — responda para receber sua seleção de touros.',
  consent: 'Autorizo a Bula Assessoria a entrar em contato comigo pelo WhatsApp.',
  submit: 'Quero o touro certo',
  submitting: 'Enviando…',
  successTitle: 'Cadastro recebido!',
  successLead:
    'Fique de olho no WhatsApp — nossa equipe vai te chamar em breve. Responder rápido garante que você fecha o touro certo primeiro.',
}
