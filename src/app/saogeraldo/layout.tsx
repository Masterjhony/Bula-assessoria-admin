import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Playfair_Display, Cormorant_Garamond } from 'next/font/google'
import { interFeatures } from './_lib/tokens'
import { EVENTO } from './_lib/evento'
import { GoogleTagManager } from './_components/GoogleTagManager'

const TITULO = `${EVENTO.nome} — ${EVENTO.dataExtenso} | Bula Assessoria`
const DESCRICAO =
  '150 reprodutores Nelore PO triplamente avaliados, das fazendas São Geraldo e 7P Agro. Pagamento em até 30 parcelas e frete grátis na maior parte do país. Receba o catálogo completo.'

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
    // preview do link, e o WhatsApp é o principal canal de compartilhamento
    // aqui. Recortado da capa do catálogo — os dois fundadores e a boiada.
    images: [
      {
        url: '/saogeraldo/og-saogeraldo.jpg',
        width: 1200,
        height: 630,
        alt: 'Os fundadores da Fazenda São Geraldo e da 7P Agro diante de uma boiada Nelore ao pôr do sol',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITULO,
    description: DESCRICAO,
    images: ['/saogeraldo/og-saogeraldo.jpg'],
  },
}

// As DUAS famílias que o catálogo trouxe, e só nesta rota. O root layout já
// carrega Inter, Oswald, Pinyon e Plex Mono por <link> para o app inteiro;
// nenhuma serifa entra lá porque serifa não é da marca Bula, é do leilão.
//
// Por que só estes pesos, e não os cinco do briefing: cada peso de cada
// família custa ~22 KB de woff2 latino. O desenho de referência pedia
// Playfair 400/500/700/900 + Cormorant 400/500 + Barlow 400–900 + Barlow
// Condensed + Inter — cerca de 300 KB de fonte nova. Numa landing de tráfego
// pago e mobile, onde o Hero já brigou por 62 KB no caminho do LCP, isso
// apagaria o ganho inteiro.
//
// Os papéis de Barlow e Barlow Condensed foram absorvidos por Oswald (que já
// vem do root e é a condensada da marca) e por Inter. Sobram duas famílias e
// três pesos: ~67 KB.
//
// `next/font` auto-hospeda o woff2 (zero DNS/TLS para fonts.gstatic.com) e
// liga `adjustFontFallback`, que calibra as métricas do fallback — é o que
// segura o CLS da data-monumento, que está DENTRO da primeira dobra.
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '700'], // 400 = data e detalhe · 700 = título de seção e valor
  display: 'swap',
  variable: '--font-serif',
})

// Cormorant Garamond serve a UM papel só: o eyebrow em caixa alta com
// tracking largo ("TRADIÇÃO QUE GERA RESULTADOS!"). Peso único.
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500'],
  display: 'swap',
  variable: '--font-cerimonia',
})

export const viewport: Viewport = {
  themeColor: '#1A130D', // carvão profundo — a barra do navegador acompanha a página
  width: 'device-width',
  initialScale: 1,
}

// Escopa a fonte Inter com as feature settings que aproximam o SF Pro (ss03).
// Cada seção declara a própria superfície, então não dependemos do data-theme
// global do app.
export default function SaoGeraldoLayout({ children }: { children: ReactNode }) {
  return (
    <div
      // As duas variáveis de fonte valem só dentro deste escopo. Fora da rota
      // elas não existem e o fallback Georgia assume — de propósito.
      // O <GoogleTagManager /> continua sendo o primeiro filho: a posição do
      // script no DOM é intocável.
      className={`${playfair.variable} ${cormorant.variable}`}
      style={{
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        fontFeatureSettings: interFeatures,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        backgroundColor: '#1A130D',
      }}
    >
      <GoogleTagManager />
      {children}
    </div>
  )
}
