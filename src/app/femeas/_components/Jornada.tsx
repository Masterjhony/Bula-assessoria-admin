import { light, typo, font } from '../_lib/tokens'
import { jornada } from '../_lib/copy'
import { Section, Container, Reveal } from './ui'
import { CabecalhoSecao, NumeroPasso } from './editorial'
import { FaixaFoto } from './FaixaFoto'
import { TrilhoJornada, JORNADA_PADDING, JORNADA_COLUNA, JORNADA_NUMERO } from './marcas'

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
//
// ── A FAIXA DE FOTO QUE ABRE A SEÇÃO (06/08/2026) ─────────────────────────
// Ela não ilustra a jornada e não tem legenda: está aqui por MEDIDA. Antes
// desta rodada, filtro → categorias → jornada → assessoria somavam ~4.700px de
// texto seguido no celular sem uma única âncora visual, e o meio geométrico
// desse trecho cai exatamente no encontro entre categorias e jornada. Com a
// faixa aqui, o trecho vira dois de ~2.300px.
//
// ⚠️ ELA ESTÁ DENTRO DESTA SEÇÃO, E NÃO SOLTA ENTRE AS DUAS, por dois motivos:
//   1. o medidor de densidade lê por seção (`#jornada`, `#categorias`…). Faixa
//      solta entre seções não é contada por ninguém — a foto apareceria na tela
//      e sumiria do número que a justifica.
//   2. ela pertence ao lado CLARO da emenda. Vindo depois do near-black das
//      categorias, a própria borda de cima da foto é o divisor, e por isso a
//      seção zera o `paddingTop`: não há faixa de pergaminho antes da imagem.
//
// ⚠️ NÃO PÔR A FAIXA NAS CATEGORIAS. Aquela seção existe para a pessoa escolher
// por onde entrar no plantel, e as seis categorias se distinguem pelo ESTÁGIO
// do animal (embrião, bezerra, novilha, prenhe, 3 em 1, doadora). Toda foto que
// existe hoje é de lote em manejo e não distingue bezerra de novilha: ali a
// imagem seria informação falsa numa seção que orienta decisão de compra. O
// peso visual das categorias veio da escala tipográfica — ver Categorias.tsx.
// ─────────────────────────────────────────────────────────────────────────
export function Jornada() {
  return (
    <Section surface="light" id="jornada" style={{ paddingTop: 0 }}>
      {/* Fora do <Container> (o full-bleed depende disso) e sem <Reveal/>: a
          faixa é o divisor entre duas seções, e divisor que entra com fade lê
          como a página se ajeitando depois de carregada.
          O corte é largo no desktop e quase quadrado no celular; `posicao`
          puxa o enquadramento para cima porque o assunto da foto é a cabeça dos
          dois animais, e um corte 16/7 centrado passa na altura do focinho. */}
      <FaixaFoto
        src={jornada.foto.src}
        alt={jornada.foto.alt}
        className="aspect-[4/3] sm:aspect-[16/7]"
        posicao="50% 38%"
      />

      <Container className="mt-[clamp(56px,8vw,104px)]">
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
          {/* Envelope só para ancorar o trilho, e as duas razões são chatas o
              bastante para estarem escritas:
                1. <div> não é filho válido de <ol> — só <li>. O trilho fica FORA
                   da lista, e a lista continua com quatro itens exatos na árvore
                   de acessibilidade.
                2. a margem de cima migrou da <ol> para cá. Ficando na <ol>, ela
                   colapsaria através deste envelope, e aí o `bottom: 0` do
                   trilho passaria a medir a partir de um lugar que depende de
                   colapso de margem — o tipo de coisa que funciona até alguém
                   pôr um padding aqui. */}
          <div style={{ position: 'relative', marginTop: 'clamp(36px,5vw,60px)' }}>
            <ol
              className="grid"
              style={{
                gap: 1,
                background: light.hairline,
                border: `1px solid ${light.hairline}`,
                listStyle: 'none',
                padding: 0,
                margin: 0,
              }}
            >
              {jornada.passos.map((p) => (
                <li
                  key={p.n}
                  // ⚠️ O padding do painel e a largura da coluna do número são as
                  // MESMAS medidas que o trilho usa para se alinhar — por isso
                  // vêm das constantes de marcas.tsx, em vez de ficarem escritas
                  // em dois lugares. Mudar uma sem a outra tira a linha do centro
                  // dos números, que é o efeito inteiro.
                  className="grid gap-x-4 sm:gap-x-7"
                  style={{
                    gridTemplateColumns: `${JORNADA_COLUNA} 1fr`,
                    // Creme OPACO, não rgba. Duas correções medidas aqui:
                    //  1. `light.goldDim` (10% do dourado escuro) sobre branco
                    //     lê como cinza-quente — o destaque simplesmente sumia.
                    //  2. a versão translúcida deste creme deixava passar o
                    //     filete de fundo da lista (preto a 14%) e o painel
                    //     ficava mais ESCURO que os vizinhos brancos: destaque
                    //     virava sombra.
                    // #F3ECDF é o dourado vivo da marca (#C8A96E) a 22% já
                    // resolvido sobre branco. Contraste do corpo sobre ele: 7,2:1.
                    background: p.destaque ? '#F3ECDF' : light.surface,
                    padding: JORNADA_PADDING,
                    // A barra dourada é a marcação do passo em destaque. Fica
                    // dentro do painel (box-shadow inset) para não brigar com o
                    // filete de 1px que separa os painéis.
                    boxShadow: p.destaque ? `inset 3px 0 0 0 ${light.goldText}` : undefined,
                  }}
                >
                  {/* O número agora é CENTRADO na coluna (antes encostava à
                      esquerda). Não é preferência: o trilho corre no centro
                      geométrico desta coluna, e número à esquerda faria a linha
                      passar por fora do "01" em vez de atravessá-lo. Como os
                      quatro rótulos têm dois dígitos, centrar não desalinha nada
                      entre si.

                      O `z-index: 1` + fundo é a MÁSCARA do trilho, e é ela que
                      transforma "uma linha cortando os números" em "os números
                      pousados na linha". Sem isso o filete passa por cima do
                      algarismo (o trilho é posicionado; o número, não) e lê como
                      defeito de renderização.

                      Os 10px de padding com margem negativa de mesmo valor abrem
                      o respiro entre o filete e o algarismo SEM mexer na altura:
                      se virasse padding puro, o número desceria e desalinharia do
                      título ao lado. */}
                  <div
                    style={{
                      textAlign: 'center',
                      position: 'relative',
                      zIndex: 1,
                      background: p.destaque ? '#F3ECDF' : light.surface,
                      paddingBlock: 10,
                      marginBlock: -10,
                      // ⚠️ SEM ISTO A SEÇÃO INTEIRA PERDE O SENTIDO, e o modo de
                      // falhar é silencioso. Item de grid estica na altura da
                      // linha por padrão (`align-items: stretch`), então este
                      // fundo opaco — que existe só para abrir o vão em torno do
                      // algarismo — passava a mascarar o trilho no painel
                      // INTEIRO. Sobrava apenas o trecho que corre no respiro de
                      // baixo do painel: quatro tocos soltos, que leem como
                      // defeito de renderização em vez de percurso.
                      // `start` prende a máscara ao tamanho do número.
                      alignSelf: 'start',
                    }}
                  >
                    {/* O tamanho vem de `JORNADA_NUMERO`, e não do padrão do
                        componente, porque é ESSA constante que o trilho usa
                        para achar o meio do algarismo. Deixar os dois valores
                        soltos em arquivos diferentes é como a linha sai do
                        centro do "01" sem ninguém entender por quê. */}
                    <NumeroPasso n={p.n} surface="light" tamanho={JORNADA_NUMERO} />
                  </div>
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

            {/* ⚠️ TEM QUE VIR DEPOIS DA <ol>. Os <li> têm fundo opaco (branco, e
                creme no passo em destaque) e são elementos NÃO posicionados;
                elemento posicionado pinta numa camada acima deles. Movido para
                antes da lista, o trilho continua no DOM e some da tela — sem
                erro, sem aviso no console, e ninguém descobre. */}
            <TrilhoJornada />
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
