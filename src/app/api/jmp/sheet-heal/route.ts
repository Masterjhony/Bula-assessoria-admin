import { NextRequest, NextResponse } from 'next/server'
import { normalizeMetaRawRows } from '@/lib/jmp-sheets'

export const maxDuration = 60

// Auto-cura agendada da planilha "Leads JMP": realinha linhas cruas que o
// Meta Ads despeja a partir da coluna A. Os outros gatilhos (lead da landing,
// abertura da Validação) são oportunistas — sem tráfego, as linhas cruas
// ficariam paradas até alguém mexer. Acionado pelo GitHub Actions
// (jmp-sheet-heal.yml, a cada 15 min) + Vercel Cron diário como reserva.
// Auth: Authorization: Bearer <CRON_SECRET> (padrão Vercel Cron) OU
// x-webhook-secret == WHATSAPP_GROUP_TASK_SECRET (cron externo).
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
  const normalized = await normalizeMetaRawRows()
  return NextResponse.json({ ok: true, normalized })
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}
