import { useState, useEffect, useRef } from 'react'
import { Loader2, Calendar, MapPin, CheckCircle2, ShieldCheck } from 'lucide-react'
import { OBRIGADO_PAGE_URL } from '../constants'
import type { JmpHero } from '../content'
import {
  trackFormFieldChanged,
  trackFormStepCompleted,
  trackFormStepViewed,
  trackFormSubmitAttempt,
  trackFormSubmitFailed,
  trackFormSubmitted,
  trackFormValidationFailed,
} from '../analytics/posthog'
import bulaLogo from '../assets/logo-bula-trimmed.png'
import jmpLogo from '../assets/jmp-logo.png'

// Renderiza texto com quebras de linha (\n) preservando-as como <br/>.
function MultiLine({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  )
}

// ── UF Data ──────────────────────────────────────────────────
const UF_OPTIONS: { name: string; sigla: string }[] = [
  { name: 'Acre', sigla: 'AC' },
  { name: 'Alagoas', sigla: 'AL' },
  { name: 'Amapá', sigla: 'AP' },
  { name: 'Amazonas', sigla: 'AM' },
  { name: 'Bahia', sigla: 'BA' },
  { name: 'Ceará', sigla: 'CE' },
  { name: 'Distrito Federal', sigla: 'DF' },
  { name: 'Espírito Santo', sigla: 'ES' },
  { name: 'Goiás', sigla: 'GO' },
  { name: 'Maranhão', sigla: 'MA' },
  { name: 'Mato Grosso', sigla: 'MT' },
  { name: 'Mato Grosso do Sul', sigla: 'MS' },
  { name: 'Minas Gerais', sigla: 'MG' },
  { name: 'Pará', sigla: 'PA' },
  { name: 'Paraíba', sigla: 'PB' },
  { name: 'Paraná', sigla: 'PR' },
  { name: 'Pernambuco', sigla: 'PE' },
  { name: 'Piauí', sigla: 'PI' },
  { name: 'Rio de Janeiro', sigla: 'RJ' },
  { name: 'Rio Grande do Norte', sigla: 'RN' },
  { name: 'Rio Grande do Sul', sigla: 'RS' },
  { name: 'Rondônia', sigla: 'RO' },
  { name: 'Roraima', sigla: 'RR' },
  { name: 'Santa Catarina', sigla: 'SC' },
  { name: 'São Paulo', sigla: 'SP' },
  { name: 'Sergipe', sigla: 'SE' },
  { name: 'Tocantins', sigla: 'TO' },
]

// ── Types ──────────────────────────────────────────────────────
interface FormData {
  nome: string
  email: string
  whatsapp: string
  uf: string
  cidade: string
  momento: string
  cabecas: string
  interesse: string
  quantidade: string
  inscricaoEstadual: string
}

type FieldKey = keyof FormData

// ── Pergunta de quantidade, contextual ao interesse ────────────────────────
// O substantivo e a concordância ("Quantos"/"Quantas") mudam conforme o que
// o lead respondeu em "Seu Interesse".
const INTERESSE_NOUN: Record<string, string> = {
  embrioes: 'embriões',
  semen: 'doses de sêmen',
  'touros-po': 'touros',
  'matrizes-po': 'matrizes',
  'bezerras-po': 'bezerras',
  'nao-sei': 'animais',
}
const INTERESSE_FEM = new Set(['semen', 'matrizes-po', 'bezerras-po'])

const QTD_OPTIONS: { value: string; label: string }[] = [
  { value: '1-5', label: '1 a 5' },
  { value: '6-10', label: '6 a 10' },
  { value: '11-20', label: '11 a 20' },
  { value: '21-50', label: '21 a 50' },
  { value: '50+', label: 'Mais de 50' },
  { value: 'nao-sei', label: 'Ainda não sei' },
]

function qtdQuestion(interesse: string): string {
  const noun = INTERESSE_NOUN[interesse] ?? 'animais'
  return `${INTERESSE_FEM.has(interesse) ? 'Quantas' : 'Quantos'} ${noun} você precisa?`
}

