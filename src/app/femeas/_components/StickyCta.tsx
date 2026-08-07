'use client'

import { useEffect, useRef, useState } from 'react'
import { dark, typo } from '../_lib/tokens'
import { hero } from '../_lib/copy'

// ─────────────────────────────────────────────────────────────────────────
// CTA fixo no rodapé — SÓ no celular. Fork do /touros.
//
// Como o formulário mora na 1ª dobra, o sticky não é o caminho de ida: é o
// caminho de VOLTA. Ele aparece depois que o card (#cadastro) saiu da tela e
// desaparece assim que ele reaparece — senão cobre o campo que a pessoa está
// preenchendo, que é o pior lugar da página para colocar um botão.
//
// Some também quando o botão do Fecho (#fecho-cta) está visível: dois botões
// idênticos empilhados no pé da tela viram ruído.
//
// ⚠️ É um <a> para a âncora, nunca um segundo formulário (INV-7).
//
// A transição é de `transform`, e por isso não precisa de guarda de
// prefers-reduced-motion no JS: é um deslize de 280ms de um elemento que
// entra na tela, não movimento paralelo ou paralaxe. Ainda assim a regra CSS
// abaixo zera a duração para quem pediu menos movimento — a barra passa a
// simplesmente aparecer.
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ ISTO AQUI ERA UM IntersectionObserver E VIROU CONTA DE RETÂNGULO (06/08).
// Não foi preferência de estilo: o observer TINHA UM BUG, medido em 390×844.
//
// Um observer guarda o NÓ que recebeu `observe()`. E `<Reveal/>` (ui.tsx) troca
// de árvore depois da montagem: ele renderiza `<motion.div>` no primeiro render
// e, quando `useSafeReducedMotion()` resolve para `true`, passa a renderizar um
// `<div>` pelado. Tipos diferentes → o React DESMONTA a subárvore e monta
// outra. O `#fecho-cta`, que mora dentro de um `<Reveal/>`, some e volta como
// um nó novo — e o observer fica olhando o nó velho, já destacado do documento,
// que nunca mais intersecta nada.
//
// O sintoma, só para quem tem "reduzir movimento" ligado no aparelho (ajuste
// comum no iPhone): no pé da página a barra fixa NÃO some, e o dourado dela
// empilha com o botão dourado do fecho — exatamente o que o comentário do
// Fecho.tsx promete que não acontece. Medido:
//
//   sem reduzir movimento   scrollY 7784 · aria-hidden=true   (some, correto)
//   com reduzir movimento   scrollY 8002 · aria-hidden=false  (fica, errado)
//
// A conta de retângulo lê o DOM de novo a cada avaliação, então troca de nó não
// a afeta. `0.15` é a mesma fração do `threshold` que estava aqui.
//
// ⚠️ O `#cadastro` escapava do bug por acidente — ele não mora dentro de um
// `<Reveal/>`. Quem envolver o card do hero num Reveal recriaria o mesmo
// defeito, e desta vez no pior lugar possível: a barra cobrindo o campo que a
// pessoa está preenchendo. A conta de retângulo tira essa armadilha do caminho.
const FRACAO_VISIVEL = 0.15

function estaNaTela(id: string) {
  const el = document.getElementById(id)
  if (!el) return false
  const r = el.getBoundingClientRect()
  if (!r.height) return false
  const visivel = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0)
  return visivel > 0 && visivel / r.height >= FRACAO_VISIVEL
}

export function StickyCta() {
  const [show, setShow] = useState(false)
  // rAF para não ler layout a cada evento de scroll — são dois
  // getBoundingClientRect por avaliação, e sem a trava eles rodariam dezenas de
  // vezes por segundo durante a rolagem.
  const agendado = useRef(false)

  useEffect(() => {
    const avaliar = () => {
      agendado.current = false
      const oculto = estaNaTela('cadastro') || estaNaTela('fecho-cta')
      setShow(!oculto && window.scrollY > window.innerHeight * 0.9)
    }
    const onScroll = () => {
      if (agendado.current) return
      agendado.current = true
      requestAnimationFrame(avaliar)
    }
    avaliar()
    window.addEventListener('scroll', onScroll, { passive: true })
    // O <Reveal/> muda de árvore DEPOIS da montagem e a página muda de altura
    // junto; sem esta segunda leitura a barra podia nascer com o estado do
    // layout antigo.
    const t = setTimeout(avaliar, 300)
    window.addEventListener('resize', onScroll, { passive: true })

    return () => {
      clearTimeout(t)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div
      className="femeas-sticky fixed inset-x-0 bottom-0 z-50 p-3 sm:hidden"
      aria-hidden={!show}
      style={{
        transform: show ? 'translateY(0)' : 'translateY(120%)',
        transition: 'transform 0.28s cubic-bezier(0.22,1,0.36,1)',
        background: 'linear-gradient(180deg, rgba(13,13,13,0) 0%, rgba(13,13,13,0.92) 42%)',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
      }}
    >
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .femeas-sticky { transition: none !important; }
        }
      `}</style>
      <a
        href="#cadastro"
        // `tabIndex={-1}` quando escondido: sem isso o botão fora da tela
        // continua na ordem de tabulação e o teclado cai num alvo invisível.
        tabIndex={show ? 0 : -1}
        className="flex w-full items-center justify-center"
        style={{
          ...typo.button,
          background: dark.gold,
          color: '#0D0D0D',
          minHeight: 54,
          borderRadius: 0,
          textDecoration: 'none',
        }}
      >
        {hero.cta}
      </a>
    </div>
  )
}
