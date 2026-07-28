// Medidor de dobra da /saogeraldo — portão 13 do PLANO-REDESIGN.md (§7.2/§7.3).
//
// Mede a posição vertical do topo de `#cadastro` (a âncora única de conversão,
// em Hero.tsx) em quatro viewports e falha se o formulário descer demais no
// celular. É a diferença entre "a dobra continua ok" ser opinião e ser exit 0.
//
// O portão é UM só: 390×844 ≤ 596px. Os outros três viewports saem como
// relatório, sem portão — servem para enxergar a direção do estrago quando o
// número do portão mexe.
//
// Uso:
//   node scripts/medir-dobra-saogeraldo.mjs             # sobe next dev, mede, derruba
//   node scripts/medir-dobra-saogeraldo.mjs --prod      # npm run build + next start
//   node scripts/medir-dobra-saogeraldo.mjs --prod --sem-build   # reusa .next existente
//   node scripts/medir-dobra-saogeraldo.mjs --base=http://localhost:3000  # servidor já de pé
//   node scripts/medir-dobra-saogeraldo.mjs --json      # saída para máquina
//   node scripts/medir-dobra-saogeraldo.mjs --portao=600
//
// POR QUE `next dev` É O PADRÃO, e não o `next start` que a §7.3 pediu:
// o repositório não versiona `.env.local`, e `npm run build` compila o app
// inteiro (/sistema, rotas de API, Supabase) — quebra por falta de env que nada
// tem a ver com esta landing, e leva minutos. A medição aqui é de LAYOUT: mesmo
// CSS, mesmos componentes, mesma fonte nos dois modos. Quem quiser o número
// contra o bundle de produção roda com `--prod`, e o script faz o build.
//
// Este script só LÊ a página renderizada. Não escreve nada em src/.

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const ROTA = '/saogeraldo'
const ANCORA = 'cadastro'

const args = process.argv.slice(2)
const temFlag = (n) => args.includes(n)
const valorFlag = (n, padrao) => {
  const hit = args.find((a) => a.startsWith(`${n}=`))
  return hit ? hit.slice(n.length + 1) : padrao
}

const MODO_PROD = temFlag('--prod')
const SEM_BUILD = temFlag('--sem-build') || temFlag('--no-build')
const JSON_OUT = temFlag('--json')
const BASE_EXTERNA = valorFlag('--base', null)
const PORTAO_PX = Number(valorFlag('--portao', '596'))

// O viewport do portão vem primeiro na lista para que, se algo explodir no meio
// da rodada, o número que importa já tenha sido colhido.
const VIEWPORTS = [
  { largura: 390, altura: 844, celular: true, portao: true },
  { largura: 375, altura: 667, celular: true, portao: false },
  { largura: 768, altura: 1024, celular: false, portao: false },
  { largura: 1440, altura: 900, celular: false, portao: false },
]

// ─────────────────────────────────────────────────────────────────────────────
// Infra: porta livre, subir e derrubar servidor
// ─────────────────────────────────────────────────────────────────────────────

function portaLivre(porta, restam = 40) {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', () => {
      if (restam <= 0) return reject(new Error(`nenhuma porta livre a partir de ${porta - 40}`))
      resolve(portaLivre(porta + 1, restam - 1))
    })
    s.once('listening', () => s.close(() => resolve(porta)))
    s.listen(porta, '127.0.0.1')
  })
}

function roda(cmd, cmdArgs, rotulo) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, cmdArgs, { cwd: RAIZ, stdio: JSON_OUT ? 'ignore' : 'inherit' })
    p.on('error', () => reject(new Error(`não consegui executar \`${cmd}\` (${rotulo})`)))
    p.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${rotulo} falhou com código ${code}`)),
    )
  })
}

let servidor = null

// Confere que a porta não só responde, como responde COM ESTA landing — evita
// medir o app errado quando o dev de outro projeto está ocupando a porta.
async function serveARota(base, limiteMs = 4000) {
  try {
    const r = await fetch(`${base}${ROTA}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(limiteMs),
    })
    if (r.status !== 200) return false
    return (await r.text()).includes(`id="${ANCORA}"`)
  } catch {
    return false
  }
}

// Portas onde um `next dev` desta equipe costuma estar quando o lock do
// `.next/dev` já está tomado por um colega.
const PORTAS_PROVAVEIS = [3000, 3001, 3002, 3003, 3010, 3011, 3012]

async function procuraServidorVivo() {
  for (const p of PORTAS_PROVAVEIS) {
    const base = `http://127.0.0.1:${p}`
    if (await serveARota(base)) return base
  }
  return null
}

