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
export function StickyCta() {
  const [show, setShow] = useState(false)
  // Visibilidade guardada em ref para o handler de scroll enxergar o valor
  // corrente sem re-registrar o listener a cada render.
  const hideRef = useRef<Record<string, boolean>>({ cadastro: false, 'fecho-cta': false })

  useEffect(() => {
    const onScroll = () => {
      const oculto = Object.values(hideRef.current).some(Boolean)
      setShow(!oculto && window.scrollY > window.innerHeight * 0.9)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    const observers = (['cadastro', 'fecho-cta'] as const).map((id) => {
      const el = document.getElementById(id)
      if (!el) return null
      const io = new IntersectionObserver(
        ([e]) => {
          hideRef.current[id] = e.isIntersecting
          onScroll()
        },
        { threshold: 0.15 },
      )
      io.observe(el)
      return io
    })

    return () => {
      window.removeEventListener('scroll', onScroll)
      observers.forEach((io) => io?.disconnect())
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
