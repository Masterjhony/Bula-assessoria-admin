// Suite E2E completa para o fluxo de autenticacao.
// Cobre: signup, signin, me, signout, validacoes, edge cases, profile, forgot.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = process.cwd()
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)

const BASE = process.env.BASE || 'http://localhost:3010'
const adm = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

let cookies = ''
const resetCookies = () => { cookies = '' }
const extract = (h) => {
  const sets = []
  if (typeof h.getSetCookie === 'function') sets.push(...h.getSetCookie())
  else for (const [k, v] of h.entries()) if (k.toLowerCase() === 'set-cookie') sets.push(v)
  for (const sc of sets) {
    const pair = sc.split(';')[0]
    const [name] = pair.split('=')
    cookies = cookies.split('; ').filter(Boolean).filter(p => !p.startsWith(name + '=')).concat([pair]).join('; ')
  }
}
const req = async (path, opts = {}) => {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', cookie: cookies, ...(opts.headers || {}) },
  })
  extract(res.headers)
  let json = null; const text = await res.text(); try { json = JSON.parse(text) } catch (_) {}
  return { status: res.status, json, text }
}

let pass = 0, fail = 0
const log = (name, c, extra = '') => { if (c) { console.log(`  OK   ${name}${extra ? ' (' + extra + ')' : ''}`); pass++ } else { console.log(`  FAIL ${name}${extra ? ' (' + extra + ')' : ''}`); fail++ } }

const createdUsers = []
const cleanup = async () => {
  for (const u of createdUsers) {
    try { await adm.from('profiles').delete().eq('id', u) } catch (_) {}
    try { await adm.auth.admin.deleteUser(u) } catch (_) {}
  }
}

