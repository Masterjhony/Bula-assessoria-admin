/**
 * EXEMPLOS DE OURO (few-shot) — respostas reais do SDR humano que funcionaram,
 * mineradas da base de conversas e injetadas no prompt do concierge.
 *
 * Por que existe: a persona (concierge-persona.ts) diz COMO falar com cada
 * perfil, mas em abstrato. Estes exemplos mostram ao modelo, em concreto, como
 * um assessor de verdade contornou "tá caro", "vou pensar", "como funciona o
 * parcelamento" — o tipo de tirada que converteu e que a persona escrita não
 * captura. O modelo ESPELHA o tom e a solução; nunca copia literal.
 *
 * Fluxo (supervisionado, como o concierge-aprendizados):
 *   1. scripts/concierge-mina-few-shot.mjs  → minera candidatos da base real
 *      (a IA propõe; sai um .md pra revisão + um .json curável).
 *   2. um humano revisa/apara o .json.
 *   3. scripts/concierge-few-shot-load.mjs  → grava os aprovados na config.
 *   4. este bloco entra no prompt do concierge, filtrado pelo segmento do lead.
 *
 * Nada muda em produção até o passo 3 — a config nasce com `fewShots: []`.
 */

import type { Segmento } from './concierge-persona'
import { computeSegmento } from './concierge-persona'

/** Segmento-alvo de um exemplo. 'qualquer' = serve pra todo perfil. */
export type FewShotSegmento = Segmento | 'qualquer'

export interface FewShot {
    /** Categoria da situação: objecao_preco, duvida_como_funciona, desconfianca… */
    tema: string
    /** Perfil pra quem o exemplo é mais relevante. */
    segmento: FewShotSegmento
    /** O que o lead disse (paráfrase curta, sem dado pessoal). */
    gatilho: string
    /** A resposta humana que funcionou — limpa, reutilizável, sem PII. */
    resposta: string
}

/** Quantos exemplos no máximo entram no prompt (custo/ruído x cobertura). */
const MAX_EXEMPLOS = 7

const str = (v: unknown) => String(v ?? '').trim()

/** Normaliza um item cru (do JSON minerado) num FewShot válido, ou null. */
export function sanitizeFewShot(raw: unknown): FewShot | null {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>
    const gatilho = str(r.gatilho)
    const resposta = str(r.resposta)
    if (!gatilho || !resposta) return null
    const seg = str(r.segmento) as FewShotSegmento
    const valido: FewShotSegmento[] = ['iniciante', 'produtor_comercial', 'criador_po', 'indefinido', 'qualquer']
    return {
        tema: str(r.tema) || 'outro',
        segmento: valido.includes(seg) ? seg : 'qualquer',
        gatilho,
        resposta,
    }
}

/** Filtra/valida uma lista crua vinda da config (nunca confia no shape). */
export function normalizeFewShots(raw: unknown): FewShot[] {
    if (!Array.isArray(raw)) return []
    const out: FewShot[] = []
    for (const item of raw) {
        const fs = sanitizeFewShot(item)
        if (fs) out.push(fs)
    }
    return out
}

/**
 * Escolhe os exemplos mais relevantes pro lead: primeiro os do MESMO segmento,
 * depois os 'qualquer'; sem repetir tema (variedade > quantidade). Determinístico
 * — sem random, pra ser estável entre mensagens da mesma conversa.
 */
export function selectFewShots(fewShots: FewShot[], seg: Segmento): FewShot[] {
    const doSeg = fewShots.filter(f => f.segmento === seg)
    const gerais = fewShots.filter(f => f.segmento === 'qualquer')
    const escolhidos: FewShot[] = []
    const temasUsados = new Set<string>()
    for (const f of [...doSeg, ...gerais]) {
        if (escolhidos.length >= MAX_EXEMPLOS) break
        if (temasUsados.has(f.tema)) continue
        temasUsados.add(f.tema)
        escolhidos.push(f)
    }
    // Se ainda sobrou espaço (poucos temas distintos), completa repetindo temas.
    if (escolhidos.length < MAX_EXEMPLOS) {
        for (const f of [...doSeg, ...gerais]) {
            if (escolhidos.length >= MAX_EXEMPLOS) break
            if (escolhidos.includes(f)) continue
            escolhidos.push(f)
        }
    }
    return escolhidos
}

/**
 * Bloco injetado no prompt do concierge, logo após a persona do lead. Vazio
 * quando não há exemplos (comportamento idêntico ao de hoje).
 */
export function fewShotPromptBlock(
    lead: Parameters<typeof computeSegmento>[0],
    fewShots: FewShot[],
): string {
    if (!fewShots.length) return ''
    const seg = computeSegmento(lead)
    const escolhidos = selectFewShots(fewShots, seg)
    if (!escolhidos.length) return ''
    const linhas = [
        'EXEMPLOS DE OURO — respostas REAIS de assessor da Bula que funcionaram com leads parecidos.',
        'Use-os como referência de TOM e de SOLUÇÃO: quando o lead trouxer uma situação parecida, responda no mesmo espírito.',
        'NUNCA copie literal e NUNCA cite dados de outro cliente — adapte ao lead atual.',
        '',
    ]
    for (const f of escolhidos) {
        linhas.push(`• Situação (${f.tema}) — o lead diz algo como: "${f.gatilho}"`)
        linhas.push(`  Resposta que funcionou: "${f.resposta}"`)
    }
    return linhas.join('\n')
}
