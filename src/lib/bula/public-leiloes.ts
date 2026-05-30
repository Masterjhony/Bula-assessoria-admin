import { supabaseAdmin } from '@/lib/supabase'
import type { BulaMembro, LeilaoStatus } from './types'

/**
 * Leilão exposto na página pública (lp / agenda).
 *
 * IMPORTANTE — fronteira de dados: esta página é VOLTADA AO CLIENTE.
 * Só expomos campos comerciais/operacionais públicos. Nunca incluir
 * dados financeiros internos (expectativa, meta_bula, realizado_bula,
 * acordo_comissao, comissões) — esses vivem apenas no painel/ERP.
 */
export interface LeilaoPublico {
    id: string
    nome: string
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

// Campos seguros para o público — explicitamente SEM colunas financeiras.
const PUBLIC_COLS =
    'id, nome, data, horario, tipo, local, animais, modelo, leiloeira, condicao, frete_gratis, transmissao, catalogo_url, img, status'

// Apenas eventos confirmados e concluídos aparecem publicamente.
// Pipeline interno ("negociacao", "prospecto") nunca é exposto.
const PUBLIC_STATUSES: LeilaoStatus[] = ['confirmado', 'concluido']

function mapAssessores(row: Record<string, unknown>): BulaMembro[] {
    const join = (row.bula_leilao_assessores as Array<{ bula_membros: BulaMembro }>) ?? []
    return join.map((a) => a.bula_membros).filter(Boolean)
}

export async function getLeiloesPublicos(): Promise<LeilaoPublico[]> {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
        .from('bula_leiloes')
        .select(`${PUBLIC_COLS}, bula_leilao_assessores(bula_membros(id, nome, iniciais, cor))`)
        .in('status', PUBLIC_STATUSES)
        .order('data', { ascending: true })

    if (error) {
        console.error('[public-leiloes] getLeiloesPublicos', error.message)
        return []
    }

    return (data ?? []).map((row: Record<string, unknown>) => ({
        ...(row as object),
        assessores: mapAssessores(row),
    })) as unknown as LeilaoPublico[]
}

export async function getLeilaoPublico(id: string): Promise<LeilaoPublico | null> {
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

    return {
        ...(data as object),
        assessores: mapAssessores(data as Record<string, unknown>),
    } as unknown as LeilaoPublico
}
