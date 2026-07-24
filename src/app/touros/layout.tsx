import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { interFeatures } from './_lib/tokens'

// Metadata comercial + OG da landing de touros (funil perpétuo).
export const metadata: Metadata = {
  // Base para resolver a URL absoluta da imagem OG (ads/redes). Ajustar se o
  // domínio final mudar.
  metadataBase: new URL('https://touros.bulaassessoria.com'),
  title: 'Compre o touro certo | Bula Assessoria',
  description:
    'Assessoria gratuita de genética para comprar touros. A equipe da Bula te ajuda a ler o catálogo, entender a genética e escolher os touros certos para o seu rebanho.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'O touro certo muda o seu rebanho | Bula Assessoria',
    description:
      'Assessoria gratuita de genética. Receba uma seleção de touros com a curadoria da Bula.',
    type: 'website',
    locale: 'pt_BR',
    images: [{ url: '/jmp/galeria-touros/IMG_0037.jpg', width: 1200, height: 630, alt: 'Touro Nelore PO' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#0D0D0D',
  width: 'device-width',
  initialScale: 1,
}

// Escopa a fonte Inter com as feature settings que aproximam o SF Pro (ss03).
// A landing é sempre dark-default no chrome, mas cada seção declara sua própria
// superfície (dark ↔ light) — então não dependemos do data-theme global.
export default function TourosLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontFeatureSettings: interFeatures,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      }}
    >
      {children}
    </div>
  )
}
