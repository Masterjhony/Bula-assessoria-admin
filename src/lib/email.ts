import nodemailer from 'nodemailer'

let cachedTransporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
    if (cachedTransporter) return cachedTransporter

    const host = process.env.SMTP_HOST || 'smtp.hostinger.com'
    const port = Number(process.env.SMTP_PORT || 465)
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS

    if (!user || !pass) {
        throw new Error('SMTP_USER e SMTP_PASS precisam estar configurados nas variáveis de ambiente.')
    }

    cachedTransporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
    })

    return cachedTransporter
}

export interface MailAttachment {
    filename: string
    /** URL pública (nodemailer baixa) ou caminho local. */
    path: string
}

export interface SendMailOptions {
    to: string
    subject: string
    html: string
    text?: string
    attachments?: MailAttachment[]
}

export async function sendMail({ to, subject, html, text, attachments }: SendMailOptions) {
    const transporter = getTransporter()
    const from = process.env.SMTP_FROM || `Fórmula do Boi <${process.env.SMTP_USER}>`

    return transporter.sendMail({
        from,
        to,
        subject,
        html,
        text: text ?? html.replace(/<[^>]+>/g, ''),
        ...(attachments && attachments.length ? { attachments } : {}),
    })
}

export function renderPasswordResetEmail(link: string, fullName?: string) {
    const greeting = fullName ? `Olá ${fullName.split(' ')[0]},` : 'Olá,'
    return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#0f0f0f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5;">
        <tr><td style="background:#0a0a0a;padding:24px 32px;color:#ffffff;">
          <div style="font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Fórmula do Boi</div>
          <div style="font-size:12px;color:#A68B4B;margin-top:4px;">Redefinição de senha</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px 0;font-size:15px;">${greeting}</p>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.5;">
            Recebemos um pedido para redefinir a senha da sua conta no painel administrativo.
            Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${link}" style="display:inline-block;background:#A68B4B;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;">
              Redefinir senha
            </a>
          </div>
          <p style="margin:24px 0 8px 0;font-size:12px;color:#666;">Ou copie e cole este link no navegador:</p>
          <p style="margin:0;font-size:12px;color:#A68B4B;word-break:break-all;">${link}</p>
          <p style="margin:24px 0 0 0;font-size:13px;color:#666;line-height:1.5;">
            Se você não solicitou essa redefinição, ignore esta mensagem — sua senha continuará a mesma.
          </p>
        </td></tr>
        <tr><td style="background:#fafafa;padding:16px 32px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">
          © Fórmula do Boi · contato@formuladoboi.com
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

export function renderVerificationCodeEmail(code: string, fullName?: string) {
    const greeting = fullName ? `Olá ${fullName.split(' ')[0]},` : 'Olá,'
    return `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#0f0f0f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e5;">
        <tr><td style="background:#0a0a0a;padding:24px 32px;color:#ffffff;">
          <div style="font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Fórmula do Boi</div>
          <div style="font-size:12px;color:#A68B4B;margin-top:4px;">Painel Administrativo</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px 0;font-size:15px;">${greeting}</p>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.5;">
            Use o código abaixo para concluir o cadastro no painel administrativo da Fórmula do Boi.
            O código expira em <strong>10 minutos</strong>.
          </p>
          <div style="text-align:center;margin:24px 0;">
            <div style="display:inline-block;font-family:'Courier New',monospace;font-size:36px;letter-spacing:12px;font-weight:700;color:#A68B4B;background:#fff7e6;border:1px dashed #A68B4B;padding:18px 28px;border-radius:12px;">
              ${code}
            </div>
          </div>
          <p style="margin:24px 0 0 0;font-size:13px;color:#666;line-height:1.5;">
            Se você não solicitou este cadastro, ignore esta mensagem — nenhuma conta será criada.
          </p>
        </td></tr>
        <tr><td style="background:#fafafa;padding:16px 32px;border-top:1px solid #eee;font-size:11px;color:#999;text-align:center;">
          © Fórmula do Boi · contato@formuladoboi.com
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}
