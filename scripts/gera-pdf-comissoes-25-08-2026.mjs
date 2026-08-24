/**
 * Lista de pagamento das comissoes com vencimento em 25/08/2026 — o que sobrou
 * depois do PIX de 24/08 ao Douglas Bispo (11.908,00, ja quitado).
 *
 * Le o ERP AO VIVO (erp_contas_pagar venc. 2026-08-25 fora de pago/cancelado),
 * agrupa por beneficiario e gera o PDF na Area de Trabalho.
 * Nao inclui o Gustavo Rusa: a comissao de julho dele ja saiu em 10/08
 * (29.535,00, NF 34) e nao ha titulo dele em aberto.
 *
 * Uso: node scripts/gera-pdf-comissoes-25-08-2026.mjs
 */
import { join } from 'node:path'
import { homedir } from 'node:os'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const VENC = '2026-08-25'
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Dados de pagamento conferidos: no extrato (quem ja recebeu) e no cadastro de
// pessoas do ERP. Quem nao tem chave confirmada fica explicito no PDF.
const PAGAMENTO = {
  'FABIO OMENA': { via: 'FO ASSESSORIA PECUARIA LTDA', doc: 'CNPJ 59.791.094/0001-07' },
  'LEONARDO SERAFIM': { via: 'LEONARDO SERAFIM FRANCISCO LTDA', doc: 'CPF do titular 017.113.541-55' },
  'LAILA OLIVEIRA': { via: 'Laila de Sousa Oliveira', doc: 'CPF 019.222.326-70' },
  'PERALTA': { via: 'Luiz Felipe Peralta Garcez', doc: 'CPF 009.814.661-09' },
}

/* ------------------------------------------------------------------ dados -- */
const { data: cps, error } = await sb.from('erp_contas_pagar')
  .select('id, descricao, valor, status, observacoes')
  .eq('vencimento', VENC).not('status', 'in', '("pago","cancelado")')
if (error) { console.error(error.message); process.exit(1) }

// "COMISSAO <leilao> - <NOME> (2%)" — o beneficiario e o que vem antes do (%).
const parse = (d) => {
  const m = String(d).match(/^COMISSAO\s+(.*?)\s*-\s*([^-]+?)\s*\((\d+(?:[.,]\d+)?)\s*%\)\s*$/)
  return m
    ? { leilao: m[1].trim(), quem: m[2].trim().toUpperCase(), pct: m[3].replace('.', ',') }
    : { leilao: String(d).replace(/^COMISSAO\s+/, ''), quem: 'A DEFINIR', pct: null }
}

const grupos = new Map()
for (const c of cps) {
  const p = parse(c.descricao)
  if (!grupos.has(p.quem)) grupos.set(p.quem, [])
  grupos.get(p.quem).push({ ...p, valor: Number(c.valor), id: c.id })
}
for (const lista of grupos.values()) lista.sort((a, b) => b.valor - a.valor)

const soma = lista => lista.reduce((s, r) => s + r.valor, 0)
// "A DEFINIR" nao entra no total a pagar — nao se paga o que nao tem dono.
const ordenados = [...grupos].sort((a, b) => (a[0] === 'A DEFINIR' ? 1 : b[0] === 'A DEFINIR' ? -1 : soma(b[1]) - soma(a[1])))
const aPagar = ordenados.filter(([q]) => q !== 'A DEFINIR')
const indefinido = grupos.get('A DEFINIR') || []
const TOTAL = soma(aPagar.flatMap(([, l]) => l))
const TOTAL_INDEF = soma(indefinido)

/* -------------------------------------------------------------------- pdf -- */
const cardsPessoa = aPagar.map(([quem, lista]) => `
  <div class="card"><div class="lbl">${esc(quem)}</div><div class="num">R$ ${brl(soma(lista))}</div>
  <div class="qt">${lista.length} ${lista.length > 1 ? 'leilões' : 'leilão'}</div></div>`).join('')

