// ─────────────────────────────────────────────────────────────────────────
// PRINTS DA PÁGINA, SEÇÃO POR SEÇÃO, CELULAR E DESKTOP.
//
// Serve para revisar a página sem abrir o navegador em dez tamanhos, e para
// comparar "antes e depois" de uma mudança visual sem depender de memória.
//
// ⚠️ Ele desliga a animação (`reducedMotion: 'reduce'`) de propósito: sem isso a
// faixa de logos sai borrada e o carrossel sai no meio de uma transição. Mas
// atenção ao efeito colateral que já enganou uma revisão: com a animação
// desligada, a faixa de logos aparece PARADA — e parece que ela não passa
// sozinha, quando passa.
//
// USO:
//   node scripts/femeas/capturar-secoes.mjs
//   node scripts/femeas/capturar-secoes.mjs ~/Downloads/femeas
// ─────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'

const destino = (process.argv[2] ?? './outputs/femeas-prints').replace(/^~/, homedir())
await mkdir(destino, { recursive: true })

const SECOES = [
  ['01-topo', null],
  ['02-para-quem', '#para-quem'],
  ['03-categorias', '#categorias'],
  ['04-jornada', '#jornada'],
  ['05-assessoria', '#assessoria'],
  ['06-prova', '#prova'],
  ['07-fecho', '#fecho-cta'],
  ['08-rodape', 'footer'],
  ['09-formulario', '#cadastro'],
]

const navegador = await chromium.launch()
let salvos = 0

for (const [sufixo, largura, altura, celular] of [
  ['m', 390, 844, true],
  ['d', 1440, 900, false],
]) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura },
    isMobile: celular,
    hasTouch: celular,
    deviceScaleFactor: celular ? 2 : 1,
  })
  const pagina = await contexto.newPage()
  await pagina.goto('http://localhost:3000/femeas', { waitUntil: 'networkidle' })
  await pagina.emulateMedia({ reducedMotion: 'reduce' })
  await pagina.waitForTimeout(900)

  for (const [nome, seletor] of SECOES) {
    const arquivo = `${destino}/${nome}-${sufixo}.png`
    try {
      if (!seletor) {
        await pagina.evaluate(() => window.scrollTo(0, 0))
        await pagina.waitForTimeout(300)
        await pagina.screenshot({ path: arquivo })
      } else {
        const elemento = await pagina.$(seletor)
        if (!elemento) { console.log(`  (sem ${seletor} em ${largura}px)`); continue }
        await elemento.scrollIntoViewIfNeeded()
        await pagina.waitForTimeout(350)
        await elemento.screenshot({ path: arquivo })
      }
      salvos++
    } catch (erro) {
      console.log(`  erro em ${nome}-${sufixo}: ${erro.message.slice(0, 70)}`)
    }
  }
  await contexto.close()
}

console.log(`\n${salvos} imagens em ${destino}`)
await navegador.close()
