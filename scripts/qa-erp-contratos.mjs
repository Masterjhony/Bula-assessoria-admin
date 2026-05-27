// Simula host ERP em dev mapeando erp.localhost -> 127.0.0.1 e abre o link
// Contratos pelo sidebar. Valida que o middleware NÃO reescreve para
// /erp/sistema/contratos no host ERP.

import { chromium } from 'playwright'

const PORT = process.env.QA_PORT || '3000'
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

// 1. Login no host principal (cookie será setado com domain = localhost)
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' })
const login = await page.evaluate(async ({ email, password }) => {
  const r = await fetch('/api/bula/auth/signin', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'include', body: JSON.stringify({ email, password }),
  })
  return r.status
}, { email: EMAIL, password: PASSWORD })
console.log('Login:', login)

// 2. Copia o cookie para o subdomain erp.localhost (mesmo domain-level no DNS, dev)
const cookies = await context.cookies('http://localhost:' + PORT)
const erpCookies = cookies.map(c => ({ ...c, domain: 'erp.localhost' }))
await context.addCookies(erpCookies)

// 3. Acessa diretamente erp.localhost:3000/sistema/contratos
await page.goto(`http://erp.localhost:${PORT}/sistema/contratos`, { waitUntil: 'networkidle', timeout: 15000 })
await page.waitForTimeout(700)
console.log('URL final:', page.url())

const has404 = await page.locator('text=/^404$/').count()
const heading = await page.title()
console.log('Page title:', heading, '· tem 404?', has404)

await page.screenshot({ path: 'qa-screenshots/contratos-erp-host.png', fullPage: false })

// 4. Também testa o clique pelo sidebar
await page.goto(`http://erp.localhost:${PORT}/erp`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const link = page.locator('a[href="/sistema/contratos"]').first()
const exists = await link.count()
console.log('Sidebar link Contratos existe?', exists)
if (exists) {
  await link.click()
  await page.waitForLoadState('networkidle', { timeout: 15000 })
  console.log('URL após clique:', page.url())
}

if (errors.length) {
  console.log('Console errors (top 5):')
  for (const e of errors.slice(0, 5)) console.log(' ', e)
}

await browser.close()
