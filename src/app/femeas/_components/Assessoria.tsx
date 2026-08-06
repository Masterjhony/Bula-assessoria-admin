import { dark, typo, font } from '../_lib/tokens'
import { assessoria } from '../_lib/copy'
import { Section, Container, Reveal } from './ui'
import { CabecalhoSecao } from './editorial'
import { MarcaServico } from './marcas'

// ─────────────────────────────────────────────────────────────────────────
// O QUE VEM JUNTO — o serviço que acompanha a compra.
//
// Vem logo depois da jornada de propósito: a jornada termina na reunião, e a
// primeira pergunta de quem entendeu a jornada é "e depois que eu comprar?".
//
// Superfície: near-black um tom ACIMA do fundo padrão (#141414 contra #0D0D0D).
// É o terceiro registro de superfície da página — pergaminho, near-black e este
// — e serve para separar este bloco da faixa de logos que vem em seguida sem
// jogar mais um pergaminho no meio. A troca de tom é o divisor; não há faixa
// colorida nem borda grossa em lugar nenhum desta página.
//
// ⚠️ Um dos quatro itens (acasalamento) tem pendência de ENTREGA, não de texto —
// João Antônio (05/08) elogiou a promessa e alertou que ela exige equipe técnica
// no volume que a campanha trouxer. O aviso está no comentário de
// `assessoria.itens` em _lib/copy.ts, que é onde a decisão de suavizar seria
// tomada. Este componente não sabe nada sobre isso e não deve saber.
// ─────────────────────────────────────────────────────────────────────────
export function Assessoria() {
  return (
    <Section surface="dark" id="assessoria" style={{ background: dark.surface }}>
      <Container>
        <Reveal>
          <CabecalhoSecao
            surface="dark"
            kicker={assessoria.eyebrow}
            titulo={assessoria.title}
            olho={assessoria.lead}
            medida="16ch"
          />
        </Reveal>

        <Reveal delay={0.06}>
          {/* DUAS colunas no desktop, não `auto-fit`. São quatro itens: 4÷2
              fecha 2×2 exato. Com auto-fit o 1440 abria três colunas e o quarto
              item ficava sozinho numa linha só para ele — medido antes de
              trocar. Quatro itens nunca devem cair numa grade de três. */}
          <div className="mt-[clamp(36px,5vw,64px)] grid grid-cols-1 gap-x-[clamp(28px,4vw,72px)] gap-y-[clamp(30px,4vw,52px)] sm:grid-cols-2">
            {assessoria.itens.map((i) => (
              <div key={i.id}>
                {/* Aqui havia um filete dourado de 34×2 — o MESMO nos quatro
                    itens. Quatro aberturas idênticas para quatro serviços
                    diferentes: a seção prometia "o que vem junto" e entregava
                    quatro parágrafos que só se distinguiam depois de lidos.
                    A marca substitui o filete (não se soma a ele), então o item
                    cresce só a diferença entre 2px e ~36px de altura. */}
                <MarcaServico id={i.id} />
                <h3
                  style={{
                    fontFamily: font.display,
                    fontWeight: 600,
                    fontSize: 'clamp(18px, 1.9vw, 21px)',
                    letterSpacing: '-0.01em',
                    lineHeight: 1.15,
                    color: dark.text,
                    marginTop: 16,
                  }}
                >
                  {i.titulo}
                </h3>
                <p style={{ ...typo.body, fontSize: 15.5, lineHeight: 1.6, color: dark.body, marginTop: 10, maxWidth: '42ch' }}>
                  {i.texto}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
