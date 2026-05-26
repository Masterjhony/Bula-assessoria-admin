"use client"

import { useEffect, useState } from "react"
import { Loader2, Mail, Send, AlertTriangle, UserX, Users } from "lucide-react"

interface Metrics {
    total_campaigns: number
    active_campaigns: number
    sent_last_7d: number
    failed_last_7d: number
    total_optouts: number
    optouts_last_7d: number
    leads_with_email: number
}

export function MetricsTab() {
    const [data, setData] = useState<Metrics | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const res = await fetch(`/api/email/central/metrics`)
                if (res.ok) {
                    const d = await res.json()
                    if (!cancelled) setData(d)
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }
    if (!data) {
        return <p className="text-sm text-muted-foreground">Não foi possível carregar as métricas.</p>
    }

    const successRate = data.sent_last_7d + data.failed_last_7d > 0
        ? Math.round((data.sent_last_7d / (data.sent_last_7d + data.failed_last_7d)) * 100)
        : null

    const cards = [
        { label: "Campanhas totais", value: data.total_campaigns, icon: Mail, color: "text-blue-600" },
        { label: "Em envio agora", value: data.active_campaigns, icon: Send, color: "text-amber-600" },
        { label: "Enviados (7d)", value: data.sent_last_7d, icon: Send, color: "text-green-600" },
        { label: "Falhas (7d)", value: data.failed_last_7d, icon: AlertTriangle, color: "text-red-600" },
        { label: "Opt-outs totais", value: data.total_optouts, icon: UserX, color: "text-gray-600" },
        { label: "Opt-outs (7d)", value: data.optouts_last_7d, icon: UserX, color: "text-orange-600" },
        { label: "Leads c/ e-mail", value: data.leads_with_email, icon: Users, color: "text-primary" },
    ]

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {cards.map(c => {
                    const Icon = c.icon
                    return (
                        <div key={c.label} className="border rounded-xl p-4 bg-background">
                            <div className={`flex items-center gap-2 text-xs ${c.color} mb-2`}>
                                <Icon className="h-4 w-4" />
                                <span>{c.label}</span>
                            </div>
                            <p className="text-2xl font-bold tabular-nums">{c.value.toLocaleString("pt-BR")}</p>
                        </div>
                    )
                })}
            </div>

            {successRate !== null && (
                <div className="border rounded-xl p-4 bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Taxa de entrega (últimos 7 dias)</p>
                    <p className="text-3xl font-bold tabular-nums">
                        {successRate}<span className="text-base text-muted-foreground">%</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                        {data.sent_last_7d} enviados · {data.failed_last_7d} falhas
                    </p>
                </div>
            )}

            <div className="border rounded-xl p-4 bg-amber-500/5 border-amber-500/30">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-1">SMTP Hostinger — limites</p>
                <p className="text-xs text-amber-700 dark:text-amber-300/80">
                    A conta SMTP compartilhada da Hostinger limita o envio a cerca de 100-300 e-mails por dia.
                    Campanhas grandes são processadas em lote pelo cron (até 30 envios por execução, com pausa entre cada um).
                    Se você precisa atingir uma lista maior, divida em campanhas menores ao longo da semana.
                </p>
            </div>
        </div>
    )
}
