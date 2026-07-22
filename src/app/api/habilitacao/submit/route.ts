/**
 * POST /api/habilitacao/submit — passo 1 da página pública de habilitação.
 *
 * Endpoint PÚBLICO (o lead preenche sem login). Grava os DADOS do checklist no
 * CRM (acha o lead pelo WhatsApp ou cria em ENTRADA) e devolve signed upload
 * URLs para o browser subir os documentos DIRETO no Storage — o body de rota
 * na Vercel estoura em ~4.5MB, então arquivo nunca passa por aqui.
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fail, ok } from '@/lib/respond'
import { CRM_STAGE_ENTRY } from '@/lib/crm-types'
import { normalizePhone, phoneVariants } from '@/lib/whatsapp-central'
import { LEAD_DOCS_BUCKET } from '@/lib/whatsapp-lead-documents'
import { HABILITACAO_DOC_SLOTS, HABILITACAO_MAX_FILE_BYTES, cpfValido } from '@/lib/habilitacao-form'
import { habilitacaoSig } from '@/lib/habilitacao-sig'

export const runtime = 'nodejs'

const str = (v: unknown) => String(v ?? '').trim()
const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i

interface DocReq { slot: string; filename: string; contentType: string; size: number }

export async function POST(req: NextRequest) {
    const body = await req.json().catch(() => ({}))

    // Honeypot: campo invisível que humano não preenche. Bot cai aqui e recebe
    // um "ok" de fachada — sem dado gravado, sem dica de que foi filtrado.
    if (str(body.website)) return ok({ ref: 'ok', sig: 'ok', uploads: [] })

    const nome = str(body.nome)
    const cpf = str(body.cpf).replace(/\D/g, '')
    const whatsapp = normalizePhone(str(body.whatsapp))
    const email = str(body.email)
    const endereco = str(body.endereco)
    const fazendaNome = str(body.fazenda_nome)
    const fazendaCidade = str(body.fazenda_cidade)
    const fazendaUf = str(body.fazenda_uf).toUpperCase()
    const ie = str(body.inscricao_estadual)
    const semIe = body.sem_ie === true

    if (!/\S+\s+\S+/.test(nome)) return fail('Informe seu nome completo.')
    if (!cpfValido(cpf)) return fail('CPF inválido — confira os números.')
    if (!whatsapp) return fail('Informe um WhatsApp válido com DDD.')
    if (endereco.length < 8) return fail('Informe o endereço de correspondência completo.')
    if (fazendaNome.length < 2) return fail('Informe o nome da fazenda (local de entrega).')
    if (fazendaCidade.length < 2 || !/^[A-Z]{2}$/.test(fazendaUf)) return fail('Informe cidade e UF da fazenda.')
    if (email && !email.includes('@')) return fail('E-mail inválido.')
    if (!ie && !semIe) return fail('Informe a Inscrição Estadual/NIRF ou marque que não possui.')

    const validSlots = new Set(HABILITACAO_DOC_SLOTS.map(s => s.slot as string))
    const docs: DocReq[] = (Array.isArray(body.docs) ? body.docs : [])
        .slice(0, 6)
        .map((d: Record<string, unknown>) => ({
            slot: str(d.slot), filename: str(d.filename).slice(0, 160) || 'documento',
            contentType: str(d.contentType), size: Number(d.size) || 0,
        }))
        .filter((d: DocReq) => validSlots.has(d.slot))
    for (const d of docs) {
        if (!ALLOWED_MIME.test(d.contentType)) return fail(`Arquivo de "${d.filename}" precisa ser foto (JPG/PNG) ou PDF.`)
        if (d.size > HABILITACAO_MAX_FILE_BYTES) return fail(`"${d.filename}" passa de 25MB — envie uma versão menor.`)
    }

    const supabase = supabaseAdmin()

    // ── Lead: acha pelo WhatsApp (telefone OU celular) ou cria em ENTRADA ────
    const variants = phoneVariants(whatsapp)
    let leadId: string | null = null
    let lead: Record<string, unknown> | null = null
    for (const col of ['telefone', 'celular'] as const) {
        if (leadId) break
        const { data } = await supabase
            .from('crm_leads')
            .select('id, nome, cpf, email, inscricao_estadual, tem_inscricao_estadual, contact_history, extra_data')
            .in(col, variants)
            .order('updated_at', { ascending: false })
            .limit(1)
        if (data?.length) { leadId = String(data[0].id); lead = data[0] as Record<string, unknown> }
    }

    if (!leadId) {
        const { data, error } = await supabase
            .from('crm_leads')
            .insert({
                nome, telefone: whatsapp, celular: whatsapp,
                status: CRM_STAGE_ENTRY,
                origem: 'Página de Habilitação',
                source: 'habilitacao-page',
                medium: 'form',
                data_entrada: new Date().toISOString(),
                extra_data: {},
            })
            .select('id, nome, cpf, email, inscricao_estadual, tem_inscricao_estadual, contact_history, extra_data')
            .single()
        if (error || !data) {
            console.error('[habilitacao/submit] criar lead falhou:', error?.message)
            return fail('Não foi possível registrar. Tente de novo ou chame no WhatsApp.', 500)
        }
        leadId = String(data.id)
        lead = data as Record<string, unknown>
    }

    // ── Atualização: mesmo espírito do concierge — CPF/e-mail preenchem vazio
    // (não sobrescrevem valor já validado); nome só melhora; dados que são do
    // próprio lead (endereço, fazenda, I.E.) o formulário é fonte de verdade.
    const prevExtra = (lead?.extra_data ?? {}) as Record<string, unknown>
    const history = Array.isArray(lead?.contact_history) ? [...(lead!.contact_history as unknown[])] : []
    history.unshift({
        id: crypto.randomUUID(), type: 'outro', date: new Date().toISOString(), by: 'Formulário',
        notes: `[Formulário] Preencheu a página de habilitação${docs.length ? ` (+${docs.length} documento(s) em envio)` : ''}.`,
    })

    const update: Record<string, unknown> = {
        contact_history: history,
        contact_count: history.length,
        extra_data: {
            ...prevExtra,
            endereco_titular: endereco,
            fazenda_nome: fazendaNome,
            fazenda_cidade: fazendaCidade,
            fazenda_uf: fazendaUf,
            habilitacao_form_at: new Date().toISOString(),
        },
    }
    if (!/\S+\s+\S+/.test(str(lead?.nome))) update.nome = nome
    if (String(lead?.cpf ?? '').replace(/\D/g, '').length !== 11) update.cpf = cpf
    if (email && !str(lead?.email)) update.email = email
    if (ie) {
        update.inscricao_estadual = ie
        update.tem_inscricao_estadual = 'Sim'
    } else if (semIe && str(lead?.tem_inscricao_estadual).toLowerCase() !== 'sim') {
        update.tem_inscricao_estadual = 'Não'
    }

    const { error: upErr } = await supabase.from('crm_leads').update(update).eq('id', leadId)
    if (upErr) {
        console.error('[habilitacao/submit] update falhou:', upErr.message)
        return fail('Não foi possível registrar. Tente de novo ou chame no WhatsApp.', 500)
    }

    // ── Signed upload URLs: browser sobe direto no bucket privado ────────────
    const uploads: Array<{ slot: string; path: string; signedUrl: string; token: string }> = []
    for (const d of docs) {
        const ext = (d.filename.includes('.') ? d.filename.split('.').pop()! : 'bin').toLowerCase().slice(0, 5)
        const path = `crm-leads/${leadId}/form-${d.slot}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { data: signed, error } = await supabase.storage.from(LEAD_DOCS_BUCKET).createSignedUploadUrl(path)
        if (error || !signed) {
            console.error('[habilitacao/submit] signed url falhou:', error?.message)
            continue
        }
        uploads.push({ slot: d.slot, path: signed.path, signedUrl: signed.signedUrl, token: signed.token })
    }

    return ok({ ref: leadId, sig: habilitacaoSig(leadId), uploads })
}
