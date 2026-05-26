import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function POST(req: NextRequest) {
  // Valida segredo compartilhado com o VPS
  const SECRET = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
  const authHeader = req.headers.get('x-webhook-secret')
  if (!SECRET || authHeader !== SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    group_id: string
    group_name?: string
    sender: string
    sender_name?: string
    title: string
    status?: string
    assignee_name?: string
    due_date?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { group_id, group_name, sender, sender_name, title, status, assignee_name, due_date } = body

  if (!group_id || !sender || !title?.trim()) {
    return NextResponse.json(
      { error: 'group_id, sender e title são obrigatórios' },
      { status: 400 }
    )
  }

  const VALID_STATUSES = ['Idéias', 'A fazer', 'Em andamento', 'Completa']
  const taskStatus = status && VALID_STATUSES.includes(status) ? status : 'A fazer'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Descobre a posição máxima na coluna de destino
  const { data: maxPosData } = await supabase
    .from('tactical_tasks')
    .select('position')
    .eq('status', taskStatus)
    .order('position', { ascending: false })
    .limit(1)
    .single()

  const newPosition = (maxPosData?.position ?? 0) + 1000

  const { data, error } = await supabase
    .from('tactical_tasks')
    .insert({
      title: title.trim(),
      status: taskStatus,
      priority: 'Média',
      position: newPosition,
      assignees: assignee_name ? [assignee_name] : null,
      due_date: due_date ?? null,
      whatsapp_group_id: group_id,
      whatsapp_group_name: group_name ?? null,
      whatsapp_sender: sender,
      whatsapp_sender_name: sender_name ?? null,
    })
    .select('id, title')
    .single()

  if (error) {
    console.error('[group-task] Erro ao criar task:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidatePath('/web-admin/projetos')
  return NextResponse.json({ success: true, task_id: data.id, title: data.title })
}
