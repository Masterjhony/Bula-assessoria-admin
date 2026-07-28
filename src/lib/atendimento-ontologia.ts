/**
 * ONTOLOGIA DO ATENDIMENTO — quem chamar, pra quê, e por quê não chamar.
 *
 * Este módulo é o cérebro do motor diário. Ele NÃO envia nada e NÃO fala com o
 * banco: recebe o estado de um lead e devolve a decisão do dia. Puro de
 * propósito — é a única forma de auditar "por que o sistema chamou este cara"
 * sem depender de o modelo lembrar do que fez.
 *
 * A divisão de trabalho com a IA é deliberada:
 *   • QUEM e PRA QUÊ  → determinístico, aqui. Regra de negócio não se terceiriza
 *                       pra LLM: ela erra em silêncio e ninguém descobre.
 *   • COMO falar      → template Meta aprovado (atendimento-plays.ts) com as
 *                       variáveis montadas a partir da qualificação real.
 *   • CONDUZIR        → o concierge (whatsapp-concierge.ts) assume assim que o
 *                       lead responde. O motor só abre a porta; quem atende é ele.
 *
 * O modelo mental: cada lead está num ESTADO (fase do funil × estado da
 * conversa). Pra cada estado existe uma dívida — a coisa mais útil que a gente
 * deve a ele agora. O play é o pagamento dessa dívida. Se não há dívida, ou se
 * pagar agora seria inconveniente, o lead simplesmente não é chamado hoje.
 *
 * ESCOPO: atendimento 1:1 pela API OFICIAL. Baileys/grupos não passa por aqui.
 */

import type { HabilitacaoChecklist } from './crm-habilitacao'
import type { ConciergeFase } from './concierge-fase'
import type { Segmento } from './concierge-persona'

// ── Vocabulário ─────────────────────────────────────────────────────────────

export type PlayId =
    /** Ele falou por último e a gente não respondeu. Dívida máxima. */
    | 'resgate_sem_resposta'
    /** Aceitou a assessoria, falta documento do dossiê, e parou. */
    | 'doc_pendente'
    /** Aceitou, mas ainda faltam DADOS (nome/CPF/I.E./endereço). */
    | 'dados_pendentes'
    /** Aceitou e sumiu faz tempo: oferece o self-service pra ele resolver sozinho. */
    | 'habilitacao_link'
    /** Checklist fechado, ficha na leiloeira: dar notícia antes que ele esfrie. */
    | 'cadastro_status'
    /** Já apresentamos a assessoria e o "sim" não veio. */
    | 'retoma_apresentacao'
    /** Conversou, mas nem o interesse a gente arrancou. */
    | 'retoma_interesse'
    /** Nunca foi tocado por ninguém. É aqui que os 13k da base entram. */
    | 'primeiro_contato'
    /** Tocado, nunca respondeu, tempo suficiente pra tentar de outro ângulo. */
    | 'reengaja_frio'
    /** Já conversou, não tem pressa: mantém aquecido com a agenda. */
    | 'agenda_leiloes'

/** Balde de cota — vários plays disputam o mesmo orçamento diário. */
export type Cota = 'resgate' | 'habilitacao' | 'retomada' | 'primeiro_contato' | 'reengajamento' | 'agenda'

export const COTA_DE: Record<PlayId, Cota> = {
    resgate_sem_resposta: 'resgate',
    doc_pendente: 'habilitacao',
    dados_pendentes: 'habilitacao',
    habilitacao_link: 'habilitacao',
    cadastro_status: 'habilitacao',
    retoma_apresentacao: 'retomada',
    retoma_interesse: 'retomada',
    primeiro_contato: 'primeiro_contato',
    reengaja_frio: 'reengajamento',
    agenda_leiloes: 'agenda',
}

/**
 * Régua de cada play: quanto tempo de silêncio ele exige pra entrar, quanto
 * tempo esperar antes de repetir, e quantas vezes no total.
 *
 * Os números não são chutes: saem do comportamento observado no atendimento —
 * cobrar documento no dia seguinte irrita, cobrar depois de uma semana perde o
 * embalo; lead frio que não respondeu 3 vezes não vira na quarta, vira opt-out.
 */
