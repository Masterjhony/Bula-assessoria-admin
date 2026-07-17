/**
 * PERSONA (segmento) do lead — roteiro diferente para cada tipo de produtor.
 *
 * Aprendizado da campanha EAO (jul/2026): tratar todo lead com o mesmo roteiro
 * queima os dois extremos — o INICIANTE é interrogado sobre "cria, recria ou
 * engorda" (não tem rebanho!) e o CRIADOR DE P.O. recebe explicação de básico
 * que ele domina, ambos esfriam. O formulário da campanha JÁ diz quem é a
 * pessoa (momento na pecuária, quantidade de cabeças, o que busca) — este
 * módulo transforma isso num segmento determinístico e num bloco de roteiro
 * para o prompt do concierge.
 *
 * Como a fase (concierge-fase.ts), o segmento é calculado por DADOS, não pelo
 * "feeling" do modelo: auditável, testável e estável entre mensagens. A
 * conversa corrige o formulário (quem marcou "quero aprender" no anúncio mas
 * diz que toca 120 cabeças vira produtor) — regra herdada da qualificação.
 */

export type Segmento = 'iniciante' | 'produtor_comercial' | 'criador_po' | 'indefinido'

/**
 * SEGUNDO EIXO (doc de personas 17/07): o que o lead busca COMPRAR. A maturidade
 * diz COMO falar; o objetivo diz SOBRE O QUÊ. Um criador P.O. atrás de touro
 * quer shortlist e velocidade; o mesmo criador atrás de matriz quer conversa
 * consultiva de base materna. Produto igual ≠ conversa igual.
 * 'genetica' = embrião/sêmen/aspiração/prenhez — o "Multiplicador Genético"
 * (Fórmula do Boi): compra escala genética, não animal na pista.
 */
export type ObjetivoCompra = 'touros' | 'matrizes' | 'misto' | 'genetica' | 'indefinido'

export interface SegmentoLead {
    momento_pecuaria?: string | null
    quantidade_animais?: string | null
    interesse?: string | null
    interesse_principal?: string | null
    o_que_busca?: string | null
    extra_data?: Record<string, unknown> | null
}

const str = (v: unknown) => String(v ?? '').trim()
/** Slugs do formulário vêm com hífen e, num caso, com underscore. */
const slug = (v: unknown) => str(v).toLowerCase().replace(/_/g, '-')

/** O lead já mexe com registrado/P.O. (pela boca dele)? */
const REBANHO_PO = /\bp\.?\s?o\.?\b|registrad|plantel|elite|puro de origem/i
/** O lead declarou que ainda NÃO tem gado? */
const REBANHO_NENHUM = /\b(n[aã]o|ainda n[aã]o|nunca)\b.*\b(tenho|tem|possuo|criei|crio|comecei)\b|vou come[cç]ar|quero come[cç]ar|come[cç]ando (agora|do zero)/i

/**
 * Segmento do lead. Prioridade: o que ele DISSE na conversa (rebanho_atual)
 * corrige o que ele CLICOU no anúncio (momento_pecuaria) — mesma hierarquia da
 * qualificação. Sem dado nenhum → 'indefinido' (a 1ª pergunta de descoberta
 * é justamente a que o posiciona).
 */
export function computeSegmento(lead: SegmentoLead): Segmento {
    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    const rebanho = str(xd.rebanho_atual)

    if (rebanho) {
        if (REBANHO_PO.test(rebanho)) return 'criador_po'
        if (REBANHO_NENHUM.test(rebanho)) return 'iniciante'
        return 'produtor_comercial'
    }

    const momento = slug(lead.momento_pecuaria)
    if (momento === 'nao-trabalho-quero-aprender') return 'iniciante'
    if (momento === 'criador-renomado-de-po' || momento === 'corte-e-po' || momento === 'trabalho-com-corte-e-po') {
        return 'criador_po'
    }
    if (momento === 'pecuaria-de-corte' || momento === 'trabalho-com-pecuaria-de-corte') {
        return 'produtor_comercial'
    }

    // Sinal fraco: declarou quantidade de cabeças (formulário) = já produz.
    if (str(lead.quantidade_animais) && str(lead.quantidade_animais) !== '0') return 'produtor_comercial'
    return 'indefinido'
}

