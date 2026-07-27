// Rotas públicas de marketing (tráfego pago / leads externos) que NÃO devem
// receber o PWA interno da Bula — nem o banner "Instalar o app", nem o service
// worker do app admin. Elas são páginas comerciais para visitantes externos.
export const PUBLIC_LANDING_PREFIXES = [
  '/touros',
  '/obrigado-touros-mql',
  '/obrigado-touros-lead',
  // Lançamento "Leilão Touros São Geraldo e 7P". Sem estas entradas o banner
  // "Instalar o app" (fixed bottom, z-100, no layout raiz) cobria o checkbox de
  // consentimento e o botão de enviar do formulário — ou seja, tapava o ÚNICO
  // elemento de conversão de uma página de tráfego pago.
  '/saogeraldo',
  '/obrigado-saogeraldo-mql',
  '/obrigado-saogeraldo-lead',
]

// Subdomínios de landing pública. O host resolve antes do pathname porque em
// `saogeraldo.bulaassessoria.com` a raiz `/` também é landing.
const PUBLIC_LANDING_SUBDOMAINS = ['touros.', 'saogeraldo.']

export function isPublicLanding(
  pathname: string | null | undefined,
  hostname?: string | null,
): boolean {
  const normalizedHost = String(hostname ?? '').toLowerCase().split(':')[0]
  if (
    PUBLIC_LANDING_SUBDOMAINS.some(
      (sub) => normalizedHost === `${sub}localhost` || normalizedHost.startsWith(sub),
    )
  ) {
    return true
  }
  if (!pathname) return false
  return PUBLIC_LANDING_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}
