'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { dark, typo, font } from '../_lib/tokens'
import { hero } from '../_lib/copy'
import { useSafeReducedMotion } from '../_lib/useSafeReducedMotion'
import { MultiLine, Eyebrow, Hairline } from './ui'
import { LeadForm } from './Formulario'

// Foto por viewport: retrato (touro encarando a câmera) no mobile — preenche o
// slot vertical sem corte estranho; paisagem (curral ao entardecer) no desktop.
const HERO_PHOTO_MOBILE = '/jmp/galeria-touros/IMG_0037.jpg'
const HERO_PHOTO_DESKTOP = '/jmp/galeria-touros/IMG_0003.jpg'

// HERO com o FORMULÁRIO na 1ª dobra (pedido do cliente 25/07): o cadastro voltou
// da seção final para cá, sem perder a abertura cinematográfica.
//
//   Mobile  → coluna única: marca · promessa · form · ficha técnica.
//             A foto NÃO é fundo da seção inteira: vive numa BANDA de altura
//             própria no topo, que desmancha em preto sólido antes do card.
//             Assim ela não é esticada/estourada pela altura do form e os
//             campos ficam sempre sobre superfície chapada (legibilidade).
//   Desktop → grid 2 colunas: copy à esquerda (promessa + ficha técnica
//             ancorada no rodapé) e card do form à direita, sobre a foto
//             full-bleed com scrim direcional.
//
// O id="cadastro" mora no WRAPPER do card (elemento pequeno): é o alvo do
// StickyCta e do fecho da página, e é o que o IntersectionObserver observa.
export function Hero() {
  const reduce = useSafeReducedMotion()
  const enter = (y: number) => (reduce ? false : { opacity: 0, y })
  return (
    <section
      id="topo"
      className="relative w-full overflow-hidden"
      style={{ background: dark.bg, color: dark.text, colorScheme: 'dark' }}
    >
      {/* Anel de foco visível (WCAG 2.4.7) — cantos retos combinam c/ inputs. */}
      <style>{`
        #topo a:focus-visible,
        #topo input:focus-visible,
        #topo select:focus-visible,
        #topo button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px #0D0D0D, 0 0 0 4px rgba(200,169,110,0.85);
        }
        #topo ::placeholder { color: #8A8A8A; opacity: 1; }
      `}</style>

      {/* MOBILE — banda fotográfica com altura PRÓPRIA (não acompanha o form) e
          fade até o preto sólido: a foto respira em cima, o form apoia no
          chapado. clamp() protege telas curtas (SE) e muito altas. */}
      <div className="absolute inset-x-0 top-0 h-[clamp(340px,56svh,540px)] lg:hidden">
        <Image
          src={HERO_PHOTO_MOBILE}
          alt="Touro Nelore PO selecionado pela Bula Assessoria"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[50%_26%] sm:hidden"
        />
        {/* Tablet: a banda vira larga e o retrato ficaria estourado — entra a
            panorâmica (mesma URL do desktop, sem download extra). */}
        <Image
          src={HERO_PHOTO_DESKTOP}
          alt=""
          aria-hidden
          fill
          sizes="100vw"
          className="hidden object-cover object-[50%_60%] sm:block"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(13,13,13,0.74) 0%, rgba(13,13,13,0.42) 32%, rgba(13,13,13,0.88) 80%, #0D0D0D 100%)',
          }}
        />
      </div>

      {/* DESKTOP — foto full-bleed + véu base + scrim direcional: a copy lê como
          se estivesse sobre painel escuro; do lado do card a foto reaparece. */}
      <div aria-hidden className="absolute inset-0 hidden lg:block">
        <Image
          src={HERO_PHOTO_DESKTOP}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[50%_62%]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(13,13,13,0.70) 0%, rgba(13,13,13,0.52) 44%, rgba(13,13,13,0.92) 100%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(13,13,13,0.84) 0%, rgba(13,13,13,0.50) 44%, rgba(13,13,13,0.16) 72%, rgba(13,13,13,0.26) 100%)',
          }}
        />
      </div>

      {/* Mobile: coluna única na ordem do DOM (marca → copy → form → ficha).
          Desktop: grid com posicionamento explícito — o card ocupa a coluna 2
          nas duas linhas, então a ficha técnica ancora no rodapé da esquerda. */}
      <div className="relative mx-auto flex w-full max-w-[1180px] flex-col gap-8 px-5 pb-14 pt-9 sm:px-8 sm:gap-10 sm:pb-16 lg:grid lg:min-h-[100svh] lg:grid-cols-[1fr_minmax(400px,480px)] lg:grid-rows-[auto_1fr_auto] lg:gap-x-16 lg:gap-y-10 lg:pb-16 lg:pt-12">
        {/* Marca — centralizada e maior (pedido do cliente 24/07). */}
        <motion.div
          initial={enter(14)}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex justify-center lg:col-span-2"
        >
          <Image
            src="/logo-bula-assessoria-white.png"
            alt="Bula Assessoria"
            width={400}
            height={104}
            className="h-16 w-auto sm:h-24 lg:h-28"
            priority
          />
        </motion.div>

        {/* Promessa — eyebrow + manchete + olho + micro-copy de atrito. */}
        <div className="relative lg:col-start-1 lg:row-start-2 lg:self-center lg:pr-4">
          {/* Número de livery — profundidade editorial, não bolha 3D. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -left-3 top-1/2 hidden -translate-y-1/2 select-none lg:block"
            style={{
              fontFamily: font.display,
              fontSize: 300,
              fontWeight: 700,
              lineHeight: 1,
              color: dark.gold,
              opacity: 0.05,
              letterSpacing: '-0.04em',
            }}
          >
            B
          </span>

          <div className="relative">
            <motion.div
              initial={enter(14)}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="mb-4 sm:mb-5"
            >
              <Eyebrow surface="dark">{hero.eyebrow}</Eyebrow>
            </motion.div>

            {/* Headline longa (promessa em R$): com o form de volta à dobra ela
                cede um degrau de tamanho — o KPI é o cadastro, não a manchete. */}
            <motion.h1
              initial={enter(18)}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              style={{ ...typo.displayXL, fontSize: 'clamp(26px, 4.4vw, 44px)', lineHeight: 1.1 }}
            >
              <MultiLine text={hero.title} />
            </motion.h1>

            <motion.p
              initial={enter(16)}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="mt-4 max-w-[560px] sm:mt-5"
              style={{ ...typo.body, fontSize: 'clamp(15px, 1.7vw, 18px)', color: dark.muted }}
            >
              {hero.lead}
            </motion.p>

            {/* Tira o atrito ("quanto custa? o que acontece?") logo acima do
                card no mobile — é a última coisa que se lê antes de preencher. */}
            <motion.p
              initial={enter(12)}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5"
              style={{ ...typo.monoLabel, fontSize: 11, letterSpacing: '0.1em', color: dark.gold }}
            >
              {hero.ctaNote}
            </motion.p>
          </div>
        </div>

        {/* Card do form multi-step — lógica intocada (multi-step, validação,
            IBGE, UTM, tracking, event_id, is_mql). */}
        <motion.div
          id="cadastro"
          initial={enter(20)}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
          style={{ scrollMarginTop: 12 }}
          // Entre 640px e 1024px (tablet) o card ficaria largo demais para uma
          // coluna só: trava em 560px e centraliza. No lg vira a 2ª coluna.
          className="w-full sm:mx-auto sm:max-w-[560px] lg:col-start-2 lg:row-start-2 lg:row-span-2 lg:mx-0 lg:max-w-none lg:self-center"
        >
          <LeadForm />
        </motion.div>

        {/* Ficha técnica — prova quantificada. No mobile fecha o hero (quem rola
            além do form encontra o número); no desktop ancora a coluna da copy. */}
        <motion.div
          initial={enter(18)}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.34, ease: [0.22, 1, 0.36, 1] }}
          className="lg:col-start-1 lg:row-start-3 lg:self-end"
        >
          <Hairline surface="dark" />
          <div className="grid grid-cols-3 gap-3 pt-4 sm:gap-8 sm:pt-6">
            {hero.stats.map((s) => (
              <div key={s.label}>
                <div
                  style={{
                    fontFamily: font.display,
                    fontWeight: 600,
                    letterSpacing: '-0.015em',
                    fontSize: 'clamp(22px, 3.2vw, 38px)',
                    lineHeight: 1,
                    color: dark.text,
                  }}
                >
                  {s.value}
                </div>
                <div className="mt-2" style={{ ...typo.monoLabel, fontSize: 'clamp(9.5px, 1.1vw, 11.5px)', color: dark.gold }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
