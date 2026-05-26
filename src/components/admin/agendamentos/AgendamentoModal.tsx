'use client'

import { useEffect, useState } from 'react'
import {
    X, Loader2, ExternalLink, Trash2, CheckCircle2, AlertCircle,
    User, Mail, Phone, MapPin, Video, FileText, Link2, Search,
} from 'lucide-react'
import type { Agendamento, AgendamentoStatus } from './types'
import { STATUS_LABELS } from './types'

interface Props {
    agendamento: Agendamento
    onClose: () => void
    onChanged: () => void
}

interface LeadOption {
    id: string
    nome: string
    email: string | null
    telefone: string | null
    celular: string | null
}

export function AgendamentoModal({ agendamento, onClose, onChanged }: Props) {
    const [a, setA] = useState<Agendamento>(agendamento)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

    useEffect(() => { setA(agendamento) }, [agendamento])

    const update = async (patch: Partial<Agendamento>) => {
        setSaving(true)
        setFeedback(null)
        try {
            const res = await fetch(`/api/agendamentos/${a.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Falha')
            setA(data.data)
            onChanged()
            setFeedback({ type: 'ok', msg: 'Atualizado.' })
        } catch (e) {
            setFeedback({ type: 'err', msg: e instanceof Error ? e.message : 'Erro' })
        } finally {
            setSaving(false)
        }
    }

    const remove = async () => {
        if (!confirm('Remover este agendamento? Se ainda existir no Google Calendar, o próximo sync vai recriá-lo.')) return
        setDeleting(true)
        try {
            const res = await fetch(`/api/agendamentos/${a.id}`, { method: 'DELETE' })
            if (!res.ok) throw new Error((await res.json()).error || 'Falha')
            onChanged()
            onClose()
        } catch (e) {
            setFeedback({ type: 'err', msg: e instanceof Error ? e.message : 'Erro' })
            setDeleting(false)
        }
    }

    const start = new Date(a.start_at)
    const end = a.end_at ? new Date(a.end_at) : null
    const dateRange = end
        ? `${start.toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })} – ${end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        : start.toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/50 p-0 md:p-4">
            <div className="bg-background rounded-t-lg md:rounded-lg shadow-xl w-full md:max-w-2xl max-h-[92vh] flex flex-col">
                <div className="flex items-start justify-between p-4 border-b shrink-0">
                    <div>
                        <h2 className="text-lg font-semibold">{a.summary}</h2>
                        <div className="text-xs text-muted-foreground mt-0.5">{dateRange}</div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-muted rounded-md"><X className="h-5 w-5" /></button>
                </div>

                <div className="overflow-y-auto p-4 space-y-4">
                    {feedback && (
                        <div className={`flex items-start gap-2 px-3 py-2 rounded-md text-sm ${
                            feedback.type === 'ok'
                                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                : 'bg-red-500/10 text-red-600 dark:text-red-400'
                        }`}>
                            {feedback.type === 'ok' ? <CheckCircle2 className="h-4 w-4 mt-0.5" /> : <AlertCircle className="h-4 w-4 mt-0.5" />}
                            <span>{feedback.msg}</span>
                        </div>
                    )}

                    {/* Status */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Status</label>
                        <div className="flex flex-wrap gap-1.5">
                            {(Object.entries(STATUS_LABELS) as [AgendamentoStatus, string][]).map(([k, v]) => (
                                <button
                                    key={k}
                                    onClick={() => update({ status: k })}
                                    disabled={saving}
                                    className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                                        a.status === k
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-background hover:bg-muted'
                                    }`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Invitee */}
                    <section className="rounded-lg border p-3 space-y-1.5 text-sm">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Convidado</div>
                        {a.invitee_name && (
                            <div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-muted-foreground" />{a.invitee_name}</div>
                        )}
                        {a.invitee_email && (
                            <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /><a href={`mailto:${a.invitee_email}`} className="hover:underline">{a.invitee_email}</a></div>
                        )}
                        {a.invitee_phone && (
                            <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /><a href={`https://wa.me/${a.invitee_phone}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{a.invitee_phone}</a></div>
                        )}
                        {!a.invitee_name && !a.invitee_email && !a.invitee_phone && (
                            <div className="text-xs text-muted-foreground italic">Sem dados do convidado.</div>
                        )}
                    </section>

                    {/* Detalhes */}
                    <section className="rounded-lg border p-3 space-y-1.5 text-sm">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Detalhes</div>
                        {a.location && (
                            <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{a.location}</div>
                        )}
                        {a.meeting_url && (
                            <div className="flex items-center gap-2"><Video className="h-3.5 w-3.5 text-muted-foreground" /><a href={a.meeting_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Entrar na chamada</a></div>
                        )}
                        {a.calendly_event_uri && (
                            <div className="flex items-center gap-2"><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /><a href={a.calendly_event_uri} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Gerenciar no Calendly</a></div>
                        )}
                        <div className="text-xs text-muted-foreground pt-1">
                            Origem: <strong>{a.source}</strong>{a.last_synced_at ? ` · sincronizado em ${new Date(a.last_synced_at).toLocaleString('pt-BR')}` : ''}
                        </div>
                    </section>

                    {a.description && (
                        <section className="rounded-lg border p-3 text-sm">
                            <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><FileText className="h-3 w-3" /> Descrição (Calendly)</div>
                            <pre className="whitespace-pre-wrap text-xs font-sans">{a.description}</pre>
                        </section>
                    )}

                    {/* Lead vinculado */}
                    <LeadLinkSection
                        currentLeadId={a.lead_id}
                        onChange={(leadId) => update({ lead_id: leadId })}
                        disabled={saving}
                        hintEmail={a.invitee_email}
                        hintPhone={a.invitee_phone}
                    />

                    {/* Notas internas */}
                    <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notas internas</label>
                        <textarea
                            value={a.notes ?? ''}
                            onChange={e => setA({ ...a, notes: e.target.value })}
                            onBlur={() => { if (a.notes !== agendamento.notes) update({ notes: a.notes }) }}
                            placeholder="Anote o que combinou, follow-up, etc."
                            rows={3}
                            className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                        />
                    </div>

                    {a.status === 'cancelado' && (
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Motivo do cancelamento</label>
                            <input
                                value={a.cancel_reason ?? ''}
                                onChange={e => setA({ ...a, cancel_reason: e.target.value })}
                                onBlur={() => { if (a.cancel_reason !== agendamento.cancel_reason) update({ cancel_reason: a.cancel_reason }) }}
                                placeholder="Conflito de agenda, lead desistiu…"
                                className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                            />
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between p-4 border-t shrink-0">
                    <button
                        onClick={remove}
                        disabled={deleting || saving}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md text-red-600 hover:bg-red-500/10 disabled:opacity-50"
                    >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Remover
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm rounded-md border bg-background hover:bg-muted"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    )
}

function LeadLinkSection({
    currentLeadId, onChange, disabled, hintEmail, hintPhone,
}: {
    currentLeadId: string | null
    onChange: (leadId: string | null) => void
    disabled?: boolean
    hintEmail?: string | null
    hintPhone?: string | null
}) {
    const [searchOpen, setSearchOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<LeadOption[]>([])
    const [searching, setSearching] = useState(false)

    useEffect(() => {
        if (!query.trim() || query.trim().length < 2) { setResults([]); return }
        let cancelled = false
        setSearching(true)
        const handle = setTimeout(async () => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`)
                if (!res.ok || cancelled) return
                const data = await res.json()
                const leads = (data.hits ?? [])
                    .filter((r: { type?: string }) => r.type === 'lead')
                    .map((r: { id: string; title?: string; subtitle?: string }) => ({
                        id: r.id,
                        nome: r.title ?? '(sem nome)',
                        email: null,
                        telefone: null,
                        celular: r.subtitle ?? null,
                    } as LeadOption))
                if (!cancelled) setResults(leads)
            } finally {
                if (!cancelled) setSearching(false)
            }
        }, 250)
        return () => { cancelled = true; clearTimeout(handle) }
    }, [query])

    return (
        <section className="rounded-lg border p-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-muted-foreground">Lead vinculado</div>
                {currentLeadId && (
                    <button
                        onClick={() => onChange(null)}
                        disabled={disabled}
                        className="text-xs text-red-600 hover:underline"
                    >
                        Desvincular
                    </button>
                )}
            </div>
            {currentLeadId ? (
                <div className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={`/crm?lead=${currentLeadId}`} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                        Abrir lead no CRM
                    </a>
                </div>
            ) : (
                <>
                    <p className="text-xs text-muted-foreground">
                        Nenhum lead vinculado{hintEmail || hintPhone ? ` (procure por "${hintEmail || hintPhone}")` : ''}.
                    </p>
                    <button
                        onClick={() => { setSearchOpen(true); setQuery(hintEmail || hintPhone || '') }}
                        disabled={disabled}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                        <Search className="h-3 w-3" /> Vincular ao lead
                    </button>
                    {searchOpen && (
                        <div className="mt-2 space-y-2">
                            <input
                                autoFocus
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Buscar lead por nome, telefone, e-mail…"
                                className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                            />
                            {searching && <div className="text-xs text-muted-foreground"><Loader2 className="h-3 w-3 inline animate-spin" /> buscando…</div>}
                            <div className="max-h-44 overflow-y-auto space-y-1">
                                {results.map(r => (
                                    <button
                                        key={r.id}
                                        onClick={() => { onChange(r.id); setSearchOpen(false) }}
                                        className="w-full text-left px-2 py-1.5 rounded-md hover:bg-muted text-sm"
                                    >
                                        <div className="font-medium">{r.nome}</div>
                                        {r.celular && <div className="text-xs text-muted-foreground">{r.celular}</div>}
                                    </button>
                                ))}
                                {query.trim().length >= 2 && !searching && results.length === 0 && (
                                    <div className="text-xs text-muted-foreground italic">Nenhum lead encontrado.</div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </section>
    )
}
