/**
 * CHAVES DOS MÓDULOS DO ATENDIMENTO — o que está ligado agora.
 *
 * O sistema nasceu fazendo três coisas ao mesmo tempo: conduzir a conversa até
 * o cadastro, submeter a ficha nos grupos das leiloeiras, e reportar tudo em
 * grupo. Decisão do dono (28/07/2026): por enquanto vale UMA — quem responder é
 * passado ao assessor da região, e ponto.
 *
 * As outras duas ficam DESLIGADAS por configuração, não apagadas. O código está
 * testado e a operação vai querer de volta; apagar seria jogar fora trabalho que
 * volta em duas semanas. Religar é trocar `false` por `true` em site_settings.
 *
 * Lê de `site_settings.crm_atendimento_modulos`. Ausente = tudo ligado, para não
 * mudar comportamento de quem nunca configurou.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const MODULOS_SETTINGS_KEY = 'crm_atendimento_modulos'

export interface ModulosAtendimento {
    /** Postar a ficha de cadastro nos grupos das leiloeiras. */
    submissao_leiloeiras: boolean
    /** Avisos automáticos nos grupos internos (automações e assessores). */
    report_grupos: boolean
    /**
     * O bot RESPONDER dentro do grupo da leiloeira (confirmação de decisão,
     * pedido de código). Decisão do dono (31/07/2026): DESLIGADO — o grupo da
     * leiloeira é conversa com parceiro, e o robô ficava pedindo "responda
     * citando a ficha" toda vez que alguém escrevia "reprovado" sem match.
     *
     * Único módulo cujo padrão é `false`: ausência de configuração aqui
     * significa silêncio, não permissão. Nada do processamento muda — a decisão
     * continua sendo lida, gravada e repassada ao cliente/equipe; o que para é
     * a fala no grupo do parceiro.
     */
    resposta_grupo_leiloeira: boolean
}

const PADRAO: ModulosAtendimento = {
    submissao_leiloeiras: true,
    report_grupos: true,
    resposta_grupo_leiloeira: false,
}

let cache: { at: number; v: ModulosAtendimento } | null = null
const CACHE_MS = 30_000

export async function loadModulos(supabase: SupabaseClient): Promise<ModulosAtendimento> {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.v
    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', MODULOS_SETTINGS_KEY)
        .maybeSingle()
    const v = (data?.value ?? {}) as Partial<ModulosAtendimento>
    const out: ModulosAtendimento = {
        submissao_leiloeiras: v.submissao_leiloeiras !== false,
        report_grupos: v.report_grupos !== false,
        // `=== true` (e não `!== false`): este nasce desligado e só fala se
        // alguém ligar de propósito.
        resposta_grupo_leiloeira: v.resposta_grupo_leiloeira === true,
    }
    cache = { at: Date.now(), v: out }
    return out
}

export function invalidarCacheModulos(): void {
    cache = null
}

export { PADRAO as MODULOS_PADRAO }
