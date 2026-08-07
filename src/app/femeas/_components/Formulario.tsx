'use client'

import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, ShieldCheck, ArrowRight, ArrowLeft } from 'lucide-react'
import { dark, typo, font, radius } from '../_lib/tokens'
import { form as copy } from '../_lib/copy'
import { categorias, CATEGORIA_INDECISO } from '../_lib/categorias'
import { documentoValido, mascaraDocumento } from '../_lib/qualificacao'
import { useSafeReducedMotion } from '../_lib/useSafeReducedMotion'
import { captureUtms, EMPTY_UTM, type Utm } from '../_lib/utm'
import { initAnalytics, trackFunnel, trackLeadConversion } from '../_lib/analytics'
import { aplicarMascaraTelefone, whatsappValido } from '@/lib/telefone'

// ─────────────────────────────────────────────────────────────────────────────
// O FORMULÁRIO DE ALTO ATRITO — Fase 6.
//
// Este componente é a única alavanca de escala do funil de fêmeas. O gargalo do
// negócio não é volume de lead, é HORA DE ASSESSOR: a rodada anterior trouxe
// gente querendo fêmea de gado comercial e gente querendo 50–70 cabeças a preço
// de comercial, e cada um desses queimou triagem de um SDR. Por decisão do
// cliente (05/08), o atrito é o produto.
//
// ⚠️ O QUE NÃO FAZER AQUI, por mais tentador que pareça:
//
//   · Reduzir campos, juntar passos ou suavizar o microcopy "para converter
//     melhor". Isso desfaz a decisão. A recomendação genérica de encurtar
//     formulário (ANALISE-VERBA-SAOGERALDO §10, item 9) resolve o problema
//     OPOSTO ao deste funil.
//   · Inverter a ordem dos passos para capturar contato primeiro, como faz o
//     /touros (Formulario.tsx:73-74). Ver copy.form.passos: quem não se
//     reconhece no passo 1 tem que sair ANTES de virar lead.
//   · Trocar o window.location.assign do handleSubmit por navegação SPA do Next
//     (INV-1) — quebra a conversão do Meta sem nenhum erro visível.
//
// O QUE FAZER, e é a contrapartida honesta do atrito: MEDIR. Todo passo emite
// femeas_step_attempt / femeas_step_reached e todo erro emite
// femeas_validation_failed com os campos que falharam. É esse dado — e não
// opinião — que decide depois se o CPF derrubou 5% ou 40% dos cadastros
// (pendência C-01).
// ─────────────────────────────────────────────────────────────────────────────

// Vermelho de erro legível sobre superfície escura (WCAG AA).
const ERR = '#E08A82'

const UF_OPTIONS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

// As opções de categoria são as 6 da página MAIS "ainda não sei" — que existe
// só no formulário, não é card. Forçar uma escolha que a pessoa não tem como
// fazer produz resposta aleatória e suja o dado que o SDR usa na triagem.
const CATEGORIA_OPTIONS = [...categorias.map((c) => ({ id: c.id, nome: c.nome })), CATEGORIA_INDECISO]

// ⚠️ ESPELHA `PROJETO_MIN` de src/app/api/femeas/lead/route.ts. Não há import
// porque a rota o declara localmente e ela está fora do escopo desta onda; se
// um dos dois mudar, o outro tem que mudar junto, senão o texto passa no browser
// e é recusado no servidor sem a pessoa entender o porquê.
const PROJETO_MIN = 10

interface FormData {
  // Passo 1 — seu projeto
  momento: string
  categoria: string
  quantidade: string
  projeto: string
  // Passo 2 — sua fazenda
  uf: string
  cidade: string
  cabecas: string
  // Passo 3 — seus dados
  nome: string
  whatsapp: string
  email: string
  whatsappConsent: boolean
  // Passo 4 — formalização
  documento: string
  inscricaoEstadual: string
}

const EMPTY: FormData = {
  momento: '', categoria: '', quantidade: '', projeto: '',
  uf: '', cidade: '', cabecas: '',
  nome: '', whatsapp: '', email: '', whatsappConsent: false,
  documento: '', inscricaoEstadual: '',
}

type Errors = Partial<Record<keyof FormData, string>>

const TOTAL = 4

