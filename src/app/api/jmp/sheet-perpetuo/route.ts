import { NextRequest, NextResponse } from 'next/server'
import { syncBulaLeadsToPerpetuoTab, syncEaoLeadsToTab } from '@/lib/jmp-sheets'

export const maxDuration = 60

// Espelha os leads crus do Meta ("Cópia de LEADS BULA") para a aba organizada
// "LEADS BULA - PERPETUO", em layout fixo e legível. Append-only e idempotente
// pelo `id` do Meta — seguro no automático. Roda junto com o sheet-heal (a cada
// 15 min, via GitHub Actions).
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
    const result = await syncBulaLeadsToPerpetuoTab()
    // Aba dedicada da campanha EAO — best-effort para nunca derrubar o PERPETUO.
    const eao = await syncEaoLeadsToTab().catch(e => {
      console.error('[sheet-perpetuo] Leads EAO falhou:', e instanceof Error ? e.message : e)
      return { appended: 0, total: 0, skipped: 0, reason: 'error' as const }
    })
    return NextResponse.json({ ok: true, ...result, eao })
  } catch (e) {
    // Sem isso o cron só vê "500" e o erro real fica escondido nos logs.
    const message = e instanceof Error ? e.message : String(e)
    console.error('[sheet-perpetuo] falhou:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}
