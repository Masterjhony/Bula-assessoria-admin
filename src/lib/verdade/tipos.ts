/**
 * ERP VERDADE — vocabulário do sistema de confiança.
 *
 * A regra da casa: o ERP não guarda "valores". Ele guarda FATOS (linhas de
 * fonte primária, rastreáveis) e REGRAS. Todo número que aparece numa tela,
 * PDF ou mensagem é uma VARIÁVEL DERIVADA — calculada na hora, a partir dos
 * fatos, com fórmula declarada, cobertura medida e validações cruzadas.
 *
 * Nenhuma variável pode ser publicada sem carimbo. O carimbo responde seis
 * perguntas, sempre as mesmas:
 *
 *   Valor       — quanto é
 *   Origem      — de quais fatos saiu (tabela, filtro, nº de linhas)
 *   Fórmula     — como foi formado, em português
 *   Cobertura   — que fração do universo a fórmula conseguiu enxergar
 *   Atualização — quando o fato mais novo entrou
 *   Confiança   — 0..100, decomposta em motivos
 */

/** De onde o número vem — determina o teto de confiança. */
export type ClasseFonte =
    /** Fato conferido contra o mundo externo (extrato bancário conciliado). */
    | 'primaria_conciliada'
    /** Fato registrado no sistema, ainda sem confirmação externa. */
    | 'primaria'
    /** Calculada a partir de outras variáveis — herda o pior dos insumos. */
    | 'derivada'
    /** Alguém digitou/acordou (acordo de leiloeira, folha cadastrada). */
    | 'declarada'
    /** Projeção, média, rateio — não aconteceu ainda. */
    | 'estimada'

export type Severidade = 'fail' | 'warn'

/**
 * O que exatamente uma lacuna estraga. Confundir os três foi o erro clássico
 * dos auditores anteriores: tratar tudo como se fosse erro de valor faz o
 * sistema gritar em cima de número certo, e quem lê aprende a ignorar.
 *
 *  valor         — a soma pode estar errada. Só isto derruba a cobertura.
 *  interpretacao — a soma está certa, mas o rótulo mente. Ex.: "vencido" num CR
 *                  cujo vencimento é o automático de leilão+45d: ninguém
 *                  combinou essa data, então não há atraso a cobrar.
 *  atribuicao    — a soma está certa e o rótulo também; falta o dono/detalhe.
 *                  Ex.: título sem fornecedor_id. Não muda quanto se deve.
 */
export type ImpactoLacuna = 'valor' | 'interpretacao' | 'atribuicao'

/** Por que parte do universo ficou de fora da conta, ou não pode ser lida ao pé da letra. */
export interface Lacuna {
    motivo: string
    linhas: number
    valor?: number
    impacto: ImpactoLacuna
    /** Amostra de identificadores, para o operador ir consertar na fonte. */
    exemplos?: string[]
}

/**
 * Quanto do universo a fórmula enxergou. Cobertura baixa não é erro — é aviso
 * de que o número responde por menos realidade do que parece. O caso clássico:
 * comissão pela tabela de performance exige `faturamento_total_leilao`; se o
 * campo está vazio em 72% dos fechamentos, a cobertura é 28% e o número não
 * pode ser apresentado como se fosse o total.
 */
export interface Cobertura {
    /** Linhas que a regra deveria considerar. */
    universo: number
    /** Linhas cujo VALOR entrou correto na conta. */
    usados: number
    /** 0..1 — só lacunas de impacto `valor` mexem aqui. */
    fracao: number
    lacunas: Lacuna[]
}

/** De onde os fatos vieram, em termos que dá para conferir na mão. */
export interface Origem {
    fonte: string
    filtro: string
    linhas: number
}

export interface Conflito {
    id: string
    titulo: string
    severidade: Severidade
    detalhe: string
    /** Ids de variáveis que este conflito contamina. */
    afeta: string[]
}

export interface MotivoConfianca {
    motivo: string
    /** Efeito na nota, em pontos. Negativo tira. */
    delta: number
}

export interface Confianca {
    /** 0..100 */
    nota: number
    motivos: MotivoConfianca[]
}

