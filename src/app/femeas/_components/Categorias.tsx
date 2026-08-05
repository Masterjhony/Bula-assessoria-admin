import Image from 'next/image'
import { dark, typo, font } from '../_lib/tokens'
import { categorias } from '../_lib/categorias'
import { categoriasSecao } from '../_lib/copy'
import { Section, Container, Reveal } from './ui'
import { CabecalhoSecao, Indice } from './editorial'

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
              Medido em 1440 antes de trocar; não voltar para auto-fit. */}
          <div
            className="mt-[clamp(36px,5vw,64px)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            style={{
              // gap de 1px sobre fundo hairline: as "bordas" da grade são o
              // próprio espaço entre cartões. Um filete só entre vizinhos,
              // nunca dois grudados.
              gap: 1,
              background: dark.hairline,
              border: `1px solid ${dark.hairline}`,
            }}
          >
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

                  <Indice n={String(i + 1).padStart(2, '0')} surface="dark" />

                  <h3
                    style={{
                      fontFamily: font.display,
                      fontWeight: 600,
                      fontSize: 'clamp(20px, 2.2vw, 24px)',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.1,
                      color: dark.text,
                      marginTop: 14,
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
          </div>
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
