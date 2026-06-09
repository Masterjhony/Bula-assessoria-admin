import { sendMail } from './email'
import type { JmpContent, JmpWelcomeEmail } from './jmp-content'

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
  'nome',
  'email',
  'whatsapp',
  'uf',
  'cidade',
  'momento',
  'cabecas',
  'interesse',
  'whatsappGroupUrl',
])

function templateValue(key: string, lead: JmpLeadEmailContext, content: JmpContent) {
  if (!TEMPLATE_KEYS.has(key)) return ''
  if (key === 'whatsappGroupUrl') return content.whatsappGroupUrl
  return String(lead[key as keyof JmpLeadEmailContext] ?? '')
}

function applyTemplate(template: string, lead: JmpLeadEmailContext, content: JmpContent) {
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

function renderHtml(text: string) {
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

export async function sendJmpWelcomeEmail(content: JmpContent, lead: JmpLeadEmailContext) {
  const config: JmpWelcomeEmail = content.welcomeEmail
  if (!config.enabled) return { skipped: true as const, reason: 'disabled' }
  if (!lead.email) return { skipped: true as const, reason: 'missing_email' }

  const subject = applyTemplate(config.subject, lead, content).trim()
  const text = applyTemplate(config.body, lead, content).trim()
  if (!subject || !text) return { skipped: true as const, reason: 'empty_template' }

  await sendMail({
    to: lead.email,
    subject,
    text,
    html: renderHtml(text),
  })

  return { skipped: false as const }
}