/** ja_compra | ja_tentou | nunca_comprou | '' (não sabemos). */
export function experienciaLeilao(lead: SegmentoLead): string {
    return str((lead.extra_data ?? {}).experiencia_leilao)
}

/** Biotecnologia primeiro: é o sinal mais específico (quem fala de embrião não está falando de "fêmea" no sentido de matriz de pista). */
const OBJ_GENETICA = /embri[õoã]|s[êe]men|aspira[çc]|\bfiv\b|iatf|prenhez|doadora|banco gen[ée]tico/i
const OBJ_MATRIZES = /matriz|bezerr|f[êe]mea|novilh|\bvaca/i
const OBJ_TOUROS = /touro|reprodutor|\bmacho/i

/**
 * Objetivo de compra do lead — mesmo princípio do segmento: calculado por
 * DADOS (o que ele disse na conversa + o que clicou no formulário), não pelo
 * feeling do modelo. A conversa (objetivo_compra_resumido, acumulado pela IA)
 * corrige o formulário.
 */
export function computeObjetivo(lead: SegmentoLead): ObjetivoCompra {
    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    // Conversa primeiro, formulário depois — mesma hierarquia do segmento.
    const texto = [xd.objetivo_compra_resumido, lead.interesse_principal, lead.o_que_busca, lead.interesse]
        .map(str).filter(Boolean).join(' | ')
    if (!texto) return 'indefinido'
    if (OBJ_GENETICA.test(texto)) return 'genetica'
    const touros = OBJ_TOUROS.test(texto)
    const matrizes = OBJ_MATRIZES.test(texto)
    if (touros && matrizes) return 'misto'
    if (touros) return 'touros'
    if (matrizes) return 'matrizes'
    return 'indefinido'
}

/**
 * TERCEIRO SINAL (transversal): o CAÇADOR DE OPORTUNIDADE. Não é um segmento
 * nem um objetivo — é um COMPORTAMENTO que existe em qualquer persona (o
 * criador P.O. garimpa preço tanto quanto o produtor comercial): o motor
 * predominante dele é o ganho financeiro, não o melhoramento em si. O doc de
 * personas (17/07) manda tratá-lo como etiqueta sobre a persona-base, nunca
 * como persona separada — senão fragmenta o funil.
 *
 * Sinais FORTES apenas (lucro, revenda, margem, barato, abaixo do mercado…).
 * "Investimento" e "valorizar" sozinhos são papo neutro de pecuária ("investir
 * no rebanho", "valoriza a bezerrada") e dariam falso positivo.
 */
const OPORTUNISTA = /oportunidad|barat[oa]|pre[çc]o (bom|baixo)|abaixo do (mercado|pre[çc]o)|desconto|lucr[oa]|revend|margem|investidor|comprar? (bem )?e vender|bom neg[óo]cio|neg[óo]cio bom|fazer dinheiro/i

/** O lead caça oportunidade/ganho financeiro? (flag manual/IA ou texto da conversa) */
export function isOportunista(lead: SegmentoLead): boolean {
    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    if (xd.perfil_oportunista === true) return true
    const texto = [xd.objetivo_compra_resumido, lead.interesse_principal, lead.o_que_busca, lead.interesse]
        .map(str).filter(Boolean).join(' | ')
    return OPORTUNISTA.test(texto)
}

