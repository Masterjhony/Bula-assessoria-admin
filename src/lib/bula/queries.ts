import { createClient } from '@/utils/supabase/server'
import type {
    BulaMembro, BulaLeilao, BulaCard, BulaFunil, BulaDeal, BulaLead, BulaMarketingConfig,
} from './types'
import { isLeilaoPassado, nowSaoPaulo } from './leilao-tempo'

// ── Membros ──────────────────────────────────────────────

export async function getMembros(): Promise<BulaMembro[]> {
    const supabase = await createClient()
    const { data } = await supabase.from('bula_membros').select('*').order('nome')
    return (data ?? []) as BulaMembro[]
}

// ── Leilões ──────────────────────────────────────────────

export async function getLeiloes(): Promise<BulaLeilao[]> {
    const supabase = await createClient()
    await autoConcluirLeiloesPassados(supabase)
    const { data: leiloes } = await supabase
        .from('bula_leiloes')
        .select(`*, bula_leilao_assessores(membro_id, bula_membros(id, nome, iniciais, cor))`)
        .order('data', { ascending: true })

    return (leiloes ?? []).map((l: Record<string, unknown>) => ({
        ...l,
        assessores: ((l.bula_leilao_assessores as Array<{bula_membros: BulaMembro}>) ?? []).map((a) => a.bula_membros),
    })) as BulaLeilao[]
}

async function autoConcluirLeiloesPassados(supabase: Awaited<ReturnType<typeof createClient>>) {
    const now = nowSaoPaulo()
    const { error: olderError } = await supabase
        .from('bula_leiloes')
        .update({ status: 'concluido' })
        .eq('status', 'confirmado')
        .lt('data', now.date)

    if (olderError) {
        console.error('[bula_leiloes] autoConcluirLeiloesPassados antigos', olderError.message)
    }

    const { data: todayRows, error: todayError } = await supabase
        .from('bula_leiloes')
        .select('id, data, horario')
        .eq('status', 'confirmado')
        .eq('data', now.date)

    if (todayError) {
        console.error('[bula_leiloes] autoConcluirLeiloesPassados hoje', todayError.message)
        return
    }

    const passedIds = (todayRows ?? [])
        .filter((row) => isLeilaoPassado(row.data, row.horario, now))
        .map((row) => row.id)

    if (passedIds.length === 0) return

    const { error: updateError } = await supabase
        .from('bula_leiloes')
        .update({ status: 'concluido' })
        .in('id', passedIds)

    if (updateError) {
        console.error('[bula_leiloes] autoConcluirLeiloesPassados update hoje', updateError.message)
    }
}

export async function getLeilao(id: string): Promise<BulaLeilao | null> {
    const supabase = await createClient()
    const { data } = await supabase
        .from('bula_leiloes')
        .select(`*, bula_leilao_assessores(membro_id, bula_membros(id, nome, iniciais, cor))`)
        .eq('id', id)
        .single()

    if (!data) return null
    return {
        ...data,
        assessores: (data.bula_leilao_assessores ?? []).map((a: {bula_membros: BulaMembro}) => a.bula_membros),
    } as BulaLeilao
}

export async function createLeilao(payload: Omit<BulaLeilao, 'id' | 'assessores'> & { assessor_ids: string[] }) {
    const supabase = await createClient()
    const { assessor_ids, ...rest } = payload
    const { data, error } = await supabase.from('bula_leiloes').insert(rest).select().single()
    if (error || !data) throw error

    if (assessor_ids.length > 0) {
        await supabase.from('bula_leilao_assessores').insert(
            assessor_ids.map((membro_id) => ({ leilao_id: data.id, membro_id }))
        )
    }
    return data
}

export async function updateLeilao(id: string, patch: Partial<BulaLeilao & { assessor_ids?: string[] }>) {
    const supabase = await createClient()
    const { assessor_ids, assessores, ...rest } = patch as Record<string, unknown>

    if (Object.keys(rest).length > 0) {
        const { error } = await supabase.from('bula_leiloes').update(rest).eq('id', id)
        if (error) throw error
    }

    if (Array.isArray(assessor_ids)) {
        await supabase.from('bula_leilao_assessores').delete().eq('leilao_id', id)
        if (assessor_ids.length > 0) {
            await supabase.from('bula_leilao_assessores').insert(
                assessor_ids.map((membro_id: string) => ({ leilao_id: id, membro_id }))
            )
        }
    }
}

export async function deleteLeilao(id: string) {
    const supabase = await createClient()
    await supabase.from('bula_leiloes').delete().eq('id', id)
}

// ── Projeto / Kanban ─────────────────────────────────────

