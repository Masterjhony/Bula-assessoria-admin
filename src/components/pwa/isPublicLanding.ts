// Rotas públicas de marketing (tráfego pago / leads externos) que NÃO devem
// receber o PWA interno da Bula — nem o banner "Instalar o app", nem o service
// worker do app admin. Elas são páginas comerciais para visitantes externos.
export const PUBLIC_LANDING_PREFIXES = ['/touros', '/obrigado-touros-mql', '/obrigado-touros-lead']

export function isPublicLanding(
  pathname: string | null | undefined,
  hostname?: string | null,
): boolean {
  const normalizedHost = String(hostname ?? '').toLowerCase().split(':')[0]
  if (normalizedHost === 'touros.localhost' || normalizedHost.startsWith('touros.')) {
    return true
  }
  if (!pathname) return false
  return PUBLIC_LANDING_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
