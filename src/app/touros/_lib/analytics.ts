// ─────────────────────────────────────────────────────────────────────────
// Tracking & conversão da landing de touros — PostHog + Meta Pixel + GA4.
//
// Ponto ÚNICO de disparo: o Formulario chama trackLeadConversion() no sucesso e
// os três provedores recebem o evento. Todos fazem NO-OP se a env do ID estiver
// vazia — deploy sem IDs configurados não quebra a página.
//
// PRINCÍPIO (auditoria de mídia): não otimizar por "cadastrou", e sim por
// "cadastrou E vale" (MQL = ≥100 cabeças + IE). Por isso o evento carrega
// `value`/`currency` diferenciado por MQL — o algoritmo aprende a trazer o lead
// certo mesmo com pouco volume (value-based bidding). O veredito de MQL vem do
// SERVIDOR (route.ts), não é recalculado no client.
//
// IDs via env (NEXT_PUBLIC_*), configurados no Vercel por ambiente:
//   NEXT_PUBLIC_POSTHOG_KEY / NEXT_PUBLIC_POSTHOG_HOST
//   NEXT_PUBLIC_META_PIXEL_ID
//   NEXT_PUBLIC_GA4_ID
// ─────────────────────────────────────────────────────────────────────────
import type { Utm } from './utm'

/* Acesso não-tipado às globais dos SDKs (fbq/gtag/dataLayer) — evita conflito
   com augmentations de Window de outras partes do app. */
function w(): any {
  return typeof window === 'undefined' ? undefined : window
}

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID
const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID

// Peso de valor por qualidade do lead (proxy p/ value-based bidding). Ajustar
// os pesos com o cliente; o que importa é o GRADIENTE MQL > não-MQL.
const VALUE_MQL = 100
const VALUE_NON_MQL = 10
const CURRENCY = 'BRL'

let started = false
// posthog-js é carregado sob demanda para não pesar o bundle inicial.
let posthog: typeof import('posthog-js').default | null = null

async function loadPosthog() {
  if (posthog || !POSTHOG_KEY) return posthog
  try {
    const mod = await import('posthog-js')
    posthog = mod.default
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false,
      persistence: 'localStorage+cookie',
      // Mapa de calor: captura cliques, rageclicks, movimento do mouse e scroll
      // (eventos $$heatmap, por URL) → alimenta a aba "Heatmaps" do PostHog.
      // `true` força no client mesmo se o toggle remoto do projeto estiver off.
      // Depende de autocapture (ligado por padrão) para o clickmap do Toolbar.
      enable_heatmaps: true,
    })
  } catch {
    posthog = null
  }
  return posthog
}

function loadMetaPixel() {
  const win = w()
  if (!win || !META_PIXEL_ID || win.fbq) return
  /* Snippet oficial do Meta Pixel, inline. */
  ;(function (f: any, b: Document, e: string, v: string) {
    if (f.fbq) return
    const n: any = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
    })
    if (!f._fbq) f._fbq = n
    n.push = n
    n.loaded = true
    n.version = '2.0'
    n.queue = []
    const t = b.createElement(e) as HTMLScriptElement
    t.async = true
    t.src = v
    const s = b.getElementsByTagName(e)[0]
    s.parentNode?.insertBefore(t, s)
  })(win, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
  win.fbq('init', META_PIXEL_ID)
}

function loadGa4() {
  const win = w()
  if (!win || !GA4_ID || win.gtag) return
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`
  document.head.appendChild(s)
  win.dataLayer = win.dataLayer || []
  // Shim oficial do gtag: empurra o objeto `arguments` (NÃO um array) — o
  // gtag.js só interpreta comandos (config/event) nesse formato.
  win.gtag = function gtag() {
    win.dataLayer.push(arguments)
  }
  win.gtag('js', new Date())
  win.gtag('config', GA4_ID, { send_page_view: false })
}

/** Inicializa os provedores e registra o pageview. Chamar 1x no mount da rota. */
export async function initAnalytics(utm: Utm) {
  const win = w()
  if (started || !win) return
  started = true

  loadMetaPixel()
  loadGa4()
  const ph = await loadPosthog()

  const utmProps = utm as unknown as Record<string, string>
  ph?.capture('touros_view', { ...utmProps })
  win.fbq?.('track', 'PageView')
  win.gtag?.('event', 'page_view', { page_title: 'Landing Touros', ...utmProps })
}

/** Micro-conversões do funil. Vão ao PostHog e, quando fizer sentido, ao Meta/GA4. */
export function trackFunnel(
  event: string,
  props?: Record<string, unknown>,
  opts?: { meta?: string; ga?: string },
) {
  const win = w()
  posthog?.capture(event, props)
  if (opts?.meta) win?.fbq?.('trackCustom', opts.meta, props)
  if (opts?.ga) win?.gtag?.('event', opts.ga, props)
}

/**
 * Conversão de cadastro. Disparo ÚNICO chamado no submit bem-sucedido do form.
 * Diferencia MQL (≥100 cabeças + IE) via `value` — o algoritmo aprende a trazer
 * o lead que vale. `eventId` é o mesmo do futuro CAPI server-side (dedup).
 *  · Meta: UM evento `Lead` (com value/currency + eventID) — NÃO dispara
 *    CompleteRegistration junto para não contar em dobro.
 *  · GA4: generate_lead (value/currency + lead_type).
 *  · PostHog: touros_lead_submitted (com is_mql para segmentar o funil).
 */
export function trackLeadConversion(payload: {
  utm: Utm
  leadId?: string | null
  isMql?: boolean
  eventId?: string
}) {
  const win = w()
  if (!win) return
  const utmProps = payload.utm as unknown as Record<string, string>
  const value = payload.isMql ? VALUE_MQL : VALUE_NON_MQL

  posthog?.capture('touros_lead_submitted', {
    lead_id: payload.leadId ?? undefined,
    is_mql: payload.isMql === true,
    value,
    ...utmProps,
  })

  win.fbq?.(
    'track',
    'Lead',
    { value, currency: CURRENCY, lead_type: payload.isMql ? 'mql' : 'non_mql' },
    payload.eventId ? { eventID: payload.eventId } : undefined,
  )

  win.gtag?.('event', 'generate_lead', {
    value,
    currency: CURRENCY,
    lead_type: payload.isMql ? 'mql' : 'non_mql',
    lead_id: payload.leadId ?? undefined,
    ...utmProps,
  })
}
