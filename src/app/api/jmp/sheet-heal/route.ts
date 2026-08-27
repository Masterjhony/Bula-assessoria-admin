import { NextRequest, NextResponse } from 'next/server'
import { normalizeMetaRawRows } from '@/lib/jmp-sheets'

export const maxDuration = 60

// Auto-cura agendada da planilha "Leads JMP": realinha as linhas cruas que o
// Meta Ads despeja a partir da coluna A e as leva para o TOPO da LEADS GERAIS
// (o conector despeja no fim da aba; normalizar sem mover deixava o lead novo
// parado na última linha — foi o que a equipe viu em 18/08). Os outros
// gatilhos (lead da landing, abertura da Validação) são oportunistas — sem
// tráfego, as linhas cruas ficariam paradas até alguém mexer.
//
// Agendamento: Vercel Cron a cada 5 min (vercel.json) — é ele quem vale. O
// GitHub Actions (jmp-sheet-heal.yml) ficou como rede de segurança: o
// agendador do Actions estrangula workflow agendado e, em 27/08, entregou o
// "*/5" a cada 1–11 horas; com o agendamento só lá, 10 leads do "LEAD -
// PERPETUO TOURO" ficaram crus no fim da planilha por 4 horas. As duas fontes
// podem coexistir: normalize/absorve disputam a mesma trava no banco e a
// perdedora devolve "locked" sem tocar na planilha.
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
