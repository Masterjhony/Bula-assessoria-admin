// QA end-to-end do upload de capa de leilão:
// 1. login
// 2. POST /api/bula/leiloes/upload com arquivo de imagem
// 3. valida que respondeu com URL pública e que a URL responde 200

import { readFileSync } from 'node:fs'
import { Blob } from 'node:buffer'

const BASE = process.env.QA_BASE || 'http://localhost:3000'
const EMAIL = process.env.QA_EMAIL || 'qa@bula.test'
const PASSWORD = process.env.QA_PASSWORD || 'QaBot123!'

// Login para pegar cookie de sessão
const signin = await fetch(`${BASE}/api/bula/auth/signin`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
console.log('Login status:', signin.status)
const setCookie = signin.headers.getSetCookie?.() ?? []
const cookieHeader = setCookie.map((c) => c.split(';')[0]).join('; ')
if (!cookieHeader) {
  console.error('Sem cookie de sessão. Abortando.')
  process.exit(1)
}

// PNG mínimo válido 1x1 transparente
const pngBytes = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000100' +
  '0d0a2db40000000049454e44ae426082',
  'hex',
)
const fd = new FormData()
fd.append('file', new Blob([pngBytes], { type: 'image/png' }), 'qa-capa.png')

const up = await fetch(`${BASE}/api/bula/leiloes/upload`, {
  method: 'POST',
  body: fd,
  headers: { cookie: cookieHeader },
})
const upJson = await up.json()
console.log('Upload status:', up.status)
console.log('Upload resposta:', upJson)

if (up.status !== 200 || !upJson.url) {
  console.error('Upload falhou.')
  process.exit(2)
}

// Verifica que a URL pública responde
const headRes = await fetch(upJson.url, { method: 'HEAD' })
console.log('HEAD URL pública:', headRes.status, 'Content-Type:', headRes.headers.get('content-type'))

if (headRes.status !== 200) {
  console.error('URL pública não acessível.')
  process.exit(3)
}

console.log('\nOK: upload + leitura pública funcionando.')
