import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bula Assessoria',
  description: 'Painel administrativo Bula.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/logo-bula.png" type="image/png" />
      </head>
      <body>{children}</body>
    </html>
  )
}
