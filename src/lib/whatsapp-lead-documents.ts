/**
 * Vínculo de documentos do WhatsApp ao lead do CRM.
 *
 * O webhook da Cloud API já baixa a mídia inbound (PDF/foto) para o bucket
 * `whatsapp-media` e registra em `whatsapp_messages` com `lead_id`. Para que
 * esses arquivos virem documentos formais do lead — visíveis no card do CRM e
 * na aba "Documentos" do inbox, com abrir/baixar — promovemos a mídia para a
 * tabela `crm_lead_documentos` (0037), copiando o objeto para o bucket privado
 * `cliente-documentos` (mesma infra do cadastro de clientes).
 *
 * Idempotente: não duplica um arquivo já promovido (checa nome + tamanho).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { WHATSAPP_MEDIA_BUCKET } from './whatsapp-inbound'

export const LEAD_DOCS_BUCKET = 'cliente-documentos'

export type LeadDocTipo = 'ie' | 'cpf' | 'comprovante' | 'contrato' | 'outro'

/** Heurística de tipo a partir do nome/caption/mime do arquivo. */
export function guessDocTipo(
    filename?: string | null,
    caption?: string | null,
    _mime?: string | null,
): LeadDocTipo {
    const hay = `${filename || ''} ${caption || ''}`.toLowerCase()
    if (/\bie\b|inscri|estadual/.test(hay)) return 'ie'
    if (/cpf|cnpj|rg\b|identidade|documento de identidade/.test(hay)) return 'cpf'
    if (/comprov|residencia|endere|conta de luz|agua/.test(hay)) return 'comprovante'
    if (/contrato|procura/.test(hay)) return 'contrato'
    return 'outro'
}

