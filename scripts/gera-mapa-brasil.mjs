// ─────────────────────────────────────────────────────────────────────────
// Gera `src/app/saogeraldo/_components/mapa-brasil-paths.ts` a partir da
// malha oficial do IBGE.
//
// POR QUE ISTO É UM SCRIPT E NÃO UM FETCH EM RUNTIME: a página não pode
// depender de um serviço externo para desenhar uma seção. Roda-se este script
// UMA VEZ, o resultado é commitado, e em produção o mapa é markup estático —
// sem latência, sem CORS, sem ponto de falha.
//
//   node scripts/gera-mapa-brasil.mjs
//
// Fonte: API de malhas territoriais do IBGE (domínio público, órgão oficial).
// `qualidade=minima` é a resolução mais leve que ainda desenha as fronteiras
// corretamente: 48 KB de SVG contra 98 KB do GeoJSON equivalente.
// ─────────────────────────────────────────────────────────────────────────

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const URL_IBGE =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR' +
  '?formato=image/svg+xml&qualidade=minima&intrarregiao=UF'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const SAIDA = join(RAIZ, 'src/app/saogeraldo/_components/mapa-brasil-paths.ts')

/**
 * Margem em GRAUS acrescentada à direita do viewBox do IBGE.
 *
 * A malha oficial termina exatamente na Ponta do Seixas (~-34,79°), o ponto
 * mais a leste do país, então não sobra um pixel para rotular os estados
 * pequenos do Nordeste. Esta faixa é onde as siglas de RN, PB, PE, AL e SE
 * vão morar — sobre o carvão do fundo, como no catálogo.
 */
const MARGEM_LESTE = 4.2

/**
 * Estados cujo centróide geométrico não serve como âncora de rótulo.
 *
 * `dx`/`dy` são deslocamentos em GRAUS sobre o centróide (leste e norte
 * positivos). `externo: true` significa que a sigla cai FORA do polígono, no
 * carvão — então quem a desenha usa a cor de texto sobre fundo escuro, e não
 * a cor da faixa. `oculto: true` some com a sigla.
 *
 * Quem não aparece aqui usa o centróide puro, que o acomoda bem.
 */
const AJUSTE_ROTULO = {
  '24': { dx: 2.9, dy: 0.0, externo: true }, // RN
  '25': { dx: 3.0, dy: 0.0, externo: true }, // PB
  '26': { dx: 4.3, dy: 0.0, externo: true }, // PE
  '27': { dx: 3.2, dy: 0.0, externo: true }, // AL
  '28': { dx: 3.9, dy: 0.0, externo: true }, // SE
  '32': { dx: 2.6, dy: 0.0, externo: true }, // ES
  '33': { dx: 1.6, dy: -1.3, externo: true }, // RJ
  // DF é um ponto dentro de Goiás e o catálogo NÃO o rotula — a sigla
  // colidiria com "GO". A informação dele vive na tabela equivalente.
  '53': { dx: 0.0, dy: 0.0, oculto: true },
}

/** Divide o `d` em subpaths e devolve cada um como lista de pontos absolutos. */
function subpaths(d) {
  const tokens = d.match(/[MmLlHhVvZz]|-?\d*\.?\d+/g) ?? []
  const saida = []
  let atual = null
  let x = 0
  let y = 0
  let i = 0
  let cmd = ''

  const numero = () => Number(tokens[i++])

  while (i < tokens.length) {
    const t = tokens[i]
    if (/[MmLlHhVvZz]/.test(t)) {
      cmd = t
      i++
    }
    switch (cmd) {
      case 'M':
      case 'm': {
        const nx = numero()
        const ny = numero()
        x = cmd === 'M' ? nx : x + nx
        y = cmd === 'M' ? ny : y + ny
        atual = [[x, y]]
        saida.push(atual)
        // Um par extra depois de M é tratado como lineto, conforme a spec.
        cmd = cmd === 'M' ? 'L' : 'l'
        break
      }
      case 'L':
      case 'l': {
        const nx = numero()
        const ny = numero()
        x = cmd === 'L' ? nx : x + nx
        y = cmd === 'L' ? ny : y + ny
        atual?.push([x, y])
        break
      }
      case 'H':
      case 'h': {
        const nx = numero()
        x = cmd === 'H' ? nx : x + nx
        atual?.push([x, y])
        break
      }
      case 'V':
      case 'v': {
        const ny = numero()
        y = cmd === 'V' ? ny : y + ny
        atual?.push([x, y])
        break
      }
      case 'Z':
      case 'z':
        atual = null
        break
      default:
        i++
    }
  }
  return saida.filter((p) => p.length >= 3)
}

