'use client'

import { useEffect, useState } from 'react'
import { dark, font, space, typo } from '../_lib/tokens'
import { EVENTO } from '../_lib/evento'
import { copyCatalogo, cerimonia } from '../_lib/copy-catalogo'
import { BotaoPilula } from './ui-catalogo'

// ─────────────────────────────────────────────────────────────────────────
// Barra fixa.
//
// Transparente sobre o hero e opaca depois dele — o desfoque só entra quando
// há conteúdo passando por baixo. O limiar de 40px é o mesmo do desenho de
// referência.
//
// O `backdrop-filter` é a única quebra de brandbook que esta página assume de
// propósito (`tokens.ts` da versão anterior proibia glass). Ela existe porque
// o catálogo emoldura tudo em cápsula translúcida, e uma barra opaca sobre
// uma página de cápsulas destoaria.
// ─────────────────────────────────────────────────────────────────────────

export function NavCatalogo() {
  const [rolou, setRolou] = useState(false)

  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 40)
    aoRolar()
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [])

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: `${space.sm} clamp(16px, 4vw, 32px)`,
        background: rolou ? 'rgba(26, 19, 13, 0.88)' : 'transparent',
        backdropFilter: rolou ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: rolou ? 'blur(12px)' : 'none',
        borderBottom: rolou ? `1px solid ${dark.hairline}` : '1px solid transparent',
        transition: 'background 0.3s ease, backdrop-filter 0.3s ease, border-color 0.3s ease',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space.sm,
        }}
      >
        <a
          href="#topo"
          aria-label={copyCatalogo.nav.irParaTopo}
          style={{ textDecoration: 'none', display: 'block', minHeight: 44, paddingTop: 4 }}
        >
          <span
            style={{
              ...typo.eyebrowSerif,
              fontSize: 'clamp(9px, 1.1vw, 11px)',
              letterSpacing: '0.3em',
              color: dark.gold,
              display: 'block',
            }}
          >
            {copyCatalogo.nav.marcaLinha1}
          </span>
          <span
            style={{
              fontFamily: font.serif,
              fontWeight: 700,
              fontSize: 'clamp(13px, 1.6vw, 16px)',
              letterSpacing: '0.02em',
              color: dark.text,
              display: 'block',
            }}
          >
            {copyCatalogo.nav.marcaLinha2}
          </span>
        </a>

        {/* A data só aparece quando há largura para ela sem espremer o CTA. */}
        {/* Creme e não `muted`: a partir de 768px esta linha fica sobre a
            FOTO, não sobre o carvão, e ali o champagne escuro media 3,33:1 —
            reprova AA. O creme leva o mesmo lugar a 9,4:1. */}
        <span
          className="hidden md:block"
          style={{
            ...typo.eyebrow,
            fontSize: 12,
            letterSpacing: '0.2em',
            color: dark.body,
          }}
        >
          {EVENTO.dataExtenso} · {cerimonia(EVENTO.diaSemana, EVENTO.hora)}
        </span>

        <BotaoPilula href="#cadastro" compacto>
          {copyCatalogo.nav.cta}
        </BotaoPilula>
      </div>
    </nav>
  )
}
