import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Playfair_Display } from 'next/font/google'
import { interFeatures } from './_lib/tokens'
import { EVENTO } from './_lib/evento'
import { GoogleTagManager } from './_components/GoogleTagManager'

const TITULO = `${EVENTO.nome} — ${EVENTO.dataExtenso} | Bula Assessoria`
const DESCRICAO =
  'Leilão de touros PO Nelore das fazendas São Geraldo e 7P Agro. A Bula te assessora sem custo a escolher os lotes certos e cuida da sua habilitação para dar lance.'

// Metadata do LANÇAMENTO. Título e descrição carregam a data porque o clique
// vem de anúncio pago e de compartilhamento no WhatsApp — a data é o gancho.
export const metadata: Metadata = {
  metadataBase: new URL('https://saogeraldo.bulaassessoria.com'),
  title: TITULO,
  description: DESCRICAO,
  robots: { index: true, follow: true },
  // A landing responde na RAIZ do subdomínio (o host reescreve '/' → '/saogeraldo')
  // e também no caminho /saogeraldo. Sem canonical, o Google indexaria as duas
  // como páginas distintas e dividiria o sinal da única URL que os anúncios usam.
  alternates: { canonical: '/' },
  openGraph: {
    title: TITULO,
    description: DESCRICAO,
    type: 'website',
    locale: 'pt_BR',
    // JPG de propósito: o WhatsApp não renderiza WEBP de forma confiável no
    // preview do link, e o WhatsApp é o principal canal de compartilhamento aqui.
    images: [
      {
        url: '/touros/og-curral.jpg',
        width: 1200,
        height: 630,
        alt: 'Peões a cavalo apartando lotes de Nelore no curral, ao entardecer',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITULO,
    description: DESCRICAO,
    images: ['/touros/og-curral.jpg'],
  },
}

// Playfair Display — a voz do EVENTO, e SÓ nesta rota. O root layout carrega
// Inter, Oswald, Pinyon e Plex Mono por <link> para o app inteiro; a serifa não
// entra lá porque ela não é da marca Bula, é do leilão. Quem abre /touros não
// baixa este arquivo.
//
// Por que peso ÚNICO 400: display de alto contraste não se emboldena, se
// aumenta. A variável custaria ~2× por uma hierarquia que este uso não tem.
//
// `next/font` auto-hospeda o woff2 (zero DNS/TLS para fonts.gstatic.com) e liga
// `adjustFontFallback` por padrão, que calibra as métricas do Georgia — é o que
// segura o CLS da data-monumento, que está DENTRO da primeira dobra.
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
  variable: '--font-serif',
})

export const viewport: Viewport = {
  themeColor: '#0D0D0D',
  width: 'device-width',
  initialScale: 1,
}

// Escopa a fonte Inter com as feature settings que aproximam o SF Pro (ss03).
// Cada seção declara a própria superfície (dark ↔ light), então não dependemos
// do data-theme global do app.
export default function SaoGeraldoLayout({ children }: { children: ReactNode }) {
  return (
    <div
      // Só a className muda em relação ao original: `playfair.variable` publica
      // --font-serif neste escopo. O <GoogleTagManager /> continua sendo o
      // primeiro filho deste div — a posição do script no DOM é intocável.
      className={playfair.variable}
      style={{
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontFeatureSettings: interFeatures,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      <GoogleTagManager />
      {children}
    </div>
  )
}
