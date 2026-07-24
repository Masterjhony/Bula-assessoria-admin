// ─────────────────────────────────────────────────────────────────────────
// Tracking & conversão da landing de touros — PostHog + Google Tag Manager.
//
// GA4 e Meta Pixel NÃO são disparados aqui: as tags vivem DENTRO do GTM
// (container do subdomínio, ver _components/GoogleTagManager). Este módulo só
// empurra eventos semânticos para o `dataLayer` — as tags do GTM disparam a
// partir deles. Assim não há disparo dobrado (client + GTM).
//
// PostHog continua direto (produto/heatmaps, fora do GTM). NO-OP se a env do
// key estiver vazia — deploy sem PostHog configurado não quebra a página.
//
// PRINCÍPIO (auditoria de mídia): não otimizar por "cadastrou", e sim por
// "cadastrou E vale" (MQL = ≥100 cabeças + IE). Por isso o evento de conversão
// carrega `value`/`currency` diferenciado por MQL — o algoritmo aprende a trazer
// o lead certo mesmo com pouco volume (value-based bidding). O veredito de MQL
// vem do SERVIDOR (route.ts), não é recalculado no client. O `event_id` permite
// dedup com o CAPI server-side (a tag Meta do GTM deve usá-lo como eventID).
//
// IDs via env (NEXT_PUBLIC_*):
//   NEXT_PUBLIC_POSTHOG_KEY / NEXT_PUBLIC_POSTHOG_HOST
//   (o ID do GTM fica em NEXT_PUBLIC_GTM_ID, lido no componente GoogleTagManager)
// ─────────────────────────────────────────────────────────────────────────
import type { Utm } from './utm'

/* Acesso não-tipado às globais (dataLayer) — evita conflito com augmentations
   de Window de outras partes do app. */
function w(): any {
  return typeof window === 'undefined' ? undefined : window
}

/** Empurra um evento para o dataLayer do GTM. Garante o array (o snippet do GTM
    também o inicializa, mas pode ainda não ter executado no primeiro push). */
function pushDataLayer(payload: Record<string, unknown>) {
  const win = w()
  if (!win) return
  win.dataLayer = win.dataLayer || []
  win.dataLayer.push(payload)
}

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

// Peso de valor por qualidade do lead (proxy p/ value-based bidding). Ajustar
// os pesos com o cliente; o que importa é o GRADIENTE MQL > não-MQL.
const VALUE_MQL = 100
const VALUE_NON_MQL = 10
const CURRENCY = 'BRL'

// Chave onde o submit guarda o payload da conversão para a página de obrigado
// consumir (o Meta Lead / GA4 generate_lead dispara LÁ, não aqui — ver
// trackLeadConversion / firePendingLeadConversion).
const LEAD_STASH_KEY = 'touros_lead_conv'

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

/** Inicializa os provedores e registra o pageview. Chamar 1x no mount da rota.
    O pageview de GA4/Meta é responsabilidade das tags do GTM (gatilho All Pages);
    aqui só registramos no PostHog e sinalizamos o view ao dataLayer com as UTMs. */
export async function initAnalytics(utm: Utm) {
  const win = w()
  if (started || !win) return
  started = true

  const ph = await loadPosthog()
  const utmProps = utm as unknown as Record<string, string>

  ph?.capture('touros_view', { ...utmProps })
  pushDataLayer({ event: 'touros_view', ...utmProps })
}

/** Micro-conversões do funil. Vão ao PostHog e ao dataLayer (GTM). `opts.meta`/
    `opts.ga` viram hints no payload — a tag correspondente no GTM decide se e
    como mapeia (ex.: gatilho no evento `touros_form_started` → Meta
    InitiateCheckout). */
export function trackFunnel(
  event: string,
  props?: Record<string, unknown>,
  opts?: { meta?: string; ga?: string },
) {
  posthog?.capture(event, props)
  pushDataLayer({
    event,
    ...props,
    ...(opts?.meta ? { meta_event: opts.meta } : {}),
    ...(opts?.ga ? { ga_event: opts.ga } : {}),
  })
}

/**
 * Conversão de cadastro. Disparo ÚNICO chamado no submit bem-sucedido do form.
 * Diferencia MQL (≥100 cabeças + IE) via `value` — o algoritmo aprende a trazer
 * o lead que vale. `event_id` é o mesmo do CAPI server-side (dedup): a tag Meta
 * do GTM deve passá-lo como eventID.
 *  · PostHog: touros_lead_submitted (dispara AQUI, no submit — com is_mql).
 *  · dataLayer/GTM: a conversão `touros_lead` dispara na PÁGINA DE OBRIGADO
 *    (pedido: gatilho na URL /obrigado-touros-*), não aqui. Guardamos o payload
 *    no sessionStorage e firePendingLeadConversion() o empurra no mount de lá.
 *    A partir do evento `touros_lead` o GTM dispara UM Meta `Lead` (value/
 *    currency + eventID) e o GA4 `generate_lead`. NÃO configurar
 *    CompleteRegistration junto para não contar em dobro.
 */
export function trackLeadConversion(payload: {
  utm: Utm
  leadId?: string | null
  isMql?: boolean
  eventId?: string
}) {
  const win = w()
  const utmProps = payload.utm as unknown as Record<string, string>
  const value = payload.isMql ? VALUE_MQL : VALUE_NON_MQL
  const leadType = payload.isMql ? 'mql' : 'non_mql'

  posthog?.capture('touros_lead_submitted', {
    lead_id: payload.leadId ?? undefined,
    is_mql: payload.isMql === true,
    value,
    ...utmProps,
  })

  // Guarda a conversão para a página de obrigado disparar. sessionStorage
  // sobrevive à navegação SPA (mesmo domínio) e some ao fechar a aba. Só quem
  // passou pelo form deixa esse rastro → hit direto na URL não gera conversão.
  if (win) {
    try {
      win.sessionStorage.setItem(
        LEAD_STASH_KEY,
        JSON.stringify({
          value,
          currency: CURRENCY,
          lead_type: leadType,
          lead_id: payload.leadId ?? undefined,
          event_id: payload.eventId ?? undefined,
          ...utmProps,
        }),
      )
    } catch {
      /* storage indisponível (aba privada/quota) — sem conversão no obrigado */
    }
  }
}

/**
 * Empurra o evento de conversão `touros_lead` ao dataLayer no MOUNT da página de
 * obrigado, consumindo o payload guardado no submit. É daqui que o GTM aciona a
 * tag de Meta Lead / GA4 generate_lead (gatilho: Custom Event `touros_lead`).
 * NO-OP se não houver payload (hit direto na URL, refresh, bookmark) — assim não
 * conta conversão fantasma. Dispara no máximo UMA vez por conversão (consome a
 * chave). Chamar 1x no mount de /obrigado-touros-*.
 */
export function firePendingLeadConversion() {
  const win = w()
  if (!win) return
  let raw: string | null = null
  try {
    raw = win.sessionStorage.getItem(LEAD_STASH_KEY)
  } catch {
    return
  }
  if (!raw) return
  try {
    win.sessionStorage.removeItem(LEAD_STASH_KEY)
  } catch {
    /* segue: melhor arriscar duplicar que perder a conversão */
  }
  let conv: Record<string, unknown>
  try {
    conv = JSON.parse(raw)
  } catch {
    return
  }
  pushDataLayer({ event: 'touros_lead', ...conv })
}
