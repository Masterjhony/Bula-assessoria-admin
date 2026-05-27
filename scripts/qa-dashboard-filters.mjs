// QA rápido dos filtros do dashboard: aplica period + assessor via querystring
// e captura screenshot para validação visual.

import { chromium } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.QA_BASE || 'http://localhost:3000'
const EMAIL = process.env.QA_EMAIL || 'qa@bula.test'
const PASSWORD = process.env.QA_PASSWORD || 'QaBot123!'

const SCENARIOS = [
  { name: 'dashboard-this-month', qs: 'period=this_month' },
  { name: 'dashboard-this-quarter', qs: 'period=this_quarter' },
  { name: 'dashboard-assessor', qs: 'period=this_year&assessor=Marcelo%20Carneiro' },
]

const outDir = join(import.meta.dirname, '..', 'qa-screenshots')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
})
const page = await context.newPage()

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(`[${msg.location()?.url ?? '?'}] ${msg.text()}`)
})

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
const loginResp = await page.evaluate(async ({ email, password }) => {
  const res = await fetch('/api/bula/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  return { status: res.status, body: await res.text() }
}, { email: EMAIL, password: PASSWORD })
console.log(`Login status ${loginResp.status}`)

for (const sc of SCENARIOS) {
  consoleErrors.length = 0
  process.stdout.write(`  ${sc.name.padEnd(28)} ?${sc.qs} … `)
  await page.goto(`${BASE}/sistema?${sc.qs}`, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(1200)
  const file = join(outDir, `${sc.name}.png`)
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1440, height: 900 } })
  // Lê os KPIs renderizados
  const kpis = await page.$$eval('.slim-kpi', els =>
    els.map(el => ({
      label: el.querySelector('.slim-kpi-lbl')?.textContent?.trim(),
      value: el.querySelector('.slim-kpi-val')?.textContent?.trim(),
      sub: el.querySelector('.slim-kpi-tag')?.textContent?.trim(),
    }))
  )
  console.log('OK')
  for (const k of kpis) console.log(`     · ${k.label?.padEnd(20)} ${k.value?.padEnd(15)} ${k.sub ?? ''}`)
  if (consoleErrors.length) console.log(`     ⚠ ${consoleErrors.length} console errors`)
}

await browser.close()
