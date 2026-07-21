'use client'

import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react'
import { Loader2, CheckCircle2, ShieldCheck, MessageCircle } from 'lucide-react'
import { light } from '../_lib/tokens'
import { form as copy } from '../_lib/copy'
import { Section, Container, Reveal } from './ui'
import { captureUtms, EMPTY_UTM, type Utm } from '../_lib/utm'
import { initAnalytics, trackFunnel, trackLeadConversion } from '../_lib/analytics'

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

function applyPhoneMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  // Fixo (10 dígitos) → (DD) XXXX-XXXX; celular (11) → (DD) XXXXX-XXXX.
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function validate(d: FormData): Errors {
  const e: Errors = {}
  if (d.nome.trim().length < 3) e.nome = 'Preencha seu nome completo.'
  if (d.whatsapp.replace(/\D/g, '').length < 10) e.whatsapp = 'Informe um WhatsApp válido com DDD.'
  // E-mail é opcional (funil é 100% WhatsApp) — só valida o formato se preenchido.
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = 'Informe um e-mail válido.'
  if (!d.uf) e.uf = 'Selecione seu estado.'
  // Cidade é opcional: dropdown IBGE é fricção alta no mobile e não qualifica.
  if (!d.cabecas) e.cabecas = 'Selecione o tamanho do rebanho.'
  if (!d.quantosTouros) e.quantosTouros = 'Selecione quantos touros você busca.'
  if (!d.inscricaoEstadual) e.inscricaoEstadual = 'Informe se você tem inscrição estadual.'
  if (!d.whatsappConsent) e.whatsappConsent = 'Autorize o contato via WhatsApp para continuar.'
  return e
}

