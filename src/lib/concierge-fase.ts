/**
 * FASE da conversa do concierge — o gate que impede a IA de ir direto ao cadastro.
 *
 * O feedback do comercial (08/07) foi: "a IA está qualificando pouco o lead,
 * indo direto ao ponto do cadastro e isso está assustando os leads... temos que
 * vender a ASSESSORIA, não o leilão parcelado". Deixar isso só no texto da
 * persona não resolve: o modelo vê o checklist de habilitação no prompt e corre
 * pra ele. Então a fase é DETERMINÍSTICA, calculada a partir dos dados que já
 * temos — igual ao `computeStageFromData` faz com a etapa do Kanban.
 *
 * As fases são um funil consultivo:
 *   descoberta   → entender o produtor (rebanho, sistema, objetivo). Pedir dado
 *                  cadastral aqui é PROIBIDO.
 *   apresentacao → perfil entendido: apresentar a Bula, o valor da assessoria e
 *                  propor o assessor dedicado (gratuito). Documento ainda não.
 *   habilitacao  → o lead aceitou a assessoria: aí sim o checklist entra, como
 *                  meio de destravar o que ele já quer.
 *   analise      → checklist completo, nada a pedir.
 *
 * O bloco de prompt gerado aqui declara a fase e proíbe explicitamente o que
 * não pode ser pedido nela. Junto com o checklist, é o "mapa" da IA.
 */

export type ConciergeFase = 'descoberta' | 'apresentacao' | 'habilitacao' | 'analise'

/** Perfil comercial do produtor — o que o chefe quer saber ANTES do cadastro. */
export interface PerfilLead {
    /** O que busca comprar (touros, matrizes, bezerras...). */
    interesse: string | null
    /** Tamanho do rebanho — "quantas cabeças?". */
    quantidade: string | null
    /** cria | recria | engorda | ciclo_completo | nao_definido */
    sistema: string | null
    /** O que ele cria hoje (mestiço, nelore comercial, já tem P.O....). */
    rebanho: string | null
    /** Objetivo da compra, em uma frase. */
    objetivo: string | null
    /** ja_compra | ja_tentou | nunca_comprou */
    experiencia: string | null
}

export interface FaseInput {
    perfil: PerfilLead
    /** extra_data.assessoria_apresentada_at — a IA já explicou a Bula? */
    assessoriaApresentada: boolean
    /** extra_data.aceitou_assessoria — o lead topou falar com um assessor? */
    aceitouAssessoria: boolean
    /** Checklist de habilitação fechado. */
    checklistComplete: boolean
    /** Quantas mensagens o LEAD já mandou nesta conversa (anti-interrogatório). */
    turnosLead?: number
}

export interface FaseResult {
    fase: ConciergeFase
    /** Rótulos do perfil que ainda faltam — viram as próximas perguntas. */
    perfilFaltando: string[]
    /** A apresentação já foi feita — não repetir, só reconduzir ao "sim". */
    jaApresentou: boolean
    motivo: string
}

/**
 * Teto de perguntas de descoberta. O chefe quer MAIS qualificação, mas um lead
 * que não responde o perfil não pode ficar preso num interrogatório: passada
 * esta quantidade de mensagens dele, a gente apresenta a assessoria com o que
 * tem. Vender é melhor que continuar perguntando pra uma pessoa calada.
 */
export const MAX_TURNOS_DESCOBERTA = 6

const str = (v: unknown) => String(v ?? '').trim()

/**
 * Perfil mínimo para sair da descoberta. `sistema` aceita 'nao_definido' — o
 * lead que não sabe responder (ou não quer) não pode ficar preso no funil; o
 * que não vale é a IA nunca ter perguntado.
 */
export function perfilFaltando(p: PerfilLead): string[] {
    const falta: string[] = []
    if (!str(p.interesse)) falta.push('o que ele busca (touros, matrizes, bezerras…)')
    if (!str(p.quantidade)) falta.push('quantas cabeças ele tem hoje')
    if (!str(p.sistema)) falta.push('se trabalha com cria, recria ou engorda')
    if (!str(p.rebanho)) falta.push('o que ele cria hoje (mestiço, comercial, já tem P.O.?)')
    return falta
}

export function computeFase(input: FaseInput): FaseResult {
    const falta = perfilFaltando(input.perfil)
    const jaApresentou = input.assessoriaApresentada
    const base = { perfilFaltando: falta, jaApresentou }

    if (input.checklistComplete) {
        return { ...base, fase: 'analise', motivo: 'checklist de habilitação completo' }
    }
    // O aceite vale mais que o perfil: se o lead já disse "quero", segurá-lo em
    // descoberta seria burrice comercial.
    if (jaApresentou && input.aceitouAssessoria) {
        return { ...base, fase: 'habilitacao', motivo: 'lead aceitou a assessoria — pode habilitar' }
    }
    if (falta.length > 0) {
        const enrolou = (input.turnosLead ?? 0) >= MAX_TURNOS_DESCOBERTA
        if (!enrolou) {
            return { ...base, fase: 'descoberta', motivo: `perfil incompleto (${falta.length} item(ns))` }
        }
        return { ...base, fase: 'apresentacao', motivo: `perfil incompleto, mas a conversa já se estendeu (${input.turnosLead} msgs) — apresentar assessoria` }
    }
    if (!jaApresentou) {
        return { ...base, fase: 'apresentacao', motivo: 'perfil entendido, falta apresentar a assessoria' }
    }
    return { ...base, fase: 'apresentacao', motivo: 'assessoria apresentada, aguardando o aceite do lead' }
}