// A ordem é a de copy.form.passos e é deliberadamente o inverso do /touros:
// projeto → fazenda → contato → formalização. Custo psicológico crescente, com
// o dado pessoal só depois que a pessoa já se qualificou sozinha.
const STEP_FIELDS: (keyof FormData)[][] = [
  ['momento', 'categoria', 'quantidade', 'projeto'],
  ['uf', 'cidade', 'cabecas'],
  ['nome', 'whatsapp', 'email', 'whatsappConsent'],
  ['documento', 'inscricaoEstadual'],
]

function validate(d: FormData): Errors {
  const e: Errors = {}
  if (!d.momento) e.momento = copy.erros.momento
  if (!d.categoria) e.categoria = copy.erros.categoria
  if (!d.quantidade) e.quantidade = copy.erros.quantidade
  if (d.projeto.trim().length < PROJETO_MIN) e.projeto = copy.erros.projeto
  if (!d.uf) e.uf = copy.erros.uf
  if (!d.cabecas) e.cabecas = copy.erros.cabecas
  if (d.nome.trim().length < 3) e.nome = copy.erros.nome
  if (!whatsappValido(d.whatsapp)) e.whatsapp = copy.erros.whatsapp
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = copy.erros.email
  if (!d.whatsappConsent) e.whatsappConsent = copy.erros.whatsappConsent
  // Dígito verificador, a MESMA função que o servidor usa (_lib/qualificacao).
  // Checar só o comprimento aqui deixaria o documento inventado passar no
  // browser e morrer no servidor com uma mensagem que a pessoa não relaciona ao
  // campo que digitou.
  if (!documentoValido(d.documento)) e.documento = copy.erros.documento
  if (!d.inscricaoEstadual) e.inscricaoEstadual = copy.erros.inscricaoEstadual
  return e
}