// Sobe o próprio servidor e devolve `null` se ele se recusar a subir por um
// motivo conhecido (o lock do `.next/dev`, porta ocupada, binário ausente).
// Falha rápido: não adianta esperar 180s por um processo que já morreu.
async function tentaSubir(cmdArgs, porta, limiteMs) {
  const base = `http://127.0.0.1:${porta}`
  const t0 = Date.now()
  let saidaChild = ''
  let desistiu = null

  servidor = spawn('npx', cmdArgs, {
    cwd: RAIZ,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })
  servidor.on('error', () => {
    desistiu = 'não consegui executar `npx next` — node_modules está instalado?'
  })
  const olho = (buf) => {
    saidaChild += buf.toString()
    if (/Unable to acquire lock/i.test(saidaChild)) {
      desistiu = 'o lock de `.next/dev` já está tomado por outro `next dev`'
    } else if (/EADDRINUSE/i.test(saidaChild)) {
      desistiu = `porta ${porta} ocupada`
    }
  }
  servidor.stdout.on('data', olho)
  servidor.stderr.on('data', olho)
  servidor.on('exit', () => {
    desistiu ||= 'o processo do servidor morreu antes de responder'
  })

  const fim = Date.now() + limiteMs
  while (Date.now() < fim) {
    if (desistiu) {
      derrubaServidor()
      return { falha: desistiu, saidaChild }
    }
    if (await serveARota(base, 2000)) return { base, segundos: (Date.now() - t0) / 1000 }
    await new Promise((r) => setTimeout(r, 500))
  }
  derrubaServidor()
  return { falha: `${base}${ROTA} não respondeu em ${limiteMs / 1000}s`, saidaChild }
}

async function sobeServidor() {
  if (BASE_EXTERNA) {
    if (!(await serveARota(BASE_EXTERNA, 15_000))) {
      throw new Error(`--base=${BASE_EXTERNA} não está servindo ${ROTA} com #${ANCORA} na marcação.`)
    }
    return { base: BASE_EXTERNA, descricao: `servidor externo em ${BASE_EXTERNA}`, segundos: 0 }
  }

  if (MODO_PROD && !SEM_BUILD) {
    log('· npm run build (modo --prod; use --sem-build para reusar o .next atual)\n')
    await roda('npm', ['run', 'build'], 'npm run build')
  }

  const porta = await portaLivre(MODO_PROD ? 3128 : 3117)
  const cmdArgs = MODO_PROD
    ? ['next', 'start', '--port', String(porta)]
    : ['next', 'dev', '--port', String(porta)]

  const r = await tentaSubir(cmdArgs, porta, MODO_PROD ? 90_000 : 240_000)
  if (r.base) {
    return { base: r.base, descricao: `${MODO_PROD ? 'next start' : 'next dev'} em ${r.base}`, segundos: r.segundos }
  }

  // Plano B: um `next dev` de colega já está de pé com esta landing. Medir nele
  // vale mais que não medir — mas o relatório precisa dizer que foi ali, porque
  // o arquivo pode estar sendo editado embaixo da medição.
  const emprestado = await procuraServidorVivo()
  if (emprestado) {
    return {
      base: emprestado,
      descricao: `⚠ REUSANDO o next dev já de pé em ${emprestado} (não subi o meu: ${r.falha})`,
      segundos: 0,
      emprestado: true,
    }
  }

  throw new Error(
    `não consegui servir ${ROTA}: ${r.falha}\n` +
      '  Saídas: derrube o outro `next dev`, ou passe --base=http://localhost:PORTA de um servidor já rodando.',
  )
}

