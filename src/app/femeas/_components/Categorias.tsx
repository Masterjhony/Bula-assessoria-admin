import Image from 'next/image'
import { dark, typo, font } from '../_lib/tokens'
import { categorias } from '../_lib/categorias'
import { categoriasSecao } from '../_lib/copy'
import { Section, Container, Reveal } from './ui'
import { CabecalhoSecao, NumeroPasso } from './editorial'
import { CarrosselCategorias } from './CarrosselCategorias'

// ─────────────────────────────────────────────────────────────────────────
// AS SEIS PORTAS DE ENTRADA. A lista vem inteira de _lib/categorias.ts (fonte
// única, compartilhada com o campo de interesse do formulário) — duplicar aqui
// é como o /saogeraldo acabou com a mesma lista em três lugares divergindo.
//
// ⚠️ NADA DE PREÇO E NADA DE DISPONIBILIDADE. Não existe campo de preço no
// modelo, e não deve existir texto inventando um: "sob consulta" e "a definir"
// são preço inventado com outro nome — dão à pessoa a impressão de que há uma
// tabela em algum lugar, e a copy desta página diz o contrário ("o preço
// depende do projeto"). Pendência C-08.
//
// A grade é o desenho: cartões separados por filete de 1px (gap sobre fundo
// hairline), sem sombra e sem canto arredondado. Sem foto, a leitura vertical
// de cada cartão é índice → nome → o que é → para quem serve, e a repetição
// dessa estrutura seis vezes é o que dá ritmo à seção.
// ─────────────────────────────────────────────────────────────────────────

// ── ENCAIXE DE FOTO — hoje VAZIO (mapa sem nenhuma chave) ──────────────────
// Convenção de arquivo: `/femeas/categoria-<id>.webp`, onde <id> é exatamente o
// campo `id` de _lib/categorias.ts. Quando o material de 14–15/08 chegar, basta
// preencher o mapa (chave = id, valor = caminho) e cada cartão passa a abrir com
// a imagem em 4:3.
//
// Enquanto o mapa está vazio, nenhum cartão emite <Image> — sem moldura cinza,
// sem proporção reservada, sem buraco. Os seis cartões continuam com a MESMA
// altura entre si, que é o que faz a grade parecer intencional em vez de
// incompleta.
//
// ⚠️ Ou todos, ou nenhum: com duas ou três fotos, a grade vira um cartão bonito
// ao lado de cinco carentes — pior que a versão tipográfica inteira.
//
// ── O PICTOGRAMA SAIU; A FOTO CONTINUA SENDO O PLANO ──────────────────────
// Até 06/08/2026 cada cartão abria com uma marca de estágio (silhueta de matriz)
// na linha do índice. Foi removida a pedido do dono — e a medição feita antes de
// remover confirmou defeito real, não só gosto: ver o topo de ./marcas.tsx.
//
// Isso NÃO cancela a foto. O que a marca tentava dizer (o estágio do animal) é
// justamente o que a fotografia diz melhor: porte, idade, condição de pelo. O
// que fica sem representação gráfica é a CONTAGEM ("pacote 3 em 1" inclui a
// prenhez; a doadora produz embrião em série) — e isso continua morando na
// prosa do cartão, que é onde já estava.
const FOTOS: Record<string, string | undefined> = {}

