// Visual QA da AGENDA PÚBLICA (sem auth): captura /agenda e uma página de
// detalhe /agenda/[id] em desktop (1440) e mobile (390), além da faixa de
// marcas parceiras (logos dos criatórios) e dos CTAs da página de detalhe.
//
// Uso: node scripts/qa-agenda-publica.mjs   (com `npm run dev` rodando)

import { chromium } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.QA_BASE || 'http://localhost:3000'
const outDir = join(import.meta.dirname, '..', 'qa-screenshots')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })

async function snap(name, path, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`))
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true })
  const firstHref = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/agenda/"]')
    return a ? a.getAttribute('href') : null
  })
  console.log(`  ${name.padEnd(28)} ${path}  ${errors.length ? `⚠ ${errors.length} errs: ${errors[0]}` : 'OK'}`)
  await ctx.close()
  return firstHref
}

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

console.log(`QA agenda pública → ${BASE}\n`)
const detailHref = await snap('qa2-agenda-desktop', '/agenda', DESKTOP)
await snap('qa2-agenda-mobile', '/agenda', MOBILE)

if (detailHref) {
  await snap('qa2-detalhe-desktop', detailHref, DESKTOP)
  await snap('qa2-detalhe-mobile', detailHref, MOBILE)
} else {
  console.log('  (nenhum link /agenda/[id] encontrado — detalhe não capturado)')
}

await browser.close()
console.log(`\nScreenshots em: ${outDir}`)
