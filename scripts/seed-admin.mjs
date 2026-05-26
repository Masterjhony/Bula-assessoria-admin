import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { randomBytes as cryptoRandom } from 'node:crypto'

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

const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('URL ou SERVICE_ROLE_KEY ausente em .env.local')
  process.exit(1)
}

const supa = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const email = process.argv[2] || 'formuladoboi@gmail.com'
const nome = process.argv[3] || 'Admin Bula'
const password = process.argv[4] || cryptoRandom(12).toString('base64').replace(/[+/=]/g, '').slice(0, 16) + 'A1!'

console.log(`Criando admin user:`)
console.log(`  email   : ${email}`)
console.log(`  nome    : ${nome}`)
console.log(`  password: ${password}`)

const { data, error } = await supa.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { nome },
})

if (error) {
  console.error('\nFalha:', error.message)
  process.exit(1)
}

console.log('\nUser criado:', { id: data.user.id, email: data.user.email })

const { data: prof } = await supa.from('profiles').select('*').eq('id', data.user.id).single()
console.log('Profile (criado pelo trigger):', prof)

console.log('\n=> ANOTE A SENHA ACIMA PARA FAZER LOGIN.')
