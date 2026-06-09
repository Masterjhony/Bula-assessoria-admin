import { sendMail, type MailAttachment } from './email'
import type { JmpContent, JmpEmailAttachment } from './jmp-content'

// Renderização e envio de e-mails da campanha JMP (boas-vindas + fluxo).
// Suporta placeholders {{...}} com dados do lead e anexos por URL pública.

export interface JmpLeadEmailContext {
  nome: string
  email: string
  whatsapp: string
  uf: string | null
  cidade: string | null
  momento: string | null
  cabecas: string | null
  interesse: string | null
}

const TEMPLATE_KEYS = new Set([
  'nome', 'email', 'whatsapp', 'uf', 'cidade', 'momento', 'cabecas',
  'interesse', 'whatsappGroupUrl',
])

function templateValue(key: string, lead: JmpLeadEmailContext, content: JmpContent) {
  if (!TEMPLATE_KEYS.has(key)) return ''
  if (key === 'whatsappGroupUrl') return content.whatsappGroupUrl
  return String(lead[key as keyof JmpLeadEmailContext] ?? '')
}

export function applyTemplate(template: string, lead: JmpLeadEmailContext, content: JmpContent) {
  return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, key: string) =>
    templateValue(key, lead, content),
  )
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Converte o corpo (texto com quebras) no HTML branded da Bula. */
export function renderHtml(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)

  const body = paragraphs
    .map((part) => `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('')

  return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#171717;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">
        <tr><td style="background:#111111;padding:22px 28px;color:#ffffff;">
          <div style="font-size:18px;font-weight:800;letter-spacing:.5px;">Bula Assessoria</div>
          <div style="font-size:12px;color:#d6b36a;margin-top:4px;">Nelore JMP</div>
        </td></tr>
        <tr><td style="padding:28px;">
          ${body}
        </td></tr>
        <tr><td style="background:#fafafa;padding:14px 28px;border-top:1px solid #eeeeee;font-size:11px;color:#8a8a8a;text-align:center;">
          Bula Assessoria Pecuaria
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function toMailAttachments(atts: JmpEmailAttachment[] | undefined): MailAttachment[] {
  return (atts ?? [])
    .filter((a) => a.url)
    .map((a) => ({ filename: a.name || a.url.split('/').pop() || 'anexo', path: a.url }))
}

export type JmpEmailSkip = { skipped: true; reason: string }
export type JmpEmailSent = { skipped: false }

/** Renderiza e envia um e-mail JMP. Não checa `enabled` — quem chama decide. */
export async function sendJmpEmail(opts: {
  content: JmpContent
  lead: JmpLeadEmailContext
  subject: string
  body: string
  attachments?: JmpEmailAttachment[]
}): Promise<JmpEmailSkip | JmpEmailSent> {
  if (!opts.lead.email) return { skipped: true, reason: 'missing_email' }
  const subject = applyTemplate(opts.subject, opts.lead, opts.content).trim()
  const text = applyTemplate(opts.body, opts.lead, opts.content).trim()
  if (!subject || !text) return { skipped: true, reason: 'empty_template' }

  await sendMail({
    to: opts.lead.email,
    subject,
    text,
    html: renderHtml(text),
    attachments: toMailAttachments(opts.attachments),
  })
  return { skipped: false }
}
