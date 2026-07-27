'use client'

import { useEffect, useState } from 'react'
import { dark, font, typo } from '../_lib/tokens'
import { hero as copy, sticky } from '../_lib/copy'
import { EVENTO } from '../_lib/evento'

const ALVO = new Date(EVENTO.dataHoraISO).getTime()

// Dias inteiros que faltam, arredondados para CIMA: com 20h restantes ainda
// "falta 1 dia", não zero. `null` quando o leilão já começou.
function diasRestantes(): number | null {
  const delta = ALVO - Date.now()
  if (delta <= 0) return null
  return Math.ceil(delta / 86_400_000)
}

// Só na reta final. Ver a nota em copy.sticky.
const LIMIAR_URGENCIA = 3

// Barra fixa no rodapé (mobile). Aparece só depois que o form da 1ª dobra sai
// da tela — antes disso ela competiria com o próprio campo de captura.
//
// Some quando #cadastro está visível de novo: manter a barra sobre o formulário
// tapa campo em tela pequena e atrapalha justamente quem já está convertendo.
export function StickyCta() {
  const [visivel, setVisivel] = useState(false)
  // `null` até montar: o servidor não sabe que horas são no cliente, e render
  // de tempo no SSR quebraria a hidratação. A barra já nasce escondida, então
  // não há salto visual em preencher isto depois.
  const [dias, setDias] = useState<number | null>(null)

  useEffect(() => {
    const alvo = document.getElementById('cadastro')
    if (!alvo) return
    const obs = new IntersectionObserver(
      ([entry]) => setVisivel(!entry.isIntersecting),
      { rootMargin: '-10% 0px 0px 0px' },
    )
    obs.observe(alvo)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDias(diasRestantes())
    // Dia inteiro muda devagar; um tick por minuto basta e não gasta bateria.
    const id = setInterval(() => setDias(diasRestantes()), 60_000)
    return () => clearInterval(id)
  }, [])

  const mostraUrgencia = dias !== null && dias <= LIMIAR_URGENCIA

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 lg:hidden"
      style={{
        transform: visivel ? 'translateY(0)' : 'translateY(120%)',
        transition: 'transform .28s cubic-bezier(0.22, 1, 0.36, 1)',
        pointerEvents: visivel ? 'auto' : 'none',
      }}
      aria-hidden={!visivel}
    >
      {/* Faixa de urgência — só na reta final. Fica ACIMA do botão, em barra
          própria: enfiar a contagem dentro do CTA disputaria leitura com a
          ação, e o que precisa ficar claro no toque é o que acontece ao tocar. */}
      {mostraUrgencia && (
        <div
          className="flex w-full items-center justify-center"
          style={{
            minHeight: 34,
            background: '#161616',
            borderBottom: `1px solid ${dark.hairline}`,
            ...typo.monoLabel,
            fontSize: 11,
            color: dark.gold,
          }}
        >
          {sticky.urgencia(dias)}
        </div>
      )}

      <a
        href="#cadastro"
        className="flex w-full items-center justify-center"
        tabIndex={visivel ? 0 : -1}
        style={{
          minHeight: 56,
          fontFamily: font.display,
          fontWeight: 600,
          fontSize: 15,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          background: dark.gold,
          color: '#0D0D0D',
          boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
        }}
      >
        {copy.ctaSticky}
      </a>
    </div>
  )
}
