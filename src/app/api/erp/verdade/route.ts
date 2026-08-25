/**
 * GET /api/erp/verdade — o painel de confiança.
 *
 * Devolve todas as variáveis do catálogo com carimbo completo (valor, origem,
 * fórmula, composição, cobertura, atualização, conflitos, confiança) mais o
 * resultado de cada validação cruzada.
 *
 * `?id=caixa.saldo` limita a uma variável (ou a um prefixo, `?id=receber.`).
 */

import { admin, guard, ok, type NextRequest } from '@/lib/erp'
import { apurarVerdade } from '@/lib/verdade/motor'

export const maxDuration = 60

export async function GET(req: NextRequest) {
    const g = await guard(req); if (g.error) return g.error
    const sp = req.nextUrl.searchParams
    const rel = await apurarVerdade(admin(), { hoje: sp.get('hoje') || undefined })

    const id = sp.get('id')
    if (id) {
        const variaveis = rel.variaveis.filter(v => v.id === id || v.id.startsWith(id))
        return ok({ ...rel, variaveis })
    }
    return ok(rel)
}
