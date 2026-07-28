'use client'

import { dark, radius, space, typo } from '../_lib/tokens'
import { FAIXAS, NOTA_ASTERISCO, UFS_POR_FAIXA, type FaixaFrete } from '../_lib/frete'
import { copyCatalogo } from '../_lib/copy-catalogo'
import { Container, Reveal } from './ui'
import { CardCatalogo, Secao, TituloSecao } from './ui-catalogo'
import { MapaBrasil } from './MapaBrasil'

// ─────────────────────────────────────────────────────────────────────────
// CONDIÇÃO DE FRETE — reproduz a página 3 do catálogo.
//
// Esta seção foi CORTADA do escopo em 27/07 e REPOSTA em 28/07 por decisão do
// cliente. O motivo do corte original continua válido como regra de redação:
// "frete grátis" sozinho seria claim falso, porque há região sob consulta e
// região sem entrega. Por isso as quatro faixas aparecem com o mesmo peso, e
// a que nega a entrega não fica escondida.
//
// CORES DO TEXTO DA LEGENDA, medidas sobre o carvão #2B1F13:
//   #B59C74 .... 6,09:1  AA
//   #8EA094 .... 5,81:1  AA
//   #999999 .... 5,63:1  AA
//   #816852 .... 3,08:1  AA-large — só porque a linha é Oswald 700 com piso
//                de 20px, o que a qualifica como texto grande.
// A linha DE BAIXO de cada item vai em creme, não na cor da faixa: a 12px o
// #816852 reprovaria. E é o que o catálogo faz — lá o subtítulo é branco.
// ─────────────────────────────────────────────────────────────────────────

const ORDEM: FaixaFrete[] = ['gratis', 'gratis2lotes', 'consulta', 'semEntrega']

function ItemLegenda({ chave }: { chave: FaixaFrete }) {
  const faixa = FAIXAS[chave]
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: space.sm, listStyle: 'none' }}>
      {/* A cápsula de cor. No catálogo ela nasce fora da página e só a metade
          direita aparece; aqui ela é uma barra fechada — sangrar o card para
          fora numa tela de 375px custaria rolagem horizontal.
          Ela é mais LARGA que alta de propósito: no impresso é uma cápsula
          deitada, e com largura igual à altura o raio de pílula a transforma
          num círculo, que é outro objeto. */}
      <span
        aria-hidden
        style={{
          flex: '0 0 auto',
          width: 'clamp(46px, 7vw, 76px)',
          height: 'clamp(32px, 4.6vw, 46px)',
          background: faixa.cor,
          borderRadius: radius.pill,
        }}
      />
      <span>
        <span
          style={{
            ...typo.legendaFrete,
            fontSize: 'clamp(20px, 3.2vw, 30px)',
            // `textoLegenda`, não `cor`: sobre o card translúcido a tinta da
            // faixa marrom mede 2,89:1 e reprova até como texto grande. A
            // cápsula ao lado guarda a tinta exata do catálogo.
            color: faixa.textoLegenda,
            display: 'block',
          }}
        >
          {faixa.rotulo}
        </span>
        {faixa.detalhe && (
          <span
            style={{
              ...typo.legendaFreteSub,
              color: dark.body,
              display: 'block',
              marginTop: 2,
            }}
          >
            {faixa.detalhe}
          </span>
        )}
      </span>
    </li>
  )
}

export function Frete() {
  return (
    <Secao superficie="carvao">
      <Container wide>
        <TituloSecao eyebrow={copyCatalogo.frete.eyebrow}>{copyCatalogo.frete.titulo}</TituloSecao>

        <Reveal>
          <CardCatalogo>
            {/* Mobile empilha; no `lg` o mapa fica à esquerda e a legenda à
                direita, como na diagramação do catálogo. As colunas vêm por
                CLASSE e não por `style` inline de propósito: media query não
                existe em estilo inline, e misturar os dois obrigaria a um
                `!important` para a classe vencer. */}
            <div
              className="grid grid-cols-1 items-center lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
              style={{ gap: space.xl }}
            >
              <MapaBrasil />

              <div>
                <ul style={{ display: 'grid', gap: space.md, margin: 0, padding: 0 }}>
                  {ORDEM.map((chave) => (
                    <ItemLegenda key={chave} chave={chave} />
                  ))}
                </ul>

                <p
                  style={{
                    ...typo.fichaRotulo,
                    color: dark.muted,
                    marginTop: space.lg,
                    letterSpacing: '0.08em',
                  }}
                >
                  {NOTA_ASTERISCO}
                </p>
              </div>
            </div>

            {/* TABELA EQUIVALENTE. Não é um extra de acessibilidade — é o
                caminho de leitura para quem usa leitor de tela e para quem
                está num telefone onde o mapa fica pequeno demais. Vem fechada
                para não competir com a leitura visual de quem enxerga o mapa. */}
            <details style={{ marginTop: space.xl }}>
              <summary
                style={{
                  ...typo.eyebrow,
                  color: dark.gold,
                  cursor: 'pointer',
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {copyCatalogo.frete.tabelaResumo}
              </summary>

              <table
                style={{
                  width: '100%',
                  marginTop: space.md,
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                }}
              >
                <thead>
                  <tr>
                    <th
                      scope="col"
                      style={{
                        ...typo.fichaRotulo,
                        color: dark.muted,
                        padding: `${space.xs} 0`,
                        borderBottom: `1px solid ${dark.hairline}`,
                      }}
                    >
                      {copyCatalogo.frete.colunaFaixa}
                    </th>
                    <th
                      scope="col"
                      style={{
                        ...typo.fichaRotulo,
                        color: dark.muted,
                        padding: `${space.xs} 0`,
                        borderBottom: `1px solid ${dark.hairline}`,
                      }}
                    >
                      {copyCatalogo.frete.colunaEstados}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ORDEM.map((chave) => {
                    const faixa = FAIXAS[chave]
                    const ufs = UFS_POR_FAIXA(chave)
                    return (
                      <tr key={chave}>
                        <th
                          scope="row"
                          style={{
                            ...typo.body,
                            fontSize: 14,
                            fontWeight: 600,
                            color: dark.text,
                            padding: `${space.sm} ${space.md} ${space.sm} 0`,
                            borderBottom: `1px solid ${dark.hairline}`,
                            verticalAlign: 'top',
                            textAlign: 'left',
                          }}
                        >
                          {faixa.rotulo}
                          {faixa.detalhe ? ` — ${faixa.detalhe.toLowerCase()}` : ''}
                        </th>
                        <td
                          style={{
                            ...typo.body,
                            fontSize: 14,
                            color: dark.body,
                            padding: `${space.sm} 0`,
                            borderBottom: `1px solid ${dark.hairline}`,
                            verticalAlign: 'top',
                          }}
                        >
                          {ufs.map((uf) => uf.nome).join(', ')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </details>
          </CardCatalogo>
        </Reveal>
      </Container>
    </Secao>
  )
}
