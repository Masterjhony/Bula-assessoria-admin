import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

const MAX_BYTES = 25 * 1024 * 1024 // 25MB

export async function POST(request: Request) {
  const supabase = await createClient()
  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Apenas PDF é permitido' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Arquivo acima de 25MB' }, { status: 400 })
  }

  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName || 'catalogo.pdf'}`

  const { error } = await supabase.storage
    .from('leilao-catalogos')
    .upload(path, file, { contentType: 'application/pdf', upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage
    .from('leilao-catalogos')
    .getPublicUrl(path)

  return NextResponse.json({ url: publicUrl, path, filename: file.name, size: file.size })
}
