import Image from 'next/image'
import { dark, typo } from '../_lib/tokens'
import { provaSocial } from '../_lib/copy'
import { Section, Container, Reveal } from './ui'

// ─────────────────────────────────────────────────────────────────────────
// PROVA SOCIAL — faixa de logos em movimento contínuo.
//
// Fork do /touros com os valores de calibragem COPIADOS, não recalculados.
// `scale` equaliza a MASSA visual dos PNGs: altura fixa não funciona porque as
// proporções e o padding embutido de cada arquivo são muito diferentes
// (emblema quadrado ~1:1 parece minúsculo ao lado de um wordmark ~5:1).
// `detail: true` = emblema com desenho interno (Camparino, Jacamim): o branco
// chapado viraria um bloco sem leitura, então inverte preservando o detalhe.
//
// ⚠️ NÃO RECALIBRAR. Esse ajuste foi feito no olho, arquivo por arquivo, e já
// foi pago uma vez. Mexer em um `scale` sem ver a faixa inteira em movimento
// desequilibra a fileira toda.
//
// O QUE MUDA EM RELAÇÃO AO /touros é a FRASE, e a diferença é a razão de a
// seção existir aqui: lá a prova é "+1.000 touros PO apartados", que para este
// público é fraca ou irrelevante — quem quer montar criatório quer ver criatório
// formado, não animal apartado. A frase qualitativa vive em _lib/copy.ts e não
// inventa nenhum número enquanto a pendência C-07 não fechar.
//
// Os nomes das fazendas ficam AQUI e não em copy.ts de propósito: cada um é o
// texto alternativo de um arquivo específico em /criatorios, e separar o alt do
// `src` é como um deles vira legenda de outro logo num refactor.
const CRIATORIOS: { src: string; alt: string; scale: number; detail?: boolean }[] = [
  { src: '/criatorios/nelore-jmp.png', alt: 'Nelore JMP', scale: 0.82 },
  { src: '/criatorios/terra-brava-agropecuaria.png', alt: 'Terra Brava Agropecuária', scale: 0.95 },
  { src: '/criatorios/fazenda-camparino.png', alt: 'Fazenda Camparino', scale: 1.14, detail: true },
  { src: '/criatorios/nelore-katayama.png', alt: 'Nelore Katayama', scale: 1.15 },
  { src: '/criatorios/nelore-santa-nazare.png', alt: 'Nelore Santa Nazaré', scale: 1.0 },
  { src: '/criatorios/nelore-cachoeirao.png', alt: 'Nelore Cachoeirão', scale: 0.8 },
  { src: '/criatorios/fazenda-jacamim.png', alt: 'Fazenda Jacamim', scale: 1.12, detail: true },
  { src: '/criatorios/ls-agropecuaria.png', alt: 'LS Agropecuária', scale: 1.05 },
  { src: '/criatorios/nelore-tresmar.png', alt: 'Nelore Tresmar', scale: 1.18 },
  { src: '/criatorios/santa-nice.png', alt: 'Santa Nice', scale: 1.0 },
]

export function ProvaSocial() {
  return (
    <Section
      surface="dark"
      id="prova"
      style={{ paddingTop: 'clamp(64px, 9vw, 104px)', paddingBottom: 'clamp(64px, 9vw, 104px)' }}
    >
      <Container wide>
        <Reveal>
          {/* Centralizado — é o único bloco centralizado da página, e é o que
              faz a faixa parecer um selo em vez de mais uma seção de texto.
              O textIndent recentra opticamente o espaço-fantasma do tracking. */}
          <p
            className="mx-auto max-w-[460px] text-center"
            style={{ ...typo.eyebrow, color: dark.gold, textIndent: '0.22em' }}
          >
            {provaSocial.eyebrow}
          </p>
          <p
            className="mx-auto mt-5 max-w-[700px] text-center"
            style={{
              ...typo.displayLg,
              fontSize: 'clamp(22px, 3vw, 34px)',
              lineHeight: 1.15,
              color: dark.text,
              // Sem isto a última linha ficava com uma palavra só, no meio de
              // um bloco centralizado — o lugar onde a órfã mais aparece.
              textWrap: 'balance',
            }}
          >
            {provaSocial.title}
          </p>
        </Reveal>
      </Container>

      {/* Faixa full-bleed: a lista duplicada roda em loop; -50% de translateX é
          exatamente uma cópia, então a emenda é invisível. A segunda cópia é
          aria-hidden — para o leitor de tela a lista aparece uma vez só. */}
      <Reveal delay={0.06}>
        <div
          className="relative -mx-5 mt-12 overflow-hidden sm:-mx-8"
          style={{ ['--logo-h' as string]: 'clamp(34px, 4.5vw, 46px)' }}
          role="group"
          aria-label={provaSocial.faixaLabel}
        >
          <style>{`
            @keyframes femeas-marquee {
              from { transform: translateX(0); }
              to { transform: translateX(-50%); }
            }
            /* Reduced motion: sem marquee — vira grade centralizada com wrap.
               A faixa estática cortada na borda leria como bug, não como pausa.
               Esconde a cópia duplicada, que só existe para o loop. */
            @media (prefers-reduced-motion: reduce) {
              .femeas-marquee { animation: none !important; width: 100%; }
              .femeas-marquee > div { flex-wrap: wrap; justify-content: center; width: 100%; row-gap: 18px; }
              .femeas-marquee > div[aria-hidden="true"] { display: none; }
            }
          `}</style>
          <div
            className="femeas-marquee flex w-max items-center"
            style={{ animation: 'femeas-marquee 38s linear infinite' }}
          >
            {[0, 1].map((dup) => (
              <div key={dup} aria-hidden={dup === 1} className="flex items-center">
                {CRIATORIOS.map((c) => (
                  <div
                    key={c.src}
                    className="flex items-center justify-center"
                    style={{ height: 'calc(var(--logo-h) * 1.6)', paddingInline: 'clamp(22px, 3.2vw, 44px)' }}
                  >
                    <Image
                      src={c.src}
                      alt={dup === 0 ? c.alt : ''}
                      width={220}
                      height={88}
                      className="w-auto max-w-none object-contain"
                      style={{
                        height: `calc(var(--logo-h) * ${c.scale})`,
                        filter: c.detail ? 'grayscale(1) invert(1) brightness(1.9)' : 'brightness(0) invert(1)',
                        opacity: 0.92,
                      }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
          {/* Fade nas bordas — a faixa "nasce" e "morre" no preto. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-28"
            style={{ background: `linear-gradient(90deg, ${dark.bg} 0%, rgba(13,13,13,0) 100%)` }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-28"
            style={{ background: `linear-gradient(270deg, ${dark.bg} 0%, rgba(13,13,13,0) 100%)` }}
          />
        </div>
      </Reveal>
    </Section>
  )
}
