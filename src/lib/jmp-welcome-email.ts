import { sendJmpEmail, type JmpLeadEmailContext } from './jmp-email'
import type { JmpContent } from './jmp-content'

export type { JmpLeadEmailContext }

// E-mail de boas-vindas (transacional, imediato) disparado no momento do
// cadastro. O fluxo de marketing agendado fica em jmp-email-flow.ts.
export async function sendJmpWelcomeEmail(content: JmpContent, lead: JmpLeadEmailContext) {
  const config = content.welcomeEmail
  if (!config.enabled) return { skipped: true as const, reason: 'disabled' }
  return sendJmpEmail({
    content,
    lead,
    subject: config.subject,
    body: config.body,
    attachments: config.attachments,
  })
}