function extFromName(name: string | null | undefined, mime: string | null | undefined): string {
    if (name && name.includes('.')) {
        const e = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
        if (e && e.length <= 5) return e
    }
    const m = (mime || '').split(';')[0].trim()
    const map: Record<string, string> = {
        'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    }
    return map[m] || 'bin'
}

export interface PromoteInput {
    leadId: string
    /** Path do objeto no bucket whatsapp-media (whatsapp_messages.media_url). */
    mediaPath: string
    filename?: string | null
    mime?: string | null
    caption?: string | null
    tipo?: LeadDocTipo
}

export interface PromotedDoc {
    id: string
    tipo: string
    nomeArquivo: string
    path: string
    tamanhoBytes: number
    contentType: string
    createdAt: string
}

/**
 * Salva um arquivo BAIXADO DE UMA URL como documento do lead.
 *
 * Usado pelo comprovante de Inscrição Estadual que a consulta do Sintegra
 * devolve (`site_receipt`, um PDF emitido pela SEFAZ). Anexar isto sozinho tira
 * do lead o item que mais travava o cadastro — e o comprovante do Estado vale
 * mais que a foto de um papel que ele mandaria.
 *
 * Idempotente por (lead, nome do arquivo): rodar de novo não duplica.
 */
export async function saveLeadDocFromUrl(
    supabase: SupabaseClient,
    input: { leadId: string; url: string; filename: string; tipo: LeadDocTipo; mime?: string },
): Promise<PromotedDoc | null> {
    const { leadId, url } = input
    if (!leadId || !url) return null

    const { data: existing } = await supabase
        .from('crm_lead_documentos')
        .select('id')
        .eq('lead_id', leadId)
        .eq('nome_arquivo', input.filename)
        .limit(1)
    if (existing?.length) return null

    let buffer: Buffer
    let contentType = input.mime || 'application/pdf'
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        contentType = input.mime || res.headers.get('content-type')?.split(';')[0] || contentType
        buffer = Buffer.from(await res.arrayBuffer())
    } catch (e) {
        console.warn('[lead-docs] download do comprovante falhou:', e instanceof Error ? e.message : e)
        return null
    }
    if (!buffer.byteLength) return null

    const ext = extFromName(input.filename, contentType)
    const path = `crm-leads/${leadId}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
        .from(LEAD_DOCS_BUCKET)
        .upload(path, buffer, { contentType, upsert: false })
    if (upErr) {
        console.warn('[lead-docs] upload do comprovante falhou:', upErr.message)
        return null
    }

    const { data, error } = await supabase
        .from('crm_lead_documentos')
        .insert({
            lead_id: leadId,
            tipo: input.tipo,
            nome_arquivo: input.filename,
            path,
            tamanho_bytes: buffer.byteLength,
            content_type: contentType,
            uploaded_by: 'consulta',
        })
        .select('id, tipo, nome_arquivo, path, tamanho_bytes, content_type, created_at')
        .single()
    if (error || !data) {
        await supabase.storage.from(LEAD_DOCS_BUCKET).remove([path])
        console.warn('[lead-docs] insert do comprovante falhou:', error?.message)
        return null
    }
    return {
        id: data.id as string,
        tipo: data.tipo as string,
        nomeArquivo: data.nome_arquivo as string,
        path: data.path as string,
        tamanhoBytes: data.tamanho_bytes as number,
        contentType: data.content_type as string,
        createdAt: data.created_at as string,
    }
}

/**
 * Copia a mídia inbound para `cliente-documentos` e registra em
 * `crm_lead_documentos`. Retorna o doc criado, ou null se já existir/der erro.
 */
export async function promoteWhatsappMediaToLeadDoc(
    supabase: SupabaseClient,
    input: PromoteInput,
): Promise<PromotedDoc | null> {
    const { leadId, mediaPath } = input
    if (!leadId || !mediaPath) return null

    const filename = input.filename || mediaPath.split('/').pop() || 'documento'

    // Baixa o objeto do bucket de mídia do WhatsApp.
    const { data: blob, error: dlErr } = await supabase.storage
        .from(WHATSAPP_MEDIA_BUCKET)
        .download(mediaPath)
    if (dlErr || !blob) {
        console.warn('[lead-docs] download da mídia falhou:', dlErr?.message)
        return null
    }
    const buffer = Buffer.from(await blob.arrayBuffer())
    const size = buffer.byteLength
    const contentType = input.mime || blob.type || 'application/octet-stream'

    // Dedup: já existe um doc com mesmo nome e tamanho para este lead?
    const { data: existing } = await supabase
        .from('crm_lead_documentos')
        .select('id')
        .eq('lead_id', leadId)
        .eq('nome_arquivo', filename)
        .eq('tamanho_bytes', size)
        .limit(1)
    if (existing && existing.length > 0) return null

    const ext = extFromName(filename, contentType)
    const path = `crm-leads/${leadId}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage
        .from(LEAD_DOCS_BUCKET)
        .upload(path, buffer, { contentType, upsert: false })
    if (upErr) {
        console.warn('[lead-docs] upload para cliente-documentos falhou:', upErr.message)
        return null
    }

    const tipo = input.tipo || guessDocTipo(filename, input.caption, contentType)
    const { data, error } = await supabase
        .from('crm_lead_documentos')
        .insert({
            lead_id: leadId,
            tipo,
            nome_arquivo: filename,
            path,
            tamanho_bytes: size,
            content_type: contentType,
            uploaded_by: 'whatsapp',
        })
        .select('id, tipo, nome_arquivo, path, tamanho_bytes, content_type, created_at')
        .single()
    if (error || !data) {
        await supabase.storage.from(LEAD_DOCS_BUCKET).remove([path]) // rollback
        console.warn('[lead-docs] insert crm_lead_documentos falhou:', error?.message)
        return null
    }

    return {
        id: data.id,
        tipo: data.tipo || tipo,
        nomeArquivo: data.nome_arquivo,
        path: data.path,
        tamanhoBytes: Number(data.tamanho_bytes) || size,
        contentType: data.content_type || contentType,
        createdAt: data.created_at,
    }
}
