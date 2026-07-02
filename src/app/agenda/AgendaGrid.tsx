'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
    ArrowRight, BookOpen, CalendarDays, CalendarX2, MapPin, Radio, Search,
    Tag, Truck, Users, X,
} from 'lucide-react'
import type { LeilaoPublico } from '@/lib/bula/public-leiloes'
import { contagemRegressiva, isFuturo, localExibivel, parseData, statusPublico, youtubeId } from './helpers'

export function AgendaGrid({ leiloes }: { leiloes: LeilaoPublico[] }) {
    const [busca, setBusca] = useState('')

    const lista = useMemo(() => {
        const q = normalize(busca)
        let arr = leiloes

        if (q) {
            arr = arr.filter((l) => normalize(searchableText(l)).includes(q))
        }

        return [...arr].sort((a, b) => parseData(a.data).time - parseData(b.data).time)
    }, [leiloes, busca])

    const grupos = useMemo(() => {
        const map = new Map<string, {
            key: string
            label: string
            periodo: string
            total: number
            leiloes: LeilaoPublico[]
            ordem: number
        }>()

        lista.forEach((leilao) => {
            const p = parseData(leilao.data)
            const key = `${p.ano}-${String(p.mesNum).padStart(2, '0')}`
            const atual = map.get(key)
            const leiloesDoMes = atual ? [...atual.leiloes, leilao] : [leilao]
            const dias = leiloesDoMes.map((l) => parseData(l.data).dia).sort((a, b) => a - b)
            const primeiroDia = dias[0]
            const ultimoDia = dias[dias.length - 1]
            const periodo = primeiroDia === ultimoDia
                ? `${primeiroDia} de ${p.mesNome.toLowerCase()}`
                : `${primeiroDia} a ${ultimoDia} de ${p.mesNome.toLowerCase()}`

            map.set(key, {
                key,
                label: `${p.mesNome} ${p.ano}`,
                periodo,
                total: leiloesDoMes.length,
                leiloes: leiloesDoMes,
                ordem: new Date(p.ano, p.mesNum - 1, 1).getTime(),
            })
        })

        return [...map.values()].sort((a, b) => a.ordem - b.ordem)
    }, [lista])

    return (
        <div>
            <div className="rounded-md border border-white/10 bg-[#141414] p-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                    <input
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar por nome, criatório, leiloeira, local..."
                        className="w-full rounded-md border border-white/10 bg-[#0A0A0A] py-3 pl-10 pr-9 text-sm text-white placeholder:text-white/35 transition-colors focus:border-[#C9A84C]/50 focus:outline-none"
                    />
                    {busca && (
                        <button
                            type="button"
                            onClick={() => setBusca('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-white/40 hover:bg-white/5 hover:text-white"
                            aria-label="Limpar busca"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {lista.length === 0 ? (
                <EstadoVazio temBusca={!!busca.trim()} />
            ) : (
                <motion.div layout className="mt-7 space-y-10">
                    {grupos.map((grupo, grupoIndex) => (
                        <motion.section
                            layout
                            key={grupo.key}
                            id={`mes-${grupo.key}`}
                            className="scroll-mt-28"
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.28, delay: Math.min(grupoIndex * 0.04, 0.18) }}
                        >
                            <div className="mb-4 flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#C9A84C]">
                                        {grupo.periodo}
                                    </span>
                                    <h3 className="font-display mt-1 text-2xl uppercase tracking-tight text-white sm:text-3xl">
                                        {grupo.label}
                                    </h3>
                                </div>
                                <span className="text-sm font-semibold text-white/45">
                                    {grupo.total} {grupo.total === 1 ? 'evento no período' : 'eventos no período'}
                                </span>
                            </div>

                            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                <AnimatePresence mode="popLayout">
                                    {grupo.leiloes.map((l, i) => (
                                        <LeilaoCard
                                            key={l.id}
                                            leilao={l}
                                            index={(grupoIndex * 3) + i}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                        </motion.section>
                    ))}
                </motion.div>
            )}
        </div>
    )
}

function LeilaoCard({ leilao, index }: { leilao: LeilaoPublico; index: number }) {
    const p = parseData(leilao.data)
    const aoVivo = !!youtubeId(leilao.transmissao)
    const countdown = contagemRegressiva(leilao.data)
    const tags = cardTags(leilao)
    const realizado = !isFuturo(leilao.data) || leilao.status === 'concluido'
    const status = statusPublico(leilao)

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
                className="group flex h-full flex-col overflow-hidden rounded-md border border-white/10 bg-[#141414] transition-all duration-300 hover:-translate-y-1 hover:border-[#C9A84C]/35 hover:shadow-[0_28px_60px_-38px_rgba(0,0,0,0.9)]"
            >
                <div className="relative aspect-[16/10] overflow-hidden bg-black">
                    {leilao.img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={leilao.img}
                            alt={leilao.nome}
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-black text-white">
                            <div className="text-center">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src="/logo-bula-assessoria-white.png" alt="" className="mx-auto mb-4 h-7 w-auto opacity-80" />
                                <div className="font-display text-6xl leading-none text-[#C9A84C]">{p.dia}</div>
                                <div className="mt-1 text-xs font-bold uppercase text-white/40">{p.mesAbrev}</div>
                            </div>
                        </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />

                    {/* Bloco de data em preto, dia em dourado (anatomia do card — brandbook). */}
                    <div className="absolute left-3 top-3 flex flex-col items-center rounded-md border border-white/10 bg-[#0A0A0A]/85 px-3 py-1.5 shadow-sm backdrop-blur-md">
                        <span className="font-display text-xl leading-none text-[#C9A84C]">{p.dia}</span>
                        <span className="text-[10px] font-bold uppercase text-white/55">{p.mesAbrev}</span>
                    </div>

                    <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
                        <span
                            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-bold shadow-sm backdrop-blur-md"
                            style={{ color: status.fg, background: status.bg, borderColor: realizado ? 'rgba(255,255,255,0.12)' : 'rgba(201,168,76,0.28)' }}
                        >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.dot }} />
                            {status.label}
                        </span>
                        {aoVivo && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#0A0A0A] shadow-sm backdrop-blur-md">
                                <Radio className="h-3 w-3" /> Ao vivo
                            </span>
                        )}
                    </div>

                    {countdown && (
                        <span className="absolute bottom-3 left-3 rounded-full border border-[#C9A84C]/35 bg-[#0A0A0A]/85 px-2.5 py-1 text-[10px] font-black text-[#E8DBB8] shadow-sm backdrop-blur-md">
                            {countdown}
                        </span>
                    )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                    <div className="mb-3 flex flex-wrap gap-1.5">
                        {tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="inline-flex items-center gap-1 rounded border border-white/12 px-2 py-1 text-[10px] font-bold uppercase text-white/55">
                                <Tag className="h-3 w-3" />
                                {tag}
                            </span>
                        ))}
                    </div>

                    <h3 className="font-display text-2xl uppercase leading-[0.95] text-white transition-colors group-hover:text-[#E8DBB8]">
                        {leilao.nome}
                    </h3>

                    <div className="mt-4 space-y-2.5 text-[13px] font-medium text-white/58">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#C9A84C]" />
                            <span>{p.diaSemana}{leilao.horario ? ` · ${leilao.horario}` : ''}</span>
                        </div>
                        {leilao.criador && (
                            <div className="flex items-center gap-2">
                                <Users className="h-3.5 w-3.5 shrink-0 text-white/45" />
                                <span className="truncate">{leilao.criador}</span>
                            </div>
                        )}
                        {localExibivel(leilao.local) && (
                            <div className="flex items-center gap-2">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-white/45" />
                                <span className="truncate">{localExibivel(leilao.local)}</span>
                            </div>
                        )}
                        {leilao.leiloeira && (
                            <div className="flex items-center gap-2">
                                <Users className="h-3.5 w-3.5 shrink-0 text-white/45" />
                                <span className="truncate">{leilao.leiloeira}</span>
                            </div>
                        )}
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                        <div className="flex min-w-0 flex-wrap items-center gap-3 text-[12px] font-semibold text-white/45">
                            {!!leilao.animais && leilao.animais > 0 && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5" /> {leilao.animais} animais
                                </span>
                            )}
                            {leilao.catalogo_url && (
                                <span className="inline-flex items-center gap-1.5">
                                    <BookOpen className="h-3.5 w-3.5" /> Catálogo
                                </span>
                            )}
                            {(leilao.frete_gratis || normalize(leilao.condicao).includes('frete')) && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Truck className="h-3.5 w-3.5" /> Frete
                                </span>
                            )}
                        </div>
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-[#0A0A0A] transition-colors group-hover:bg-[#C9A84C]">
                            <ArrowRight className="h-4 w-4" />
                        </span>
                    </div>
                </div>
            </Link>
        </motion.div>
    )
}

