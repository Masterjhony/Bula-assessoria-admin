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
 * Estado conhecido em 06/08/2026, depois da rodada de leveza (ficha técnica e
 * filtro sem molduras) e da subida da galeria para logo depois do formulário.
 *
 * Histórico do `primeiroCampo` no celular, que é o número que importa:
 *   1113 → antes de tudo
 *    950 → depois do carrossel de categorias
 *    763 → depois de a ficha técnica sair da frente
 *    640 → depois do reagrupamento de espaço do hero (-33) e do corte de copy
 *          do parágrafo de abertura (-90)                        ← hoje
 *    633 → o /touros, que é o análogo e a meta
 *
 * A altura total subiu em 06/08 com as fotos: primeiro a faixa antes do fecho,
 * depois a galeria que a substituiu (mobile 7297→8578, desktop 6947→8063). Foi
 * ganho ABAIXO da dobra e o `primeiroCampo` não se moveu — que é o que importa.
 *
 * ── AJUSTE DE 06/08 (rodada de leveza) ────────────────────────────────────
 * `paraQuem` e `pagina` DIMINUÍRAM, e é de propósito: o filtro perdeu os dois
 * painéis brancos (com a borda e os ~72px de padding de cada um) e os sete
 * filetes entre critérios, trocados por espaço. Menos moldura, menos altura.
 *   paraQuem  mobile 1421→1360 (-61)   desktop 1192→1084 (-108)
 *   pagina    mobile 8578→8494 (-84)   desktop 8063→7955 (-108)
 * A ficha técnica do hero também encolheu (um filete no lugar de três, número
 * de 36→26px): o hero no celular caiu de 1563 para 1541.
 *
 * ── `topoParaQuem`: A MEDIDA NOVA, e por que ela passou a existir ──────────
 * Em 06/08 o dono pediu a galeria logo depois do formulário. O `primeiroCampo`
 * não se mexe com isso (a galeria entra DEPOIS do form), mas o FILTRO desce a
 * altura inteira da galeria — e o filtro é a alavanca desta página, a seção que
 * existe para desqualificar antes de a pessoa virar lead.
 *
 *   topo de #para-quem   mobile 1563 → 2843*   desktop 1070 → 2186
 *   (*medido 2821 com o filtro já aliviado; 2843 seria sem o alívio)
 *
 * A decisão é do dono e está tomada. O número fica aqui porque, se a fila do
 * SDR voltar a encher de lead errado, este é o primeiro suspeito — e sem a
 * medida registrada ninguém liga uma coisa à outra semanas depois.
 * ⚠️ Ele NÃO reprova sozinho: subir de propósito é uma decisão de negócio.
 * Reprova quem sobe sem querer.
 *
 * ── AJUSTE DE 06/08 (3ª rodada de "está pouco visual") ────────────────────
 * O dono revisou em iPhone e repetiu a queixa pela terceira vez. As duas
 * rodadas anteriores mexeram em espaçamento e traço; esta mexeu em PROPORÇÃO,
 * que era o que a medição apontava:
 *
 *   maior vão sem NENHUMA imagem   mobile 4878 → 2671   desktop 4916 → 2439
 *   imagem sobre a área da página          16% → 19%
 *
 * O que mudou de altura, e por quê:
 *
 *   topoParaQuem  mobile 2821→2592 (-229)  desktop 2186→2042 (-144)
 *     A galeria saiu do <Container>, virou díptico edge-to-edge e passou a
 *     terminar NA foto (sem padding embaixo). ⚠️ Isto é o inverso da decisão de
 *     06/08 que desceu o filtro: o filtro SUBIU 229px sem que a galeria saísse
 *     da frente dele. É ganho puro na alavanca da página.
 *   paraQuem      mobile 1360→1374 (+14)   desktop 1084→1098 (+14)
 *     Os títulos das duas colunas saíram de rótulo mono de 12px para Oswald de
 *     20–26px. Os 14px são o preço de a seção passar a ter dois marcos visíveis
 *     em vez de nenhum.
 *   categorias    mobile 838→858 (+20)     desktop 1254→1318 (+64)
 *     O índice de cada cartão virou algarismo de 40–52px. Mesma informação, sem
 *     traço novo — é o peso visual da única seção que não pode ganhar foto.
 *   pagina        mobile 8494→8665 (+171)  desktop 7955→8526 (+571)
 *     Quase tudo é a faixa de foto que abre a jornada (293px no celular, 617px
 *     em 1440). Cresceu ABAIXO da dobra, e o `primeiroCampo` não se moveu.
 *
 * O `primeiroCampo` continua 763/399 — é o único número desta lista que não
 * podia mudar, e não mudou.
 */
const REFERENCIA = {
  'MOBILE 390': { primeiroCampo: 640, topoParaQuem: 2469, paraQuem: 1425, categorias: 858, pagina: 8592 },
  'DESKTOP 1440': { primeiroCampo: 399, topoParaQuem: 2042, paraQuem: 1098, categorias: 1318, pagina: 8487 },
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
      // Onde o FILTRO começa. Não é a altura dele — é a rolagem que a pessoa
      // precisa fazer para chegar na seção que existe para desqualificá-la.
      topoParaQuem: (() => {
        const el = document.querySelector('#para-quem')
        return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null
      })(),
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
      // Avisa, mas NÃO reprova: descer o filtro pode ser decisão de negócio
      // (foi, em 06/08). O que não pode é descer sem ninguém perceber.
      if (chave === 'topoParaQuem' && delta > 0) nota += '  ← o filtro desceu; foi de propósito?'
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
