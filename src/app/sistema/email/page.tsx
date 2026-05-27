"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Mail, MessageSquare, Megaphone, BarChart3, Loader2 } from "lucide-react"
import { TemplatesTab } from "@/components/admin/central-email/TemplatesTab"
import { CampaignsTab } from "@/components/admin/central-email/CampaignsTab"
import { MetricsTab } from "@/components/admin/central-email/MetricsTab"
import type { EmailTemplate } from "@/components/admin/central-email/types"

type Tab = "campanhas" | "templates" | "metricas"
const VALID_TABS: Tab[] = ["campanhas", "templates", "metricas"]

const TABS: { id: Tab; label: string; icon: typeof Mail }[] = [
    { id: "campanhas", label: "Campanhas", icon: Megaphone },
    { id: "templates", label: "Templates", icon: MessageSquare },
    { id: "metricas",  label: "Métricas",  icon: BarChart3 },
]

export default function CentralEmailPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 size={28} className="animate-spin text-[#A68B4B]" /></div>}>
            <CentralEmailInner />
        </Suspense>
    )
}

function CentralEmailInner() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const rawTab = searchParams.get("tab")
    const tab: Tab = (rawTab && (VALID_TABS as string[]).includes(rawTab)) ? (rawTab as Tab) : "campanhas"

    const setTab = (next: Tab) => {
        const params = new URLSearchParams(searchParams.toString())
        if (next === "campanhas") params.delete("tab")
        else params.set("tab", next)
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }

    const [templates, setTemplates] = useState<EmailTemplate[]>([])

    async function fetchTemplates() {
        const res = await fetch(`/api/email/central/templates`)
        if (res.ok) {
            const data = await res.json()
            setTemplates(data.templates ?? [])
        }
    }

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const res = await fetch(`/api/email/central/templates`)
            if (!res.ok || cancelled) return
            const data = await res.json()
            if (!cancelled) setTemplates(data.templates ?? [])
        })()
        return () => { cancelled = true }
    }, [])

    return (
        <div className="flex-1 min-h-[600px] flex flex-col">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3 shrink-0">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Mail className="h-6 w-6 text-primary" />
                        Central de E-mail
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Campanhas e automações por e-mail integradas ao CRM. Mesmo padrão da Central WhatsApp,
                        usando o SMTP Hostinger pra envio.
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

            <div className="space-y-5 pb-5">
                {tab === "campanhas" && <CampaignsTab templates={templates} />}
                {tab === "templates" && <TemplatesTab templates={templates} onChange={fetchTemplates} />}
                {tab === "metricas"  && <MetricsTab />}
            </div>
        </div>
    )
}
