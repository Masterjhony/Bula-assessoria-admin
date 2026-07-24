'use client'

import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, CheckCircle2, ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react'
import { dark, typo, font, radius } from '../_lib/tokens'
import { form as copy } from '../_lib/copy'
import { useSafeReducedMotion } from '../_lib/useSafeReducedMotion'
import { Reveal } from './ui'
import { captureUtms, EMPTY_UTM, type Utm } from '../_lib/utm'
import { initAnalytics, trackFunnel, trackLeadConversion } from '../_lib/analytics'

// Vermelho de erro legível sobre superfície escura (WCAG AA).
const ERR = '#E08A82'

// ── Opções ─────────────────────────────────────────────────────────────────
const UF_OPTIONS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

// Tamanho do rebanho (quantidade_animais → MQL). Valores SEM separador de
// milhar no piso: parseCabecasFloor pega o 1º número, e "1.000" viraria 1.
const CABECAS_OPTIONS = [
  '1 a 99 cabeças',
  '100 a 500 cabeças',
  '501 a 1000 cabeças',
  '1001 a 3000 cabeças',
  'mais de 3000 cabeças',
]

const MOMENTO_OPTIONS = [
  'Cria',
  'Recria',
  'Cria e recria',
  'Ciclo completo',
  'Confinamento',
  'Estou começando agora',
]

// Quantos touros o lead busca → o_que_busca (texto legível no CRM).
const TOUROS_OPTIONS = [
  { value: '1 a 5 touros', label: '1 a 5 touros' },
  { value: '6 a 10 touros', label: '6 a 10 touros' },
  { value: '11 a 20 touros', label: '11 a 20 touros' },
  { value: '21 a 50 touros', label: '21 a 50 touros' },
  { value: 'mais de 50 touros', label: 'Mais de 50 touros' },
  { value: 'ainda não sei quantos touros', label: 'Ainda não sei' },
]

interface FormData {
  nome: string
  whatsapp: string
  email: string
  uf: string
  cidade: string
  cabecas: string
  momento: string
  quantosTouros: string
  inscricaoEstadual: string
  whatsappConsent: boolean
}

const EMPTY: FormData = {
  nome: '', whatsapp: '', email: '', uf: '', cidade: '', cabecas: '',
  momento: '', quantosTouros: '', inscricaoEstadual: '', whatsappConsent: false,
}

type Errors = Partial<Record<keyof FormData, string>>

const TOTAL = 3
// Contato (nome/WhatsApp/e-mail/consentimento) sobe para o 1º passo — captura o
// dado de lead o quanto antes; fazenda e objetivo qualificam depois.
const STEP_LABELS = ['Seus dados', 'Sua fazenda', 'Sua compra']
const STEP_FIELDS: (keyof FormData)[][] = [
  ['nome', 'whatsapp', 'email', 'whatsappConsent'],
  ['uf', 'cidade', 'cabecas', 'momento'],
  ['quantosTouros', 'inscricaoEstadual'],
]

function applyPhoneMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function validate(d: FormData): Errors {
  const e: Errors = {}
  if (d.nome.trim().length < 3) e.nome = 'Preencha seu nome completo.'
  if (d.whatsapp.replace(/\D/g, '').length < 10) e.whatsapp = 'Informe um WhatsApp válido com DDD.'
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = 'Informe um e-mail válido.'
  if (!d.uf) e.uf = 'Selecione seu estado.'
  if (!d.cabecas) e.cabecas = 'Selecione o tamanho do rebanho.'
  if (!d.quantosTouros) e.quantosTouros = 'Selecione quantos touros você busca.'
  if (!d.inscricaoEstadual) e.inscricaoEstadual = 'Informe se você tem inscrição estadual.'
  if (!d.whatsappConsent) e.whatsappConsent = 'Autorize o contato via WhatsApp para continuar.'
  return e
}

