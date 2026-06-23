'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowLeft, BarChart3, Calendar, ExternalLink, FileText, Loader2,
  MessageCircle, MousePointerClick, Timer, TrendingUp, Users, Video, Zap,
} from 'lucide-react'
import {
  getJmpPosthogAnalytics,
  isPosthogConfigured,
  type JmpPostHogAnalytics,
} from '@/actions/posthog'
import {
  getJmpMetaAdsAnalytics,
  type JmpMetaAdsAnalytics,
} from '@/actions/metaAds'
import {
  getJmpLeadQualificationAnalytics,
  type JmpLeadQualificationAnalytics,
} from '@/actions/jmpLeads'

const POSTHOG_PROJECT_URL = 'https://us.posthog.com/project/430113'
const POSTHOG_JMP_HEATMAP_URL = `${POSTHOG_PROJECT_URL}/heatmaps/Hzko8WZa?pageURL=https%3A%2F%2Fjmp.bulaassessoria.com%2F&dataUrl=https%3A%2F%2Fjmp.bulaassessoria.com%2F*`
const card = 'rounded-2xl border border-neutral-200/80 bg-white shadow-sm'

// ── Seletor de período (dias-calendário no fuso de Brasília) ──
type PeriodKey = 'hoje' | 'ontem' | '7d' | '14d' | '30d' | 'custom'

const PERIOD_PRESETS: { key: PeriodKey; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'ontem', label: 'Ontem' },
  { key: '7d', label: '7 dias' },
  { key: '14d', label: '14 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'custom', label: 'Personalizado' },
]

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília. */
function todaySp(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Soma `days` a uma data YYYY-MM-DD (aritmética em UTC-meio-dia, imune a fuso). */
function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatNumber(value: number) {
  return value.toLocaleString('pt-BR')
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatPercent(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function formatCurrency(value: number, currency = 'BRL') {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  })
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 1000) / 10
}

function Kpi({ label, value, icon, hint }: { label: string; value: string | number; icon: React.ReactNode; hint?: string }) {
  return (
    <div className={card}>
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-neutral-500">
          <span className="text-emerald-700">{icon}</span>
          {label}
        </div>
        <div className="mt-2 text-2xl font-black text-neutral-950">{typeof value === 'number' ? formatNumber(value) : value}</div>
        {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
      </div>
    </div>
  )
}

function RequestedMetric({
  label,
  value,
  hint,
  status = 'ok',
  source,
}: {
  label: string
  value: string | number
  hint: string
  status?: 'ok' | 'pending'
  source?: string
}) {
  const valueClass = status === 'pending' ? 'text-neutral-400' : 'text-neutral-950'
  const badgeClass = status === 'pending'
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : 'border-emerald-200 bg-emerald-50 text-emerald-800'

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">{label}</p>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${badgeClass}`}>
          {source || (status === 'pending' ? 'Meta Ads' : 'PostHog')}
        </span>
      </div>
      <div className={`mt-2 text-2xl font-black ${valueClass}`}>{typeof value === 'number' ? formatNumber(value) : value}</div>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">{hint}</p>
    </div>
  )
}

