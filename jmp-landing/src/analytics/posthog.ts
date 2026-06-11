// posthog-js (~200 KiB) é carregado sob demanda via import() dentro de
// initJmpAnalytics — assim ele NÃO entra no bundle crítico da página e não
// concorre com o primeiro paint. Até carregar, `ph` é null e todo capture é
// no-op (safeCapture já guarda por analyticsReady).
type Posthog = typeof import('posthog-js').default
let ph: Posthog | null = null

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || 'phc_xARtaJasktizrT8W5HFNpjyYzzx3hhubLCKrG9MMPnFg'
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'
const POSTHOG_UI_HOST = import.meta.env.VITE_POSTHOG_UI_HOST || 'https://us.posthog.com'

const APP_PROPS = {
  app: 'jmp-landing',
  landing: 'nelore-jmp',
  domain: 'jmp.bulaassessoria.com',
}

type CaptureOptions = {
  transport?: 'XHR' | 'sendBeacon'
}

type FieldState = Record<string, boolean>

const formState = {
  started: false,
  submitted: false,
  startedAt: 0,
  currentStep: 1,
  touchedFields: new Set<string>(),
  completedFields: new Set<string>(),
  viewedSteps: new Set<number>(),
}

let analyticsReady = false
let behaviorBound = false
let pageStart = 0
let activeSeconds = 0
let lastActivity = 0
let maxScrollDepth = 0
let finalEventSent = false
const scrollThresholds = [25, 50, 75, 90, 100]
const reachedScrollThresholds = new Set<number>()
const timeMilestones = [15, 30, 60, 120, 300]

declare global {
  interface Window {
    posthog?: Posthog
  }
}

function safeCapture(event: string, properties: Record<string, unknown> = {}, options?: CaptureOptions) {
  if (!analyticsReady || !ph) return
  ph.capture(event, { ...APP_PROPS, ...properties }, options)
}

function readCampaignProperties() {
  const params = new URLSearchParams(window.location.search)
  return {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
    utm_content: params.get('utm_content') || undefined,
    ad_id: params.get('ad-id') || params.get('ad_id') || undefined,
  }
}

function currentPathProps() {
  return {
    path: window.location.pathname,
    hash: window.location.hash || undefined,
    title: document.title,
  }
}

function getScrollDepth() {
  const doc = document.documentElement
  const maxScrollable = Math.max(doc.scrollHeight, document.body.scrollHeight) - window.innerHeight
  if (maxScrollable <= 0) return 100
  return Math.max(0, Math.min(100, Math.round((window.scrollY / maxScrollable) * 100)))
}

function trackScrollDepth() {
  const depth = getScrollDepth()
  if (depth > maxScrollDepth) maxScrollDepth = depth

  for (const threshold of scrollThresholds) {
    if (depth >= threshold && !reachedScrollThresholds.has(threshold)) {
      reachedScrollThresholds.add(threshold)
      safeCapture('jmp_scroll_depth_reached', {
        ...currentPathProps(),
        depth_percent: threshold,
        max_depth_percent: depth,
        seconds_on_page: Math.round((Date.now() - pageStart) / 1000),
      })
    }
  }
}

function elementLabel(el: Element) {
  const aria = el.getAttribute('aria-label')
  if (aria) return aria.slice(0, 120)
  const text = el.textContent?.replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 120) : el.tagName.toLowerCase()
}

function elementSection(el: Element) {
  const section = el.closest('section[id], footer, main')
  if (!section) return undefined
  if (section instanceof HTMLElement && section.id) return section.id
  return section.tagName.toLowerCase()
}

function bindClickTracking() {
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const clickable = target.closest('a, button, input, select, textarea, label')
    if (!clickable) return

    const anchor = clickable.closest('a')
    const href = anchor?.href
    const baseProps = {
      ...currentPathProps(),
      label: elementLabel(clickable),
      tag: clickable.tagName.toLowerCase(),
      section: elementSection(clickable),
      href,
    }

    if (clickable.closest('#inscricao')) {
      safeCapture('jmp_form_click', {
        ...baseProps,
        form_step: formState.currentStep,
      })
    }

    if (href?.includes('whatsapp.com') || href?.includes('wa.me')) {
      safeCapture('jmp_whatsapp_click', {
        ...baseProps,
        destination: href.includes('chat.whatsapp.com') ? 'whatsapp_group' : 'whatsapp',
      })
      return
    }

    if (href?.includes('#inscricao') || href?.endsWith('/#inscricao-form') || href?.includes('#inscricao-form')) {
      safeCapture('jmp_cta_click', {
        ...baseProps,
        target: 'form',
      })
      return
    }

    if (href?.includes('youtube.com') || href?.includes('youtu.be')) {
      safeCapture('jmp_youtube_click', baseProps)
      return
    }

    if (href?.includes('instagram.com')) {
      safeCapture('jmp_instagram_click', baseProps)
    }
  }, { capture: true })
}

function markActivity() {
  lastActivity = Date.now()
}

