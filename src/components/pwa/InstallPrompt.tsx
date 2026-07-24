'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { usePwaInstall } from './usePwaInstall'
import { isPublicLanding } from './isPublicLanding'

// Banner discreto de instalação do PWA (aparece no rodapé). A detecção de
// dispositivo/instalabilidade vem do hook usePwaInstall; aqui só cuidamos da
// apresentação e da dispensa por ~30 dias.
//  - Android/Chrome: botão "Instalar" que dispara o prompt nativo.
//  - iOS/Safari: instruções "Adicionar à Tela de Início".

const DISMISS_KEY = 'bula-pwa-install-dismissed-at'
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000 // 30 dias

function recentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    return Date.now() - Number(raw) < DISMISS_MS
  } catch {
    return false
  }
}

export function InstallPrompt() {
  const pathname = usePathname()
  const { status, promptInstall } = usePwaInstall()
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDismissed(recentlyDismissed())
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      /* ignore */
    }
  }

  async function handleInstall() {
    await promptInstall()
    dismiss()
  }

  const showIosHint = status === 'ios'
  const publicLanding = isPublicLanding(
    pathname,
    typeof window === 'undefined' ? undefined : window.location.hostname,
  )
  // Landings públicas (tráfego pago) não mostram o banner do PWA interno.
  const visible =
    !publicLanding && !dismissed && (status === 'installable' || status === 'ios')
  if (!visible) return null

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[100] flex justify-center px-3 pointer-events-none"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-[rgba(200,169,110,0.25)] bg-[#1d2c1d] text-[#f3f1e9] shadow-2xl">
        <div className="flex items-start gap-3 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="Bula" className="h-11 w-11 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Instalar o app da Bula</p>
            {showIosHint ? (
              <p className="mt-1 text-xs leading-relaxed opacity-80">
                Toque em{' '}
                <span className="inline-flex items-center gap-1 font-medium">
                  Compartilhar{' '}
                  <span aria-hidden className="inline-block align-middle">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline">
                      <path d="M12 16V4" />
                      <path d="m8 8 4-4 4 4" />
                      <path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
                    </svg>
                  </span>
                </span>{' '}
                e depois <span className="font-medium">&ldquo;Adicionar à Tela de Início&rdquo;</span>.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-relaxed opacity-80">
                Acesso rápido na tela inicial, em tela cheia e com suporte offline.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dispensar"
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 opacity-70 transition hover:bg-white/10 hover:opacity-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        {!showIosHint && (
          <div className="flex gap-2 px-4 pb-4">
            <button
              type="button"
              onClick={handleInstall}
              className="flex-1 rounded-full bg-[#f3f1e9] px-4 py-2.5 text-sm font-semibold text-[#1d2c1d] transition hover:opacity-90"
            >
              Instalar
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full px-4 py-2.5 text-sm font-medium opacity-70 transition hover:opacity-100"
            >
              Agora não
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
