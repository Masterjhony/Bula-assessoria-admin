import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'

// Destino único de todos os CTAs: o formulário de inscrição no topo da página.
// (#inscricao-form fica no início do card do formulário — o scroll-padding-top
// do html cuida do respiro no topo.)
const TARGET = '#inscricao-form'

// ── Botão de CTA reutilizável ──────────────────────────────────────────────
// Dourado Bula, em caixa-alta, com brilho varrendo (cta-shimmer). "Gritando"
// mas harmônico com o tema escuro da landing.
export function ParticipeCTA({
  size = 'md',
  pulse = false,
  className = '',
}: {
  size?: 'md' | 'lg'
  pulse?: boolean
  className?: string
}) {
  const sizing =
    size === 'lg'
      ? 'px-10 py-4 text-lg sm:text-xl'
      : 'px-7 py-3.5 text-base sm:text-lg'
  return (
    <a
      href={TARGET}
      className={`cta-shimmer ${pulse ? 'cta-pulse' : ''} group relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-full bg-gradient-to-r from-[#B8860B] via-[#EBCB6E] to-[#B8860B] font-black uppercase tracking-wide text-black shadow-[0_10px_35px_-5px_rgba(201,162,75,0.5)] ring-1 ring-[#EBCB6E]/40 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105 hover:shadow-[0_16px_45px_-5px_rgba(201,162,75,0.75)] active:translate-y-0 ${sizing} ${className}`}
    >
      <span className="relative z-10">Participe do leilão!</span>
      <ArrowRight
        className="relative z-10 h-5 w-5 transition-transform duration-200 group-hover:translate-x-1"
        aria-hidden
      />
    </a>
  )
}

// ── Faixa de CTA (fecho de seção / final da página) ────────────────────────
export function ParticipeBand({
  kicker = 'Vagas limitadas · Grátis · Sem compromisso',
  title = 'Não fique de fora dessa',
}: {
  kicker?: string
  title?: string
}) {
  return (
    <section id="participe-band" className="relative overflow-hidden border-y border-[#EBCB6E]/15 bg-gradient-to-b from-neutral-950 to-black px-5 py-16 text-center sm:px-8 sm:py-20">
      {/* brilho dourado de fundo */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#C9A24B]/15 blur-[120px]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-2xl">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[3px] text-[#EBCB6E]/80">
          {kicker}
        </p>
        <h2 className="mb-7 text-3xl font-black uppercase leading-[1.05] tracking-tight text-white sm:text-5xl">
          {title}
        </h2>
        <ParticipeCTA size="lg" pulse />
      </div>
    </section>
  )
}

// ── CTA flutuante ──────────────────────────────────────────────────────────
// Aparece em todas as seções de leilão e some quando o formulário (hero) está
// na tela — assim não compete com o próprio formulário.
export function FloatingCTA() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Esconde o flutuante quando o hero (formulário) OU a faixa final estão
    // visíveis — nesses pontos já existe um CTA grande na tela.
    const targets = ['inscricao', 'participe-band']
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null)
    if (!targets.length) {
      setShow(true)
      return
    }
    const visible = new Set<Element>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target)
          else visible.delete(e.target)
        }
        setShow(visible.size === 0)
      },
      { threshold: 0 },
    )
    targets.forEach((t) => io.observe(t))
    return () => io.disconnect()
  }, [])

  return (
    <div
      className={`fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 transition-all duration-300 sm:bottom-6 ${
        show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0'
      }`}
    >
      <ParticipeCTA pulse className="shadow-2xl" />
    </div>
  )
}
