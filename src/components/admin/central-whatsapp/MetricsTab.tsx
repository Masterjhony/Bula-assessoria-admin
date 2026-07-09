"use client"

import { useEffect, useState } from "react"
import {
    Users, MessageSquare, MessageCircle, Hand, BellOff, Megaphone, Sparkles, Tag, Loader2,
    Clock, Bot, DollarSign, Filter, Reply,
} from "lucide-react"
import { INTERESSE_LABELS, type CentralMetrics } from "./types"

const ICONS = {
    leads_aguardando_resposta: Clock,
    novos_contatos_7d: Users,
    leads_com_interesse: Tag,
    aguardando_humano: Hand,
    opt_outs: BellOff,
    mensagens_enviadas_hoje: MessageSquare,
    mensagens_recebidas_hoje: MessageCircle,
    campanhas_disparadas_30d: Megaphone,
} as const

const LABELS: Record<keyof typeof ICONS, string> = {
    leads_aguardando_resposta: "Leads aguardando resposta",
    novos_contatos_7d: "Novos contatos (7d)",
    leads_com_interesse: "Leads com interesse identificado",
    aguardando_humano: "Em atendimento humano",
    opt_outs: "Opt-outs",
    mensagens_enviadas_hoje: "Mensagens enviadas hoje",
    mensagens_recebidas_hoje: "Mensagens recebidas hoje",
    campanhas_disparadas_30d: "Campanhas disparadas (30d)",
}

const PERIODOS = [
    { dias: 1, label: "Hoje" },
    { dias: 7, label: "7 dias" },
    { dias: 30, label: "30 dias" },
    { dias: 90, label: "90 dias" },
]

/** Nome legível do disparo. O `origin` é técnico; o comercial não fala assim. */
const ORIGEM_LABELS: Record<string, string> = {
    "crm-sheet-import": "Boas-vindas a lead importado",
    "reengajamento-limbo": "Reengajamento (já falou com a gente)",
    "backlog-frio": "Backlog frio",
    "disparo-ie-frio": "Disparo I.E. (lista fria)",
    "gif-lotes": "GIF de lotes",
    "backfill-welcome-hoje": "Boas-vindas (backfill)",
    "jmp-landing": "Landing JMP",
}
const rotuloOrigem = (o: string) =>
    ORIGEM_LABELS[o] ?? (o.startsWith("frio-") ? `Lista fria — ${o.replace(/^frio-/, "")}` : o)

