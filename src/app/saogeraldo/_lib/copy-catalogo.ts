// ─────────────────────────────────────────────────────────────────────────
// Copy da página do CATÁLOGO.
//
// Toda string visível vive aqui. Componente não escreve texto.
//
// REGRA DE PROCEDÊNCIA: o que está entre aspas nas páginas 1 a 3 do catálogo
// entra LITERAL, com a grafia do PDF — inclusive a exclamação de "TRADIÇÃO QUE
// GERA RESULTADOS!" e o acento de "PASTOFORMAL". O que não está no catálogo é
// texto de conversão e está marcado como tal.
//
// Dado factual (data, hora, condições de pagamento) NÃO mora aqui: mora em
// `evento.ts`, que é a fonte única. Este arquivo só o emoldura.
// ─────────────────────────────────────────────────────────────────────────

export const copyCatalogo = {
  nav: {
    marcaLinha1: 'Leilão Touros',
    marcaLinha2: 'São Geraldo e 7P Agro',
    cta: 'Receber catálogo',
    /** Rótulo acessível do link que volta ao topo. */
    irParaTopo: 'Leilão Touros São Geraldo e 7P Agro — ir para o topo',
  },

  hero: {
    // Literal da página 1, com a exclamação.
    eyebrow: 'Tradição que gera resultados!',
    /**
     * "150 REPRODUTORES NELORE PO" é o que a CAPA anuncia, e é o número que
     * este bloco repete — é promessa de campanha, não contagem de lote.
     *
     * Não confundir com `EVENTO.totalLotes` (134), que é a contagem real de
     * lotes do miolo do catálogo. Os dois números convivem porque medem
     * coisas diferentes; o que não pode é um aparecer sem o seu denominador.
     * Por isso a página não exibe os 134 em lugar nenhum.
     */
    pilulaTitulo: '150 Reprodutores Nelore PO',
    pilulaSub: 'Triplamente avaliados',
    /** Alt do letreiro metálico — ele é imagem, então carrega o texto. */
    letreiroAlt: 'Leilão Touros São Geraldo e 7P Agro',
    selosAlt:
      'Selos de avaliação genética: PMGZ, ANCP, Embrapa e GenePlus',
    fotoAlt:
      'Os fundadores da Fazenda São Geraldo e da 7P Agro, lado a lado, diante de uma boiada Nelore ao pôr do sol',
    cta: 'Receber o catálogo',
    dica: 'Role para receber',
  },

  contagem: {
    unidades: { dias: 'dias', horas: 'horas', minutos: 'min', segundos: 'seg' },
    encerrado: 'O leilão já aconteceu.',
    encerradoLead: 'Deixe seu contato para ser avisado da próxima edição.',
  },

  captura: {
    eyebrow: 'Cadastre-se',
    titulo: 'Receba o catálogo completo',
    lede:
      'Preencha seus dados para receber o catálogo em PDF pelo WhatsApp e ser lembrado no dia do leilão.',
  },

  pagamento: {
    eyebrow: 'No dia do leilão',
    titulo: 'Condição de Pagamento',
    nota: 'Facilidades pensadas para o pecuarista',
  },

  frete: {
    eyebrow: 'Cobertura nacional',
    titulo: 'Condição de Frete',
    /** Título acessível do SVG do mapa. */
    mapaTitulo: 'Mapa do Brasil com a condição de frete de cada estado',
    mapaDescricao:
      'Cada unidade federativa está pintada conforme a faixa de frete do leilão. A mesma informação está listada em texto logo abaixo do mapa.',
    tabelaResumo: 'Ver a condição de frete estado por estado',
    /** Cabeçalhos da tabela textual equivalente ao mapa. */
    colunaFaixa: 'Condição',
    colunaEstados: 'Estados',
  },

  rodape: {
    site: 'www.fazendasaogeraldo.com.br',
    siteUrl: 'https://www.fazendasaogeraldo.com.br',
    privacidade: 'Privacidade',
    termos: 'Termos',
  },
} as const

/** `01 de agosto` → `01 DE AGOSTO`. O monumento não aplica transform sozinho. */
export const dataMonumento = (dataExtenso: string) => dataExtenso.toUpperCase()

/** `sábado`, `12h` → `SÁBADO · 12H`. */
export const cerimonia = (diaSemana: string, hora: string) =>
  `${diaSemana} · ${hora}`.toUpperCase()
