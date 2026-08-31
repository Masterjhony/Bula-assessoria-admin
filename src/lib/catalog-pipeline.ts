/**
 * Pipeline de uma detecção: baixa o PDF, ABRE, identifica, casa com o
 * cronograma e — só com prova — anexa.
 *
 * Roda fora do caminho crítico do webhook (`after()`), porque abrir o arquivo
 * custa segundos: leitura de texto local (~0,3 s) e, quando a capa é imagem ou
 * falta o nome do evento, uma fatia de 3 páginas pra IA (~6 s). O webhook
 * responde na hora com a detecção em `analyzing`, e esta função a resolve.
 *
 * É reentrante: dá pra reprocessar qualquer detecção quantas vezes quiser
 * (botão "Reidentificar" na UI, ou o script de reprocessamento em lote).
 */

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
    findMatches,
    decideAutoAttach,
    readCatalogsPauseState,
    resolveCatalogDownloadUrl,
    type MatchCandidate,
} from './whatsapp-catalogs'
import { identificarDocumento, type EvidenciaDocumento } from './catalog-identify'
import { anexarDocumento, tituloDocumento, type TipoDocumentoLeilao } from './leilao-documentos'

/** Acima disto não vale a pena baixar — catálogo de leilão não passa de ~30 MB. */
const MAX_PDF_BYTES = 40 * 1024 * 1024

export type MatchStatus =
    | 'analyzing'    // baixando/lendo o arquivo
    | 'attached'     // anexado automaticamente, com prova
    | 'manual'       // anexado por uma pessoa
    | 'review'       // precisa de decisão humana (era 'pending'/'ambiguous')
    | 'no_match'     // é catálogo, mas nenhum leilão do cronograma corresponde
    | 'not_catalog'  // não é documento de leilão (relatório, agenda, mapa…)
    | 'duplicate'    // o MESMO arquivo já foi processado antes
    | 'error'

export type ResultadoProcessamento = {
    status: MatchStatus
    cronograma_id: string | null
    evidencia: EvidenciaDocumento | null
    candidatos: MatchCandidate[]
    motivo: string | null
}

type DeteccaoRow = {
    id: string
    file_name: string
    file_size: number | null
    r2_key: string | null
    received_at: string
    group_name: string | null
    match_status: string
    attached: boolean
    content_hash: string | null
}

/**
 * Processa uma detecção de ponta a ponta.
 * `forcar` reprocessa mesmo o que já está anexado (mas nunca desanexa nada).
 */
