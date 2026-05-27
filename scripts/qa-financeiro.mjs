// Visual QA autonomo do ERP Financeiro - valida lancamentos importados
// vs Resumo da planilha Financeiro_Bula_2026.
//
// O que faz:
//   1. Login via /api/bula/auth/signin
//   2. GET /api/erp/dashboard e /api/erp/contas-receber etc.
//   3. Compara totais com os esperados da planilha
//   4. Navega /erp e tira screenshots: dashboard, cp, cr
//
// Uso: node scripts/qa-financeiro.mjs

import { chromium } from 'playwright'
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)

const BASE = process.env.QA_BASE || 'http://localhost:3000'
const EMAIL = process.env.QA_EMAIL || 'qa@bula.test'
const PASSWORD = process.env.QA_PASSWORD || 'QaBot123!'

const outDir = join(root, 'qa-screenshots', 'financeiro')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

const fmt = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const aproxEq = (a, b, tol = 1) => Math.abs(Number(a) - Number(b)) < tol

// Totais esperados (do Resumo + somas da planilha)
const ESPERADO = {
  receita_total: 453786.36,
  imposto_total: 77143.68,
  folha_total: 28800.00,
  qtd_leiloes_com_receita: 49,
  qtd_contas_a_pagar_a_pagar: 9,
  qtd_folha: 3,
  qtd_impostos_leilao: 49,
}

console.log(`QA Financeiro → ${BASE}`)
console.log(`Outputs em ${outDir}\n`)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
})
const page = await context.newPage()

