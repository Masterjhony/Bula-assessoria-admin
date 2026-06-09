import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fail, ok } from '@/lib/respond'
import { connectExistingSheet, getOrCreateSheet, getSheetInfo } from '@/lib/jmp-sheets'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// GET: status da conexão com o Google Sheets (url se já conectado).
export async function GET() {
  if (!(await requireUser())) return fail('Não autenticado.', 401)
  const info = await getSheetInfo().catch(() => null)
  return ok({ connected: !!info, url: info?.url ?? null })
}

// POST: conecta a planilha. Sem corpo → cria uma nova. Com { sheet } (link/ID)
// → usa uma planilha existente compartilhada com a service account.
export async function POST(req: NextRequest) {
  if (!(await requireUser())) return fail('Não autenticado.', 401)
  const body = await req.json().catch(() => ({}))
  const existing = String(body?.sheet ?? '').trim()
  try {
    const info = existing ? await connectExistingSheet(existing) : await getOrCreateSheet()
    return ok({ connected: true, url: info.url })
  } catch (e) {
    console.error('[JMP sheets] setup failed:', e)
    return fail(e instanceof Error ? e.message : 'Falha ao conectar a planilha.', 500)
  }
}
