/**
 * Grafo visual da sequência de uma campanha.
 *
 * O modelo de dados real é linear: a campanha tem um conteúdo (passo 0) +
 * uma lista `whatsapp_campaign_steps` com step_order 1..N e delay relativo
 * ao step anterior. Para o editor visual, expomos isso como um grafo:
 *
 *   start ──► message (passo 0) ──► wait ──► message (passo 1) ──► wait ──► … ──► end
 *
 * `wait` é um nó separado (mais legível visualmente) que carrega o
 * delay_value/unit do step IMEDIATAMENTE SEGUINTE. O passo 0 é o conteúdo
 * salvo na própria campanha (campaigns.template_id / body / media_*).
 *
 * Validação é estrita-linear: 1 start, 1 end, um único caminho, sem ciclos
 * nem bifurcações. Se o operador tentar ramificar, o save é bloqueado.
 */

import type { Campaign, CampaignStep, CampaignDelayUnit } from '@/components/admin/central-whatsapp/types'

export type CampaignNodeType = 'c_start' | 'c_message' | 'c_wait' | 'c_end'

export interface CampaignNodeBase {
    id: string
    type: CampaignNodeType
    position: { x: number; y: number }
    label?: string
}

export interface CampaignStartNode extends CampaignNodeBase {
    type: 'c_start'
}

/**
 * Nó de mensagem. Pode referenciar um template (slug via template_id) ou
 * carregar body livre. Mídia anexa também opcional. O passo 0 fica marcado
 * com `isStepZero=true` (corresponde aos campos da própria campanha).
 */
export interface CampaignMessageNode extends CampaignNodeBase {
    type: 'c_message'
    data: {
        isStepZero?: boolean              // único nó que mapeia pra campaigns.* (não pra steps)
        stepId?: string | null            // id do registro em whatsapp_campaign_steps (null = step novo, ainda não persistido)
        template_id: string | null
        body: string | null
        media_url: string | null
        media_type: 'image' | 'video' | 'audio' | 'document' | null
        media_mime: string | null
        media_filename: string | null
        media_caption: string | null
    }
}

/** Nó de espera. Define quanto tempo aguardar até o PRÓXIMO `c_message`. */
export interface CampaignWaitNode extends CampaignNodeBase {
    type: 'c_wait'
    data: {
        delay_value: number               // >= 0
        delay_unit: CampaignDelayUnit     // 'minutes' | 'hours' | 'days'
    }
}

export interface CampaignEndNode extends CampaignNodeBase {
    type: 'c_end'
}

export type CampaignNode =
    | CampaignStartNode
    | CampaignMessageNode
    | CampaignWaitNode
    | CampaignEndNode

export interface CampaignEdge {
    id: string
    source: string
    target: string
}

export interface CampaignGraph {
    version: 1
    nodes: CampaignNode[]
    edges: CampaignEdge[]
}

/* ─── Conversor: campanha + steps → grafo linear ──────────────────── */

/**
 * Monta o grafo linear a partir do passo 0 (a própria campanha) e dos
 * passos 1..N (whatsapp_campaign_steps).
 *
 * Posições são calculadas em coluna única (x fixo, y crescente). O operador
 * pode arrastar pra acomodar o que quiser; ao salvar, a ordem importa, não
 * a posição.
 */
export function buildCampaignGraph(campaign: Campaign, steps: CampaignStep[]): CampaignGraph {
    const ordered = [...steps].sort((a, b) => a.step_order - b.step_order)

    const nodes: CampaignNode[] = []
    const edges: CampaignEdge[] = []

    const COL_X = 280
    const ROW_DY = 130
    let y = 40

    // start
    const startId = 'c_start'
    nodes.push({
        id: startId,
        type: 'c_start',
        position: { x: COL_X, y },
        label: 'Início da campanha',
    })
    y += ROW_DY

    // step 0 — a própria campanha
    const stepZeroId = 'c_msg_0'
    nodes.push({
        id: stepZeroId,
        type: 'c_message',
        position: { x: COL_X, y },
        label: 'Mensagem inicial',
        data: {
            isStepZero: true,
            stepId: null,
            template_id: campaign.template_id,
            body: campaign.body,
            media_url: campaign.media_url,
            media_type: campaign.media_type,
            media_mime: campaign.media_mime,
            media_filename: campaign.media_filename,
            media_caption: campaign.media_caption,
        },
    })
    edges.push({ id: `e_${startId}_${stepZeroId}`, source: startId, target: stepZeroId })
    y += ROW_DY

    // alterna wait → message pra cada step 1..N
    let prevNodeId = stepZeroId
    for (let i = 0; i < ordered.length; i++) {
        const s = ordered[i]
        const waitId = `c_wait_${i + 1}`
        const msgId = `c_msg_${i + 1}`

        nodes.push({
            id: waitId,
            type: 'c_wait',
            position: { x: COL_X, y },
            label: 'Esperar',
            data: { delay_value: s.delay_value, delay_unit: s.delay_unit },
        })
        edges.push({ id: `e_${prevNodeId}_${waitId}`, source: prevNodeId, target: waitId })
        y += ROW_DY

        nodes.push({
            id: msgId,
            type: 'c_message',
            position: { x: COL_X, y },
            label: `Follow-up ${i + 1}`,
            data: {
                isStepZero: false,
                stepId: s.id,
                template_id: s.template_id,
                body: s.body,
                media_url: s.media_url,
                media_type: s.media_type,
                media_mime: s.media_mime,
                media_filename: s.media_filename,
                media_caption: s.media_caption,
            },
        })
        edges.push({ id: `e_${waitId}_${msgId}`, source: waitId, target: msgId })
        y += ROW_DY

        prevNodeId = msgId
    }

    // end
    const endId = 'c_end'
    nodes.push({
        id: endId,
        type: 'c_end',
        position: { x: COL_X, y },
        label: 'Fim da campanha',
    })
    edges.push({ id: `e_${prevNodeId}_${endId}`, source: prevNodeId, target: endId })

    return { version: 1, nodes, edges }
}

