'use client'

import { ArrowUp } from 'lucide-react'
import { dark, typo, font } from '../_lib/tokens'
import { cadastro, hero, form } from '../_lib/copy'
import { Section, Container, Reveal, Eyebrow, MultiLine } from './ui'

// FECHO da página — com o formulário de volta à 1ª dobra (25/07), esta seção
// deixou de hospedar o form (uma segunda instância duplicaria os eventos de
// funil) e virou o último convite: repete a promessa depois da prova social e
// devolve o lead ao card do hero (#cadastro) num toque.
export function Fecho() {
  return (
    <Section surface="dark" id="fecho" style={{ borderTop: `1px solid ${dark.hairline}` }}>
      <style>{`
        #fecho a:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px #0D0D0D, 0 0 0 4px rgba(200,169,110,0.85);
        }
      `}</style>

      <Container wide>
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-x-20">
          <Reveal>
            <Eyebrow surface="dark">{cadastro.eyebrow}</Eyebrow>
            <h2 className="mt-5" style={{ ...typo.displayLg, color: dark.text }}>
              <MultiLine text={cadastro.title} />
            </h2>
            <p className="mt-5 max-w-[520px]" style={{ ...typo.body, color: dark.body }}>
              {cadastro.lead}
            </p>
          </Reveal>

          {/* Lista com hairlines — registro de ficha, sem check-bolha. */}
          <Reveal delay={0.08}>
            <ul className="max-w-[520px]">
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

            {/* CTA de volta ao card do hero — o único caminho de conversão da
                página é o form da 1ª dobra. Rótulo curto (o do próprio botão de
                envio): a versão longa do hero quebra em duas linhas no mobile. */}
            <a
              id="fecho-cta"
              href="#cadastro"
              className="mt-8 flex w-full items-center justify-center lg:inline-flex lg:w-auto"
              style={{
                ...typo.button,
                background: dark.gold,
                color: '#0D0D0D',
                borderRadius: 0,
                minHeight: 56,
                padding: '0 28px',
                gap: 10,
                textAlign: 'center',
                lineHeight: 1.25,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <ArrowUp size={17} /> {form.submit}
            </a>
            <p
              className="mt-4 text-center lg:text-left"
              style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: dark.muted }}
            >
              {hero.ctaNote}
            </p>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
