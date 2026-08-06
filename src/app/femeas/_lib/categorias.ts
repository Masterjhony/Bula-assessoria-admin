// ─────────────────────────────────────────────────────────────────────────
// As seis categorias de entrada no plantel — FONTE ÚNICA.
//
// A seção de categorias da página E o campo de interesse do formulário leem
// daqui. Não duplicar a lista em componente: quando o /saogeraldo deixou uma
// lista viver em três lugares, as três divergiram (ver
// src/app/saogeraldo/README.md:73-75).
//
// A ordem é a de CUSTO DE ENTRADA crescente, do mais acessível ao mais caro —
// é assim que a conversa comercial acontece ("por onde dá para começar com o
// que eu tenho"). [VALIDAR] com João Antônio: a ordem embrião → bezerra →
// novilha → prenhe → 3 em 1 → doadora reflete a realidade de preço da Bula?
//
// `id` é o valor gravado no CRM e na planilha. Não renomear depois do go-live
// sem migrar o histórico — é por ele que se corta o relatório por categoria.
// ─────────────────────────────────────────────────────────────────────────

export interface Categoria {
  id: string
  nome: string
  /** Uma linha, para o card da página. */
  resumo: string
  /** Para quem essa porta de entrada faz sentido. */
  paraQuem: string
}

export const categorias: Categoria[] = [
  {
    id: 'embrioes',
    nome: 'Embriões',
    resumo:
      'A porta de entrada mais barata para genética de ponta: você compra o embrião e implanta nas receptoras que já tem.',
    paraQuem:
      'Para quem já tem vacada e estrutura de manejo, e quer subir o nível genético sem comprar o animal pronto.',
  },
  {
    id: 'bezerras',
    nome: 'Bezerras',
    resumo:
      'Começar pela recria: você acompanha o animal crescer e forma o plantel no seu manejo, do seu jeito.',
    paraQuem:
      'Para quem tem tempo de espera e quer o menor desembolso por cabeça registrada.',
  },
  {
    id: 'novilhas',
    nome: 'Novilhas',
    resumo:
      'A fêmea já formada, pronta para entrar em reprodução na próxima estação de monta.',
    paraQuem:
      'Para quem quer encurtar a espera da recria e já começar a decidir acasalamento.',
  },
  {
    id: 'prenhes',
    nome: 'Prenhes',
    resumo:
      'Fêmea prenha: o próximo bezerro do seu criatório já vem a caminho na compra.',
    paraQuem:
      'Para quem quer produto no chão dentro do ano, não daqui a três.',
  },
  {
    id: 'pacote-3-em-1',
    nome: 'Pacote 3 em 1',
    resumo:
      'Vaca parida e prenha: três animais no negócio de uma vez — a matriz, o bezerro ao pé e a prenhez.',
    paraQuem:
      'Para quem quer formar plantel rápido e tem caixa para a entrada maior.',
  },
  {
    id: 'doadoras',
    nome: 'Doadoras',
    resumo:
      'A fêmea de elite que vai multiplicar sua genética em escala, produzindo embrião para o seu próprio programa.',
    paraQuem:
      'Para quem já tem criatório rodando e quer parar de comprar genética para começar a produzi-la.',
  },
]

/** Valores aceitos no campo de interesse do formulário e na coluna do CRM. */
export const categoriaIds = categorias.map((c) => c.id)

/**
 * Opção extra do formulário — NÃO é card na página.
 *
 * Existe porque o público declarado é "quem está começando", e quem está
 * começando frequentemente não sabe por qual categoria entrar. Forçar uma
 * escolha que a pessoa não tem como fazer produz resposta aleatória, que suja
 * o dado que o SDR usa na triagem. É justamente isso que a reunião com o
 * assessor existe para resolver.
 */
export const CATEGORIA_INDECISO = {
  id: 'nao-sei',
  nome: 'Ainda não sei — quero orientação',
} as const
