// Relatorio de vendas do 20º LEILAO GUADALUPE AGROPECUARIA (jul/2026) — VERSAO CRIADOR.
// Documento externo, para conferencia e cobranca: cada lote, quem vendeu (assessor Bula),
// para quem, em que condicao e por quanto. SEM comissao, receita Bula, acordo ou dado do ERP.
// A versao interna (com comissao) e gera-pdf-vendas-guadalupe-julho-2026.mjs.
// Uso: node scripts/gera-pdf-vendas-guadalupe-julho-2026-criador.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.local', 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = (n) => Number(n || 0).toLocaleString('pt-BR')
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const dia = (d) => d.slice(8, 10) + '/' + d.slice(5, 7)

const IDS = [
  '1d6e69a3-ff25-404e-9c0a-dc7384620de1', // 18/07 Femeas
  'c8cba93d-8fa9-4e80-9aa7-e2706a2d54b4', // 19/07 Touros
  '8ce45792-c83f-4a8f-ae13-78bcf055aeeb', // 20/07 Touros
]
const { data: fech, error } = await sb.from('bula_leilao_fechamento').select('*').in('id', IDS)
if (error) throw error
fech.sort((a, b) => a.data.localeCompare(b.data))

// Limpeza cosmetica para documento externo: a captura do WhatsApp cola cidade/UF
// dentro do nome ("Elielton Taveira - Niquelandia _GO") e deixa assessor "A definir".
const limpaComprador = (c) => String(c || '—')
  .replace(/\s*-\s*Niquelandia\s*_GO/i, ' · Niquelândia/GO')
const limpaAssessor = (a) => {
  const s = String(a || '').trim()
  if (!s || /^a\s*definir$/i.test(s)) return 'Bula Assessoria'
  return s.replace(' / ', ' e ')
}
const todos = fech.flatMap((f) => (f.lances || []).map((l) => ({ ...l, data: f.data, comprador: limpaComprador(l.comprador) })))
const VGV = todos.reduce((s, l) => s + Number(l.vgv || 0), 0)
const LOTES = todos.length
const ANIMAIS = todos.reduce((s, l) => s + Number(l.animais || 0), 0)
const MAIOR = Math.max(...todos.map((l) => Number(l.vgv || 0)))
const TICKET = VGV / LOTES

const agrupa = (chave) => {
  const m = new Map()
  for (const l of todos) {
    const k = chave(l) || '—'
    const it = m.get(k) || { k, vgv: 0, lotes: 0, animais: 0, eventos: new Set() }
    it.vgv += Number(l.vgv || 0); it.lotes += 1; it.animais += Number(l.animais || 0)
    it.eventos.add(dia(l.data)); m.set(k, it)
  }
  return [...m.values()].sort((a, b) => b.vgv - a.vgv)
}
const porComprador = agrupa((l) => String(l.comprador || '').split(' · ')[0])
const porEstado = agrupa((l) => {
  const m = String(l.comprador || '').match(/\/([A-Z]{2})\b/)
  return m ? m[1] : (/_GO\b/.test(l.comprador || '') ? 'GO' : 'A confirmar')
})

const linhasEvento = (f) => (f.lances || []).map((l) => {
  const [comprador, ...resto] = limpaComprador(l.comprador).split(' · ')
  const pend = /identificar/i.test(comprador)
  return `<tr>
    <td class="lote">${esc(l.lote)}</td>
    <td><strong>${esc(comprador)}</strong>${pend ? ' <span class="tag">confirmar</span>' : ''}${resto.length ? `<div class="obs">${esc(resto.join(' · '))}</div>` : ''}</td>
    <td>${esc(limpaAssessor(l.assessor))}</td>
    <td class="val">${int(l.animais || 1)}</td>
    <td class="val">${l.parcelas}× ${brl(l.parcela)}</td>
    <td class="val"><strong>${brl(l.vgv)}</strong></td>
  </tr>`
}).join('')

