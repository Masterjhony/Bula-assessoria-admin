'use client'

import { useEffect, useState } from 'react'
import { dark } from '../_lib/tokens'
import { hero } from '../_lib/copy'

// CTA fixo no rodapé — SÓ mobile. Aparece depois que o usuário rola além do
// hero e some quando o formulário (#cadastro) entra na viewport, para não
// cobrir o próprio form. Aumenta a chance de o lead chegar ao cadastro no
// scroll longo do mobile (quick win de conversão).
export function StickyCta() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.9)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    // Esconde quando o form está visível.
    const form = document.getElementById('cadastro')
    let formVisible = false
    const io = form
      ? new IntersectionObserver(
          ([e]) => {
            formVisible = e.isIntersecting
            if (formVisible) setShow(false)
          },
          { threshold: 0.15 },
        )
      : null
    if (form && io) io.observe(form)

    return () => {
      window.removeEventListener('scroll', onScroll)
      io?.disconnect()
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
        className="flex w-full items-center justify-center rounded-full"
        style={{
          background: dark.gold,
          color: '#0D0D0D',
          fontWeight: 600,
          fontSize: 16,
          letterSpacing: '-0.01em',
          minHeight: 52,
        }}
      >
        {hero.cta}
      </a>
    </div>
  )
}
