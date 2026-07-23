// Relatório de COMISSÕES A PAGAR — pagamento 27/07/2026 (dia 25 cai no sábado
// → próximo dia útil). Fonte: erp_contas_pagar status=aberto, venc <= 27/07,
// somente comissões. Agrupa por pessoa (grafias unificadas), detalha título a
// título e flaga pendências anotadas nas observações.
// Saída: outputs/relatorio-comissoes-pagar-2026-07-27.{html,pdf}
// Uso: node scripts/gera-relatorio-comissoes-27-07.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(join(root, '.env.local'), 'utf-8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// pessoa canônica a partir da descrição do CP
const PESSOAS = [
  [/BULINHA|FELIPE ANDRADE/i, 'Bulinha (Felipe Andrade)'],
  [/GUSTAVO RUSA|PARCEIRO GUSTAVO/i, 'Gustavo Rusa'],
  [/FABIO OMENA|FÁBIO OMENA|FÁBIO O/i, 'Fábio Omena'],
  [/DOUGLAS/i, 'Douglas Bispo'],
  [/LEONARDO|LÉO SERAFIM/i, 'Leonardo Serafim'],
  [/LUCAS MARTINS/i, 'Lucas Martins'],
  [/MATHEUS ALVES|MATEUS ALVES/i, 'Matheus Alves'],
  [/PERALTA/i, 'Peralta'],
  [/FABRICIO|FABRÍCIO/i, 'Fabricio Hyppolito'],
]
const pessoaDe = (desc) => (PESSOAS.find(([re]) => re.test(desc)) || [null, 'Outros'])[1]
const FLAG_RE = /AGUARDANDO|PEND[EÊ]NCIA|DIVERG|CONFERIR|VALIDA[ÇC][AÃ]O/i

const { data: cps, error } = await sb.from('erp_contas_pagar')
  .select('descricao,valor,vencimento,numero_documento,observacoes,tags')
  .eq('status', 'aberto').lte('vencimento', '2026-07-27').order('vencimento')
if (error) { console.error(error.message); process.exit(1) }

const titulos = (cps || []).filter((c) => /comissao|comissão/i.test(c.descricao) || (c.tags || []).includes('comissao'))
const grupos = new Map()
for (const t of titulos) {
  const p = pessoaDe(t.descricao)
  if (!grupos.has(p)) grupos.set(p, [])
  grupos.get(p).push(t)
}
const resumo = [...grupos.entries()].map(([pessoa, ts]) => ({
  pessoa, titulos: ts, total: ts.reduce((s, t) => s + Number(t.valor), 0),
  flags: ts.filter((t) => FLAG_RE.test(t.observacoes || '')).length,
})).sort((a, b) => b.total - a.total)
const totalGeral = resumo.reduce((s, r) => s + r.total, 0)

// nota específica: CP do Lucas Matinha 21/06 está a 2% (percentual dele é 0,5%/0,33%)
const notaLucas = titulos.some((t) => /LUCAS MARTINS \(2%\)/i.test(t.descricao))

