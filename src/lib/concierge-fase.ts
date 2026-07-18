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
 * Teto de perguntas de descoberta. Decisão comercial de 18/07: o lead
 * geralmente JÁ VEM qualificado da campanha (formulário diz o que busca) —
 * descoberta é exceção, não etapa. Duas mensagens sem descobrir o interesse e
 * a gente apresenta a assessoria assim mesmo.
 */
export const MAX_TURNOS_DESCOBERTA = 2

const str = (v: unknown) => String(v ?? '').trim()

/**
 * Descoberta MÍNIMA: só falta algo quando não sabemos nem o que o lead busca.
 * Sistema/rebanho/quantidade deixaram de ser porteira de fase (18/07) — viram
 * registro oportunista durante a conversa. Qualificar fundo quem já veio
 * qualificado da campanha era gastar turnos que deviam virar cadastro.
 */
export function perfilFaltando(p: PerfilLead, segmento: Segmento = 'indefinido'): string[] {
    if (str(p.interesse) || str(p.objetivo)) return []
    if (segmento === 'iniciante') {
        return ['o que ele quer começar a criar (melhorar com touro? formar plantel com matrizes?)']
    }
    return ['o que ele busca (touros, matrizes, genética…)']
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
    // Interesse conhecido (formulário da campanha, classificação ou conversa) =
    // lead qualificado o suficiente. Descoberta só quando não sabemos NEM o que
    // ele busca — e mesmo assim por no máximo MAX_TURNOS_DESCOBERTA mensagens.
    if (falta.length > 0) {
        const enrolou = (input.turnosLead ?? 0) >= MAX_TURNOS_DESCOBERTA
        if (!enrolou) {
            return { ...base, fase: 'descoberta', motivo: 'não sabemos o que o lead busca' }
        }
        return { ...base, fase: 'apresentacao', motivo: `interesse não descoberto em ${input.turnosLead} msgs — apresentar assessoria assim mesmo` }
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
        'Você ainda não sabe O QUE o lead busca. UMA pergunta objetiva pra descobrir (touros, matrizes, genética, começar do zero?) — e nada além disso.',
        'PROIBIDO nesta fase: pedir CPF, e-mail, endereço, Inscrição Estadual, foto de documento ou qualquer dado de cadastro.',
        'NÃO transforme em questionário: sistema, rebanho e quantidade são registro oportunista se ele mencionar, nunca pergunta em série.',
    ],
    apresentacao: [
        'O lead já vem qualificado (formulário/campanha) na maioria dos casos: referencie o que ele declarou ("você busca matrizes...") em vez de perguntar de novo.',
        'APRESENTE A BULA em 2-3 linhas — assessoria gratuita pro comprador, time que analisa os animais antes do remate e acompanha o lance — e feche com a pergunta do "sim": ele quer que VOCÊ deixe o cadastro dele pronto pra comprar em leilão?',
        'Ao propor o cadastro, dê o PORQUÊ comercial em meia linha: a compra em leilão é parcelada (ex.: 30x no boleto) direto com a leiloeira — como é ela que assume o risco do parcelamento, ela só libera lance de cadastro aprovado. Cadastro = crédito aprovado pra dar lance, não burocracia.',
        'PROIBIDO nesta fase: pedir documento ou foto. Dado de cadastro só depois do "sim".',
        'NÃO ofereça "falar com um assessor", "uma pessoa da equipe" nem similar — o assessor só entra DEPOIS do cadastro aprovado, e quem conduz até lá é você.',
        'Se ele já demonstrou o "sim" ("quero", "pode ser", "como faço?"), marque updates.aceitou_assessoria=true.',
    ],
    habilitacao: [
        'O lead topou. Objetivo único desta fase: FECHAR O CADASTRO. Cada mensagem sua ou coleta um dado/documento ou destrava uma objeção.',
        'LEAD EMPOLGADO ≠ LEAD PRONTO: enquanto o cadastro não fecha, NÃO venda lote específico nem crie urgência de leilão. Canalize a empolgação pra concluir o cadastro ("pra você conseguir dar lance no sábado, só falta X").',
        'Antes do PRIMEIRO pedido, ancore o porquê em uma linha: como a compra é parcelada, a leiloeira precisa dos dados e documentos de quem vai dar lance — é o cadastro dela que libera seu crédito. Os dados ficam entre ele, a Bula e a leiloeira.',
        'Peça em UMA mensagem organizada TUDO que falta com ✘ nos DADOS: nome completo, CPF, Inscrição Estadual (ou NIRF), endereço e e-mail. O lead fornece os dados — não prometa "puxar nos sistemas" nem consultar nada por ele.',
        'DOCUMENTOS FAZEM PARTE DO CADASTRO PADRÃO: foto de um documento com foto (RG/CNH) e comprovante de endereço. Peça junto com os dados, como exigência normal da leiloeira — não como favor opcional. Se ele não tiver em mãos, registre o que veio e combine quando manda o resto; não deixe morrer.',
        'Dado marcado com ✔ NUNCA é pedido de novo — no máximo confirmado ("é isso mesmo?").',
        'Se ele hesitar, sumir ou desconversar depois de um pedido: NÃO repita a lista. Pergunte em 1 linha o que travou; se for desconfiança, aponte o site bulaassessoria.com e o Instagram @bulaassessoria.',
        'Benefício em meia linha: com o cadastro aprovado ele já pode dar lance no próximo leilão.',
        'Quem conduz é VOCÊ até o fim. NUNCA ofereça encaminhar para assessor ou "pessoa da equipe" — assessor é o prêmio de cadastro aprovado.',
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
