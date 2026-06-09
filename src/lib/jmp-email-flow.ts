import { supabaseAdmin } from './supabase'
import type { JmpContent, JmpFlowEmail } from './jmp-content'
import { sendJmpEmail, type JmpLeadEmailContext } from './jmp-email'

const QUEUE = 'jmp_email_queue'
const BRT_OFFSET = 3 // Brasil = UTC-3 (sem horário de verão desde 2019)

export interface EnrollLead extends JmpLeadEmailContext {
  leadId?: string | null
}

/** Instante de envio (UTC) de um e-mail do fluxo, dado o momento do cadastro. */
function computeSendAt(email: JmpFlowEmail, signupAt: Date): Date | null {
  if (email.scheduleType === 'date') {
    if (!email.date) return null
    const [y, m, d] = email.date.split('-').map(Number)
    if (!y || !m || !d) return null
    return new Date(Date.UTC(y, m - 1, d, email.sendHour + BRT_OFFSET, 0, 0))
  }
  const dt = new Date(signupAt)
  dt.setUTCDate(dt.getUTCDate() + email.days)
  dt.setUTCHours(email.sendHour + BRT_OFFSET, 0, 0, 0)
  return dt
}

/** Inscreve um lead em todos os e-mails habilitados do fluxo. Best-effort. */
export async function enrollLeadInEmailFlow(
  content: JmpContent,
  lead: EnrollLead,
  signupAt: Date = new Date(),
): Promise<{ enrolled: number }> {
  if (!lead.email) return { enrolled: 0 }
  const rows: Record<string, unknown>[] = []
  for (const email of content.emailFlow) {
    if (!email.enabled) continue
    const sendAt = computeSendAt(email, signupAt)
    if (!sendAt) continue
    // não reenviar e-mails cuja data já passou há mais de 1 dia
    if (sendAt.getTime() < signupAt.getTime() - 24 * 3600 * 1000) continue
    rows.push({
      lead_id: lead.leadId ?? null,
      to_email: lead.email,
      nome: lead.nome,
      email_id: email.id,
      lead_data: {
        nome: lead.nome, email: lead.email, whatsapp: lead.whatsapp,
        uf: lead.uf, cidade: lead.cidade, momento: lead.momento,
        cabecas: lead.cabecas, interesse: lead.interesse,
      },
      send_at: sendAt.toISOString(),
      status: 'pending',
    })
  }
  if (!rows.length) return { enrolled: 0 }
  const { error } = await supabaseAdmin()
    .from(QUEUE)
    .upsert(rows, { onConflict: 'lead_id,email_id', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  return { enrolled: rows.length }
}

interface QueueRow {
  id: string
  to_email: string
  nome: string | null
  email_id: string
  lead_data: Record<string, unknown> | null
}

/** Processa e-mails vencidos (send_at <= agora). Idempotente via lock otimista. */
export async function sendDueFlowEmails(
  content: JmpContent,
  opts: { batch?: number; throttleMs?: number } = {},
): Promise<{ processed: number; sent: number; failed: number; skipped: number }> {
  const sb = supabaseAdmin()
  const batch = opts.batch ?? 30
  const throttle = opts.throttleMs ?? 700

  const { data: due } = await sb
    .from(QUEUE)
    .select('id,to_email,nome,email_id,lead_data')
    .eq('status', 'pending')
    .lte('send_at', new Date().toISOString())
    .order('send_at', { ascending: true })
    .limit(batch)

  let sent = 0, failed = 0, skipped = 0
  const rows = (due ?? []) as QueueRow[]

  for (const row of rows) {
    // lock otimista: só processa se ainda 'pending'
    const { data: claimed } = await sb
      .from(QUEUE)
      .update({ status: 'sending' })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (!claimed) continue

    const email = content.emailFlow.find((e) => e.id === row.email_id)
    if (!email || !email.enabled) {
      await sb.from(QUEUE).update({ status: 'skipped', error: 'email desabilitado/removido' }).eq('id', row.id)
      skipped++
      continue
    }

    const d = row.lead_data ?? {}
    const lead: JmpLeadEmailContext = {
      nome: String(d.nome ?? row.nome ?? ''),
      email: row.to_email,
      whatsapp: String(d.whatsapp ?? ''),
      uf: (d.uf as string) ?? null,
      cidade: (d.cidade as string) ?? null,
      momento: (d.momento as string) ?? null,
      cabecas: (d.cabecas as string) ?? null,
      interesse: (d.interesse as string) ?? null,
    }

    try {
      const r = await sendJmpEmail({ content, lead, subject: email.subject, body: email.body, attachments: email.attachments })
      if (r.skipped) {
        await sb.from(QUEUE).update({ status: 'skipped', error: r.reason }).eq('id', row.id)
        skipped++
      } else {
        await sb.from(QUEUE).update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', row.id)
        sent++
      }
    } catch (e) {
      await sb.from(QUEUE).update({ status: 'failed', error: e instanceof Error ? e.message : 'erro' }).eq('id', row.id)
      failed++
    }
    if (throttle) await new Promise((r) => setTimeout(r, throttle))
  }

  return { processed: rows.length, sent, failed, skipped }
}