/* ─── Conversor: grafo linear → campanha + steps ───────────────────── */

export interface CampaignGraphFlatten {
    /** Conteúdo do passo 0 (vai pra campaigns.*). Sempre presente — o grafo
     *  obriga ter pelo menos uma mensagem. */
    stepZero: CampaignMessageNode['data']
    /** Steps 1..N (vai pra whatsapp_campaign_steps). Cada um carrega o delay
     *  do `c_wait` que o precede no grafo. */
    followUps: Array<{
        stepId: string | null
        delay_value: number
        delay_unit: CampaignDelayUnit
        content: CampaignMessageNode['data']
    }>
}

/**
 * Achata o grafo linear pra o shape do backend.
 * Pré-condição: grafo passou em `validateCampaignGraph`.
 */
export function flattenCampaignGraph(graph: CampaignGraph): CampaignGraphFlatten {
    const sequence = walkLinearSequence(graph)
    if (sequence.length === 0) {
        throw new Error('Grafo vazio — nem o start foi encontrado.')
    }

    // Espera-se: start → c_message (step0) → (c_wait → c_message)* → end
    let stepZero: CampaignMessageNode['data'] | null = null
    const followUps: CampaignGraphFlatten['followUps'] = []
    let pendingDelay: { v: number; u: CampaignDelayUnit } | null = null

    for (const node of sequence) {
        if (node.type === 'c_start' || node.type === 'c_end') continue
        if (node.type === 'c_wait') {
            pendingDelay = { v: node.data.delay_value, u: node.data.delay_unit }
            continue
        }
        if (node.type === 'c_message') {
            if (!stepZero) {
                stepZero = node.data
            } else {
                if (!pendingDelay) {
                    throw new Error('Step de follow-up sem nó "Esperar" antes — fluxo inválido.')
                }
                followUps.push({
                    stepId: node.data.stepId ?? null,
                    delay_value: pendingDelay.v,
                    delay_unit: pendingDelay.u,
                    content: node.data,
                })
                pendingDelay = null
            }
        }
    }

    if (!stepZero) {
        throw new Error('Grafo sem nó de mensagem inicial.')
    }
    if (pendingDelay) {
        throw new Error('Nó "Esperar" no final do grafo sem mensagem subsequente.')
    }
    return { stepZero, followUps }
}

/* ─── Validação ────────────────────────────────────────────────────── */

export interface CampaignGraphValidation {
    ok: boolean
    errors: string[]
    warnings: string[]
}

/**
 * Valida que o grafo é estritamente linear:
 *   - Exatamente 1 nó start e 1 nó end
 *   - Cada nó (exceto start/end) tem exatamente 1 edge entrando e 1 saindo
 *   - start tem só saída, end só entrada
 *   - Sequência alterna: start → message → (wait → message)* → end
 *   - Cada `c_message` tem template_id OU body OU mídia
 *   - Cada `c_wait` tem delay_value >= 0 e unit válido
 *   - Sem nós órfãos
 *   - Sem ciclos
 */
