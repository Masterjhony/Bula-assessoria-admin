'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { dark, typo } from '../_lib/tokens'
import { useSafeReducedMotion } from '../_lib/useSafeReducedMotion'

// ─────────────────────────────────────────────────────────────────────────
// CARROSSEL DAS SEIS CATEGORIAS — SÓ NO CELULAR.
//
// Por que existe: empilhados, os seis cartões mediam 1460px em 390px de tela —
// a seção inteira dava 2007px, quase duas telas e meia. Quem rola isso na mão
// não está escolhendo por onde entrar no plantel; está passando reto.
//
// ⚠️ A PARTIR DE 640px (breakpoint `sm` do Tailwind, o mesmo que esta página já
// usa para virar 2 colunas) NADA MUDA. O componente devolve exatamente a mesma
// grade de antes: o CSS de carrossel vive inteiro dentro de
// `@media (max-width: 639.98px)`, e os pontos de posição só entram no DOM
// depois que o JS confirma que a tela é estreita — em 1440 o DOM é o de antes,
// nó por nó.
//
// ── AS TRÊS DECISÕES QUE NÃO SÃO ÓBVIAS ──────────────────────────────────
//
//  1. O GESTO É NATIVO, NÃO SIMULADO. Nenhuma biblioteca: é `overflow-x` com
//     `scroll-snap`. Isso importa além do peso — arrastar na diagonal continua
//     rolando a PÁGINA, porque quem decide a direção do gesto é o navegador,
//     como em qualquer lista horizontal do sistema. Carrossel que escuta
//     `touchmove` e chama `preventDefault` é o que sequestra a rolagem
//     vertical, e é exatamente o que não foi feito aqui.
//
//  2. O TOQUE PARA A PASSAGEM DE VEZ, e ela não volta. Não é "pausa enquanto o
//     dedo está na tela": assim que a pessoa arrasta, toca, gira a roda ou usa
//     o teclado, o automático morre pelo resto da visita. Retomar depois de um
//     tempo significa arrancar da mão dela o cartão que ela escolheu ler — e o
//     conteúdo aqui serve para ESCOLHER por onde entrar, não para assistir.
//
//  3. A PASSAGEM PARA SOZINHA DEPOIS DE UMA VOLTA (`PARA_APOS_UMA_VOLTA`). O
//     automático existe para avisar que há seis cartões, e esse aviso está dado
//     quando o sexto apareceu. Continuar girando só cria a chance de trocar o
//     cartão no meio da leitura de quem voltou para comparar duas categorias.
//     Para ter loop infinito, é essa constante — uma linha.
//
// ⚠️ `prefers-reduced-motion: reduce` → NÃO HÁ passagem automática, e o
// `scrollTo` dos pontos vira instantâneo. O carrossel continua arrastável: o
// que a preferência desliga é o movimento que a pessoa não pediu, não o
// acesso ao conteúdo.
//
// Os seis <article> estão SEMPRE no DOM, em ordem, sem `aria-hidden` e sem
// `display:none` — leitor de tela e busca da página alcançam os seis
// independentemente de onde a rolagem estiver.
// ─────────────────────────────────────────────────────────────────────────

/** Cadência da passagem automática. */
const INTERVALO_MS = 6000

/** `true` = uma volta e para. Ver decisão 3 acima. */
const PARA_APOS_UMA_VOLTA = true

/** O mesmo 640px do `sm:` do Tailwind, escrito como max-width. */
const CONSULTA_MOVEL = '(max-width: 639.98px)'

