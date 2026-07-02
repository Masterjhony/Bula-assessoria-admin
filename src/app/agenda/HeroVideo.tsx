'use client'

import { useEffect, useRef } from 'react'

// Vídeo de fundo do hero. Força o play no mount (autoplay muted às vezes não
// dispara sozinho dependendo do navegador/aba) — mesmo truque do design gerado.
export function HeroVideo({ src, poster }: { src: string; poster?: string }) {
    const ref = useRef<HTMLVideoElement>(null)

    useEffect(() => {
        const v = ref.current
        if (!v) return
        v.muted = true
        const p = v.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
    }, [])

    return (
        <video
            ref={ref}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster={poster}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        >
            <source src={src} type="video/mp4" />
        </video>
    )
}
