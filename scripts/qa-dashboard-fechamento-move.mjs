// QA visual rápido após mover gráficos do fechamento pro dashboard.
// Faz login, captura /sistema e /sistema/leiloes/fechamento.

import { chromium } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.QA_BASE || 'http://localhost:3000'
const EMAIL = process.env.QA_EMAIL || 'qa@bula.test'
const PASSWORD = process.env.QA_PASSWORD || 'QaBot123!'

const outDir = join(import.meta.dirname, '..', 'qa-screenshots')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
})
const page = await context.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
})

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
const login = await page.evaluate(async ({ email, password }) => {
  const r = await fetch('/api/bula/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  return { status: r.status, body: await r.text() }
}, { email: EMAIL, password: PASSWORD })
console.log(`Login: ${login.status}`)
if (login.status !== 200) { console.error('Login falhou:', login.body); process.exit(1) }

const TARGETS = [
  { name: 'dashboard-after-move', url: '/sistema' },
  { name: 'dashboard-this-quarter', url: '/sistema?period=this_quarter' },
  { name: 'fechamento-after-move', url: '/sistema/leiloes/fechamento' },
]

for (const t of TARGETS) {
  errors.length = 0
  process.stdout.write(`  ${t.name.padEnd(28)} ${t.url} … `)
  await page.goto(`${BASE}${t.url}`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(outDir, `${t.name}.png`), fullPage: true })
  if (errors.length) {
    console.log(`ERROS:\n   - ${errors.join('\n   - ')}`)
  } else {
    console.log('OK')
  }
}

await browser.close()
console.log(`\nScreenshots em ${outDir}`)
