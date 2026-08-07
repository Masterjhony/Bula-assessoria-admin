// ─────────────────────────────────────────────────────────────────────────
// A RÉGUA DA PÁGINA, SEÇÃO POR SEÇÃO.
//
// A regra que a landing de fêmeas obedece, e que nasceu da auditoria do filtro
// (06/08/2026, `.planning/femeas-perpetuo/AUDITORIA-FILTRO.md` §1.1):
//
//   toda seção OU quebra 2,0× de razão tipográfica (maior tipo ÷ 16px de corpo)
//   OU carrega ≥3% de área não-texto.
//
// Uma seção que não faz nem um nem outro é a que o dono lê como "muito texto,
// sem respiro, pouco visual" — foi assim que o filtro (1,25× / 0,0%) e a ficha
// técnica do hero (1,25× / 0,0%) foram achados, os dois antes de ele reclamar
// de novo. A régua existe para o próximo tratamento visual ser escolhido por
// medida e não por gosto, e para NENHUMA seção nova entrar reprovando.
//
// Até 06/08 esta régua era uma tabela num .md e um comentário repetido em três
// componentes. Tabela em .md não roda; comentário envelhece calado.
//
// ⚠️ `área não-texto` conta só `img`/`svg`/`video`, exatamente como a auditoria
// contou — mudar a conta agora quebraria a comparação com a tabela publicada.
// O preço disso está em EXCECOES: bloco pintado (o botão dourado do fecho) é
// âncora visual de verdade e mede 0,0% aqui. Antes de "consertar" uma seção que
// aparece reprovada, olhe se ela não está nesta lista.
//
// USO (com `npm run dev` de pé em outro terminal):
//   node scripts/femeas/medir-densidade.mjs
// ─────────────────────────────────────────────────────────────────────────
import { chromium } from 'playwright'

const base = process.env.BASE_URL ?? 'http://localhost:3000'

// A ordem é a do DOM (`src/app/femeas/page.tsx`). `#fecho` é a <Section>;
// `#fecho-cta` é só o wrapper do botão e mede 117px — medir o wrapper por
// engano faz a seção inteira parecer um tico de página.
const SECOES = [
  '#topo',
  '#galeria',
  '#para-quem',
  '#categorias',
  '#jornada',
  '#assessoria',
  '#prova',
  '#fecho',
]

const RAZAO_MINIMA = 2.0
const AREA_MINIMA = 3.0

// Seções que reprovam na conta e NÃO são defeito. Cada linha precisa dizer qual
// é a âncora que a conta não enxerga — sem isso, isto vira lista de desculpas.
const EXCECOES = {
  '#fecho': 'a âncora é o botão dourado PREENCHIDO (~310×52 no celular, ~8% da seção), e bloco pintado não é img/svg/video',
}

const navegador = await chromium.launch()
let reprovadas = 0

for (const [rotulo, largura, altura, celular] of [
  ['MOBILE 390', 390, 844, true],
  ['DESKTOP 1440', 1440, 900, false],
]) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura },
    isMobile: celular,
    hasTouch: celular,
  })
  const pagina = await contexto.newPage()
  await pagina.goto(base + '/femeas', { waitUntil: 'networkidle', timeout: 45000 })
  // Sem isto o marquee de logos entra na conta no meio de uma transição.
  await pagina.emulateMedia({ reducedMotion: 'reduce' })
  await pagina.waitForTimeout(900)

  const linhas = await pagina.evaluate((SECOES) => {
    const saida = []
    for (const seletor of SECOES) {
      const secao = document.querySelector(seletor)
      if (!secao) {
        saida.push({ seletor, ausente: true })
        continue
      }
      const caixa = secao.getBoundingClientRect()
      const area = caixa.width * caixa.height

      // O maior tipo RENDERIZADO, não o maior do CSS: só conta elemento que
      // tem texto próprio, está visível e ocupa largura. É assim que um
      // `clamp()` que nunca chega no teto para de mentir na tabela.
      let maiorFonte = 0
      let ondeEstá = ''
      for (const el of secao.querySelectorAll('*')) {
        const temTextoPróprio = [...el.childNodes].some(
          (n) => n.nodeType === 3 && n.textContent.trim(),
        )
        if (!temTextoPróprio) continue
        const estilo = getComputedStyle(el)
        if (estilo.display === 'none' || estilo.visibility === 'hidden') continue
        if (!el.getBoundingClientRect().width) continue
        const fonte = parseFloat(estilo.fontSize)
        if (fonte > maiorFonte) {
          maiorFonte = fonte
          ondeEstá = (el.textContent || '').trim().slice(0, 28)
        }
      }

      let naoTexto = 0
      for (const el of secao.querySelectorAll('img, svg, video')) {
        const b = el.getBoundingClientRect()
        if (b.width && b.height) naoTexto += b.width * b.height
      }

      saida.push({
        seletor,
        altura: Math.round(caixa.height),
        maiorFonte: Math.round(maiorFonte),
        ondeEstá,
        razao: +(maiorFonte / 16).toFixed(2),
        naoTexto: +((naoTexto / area) * 100).toFixed(1),
      })
    }
    return saida
  }, SECOES)

  console.log(`\n===== ${rotulo} =====`)
  console.log(
    '  ' +
      'seção'.padEnd(13) +
      'altura'.padStart(7) +
      'maior tipo'.padStart(12) +
      'razão'.padStart(8) +
      'não-texto'.padStart(11) +
      '   veredito',
  )
  for (const l of linhas) {
    if (l.ausente) {
      console.log(`  ${l.seletor.padEnd(13)} ⚠️ SEÇÃO AUSENTE — o id sumiu do DOM`)
      reprovadas++
      continue
    }
    const passa = l.razao >= RAZAO_MINIMA || l.naoTexto >= AREA_MINIMA
    const excecao = EXCECOES[l.seletor]
    let veredito = '   ok'
    if (!passa && excecao) veredito = '   ok (exceção registrada)'
    if (!passa && !excecao) {
      veredito = '   ⚠️ REPROVA — sem escala e sem imagem'
      reprovadas++
    }
    console.log(
      '  ' +
        l.seletor.padEnd(13) +
        String(l.altura).padStart(7) +
        `${l.maiorFonte}px`.padStart(12) +
        `${l.razao}x`.padStart(8) +
        `${l.naoTexto}%`.padStart(11) +
        veredito,
    )
    console.log(`  ${''.padEnd(13)}maior tipo em: “${l.ondeEstá}”`)
    if (!passa && excecao) console.log(`  ${''.padEnd(13)}exceção: ${excecao}`)
  }

  await contexto.close()
}

console.log(
  reprovadas
    ? `\n${reprovadas} SEÇÃO(ÕES) REPROVANDO — ver os ⚠️ acima.\n` +
        'Antes de escolher o tratamento: a saída não é sempre subir o tipo. Nas\n' +
        'categorias foi escala (2,50×, zero imagem); na assessoria foi diagrama\n' +
        '(3,0%, razão baixíssima). As duas metades da régua valem igual.'
    : '\nTodas as seções passam pela régua.',
)
await navegador.close()