const consoleErrors = []
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR ${e.message}`))

// ── Login ───────────────────────────────────────────────────────────────
console.log('[1/5] Login...')
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
const loginResp = await page.evaluate(async ({ email, password }) => {
  const res = await fetch('/api/bula/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  return { status: res.status, body: await res.text() }
}, { email: EMAIL, password: PASSWORD })
console.log(`  status ${loginResp.status}`)
if (loginResp.status !== 200) {
  console.error('Login falhou:', loginResp.body.slice(0, 200))
  await browser.close()
  process.exit(1)
}

// ── 2) Valida totais via API ────────────────────────────────────────────
console.log('\n[2/5] Validando totais via API...')

const apiResults = await page.evaluate(async () => {
  const get = async (url) => {
    const r = await fetch(url, { credentials: 'include' })
    return { status: r.status, json: await r.json().catch(() => null) }
  }
  const [dash, cr, cp, pessoas, cats] = await Promise.all([
    get('/api/erp/dashboard'),
    get('/api/erp/contas-receber'),
    get('/api/erp/contas-pagar'),
    get('/api/erp/pessoas'),
    get('/api/erp/categorias'),
  ])
  return { dash, cr, cp, pessoas, cats }
})

const cr = (apiResults.cr.json?.data || apiResults.cr.json || []).filter((r) => String(r.numero_documento || '').startsWith('BULA-2026-CR-'))
const cp = (apiResults.cp.json?.data || apiResults.cp.json || []).filter((r) => String(r.numero_documento || '').startsWith('BULA-2026-CP-'))
const cpImp = cp.filter((r) => String(r.numero_documento).startsWith('BULA-2026-CP-IMP-'))
const cpAP = cp.filter((r) => String(r.numero_documento).startsWith('BULA-2026-CP-A'))
const cpFolha = cp.filter((r) => String(r.numero_documento).startsWith('BULA-2026-CP-FOLHA-'))
const cpDesp = cp.filter((r) => String(r.numero_documento).startsWith('BULA-2026-CP-DESP-'))

const totReceita = cr.reduce((s, r) => s + Number(r.valor), 0)
const totImposto = cpImp.reduce((s, r) => s + Number(r.valor), 0)
const totFolha = cpFolha.reduce((s, r) => s + Number(r.valor), 0)
const totAPagarComissao = cpAP.reduce((s, r) => s + Number(r.valor), 0)
const totDespLeilao = cpDesp.reduce((s, r) => s + Number(r.valor), 0)

const checks = [
  { nome: 'Qtd contas a receber (leilões)', got: cr.length, expected: ESPERADO.qtd_leiloes_com_receita, ok: cr.length === ESPERADO.qtd_leiloes_com_receita },
  { nome: 'Receita bruta total CR', got: totReceita, expected: ESPERADO.receita_total, ok: aproxEq(totReceita, ESPERADO.receita_total, 0.5) },
  { nome: 'Qtd impostos lançados', got: cpImp.length, expected: ESPERADO.qtd_impostos_leilao, ok: cpImp.length === ESPERADO.qtd_impostos_leilao },
  { nome: 'Total impostos (17%)', got: totImposto, expected: ESPERADO.imposto_total, ok: aproxEq(totImposto, ESPERADO.imposto_total, 0.5) },
  { nome: 'Qtd comissões A Pagar', got: cpAP.length, expected: ESPERADO.qtd_contas_a_pagar_a_pagar, ok: cpAP.length === ESPERADO.qtd_contas_a_pagar_a_pagar },
  { nome: 'Qtd folha', got: cpFolha.length, expected: ESPERADO.qtd_folha, ok: cpFolha.length === ESPERADO.qtd_folha },
  { nome: 'Total folha Maio/2026', got: totFolha, expected: ESPERADO.folha_total, ok: aproxEq(totFolha, ESPERADO.folha_total, 0.5) },
]

let pass = 0, fail = 0
for (const c of checks) {
  const mark = c.ok ? '✓' : '✗'
  const exp = typeof c.expected === 'number' && c.expected > 100 ? `R$ ${fmt(c.expected)}` : c.expected
  const got = typeof c.got === 'number' && c.got > 100 ? `R$ ${fmt(c.got)}` : c.got
  console.log(`  ${mark} ${c.nome}: esperado ${exp} | recebido ${got}`)
  if (c.ok) pass++; else fail++
}

console.log(`\n  Dashboard endpoint status: ${apiResults.dash.status}`)
if (apiResults.dash.json?.data) {
  const d = apiResults.dash.json.data
  console.log(`    a_receber:        R$ ${fmt(d.a_receber || 0)}`)
  console.log(`    a_pagar:          R$ ${fmt(d.a_pagar || 0)}`)
  console.log(`    saldo_bancos:     R$ ${fmt(d.saldo_total_bancos || 0)}`)
}

console.log(`\n  Resultado API: ${pass} passou / ${fail} falhou`)

// ── 3) Screenshots do ERP ───────────────────────────────────────────────
console.log('\n[3/5] Capturando screenshots do /erp...')

const screens = [
  { name: 'erp-dashboard', page: 'dashboard' },
  { name: 'erp-contas-receber', page: 'cr' },
  { name: 'erp-contas-pagar', page: 'cp' },
  { name: 'erp-categorias', page: 'categorias' },
  { name: 'erp-clientes', page: 'clientes' },
  { name: 'erp-fornecedores', page: 'fornecedores' },
  { name: 'erp-dre', page: 'dre' },
  { name: 'erp-fluxo', page: 'fluxo' },
]

await page.goto(`${BASE}/erp`, { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(2000)

for (const s of screens) {
  consoleErrors.length = 0
  process.stdout.write(`  ${s.name.padEnd(28)} … `)
  try {
    // Clica na navegacao
    await page.evaluate((page) => {
      const el = document.querySelector(`[data-page="${page}"]`)
      if (el) el.click()
    }, s.page)
    // Aguarda o skeleton sumir (ou max 6s)
    await page.waitForTimeout(3500)
    try {
      await page.waitForFunction(() => {
        const skel = document.querySelectorAll('.skeleton, [class*="skeleton"]').length
        const hasMain = document.querySelector('.page-title, h1, table, .summary-card, .stat-card, .dashboard-card')
        return hasMain && skel < 3
      }, { timeout: 4000 })
    } catch {}
    await page.waitForTimeout(500)

    const file = join(outDir, `${s.name}.png`)
    await page.screenshot({ path: file, fullPage: true })
    await page.screenshot({ path: join(outDir, `${s.name}-fold.png`), clip: { x: 0, y: 0, width: 1600, height: 1000 } })

    const bodyInfo = await page.evaluate(() => ({
      h: document.body.scrollHeight,
      activePage: document.querySelector('.sidebar-item.active')?.dataset?.page,
      title: document.querySelector('h1, .page-title')?.textContent?.trim() || '',
    }))
    console.log(`OK (h=${bodyInfo.h}, ativo=${bodyInfo.activePage})${consoleErrors.length ? `  ⚠ ${consoleErrors.length} errs` : ''}`)
    if (consoleErrors.length) writeFileSync(join(outDir, `${s.name}.errors.txt`), consoleErrors.join('\n'))
  } catch (e) {
    console.log(`ERRO: ${e.message}`)
  }
}

// ── 4) Verifica que valores aparecem na UI ──────────────────────────────
console.log('\n[4/5] Verificando se valores aparecem na tela de CR...')

await page.evaluate(() => document.querySelector('[data-page="cr"]')?.click())
await page.waitForTimeout(2500)

const visibleCR = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('table tbody tr'))
  const texts = rows.slice(0, 5).map((r) => r.innerText.replace(/\s+/g, ' ').trim())
  const total = document.body.innerText.match(/R\$\s*[\d\.,]+/g)?.slice(0, 8) || []
  return { qtdRows: rows.length, sampleRows: texts, valoresVisiveis: total }
})

console.log(`  Linhas visíveis na tabela CR: ${visibleCR.qtdRows}`)
console.log(`  Primeiras linhas:`)
visibleCR.sampleRows.forEach((t, i) => console.log(`    ${i + 1}. ${t.slice(0, 130)}`))
console.log(`  Valores R$ na tela: ${visibleCR.valoresVisiveis.slice(0, 6).join(', ')}`)

const uiHasReceitas = visibleCR.qtdRows >= 30
console.log(`  ${uiHasReceitas ? '✓' : '✗'} Tabela CR populada (>= 30 linhas): ${visibleCR.qtdRows} encontradas`)

// ── 5) Resumo final ─────────────────────────────────────────────────────
console.log('\n[5/5] Resumo final\n')

const allPass = fail === 0 && uiHasReceitas
console.log(allPass ? '✓ TODOS OS CHECKS PASSARAM' : '✗ FALHAS DETECTADAS')
console.log(`  Validações API: ${pass}/${pass + fail}`)
console.log(`  Screenshots em: ${outDir}`)

await browser.close()

const report = {
  geradoEm: new Date().toISOString(),
  status: allPass ? 'PASS' : 'FAIL',
  checks,
  uiCR: visibleCR,
  totais: {
    receita_total_cr: totReceita,
    imposto_total_cp: totImposto,
    folha_total_cp: totFolha,
    a_pagar_comissoes: totAPagarComissao,
    desp_leilao_cp: totDespLeilao,
  },
  qtds: {
    cr: cr.length,
    cp: cp.length,
    cp_impostos: cpImp.length,
    cp_a_pagar: cpAP.length,
    cp_folha: cpFolha.length,
    cp_desp_leilao: cpDesp.length,
  },
}
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(`  Relatório: ${join(outDir, 'report.json')}`)

process.exit(allPass ? 0 : 1)
