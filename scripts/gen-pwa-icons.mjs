// Gera os ícones do PWA a partir da logo "Bula Assessoria Pecuária".
// Renderiza um quadrado com fundo preto da marca + wordmark branca centralizada
// via Playwright (screenshot) → garante ícones quadrados nítidos em todos os
// tamanhos exigidos (manifest + apple-touch). Cores da empresa: preto e branco.
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// Preto da marca (fundo) + logo branca por cima.
const BRAND = '#000000'
const logoWhite = readFileSync(resolve(root, 'public/logo-bula-assessoria-white.png')).toString('base64')
const logoDataUrl = `data:image/png;base64,${logoWhite}`

// padding = fração da borda livre (safe area). Maskable precisa de mais folga.
function html({ size, padding, bg, radius }) {
  const inner = Math.round(size * (1 - padding * 2))
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${size}px;height:${size}px}
    .box{width:${size}px;height:${size}px;background:${bg};
      display:flex;align-items:center;justify-content:center;border-radius:${radius}px}
    img{width:${inner}px;height:auto;object-fit:contain}
  </style></head><body>
    <div class="box"><img src="${logoDataUrl}"></div>
  </body></html>`
}

const targets = [
  { file: 'public/icons/icon-192.png', size: 192, padding: 0.16, bg: BRAND, radius: 0 },
  { file: 'public/icons/icon-512.png', size: 512, padding: 0.16, bg: BRAND, radius: 0 },
  // Maskable: fundo cheio até a borda + logo com bastante folga (safe zone ~80%).
  { file: 'public/icons/icon-maskable-512.png', size: 512, padding: 0.26, bg: BRAND, radius: 0 },
  { file: 'public/icons/apple-touch-icon.png', size: 180, padding: 0.16, bg: BRAND, radius: 0 },
]

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size })
  await page.setContent(html(t), { waitUntil: 'networkidle' })
  const buf = await page.locator('.box').screenshot({ omitBackground: false })
  writeFileSync(resolve(root, t.file), buf)
  console.log('ok', t.file, `${t.size}x${t.size}`)
}
await browser.close()
console.log('done')