export async function processarDeteccao(
    sb: SupabaseClient,
    detectionId: string,
    opts?: { forcar?: boolean; dryRun?: boolean },
): Promise<ResultadoProcessamento> {
    // `dryRun` lê o arquivo e calcula tudo sem gravar nada — é como o script de
    // reprocessamento em lote mostra o que FARIA antes de mexer em produção.
    const dry = opts?.dryRun === true
    const { data: det } = await sb
        .from('whatsapp_catalog_detections')
        .select('id, file_name, file_size, r2_key, received_at, group_name, match_status, attached, content_hash')
        .eq('id', detectionId)
        .maybeSingle()

    if (!det) throw new Error('detecção não encontrada')
    const deteccao = det as DeteccaoRow

    if (deteccao.attached && !opts?.forcar) {
        return {
            status: deteccao.match_status as MatchStatus,
            cronograma_id: null,
            evidencia: null,
            candidatos: [],
            motivo: 'já anexada',
        }
    }
    if (!deteccao.r2_key) {
        if (!dry) await falhar(sb, detectionId, 'detecção sem arquivo')
        return { status: 'error', cronograma_id: null, evidencia: null, candidatos: [], motivo: 'sem arquivo' }
    }

    const referencia = new Date(deteccao.received_at)

    // ── 1. Baixa o arquivo ────────────────────────────────────────────────
    let buffer: Uint8Array
    try {
        const url = await resolveCatalogDownloadUrl(deteccao.r2_key, { expiresInSeconds: 3600 })
        const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const bytes = await res.arrayBuffer()
        if (bytes.byteLength > MAX_PDF_BYTES) throw new Error('arquivo acima de 40 MB')
        buffer = new Uint8Array(bytes)
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!dry) await falhar(sb, detectionId, `falha ao baixar: ${msg}`)
        return { status: 'error', cronograma_id: null, evidencia: null, candidatos: [], motivo: msg }
    }

    const contentHash = createHash('sha256').update(buffer).digest('hex')

    // ── 2. Reenvio do MESMO arquivo ───────────────────────────────────────
    // No grupo é comum duas ou três pessoas repassarem o mesmo PDF. O
    // message_id muda, o conteúdo não — o hash resolve, e a detecção nova
    // herda o destino que a primeira já provou.
    const { data: gemeas } = await sb
        .from('whatsapp_catalog_detections')
        .select('id, cronograma_id, match_status, attached')
        .eq('content_hash', contentHash)
        .neq('id', detectionId)
        .order('received_at', { ascending: true })
    const gemeaAnexada = (gemeas ?? []).find(g => g.attached && g.cronograma_id)

    if (gemeaAnexada && !opts?.forcar) {
        if (dry) {
            return {
                status: 'duplicate',
                cronograma_id: gemeaAnexada.cronograma_id as string,
                evidencia: null,
                candidatos: [],
                motivo: 'arquivo idêntico a uma detecção anterior já anexada',
            }
        }
        const anexo = await anexarNoLeilao(sb, {
            cronograma_id: gemeaAnexada.cronograma_id as string,
            detectionId,
            deteccao,
            contentHash,
            evidencia: null,
        })
        await sb.from('whatsapp_catalog_detections').update({
            content_hash: contentHash,
            match_status: 'duplicate',
            match_method: 'content_hash',
            cronograma_id: gemeaAnexada.cronograma_id,
            duplicate_of: gemeaAnexada.id,
            attached: true,
            attached_at: new Date().toISOString(),
            attached_by: 'auto',
            analyzed_at: new Date().toISOString(),
            error: 'mesmo arquivo já recebido antes — anexado no mesmo leilão',
            match_reasons: ['arquivo idêntico a uma detecção anterior'],
        }).eq('id', detectionId)
        return {
            status: 'duplicate',
            cronograma_id: gemeaAnexada.cronograma_id as string,
            evidencia: null,
            candidatos: [],
            motivo: anexo.criado ? 'anexado como documento' : 'já estava anexado',
        }
    }

    // ── 3. Abre o PDF ─────────────────────────────────────────────────────
    const evidencia = await identificarDocumento(buffer, deteccao.file_name, referencia)

    // ── 4. Casa com o cronograma ──────────────────────────────────────────
    const candidatos = await findMatches(sb, deteccao.file_name, {
        limit: 5,
        evidencia,
        referencia,
    })
    const decisao = decideAutoAttach(candidatos, evidencia)
    const pausa = await readCatalogsPauseState(sb)

    const camposEvidencia = {
        content_hash: contentHash,
        doc_tipo: evidencia.tipo,
        doc_evento: evidencia.evento_nome,
        doc_data: evidencia.data_leilao,
        doc_datas: evidencia.datas_capa,
        doc_hora: evidencia.hora,
        doc_leiloeira: evidencia.leiloeira,
        doc_criadores: evidencia.criadores,
        doc_local: evidencia.local,
        doc_lotes: evidencia.lotes,
        doc_paginas: evidencia.paginas,
        doc_fonte: evidencia.fonte,
        doc_confianca: evidencia.confianca,
        doc_trecho: evidencia.trecho,
        analyzed_at: new Date().toISOString(),
        candidates: candidatos,
        match_score: candidatos[0]?.score ?? null,
        match_method: 'conteudo',
    }

    // ── 5. Decide ─────────────────────────────────────────────────────────
    if (decisao.decision === 'attach' && !pausa.paused) {
        if (dry) {
            return {
                status: 'attached',
                cronograma_id: decisao.cronograma_id,
                evidencia,
                candidatos,
                motivo: decisao.motivos.join(' · '),
            }
        }
        try {
            const anexo = await anexarNoLeilao(sb, {
                cronograma_id: decisao.cronograma_id,
                detectionId,
                deteccao,
                contentHash,
                evidencia,
            })
            const agora = new Date().toISOString()
            await sb.from('whatsapp_catalog_detections').update({
                ...camposEvidencia,
                match_status: 'attached',
                cronograma_id: decisao.cronograma_id,
                attached: true,
                attached_at: agora,
                attached_by: 'auto',
                overwrote_existing: false,
                match_reasons: decisao.motivos,
                error: null,
            }).eq('id', detectionId)
            return {
                status: 'attached',
                cronograma_id: decisao.cronograma_id,
                evidencia,
                candidatos,
                motivo: anexo.criado ? decisao.motivos.join(' · ') : 'documento já estava anexado',
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            await sb.from('whatsapp_catalog_detections').update({
                ...camposEvidencia,
                match_status: 'review',
                cronograma_id: decisao.cronograma_id,
                error: `falha ao anexar: ${msg}`,
            }).eq('id', detectionId)
            return { status: 'review', cronograma_id: decisao.cronograma_id, evidencia, candidatos, motivo: msg }
        }
    }

    let status: MatchStatus
    let motivo: string | null
    if (decisao.decision === 'not_catalog') {
        status = 'not_catalog'; motivo = decisao.reason
    } else if (decisao.decision === 'no_match') {
        status = 'no_match'
        motivo = evidencia.data_leilao
            ? `documento de ${formatarBr(evidencia.data_leilao)} — nenhum leilão do cronograma corresponde`
            : 'nenhum leilão do cronograma corresponde'
    } else if (pausa.paused && decisao.decision === 'attach') {
        status = 'review'; motivo = 'automação pausada — anexo manual'
    } else {
        status = 'review'; motivo = decisao.decision === 'review' ? decisao.reason : null
    }

    if (!dry) {
        await sb.from('whatsapp_catalog_detections').update({
            ...camposEvidencia,
            match_status: status,
            cronograma_id: null,
            match_reasons: candidatos[0]?.motivos ?? [],
            error: motivo,
        }).eq('id', detectionId)
    }

    return { status, cronograma_id: null, evidencia, candidatos, motivo }
}