/** Texto legível salvo no CRM/planilha (ex.: "21 a 50 touros"). */
function qtdDescricao(interesse: string, quantidade: string): string {
  if (!quantidade) return ''
  const noun = INTERESSE_NOUN[interesse] ?? 'animais'
  if (quantidade === 'nao-sei') return `Ainda não sabe quantos ${noun}`
  const opt = QTD_OPTIONS.find((o) => o.value === quantidade)
  return `${opt?.label ?? quantidade} ${noun}`
}

// ── UTM / atribuição de campanha ───────────────────────────────
// Os criativos chegam com ?utm_source=...&utm_medium=...&utm_campaign=...
// &utm_content=...&ad-id=... (tudo após o "=" é variável). Capturamos na
// primeira visita e guardamos em sessionStorage para sobreviver à troca de
// passos e a uma eventual recarga — assim o lead carrega a origem certa mesmo
// que o usuário navegue e a query string saia da URL.
interface Utm {
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_content: string
  ad_id: string
}
const EMPTY_UTM: Utm = { utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', ad_id: '' }
const UTM_STORAGE_KEY = 'jmp_utm'

function captureUtms(): Utm {
  try {
    const p = new URLSearchParams(window.location.search)
    const fromUrl: Utm = {
      utm_source: p.get('utm_source') ?? '',
      utm_medium: p.get('utm_medium') ?? '',
      utm_campaign: p.get('utm_campaign') ?? '',
      utm_content: p.get('utm_content') ?? '',
      // O criativo manda ?ad-id=... (com hífen); aceitamos as duas grafias.
      ad_id: p.get('ad-id') ?? p.get('ad_id') ?? '',
    }
    if (Object.values(fromUrl).some(Boolean)) {
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(fromUrl))
      return fromUrl
    }
    const stored = sessionStorage.getItem(UTM_STORAGE_KEY)
    if (stored) return { ...EMPTY_UTM, ...JSON.parse(stored) }
  } catch { /* sessionStorage indisponível — segue sem atribuição */ }
  return EMPTY_UTM
}

// ── Phone mask ─────────────────────────────────────────────────
function applyPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits.length ? `(${digits}` : ''
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

// ── Validation per step ────────────────────────────────────────
function analyticsProfile(data: FormData, utms: Utm) {
  return {
    uf: data.uf || undefined,
    cidade: data.cidade || undefined,
    momento: data.momento || undefined,
    cabecas: data.cabecas || undefined,
    interesse: data.interesse || undefined,
    quantidade: data.quantidade || undefined,
    inscricao_estadual: data.inscricaoEstadual || undefined,
    has_utm: Object.values(utms).some(Boolean),
    utm_source: utms.utm_source || undefined,
    utm_medium: utms.utm_medium || undefined,
    utm_campaign: utms.utm_campaign || undefined,
    utm_content: utms.utm_content || undefined,
    ad_id: utms.ad_id || undefined,
  }
}

function validateStep(step: number, data: FormData): Partial<FormData> {
  const errors: Partial<FormData> = {}
  if (step === 1) {
    if (!data.nome.trim() || data.nome.trim().length < 3)
      errors.nome = 'Preencha seu nome completo (mín. 3 caracteres).'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      errors.email = 'Informe um e-mail válido.'
    if (data.whatsapp.replace(/\D/g, '').length < 10)
      errors.whatsapp = 'Informe seu WhatsApp (mín. 10 dígitos).'
  }
  if (step === 2) {
    if (!data.uf) errors.uf = 'Selecione seu estado.'
    if (!data.cidade) errors.cidade = 'Selecione sua cidade.'
  }
  if (step === 3) {
    if (!data.momento) errors.momento = 'Selecione seu momento na pecuária.'
    if (!data.cabecas) errors.cabecas = 'Selecione a quantidade de cabeças.'
    if (!data.interesse) errors.interesse = 'Selecione seu interesse.'
    if (data.interesse && !data.quantidade) errors.quantidade = 'Selecione a quantidade que você precisa.'
    if (!data.inscricaoEstadual) errors.inscricaoEstadual = 'Informe se você tem inscrição estadual.'
  }
  return errors
}

