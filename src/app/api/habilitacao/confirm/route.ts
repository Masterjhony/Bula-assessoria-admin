/**
 * POST /api/habilitacao/confirm — passo 2 da página pública de habilitação.
 *
 * Depois que o browser subiu os documentos direto no Storage (signed upload
 * URLs do submit), este endpoint registra os arquivos em crm_lead_documentos
 * (o que faz o checklist contar) e dispara o MESMO pipeline do funil WhatsApp:
 * sincronizarHabilitacao recalcula o checklist e, se o dossiê fechou, submete
 * a ficha às leiloeiras. A assinatura HMAC amarra a chamada ao submit — não dá
 * pra pendurar documento em lead alheio.
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fail, ok } from '@/lib/respond'
import { LEAD_DOCS_BUCKET } from '@/lib/whatsapp-lead-documents'
import { HABILITACAO_DOC_SLOTS } from '@/lib/habilitacao-form'
import { habilitacaoSig } from '@/lib/habilitacao-sig'
import { sincronizarHabilitacao } from '@/lib/crm-habilitacao-sync'

export const runtime = 'nodejs'
export const maxDuration = 60

const str = (v: unknown) => String(v ?? '').trim()

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}))
    const leadId = str(body.ref)
    const sig = str(body.sig)
    if (!leadId || sig !== habilitacaoSig(leadId)) return fail('Sessão inválida — recarregue a página.', 403)

    const bySlot = new Map(HABILITACAO_DOC_SLOTS.map(s => [s.slot as string, s]))
    const uploaded = (Array.isArray(body.uploaded) ? body.uploaded : [])
        .slice(0, 6)
        .map((u: Record<string, unknown>) => ({
            slot: str(u.slot), path: str(u.path),
            filename: str(u.filename).slice(0, 160) || 'documento',
            mime: str(u.mime) || 'application/octet-stream',
            size: Number(u.size) || 0,
        }))
        .filter((u: { slot: string; path: string }) => bySlot.has(u.slot) && u.path.startsWith(`crm-leads/${leadId}/form-`))

    if (uploaded.length === 0) return ok({ registered: 0 })

    const supabase = supabaseAdmin()

    // Só registra o que EXISTE no bucket (o browser pode ter falhado no PUT).
    const { data: objetos } = await supabase.storage
        .from(LEAD_DOCS_BUCKET)
        .list(`crm-leads/${leadId}`, { limit: 100 })
    const noBucket = new Set((objetos ?? []).map(o => `crm-leads/${leadId}/${o.name}`))

    let registered = 0
    const semantics = new Set<string>()
    for (const u of uploaded) {
        if (!noBucket.has(u.path)) continue
        const meta = bySlot.get(u.slot)!
        const { error } = await supabase.from('crm_lead_documentos').insert({
            lead_id: leadId,
            tipo: meta.tipoDoc,
            nome_arquivo: u.filename,
            path: u.path,
            tamanho_bytes: u.size,
            content_type: u.mime,
            uploaded_by: 'formulario',
        })
        if (error) {
            console.warn('[habilitacao/confirm] insert doc falhou:', error.message)
            continue
        }
        registered++
        semantics.add(u.slot)
    }

    if (semantics.size) {
        const { data: leadRow } = await supabase.from('crm_leads').select('extra_data').eq('id', leadId).single()
        const xd = { ...((leadRow?.extra_data ?? {}) as Record<string, unknown>) }
        const prevDocs = Array.isArray(xd.docs_recebidos) ? xd.docs_recebidos.map(String) : []
        xd.docs_recebidos = [...new Set([...prevDocs, ...semantics])]
        xd.habilitacao_form_docs_at = new Date().toISOString()
        await supabase.from('crm_leads').update({ extra_data: xd }).eq('id', leadId)
    }

    // Mesmo pipeline do WhatsApp: recalcula checklist e, se completo, a ficha
    // vai às leiloeiras. Sem consultas pagas (consultar:false). Best-effort —
    // o cron/próxima mensagem do lead repete o sync se falhar aqui.
    try {
        await sincronizarHabilitacao(supabase, leadId, { consultar: false })
    } catch (e) {
        console.warn('[habilitacao/confirm] sync falhou:', e instanceof Error ? e.message : e)
    }

    return ok({ registered })
}
