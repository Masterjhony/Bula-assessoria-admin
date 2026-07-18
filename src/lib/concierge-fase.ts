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

import type { Segmento } from './concierge-persona'

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
    /** agora | proximos_30_dias | proximos_leiloes | sem_prazo (urgencia_compra). */
    urgencia: string | null
}

export interface FaseInput {
    perfil: PerfilLead
    /** Segmento/persona do lead (concierge-persona) — muda o que a descoberta precisa. */
    segmento?: Segmento
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
export const MAX_TURNOS_DESCOBERTA = 4

const str = (v: unknown) => String(v ?? '').trim()

/**
 * Perfil mínimo para sair da descoberta — POR SEGMENTO. `sistema` aceita
 * 'nao_definido' — o lead que não sabe responder (ou não quer) não pode ficar
 * preso no funil; o que não vale é a IA nunca ter perguntado.
 *
 * O segmento muda o que faz sentido perguntar: iniciante não tem rebanho nem
 * sistema (perguntar "cria, recria ou engorda?" pra quem quer COMEÇAR esfria a
 * conversa — aconteceu na campanha EAO); criador de P.O. dispensa o básico e
 * sai da descoberta com menos perguntas (o formulário já o posicionou).
 */
export function perfilFaltando(p: PerfilLead, segmento: Segmento = 'indefinido'): string[] {
    const falta: string[] = []
    if (segmento === 'iniciante') {
        if (!str(p.interesse)) falta.push('o que ele quer começar a criar (melhorar com touro? formar plantel com matrizes?)')
        if (!str(p.objetivo)) falta.push('o plano dele pra começar (já tem terra/estrutura? quando pretende?)')
        return falta
    }
    if (segmento === 'criador_po') {
        if (!str(p.interesse)) falta.push('o que ele busca agora (reforço de plantel, linhagem específica…)')
        if (!str(p.quantidade)) falta.push('quantas cabeças ele toca hoje')
        return falta
    }
    if (!str(p.interesse)) falta.push('o que ele busca (touros, matrizes, bezerras…)')
    if (!str(p.quantidade)) falta.push('quantas cabeças ele tem hoje')
    if (!str(p.sistema)) falta.push('se trabalha com cria, recria ou engorda')
    if (!str(p.rebanho)) falta.push('o que ele cria hoje (mestiço, comercial, já tem P.O.?)')
    return falta
}

export function computeFase(input: FaseInput): FaseResult {
    const falta = perfilFaltando(input.perfil, input.segmento ?? 'indefinido')
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
    // Sinal de compra explícito (urgência registrada + já sabemos o que ele busca):
    // segurar esse lead em descoberta é perder venda. Pula direto pra apresentação
    // e o "sim"; a qualificação fina acontece naturalmente durante a habilitação.
    const sinalCompra = ['agora', 'proximos_30_dias', 'proximos_leiloes'].includes(str(input.perfil.urgencia))
        && !!str(input.perfil.interesse)
    if (falta.length > 0 && !sinalCompra) {
        const enrolou = (input.turnosLead ?? 0) >= MAX_TURNOS_DESCOBERTA
        if (!enrolou) {
            return { ...base, fase: 'descoberta', motivo: `perfil incompleto (${falta.length} item(ns))` }
        }
        return { ...base, fase: 'apresentacao', motivo: `perfil incompleto, mas a conversa já se estendeu (${input.turnosLead} msgs) — apresentar assessoria` }
    }
    if (sinalCompra && !jaApresentou) {
        return { ...base, fase: 'apresentacao', motivo: 'sinal de compra explícito — apresentar a assessoria e buscar o "sim" já' }
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
        urgencia: str(xd.urgencia_compra) || null,
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
        'Você já entende a operação dele. Agora APRESENTE A BULA e o valor da assessoria — que é gratuita pro comprador.',
        'PROIBIDO nesta fase: pedir documento ou foto. Dado de cadastro só depois que ele topar o acompanhamento.',
        'Feche perguntando se ele quer que VOCÊ cuide do cadastro dele e o acompanhe no leilão (é o "sim" que destrava o resto).',
        'NÃO ofereça "falar com um assessor" nem "te passar para um assessor" — o assessor só entra depois do cadastro aprovado.',
        'Se ele já demonstrou o "sim" ("quero", "pode ser", "como faço?"), marque updates.aceitou_assessoria=true.',
    ],
    habilitacao: [
        'O lead topou. Agora sim: peça o que falta no checklist, enquadrado como o que destrava a participação dele no leilão.',
        'LEAD EMPOLGADO ≠ LEAD PRONTO: enquanto o cadastro não fecha, NÃO venda lote específico nem crie urgência de leilão — empolgação sem habilitação é só ansiedade, e ansiedade não dá lance se o cadastro travar. Canalize a empolgação pra concluir o cadastro ("pra você conseguir dar lance no sábado, só falta X").',
        'ESTE É O PONTO ONDE MAIS SE PERDE LEAD (a maioria abandona no pedido de dados). Antes do PRIMEIRO pedido, ancore a confiança em meia linha: é o cadastro padrão que a leiloeira pede pra liberar o lance, e os dados ficam só entre ele, a Bula e a leiloeira.',
        'COMECE PELO CPF — e SÓ o CPF. Diga que com ele você puxa o resto nos sistemas oficiais (I.E., fazenda, endereço): o lead não precisa digitar quase nada. Pedir lista de dados de uma vez é o que espanta.',
        'Se o CPF ainda não veio, peça só CPF + endereço de correspondência (cidade/UF/CEP). NÃO peça fazenda, I.E. nem documento ainda.',
        'Peça em UMA mensagem organizada, nunca item por item, e só o que está marcado com ✘.',
        'Dado marcado com ✔ NUNCA é pedido de novo — no máximo confirmado ("é isso mesmo?").',
        'Se ele hesitar, sumir ou desconversar depois de um pedido: NÃO repita a lista. Pergunte em 1 linha o que travou; se for desconfiança, aponte o site bulaassessoria.com e o @bulaassessoria e ofereça uma pessoa da equipe — nunca insista no dado com lead desconfiado.',
        'Documentos com foto são OPCIONAIS ("se der pra ir adiantando") e NUNCA travam o cadastro — se sentir resistência, siga só com os dados.',
        'Benefício em meia linha: com o cadastro aprovado ele já pode dar lance no próximo leilão.',
        'Quem conduz é VOCÊ. Não diga que vai encaminhar para um assessor — isso é depois da aprovação.',
    ],
    analise: [
        'Checklist completo: NÃO peça mais nada.',
        'Confirme o recebimento e diga que o cadastro foi enviado às leiloeiras parceiras para análise.',
        'Você pode dizer que, ASSIM QUE O CADASTRO FOR APROVADO, um assessor da Bula assume o acompanhamento dele nos leilões.',
        'Nunca diga que já está passando para o assessor agora — o cadastro ainda vai ser analisado.',
        'Marque documents_received=true e handoff=true.',
    ],
}

const TITULO: Record<ConciergeFase, string> = {
    descoberta: 'DESCOBERTA — entender o produtor (NADA de cadastro)',
    apresentacao: 'APRESENTAÇÃO — vender a assessoria e conseguir o "sim"',
    habilitacao: 'HABILITAÇÃO — coletar o que falta do checklist',
    analise: 'ANÁLISE — cadastro enviado às leiloeiras, aguardando aprovação',
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
    if (perfil.urgencia) sabe.push(`urgência: ${perfil.urgencia}`)
    if (sabe.length) lines.push('', `PERFIL JÁ LEVANTADO (não repita estas perguntas): ${sabe.join(' · ')}`)

    const quente = ['agora', 'proximos_30_dias', 'proximos_leiloes'].includes(String(perfil.urgencia ?? '').trim())
    if (r.fase === 'apresentacao' && quente) {
        lines.push('', 'LEAD COM SINAL DE COMPRA: não faça mais nenhuma pergunta de perfil. Meia linha de valor da assessoria + a pergunta do "sim" (você cuidar do cadastro e acompanhá-lo no leilão). O objetivo desta mensagem é UM: conseguir o "sim" pra habilitação.')
    }

    return lines.join('\n')
}
