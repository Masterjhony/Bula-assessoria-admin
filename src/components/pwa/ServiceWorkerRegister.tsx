'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { isPublicLanding } from './isPublicLanding'

// Registra o service worker do PWA no client após o carregamento da página.
// Landings públicas (tráfego pago) NÃO registram o SW interno da Bula — ele é
// do app admin e não deve controlar páginas de visitantes externos.
export function ServiceWorkerRegister() {
  const pathname = usePathname()
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (isPublicLanding(pathname)) return

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          console.error('Falha ao registrar o service worker:', err)
        })
    }

    if (document.readyState === 'complete') {
      register()
    } else {
      window.addEventListener('load', register)
      return () => window.removeEventListener('load', register)
    }
  }, [pathname])

  return null
}
