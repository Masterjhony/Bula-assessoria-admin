import { light, typo } from '../_lib/tokens'
import { fecho } from '../_lib/copy'
import { Section, Container, Reveal, PillButton } from './ui'
import { Kicker } from './editorial'

// ─────────────────────────────────────────────────────────────────────────
// O FECHO — último convite.
//
// ⚠️ NÃO DUPLICA O FORMULÁRIO (INV-7). O botão daqui devolve para `#cadastro`,
// que é o card do hero. Duas instâncias de <LeadForm/> na mesma página
// duplicariam femeas_form_started e femeas_step_* — e o funil por passo é
// justamente o dado que vai decidir a pendência C-01 (quanto atrito o
// formulário aguenta). Um funil com o denominador dobrado decide errado.
//
// Volta ao pergaminho: a página termina clara e o rodapé fecha no near-black.
// Depois da faixa de logos (escura, em movimento), a superfície clara devolve
// silêncio para a última frase — que é a única da página que fala com quem já
// leu tudo.
//
// O wrapper #fecho-cta existe para o StickyCta: quando este botão está na tela,
// o CTA fixo do rodapé se esconde. Dois botões iguais empilhados no pé do
// celular viram ruído, e o de baixo cobre o de cima.
// ─────────────────────────────────────────────────────────────────────────
export function Fecho() {
  return (
    <Section surface="light" id="fecho">
      <Container>
        <Reveal>
          <Kicker surface="light">{fecho.eyebrow}</Kicker>

          {/* Medida curta (~22ch) e Oswald grande: sem foto, é o corpo
              tipográfico que fecha a página. */}
          <h2
            className="mt-6 max-w-[22ch]"
            style={{
              ...typo.displayLg,
              fontSize: 'clamp(29px, 4.6vw, 50px)',
              lineHeight: 1.06,
              color: light.text,
            }}
          >
            {fecho.title}
          </h2>

          <p
            className="mt-6 max-w-[56ch]"
            style={{ ...typo.body, fontSize: 'clamp(16px, 1.8vw, 18px)', lineHeight: 1.6, color: light.body }}
          >
            {fecho.lead}
          </p>

          <div id="fecho-cta" className="mt-9">
            {/* Dourado PREENCHIDO (não texto dourado sobre claro): o
                #0D0D0D sobre #A68B4B mede ~5,9:1 e passa. Texto dourado sobre
                pergaminho é que reprova — ver editorial.tsx. */}
            <PillButton href="#cadastro" surface="light">
              {fecho.cta}
            </PillButton>
            <p style={{ ...typo.body, fontSize: 15, lineHeight: 1.55, color: light.muted, marginTop: 16 }}>
              {fecho.ctaNote}
            </p>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