try {
  console.log('[1] Signup: validacoes de entrada')
  log('Rejeita nome vazio', (await req('/api/bula/auth/signup', { method:'POST', body:JSON.stringify({ email:'a@b.com', password:'Senha1234!' }) })).status === 400)
  log('Rejeita email vazio', (await req('/api/bula/auth/signup', { method:'POST', body:JSON.stringify({ name:'X', password:'Senha1234!' }) })).status === 400)
  log('Rejeita email invalido', (await req('/api/bula/auth/signup', { method:'POST', body:JSON.stringify({ name:'X', email:'naoemail', password:'Senha1234!' }) })).status === 400)
  log('Rejeita senha curta', (await req('/api/bula/auth/signup', { method:'POST', body:JSON.stringify({ name:'X', email:'a@b.com', password:'123' }) })).status === 400)

  console.log('\n[2] Signup: fluxo feliz')
  const email = `auth-test-${Date.now()}@gmail.com`
  const password = 'Senha1234!Test'
  const name = 'Joao da Silva'
  resetCookies()
  const r = await req('/api/bula/auth/signup', { method:'POST', body:JSON.stringify({ name, email, password }) })
  log('POST signup retorna 200', r.status === 200, `status=${r.status} body=${JSON.stringify(r.json)}`)
  log('Resposta contem user.id', !!r.json?.user?.id)
  log('Resposta indica sessao criada', r.json?.session === true)
  if (r.json?.user?.id) createdUsers.push(r.json.user.id)
  log('Cookie de sessao foi setado', cookies.includes('sb-') && cookies.includes('auth-token'))

  console.log('\n[3] Apos signup, sessao esta ativa')
  const me = await req('/api/bula/auth/me')
  log('GET /me retorna 200', me.status === 200)
  log('Email correto em /me', me.json?.email === email.toLowerCase())
  log('Nome correto em /me', me.json?.nome === name)
  log('Iniciais geradas (JS)', me.json?.iniciais === 'JS', `iniciais=${me.json?.iniciais}`)

  console.log('\n[4] Signup duplicado')
  resetCookies()
  const dup = await req('/api/bula/auth/signup', { method:'POST', body:JSON.stringify({ name:'Outro', email, password }) })
  log('Rejeita email duplicado (409)', dup.status === 409, `status=${dup.status}`)

  console.log('\n[5] Signout')
  resetCookies()
  const r2 = await req('/api/bula/auth/signin', { method:'POST', body:JSON.stringify({ email, password }) })
  log('Signin do user criado funciona', r2.status === 200, `status=${r2.status}`)
  const me2 = await req('/api/bula/auth/me')
  log('Sessao apos signin', me2.status === 200 && me2.json?.email === email.toLowerCase())
  const out = await req('/api/bula/auth/signout', { method:'POST' })
  log('Signout retorna 200', out.status === 200)
  const me3 = await req('/api/bula/auth/me')
  log('Sessao removida apos signout', me3.status === 401, `status=${me3.status}`)

  console.log('\n[6] Signin: validacoes e edge cases')
  log('Senha errada => 401', (await req('/api/bula/auth/signin', { method:'POST', body:JSON.stringify({ email, password:'errada' }) })).status === 401)
  log('Email inexistente => 401', (await req('/api/bula/auth/signin', { method:'POST', body:JSON.stringify({ email:`naoexiste-${Date.now()}@gmail.com`, password }) })).status === 401)
  log('Sem email/senha => 400', (await req('/api/bula/auth/signin', { method:'POST', body:JSON.stringify({}) })).status === 400)
  log('Email com maiusculas funciona (normalizacao)', (await req('/api/bula/auth/signin', { method:'POST', body:JSON.stringify({ email: email.toUpperCase(), password }) })).status === 200)

  console.log('\n[7] /me sem sessao')
  resetCookies()
  log('/me sem cookie => 401', (await req('/api/bula/auth/me')).status === 401)

  console.log('\n[8] Forgot password (envia email)')
  const fr = await req('/api/bula/auth/forgot', { method:'POST', body:JSON.stringify({ email }) })
  // 200 = email enviado; 429 = rate limit (aceito em CI/teste, supabase limita 1/min)
  log('Forgot com email valido => 200 ou 429', fr.status === 200 || fr.status === 429, `status=${fr.status} body=${fr.text?.slice(0,80)}`)
  log('Forgot sem email => 400', (await req('/api/bula/auth/forgot', { method:'POST', body:JSON.stringify({}) })).status === 400)
  log('Forgot com email invalido => 400', (await req('/api/bula/auth/forgot', { method:'POST', body:JSON.stringify({ email:'invalido' }) })).status === 400)

  console.log('\n[9] Trigger de profile criou registro')
  const u = await adm.from('profiles').select('*').eq('id', createdUsers[0]).maybeSingle()
  log('Profile no banco', !!u.data, `nome=${u.data?.nome} iniciais=${u.data?.iniciais}`)

  console.log('\n[10] Pagina /cadastro renderiza')
  resetCookies()
  const cad = await req('/cadastro')
  log('GET /cadastro => 200', cad.status === 200)
  log('HTML contem form de cadastro', cad.text?.includes('signup-form') && cad.text?.includes('handleSignup'))
  log('HTML usa novo fluxo (redirect inteligente)', cad.text?.includes("data.session") && cad.text?.includes('startsWith(\'erp.\')'))

  console.log('\n[11] Header Host: erp.localhost - signup tambem funciona')
  const email3 = `erp-auth-${Date.now()}@gmail.com`
  resetCookies()
  const r3 = await req('/api/bula/auth/signup', { method:'POST', body:JSON.stringify({ name:'ERP User', email: email3, password }), headers:{ Host:'erp.localhost' } })
  log('Signup via Host erp.localhost', r3.status === 200, `status=${r3.status}`)
  if (r3.json?.user?.id) createdUsers.push(r3.json.user.id)

} finally {
  await cleanup()
}

console.log(`\nResultado: ${pass} OK / ${fail} FAIL`)
process.exit(fail > 0 ? 1 : 0)
