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

export interface SegmentoLead {
    momento_pecuaria?: string | null
    quantidade_animais?: string | null
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
 * pode ser feito agora; a persona diz COMO falar com ESTE lead.
 */
export function personaPromptBlock(lead: SegmentoLead): string {
    const seg = computeSegmento(lead)
    const lines = [`PERSONA DO LEAD: ${SEGMENTO_LABEL[seg]}`]
    lines.push(...ROTEIRO[seg].map(x => `- ${x}`))
    const nota = EXPERIENCIA_NOTA[experienciaLeilao(lead)]
    if (nota) lines.push(`- ${nota}`)
    return lines.join('\n')
}
