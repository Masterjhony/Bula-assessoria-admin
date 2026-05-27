// Visual QA autônomo: abre as rotas do painel admin local e captura
// screenshots full-page (desktop 1440x900).
//
// Pré-requisitos:
//  - servidor dev rodando em http://localhost:3000 (npm run dev)
//  - playwright instalado + chromium baixado
//  - usuário qa@bula.test / QaBot123! existe no Supabase (seed-admin.mjs)
//
// Uso:
//   node scripts/visual-qa.mjs                  # captura todas
//   node scripts/visual-qa.mjs leiloes crm      # captura só essas

import { chromium } from 'playwright'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.QA_BASE || 'http://localhost:3000'
const EMAIL = process.env.QA_EMAIL || 'qa@bula.test'
const PASSWORD = process.env.QA_PASSWORD || 'QaBot123!'

const ROUTES = {
  dashboard:           '/sistema',
  leiloes:             '/sistema/leiloes',
  'leiloes-fechamento':'/sistema/leiloes/fechamento',
  'leiloes-vendas':    '/sistema/leiloes/vendas-por-assessor',
  'leiloes-relatorios':'/sistema/leiloes/relatorios',
  'leiloes-equipe':    '/sistema/leiloes/equipe',
  crm:                 '/sistema/crm',
  leads:               '/sistema/leads',
  projetos:            '/sistema/projetos',
  'projetos-relatorios':'/sistema/projetos/relatorios',
  okr:                 '/sistema/okr',
  contratos:           '/sistema/contratos',
  agenda:              '/sistema/agenda',
  agendamentos:        '/sistema/agendamentos',
  analytics:           '/sistema/analytics',
  ia:                  '/sistema/ia',
  'biblioteca-midia':  '/sistema/biblioteca-midia',
  users:               '/sistema/users',
  settings:            '/sistema/settings',
  whatsapp:            '/sistema/whatsapp',
  'catalogos-whatsapp':'/sistema/catalogos-whatsapp',
  email:               '/sistema/email',
}

const filter = process.argv.slice(2)
const routes = filter.length
  ? Object.fromEntries(Object.entries(ROUTES).filter(([k]) => filter.includes(k)))
  : ROUTES

const outDir = join(import.meta.dirname, '..', 'qa-screenshots')
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

console.log(`Visual QA → ${BASE}`)
console.log(`Capturando ${Object.keys(routes).length} rotas em ${outDir}\n`)

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
})
const page = await context.newPage()

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(`[${msg.location()?.url ?? '?'}] ${msg.text()}`)
})
page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR ${e.message}`))

// ── Login via API direta (mais robusto que clicar no form) ───────────────
console.log('Login via /api/bula/auth/signin…')
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

console.log(`  status ${loginResp.status} :: ${loginResp.body.slice(0, 200)}\n`)
if (loginResp.status !== 200) {
  console.error('Login falhou. Abortando.')
  await browser.close()
  process.exit(1)
}

// ── Captura cada rota ─────────────────────────────────────────────────────
const results = []
for (const [name, path] of Object.entries(routes)) {
  consoleErrors.length = 0
  process.stdout.write(`  ${name.padEnd(22)} ${path} … `)
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1200) // hidratação + lazy renders

    const file = join(outDir, `${name}.png`)
    await page.screenshot({ path: file, fullPage: true })

    // Crop "above-the-fold" para inspeção rápida
    const fold = join(outDir, `${name}-fold.png`)
    await page.screenshot({ path: fold, clip: { x: 0, y: 0, width: 1440, height: 900 } })

    const finalUrl = page.url()
    const redirected = !finalUrl.includes(path)

    // Captura tamanho do body (detecta páginas em branco)
    const bodySize = await page.evaluate(() => {
      const b = document.body
      return { w: b.scrollWidth, h: b.scrollHeight, children: b.children.length }
    })

    const status = redirected
      ? `redirect→${finalUrl}`
      : bodySize.h < 400
      ? `vazio (h=${bodySize.h})`
      : `OK (h=${bodySize.h})`

    console.log(status + (consoleErrors.length ? `  ⚠ ${consoleErrors.length} errors` : ''))
    results.push({ name, path, file, status, bodySize, errors: [...consoleErrors] })

    if (consoleErrors.length > 0) {
      writeFileSync(join(outDir, `${name}.errors.txt`), consoleErrors.join('\n'))
    }
  } catch (e) {
    console.log(`ERRO: ${e.message}`)
    results.push({ name, path, error: e.message })
  }
}

await browser.close()

console.log('\n=== RESUMO ===')
const problems = results.filter((r) => r.error || r.status?.startsWith('redirect') || r.status?.startsWith('vazio') || r.errors?.length)
console.log(`Total: ${results.length} · Com problema: ${problems.length}`)
for (const r of problems) {
  console.log(`  ! ${r.name}: ${r.error || r.status}${r.errors?.length ? ` (${r.errors.length} console errs)` : ''}`)
}
console.log(`\nScreenshots em: ${outDir}`)
