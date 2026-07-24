'use client'

import { dark, typo } from '../_lib/tokens'
import { cadastro } from '../_lib/copy'
import { Section, Container, Reveal, Eyebrow, MultiLine } from './ui'
import { LeadForm } from './Formulario'

// Seção de CADASTRO — fecho da página (revisão do cliente 24/07): o formulário
// saiu da 1ª dobra e virou o último passo, depois de o lead ver o processo, o
// ensaio no curral e a prova social. Tile ESCURO, para emendar no footer.
//
// O id="cadastro" mora aqui: é o alvo do CTA do hero, do StickyCta e do
// scrollIntoView entre passos do próprio form.
export function Cadastro() {
  return (
    <Section surface="dark" id="cadastro" style={{ borderTop: `1px solid ${dark.hairline}` }}>
      {/* Anel de foco visível (WCAG 2.4.7) — cantos retos combinam c/ inputs. */}
      <style>{`
        #cadastro input:focus-visible,
        #cadastro select:focus-visible,
        #cadastro button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px #0D0D0D, 0 0 0 4px rgba(200,169,110,0.85);
        }
        #cadastro ::placeholder { color: #8A8A8A; opacity: 1; }
      `}</style>

      <Container wide>
        <div className="grid gap-10 lg:grid-cols-[1fr_minmax(420px,500px)] lg:items-center lg:gap-x-20">
          {/* Convite — repete a promessa no momento da decisão. */}
          <Reveal>
            <Eyebrow surface="dark">{cadastro.eyebrow}</Eyebrow>
            <h2 className="mt-5" style={{ ...typo.displayLg, color: dark.text }}>
              <MultiLine text={cadastro.title} />
            </h2>
            <p className="mt-5 max-w-[520px]" style={{ ...typo.body, color: dark.body }}>
              {cadastro.lead}
            </p>

            {/* Lista com hairlines — registro de ficha, sem check-bolha. */}
            <ul className="mt-8 max-w-[520px]">
              {cadastro.bullets.map((b, i) => (
                <li
                  key={b}
                  className="flex items-baseline gap-4 py-3.5"
                  style={{ borderTop: i === 0 ? `1px solid ${dark.hairline}` : undefined, borderBottom: `1px solid ${dark.hairline}` }}
                >
                  <span style={{ ...typo.monoLabel, color: dark.gold }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ ...typo.body, fontSize: 'clamp(15px, 1.7vw, 17px)', color: dark.body }}>{b}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          {/* Card do form multi-step — lógica intocada (multi-step, validação,
              IBGE, UTM, tracking, event_id, is_mql). */}
          <Reveal delay={0.08} className="lg:self-center">
            <LeadForm />
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
