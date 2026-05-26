"use client"

import { useEffect, useState } from "react"
import {
    Users, MessageSquare, MessageCircle, Hand, BellOff, Megaphone, Sparkles, Tag, Loader2,
} from "lucide-react"
import { INTERESSE_LABELS, type CentralMetrics } from "./types"

const ICONS = {
    novos_contatos_7d: Users,
    leads_com_interesse: Tag,
    aguardando_humano: Hand,
    opt_outs: BellOff,
    mensagens_enviadas_hoje: MessageSquare,
    mensagens_recebidas_hoje: MessageCircle,
    campanhas_disparadas_30d: Megaphone,
} as const

const LABELS: Record<keyof typeof ICONS, string> = {
    novos_contatos_7d: "Novos contatos (7d)",
    leads_com_interesse: "Leads com interesse identificado",
    aguardando_humano: "Em atendimento humano",
    opt_outs: "Opt-outs",
    mensagens_enviadas_hoje: "Mensagens enviadas hoje",
    mensagens_recebidas_hoje: "Mensagens recebidas hoje",
    campanhas_disparadas_30d: "Campanhas disparadas (30d)",
}

export function MetricsTab() {
    const [data, setData] = useState<CentralMetrics | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch(`/api/whatsapp/central/metrics`)
            .then(r => r.json())
            .then(d => setData(d))
            .finally(() => setLoading(false))
    }, [])

    if (loading) {
        return (
            <div className="p-10 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }
    if (!data) return null

    const totalInteresse = Object.values(data.distribuicao_interesse).reduce((a, b) => a + b, 0)

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map(k => {
                    const Icon = ICONS[k]
                    return (
                        <div
                            key={k}
                            className="bg-card text-card-foreground rounded-xl border p-4 flex items-start gap-3"
                        >
                            <div className="bg-primary/10 p-2 rounded-lg flex-shrink-0">
                                <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">{LABELS[k]}</p>
                                <p className="text-2xl font-bold tabular-nums">{data[k]}</p>
                            </div>
                        </div>
                    )
                })}
            </div>

            <div className="bg-card text-card-foreground rounded-xl border p-5">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                    <Sparkles className="h-4 w-4" /> Distribuição de interesse
                </h3>
                {totalInteresse === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum lead com interesse identificado ainda.</p>
                ) : (
                    <div className="space-y-2">
                        {Object.entries(data.distribuicao_interesse)
                            .sort((a, b) => b[1] - a[1])
                            .map(([k, count]) => {
                                const pct = (count / totalInteresse) * 100
                                return (
                                    <div key={k}>
                                        <div className="flex items-center justify-between text-xs mb-0.5">
                                            <span>{INTERESSE_LABELS[k] ?? k}</span>
                                            <span className="text-muted-foreground tabular-nums">
                                                {count} ({pct.toFixed(1)}%)
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary rounded-full"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                    </div>
                )}
            </div>
        </div>
    )
}