const blocoEvento = (f) => `
<h2>${esc(f.nome)} <span class="sub">${dia(f.data)}/2026 · ${f.lotes_vendidos} lotes · R$ ${brl(f.vgv_total)}</span></h2>
<table>
<thead><tr>
  <th style="width:7%">Lote</th><th style="width:38%">Comprador</th><th style="width:18%">Vendido por</th>
  <th class="val" style="width:9%">Animais</th><th class="val" style="width:14%">Condição</th>
  <th class="val" style="width:14%">Valor total</th>
</tr></thead>
<tbody>${linhasEvento(f)}</tbody>
<tfoot><tr>
  <td colspan="3">Total do pregão · ticket médio R$ ${brl(f.ticket_medio)}</td>
  <td class="val">${int(f.animais_vendidos)}</td><td></td>
  <td class="val">${brl(f.vgv_total)}</td>
</tr></tfoot>
</table>`

const tabelaConsolidada = (titulo, rows, rotulo) => `
<h3>${titulo}</h3>
<table class="cons">
<thead><tr><th>${rotulo}</th><th class="val">Lotes</th><th class="val">Animais</th><th class="val">Valor total</th><th class="val">% do total</th><th class="val">Pregões</th></tr></thead>
<tbody>${rows.map((r) => `<tr>
  <td>${esc(r.k)}</td><td class="val">${r.lotes}</td><td class="val">${int(r.animais)}</td>
  <td class="val"><strong>${brl(r.vgv)}</strong></td>
  <td class="val">${(r.vgv / VGV * 100).toFixed(1).replace('.', ',')}%</td>
  <td class="val">${[...r.eventos].join(', ')}</td>
