// Captura visual após split Fechamento comercial × ERP.

import { chromium } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.QA_BASE || 'http://localhost:3000'
const EMAIL = process.env.QA_EMAIL || 'qa@bula.test'
const PASSWORD = process.env.QA_PASSWORD || 'QaBot123!'
const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL || 'formuladoboi@gmail.com'
const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD || ''

const outDir = join(import.meta.dirname, '..', 'qa-screenshots')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })

async function loginAndCapture(email, password, label, paths) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  const login = await page.evaluate(async ({ e, p }) => {
    const r = await fetch('/api/bula/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: e, password: p }),
    })
    return { status: r.status, body: await r.text() }
  }, { e: email, p: password })
  console.log(`[${label}] Login: ${login.status}`)
  if (login.status !== 200) { console.error(`Login ${label} falhou:`, login.body); await context.close(); return }

  for (const t of paths) {
    errors.length = 0
    process.stdout.write(`  [${label}] ${t.name.padEnd(30)} ${t.url} … `)
    await page.goto(`${BASE}${t.url}`, { waitUntil: 'networkidle', timeout: 45000 })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: join(outDir, `${t.name}.png`), fullPage: true })
    console.log(errors.length ? `ERROS:\n   - ${errors.join('\n   - ')}` : 'OK')
  }
  await context.close()
}

// Comercial: usa o usuário QA padrão (não é finance-admin → não vê ERP)
await loginAndCapture(EMAIL, PASSWORD, 'qa', [
  { name: 'fechamento-comercial-qa', url: '/sistema/leiloes/fechamento' },
  { name: 'fechamento-erp-qa-deny',  url: '/sistema/leiloes/fechamento-financeiro' },
])

// Admin: precisa de senha real do formuladoboi pra ver finance.
if (ADMIN_PASSWORD) {
  await loginAndCapture(ADMIN_EMAIL, ADMIN_PASSWORD, 'admin', [
    { name: 'fechamento-comercial-admin', url: '/sistema/leiloes/fechamento' },
    { name: 'fechamento-erp-admin',       url: '/sistema/leiloes/fechamento-financeiro' },
  ])
} else {
  console.log('\nQA_ADMIN_PASSWORD não definida — pulando captura como admin.')
}

await browser.close()
console.log(`\nScreenshots em ${outDir}`)
