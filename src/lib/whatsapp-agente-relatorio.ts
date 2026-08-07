/**
 * Relatórios do agente interno: tabela → XLSX (SheetJS) ou PDF (jsPDF, mesmo
 * stack do fechamento-pdf) → upload no bucket whatsapp-media → signed URL →
 * enviado como DOCUMENTO pelo Baileys (o VPS baixa a URL e manda o arquivo).
 *
 * Playwright NÃO roda na Vercel — por isso jsPDF/SheetJS, que são puros.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendVpsDirect, sendVpsGroup, type VpsGroupMedia } from './whatsapp-vps'

const BUCKET = 'whatsapp-media'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface RelatorioDestino {
    kind: 'dm' | 'grupo'
    /** phone (dm) ou groupJid (grupo). */
    to: string
    session: string
}

export interface RelatorioInput {
    titulo: string
    colunas: string[]
    linhas: (string | number | null)[][]
    formato: 'xlsx' | 'pdf'
    destino: RelatorioDestino
}

function slug(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        .slice(0, 60) || 'relatorio'
}

async function buildXlsx(input: RelatorioInput): Promise<Buffer> {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([input.colunas, ...input.linhas])
    // largura de coluna razoável pelo conteúdo
    ws['!cols'] = input.colunas.map((c, i) => {
        const maxLen = Math.max(c.length, ...input.linhas.map(l => String(l[i] ?? '').length))
        return { wch: Math.min(48, Math.max(10, maxLen + 2)) }
    })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, input.titulo.slice(0, 31) || 'Dados')
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

async function buildPdf(input: RelatorioInput): Promise<Buffer> {
    const [{ default: jsPDF }, autoTable] = await Promise.all([
        import('jspdf').then(m => ({ default: m.default })),
        import('jspdf-autotable').then(m => m.default),
    ])
    const doc = new jsPDF({ orientation: input.colunas.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
    doc.setFontSize(14)
    doc.text(input.titulo, 14, 16)
    doc.setFontSize(9)
    doc.setTextColor(120)
    doc.text(`Bula Assessoria — gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, 14, 22)
    autoTable(doc, {
        head: [input.colunas],
        body: input.linhas.map(l => l.map(v => v == null ? '' : String(v))),
        startY: 27,
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [20, 20, 20], textColor: 255 },
    })
    return Buffer.from(doc.output('arraybuffer'))
}

/**
 * Gera, sobe pro Storage e envia como documento. Retorna o que aconteceu — o
 * loop do agente repassa isso pro modelo como resultado da ferramenta.
 */
export async function gerarEEnviarRelatorio(
    supabase: SupabaseClient,
    input: RelatorioInput,
): Promise<{ sent: boolean; error?: string }> {
    try {
        if (!input.colunas.length || !input.linhas.length) {
            return { sent: false, error: 'colunas/linhas vazias' }
        }
        const isPdf = input.formato === 'pdf'
        const buffer = isPdf ? await buildPdf(input) : await buildXlsx(input)
        const ext = isPdf ? 'pdf' : 'xlsx'
        const mime = isPdf ? 'application/pdf' : XLSX_MIME
        const fileName = `${slug(input.titulo)}-${new Date().toISOString().slice(0, 10)}.${ext}`
        const path = `agente-relatorios/${Date.now()}-${fileName}`

        const up = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: mime })
        if (up.error) return { sent: false, error: `upload: ${up.error.message}` }

        const signed = await supabase.storage.from(BUCKET).createSignedUrl(path, 6 * 3600)
        if (signed.error || !signed.data?.signedUrl) {
            return { sent: false, error: `signed url: ${signed.error?.message ?? 'vazia'}` }
        }

        const media: VpsGroupMedia = {
            type: 'document',
            url: signed.data.signedUrl,
            fileName,
            mimetype: mime,
        }
        const { destino } = input
        const res = destino.kind === 'grupo'
            ? await sendVpsGroup(destino.to, `📄 ${input.titulo}`, media, destino.session)
            : await sendVpsDirect(destino.to, `📄 ${input.titulo}`, media, destino.session)
        const okSend = 'ok' in res ? res.ok : res.queued
        if (!okSend) return { sent: false, error: ('error' in res && res.error) || 'falha no envio' }

        // Log na thread da Central (o VPS não espelha envios próprios).
        // AWAIT obrigatório: fire-and-forget morre quando a Vercel congela a função.
        await supabase.from('whatsapp_messages').insert({
            phone: destino.to,
            name: 'Bula (agente)',
            direction: 'outbound',
            status: 'sent',
            body: `📄 ${input.titulo}`,
            origin: 'agente-reply',
            intent: 'operation',
            channel: 'baileys',
            inbox_id: destino.session,
            media_url: path,
            media_type: 'document',
            media_mime: mime,
            media_filename: fileName,
        })

        return { sent: true }
    } catch (e) {
        return { sent: false, error: e instanceof Error ? e.message : String(e) }
    }
}