export function Formulario() {
  const [data, setData] = useState<FormData>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)
  const [cidades, setCidades] = useState<string[]>([])
  const [loadingCidades, setLoadingCidades] = useState(false)
  const utmRef = useRef<Utm>(EMPTY_UTM)
  const startedRef = useRef(false)

  // Captura UTM + inicializa tracking (pageview) no mount.
  useEffect(() => {
    utmRef.current = captureUtms()
    void initAnalytics(utmRef.current)
  }, [])

  // Cidades do IBGE por UF. AbortController cancela a requisição anterior ao
  // trocar de UF rápido (evita estado obsoleto); ordena alfabético (IBGE não
  // garante ordem).
  useEffect(() => {
    if (!data.uf) return
    const ctrl = new AbortController()
    // Sincroniza o estado de loading com um sistema externo (fetch do IBGE) —
    // uso legítimo de setState em effect.
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
    // Micro-conversão: 1ª interação com o form (sinal de otimização quando o
    // volume de Lead é baixo). Vai a PostHog + Meta + GA4.
    if (!startedRef.current) {
      startedRef.current = true
      trackFunnel('touros_form_started', undefined, { meta: 'InitiateCheckout', ga: 'begin_checkout' })
    }
    setData((d) => ({ ...d, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (status === 'submitting') return
    const e = validate(data)
    setErrors(e)
    trackFunnel('touros_submit_attempt')
    if (Object.keys(e).length) {
      trackFunnel('touros_validation_failed', { fields: Object.keys(e) })
      // Foca o primeiro campo com erro.
      const first = document.querySelector<HTMLElement>('[data-invalid="true"]')
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setStatus('submitting')
    setServerError(null)
    // event_id único: dedup entre o Pixel (client) e o futuro CAPI (server).
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
      // is_mql vem do servidor (fonte de verdade) → evento de conversão com
      // VALOR diferenciado: o algoritmo aprende a trazer ≥100 cabeças + IE.
      trackLeadConversion({
        utm: utmRef.current,
        leadId: body?.id ?? null,
        isMql: body?.is_mql === true,
        eventId,
      })
      setStatus('success')
      document.getElementById('cadastro')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (err) {
      setStatus('error')
      setServerError(err instanceof Error ? err.message : 'Falha ao enviar.')
    }
  }

  const invalid = (k: keyof FormData) => (errors[k] ? 'true' : undefined)

  return (
    <Section surface="light" id="cadastro" style={{ colorScheme: 'light' } as React.CSSProperties}>
      {/* Anel de foco visível (WCAG 2.4.7) para todos os controles do form —
          escopado, cobre inputs/selects/botões sem repetir por campo. */}
      <style>{`
        #cadastro input:focus-visible,
        #cadastro select:focus-visible,
        #cadastro button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(200, 169, 110, 0.45);
        }
      `}</style>
      <Container>
        {status === 'success' ? (
          <SuccessCard />
        ) : (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
            {/* Coluna de contexto */}
            <Reveal>
              <div className="lg:sticky lg:top-16">
                <h2
                  style={{
                    fontWeight: 600,
                    fontSize: 'clamp(28px, 4.5vw, 44px)',
                    lineHeight: 1.08,
                    letterSpacing: '-0.025em',
                  }}
                >
                  {copy.title}
                </h2>
                <p className="mt-4 max-w-[420px]" style={{ fontSize: 18, lineHeight: 1.5, color: light.muted }}>
                  {copy.lead}
                </p>
                <div
                  className="mt-8 flex items-start gap-3 rounded-[14px] p-4"
                  style={{ background: light.goldDim }}
                >
                  <MessageCircle size={20} color={light.gold} strokeWidth={1.75} className="mt-0.5 shrink-0" />
                  <p style={{ fontSize: 14.5, lineHeight: 1.5, color: light.text }}>{copy.submitHint}</p>
                </div>
              </div>
            </Reveal>

            {/* Coluna do formulário */}
            <Reveal delay={0.08}>
              <form
                onSubmit={handleSubmit}
                noValidate
                className="rounded-[18px] p-6 sm:p-8"
                style={{ background: light.surface, border: `1px solid ${light.hairline}` }}
              >
                <div className="flex flex-col gap-5">
                  <Field label="Nome completo" error={errors.nome} invalid={invalid('nome')}>
                    <input
                      type="text" inputMode="text" autoComplete="name"
                      value={data.nome} onChange={(e) => set('nome', e.target.value)}
                      placeholder="Seu nome" style={inputStyle(!!errors.nome)}
                    />
                  </Field>

                  <Field
                    label="WhatsApp" error={errors.whatsapp} invalid={invalid('whatsapp')}
                    hint={copy.whatsappHint}
                  >
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
                        onChange={(e) => set('cidade', e.target.value)}
                        style={inputStyle(!!errors.cidade)}
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

                  <Field label="Quantos touros você busca?" error={errors.quantosTouros} invalid={invalid('quantosTouros')}>
                    <select value={data.quantosTouros} onChange={(e) => set('quantosTouros', e.target.value)} style={inputStyle(!!errors.quantosTouros)}>
                      <option value="">Selecione…</option>
                      {TOUROS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>

                  <Field label="Momento na pecuária (opcional)">
                    <select value={data.momento} onChange={(e) => set('momento', e.target.value)} style={inputStyle(false)}>
                      <option value="">Selecione…</option>
                      {MOMENTO_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
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
                              flex: 1, minHeight: 48, borderRadius: 10, fontWeight: 600, fontSize: 15,
                              cursor: 'pointer', transition: 'all .15s',
                              background: active ? light.gold : '#fff',
                              color: active ? '#0D0D0D' : light.text,
                              border: `1px solid ${active ? light.gold : light.hairline}`,
                            }}
                          >
                            {opt}
                          </button>
                        )
                      })}
                    </div>
                  </Field>

                  <label className="mt-1 flex cursor-pointer items-start gap-3" data-invalid={invalid('whatsappConsent')}>
                    <input
                      type="checkbox" checked={data.whatsappConsent}
                      onChange={(e) => set('whatsappConsent', e.target.checked)}
                      style={{ width: 20, height: 20, marginTop: 2, accentColor: light.gold, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 14, lineHeight: 1.45, color: errors.whatsappConsent ? '#C0504D' : light.muted }}>
                      {copy.consent}
                    </span>
                  </label>
                  {errors.whatsappConsent && (
                    <p role="alert" style={{ fontSize: 12.5, color: '#C0504D', marginTop: -8 }}>
                      {errors.whatsappConsent}
                    </p>
                  )}

                  {serverError && (
                    <p role="alert" style={{ fontSize: 14, color: '#C0504D' }}>
                      {serverError} Tente novamente.
                    </p>
                  )}

                  <button
                    type="submit" disabled={status === 'submitting'}
                    style={{
                      marginTop: 4, minHeight: 54, borderRadius: 9999, fontWeight: 600, fontSize: 17,
                      letterSpacing: '-0.01em', background: light.gold, color: '#0D0D0D',
                      cursor: status === 'submitting' ? 'wait' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      opacity: status === 'submitting' ? 0.75 : 1,
                    }}
                  >
                    {status === 'submitting' ? (
                      <><Loader2 size={18} className="animate-spin" /> {copy.submitting}</>
                    ) : (
                      copy.submit
                    )}
                  </button>

                  <p className="flex items-center justify-center gap-1.5" style={{ fontSize: 12.5, color: light.faint }}>
                    <ShieldCheck size={13} /> Seus dados ficam só com a Bula. Sem spam.
                  </p>
                </div>
              </form>
            </Reveal>
          </div>
        )}
      </Container>
    </Section>
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
  // Associa label↔controle e injeta aria no filho (input/select) — sem precisar
  // repetir id/aria em cada campo. WCAG: rótulo, estado de erro e descrição.
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
        className="mb-1.5 block"
        style={{ fontSize: 14, fontWeight: 600, color: light.text, letterSpacing: '-0.01em' }}
      >
        {label}
      </label>
      {control}
      {showHint && (
        <p id={hintId} className="mt-1.5" style={{ fontSize: 12.5, color: light.faint, lineHeight: 1.4 }}>{hint}</p>
      )}
      {error && (
        <p id={errId} role="alert" className="mt-1.5" style={{ fontSize: 12.5, color: '#C0504D' }}>{error}</p>
      )}
    </div>
  )
}

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%', minHeight: 48, padding: '0 14px', borderRadius: 10,
    fontSize: 16, // ≥16px evita zoom automático do iOS
    background: '#fff', color: light.text,
    border: `1px solid ${hasError ? '#C0504D' : light.hairline}`,
    outline: 'none', appearance: 'none',
    WebkitAppearance: 'none',
  }
}

function SuccessCard() {
  return (
    <Reveal>
      <div className="mx-auto max-w-[560px] text-center">
        <span
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: light.goldDim }}
        >
          <CheckCircle2 size={34} color={light.gold} />
        </span>
        <h2
          className="mt-6"
          style={{ fontWeight: 600, fontSize: 'clamp(26px, 4vw, 40px)', letterSpacing: '-0.025em' }}
        >
          {copy.successTitle}
        </h2>
        <p className="mx-auto mt-4 max-w-[460px]" style={{ fontSize: 18, lineHeight: 1.5, color: light.muted }}>
          {copy.successLead}
        </p>
      </div>
    </Reveal>
  )
}