const detalhes = resumo.map((r) => `
  <section class="pessoa">
    <div class="pessoa-head"><h2>${esc(r.pessoa)}</h2><div class="pessoa-total">R$ ${brl(r.total)}</div></div>
    <table>
      <thead><tr><th style="width:78px">Venc.</th><th>Título</th><th style="width:120px;text-align:right">Valor</th></tr></thead>
      <tbody>
        ${r.titulos.map((t) => {
          const flag = FLAG_RE.test(t.observacoes || '')
          return `<tr${flag ? ' class="flag"' : ''}>
            <td>${esc(t.vencimento.split('-').reverse().join('/'))}</td>
            <td>${esc(t.descricao)}${flag ? ' <span class="chip">⚠ pendência anotada — conferir antes de liberar</span>' : ''}</td>
            <td class="money">R$ ${brl(t.valor)}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </section>`).join('')

const hoje = new Date().toLocaleDateString('pt-BR')
const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Comissões a Pagar — 27/07/2026</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#111; background:#fff; font-size:11.5px; padding:34px 38px; }
  .head { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #111; padding-bottom:14px; margin-bottom:6px; }
  .brand { font-size:21px; font-weight:800; letter-spacing:3px; text-transform:uppercase; }
  .brand small { display:block; font-size:9px; letter-spacing:2px; color:#555; font-weight:400; margin-top:2px; }
  .meta { text-align:right; font-size:10px; color:#444; line-height:1.5; }
  .gold-rule { height:2px; background:#C9A84C; width:64px; margin:0 0 20px; }
  h1 { font-size:16px; text-transform:uppercase; letter-spacing:2px; margin:16px 0 3px; }
  .sub { font-size:10.5px; color:#555; margin-bottom:18px; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:9px; text-transform:uppercase; letter-spacing:1px; color:#555; border-bottom:1.5px solid #111; padding:5px 7px; }
  td { padding:5px 7px; border-bottom:1px solid #ddd; vertical-align:top; }
  .money { text-align:right; font-variant-numeric: tabular-nums; white-space:nowrap; }
  .resumo td { font-size:12px; }
  .resumo .tot td { font-weight:800; font-size:13px; border-top:2.5px solid #111; border-bottom:none; padding-top:9px; }
  .pessoa { margin-top:22px; page-break-inside:avoid; }
  .pessoa-head { display:flex; justify-content:space-between; align-items:baseline; background:#111; color:#fff; padding:6px 10px; }
  .pessoa-head h2 { font-size:12px; text-transform:uppercase; letter-spacing:1.5px; }
  .pessoa-total { font-size:13px; font-weight:800; font-variant-numeric: tabular-nums; }
  tr.flag td { background:#f4f4f4; }
  .chip { display:inline-block; font-size:8.5px; border:1px solid #999; color:#444; padding:1px 5px; margin-left:5px; border-radius:2px; white-space:nowrap; }
  .notas { margin-top:24px; font-size:10px; color:#444; line-height:1.65; border-top:1px solid #ccc; padding-top:10px; }
  .foot { margin-top:26px; display:flex; justify-content:space-between; font-size:9px; color:#777; border-top:1px solid #ccc; padding-top:8px; }
</style></head><body>
  <div class="head">
    <div class="brand">Bula Assessoria<small>Assessoria Pecuária</small></div>
    <div class="meta">Relatório de comissões a pagar<br>Gerado em ${hoje}</div>
  </div>
  <div class="gold-rule"></div>
  <h1>Comissões a Pagar — 27/07/2026</h1>
  <div class="sub">Ciclo de comissões do mês (dia 25 cai no sábado → pagamento no próximo dia útil, segunda 27/07). Títulos em aberto no Contas a Pagar com vencimento até 27/07.</div>

  <table class="resumo">
    <thead><tr><th>Beneficiário</th><th style="text-align:right">Títulos</th><th style="text-align:right">Valor a Pagar</th></tr></thead>
    <tbody>
      ${resumo.map((r) => `<tr><td>${esc(r.pessoa)}${r.flags ? ` <span class="chip">⚠ ${r.flags} título(s) c/ pendência anotada</span>` : ''}</td><td class="money">${r.titulos.length}</td><td class="money"><strong>R$ ${brl(r.total)}</strong></td></tr>`).join('')}
      <tr class="tot"><td>TOTAL GERAL</td><td class="money">${titulos.length}</td><td class="money">R$ ${brl(totalGeral)}</td></tr>
    </tbody>
  </table>

  ${detalhes}

  <div class="notas">
    <strong>Notas da apuração (23/07):</strong><br>
    · <strong>Gustavo Rusa — R$ 23.490,00</strong>: fecha exato com o extrato do acerto (total 88.435,00 − 64.945,00 já pagos em 13/07). Lotes de julho dos compradores dele: EAO Fêmeas 13.125,00 · Naviraí 5.655,00 (lotes 8, 80 e 2) · Santa Cruz 15/07 1.005,00 (lote 124) · Santa Cruz 19/07 3.705,00 (lotes 42 e 39).<br>
    · <strong>Bulinha (Felipe Andrade) — R$ 58.872,00</strong>: total da planilha COMISSÃO BULINHA (maio: EAO 14.060,00 + 4R 10.206,00 + JEM 2.550,00 · junho: Jacamim 540,00 + JMP Bezerras 1.260,00 + JMP Touros 30.256,00).<br>
    · <strong>Matheus Alves — R$ 238,59</strong>: corrigido para 0,33% (planilha da equipe usava 3%). Base 72.300,00 = lotes 28, 165 e 129 do JMP Touros (Rufino Kuhnem Junior).<br>
    ${notaLucas ? '· <strong>Lucas Martins — R$ 432,00</strong>: título do Matinha 21/06 lançado a 2%; o percentual do Lucas é 0,33% (0,5% na época). Não consta na planilha dele já paga em 10/07 (NF 04) — <strong>conferir antes de liberar</strong>.<br>' : ''}
    · Linhas marcadas com ⚠ têm pendência anotada nas observações do título (validação de receita ou divergência) — conferir antes de liberar no lote bancário.
  </div>
  <div class="foot"><span>Bula Assessoria — documento de uso interno</span><span>Comissões · pagamento 27/07/2026</span></div>
</body></html>`

mkdirSync(join(root, 'outputs'), { recursive: true })
const htmlPath = join(root, 'outputs', 'relatorio-comissoes-pagar-2026-07-27.html')
const pdfPath = join(root, 'outputs', 'relatorio-comissoes-pagar-2026-07-27.pdf')
writeFileSync(htmlPath, html, 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle' })
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } })
await browser.close()

console.log('Resumo:')
for (const r of resumo) console.log(`  ${r.pessoa.padEnd(28)} ${String(r.titulos.length).padStart(2)} títulos  R$ ${brl(r.total).padStart(12)}${r.flags ? `  ⚠${r.flags}` : ''}`)
console.log(`  ${'TOTAL GERAL'.padEnd(28)} ${String(titulos.length).padStart(2)} títulos  R$ ${brl(totalGeral).padStart(12)}`)
console.log(`\nPDF:  ${pdfPath}`)
console.log(`HTML: ${htmlPath}`)
