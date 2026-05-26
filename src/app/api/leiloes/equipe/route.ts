import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { requireAdmin } from '@/lib/auth-helpers'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('leiloes_equipe')
    .select('*')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const nome = String(body.nome ?? '').trim()
  if (!nome) return NextResponse.json({ error: 'nome obrigatório' }, { status: 400 })

  const supabase = await createClient()
  const payload = {
    nome,
    apelido: String(body.apelido ?? '').trim(),
    iniciais: String(body.iniciais ?? '').trim() || nome.split(/\s+/).map((p: string) => p[0] ?? '').join('').slice(0, 2).toUpperCase(),
    cor: String(body.cor ?? '#A0792E'),
    empresa: String(body.empresa ?? ''),
    telefone: String(body.telefone ?? ''),
    email: String(body.email ?? ''),
    foto_url: String(body.foto_url ?? ''),
    ativo: body.ativo === false ? false : true,
    ordem: Number.isFinite(body.ordem) ? Number(body.ordem) : 999,
    observacao: String(body.observacao ?? ''),
  }

  const { data, error } = await supabase.from('leiloes_equipe').insert(payload).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data, { status: 201 })
}
