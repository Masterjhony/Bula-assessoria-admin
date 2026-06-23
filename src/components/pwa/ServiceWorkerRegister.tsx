'use client'

import { useEffect } from 'react'

// Registra o service worker do PWA no client após o carregamento da página.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

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
  }, [])

  return null
}
