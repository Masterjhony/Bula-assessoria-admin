import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET() {
  const supabase = getSupabase()

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [countRes, messagesRes, lastLeadRes] = await Promise.all([
    supabase
      .from('whatsapp_messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString()),

    supabase
      .from('whatsapp_messages')
      .select('id, phone, name, status, reason, error_msg, created_at')
      .order('created_at', { ascending: false })
      .limit(50),

    supabase
      .from('crm_leads')
      .select('id, nome, created_at, telefone')
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  const messages = messagesRes.data ?? []

  // Last unique message per phone — used for "conversations" view
  const seen = new Set<string>()
  const conversations = messages
    .filter((m) => {
      if (!m.phone || seen.has(m.phone)) return false
      seen.add(m.phone)
      return true
    })
    .slice(0, 10)

  return NextResponse.json({
    today_count: countRes.count ?? 0,
    last_lead: lastLeadRes.data ?? null,
    messages,
    conversations,
  })
}