/** Centróide de polígono por área assinada (não é a média dos vértices). */
function centroidePoligono(pontos) {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < pontos.length; i++) {
    const [x0, y0] = pontos[i]
    const [x1, y1] = pontos[(i + 1) % pontos.length]
    const cruz = x0 * y1 - x1 * y0
    area += cruz
    cx += (x0 + x1) * cruz
    cy += (y0 + y1) * cruz
  }
  area /= 2
  if (Math.abs(area) < 1e-9) return { cx: pontos[0][0], cy: pontos[0][1], area: 0 }
  return { cx: cx / (6 * area), cy: cy / (6 * area), area: Math.abs(area) }
}

const resposta = await fetch(URL_IBGE)
if (!resposta.ok) throw new Error(`IBGE respondeu ${resposta.status}`)
const svg = await resposta.text()

const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1]
const transform = svg.match(/<g[^>]*transform="([^"]+)"/)?.[1]
if (!viewBox || !transform) throw new Error('viewBox ou transform não encontrados no SVG do IBGE')

const escala = transform.match(/scale\(([-\d.]+),\s*([-\d.]+)\)/)
const [, sx, sy] = escala ? escala.map(Number) : [0, 1, 1]

const paths = [...svg.matchAll(/<path id="(\d{2})" d="([^"]+)"/g)]
if (paths.length !== 27) throw new Error(`esperava 27 UFs, o IBGE devolveu ${paths.length}`)

const registros = paths.map(([, codigo, d]) => {
  const partes = subpaths(d)
  const maior = partes
    .map(centroidePoligono)
    .reduce((a, b) => (b.area > a.area ? b : a), { area: -1, cx: 0, cy: 0 })
  const ajuste = AJUSTE_ROTULO[codigo] ?? { dx: 0, dy: 0 }
  // Aplica a transform do <g> para levar o centróide ao espaço do viewBox.
  const rx = maior.cx * sx + ajuste.dx
  const ry = maior.cy * sy - ajuste.dy // sy já é negativo: norte é -y
  return {
    codigo,
    d,
    rx: Number(rx.toFixed(4)),
    ry: Number(ry.toFixed(4)),
    externo: ajuste.externo === true,
    oculto: ajuste.oculto === true,
  }
})

// viewBox alargado a leste para caber as siglas do Nordeste.
const [vbX, vbY, vbL, vbA] = viewBox.split(/\s+/).map(Number)
const viewBoxFinal = `${vbX} ${vbY} ${Number((vbL + MARGEM_LESTE).toFixed(4))} ${vbA}`

const arquivo = `// GERADO POR scripts/gera-mapa-brasil.mjs — NÃO EDITAR À MÃO.
//
// Malha das 27 unidades federativas, da API de malhas territoriais do IBGE
// (domínio público). Para regerar: \`node scripts/gera-mapa-brasil.mjs\`.
//
// \`rotulo\` é o centróide por área do MAIOR polígono de cada UF, já no espaço
// do viewBox, com os ajustes manuais dos estados pequenos aplicados. Serve de
// âncora para a sigla; não é dado geográfico.
//
// \`externo\` = a sigla cai fora do polígono, sobre o fundo carvão: quem
// desenha usa a cor de texto do tile escuro, não a cor da faixa.
// \`oculto\`  = não rotular (só o DF, que o catálogo também não rotula).

export const VIEW_BOX = '${viewBoxFinal}'
export const TRANSFORM = '${transform}'

export type PathUf = {
  codigo: string
  d: string
  rotulo: { x: number; y: number }
  externo: boolean
  oculto: boolean
}

export const PATHS_UF: readonly PathUf[] = [
${registros
  .map(
    (r) =>
      `  { codigo: '${r.codigo}', rotulo: { x: ${r.rx}, y: ${r.ry} },` +
      ` externo: ${r.externo}, oculto: ${r.oculto}, d: '${r.d}' },`,
  )
  .join('\n')}
] as const
`

await writeFile(SAIDA, arquivo, 'utf8')
const kb = (Buffer.byteLength(arquivo) / 1024).toFixed(1)
const rotulados = registros.filter((r) => !r.oculto).length
console.log(
  `${SAIDA}\n  ${registros.length} UFs · ${rotulados} rotuladas · ${kb} KB\n  viewBox ${viewBoxFinal}`,
)
