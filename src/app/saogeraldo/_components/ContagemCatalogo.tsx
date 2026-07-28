'use client'

import { useEffect, useState } from 'react'
import { dark, font, space, typo } from '../_lib/tokens'
import { EVENTO } from '../_lib/evento'
import { copyCatalogo } from '../_lib/copy-catalogo'
import { useSafeReducedMotion } from '../_lib/useSafeReducedMotion'

// ─────────────────────────────────────────────────────────────────────────
// Contagem regressiva para o leilão.
//
// A LÓGICA É A MESMA de `Contagem.tsx` e foi copiada linha a linha de
// propósito: o estado de três valores, o `undefined` como "ainda não montou",
// o intervalo condicionado ao `prefers-reduced-motion`, o `aria-hidden` na
// régua de dígitos e o ramo de evento encerrado. Aquela hidratação já estava
// resolvida e auditada; o que muda aqui é só a pele.
//
// SOBRE `aria-live`, que o desenho de referência pedia: continua DESLIGADO.
// Um contador que muda a cada segundo seria lido em laço por leitor de tela,
// sequestrando a navegação. A informação que importa anunciar — dia, mês, dia
// da semana e hora — está logo acima em texto estático, que é anunciável e
// não se repete. Trocar isto por `aria-live` piora a página para quem mais
// depende dela.
// ─────────────────────────────────────────────────────────────────────────

const ALVO = new Date(EVENTO.dataHoraISO).getTime()

type Restante = { dias: number; horas: number; minutos: number; segundos: number }

function calcular(): Restante | null {
  const delta = ALVO - Date.now()
  if (delta <= 0) return null
  const seg = Math.floor(delta / 1000)
  return {
    dias: Math.floor(seg / 86400),
    horas: Math.floor((seg % 86400) / 3600),
    minutos: Math.floor((seg % 3600) / 60),
    segundos: seg % 60,
  }
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')

export function ContagemCatalogo() {
  // `undefined` = ainda não montou (servidor e 1º render do client). `null` =
  // montou e o evento já passou. Um estado só evita render em cascata e deixa
  // os três casos explícitos — é o que impede o hydration mismatch.
  const [restante, setRestante] = useState<Restante | null | undefined>(undefined)

  // Um mostrador de segundos é movimento contínuo: para quem pede menos
  // movimento, os segundos saem de cena e a contagem se atualiza de minuto em
  // minuto. Some o efeito de cronômetro e some 1 render por segundo no
  // celular — a urgência da data continua ali.
  const reduzirMovimento = useSafeReducedMotion()
  const intervalo = reduzirMovimento ? 60_000 : 1000

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRestante(calcular())
    const id = setInterval(() => setRestante(calcular()), intervalo)
    return () => clearInterval(id)
  }, [intervalo])

  // Evento já começou: a contagem some e dá lugar a uma linha honesta. Não
  // fingimos urgência que não existe mais.
  if (restante === null) {
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={{ ...typo.body, color: dark.text, marginTop: 0 }}>
          {copyCatalogo.contagem.encerrado}
        </p>
        <p style={{ ...typo.body, fontSize: 14, color: dark.muted, marginTop: space.xs }}>
          {copyCatalogo.contagem.encerradoLead}
        </p>
      </div>
    )
  }

  const blocos: [number | null, string][] = [
    [restante?.dias ?? null, copyCatalogo.contagem.unidades.dias],
    [restante?.horas ?? null, copyCatalogo.contagem.unidades.horas],
    [restante?.minutos ?? null, copyCatalogo.contagem.unidades.minutos],
  ]
  if (!reduzirMovimento) blocos.push([restante?.segundos ?? null, copyCatalogo.contagem.unidades.segundos])

  return (
    <div
      // A régua inteira é aria-hidden — ver a nota no topo do arquivo.
      aria-hidden
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 'clamp(10px, 3vw, 22px)',
      }}
    >
      {blocos.map(([valor, unidade], i) => (
        <div key={unidade} style={{ display: 'flex', alignItems: 'flex-start', gap: 'clamp(10px, 3vw, 22px)' }}>
          {i > 0 && (
            <span
              style={{
                ...typo.condicaoValor,
                color: dark.gold,
                opacity: 0.45,
                lineHeight: 1,
              }}
            >
              :
            </span>
          )}
          <div style={{ textAlign: 'center', minWidth: 52 }}>
            <span
              style={{
                display: 'block',
                fontFamily: font.serif,
                fontWeight: 700,
                fontSize: 'clamp(28px, 6vw, 48px)',
                lineHeight: 1,
                color: dark.gold,
                // Sem tabular-nums o mostrador dança a cada segundo.
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {/* Traço duplo enquanto não montou: é o que o servidor renderiza
                  e o que o primeiro paint do client repete, idênticos. */}
              {valor === null ? '––' : doisDigitos(valor)}
            </span>
            <span
              style={{
                display: 'block',
                ...typo.eyebrow,
                fontSize: 'clamp(10px, 1.3vw, 12px)',
                letterSpacing: '0.3em',
                color: dark.muted,
                marginTop: space.xs,
              }}
            >
              {unidade}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
