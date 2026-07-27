'use client'

import { useEffect, useState } from 'react'
import { dark, font, typo, space } from '../_lib/tokens'
import { EVENTO } from '../_lib/evento'
import { contagem as copy } from '../_lib/copy'
import { useSafeReducedMotion } from '../_lib/useSafeReducedMotion'

// Contagem regressiva até o leilão. É o elemento que separa esta landing da
// perpétua: aqui a data é o argumento de conversão.
//
// Hidratação: o alvo é fixo (constante), mas "agora" não é. Renderizar o tempo
// restante no servidor produziria markup diferente do client e quebraria a
// hidratação. Por isso o componente só calcula DEPOIS de montar — antes disso
// devolve a mesma estrutura com traços, preservando a altura e evitando
// layout shift na primeira dobra.

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

export function Contagem() {
  // `undefined` = ainda não montou (servidor e 1º render do client). `null` =
  // montou e o evento já passou. Um estado só evita render em cascata e deixa
  // os três casos explícitos.
  const [restante, setRestante] = useState<Restante | null | undefined>(undefined)

  // Um mostrador de segundos é movimento contínuo: para quem pede menos
  // movimento, os segundos saem de cena e a contagem passa a se atualizar em
  // silêncio, de minuto em minuto. Some o efeito de cronômetro, e de quebra
  // some 1 render por segundo no celular — a urgência da data continua ali.
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
      <div style={{ borderTop: `1px solid ${dark.hairline}`, paddingTop: space.md }}>
        <p style={{ ...typo.body, color: dark.text, fontSize: 16 }}>{copy.encerrado}</p>
        <p style={{ ...typo.body, fontSize: 14, color: dark.muted, marginTop: space.xs }}>
          {copy.encerradoLead}
        </p>
      </div>
    )
  }

  const blocos: [number | null, string][] = [
    [restante?.dias ?? null, copy.unidades.dias],
    [restante?.horas ?? null, copy.unidades.horas],
    [restante?.minutos ?? null, copy.unidades.minutos],
  ]
  if (!reduzirMovimento) blocos.push([restante?.segundos ?? null, copy.unidades.segundos])

  return (
    // A hairline é o que separa a contagem do lead acima. Ela só funciona como
    // separador se houver ar dos dois lados: o de cima vem da margem que o Hero
    // aplica neste bloco, o de baixo é este paddingTop.
    <div style={{ borderTop: `1px solid ${dark.hairline}`, paddingTop: space.md }}>
      <span style={{ ...typo.monoLabel, color: dark.gold }}>{copy.label}</span>

      {/* aria-live desligado de propósito: um contador que muda a cada segundo
          seria lido em loop por leitor de tela. A data completa fica abaixo,
          em texto estático, que é o que realmente importa anunciar. */}
      <div className="flex items-start gap-5 sm:gap-7" style={{ marginTop: space.sm }} aria-hidden>
        {blocos.map(([valor, unidade]) => (
          <div key={unidade} className="flex flex-col">
            <span
              style={{
                fontFamily: font.display,
                fontWeight: 600,
                fontSize: 'clamp(24px, 6vw, 42px)',
                lineHeight: 1,
                color: dark.text,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {valor === null ? '––' : String(valor).padStart(2, '0')}
            </span>
            {/* Número e unidade são UMA coisa: aqui a folga fica curta de
                propósito, senão "04" e "dias" deixam de ler como um par. */}
            <span style={{ ...typo.monoLabel, color: dark.muted, marginTop: space.xs }}>
              {unidade}
            </span>
          </div>
        ))}
      </div>

      <p style={{ ...typo.body, fontSize: 15, color: dark.body, marginTop: space.md }}>
        {EVENTO.dataExtenso}, {EVENTO.diaSemana}, às {EVENTO.hora}.
      </p>
    </div>
  )
}