const blocos = aPagar.map(([quem, lista]) => {
  const pg = PAGAMENTO[quem]
  return `
<h2>${esc(quem)} <span class="sub">R$ ${brl(soma(lista))} · ${lista.length} título${lista.length > 1 ? 's' : ''}</span></h2>
${pg ? `<div class="pgto">Pagar para <strong>${esc(pg.via)}</strong> · ${esc(pg.doc)}</div>`
     : '<div class="pgto warn">Sem dados de pagamento confirmados no ERP — confirmar a chave antes de transferir.</div>'}
<table>
<thead><tr><th>Leilão</th><th class="val" style="width:8%">%</th><th class="val" style="width:14%">Valor</th></tr></thead>
<tbody>${lista.map(r => `<tr><td>${esc(r.leilao)}</td><td class="val">${r.pct ? r.pct + '%' : '—'}</td><td class="val"><strong>${brl(r.valor)}</strong></td></tr>`).join('')}</tbody>
<tfoot><tr><td>Total ${esc(quem)}</td><td></td><td class="val">${brl(soma(lista))}</td></tr></tfoot>
</table>`
}).join('')

const blocoIndef = indefinido.length ? `
<h2>Não pagar — sem beneficiário definido <span class="sub">R$ ${brl(TOTAL_INDEF)}</span></h2>
<table>
<thead><tr><th>Leilão</th><th class="val" style="width:8%">%</th><th class="val" style="width:14%">Valor</th></tr></thead>
<tbody>${indefinido.map(r => `<tr><td>${esc(r.leilao)} <span class="tag warn">A definir</span></td><td class="val">${r.pct ? r.pct + '%' : '—'}</td><td class="val">${brl(r.valor)}</td></tr>`).join('')}</tbody>
</table>
<div class="nota">Esse título está lançado com o assessor <strong>“A DEFINIR”</strong> — o sistema sabe que a comissão existe, mas não de quem é. Fica <strong>fora do total de amanhã</strong>: definir o beneficiário e pagar junto com setembro, ou cancelar o título se a venda não for de ninguém da equipe.</div>` : ''

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Arial, sans-serif; color: #17181A; font-size: 10px; line-height: 1.45; margin: 0; }
  header { border-bottom: 2px solid #17181A; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 19px; margin: 0 0 4px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
  .meta { color: #5B5E63; font-size: 9.5px; }
  .accent { height: 3px; width: 54px; background: #C9A84C; margin-top: 8px; }
  h2 { font-size: 12px; margin: 20px 0 6px; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; border-left: 4px solid #17181A; padding-left: 8px; }
  h2 .sub { float: right; font-weight: 400; color: #5B5E63; font-size: 9.5px; letter-spacing: 0; text-transform: none; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: #5B5E63; border-bottom: 1.5px solid #17181A; padding: 5px 6px; }
  td { padding: 5px 6px; border-bottom: .5px solid #E4E5E7; vertical-align: top; }
  tr { break-inside: avoid; }
  .val { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  th.val { text-align: right; }
  tfoot td { border-top: 1.5px solid #17181A; border-bottom: none; font-weight: 700; padding-top: 6px; }
  .pgto { font-size: 8.5px; color: #4A4C50; margin: 0 0 6px; padding-left: 12px; }
  .pgto.warn { color: #9c7f2f; font-weight: 600; }
  .tag { display: inline-block; font-size: 7px; text-transform: uppercase; letter-spacing: .04em; border: .5px solid #17181A; padding: 0 4px; border-radius: 2px; vertical-align: middle; }
  .tag.warn { border-color: #C9A84C; color: #9c7f2f; font-weight: 700; }
  .resumo { display: flex; gap: 10px; margin-bottom: 14px; }
  .card { flex: 1; border: 1px solid #D9DADD; border-radius: 4px; padding: 9px 11px; }
  .card .lbl { font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: #5B5E63; }
  .card .num { font-size: 15px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .card .qt { font-size: 8px; color: #8A8D92; }
  .card.total { background: #17181A; color: #fff; border-color: #17181A; }
  .card.total .lbl, .card.total .qt { color: #B9BBBF; }
  .nota { margin-top: 10px; padding: 10px 12px; background: #F6F6F4; border-left: 3px solid #C9A84C; font-size: 9px; color: #3A3C40; border-radius: 0 3px 3px 0; break-inside: avoid; }
  .nota ul { margin: 6px 0 0; padding-left: 16px; }
  .nota li { margin-bottom: 4px; }
  footer { margin-top: 18px; padding-top: 8px; border-top: .5px solid #D9DADD; color: #8A8D92; font-size: 8px; display: flex; justify-content: space-between; }
</style></head><body>
<header>
  <h1>Comissões a pagar — 25/08/2026</h1>
  <div class="meta">Bula Assessoria · o que resta depois do PIX de 24/08 ao Douglas Bispo · sem o Gustavo Rusa (julho dele já saiu em 10/08)</div>
  <div class="accent"></div>
</header>

<div class="resumo">
  ${cardsPessoa}
  <div class="card total"><div class="lbl">Total a pagar 25/08</div><div class="num">R$ ${brl(TOTAL)}</div><div class="qt">${aPagar.flatMap(([, l]) => l).length} títulos${TOTAL_INDEF ? ` · + ${brl(TOTAL_INDEF)} sem dono` : ''}</div></div>
</div>

${blocos}
${blocoIndef}

<div class="nota"><strong>O que já saiu e por isso não está aqui:</strong>
<ul>
<li><strong>Douglas Bispo — R$ 11.908,00</strong>, PIX de 24/08 (“Ref Comissoes Douglas Julho”). Quitou os 10 títulos de 25/08. A conferência do mesmo dia apurou <strong>12.228,00</strong> devidos: restam <strong>320,00</strong> a favor dele (lote 19 do Nelore Sorriso, cobrado a 400 em vez de 500), ainda não lançados como título.</li>
<li><strong>Gustavo Rusa — R$ 29.535,00</strong>, PIX de 10/08 (NF 34), referente a julho. Não há título dele em aberto.</li>
<li><strong>Bulinha (Felipe Andrade) — R$ 7.329,97</strong>, quitado pelas faturas de cartão debitadas em 24/08 (VISA 5.949,84 + MASTERCARD 1.380,13). Não é pagamento novo: todas as compras desses cartões têm portador Felipe V Andrade, então a fatura abate a dívida.</li>
</ul></div>

<footer><span>Bula Assessoria — documento interno</span><span>Gerado em 24/08/2026 · fonte: ERP (contas a pagar, vencimento ${VENC.split('-').reverse().join('/')})</span></footer>
</body></html>`

const outPath = join(homedir(), 'Desktop', 'Comissoes-a-Pagar-25-08-2026.pdf')
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: outPath, format: 'A4', printBackground: true })
// --png salva um preview ao lado para conferir o layout sem abrir o PDF.
if (process.argv.includes('--png')) {
  await page.setViewportSize({ width: 794, height: 1123 })
  await page.screenshot({ path: outPath.replace(/\.pdf$/, '.png'), fullPage: true })
}
await browser.close()

console.log('PDF gerado:', outPath)
for (const [quem, lista] of ordenados) console.log(`  ${quem.padEnd(20)} ${String(lista.length).padStart(2)} titulo(s)  ${brl(soma(lista)).padStart(10)}`)
console.log(`  ${'TOTAL A PAGAR'.padEnd(20)} ${String(aPagar.flatMap(([, l]) => l).length).padStart(2)} titulo(s)  ${brl(TOTAL).padStart(10)}`)
if (TOTAL_INDEF) console.log(`  (fora: ${brl(TOTAL_INDEF)} sem beneficiario definido)`)
