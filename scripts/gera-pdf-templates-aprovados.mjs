/**
 * Gera um PDF com todos os templates de WhatsApp APROVADOS na Meta (WABA da Bula).
 * Busca os templates ao vivo (Graph API), monta um HTML com cards estilo WhatsApp
 * (header de mídia/texto, corpo com variáveis destacadas, rodapé, botões e a
 * legenda das variáveis com exemplos) e imprime em PDF via Chromium (Playwright).
 *
 *   node scripts/gera-pdf-templates-aprovados.mjs                 # salva na Área de Trabalho
 *   node scripts/gera-pdf-templates-aprovados.mjs --out "C:/.../x.pdf"
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const ROOT = process.cwd()
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf-8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const WABA = env.WHATSAPP_CLOUD_BUSINESS_ACCOUNT_ID
const TOKEN = env.WHATSAPP_CLOUD_ACCESS_TOKEN
const V = env.WHATSAPP_CLOUD_GRAPH_VERSION || 'v21.0'

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const OUT = outIdx >= 0 ? args[outIdx + 1] : join(homedir(), 'Desktop', 'Templates WhatsApp Aprovados - Bula Assessoria.pdf')

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// *negrito* do WhatsApp → <b>, quebra de linha → <br>.
// Variáveis {{n}}: preenchidas com o valor de exemplo (como o lead vê);
// se não houver exemplo, mantém o chip {{n}}.
function renderBody(text, examples = []) {
  let h = esc(text)
  h = h.replace(/\{\{(\d+)\}\}/g, (m, n) => {
    const v = examples[Number(n) - 1]
    return v != null && v !== '' ? `<span class="filled">${esc(v)}</span>` : `<span class="var">{{${n}}}</span>`
  })
  h = h.replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
  h = h.replace(/\n/g, '<br>')
  return h
}
const MEDIA_ICON = { VIDEO: '🎬 Vídeo', IMAGE: '🖼️ Imagem', DOCUMENT: '📄 Documento', LOCATION: '📍 Localização' }

async function main() {
  const r = await fetch(`https://graph.facebook.com/${V}/${WABA}/message_templates?fields=name,status,category,language,components&limit=200&access_token=${TOKEN}`)
  const j = await r.json()
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 300))
  const approved = (j.data || []).filter(t => t.status === 'APPROVED')
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))

  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const grupos = {}
  for (const t of approved) (grupos[t.category] ??= []).push(t)

  const cardHtml = t => {
    const header = t.components.find(c => c.type === 'HEADER')
    const body = t.components.find(c => c.type === 'BODY')
    const footer = t.components.find(c => c.type === 'FOOTER')
    const buttons = t.components.find(c => c.type === 'BUTTONS')
    const examples = body?.example?.body_text?.[0] || []
    const headerExamples = header?.example?.header_text || []

    let headerHtml = ''
    if (header) {
      if (header.format === 'TEXT') headerHtml = `<div class="hdr hdr-text">${renderBody(header.text, headerExamples)}</div>`
      else headerHtml = `<div class="hdr hdr-media">${MEDIA_ICON[header.format] || header.format}<span class="hdr-note">— anexado no disparo</span></div>`
    }
    const btnHtml = buttons
      ? `<div class="btns">${buttons.buttons.map(b => `<div class="btn">${esc(b.text)}${b.url ? ' 🔗' : b.phone_number ? ' 📞' : ''}</div>`).join('')}</div>`
      : ''
    const legenda = examples.length
      ? `<div class="legend"><span class="legend-t">Variáveis (preenchidas com exemplo):</span> ${examples.map((v, i) => `<span class="var">{{${i + 1}}}</span> = <span class="filled">${esc(v)}</span>`).join(' &nbsp;·&nbsp; ')}</div>`
      : ''

    return `<div class="card">
      <div class="card-top">
        <span class="tname">${esc(t.name)}</span>
        <span class="lang">${esc(t.language)}</span>
      </div>
      <div class="bubble">
        ${headerHtml}
        ${body ? `<div class="body">${renderBody(body.text, examples)}</div>` : ''}
        ${footer ? `<div class="footer">${renderBody(footer.text)}</div>` : ''}
        ${btnHtml}
      </div>
      ${legenda}
    </div>`
  }

  const seções = Object.entries(grupos).map(([cat, ts]) => `
    <h2 class="sec">${cat === 'MARKETING' ? 'Marketing' : cat === 'UTILITY' ? 'Utilidade' : cat} <span class="sec-n">${ts.length}</span></h2>
    <div class="grid">${ts.map(cardHtml).join('')}</div>`).join('')

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; color: #1a1a1a; }
  .page { padding: 28px 34px; }
  .top { border-bottom: 3px solid #111; padding-bottom: 14px; margin-bottom: 20px; }
  .top h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: .3px; }
  .top .sub { color: #666; font-size: 12px; }
  .top .count { float: right; text-align: right; font-size: 12px; color: #444; }
  .top .count b { display:block; font-size: 26px; color:#111; line-height:1; }
  h2.sec { font-size: 15px; text-transform: uppercase; letter-spacing: 1px; color: #111; margin: 22px 0 12px; padding-bottom:6px; border-bottom:1px solid #ddd; }
  h2.sec .sec-n { background:#111; color:#fff; font-size:11px; border-radius:10px; padding:1px 9px; margin-left:6px; vertical-align:middle; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .card { border: 1px solid #e3e3e3; border-radius: 10px; padding: 12px; background:#fff; break-inside: avoid; }
  .card-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; }
  .tname { font-family: 'SF Mono', Consolas, monospace; font-size: 12px; font-weight: 700; color:#0a5c36; word-break: break-all; }
  .lang { font-size:10px; color:#888; border:1px solid #ddd; border-radius:5px; padding:1px 6px; white-space:nowrap; }
  .bubble { background:#e7fdd8; border-radius:8px; padding:10px 12px; font-size:12.5px; line-height:1.5; position:relative; }
  .hdr { font-weight:700; margin-bottom:6px; }
  .hdr-text { font-size:13px; }
  .hdr-media { background:#0a5c36; color:#fff; border-radius:6px; padding:6px 10px; font-size:12px; font-weight:600; }
  .hdr-media .hdr-note { font-weight:400; opacity:.8; margin-left:6px; font-size:11px; }
  .body { white-space:normal; }
  .footer { color:#667; font-size:11px; margin-top:8px; }
  .btns { margin-top:8px; border-top:1px solid #cbe6bb; padding-top:6px; }
  .btn { color:#0a7cff; text-align:center; font-size:12px; font-weight:600; padding:4px; }
  .var { background:#111; color:#ffd24c; font-family:Consolas,monospace; font-size:10.5px; border-radius:4px; padding:0 4px; font-weight:700; }
  .filled { background:#fff3bf; border-bottom:1px dotted #b8860b; border-radius:2px; padding:0 1px; }
  .legend { margin-top:8px; font-size:10.5px; color:#555; }
  .legend-t { font-weight:700; color:#111; }
  </style></head><body><div class="page">
    <div class="top">
      <div class="count"><b>${approved.length}</b>templates aprovados</div>
      <h1>Templates WhatsApp — Bula Assessoria</h1>
      <div class="sub">Templates aprovados na Meta (Cloud API) · gerado em ${hoje}</div>
    </div>
    ${seções}
  </div></body></html>`

  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.pdf({
    path: OUT, format: 'A4', printBackground: true,
    margin: { top: '10mm', bottom: '12mm', left: '0', right: '0' },
    displayHeaderFooter: true,
    footerTemplate: '<div style="width:100%;font-size:8px;color:#999;text-align:center;">Bula Assessoria — Templates WhatsApp aprovados · página <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
    headerTemplate: '<span></span>',
  })
  await browser.close()
  console.log(`✓ PDF gerado: ${OUT}`)
  console.log(`  ${approved.length} templates (${Object.entries(grupos).map(([c, t]) => `${c}: ${t.length}`).join(', ')})`)
}

main().catch(e => { console.error(`✗ ${e.message}`); process.exit(1) })
