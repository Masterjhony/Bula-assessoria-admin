"use client"

/**
 * Aba "Atendimento IA" da Central WhatsApp — substituiu a aba "Fluxo" (grafo
 * legado de triagem por palavra-chave). Hoje quem atende é o concierge de IA
 * (src/lib/whatsapp-concierge.ts); esta aba mostra e edita os parâmetros dele
 * (site_settings.crm_concierge via GET/PUT /api/whatsapp/concierge) e explica,
 * para o operador, o que a IA sabe e como ela age.
 */

import { useEffect, useState } from "react"
import {
    Bot, Sparkles, Save, Loader2, CheckCircle2, AlertCircle, Power,
    ClipboardCheck, Tag, CalendarDays, Landmark, MessagesSquare, UserRound,
    Timer, PhoneForwarded, BellRing, FileText, ShieldCheck, HandMetal, BellOff,
} from "lucide-react"

interface ConciergeSettings {
    enabled: boolean
    model: string
    persona: string
    thinkingSeconds: number
    handoffContact: string
    notifyGroupId: string
    assessoresGroupId: string
    api_configured: boolean
    default_model: string
    default_persona: string
}

const GOLD = "#C9A84C"

/* O contexto que o runConcierge injeta a cada mensagem — espelha o código. */
const CONTEXT_BLOCKS = [
    { Icon: ClipboardCheck, title: "Checklist de habilitação", desc: "11 itens (titular, propriedade, documentos). A IA pede SÓ o que falta — nunca repete pergunta." },
    { Icon: UserRound, title: "Dados do lead", desc: "Tudo que o CRM já sabe (formulário, interesse, cidade, I.E., histórico) entra no contexto." },
    { Icon: Tag, title: "Faixas de preço reais", desc: "Preço por cabeça dos nossos fechamentos. \"Quanto custa?\" recebe faixa real, nunca inventada." },
    { Icon: CalendarDays, title: "Agenda de leilões", desc: "Próximos leilões confirmados. \"Quando é o próximo?\" responde com evento real e convida." },
    { Icon: Landmark, title: "Estado do cadastro", desc: "Em análise / aprovado / recusado nas leiloeiras — a conversa fica coerente com o ciclo." },
    { Icon: MessagesSquare, title: "Histórico da conversa", desc: "As últimas mensagens (áudio já transcrito) para responder no contexto certo." },
]

const BEHAVIOURS = [
    { Icon: Sparkles, text: "Qualifica o lead e conduz até o checklist completo (dados + documentos), com tom humano e mensagens curtas." },
    { Icon: FileText, text: "Documentos recebidos viram arquivos do cadastro; checklist completo posta a ficha nos grupos das leiloeiras automaticamente." },
    { Icon: ShieldCheck, text: "Nunca promete aprovação, taxa ou desconto — análise de cadastro é decisão humana." },
    { Icon: HandMetal, text: "Pediu humano? Faz handoff, passa o contato configurado abaixo e avisa o grupo interno." },
    { Icon: BellOff, text: "Opt-out é decisão da IA pelo contexto (\"não quero mais receber\") — sem gatilho cego por palavra-chave." },
]

