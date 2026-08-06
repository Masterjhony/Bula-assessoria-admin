// ─────────────────────────────────────────────────────────────────────────
// Tracking da landing do perpétuo de FÊMEAS — PostHog (produto/heatmaps).
//
// Este módulo NÃO toca o dataLayer nem dispara Meta/GA4 (INV-2). A conversão é
// medida 100% no GTM: a tag de Meta dispara pelo gatilho Page View da URL de
// obrigado (/obrigado-femeas-mql), que carrega por completo (ver Formulario).
// Empurrar eventos ao dataLayer aqui só criava ruído — o container tem um
// acionador catch-all (Custom Event "Event não contém gtm.") que dispararia
// Meta/GA4 a cada micro-evento do funil e duplicava PageView.
//
// Este arquivo foi forkado do /saogeraldo, NÃO do /touros: o /touros empurra
// eventos ao dataLayer (src/app/touros/_lib/analytics.ts:33-38) e o /saogeraldo
// não, e a razão do /saogeraldo é a que vale (o acionador catch-all). Auditar o
// /touros é item separado — não desfazer esta escolha por simetria.
//
// PostHog é NO-OP se a env do key estiver vazia — deploy sem ele não quebra.
//
// PRINCÍPIO (auditoria de mídia): não otimizar por "cadastrou", e sim por
// "cadastrou E vale". A separação é feita por URL de obrigado
// (/obrigado-femeas-mql vs -lead) + valor fixo na própria tag do GTM. O veredito
// vem do SERVIDOR (route.ts), nunca do browser (INV-3).
//
// ATENÇÃO — a régua de qualificação de FÊMEAS não é a de touros. A régua atual
// (DEFAULT_JMP_MQL_RULE = ≥100 cabeças + IE) foi desenhada para comprador de
// touro e REPROVARIA o público-alvo declarado deste funil: quem está começando
// um criatório. A régua de fêmeas é definida na Fase 5 e depende de decisão do
// cliente (pendência C-04). Não reutilizar a de touros por conveniência.
//
// IDs via env (NEXT_PUBLIC_*):
//   NEXT_PUBLIC_POSTHOG_KEY / NEXT_PUBLIC_POSTHOG_HOST
//   (o ID do GTM fica em NEXT_PUBLIC_GTM_ID, lido no componente GoogleTagManager)
// ─────────────────────────────────────────────────────────────────────────
import type { Utm } from './utm'

/* Acesso não-tipado às globais — evita conflito com augmentations de Window de
   outras partes do app. */
function w(): any {
  return typeof window === 'undefined' ? undefined : window
}

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

// Peso de valor por qualidade do lead (proxy p/ value-based bidding). Ajustar
// os pesos com o cliente; o que importa é o GRADIENTE MQL > não-MQL.
const VALUE_MQL = 100
const VALUE_NON_MQL = 10

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
    Só PostHog: NÃO empurramos nada ao dataLayer para não acionar as tags de
    Meta/GA4 do GTM durante a navegação — a conversão dispara só na página de
    obrigado (gatilho Page View da URL, ver Formulario/trackLeadConversion). */
export async function initAnalytics(utm: Utm) {
  const win = w()
  if (started || !win) return
  started = true

  const ph = await loadPosthog()
  const utmProps = utm as unknown as Record<string, string>

  ph?.capture('femeas_view', { ...utmProps })
}

/** Micro-conversões do funil — SÓ PostHog (produto/heatmaps). De propósito não
    tocam o dataLayer: o container tem um acionador catch-all (Custom Event
    "Event não contém gtm.") que dispararia Meta/GA4 a cada evento do funil.
    `opts` é mantido por compat. com os callers, mas não é mais usado. */
export function trackFunnel(
  event: string,
  props?: Record<string, unknown>,
  _opts?: { meta?: string; ga?: string },
) {
  posthog?.capture(event, props)
}

/**
 * Conversão de cadastro. Disparo ÚNICO chamado no submit bem-sucedido do form.
 * Diferencia MQL (≥100 cabeças + IE) via `value` — o algoritmo aprende a trazer
 * o lead que vale. `event_id` é o mesmo do CAPI server-side (dedup): a tag Meta
 * do GTM deve passá-lo como eventID.
 *  · PostHog: femeas_lead_submitted (com is_mql/value para segmentar o funil).
 *  · Meta/GA4: a conversão NÃO dispara aqui. A tag (fb_conversions_mpi) roda no
 *    GTM pelo gatilho Page View da URL de obrigado (/obrigado-femeas-mql) — a
 *    navegação para lá é um load completo (ver Formulario), então o Page View
 *    dispara sozinho. Valor/moeda ficam fixos na própria tag do GTM.
 */
export function trackLeadConversion(payload: {
  utm: Utm
  leadId?: string | null
  isMql?: boolean
  eventId?: string
}) {
  const utmProps = payload.utm as unknown as Record<string, string>
  const value = payload.isMql ? VALUE_MQL : VALUE_NON_MQL

  posthog?.capture('femeas_lead_submitted', {
    lead_id: payload.leadId ?? undefined,
    is_mql: payload.isMql === true,
    value,
    ...utmProps,
  })
}
