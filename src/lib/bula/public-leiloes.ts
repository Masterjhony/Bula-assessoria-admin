import { supabaseAdmin } from '@/lib/supabase'
import type { BulaMembro, LeilaoStatus } from './types'
import { isLeilaoAtivo } from './leilao-tempo'
import { CRIATORIO_LOGOS } from './criatorio-logos'

/**
 * Leilao exposto na pagina publica (lp / agenda).
 *
 * IMPORTANTE - fronteira de dados: esta pagina e voltada ao cliente.
 * So expomos campos comerciais/operacionais publicos. Nunca incluir
 * dados financeiros internos (expectativa, meta_bula, realizado_bula,
 * acordo_comissao, comissoes) - esses vivem apenas no painel/ERP.
 */
export interface LeilaoPublico {
    id: string
    nome: string
    criador: string | null
    data: string
    horario: string | null
    tipo: string | null
    local: string | null
    animais: number | null
    modelo: string | null
    leiloeira: string | null
    condicao: string | null
    frete_gratis: string | null
    transmissao: string | null
    catalogo_url: string | null
    img: string | null
    status: LeilaoStatus
    assessores: BulaMembro[]
}

export interface CriatorioParceiroPublico {
    nome: string
    slug: string
    logo: string | null
    siteUrl: string | null
    totalLeiloes: number
}

const PUBLIC_COLS =
    'id, nome, data, horario, tipo, local, animais, modelo, leiloeira, condicao, frete_gratis, transmissao, catalogo_url, img, status'

const PUBLIC_STATUSES: LeilaoStatus[] = ['confirmado']

function hasSupabaseAdminConfig(): boolean {
    return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

const CRIATORIO_REFERENCIAS: Record<string, { siteUrl: string }> = {
    'fazenda camparino': { siteUrl: 'https://fazendacamparino.com.br/' },
    'ls agropecuaria': { siteUrl: 'https://fazendals.com.br/' },
    'nelore katayama': { siteUrl: 'https://www.katayamapecuaria.com.br/' },
    'fazenda santa nice': { siteUrl: 'https://www.santanice.com.br/' },
    'santa nice': { siteUrl: 'https://www.santanice.com.br/' },
    'terra brava agropecuaria': { siteUrl: 'https://terrabrava.com.br/' },
}

function todaySaoPaulo(): string {
    const { year, month, day } = datePartsSaoPaulo(new Date())
    return `${year}-${month}-${day}`
}

function datePartsSaoPaulo(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date)
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
    return { year: get('year'), month: get('month'), day: get('day') }
}

function currentMonthRangeSaoPaulo() {
    const { year, month } = datePartsSaoPaulo(new Date())
    const y = Number(year)
    const m = Number(month)
    const lastDay = new Date(y, m, 0).getDate()
    return {
        start: `${year}-${month}-01`,
        end: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
        year,
        month,
    }
}

function nextMonthRangeSaoPaulo() {
    const { year, month } = datePartsSaoPaulo(new Date())
    const current = new Date(Number(year), Number(month) - 1, 1)
    const next = new Date(current.getFullYear(), current.getMonth() + 1, 1)
    const nextYear = String(next.getFullYear())
    const nextMonth = String(next.getMonth() + 1).padStart(2, '0')
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    return {
        start: `${nextYear}-${nextMonth}-01`,
        end: `${nextYear}-${nextMonth}-${String(lastDay).padStart(2, '0')}`,
        year: nextYear,
        month: nextMonth,
    }
}

function publicAgendaRangeSaoPaulo() {
    const today = todaySaoPaulo()
    const current = currentMonthRangeSaoPaulo()
    const next = nextMonthRangeSaoPaulo()
    return {
        start: today,
        end: next.end,
        current,
        next,
    }
}

