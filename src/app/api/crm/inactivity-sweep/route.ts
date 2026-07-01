import { NextRequest, NextResponse } from 'next/server'
import { sweepInactiveLeadsToLost } from '@/app/sistema/actions/crm-leads'

export const maxDuration = 60

// Sweep agendado de inatividade → PERDIDOS. Move para PERDIDOS o lead que
// respondeu ao menos uma vez, ficou >=14 dias sem responder e já recebeu >=3
// tentativas. Leads que nunca responderam (backlog) NÃO são tocados. Handoff
// humano e opt-out são preservados. Recomendado: 1x/dia.
// Auth: Authorization: Bearer <CRON_SECRET> OU x-webhook-secret == WHATSAPP_GROUP_TASK_SECRET.
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
  const result = await sweepInactiveLeadsToLost()
  return NextResponse.json({ ok: true, ...result })
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}
