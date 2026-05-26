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
    title: string
    probability?: string
    impact?: string
    mitigation?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { title, probability, impact, mitigation } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: 'title é obrigatório' }, { status: 400 })
  }

  const VALID_PROBS = ['baixa', 'media', 'alta']
  const VALID_IMPACTS = ['baixo', 'medio', 'alto']

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('tactical_risks')
    .insert({
      title: title.trim(),
      probability: VALID_PROBS.includes(probability ?? '') ? probability : 'media',
      impact: VALID_IMPACTS.includes(impact ?? '') ? impact : 'medio',
      mitigation: mitigation?.trim() || null,
      status: 'active',
    })
    .select('id, title')
    .single()

  if (error) {
    console.error('[group-risk] Erro ao criar risco:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidatePath('/web-admin/projetos')
  return NextResponse.json({ success: true, risk_id: data.id, title: data.title })
}
