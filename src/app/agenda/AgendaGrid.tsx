'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, CalendarDays, MapPin, Users, Radio, BookOpen, CalendarX2 } from 'lucide-react'
import type { LeilaoPublico } from '@/lib/bula/public-leiloes'
import { parseData, isFuturo, statusPublico, youtubeId, contagemRegressiva } from './helpers'

type Filtro = 'proximos' | 'realizados' | 'todos'

const FILTROS: { id: Filtro; label: string }[] = [
    { id: 'proximos', label: 'Próximos' },
    { id: 'realizados', label: 'Realizados' },
    { id: 'todos', label: 'Todos' },
]

export function AgendaGrid({ leiloes }: { leiloes: LeilaoPublico[] }) {
    const [filtro, setFiltro] = useState<Filtro>('proximos')
    const [busca, setBusca] = useState('')

    const contagens = useMemo(() => ({
        proximos: leiloes.filter((l) => isFuturo(l.data)).length,
        realizados: leiloes.filter((l) => !isFuturo(l.data)).length,
        todos: leiloes.length,
    }), [leiloes])

    const lista = useMemo(() => {
        const q = busca.trim().toLowerCase()
        let arr = leiloes
        if (filtro === 'proximos') arr = arr.filter((l) => isFuturo(l.data))
        else if (filtro === 'realizados') arr = arr.filter((l) => !isFuturo(l.data))

        if (q) {
            arr = arr.filter((l) =>
                [l.nome, l.local, l.tipo, l.leiloeira].filter(Boolean).join(' ').toLowerCase().includes(q),
            )
        }

        // Próximos: mais perto primeiro. Realizados/Todos: mais recente primeiro.
        const asc = filtro === 'proximos'
        return [...arr].sort((a, b) => {
            const d = parseData(a.data).time - parseData(b.data).time
            return asc ? d : -d
        })
    }, [leiloes, filtro, busca])

    return (
        <div>
            {/* Cabeçalho da seção + controles */}
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex rounded-xl border border-white/[0.08] bg-[#141414] p-1">
                    {FILTROS.map((f) => (
                        <button
                            key={f.id}
                            onClick={() => setFiltro(f.id)}
                            className={`relative rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${
                                filtro === f.id ? 'text-black' : 'text-white/55 hover:text-white'
                            }`}
                        >
                            {filtro === f.id && (
                                <motion.span
                                    layoutId="filtro-pill"
                                    className="absolute inset-0 rounded-lg bg-[#C8A96E]"
                                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                />
                            )}
                            <span className="relative">
                                {f.label}
                                <span className={`ml-1.5 text-[11px] ${filtro === f.id ? 'text-black/50' : 'text-white/30'}`}>
                                    {contagens[f.id]}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>

                <div className="relative sm:w-72">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                    <input
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar por nome, local..."
                        className="w-full rounded-xl border border-white/[0.08] bg-[#141414] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-white/30 transition-colors focus:border-[#C8A96E]/50"
                    />
                </div>
            </div>

            {/* Grid */}
            {lista.length === 0 ? (
                <EstadoVazio filtro={filtro} temBusca={!!busca.trim()} />
            ) : (
                <motion.div layout className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    <AnimatePresence mode="popLayout">
                        {lista.map((l, i) => (
                            <LeilaoCard key={l.id} leilao={l} index={i} />
                        ))}
                    </AnimatePresence>
                </motion.div>
            )}
        </div>
    )
}

function LeilaoCard({ leilao, index }: { leilao: LeilaoPublico; index: number }) {
    const p = parseData(leilao.data)
    const badge = statusPublico(leilao)
    const aoVivo = !!youtubeId(leilao.transmissao)
    const countdown = contagemRegressiva(leilao.data)

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
        >
            <Link
                href={`/agenda/${leilao.id}`}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[#141414] transition-all duration-300 hover:-translate-y-1 hover:border-[#C8A96E]/40 hover:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]"
            >
                {/* Capa */}
                <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-[#1A1A1A] to-[#0D0D0D]">
                    {leilao.img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={leilao.img}
                            alt={leilao.nome}
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            <div className="text-center opacity-60">
                                <div className="text-5xl font-extrabold leading-none text-[#C8A96E]">{p.dia}</div>
                                <div className="mt-1 text-xs font-semibold uppercase tracking-[3px] text-white/40">{p.mesAbrev}</div>
                            </div>
                        </div>
                    )}

                    {/* Data badge sobreposto */}
                    <div className="absolute left-3 top-3 flex flex-col items-center rounded-xl bg-black/70 px-3 py-1.5 backdrop-blur-md">
                        <span className="text-lg font-extrabold leading-none text-white">{p.dia}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#C8A96E]">{p.mesAbrev}</span>
                    </div>

                    {/* Status + ao vivo */}
                    <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
                        <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold backdrop-blur-md"
                            style={{ color: badge.fg, background: badge.bg }}
                        >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: badge.dot }} />
                            {badge.label}
                        </span>
                        {aoVivo && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#C0504D]/90 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md">
                                <Radio className="h-3 w-3" /> Ao vivo
                            </span>
                        )}
                    </div>

                    {countdown && (
                        <span className="absolute bottom-3 left-3 rounded-full bg-[#C8A96E] px-2.5 py-1 text-[10px] font-bold text-black">
                            {countdown}
                        </span>
                    )}
                </div>

                {/* Corpo */}
                <div className="flex flex-1 flex-col p-5">
                    {leilao.tipo && (
                        <span className="mb-2 text-[11px] font-semibold uppercase tracking-[1px] text-[#C8A96E]/80">
                            {leilao.tipo}
                        </span>
                    )}
                    <h3 className="text-lg font-bold leading-snug text-white transition-colors group-hover:text-[#C8A96E]">
                        {leilao.nome}
                    </h3>

                    <div className="mt-3 space-y-2 text-[13px] text-white/55">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-white/35" />
                            <span>{p.diaSemana}{leilao.horario ? ` · ${leilao.horario}` : ''}</span>
                        </div>
                        {leilao.local && (
                            <div className="flex items-center gap-2">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-white/35" />
                                <span className="truncate">{leilao.local}</span>
                            </div>
                        )}
                    </div>

                    {/* Rodapé do card */}
                    <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
                        <div className="flex items-center gap-3 text-[12px] text-white/45">
                            {!!leilao.animais && leilao.animais > 0 && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5" /> {leilao.animais}
                                </span>
                            )}
                            {leilao.catalogo_url && (
                                <span className="inline-flex items-center gap-1.5">
                                    <BookOpen className="h-3.5 w-3.5" /> Catálogo
                                </span>
                            )}
                        </div>
                        {/* Assessores */}
                        {leilao.assessores.length > 0 && (
                            <div className="flex -space-x-2">
                                {leilao.assessores.slice(0, 3).map((a) => (
                                    <span
                                        key={a.id}
                                        title={a.nome}
                                        className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#141414] text-[10px] font-bold text-white"
                                        style={{ background: a.cor || '#A68B4B' }}
                                    >
                                        {a.iniciais}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </Link>
        </motion.div>
    )
}

function EstadoVazio({ filtro, temBusca }: { filtro: Filtro; temBusca: boolean }) {
    const msg = temBusca
        ? 'Nenhum leilão encontrado para essa busca.'
        : filtro === 'proximos'
            ? 'Nenhum leilão confirmado no momento. Volte em breve — novos remates são anunciados toda semana.'
            : 'Nada por aqui ainda.'
    return (
        <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] py-20 text-center">
            <CalendarX2 className="h-10 w-10 text-white/20" />
            <p className="mt-4 max-w-sm text-sm text-white/45">{msg}</p>
        </div>
    )
}