/** O carimbo completo. É isto que a tela mostra e o PDF imprime. */
export interface VariavelResolvida {
    id: string
    titulo: string
    unidade: 'BRL' | 'percentual' | 'contagem' | 'data' | 'texto'
    valor: number | string | null
    formula: string
    classe: ClasseFonte
    origens: Origem[]
    cobertura: Cobertura
    /** ISO date do fato mais recente que entrou na conta. */
    atualizado_em: string | null
    /** Ids das variáveis usadas como insumo. */
    deriva_de: string[]
    composicao: Parcela[]
    conflitos: Conflito[]
    confianca: Confianca
    /** Se false, o número não sai em relatório sem decisão humana explícita. */
    publicavel: boolean
    /** Preenchido quando o cálculo falha — a variável não some, ela se declara quebrada. */
    erro?: string
}

/**
 * De que parcelas o número é feito. Não é enfeite: um total que mistura coisas
 * de naturezas diferentes é a fábrica de mal-entendido mais produtiva do ERP.
 * "A pagar: 378 mil" lido como dívida, quando 314 mil é folha ainda não
 * incorrida, já custou reunião. A composição obriga o total a se explicar.
 */
export interface Parcela {
    rotulo: string
    valor: number
    nota?: string
}

/** O que uma variável devolve; o motor cuida do resto do carimbo. */
export interface ResultadoCalculo {
    valor: number | string | null
    origens: Origem[]
    cobertura: Cobertura
    atualizado_em?: string | null
    /** Sobrescreve a fórmula declarada, quando ela depende do que foi achado. */
    formula?: string
    composicao?: Parcela[]
}

/**
 * Como uma variável derivada herda a confiança dos insumos.
 *
 *  pior      — o erro de um insumo contamina o resultado inteiro (margem
 *              depende de receita: receita errada, margem errada). Padrão.
 *  ponderada — o resultado é uma SOMA de parcelas conhecidas, cada uma com sua
 *              confiança. O total é exato; sua qualidade é a média das partes,
 *              no peso de cada uma. Sem isso, R$ 862 mil de a receber — 98%
 *              deles comissão já apurada — levariam a nota da fatia estimada
 *              de 2%, e ninguém acreditaria mais no painel.
 */
export type HerancaConfianca = 'pior' | 'ponderada'

export interface DefinicaoVariavel<Ctx = unknown> {
    id: string
    titulo: string
    unidade: VariavelResolvida['unidade']
    classe: ClasseFonte
    /** Em português, o suficiente para alguém refazer a conta na mão. */
    formula: string
    /** Ids de outras variáveis das quais esta depende. */
    deriva_de?: string[]
    /** Padrão: 'pior'. */
    heranca?: HerancaConfianca
    calcular: (ctx: Ctx, dep: Record<string, VariavelResolvida>) => ResultadoCalculo | Promise<ResultadoCalculo>
}

export interface DefinicaoValidacao<Ctx = unknown> {
    id: string
    titulo: string
    severidade: Severidade
    /** Variáveis contaminadas quando esta validação falha. */
    afeta: string[]
    /** Devolve null quando passa; o detalhe do problema quando falha. */
    checar: (ctx: Ctx) => { detalhe: string; severidade?: Severidade } | null | Promise<{ detalhe: string; severidade?: Severidade } | null>
}

export interface RelatorioVerdade {
    gerado_em: string
    /** Foto única: todas as variáveis leem os mesmos fatos, no mesmo instante. */
    foto_em: string
    variaveis: VariavelResolvida[]
    validacoes: {
        id: string
        titulo: string
        severidade: Severidade
        passou: boolean
        detalhe: string | null
        afeta: string[]
    }[]
    resumo: {
        variaveis: number
        publicaveis: number
        bloqueadas: number
        confianca_media: number
        fails: number
        warns: number
    }
}

/** Piso de confiança para um número sair de dentro de casa. */
export const CONFIANCA_MINIMA_PUBLICACAO = 70

export const cobreTudo = (universo: number, lacunas: Lacuna[] = []): Cobertura => ({
    universo,
    usados: universo,
    fracao: 1,
    lacunas,
})

export const cobertura = (universo: number, usados: number, lacunas: Lacuna[] = []): Cobertura => ({
    universo,
    usados,
    fracao: universo > 0 ? usados / universo : 1,
    lacunas,
})
