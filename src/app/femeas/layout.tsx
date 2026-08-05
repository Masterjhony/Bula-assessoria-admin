import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { interFeatures } from './_lib/tokens'
import { GoogleTagManager } from './_components/GoogleTagManager'

// Metadata comercial + OG da landing de FÊMEAS (segundo funil perpétuo, roda ao
// mesmo tempo que o de touros).
//
// A promessa aqui não é "compre o animal certo" como no /touros — é "monte o seu
// criatório". Quem compra fêmea PO está começando uma indústria de seleção para
// fazer os próprios touros, não melhorando o bezerro de uma vacada comercial.
// A copy definitiva sai na Fase 4, com revisão do João Antônio; o que está aqui
// é o mínimo para o OG não sair quebrado se a página subir antes disso.
export const metadata: Metadata = {
  // [PENDENTE C-10] Domínio ainda não confirmado com o cliente. Enquanto não
  // fechar, o metadataBase aponta para o subdomínio pretendido — se mudar, é
  // aqui e no DNS, em nenhum outro lugar.
  metadataBase: new URL('https://femeas.bulaassessoria.com'),
  title: 'Crie sua própria marca de Nelore PO | Bula Assessoria',
  description:
    'Matrizes PO para quem vai montar o próprio criatório: embriões, bezerras, novilhas, prenhes, pacote 3 em 1 e doadoras. Parcelamento em 30× no boleto, frete grátis e assessoria técnica gratuita.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Crie sua própria marca de Nelore PO | Bula Assessoria',
    description:
      'Assessoria técnica gratuita para montar seu criatório. Embriões, bezerras, novilhas, prenhes e doadoras em 30× no boleto.',
    type: 'website',
    locale: 'pt_BR',
    // JPG de propósito — o WhatsApp não renderiza WEBP de forma confiável no
    // preview (ver src/app/saogeraldo/README.md). Asset pendente: ver
    // public/femeas/README.md.
    images: [
      {
        url: '/femeas/og-femeas.jpg',
        width: 1200,
        height: 630,
        alt: 'Matrizes Nelore PO a pasto',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Crie sua própria marca de Nelore PO | Bula Assessoria',
    description:
      'Assessoria técnica gratuita para montar seu criatório. Embriões, bezerras, novilhas, prenhes e doadoras em 30× no boleto.',
    images: ['/femeas/og-femeas.jpg'],
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
export default function FemeasLayout({ children }: { children: ReactNode }) {
  return (
    <div
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
