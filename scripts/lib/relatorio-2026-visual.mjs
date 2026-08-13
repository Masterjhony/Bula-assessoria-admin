/**
 * Identidade visual dos relatórios de 2026 para a diretoria.
 *
 * Preto e branco, Oswald caixa-alta nos títulos — o brandbook oficial, e a
 * forma que o chefe já aprovou nos relatórios anteriores (verde e dourado foram
 * rejeitados em material para cliente). O dourado do brandbook fica reservado
 * para destaque pontual, abaixo de 5% da página.
 */

export const CSS = `
  @page { size: A4; margin: 13mm 11mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #111; font-size: 9.4px; line-height: 1.45; margin: 0; padding-bottom: 8mm; }
  h1, h2, h3 { font-family: 'Oswald', 'Arial Narrow', Arial, sans-serif; text-transform: uppercase; letter-spacing: .02em; margin: 0; font-weight: 700; }
  h1 { font-size: 23px; line-height: 1.05; }
  h2 { font-size: 12.5px; margin: 17px 0 5px; padding-bottom: 3px; border-bottom: 1.5px solid #111; }
  h3 { font-size: 10.5px; margin: 11px 0 3px; }
  p { margin: 4px 0; }
  .cap { border-bottom: 3px solid #111; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
  .cap .sub { font-size: 10px; color: #444; margin-top: 4px; max-width: 118mm; }
  .cap .meta { font-size: 8.6px; color: #666; text-align: right; white-space: nowrap; }
  .cap .tot { font-family: 'Oswald', Arial, sans-serif; font-size: 30px; line-height: 1; }
  .cap .tot small { font-family: 'Segoe UI', Arial, sans-serif; font-size: 8.4px; color: #666; display: block; text-transform: uppercase; letter-spacing: .05em; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th { background: #111; color: #fff; font-size: 8.2px; text-transform: uppercase; letter-spacing: .04em; text-align: left; padding: 5px 6px; font-weight: 600; }
  th.r, td.num { text-align: right; }
  td { border-bottom: .6px solid #d5d5d5; padding: 4px 6px; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  tfoot td { border-top: 1.5px solid #111; border-bottom: none; font-weight: 700; background: #fff !important; }
  .nome { font-weight: 600; }
  .num { white-space: nowrap; }
  .micro { font-size: 8px; color: #777; }
  .box { border: 1px solid #111; padding: 9px 11px; margin: 8px 0 4px; }
  .box.grey { border: none; background: #f2f2f2; }
  .box.alerta { border-left: 4px solid #111; background: #f7f7f7; }
  .box h3 { margin-top: 0; }
  ul { margin: 4px 0 0; padding-left: 15px; }
  li { margin-bottom: 3px; }
  .cards { display: flex; gap: 7px; margin: 8px 0; }
  .card { flex: 1; border: 1px solid #111; padding: 7px 9px; }
  .card .z { font-size: 7.6px; color: #666; text-transform: uppercase; letter-spacing: .04em; }
  .card .n { font-size: 20px; font-family: 'Oswald', Arial, sans-serif; line-height: 1.05; margin-top: 2px; }
  .card .n small { font-size: 8px; color: #666; font-family: 'Segoe UI', Arial, sans-serif; display: block; letter-spacing: 0; text-transform: none; }
  .bar { display: inline-block; height: 7px; background: #111; vertical-align: middle; }
  .bar.o { background: #c9c9c9; }
  .ouro { color: #C9A84C; }
  .off { color: #bbb; }
  .avoid { break-inside: avoid; }
  .pg { break-before: page; }
  .funil td.et { font-weight: 600; }
  .funil .q { font-family: 'Oswald', Arial, sans-serif; font-size: 15px; }
  footer { position: fixed; bottom: 4mm; left: 0; right: 0; font-size: 7.4px; color: #888; display: flex; justify-content: space-between; }
`

export const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
export const brl = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const brl0 = n => 'R$ ' + Math.round(Number(n) || 0).toLocaleString('pt-BR')
export const num = n => (Number(n) || 0).toLocaleString('pt-BR')
export const pct = (a, b, casas = 1) => b ? `${(a * 100 / b).toFixed(casas).replace('.', ',')}%` : '—'
export const dataBr = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || '') }
export const MES = { '01': 'jan', '02': 'fev', '03': 'mar', '04': 'abr', '05': 'mai', '06': 'jun', '07': 'jul', '08': 'ago', '09': 'set', 10: 'out', 11: 'nov', 12: 'dez' }
export const mesBr = s => { const m = String(s || '').match(/^(\d{4})-(\d{2})/); return m ? `${MES[m[2]]}/${m[1].slice(2)}` : s }

/** Documento completo, já com fonte Oswald embutida por link local do sistema. */
export const pagina = (titulo, corpo) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(titulo)}</title><style>${CSS}</style></head><body>${corpo}</body></html>`

/** Renderiza HTML → PDF com o Chromium do Playwright (mesmo caminho dos outros). */
export async function paraPdf(html, destino) {
    const { chromium } = await import('playwright')
    const navegador = await chromium.launch()
    try {
        const pagina = await navegador.newPage()
        await pagina.setContent(html, { waitUntil: 'networkidle' })
        await pagina.pdf({ path: destino, format: 'A4', printBackground: true })
    } finally { await navegador.close() }
}
