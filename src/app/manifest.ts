import type { MetadataRoute } from 'next'

// Manifest do PWA "Bula Assessoria". Servido em /manifest.webmanifest pelo Next.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bula Assessoria Pecuária',
    short_name: 'Bula',
    description: 'Painel administrativo e sistema da Bula Assessoria Pecuária.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#000000',
    theme_color: '#000000',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
