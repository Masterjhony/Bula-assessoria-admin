'use server'

/**
 * Ações da página Ferramentas → Lances do Pregão (/sistema/lances).
 *
 * As vendas capturadas do grupo "Lances Bula Assessoria" (bula_leilao_vendas)
 * são validadas/corrigidas aqui e importadas pro fechamento via
 * rebuildFechamentoFromLances — a MESMA rotina do tempo real, então importar
 * de novo é idempotente. Fechamento manual na mesma data nunca é sobrescrito.
 */

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { rebuildFechamentoFromLances } from '@/lib/lances-fechamento'

export type VendaPregao = {
    id: string
    leilao_data: string | null
    lote: string | null
    valor: number | null
    animais: number | null
    sexo: string | null
    assessor: string | null
    comprador: string | null
    fazenda: string | null
    cidade: string | null
    uf: string | null
    status: string
    fonte: string | null
    cronograma_id: string | null
    raw_text: string | null
    msg_ts: string | null
}

export type LeilaoRef = { id: string; nome: string; data: string }

export type FechamentoRef = {
    id: string
    nome: string
    data: string
    origem: string | null
    vgv_total: number | null
    lotes_vendidos: number | null
    updated_at: string | null
}

export type LancesPregaoData = {
    vendas: VendaPregao[]
    leiloes: LeilaoRef[]       // leilões do cronograma nas datas envolvidas (p/ vincular)
    fechamentos: FechamentoRef[]
}

const VENDA_COLS = 'id, leilao_data, lote, valor, animais, sexo, assessor, comprador, fazenda, cidade, uf, status, fonte, cronograma_id, raw_text, msg_ts'

export async function getLancesPregao(): Promise<LancesPregaoData> {
    const sb = await createClient()
    const { data: vendas } = await sb.from('bula_leilao_vendas')
        .select(VENDA_COLS)
        .order('leilao_data', { ascending: false })
        .order('lote', { ascending: true })
    const rows = (vendas ?? []) as VendaPregao[]

    const datas = [...new Set(rows.map((v) => v.leilao_data).filter(Boolean))] as string[]
    let leiloes: LeilaoRef[] = []
    let fechamentos: FechamentoRef[] = []
    if (datas.length) {
        const { data: l } = await sb.from('cronograma_leiloes')
            .select('id, nome, data').in('data', datas).order('data', { ascending: false })
        leiloes = (l ?? []) as LeilaoRef[]
        const { data: f } = await sb.from('bula_leilao_fechamento')
            .select('id, nome, data, origem, vgv_total, lotes_vendidos, updated_at').in('data', datas)
        fechamentos = (f ?? []) as FechamentoRef[]
    }
    return { vendas: rows, leiloes, fechamentos }
}

export type VendaPatch = Partial<Pick<VendaPregao, 'lote' | 'valor' | 'animais' | 'sexo' | 'assessor' | 'comprador' | 'fazenda' | 'cidade' | 'uf'>>

export async function salvarVenda(id: string, patch: VendaPatch): Promise<{ ok: boolean; error?: string }> {
    const sb = await createClient()
    const { data: cur, error: selErr } = await sb.from('bula_leilao_vendas')
        .select('valor, cronograma_id').eq('id', id).maybeSingle()
    if (selErr || !cur) return { ok: false, error: selErr?.message || 'Venda não encontrada' }
    const valor = 'valor' in patch ? patch.valor ?? null : (cur.valor as number | null)
    const status = valor != null && cur.cronograma_id ? 'auto' : 'revisar'
    const { error } = await sb.from('bula_leilao_vendas').update({ ...patch, status }).eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/sistema/lances')
    return { ok: true }
}

export async function excluirVenda(id: string): Promise<{ ok: boolean; error?: string }> {
    const sb = await createClient()
    const { error } = await sb.from('bula_leilao_vendas').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/sistema/lances')
    return { ok: true }
}

export async function adicionarVenda(input: { leilaoData: string; lote: string; valor?: number | null }): Promise<{ ok: boolean; error?: string }> {
    const sb = await createClient()
    const lote = input.lote.trim()
    if (!lote || !input.leilaoData) return { ok: false, error: 'Informe data e lote' }
    const { data: cron } = await sb.from('cronograma_leiloes').select('id').eq('data', input.leilaoData).limit(2)
    const cronogramaId = cron?.length === 1 ? (cron[0].id as string) : null
    const { error } = await sb.from('bula_leilao_vendas').insert({
        group_jid: 'manual',
        lote,
        valor: input.valor ?? null,
        leilao_data: input.leilaoData,
        cronograma_id: cronogramaId,
        fonte: 'manual',
        status: input.valor != null && cronogramaId ? 'auto' : 'revisar',
    })
    if (error) return { ok: false, error: error.message }
    revalidatePath('/sistema/lances')
    return { ok: true }
}

/** Vincula todas as vendas de uma data a um leilão do cronograma (quando a resolução automática falhou/errou). */
export async function vincularLeilao(leilaoData: string, cronogramaId: string): Promise<{ ok: boolean; error?: string }> {
    const sb = await createClient()
    const { data: cron } = await sb.from('cronograma_leiloes').select('id, data').eq('id', cronogramaId).maybeSingle()
    if (!cron) return { ok: false, error: 'Leilão não encontrado' }
    const { data: vendas, error: selErr } = await sb.from('bula_leilao_vendas')
        .select('id, valor').eq('leilao_data', leilaoData)
    if (selErr) return { ok: false, error: selErr.message }
    for (const v of vendas ?? []) {
        await sb.from('bula_leilao_vendas').update({
            cronograma_id: cronogramaId,
            status: (v.valor as number | null) != null ? 'auto' : 'revisar',
        }).eq('id', v.id)
    }
    revalidatePath('/sistema/lances')
    return { ok: true }
}

export type ImportResult = { ok: boolean; error?: string; created?: string; updated?: string; skipped?: string; lotes?: number; vgv_total?: number }

/** Importa/reimporta as vendas de um leilão pro fechamento (bula_leilao_fechamento). */
export async function importarFechamento(cronogramaId: string): Promise<ImportResult> {
    const sb = await createClient()
    const out = await rebuildFechamentoFromLances(sb, cronogramaId)
    revalidatePath('/sistema/lances')
    revalidatePath('/sistema/leiloes/fechamento')
    if (out.error) return { ok: false, error: String(out.error) }
    if (out.skipped) return { ok: false, skipped: String(out.skipped) }
    return {
        ok: true,
        created: out.created as string | undefined,
        updated: out.updated as string | undefined,
        lotes: out.lotes as number | undefined,
        vgv_total: out.vgv_total as number | undefined,
    }
}
