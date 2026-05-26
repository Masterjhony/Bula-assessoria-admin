"use client"

import { useRef, useState } from "react"

/**
 * Hook compartilhado para upload de mídia ao Cloudflare R2 via presigned PUT.
 *
 * Usado por TemplatesTab e CampaignsTab — mantém o padrão idêntico ao
 * R2Library (XHR + content-type fallback) que é o que funciona contra a
 * config CORS do bucket.
 *
 * Retorna a key (relativa ao R2_PREFIX) que deve ser salva no campo
 * `media_url` do template ou da campanha.
 */
export type MediaType = 'image' | 'video' | 'audio' | 'document'

export interface UploadedFile {
    key: string
    type: MediaType
    mime: string
    filename: string
    size: number
}

export function mediaTypeForMime(mime: string): MediaType {
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('video/')) return 'video'
    if (mime.startsWith('audio/')) return 'audio'
    return 'document'
}

export function useR2Upload() {
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function uploadFile(file: File, opts?: { maxBytes?: number }): Promise<UploadedFile> {
        const maxBytes = opts?.maxBytes ?? 50 * 1024 * 1024
        if (file.size > maxBytes) {
            throw new Error(`Arquivo > ${(maxBytes / 1024 / 1024).toFixed(0)}MB. Use mídia menor.`)
        }
        setUploading(true)
        setError(null)
        try {
            const contentType = file.type || 'application/octet-stream'
            const presignRes = await fetch('/api/r2/upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, contentType }),
            })
            const presign = await presignRes.json().catch(() => ({}))
            if (!presignRes.ok) {
                throw new Error(presign.error || `Falha gerando URL (HTTP ${presignRes.status})`)
            }
            if (!presign.url || !presign.key) {
                throw new Error('Resposta sem url/key — confira env vars R2_* na Vercel.')
            }

            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest()
                xhr.open('PUT', presign.url)
                xhr.setRequestHeader('Content-Type', contentType)
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) resolve()
                    else reject(new Error(
                        `Upload R2 falhou (HTTP ${xhr.status}). ` +
                        `${xhr.responseText ? xhr.responseText.slice(0, 200) : 'Verifique CORS do bucket.'}`
                    ))
                }
                xhr.onerror = () => reject(new Error('Falha de rede no PUT — possível CORS bloqueado.'))
                xhr.send(file)
            })

            return {
                key: presign.key,
                type: mediaTypeForMime(contentType),
                mime: contentType,
                filename: file.name,
                size: file.size,
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Erro no upload'
            setError(msg)
            throw e
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    return { fileInputRef, uploading, error, setError, uploadFile }
}
