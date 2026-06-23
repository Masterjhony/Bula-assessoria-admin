import { NextRequest, NextResponse } from 'next/server'
import { syncSheetColorsToCrm } from '@/app/sistema/actions/crm-leads'

export const maxDuration = 60

// Sincronização agendada planilha → CRM por COR (aba "Leads JMP") + cadastros
// prontos (aba "Cadastro JMP"). Move o estágio dos leads conforme a cor pintada
// pela equipe e migra cadastros aprovados para Clientes. Movimentos manuais no
// CRM são preservados (extra_data.sheet_color_status), então rodar no automático
// é seguro. Recomendado a cada hora (menos frequente que o heal de 15 min).
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
  const result = await syncSheetColorsToCrm(true)
  return NextResponse.json({
    ok: true,
    statusChanges: result.changes.length,
    skippedManual: result.skippedManual,
    unmatchedColored: result.unmatchedColored,
    cadastros: result.cadastros,
  })
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}
