import './index.css'
import { useEffect, useState } from 'react'
import { Form } from './components/Form'
import { Footer } from './components/Footer'
import { DEFAULT_CONTENT, fetchContent, type JmpContent } from './content'

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

        <section className="bg-black px-5 py-14 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">
              Confira o flyer oficial do evento
            </h2>
            <img
              src="/foto-leilao-eao.jpeg"
              alt="Flyer oficial do 13º Mega Evento EAO Baviera"
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