export function MetricsTab() {
    const [data, setData] = useState<CentralMetrics | null>(null)
    const [loading, setLoading] = useState(true)
    const [dias, setDias] = useState(30)
    const [campanha, setCampanha] = useState("")
    const [canal, setCanal] = useState("")

    useEffect(() => {
        setLoading(true)
        const q = new URLSearchParams({ dias: String(dias) })
        if (campanha) q.set("campanha", campanha)
        if (canal) q.set("canal", canal)
        fetch(`/api/whatsapp/central/metrics?${q}`)
            .then(r => r.json())
            .then(d => setData(d))
            .finally(() => setLoading(false))
    }, [dias, campanha, canal])

    if (loading && !data) {
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
            {/* ── Filtros ─────────────────────────────────────────────────── */}
            <div className="bg-card text-card-foreground rounded-xl border p-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Filter className="h-3.5 w-3.5" /> Filtros
                </div>

                <div className="flex rounded-lg border overflow-hidden">
                    {PERIODOS.map(p => (
                        <button
                            key={p.dias}
                            onClick={() => setDias(p.dias)}
                            className={`px-3 py-1.5 text-xs transition-colors ${dias === p.dias ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                <select
                    value={campanha}
                    onChange={e => setCampanha(e.target.value)}
                    className="rounded-lg border bg-background px-3 py-1.5 text-xs max-w-[22rem]"
                >
                    <option value="">Todas as campanhas</option>
                    {data.campanhas.map(c => (
                        <option key={c.key} value={c.key}>{c.key} ({c.leads})</option>
                    ))}
                </select>

                <select
                    value={canal}
                    onChange={e => setCanal(e.target.value)}
                    className="rounded-lg border bg-background px-3 py-1.5 text-xs"
                >
                    <option value="">Todos os canais</option>
                    <option value="cloud">API oficial</option>
                    <option value="baileys">Baileys</option>
                </select>

                {(campanha || canal || dias !== 30) && (
                    <button
                        onClick={() => { setDias(30); setCampanha(""); setCanal("") }}
                        className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                        limpar
                    </button>
                )}

                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}

                <span className="ml-auto text-[11px] text-muted-foreground">
                    {data.leads_no_recorte.toLocaleString("pt-BR")} leads no recorte
                    {data.mensagens_grupo_excluidas > 0 && (
                        <> · {data.mensagens_grupo_excluidas.toLocaleString("pt-BR")} mensagens de grupo (Baileys) ignoradas</>
                    )}
                </span>
            </div>

            {/* ── Taxa de resposta ────────────────────────────────────────── */}
            <div className="bg-card text-card-foreground rounded-xl border p-5">
                <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Reply className="h-4 w-4" /> Taxa de resposta por disparo
                    </h3>
                    <div className="text-right">
                        <p className="text-2xl font-bold tabular-nums">{data.taxa_resposta_total.pct.toFixed(1)}%</p>
                        <p className="text-[11px] text-muted-foreground">
                            {data.taxa_resposta_total.responderam} de {data.taxa_resposta_total.enviados} responderam
                        </p>
                    </div>
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">
                    De quem recebeu uma abordagem nossa, quantos escreveram de volta em até 72h. Respostas do bot a
                    conversas em curso não contam como disparo.
                </p>

                {data.taxa_resposta.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum disparo neste recorte.</p>
                ) : (
                    <div className="space-y-2.5">
                        {data.taxa_resposta.map(l => (
                            <div key={l.origin}>
                                <div className="flex items-center justify-between text-xs mb-0.5">
                                    <span className="truncate pr-2">{rotuloOrigem(l.origin)}</span>
                                    <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                                        {l.responderam}/{l.enviados} · <strong className="text-foreground">{l.pct.toFixed(1)}%</strong>
                                    </span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${l.pct >= 20 ? "bg-emerald-500" : l.pct >= 8 ? "bg-amber-500" : "bg-rose-500"}`}
                                        style={{ width: `${Math.min(100, l.pct)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map(k => {
                    const Icon = ICONS[k]
                    // As contagens de mensagem seguem o período escolhido; se ficassem
                    // fixas em "hoje", o filtro pareceria quebrado.
                    const periodo = PERIODOS.find(p => p.dias === data.periodo_dias)?.label ?? `${data.periodo_dias}d`
                    const valor =
                        k === "mensagens_enviadas_hoje" ? data.mensagens_enviadas_periodo
                            : k === "mensagens_recebidas_hoje" ? data.mensagens_recebidas_periodo
                                : data[k]
                    const rotulo =
                        k === "mensagens_enviadas_hoje" ? `Mensagens enviadas (${periodo.toLowerCase()})`
                            : k === "mensagens_recebidas_hoje" ? `Mensagens recebidas (${periodo.toLowerCase()})`
                                : LABELS[k]
                    return (
                        <div
                            key={k}
                            className="bg-card text-card-foreground rounded-xl border p-4 flex items-start gap-3"
                        >
                            <div className="bg-primary/10 p-2 rounded-lg flex-shrink-0">
                                <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">{rotulo}</p>
                                <p className="text-2xl font-bold tabular-nums">{valor}</p>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Custos — WhatsApp é ESTIMATIVA; IA é real (log de uso). */}
            <div>
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4" /> Custos de atendimento
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-card text-card-foreground rounded-xl border p-4 flex items-start gap-3">
                        <div className="bg-primary/10 p-2 rounded-lg flex-shrink-0"><MessageSquare className="h-4 w-4 text-primary" /></div>
                        <div>
                            <p className="text-xs text-muted-foreground">Gasto WhatsApp (30d) · estimado</p>
                            <p className="text-2xl font-bold tabular-nums">US$ {data.gasto_whatsapp_estimado_30d.toFixed(2)}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{data.wa_conversas_empresa_30d} conversas × US$ {data.wa_tarifa_usd.toFixed(2)}</p>
                        </div>
                    </div>
                    <div className="bg-card text-card-foreground rounded-xl border p-4 flex items-start gap-3">
                        <div className="bg-primary/10 p-2 rounded-lg flex-shrink-0"><Bot className="h-4 w-4 text-primary" /></div>
                        <div>
                            <p className="text-xs text-muted-foreground">Gasto IA (30d)</p>
                            <p className="text-2xl font-bold tabular-nums">US$ {data.gasto_ia_30d.toFixed(2)}</p>
                        </div>
                    </div>
                    <div className="bg-card text-card-foreground rounded-xl border p-4 flex items-start gap-3">
                        <div className="bg-primary/10 p-2 rounded-lg flex-shrink-0"><Bot className="h-4 w-4 text-primary" /></div>
                        <div>
                            <p className="text-xs text-muted-foreground">Gasto IA (hoje)</p>
                            <p className="text-2xl font-bold tabular-nums">US$ {data.gasto_ia_hoje.toFixed(2)}</p>
                        </div>
                    </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                    WhatsApp é estimativa (conversas iniciadas pela empresa × tarifa média); o valor faturado oficial fica no WhatsApp Manager. IA é o custo real logado por chamada (conta a partir de agora).
                </p>
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