export function AtendimentoIATab() {
    const [cfg, setCfg] = useState<ConciergeSettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const res = await fetch("/api/whatsapp/concierge")
                if (!res.ok || cancelled) return
                const data = await res.json()
                if (!cancelled) setCfg(data)
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [])

    async function save(patch: Partial<ConciergeSettings>) {
        if (!cfg) return
        setSaving(true)
        setFeedback(null)
        try {
            const res = await fetch("/api/whatsapp/concierge", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
            })
            const data = await res.json()
            if (!res.ok) {
                setFeedback({ type: "err", msg: data.error ?? "Falha ao salvar" })
                return
            }
            setCfg(c => c ? { ...c, ...data } : c)
            setFeedback({ type: "ok", msg: "Configuração salva — vale já para a próxima mensagem." })
        } catch (e) {
            setFeedback({ type: "err", msg: e instanceof Error ? e.message : "Erro" })
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return <div className="flex items-center justify-center py-24"><Loader2 size={26} className="animate-spin" style={{ color: GOLD }} /></div>
    }
    if (!cfg) {
        return <div className="text-sm text-muted-foreground py-10 text-center">Não foi possível carregar a configuração da IA.</div>
    }

    const effectiveModel = cfg.model?.trim() || cfg.default_model
    const personaIsDefault = !cfg.persona?.trim()

    return (
        <div className="space-y-5">
            {/* ── Hero: status da IA ─────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 text-white p-6">
                <div className="absolute -right-8 -top-8 opacity-[0.06]"><Bot size={200} /></div>
                <div className="relative flex flex-col md:flex-row md:items-center gap-5">
                    <div className="flex items-center gap-4 flex-1">
                        <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${GOLD}22`, border: `1px solid ${GOLD}55` }}>
                            <Bot className="h-6 w-6" style={{ color: GOLD }} />
                        </div>
                        <div>
                            <h2 className="font-display text-xl tracking-wide uppercase">Concierge de atendimento</h2>
                            <p className="text-sm text-white/60 mt-0.5">
                                A IA conduz o lead do primeiro contato até a habilitação completa — e entrega pronto pro assessor.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                            <p className="text-[11px] uppercase tracking-wider text-white/50">Modelo em uso</p>
                            <p className="text-sm font-medium" style={{ color: GOLD }}>{effectiveModel}</p>
                        </div>
                        <button
                            onClick={() => save({ enabled: !cfg.enabled })}
                            disabled={saving || !cfg.api_configured}
                            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                                cfg.enabled ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/40" : "bg-white/10 text-white/70 border border-white/20"
                            }`}
                        >
                            <Power className="h-4 w-4" />
                            {cfg.enabled ? "IA ligada" : "IA desligada"}
                        </button>
                    </div>
                </div>
                {!cfg.api_configured && (
                    <p className="relative mt-4 text-xs text-amber-300 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" /> OPENROUTER_API_KEY não configurada no servidor — a IA não responde até configurar.
                    </p>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-5 items-start">
                <div className="space-y-5">
                    {/* ── O que a IA sabe ────────────────────────────────── */}
                    <section className="bg-card text-card-foreground rounded-2xl border p-5">
                        <h3 className="font-display uppercase tracking-wide text-sm mb-1 flex items-center gap-2">
                            <span className="h-4 w-1 rounded-full" style={{ background: GOLD }} />
                            O que a IA recebe a cada mensagem
                        </h3>
                        <p className="text-xs text-muted-foreground mb-4">Contexto injetado automaticamente — é o que torna as respostas precisas.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {CONTEXT_BLOCKS.map(b => (
                                <div key={b.title} className="flex gap-3 rounded-xl border bg-background/60 p-3">
                                    <b.Icon className="h-4.5 w-4.5 shrink-0 mt-0.5" style={{ color: GOLD, height: 18, width: 18 }} />
                                    <div>
                                        <p className="text-sm font-semibold leading-tight">{b.title}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{b.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* ── Como ela age ───────────────────────────────────── */}
                    <section className="bg-card text-card-foreground rounded-2xl border p-5">
                        <h3 className="font-display uppercase tracking-wide text-sm mb-4 flex items-center gap-2">
                            <span className="h-4 w-1 rounded-full" style={{ background: GOLD }} />
                            Como a IA age
                        </h3>
                        <ul className="space-y-2.5">
                            {BEHAVIOURS.map((b, i) => (
                                <li key={i} className="flex items-start gap-2.5 text-sm">
                                    <b.Icon className="shrink-0 mt-0.5" style={{ color: GOLD, height: 15, width: 15 }} />
                                    <span className="text-foreground/90">{b.text}</span>
                                </li>
                            ))}
                        </ul>
                    </section>

                    {/* ── Persona ────────────────────────────────────────── */}
                    <section className="bg-card text-card-foreground rounded-2xl border p-5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="font-display uppercase tracking-wide text-sm flex items-center gap-2">
                                <span className="h-4 w-1 rounded-full" style={{ background: GOLD }} />
                                Persona &amp; instruções
                            </h3>
                            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${personaIsDefault ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                                {personaIsDefault ? "padrão do sistema" : "personalizada"}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Vazio = usa a persona padrão (voz do &quot;João&quot;, com todo o fluxo de habilitação, objeções e regras).
                            Só personalize se souber o que está fazendo — o padrão evolui junto com o sistema.
                        </p>
                        <textarea
                            value={cfg.persona}
                            onChange={e => setCfg(c => c ? { ...c, persona: e.target.value } : c)}
                            rows={personaIsDefault ? 6 : 14}
                            placeholder={cfg.default_persona.slice(0, 900) + "…"}
                            className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40"
                        />
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => save({ persona: cfg.persona })}
                                disabled={saving}
                                className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg text-black disabled:opacity-50"
                                style={{ background: GOLD }}
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Salvar persona
                            </button>
                            {!personaIsDefault && (
                                <button
                                    onClick={() => { setCfg(c => c ? { ...c, persona: "" } : c); void save({ persona: "" }) }}
                                    disabled={saving}
                                    className="text-xs border px-3 py-2 rounded-lg hover:bg-muted"
                                >
                                    Restaurar padrão
                                </button>
                            )}
                        </div>
                    </section>
                </div>

                {/* ── Parâmetros ─────────────────────────────────────────── */}
                <aside className="bg-card text-card-foreground rounded-2xl border p-5 space-y-4 lg:sticky lg:top-4">
                    <h3 className="font-display uppercase tracking-wide text-sm flex items-center gap-2">
                        <span className="h-4 w-1 rounded-full" style={{ background: GOLD }} />
                        Parâmetros
                    </h3>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium flex items-center gap-1.5"><Sparkles style={{ color: GOLD }} className="h-3.5 w-3.5" /> Modelo (OpenRouter)</label>
                        <input
                            value={cfg.model}
                            onChange={e => setCfg(c => c ? { ...c, model: e.target.value } : c)}
                            placeholder={cfg.default_model}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40"
                        />
                        <p className="text-[10px] text-muted-foreground">Vazio = <code>{cfg.default_model}</code> (recomendado — conduz a conversa comercial). Alternativas: <code>anthropic/claude-haiku-4.5</code>, <code>google/gemini-2.5-flash</code> (mais baratos, menos jogo de cintura).</p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium flex items-center gap-1.5"><Timer style={{ color: GOLD }} className="h-3.5 w-3.5" /> Janela de agrupamento (segundos)</label>
                        <input
                            type="number" min={0} max={18}
                            value={cfg.thinkingSeconds}
                            onChange={e => setCfg(c => c ? { ...c, thinkingSeconds: Number(e.target.value) } : c)}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40"
                        />
                        <p className="text-[10px] text-muted-foreground">Espera antes de responder, para agrupar vários balões do lead numa resposta só (0–18s).</p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium flex items-center gap-1.5"><PhoneForwarded style={{ color: GOLD }} className="h-3.5 w-3.5" /> Contato humano (handoff)</label>
                        <input
                            value={cfg.handoffContact}
                            onChange={e => setCfg(c => c ? { ...c, handoffContact: e.target.value } : c)}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40"
                        />
                        <p className="text-[10px] text-muted-foreground">Nome + número que a IA passa quando o lead pede pra falar com uma pessoa.</p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium flex items-center gap-1.5"><BellRing style={{ color: GOLD }} className="h-3.5 w-3.5" /> Grupo interno de avisos (Baileys)</label>
                        <input
                            value={cfg.notifyGroupId}
                            onChange={e => setCfg(c => c ? { ...c, notifyGroupId: e.target.value } : c)}
                            placeholder="1203634…@g.us"
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40"
                        />
                        <p className="text-[10px] text-muted-foreground">Recebe: habilitação completa, pedido de humano, opt-out e decisões das leiloeiras.</p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium flex items-center gap-1.5"><BellRing style={{ color: GOLD }} className="h-3.5 w-3.5" /> Grupo dos assessores (aprovados)</label>
                        <input
                            value={cfg.assessoresGroupId}
                            onChange={e => setCfg(c => c ? { ...c, assessoresGroupId: e.target.value } : c)}
                            placeholder="1203634…@g.us"
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/40"
                        />
                        <p className="text-[10px] text-muted-foreground">Recebe os cadastros APROVADOS pela leiloeira — cliente habilitado para a equipe comercial dar sequência.</p>
                    </div>

                    <button
                        onClick={() => save({
                            model: cfg.model,
                            thinkingSeconds: cfg.thinkingSeconds,
                            handoffContact: cfg.handoffContact,
                            notifyGroupId: cfg.notifyGroupId,
                            assessoresGroupId: cfg.assessoresGroupId,
                        })}
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-1.5 text-sm font-medium px-4 py-2.5 rounded-lg text-black disabled:opacity-50"
                        style={{ background: GOLD }}
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar parâmetros
                    </button>

                    {feedback && (
                        <p className={`text-xs flex items-center gap-1 ${feedback.type === "ok" ? "text-emerald-500" : "text-red-500"}`}>
                            {feedback.type === "ok" ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                            {feedback.msg}
                        </p>
                    )}
                </aside>
            </div>
        </div>
    )
}
