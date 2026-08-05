import { light, typo, font } from '../_lib/tokens'
import { jornada } from '../_lib/copy'
import { Section, Container, Reveal } from './ui'
import { CabecalhoSecao, NumeroPasso } from './editorial'

// ─────────────────────────────────────────────────────────────────────────
// A JORNADA — o que acontece DEPOIS de enviar o cadastro.
//
// Esta seção parece informativa e não é: ela é operacional. O destino deste
// funil é uma REUNIÃO agendada, não um número de WhatsApp, e quem chega à
// reunião sem saber que ia haver reunião não aparece. Sem esta seção o no-show
// sobe — e no-show é o KPI da página indo embora depois de já ter sido pago.
//
// Desenho: quatro painéis empilhados, separados por filete de 1px (mesmo
// vocabulário da grade de categorias). O passo 03 recebe fundo dourado a 10% e
// uma barra dourada à esquerda porque é ele que a copy chama de diferencial —
// e a decisão de QUAL passo destacar mora em _lib/copy.ts (`destaque: true`),
// não neste arquivo. Reordenar os passos lá move o destaque junto.
// ─────────────────────────────────────────────────────────────────────────
export function Jornada() {
  return (
    <Section surface="light" id="jornada">
      <Container>
        <Reveal>
          <CabecalhoSecao
            surface="light"
            kicker={jornada.eyebrow}
            titulo={jornada.title}
            olho={jornada.lead}
            medida="20ch"
          />
        </Reveal>

        <Reveal delay={0.06}>
          <ol
            className="grid"
            style={{
              gap: 1,
              background: light.hairline,
              border: `1px solid ${light.hairline}`,
              listStyle: 'none',
              padding: 0,
              margin: 'clamp(36px,5vw,60px) 0 0',
            }}
          >
            {jornada.passos.map((p) => (
              <li
                key={p.n}
                className="grid grid-cols-[clamp(46px,6vw,74px)_1fr] gap-x-4 sm:gap-x-7"
                style={{
                  // Creme OPACO, não rgba. Duas correções medidas aqui:
                  //  1. `light.goldDim` (10% do dourado escuro) sobre branco lê
                  //     como cinza-quente — o destaque simplesmente sumia.
                  //  2. a versão translúcida deste creme deixava passar o filete
                  //     de fundo da lista (preto a 14%) e o painel ficava mais
                  //     ESCURO que os vizinhos brancos: destaque virava sombra.
                  // #F3ECDF é o dourado vivo da marca (#C8A96E) a 22% já
                  // resolvido sobre branco. Contraste do corpo sobre ele: 7,2:1.
                  background: p.destaque ? '#F3ECDF' : light.surface,
                  padding: 'clamp(22px, 2.8vw, 32px)',
                  // A barra dourada é a marcação do passo em destaque. Fica
                  // dentro do painel (box-shadow inset) para não brigar com o
                  // filete de 1px que separa os painéis.
                  boxShadow: p.destaque ? `inset 3px 0 0 0 ${light.goldText}` : undefined,
                }}
              >
                <NumeroPasso n={p.n} surface="light" />
                <div>
                  <h3
                    style={{
                      fontFamily: font.display,
                      fontWeight: 600,
                      fontSize: 'clamp(19px, 2vw, 23px)',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.15,
                      color: light.text,
                    }}
                  >
                    {p.titulo}
                  </h3>
                  <p
                    style={{
                      ...typo.body,
                      fontSize: 16,
                      lineHeight: 1.6,
                      color: light.body,
                      marginTop: 10,
                      maxWidth: '56ch',
                    }}
                  >
                    {p.texto}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>
      </Container>
    </Section>
  )
}