// Mesmo desenho do useSafeReducedMotion: o snapshot do servidor é `false`, então
// a primeira hidratação bate com o HTML e os pontos entram só no efeito seguinte.
function assina(onChange: () => void) {
  const mq = window.matchMedia(CONSULTA_MOVEL)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
function leClient() {
  return window.matchMedia(CONSULTA_MOVEL).matches
}
function leServidor() {
  return false
}
function useMovel() {
  return useSyncExternalStore(assina, leClient, leServidor)
}

export function CarrosselCategorias({
  children,
  total,
  rotulo,
}: {
  /** Os seis <article> já montados no componente de servidor. */
  children: ReactNode
  total: number
  /** Rótulo do grupo para leitor de tela, quando vira região rolável. */
  rotulo: string
}) {
  const trilha = useRef<HTMLDivElement>(null)
  const movel = useMovel()
  const reduzido = useSafeReducedMotion()

  const [atual, setAtual] = useState(0)
  /** A pessoa assumiu o controle. Uma vez `true`, nunca volta a `false`. */
  const [assumido, setAssumido] = useState(false)
  const [naTela, setNaTela] = useState(false)

  // ── Posição corrente, lida da rolagem real ──────────────────────────────
  // Fonte da verdade é o `scrollLeft`, não um índice nosso: assim o indicador
  // acompanha o arrasto do dedo, e não só os saltos que nós comandamos.
  useEffect(() => {
    const el = trilha.current
    if (!el || !movel) return
    let raf = 0
    const aoRolar = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const largura = el.clientWidth || 1
        const i = Math.round(el.scrollLeft / largura)
        setAtual(Math.min(total - 1, Math.max(0, i)))
      })
    }
    aoRolar()
    el.addEventListener('scroll', aoRolar, { passive: true })
    return () => {
      el.removeEventListener('scroll', aoRolar)
      cancelAnimationFrame(raf)
    }
  }, [movel, total])

  // ── Qualquer gesto encerra a passagem automática ────────────────────────
  // `pointerdown` cobre dedo e mouse; `wheel` cobre trackpad horizontal;
  // `keydown` cobre as setas quando a região está com foco. O `scrollTo` que
  // nós mesmos disparamos NÃO emite nenhum desses — não há autocancelamento.
  useEffect(() => {
    const el = trilha.current
    if (!el || !movel || assumido) return
    const assumir = () => setAssumido(true)
    const eventos = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const
    eventos.forEach((e) => el.addEventListener(e, assumir, { passive: true }))
    return () => eventos.forEach((e) => el.removeEventListener(e, assumir))
  }, [movel, assumido])

  // ── Só anda enquanto está na tela ───────────────────────────────────────
  // Sem isto, a volta única se gasta com a seção fora de vista e a pessoa chega
  // no cartão 06 sem nunca ter visto o 01.
  useEffect(() => {
    const el = trilha.current
    if (!el || !movel) return
    const io = new IntersectionObserver(([e]) => setNaTela(e.isIntersecting), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [movel])

  // ── A passagem automática ───────────────────────────────────────────────
  useEffect(() => {
    const el = trilha.current
    if (!el || !movel || reduzido || assumido || !naTela) return
    const id = window.setInterval(() => {
      const largura = el.clientWidth || 1
      const i = Math.round(el.scrollLeft / largura)
      if (PARA_APOS_UMA_VOLTA && i >= total - 1) {
        setAssumido(true)
        return
      }
      el.scrollTo({ left: ((i + 1) % total) * largura, behavior: 'smooth' })
    }, INTERVALO_MS)
    return () => window.clearInterval(id)
  }, [movel, reduzido, assumido, naTela, total])

  const irPara = useCallback(
    (i: number) => {
      const el = trilha.current
      if (!el) return
      setAssumido(true)
      el.scrollTo({ left: i * el.clientWidth, behavior: reduzido ? 'auto' : 'smooth' })
    },
    [reduzido],
  )

  return (
    <>
      <style>{`
        /* Estado de GRADE — o de sempre, e o único que existe a partir de 640px.
           gap/fundo/borda saíram do style inline para cá de propósito: estilo
           inline vence media query, e o gap de 1px precisa virar 0 no carrossel
           para o cartão medir exatamente a largura visível da trilha. */
        .femeas-trilha {
          gap: 1px;
          background: ${dark.hairline};
          border: 1px solid ${dark.hairline};
        }

        @media (max-width: 639.98px) {
          /* O prefixo "div." existe só para ganhar do .grid do Tailwind por
             especificidade, sem precisar de !important. */
          div.femeas-trilha {
            display: flex;
            flex-wrap: nowrap;
            gap: 0;
            overflow-x: auto;
            overscroll-behavior-inline: contain;
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
          }
          div.femeas-trilha::-webkit-scrollbar { display: none; }

          /* 100% da trilha, exato: é isso que faz a divisão de scrollLeft pela
             clientWidth ser o índice do cartão, sem erro acumulado. */
          div.femeas-trilha > * {
            flex: 0 0 100%;
            min-width: 0;
            scroll-snap-align: start;
          }
          /* O filete entre vizinhos, que na grade é o gap. Em border-box ele não
             muda a largura do cartão. Só entre cartões — nunca colado na borda. */
          div.femeas-trilha > * + * { border-left: 1px solid ${dark.hairline}; }
        }

        @media (prefers-reduced-motion: reduce) {
          .femeas-ponto { transition: none !important; }
        }
      `}</style>

      <div
        ref={trilha}
        className="femeas-trilha mt-[clamp(36px,5vw,64px)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        // Região rolável precisa ser alcançável pelo teclado (WCAG 2.1.1) — mas
        // só quando ela É rolável. Em desktop não há tabIndex, e portanto não há
        // parada de tabulação nova.
        {...(movel ? { role: 'group' as const, 'aria-label': rotulo, tabIndex: 0 } : {})}
      >
        {children}
      </div>

      {/* Indicador de posição. Só existe no celular, e só depois da hidratação:
          em 1440 este nó nunca chega ao DOM. Sem ele ninguém descobre que há
          seis cartões — a trilha some na borda sem avisar quantos faltam. */}
      {movel && (
        <div className="mt-5 flex items-center justify-between">
          {/* `aria-live` só DEPOIS que a passagem automática morreu. Anunciar
              cada troca enquanto o carrossel anda sozinho enche o ouvido de
              quem usa leitor de tela com uma mudança que ele não pediu — é a
              recomendação do padrão de carrossel da WAI, e o motivo de o
              atributo ser condicional aqui. */}
          <span
            style={{ ...typo.monoLabel, color: dark.gold }}
            aria-live={assumido ? 'polite' : 'off'}
            aria-atomic="true"
          >
            {String(atual + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>

          <div className="flex items-center">
            {Array.from({ length: total }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => irPara(i)}
                aria-label={`Ver a categoria ${i + 1} de ${total}`}
                aria-current={i === atual ? 'true' : undefined}
                // 44px de alvo (INV-6) com 8px de desenho: o alvo é o botão, o
                // ponto é só a marca dentro dele.
                style={{
                  width: 30,
                  height: 44,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span
                  aria-hidden
                  className="femeas-ponto"
                  style={{
                    display: 'block',
                    width: i === atual ? 18 : 6,
                    height: 2,
                    background: i === atual ? dark.gold : dark.hairlineStrong,
                    transition: 'width .25s ease, background-color .25s ease',
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
