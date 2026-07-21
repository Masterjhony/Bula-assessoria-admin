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
  eyebrow: 'ASSESSORIA DE GENÉTICA · BULA ASSESSORIA',
  title: 'O touro certo\nmuda o seu rebanho.',
  // Copy que QUALIFICA: linguagem técnica (DEP, sumário, reprodutor PO) faz o
  // comprador sério se reconhecer e o curioso se autoexcluir (Paid Social).
  lead: 'Para quem cria de verdade: a Bula lê os DEPs, cruza os números do sumário com o objetivo do seu rebanho e monta uma seleção de reprodutores PO que se paga no bezerro — sem chute e sem compra por beleza.',
  cta: 'Quero receber uma seleção de touros',
  // [VALIDAR] prova de escala — confirmar número atual com o cliente.
  proof: '+1.000 touros PO apartados ao lado de criatórios de corte e seleção.',
  // Variações de headline para A/B (virar hook do criativo no Meta). Trocar
  // `title` por uma delas ao testar — ver PLAN.md (Fase futura A/B).
  titleVariants: [
    'Touro bonito\nnão é touro bom.',
    'O reprodutor certo\nse paga no bezerro.',
    'A genética que os grandes\ncriatórios de Nelore usam.',
  ],
}

export const subHero = {
  title: 'Uma equipe de assessores\ndo seu lado na hora de comprar.',
  benefits: [
    // "Grátis" sozinho atrai caçador de brinde (frio). Explicar o PORQUÊ vira
    // sinal de operação profissional e afasta o freebie-seeker (Paid Social).
    { strong: true, text: 'Assessoria sem custo para você — a Bula é remunerada pelos criatórios e centrais, não pelo pecuarista' },
    { strong: false, text: 'Leitura dos DEPs e dos números do sumário do catálogo' },
    { strong: false, text: 'Curadoria dos reprodutores certos para o seu rebanho' },
    { strong: true, text: 'Apoio na habilitação e no pós-compra' },
  ],
}

export const processo = {
  title: 'Como funciona',
  lead: 'Um caminho simples, consultivo e sem custo até o touro certo.',
  steps: [
    {
      n: '01',
      title: 'Você se cadastra',
      text: 'Conta pra gente o seu momento na pecuária e o que procura em poucos campos.',
    },
    {
      n: '02',
      title: 'A equipe te chama no WhatsApp',
      text: 'Um assessor humano entra em contato pelo número que você cadastrou — não é robô, não é spam.',
    },
    {
      n: '03',
      title: 'Entendemos seu rebanho',
      text: 'Avaliamos seu objetivo de genética, manejo e as metas do seu plantel.',
    },
    {
      n: '04',
      title: 'Você recebe uma seleção',
      text: 'Uma curadoria de touros com a genética e os números que fazem sentido pra você.',
    },
  ],
}

export const conscientizacao = {
  eyebrow: 'O QUE ACONTECE DEPOIS',
  title: 'Depois de se cadastrar,\na conversa começa no WhatsApp.',
  // Acordo recíproco + "seleção montada à mão" → o não-comprometido se
  // autoexclui antes de custar mídia; quem fica sente reciprocidade (anti-frio).
  lead: 'Este cadastro abre uma conversa direta com um assessor — não é sorteio nem lista de espera. Cada seleção é montada à mão, uma a uma, então só faz sentido se cadastrar quem realmente vai olhar o WhatsApp e responder.',
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

export const form = {
  title: 'Receba sua seleção de touros',
  lead: 'Preencha e a equipe da Bula entra em contato com você pelo WhatsApp.',
  // Micro-copy de conscientização injetada perto do campo WhatsApp e do submit.
  whatsappHint: 'É por aqui que a equipe vai falar com você. Confirme o número certo.',
  submitHint:
    'Ao enviar, nossa equipe vai te chamar no WhatsApp — responda para receber sua seleção de touros.',
  consent: 'Autorizo a Bula Assessoria a entrar em contato comigo pelo WhatsApp.',
  submit: 'Quero minha seleção de touros',
  submitting: 'Enviando…',
  successTitle: 'Cadastro recebido!',
  successLead:
    'Fique de olho no WhatsApp — nossa equipe vai te chamar em breve. Responder rápido garante que você receba a seleção primeiro.',
}