function derrubaServidor() {
  if (!servidor?.pid) return
  try {
    process.kill(-servidor.pid, 'SIGTERM')
  } catch {
    try {
      servidor.kill('SIGTERM')
    } catch {
      /* já morreu */
    }
  }
  servidor = null
}

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => {
    derrubaServidor()
    process.exit(130)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Medição
// ─────────────────────────────────────────────────────────────────────────────

// Roda DENTRO da página. Devolve os dois números que interessam:
//  - `rect`: getBoundingClientRect().top + scrollY — o valor que a §7.3 pediu.
//  - `layout`: soma da cadeia de offsetTop — imune a `transform` de ancestral,
//    então denuncia quando os dois divergem por causa de animação em curso.
const SONDA = (id) => {
  const el = document.getElementById(id)
  if (!el) return { erro: 'ancora-ausente' }
  const r = el.getBoundingClientRect()
  let layout = 0
  let n = el
  while (n) {
    layout += n.offsetTop
    n = n.offsetParent
  }
  return {
    rect: r.top + window.scrollY,
    layout,
    larguraCss: document.documentElement.clientWidth,
    alturaCss: window.innerHeight,
  }
}

async function mede(navegador, vp) {
  const ctx = await navegador.newContext({
    viewport: { width: vp.largura, height: vp.altura },
    deviceScaleFactor: 1,
    // Celular emulado de verdade: sem isso o chromium desktop come ~15px de
    // largura com a barra de rolagem, e todo `vw` da página mede errado.
    isMobile: vp.celular,
    hasTouch: vp.celular,
    // `Reveal` e a contagem animam com transform; sem isto o rect flutua.
    reducedMotion: 'reduce',
    colorScheme: 'light',
  })

  // GTM não muda layout e adiciona latência e não-determinismo à medida.
  await ctx.route(/googletagmanager\.com|google-analytics\.com|doubleclick\.net/, (r) => r.abort())

  const page = await ctx.newPage()
  try {
    await page.goto(`${BASE.base}${ROTA}`, { waitUntil: 'load', timeout: 90_000 })
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(600)

    // Duas leituras separadas: se o número ainda estiver andando, é a hora de
    // saber, não depois.
    let m = await page.evaluate(SONDA, ANCORA)
    if (m.erro) throw new Error(`#${ANCORA} não existe em ${ROTA} — a âncora sumiu do Hero.tsx?`)
    let estavel = false
    for (let i = 0; i < 4 && !estavel; i++) {
      await page.waitForTimeout(400)
      const m2 = await page.evaluate(SONDA, ANCORA)
      estavel = Math.abs(m2.rect - m.rect) < 0.5
      m = m2
    }

    return { ...vp, ...m, estavel }
  } finally {
    await ctx.close()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Relatório
// ─────────────────────────────────────────────────────────────────────────────

const log = (s) => {
  if (!JSON_OUT) process.stdout.write(s)
}

function alertas(m) {
  const av = []
  if (!m.estavel) av.push('valor ainda oscilando')
  // rect inclui `transform`; a soma de offsetTop não. Divergir é sinal de
  // animação em curso — a medida vira opinião.
  if (Math.abs(m.rect - m.layout) > 1) av.push(`transform ativo (layout ${Math.round(m.layout)}px)`)
  // A barra de rolagem do chromium desktop rouba ~15px e desloca todo `vw`.
  if (Math.abs(m.larguraCss - m.largura) > 1) av.push(`largura útil ${Math.round(m.larguraCss)}px`)
  return av
}

function tabela(medidas) {
  log(`\n  ${'viewport'.padEnd(12)}${'  '}${'topo'.padStart(8)}${'folga'.padStart(10)}\n`)
  for (const m of medidas) {
    const av = alertas(m)
    log(
      `  ${`${m.largura}×${m.altura}`.padEnd(12)}` +
        `${m.portao ? ' ◀' : '  '}` +
        `${`${Math.round(m.rect)}px`.padStart(8)}` +
        `${`${Math.round(m.alturaCss - m.rect)}px`.padStart(10)}` +
        `${m.portao ? '   portão' : ''}` +
        `${av.length ? `   ⚠ ${av.join(' · ')}` : ''}\n`,
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────

let BASE = null
let saida = 0

try {
  log(`Medidor de dobra · ${ROTA} · topo de #${ANCORA}\n`)
  BASE = await sobeServidor()
  log(`servidor: ${BASE.descricao}${BASE.segundos ? ` (pronto em ${BASE.segundos.toFixed(1)}s)` : ''}\n`)

  let navegador
  try {
    navegador = await chromium.launch({ headless: true })
  } catch {
    throw new Error('chromium do Playwright não abriu. Rode `npx playwright install chromium`.')
  }

  const medidas = []
  try {
    for (const vp of VIEWPORTS) medidas.push(await mede(navegador, vp))
  } finally {
    await navegador.close()
  }

  const alvo = medidas.find((m) => m.portao)
  const valor = Math.round(alvo.rect)
  const passa = valor <= PORTAO_PX

  if (JSON_OUT) {
    process.stdout.write(
      `${JSON.stringify(
        {
          rota: ROTA,
          ancora: ANCORA,
          portao: { viewport: `${alvo.largura}x${alvo.altura}`, limite: PORTAO_PX, medido: valor, passa },
          medidas: medidas.map((m) => ({
            viewport: `${m.largura}x${m.altura}`,
            topo: Math.round(m.rect),
            topoLayout: Math.round(m.layout),
            folga: Math.round(m.alturaCss - m.rect),
            estavel: m.estavel,
          })),
        },
        null,
        2,
      )}\n`,
    )
  } else {
    tabela(medidas)
    log(`\nPORTÃO 13 · topo de #${ANCORA} @${alvo.largura}×${alvo.altura} ≤ ${PORTAO_PX}px\n`)
    log(
      passa
        ? `  medido ${valor}px · sobra ${PORTAO_PX - valor}px de orçamento · PASSA\n`
        : `  medido ${valor}px · ESTOUROU EM ${valor - PORTAO_PX}px · REPROVA\n` +
            `  Ordem de reclamação dos pixels em PLANO-REDESIGN.md §5.2 — nunca comece pelo monumento.\n`,
    )
    if (BASE.emprestado) {
      log(
        '\n  ⚠ Medido em servidor de terceiro: se alguém salvou um arquivo durante a rodada,\n' +
          '    o número é de um estado intermediário. Para o registro oficial, rode sem outro\n' +
          '    `next dev` de pé.\n',
      )
    }
  }

  saida = passa ? 0 : 1
} catch (e) {
  const msg = e?.message || String(e)
  if (JSON_OUT) process.stdout.write(`${JSON.stringify({ erro: msg })}\n`)
  else process.stderr.write(`\n✗ ${msg}\n`)
  saida = 1
} finally {
  derrubaServidor()
}

process.exit(saida)