const ETIQUETA_OPORTUNISTA = [
    'ETIQUETA: CAÇADOR DE OPORTUNIDADE — além do perfil acima, o motor dele é o GANHO FINANCEIRO: preço abaixo do mercado, margem, negócio bom.',
    'Fale em números e comparação: o que a equipe viu a campo valendo mais do que vai custar, condição (30x, frete grátis) como alavanca, preço da pista vs o mercado.',
    'A Bula é o GARIMPO dele: a gente vê os animais antes do remate e sabe o que está abaixo do preço — quem tem a assessoria fica sabendo primeiro. Esse é o gancho de venda pra ele.',
    'Urgência funciona com esse perfil ("esse padrão a esse preço não repete") — mas lembre a regra da fase: oportunidade concreta só com cadastro pronto. Use isso A FAVOR: o cadastro é o que garante que ele não perca a próxima oportunidade na hora H.',
]

export const OBJETIVO_LABEL: Record<ObjetivoCompra, string> = {
    touros: 'Touros / reprodutores',
    matrizes: 'Matrizes / bezerras — base materna',
    misto: 'Touros E fêmeas',
    genetica: 'Genética (embrião, sêmen, aspiração) — Multiplicador Genético',
    indefinido: 'Ainda não declarado',
}

/**
 * O que muda na conversa por objetivo. Complementa o roteiro do segmento: o
 * segmento dá o tom, o objetivo dá o assunto e o ritmo de fechamento.
 */
const ROTEIRO_OBJETIVO: Record<ObjetivoCompra, string[]> = {
    touros: [
        'Ele busca TOURO: compra de RESULTADO — decisão mais rápida que fêmea. Fale de correção do plantel, ganho na bezerrada e previsibilidade.',
        'Se ele é do meio, encurte: proponha separar os reprodutores certos pro objetivo dele nos próximos leilões (shortlist, não catálogo).',
    ],
    matrizes: [
        'Ele busca MATRIZ/BEZERRA: compra de BASE MATERNA — decisão mais pensada que touro. O que pesa: família, fertilidade, precocidade, habilidade materna.',
        'Tom mais consultivo: menos "fechar rápido", mais "escolher certo". Ajudar a comparar linhagens/famílias é o que ganha esse lead.',
    ],
    misto: [
        'Ele quer TOURO e FÊMEA — duas frentes. Descubra qual vem primeiro (orçamento e momento do rebanho costumam decidir) e conduza uma de cada vez.',
    ],
    genetica: [
        'Ele busca GENÉTICA (embrião, sêmen, aspiração, prenhez, doadora): compra ESCALA GENÉTICA, não animal na pista — o perfil "Fórmula do Boi".',
        'Aja como pré-consultor técnico: antes de qualquer papo de cadastro, confirme o objetivo do programa (acelerar o plantel? formar banco genético?) e a estrutura dele (tem receptoras? já faz FIV/IATF?).',
        'NÃO empurre lote de animal pronto pra esse perfil sem entender o programa — a compra dele é outra, e tratar como compra de leilão comum esfria.',
    ],
    indefinido: [],
}

export const SEGMENTO_LABEL: Record<Segmento, string> = {
    iniciante: 'Iniciante — quer entrar na pecuária',
    produtor_comercial: 'Produtor comercial — já toca gado, sem P.O.',
    criador_po: 'Criador de P.O. — já mexe com registrado',
    indefinido: 'Ainda não posicionado',
}

