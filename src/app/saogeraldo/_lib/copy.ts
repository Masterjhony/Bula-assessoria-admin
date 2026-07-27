// ─────────────────────────────────────────────────────────────────────────
// Copy comercial da landing do LANÇAMENTO — Leilão Touros São Geraldo e 7P.
//
// Diferença de tom vs. a landing perpétua (/touros): lá a data é evitada de
// propósito; aqui a DATA É O ARGUMENTO. O leilão acontece uma vez, e a página
// existe para converter antes dele.
//
// Regras deste arquivo:
//  · Nenhum dado factual do evento mora aqui — data, hora, nº de lotes e
//    condições de pagamento vêm de `_lib/evento.ts`. Copy fala, evento informa.
//  · Nenhum claim numérico que não esteja no BRIEF. Na dúvida, qualitativo.
//  · Marca é BULA ASSESSORIA. São Geraldo e 7P são os criatórios vendedores.
//  · NÃO existe frete nesta página (cortado do escopo pelo cliente) — nenhuma
//    linha de copy pode insinuar entrega grátis.
// ─────────────────────────────────────────────────────────────────────────

export const hero = {
  // ENCURTADO em 27/07: saiu "· BULA ASSESSORIA". A logo da Bula está imediata-
  // mente acima desta linha, na faixa da foto — assinar a marca duas vezes em
  // 60px de tela é a definição de texto sobrando.
  eyebrow: 'LEILÃO · TOUROS NELORE PO',
  // A promessa é a mesma do funil perpétuo (retorno no bezerro), mas ancorada
  // num evento com hora marcada — é isso que separa esta página da /touros.
  //
  // ENCURTADO em 27/07 (de 62 para 37 caracteres) por decisão do cliente. Não
  // foi preferência de escrita: a versão longa ocupava 3 linhas no celular e
  // empurrava o formulário para 747px, contra os 411px da /touros. Cada linha
  // de título aqui custa ~32px de dobra, e a dobra é onde a página converte.
  // O detalhe que saiu do título ("mudar o seu próximo bezerro") continua no
  // lead, logo abaixo — não se perdeu argumento, mudou de lugar.
  title: 'O seu próximo touro tem hora marcada.',
  // ENCURTADO em 27/07 (de 195 para 105 caracteres) — o cliente reclamou de
  // excesso de texto no hero e este parágrafo era o maior bloco da dobra.
  //
  // O que saiu foi REPETIÇÃO, não argumento: a primeira frase ("Leilão de
  // touros PO Nelore das fazendas São Geraldo e 7P Agro") já estava dita duas
  // vezes na mesma tela — no eyebrow logo acima ("LEILÃO · TOUROS NELORE PO")
  // e na assinatura de origem no rodapé do hero ("LOTES DE FAZENDA SÃO GERALDO
  // · 7P AGRO"). As duas promessas concretas — a Bula seleciona e a Bula
  // habilita — continuam inteiras, e o verbo agora é o mesmo de `processo`
  // ("Selecionamos, dentro do catálogo...") e de `catalogo.nota`.
  //
  // Em tela: 5 linhas no celular viraram 3, ~56px de dobra devolvidos.
  lead:
    'A Bula seleciona os lotes que servem no seu rebanho e cuida da sua habilitação para dar lance. Sem custo.',
  ctaSticky: 'Quero assessoria',
  // Reforço abaixo do formulário: diz o que o cadastro entrega, sem prometer
  // preço. Perdeu "Assessoria sem custo." porque o lead agora fecha com
  // "Sem custo." — a mesma frase duas vezes na mesma dobra não reforça, cansa.
  reforco: 'Você recebe a seleção antes do leilão.',
  // Alt da foto do hero. Deixou de ser decorativa: agora ela tem faixa própria
  // e é conteúdo — quem não enxerga a imagem precisa saber o que ela mostra.
  // Descrição factual do que está no quadro; nenhum claim.
  fotoAlt: 'Apartação de touros Nelore no curral da fazenda, ao entardecer',
}

