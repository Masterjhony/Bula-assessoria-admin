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
//   node scripts/medir-dobra-saogeraldo.mjs           # next start sobre o .next atual
//   node scripts/medir-dobra-saogeraldo.mjs --build   # npm run build antes de medir
//   node scripts/medir-dobra-saogeraldo.mjs --dev     # next dev (mede edição em curso)
//   node scripts/medir-dobra-saogeraldo.mjs --base=http://localhost:3010  # servidor de pé
//   node scripts/medir-dobra-saogeraldo.mjs --json    # saída para máquina
//   node scripts/medir-dobra-saogeraldo.mjs --portao=600
//
// POR QUE O PADRÃO É `next start` SOBRE UM BUILD EXISTENTE, e não `next dev`:
//
// 1. É o que a §7.3 pediu, e o número certo é o do bundle que vai ao ar.
// 2. `next dev` NÃO é confiável como padrão. Ele exige o lock de `.next/dev`,
//    e nesta equipe quase sempre há um `next dev` de colega de pé — a segunda
//    instância morre com "Unable to acquire lock". Um padrão que depende de
//    ninguém mais estar trabalhando não é um padrão.
// 3. `/saogeraldo` sai PRÉ-RENDERIZADO (`.next/server/app/saogeraldo.html`), então
//    `next start` responde em ~1s, contra minutos de compilação sob demanda do dev.
// 4. O build já é pré-requisito da bateria: o portão 3 da §7.2 é `npm run build`
//    e o portão 4 mede `wc -c .next/server/app/saogeraldo.html`. Quando o portão 13
//    roda, o build existe. Exigir build não é atrito novo; é a ordem real dos portões.
//
// O build é responsabilidade de quem chama — mas o script CONFERE a idade dele e
// se recusa a medir um bundle mais velho que o código (§ `buildFresco`). Medir
// build velho é pior que não medir: devolve exit 0 sobre a página de ontem.
//
// Este script só LÊ a página renderizada. Não escreve nada em src/.

import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const ROTA = '/saogeraldo'
const ANCORA = 'cadastro'
const BUILD_ID = join(RAIZ, '.next', 'BUILD_ID')
// A rota é autocontida: nenhum arquivo dela importa de fora de
// `src/app/saogeraldo/`. Só o CSS global entra na conta por cima.
const FONTES = [join(RAIZ, 'src', 'app', 'saogeraldo'), join(RAIZ, 'src', 'app', 'globals.css')]

const args = process.argv.slice(2)
const temFlag = (n) => args.includes(n)
const valorFlag = (n, padrao) => {
  const hit = args.find((a) => a.startsWith(`${n}=`))
  return hit ? hit.slice(n.length + 1) : padrao
}

const MODO_DEV = temFlag('--dev')
const FAZER_BUILD = temFlag('--build')
const IGNORAR_IDADE = temFlag('--ignorar-idade')
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
    const p = spawn(cmd, cmdArgs, { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'] })
    let saida = ''
    const olho = (buf) => {
      saida += buf.toString()
      log(buf.toString())
    }
    p.stdout.on('data', olho)
    p.stderr.on('data', olho)
    p.on('error', () => reject(new Error(`não consegui executar \`${cmd}\` (${rotulo})`)))
    p.on('exit', (code) => {
      if (code === 0) return resolve()
      // O `.next/lock` é do build, não do dev: dois `next build` no mesmo
      // diretório se atropelam. Numa equipe rodando os portões em paralelo isso
      // acontece o tempo todo, e o código 1 sozinho não conta essa história.
      if (/Unable to acquire lock/i.test(saida)) {
        return reject(
          new Error(
            'outro `next build` já está rodando neste repositório (lock de `.next`).\n' +
              '  Espere ele terminar e rode de novo — sem --build, se o build dele já servir.',
          ),
        )
      }
      reject(new Error(`${rotulo} falhou com código ${code}`))
    })
  })
}

// Arquivo mais recente sob os caminhos de origem da rota.
function maisRecente(caminhos) {
  let topo = { ms: 0, arquivo: null }
  const visita = (p) => {
    let st
    try {
      st = statSync(p)
    } catch {
      return
    }
    if (st.isDirectory()) {
      for (const filho of readdirSync(p)) visita(join(p, filho))
      return
    }
    if (st.mtimeMs > topo.ms) topo = { ms: st.mtimeMs, arquivo: p }
  }
  caminhos.forEach(visita)
  return topo
}