export interface ReguaPlay {
    /** Dias de silêncio (sem NENHUMA mensagem na conversa) pra o play ficar elegível. */
    silencioMin: number
    /**
     * Teto de silêncio. Passou disso, o play perde o sentido e o lead cai para
     * um play de reaquecimento.
     *
     * Sem isto o motor envelhece mal: "falta só o documento pra concluir seu
     * cadastro" é verdade no 5º dia e constrangedor no 90º — quem sumiu há três
     * meses não está no meio de um cadastro, está frio. Cobrar item de checklist
     * de alguém que já esqueceu a conversa é o tipo de mensagem que vira bloqueio.
     */
    silencioMax?: number
    /** Dias mínimos entre dois toques DESTE play no mesmo lead. */
    cooldownDias: number
    /** Teto de toques deste play por lead, na vida. */
    maxToques: number
    /** Prioridade base (0-100). O desempate fino vem dos sinais do lead. */
    prioridade: number
}

export const REGUA: Record<PlayId, ReguaPlay> = {
    // Sem silêncio mínimo: se ele escreveu e ninguém respondeu, a dívida é agora.
    // Sem teto também: passivo velho continua sendo passivo — o de 26 dias que
    // ficou sem resposta merece a retomada tanto quanto o de ontem.
    resgate_sem_resposta: { silencioMin: 0, cooldownDias: 1, maxToques: 3, prioridade: 100 },

    doc_pendente:        { silencioMin: 2,  silencioMax: 30, cooldownDias: 3,  maxToques: 4, prioridade: 88 },
    dados_pendentes:     { silencioMin: 2,  silencioMax: 30, cooldownDias: 3,  maxToques: 4, prioridade: 86 },
    habilitacao_link:    { silencioMin: 5,  silencioMax: 45, cooldownDias: 10, maxToques: 2, prioridade: 82 },
    cadastro_status:     { silencioMin: 5,  silencioMax: 45, cooldownDias: 7,  maxToques: 3, prioridade: 80 },

    retoma_apresentacao: { silencioMin: 4,  silencioMax: 60, cooldownDias: 6,  maxToques: 3, prioridade: 66 },
    retoma_interesse:    { silencioMin: 4,  silencioMax: 60, cooldownDias: 6,  maxToques: 3, prioridade: 62 },

    primeiro_contato:    { silencioMin: 0,  cooldownDias: 0,  maxToques: 1, prioridade: 50 },

    // Os dois de baixo são justamente o destino de quem passou dos tetos acima.
    reengaja_frio:       { silencioMin: 21, cooldownDias: 30, maxToques: 2, prioridade: 34 },
    agenda_leiloes:      { silencioMin: 14, cooldownDias: 21, maxToques: 6, prioridade: 30 },
}

/**
 * Teto global de toques sem NENHUMA resposta. Quem levou 4 mensagens nossas e
 * nunca respondeu não está frio: está errado (número trocado, não é produtor,
 * não quer). Insistir é o que gera denúncia e derruba o número.
 */
export const MAX_TOQUES_SEM_RESPOSTA = 4

// ── Entrada ─────────────────────────────────────────────────────────────────

/** O que a conversa conta sobre este lead. Derivado de whatsapp_messages. */
export interface EstadoConversa {
    ultimoInboundAt: string | null
    ultimoOutboundAt: string | null
    totalInbound: number
    totalOutbound: number
}

export interface ToqueHistorico {
    play: PlayId
    /** Quando saiu de fato (status enviado). */
    sentAt: string
    respondeu: boolean
}

/** Recorte de crm_leads que a ontologia precisa. */
export interface LeadOntologia {
    id: string
    nome: string | null
    telefone: string | null
    celular: string | null
    optout_whatsapp: boolean | null
    handoff_humano: boolean | null
    arquivado: boolean | null
    stage: string | null
    temperatura: string | null
    is_mql: boolean | null
    quantidade_animais: string | null
    tem_inscricao_estadual: string | null
    extra_data: Record<string, unknown> | null
}

export interface EntradaDecisao {
    lead: LeadOntologia
    conversa: EstadoConversa
    checklist: HabilitacaoChecklist
    fase: ConciergeFase
    segmento: Segmento
    /** Toques anteriores deste lead, mais recente primeiro. */
    toques: ToqueHistorico[]
    /** Instante de referência (o planejador passa o mesmo pra base inteira). */
    agora: Date
}

// ── Saída ───────────────────────────────────────────────────────────────────

