/**
 * Reconstrói o FECHAMENTO de um leilão a partir das vendas capturadas do grupo
 * de lances (bula_leilao_vendas) — mesmo formato dos fechamentos manuais
 * (scripts/add-fechamento-*.mjs): VGV = parcela × 30 POR LOTE (convenção
 * confirmada pelo cliente), comissão pisteiro 2%, agregados por assessor /
 * comprador / estado.
 *
 * Regras de segurança:
 * - Só entra no fechamento venda COM valor; as sem valor viram nota em
 *   observacoes (o time retifica depois).
 * - Fechamento criado aqui recebe origem='lances-auto' e é o ÚNICO tipo que
 *   esta rotina atualiza. Se já existir fechamento manual (origem null) na
 *   mesma data, NÃO tocamos nele — as vendas ficam só em bula_leilao_vendas.
 * - Idempotente: rodar de novo com os mesmos dados converge pro mesmo estado.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { comissaoPctAssessor } from './assessor-comissao'

const PARCELAS = 30
const EMPRESA = 'Bula Assessoria'

const r2 = (n: number) => Math.round(n * 100) / 100

type Venda = {
    lote: string
    valor: number | null
    comprador: string | null
    assessor: string | null
    fazenda: string | null
    cidade: string | null
    uf: string | null
    animais: number | null
}

export async function rebuildFechamentoFromLances(
    sb: SupabaseClient,
    cronogramaId: string,
): Promise<Record<string, unknown>> {
    const { data: cron } = await sb.from('cronograma_leiloes')
        .select('id, nome, data, leiloeira').eq('id', cronogramaId).maybeSingle()
    if (!cron) return { skipped: 'cronograma_nao_encontrado' }

    const { data: vendasRaw } = await sb.from('bula_leilao_vendas')
        .select('lote, valor, comprador, assessor, fazenda, cidade, uf, animais')
        .eq('cronograma_id', cronogramaId).order('created_at')
    const vendas = (vendasRaw ?? []) as Venda[]
    const comValor = vendas.filter((v) => v.valor != null)
    if (!comValor.length) return { skipped: 'sem_vendas_com_valor' }

    // Fechamento manual na mesma data → não tocar (as vendas ficam na tabela).
    const { data: existentes } = await sb.from('bula_leilao_fechamento')
        .select('id, nome, origem').eq('data', cron.data)
    const manual = (existentes ?? []).find((f) => f.origem !== 'lances-auto')
    if (manual) return { skipped: 'fechamento_manual_existente', fechamento_id: manual.id }
    const auto = (existentes ?? []).find((f) => f.origem === 'lances-auto')

    const L = comValor.map((v) => ({
        ...v,
        animais: v.animais && v.animais > 0 ? v.animais : 1,
        assessor: v.assessor || 'A definir',
        vgv: r2((v.valor as number) * PARCELAS),
    }))
    const vgv_total = r2(L.reduce((s, l) => s + l.vgv, 0))
    const total_animais = L.reduce((s, l) => s + l.animais, 0)

    const byA = new Map<string, { nome: string; transacoes: number; animais: number; vgv: number }>()
    for (const l of L) {
        const cur = byA.get(l.assessor) || { nome: l.assessor, transacoes: 0, animais: 0, vgv: 0 }
        cur.transacoes += 1; cur.animais += l.animais; cur.vgv += l.vgv
        byA.set(l.assessor, cur)
    }
    const por_assessor = [...byA.values()].sort((a, b) => b.vgv - a.vgv).map((a, i) => {
        const pct = comissaoPctAssessor(a.nome)
        return {
            posicao: i + 1, nome: a.nome, empresa: EMPRESA, transacoes: a.transacoes, animais: a.animais,
            vgv: r2(a.vgv), ticket_medio: Math.round(a.vgv / a.animais), pct_total: r2(a.vgv / vgv_total * 100) / 100,
            comissao_pct: pct, comissao: r2(a.vgv * pct),
        }
    })
    const comissao_assessoria = r2(por_assessor.reduce((s, a) => s + a.comissao, 0))

    const compradorLabel = (v: Venda) =>
        [v.comprador, v.fazenda, v.cidade ? `${v.cidade}/${v.uf ?? ''}`.replace(/\/$/, '') : v.uf]
            .filter(Boolean).join(' · ') || 'A identificar'

    const byC = new Map<string, { comprador: string; fazenda: string | null; cidade: string | null; uf: string | null; lotes: number; animais: number; vgv: number }>()
    for (const l of L) {
        const k = `${l.comprador || 'A identificar'}|${l.uf || ''}`
        const cur = byC.get(k) || { comprador: l.comprador || 'A identificar', fazenda: l.fazenda, cidade: l.cidade, uf: l.uf, lotes: 0, animais: 0, vgv: 0 }
        cur.lotes += 1; cur.animais += l.animais; cur.vgv += l.vgv
        byC.set(k, cur)
    }
    const compradores = [...byC.values()].sort((a, b) => b.vgv - a.vgv).map((c, i) => ({ rank: i + 1, ...c, vgv: r2(c.vgv) }))

    const byE = new Map<string, { uf: string; lotes: number; animais: number; vgv: number }>()
    for (const l of L) {
        if (!l.uf) continue
        const cur = byE.get(l.uf) || { uf: l.uf, lotes: 0, animais: 0, vgv: 0 }
        cur.lotes += 1; cur.animais += l.animais; cur.vgv += l.vgv
        byE.set(l.uf, cur)
    }
    const por_estado = [...byE.values()].sort((a, b) => b.vgv - a.vgv).map((e) => ({
        ...e, estado: e.uf, vgv: r2(e.vgv), ticket_medio: Math.round(e.vgv / e.animais), pct_total: r2(e.vgv / vgv_total * 100) / 100,
    }))

    const lances = L.map((l) => ({
        lote: l.lote, animais: l.animais, vgv: l.vgv, parcela: l.valor, parcelas: PARCELAS,
        assessor: l.assessor, empresa: EMPRESA, vendedor: cron.leiloeira || null, comprador: compradorLabel(l),
    }))

    const semValor = vendas.filter((v) => v.valor == null)
    const observacoes = [
        `Fechamento AUTOMÁTICO gerado das vendas capturadas no grupo "Lances Bula Assessoria" (WhatsApp) — retificável.`,
        `Cobertura Bula: ${L.length} lotes / ${total_animais} animais / VGV = parcela × ${PARCELAS} por lote. Comissão por assessor conforme tabela fixa 22/07 (padrão 2%; Rusa 5%; Lucas/Matheus Alves 0,33%).`,
        semValor.length ? `PENDENTE de valor (fora dos números): lote(s) ${semValor.map((v) => v.lote).join(', ')}.` : null,
        `Parte financeira (acordo/receita Bula/imposto) é passo manual no ERP.`,
    ].filter(Boolean).join('\n')

    const payload = {
        nome: cron.nome as string,
        data: cron.data as string,
        local: (cron.leiloeira as string) || '',
        lotes_ofertados: L.length, lotes_vendidos: L.length, animais_vendidos: total_animais,
        vgv_total, ticket_medio: Math.round(vgv_total / total_animais), maior_lance: Math.max(...L.map((l) => l.vgv)),
        compradores_unicos: compradores.length, estados_alcancados: por_estado.length,
        por_assessor, por_estado, compradores, lances,
        distribuicao_empresa: [{ empresa: EMPRESA, transacoes: L.length, animais: total_animais, vgv: vgv_total, pct_total: 1, ticket_medio: Math.round(vgv_total / total_animais) }],
        comissao_assessoria,
        observacoes,
        origem: 'lances-auto',
        updated_at: new Date().toISOString(),
    }

    if (auto) {
        const { error } = await sb.from('bula_leilao_fechamento').update(payload).eq('id', auto.id)
        return error ? { error: error.message } : { updated: auto.id, lotes: L.length, vgv_total }
    }
    const { data: ins, error } = await sb.from('bula_leilao_fechamento').insert(payload).select('id').single()
    return error ? { error: error.message } : { created: ins?.id, lotes: L.length, vgv_total }
}
