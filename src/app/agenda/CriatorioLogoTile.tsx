'use client'

import { useEffect, useState } from 'react'
import type { CriatorioParceiroPublico } from '@/lib/bula/public-leiloes'

function initials(nome: string): string {
    return nome
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
}

export function CriatorioLogoTile({ parceiro }: { parceiro: CriatorioParceiroPublico }) {
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        setLoaded(false)
        if (!parceiro.logo) return
        const img = new Image()
        img.onload = () => setLoaded(true)
        img.onerror = () => setLoaded(false)
        img.src = parceiro.logo
    }, [parceiro.logo])

    return (
        <div className="flex h-full w-full items-center justify-center">
            {loaded && parceiro.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={parceiro.logo}
                    alt={parceiro.nome}
                    className="max-h-16 max-w-40 object-contain"
                />
            ) : (
                <div className="flex w-full items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-black/10 bg-black text-xs font-black text-white">
                        {initials(parceiro.nome)}
                    </span>
                    <span className="min-w-0 text-left text-sm font-black leading-tight text-black">
                        {parceiro.nome}
                    </span>
                </div>
            )}
        </div>
    )
}
