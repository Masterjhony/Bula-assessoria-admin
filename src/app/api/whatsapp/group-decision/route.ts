import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function POST(req: NextRequest) {
  const SECRET = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
  const authHeader = req.headers.get('x-webhook-secret')
  if (!SECRET || authHeader !== SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    decision: string
    reason?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { decision, reason } = body

  if (!decision?.trim()) {
    return NextResponse.json({ error: 'decision é obrigatório' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('tactical_decisions')
    .insert({
      decision: decision.trim(),
      reason: reason?.trim() || null,
      decided_at: new Date().toISOString().split('T')[0],
    })
    .select('id, decision')
    .single()

  if (error) {
    console.error('[group-decision] Erro ao criar decisão:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidatePath('/web-admin/projetos')
  return NextResponse.json({ success: true, decision_id: data.id, decision: data.decision })
}
