"use client"

// Hub de Campanhas do CRM — reúne num só lugar os disparos/campanhas do sistema
// de atendimento (WhatsApp + E-mail), reaproveitando os CampaignsTab que já
// existem nas Centrais de WhatsApp e de E-mail.

import { Suspense, useEffect, useState } from "react"
import { Megaphone, MessageCircle, Mail, Loader2 } from "lucide-react"
import { CampaignsTab as WhatsappCampaignsTab } from "@/components/admin/central-whatsapp/CampaignsTab"
import { CampaignsTab as EmailCampaignsTab } from "@/components/admin/central-email/CampaignsTab"
import type { Template } from "@/components/admin/central-whatsapp/types"
import type { EmailTemplate } from "@/components/admin/central-email/types"

type Channel = "whatsapp" | "email"

const CHANNELS: { id: Channel; label: string; icon: typeof Mail }[] = [
    { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
    { id: "email", label: "E-mail", icon: Mail },
]

export default function CrmCampanhasPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 size={28} className="animate-spin text-[#A68B4B]" /></div>}>
            <CrmCampanhasInner />
        </Suspense>
    )
}

function CrmCampanhasInner() {
    const [channel, setChannel] = useState<Channel>("whatsapp")
    const [waTemplates, setWaTemplates] = useState<Template[]>([])
    const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const res = await fetch(`/api/whatsapp/central/templates`)
            if (res.ok && !cancelled) { const d = await res.json(); setWaTemplates(d.templates ?? []) }
        })()
        ;(async () => {
            const res = await fetch(`/api/email/central/templates`)
            if (res.ok && !cancelled) { const d = await res.json(); setEmailTemplates(d.templates ?? []) }
        })()
        return () => { cancelled = true }
    }, [])

    return (
        <div className="flex-1 min-h-[600px] flex flex-col">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3 shrink-0">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Megaphone className="h-6 w-6 text-primary" />
                        Campanhas
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Gerencie disparos e campanhas do sistema de atendimento — WhatsApp e E-mail —
                        num só lugar: criação, segmentação, templates e acompanhamento.
                    </p>
                </div>
            </div>

            <div className="border-b flex flex-wrap gap-1 shrink-0 mb-3">
                {CHANNELS.map(c => {
                    const Icon = c.icon
                    const active = channel === c.id
                    return (
                        <button
                            key={c.id}
                            onClick={() => setChannel(c.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors -mb-px ${
                                active
                                    ? "border-primary text-foreground font-semibold"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {c.label}
                        </button>
                    )
                })}
            </div>

            <div className="space-y-5 pb-5">
                {channel === "whatsapp" && <WhatsappCampaignsTab templates={waTemplates} />}
                {channel === "email" && <EmailCampaignsTab templates={emailTemplates} />}
            </div>
        </div>
    )
}
