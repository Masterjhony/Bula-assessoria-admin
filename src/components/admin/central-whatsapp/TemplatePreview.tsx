"use client"

/**
 * Preview de template como o CONTATO vê no WhatsApp: balão verde de mensagem
 * enviada sobre o fundo do chat, com mídia renderizada de verdade (URL assinada
 * do R2), variáveis preenchidas com valores de exemplo (destacados) e enquete
 * no formato nativo. Serve pro operador escolher template por estética, não
 * pelo texto cru com {{1}}.
 */

import { useEffect, useMemo, useState } from "react"
import { FileText, Mic, Play, CheckCheck, Loader2, ImageIcon } from "lucide-react"
import type { Template } from "./types"

/** Valores de exemplo por nome de variável local ({nome}, {assunto}…). */
const EXEMPLO_POR_NOME: Record<string, string> = {
    nome: "João",
    name: "João Pereira",
    assunto: "touros para recria",
    leilao: "Leilão Genética Aditiva",
    cidade: "Campo Grande/MS",
    data: "26/07",
}

/** Valores de exemplo por posição Meta ({{1}}, {{2}}…). */
const EXEMPLO_POR_POSICAO = [
    "João",
    "Leilão Touros Nelore — 26/07, 9h",
    "R$ 20.000",
    "30x no boleto",
]

type Chunk = { text: string; highlight?: boolean; bold?: boolean; italic?: boolean }

/**
 * Substitui variáveis por exemplos e aplica a formatação do WhatsApp
 * (*negrito* e _itálico_). Retorna chunks para renderizar exemplos com
 * destaque visual.
 */
function renderBody(body: string): Chunk[] {
    const withVars: Chunk[] = []
    // 1) variáveis → exemplo (marcado como highlight)
    const varRegex = /\{\{\s*(\d+)\s*\}\}|\{([a-zA-Z_]+)\}/g
    let last = 0
    for (const m of body.matchAll(varRegex)) {
        if (m.index! > last) withVars.push({ text: body.slice(last, m.index) })
        const exemplo = m[1]
            ? (EXEMPLO_POR_POSICAO[Number(m[1]) - 1] ?? `exemplo ${m[1]}`)
            : (EXEMPLO_POR_NOME[m[2].toLowerCase()] ?? m[2])
        withVars.push({ text: exemplo, highlight: true })
        last = m.index! + m[0].length
    }
    if (last < body.length) withVars.push({ text: body.slice(last) })

    // 2) formatação *bold* / _italic_ dentro dos chunks não-highlight
    const out: Chunk[] = []
    for (const c of withVars) {
        if (c.highlight) { out.push(c); continue }
        const fmtRegex = /\*([^*\n]+)\*|_([^_\n]+)_/g
        let i = 0
        for (const m of c.text.matchAll(fmtRegex)) {
            if (m.index! > i) out.push({ text: c.text.slice(i, m.index) })
            if (m[1] !== undefined) out.push({ text: m[1], bold: true })
            else out.push({ text: m[2], italic: true })
            i = m.index! + m[0].length
        }
        if (i < c.text.length) out.push({ text: c.text.slice(i) })
    }
    return out
}

function BodyText({ body }: { body: string }) {
    const chunks = useMemo(() => renderBody(body), [body])
    return (
        <span className="whitespace-pre-wrap break-words">
            {chunks.map((c, i) => {
                let node: React.ReactNode = c.text
                if (c.bold) node = <strong key={i}>{c.text}</strong>
                if (c.italic) node = <em key={i}>{c.text}</em>
                if (c.highlight) {
                    return (
                        <span
                            key={i}
                            className="rounded px-0.5 bg-amber-300/40 dark:bg-amber-400/25 border-b border-dashed border-amber-500/70"
                            title="Valor de exemplo — na hora do envio entra o dado real do contato"
                        >
                            {c.text}
                        </span>
                    )
                }
                return <span key={i}>{node}</span>
            })}
        </span>
    )
}

