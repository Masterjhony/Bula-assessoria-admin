'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
    Calendar, RefreshCw, Settings, Loader2, X, CheckCircle2, AlertCircle,
    User, Mail, Phone, Link2, ExternalLink, ListChecks, Cog,
} from 'lucide-react'
import {
    type Agendamento, type AgendamentoStatus, type AgendamentosSettings,
    STATUS_LABELS, STATUS_COLORS, SOURCE_LABELS,
} from './types'
import { AgendamentoModal } from './AgendamentoModal'
import { SettingsModal } from './SettingsModal'

type Tab = 'lista' | 'configuracao'
const VALID_TABS: Tab[] = ['lista', 'configuracao']

export function AgendamentosClient() {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()

    const rawTab = searchParams.get('tab')
    const tab: Tab = (rawTab && (VALID_TABS as string[]).includes(rawTab)) ? (rawTab as Tab) : 'lista'

    const editingId = searchParams.get('id')

    const setTab = useCallback((next: Tab) => {
        const params = new URLSearchParams(searchParams.toString())
        if (next === 'lista') params.delete('tab')
        else params.set('tab', next)
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, [pathname, router, searchParams])

    const [list, setList] = useState<Agendamento[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

    // Filtros
    const [filterStatus, setFilterStatus] = useState<AgendamentoStatus | ''>('')
    const [filterSource, setFilterSource] = useState<string>('')
    const [filterQuery, setFilterQuery] = useState('')
    const [filterFrom, setFilterFrom] = useState('')
    const [filterTo, setFilterTo] = useState('')

    const fetchList = useCallback(async () => {
        setLoading(true)
        const params = new URLSearchParams()
        if (filterStatus) params.set('status', filterStatus)
        if (filterSource) params.set('source', filterSource)
        if (filterQuery.trim()) params.set('q', filterQuery.trim())
        if (filterFrom) params.set('from', new Date(filterFrom).toISOString())
        if (filterTo) {
            // Inclui o dia inteiro do "to"
            const d = new Date(filterTo)
            d.setDate(d.getDate() + 1)
            params.set('to', d.toISOString())
        }
        params.set('limit', '200')
        try {
            const res = await fetch(`/api/agendamentos?${params.toString()}`)
            if (!res.ok) throw new Error((await res.json()).error || 'Falha ao carregar')
            const data = await res.json()
            setList(data.data ?? [])
            setTotal(data.total ?? 0)
        } catch (e) {
            setFeedback({ type: 'err', msg: e instanceof Error ? e.message : 'Falha ao carregar' })
        } finally {
            setLoading(false)
        }
    }, [filterStatus, filterSource, filterQuery, filterFrom, filterTo])

    useEffect(() => { fetchList() }, [fetchList])

    const editing = useMemo(() => list.find(a => a.id === editingId) ?? null, [list, editingId])

    const openItem = (id: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('id', id)
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
    const closeItem = () => {
        const params = new URLSearchParams(searchParams.toString())
        params.delete('id')
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }

    const runSync = async () => {
        setSyncing(true)
        setFeedback(null)
        try {
            const res = await fetch('/api/agendamentos/sync', { method: 'POST' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Falha no sync')
            const msg = `Sync: ${data.inserted ?? 0} novos · ${data.updated ?? 0} atualizados · ${data.cancelled ?? 0} cancelados`
            setFeedback({ type: data.errors?.length ? 'err' : 'ok', msg: data.errors?.length ? `${msg} · ${data.errors[0]}` : msg })
            await fetchList()
        } catch (e) {
            setFeedback({ type: 'err', msg: e instanceof Error ? e.message : 'Falha no sync' })
        } finally {
            setSyncing(false)
        }
    }

    const [showSettings, setShowSettings] = useState(false)

    return (
        <div className="flex-1 min-h-[600px] flex flex-col">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3 shrink-0">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Calendar className="h-6 w-6 text-primary" />
                        Agendamentos
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Reuniões marcadas via Calendly (ponte Google Calendar) ou criadas manualmente. Vincula automaticamente ao lead pelo e-mail/telefone quando possível.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={runSync}
                        disabled={syncing}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border bg-background hover:bg-muted disabled:opacity-50"
                    >
                        {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Sincronizar agora
                    </button>
                    <button
                        onClick={() => setShowSettings(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border bg-background hover:bg-muted"
                    >
                        <Cog className="h-4 w-4" />
                        Configuração
                    </button>
                </div>
            </div>

            {feedback && (
                <div className={`flex items-start gap-2 px-3 py-2 rounded-md text-sm mb-3 ${
                    feedback.type === 'ok'
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400'
                }`}>
                    {feedback.type === 'ok' ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <AlertCircle className="h-4 w-4 mt-0.5" />}
                    <span>{feedback.msg}</span>
                    <button onClick={() => setFeedback(null)} className="ml-auto opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
                </div>
            )}

            <div className="border-b flex flex-wrap gap-1 shrink-0 mb-3">
                {[
                    { id: 'lista' as Tab, label: 'Lista', icon: ListChecks },
                    { id: 'configuracao' as Tab, label: 'Configuração', icon: Settings },
                ].map(t => {
                    const Icon = t.icon
                    const active = tab === t.id
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors -mb-px ${
                                active
                                    ? 'border-primary text-foreground font-semibold'
                                    : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {t.label}
                        </button>
                    )
                })}
            </div>

            {tab === 'lista' && (
                <>
                    {/* Filtros */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                        <input
                            type="text"
                            placeholder="Buscar nome, e-mail, telefone…"
                            value={filterQuery}
                            onChange={e => setFilterQuery(e.target.value)}
                            className="px-3 py-2 text-sm rounded-md border bg-background col-span-2"
                        />
                        <select
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value as AgendamentoStatus | '')}
                            className="px-3 py-2 text-sm rounded-md border bg-background"
                        >
                            <option value="">Todos status</option>
                            {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                        <select
                            value={filterSource}
                            onChange={e => setFilterSource(e.target.value)}
                            className="px-3 py-2 text-sm rounded-md border bg-background"
                        >
                            <option value="">Todas origens</option>
                            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                        <div className="flex gap-1 col-span-2 md:col-span-1">
                            <input
                                type="date"
                                value={filterFrom}
                                onChange={e => setFilterFrom(e.target.value)}
                                className="px-2 py-2 text-sm rounded-md border bg-background w-full"
                            />
                            <input
                                type="date"
                                value={filterTo}
                                onChange={e => setFilterTo(e.target.value)}
                                className="px-2 py-2 text-sm rounded-md border bg-background w-full"
                            />
                        </div>
                    </div>

                    {/* Lista */}
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                    ) : list.length === 0 ? (
                        <EmptyState />
                    ) : (
                        <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">{total} agendamento{total === 1 ? '' : 's'}</div>
                            {list.map(item => (
                                <AgendamentoRow key={item.id} item={item} onClick={() => openItem(item.id)} />
                            ))}
                        </div>
                    )}
                </>
            )}

            {tab === 'configuracao' && (
                <ConfiguracaoTab onOpenSettings={() => setShowSettings(true)} />
            )}

            {editing && (
                <AgendamentoModal
                    agendamento={editing}
                    onClose={closeItem}
                    onChanged={() => { fetchList() }}
                />
            )}

            {showSettings && (
                <SettingsModal
                    onClose={() => setShowSettings(false)}
                    onSaved={() => { setShowSettings(false); fetchList() }}
                />
            )}
        </div>
    )
}

function EmptyState() {
    return (
        <div className="text-center py-16 px-6 border-2 border-dashed rounded-lg">
            <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold mb-1">Nenhum agendamento ainda</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Configure o Google Calendar em <strong>Configuração</strong> e clique em <strong>Sincronizar agora</strong>.
                Os agendamentos do Calendly chegam aqui via Google Calendar.
            </p>
        </div>
    )
}

function AgendamentoRow({ item, onClick }: { item: Agendamento; onClick: () => void }) {
    const start = new Date(item.start_at)
    const dateStr = start.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
    })
    const isCancelled = item.status === 'cancelado'

    return (
        <button
            onClick={onClick}
            className={`w-full text-left p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors ${
                isCancelled ? 'opacity-60' : ''
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status]}`}>
                            {STATUS_LABELS[item.status]}
                        </span>
                        <span className="text-xs text-muted-foreground">{SOURCE_LABELS[item.source]}</span>
                        {item.lead_id && (
                            <span className="text-xs text-primary inline-flex items-center gap-1">
                                <Link2 className="h-3 w-3" /> vinculado ao CRM
                            </span>
                        )}
                    </div>
                    <div className="font-medium mt-1 truncate">{item.summary}</div>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span>{dateStr}</span>
                        {item.invitee_name && (
                            <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{item.invitee_name}</span>
                        )}
                        {item.invitee_email && (
                            <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{item.invitee_email}</span>
                        )}
                        {item.invitee_phone && (
                            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{formatPhone(item.invitee_phone)}</span>
                        )}
                    </div>
                </div>
                {item.calendly_event_uri && (
                    <a
                        href={item.calendly_event_uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                        title="Abrir no Calendly"
                    >
                        <ExternalLink className="h-4 w-4" />
                    </a>
                )}
            </div>
        </button>
    )
}

function formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '')
    if (digits.length === 13 && digits.startsWith('55')) {
        return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`
    }
    if (digits.length === 12 && digits.startsWith('55')) {
        return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`
    }
    return phone
}

function ConfiguracaoTab({ onOpenSettings }: { onOpenSettings: () => void }) {
    const [info, setInfo] = useState<{
        settings: AgendamentosSettings | null
        google_configured: boolean
        service_account_email: string | null
    } | null>(null)

    useEffect(() => {
        ;(async () => {
            const res = await fetch('/api/agendamentos/settings')
            if (res.ok) setInfo(await res.json())
        })()
    }, [])

    if (!info) {
        return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
    }

    return (
        <div className="space-y-5 max-w-2xl">
            <section className="p-4 rounded-lg border bg-card">
                <h2 className="font-semibold mb-2">Como funciona</h2>
                <ol className="list-decimal list-inside text-sm space-y-1.5 text-muted-foreground">
                    <li>O Calendly cria eventos no Google Calendar do dono da conta.</li>
                    <li>Compartilhe esse calendário com a service account (e-mail abaixo) com permissão <em>Ver detalhes de todos os eventos</em>.</li>
                    <li>Configure o <strong>ID do calendário</strong> e o <strong>link do Calendly</strong>.</li>
                    <li>O cron a cada 5min lê eventos do Google Calendar e materializa aqui. Você também pode rodar manualmente em <em>Sincronizar agora</em>.</li>
                </ol>
            </section>

            <section className="p-4 rounded-lg border bg-card">
                <h2 className="font-semibold mb-3">Service account</h2>
                {info.google_configured && info.service_account_email ? (
                    <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">Compartilhe seu Google Calendar com este e-mail:</p>
                        <code className="block px-3 py-2 bg-muted rounded-md text-sm break-all">{info.service_account_email}</code>
                    </div>
                ) : (
                    <p className="text-sm text-amber-600 dark:text-amber-400 inline-flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" /> GOOGLE_SERVICE_ACCOUNT_JSON não está configurada na Vercel.
                    </p>
                )}
            </section>

            <section className="p-4 rounded-lg border bg-card">
                <h2 className="font-semibold mb-3">Configuração atual</h2>
                {info.settings && (
                    <dl className="space-y-2 text-sm">
                        <div className="flex gap-3"><dt className="text-muted-foreground w-40 shrink-0">ID do calendário:</dt><dd className="font-mono break-all">{info.settings.google_calendar_id || <span className="text-amber-600">não configurado</span>}</dd></div>
                        <div className="flex gap-3"><dt className="text-muted-foreground w-40 shrink-0">Link Calendly:</dt><dd className="font-mono break-all">{info.settings.calendly_event_url}</dd></div>
                        <div className="flex gap-3"><dt className="text-muted-foreground w-40 shrink-0">Janela passado:</dt><dd>{info.settings.sync_window_past_days} dias</dd></div>
                        <div className="flex gap-3"><dt className="text-muted-foreground w-40 shrink-0">Janela futuro:</dt><dd>{info.settings.sync_window_future_days} dias</dd></div>
                        <div className="flex gap-3"><dt className="text-muted-foreground w-40 shrink-0">Vínculo auto (e-mail):</dt><dd>{info.settings.auto_link_lead_by_email ? 'Sim' : 'Não'}</dd></div>
                        <div className="flex gap-3"><dt className="text-muted-foreground w-40 shrink-0">Vínculo auto (telefone):</dt><dd>{info.settings.auto_link_lead_by_phone ? 'Sim' : 'Não'}</dd></div>
                    </dl>
                )}
                <div className="mt-4">
                    <button
                        onClick={onOpenSettings}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border bg-background hover:bg-muted"
                    >
                        <Cog className="h-4 w-4" />
                        Editar configuração
                    </button>
                </div>
            </section>

            <section className="p-4 rounded-lg border bg-card">
                <h2 className="font-semibold mb-2">Cron externo</h2>
                <p className="text-sm text-muted-foreground mb-2">
                    Configure um cron externo (cron-job.org, GitHub Actions etc) chamando a cada 5min:
                </p>
                <code className="block px-3 py-2 bg-muted rounded-md text-xs break-all">
                    GET https://&lt;seu-dominio&gt;/api/agendamentos/sync<br />
                    Header: x-webhook-secret: ${'{WHATSAPP_GROUP_TASK_SECRET}'}
                </code>
            </section>
        </div>
    )
}
