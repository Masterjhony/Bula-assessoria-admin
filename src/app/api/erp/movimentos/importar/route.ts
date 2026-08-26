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
 *
 * O miolo (dedup + gravação) vive em `@/lib/extrato-aplicar`, compartilhado com
 * o CLI `scripts/importa-extrato.mts`.
 */

import { admin, auditLog, fail, guard, ok, type NextRequest } from '@/lib/erp'
import { aplicaExtrato, ExtratoImportError } from '@/lib/extrato-aplicar'

export const maxDuration = 60

export async function POST(req: NextRequest) {
    const g = await guard(req); if (g.error) return g.error

    const body = await req.json().catch(() => ({})) as {
        conta_bancaria_id?: string
        conteudo?: string
        dry_run?: boolean
    }

    let r
    try {
        r = await aplicaExtrato({
            sb: admin(),
            contaId: (body.conta_bancaria_id || '').trim(),
            conteudo: body.conteudo || '',
            dryRun: !!body.dry_run,
        })
    } catch (e) {
        if (e instanceof ExtratoImportError) return fail(e.message, e.httpStatus)
        throw e
    }

    const { ids, ...resposta } = r
    if (r.gravado) {
        await auditLog('erp_movimentos_bancarios', 'importar_extrato', {
            conta_bancaria_id: (body.conta_bancaria_id || '').trim(),
            formato: r.formato,
            periodo: r.periodo,
            novos: ids.length,
            duplicados: r.duplicados,
            saldo_extrato: r.saldo_extrato,
            saldo_apos: r.saldo_apos,
            diferenca: r.diferenca,
        }, g.user ?? undefined)
    }

    return ok(resposta)
}
