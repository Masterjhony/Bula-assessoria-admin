/**
 * GET /api/erp/fluxo-caixa/detalhe — o que há por trás de uma célula do fluxo.
 *
 * A matriz do Fluxo por Categoria mostra totais; quando o número surpreende, a
 * pergunta seguinte é sempre "isso é o quê?". Sem resposta ali mesmo, cai no
 * ciclo de exportar, filtrar e conferir na mão.
 *
 * Parâmetros: `categoria` (id, ou `sem-entrada`/`sem-saida`), `de`, `ate`.
 * Devolve REALIZADO (movimentos bancários) e PREVISTO (títulos em aberto pelo
 * vencimento), com a mesma regra da matriz: título vencido e não pago conta na
 * coluna de hoje, então ele aparece quando a janela pedida inclui hoje.
 */

import { admin, fail, guard, ok, type NextRequest } from '@/lib/erp'

export async function GET(req: NextRequest) {
    const g = await guard(req); if (g.error) return g.error
    const sp = req.nextUrl.searchParams
    const categoria = (sp.get('categoria') || '').trim()
    const de = (sp.get('de') || '').trim()
    const ate = (sp.get('ate') || '').trim()
    if (!categoria || !de || !ate) return fail('categoria, de e ate sao obrigatorios')

    const sb = admin()
    const hoje = new Date().toISOString().slice(0, 10)
    // A matriz joga o vencido para a coluna de hoje; o detalhe faz igual, senão
    // o total da célula não bate com a lista que a explica.
    const semCategoria = categoria.startsWith('sem-')
    const tipoSem = categoria === 'sem-entrada' ? 'entrada' : 'saida'

    const filtroCat = <T extends { eq: (c: string, v: string) => T; is: (c: string, v: null) => T }>(q: T) =>
        semCategoria ? q.is('categoria_id', null) : q.eq('categoria_id', categoria)

    // ── realizado ──────────────────────────────────────────────────────────
    let qMov = sb.from('erp_movimentos_bancarios')
        .select('id, data, tipo, valor, descricao, conta_pagar_id, conta_receber_id')
        .gte('data', de).lte('data', ate)
    qMov = filtroCat(qMov as never) as typeof qMov
    if (semCategoria) qMov = qMov.eq('tipo', tipoSem)
    const { data: movs, error: eMov } = await qMov.order('data')
    if (eMov) return fail(eMov.message, 500)

    // ── previsto ───────────────────────────────────────────────────────────
    const COLS = 'id, descricao, valor, desconto, juros, multa, vencimento, status, origem, tags'
    const previstos: Record<string, unknown>[] = []
    for (const [tabela, chaveBaixa, natureza] of [
        ['erp_contas_pagar', 'valor_pago', 'saida'],
        ['erp_contas_receber', 'valor_recebido', 'entrada'],
    ] as const) {
        if (semCategoria && tipoSem !== natureza) continue
        let q = sb.from(tabela).select(`${COLS}, ${chaveBaixa}`)
            .in('status', ['aberto', 'parcial', 'vencido']).lte('vencimento', ate)
        q = filtroCat(q as never) as typeof q
        const { data, error } = await q
        if (error) return fail(error.message, 500)
        for (const r of data ?? []) {
            const rec = r as Record<string, number | string | null>
            const devido = Number(rec.valor || 0) - Number(rec.desconto || 0)
                + Number(rec.juros || 0) + Number(rec.multa || 0) - Number(rec[chaveBaixa] || 0)
            if (devido <= 0) continue
            const venc = String(rec.vencimento)
            // A MESMA regra da matriz: o título cai no bucket de max(vencimento,
            // hoje) — vencido e não pago é caixa de hoje, não da semana em que
            // venceu. Sem espelhar isso o detalhe soma diferente da célula que
            // ele deveria explicar, e aí ninguém confia em nenhum dos dois.
            const bucket = venc < hoje ? hoje : venc
            if (bucket < de || bucket > ate) continue
            previstos.push({
                id: rec.id, descricao: rec.descricao, vencimento: venc, valor: Number(devido.toFixed(2)),
                natureza, status: rec.status, origem: rec.origem, tags: rec.tags,
                vencido: venc < hoje,
            })
        }
    }
    previstos.sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))

    const somaMov = (movs ?? []).reduce((s, m) => s + Number(m.valor || 0), 0)
    const somaPrev = previstos.reduce((s, p) => s + Number(p.valor || 0), 0)

    return ok({
        categoria, de, ate,
        realizado: { itens: movs ?? [], total: Number(somaMov.toFixed(2)) },
        previsto: { itens: previstos, total: Number(somaPrev.toFixed(2)) },
        total: Number((somaMov + somaPrev).toFixed(2)),
    })
}
