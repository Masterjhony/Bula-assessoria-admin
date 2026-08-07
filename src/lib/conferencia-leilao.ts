/**
 * Conferência TRI-FONTE de um pregão (por data): cruza lote a lote as três
 * fontes que registram venda na Bula —
 *   1. GRUPO de lances (bula_leilao_vendas — captura ao vivo/retroativa)
 *   2. FECHAMENTO consolidado (bula_leilao_fechamento)
 *   3. HASTAPRO (Firebird da pista, FIL 2 — fonte alternativa que TAMBÉM
 *      pode estar desatualizada)
 * O servidor só ALINHA os dados; quem raciocina e conclui (qual fonte está
 * completa, o que falta lançar e onde) é o agente, com este retorno compacto.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { hastaproConsulta, isHastaproConfigured } from './hastapro'

const normLote = (v: unknown): string => String(v ?? '').trim().toUpperCase().replace(/^0+(?=\d)/, '')
const r2 = (n: number) => Math.round(n * 100) / 100

interface LinhaLote {
    lote: string
    grupo_parcela: number | null
    fechamento_parcela: number | null
    hastapro_parcela: number | null
    comprador_grupo: string | null
    assessor_grupo: string | null
    status_grupo: string | null
    leilao_hastapro: string | null
}

export async function conferirLeilaoTriFonte(
    sb: SupabaseClient,
    dataISO: string,
): Promise<Record<string, unknown>> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return { error: 'data deve ser YYYY-MM-DD' }
    const diaSeguinte = new Date(Date.parse(dataISO + 'T00:00:00Z') + 86400_000).toISOString().slice(0, 10)

    const [vendasQ, fechQ] = await Promise.all([
        sb.from('bula_leilao_vendas')
            .select('lote, valor, comprador, assessor, status, animais')
            .gte('leilao_data', dataISO).lt('leilao_data', diaSeguinte)
            .limit(200),
        sb.from('bula_leilao_fechamento')
            .select('nome, data, lotes_vendidos, animais_vendidos, vgv_total, lances')
            .gte('data', dataISO).lt('data', diaSeguinte)
            .limit(5),
    ])

    const linhas = new Map<string, LinhaLote>()
    const linha = (lote: string): LinhaLote => {
        const k = normLote(lote)
        if (!linhas.has(k)) {
            linhas.set(k, {
                lote: k, grupo_parcela: null, fechamento_parcela: null, hastapro_parcela: null,
                comprador_grupo: null, assessor_grupo: null, status_grupo: null, leilao_hastapro: null,
            })
        }
        return linhas.get(k)!
    }

    for (const v of (vendasQ.data ?? []) as Array<{ lote: string; valor: number | null; comprador: string | null; assessor: string | null; status: string | null }>) {
        const l = linha(v.lote)
        l.grupo_parcela = v.valor != null ? r2(Number(v.valor)) : null
        l.comprador_grupo = v.comprador
        l.assessor_grupo = v.assessor
        l.status_grupo = v.status
    }

    const fechamentos = (fechQ.data ?? []) as Array<{ nome: string; lotes_vendidos: number | null; vgv_total: number | null; lances: unknown }>
    for (const f of fechamentos) {
        const lances = Array.isArray(f.lances) ? f.lances : []
        for (const it of lances as Array<Record<string, unknown>>) {
            const lote = it.lote ?? it.numero
            if (lote == null) continue
            const l = linha(String(lote))
            const parcela = it.parcela ?? it.valor
            if (typeof parcela === 'number') l.fechamento_parcela = r2(parcela)
        }
    }

    let hastapro: Record<string, unknown> | null = null
    if (isHastaproConfigured()) {
        try {
            const hp = await hastaproConsulta('vendas', { de: dataISO, ate: diaSeguinte, fil: '2' }) as {
                vendas?: Array<Record<string, unknown>>; error?: string
            }
            if (hp.error) hastapro = { error: hp.error }
            else {
                for (const v of hp.vendas ?? []) {
                    const l = linha(String(v.LOT_LOTE ?? ''))
                    const lance = Number(v.LOT_LANCE)
                    l.hastapro_parcela = Number.isFinite(lance) ? r2(lance) : null
                    l.leilao_hastapro = (v.LEI_NOME as string) ?? null
                }
                hastapro = { lotes: (hp.vendas ?? []).length }
            }
        } catch (e) {
            hastapro = { error: e instanceof Error ? e.message : String(e) }
        }
    } else {
        hastapro = { error: 'hastapro_nao_configurado' }
    }

    const todas = [...linhas.values()].sort((a, b) => a.lote.localeCompare(b.lote, 'pt-BR', { numeric: true }))
    const soma = (sel: (l: LinhaLote) => number | null) =>
        r2(todas.reduce((s, l) => s + (sel(l) ?? 0), 0))
    const divergencias = todas.filter(l => {
        const vals = [l.grupo_parcela, l.hastapro_parcela, l.fechamento_parcela].filter((v): v is number => v != null)
        return vals.length >= 2 && Math.max(...vals) - Math.min(...vals) > 1
    })

    return {
        data: dataISO,
        obs: 'parcela = valor do lance; VGV = parcela x 30. Nenhuma fonte é verdade absoluta — HastaPró e o próprio sistema podem estar desatualizados; conclua comparando.',
        resumo_fontes: {
            grupo_lances: { lotes: todas.filter(l => l.grupo_parcela != null || l.comprador_grupo).length, soma_parcelas: soma(l => l.grupo_parcela) },
            fechamento: fechamentos.length
                ? { registros: fechamentos.map(f => ({ nome: f.nome, lotes: f.lotes_vendidos, vgv: f.vgv_total })) }
                : { registros: [], aviso: 'nenhum fechamento consolidado nesta data' },
            hastapro,
        },
        lotes: todas.slice(0, 80),
        so_no_grupo: todas.filter(l => l.grupo_parcela != null && l.hastapro_parcela == null).map(l => l.lote),
        so_no_hastapro: todas.filter(l => l.hastapro_parcela != null && l.grupo_parcela == null).map(l => l.lote),
        divergencias_de_valor: divergencias.map(l => ({ lote: l.lote, grupo: l.grupo_parcela, hastapro: l.hastapro_parcela, fechamento: l.fechamento_parcela })),
    }
}
