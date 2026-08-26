/**
 * Núcleo do importador de extrato: dedup + gravação em
 * `erp_movimentos_bancarios`.
 *
 * Existe separado da rota HTTP porque a mesma operação precisa rodar em dois
 * lugares — a tela (ERP › Conciliação › Importar) e a linha de comando
 * (`scripts/importa-extrato.mts`, para o PDF do Sicoob convertido em CSV).
 * Manter uma cópia de cada lado é o caminho de volta para os scripts-por-período
 * que a migration 0069 veio aposentar.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseExtrato, type LinhaExtrato } from './extrato-import'

export interface ResultadoImportacao {
    conta: string
    formato: string
    periodo: { de: string; ate: string }
    lidos: number
    novos: number
    duplicados: number
    entradas: number
    saidas: number
    ignoradas: Array<{ linha: string; motivo: string }>
    ignoradas_total: number
    amostra: LinhaExtrato[]
    gravado: boolean
    saldo_extrato: number | null
    saldo_apos: number
    diferenca: number | null
    ids: string[]
}

export class ExtratoImportError extends Error {
    constructor(message: string, readonly httpStatus = 400) { super(message) }
}

type Sb = SupabaseClient<any, any, any>

export async function aplicaExtrato(opts: {
    sb: Sb
    contaId: string
    conteudo: string
    dryRun?: boolean
}): Promise<ResultadoImportacao> {
    const { sb, contaId, conteudo, dryRun = false } = opts
    if (!contaId) throw new ExtratoImportError('conta_bancaria_id obrigatorio')
    if (!conteudo.trim()) throw new ExtratoImportError('conteudo do extrato vazio')

    const { data: conta, error: erroConta } = await sb
        .from('erp_contas_bancarias')
        .select('id, nome, saldo_atual')
        .eq('id', contaId)
        .single()
    if (erroConta || !conta) throw new ExtratoImportError('conta bancaria nao encontrada', 404)

    const extrato = parseExtrato(conteudo)
    if (!extrato.linhas.length) {
        throw new ExtratoImportError(
            `nenhum lancamento reconhecido no extrato (${extrato.ignoradas.length} linha(s) ignorada(s))`)
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

    // Segunda linha de defesa, por CONTEÚDO. A `import_key` só protege contra
    // reimportar o mesmo arquivo: movimento que entrou antes da migration 0069,
    // que veio de outro formato (o mesmo dia exportado em OFX e em CSV rende
    // chaves diferentes) ou cujo histórico foi reescrito na conciliação passaria
    // batido e duplicaria. Aqui compara-se (data, tipo, valor) por CONTAGEM, não
    // por existência — dois PIX idênticos no mesmo dia continuam sendo dois.
    const balde = (data: string, tipo: string, valor: number) =>
        `${data}|${tipo}|${Math.round(valor * 100)}`
    const saldoExistente = new Map<string, number>()
    for (let pagina = 0; ; pagina++) {
        const { data } = await sb
            .from('erp_movimentos_bancarios')
            .select('data, tipo, valor')
            .eq('conta_bancaria_id', contaId)
            .gte('data', periodo.de)
            .lte('data', periodo.ate)
            .range(pagina * 1000, pagina * 1000 + 999)
        for (const r of data || []) {
            const k = balde(r.data, r.tipo, Number(r.valor))
            saldoExistente.set(k, (saldoExistente.get(k) ?? 0) + 1)
        }
        if (!data || data.length < 1000) break
    }

    const novas = extrato.linhas.filter(l => {
        const k = balde(l.data, l.tipo, l.valor)
        const restam = saldoExistente.get(k) ?? 0
        if (jaExistentes.has(l.import_key) || restam > 0) {
            if (restam > 0) saldoExistente.set(k, restam - 1)
            return false
        }
        return true
    })
    const duplicadas = extrato.linhas.length - novas.length

    const resumo = {
        conta: conta.nome as string,
        formato: extrato.formato as string,
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

    if (dryRun) {
        const saldoPrevisto = Number(conta.saldo_atual || 0)
            + novas.reduce((s, l) => s + (l.tipo === 'entrada' ? l.valor : -l.valor), 0)
        return {
            ...resumo,
            gravado: false,
            saldo_extrato: extrato.saldo_final,
            saldo_apos: Number(saldoPrevisto.toFixed(2)),
            diferenca: extrato.saldo_final === null ? null
                : Number((saldoPrevisto - extrato.saldo_final).toFixed(2)),
            ids: [],
        }
    }

    if (!novas.length) {
        const saldo = Number(conta.saldo_atual || 0)
        return {
            ...resumo,
            gravado: true,
            saldo_extrato: extrato.saldo_final,
            saldo_apos: saldo,
            diferenca: extrato.saldo_final === null ? null
                : Number((saldo - extrato.saldo_final).toFixed(2)),
            ids: [],
        }
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
            throw new ExtratoImportError(
                `falha ao gravar (${gravadas.length} de ${payload.length} ja gravados): ${error.message}`, 500)
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

    return {
        ...resumo,
        gravado: true,
        novos: gravadas.length,
        saldo_extrato: extrato.saldo_final,
        saldo_apos: saldoApos,
        diferenca: extrato.saldo_final === null ? null
            : Number((saldoApos - extrato.saldo_final).toFixed(2)),
        ids: gravadas,
    }
}
