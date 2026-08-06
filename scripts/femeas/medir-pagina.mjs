// ─────────────────────────────────────────────────────────────────────────
// AS MEDIDAS DA PÁGINA QUE NÃO PODEM PIORAR.
//
// Toda vez que alguém mexe no visual de /femeas, este script diz em números se
// a mudança custou conversão. Ele existe porque "ficou mais bonito" e "ficou
// melhor" são coisas diferentes, e só uma delas dá para medir.
//
// O NÚMERO SAGRADO é o `primeiroCampo`: a distância, em pixels, do topo da
// página até o primeiro campo do formulário no celular. Se ele cresce, a pessoa
// precisa rolar mais para começar a preencher — e isso se paga em conversão num
// funil de tráfego pago. Referência: 950px numa tela de 844 (o /touros faz 633).
//
// USO:
//   node scripts/femeas/medir-pagina.mjs
//   node scripts/femeas/medir-pagina.mjs https://femeas.bulaassessoria.com
// ─────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:3000'

/**
 * Estado conhecido em 06/08/2026, depois de a ficha técnica passar para depois
 * do formulário no celular. Serve de linha de base.
 *
 * Histórico do `primeiroCampo` no celular, que é o número que importa:
 *   1113 → antes de tudo
 *    950 → depois do carrossel de categorias
 *    763 → depois de a ficha técnica sair da frente   ← hoje
 *    633 → o /touros, que é o análogo e a meta
 *
 * A altura total subiu em 06/08 com as fotos: primeiro a faixa antes do fecho,
 * depois a galeria que a substituiu (mobile 7297→8578, desktop 6947→8063). Foi
 * ganho ABAIXO da dobra e o `primeiroCampo` não se moveu — que é o que importa.
 */
const REFERENCIA = {
  'MOBILE 390': { primeiroCampo: 763, paraQuem: 1421, categorias: 838, pagina: 8578 },
  'DESKTOP 1440': { primeiroCampo: 399, paraQuem: 1192, categorias: 1254, pagina: 8063 },
}

const navegador = await chromium.launch()
const resultados = {}

for (const [rotulo, largura, altura, celular] of [
  ['MOBILE 390', 390, 844, true],
  ['DESKTOP 1440', 1440, 900, false],
]) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura },
    isMobile: celular,
    hasTouch: celular,
    deviceScaleFactor: celular ? 2 : 1,
  })
  const pagina = await contexto.newPage()
  await pagina.goto(base + '/femeas', { waitUntil: 'networkidle', timeout: 45000 })
  await pagina.waitForTimeout(1200)

  resultados[rotulo] = await pagina.evaluate(() => {
    const altura = seletor => {
      const el = document.querySelector(seletor)
      return el ? Math.round(el.getBoundingClientRect().height) : null
    }
    const formulario = document.querySelector('form')
    const primeiro = formulario?.querySelector('select, input, textarea')
    return {
      primeiroCampo: primeiro
        ? Math.round(primeiro.getBoundingClientRect().top + window.scrollY)
        : null,
      paraQuem: altura('#para-quem'),
      categorias: altura('#categorias'),
      prova: altura('#prova'),
      pagina: document.body.scrollHeight,
      // Invariantes estruturais: um formulário só (senão os eventos do funil
      // contam dobrado) e as seis categorias sempre presentes no DOM, mesmo
      // quando o carrossel mostra uma por vez.
      formularios: document.querySelectorAll('form').length,
      cartoes: document.querySelectorAll('#categorias article').length,
      criterios: document.querySelectorAll('#para-quem li').length,
      rolagemLateral:
        document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })
  await contexto.close()
}

let falhas = 0
for (const [rotulo, medida] of Object.entries(resultados)) {
  console.log(`\n===== ${rotulo} =====`)
  const ref = REFERENCIA[rotulo]
  for (const [chave, valor] of Object.entries(medida)) {
    let nota = ''
    if (ref?.[chave] != null && typeof valor === 'number') {
      const delta = valor - ref[chave]
      nota = delta === 0 ? '  (igual à referência)' : `  (${delta > 0 ? '+' : ''}${delta} vs. referência)`
      if (chave === 'primeiroCampo' && delta > 0) { nota += '  ⚠️ PIOROU'; falhas++ }
    }
    console.log(`  ${chave.padEnd(15)} ${String(valor).padEnd(8)}${nota}`)
  }
  if (medida.formularios !== 1) { console.log('  ⚠️ deveria haver exatamente 1 formulário'); falhas++ }
  if (medida.cartoes !== 6) { console.log('  ⚠️ deveria haver 6 cartões de categoria no DOM'); falhas++ }
  if (medida.criterios !== 9) { console.log('  ⚠️ deveria haver 9 critérios no filtro (5 + 4)'); falhas++ }
  if (medida.rolagemLateral) { console.log('  ⚠️ ROLAGEM LATERAL — a página está mais larga que a tela'); falhas++ }
}

console.log(falhas ? `\n${falhas} PROBLEMA(S) — ver os ⚠️ acima` : '\nTudo dentro do esperado.')
await navegador.close()