const ROTEIRO: Record<Segmento, string[]> = {
    iniciante: [
        'Ele quer COMEÇAR na pecuária — NÃO pergunte de rebanho, sistema de produção ou manejo atual: ele não tem.',
        'Descoberta certa pra ele: o que quer criar, se já tem terra/estrutura, e quando pretende começar.',
        'Eduque sem jargão e UMA coisa por vez. Leilão pode ser novidade total: quando fizer sentido, explique em 1-2 linhas como funciona (lance, arremate, boleto).',
        'A venda pra ele é SEGURANÇA: começar acompanhado por quem entende, sem pagar caro nem levar animal errado. "Sua primeira compra com a Bula do lado" é o gancho.',
        'Ele é o perfil que mais desconfia na hora do cadastro: reforce credibilidade (site/Instagram) ANTES de pedir qualquer dado, e peça o mínimo.',
    ],
    produtor_comercial: [
        'Ele já toca gado comercial — fale de igual pra igual, ZERO explicação de básico de pecuária.',
        'A venda pra ele é RESULTADO: touro/matriz P.O. valoriza a bezerrada e sobe o preço na venda. Traga o papo pro ganho prático (arroba, preço do bezerro, padrão do rebanho).',
        'Descoberta certa: sistema (cria/recria/engorda), quantas cabeças, e o objetivo do melhoramento.',
        'Se ele nunca comprou em leilão, normalize em 1 linha ("hoje é onde está a melhor genética; eu te acompanho do lance à entrega") — sem aula.',
    ],
    criador_po: [
        'Ele JÁ é do meio do P.O. — provavelmente conhece leilão, leiloeira e preço. Respeite o tempo dele: papo direto, sem explicar o óbvio.',
        'A venda pra ele é CURADORIA e ACESSO: nossa equipe vai a campo antes dos principais remates do país e aparta o que presta; ele fica sabendo primeiro e chega no leilão com os lotes certos separados.',
        'Descoberta enxuta: o que procura agora (reforço de plantel? linhagem específica?) e pra quando.',
        'Se ele demonstrar pressa ou clareza do que quer, ENCURTE: apresente a Bula em 2 linhas e proponha já deixar o cadastro pronto — este perfil destrava rápido.',
    ],
    indefinido: [
        'Ainda não sabemos se ele já cria gado ou quer começar — essa é a PRIMEIRA coisa a descobrir (ex.: "você já cria gado hoje ou tá querendo começar?").',
        'Assim que ele responder, o roteiro se ajusta sozinho na próxima mensagem — não assuma perfil antes disso.',
    ],
}

const EXPERIENCIA_NOTA: Record<string, string> = {
    ja_compra: 'Ele JÁ compra em leilão: não explique como leilão funciona — foque no diferencial da assessoria (curadoria a campo + acompanhamento no lance).',
    ja_tentou: 'Ele já TENTOU comprar em leilão e não concluiu: descubra com delicadeza o que travou (cadastro? preço? insegurança?) — resolver essa trava É a venda.',
    nunca_comprou: 'Ele NUNCA comprou em leilão: quando o assunto surgir, desmistifique em 1-2 linhas (cadastro libera o lance, boleto parcelado, assessor do lado) — medo do desconhecido é a objeção invisível dele.',
}

/**
 * Bloco injetado no prompt do concierge, logo após a FASE. A fase diz O QUE
 * pode ser feito agora; a persona diz COMO falar com ESTE lead; o objetivo de
 * compra (segundo eixo) diz sobre o quê e em que ritmo.
 */
export function personaPromptBlock(lead: SegmentoLead): string {
    const seg = computeSegmento(lead)
    const lines = [`PERSONA DO LEAD: ${SEGMENTO_LABEL[seg]}`]
    lines.push(...ROTEIRO[seg].map(x => `- ${x}`))
    const nota = EXPERIENCIA_NOTA[experienciaLeilao(lead)]
    if (nota) lines.push(`- ${nota}`)

    const obj = computeObjetivo(lead)
    if (ROTEIRO_OBJETIVO[obj].length) {
        lines.push('', `OBJETIVO DE COMPRA: ${OBJETIVO_LABEL[obj]}`)
        lines.push(...ROTEIRO_OBJETIVO[obj].map(x => `- ${x}`))
    }
    // Etiqueta transversal: soma-se a qualquer persona/objetivo, nunca substitui.
    if (isOportunista(lead)) {
        lines.push('', ...ETIQUETA_OPORTUNISTA.map((x, i) => (i === 0 ? x : `- ${x}`)))
    }
    return lines.join('\n')
}
