import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createClient } from '@/utils/supabase/server'
import { fail, ok } from '@/lib/respond'
import { DEFAULT_JMP_CONTENT, sanitizeContent } from '@/lib/jmp-content'

const TABLE = 'jmp_landing_content'
const ROW_ID = 'default'

// GET público: a SPA da landing lê isto no carregamento. Sempre devolve um
// conteúdo válido — registro do banco (saneado) ou o padrão se não existir.
export async function GET() {
  const { data } = await supabaseAdmin()
    .from(TABLE)
    .select('data')
    .eq('id', ROW_ID)
    .maybeSingle()

  const content = data?.data ? sanitizeContent(data.data) : DEFAULT_JMP_CONTENT
  return new Response(JSON.stringify(content), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // cache curto na borda; o admin vê o efeito quase imediato
      'Cache-Control': 'public, max-age=30, s-maxage=30, stale-while-revalidate=300',
    },
  })
}

// POST: salva o conteúdo. Exige usuário autenticado (mesmo login do sistema).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Não autenticado.', 401)

  const body = await req.json().catch(() => null)
  if (!body) return fail('JSON inválido.')

  const content = sanitizeContent(body)
  const { error } = await supabaseAdmin()
    .from(TABLE)
    .upsert({ id: ROW_ID, data: content, updated_at: new Date().toISOString() })

  if (error) {
    console.error('[JMP content] save failed:', error.message)
    return fail('Não foi possível salvar o conteúdo.', 500)
  }
  return ok({ saved: true, content })
}
