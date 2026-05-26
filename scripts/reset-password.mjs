import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const email = process.argv[2]
const password = process.argv[3]
if (!email || !password) {
  console.error('Uso: node scripts/reset-password.mjs <email> <nova_senha>')
  process.exit(1)
}

const { data: list, error: listErr } = await supa.auth.admin.listUsers()
if (listErr) { console.error(listErr); process.exit(1) }
const user = list.users.find((u) => u.email === email)
if (!user) { console.error('User nao encontrado:', email); process.exit(1) }

const { error } = await supa.auth.admin.updateUserById(user.id, { password })
if (error) { console.error('Falha:', error.message); process.exit(1) }
console.log(`Senha redefinida para ${email}`)
console.log(`Nova senha: ${password}`)
