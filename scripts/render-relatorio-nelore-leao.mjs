import { chromium } from 'playwright'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const html = join(here, 'relatorio-compras-nelore-leao.html')
const out = join(here, '..', 'Relatorio-Compras-Nelore-Leao.pdf')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`file:///${html.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' })
await page.pdf({
  path: out,
  format: 'A4',
  printBackground: true,
  margin: { top: '0', bottom: '0', left: '0', right: '0' },
})
await browser.close()
console.log('PDF gerado em', out)
