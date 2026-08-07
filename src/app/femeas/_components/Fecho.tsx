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
//
// ── A SEÇÃO INTEIRA CENTRALIZADA (pedido do dono, 06/08) ──────────────────
// "Centraliza o 'quero montar meu criatório'. Centraliza a última seção
// inteira." É a segunda seção centralizada da página — a outra é a prova
// social, e as duas têm a mesma natureza: NÃO se lê linha a linha, se lê de
// uma vez. Alinhamento à esquerda é para texto que se varre (o filtro, a
// jornada, as categorias); centralizado é para bloco que se encara.
//
// ⚠️ E CENTRALIZAR COBRA MEDIDA DE LINHA. Texto centralizado perde a âncora
// vertical da margem esquerda, e o olho tem que reencontrar o começo de cada
// linha — o que só é indolor em linha curta. Por isso:
//
//   h2    22ch  (intocado, já era curto)
//   olho  56ch → 44ch, e é a única mudança de valor desta seção
//
// 44ch é o teto para prosa centralizada; acima disso a leitura em zigue-zague
// aparece. No celular a medida real já é ~38ch (a coluna é mais estreita que o
// limite), então este número só age do tablet para cima.
// ─────────────────────────────────────────────────────────────────────────
export function Fecho() {
  return (
    <Section surface="light" id="fecho">
      <Container>
        {/* `text-center` governa o texto; os dois `flex justify-center` abaixo
            governam o que é caixa (o kicker, que é uma linha com filete, e o
            botão, que é inline-flex) — `text-align` sozinho não centraliza
            nenhum dos dois. */}
        <Reveal className="text-center">
          <div className="flex justify-center">
            <Kicker surface="light">{fecho.eyebrow}</Kicker>
          </div>

          {/* Medida curta (~22ch) e Oswald grande: sem foto, é o corpo
              tipográfico que fecha a página. */}
          <h2
            className="mx-auto mt-6 max-w-[22ch]"
            style={{
              ...typo.displayLg,
              fontSize: 'clamp(29px, 4.6vw, 50px)',
              lineHeight: 1.06,
              color: light.text,
              // Sem isto a manchete centralizada quebra com uma palavra órfã na
              // última linha — num bloco centralizado a órfã fica no meio da
              // coluna, que é onde ela mais aparece.
              textWrap: 'balance',
            }}
          >
            {fecho.title}
          </h2>

          <p
            className="mx-auto mt-6 max-w-[44ch]"
            style={{
              ...typo.body,
              fontSize: 'clamp(16px, 1.8vw, 18px)',
              lineHeight: 1.6,
              color: light.body,
              // Bloco centralizado sem `balance` termina em pirâmide torta —
              // e a última linha curta, no meio da coluna, é o lugar onde a
              // órfã mais aparece. Vale para os dois parágrafos daqui.
              textWrap: 'balance',
            }}
          >
            {fecho.lead}
          </p>

          <div id="fecho-cta" className="mt-9 flex flex-col items-center">
            {/* Dourado PREENCHIDO (não texto dourado sobre claro): o
                #0D0D0D sobre #A68B4B mede ~5,9:1 e passa. Texto dourado sobre
                pergaminho é que reprova — ver editorial.tsx. */}
            <PillButton href="#cadastro" surface="light">
              {fecho.cta}
            </PillButton>
            {/* ⚠️ `balance` AQUI NÃO É REFINAMENTO — é conserto de um defeito
                medido: sem ele a nota quebrava em 329px + 67px e a palavra
                "aprovado" ficava sozinha, centralizada, como ÚLTIMA PALAVRA DA
                PÁGINA, nos dois tamanhos de tela. */}
            <p
              className="mx-auto max-w-[40ch]"
              style={{
                ...typo.body,
                fontSize: 15,
                lineHeight: 1.55,
                color: light.muted,
                marginTop: 16,
                textWrap: 'balance',
              }}
            >
              {fecho.ctaNote}
            </p>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
