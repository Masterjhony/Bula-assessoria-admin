// QA visual dos submenus de navegação (Leilões e Operações) + sidebar do ERP.

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

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
const resp = await page.evaluate(async ({ email, password }) => {
  const res = await fetch('/api/bula/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  return res.status
}, { email: EMAIL, password: PASSWORD })
console.log(`Login status ${resp}`)

await page.goto(`${BASE}/sistema`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

for (const label of ['Leilões', 'Operações']) {
  const btn = page.locator('header button', { hasText: label }).first()
  await btn.click()
  await page.waitForTimeout(400)
  const file = join(outDir, `nav-${label.toLowerCase().replace(/[^a-z]/g, '')}.png`)
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1440, height: 420 } })
  const items = await page.$$eval('header a.flex.items-center.gap-3 span', els => els.map(e => e.textContent?.trim()).filter(Boolean))
  console.log(`  ${label}:`, items)
  // fecha
  await btn.click()
  await page.waitForTimeout(200)
}

// ERP sidebar
await page.goto(`${BASE}/erp`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const erpFile = join(outDir, 'erp-sidebar.png')
await page.screenshot({ path: erpFile, clip: { x: 0, y: 0, width: 280, height: 900 } })
const erpItems = await page.$$eval('.sidebar .sidebar-item', els =>
  els.map(e => e.textContent?.replace(/\s+/g, ' ').trim()).filter(Boolean)
)
console.log('  ERP sidebar:', erpItems)

await browser.close()
console.log('Done.')