export function validateCampaignGraph(graph: CampaignGraph): CampaignGraphValidation {
    const errors: string[] = []
    const warnings: string[] = []

    const starts = graph.nodes.filter(n => n.type === 'c_start')
    const ends = graph.nodes.filter(n => n.type === 'c_end')

    if (starts.length === 0) errors.push('Falta o nó de início.')
    if (starts.length > 1) errors.push(`Existem ${starts.length} nós de início — deve haver apenas 1.`)
    if (ends.length === 0) errors.push('Falta o nó de fim.')
    if (ends.length > 1) errors.push(`Existem ${ends.length} nós de fim — deve haver apenas 1.`)

    // Construir mapas de adjacência
    const outBy = new Map<string, string[]>()
    const inBy = new Map<string, string[]>()
    for (const n of graph.nodes) {
        outBy.set(n.id, [])
        inBy.set(n.id, [])
    }
    for (const e of graph.edges) {
        outBy.get(e.source)?.push(e.target)
        inBy.get(e.target)?.push(e.source)
    }

    // Cada nó (exceto start/end) deve ter exatamente 1 in e 1 out;
    // start: 0 in, 1 out; end: 1 in, 0 out
    for (const n of graph.nodes) {
        const outs = outBy.get(n.id)?.length ?? 0
        const ins = inBy.get(n.id)?.length ?? 0
        if (n.type === 'c_start') {
            if (ins !== 0) errors.push(`O nó de início não pode ter entradas.`)
            if (outs !== 1) errors.push(`O nó de início precisa ter exatamente uma saída (tem ${outs}).`)
        } else if (n.type === 'c_end') {
            if (outs !== 0) errors.push(`O nó de fim não pode ter saídas.`)
            if (ins !== 1) errors.push(`O nó de fim precisa ter exatamente uma entrada (tem ${ins}).`)
        } else {
            if (outs !== 1) errors.push(`O nó "${n.label ?? n.id}" precisa ter exatamente uma saída (tem ${outs}). Sem bifurcação.`)
            if (ins !== 1) errors.push(`O nó "${n.label ?? n.id}" precisa ter exatamente uma entrada (tem ${ins}). Sem junção.`)
        }
    }

    if (starts.length === 1 && ends.length === 1) {
        // Caminhar do start: se chegarmos no end visitando todos, é linear
        const visited = new Set<string>()
        let cur: string | null = starts[0].id
        let lastType: CampaignNodeType | null = null
        while (cur) {
            if (visited.has(cur)) {
                errors.push('Detectado ciclo no fluxo.')
                break
            }
            visited.add(cur)
            const node = graph.nodes.find(n => n.id === cur)
            if (!node) {
                errors.push('Aresta aponta para nó inexistente.')
                break
            }

            // Verifica transições válidas
            if (lastType !== null) {
                const allowed = allowedTransitions(lastType)
                if (!allowed.includes(node.type)) {
                    errors.push(`Sequência inválida: depois de "${labelOfType(lastType)}" não pode vir "${labelOfType(node.type)}".`)
                }
            }
            // Conteúdo mínimo das mensagens
            if (node.type === 'c_message') {
                const d = node.data
                const hasTpl = !!d.template_id
                const hasBody = !!(d.body && d.body.trim())
                const hasMedia = !!d.media_url
                if (!hasTpl && !hasBody && !hasMedia) {
                    errors.push(`Mensagem "${node.label ?? node.id}" está vazia — escolha um template, escreva um texto ou anexe mídia.`)
                }
            }
            if (node.type === 'c_wait') {
                const d = node.data
                if (!Number.isFinite(d.delay_value) || d.delay_value < 0) {
                    errors.push(`Nó "Esperar" com valor inválido (${d.delay_value}).`)
                }
                if (!['minutes', 'hours', 'days'].includes(d.delay_unit)) {
                    errors.push(`Nó "Esperar" com unidade inválida (${d.delay_unit}).`)
                }
                if (d.delay_value === 0) {
                    warnings.push(`Nó "Esperar" com tempo zero envia o próximo step imediatamente após o anterior — pode parecer spam.`)
                }
            }

            lastType = node.type
            const nexts: string[] = outBy.get(cur) ?? []
            cur = nexts.length > 0 ? nexts[0] : null
        }

        // Órfãos: todo nó deve ter sido visitado
        const orphans = graph.nodes.filter(n => !visited.has(n.id))
        if (orphans.length > 0) {
            errors.push(`Há ${orphans.length} nó(s) desconectado(s) do fluxo principal.`)
        }
    }

    return { ok: errors.length === 0, errors, warnings }
}

function allowedTransitions(prev: CampaignNodeType): CampaignNodeType[] {
    switch (prev) {
        case 'c_start':   return ['c_message']
        case 'c_message': return ['c_wait', 'c_end']
        case 'c_wait':    return ['c_message']
        case 'c_end':     return []
    }
}

function labelOfType(t: CampaignNodeType): string {
    return t === 'c_start' ? 'Início'
        : t === 'c_message' ? 'Mensagem'
        : t === 'c_wait' ? 'Esperar'
        : 'Fim'
}

/* ─── Walk linear (segue a única saída de cada nó) ─────────────────── */

function walkLinearSequence(graph: CampaignGraph): CampaignNode[] {
    const start = graph.nodes.find(n => n.type === 'c_start')
    if (!start) return []
    const outBy = new Map<string, string[]>()
    for (const e of graph.edges) {
        if (!outBy.has(e.source)) outBy.set(e.source, [])
        outBy.get(e.source)!.push(e.target)
    }
    const nodeById = new Map(graph.nodes.map(n => [n.id, n]))
    const out: CampaignNode[] = []
    const seen = new Set<string>()
    let cur: string | null = start.id
    while (cur) {
        if (seen.has(cur)) break  // safety contra ciclos
        seen.add(cur)
        const n = nodeById.get(cur)
        if (!n) break
        out.push(n)
        const nextIds: string[] = outBy.get(cur) ?? []
        cur = nextIds.length > 0 ? nextIds[0] : null
    }
    return out
}