</tr>`).join('')}</tbody>
<tfoot><tr><td>Total</td><td class="val">${LOTES}</td><td class="val">${int(ANIMAIS)}</td><td class="val">${brl(VGV)}</td><td class="val">100,0%</td><td></td></tr></tfoot>
</table>`

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório de Vendas — Guadalupe Julho/2026</title>
<style>
  @page { size: A4; margin: 13mm 11mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #17181A; font-size: 10px; line-height: 1.45; margin: 0; }
  header { border-bottom: 2px solid #17181A; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 19px; margin: 0 0 4px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
  .meta { color: #5B5E63; font-size: 9.5px; }
  .accent { height: 3px; width: 54px; background: #C9A84C; margin-top: 8px; }
  h2 { font-size: 12px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; border-left: 4px solid #17181A; padding-left: 8px; break-after: avoid; }
  h2 .sub { float: right; font-weight: 400; color: #5B5E63; font-size: 9.5px; letter-spacing: 0; text-transform: none; }
  h3 { font-size: 10px; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: .06em; color: #3A3C40; font-weight: 700; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: #5B5E63; border-bottom: 1.5px solid #17181A; padding: 5px 6px; }
  td { padding: 5px 6px; border-bottom: .5px solid #E4E5E7; vertical-align: top; }
  tr { break-inside: avoid; }
  .val { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.val { text-align: right; }
  .lote { font-weight: 700; font-variant-numeric: tabular-nums; }
  .obs { color: #6A6D72; font-size: 8.5px; line-height: 1.35; }
  .tag { display: inline-block; font-size: 7px; text-transform: uppercase; letter-spacing: .04em; border: .5px solid #C9A84C; color: #9c7f2f; font-weight: 700; padding: 0 4px; border-radius: 2px; vertical-align: middle; white-space: nowrap; }
  tfoot td { border-top: 1.5px solid #17181A; border-bottom: none; font-weight: 700; padding-top: 6px; }
  .resumo { display: flex; gap: 8px; margin-bottom: 14px; }
  .card { flex: 1; border: 1px solid #D9DADD; border-radius: 4px; padding: 9px 10px; }
  .card .lbl { font-size: 7.5px; text-transform: uppercase; letter-spacing: .05em; color: #5B5E63; }
  .card .num { font-size: 14px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .card .qt { font-size: 7.5px; color: #8A8D92; margin-top: 1px; }
  .card.total { background: #17181A; color: #fff; border-color: #17181A; }
  .card.total .num { font-size: 13px; }
  .card.total .lbl, .card.total .qt { color: #B9BBBF; }
  .cons th, .cons td { padding: 4px 6px; }
  .nota { margin-top: 14px; padding: 10px 12px; background: #F6F6F4; border-left: 3px solid #C9A84C; font-size: 8.8px; color: #3A3C40; border-radius: 0 3px 3px 0; break-inside: avoid; }
  .nota ul { margin: 6px 0 0; padding-left: 15px; }
  .nota li { margin-bottom: 4px; }
  footer { margin-top: 16px; padding-top: 8px; border-top: .5px solid #D9DADD; color: #8A8D92; font-size: 8px; display: flex; justify-content: space-between; }
</style></head><body>
<header>
  <h1>20º Leilão Guadalupe Agropecuária — Relatório de Vendas</h1>
  <div class="meta">Vendas realizadas pela <strong>Bula Assessoria</strong> · Pregões de 18, 19 e 20 de julho de 2026 · Documento de conferência lote a lote</div>
  <div class="accent"></div>
</header>

<div class="resumo">
  <div class="card total"><div class="lbl">Total vendido</div><div class="num">R$ ${brl(VGV)}</div><div class="qt">3 pregões</div></div>
  <div class="card"><div class="lbl">Lotes / Animais</div><div class="num">${LOTES} / ${int(ANIMAIS)}</div><div class="qt">todos arrematados</div></div>
  <div class="card"><div class="lbl">Ticket médio</div><div class="num">R$ ${brl(TICKET)}</div><div class="qt">por lote</div></div>
  <div class="card"><div class="lbl">Maior lance</div><div class="num">R$ ${brl(MAIOR)}</div><div class="qt">lote 20 · 18/07</div></div>
  <div class="card"><div class="lbl">Compradores</div><div class="num">${porComprador.length}</div><div class="qt">${porEstado.filter((e) => e.k !== 'A confirmar').length} estados</div></div>
</div>

${fech.map(blocoEvento).join('')}

<h2>Consolidado dos três pregões</h2>
${tabelaConsolidada('Por comprador', porComprador, 'Comprador')}
${tabelaConsolidada('Por estado do comprador', porEstado, 'UF')}

<div class="nota"><strong>Observações:</strong>
<ul>
<li><strong>Condição de pagamento:</strong> todos os ${LOTES} lotes foram arrematados em 30 parcelas. A coluna "Condição" traz o número de parcelas × o valor de cada uma; a coluna "Valor total" é o resultado (parcela × 30).</li>
<li><strong>Escopo:</strong> este relatório cobre exclusivamente os lotes arrematados por compradores levados pela Bula Assessoria. Os demais lotes do evento não constam aqui.</li>
<li><strong>Pregão de 17/07</strong> (Doadoras e Aspirações): sem arremate por compradores da Bula.</li>
<li><strong>A confirmar:</strong> o comprador do lote 1F (18/07) ainda não foi identificado no nosso registro — pedimos a confirmação do nome para fechar a conferência. Os lotes 25 e 60 (19/07) foram arrematados pela mesma Fazenda Nossa Senhora de Fátima, registrados no evento em nomes diferentes (Reinaldo Tavares / Sr. Reinaldo e dona Maria Tavares).</li>
</ul></div>

<footer><span>Bula Assessoria</span><span>Emitido em 07/08/2026 · qualquer divergência, favor comunicar para retificação</span></footer>
</body></html>`

const outPath = join(homedir(), 'Desktop', 'Relatorio-Vendas-Guadalupe-Julho-2026.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: outPath, format: 'A4', printBackground: true })
await browser.close()
console.log('PDF gerado:', outPath)
console.log(`Total ${brl(VGV)} | ${LOTES} lotes | ${ANIMAIS} animais | ${porComprador.length} compradores`)