function slugify(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

function normalizeEventText(value: unknown): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

function eventKey(data: unknown, nome: unknown, hora: unknown): string {
    return [
        String(data ?? '').trim(),
        normalizeEventText(nome),
        normalizeEventText(hora),
    ].join('|')
}

function isActivePublicAgendaRow(row: Record<string, unknown>): boolean {
    return isLeilaoAtivo(row.data, row.horario ?? row.hora)
}

function logoForCriatorio(nome: string): string | null {
    const slug = slugify(nome)
    return CRIATORIO_LOGOS[slug]?.src ?? null
}

function referenceForCriatorio(nome: string): { siteUrl: string | null } {
    const key = slugify(nome).replace(/-/g, ' ')
    return { siteUrl: CRIATORIO_REFERENCIAS[key]?.siteUrl ?? null }
}

function mapAssessores(row: Record<string, unknown>): BulaMembro[] {
    const join = (row.bula_leilao_assessores as Array<{ bula_membros: BulaMembro }>) ?? []
    return join.map((a) => a.bula_membros).filter(Boolean)
}

export async function getLeiloesPublicos(): Promise<LeilaoPublico[]> {
    if (!hasSupabaseAdminConfig()) return []

    const supabase = supabaseAdmin()
    const range = publicAgendaRangeSaoPaulo()
    const { data, error } = await supabase
        .from('bula_leiloes')
        .select(`${PUBLIC_COLS}, bula_leilao_assessores(bula_membros(id, nome, iniciais, cor))`)
        .in('status', PUBLIC_STATUSES)
        .gte('data', range.start)
        .lte('data', range.end)
        .order('data', { ascending: true })
        .order('horario', { ascending: true })

    if (error) {
        console.error('[public-leiloes] getLeiloesPublicos', error.message)
        return []
    }

    const { data: cronoData, error: cronoError } = await supabase
        .from('cronograma_leiloes')
        .select('data, hora, nome, criador')
        .gte('data', range.start)
        .lte('data', range.end)

    if (cronoError) {
        console.error('[public-leiloes] getLeiloesPublicos criadores', cronoError.message)
    }

    const criadorByKey = new Map<string, string>()
    const horaByKey = new Map<string, string>()
    for (const row of cronoData ?? []) {
        const criador = String(row.criador || '').trim()
        const hora = String(row.hora || '').trim()
        if (criador) criadorByKey.set(eventKey(row.data, row.nome, row.hora), criador)
        if (hora) horaByKey.set(eventKey(row.data, row.nome, row.hora), hora)
        const noHourKey = eventKey(row.data, row.nome, '')
        if (criador && !criadorByKey.has(noHourKey)) criadorByKey.set(noHourKey, criador)
        if (hora && !horaByKey.has(noHourKey)) horaByKey.set(noHourKey, hora)
    }

    return (data ?? [])
        .map((row: Record<string, unknown>) => {
            const cronoHora =
                horaByKey.get(eventKey(row.data, row.nome, row.horario))
                ?? horaByKey.get(eventKey(row.data, row.nome, ''))
                ?? null
            return {
                ...row,
                horario: String(row.horario || '').trim() || cronoHora,
            }
        })
        .filter((row: Record<string, unknown>) => isActivePublicAgendaRow(row))
        .map((row: Record<string, unknown>) => ({
            ...(row as object),
            criador:
                criadorByKey.get(eventKey(row.data, row.nome, row.horario))
                ?? criadorByKey.get(eventKey(row.data, row.nome, ''))
                ?? null,
            assessores: mapAssessores(row),
        })) as unknown as LeilaoPublico[]
}

export async function getLeilaoPublico(id: string): Promise<LeilaoPublico | null> {
    if (!hasSupabaseAdminConfig()) return null

    const supabase = supabaseAdmin()
    const { data, error } = await supabase
        .from('bula_leiloes')
        .select(`${PUBLIC_COLS}, bula_leilao_assessores(bula_membros(id, nome, iniciais, cor))`)
        .eq('id', id)
        .in('status', PUBLIC_STATUSES)
        .maybeSingle()

    if (error || !data) {
        if (error) console.error('[public-leiloes] getLeilaoPublico', error.message)
        return null
    }

    const { data: cronoRows, error: cronoError } = await supabase
        .from('cronograma_leiloes')
        .select('data, hora, nome, criador')
        .eq('data', String(data.data))
        .eq('nome', String(data.nome))

    if (cronoError) {
        console.error('[public-leiloes] getLeilaoPublico criador', cronoError.message)
    }

    const cronoMatch = (cronoRows ?? []).find((row) =>
        eventKey(row.data, row.nome, row.hora) === eventKey(data.data, data.nome, data.horario),
    ) ?? cronoRows?.[0]

    return {
        ...(data as object),
        horario: String((data as Record<string, unknown>).horario || '').trim()
            || String(cronoMatch?.hora || '').trim()
            || null,
        criador: String(cronoMatch?.criador || '').trim() || null,
        assessores: mapAssessores(data as Record<string, unknown>),
    } as unknown as LeilaoPublico
}

export async function getCriatoriosParceirosMes(): Promise<CriatorioParceiroPublico[]> {
    if (!hasSupabaseAdminConfig()) return []

    const supabase = supabaseAdmin()
    const range = publicAgendaRangeSaoPaulo()
    const { data, error } = await supabase
        .from('cronograma_leiloes')
        .select('nome, criador, data, hora')
        .gte('data', range.start)
        .lte('data', range.end)
        .order('data', { ascending: true })

    if (error) {
        console.error('[public-leiloes] getCriatoriosParceirosMes', error.message)
        return []
    }

    const map = new Map<string, { nome: string; totalLeiloes: number }>()
    const activeRows = (data ?? []).filter((row: Record<string, unknown>) => isActivePublicAgendaRow(row))
    for (const row of activeRows) {
        const nome = String(row.criador || '').trim()
        if (!nome) continue
        const slug = slugify(nome)
        const current = map.get(slug)
        if (current) current.totalLeiloes += 1
        else map.set(slug, { nome, totalLeiloes: 1 })
    }

    return [...map.entries()]
        .map(([slug, item]) => ({
            nome: item.nome,
            slug,
            logo: logoForCriatorio(item.nome),
            siteUrl: referenceForCriatorio(item.nome).siteUrl,
            totalLeiloes: item.totalLeiloes,
        }))
        .filter((item) => item.logo)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
