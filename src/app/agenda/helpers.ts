import type { LeilaoPublico } from '@/lib/bula/public-leiloes'

export const WHATSAPP_CTA_URL =
    'https://wa.me/?text=Quero%20receber%20ofertas%20exclusivas%20de%20touros%20e%20matrizes%20PO'

export const MES_NOMES = [
    '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export const MES_ABREV = [
    '', 'JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
    'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ',
]

export const DIA_SEMANA = [
    'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado',
]

export interface DataPartes {
    dia: number
    mesNum: number
    mesNome: string
    mesAbrev: string
    diaSemana: string
    ano: number
    /** Meia-noite local da data do leilão, para comparações de futuro/passado. */
    time: number
}

/** Parseia 'YYYY-MM-DD' como data local para evitar shift de fuso do `new Date(iso)`. */
export function parseData(iso: string): DataPartes {
    const [y, m, d] = (iso || '').split('-').map(Number)
    const dt = new Date(y, (m || 1) - 1, d || 1)
    return {
        dia: d,
        mesNum: m,
        mesNome: MES_NOMES[m] ?? '',
        mesAbrev: MES_ABREV[m] ?? '',
        diaSemana: DIA_SEMANA[dt.getDay()] ?? '',
        ano: y,
        time: dt.getTime(),
    }
}

/** Início do dia de hoje, no fuso local do navegador/servidor. */
export function hojeTime(): number {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
}

export function isFuturo(iso: string): boolean {
    return parseData(iso).time >= hojeTime()
}

export function dataPorExtenso(iso: string): string {
    const p = parseData(iso)
    if (!p.dia) return ''
    return `${p.diaSemana}, ${p.dia} de ${p.mesNome} de ${p.ano}`
}

/** Extrai o ID de um link do YouTube (watch, youtu.be, embed, shorts, live). */
export function youtubeId(url?: string | null): string | null {
    if (!url) return null
    const patterns = [
        /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
        /(?:youtu\.be\/)([\w-]{11})/,
        /(?:youtube\.com\/embed\/)([\w-]{11})/,
        /(?:youtube\.com\/shorts\/)([\w-]{11})/,
        /(?:youtube\.com\/live\/)([\w-]{11})/,
    ]
    for (const re of patterns) {
        const m = url.match(re)
        if (m) return m[1]
    }
    return null
}

export interface StatusBadge {
    label: string
    fg: string
    bg: string
    dot: string
}

/** Rótulo público do leilão, levando a data em conta. */
export function statusPublico(l: Pick<LeilaoPublico, 'status' | 'data'>): StatusBadge {
    const passado = !isFuturo(l.data)
    if (l.status === 'concluido' || (l.status === 'confirmado' && passado)) {
        return { label: 'Realizado', fg: '#525252', bg: 'rgba(0,0,0,0.06)', dot: '#525252' }
    }
    return { label: 'Confirmado', fg: '#166534', bg: '#f3f4f6', dot: '#16a34a' }
}

export function contagemRegressiva(iso: string): string | null {
    const dias = Math.round((parseData(iso).time - hojeTime()) / 86_400_000)
    if (dias < 0) return null
    if (dias === 0) return 'Hoje'
    if (dias === 1) return 'Amanhã'
    if (dias <= 30) return `Em ${dias} dias`
    return null
}
