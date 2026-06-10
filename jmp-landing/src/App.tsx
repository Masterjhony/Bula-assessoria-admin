import './index.css'
import { useEffect, useState } from 'react'
import { Form } from './components/Form'
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
          style={{
            backgroundImage: `url(${content.hero.backgroundUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <Form hero={content.hero} />
        </div>
      </main>
    </div>
  )
}

export default App