export function Categorias() {
  return (
    <Section surface="dark" id="categorias">
      <style>{`
        .femeas-cat { transition: background-color .25s ease; }
        @media (hover: hover) {
          .femeas-cat:hover { background-color: ${dark.surface}; }
        }
        @media (prefers-reduced-motion: reduce) {
          .femeas-cat { transition: none; }
        }
      `}</style>

      <Container wide>
        <Reveal>
          <CabecalhoSecao
            surface="dark"
            kicker={categoriasSecao.eyebrow}
            titulo={categoriasSecao.title}
            olho={categoriasSecao.lead}
            medida="18ch"
          />
        </Reveal>

        <Reveal delay={0.06}>
          {/* 1 · 2 · 3 colunas — número FIXO por faixa, nunca `auto-fit`.
              São seis cartões: 6÷1, 6÷2 e 6÷3 fecham a última linha exata em
              todas as faixas. Com `auto-fit`, o 1440 abria quatro colunas e
              sobravam DUAS células vazias — e, como o fundo da grade é o
              filete, a sobra aparecia na tela como um painel cinza vazio.
              Medido em 1440 antes de trocar; não voltar para auto-fit.

              ⚠️ ABAIXO DE 640px esta mesma grade vira CARROSSEL horizontal, e a
              troca é toda de CSS — os seis <article> abaixo não mudam, não são
              reordenados e não saem do DOM. O gap de 1px, o fundo e a borda
              migraram do style inline para a classe `.femeas-trilha` dentro do
              CarrosselCategorias: estilo inline vence media query, e o gap
              precisa ir a zero no modo carrossel para o cartão medir exatamente
              a largura visível. Em 1440 o resultado renderizado é o mesmo de
              antes. Ver o cabeçalho de ./CarrosselCategorias.tsx. */}
          <CarrosselCategorias total={categorias.length} rotulo={categoriasSecao.title}>
            {categorias.map((c, i) => {
              const foto = FOTOS[c.id]
              return (
                <article
                  key={c.id}
                  className="femeas-cat flex flex-col"
                  style={{ background: dark.bg, padding: 'clamp(22px, 2.6vw, 30px)' }}
                >
                  {foto && (
                    <div className="relative mb-6 aspect-[4/3] w-full overflow-hidden">
                      <Image
                        src={foto}
                        alt={c.nome}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                      />
                    </div>
                  )}

                  {/* O ÍNDICE VIROU O DESENHO DO CARTÃO (06/08/2026).
                      Ele era um rótulo mono de 12px — informação correta e peso
                      visual zero. Agora é um algarismo Oswald de 40–52px, e a
                      troca resolve o problema desta seção pelo único caminho
                      que sobrou:

                      · foto não pode entrar (as seis categorias se distinguem
                        pelo ESTÁGIO do animal, e todo material existente é de
                        lote em manejo — ilustrar aqui seria informação falsa
                        numa seção que orienta compra);
                      · pictograma já foi tentado e reprovado, com defeito
                        medido de alinhamento (ver o topo de ./marcas.tsx);
                      · caixa e filete já saíram por deixarem tudo pesado.

                      O algarismo não acrescenta informação nenhuma (o número já
                      estava lá), não acrescenta um traço, e não pode
                      desalinhar: são sempre dois dígitos, à esquerda, com
                      `tabular-nums`. Seis deles na grade dão à seção um padrão
                      gráfico que antes só existia na Jornada — que é, aliás, a
                      seção que o próprio desenho da página já provava
                      funcionar. */}
                  <NumeroPasso
                    n={String(i + 1).padStart(2, '0')}
                    surface="dark"
                    tamanho="clamp(40px, 4.6vw, 52px)"
                  />

                  <h3
                    style={{
                      fontFamily: font.display,
                      fontWeight: 600,
                      fontSize: 'clamp(20px, 2.2vw, 24px)',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.1,
                      color: dark.text,
                      // 14px quando o índice era um rótulo de 12px. Com o
                      // algarismo grande, o nome precisa encostar mais nele:
                      // são a mesma unidade de leitura ("categoria 03 ·
                      // Novilhas"), e o respiro de antes agora os separaria em
                      // dois blocos.
                      marginTop: 10,
                    }}
                  >
                    {c.nome}
                  </h3>

                  <p style={{ ...typo.body, fontSize: 15.5, lineHeight: 1.6, color: dark.body, marginTop: 12 }}>
                    {c.resumo}
                  </p>

                  {/* "Para quem serve no seu projeto" — separado por filete e em
                      cinza mais forte: é a linha que a pessoa procura quando
                      está tentando se encaixar em alguma das seis.
                      `marginTop: auto` empurra o bloco para o pé do cartão, e
                      é o que faz os filetes de uma mesma linha da grade se
                      alinharem mesmo com resumos de tamanhos diferentes. */}
                  <p
                    style={{
                      ...typo.body,
                      fontSize: 15,
                      lineHeight: 1.55,
                      color: dark.muted,
                      borderTop: `1px solid ${dark.hairline}`,
                      marginTop: 'auto',
                      paddingTop: 16,
                    }}
                  >
                    {c.paraQuem}
                  </p>
                </article>
              )
            })}
          </CarrosselCategorias>
        </Reveal>

        {/* Condições comerciais — filete dourado à esquerda, do mesmo jeito que o
            aviso de análise no hero. É a única voltagem dourada da seção. */}
        <Reveal delay={0.1}>
          <p
            className="mt-[clamp(24px,3vw,36px)] max-w-[54ch]"
            style={{
              ...typo.body,
              fontSize: 15,
              lineHeight: 1.6,
              color: dark.muted,
              borderLeft: `1px solid ${dark.gold}`,
              paddingLeft: 16,
            }}
          >
            {categoriasSecao.nota}
          </p>
        </Reveal>
      </Container>
    </Section>
  )
}
