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
  // Headline de RETORNO (pedido do cliente 24/07): promessa concreta em R$ no
  // bezerro desmamado. Sem \n — o título é longo e quebra melhor fluido.
  title: 'O touro certo pode te dar R$300 a R$600 a mais de lucro por bezerro(a) na desmama!',
  lead: 'O touro certo puxa peso, precocidade e fertilidade — e se paga no bezerro. A Bula monta, sem custo, uma seleção de touros PO Nelore pro objetivo do seu rebanho.',
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
  // Copy do cliente (24/07): a seção agora narra o PROCESSO da assessoria em
  // 4 passos, na ordem em que o lead vive cada um.
  title: 'A Bula te assessora a encontrar o melhor reprodutor para o seu rebanho.',
  benefits: [
    { strong: false, text: 'Realizaremos um diagnóstico do seu rebanho para entender o seu projeto' },
    { strong: false, text: 'Direcionaremos você para o Assessor Bula mais próximo e capacitado para te atender' },
    { strong: false, text: 'Faremos seu cadastro nas leiloeiras para habilitar suas compras parceladas em 30x' },
    { strong: false, text: 'Selecionaremos os melhores touros do próximo leilão para servir na sua fazenda!' },
  ],
}

// Ensaio no curral — fotos do cliente (24/07). Título ecoa o tom de voz do
// brandbook ("Curral, chão, peão."): a seleção acontece no chão da operação.
export const ensaio = {
  eyebrow: 'TIME BULA EM AÇÃO',
  title: 'Curral, chão, peão.',
  lead: 'A seleção não acontece no catálogo. É no curral, do lado do gado, que o time da Bula aparta os touros que chegam na sua fazenda.',
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