export interface Decisao {
    /** null = não chamar hoje. */
    play: PlayId | null
    /** Frase legível pro painel e pro card. Sempre preenchida. */
    motivo: string
    prioridade: number
    cota: Cota | null
    /** Janela de 24h aberta → dá pra mandar texto livre em vez de template. */
    janelaAberta: boolean
    /** Preenchido quando play=null: por que este lead ficou de fora. */
    bloqueio?: string
    /** Dias desde a última mensagem da conversa (qualquer direção). null = nunca houve. */
    silencioDias: number | null
}

// ── Utilitários ─────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000

function diasDesde(iso: string | null, agora: Date): number | null {
    if (!iso) return null
    const t = new Date(iso).getTime()
    if (Number.isNaN(t)) return null
    return (agora.getTime() - t) / DIA_MS
}

function xd(lead: LeadOntologia): Record<string, unknown> {
    return (lead.extra_data ?? {}) as Record<string, unknown>
}

function bloqueio(motivo: string, razao: string, janelaAberta: boolean, silencioDias: number | null): Decisao {
    return { play: null, motivo, bloqueio: razao, prioridade: 0, cota: null, janelaAberta, silencioDias }
}

/**
 * Cooldown/teto por play, lidos do histórico. Devolve o motivo do veto ou null
 * se o play está liberado.
 */
function vetoPorHistorico(play: PlayId, toques: ToqueHistorico[], agora: Date): string | null {
    const regua = REGUA[play]
    const doPlay = toques.filter(t => t.play === play)
    if (doPlay.length >= regua.maxToques) {
        return `teto de ${regua.maxToques} toques de ${play} já atingido`
    }
    const ultimo = doPlay[0]
    if (ultimo) {
        const d = diasDesde(ultimo.sentAt, agora)
        if (d != null && d < regua.cooldownDias) {
            return `cooldown de ${play} (último há ${d.toFixed(1)}d, mínimo ${regua.cooldownDias}d)`
        }
    }
    return null
}

/**
 * Ajuste fino da prioridade pelos sinais comerciais do lead. Dois leads no mesmo
 * play não valem o mesmo: quem tem 500 cabeças e I.E. em dia vale mais atenção
 * que quem marcou "quero aprender" e nunca voltou. Isso só ORDENA a fila — nunca
 * cria nem remove elegibilidade.
 */
export function bonusPrioridade(lead: LeadOntologia): number {
    let b = 0
    const x = xd(lead)

    if (lead.is_mql) b += 6
    if (String(lead.temperatura ?? '').toLowerCase() === 'quente') b += 5

    const urgencia = String(x.urgencia_compra ?? '')
    if (urgencia === 'agora') b += 8
    else if (urgencia === 'proximos_30_dias') b += 5
    else if (urgencia === 'proximos_leiloes') b += 2

    // Rebanho: proxy de porte. "120", "50+", "acima de 200" → pega o primeiro nº.
    const cabecas = Number(String(lead.quantidade_animais ?? '').replace(/\D+/g, '').slice(0, 5))
    if (Number.isFinite(cabecas)) {
        if (cabecas >= 500) b += 6
        else if (cabecas >= 100) b += 4
        else if (cabecas >= 30) b += 2
    }

    // I.E. é o gargalo #1 da habilitação: quem já tem chega mais longe.
    if (String(lead.tem_inscricao_estadual ?? '').toLowerCase() === 'sim') b += 4

    // Já respondeu alguma vez = relação viva, vale mais que número frio.
    if (x.aceitou_assessoria === true) b += 6

    return b
}

// ── A decisão ───────────────────────────────────────────────────────────────

/**
 * Decide o toque do dia para UM lead.
 *
 * A ordem dos blocos é a ordem de prioridade do negócio: primeiro os bloqueios
 * (o que nunca pode), depois as dívidas na ordem em que valem dinheiro. O
 * primeiro play elegível ganha — não existe "acumular dois toques no mesmo dia".
 */