// Card do formulário multi-step — pele EDITORIAL (flat near-black + hairline,
// cantos retos, botões caixa-alta). Toda a LÓGICA é preservada: multi-step,
// validação, IBGE, UTM, tracking, event_id, is_mql.
export function LeadForm() {
  const reduce = useSafeReducedMotion()
  const router = useRouter()
  const [data, setData] = useState<FormData>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)
  const [cidades, setCidades] = useState<string[]>([])
  const [loadingCidades, setLoadingCidades] = useState(false)
  const [step, setStep] = useState(0)
  const utmRef = useRef<Utm>(EMPTY_UTM)
  const startedRef = useRef(false)

  useEffect(() => {
    utmRef.current = captureUtms()
    void initAnalytics(utmRef.current)
  }, [])

  useEffect(() => {
    if (!data.uf) return
    const ctrl = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingCidades(true)
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${data.uf}/municipios`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((rows: { nome: string }[]) => {
        setCidades(rows.map((m) => m.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')))
      })
      .catch((err) => { if (err?.name !== 'AbortError') setCidades([]) })
      .finally(() => { if (!ctrl.signal.aborted) setLoadingCidades(false) })
    return () => ctrl.abort()
  }, [data.uf])

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    if (!startedRef.current) {
      startedRef.current = true
      trackFunnel('touros_form_started', undefined, { meta: 'InitiateCheckout', ga: 'begin_checkout' })
    }
    setData((d) => ({ ...d, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validateStep(s: number): Errors {
    const all = validate(data)
    const e: Errors = {}
    for (const f of STEP_FIELDS[s]) if (all[f]) e[f] = all[f]
    return e
  }

  function focusFirstError() {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-invalid="true"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  function goNext() {
    const e = validateStep(step)
    setErrors(e)
    trackFunnel('touros_step_attempt', { step: step + 1 })
    if (Object.keys(e).length) {
      trackFunnel('touros_validation_failed', { step: step + 1, fields: Object.keys(e) })
      focusFirstError()
      return
    }
    const ns = Math.min(step + 1, TOTAL - 1)
    setStep(ns)
    trackFunnel('touros_step_reached', { step: ns + 1 })
    document.getElementById('cadastro')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function goBack() {
    setStep((s) => Math.max(0, s - 1))
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (step < TOTAL - 1) { goNext(); return }
    if (status === 'submitting') return
    const e = validate(data)
    setErrors(e)
    trackFunnel('touros_submit_attempt')
    if (Object.keys(e).length) {
      trackFunnel('touros_validation_failed', { fields: Object.keys(e) })
      focusFirstError()
      return
    }

    setStatus('submitting')
    setServerError(null)
    const eventId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `evt_${Date.now()}_${Math.round(Math.random() * 1e9)}`
    try {
      const res = await fetch('/api/touros/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: data.nome,
          whatsapp: data.whatsapp,
          email: data.email,
          uf: data.uf,
          cidade: data.cidade,
          cabecas: data.cabecas,
          momento: data.momento,
          oQueBusca: data.quantosTouros,
          inscricaoEstadual: data.inscricaoEstadual,
          whatsappConsent: data.whatsappConsent,
          event_id: eventId,
          ...utmRef.current,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'Falha ao enviar.')
      }
      const body = await res.json().catch(() => ({}))
      trackLeadConversion({
        utm: utmRef.current,
        leadId: body?.id ?? null,
        isMql: body?.is_mql === true,
        eventId,
      })
      // Redireciona para a página de obrigado conforme o veredito de MQL do
      // SERVIDOR. URLs separadas habilitam metas de conversão por URL (Google/
      // Meta) e otimização value-based rumo ao lead que vale. Os eventos de
      // conversão já dispararam acima (dedup por eventId); a navegação é SPA
      // (soft nav), então os beacons em voo não são cortados. Mantemos o status
      // em 'submitting' — o form desmonta na navegação.
      router.push(body?.is_mql === true ? '/obrigado-touros-mql' : '/obrigado-touros-lead')
    } catch (err) {
      setStatus('error')
      setServerError(err instanceof Error ? err.message : 'Falha ao enviar.')
    }
  }

  const invalid = (k: keyof FormData) => (errors[k] ? 'true' : undefined)

  // ── PELE: card flat near-black + hairline. Sem blur, sem sombra, radius 2. ──
  const cardStyle: React.CSSProperties = {
    background: dark.surface,
    border: `1px solid ${dark.hairline}`,
    borderRadius: radius.xs,
    colorScheme: 'dark',
  }

  if (status === 'success') {
    return (
      <div className="p-6 sm:p-8" style={cardStyle}>
        <SuccessCard />
      </div>
    )
  }

  const slide = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, x: 12 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -12 } }

  return (
    <form onSubmit={handleSubmit} noValidate className="p-6 sm:p-8" style={cardStyle}>
      {/* Cabeçalho do form — diz O QUE é e O QUE acontece (message match +
          expectativa), pra ninguém preencher sem saber pra quê é o cadastro. */}
      <div className="mb-6" style={{ borderBottom: `1px solid ${dark.hairline}`, paddingBottom: 20 }}>
        <h2
          style={{
            fontFamily: font.display,
            fontWeight: 600,
            fontSize: 'clamp(20px, 3.2vw, 24px)',
            letterSpacing: '-0.01em',
            lineHeight: 1.12,
            color: dark.text,
          }}
        >
          {copy.title}
        </h2>
        <p className="mt-2.5" style={{ fontFamily: font.body, fontSize: 14, lineHeight: 1.5, color: dark.muted }}>
          {copy.lead}
        </p>
      </div>

      {/* Progresso — contador técnico em mono, trilha hairline com barras retas. */}
      <div className="mb-7">
        <div className="mb-2.5 flex items-center justify-between">
          <span style={{ ...typo.monoLabel, color: dark.gold }}>Passo {step + 1} / {TOTAL}</span>
          <span style={{ ...typo.monoLabel, color: dark.muted }}>{STEP_LABELS[step]}</span>
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <span
              key={i}
              className="h-[3px] flex-1"
              style={{ background: i <= step ? dark.gold : dark.hairline, transition: 'background .3s' }}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={slide.initial}
          animate={slide.animate}
          exit={slide.exit}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-5"
        >
          {step === 0 && (
            <>
              <Field label="Nome completo" error={errors.nome} invalid={invalid('nome')}>
                <input
                  type="text" inputMode="text" autoComplete="name"
                  value={data.nome} onChange={(e) => set('nome', e.target.value)}
                  placeholder="Seu nome" style={inputStyle(!!errors.nome)}
                />
              </Field>

              <Field label="WhatsApp" error={errors.whatsapp} invalid={invalid('whatsapp')} hint={copy.whatsappHint}>
                <input
                  type="tel" inputMode="tel" autoComplete="tel"
                  value={data.whatsapp} onChange={(e) => set('whatsapp', applyPhoneMask(e.target.value))}
                  placeholder="(00) 00000-0000" style={inputStyle(!!errors.whatsapp)}
                />
              </Field>

              <Field label="E-mail (opcional)" error={errors.email} invalid={invalid('email')}>
                <input
                  type="email" inputMode="email" autoComplete="email"
                  value={data.email} onChange={(e) => set('email', e.target.value)}
                  placeholder="voce@email.com" style={inputStyle(!!errors.email)}
                />
              </Field>

              <label className="mt-1 flex cursor-pointer items-start gap-3" data-invalid={invalid('whatsappConsent')}>
                <input
                  type="checkbox" checked={data.whatsappConsent}
                  onChange={(e) => set('whatsappConsent', e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2, accentColor: dark.gold, flexShrink: 0 }}
                />
                <span style={{ fontFamily: font.body, fontSize: 14, lineHeight: 1.45, color: errors.whatsappConsent ? ERR : dark.muted }}>
                  {copy.consent}
                </span>
              </label>
              {errors.whatsappConsent && (
                <p role="alert" style={{ fontSize: 12.5, color: ERR, marginTop: -8 }}>{errors.whatsappConsent}</p>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Estado" error={errors.uf} invalid={invalid('uf')}>
                  <select
                    value={data.uf}
                    onChange={(e) => { set('uf', e.target.value); set('cidade', ''); setCidades([]) }}
                    style={inputStyle(!!errors.uf)}
                  >
                    <option value="">Selecione…</option>
                    {UF_OPTIONS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </Field>

                <Field label="Cidade (opcional)" error={errors.cidade} invalid={invalid('cidade')}>
                  <select
                    value={data.cidade} disabled={!data.uf || loadingCidades}
                    onChange={(e) => set('cidade', e.target.value)} style={inputStyle(!!errors.cidade)}
                  >
                    <option value="">{loadingCidades ? 'Carregando…' : !data.uf ? 'Escolha a UF' : 'Selecione…'}</option>
                    {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>

              <Field label="Tamanho do rebanho" error={errors.cabecas} invalid={invalid('cabecas')}>
                <select value={data.cabecas} onChange={(e) => set('cabecas', e.target.value)} style={inputStyle(!!errors.cabecas)}>
                  <option value="">Selecione…</option>
                  {CABECAS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              <Field label="Momento na pecuária (opcional)">
                <select value={data.momento} onChange={(e) => set('momento', e.target.value)} style={inputStyle(false)}>
                  <option value="">Selecione…</option>
                  {MOMENTO_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Quantos touros você busca?" error={errors.quantosTouros} invalid={invalid('quantosTouros')}>
                <select value={data.quantosTouros} onChange={(e) => set('quantosTouros', e.target.value)} style={inputStyle(!!errors.quantosTouros)}>
                  <option value="">Selecione…</option>
                  {TOUROS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>

              <Field label="Você tem inscrição estadual?" error={errors.inscricaoEstadual} invalid={invalid('inscricaoEstadual')}>
                <div className="flex gap-3" role="radiogroup" aria-label="Você tem inscrição estadual?">
                  {['Sim', 'Não'].map((opt) => {
                    const active = data.inscricaoEstadual === opt
                    return (
                      <button
                        key={opt} type="button" role="radio" aria-checked={active}
                        onClick={() => set('inscricaoEstadual', opt)}
                        style={{
                          flex: 1, minHeight: 50, borderRadius: radius.xs,
                          fontFamily: font.display, fontWeight: 600, fontSize: 15,
                          textTransform: 'uppercase', letterSpacing: '0.08em',
                          cursor: 'pointer', transition: 'all .15s',
                          background: active ? dark.gold : 'transparent',
                          color: active ? '#0D0D0D' : dark.text,
                          border: `1px solid ${active ? dark.gold : dark.hairlineStrong}`,
                        }}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              </Field>

              {serverError && (
                <p role="alert" style={{ fontSize: 14, color: ERR }}>{serverError} Tente novamente.</p>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navegação — botões retos, caixa alta. */}
      <div className="mt-8 flex items-center gap-3">
        {step > 0 && (
          <button
            type="button" onClick={goBack}
            style={{
              minHeight: 54, padding: '0 18px', borderRadius: radius.none,
              fontFamily: font.display, fontWeight: 600, fontSize: 14,
              textTransform: 'uppercase', letterSpacing: '0.12em',
              display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              background: 'transparent', color: dark.muted, border: `1px solid ${dark.hairlineStrong}`,
            }}
          >
            <ArrowLeft size={16} /> Voltar
          </button>
        )}
        {step < TOTAL - 1 ? (
          <button
            type="button" onClick={goNext}
            style={{
              flex: 1, minHeight: 56, borderRadius: radius.none,
              fontFamily: font.display, fontWeight: 600, fontSize: 15,
              textTransform: 'uppercase', letterSpacing: '0.14em',
              background: dark.gold, color: '#0D0D0D', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}
          >
            Continuar <ArrowRight size={18} />
          </button>
        ) : (
          <button
            type="submit" disabled={status === 'submitting'}
            style={{
              flex: 1, minHeight: 56, borderRadius: radius.none,
              fontFamily: font.display, fontWeight: 600, fontSize: 15,
              textTransform: 'uppercase', letterSpacing: '0.14em',
              background: dark.gold, color: '#0D0D0D',
              cursor: status === 'submitting' ? 'wait' : 'pointer', opacity: status === 'submitting' ? 0.75 : 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}
          >
            {status === 'submitting' ? (
              <><Loader2 size={18} className="animate-spin" /> {copy.submitting}</>
            ) : (
              <>{copy.submit} <ArrowRight size={18} /></>
            )}
          </button>
        )}
      </div>

      {step === TOTAL - 1 && (
        <p
          className="mt-4 flex items-center justify-center gap-1.5 text-center"
          style={{ ...typo.monoLabel, fontSize: 10.5, letterSpacing: '0.1em', color: dark.muted }}
        >
          <ShieldCheck size={12} /> Seus dados ficam só com a Bula.
        </p>
      )}
    </form>
  )
}

function Field({
  label, error, hint, invalid, children,
}: {
  label: string
  error?: string
  hint?: string
  invalid?: string
  children: React.ReactNode
}) {
  const uid = useId()
  const fieldId = `tf-${uid}`
  const errId = `te-${uid}`
  const hintId = `th-${uid}`
  const showHint = Boolean(hint) && !error
  const describedBy = error ? errId : showHint ? hintId : undefined
  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: fieldId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })
    : children
  return (
    <div data-invalid={invalid}>
      <label
        htmlFor={fieldId}
        className="mb-2 block"
        style={{ fontFamily: font.display, fontSize: 12.5, fontWeight: 600, color: dark.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}
      >
        {label}
      </label>
      {control}
      {showHint && (
        <p id={hintId} className="mt-1.5" style={{ fontFamily: font.body, fontSize: 12.5, color: dark.muted, lineHeight: 1.45 }}>{hint}</p>
      )}
      {error && (
        <p id={errId} role="alert" className="mt-1.5" style={{ fontFamily: font.body, fontSize: 12.5, color: ERR }}>{error}</p>
      )}
    </div>
  )
}

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%', minHeight: 50, padding: '0 14px', borderRadius: radius.xs,
    fontSize: 16, // ≥16px evita zoom do iOS
    fontFamily: 'Inter, sans-serif',
    background: dark.bg, // inset editorial sobre o card #141414
    color: dark.text,
    border: `1px solid ${hasError ? ERR : dark.hairlineStrong}`,
    outline: 'none', appearance: 'none', WebkitAppearance: 'none',
  }
}

function SuccessCard() {
  return (
    <Reveal>
      <div className="mx-auto max-w-[560px] text-center">
        <span
          className="mx-auto flex h-14 w-14 items-center justify-center"
          style={{ border: `1px solid ${dark.gold}`, borderRadius: radius.none }}
        >
          <CheckCircle2 size={30} color={dark.gold} />
        </span>
        <h2 className="mt-6" style={{ ...typo.displayLg }}>{copy.successTitle}</h2>
        <p className="mx-auto mt-4 max-w-[460px]" style={{ ...typo.body, fontSize: 17, color: dark.body }}>
          {copy.successLead}
        </p>
      </div>
    </Reveal>
  )
}