/** Resolve a key do R2 numa URL exibível (assinada). URLs http passam direto. */
function useMediaUrl(key: string | null): { url: string | null; loading: boolean; failed: boolean } {
    const [state, setState] = useState<{ url: string | null; loading: boolean; failed: boolean }>({
        url: null, loading: false, failed: false,
    })
    useEffect(() => {
        if (!key) { setState({ url: null, loading: false, failed: false }); return }
        if (/^https?:\/\//i.test(key)) { setState({ url: key, loading: false, failed: false }); return }
        let cancelled = false
        setState({ url: null, loading: true, failed: false })
        fetch(`/api/r2/download-url?key=${encodeURIComponent(key)}`)
            .then(r => r.json())
            .then(d => { if (!cancelled) setState({ url: d.url ?? null, loading: false, failed: !d.url }) })
            .catch(() => { if (!cancelled) setState({ url: null, loading: false, failed: true }) })
        return () => { cancelled = true }
    }, [key])
    return state
}

function MediaBlock({ mediaKey, type, filename }: {
    mediaKey: string | null
    type: Template["media_type"]
    filename: string | null
}) {
    const { url, loading, failed } = useMediaUrl(mediaKey)

    if (loading) {
        return (
            <div className="h-40 rounded-md bg-black/10 dark:bg-white/10 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        )
    }
    if (type === "image") {
        return url && !failed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="mídia do template" className="rounded-md max-h-64 w-full object-cover" />
        ) : (
            <div className="h-40 rounded-md bg-black/10 dark:bg-white/10 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
                <span className="text-[10px]">imagem do template</span>
            </div>
        )
    }
    if (type === "video") {
        return url && !failed ? (
            <video src={url} controls preload="metadata" className="rounded-md max-h-64 w-full bg-black" />
        ) : (
            <div className="h-40 rounded-md bg-black/80 flex flex-col items-center justify-center gap-1 text-white/80">
                <Play className="h-8 w-8" />
                <span className="text-[10px]">vídeo do template</span>
            </div>
        )
    }
    if (type === "audio") {
        return url && !failed ? (
            <audio src={url} controls className="w-full h-10" />
        ) : (
            <div className="flex items-center gap-2 rounded-full bg-black/10 dark:bg-white/10 px-3 py-2">
                <Mic className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 h-1 rounded bg-black/20 dark:bg-white/20" />
                <span className="text-[10px] text-muted-foreground">0:12</span>
            </div>
        )
    }
    // document (PDF etc.) — chip como no WhatsApp
    const label = filename || (mediaKey ? mediaKey.split("/").pop() : null) || "documento.pdf"
    const chip = (
        <div className="flex items-center gap-2.5 rounded-md bg-black/5 dark:bg-white/10 px-3 py-2.5">
            <FileText className="h-7 w-7 text-red-500 flex-shrink-0" />
            <div className="min-w-0">
                <p className="text-xs font-medium truncate">{label}</p>
                <p className="text-[10px] opacity-60">{label.toLowerCase().endsWith(".pdf") ? "PDF" : "Documento"}</p>
            </div>
        </div>
    )
    return url && !failed
        ? <a href={url} target="_blank" rel="noreferrer" className="block hover:opacity-90">{chip}</a>
        : chip
}

interface PreviewInput {
    body: string
    media_url: string | null
    media_type: Template["media_type"]
    media_filename: string | null
    media_caption: string | null
    poll_question: string | null
    poll_options: string[]
    poll_selectable_count?: number
}

/**
 * O balão (ou balões) como o contato recebe: mídia+legenda, texto e enquete.
 * Regra de composição espelha o envio: legenda da mídia vazia → o corpo vira
 * a legenda (um balão só); legenda preenchida → mídia num balão, corpo noutro.
 */
export function WhatsappBubblePreview({ t }: { t: PreviewInput }) {
    const hasMedia = Boolean(t.media_url && t.media_type)
    const hasPoll = Boolean(t.poll_question && (t.poll_options?.length ?? 0) >= 2)
    const caption = hasMedia ? (t.media_caption?.trim() || t.body.trim() || null) : null
    const separateBody = hasMedia
        ? (t.media_caption?.trim() ? t.body.trim() : "")   // corpo virou legenda → sem 2º balão
        : t.body.trim()

    const bubbles: React.ReactNode[] = []
    if (hasMedia) {
        bubbles.push(
            <Bubble key="media">
                <div className="space-y-1.5">
                    <MediaBlock mediaKey={t.media_url} type={t.media_type} filename={t.media_filename} />
                    {caption && <p className="text-[13px] leading-snug"><BodyText body={caption} /></p>}
                </div>
            </Bubble>,
        )
    }
    if (separateBody) {
        bubbles.push(
            <Bubble key="body">
                <p className="text-[13px] leading-snug"><BodyText body={separateBody} /></p>
            </Bubble>,
        )
    }
    if (hasPoll) {
        bubbles.push(
            <Bubble key="poll">
                <div className="space-y-2 min-w-[200px]">
                    <p className="text-[13px] font-semibold leading-snug">{t.poll_question}</p>
                    <p className="text-[10px] opacity-60 -mt-1">
                        {(t.poll_selectable_count ?? 1) > 1 ? "Selecione uma ou mais opções" : "Selecione uma opção"}
                    </p>
                    {t.poll_options.filter(o => o.trim()).map((o, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <span className="h-4 w-4 rounded-full border-2 border-black/30 dark:border-white/40 flex-shrink-0" />
                            <span className="text-[13px]">{o}</span>
                        </div>
                    ))}
                </div>
            </Bubble>,
        )
    }

    if (bubbles.length === 0) {
        return (
            <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                Preencha mensagem, mídia ou enquete para ver o preview.
            </div>
        )
    }

    return (
        <div
            className="rounded-xl px-3 py-4 space-y-1.5 bg-[#efeae2] dark:bg-[#0b141a]"
            style={{
                backgroundImage:
                    "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.035) 1px, transparent 0)",
                backgroundSize: "14px 14px",
            }}
        >
            {bubbles}
            <p className="text-center text-[9px] text-black/40 dark:text-white/30 pt-1">
                Trechos <span className="rounded px-0.5 bg-amber-300/40 dark:bg-amber-400/25 border-b border-dashed border-amber-500/70">destacados</span> são exemplos — no envio entra o dado real do contato.
            </p>
        </div>
    )
}

function Bubble({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex justify-end">
            <div className="relative max-w-[85%] rounded-lg rounded-tr-none px-2.5 py-1.5 shadow-sm bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]">
                {children}
                <div className="flex items-center justify-end gap-1 mt-0.5 -mb-0.5">
                    <span className="text-[9px] opacity-50">12:04</span>
                    <CheckCheck className="h-3 w-3 text-[#53bdeb]" />
                </div>
            </div>
        </div>
    )
}

/** Adapta um Template salvo pro formato do preview. */
export function templateToPreview(t: Template): PreviewInput {
    return {
        body: t.body ?? "",
        media_url: t.media_url,
        media_type: t.media_type,
        media_filename: t.media_filename,
        media_caption: t.media_caption,
        poll_question: t.poll_question,
        poll_options: t.poll_options ?? [],
        poll_selectable_count: t.poll_selectable_count ?? 1,
    }
}
