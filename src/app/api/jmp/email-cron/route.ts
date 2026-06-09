import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { DEFAULT_JMP_CONTENT, sanitizeContent } from '@/lib/jmp-content'
import { sendDueFlowEmails } from '@/lib/jmp-email-flow'

export const maxDuration = 60

// Processa o fluxo de e-mail marketing JMP (linhas vencidas em jmp_email_queue).
// Acionado por cron. Auth: Authorization: Bearer <CRON_SECRET> (padrão Vercel
// Cron) OU x-webhook-secret == WHATSAPP_GROUP_TASK_SECRET (cron externo).
function authorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  const groupSecret = process.env.WHATSAPP_GROUP_TASK_SECRET
  const auth = req.headers.get('authorization') ?? ''
  const webhook = req.headers.get('x-webhook-secret') ?? ''
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true
  if (groupSecret && webhook === groupSecret) return true
  return false
}

async function run(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { data } = await supabaseAdmin()
    .from('jmp_landing_content')
    .select('data')
    .eq('id', 'default')
    .maybeSingle()
  const content = data?.data ? sanitizeContent(data.data) : DEFAULT_JMP_CONTENT
  const result = await sendDueFlowEmails(content)
  return NextResponse.json({ ok: true, ...result })
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}
