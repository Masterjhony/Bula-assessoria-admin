"use client"

import { Suspense, useEffect, useState, useCallback } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { FileText, Inbox, Users, Plug, Loader2 } from "lucide-react"

import { ConexaoCatalogosTab } from "@/components/admin/catalogos-whatsapp/ConexaoCatalogosTab"
import { DeteccoesTab } from "@/components/admin/catalogos-whatsapp/DeteccoesTab"
import { GruposCatalogosTab } from "@/components/admin/catalogos-whatsapp/GruposCatalogosTab"

type Tab = "deteccoes" | "grupos" | "conexao"
const VALID_TABS: Tab[] = ["deteccoes", "grupos", "conexao"]

const TABS: { id: Tab; label: string; icon: typeof Inbox }[] = [
    { id: "deteccoes", label: "Detecções", icon: Inbox },
    { id: "grupos",    label: "Grupos monitorados", icon: Users },
    { id: "conexao",   label: "Conexão", icon: Plug },
]

export default function CatalogosWhatsAppPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center py-24">
                <Loader2 size={28} className="animate-spin text-[#A68B4B]" />
            </div>
        }>
            <CatalogosWhatsAppInner />
        </Suspense>
    )
}

function CatalogosWhatsAppInner() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    const rawTab = searchParams.get("tab")
    const tab: Tab = (rawTab && (VALID_TABS as string[]).includes(rawTab)) ? (rawTab as Tab) : "deteccoes"

    const setTab = useCallback((next: Tab) => {
        const params = new URLSearchParams(searchParams.toString())
        if (next === "deteccoes") params.delete("tab")
        else params.set("tab", next)
        const qs = params.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    }, [router, pathname, searchParams])

    return (
        <div className="flex-1 min-h-[600px] flex flex-col">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3 shrink-0">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
                        <FileText className="h-6 w-6 text-primary" />
                        Catálogos WhatsApp
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Sessão Baileys dedicada que monitora grupos selecionados,
                        identifica PDFs de catálogo de leilão e anexa automaticamente
                        ao cronograma.
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
                {tab === "deteccoes" && <DeteccoesTab />}
                {tab === "grupos"    && <GruposCatalogosTab />}
                {tab === "conexao"   && <ConexaoCatalogosTab />}
            </div>
        </div>
    )
}