function EstadoVazio({ temBusca }: { temBusca: boolean }) {
    const msg = temBusca
        ? 'Nenhum leilão encontrado para essa busca.'
        : 'Nenhum leilão cadastrado para o período da agenda.'
    return (
        <div className="mt-10 flex flex-col items-center justify-center rounded-md border border-dashed border-white/15 bg-[#141414] py-20 text-center">
            <CalendarX2 className="h-10 w-10 text-white/25" />
            <p className="mt-4 max-w-sm text-sm text-white/52">{msg}</p>
        </div>
    )
}

function searchableText(l: LeilaoPublico): string {
    return [
        l.nome, l.criador, l.local, l.tipo, l.leiloeira, l.modelo, l.condicao, l.frete_gratis,
        l.assessores.map((a) => a.nome).join(' '),
    ].filter(Boolean).join(' ')
}

function normalize(value?: string | null): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

function cardTags(l: LeilaoPublico): string[] {
    const tags = [
        l.tipo,
        l.modelo,
        l.condicao,
        l.frete_gratis ? 'Frete grátis' : null,
        normalize(l.condicao).includes('30') ? '30X boleto' : null,
        l.leiloeira,
    ]
        .map((v) => String(v ?? '').trim())
        .filter(Boolean)

    return [...new Set(tags)]
}