function BarList({ rows, empty = 'Sem dados ainda' }: { rows: { label: string; count: number }[]; empty?: string }) {
  const max = Math.max(...rows.map((r) => r.count), 1)
  if (!rows.length) return <p className="py-6 text-center text-sm italic text-neutral-400">{empty}</p>
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium text-neutral-800">{row.label}</span>
            <span className="shrink-0 font-mono text-neutral-500">{formatNumber(row.count)}</span>
          </div>
          <div className="h-2 rounded-full bg-neutral-100">
            <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={card}>
      <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3">
        <span className="text-emerald-700">{icon}</span>
        <h2 className="text-sm font-bold text-neutral-900">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export default function AdminJmpAnalytics() {
  const [configured, setConfigured] = useState(false)
  const [data, setData] = useState<JmpPostHogAnalytics | null>(null)
  const [metaAds, setMetaAds] = useState<JmpMetaAdsAnalytics | null>(null)
  const [leadQualification, setLeadQualification] = useState<JmpLeadQualificationAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Período selecionado (presets ou intervalo personalizado).
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [customFrom, setCustomFrom] = useState(() => shiftDate(todaySp(), -6))
  const [customTo, setCustomTo] = useState(() => todaySp())

  const range = useMemo(() => {
    const today = todaySp()
    switch (period) {
      case 'hoje': return { since: today, until: today }
      case 'ontem': { const y = shiftDate(today, -1); return { since: y, until: y } }
      case '7d': return { since: shiftDate(today, -6), until: today }
      case '14d': return { since: shiftDate(today, -13), until: today }
      case '30d': return { since: shiftDate(today, -29), until: today }
      case 'custom': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(customFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(customTo)) return null
        return customFrom <= customTo
          ? { since: customFrom, until: customTo }
          : { since: customTo, until: customFrom }
      }
    }
  }, [period, customFrom, customTo])

  const rangeLabel = useMemo(() => {
    if (!range) return ''
    return range.since === range.until
      ? formatDateBr(range.since)
      : `${formatDateBr(range.since)} a ${formatDateBr(range.until)}`
  }, [range])

  useEffect(() => {
    if (!range) return // intervalo personalizado incompleto — mantém os dados atuais
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const ok = await isPosthogConfigured()
        if (cancelled) return
        setConfigured(ok)
        const [posthogData, metaAdsData, leadQualificationData] = await Promise.all([
          ok ? getJmpPosthogAnalytics(range!) : Promise.resolve(null),
          getJmpMetaAdsAnalytics(range!),
          getJmpLeadQualificationAnalytics(range!),
        ])
        if (cancelled) return
        if (ok) setData(posthogData)
        setMetaAds(metaAdsData)
        setLeadQualification(leadQualificationData)
      } catch {
        if (!cancelled) setError('Nao foi possivel carregar as metricas do PostHog.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [range])

  const rates = useMemo(() => {
    if (!data) return null
    const summary = data.summary
    const adClicks = metaAds?.linkClicks || metaAds?.clicks || 0
    return {
      landingToFormStartRate: pct(summary.formStarts, summary.uniqueVisitors),
      landingToSubmitRate: pct(summary.formSubmissions, summary.uniqueVisitors),
      accessToLeadRate: pct(summary.formSubmissions, summary.pageviews),
      impressionToClickRate: pct(adClicks, metaAds?.impressions || 0),
      clickToAccessRate: pct(summary.pageviews, adClicks),
      formCompletionRate: pct(summary.formSubmissions, summary.formStarts),
      formAbandonmentRate: pct(summary.formAbandonments, summary.formStarts),
      whatsappClickRate: pct(summary.whatsappClicks, summary.formSubmissions || summary.uniqueVisitors),
      costPerLead: summary.formSubmissions ? (metaAds?.spend || 0) / summary.formSubmissions : 0,
    }
  }, [data, metaAds])

  const metaAdsReady = Boolean(metaAds?.configured && !metaAds.error)
  const metaAdsClicks = metaAds?.linkClicks || metaAds?.clicks || 0

  return (
    <div className="min-h-screen bg-neutral-100 text-neutral-900">
      <header className="sticky top-0 z-20 border-b border-black/20 bg-[#102a1d] text-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Painel
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-black tracking-tight">Metricas JMP</h1>
            <p className="text-xs text-white/60">PostHog da landing jmp.bulaassessoria.com</p>
          </div>
          <a href="https://jmp.bulaassessoria.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white">
            Ver landing <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a href={POSTHOG_PROJECT_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-bold text-[#102a1d] transition hover:bg-white/90">
            Abrir PostHog <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-black text-neutral-950">Comportamento dos usuarios</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {rangeLabel ? `Período: ${rangeLabel}` : 'Selecione o período'} · eventos da landing JMP.
            </p>
          </div>

          {/* Seletor de período */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-neutral-200 bg-white p-1 shadow-sm">
              {PERIOD_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    period === p.key
                      ? 'bg-[#102a1d] text-white'
                      : 'text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 shadow-sm">
                <Calendar className="h-4 w-4 text-neutral-400" />
                <input
                  type="date"
                  value={customFrom}
                  max={todaySp()}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-transparent text-sm font-semibold text-neutral-800 outline-none"
                />
                <span className="text-xs text-neutral-400">até</span>
                <input
                  type="date"
                  value={customTo}
                  max={todaySp()}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-transparent text-sm font-semibold text-neutral-800 outline-none"
                />
              </div>
            )}
          </div>
        </div>

        {loading && (
          <div className="flex min-h-72 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando metricas...
          </div>
        )}

        {!loading && !configured && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-bold">PostHog configurado para captura, mas sem leitura no painel.</p>
            <p className="mt-1">Adicione `POSTHOG_PERSONAL_API_KEY` nas variaveis de ambiente para esta pagina consultar o HogQL. Enquanto isso, os dados entram no projeto PostHog normalmente.</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700">{error}</div>
        )}

        {!loading && data && rates && (
          <>
            <Panel title="Indicadores solicitados" icon={<BarChart3 className="h-4 w-4" />}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <RequestedMetric
                  label="Visualizacoes nos anuncios"
                  value={metaAdsReady ? (metaAds?.impressions || 0) : 'Aguardando token'}
                  status={metaAdsReady ? 'ok' : 'pending'}
                  source="Meta Ads"
                  hint={metaAdsReady ? `Campanha ${metaAds?.campaignIds.join(', ')}.` : 'Token da Meta pendente para ler impressoes da campanha.'}
                />
                <RequestedMetric
                  label="Cliques nos anuncios"
                  value={metaAdsReady ? metaAdsClicks : 'Aguardando token'}
                  status={metaAdsReady ? 'ok' : 'pending'}
                  source="Meta Ads"
                  hint={metaAdsReady ? `${formatNumber(metaAds?.clicks || 0)} cliques totais; ${formatNumber(metaAds?.linkClicks || 0)} cliques no link.` : 'Token da Meta pendente para ler cliques reais antes do acesso.'}
                />
                <RequestedMetric
                  label="Acessos na pagina"
                  value={data.summary.pageviews}
                  hint={`${formatNumber(data.summary.uniqueVisitors)} visitantes e ${formatNumber(data.summary.sessions)} sessoes no período.`}
                />
                <RequestedMetric
                  label="Leads gerados"
                  value={data.summary.formSubmissions}
                  hint="Formulario enviado com sucesso na landing JMP."
                />
                <RequestedMetric
                  label="Conversao visualizacao > clique"
                  value={metaAdsReady ? formatPercent(rates.impressionToClickRate) : 'Aguardando token'}
                  status={metaAdsReady ? 'ok' : 'pending'}
                  source="Meta Ads"
                  hint={metaAdsReady ? `${formatNumber(metaAdsClicks)} cliques sobre ${formatNumber(metaAds?.impressions || 0)} visualizacoes.` : 'Depende de impressoes e cliques do Meta Ads.'}
                />
                <RequestedMetric
                  label="Conversao clique > acesso"
                  value={metaAdsReady ? formatPercent(rates.clickToAccessRate) : 'Aguardando token'}
                  status={metaAdsReady ? 'ok' : 'pending'}
                  source="Meta + PostHog"
                  hint={metaAdsReady ? `${formatNumber(data.summary.pageviews)} acessos sobre ${formatNumber(metaAdsClicks)} cliques no anuncio.` : 'Depende dos cliques do anuncio no Meta para comparar com acessos no site.'}
                />
                <RequestedMetric
                  label="Conversao acesso > lead"
                  value={formatPercent(rates.accessToLeadRate)}
                  hint={`${formatNumber(data.summary.formSubmissions)} leads sobre ${formatNumber(data.summary.pageviews)} acessos.`}
                />
                <RequestedMetric
                  label="Custo por lead"
                  value={metaAdsReady ? formatCurrency(rates.costPerLead, metaAds?.currency) : 'Aguardando token'}
                  status={metaAdsReady ? 'ok' : 'pending'}
                  source="Meta + PostHog"
                  hint={metaAdsReady ? `${formatCurrency(metaAds?.spend || 0, metaAds?.currency)} de gasto / ${formatNumber(data.summary.formSubmissions)} leads.` : 'Precisa do gasto da campanha no Meta Ads para calcular gasto / leads.'}
                />
              </div>

              {metaAds?.error && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-bold">Meta Ads ainda nao retornou dados.</p>
                  <p className="mt-1">{metaAds.error}</p>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-neutral-900">Cliques rastreados dentro da landing</p>
                    <p className="mt-1 text-xs text-neutral-500">Soma de CTA, WhatsApp, formulario, YouTube e Instagram capturados pelo PostHog.</p>
                  </div>
                  <div className="text-2xl font-black text-neutral-950">{formatNumber(data.summary.trackedClicks)}</div>
                </div>
              </div>
            </Panel>

            <Panel title="Qualificacao dos leads" icon={<Users className="h-4 w-4" />}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <RequestedMetric
                  label="O que e MQL"
                  value="Lead qualificado"
                  source="CRM"
                  hint={leadQualification?.mqlDefinition || 'MQL e o lead com perfil minimo para abordagem comercial.'}
                />
                <RequestedMetric
                  label="MQLs gerados"
                  value={leadQualification?.mqlLeads ?? 0}
                  source="CRM"
                  hint={`${formatPercent(leadQualification?.mqlRate ?? 0)} dos leads JMP do período, recalculado pela regra atual.`}
                />
                <RequestedMetric
                  label="Leads com IE"
                  value={leadQualification?.leadsWithIe ?? 0}
                  source="CRM"
                  hint={`${formatPercent(leadQualification?.ieRate ?? 0)} dos leads informaram Inscricao Estadual.`}
                />
                <RequestedMetric
                  label="Com IE, nao MQL"
                  value={leadQualification?.leadsWithIeNotMql ?? 0}
                  source="CRM"
                  hint="Leads que cairam com IE, mas nao bateram todos os criterios de MQL."
                />
              </div>

              {leadQualification?.error && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-bold">Qualificacao CRM nao carregou.</p>
                  <p className="mt-1">{leadQualification.error}</p>
                </div>
              )}
            </Panel>

            <Panel title="Por dia" icon={<Calendar className="h-4 w-4" />}>
              {data.daily.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 text-left text-xs font-bold uppercase tracking-wide text-neutral-500">
                        <th className="py-2 pr-4">Data</th>
                        <th className="py-2 pr-4 text-right">Acessos</th>
                        <th className="py-2 pr-4 text-right">Visitantes</th>
                        <th className="py-2 pr-4 text-right">Leads</th>
                        <th className="py-2 text-right">Conv. acesso → lead</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.daily].reverse().map((row) => (
                        <tr key={row.date} className="border-b border-neutral-100 last:border-0">
                          <td className="py-2 pr-4 font-semibold text-neutral-800">{formatDateBr(row.date)}</td>
                          <td className="py-2 pr-4 text-right font-mono">{formatNumber(row.pageviews)}</td>
                          <td className="py-2 pr-4 text-right font-mono">{formatNumber(row.visitors)}</td>
                          <td className="py-2 pr-4 text-right font-mono font-bold text-emerald-700">{formatNumber(row.submissions)}</td>
                          <td className="py-2 text-right font-mono text-neutral-500">{formatPercent(pct(row.submissions, row.pageviews))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-6 text-center text-sm italic text-neutral-400">Sem dados no período selecionado</p>
              )}
            </Panel>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Visitantes" value={data.summary.uniqueVisitors} icon={<Users className="h-4 w-4" />} hint={`${formatNumber(data.summary.sessions)} sessoes`} />
              <Kpi label="Pageviews" value={data.summary.pageviews} icon={<FileText className="h-4 w-4" />} />
              <Kpi label="Tempo medio" value={formatTime(data.summary.avgTimeOnPageSeconds)} icon={<Timer className="h-4 w-4" />} hint={`${formatTime(data.summary.avgActiveSeconds)} ativo`} />
              <Kpi label="Scroll medio" value={formatPercent(data.summary.avgScrollDepthPercent)} icon={<Activity className="h-4 w-4" />} />
              <Kpi label="Cliques em CTA" value={data.summary.ctaClicks} icon={<MousePointerClick className="h-4 w-4" />} />
              <Kpi label="Cliques WhatsApp" value={data.summary.whatsappClicks} icon={<MessageCircle className="h-4 w-4" />} hint={`${formatPercent(rates.whatsappClickRate)} de referencia`} />
              <Kpi label="Formularios enviados" value={data.summary.formSubmissions} icon={<TrendingUp className="h-4 w-4" />} hint={`${formatPercent(rates.landingToSubmitRate)} dos visitantes`} />
              <Kpi label="Replays" value={data.summary.recordingsAvailable} icon={<Video className="h-4 w-4" />} />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <Kpi label="Visitante -> formulario" value={formatPercent(rates.landingToFormStartRate)} icon={<BarChart3 className="h-4 w-4" />} hint={`${formatNumber(data.summary.formStarts)} iniciados`} />
              <Kpi label="Conclusao do form" value={formatPercent(rates.formCompletionRate)} icon={<TrendingUp className="h-4 w-4" />} hint={`${formatNumber(data.summary.formSubmitAttempts)} tentativas`} />
              <Kpi label="Abandono do form" value={formatPercent(rates.formAbandonmentRate)} icon={<Activity className="h-4 w-4" />} hint={`${formatNumber(data.summary.formAbandonments)} abandonos`} />
              <Kpi label="WhatsApp apos lead" value={formatPercent(rates.whatsappClickRate)} icon={<MessageCircle className="h-4 w-4" />} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Funil do formulario" icon={<BarChart3 className="h-4 w-4" />}>
                <div className="space-y-3">
                  {data.formSteps.length ? data.formSteps.map((step) => (
                    <div key={step.step} className="rounded-xl border border-neutral-100 bg-neutral-50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-bold">Etapa {step.step}</span>
                        <span className="text-xs text-neutral-500">{formatNumber(step.views)} visualizacoes</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <span className="rounded-lg bg-white px-2 py-1">Concluidas: <b>{formatNumber(step.completions)}</b></span>
                        <span className="rounded-lg bg-white px-2 py-1">Erros: <b>{formatNumber(step.validationFailures)}</b></span>
                      </div>
                    </div>
                  )) : <p className="py-6 text-center text-sm italic text-neutral-400">Sem eventos de formulario ainda</p>}
                </div>
              </Panel>

              <Panel title="Eventos capturados" icon={<Zap className="h-4 w-4" />}>
                <BarList rows={data.events.map((event) => ({ label: event.event, count: event.count }))} />
              </Panel>

              <Panel title="Taxa de scroll" icon={<Activity className="h-4 w-4" />}>
                <BarList rows={data.scrollDepths} />
              </Panel>

              <Panel title="Interesses enviados" icon={<TrendingUp className="h-4 w-4" />}>
                <BarList rows={data.interests} />
              </Panel>

              <Panel title="Origem / UTM" icon={<MousePointerClick className="h-4 w-4" />}>
                <BarList rows={data.sources} />
              </Panel>

              <Panel title="Heatmap da landing" icon={<MousePointerClick className="h-4 w-4" />}>
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-sm font-bold text-emerald-950">Heatmap criado para jmp.bulaassessoria.com</p>
                    <p className="mt-1 text-sm text-emerald-900/75">
                      O mapa abre dentro do PostHog e pode levar alguns minutos para mostrar os primeiros cliques, movimentos e scrolls depois da captura ser habilitada.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <a
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#102a1d] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#173b2a]"
                      href={POSTHOG_JMP_HEATMAP_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir heatmap <ExternalLink className="h-4 w-4" />
                    </a>
                    <a
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-4 py-3 text-sm font-bold text-neutral-800 transition hover:border-emerald-500"
                      href={`${POSTHOG_PROJECT_URL}/heatmaps`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Lista de heatmaps <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </Panel>

              <Panel title="Links rapidos PostHog" icon={<ExternalLink className="h-4 w-4" />}>
                <div className="grid gap-3 sm:grid-cols-3">
                  <a className="rounded-xl border border-neutral-200 p-3 text-sm font-bold transition hover:border-emerald-500" href={`${POSTHOG_PROJECT_URL}/replay/home`} target="_blank" rel="noreferrer">Session replay</a>
                  <a className="rounded-xl border border-neutral-200 p-3 text-sm font-bold transition hover:border-emerald-500" href={POSTHOG_JMP_HEATMAP_URL} target="_blank" rel="noreferrer">Heatmap</a>
                  <a className="rounded-xl border border-neutral-200 p-3 text-sm font-bold transition hover:border-emerald-500" href={`${POSTHOG_PROJECT_URL}/web`} target="_blank" rel="noreferrer">Web analytics</a>
                </div>
              </Panel>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
