// Gera PDF do Relatório de Contas a Receber (padrão brandbook preto-e-branco)
// direto na Área de Trabalho do usuário.
// Uso: node scripts/gera-pdf-contas-receber.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }),
)
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const HOJE = '2026-07-15'
await supa.rpc('erp_atualizar_vencidos')
const { data: rows, error } = await supa
  .from('erp_contas_receber')
  .select('descricao,valor,valor_recebido,emissao,vencimento,status,numero_documento,observacoes,tags,cliente:erp_pessoas!cliente_id(nome)')
  .in('status', ['aberto', 'parcial', 'vencido'])
  .order('vencimento')
if (error) { console.error(error.message); process.exit(1) }

const brl = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const saldo = (r) => Number(r.valor) - Number(r.valor_recebido || 0)
const dt = (iso) => iso.split('-').reverse().join('/')
const diasAtraso = (iso) => Math.round((new Date(HOJE) - new Date(iso)) / 86400000)
const isProvisao = (r) => /provis/i.test(r.observacoes || '')
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// SO tem data quem tem data REAL confirmada (tag data_confirmada). O resto = sem data.
const temData = (r) => (r.tags || []).includes('data_confirmada')
const vencidos = rows.filter((r) => temData(r) && r.vencimento < HOJE).sort((a, b) => a.vencimento.localeCompare(b.vencimento))
const comData = rows.filter((r) => temData(r) && r.vencimento >= HOJE).sort((a, b) => a.vencimento.localeCompare(b.vencimento))
const semData = rows.filter((r) => !temData(r)).sort((a, b) => saldo(b) - saldo(a))
const sum = (arr) => arr.reduce((s, r) => s + saldo(r), 0)
const totV = sum(vencidos), totC = sum(comData), totS = sum(semData), totGeral = totV + totC + totS
const pct = (v) => totGeral ? ((v / totGeral) * 100).toFixed(1).replace('.', ',') + '%' : '—'

const faixa = (d) => d <= 30 ? '1–30 dias' : d <= 60 ? '31–60 dias' : d <= 90 ? '61–90 dias' : '90+ dias'
const aging = {}
for (const r of vencidos) { const f = faixa(diasAtraso(r.vencimento)); aging[f] = (aging[f] || 0) + saldo(r) }
const provs = comData.filter(isProvisao)

// remove carimbos internos e deixa a observacao legivel
const obsLimpa = (r) => {
  let o = (r.observacoes || '').trim()
  o = o.replace(/^\s*(VALOR RETIFICADO|RECEBIDO|CANCELADO|NOTA)\s*—\s*[^:]*:\s*/i, '')
       .replace(/\s*\[CONFERIR\]\s*/gi, '')
       .replace(/\s*15\/07\/2026 \(conferencia Ana Paula\):\s*/gi, '')
  return o.trim()
}
const obsCell = (r) => { const o = obsLimpa(r); return o ? `<div class="obs">${esc(o)}</div>` : '' }

const linhasVenc = vencidos.map((r) => `<tr>
  <td class="nowrap">${dt(r.vencimento)}</td>
  <td class="atraso">${diasAtraso(r.vencimento)}d</td>
  <td>${esc(r.cliente?.nome || '—')}</td>
  <td>${esc(r.descricao)}${isProvisao(r) ? ' <span class="tag">provisão</span>' : ''}${obsCell(r)}</td>
  <td class="val">${brl(saldo(r))}</td>
  <td class="doc">${esc(r.numero_documento || '')}</td></tr>`).join('')

const linhasCom = comData.map((r) => `<tr>
  <td class="nowrap">${dt(r.vencimento)}</td>
  <td>${esc(r.cliente?.nome || '—')}</td>
  <td>${esc(r.descricao)}${isProvisao(r) ? ' <span class="tag">provisão</span>' : ''}${obsCell(r)}</td>
  <td class="val">${brl(saldo(r))}</td>
  <td class="doc">${esc(r.numero_documento || '')}</td></tr>`).join('')