export function LeadForm() {
  const reduce = useSafeReducedMotion()
  const [data, setData] = useState<FormData>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)
  const [cidades, setCidades] = useState<string[]>([])
  const [loadingCidades, setLoadingCidades] = useState(false)
  const [step, setStep] = useState(0)
  const utmRef = useRef<Utm>(EMPTY_UTM)
  const startedRef = useRef(false)
  // A troca de passo rola até o CARD (não até a seção): acima do formulário há
  // marca e manchete, e alinhar pela seção deixaria o passo novo fora da tela no
  // mobile.
  const formRef = useRef<HTMLFormElement>(null)

  // Rolagem/animação respeitam prefers-reduced-motion (INV-6).
  const scrollBehavior: ScrollBehavior = reduce ? 'auto' : 'smooth'

  useEffect(() => {
    utmRef.current = captureUtms()
    void initAnalytics(utmRef.current)
  }, [])

  // Autocomplete de cidade por UF via IBGE — mesmo caminho do /touros.
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
      trackFunnel('femeas_form_started')
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

  // Rola até o primeiro campo inválido E o foca. Focar (e não só rolar, como faz
  // o /touros) é o que faz o erro chegar a quem usa leitor de tela: o <p
  // role="alert"> está ligado ao controle por aria-describedby, então mover o
  // foco para lá anuncia rótulo + mensagem juntos.
  function focusFirstError() {
    requestAnimationFrame(() => {
      const holder = document.querySelector<HTMLElement>('[data-invalid="true"]')
      if (!holder) return
      holder.scrollIntoView({ behavior: scrollBehavior, block: 'center' })
      const control = holder.querySelector<HTMLElement>('input, select, textarea, button')
      control?.focus({ preventScroll: true })
    })
  }

  function goNext() {
    const e = validateStep(step)
    setErrors(e)
    trackFunnel('femeas_step_attempt', { step: step + 1 })
    if (Object.keys(e).length) {
      // `fields` é o que permite ler DEPOIS qual campo custou quanto. Sem esta
      // chave, discutir o atrito vira opinião.
      trackFunnel('femeas_validation_failed', { step: step + 1, fields: Object.keys(e) })
      focusFirstError()
      return
    }
    const ns = Math.min(step + 1, TOTAL - 1)
    setStep(ns)
    trackFunnel('femeas_step_reached', { step: ns + 1 })
    formRef.current?.scrollIntoView({ behavior: scrollBehavior, block: 'start' })
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
    trackFunnel('femeas_submit_attempt')
    if (Object.keys(e).length) {
      trackFunnel('femeas_validation_failed', { fields: Object.keys(e) })
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
      const res = await fetch('/api/femeas/lead', {
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
          categoria: data.categoria,
          quantidade: data.quantidade,
          projeto: data.projeto,
          documento: data.documento,
          inscricaoEstadual: data.inscricaoEstadual,
          whatsappConsent: data.whatsappConsent,
          event_id: eventId,
          ...utmRef.current,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        // A mensagem do SERVIDOR é mostrada como veio: ela é específica
        // ("Selecione um estado válido.") e é o que permite a pessoa corrigir.
        throw new Error(body?.error || copy.ui.falhaEnvio)
      }
      const body = await res.json().catch(() => ({}))
      trackLeadConversion({
        utm: utmRef.current,
        leadId: body?.id ?? null,
        isMql: body?.is_mql === true,
        eventId,
      })
      // ⚠️ INV-1 — NAVEGAÇÃO HARD. NÃO trocar por navegação SPA (o router do
      // Next, <Link>): o guard da Fase 10 é um grep, então nem em comentário.
      //
      // O veredito é do SERVIDOR (INV-3): `is_mql` escolhe a URL de obrigado, e
      // URLs separadas são o que habilita meta de conversão por URL no Meta e no
      // Google. A tag de conversão roda no GTM pelo gatilho Page View DAQUELA
      // URL — e só um load completo dispara Page View. Navegação SPA não
      // recarrega o GTM: a página trocaria normalmente, ninguém veria erro
      // nenhum, e a conversão simplesmente deixaria de ser contada.
      //
      // O status fica em 'submitting' de propósito: o formulário desmonta na
      // navegação, e voltar para 'idle' só criaria um piscar do botão.
      window.location.assign(
        body?.is_mql === true ? '/obrigado-femeas-mql' : '/obrigado-femeas-lead',
      )
    } catch (err) {
      // Estado de erro que NÃO limpa `data`: o append na planilha é a única
      // gravação do lead e pode falhar (o servidor devolve 500 de propósito, em
      // vez de fingir sucesso). A pessoa reenvia com tudo preenchido.
      setStatus('error')
      setServerError(err instanceof Error ? err.message : null)
    }
  }

  const invalid = (k: keyof FormData) => (errors[k] ? 'true' : undefined)

  // ── PELE: card flat near-black + hairline. Sem blur, sem sombra, radius 2. ──
  const cardStyle: React.CSSProperties = {
    background: dark.surface,
    border: `1px solid ${dark.hairline}`,
    borderRadius: radius.xs,
    colorScheme: 'dark',
    scrollMarginTop: 12,
  }

  const slide = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, x: 12 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -12 } }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="p-5 sm:p-8" style={cardStyle} data-femeas-form>
      {/* ANEL DE FOCO — WCAG 2.1 SC 2.4.7 (AA), herdado do /saogeraldo (6ba4085).
          Precisa de <style> e de !important porque `inputStyle()` aplica
          `outline: 'none'` INLINE, e estilo inline em React não expressa
          :focus-visible — nenhuma regra de folha externa vence sem !important.
          `outline` e não `box-shadow` porque outline não participa do layout:
          o anel não empurra vizinho nem muda a altura do campo. */}
      <style>{`
        [data-femeas-form] input:focus-visible,
        [data-femeas-form] select:focus-visible,
        [data-femeas-form] textarea:focus-visible,
        [data-femeas-form] button:focus-visible {
          outline: 2px solid ${dark.gold} !important;
          outline-offset: 2px;
          border-color: ${dark.gold} !important;
        }
      `}</style>

      {/* Cabeçalho — diz O QUE é e O QUE acontece depois. Aqui isso não é
          cortesia: é o filtro trabalhando antes do primeiro campo. */}
      <div className="mb-5 sm:mb-6" style={{ borderBottom: `1px solid ${dark.hairline}`, paddingBottom: 18 }}>
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
      <div className="mb-6 sm:mb-7">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <span style={{ ...typo.monoLabel, color: dark.gold }}>
            {copy.ui.passo} {step + 1} {copy.ui.passoSep} {TOTAL}
          </span>
          <span style={{ ...typo.monoLabel, color: dark.muted, textAlign: 'right' }}>
            {copy.passos[step]}
          </span>
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
          className="flex flex-col gap-4 sm:gap-5"
        >
          {/* ── PASSO 1 · SEU PROJETO ──────────────────────────────────────
              O passo que desqualifica. Nada aqui é dado pessoal: quem não se
              reconhece fecha a aba sem ter virado lead — e sem ter custado
              hora de SDR, que é o recurso escasso do funil. */}
          {step === 0 && (
            <>
              <Field label={copy.labels.momento} error={errors.momento} invalid={invalid('momento')}>
                <select value={data.momento} onChange={(e) => set('momento', e.target.value)} style={inputStyle(!!errors.momento)}>
                  <option value="">{copy.ui.selecione}</option>
                  {copy.momentos.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>

              <Field label={copy.labels.categoria} error={errors.categoria} invalid={invalid('categoria')}>
                <select value={data.categoria} onChange={(e) => set('categoria', e.target.value)} style={inputStyle(!!errors.categoria)}>
                  <option value="">{copy.ui.selecione}</option>
                  {/* value = id (o que o CRM grava), label = nome (o que a
                      pessoa lê). Ver _lib/categorias.ts — fonte única. */}
                  {CATEGORIA_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Field>

              <Field label={copy.labels.quantidade} error={errors.quantidade} invalid={invalid('quantidade')}>
                <select value={data.quantidade} onChange={(e) => set('quantidade', e.target.value)} style={inputStyle(!!errors.quantidade)}>
                  <option value="">{copy.ui.selecione}</option>
                  {/* "mais de 50 matrizes" continua na lista de propósito: é a
                      faixa que a rodada anterior trouxe em massa. Tirar a opção
                      não tira a pessoa, só esconde da equipe que ela chegou. */}
                  {copy.quantidades.map((q) => <option key={q} value={q}>{q}</option>)}
                </select>
              </Field>

              <Field
                label={copy.labels.projeto}
                error={errors.projeto}
                invalid={invalid('projeto')}
                hint={copy.porques.projeto}
              >
                <textarea
                  value={data.projeto}
                  onChange={(e) => set('projeto', e.target.value)}
                  placeholder={copy.placeholders.projeto}
                  rows={4}
                  style={{ ...inputStyle(!!errors.projeto), minHeight: 118, padding: '12px 14px', lineHeight: 1.5, resize: 'vertical' }}
                />
              </Field>
            </>
          )}

          {/* ── PASSO 2 · SUA FAZENDA ─────────────────────────────────────── */}
          {step === 1 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
                <Field label={copy.labels.uf} error={errors.uf} invalid={invalid('uf')}>
                  <select
                    value={data.uf}
                    onChange={(e) => { set('uf', e.target.value); set('cidade', ''); setCidades([]) }}
                    style={inputStyle(!!errors.uf)}
                  >
                    <option value="">{copy.ui.selecione}</option>
                    {UF_OPTIONS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                </Field>

                <Field label={`${copy.labels.cidade} ${copy.ui.opcional}`}>
                  <select
                    value={data.cidade}
                    disabled={!data.uf || loadingCidades}
                    onChange={(e) => set('cidade', e.target.value)}
                    style={inputStyle(false)}
                  >
                    <option value="">
                      {loadingCidades ? copy.ui.carregando : !data.uf ? copy.ui.escolhaUf : copy.ui.selecione}
                    </option>
                    {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>

              <Field
                label={copy.labels.rebanho}
                error={errors.cabecas}
                invalid={invalid('cabecas')}
                hint={copy.porques.rebanho}
              >
                <select value={data.cabecas} onChange={(e) => set('cabecas', e.target.value)} style={inputStyle(!!errors.cabecas)}>
                  <option value="">{copy.ui.selecione}</option>
                  {copy.rebanhos.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </>
          )}

          {/* ── PASSO 3 · SEUS DADOS ───────────────────────────────────────
              Só agora se pede contato. E-mail é opcional de propósito: o funil é
              WhatsApp, e atrito que não qualifica é o único tipo proibido aqui. */}
          {step === 2 && (
            <>
              <Field label={copy.labels.nome} error={errors.nome} invalid={invalid('nome')}>
                <input
                  type="text" inputMode="text" autoComplete="name"
                  value={data.nome} onChange={(e) => set('nome', e.target.value)}
                  placeholder={copy.placeholders.nome} style={inputStyle(!!errors.nome)}
                />
              </Field>

              <Field label={copy.labels.whatsapp} error={errors.whatsapp} invalid={invalid('whatsapp')}>
                <input
                  type="tel" inputMode="tel" autoComplete="tel"
                  value={data.whatsapp}
                  onChange={(e) => set('whatsapp', aplicarMascaraTelefone(e.target.value))}
                  placeholder={copy.placeholders.whatsapp} style={inputStyle(!!errors.whatsapp)}
                />
              </Field>

              <Field label={`${copy.labels.email} ${copy.ui.opcional}`} error={errors.email} invalid={invalid('email')}>
                <input
                  type="email" inputMode="email" autoComplete="email"
                  value={data.email} onChange={(e) => set('email', e.target.value)}
                  placeholder={copy.placeholders.email} style={inputStyle(!!errors.email)}
                />
              </Field>

              <label className="mt-1 flex cursor-pointer items-start gap-3" data-invalid={invalid('whatsappConsent')}>
                <input
                  type="checkbox" checked={data.whatsappConsent}
                  onChange={(e) => set('whatsappConsent', e.target.checked)}
                  aria-invalid={errors.whatsappConsent ? true : undefined}
                  style={{ width: 20, height: 20, marginTop: 2, accentColor: dark.gold, flexShrink: 0 }}
                />
                <span style={{ fontFamily: font.body, fontSize: 14, lineHeight: 1.45, color: errors.whatsappConsent ? ERR : dark.muted }}>
                  {copy.consent}
                </span>
              </label>
              {/* Mesma regra do <Campo/>: erro é prosa, e prosa de erro vai em
                  14px. `fontFamily` explícito porque este <p> está fora do
                  <Campo/> e não herda a família do formulário. */}
              {errors.whatsappConsent && (
                <p role="alert" style={{ fontFamily: font.body, fontSize: 14, lineHeight: 1.45, color: ERR, marginTop: -8 }}>
                  {errors.whatsappConsent}
                </p>
              )}
            </>
          )}

          {/* ── PASSO 4 · FORMALIZAÇÃO ─────────────────────────────────────
              O atrito de sinalização, por último de propósito: quem chegou aqui
              já investiu três passos. Os dois campos vêm com o PORQUÊ ao lado —
              atrito sem justificativa é abandono; atrito justificado é sinal. */}
          {step === 3 && (
            <>
              <Field
                label={copy.labels.cpf}
                error={errors.documento}
                invalid={invalid('documento')}
                hint={copy.porques.cpf}
              >
                <input
                  type="text" inputMode="numeric" autoComplete="off"
                  value={data.documento}
                  // Máscara compartilhada com o servidor: o que a pessoa vê é o
                  // mesmo formato que vai para a fila do SDR.
                  onChange={(e) => set('documento', mascaraDocumento(e.target.value))}
                  placeholder={copy.placeholders.documento} style={inputStyle(!!errors.documento)}
                />
              </Field>

              <Field
                label={copy.labels.inscricaoEstadual}
                error={errors.inscricaoEstadual}
                invalid={invalid('inscricaoEstadual')}
                hint={copy.porques.inscricaoEstadual}
                group
              >
                {/* Dois botões, não <select>: a resposta é binária e o alvo de
                    toque fica em 50px cheios no mobile. */}
                <div className="flex gap-3" role="radiogroup">
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

              {status === 'error' && (
                <p role="alert" style={{ fontFamily: font.body, fontSize: 14, lineHeight: 1.5, color: ERR }}>
                  {serverError ? `${serverError} ` : ''}{copy.ui.tenteNovamente}
                </p>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navegação — botões retos, caixa alta, alvo ≥54px (INV-6). */}
      <div className="mt-7 flex items-center gap-3 sm:mt-8">
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
            <ArrowLeft size={16} aria-hidden /> {copy.ui.voltar}
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
            {copy.ui.continuar} <ArrowRight size={18} aria-hidden />
          </button>
        ) : (
          <button
            type="submit" disabled={status === 'submitting'}
            style={{
              flex: 1, minHeight: 56, borderRadius: radius.none,
              fontFamily: font.display, fontWeight: 600, fontSize: 15,
              textTransform: 'uppercase', letterSpacing: '0.14em',
              background: dark.gold, color: '#0D0D0D',
              cursor: status === 'submitting' ? 'wait' : 'pointer',
              opacity: status === 'submitting' ? 0.75 : 1,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}
          >
            {status === 'submitting' ? (
              <><Loader2 size={18} className="animate-spin" aria-hidden /> {copy.submitting}</>
            ) : (
              <>{copy.submit} <ArrowRight size={18} aria-hidden /></>
            )}
          </button>
        )}
      </div>

      {/* No último passo o aviso de que nem todo cadastro vira reunião aparece
          ANTES do clique — é o último filtro, e ele é intencional. */}
      {step === TOTAL - 1 && (
        <p className="mt-4" style={{ fontFamily: font.body, fontSize: 13, lineHeight: 1.5, color: dark.muted, textAlign: 'center' }}>
          {copy.submitNote}
        </p>
      )}

      <p
        className="mt-3 flex items-center justify-center gap-1.5 text-center"
        style={{ ...typo.monoLabel, fontSize: 10.5, letterSpacing: '0.1em', color: dark.muted }}
      >
        <ShieldCheck size={12} aria-hidden /> {copy.ui.sigilo}
      </p>
    </form>
  )
}

/**
 * Campo com rótulo, porquê e erro amarrados por ARIA.
 *
 * Diferença deliberada em relação ao Field do /touros: lá o hint SOME quando há
 * erro (`showHint = Boolean(hint) && !error`). Aqui o hint é a justificativa do
 * atrito — é exatamente no momento do erro que a pessoa mais precisa saber por
 * que aquele campo existe. Os dois convivem, e o `aria-describedby` lista os
 * dois ids.
 *
 * `group` troca o <label for> por um rótulo referenciado via aria-labelledby:
 * é o caso do radiogroup de inscrição estadual, onde o controle é um <div> e
 * `for` não teria a quem apontar.
 */
function Field({
  label, error, hint, invalid, group = false, children,
}: {
  label: string
  error?: string
  hint?: string
  invalid?: string
  group?: boolean
  children: React.ReactNode
}) {
  const uid = useId()
  const fieldId = `ff-${uid}`
  const labelId = `fl-${uid}`
  const errId = `fe-${uid}`
  const hintId = `fh-${uid}`
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined

  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        ...(group ? { 'aria-labelledby': labelId } : { id: fieldId }),
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })
    : children

  const labelStyle: React.CSSProperties = {
    fontFamily: font.display,
    fontSize: 12.5,
    fontWeight: 600,
    color: dark.text,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  }

  return (
    <div data-invalid={invalid}>
      {group ? (
        <span id={labelId} className="mb-2 block" style={labelStyle}>{label}</span>
      ) : (
        <label htmlFor={fieldId} className="mb-2 block" style={labelStyle}>{label}</label>
      )}
      {control}
      {/* ⚠️ 14px, NÃO 12,5px (06/08). O RÓTULO acima continua em 12,5 e está
          certo: ele é Oswald caixa-alta com tracking, que é a família de rótulo
          desta página. Estes dois são PROSA em Inter — e prosa de 12,5px num
          iPhone é o menor texto de leitura da página inteira, justamente no
          único ponto em que a pessoa PRECISA ler para conseguir continuar (a
          mensagem de erro). O próprio formulário já usava 14px para prosa
          auxiliar em dois lugares (o olho do card e o texto do consentimento);
          isto aqui era a exceção, não a regra.
          ⚠️ Não mexe no `primeiroCampo`: os dois nascem DEPOIS do controle. */}
      {hint && (
        <p id={hintId} className="mt-1.5" style={{ fontFamily: font.body, fontSize: 14, color: dark.muted, lineHeight: 1.45 }}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="mt-1.5" style={{ fontFamily: font.body, fontSize: 14, lineHeight: 1.45, color: ERR }}>
          {error}
        </p>
      )}
    </div>
  )
}

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%',
    minHeight: 50, // alvo de toque ≥44px (INV-6)
    padding: '0 14px',
    borderRadius: radius.xs,
    fontSize: 16, // ⚠️ ≥16px — abaixo disso o iOS dá zoom ao focar o campo
    fontFamily: 'Inter, sans-serif',
    background: dark.bg, // inset editorial sobre o card #141414
    color: dark.text,
    border: `1px solid ${hasError ? ERR : dark.hairlineStrong}`,
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
  }
}
