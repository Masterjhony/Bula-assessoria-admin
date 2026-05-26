import { readFileSync } from 'fs'
import { join } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const user = await requireUser().catch(() => null)
  if (!user) return NextResponse.redirect(new URL('/', req.url))
  const html = readFileSync(join(process.cwd(), 'src/app/sistema-legacy/sistema.html'), 'utf-8')
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