export async function getCards(): Promise<BulaCard[]> {
    const supabase = await createClient()
    const { data } = await supabase
        .from('bula_projeto_cards')
        .select(`*, bula_card_responsaveis(membro_id, bula_membros(id, nome, iniciais, cor))`)
        .order('coluna').order('posicao')

    return (data ?? []).map((c: Record<string, unknown>) => ({
        ...c,
        responsaveis: ((c.bula_card_responsaveis as Array<{bula_membros: BulaMembro}>) ?? []).map((r) => r.bula_membros),
    })) as BulaCard[]
}

export async function createCard(payload: Omit<BulaCard, 'id' | 'responsaveis'> & { responsavel_ids?: string[] }) {
    const supabase = await createClient()
    const { responsavel_ids, ...rest } = payload
    const { data, error } = await supabase.from('bula_projeto_cards').insert(rest).select().single()
    if (error || !data) throw error

    if (responsavel_ids && responsavel_ids.length > 0) {
        await supabase.from('bula_card_responsaveis').insert(
            responsavel_ids.map((membro_id) => ({ card_id: data.id, membro_id }))
        )
    }
    return data
}

export async function updateCard(id: string, patch: Partial<BulaCard & { responsavel_ids?: string[] }>) {
    const supabase = await createClient()
    const { responsavel_ids, responsaveis, ...rest } = patch as Record<string, unknown>

    if (Object.keys(rest).length > 0) {
        await supabase.from('bula_projeto_cards').update(rest).eq('id', id)
    }

    if (Array.isArray(responsavel_ids)) {
        await supabase.from('bula_card_responsaveis').delete().eq('card_id', id)
        if (responsavel_ids.length > 0) {
            await supabase.from('bula_card_responsaveis').insert(
                responsavel_ids.map((membro_id: string) => ({ card_id: id, membro_id }))
            )
        }
    }
}

export async function deleteCard(id: string) {
    const supabase = await createClient()
    await supabase.from('bula_projeto_cards').delete().eq('id', id)
}

// ── CRM ──────────────────────────────────────────────────

export async function getFunis(): Promise<BulaFunil[]> {
    const supabase = await createClient()
    const { data: funis } = await supabase.from('bula_crm_funis').select('*').order('posicao')
    const { data: deals } = await supabase
        .from('bula_crm_deals')
        .select(`*, bula_membros(id, nome, iniciais, cor)`)
        .order('created_at')

    return (funis ?? []).map((f: Record<string, unknown>) => ({
        ...f,
        deals: (deals ?? [])
            .filter((d: Record<string, unknown>) => d.funil_id === f.id)
            .map((d: Record<string, unknown>) => ({ ...d, assessor: d.bula_membros })),
    })) as BulaFunil[]
}

export async function createDeal(payload: Omit<BulaDeal, 'id' | 'assessor'>) {
    const supabase = await createClient()
    const { data, error } = await supabase.from('bula_crm_deals').insert(payload).select().single()
    if (error) throw error
    return data
}

export async function updateDeal(id: string, patch: Partial<BulaDeal>) {
    const supabase = await createClient()
    const { assessor, ...rest } = patch as Record<string, unknown>
    await supabase.from('bula_crm_deals').update(rest).eq('id', id)
}

export async function deleteDeal(id: string) {
    const supabase = await createClient()
    await supabase.from('bula_crm_deals').delete().eq('id', id)
}

// ── Leads ─────────────────────────────────────────────────

export async function getLeads(): Promise<BulaLead[]> {
    const supabase = await createClient()
    const { data } = await supabase.from('bula_leads').select('*').order('created_at', { ascending: false })
    return (data ?? []) as BulaLead[]
}

export async function createLead(payload: Omit<BulaLead, 'id' | 'created_at'>) {
    const supabase = await createClient()
    const { data, error } = await supabase.from('bula_leads').insert(payload).select().single()
    if (error) throw error
    return data
}

export async function updateLead(id: string, patch: Partial<BulaLead>) {
    const supabase = await createClient()
    await supabase.from('bula_leads').update(patch).eq('id', id)
}

// ── Marketing config ──────────────────────────────────────

export async function getMarketingConfig(): Promise<BulaMarketingConfig | null> {
    const supabase = await createClient()
    const { data } = await supabase.from('bula_marketing_config').select('*').limit(1).single()
    return data as BulaMarketingConfig | null
}

export async function updateMarketingConfig(investimento: number) {
    const supabase = await createClient()
    const { data: existing } = await supabase.from('bula_marketing_config').select('id').limit(1).single()
    if (existing) {
        await supabase.from('bula_marketing_config').update({ investimento, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
        await supabase.from('bula_marketing_config').insert({ investimento })
    }
}