async function submitForm(data: FormData, utms: Utm): Promise<void> {
  // Posta no endpoint público do projeto (Next) que grava em crm_leads.
  // Mesma origem da landing (jmp.bulaassessoria.com), então caminho relativo.
  // `oQueBusca` é a quantidade desejada já em texto legível (contextual ao
  // interesse) — vai para a coluna o_que_busca do CRM e para a planilha.
  // Os utm_* + ad_id viajam junto para a automação da planilha (atribuição).
  const payload = { ...data, ...utms, oQueBusca: qtdDescricao(data.interesse, data.quantidade) }
  const res = await fetch('/api/jmp/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Falha ao enviar inscrição (${res.status})`)
}

// ── Shared style helpers ───────────────────────────────────────
const inputBase = (hasError: boolean) =>
  `w-full bg-white/5 border rounded-lg px-4 py-3.5 text-white text-base outline-none transition-all placeholder-white/30 ${
    hasError ? 'border-red-400/70' : 'border-white/15 focus:border-white/50 focus:bg-white/8'
  }`

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23ffffff' stroke-width='2' fill='none'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat' as const,
  backgroundPosition: 'right 16px center',
  paddingRight: '42px',
}

const labelClass = 'block text-white/45 text-[10px] uppercase tracking-[2.5px] font-semibold mb-1.5'
const errorClass = 'text-red-400 text-xs mt-1.5 block'
const btnNext = 'flex-1 bg-white text-black font-black py-4 px-8 rounded-lg text-sm uppercase tracking-[2px] transition-all duration-200 hover:bg-white/90 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer'
const btnBack = 'border border-white/20 text-white/50 font-semibold py-4 px-6 rounded-lg text-sm uppercase tracking-[2px] transition-all duration-200 hover:border-white/40 hover:text-white/80 cursor-pointer'

// ── UFCombobox ─────────────────────────────────────────────────
interface UFComboboxProps {
  value: string
  onChange: (sigla: string) => void
  hasError: boolean
}

