"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react"
import { CampaignsTab } from "@/components/admin/central-whatsapp/CampaignsTab"
import type { Template } from "@/components/admin/central-whatsapp/types"

type MetaTemplate = {
  id: string
  name: string
  status: string
  category: string
  language: string
  body: string
}

type StatusData = {
  configured: boolean
  config: {
    accessTokenConfigured: boolean
    phoneNumberId: string | null
    businessAccountId: string | null
    graphVersion: string
  }
  phone: Record<string, unknown> | null
  metaTemplates: MetaTemplate[]
  approvedTemplates: number
  jmpAudience: number
  errors: string[]
}

const card = "rounded-2xl border border-neutral-200/80 bg-white shadow-sm"
const btn = "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-50"
const btnDark = `${btn} bg-neutral-900 text-white hover:bg-neutral-700`
const btnGhost = `${btn} text-neutral-600 hover:bg-neutral-100`

const JMP_AUDIENCE_PRESET = {
  label: "Leads da landing JMP",
  segment: { jmp_landing: true },
  defaultName: "Fluxo WhatsApp JMP",
  defaultDescription: "Campanha criada no admin JMP para leads da landing.",
}

function asText(value: unknown): string {
  return value === null || value === undefined ? "-" : String(value)
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${
      ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
    }`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {label}
    </span>
  )
}

export default function JmpWhatsAppTab() {
  const [status, setStatus] = useState<StatusData | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setMsg(null)
    try {
      const [statusRes, templatesRes] = await Promise.all([
        fetch("/api/jmp/whatsapp/status", { cache: "no-store" }),
        fetch("/api/whatsapp/central/templates", { cache: "no-store" }),
      ])
      const statusJson = await statusRes.json().catch(() => ({}))
      const templatesJson = await templatesRes.json().catch(() => ({}))
      if (!statusRes.ok) throw new Error(statusJson.error || "Falha ao carregar status.")
      if (!templatesRes.ok) throw new Error(templatesJson.error || "Falha ao carregar templates.")
      setStatus(statusJson)
      setTemplates(templatesJson.templates ?? [])
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao carregar WhatsApp." })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function syncTemplates() {
    setSyncing(true)
    setMsg(null)
    try {
      const res = await fetch("/api/jmp/whatsapp/sync-templates", { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Falha ao sincronizar.")
      setMsg({ kind: "ok", text: `${json.synced ?? 0} templates aprovados sincronizados.` })
      await load()
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao sincronizar." })
    } finally {
      setSyncing(false)
    }
  }

  const phone = status?.phone
  const approved = status?.metaTemplates.filter(t => t.status === "APPROVED") ?? []

  return (
    <div className="space-y-5">
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm font-medium ${
          msg.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
        }`}>
          {msg.text}
        </p>
      )}

      <section className={card}>
        <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-4 py-3">
          <MessageSquare className="h-4 w-4 text-emerald-700" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">WhatsApp API oficial</h2>
            <p className="text-xs text-neutral-500">Meta Cloud API + numero da Bula Assessoria</p>
          </div>
          <button onClick={load} disabled={loading} className={btnGhost}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-4">
          <div className="rounded-xl border border-neutral-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase text-neutral-500">Conexao</p>
              <StatusPill ok={Boolean(status?.configured && !status.errors.length)} label={status?.configured ? "configurada" : "pendente"} />
            </div>
            <p className="text-sm font-semibold">{asText(phone?.verified_name ?? "Bula Assessoria")}</p>
            <p className="text-xs text-neutral-500">{asText(phone?.display_phone_number)}</p>
          </div>

          <div className="rounded-xl border border-neutral-200 p-3">
            <p className="text-[11px] font-bold uppercase text-neutral-500">Qualidade</p>
            <p className="mt-2 text-sm font-semibold">{asText(phone?.quality_rating)}</p>
            <p className="text-xs text-neutral-500">{asText(phone?.platform_type)}</p>
          </div>

          <div className="rounded-xl border border-neutral-200 p-3">
            <p className="text-[11px] font-bold uppercase text-neutral-500">Templates Meta</p>
            <p className="mt-2 text-sm font-semibold">{status?.approvedTemplates ?? 0} aprovados</p>
            <p className="text-xs text-neutral-500">{status?.metaTemplates.length ?? 0} encontrados</p>
          </div>

          <div className="rounded-xl border border-neutral-200 p-3">
            <p className="text-[11px] font-bold uppercase text-neutral-500">Publico JMP</p>
            <p className="mt-2 text-sm font-semibold">{status?.jmpAudience ?? 0} leads</p>
            <p className="text-xs text-neutral-500">com WhatsApp e sem opt-out</p>
          </div>
        </div>

        {status?.errors?.length ? (
          <div className="border-t border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {status.errors.map((err, idx) => <p key={idx}>{err}</p>)}
          </div>
        ) : null}
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-4 py-3">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">Templates aprovados</h2>
            <p className="text-xs text-neutral-500">Sincronize para liberar selecao nas campanhas</p>
          </div>
          <button onClick={syncTemplates} disabled={syncing || loading || !status?.configured} className={btnDark}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Sincronizar
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-neutral-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando
            </div>
          ) : approved.length === 0 ? (
            <p className="rounded-xl border border-dashed border-neutral-300 px-3 py-5 text-center text-sm text-neutral-400">
              Nenhum template aprovado retornado pela Meta.
            </p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {approved.slice(0, 6).map(t => (
                <div key={t.id} className="rounded-xl border border-neutral-200 p-3">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold">{t.name}</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{t.language}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-neutral-500">{t.body || t.category}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className={card}>
        <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
          <Send className="h-4 w-4 text-emerald-700" />
          <div>
            <h2 className="text-sm font-bold">Fluxos e campanhas WhatsApp JMP</h2>
            <p className="text-xs text-neutral-500">Campanhas desta aba ficam presas ao publico da landing JMP</p>
          </div>
        </div>
        <div className="p-4">
          <CampaignsTab templates={templates} audiencePreset={JMP_AUDIENCE_PRESET} />
        </div>
      </section>
    </div>
  )
}
