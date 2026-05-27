// QA do link Contratos no ERP: faz login, abre /erp, clica em Contratos no
// sidebar, e verifica que /sistema/contratos abre corretamente.

import { chromium } from 'playwright'

const BASE = process.env.QA_BASE || 'http://localhost:3000'
const EMAIL = process.env.QA_EMAIL || 'qa@bula.test'
const PASSWORD = process.env.QA_PASSWORD || 'QaBot123!'

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
})
const page = await context.newPage()

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
const login = await page.evaluate(async ({ email, password }) => {
  const r = await fetch('/api/bula/auth/signin', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'include', body: JSON.stringify({ email, password }),
  })
  return r.status
}, { email: EMAIL, password: PASSWORD })
console.log('Login:', login)

await page.goto(`${BASE}/erp`, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)

// Verifica href do link
const href = await page.locator('#contratosLink').getAttribute('href')
console.log('href Contratos:', href)

await page.locator('#contratosLink').click()
await page.waitForLoadState('networkidle', { timeout: 15000 })
await page.waitForTimeout(500)
console.log('URL após clique:', page.url())

// Confere se NÃO renderizou 404
const has404 = await page.locator('text=/404/').count()
const hasContratos = await page.locator('text=/Contrato|contrato/').count()
console.log('Tem "404"?', has404, '· Tem "Contrato/contrato"?', hasContratos)

if (errors.length) {
  console.log('Console errors:')
  for (const e of errors.slice(0, 5)) console.log(' ', e)
}

await page.screenshot({ path: 'qa-screenshots/contratos-via-erp.png', fullPage: false })
await browser.close()
