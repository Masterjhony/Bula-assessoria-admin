'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, CheckCircle2, AlertCircle, Save } from 'lucide-react'
import type { AgendamentosSettings } from './types'

interface Props {
    onClose: () => void
    onSaved: () => void
}

export function SettingsModal({ onClose, onSaved }: Props) {
    const [settings, setSettings] = useState<AgendamentosSettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
    const [serviceEmail, setServiceEmail] = useState<string | null>(null)
    const [googleConfigured, setGoogleConfigured] = useState(false)

    useEffect(() => {
        ;(async () => {
            try {
                const res = await fetch('/api/agendamentos/settings')
                if (!res.ok) throw new Error('Falha ao carregar settings')
                const data = await res.json()
                setSettings(data.settings)
                setServiceEmail(data.service_account_email)
                setGoogleConfigured(data.google_configured)
            } catch (e) {
                setFeedback({ type: 'err', msg: e instanceof Error ? e.message : 'Erro' })
            } finally {
                setLoading(false)
            }
        })()
    }, [])

    const save = async () => {
        if (!settings) return
        setSaving(true)
        setFeedback(null)
        try {
            const res = await fetch('/api/agendamentos/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Falha')
            setFeedback({ type: 'ok', msg: 'Configuração salva.' })
            setTimeout(() => onSaved(), 400)
        } catch (e) {
            setFeedback({ type: 'err', msg: e instanceof Error ? e.message : 'Erro' })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/50 p-0 md:p-4">
            <div className="bg-background rounded-t-lg md:rounded-lg shadow-xl w-full md:max-w-xl max-h-[92vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b shrink-0">
                    <h2 className="text-lg font-semibold">Configuração de agendamentos</h2>
                    <button onClick={onClose} className="p-1 hover:bg-muted rounded-md"><X className="h-5 w-5" /></button>
                </div>

                <div className="overflow-y-auto p-4 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                    ) : settings ? (
                        <>
                            {!googleConfigured && (
                                <div className="flex items-start gap-2 px-3 py-2 rounded-md text-sm bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                    <AlertCircle className="h-4 w-4 mt-0.5" />
                                    <span>GOOGLE_SERVICE_ACCOUNT_JSON não está configurada — o sync não vai funcionar até adicionar na Vercel.</span>
                                </div>
                            )}

                            {serviceEmail && (
                                <div className="text-sm space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Service account (compartilhe o Google Calendar com este e-mail)</label>
                                    <code className="block px-3 py-2 bg-muted rounded-md text-sm break-all">{serviceEmail}</code>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">ID do Google Calendar</label>
                                <input
                                    value={settings.google_calendar_id}
                                    onChange={e => setSettings({ ...settings, google_calendar_id: e.target.value })}
                                    placeholder="ex: joaoeduardo@gmail.com ou abcd1234@group.calendar.google.com"
                                    className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Pegue em Google Calendar → Configurações do calendário → &quot;Integrar calendário&quot; → ID do calendário.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-muted-foreground mb-1">Link do evento Calendly</label>
                                <input
                                    value={settings.calendly_event_url}
                                    onChange={e => setSettings({ ...settings, calendly_event_url: e.target.value })}
                                    placeholder="https://calendly.com/.../contato-cliente"
                                    className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Esse link é o que o bot WhatsApp envia pro lead. UTM <code>utm_content</code> com o lead_id pode ajudar no match.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">Janela passado (dias)</label>
                                    <input
                                        type="number" min={0} max={365}
                                        value={settings.sync_window_past_days}
                                        onChange={e => setSettings({ ...settings, sync_window_past_days: Number(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-muted-foreground mb-1">Janela futuro (dias)</label>
                                    <input
                                        type="number" min={1} max={365}
                                        value={settings.sync_window_future_days}
                                        onChange={e => setSettings({ ...settings, sync_window_future_days: Number(e.target.value) || 1 })}
                                        className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={settings.auto_link_lead_by_email}
                                        onChange={e => setSettings({ ...settings, auto_link_lead_by_email: e.target.checked })}
                                    />
                                    Vincular ao lead automaticamente pelo e-mail
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={settings.auto_link_lead_by_phone}
                                        onChange={e => setSettings({ ...settings, auto_link_lead_by_phone: e.target.checked })}
                                    />
                                    Vincular ao lead automaticamente pelo telefone (extraído da descrição)
                                </label>
                            </div>
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">Falha ao carregar.</p>
                    )}

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
                </div>

                <div className="flex items-center justify-end gap-2 p-4 border-t shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border bg-background hover:bg-muted">Cancelar</button>
                    <button
                        onClick={save}
                        disabled={saving || !settings}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    )
}