function UFCombobox({ value, onChange, hasError }: UFComboboxProps) {
  const selectedOption = UF_OPTIONS.find(u => u.sigla === value) ?? null
  const [inputText, setInputText] = useState(
    selectedOption ? `${selectedOption.name} (${selectedOption.sigla})` : ''
  )
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!value) setInputText('')
    else {
      const opt = UF_OPTIONS.find(u => u.sigla === value)
      if (opt) setInputText(`${opt.name} (${opt.sigla})`)
    }
  }, [value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        if (selectedOption) setInputText(`${selectedOption.name} (${selectedOption.sigla})`)
        else setInputText('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selectedOption])

  const filtered = UF_OPTIONS.filter(u => {
    const q = inputText.toLowerCase()
    return u.name.toLowerCase().includes(q) || u.sigla.toLowerCase().includes(q)
  })

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputText(e.target.value)
    setOpen(true)
    if (!e.target.value) onChange('')
  }

  function handleSelect(opt: { name: string; sigla: string }) {
    onChange(opt.sigla)
    setInputText(`${opt.name} (${opt.sigla})`)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={inputText}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        placeholder="Digite ou selecione o estado"
        autoComplete="off"
        className={inputBase(hasError)}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-[#1a1a1a] border border-white/15 rounded-lg shadow-2xl max-h-48 overflow-y-auto">
          {filtered.map(opt => (
            <li
              key={opt.sigla}
              onMouseDown={() => handleSelect(opt)}
              className={`px-4 py-2.5 text-sm cursor-pointer text-white hover:bg-white/10 transition-colors ${
                opt.sigla === value ? 'bg-white/10 font-semibold' : ''
              }`}
            >
              {opt.name}{' '}
              <span className="text-white/35">({opt.sigla})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Main Form ──────────────────────────────────────────────────
export function Form({ hero }: { hero: JmpHero }) {
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<FormData>({
    nome: '', email: '', whatsapp: '',
    uf: '', cidade: '',
    momento: '', cabecas: '', interesse: '', quantidade: '', inscricaoEstadual: '',
  })
  const [errors, setErrors] = useState<Partial<FormData>>({})
  const [cities, setCities] = useState<string[]>([])
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const formCardRef = useRef<HTMLDivElement>(null)
  // Atribuição de campanha capturada da URL de entrada (uma vez, no mount).
  const utmRef = useRef<Utm>(EMPTY_UTM)

  useEffect(() => { utmRef.current = captureUtms() }, [])

  useEffect(() => {
    trackFormStepViewed(step)
  }, [step])

  useEffect(() => {
    if (!formData.uf) { setCities([]); return }
    let cancelled = false
    setCitiesLoading(true)
    setCities([])
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${formData.uf}/municipios`)
      .then(r => r.json())
      .then((data: { nome: string }[]) => {
        if (cancelled) return
        setCities(data.map(m => m.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')))
      })
      .catch(() => { if (!cancelled) setCities([]) })
      .finally(() => { if (!cancelled) setCitiesLoading(false) })
    return () => { cancelled = true }
  }, [formData.uf])

  function handleChange(field: FieldKey, value: string) {
    setFormData(prev => ({ ...prev, [field]: value }))
    trackFormFieldChanged(field, step, Boolean(value))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  function handleUFChange(sigla: string) {
    setFormData(prev => ({ ...prev, uf: sigla, cidade: '' }))
    trackFormFieldChanged('uf', step, Boolean(sigla))
    setErrors(prev => ({ ...prev, uf: undefined, cidade: undefined }))
  }

  function goTo(target: number) {
    if (target > step) {
      const stepErrors = validateStep(step, formData)
      if (Object.keys(stepErrors).length > 0) {
        setErrors(stepErrors)
        trackFormValidationFailed(step, stepErrors as Record<string, boolean>)
        return
      }
      trackFormStepCompleted(step)
    }
    setErrors({})
    setStep(target)
    if (window.innerWidth < 1024) {
      formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  async function onSubmit() {
    const stepErrors = validateStep(3, formData)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      trackFormValidationFailed(3, stepErrors as Record<string, boolean>)
      return
    }
    setLoading(true)
    setSubmitError(null)
    trackFormSubmitAttempt(analyticsProfile(formData, utmRef.current))
    try {
      await submitForm(formData, utmRef.current)
      trackFormSubmitted(analyticsProfile(formData, utmRef.current))
      window.location.href = OBRIGADO_PAGE_URL
    } catch {
      trackFormSubmitFailed('api_error')
      setSubmitError('Não conseguimos enviar sua inscrição. Verifique sua conexão e tente novamente.')
      setLoading(false)
    }
  }

  return (
    <section id="inscricao" className="min-h-screen flex flex-col lg:flex-row">

      {/* ── LEFT: Hero content ── */}
      <div className="lg:w-[48%] bg-black/80 lg:bg-black/52 text-white flex flex-col justify-center px-8 py-14 lg:py-20 min-h-[320px]">
        <div className="max-w-[380px] ml-auto mr-4 lg:mr-10">

          {/* Bula + JMP identity */}
          <div className="mb-10 flex items-center gap-5">
            <img
              src={bulaLogo}
              alt="Bula"
              className="h-14 w-auto object-contain sm:h-16"
            />
            <div className="h-10 w-px bg-white/30 sm:h-12" />
            <img
              src={jmpLogo}
              alt="JMP"
              className="h-14 w-auto object-contain sm:h-16"
            />
          </div>

          {/* Urgency badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-7">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-white text-[11px] font-bold uppercase tracking-[2px]">
              {hero.badge}
            </span>
          </div>

          {/* Main headline */}
          <h1 className="text-[2.6rem] sm:text-5xl lg:text-[3.2rem] font-black leading-[1.02] text-white mb-5 tracking-tight">
            <MultiLine text={hero.headline} />
          </h1>

          {/* Value prop */}
          <p className="text-white/65 text-[15px] leading-relaxed mb-8">
            {hero.valueProp}{hero.valuePropStrong ? ' ' : ''}
            {hero.valuePropStrong && (
              <strong className="text-white font-semibold">{hero.valuePropStrong}</strong>
            )}
          </p>

          {/* Benefits */}
          {hero.benefitsTitle && (
            <h2 className="text-white font-black uppercase text-xl sm:text-2xl leading-tight mb-6 tracking-tight">
              <MultiLine text={hero.benefitsTitle} />
            </h2>
          )}
          <ul className="space-y-3 mb-10">
            {hero.benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-white/60 flex-shrink-0 mt-0.5" />
                <span className={b.strong ? 'text-white font-bold text-base leading-snug' : 'text-white/80 text-sm leading-snug'}>{b.text}</span>
              </li>
            ))}
          </ul>

          {/* Divider + stats */}
          <div className="border-t border-white/12 pt-6">
            <div className="flex items-center gap-6">
              {hero.stats.map((s, i) => (
                <div key={i} className="flex items-center gap-6">
                  {i > 0 && <div className="w-px h-10 bg-white/15" />}
                  <div className="text-center">
                    <p className="text-white text-2xl font-black leading-none">{s.value}</p>
                    <p className="text-white/40 text-[11px] uppercase tracking-wider mt-1">{s.label}</p>
                  </div>
                </div>
              ))}
              {(hero.locationLine1 || hero.locationLine2) && (
                <>
                  <div className="w-px h-10 bg-white/15" />
                  <div>
                    <p className="text-white/50 text-[11px] font-semibold uppercase tracking-wider leading-tight">
                      {hero.locationLine1}<br />
                      <span className="text-white/35 font-normal normal-case tracking-normal">{hero.locationLine2}</span>
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── RIGHT: Form ── */}
      <div className="lg:w-[52%] bg-black/65 flex items-center justify-center px-6 py-12 lg:py-0 lg:pl-16 lg:pr-12">
        <div id="inscricao-form" />
        <div className="w-full max-w-[420px]">

          {/* Form header */}
          <div className="mb-7">
            <p className="text-white/35 text-[10px] uppercase tracking-[3px] mb-2">Grátis · Sem compromisso</p>
            <h2 className="text-white font-black text-2xl sm:text-3xl leading-tight">
              Garanta sua vaga<br />
              <span className="text-white/60 font-bold">no JMP 2026</span>
            </h2>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className={`transition-all duration-300 rounded-full ${
                    i < step
                      ? 'h-2 w-2 bg-white'
                      : i === step
                      ? 'h-2 w-6 bg-white'
                      : 'h-2 w-2 bg-white/20'
                  }`}
                />
              </div>
            ))}
            <span className="ml-1 text-white/30 text-xs">{step}/3</span>
          </div>

          {/* Form card */}
          <div ref={formCardRef} className="bg-white/5 border border-white/10 rounded-2xl p-6 sm:p-7 backdrop-blur-sm">

            {/* Step 1 */}
            {step === 1 && (
              <>
                <h3 className="text-white text-lg font-bold mb-1">Responda e receba ofertas!</h3>
                <p className="text-white/35 text-sm mb-5">
                  Voce recebe as ofertas pelo celular! Cadastre-se
                </p>
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Nome Completo *</label>
                    <input
                      type="text"
                      value={formData.nome}
                      onChange={e => handleChange('nome', e.target.value)}
                      placeholder="Seu nome completo"
                      className={inputBase(!!errors.nome)}
                    />
                    {errors.nome && <span className={errorClass}>{errors.nome}</span>}
                  </div>
                  <div>
                    <label className={labelClass}>E-mail *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => handleChange('email', e.target.value)}
                      placeholder="seu@email.com"
                      className={inputBase(!!errors.email)}
                    />
                    {errors.email && <span className={errorClass}>{errors.email}</span>}
                  </div>
                  <div>
                    <label className={labelClass}>WhatsApp *</label>
                    <input
                      type="tel"
                      value={formData.whatsapp}
                      onChange={e => handleChange('whatsapp', applyPhoneMask(e.target.value))}
                      placeholder="(31) 99999-9999"
                      className={inputBase(!!errors.whatsapp)}
                    />
                    {errors.whatsapp && <span className={errorClass}>{errors.whatsapp}</span>}
                  </div>
                </div>
                <div className="mt-6">
                  <button onClick={() => goTo(2)} className={`${btnNext} w-full`}>
                    Continuar →
                  </button>
                </div>
              </>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <>
                <h3 className="text-white text-lg font-bold mb-1">Sua localização</h3>
                <p className="text-white/35 text-sm mb-5">
                  Queremos entender de onde você opera.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Estado (UF) *</label>
                    <UFCombobox value={formData.uf} onChange={handleUFChange} hasError={!!errors.uf} />
                    {errors.uf && <span className={errorClass}>{errors.uf}</span>}
                  </div>
                  <div>
                    <label className={labelClass}>Cidade *</label>
                    {citiesLoading ? (
                      <div className="w-full bg-white/5 border border-white/15 rounded-lg px-4 py-3.5 flex items-center gap-2 text-white/30">
                        <Loader2 className="w-4 h-4 animate-spin text-white/50" />
                        <span className="text-sm">Carregando municípios…</span>
                      </div>
                    ) : (
                      <select
                        value={formData.cidade}
                        onChange={e => handleChange('cidade', e.target.value)}
                        disabled={!formData.uf}
                        className={`${inputBase(!!errors.cidade)} appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed`}
                        style={selectStyle}
                      >
                        <option value="" style={{ background: '#111' }}>
                          {formData.uf ? 'Selecione sua cidade...' : 'Selecione o estado primeiro...'}
                        </option>
                        {cities.map(city => (
                          <option key={city} value={city} style={{ background: '#111' }}>{city}</option>
                        ))}
                      </select>
                    )}
                    {errors.cidade && <span className={errorClass}>{errors.cidade}</span>}
                  </div>
                </div>
                <div className="mt-6 flex gap-3">
                  <button onClick={() => goTo(1)} className={btnBack}>← Voltar</button>
                  <button onClick={() => goTo(3)} className={btnNext}>Continuar →</button>
                </div>
              </>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <>
                <h3 className="text-white text-lg font-bold mb-1">Seu perfil</h3>
                <p className="text-white/35 text-sm mb-5">
                  Quanto mais soubermos, melhor a indicação dos animais.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Momento na Pecuária *</label>
                    <select
                      value={formData.momento}
                      onChange={e => handleChange('momento', e.target.value)}
                      className={`${inputBase(!!errors.momento)} appearance-none cursor-pointer`}
                      style={selectStyle}
                    >
                      <option value="" style={{ background: '#111' }}>Selecione...</option>
                      <option value="nao-trabalho-quero-aprender" style={{ background: '#111' }}>Não trabalho, quero aprender</option>
                      <option value="pecuaria-de-corte" style={{ background: '#111' }}>Trabalho com pecuária de corte</option>
                      <option value="corte-e-po" style={{ background: '#111' }}>Trabalho com corte e P.O.</option>
                      <option value="criador-renomado-po" style={{ background: '#111' }}>Criador renomado de P.O.</option>
                    </select>
                    {errors.momento && <span className={errorClass}>{errors.momento}</span>}
                  </div>
                  <div>
                    <label className={labelClass}>Quantidade de Cabeças *</label>
                    <select
                      value={formData.cabecas}
                      onChange={e => handleChange('cabecas', e.target.value)}
                      className={`${inputBase(!!errors.cabecas)} appearance-none cursor-pointer`}
                      style={selectStyle}
                    >
                      <option value="" style={{ background: '#111' }}>Selecione...</option>
                      <option value="nenhuma" style={{ background: '#111' }}>Nenhuma</option>
                      <option value="0-50" style={{ background: '#111' }}>0–50</option>
                      <option value="50-100" style={{ background: '#111' }}>50–100</option>
                      <option value="100-300" style={{ background: '#111' }}>100–300</option>
                      <option value="300-500" style={{ background: '#111' }}>300–500</option>
                      <option value="500+" style={{ background: '#111' }}>500+</option>
                    </select>
                    {errors.cabecas && <span className={errorClass}>{errors.cabecas}</span>}
                  </div>
                  <div>
                    <label className={labelClass}>Tem Inscrição Estadual? *</label>
                    <select
                      value={formData.inscricaoEstadual}
                      onChange={e => handleChange('inscricaoEstadual', e.target.value)}
                      className={`${inputBase(!!errors.inscricaoEstadual)} appearance-none cursor-pointer`}
                      style={selectStyle}
                    >
                      <option value="" style={{ background: '#111' }}>Selecione...</option>
                      <option value="Sim" style={{ background: '#111' }}>Sim</option>
                      <option value="Não" style={{ background: '#111' }}>Não</option>
                    </select>
                    {errors.inscricaoEstadual && <span className={errorClass}>{errors.inscricaoEstadual}</span>}
                  </div>
                  <div>
                    <label className={labelClass}>Seu Interesse *</label>
                    <select
                      value={formData.interesse}
                      onChange={e => handleChange('interesse', e.target.value)}
                      className={`${inputBase(!!errors.interesse)} appearance-none cursor-pointer`}
                      style={selectStyle}
                    >
                      <option value="" style={{ background: '#111' }}>Selecione...</option>
                      <option value="embrioes" style={{ background: '#111' }}>Embriões</option>
                      <option value="semen" style={{ background: '#111' }}>Sêmen</option>
                      <option value="touros-po" style={{ background: '#111' }}>Touros P.O</option>
                      <option value="matrizes-po" style={{ background: '#111' }}>Matrizes P.O</option>
                      <option value="bezerras-po" style={{ background: '#111' }}>Bezerras P.O</option>
                      <option value="nao-sei" style={{ background: '#111' }}>Não sei ainda</option>
                    </select>
                    {errors.interesse && <span className={errorClass}>{errors.interesse}</span>}
                  </div>
                  {formData.interesse && (
                    <div>
                      <label className={labelClass}>{qtdQuestion(formData.interesse)} *</label>
                      <select
                        value={formData.quantidade}
                        onChange={e => handleChange('quantidade', e.target.value)}
                        className={`${inputBase(!!errors.quantidade)} appearance-none cursor-pointer`}
                        style={selectStyle}
                      >
                        <option value="" style={{ background: '#111' }}>Selecione...</option>
                        {QTD_OPTIONS.map(o => (
                          <option key={o.value} value={o.value} style={{ background: '#111' }}>{o.label}</option>
                        ))}
                      </select>
                      {errors.quantidade && <span className={errorClass}>{errors.quantidade}</span>}
                    </div>
                  )}
                </div>
                <div className="mt-6 flex gap-3">
                  <button onClick={() => goTo(2)} className={btnBack}>← Voltar</button>
                  <button
                    onClick={onSubmit}
                    disabled={loading}
                    className={`${btnNext} flex items-center justify-center gap-2 disabled:opacity-60`}
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Enviando…</>
                    ) : (
                      'Quero minha assessoria grátis →'
                    )}
                  </button>
                </div>
                {submitError && (
                  <span className={`${errorClass} text-center`}>{submitError}</span>
                )}
              </>
            )}

          </div>

          {/* Trust signal */}
          <div className="mt-4 flex items-center justify-center gap-1.5 text-white/30 text-xs">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Grátis · Frete incluso · Sem compromisso · Dados protegidos</span>
          </div>

          {/* Event quick info */}
          <div className="mt-5 flex items-center justify-center gap-4 text-white/25 text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />
              14 Jun · Domingo · 09h
            </span>
            <span className="w-px h-3 bg-white/15" />
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-3 h-3" />
              Campo Grande/MS
            </span>
          </div>

        </div>
      </div>
    </section>
  )
}