async function anexarNoLeilao(
    sb: SupabaseClient,
    args: {
        cronograma_id: string
        detectionId: string
        deteccao: DeteccaoRow
        contentHash: string
        evidencia: EvidenciaDocumento | null
    },
) {
    const tipo: TipoDocumentoLeilao =
        args.evidencia?.tipo === 'ordem_entrada' ? 'ordem_entrada'
            : args.evidencia?.tipo === 'catalogo' ? 'catalogo'
                : 'catalogo'
    const url = await resolveCatalogDownloadUrl(args.deteccao.r2_key!, {
        expiresInSeconds: 7 * 24 * 3600,
        downloadAs: args.deteccao.file_name,
    })
    return anexarDocumento(sb, {
        cronograma_id: args.cronograma_id,
        url,
        tipo,
        titulo: tituloDocumento(args.deteccao.file_name, tipo),
        file_name: args.deteccao.file_name,
        file_size: args.deteccao.file_size,
        content_hash: args.contentHash,
        origem: args.deteccao.group_name ?? 'whatsapp',
        detection_id: args.detectionId,
    })
}

async function falhar(sb: SupabaseClient, id: string, mensagem: string) {
    await sb.from('whatsapp_catalog_detections').update({
        match_status: 'error',
        error: mensagem,
        analyzed_at: new Date().toISOString(),
    }).eq('id', id)
}

function formatarBr(iso: string): string {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
}
