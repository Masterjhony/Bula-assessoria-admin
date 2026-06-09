import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createClient } from '@/utils/supabase/server'
import { fail, ok } from '@/lib/respond'

const BUCKET = 'jmp-landing'
const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/gif'])

// Upload de imagem do painel adminjmp para o bucket público `jmp-landing`.
// Exige usuário autenticado; grava via service role (bypassa RLS do Storage).
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Não autenticado.', 401)

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return fail('Arquivo ausente.')
  if (!ALLOWED.has(file.type)) return fail('Formato não suportado (use JPG, PNG, WEBP, AVIF ou GIF).')
  if (file.size > 10 * 1024 * 1024) return fail('Imagem acima de 10MB.')

  // pasta opcional para organização (ex.: "flyers", "galeria-femeas")
  const folderRaw = String(form?.get('folder') ?? '').replace(/[^a-z0-9/_-]/gi, '')
  const folder = folderRaw ? `${folderRaw.replace(/^\/+|\/+$/g, '')}/` : ''
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${folder}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { error } = await supabaseAdmin()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) {
    console.error('[JMP upload] failed:', error.message)
    return fail('Falha no upload.', 500)
  }

  const { data: { publicUrl } } = supabaseAdmin().storage.from(BUCKET).getPublicUrl(path)
  return ok({ url: publicUrl })
}
