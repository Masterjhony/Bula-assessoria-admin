/**
 * ROTEAMENTO DE CLIENTE → ASSESSOR POR ZONA — fonte única.
 *
 * Regra definida pelo chefe (13/07/2026) e confirmada contra a base em 25/07:
 *
 *   Douglas Bispo      → Norte (AC AM AP PA RO RR TO) + MARANHÃO
 *   Fábio Omena Gaia   → Nordeste MENOS MA (AL BA CE PB PE PI RN SE) + Sudeste (ES MG RJ SP)
 *   Leonardo Serafim   → Centro-Oeste (MS MT GO DF) + Sul (PR RS SC)
 *
 * MA é a única exceção: geograficamente é Nordeste, mas vai para o Douglas.
 *
 * Os nomes acima são os CANÔNICOS — é assim que aparecem em `clientes.responsavel`
 * e em `site_settings.crm_config.responsaveis`. Apelidos ("Leozinho", "Fábio Mena",
 * "Fabinho") NUNCA devem ser gravados; use `ASSESSOR_POR_APELIDO` para normalizar
 * o que vier de planilha ou de mensagem de grupo.
 *
 * A UF é resolvida em CASCATA, e a procedência importa: UF declarada no cadastro
 * vale mais que UF inferida do DDD (produtor do Sudeste com chip de MS é comum).
 * Quando as duas discordam, `resolveZona` devolve `conflito: true` — o caso vira
 * conferência humana em vez de alocação silenciosa e errada.
 */

export const ASSESSORES = ['Douglas Bispo', 'Fábio Omena Gaia', 'Leonardo Serafim'] as const
export type Assessor = (typeof ASSESSORES)[number]

/** Apelidos usados no dia a dia → nome canônico. Chave normalizada (minúscula, sem acento). */
export const ASSESSOR_POR_APELIDO: Record<string, Assessor> = {
    'douglas': 'Douglas Bispo',
    'douglas bispo': 'Douglas Bispo',
    'fabio': 'Fábio Omena Gaia',
    'fabio mena': 'Fábio Omena Gaia',
    'fabinho': 'Fábio Omena Gaia',
    'fabinho mena': 'Fábio Omena Gaia',
    'fabio omena': 'Fábio Omena Gaia',
    'fabio omena gaia': 'Fábio Omena Gaia',
    'leo': 'Leonardo Serafim',
    'leozinho': 'Leonardo Serafim',
    'leonardo': 'Leonardo Serafim',
    'leonardo serafim': 'Leonardo Serafim',
}

const UF_DO_ASSESSOR: Record<Assessor, string[]> = {
    'Douglas Bispo':    ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO', 'MA'],
    'Fábio Omena Gaia': ['AL', 'BA', 'CE', 'PB', 'PE', 'PI', 'RN', 'SE', 'ES', 'MG', 'RJ', 'SP'],
    'Leonardo Serafim': ['MS', 'MT', 'GO', 'DF', 'PR', 'RS', 'SC'],
}

/** UF → assessor, derivado da tabela acima (invertido uma vez só). */
export const ASSESSOR_POR_UF: Record<string, Assessor> = Object.fromEntries(
    (Object.entries(UF_DO_ASSESSOR) as [Assessor, string[]][])
        .flatMap(([assessor, ufs]) => ufs.map(uf => [uf, assessor])),
)

const semAcento = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Normaliza um nome/apelido de assessor para o nome canônico, ou null. */
export function assessorCanonico(nome: string | null | undefined): Assessor | null {
    const k = semAcento(String(nome ?? '')).replace(/\s+/g, ' ')
    if (!k) return null
    return ASSESSOR_POR_APELIDO[k] ?? null
}

/** Assessor responsável por uma UF. */
export function assessorPorUf(uf: string | null | undefined): Assessor | null {
    const u = String(uf ?? '').trim().toUpperCase()
    return ASSESSOR_POR_UF[u] ?? null
}

export interface ZonaResolvida {
    assessor: Assessor | null
    uf: string | null
    /** De onde veio a UF usada na decisão. */
    fonte: 'cadastro' | 'fazenda' | 'ddd' | null
    /** UF declarada e UF do DDD divergem — não alocar sem conferir. */
    conflito: boolean
    /** Explicação curta para log/UI. */
    detalhe: string
}

export interface ZonaInput {
    /** UF do cadastro do titular (crm_leads.estado / clientes.uf). */
    ufCadastro?: string | null
    /** UF da fazenda (extra_data.fazenda_uf). */
    ufFazenda?: string | null
    /** UF inferida do DDD do telefone — passe o resultado de `ufFromPhone`. */
    ufDdd?: string | null
}

/**
 * Decide o assessor a partir das UFs disponíveis.
 *
 * Precedência: cadastro → fazenda → DDD. Se a UF declarada (cadastro ou fazenda)
 * existir e apontar para um assessor DIFERENTE do que o DDD apontaria, marca
 * `conflito` — o telefone segue a pessoa, a fazenda não, e alocar pelo chip é
 * como o cliente acaba no assessor errado.
 */
export function resolveZona(input: ZonaInput): ZonaResolvida {
    const norm = (v: string | null | undefined) => {
        const u = String(v ?? '').trim().toUpperCase()
        return ASSESSOR_POR_UF[u] ? u : null
    }
    const cad = norm(input.ufCadastro)
    const faz = norm(input.ufFazenda)
    const ddd = norm(input.ufDdd)

    const declarada = cad ?? faz
    const fonte: ZonaResolvida['fonte'] = cad ? 'cadastro' : faz ? 'fazenda' : ddd ? 'ddd' : null
    const uf = declarada ?? ddd
    const assessor = uf ? ASSESSOR_POR_UF[uf] ?? null : null

    if (!uf) {
        return { assessor: null, uf: null, fonte: null, conflito: false, detalhe: 'sem UF em nenhuma fonte' }
    }
    const conflito = !!(declarada && ddd && ASSESSOR_POR_UF[declarada] !== ASSESSOR_POR_UF[ddd])
    const detalhe = conflito
        ? `UF declarada ${declarada} (${ASSESSOR_POR_UF[declarada]}) diverge do DDD ${ddd} (${ASSESSOR_POR_UF[ddd]}) — conferir`
        : `UF ${uf} por ${fonte}`
    return { assessor, uf, fonte, conflito, detalhe }
}
