'use client'

import { dark, space, typo } from '../_lib/tokens'
import { PAGAMENTO_CATALOGO } from '../_lib/evento'
import { copyCatalogo } from '../_lib/copy-catalogo'
import { Container, Reveal } from './ui'
import { CardCatalogo, FioPontilhado, Secao, TituloSecao } from './ui-catalogo'

// ─────────────────────────────────────────────────────────────────────────
// CONDIÇÃO DE PAGAMENTO — reproduz a página 2 do catálogo.
//
// LISTA VERTICAL, não grade 2×2. O desenho de referência propunha quatro
// cards lado a lado; o catálogo impresso usa uma coluna única dentro de um
// card arredondado, com os itens separados por fio PONTILHADO. A lista é
// também a leitura certa: as quatro condições não são alternativas paralelas
// entre as quais se escolhe, são um degrau atrás do outro (mais parcelas →
// menos desconto), e coluna comunica sequência onde grade comunica menu.
// ─────────────────────────────────────────────────────────────────────────

export function Pagamento() {
  return (
    <Secao superficie="carvao">
      <Container>
        <TituloSecao eyebrow={copyCatalogo.pagamento.eyebrow}>
          {copyCatalogo.pagamento.titulo}
        </TituloSecao>

        <p
          style={{
            ...typo.eyebrow,
            color: dark.muted,
            textAlign: 'center',
            margin: `-${space.md} 0 ${space.xl}`,
          }}
        >
          {copyCatalogo.pagamento.nota}
        </p>

        <Reveal>
          <CardCatalogo style={{ maxWidth: 720, margin: '0 auto' }}>
            {/* <dl> e não <ul>: cada item é um par condição → detalhe, que é
                exatamente a semântica de lista de definição. */}
            <dl style={{ margin: 0 }}>
              {PAGAMENTO_CATALOGO.map((item, i) => (
                <div key={item.linha} style={{ textAlign: 'center' }}>
                  {i > 0 && <FioPontilhado />}
                  <dt
                    style={{
                      ...typo.condicaoValor,
                      color: dark.text,
                      margin: 0,
                    }}
                  >
                    {item.linha}
                  </dt>
                  <dd
                    style={{
                      ...typo.condicaoDetalhe,
                      color: dark.gold,
                      margin: 0,
                      marginTop: 6,
                    }}
                  >
                    {item.detalhe}
                  </dd>
                </div>
              ))}
            </dl>
          </CardCatalogo>
        </Reveal>
      </Container>
    </Secao>
  )
}
