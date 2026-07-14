"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import {
    Inbox, MessageSquare, Megaphone, BarChart3, Plug, Bot, Loader2, MessageCircle,
} from "lucide-react"
import { ConexaoTab } from "@/components/admin/central-whatsapp/ConexaoTab"
import { InboxTab } from "@/components/admin/central-whatsapp/InboxTab"
import { TemplatesTab } from "@/components/admin/central-whatsapp/TemplatesTab"
import { CampaignsTab } from "@/components/admin/central-whatsapp/CampaignsTab"
import { MetricsTab } from "@/components/admin/central-whatsapp/MetricsTab"
import { AtendimentoIATab } from "@/components/admin/central-whatsapp/AtendimentoIATab"
import type { Inbox as WaInbox, Template } from "@/components/admin/central-whatsapp/types"

const GOLD = "#C9A84C"

// A antiga aba "fluxo" (grafo de triagem por palavra-chave) foi aposentada:
// quem atende agora é a IA (concierge). ?tab=fluxo redireciona para "ia".
type Tab = "inbox" | "ia" | "templates" | "campanhas" | "metricas" | "conexao"
const VALID_TABS: Tab[] = ["inbox", "ia", "templates", "campanhas", "metricas", "conexao"]

const TABS: { id: Tab; label: string; icon: typeof Inbox }[] = [
    { id: "inbox",     label: "Inbox",         icon: Inbox },
    { id: "ia",        label: "Atendimento IA", icon: Bot },
    { id: "templates", label: "Templates",     icon: MessageSquare },
    { id: "campanhas", label: "Campanhas",     icon: Megaphone },
    { id: "metricas",  label: "Métricas",      icon: BarChart3 },
    { id: "conexao",   label: "Conexão",       icon: Plug },
]

export default function CentralWhatsAppPage() {
    // useSearchParams precisa estar dentro de Suspense (Next 16) para o build.
    return (
        <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 size={28} className="animate-spin text-[#A68B4B]" /></div>}>
            <CentralWhatsAppInner />
        </Suspense>
    )
}

function CentralWhatsAppInner() {
    // Tab atual vive em `?tab=` pra permitir deep-link e compartilhar URL exata.
    // Default 'inbox' não emite param (mantém URL limpa em /whatsapp).
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const rawTab = searchParams.get("tab")
    const tab: Tab = rawTab === "fluxo"
        ? "ia"
        : (rawTab && (VALID_TABS as string[]).includes(rawTab)) ? (rawTab as Tab) : "inbox"

    const setTab = (next: Tab) => {
        const params = new URLSearchParams(searchParams.toString())
        if (next === "inbox") params.delete("tab")
        else params.set("tab", next)
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }

    const [templates, setTemplates] = useState<Template[]>([])

    // Multi-inbox: caixas de atendimento (API oficial + sessões Baileys). O
    // seletor no cabeçalho escolhe qual inbox o painel abaixo mostra/opera.
    const [inboxes, setInboxes] = useState<WaInbox[]>([])
    const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null)
    const selectedInbox = inboxes.find(i => i.id === selectedInboxId) ?? inboxes[0] ?? null

    async function fetchTemplates() {
        const res = await fetch(`/api/whatsapp/central/templates`)
        if (res.ok) {
            const data = await res.json()
            setTemplates(data.templates ?? [])
        }
    }

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const res = await fetch(`/api/whatsapp/central/templates`)
            if (!res.ok || cancelled) return
            const data = await res.json()
            if (!cancelled) setTemplates(data.templates ?? [])
        })()
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const res = await fetch(`/api/whatsapp/inboxes`)
            if (!res.ok || cancelled) return
            const data = await res.json()
            const list: WaInbox[] = data.inboxes ?? []
            if (cancelled) return
            setInboxes(list)
            // Default: a caixa primária (API oficial) — de onde o cliente fala.
            setSelectedInboxId(prev => prev ?? (list.find(i => i.is_primary)?.id ?? list[0]?.id ?? null))
        })()
        return () => { cancelled = true }
    }, [])

    return (
        <div className="flex-1 min-h-[600px] flex flex-col">
            {/* Cabeçalho no padrão do brandbook: Oswald caixa-alta + dourado cirúrgico */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4 shrink-0">
                <div className="flex items-center gap-3.5">
                    <div
                        className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: `${GOLD}1a`, border: `1px solid ${GOLD}55` }}
                    >
                        <MessageCircle className="h-5.5 w-5.5" style={{ color: GOLD, height: 22, width: 22 }} />
                    </div>
                    <div>
                        <h1 className="font-display text-2xl md:text-[28px] uppercase tracking-wide leading-none">
                            Central WhatsApp
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1.5">
                            Atendimento por IA integrado ao CRM — habilitação, templates Meta e campanhas segmentadas.
                        </p>
                    </div>
                </div>

                {/* Seletor de inbox (multi-inbox): escolhe de qual caixa/número o
                    Inbox mostra as conversas e por qual o SDR responde. */}
                {tab === "inbox" && inboxes.length > 0 && (
                    <label className="flex items-center gap-2 text-sm shrink-0">
                        <MessageCircle className="h-4 w-4 text-muted-foreground" />
                        <select
                            value={selectedInbox?.id ?? ""}
                            onChange={e => setSelectedInboxId(e.target.value)}
                            className="rounded-md border bg-background px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        >
                            {inboxes.map(i => (
                                <option key={i.id} value={i.id}>
                                    {i.label}{i.kind === "cloud" ? " · API oficial" : " · Baileys"}
                                    {i.kind === "baileys" && i.live_status && i.live_status !== "connected" ? ` (${i.live_status})` : ""}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>

            <div className="flex flex-wrap gap-1.5 shrink-0 mb-4">
                {TABS.map(t => {
                    const Icon = t.icon
                    const active = tab === t.id
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-full border transition-all ${
                                active
                                    ? "font-semibold text-black shadow-sm"
                                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                            style={active ? { background: GOLD, borderColor: GOLD } : undefined}
                        >
                            <Icon className="h-4 w-4" />
                            {t.label}
                        </button>
                    )
                })}
            </div>

            <div className="space-y-5 pb-5">
                {tab === "inbox"     && (selectedInbox
                    ? <InboxTab templates={templates} inbox={selectedInbox} />
                    : <div className="flex items-center justify-center py-24"><Loader2 size={24} className="animate-spin text-[#A68B4B]" /></div>)}
                {tab === "ia"        && <AtendimentoIATab />}
                {tab === "templates" && <TemplatesTab templates={templates} onChange={fetchTemplates} />}
                {tab === "campanhas" && <CampaignsTab templates={templates} />}
                {tab === "metricas"  && <MetricsTab />}
                {tab === "conexao"   && <ConexaoTab />}
            </div>
        </div>
    )
}
