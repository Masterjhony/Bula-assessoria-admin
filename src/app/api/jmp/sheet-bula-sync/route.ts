import { NextRequest, NextResponse } from 'next/server'
import { importMissingLeadsFromBulaSheet } from '@/app/sistema/actions/crm-leads'

export const maxDuration = 60

// Ingestão agendada da aba "Cópia de LEADS BULA" (formulário Meta "BULA
// PERPETUO") → CRM. Cria em ENTRADA os leads ainda inexistentes (casados por
// telefone/e-mail), sem reescrever a planilha. Idempotente — seguro no
// automático. Roda junto com o sheet-heal (a cada 15 min, via GitHub Actions).
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
  try {
    const result = await importMissingLeadsFromBulaSheet()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    // Sem isso o cron só vê "500" e o erro real fica escondido nos logs.
    const message = e instanceof Error ? e.message : String(e)
    console.error('[sheet-bula-sync] falhou:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}