export function decidirToque(entrada: EntradaDecisao): Decisao {
    const { lead, conversa, checklist, fase, toques, agora } = entrada
    const x = xd(lead)

    const silencioBruto = Math.min(
        diasDesde(conversa.ultimoInboundAt, agora) ?? Number.POSITIVE_INFINITY,
        diasDesde(conversa.ultimoOutboundAt, agora) ?? Number.POSITIVE_INFINITY,
    )
    const silencioDias = Number.isFinite(silencioBruto) ? silencioBruto : null
    const inboundDias = diasDesde(conversa.ultimoInboundAt, agora)
    const janelaAberta = inboundDias != null && inboundDias < 1

    // ── 1. Bloqueios duros ───────────────────────────────────────────────────
    // Ordem importa só pra clareza do motivo no painel; qualquer um veta.

    if (lead.optout_whatsapp) {
        return bloqueio('Pediu pra não receber mais', 'optout', janelaAberta, silencioDias)
    }
    if (lead.arquivado) {
        return bloqueio('Lead arquivado', 'arquivado', janelaAberta, silencioDias)
    }
    if (!lead.telefone && !lead.celular) {
        return bloqueio('Sem telefone', 'sem_telefone', janelaAberta, silencioDias)
    }
    if (lead.handoff_humano) {
        // O assessor assumiu. O robô calar a boca aqui é o comportamento certo:
        // mensagem automática por cima de conversa humana queima a relação.
        return bloqueio('Assessor humano assumiu a conversa', 'handoff_humano', janelaAberta, silencioDias)
    }
    if (String(lead.stage ?? '').toUpperCase() === 'PERDIDOS') {
        return bloqueio('Etapa PERDIDOS', 'perdidos', janelaAberta, silencioDias)
    }

    // O callback agendado tem dono: /api/cron/followup-callback. Se o lead
    // combinou "me chama terça", quem chama é aquele cron, com o texto do que
    // foi combinado. O motor passar na frente seria quebrar a promessa.
    const followupDue = String(x.followup_due_at ?? '')
    if (followupDue) {
        return bloqueio('Retomada já agendada com o lead', 'followup_agendado', janelaAberta, silencioDias)
    }

    // Conversa viva: ele respondeu hoje e a gente já respondeu de volta. O
    // concierge está conduzindo — motor não interrompe.
    if (janelaAberta && conversa.ultimoOutboundAt && conversa.ultimoInboundAt
        && new Date(conversa.ultimoOutboundAt) > new Date(conversa.ultimoInboundAt)) {
        return bloqueio('Conversa em andamento com o concierge', 'conversa_ativa', janelaAberta, silencioDias)
    }

    // Esgotamento: N toques, zero resposta. Para de vez.
    const semResposta = toques.filter(t => !t.respondeu).length
    const algumaResposta = toques.some(t => t.respondeu)
    if (!algumaResposta && semResposta >= MAX_TOQUES_SEM_RESPOSTA) {
        return bloqueio(
            `${semResposta} toques sem nenhuma resposta`,
            'esgotado_sem_resposta',
            janelaAberta,
            silencioDias,
        )
    }

    const nome = String(lead.nome ?? '').split(/\s+/)[0] || 'o lead'
    const bonus = bonusPrioridade(lead)

    /** Fecha a decisão com um play, respeitando cooldown/teto. */
    const escolher = (play: PlayId, motivo: string): Decisao | null => {
        const veto = vetoPorHistorico(play, toques, agora)
        if (veto) return null
        const regua = REGUA[play]
        if (silencioDias != null && silencioDias < regua.silencioMin) return null
        if (regua.silencioMax != null && silencioDias != null && silencioDias > regua.silencioMax) return null
        return {
            play,
            motivo,
            prioridade: Math.min(100, regua.prioridade + bonus),
            cota: COTA_DE[play],
            janelaAberta,
            silencioDias,
        }
    }

    const candidatos: Array<Decisao | null> = []

    // ── 2. Dívida máxima: ele falou, ninguém respondeu ───────────────────────
    // Vale mesmo com a janela fechada — aí vira template de retomada. Note que
    // "sem resposta" aqui é estrutural (último inbound > último outbound), não
    // "o concierge falhou": pode ter sido fora do horário, erro de envio, ou
    // mensagem que chegou enquanto o sistema estava fora do ar.
    const semRespostaNossa = conversa.ultimoInboundAt
        && (!conversa.ultimoOutboundAt
            || new Date(conversa.ultimoInboundAt) > new Date(conversa.ultimoOutboundAt))
    if (semRespostaNossa) {
        const h = (inboundDias ?? 0) * 24
        // Menos de 2h ainda é janela normal de resposta do concierge — não
        // atropela: ele responde em segundos quando está de pé.
        if (h >= 2) {
            candidatos.push(escolher(
                'resgate_sem_resposta',
                `${nome} escreveu há ${h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`} e ficou sem resposta`,
            ))
        } else {
            return bloqueio('Escreveu agora há pouco — concierge tem a vez', 'aguardando_concierge', janelaAberta, silencioDias)
        }
    }

    // ── 3. Habilitação: quem já disse SIM e travou no meio ───────────────────
    const aceitou = x.aceitou_assessoria === true || !!x.aceitou_assessoria_at
    if (aceitou && !checklist.complete) {
        const faltamDocs = checklist.items.some(i => i.group === 'documentos' && !i.done)
        const faltamDados = checklist.items.some(i => i.group !== 'documentos' && !i.done && !i.optional)

        // Sumiu faz tempo: em vez de pedir item por item, entrega o self-service.
        if (!x.habilitacao_link_enviado_at) {
            candidatos.push(escolher(
                'habilitacao_link',
                `${nome} aceitou a assessoria e sumiu há ${Math.round(silencioDias ?? 0)}d — oferecer o formulário pra resolver sozinho`,
            ))
        }
        if (faltamDocs) {
            const oQueFalta = checklist.items.find(i => i.group === 'documentos' && !i.done)?.label ?? 'documento'
            candidatos.push(escolher(
                'doc_pendente',
                `Cadastro de ${nome} parado: falta ${oQueFalta.toLowerCase()}`,
            ))
        }
        if (faltamDados) {
            const oQueFalta = checklist.missingLabels.slice(0, 2).join(' e ') || 'dados do titular'
            candidatos.push(escolher(
                'dados_pendentes',
                `Cadastro de ${nome} parado: falta ${oQueFalta.toLowerCase()}`,
            ))
        }
    }

    // ── 4. Ficha completa esperando a leiloeira ──────────────────────────────
    if (checklist.complete && !x.cadastro_aprovado) {
        candidatos.push(escolher(
            'cadastro_status',
            `Ficha de ${nome} está com as leiloeiras há ${Math.round(silencioDias ?? 0)}d — dar notícia antes que esfrie`,
        ))
    }

    // ── 5. Conversou e parou antes do "sim" ──────────────────────────────────
    if (!aceitou && conversa.totalInbound > 0) {
        if (fase === 'apresentacao' || x.assessoria_apresentada_at) {
            candidatos.push(escolher(
                'retoma_apresentacao',
                `${nome} ouviu a proposta e não fechou — ${Math.round(silencioDias ?? 0)}d de silêncio`,
            ))
        } else {
            candidatos.push(escolher(
                'retoma_interesse',
                `${nome} respondeu mas não chegamos a entender o que ele busca`,
            ))
        }
    }

    // ── 6. Nunca foi tocado ──────────────────────────────────────────────────
    // Aqui mora o grosso da base (leads importados que nunca receberam nada).
    // É o play que faz a lista "evoluir" no sentido literal.
    if (conversa.totalOutbound === 0 && conversa.totalInbound === 0) {
        candidatos.push(escolher(
            'primeiro_contato',
            `${nome} nunca foi contatado — primeira abordagem`,
        ))
    }

    // ── 7. Frio: tocado, nunca respondeu ─────────────────────────────────────
    if (conversa.totalOutbound > 0 && conversa.totalInbound === 0) {
        candidatos.push(escolher(
            'reengaja_frio',
            `${nome} recebeu contato e nunca respondeu — nova tentativa por outro ângulo`,
        ))
    }

    // ── 8. Manutenção: já conversou, sem pressa ──────────────────────────────
    if (conversa.totalInbound > 0) {
        candidatos.push(escolher(
            'agenda_leiloes',
            `Manter ${nome} aquecido com a agenda dos próximos leilões`,
        ))
    }

    const elegiveis = candidatos.filter((c): c is Decisao => c !== null)
    if (elegiveis.length === 0) {
        return bloqueio(
            'Nada a fazer hoje (cooldown, teto ou silêncio insuficiente)',
            'sem_play_elegivel',
            janelaAberta,
            silencioDias,
        )
    }

    elegiveis.sort((a, b) => b.prioridade - a.prioridade)
    return elegiveis[0]
}

/** Rótulos legíveis dos plays — painel, card do lead e relatório. */
export const PLAY_LABEL: Record<PlayId, string> = {
    resgate_sem_resposta: 'Resgate — ficou sem resposta',
    doc_pendente: 'Documento pendente',
    dados_pendentes: 'Dados do cadastro pendentes',
    habilitacao_link: 'Link de habilitação (self-service)',
    cadastro_status: 'Notícia do cadastro',
    retoma_apresentacao: 'Retomar depois da proposta',
    retoma_interesse: 'Retomar interesse',
    primeiro_contato: 'Primeiro contato',
    reengaja_frio: 'Reengajar frio',
    agenda_leiloes: 'Agenda de leilões',
}
