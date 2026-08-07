/**
 * POST /api/erp/movimentos/importar — importa um extrato bancário (OFX ou
 * CSV/texto) para dentro de erp_movimentos_bancarios.
 *
 * Regras de projeto:
 * - Entra como PENDENTE. Classificar (categoria/pessoa) e conciliar contra
 *   título continua sendo passo humano, na Fila de Conciliação.
 * - Deduplicação no banco, por `import_key` (índice único parcial, migration
 *   0069): reimportar o mesmo arquivo, ou um período que se sobrepõe ao
 *   anterior, não duplica nada.
 * - O saldo NÃO é escrito aqui — `trg_mov_saldo` deriva o saldo da conta a
 *   cada insert. O que a rota faz é CONFERIR: compara o saldo final informado
 *   pelo extrato com o saldo que a conta ficou tendo, e devolve a diferença.
 *   Era isso que os scripts-por-período faziam à mão ("validacao por saldo").
 *
 * `dry_run: true` parseia e confere sem gravar — é o que a tela usa na prévia.
 */

import { admin, auditLog, fail, guard, ok, type NextRequest } from '@/lib/erp'
import { parseExtrato } from '@/lib/extrato-import'

export const maxDuration = 60

export async function POST(req: NextRequest) {
    const g = await guard(req); if (g.error) return g.error

    const body = await req.json().catch(() => ({})) as {
        conta_bancaria_id?: string
        conteudo?: string
        dry_run?: boolean
    }
    const contaId = (body.conta_bancaria_id || '').trim()
    const conteudo = body.conteudo || ''
    if (!contaId) return fail('conta_bancaria_id obrigatorio')
    if (!conteudo.trim()) return fail('conteudo do extrato vazio')

    const sb = admin()
    const { data: conta, error: erroConta } = await sb
        .from('erp_contas_bancarias')
        .select('id, nome, saldo_atual')
        .eq('id', contaId)
        .single()
    if (erroConta || !conta) return fail('conta bancaria nao encontrada', 404)

    const extrato = parseExtrato(conteudo)
    if (!extrato.linhas.length) {
        return fail(`nenhum lancamento reconhecido no extrato (${extrato.ignoradas.length} linha(s) ignorada(s))`)
    }

    const periodo = {
        de: extrato.linhas[0].data,
        ate: extrato.linhas[extrato.linhas.length - 1].data,
    }

    // Quais dessas chaves a conta já tem? (só as do lote, não a tabela toda)
    const chaves = extrato.linhas.map(l => l.import_key)
    const jaExistentes = new Set<string>()
    for (let i = 0; i < chaves.length; i += 500) {
        const { data } = await sb
            .from('erp_movimentos_bancarios')
            .select('import_key')
            .eq('conta_bancaria_id', contaId)
            .in('import_key', chaves.slice(i, i + 500))
        for (const r of data || []) if (r.import_key) jaExistentes.add(r.import_key)
    }

    const novas = extrato.linhas.filter(l => !jaExistentes.has(l.import_key))
    const duplicadas = extrato.linhas.length - novas.length

    const resumo = {
        conta: conta.nome,
        formato: extrato.formato,
        periodo,
        lidos: extrato.linhas.length,
        novos: novas.length,
        duplicados: duplicadas,
        entradas: novas.filter(l => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0),
        saidas: novas.filter(l => l.tipo === 'saida').reduce((s, l) => s + l.valor, 0),
        ignoradas: extrato.ignoradas.slice(0, 20),
        ignoradas_total: extrato.ignoradas.length,
        amostra: novas.slice(0, 10),
    }

    if (body.dry_run) {
        const saldoPrevisto = Number(conta.saldo_atual || 0)
            + novas.reduce((s, l) => s + (l.tipo === 'entrada' ? l.valor : -l.valor), 0)
        return ok({
            ...resumo,
            gravado: false,
            saldo_extrato: extrato.saldo_final,
            saldo_previsto: Number(saldoPrevisto.toFixed(2)),
            diferenca: extrato.saldo_final === null ? null
                : Number((saldoPrevisto - extrato.saldo_final).toFixed(2)),
        })
    }

    if (!novas.length) {
        return ok({ ...resumo, gravado: true, saldo_extrato: extrato.saldo_final, saldo_apos: Number(conta.saldo_atual || 0), diferenca: null })
    }

    // Sem upsert: o índice único é parcial e o objetivo aqui é justamente NÃO
    // tocar no que já existe (um movimento já classificado não pode ser
    // sobrescrito por uma reimportação do extrato).
    const payload = novas.map(l => ({
        conta_bancaria_id: contaId,
        data: l.data,
        tipo: l.tipo,
        descricao: l.descricao,
        valor: l.valor,
        documento: l.documento,
        origem: `importacao_${extrato.formato}`,
        status_conciliacao: 'pendente',
        conciliado: false,
        import_key: l.import_key,
    }))

    const gravadas: string[] = []
    for (let i = 0; i < payload.length; i += 200) {
        const { data, error } = await sb
            .from('erp_movimentos_bancarios')
            .insert(payload.slice(i, i + 200))
            .select('id')
        if (error) {
            return fail(`falha ao gravar (${gravadas.length} de ${payload.length} ja gravados): ${error.message}`, 500)
        }
        for (const r of data || []) gravadas.push(r.id)
    }

    // Confere contra o saldo que o extrato afirma — o trigger já recalculou.
    const { data: contaDepois } = await sb
        .from('erp_contas_bancarias')
        .select('saldo_atual')
        .eq('id', contaId)
        .single()
    const saldoApos = Number(contaDepois?.saldo_atual ?? 0)
    const diferenca = extrato.saldo_final === null ? null
        : Number((saldoApos - extrato.saldo_final).toFixed(2))

    await auditLog('erp_movimentos_bancarios', 'importar_extrato', {
        conta_bancaria_id: contaId,
        formato: extrato.formato,
        periodo,
        novos: gravadas.length,
        duplicados: duplicadas,
        saldo_extrato: extrato.saldo_final,
        saldo_apos: saldoApos,
        diferenca,
    }, g.user ?? undefined)

    return ok({
        ...resumo,
        gravado: true,
        novos: gravadas.length,
        saldo_extrato: extrato.saldo_final,
        saldo_apos: saldoApos,
        diferenca,
    })
}
