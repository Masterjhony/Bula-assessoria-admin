import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createClient } from '@/utils/supabase/server'
import { fail, ok } from '@/lib/respond'

const BUCKET = 'jmp-landing'

// Gera uma URL de upload assinada: o navegador envia o arquivo DIRETO para o
// Supabase Storage, sem passar pela função serverless (que tem limite de
// ~4.5MB no Vercel — causa de uploads de fotos grandes falharem). Exige login.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('Não autenticado.', 401)

  const body = await req.json().catch(() => ({}))
  const folderRaw = String(body.folder ?? '').replace(/[^a-z0-9/_-]/gi, '')
  const folder = folderRaw ? `${folderRaw.replace(/^\/+|\/+$/g, '')}/` : ''
  const ext = (String(body.filename ?? 'file').split('.').pop() || 'bin')
    .toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
  const path = `${folder}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUploadUrl(path)
  if (error) {
    console.error('[JMP upload-url] failed:', error.message)
    return fail('Falha ao preparar upload.', 500)
  }
  const { data: { publicUrl } } = supabaseAdmin().storage.from(BUCKET).getPublicUrl(path)
  return ok({ path: data.path, token: data.token, publicUrl })
}
