'use client'

import { useEffect, useRef, useState } from 'react'
import { dark } from '../_lib/tokens'
import { hero } from '../_lib/copy'

// CTA fixo no rodapé — SÓ mobile. O formulário voltou para a 1ª dobra (25/07),
// então o sticky é o caminho de VOLTA: aparece quando o card (#cadastro) sai da
// tela e some assim que ele reaparece, para nunca cobrir os campos.
export function StickyCta() {
  const [show, setShow] = useState(false)
  // Visibilidade guardada em ref para o scroll respeitá-la — senão o scroll
  // dentro do próprio form reativa o CTA e ele cobre o campo ativo. O fecho
  // entra na conta porque já tem o mesmo botão em tela: dois CTAs empilhados
  // no rodapé viram ruído.
  const hideRef = useRef<Record<string, boolean>>({ cadastro: false, 'fecho-cta': false })

  useEffect(() => {
    // Com o form na 1ª dobra, quem manda é a visibilidade do card: o sticky só
    // entra depois que ele passou (guarda de scroll p/ não piscar no topo).
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
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:hidden"
      style={{
        transform: show ? 'translateY(0)' : 'translateY(120%)',
        transition: 'transform 0.28s cubic-bezier(0.22,1,0.36,1)',
        background: 'linear-gradient(180deg, rgba(13,13,13,0) 0%, rgba(13,13,13,0.9) 40%)',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
      }}
    >
      <a
        href="#cadastro"
        className="flex w-full items-center justify-center"
        style={{
          background: dark.gold,
          color: '#0D0D0D',
          fontFamily: "'Oswald', sans-serif",
          fontWeight: 600,
          fontSize: 15,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          minHeight: 54,
          borderRadius: 0,
        }}
      >
        {hero.cta}
      </a>
    </div>
  )
}
