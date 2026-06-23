'use client'

import { useCallback, useEffect, useState } from 'react'

// Fonte única da lógica de instalação do PWA, compartilhada pelo banner
// (InstallPrompt) e pelos botões de navbar (InstallButton).
//
//  - Android / Chromium disparam `beforeinstallprompt`; guardamos o evento e
//    o disparamos sob demanda via promptInstall().
//  - iOS / Safari nunca disparam o evento — só dá pra instalar manualmente,
//    então sinalizamos status 'ios' pra UI mostrar as instruções.
//  - Quando o app já roda standalone (instalado), status 'installed' → esconde tudo.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type PwaInstallStatus = 'idle' | 'installable' | 'ios' | 'installed'

// Escopo de módulo: o evento costuma disparar antes de alguns componentes
// montarem (ex.: botão de navbar). Guardar aqui garante que montagens tardias
// ainda enxerguem a instalabilidade.
let sharedDeferred: BeforeInstallPromptEvent | null = null

function detectStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari expõe navigator.standalone (não tipado).
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function detectIos() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const iOSDevice = /iphone|ipad|ipod/i.test(ua)
  // iPadOS recente se identifica como Mac, mas tem touch.
  const iPadOSAsMac = /macintosh/i.test(ua) && 'ontouchend' in document
  return iOSDevice || iPadOSAsMac
}

export function usePwaInstall() {
  const [status, setStatus] = useState<PwaInstallStatus>('idle')
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(sharedDeferred)

  useEffect(() => {
    if (detectStandalone()) {
      setStatus('installed')
      return
    }
    if (sharedDeferred) setStatus('installable')
    else if (detectIos()) setStatus('ios')

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      sharedDeferred = e as BeforeInstallPromptEvent
      setDeferred(sharedDeferred)
      setStatus('installable')
    }
    const onInstalled = () => {
      sharedDeferred = null
      setDeferred(null)
      setStatus('installed')
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const evt = deferred ?? sharedDeferred
    if (!evt) return 'unavailable'
    await evt.prompt()
    const choice = await evt.userChoice
    // O evento só pode ser usado uma vez; limpa pra não reusar.
    sharedDeferred = null
    setDeferred(null)
    if (choice.outcome === 'accepted') setStatus('installed')
    return choice.outcome
  }, [deferred])

  return { status, promptInstall, isIos: detectIos() }
}