function bindEngagementTracking() {
  pageStart = Date.now()
  lastActivity = pageStart

  const activityEvents = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart']
  activityEvents.forEach((event) => window.addEventListener(event, markActivity, { passive: true }))

  window.addEventListener('scroll', () => {
    window.requestAnimationFrame(trackScrollDepth)
  }, { passive: true })

  window.setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastActivity < 15_000) {
      activeSeconds += 5
    }
  }, 5_000)

  for (const seconds of timeMilestones) {
    window.setTimeout(() => {
      safeCapture('jmp_time_on_page_milestone', {
        ...currentPathProps(),
        seconds,
        max_scroll_depth_percent: maxScrollDepth,
      })
    }, seconds * 1000)
  }

  const flush = () => sendFinalEngagement()
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}

function bindBehaviorTracking() {
  if (behaviorBound) return
  behaviorBound = true
  bindClickTracking()
  bindEngagementTracking()
  window.requestAnimationFrame(trackScrollDepth)
}

function sendFinalEngagement() {
  if (finalEventSent) return
  finalEventSent = true

  const secondsOnPage = Math.max(0, Math.round((Date.now() - pageStart) / 1000))
  safeCapture('jmp_page_engagement', {
    ...currentPathProps(),
    seconds_on_page: secondsOnPage,
    active_seconds: Math.min(activeSeconds, secondsOnPage),
    max_scroll_depth_percent: maxScrollDepth,
  }, { transport: 'sendBeacon' })

  if (formState.started && !formState.submitted) {
    safeCapture('jmp_form_abandoned', {
      ...currentPathProps(),
      current_step: formState.currentStep,
      seconds_in_form: Math.round((Date.now() - formState.startedAt) / 1000),
      touched_fields: Array.from(formState.touchedFields),
      completed_fields: Array.from(formState.completedFields),
      touched_field_count: formState.touchedFields.size,
      completed_field_count: formState.completedFields.size,
    }, { transport: 'sendBeacon' })
  }
}

export async function initJmpAnalytics() {
  if (analyticsReady || typeof window === 'undefined') return
  // Marca cedo para evitar dupla inicialização se chamado duas vezes seguidas
  // (o import() é assíncrono e poderia reentrar).
  analyticsReady = true

  const mod = await import('posthog-js')
  ph = mod.default
  window.posthog = ph

  ph.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: POSTHOG_UI_HOST,
    defaults: '2026-01-30',
    capture_pageview: 'history_change',
    capture_pageleave: true,
    autocapture: true,
    capture_dead_clicks: true,
    enable_heatmaps: true,
    disable_session_recording: false,
    person_profiles: 'identified_only',
    persistence: 'localStorage+cookie',
    cross_subdomain_cookie: true,
    session_recording: {
      maskAllInputs: true,
    },
    loaded: (loaded) => {
      loaded.capture('jmp_landing_loaded', {
        ...currentPathProps(),
        ...APP_PROPS,
        ...readCampaignProperties(),
      })
    },
  })

  ph.register({
    ...APP_PROPS,
    environment: import.meta.env.MODE,
  })

  bindBehaviorTracking()
}

function ensureFormStarted(source: string) {
  if (formState.started) return
  formState.started = true
  formState.startedAt = Date.now()
  safeCapture('jmp_form_started', {
    ...currentPathProps(),
    source,
    current_step: formState.currentStep,
  })
}

export function trackFormStepViewed(step: number) {
  formState.currentStep = step
  if (formState.viewedSteps.has(step)) return
  formState.viewedSteps.add(step)
  safeCapture('jmp_form_step_viewed', {
    ...currentPathProps(),
    step,
  })
}

export function trackFormFieldChanged(field: string, step: number, hasValue: boolean) {
  ensureFormStarted('field_change')
  formState.currentStep = step
  formState.touchedFields.add(field)
  if (hasValue) formState.completedFields.add(field)
  else formState.completedFields.delete(field)

  safeCapture('jmp_form_field_changed', {
    ...currentPathProps(),
    field,
    step,
    has_value: hasValue,
    touched_field_count: formState.touchedFields.size,
    completed_field_count: formState.completedFields.size,
  })
}

export function trackFormStepCompleted(step: number) {
  ensureFormStarted('step_completed')
  safeCapture('jmp_form_step_completed', {
    ...currentPathProps(),
    step,
    touched_fields: Array.from(formState.touchedFields),
    completed_field_count: formState.completedFields.size,
  })
}

export function trackFormValidationFailed(step: number, errors: FieldState) {
  ensureFormStarted('validation_failed')
  formState.currentStep = step
  safeCapture('jmp_form_validation_failed', {
    ...currentPathProps(),
    step,
    fields: Object.keys(errors),
    error_count: Object.keys(errors).length,
  })
}

export function trackFormSubmitAttempt(profile: Record<string, unknown>) {
  ensureFormStarted('submit_attempt')
  safeCapture('jmp_form_submit_attempt', {
    ...currentPathProps(),
    step: formState.currentStep,
    ...profile,
  })
}

export function trackFormSubmitted(profile: Record<string, unknown>) {
  formState.submitted = true
  safeCapture('jmp_form_submitted', {
    ...currentPathProps(),
    seconds_in_form: formState.startedAt ? Math.round((Date.now() - formState.startedAt) / 1000) : 0,
    touched_fields: Array.from(formState.touchedFields),
    completed_fields: Array.from(formState.completedFields),
    ...profile,
  }, { transport: 'sendBeacon' })
}

export function trackFormSubmitFailed(reason: string) {
  safeCapture('jmp_form_submit_failed', {
    ...currentPathProps(),
    reason,
    step: formState.currentStep,
  })
}
