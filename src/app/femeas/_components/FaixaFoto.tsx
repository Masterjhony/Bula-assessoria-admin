import Image from 'next/image'
import { dark } from '../_lib/tokens'

// ─────────────────────────────────────────────────────────────────────────
// FAIXA FOTOGRÁFICA — respiro entre seções.
//
// A página é longa (7,3 mil pixels no celular) e inteira tipográfica. Uma faixa
// de foto antes do fecho quebra a leitura no ponto certo: depois de a pessoa ter
// lido o filtro, as categorias e a jornada, e antes do último convite.
//
// ⚠️ Ela é DECORATIVA por decisão, não por preguiça: `alt=""` e `aria-hidden`.
// A informação que a foto carrega — que a Bula trabalha com Nelore PO a pasto —
// já está dita em texto em três lugares. Descrevê-la de novo para quem usa
// leitor de tela seria repetição, não acessibilidade.
//
// ⚠️ NÃO usar isto na seção de categorias. Foto de lote não distingue bezerra de
// novilha, e aquela seção existe para a pessoa ESCOLHER — ilustrar com um lote
// genérico ali seria informação falsa. Ver public/femeas/README.md.
//
// `sizes="100vw"` porque a faixa é full-bleed. Sem `priority`: ela está bem
// abaixo da dobra, e competir com o LCP do hero por banda de rede é como se
// perde meio segundo no celular.
// ─────────────────────────────────────────────────────────────────────────
export function FaixaFoto({
  src,
  altura = 'clamp(220px, 34vw, 420px)',
  posicao = '50% 50%',
}: {
  src: string
  altura?: string
  posicao?: string
}) {
  return (
    <div
      aria-hidden
      className="relative w-full overflow-hidden"
      style={{ height: altura, background: dark.bg }}
    >
      <Image src={src} alt="" fill sizes="100vw" className="object-cover" style={{ objectPosition: posicao }} />
      {/* Fio dourado no topo e véu leve: a faixa entra como elemento da página,
          não como banner colado no meio dela. O véu também garante que a emenda
          com o near-black das seções vizinhas não apareça como corte seco. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(13,13,13,0.55) 0%, rgba(13,13,13,0.18) 40%, rgba(13,13,13,0.55) 100%)',
        }}
      />
      <div className="absolute inset-x-0 top-0" style={{ height: 1, background: dark.gold, opacity: 0.5 }} />
    </div>
  )
}
