'use client'

import { useEffect, useState } from 'react'
import type { CriatorioParceiroPublico } from '@/lib/bula/public-leiloes'

export function CriatorioLogoTile({ parceiro }: { parceiro: CriatorioParceiroPublico }) {
    const [errored, setErrored] = useState(false)

    useEffect(() => {
        setErrored(false)
    }, [parceiro.logo])

    if (!parceiro.logo || errored) return null

    return (
        <div className="flex h-full w-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={parceiro.logo}
                alt={parceiro.nome}
                className="max-h-16 max-w-40 object-contain"
                loading="eager"
                decoding="async"
                onError={() => setErrored(true)}
            />
        </div>
    )
}
