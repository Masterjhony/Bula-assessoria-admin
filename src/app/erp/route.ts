import { readFileSync } from 'fs'
import { join } from 'path'
import { NextRequest } from 'next/server'
import { requireUser } from '@/lib/supabase'

export async function GET(_req: NextRequest) {
  const user = await requireUser().catch(() => null)
  if (!user) {
    // Mostra o mesmo login da raiz; quando autenticar, sera redirecionado para /erp.
    const html = readFileSync(join(process.cwd(), 'src/app/login.html'), 'utf-8')
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
  const html = readFileSync(join(process.cwd(), 'src/app/erp/erp.html'), 'utf-8')
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
