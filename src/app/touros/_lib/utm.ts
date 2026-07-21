// Captura de atribuição de campanha (Meta/Google). Os criativos chegam com
// ?utm_source=...&utm_medium=...&utm_campaign=...&utm_content=...&ad-id=...
// Capturamos na 1ª visita e guardamos em sessionStorage para sobreviver a
// recargas e navegação — assim o lead carrega a origem certa mesmo que a query
// saia da URL. Espelha captureUtms de jmp-landing/src/components/Form.tsx.

export interface Utm {
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_content: string
  ad_id: string
  // IDs de clique pago — amarram lead qualificado ao anúncio e habilitam
  // enhanced conversions (Google) / advanced matching (Meta).
  fbclid: string
  gclid: string
}

export const EMPTY_UTM: Utm = {
  utm_source: '',
  utm_medium: '',
  utm_campaign: '',
  utm_content: '',
  ad_id: '',
  fbclid: '',
  gclid: '',
}

const STORAGE_KEY = 'touros_utm'

export function captureUtms(): Utm {
  if (typeof window === 'undefined') return EMPTY_UTM
  try {
    const p = new URLSearchParams(window.location.search)
    const fromUrl: Utm = {
      utm_source: p.get('utm_source') ?? '',
      utm_medium: p.get('utm_medium') ?? '',
      utm_campaign: p.get('utm_campaign') ?? '',
      utm_content: p.get('utm_content') ?? '',
      // O criativo manda ?ad-id=... (com hífen); aceitamos as duas grafias.
      ad_id: p.get('ad-id') ?? p.get('ad_id') ?? '',
      fbclid: p.get('fbclid') ?? '',
      gclid: p.get('gclid') ?? '',
    }
    if (Object.values(fromUrl).some(Boolean)) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fromUrl))
      return fromUrl
    }
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) return { ...EMPTY_UTM, ...JSON.parse(stored) }
  } catch {
    /* sessionStorage indisponível — segue sem atribuição */
  }
  return EMPTY_UTM
}

export function hasUtm(u: Utm): boolean {
  return Object.values(u).some(Boolean)
}
