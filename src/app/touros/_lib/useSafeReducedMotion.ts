'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

// O snapshot usado no SSR também é usado na primeira hidratação do client.
// Assim os atributos iniciais do Framer Motion são idênticos nos dois lados;
// logo depois, useSyncExternalStore aplica a preferência real do dispositivo.
function getServerSnapshot() {
  return false
}

export function useSafeReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
