// Captura screenshots das telas de login (admin + ERP via ?ctx=erp)
import { chromium } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.QA_BASE || 'http://localhost:3002'
const out = join(import.meta.dirname, '..', 'qa-screenshots')
if (!existsSync(out)) mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

for (const [name, url] of [
  ['login-admin', `${BASE}/`],
  ['login-erp',   `${BASE}/?ctx=erp`],
]) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(out, `${name}-fold.png`), clip: { x: 0, y: 0, width: 1440, height: 900 } })
  console.log(`${name} → OK`)
}

await browser.close()
