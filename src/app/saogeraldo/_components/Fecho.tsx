'use client'

import { dark, typo, font, space } from '../_lib/tokens'
import { fecho as copy } from '../_lib/copy'
import { form } from '../_lib/copy-conversao'
import { Section, Container, Reveal, Eyebrow, MultiLine, FioDuplo } from './ui'

// FECHO — último convite, depois da prova social. Mesmo papel que na /touros:
// NÃO hospeda formulário (uma segunda instância duplicaria os eventos de funil)
// e devolve o lead ao card do hero (#cadastro) num toque.
export function Fecho() {
  return (
    <>
      {/* Fio duplo no topo, no lugar do `borderTop` de 1px que estava no
          `<Section>`: a última chamada da página é fronteira de CERIMÔNIA, e
          1px a deixava com a mesma voz de uma linha de tabela.

          Ele fica FORA do `<Section>` de propósito. Dentro, o `px-5 sm:px-8` e
          o `paddingTop` de até 144px o empurrariam para o meio da seção, e aí
          ele não marcaria fronteira nenhuma — marcaria um traço solto. Como
          irmão, ocupa exatamente a borda que o `borderTop` ocupava. O fundo vai
          no próprio fio porque o intervalo de 3px é transparente e o `<main>`
          não pinta: sem isso, a junta entre duas seções escuras abriria uma
          fresta clara. */}
      <FioDuplo style={{ background: dark.bg }} />

      <Section surface="dark" id="fecho">
        <style>{`
        #fecho a:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px #0D0D0D, 0 0 0 4px rgba(200,169,110,0.85);
        }
      `}</style>

        <Container wide>
          {/* Esta era a seção mais sufocada da página, e por acúmulo: é a que
              empilha mais texto seguido (eyebrow → título de 2 linhas → lead →
              4 linhas de lista → CTA → nota). Cada folga vinha 12,5% menor que o
              escrito, e o erro somava a cada degrau. Agora todo espaçamento
              vertical daqui sai da escala. */}
          <div
            className="grid lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-x-20"
            style={{ rowGap: space.xl }}
          >
            <Reveal>
              <Eyebrow surface="dark">{copy.eyebrow}</Eyebrow>
              <h2 style={{ ...typo.displayLg, color: dark.text, marginTop: space.md }}>
                <MultiLine text={copy.title} />
              </h2>
              <p className="max-w-[520px]" style={{ ...typo.body, color: dark.body, marginTop: space.md }}>
                {copy.lead}
              </p>
            </Reveal>
  
            {/* Lista com hairlines — registro de ficha, sem check-bolha. */}
            <Reveal delay={0.08}>
              <ul className="max-w-[520px]">
                {copy.bullets.map((b, i) => (
                  <li
                    key={b}
                    className="flex items-baseline gap-4"
                    style={{
                      // Linha de ficha: as hairlines encostam uma na outra, então
                      // o único ar entre um item e o seguinte é este padding.
                      // A 12,25px as quatro linhas liam como um bloco só.
                      paddingBlock: 'clamp(15px, 1.9vw, 20px)',
                      borderTop: i === 0 ? `1px solid ${dark.hairline}` : undefined,
                      borderBottom: `1px solid ${dark.hairline}`,
                    }}
                  >
                    <span style={{ ...typo.monoLabel, color: dark.gold }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ ...typo.body, fontSize: 'clamp(15px, 1.7vw, 17px)', color: dark.body }}>
                      {b}
                    </span>
                  </li>
                ))}
              </ul>
  
              {/* CTA de volta ao card do hero — o único caminho de conversão da
                  página é o form da 1ª dobra. Rótulo curto (o do próprio botão de
                  envio): a versão longa quebra em duas linhas no mobile.

                  SEM ÍCONE. Aqui morava um `<ArrowUp size={17} />` do
                  `lucide-react` — ícone linear flat, que é justamente o que o
                  sistema do catálogo não tem em lugar nenhum. O botão é rótulo
                  em caixa alta e só (`typo.button` já entrega o caixa alta e o
                  tracking). O `gap` saiu junto: com um filho só, não separava
                  nada. */}
              <a
                href="#cadastro"
                className="flex w-full items-center justify-center lg:inline-flex lg:w-auto"
                style={{
                  marginTop: space.xl,
                  ...typo.button,
                  background: dark.gold,
                  color: '#0D0D0D',
                  borderRadius: 0,
                  minHeight: 56,
                  padding: '0 28px',
                  textAlign: 'center',
                  lineHeight: 1.25,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {form.submit}
              </a>
              <p
                className="text-center lg:text-left"
                style={{
                  marginTop: space.md,
                  fontFamily: font.mono,
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: dark.muted,
                }}
              >
                {copy.nota}
              </p>
            </Reveal>
          </div>
        </Container>
      </Section>
    </>
  )
}