export const contagem = {
  label: 'O leilão começa em',
  encerrado: 'O leilão já começou.',
  encerradoLead:
    'Fale com a Bula mesmo assim — a equipe te orienta sobre este e sobre os próximos leilões.',
  unidades: { dias: 'dias', horas: 'horas', minutos: 'min', segundos: 'seg' },
}

// Barra fixa do mobile. A urgência só entra na RETA FINAL (≤3 dias): antes
// disso, contar dias enfraquece o apelo — "faltam 12 dias" é permissão para
// adiar. A contagem completa já vive no hero, para quem quiser o detalhe.
export const sticky = {
  urgencia(dias: number) {
    if (dias <= 0) return 'O leilão é hoje'
    if (dias === 1) return 'Falta 1 dia para o leilão'
    return `Faltam ${dias} dias para o leilão`
  },
}

export const oferta = {
  eyebrow: 'CONDIÇÕES DO LEILÃO',
  title: 'Condição de pagamento que cabe no seu ciclo.',
  lead:
    'As condições abaixo são as do catálogo oficial do leilão. A Bula te ajuda a montar a compra dentro delas.',
  cta: 'Quero a seleção do meu rebanho',
}

// Como a Bula entra no meio — os mesmos 4 passos da landing perpétua, porque é
// o mesmo serviço, reescritos para o contexto de um leilão com data.
export const processo = {
  title: 'A Bula te assessora do cadastro ao lance.',
  passos: [
    { strong: false, text: 'Fazemos um diagnóstico do seu rebanho para entender o seu projeto' },
    { strong: false, text: 'Direcionamos você para o Assessor Bula mais próximo e capacitado para te atender' },
    { strong: false, text: 'Cuidamos do seu cadastro na leiloeira para habilitar suas compras parceladas' },
    { strong: false, text: 'Selecionamos, dentro do catálogo, os touros que servem na sua fazenda' },
  ],
}

// O catálogo é MENCIONADO, não exibido (decisão do cliente, 27/07). A página
// não lista lote: quem quer ver lote fala com o assessor — o que, aliás, é o
// objetivo da página. O número de lotes sai de EVENTO.totalLotes, nunca daqui.
//
// Importante para quem for mexer: NÃO importe `_lib/lotes.ts` para pegar a
// contagem. Aquele módulo carrega o lotes.json inteiro (~766 KB) em escopo de
// módulo e ele acabaria no bundle da página só para renderizar um número.
export const catalogo = {
  nota: (totalLotes: number) =>
    `São ${totalLotes} lotes de touros PO Nelore no catálogo oficial. A Bula lê o catálogo por você — pedigree, avaliação genética e vídeo de cada animal — e te manda só o que serve no seu rebanho.`,
}

// Prova social — faixa de logos dos criatórios. O claim é QUALITATIVO: o
// equivalente na /touros ("+1.000 touros PO apartados") está marcado [VALIDAR]
// lá desde antes e nunca foi confirmado. Se o cliente validar o número, é aqui
// que ele entra — em uma linha.
export const provaSocial = {
  eyebrow: 'Criatórios e fazendas que confiam na Bula',
  claim: 'A mesma equipe que aparta touro ao lado de criatórios de corte e seleção vai escolher o seu.',
}

// Fecho — último convite, depois da prova social. NÃO hospeda formulário: uma
// segunda instância duplicaria os eventos de funil. Só devolve ao #cadastro.
export const fecho = {
  eyebrow: 'ANTES DO DIA 01',
  title: 'Chegue no leilão sabendo\nexatamente em que lote dar lance.',
  lead:
    'O cadastro é rápido e sem custo. Quem se cadastra antes recebe a seleção e chega no dia do leilão com a lista na mão.',
  bullets: [
    'Diagnóstico do seu rebanho, sem custo',
    'Seleção dos lotes que servem no seu projeto',
    'Cadastro na leiloeira para dar lance parcelado',
    'Um assessor com você durante o leilão',
  ],
  nota: 'Assessoria sem custo · Atendimento por WhatsApp',
}

export const footer = {
  nota: 'Bula Assessoria — assessoria de genética para pecuária de corte.',
  criatorios: 'Lotes das fazendas São Geraldo e 7P Agro.',
}
