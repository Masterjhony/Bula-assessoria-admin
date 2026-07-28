import { dark, font } from '../_lib/tokens'
import { FAIXAS, UF_POR_CODIGO } from '../_lib/frete'
import { copyCatalogo } from '../_lib/copy-catalogo'
import { PATHS_UF, TRANSFORM, VIEW_BOX } from './mapa-brasil-paths'

// ─────────────────────────────────────────────────────────────────────────
// MAPA DO BRASIL por unidade federativa.
//
// A malha é a oficial do IBGE, baixada uma vez por `scripts/gera-mapa-brasil.mjs`
// e commitada como módulo estático — a página nunca faz fetch para desenhar
// uma seção. São ~49 KB de path, contra ~90 KB de JavaScript se isto fosse
// resolvido com `d3-geo` + `topojson`, e contra um PNG que borraria em retina
// e não deixaria rotular estado por estado.
//
// ACESSIBILIDADE: o SVG é `role="img"` com título e descrição, e cada estado
// carrega um <title> que vira tooltip nativo. Mas o caminho acessível de
// verdade é a TABELA em texto que a seção renderiza abaixo — informação
// essencial não pode existir só como forma geométrica, e num telefone de
// 375px o mapa é pequeno demais para leitura confiável de qualquer maneira.
//
// Este é um Server Component: não há estado nem evento aqui, e não faz
// sentido mandar 49 KB de path para o bundle do client.
// ─────────────────────────────────────────────────────────────────────────

export function MapaBrasil() {
  return (
    <svg
      viewBox={VIEW_BOX}
      role="img"
      aria-labelledby="mapa-frete-titulo mapa-frete-desc"
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      <title id="mapa-frete-titulo">{copyCatalogo.frete.mapaTitulo}</title>
      <desc id="mapa-frete-desc">{copyCatalogo.frete.mapaDescricao}</desc>

      <g transform={TRANSFORM}>
        {PATHS_UF.map((p) => {
          const uf = UF_POR_CODIGO.get(p.codigo)
          if (!uf) return null
          const faixa = FAIXAS[uf.faixa]
          return (
            <path
              key={p.codigo}
              d={p.d}
              fill={faixa.cor}
              // O fio entre estados é o próprio carvão da seção: no catálogo
              // as divisas são vincos escuros, não linhas claras.
              stroke={dark.surface}
              // Em unidades do path (a transform reduz por 1e-4): ~1,9px num
              // mapa de 900px de largura.
              strokeWidth={900}
              strokeLinejoin="round"
            >
              <title>{`${uf.nome} — ${faixa.aria}`}</title>
            </path>
          )
        })}
      </g>

      {/* As siglas ficam FORA do <g>: as âncoras já vêm no espaço do viewBox,
          então elas não sofrem a transform de escala nem o flip vertical. */}
      {PATHS_UF.map((p) => {
        const uf = UF_POR_CODIGO.get(p.codigo)
        if (!uf || p.oculto) return null
        const faixa = FAIXAS[uf.faixa]
        return (
          <text
            key={`r-${p.codigo}`}
            x={p.rotulo.x}
            y={p.rotulo.y}
            textAnchor="middle"
            dominantBaseline="middle"
            aria-hidden
            style={{
              fontFamily: font.display,
              fontWeight: 700,
              // Unidades do viewBox: a sigla acompanha o mapa ao redimensionar.
              fontSize: p.externo ? 0.78 : 0.95,
              // Sigla fora do polígono cai sobre o carvão e usa a cor de
              // texto do tile escuro; dentro, usa a cor medida para a faixa.
              fill: p.externo ? dark.text : faixa.textoSobre,
              pointerEvents: 'none',
            }}
          >
            {uf.sigla}
          </text>
        )
      })}
    </svg>
  )
}
