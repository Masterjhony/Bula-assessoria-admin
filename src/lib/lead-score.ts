/**
 * TERMÔMETRO DO LEAD — a equação do Modelo Matemático de Conversão (PDF 18/07)
 * adaptada ao que o CRM realmente observa. Tudo determinístico e grátis: nada
 * de chamada de IA — os sinais saem de crm_leads/extra_data/checklist.
 *
 * Seis dimensões 0..1 + função logística → prontidão (p) + GARGALO (a dimensão
 * mais baixa), que diz ao concierge O QUE destravar na próxima mensagem e à
 * fila de follow-up QUEM priorizar. p NÃO é "probabilidade de comprar": é a
 * chance estimada de o lead executar o próximo passo do cadastro.
 *
 * Os PESOS abaixo são priors de projeto (o PDF manda calibrar com eventos
 * reais; com ~8 semanas de dados dá pra ajustar por regressão logística — os
 * snapshots ficam em extra_data.lead_score justamente pra isso).
 */
import type { HabilitacaoChecklist } from './crm-habilitacao'

export interface LeadScoreInput {
    /** interesse conhecido (formulário/campanha/conversa)? */
    interesse: string | null
    objetivo: string | null
    /** agora | proximos_30_dias | proximos_leiloes | sem_prazo | null */
    urgencia: string | null
    /** nº de mensagens do lead na conversa (0 = nunca respondeu) */
    msgsLead: number
    cpfPresente: boolean
    docsRecebidos: number
    aceitouAssessoria: boolean
    /** risco | logistica | valor | contexto | incerteza | null */
    objecaoTipo: string | null
    /** lead combinou janela de retomada ("quando-então")? */
    retomadaCombinada: boolean
    checklist: Pick<HabilitacaoChecklist, 'done' | 'total'> | null
}

export interface LeadScore {
    valor: number
    confianca: number
    facilidade: number
    momento: number
    progresso: number
    /** Atrito+risco RESTANTE (alto = ruim). */
    atrito: number
    /** Prontidão: sigmoid dos termos acima. */
    prob: number
    gargalo: 'valor' | 'confianca' | 'facilidade' | 'momento' | 'progresso' | 'atrito'
    /** Instrução curta de destrave, casada com o gargalo. */
    acao: string
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

/** Priors da logística — calibrar com dados reais quando houver volume. */
const PESOS = { bias: -2.2, valor: 1.6, confianca: 1.8, facilidade: 1.1, momento: 1.0, progresso: 1.2, atrito: -1.4 }

const ACAO_POR_GARGALO: Record<LeadScore['gargalo'], string> = {
    valor: 'conecte o cadastro a um ganho CONCRETO pra ele (lote/categoria que busca, parcelamento em 30x que o cadastro libera) — não argumento genérico',
    confianca: 'destrave CONFIANÇA: identidade, finalidade dos dados e site/Instagram — zero argumento de venda e zero pedido de dado nesta mensagem',
    facilidade: 'reduza o trabalho: peça UMA coisa só, a mais fácil que falta, e mostre que o resto você organiza',
    momento: 'o timing é o problema: combine uma janela concreta ("hoje à noite ou amanhã de manhã?") em vez de insistir agora',
    progresso: 'mostre a jornada iniciada: o que JÁ está salvo, qual bloco está completo e o único passo que falta',
    atrito: 'simplifique o pedido: agrupe o que falta em UMA mensagem organizada por bloco e tire da frente qualquer item opcional',
}

export function computeLeadScore(i: LeadScoreInput): LeadScore {
    const urg = String(i.urgencia ?? '')
    const urgente = urg === 'agora' || urg === 'proximos_leiloes' || urg === 'proximos_30_dias'

    const valor = clamp01(
        0.2
        + (i.interesse ? 0.4 : 0)
        + (i.objetivo ? 0.2 : 0)
        + (urgente ? 0.2 : 0)
        - (i.objecaoTipo === 'valor' ? 0.3 : 0),
    )
    const confianca = clamp01(
        (i.msgsLead > 0 ? 0.3 : 0.1)
        + (i.msgsLead >= 3 ? 0.2 : 0)
        + (i.cpfPresente || i.docsRecebidos > 0 ? 0.3 : 0)
        + (i.aceitouAssessoria ? 0.2 : 0)
        - (i.objecaoTipo === 'risco' ? 0.4 : 0),
    )
    const facilidade = clamp01(
        0.3
        + (i.cpfPresente ? 0.3 : 0)
        + (i.docsRecebidos > 0 ? 0.2 : 0)
        + (i.retomadaCombinada ? 0.2 : 0)
        - (i.objecaoTipo === 'logistica' ? 0.3 : 0),
    )
    const momento = clamp01(
        0.4
        + (urg === 'agora' ? 0.4 : urgente ? 0.2 : 0)
        + (i.retomadaCombinada ? 0.2 : 0)
        - (urg === 'sem_prazo' ? 0.3 : 0),
    )
    const cl = i.checklist
    const progresso = clamp01(
        (cl && cl.total > 0 ? cl.done / cl.total : 0)
        + (i.aceitouAssessoria ? 0.15 : 0),
    )
    const atrito = clamp01(
        (cl && cl.total > 0 ? (cl.total - cl.done) / cl.total : 0.8)
        * (i.aceitouAssessoria ? 1 : 0.6)   // atrito só pesa de verdade depois do "sim"
        + (i.objecaoTipo === 'risco' || i.objecaoTipo === 'logistica' ? 0.2 : 0)
        + (i.objecaoTipo === 'incerteza' ? 0.15 : 0),
    )

    const prob = sigmoid(
        PESOS.bias
        + PESOS.valor * valor
        + PESOS.confianca * confianca
        + PESOS.facilidade * facilidade
        + PESOS.momento * momento
        + PESOS.progresso * progresso
        + PESOS.atrito * atrito,
    )

    // Gargalo: a dimensão que mais está segurando p (atrito entra invertido).
    const dims: Array<[LeadScore['gargalo'], number]> = [
        ['valor', valor], ['confianca', confianca], ['facilidade', facilidade],
        ['momento', momento], ['progresso', progresso], ['atrito', 1 - atrito],
    ]
    dims.sort((a, b) => a[1] - b[1])
    const gargalo = dims[0][0]

    return {
        valor, confianca, facilidade, momento, progresso, atrito,
        prob: Math.round(prob * 100) / 100,
        gargalo,
        acao: ACAO_POR_GARGALO[gargalo],
    }
}

const f = (n: number) => n.toFixed(2)

/** Bloco injetado no prompt do concierge — a equação vira instrução de conduta. */
export function leadScorePromptBlock(s: LeadScore): string {
    return [
        `TERMÔMETRO DO LEAD (computado dos dados, 0 a 1): valor ${f(s.valor)} · confiança ${f(s.confianca)} · facilidade ${f(s.facilidade)} · momento ${f(s.momento)} · progresso ${f(s.progresso)} · atrito restante ${f(s.atrito)} → prontidão ${Math.round(s.prob * 100)}%.`,
        `GARGALO ATUAL: ${s.gargalo.toUpperCase()} — nesta resposta, ${s.acao}.`,
        'O termômetro orienta O QUE destravar; a FASE continua mandando no que é permitido pedir.',
    ].join('\n')
}