const linhasSem = semData.map((r) => `<tr>
  <td>${esc(r.cliente?.nome || '—')}</td>
  <td>${esc(r.descricao)}${isProvisao(r) ? ' <span class="tag">provisão</span>' : ''}${obsCell(r)}</td>
  <td class="val">${brl(saldo(r))}</td>
  <td class="doc">${esc(r.numero_documento || '')}</td></tr>`).join('')

const linhasAging = ['1–30 dias', '31–60 dias', '61–90 dias', '90+ dias']
  .filter((f) => aging[f]).map((f) => `<tr><td>${f}</td><td class="val">${brl(aging[f])}</td></tr>`).join('')

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #17181A; font-size: 10.5px; line-height: 1.45; margin: 0; }
  .display { font-family: "Oswald", "Segoe UI", sans-serif; text-transform: uppercase; letter-spacing: .04em; }
  header { border-bottom: 2px solid #17181A; padding-bottom: 10px; margin-bottom: 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
  .meta { color: #5B5E63; font-size: 9.5px; }
  .accent { height: 3px; width: 54px; background: #C9A84C; margin-top: 8px; }
  h2 { font-size: 12.5px; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: .05em; font-weight: 700;
       border-left: 4px solid #17181A; padding-left: 8px; }
  h2 .sub { float: right; font-weight: 400; color: #5B5E63; font-size: 10px; letter-spacing: 0; text-transform: none; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: #5B5E63;
       border-bottom: 1.5px solid #17181A; padding: 5px 6px; }
  td { padding: 5px 6px; border-bottom: .5px solid #E4E5E7; vertical-align: top; }
  tr { break-inside: avoid; }
  .val { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.val { text-align: right; }
  .doc { color: #8A8D92; font-size: 8px; white-space: nowrap; }
  .obs { color: #6B6E73; font-size: 8px; line-height: 1.35; margin-top: 3px; font-style: italic; max-width: 340px; }
  .atraso { color: #17181A; font-weight: 600; white-space: nowrap; }
  .nowrap { white-space: nowrap; }
  .tag { display: inline-block; font-size: 7.5px; text-transform: uppercase; letter-spacing: .04em;
         border: .5px solid #C9A84C; color: #9c7f2f; padding: 0 4px; border-radius: 2px; vertical-align: middle; }
  .resumo { display: flex; gap: 10px; margin-bottom: 16px; }
  .card { flex: 1; border: 1px solid #D9DADD; border-radius: 4px; padding: 10px 12px; }
  .card .lbl { font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: #5B5E63; }
  .card .num { font-size: 17px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .card .qt { font-size: 8.5px; color: #8A8D92; }
  .card.total { background: #17181A; color: #fff; border-color: #17181A; }
  .card.total .lbl, .card.total .qt { color: #B9BBBF; }
  .card.vencido { border-top: 3px solid #17181A; }
  .card.prev { border-top: 3px solid #C9A84C; }
  .grid2 { display: flex; gap: 24px; align-items: flex-start; }
  .grid2 > div:first-child { flex: 0 0 42%; }
  tfoot td { border-top: 1.5px solid #17181A; border-bottom: none; font-weight: 700; padding-top: 6px; }
  .nota { margin-top: 18px; padding: 10px 12px; background: #F6F6F4; border-left: 3px solid #C9A84C; font-size: 9px; color: #3A3C40; border-radius: 0 3px 3px 0; }
  .empty { color: #8A8D92; font-style: italic; padding: 6px; font-size: 9.5px; }
  footer { margin-top: 20px; padding-top: 8px; border-top: .5px solid #D9DADD; color: #8A8D92; font-size: 8px; display: flex; justify-content: space-between; }
</style></head><body>
<header>
  <h1>Relatório de Contas a Receber</h1>
  <div class="meta">Bula Assessoria · Referência ${dt(HOJE)} · Fonte: ERP (títulos pendentes — aberto / parcial / vencido)</div>
  <div class="accent"></div>
</header>

<div class="resumo">
  <div class="card vencido"><div class="lbl">Vencidos</div><div class="num">R$ ${brl(totV)}</div><div class="qt">${vencidos.length} títulos · ${pct(totV)}</div></div>
  <div class="card prev"><div class="lbl">A receber — com data</div><div class="num">R$ ${brl(totC)}</div><div class="qt">${comData.length} títulos · ${pct(totC)}</div></div>
  <div class="card"><div class="lbl">A receber — sem data</div><div class="num">R$ ${brl(totS)}</div><div class="qt">${semData.length} títulos · ${pct(totS)}</div></div>
  <div class="card total"><div class="lbl">Total a receber</div><div class="num">R$ ${brl(totGeral)}</div><div class="qt">${rows.length} títulos</div></div>
</div>

<div class="grid2">
  <div>
    <h2>Envelhecimento dos vencidos</h2>
    <table><thead><tr><th>Faixa de atraso</th><th class="val">Valor (R$)</th></tr></thead>
    <tbody>${linhasAging}</tbody>
    <tfoot><tr><td>Total vencido</td><td class="val">${brl(totV)}</td></tr></tfoot></table>
  </div>
</div>

<h2>Vencidos <span class="sub">${vencidos.length} títulos · R$ ${brl(totV)}</span></h2>
<table><thead><tr><th>Venc.</th><th>Atraso</th><th>Cliente</th><th>Descrição</th><th class="val">Valor (R$)</th><th>Doc.</th></tr></thead>
<tbody>${linhasVenc}</tbody>
<tfoot><tr><td colspan="4">Subtotal vencidos</td><td class="val">${brl(totV)}</td><td></td></tr></tfoot></table>

<h2>A Receber — com data prevista <span class="sub">${comData.length} títulos · R$ ${brl(totC)}</span></h2>
<table><thead><tr><th>Data prevista</th><th>Cliente</th><th>Descrição</th><th class="val">Valor (R$)</th><th>Doc.</th></tr></thead>
<tbody>${linhasCom}</tbody>
<tfoot><tr><td colspan="3">Subtotal com data</td><td class="val">${brl(totC)}</td><td></td></tr></tfoot></table>

<h2>A Receber — sem data prevista <span class="sub">${semData.length} títulos · R$ ${brl(totS)}</span></h2>
${semData.length ? `<table><thead><tr><th>Cliente</th><th>Descrição</th><th class="val">Valor (R$)</th><th>Doc.</th></tr></thead>
<tbody>${linhasSem}</tbody>
<tfoot><tr><td colspan="2">Subtotal sem data</td><td class="val">${brl(totS)}</td><td></td></tr></tfoot></table>` : '<div class="empty">Nenhum título nesta condição.</div>'}

<div class="nota"><strong>Critério:</strong> só entram em <em>"com data prevista"</em> os títulos com data real de pagamento (repasse Remates 15/07 e boletos do Kito 30/07 e 30/08). <em>"Vencidos"</em> são cobranças reais em atraso. Todo o restante — provisões de fechamento, valores "a pagar em 2x" sem data definida, comissões dependentes de confirmação — fica em <em>"sem data prevista"</em>, sem data estimada no lugar.</div>

<footer><span>Bula Assessoria — documento interno</span><span>Gerado do ERP em ${dt(HOJE)}</span></footer>
</body></html>`

const outPath = join(homedir(), 'Desktop', `Contas-a-Receber-${HOJE}.pdf`)
const browser = await chromium.launch()
const pageP = await browser.newPage()
await pageP.setContent(html, { waitUntil: 'networkidle' })
await pageP.pdf({ path: outPath, format: 'A4', printBackground: true })
await browser.close()
console.log('PDF gerado:', outPath)
console.log('Vencidos:', vencidos.length, brl(totV), '| Com data:', comData.length, brl(totC), '| Sem data:', semData.length, '| Total:', brl(totGeral))
