"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import {
    QrCode, Inbox, MessageSquare, Megaphone, BarChart3, Plug, Workflow, Loader2,
} from "lucide-react"
import { ConexaoTab } from "@/components/admin/central-whatsapp/ConexaoTab"
import { InboxTab } from "@/components/admin/central-whatsapp/InboxTab"
import { TemplatesTab } from "@/components/admin/central-whatsapp/TemplatesTab"
import { CampaignsTab } from "@/components/admin/central-whatsapp/CampaignsTab"
import { MetricsTab } from "@/components/admin/central-whatsapp/MetricsTab"
import { FluxoTab } from "@/components/admin/central-whatsapp/FluxoTab"
import type { Template } from "@/components/admin/central-whatsapp/types"

type Tab = "inbox" | "fluxo" | "templates" | "campanhas" | "metricas" | "conexao"
const VALID_TABS: Tab[] = ["inbox", "fluxo", "templates", "campanhas", "metricas", "conexao"]

const TABS: { id: Tab; label: string; icon: typeof Inbox }[] = [
    { id: "inbox",     label: "Inbox",     icon: Inbox },
    { id: "fluxo",     label: "Fluxo",     icon: Workflow },
    { id: "templates", label: "Templates", icon: MessageSquare },
    { id: "campanhas", label: "Campanhas", icon: Megaphone },
    { id: "metricas",  label: "Métricas",  icon: BarChart3 },
    { id: "conexao",   label: "Conexão",   icon: Plug },
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
    const tab: Tab = (rawTab && (VALID_TABS as string[]).includes(rawTab)) ? (rawTab as Tab) : "inbox"

    const setTab = (next: Tab) => {
        const params = new URLSearchParams(searchParams.toString())
        if (next === "inbox") params.delete("tab")
        else params.set("tab", next)
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }

    const [templates, setTemplates] = useState<Template[]>([])

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

    const isFluxo = tab === "fluxo"

    return (
        <div className="flex-1 min-h-[600px] flex flex-col">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3 shrink-0">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
                        <QrCode className="h-6 w-6 text-primary" />
                        Central WhatsApp
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Atendimento comercial automatizado, integrado ao CRM. Triagem por interesse,
                        handoff humano, templates e campanhas segmentadas.
                    </p>
                </div>
            </div>

            <div className="border-b flex flex-wrap gap-1 shrink-0 mb-3">
                {TABS.map(t => {
                    const Icon = t.icon
                    const active = tab === t.id
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors -mb-px ${
                                active
                                    ? "border-primary text-foreground font-semibold"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {t.label}
                        </button>
                    )
                })}
            </div>

            {/* O Fluxo é o único tab que precisa flex-1 + min-h-0 (preenche viewport).
             * Os demais ficam no fluxo normal pra não quebrar suas premissas de altura/scroll. */}
            <div className={isFluxo ? "flex-1 min-h-0 flex flex-col" : "space-y-5 pb-5"}>
                {tab === "inbox"     && <InboxTab templates={templates} />}
                {isFluxo             && <FluxoTab templates={templates} onTemplatesChanged={fetchTemplates} />}
                {tab === "templates" && <TemplatesTab templates={templates} onChange={fetchTemplates} />}
                {tab === "campanhas" && <CampaignsTab templates={templates} />}
                {tab === "metricas"  && <MetricsTab />}
                {tab === "conexao"   && <ConexaoTab />}
            </div>
        </div>
    )
}
