import './index.css'
import { Form } from './components/Form'
import { LeilaoSections } from './components/LeilaoSections'
import { Footer } from './components/Footer'
import bgPhoto from './assets/foto-bulinha-bg.jpeg'

function App() {
  return (
    <div className="min-h-screen font-sans bg-white text-black">
      <main>
        <div
          className="relative bg-black hero-bg"
          style={{
            backgroundImage: `url(${bgPhoto})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <Form />
        </div>
        <LeilaoSections />
      </main>
      <Footer />
    </div>
  )
}

export default App
