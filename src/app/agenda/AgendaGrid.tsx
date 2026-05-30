'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, CalendarDays, MapPin, Users, Radio, BookOpen, CalendarX2, ArrowRight } from 'lucide-react'
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

        const asc = filtro === 'proximos'
        return [...arr].sort((a, b) => {
            const d = parseData(a.data).time - parseData(b.data).time
            return asc ? d : -d
        })
    }, [leiloes, filtro, busca])

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

        return [...map.values()].sort((a, b) => {
            return filtro === 'realizados' ? b.ordem - a.ordem : a.ordem - b.ordem
        })
    }, [lista, filtro])

    return (
        <div>
            <div className="flex flex-col gap-4 rounded-lg border border-[#1E2519]/10 bg-[#FFF9EE] p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex rounded-lg bg-[#EFE5D7] p-1">
                    {FILTROS.map((f) => (
                        <button
                            key={f.id}
                            onClick={() => setFiltro(f.id)}
                            className={`relative rounded-md px-3.5 py-2 text-[13px] font-bold transition-colors sm:px-4 ${
                                filtro === f.id ? 'text-white' : 'text-[#1E2519]/58 hover:text-[#1E2519]'
                            }`}
                            style={{ color: filtro === f.id ? '#fff' : '#1E251999' }}
                        >
                            {filtro === f.id && (
                                <motion.span
                                    layoutId="filtro-pill"
                                    className="absolute inset-0 rounded-md bg-[#355334]"
                                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                />
                            )}
                            <span className="relative">
                                {f.label}
                                <span className={`ml-1.5 text-[11px] ${filtro === f.id ? 'text-white/65' : 'text-[#1E2519]/35'}`}>
                                    {contagens[f.id]}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>

                <div className="relative sm:w-80">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E2519]/35" />
                    <input
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Buscar por nome, local..."
                        className="w-full rounded-lg border border-[#1E2519]/10 bg-white py-2.5 pl-10 pr-3 text-sm text-[#1E2519] shadow-sm placeholder:text-[#1E2519]/35 transition-colors focus:border-[#A07732]/50"
                    />
                </div>
            </div>

            {lista.length === 0 ? (
                <EstadoVazio filtro={filtro} temBusca={!!busca.trim()} />
            ) : (
                <motion.div layout className="mt-7 space-y-10">
                    <nav className="flex gap-2 overflow-x-auto pb-1">
                        {grupos.map((grupo) => (
                            <a
                                key={grupo.key}
                                href={`#mes-${grupo.key}`}
                                className="inline-flex min-w-fit items-center gap-2 rounded-lg border border-[#1E2519]/10 bg-[#FFF9EE] px-3.5 py-2 text-sm font-bold text-[#1E2519] shadow-sm transition-colors hover:border-[#A07732]/35 hover:bg-white"
                            >
                                {grupo.label}
                                <span className="rounded-full bg-[#355334]/10 px-2 py-0.5 text-[11px] text-[#355334]">
                                    {grupo.total}
                                </span>
                            </a>
                        ))}
                    </nav>

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
                            <div className="mb-4 flex flex-col gap-2 border-b border-[#1E2519]/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#A07732]">
                                        {grupo.periodo}
                                    </span>
                                    <h3 className="mt-1 text-2xl font-black tracking-tight text-[#1E2519] sm:text-3xl">
                                        {grupo.label}
                                    </h3>
                                </div>
                                <span className="text-sm font-semibold text-[#1E2519]/50">
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
                className="group flex h-full flex-col overflow-hidden rounded-lg border border-[#1E2519]/10 bg-[#FFF9EE] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#A07732]/35 hover:shadow-[0_24px_48px_-34px_rgba(30,37,25,0.6)]"
            >
                <div className="relative aspect-[16/10] overflow-hidden bg-[#E8DDCC]">
                    {leilao.img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={leilao.img}
                            alt={leilao.nome}
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            <div className="text-center">
                                <div className="text-5xl font-black leading-none text-[#A07732]">{p.dia}</div>
                                <div className="mt-1 text-xs font-bold uppercase tracking-[3px] text-[#1E2519]/38">{p.mesAbrev}</div>
                            </div>
                        </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#1E2519]/38 to-transparent" />

                    <div className="absolute left-3 top-3 flex flex-col items-center rounded-lg bg-[#FFF9EE]/92 px-3 py-1.5 shadow-sm backdrop-blur-md">
                        <span className="text-lg font-black leading-none text-[#1E2519]">{p.dia}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#A07732]">{p.mesAbrev}</span>
                    </div>

                    <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
                        <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm backdrop-blur-md"
                            style={{ color: badge.fg, background: badge.bg }}
                        >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: badge.dot }} />
                            {badge.label}
                        </span>
                        {aoVivo && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#B14236] px-2 py-0.5 text-[10px] font-bold text-white shadow-sm backdrop-blur-md">
                                <Radio className="h-3 w-3" /> Ao vivo
                            </span>
                        )}
                    </div>

                    {countdown && (
                        <span className="absolute bottom-3 left-3 rounded-full bg-[#D9B86F] px-2.5 py-1 text-[10px] font-black text-[#1E2519] shadow-sm">
                            {countdown}
                        </span>
                    )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                    {leilao.tipo && (
                        <span className="mb-2 text-[11px] font-bold uppercase tracking-[1px] text-[#A07732]">
                            {leilao.tipo}
                        </span>
                    )}
                    <h3 className="text-xl font-black leading-tight text-[#1E2519] transition-colors group-hover:text-[#355334]">
                        {leilao.nome}
                    </h3>

                    <div className="mt-4 space-y-2.5 text-[13px] font-medium text-[#1E2519]/58">
                        <div className="flex items-center gap-2">
                            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#A07732]" />
                            <span>{p.diaSemana}{leilao.horario ? ` · ${leilao.horario}` : ''}</span>
                        </div>
                        {leilao.local && (
                            <div className="flex items-center gap-2">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#A07732]" />
                                <span className="truncate">{leilao.local}</span>
                            </div>
                        )}
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-[#1E2519]/10 pt-4">
                        <div className="flex items-center gap-3 text-[12px] font-semibold text-[#1E2519]/45">
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
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#355334]/10 text-[#355334] transition-colors group-hover:bg-[#355334] group-hover:text-white">
                            <ArrowRight className="h-4 w-4" />
                        </span>
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
            ? 'Nenhum leilão confirmado no momento. Volte em breve, novos remates são anunciados toda semana.'
            : 'Nada por aqui ainda.'
    return (
        <div className="mt-10 flex flex-col items-center justify-center rounded-lg border border-dashed border-[#1E2519]/15 bg-[#FFF9EE] py-20 text-center">
            <CalendarX2 className="h-10 w-10 text-[#1E2519]/22" />
            <p className="mt-4 max-w-sm text-sm text-[#1E2519]/52">{msg}</p>
        </div>
    )
}
