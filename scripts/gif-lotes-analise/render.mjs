// Renderiza os cards (PNG 1080 de largura) + a máscara de cantos da janela de vídeo.
// O card é desenhado em 1500px e reduzido por SCALE — assim a tipografia fica grande
// em proporção e a peça inteira cabe num quadro ~9:16, que é o que o WhatsApp mostra bem.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { cardHtml, SCALE } from './card.mjs'
const { chromium } = createRequire('F:/Projetos/Desktop/web-bula/package.json')('playwright')

const HERE = 'C:/Users/Notebook-Acer/AppData/Local/Temp/claude/F--Projetos-Desktop-web-bula/5c86e906-a38f-4572-b0c1-fccdc9c20a18/scratchpad'
const deps = JSON.parse(readFileSync(`${HERE}/deps.json`, 'utf-8'))
const { premissas, lotes } = JSON.parse(readFileSync(`${HERE}/lotes.json`, 'utf-8'))
mkdirSync(`${HERE}/cards`, { recursive: true })

const even = (n) => Math.floor(n / 2) * 2
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })

let slot = null
for (const L of lotes) {
  const html = `<div id="wrap">${cardHtml(L, deps[String(L.lote)], premissas)}</div>
    <style>html{background:#0A0A0A}body{width:1080px!important;margin:0;overflow:hidden}
    #wrap{width:1500px;transform:scale(${SCALE});transform-origin:top left}</style>`
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)

  const box = await page.locator('#slot').boundingBox()
  const natural = await page.evaluate(() => document.querySelector('.card').scrollHeight)
  const h = even(natural * SCALE)
  if (!slot) slot = { x: even(box.x), y: even(box.y), w: even(box.width), h: even(box.height) }

  const n = String(L.lote).padStart(3, '0')
  await page.screenshot({ path: `${HERE}/cards/card${n}.png`, clip: { x: 0, y: 0, width: 1080, height: h } })
  console.log(`lote ${L.lote}: 1080x${h} (${(h / 1080).toFixed(2)}:1) · slot ${slot.w}x${slot.h} @${slot.x},${slot.y}`)
}

// máscara dos cantos arredondados, no tamanho final da janela
const r = Math.round(20 * SCALE)
await page.setContent(`<style>*{margin:0}body{width:${slot.w}px;height:${slot.h}px;background:#000}
  div{width:100%;height:100%;background:#fff;border-radius:${r}px}</style><div></div>`)
await page.screenshot({ path: `${HERE}/cards/mask.png`, clip: { x: 0, y: 0, width: slot.w, height: slot.h } })

writeFileSync(`${HERE}/cards/slot.json`, JSON.stringify(slot, null, 1))
await browser.close()
