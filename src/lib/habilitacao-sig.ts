/**
 * Assinatura HMAC que amarra o /api/habilitacao/confirm ao lead que o submit
 * criou/atualizou — sem ela daria pra pendurar documento em lead alheio só
 * chutando UUIDs. Server-only (node:crypto); o contrato isomórfico do form
 * vive em habilitacao-form.ts.
 */

import crypto from 'node:crypto'

export function habilitacaoSig(leadId: string): string {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev'
    return crypto.createHmac('sha256', secret).update(`habilitacao:${leadId}`).digest('hex').slice(0, 40)
}
