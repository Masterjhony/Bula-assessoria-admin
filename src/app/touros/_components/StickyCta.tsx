'use client'

import { useEffect, useRef, useState } from 'react'
import { dark } from '../_lib/tokens'
import { hero } from '../_lib/copy'

// CTA fixo no rodapé — SÓ mobile. Aparece depois que o usuário rola além do
// hero e some quando o formulário (#cadastro) entra na viewport, para não
// cobrir o próprio form. Aumenta a chance de o lead chegar ao cadastro no
// scroll longo do mobile (quick win de conversão).
export function StickyCta() {
  const [show, setShow] = useState(false)
  // Visibilidade do form guardada em ref para o scroll respeitá-la — senão o
  // scroll dentro do próprio form reativa o CTA e ele cobre o campo ativo.
  const formVisibleRef = useRef(false)

  useEffect(() => {
    // Form agora vive na 1ª dobra; threshold mais alto p/ o sticky não brigar
    // com o hero e só aparecer bem depois dele.
    const onScroll = () =>
      setShow(!formVisibleRef.current && window.scrollY > window.innerHeight * 1.2)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    const form = document.getElementById('cadastro')
    const io = form
      ? new IntersectionObserver(
          ([e]) => {
            formVisibleRef.current = e.isIntersecting
            onScroll()
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