// Enquanto um `next build` corre, o `.next` está sendo reescrito: o BUILD_ID some
// e volta. Nesta equipe os portões rodam em paralelo, então esbarrar num build de
// colega é rotina — esperar é mais útil que reclamar de um estado transitório.
async function esperaBuildEmCurso(limiteMs = 300_000) {
  const lock = join(RAIZ, '.next', 'lock')
  const existe = () => {
    try {
      statSync(lock)
      return true
    } catch {
      return false
    }
  }
  if (!existe()) return
  log('· um `next build` está em curso neste repositório; aguardando ele terminar\n')
  const fim = Date.now() + limiteMs
  while (Date.now() < fim) {
    await new Promise((r) => setTimeout(r, 2000))
    if (!existe()) {
      // O BUILD_ID é escrito no fim; dá um respiro para o disco assentar.
      await new Promise((r) => setTimeout(r, 1500))
      return
    }
  }
  throw new Error(
    `há um \`next build\` segurando \`.next/lock\` há mais de ${limiteMs / 1000}s.\n` +
      '  Se ele travou, derrube o processo; se ainda corre, rode de novo depois.',
  )
}

// Recusa medir bundle mais velho que o código. Um exit 0 sobre o build de ontem
// é a única saída deste script pior que um erro.
function conferaIdadeDoBuild() {
  let build
  try {
    build = statSync(BUILD_ID)
  } catch {
    throw new Error(
      'não há build de produção em `.next` (BUILD_ID ausente).\n' +
        '  Rode `npm run build`, ou chame este script com --build.\n' +
        '  Para medir a edição em curso sem build, use --dev.',
    )
  }
  const fonte = maisRecente(FONTES)
  if (IGNORAR_IDADE || fonte.ms <= build.mtimeMs) return { build: build.mtimeMs, fonte }

  const atraso = Math.round((fonte.ms - build.mtimeMs) / 1000)
  throw new Error(
    `o build está mais velho que o código: \`${fonte.arquivo.replace(`${RAIZ}/`, '')}\` mudou ` +
      `${atraso}s depois do último \`npm run build\`.\n` +
      '  Medir isso devolveria o número da página de ontem. Rode `npm run build`,\n' +
      '  ou chame com --build. (--dev mede a edição em curso; --ignorar-idade força.)',
  )
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

  if (FAZER_BUILD) {
    log('· npm run build\n')
    await roda('npm', ['run', 'build'], 'npm run build')
  }

  if (!MODO_DEV) {
    // Caminho padrão. Nada de plano B: se o build não está lá ou está velho, o
    // certo é reclamar, não medir outra coisa e chamar de portão.
    await esperaBuildEmCurso()
    const idade = conferaIdadeDoBuild()
    const porta = await portaLivre(3128)
    const r = await tentaSubir(['next', 'start', '--port', String(porta)], porta, 90_000)
    if (r.base) {
      return {
        base: r.base,
        descricao: `next start em ${r.base}`,
        segundos: r.segundos,
        buildEm: idade.build,
      }
    }
    throw new Error(
      `\`next start\` não serviu ${ROTA}: ${r.falha}\n` +
        '  O build existe mas não sobe. Rode `npm run build` de novo, ou meça com --dev.',
    )
  }

  // --dev: para quem quer o número da edição em curso, sem esperar build.
  const porta = await portaLivre(3117)
  const r = await tentaSubir(['next', 'dev', '--port', String(porta)], porta, 240_000)
  if (r.base) return { base: r.base, descricao: `next dev em ${r.base}`, segundos: r.segundos }

  // O lock de `.next/dev` costuma estar tomado por um colega. Medir no servidor
  // dele vale mais que não medir — mas o relatório precisa dizer que foi ali,
  // porque o arquivo pode estar sendo editado embaixo da medição.
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
    `--dev não conseguiu servir ${ROTA}: ${r.falha}\n` +
      '  Saídas: rode sem --dev (mede o build de produção), derrube o outro `next dev`,\n' +
      '  ou passe --base=http://localhost:PORTA de um servidor já rodando.',
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
  if (BASE.buildEm) log(`build:    ${new Date(BASE.buildEm).toLocaleString('pt-BR')}\n`)

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
          modo: MODO_DEV ? 'dev' : BASE_EXTERNA ? 'externo' : 'start',
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
