import { NextRequest, NextResponse } from 'next/server'
import { absorveDumpsCrusDoMeta, syncAbasPorInteresse } from '@/lib/jmp-sheets'

export const maxDuration = 60

// Manutenção da planilha de leads (5 abas: LEADS GERAIS + TOUROS/FEMEAS/
// EMBRIÕES/OUTROS). Roda junto com o sheet-heal, a cada 5 min via GitHub
// Actions:
//   1. absorve na LEADS GERAIS os despejos crus do conector do Meta (inclusive
//      os que caem dentro de uma aba de trabalho) e limpa o lixo que sobra;
//   2. redistribui os leads da LEADS GERAIS nas abas por interesse.
// Ambos são append-only e idempotentes — nunca reescrevem linha existente nem
// as colunas da equipe (Etapa, Atendido por, Observações).
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
    // Primeiro absorver, depois distribuir: assim o lead que chegou cru já sai
    // na aba do interesse dele na MESMA passada.
    const meta = await absorveDumpsCrusDoMeta()
    const interesse = await syncAbasPorInteresse().catch((e: unknown) => {
      console.error('[sheet-perpetuo] abas por interesse falharam:', e instanceof Error ? e.message : e)
      return { total: 0, appended: {}, reason: 'error' as const }
    })
    return NextResponse.json({ ok: true, meta, interesse })
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
