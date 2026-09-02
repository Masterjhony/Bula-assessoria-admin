/**
 * Converte um HTML de artifact em PDF A4.
 *
 * O artifact é publicado SEM esqueleto — título, <link> e <style> vêm soltos,
 * antes do conteúdo — e é theme-aware. No papel só existe fundo branco, então
 * aqui o documento é envelopado, o tema é forçado para claro e o corpo ganha
 * regras de quebra de página.
 *
 *   node scripts/artifact-para-pdf.mjs <entrada.html> <Nome-Do-Arquivo> [--retrato] [--png]
 *
 * O PDF sai no Desktop. Ex.:
 *   node scripts/artifact-para-pdf.mjs outputs/conferencia-vgv-agosto-2026/confronto-filial2.html Confronto-Filial2-Agosto-2026
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { chromium } from 'playwright'

const [entrada, nome] = process.argv.slice(2).filter(a => !a.startsWith('--'))
if (!entrada || !nome) {
    console.error('uso: node scripts/artifact-para-pdf.mjs <entrada.html> <Nome-Do-Arquivo> [--retrato] [--png]')
    process.exit(1)
}

// Paisagem por padrao: estes relatorios sao tabelas largas. Documento narrativo
// (texto corrido, poucas colunas) fica melhor em retrato.
const RETRATO = process.argv.includes('--retrato')

const corpo = readFileSync(entrada, 'utf8')
// A divisa entre "cabeça" e "corpo" é a primeira <div class="wrap">.
const corte = corpo.indexOf('<div class="wrap">')
if (corte < 0) { console.error('não achei <div class="wrap"> — este HTML não é um artifact deste formato'); process.exit(1) }

const html = `<!doctype html><html lang="pt-BR" data-theme="light"><head><meta charset="utf-8">
${corpo.slice(0, corte)}
<style>
  @page { size: A4 ${RETRATO ? '' : 'landscape'}; margin: ${RETRATO ? '14mm 12mm' : '10mm'}; }
  body { padding: 0 !important; font-size: ${RETRATO ? '10.5pt' : '9.5pt'}; }
  .wrap { max-width: none; }
  header { padding-top: 0 !important; }
  h1 { font-size: ${RETRATO ? '34pt' : '30pt'} !important; }
  .cel .val { font-size: 20pt !important; }
  section { margin-top: 22px; }
  .item, .ev, .eq, ol.acoes li, footer, dl.fontes dd { break-inside: avoid; }
  .sechead, .item > .top, thead { break-after: avoid; }
  table { font-size: ${RETRATO ? '9pt' : '8.4pt'}; }
  th, td { padding: 5px 8px; }
  .ev .txt { font-size: 8.2pt; overflow-x: visible; }
  .scroll { overflow-x: visible; }
</style></head><body>${corpo.slice(corte)}</body></html>`

const outPath = join(homedir(), 'Desktop', `${nome}.pdf`)
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.emulateMedia({ colorScheme: 'light' })
await page.pdf({ path: outPath, format: 'A4', landscape: !RETRATO, printBackground: true })
if (process.argv.includes('--png')) {
    await page.setViewportSize(RETRATO ? { width: 794, height: 1123 } : { width: 1123, height: 794 })
    await page.screenshot({ path: outPath.replace(/\.pdf$/, '.png'), fullPage: true })
}
await browser.close()
console.log('PDF gerado:', outPath)
