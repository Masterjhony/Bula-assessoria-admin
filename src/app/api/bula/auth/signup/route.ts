import { NextRequest } from 'next/server'
import { supabaseAdmin, supabaseFromCookies } from '@/lib/supabase'
import { fail, ok } from '@/lib/respond'

// Sistema administrativo: criamos o usuario JA confirmado via service_role
// (bypass de rate limit e de confirmacao por email) e fazemos signin imediato
// para deixar a sessao pronta. O trigger handle_new_user cria o profile.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const name = String(body.name || '').trim()

  if (!name) return fail('Nome e obrigatorio.')
  if (!email) return fail('Email e obrigatorio.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Email invalido.')
  if (!password || password.length < 6) return fail('Senha deve ter no minimo 6 caracteres.')

  const admin = supabaseAdmin()

  // Pre-check: usuario ja existe?
  const { data: existing, error: errLookup } = await admin
    .from('profiles')
    .select('id')
    .eq('id', '00000000-0000-0000-0000-000000000000')
    .maybeSingle()
  if (errLookup && errLookup.message && !errLookup.message.includes('Results')) {
    // tabela inexistente ou erro de conexao
    return fail('Servico indisponivel. Tente novamente em instantes.', 503)
  }

  const { data: created, error: errCreate } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome: name },
  })
  if (errCreate) {
    const msg = errCreate.message || ''
    if (/already.*registered|already exists|duplicate/i.test(msg)) {
      return fail('Ja existe uma conta com este email.', 409)
    }
    if (/invalid/i.test(msg) && /email/i.test(msg)) {
      return fail('Email invalido ou bloqueado pelo provedor.', 400)
    }
    return fail(msg || 'Falha ao criar conta.', 400)
  }
  if (!created.user) return fail('Falha ao criar conta.', 400)

  // Trigger handle_new_user pode levar uns ms; garante que profile exista (sem sobrescrever).
  try {
    const { data: existing } = await admin.from('profiles').select('id').eq('id', created.user.id).maybeSingle()
    if (!existing) {
      const nome = name || email.split('@')[0]
      // Usa a funcao SQL canonica para gerar as iniciais (ignora particulas).
      const { data: ini } = await admin.rpc('iniciais_from_nome', { nome })
      await admin
        .from('profiles')
        .upsert({ id: created.user.id, nome, iniciais: ini || '?' }, { onConflict: 'id' })
    }
  } catch {}

  // Auto-signin: cria a sessao via cookie SSR para que o cliente ja entre logado.
  const supa = supabaseFromCookies()
  const { error: errSign } = await supa.auth.signInWithPassword({ email, password })
  if (errSign) {
    // Conta foi criada com sucesso, mas autologin falhou. Cliente vai redirecionar para login.
    return ok({
      user: { id: created.user.id, email: created.user.email },
      session: false,
    })
  }
  return ok({
    user: { id: created.user.id, email: created.user.email },
    session: true,
  })
}
