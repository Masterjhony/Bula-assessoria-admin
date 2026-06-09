import { CheckCircle2 } from 'lucide-react'
import type { JmpIntro } from '../content'

// Seção de oferta logo abaixo do hero/"flyer". Renderiza só o que estiver
// preenchido — se tudo vazio (admin escondeu), não aparece nada.
export function IntroSection({ intro }: { intro: JmpIntro }) {
  const bodyParas = (intro.body ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  const bullets = intro.bullets.filter(Boolean)
  const hasContent =
    intro.title || bodyParas.length || intro.highlight || bullets.length || intro.footer
  if (!hasContent) return null

  return (
    <section className="bg-neutral-950">
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
        {intro.title && (
          <h2 className="text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">
            {intro.title}
          </h2>
        )}

        {bodyParas.length > 0 && (
          <div className="mt-5 space-y-3 text-base leading-relaxed text-white/70 sm:text-lg">
            {bodyParas.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}

        {intro.highlight && (
          <p className="mt-6 text-lg font-black uppercase leading-tight tracking-tight text-white sm:text-xl">
            {intro.highlight}
          </p>
        )}

        {bullets.length > 0 && (
          <ul className="mt-7 space-y-3">
            {bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-white/60" />
                <span className="text-base leading-snug text-white/85 sm:text-lg">{b}</span>
              </li>
            ))}
          </ul>
        )}

        {intro.footer && (
          <p className="mt-8 border-t border-white/12 pt-6 text-sm font-bold uppercase tracking-widest text-white/50">
            {intro.footer}
          </p>
        )}
      </div>
    </section>
  )
}