/** Lê o perfil das colunas reais + extra_data (onde o concierge acumula). */
export function extractPerfil(lead: {
    interesse?: string | null
    interesse_principal?: string | null
    o_que_busca?: string | null
    quantidade_animais?: string | null
    momento_pecuaria?: string | null
    extra_data?: Record<string, unknown> | null
}): PerfilLead {
    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    return {
        interesse: str(lead.interesse_principal) || str(lead.o_que_busca) || str(lead.interesse) || null,
        quantidade: str(lead.quantidade_animais) || null,
        sistema: str(xd.sistema_producao) || null,
        rebanho: str(xd.rebanho_atual) || str(lead.momento_pecuaria) || null,
        objetivo: str(xd.objetivo_compra_resumido) || null,
        experiencia: str(xd.experiencia_leilao) || null,
    }
}

const REGRAS: Record<ConciergeFase, string[]> = {
    descoberta: [
        'PROIBIDO nesta fase: pedir CPF, e-mail, endereço, Inscrição Estadual, foto de documento ou qualquer dado de cadastro.',
        'PROIBIDO nesta fase: falar em "habilitar", "cadastro", "compra parcelada" ou "30x" como se fosse a oferta.',
        'Faça UMA pergunta por mensagem, no tom de quem entende de gado e quer entender a operação dele.',
        'Reaja ao que ele responde (um comentário curto de quem é do ramo) antes de perguntar a próxima coisa.',
    ],
    apresentacao: [
        'Você já entende a operação dele. Agora APRESENTE A BULA e o valor da assessoria — e proponha o assessor dedicado, sem custo.',
        'PROIBIDO nesta fase: pedir documento ou foto. Dado de cadastro só depois que ele topar a assessoria.',
        'Feche a mensagem perguntando se ele quer que um assessor nosso acompanhe ele (é o "sim" que destrava o resto).',
        'Se ele já demonstrou o "sim" ("quero", "pode ser", "como faço?"), marque updates.aceitou_assessoria=true.',
    ],
    habilitacao: [
        'O lead aceitou a assessoria. Agora sim: peça o que falta no checklist, enquadrado como o que destrava o trabalho do assessor.',
        'Peça em UMA mensagem organizada, nunca item por item, e só o que está marcado com ✘.',
        'Dado marcado com ✔ NUNCA é pedido de novo — no máximo confirmado ("é isso mesmo?").',
        'Lembre em meia linha o benefício: com isso o assessor já monta a estratégia dele pro próximo leilão.',
    ],
    analise: [
        'Checklist completo: NÃO peça mais nada.',
        'Confirme o recebimento, diga que a habilitação foi encaminhada e que um assessor assume o acompanhamento.',
        'Marque documents_received=true e handoff=true.',
    ],
}

const TITULO: Record<ConciergeFase, string> = {
    descoberta: 'DESCOBERTA — entender o produtor (NADA de cadastro)',
    apresentacao: 'APRESENTAÇÃO — vender a assessoria e conseguir o "sim"',
    habilitacao: 'HABILITAÇÃO — coletar o que falta do checklist',
    analise: 'ANÁLISE — encerrar e passar para o assessor',
}

/**
 * Bloco injetado no prompt. É o que impede o modelo de ver o checklist e correr
 * pro CPF: a fase manda, e cada fase lista o que é proibido nela.
 */
export function fasePromptBlock(r: FaseResult, perfil: PerfilLead): string {
    const lines: string[] = [`FASE ATUAL DA CONVERSA: ${TITULO[r.fase]}`]
    lines.push(...REGRAS[r.fase].map(x => `- ${x}`))

    if (r.fase === 'descoberta') {
        lines.push('', 'AINDA NÃO SABEMOS (pergunte, uma de cada vez, na ordem que a conversa pedir):')
        lines.push(...r.perfilFaltando.map(x => `  ✘ ${x}`))
    }
    if (r.fase === 'apresentacao' && r.jaApresentou) {
        lines.push('', 'ATENÇÃO: você JÁ apresentou a assessoria antes. NÃO repita a apresentação.')
        lines.push('- Responda a dúvida/objeção dele e reconduza ao "sim" com uma pergunta leve.')
        lines.push('- Se ele ainda estiver frio, volte a falar do gado dele; o "sim" vem depois.')
    }
    if (r.fase === 'apresentacao' && r.perfilFaltando.length) {
        lines.push('', `Perfil ainda incompleto (${r.perfilFaltando.join('; ')}), mas a conversa já se estendeu: apresente a assessoria com o que você sabe. Se couber, encaixe UMA dessas perguntas junto — nunca todas.`)
    }

    const sabe: string[] = []
    if (perfil.interesse) sabe.push(`busca: ${perfil.interesse}`)
    if (perfil.quantidade) sabe.push(`rebanho: ${perfil.quantidade} cabeças`)
    if (perfil.sistema) sabe.push(`sistema: ${perfil.sistema}`)
    if (perfil.rebanho) sabe.push(`hoje cria: ${perfil.rebanho}`)
    if (perfil.objetivo) sabe.push(`objetivo: ${perfil.objetivo}`)
    if (perfil.experiencia) sabe.push(`leilão: ${perfil.experiencia}`)
    if (sabe.length) lines.push('', `PERFIL JÁ LEVANTADO (não repita estas perguntas): ${sabe.join(' · ')}`)

    return lines.join('\n')
}
