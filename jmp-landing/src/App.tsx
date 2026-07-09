import './index.css'
import { useEffect, useState } from 'react'
import { Form } from './components/Form'
import { Footer } from './components/Footer'
import { DEFAULT_CONTENT, fetchContent, type JmpContent } from './content'
import { LEILOES } from './leiloes'

function scrollToForm(e: React.MouseEvent) {
  e.preventDefault()
  document.getElementById('inscricao-form')?.scrollIntoView({ behavior: 'smooth' })
}

function App() {
  // Renderiza com o default na hora e troca pelo conteúdo publicado quando
  // chega — sem flash de tela vazia e resiliente a falha de rede.
  const [content, setContent] = useState<JmpContent>(DEFAULT_CONTENT)

  useEffect(() => {
    let on = true
    fetchContent().then((c) => { if (on) setContent(c) })
    return () => { on = false }
  }, [])

  return (
    <div className="min-h-screen font-sans bg-black text-white">
      <main>
        <div
          className="relative bg-black hero-bg"
          style={{ '--hero-bg-url': `url(${content.hero.backgroundUrl})` } as React.CSSProperties}
        >
          <Form hero={content.hero} />
        </div>

        {/* Os 3 pregões do fim de semana. A campanha existe para converter
            nestes leilões — por isso vêm antes do flyer, com o catálogo à mão. */}
        <section className="bg-black px-5 py-16 sm:px-8">
          <div className="mx-auto max-w-5xl">
            <p className="text-center text-[11px] font-black uppercase tracking-[0.22em] text-gold/80">
              Fazenda Baviera · Itagibá / BA
            </p>
            <h2 className="mt-3 text-center text-2xl font-black leading-tight tracking-tight text-white sm:text-4xl">
              3 leilões em 3 dias.
              <br />
              <span className="text-white/50">Uma equipe do seu lado nos três.</span>
            </h2>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {LEILOES.map((l) => (
                <article
                  key={l.id}
                  className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition-colors hover:border-white/25"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">
                    {l.diaSemana}
                  </p>
                  <p className="mt-1 text-4xl font-black tracking-tight text-white">{l.dataCurta}</p>
                  <h3 className="mt-4 text-lg font-bold text-white">{l.label}</h3>
                  <p className="mt-1 text-sm leading-snug text-white/45">{l.tipo}</p>

                  <div className="mt-6 pt-1">
                    {l.catalogoUrl ? (
                      <a
                        href={l.catalogoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex w-full items-center justify-center rounded-lg border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gold transition-colors hover:bg-gold/20"
                      >
                        Ver catálogo (PDF)
                      </a>
                    ) : (
                      <span className="inline-flex w-full items-center justify-center rounded-lg border border-white/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white/30">
                        Catálogo em breve
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-10 text-center">
              <a
                href="#inscricao-form"
                onClick={scrollToForm}
                className="inline-flex items-center justify-center rounded-lg bg-gold px-8 py-4 text-sm font-black uppercase tracking-wider text-black transition-colors hover:bg-gold-dark"
              >
                Quero minha assessoria →
              </a>
              <p className="mt-3 text-xs text-white/35">Grátis. Sem compromisso.</p>
            </div>
          </div>
        </section>

        <section className="bg-black px-5 pb-16 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
              Confira o flyer oficial do evento
            </h2>
            <img
              src="/foto-leilao-eao.jpeg"
              alt="Flyer oficial do 13º Mega Evento EAO Baviera"
              loading="lazy"
              className="mt-6 w-full rounded-2xl border border-white/10 shadow-2xl shadow-black/60"
            />
          </div>
        </section>

        <Footer />
      </main>
    </div>
  )
}

export default App
