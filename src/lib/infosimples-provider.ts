// ─────────────────────────────────────────────────────────────────────────────
// Adaptador Infosimples (api.infosimples.com) — consultas públicas via API.
//
// Serviços usados:
//   • ieptb/protestos      → protestos nacionais (CENPROT) por CPF
//   • sintegra/unificada   → Inscrição Estadual (Sintegra) por CPF + UF
//
// Convenção da API: POST https://api.infosimples.com/api/v2/consultas/<serviço>
// com `token` + parâmetros; resposta em envelope { code, code_message, data[] }.
//   code 200 → sucesso (data preenchido)
//   code 612 → consulta ok, mas sem resultados ("nada consta")
//   demais 6xx → erro na fonte/parâmetros (tratamos como pendente, sem inventar)
//
// Config via env: INFOSIMPLES_TOKEN. Sem token, os provedores que dependem
// daqui caem no modo stub (pending) — mesmo contrato dos demais adaptadores.
//
// IMPORTANTE (protestos): a consulta IEPTB pode exigir credenciais GOV.BR
// (login_cpf/login_senha de uma conta em pesquisaprotesto.com.br). Se a fonte
// exigir, o erro volta em code_message e reportamos como pendente — as
// credenciais, se necessárias, devem ser adicionadas pelo dono da conta em
// INFOSIMPLES_GOVBR_CPF / INFOSIMPLES_GOVBR_SENHA (nunca hardcode).
// ─────────────────────────────────────────────────────────────────────────────

const INFOSIMPLES_BASE = 'https://api.infosimples.com/api/v2/consultas'

export function isInfosimplesConfigured(): boolean {
    return Boolean(process.env.INFOSIMPLES_TOKEN)
}

interface InfosimplesEnvelope {
    code: number
    code_message?: string
    data?: unknown[]
    errors?: unknown[]
}

async function infosimplesPost(
    service: string,
    params: Record<string, string>,
): Promise<InfosimplesEnvelope> {
    const token = process.env.INFOSIMPLES_TOKEN || ''
    if (!token) throw new Error('INFOSIMPLES_TOKEN ausente.')

    const body = new URLSearchParams({ token, ...params })
    const res = await fetch(`${INFOSIMPLES_BASE}/${service}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        // Consultas a sites-fonte podem demorar; a Infosimples segura a conexão.
        signal: AbortSignal.timeout(55_000),
    })
    const json = (await res.json().catch(() => null)) as InfosimplesEnvelope | null
    if (!json || typeof json.code !== 'number') {
        throw new Error(`Resposta inesperada da Infosimples (HTTP ${res.status}).`)
    }
    return json
}

/* ─── Protestos (IEPTB / CENPROT) ──────────────────────────────────────── */

export interface InfosimplesProtesto {
    cartorio?: string
    cidade?: string
    uf?: string
    valor?: number
    data?: string // ISO (yyyy-mm-dd) quando parseável
    titulo?: string
}

export interface ProtestosResult {
    pending: boolean
    protestos: InfosimplesProtesto[]
    message?: string
}

/** Converte "dd/mm/aaaa" → "aaaa-mm-dd"; devolve undefined se não parsear. */
function brDateToIso(v: unknown): string | undefined {
    const s = String(v ?? '').trim()
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (!m) return undefined
    return `${m[3]}-${m[2]}-${m[1]}`
}

/**
 * data[0].cartorios = { "UF": [ { nome, cidade, protestos: [{valor, data_protesto, ...}] } ] }
 */
function parseCartorios(data: unknown[]): InfosimplesProtesto[] {
    const out: InfosimplesProtesto[] = []
    for (const item of data) {
        const cartorios = (item as Record<string, unknown>)?.cartorios
        if (!cartorios || typeof cartorios !== 'object') continue
        for (const [uf, list] of Object.entries(cartorios as Record<string, unknown>)) {
            if (!Array.isArray(list)) continue
            for (const cart of list as Record<string, unknown>[]) {
                const protestos = Array.isArray(cart.protestos) ? cart.protestos : []
                for (const p of protestos as Record<string, unknown>[]) {
                    out.push({
                        cartorio: cart.nome ? String(cart.nome) : undefined,
                        cidade: (cart.cidade || cart.municipio) ? String(cart.cidade || cart.municipio) : undefined,
                        uf,
                        valor: p.valor != null ? Number(p.valor) || undefined : undefined,
                        data: brDateToIso(p.data_protesto ?? p.data),
                        titulo: p.nome_cedente ? `Cedente: ${String(p.nome_cedente)}` : undefined,
                    })
                }
            }
        }
    }
    return out
}

export async function consultarProtestosInfosimples(cpf: string): Promise<ProtestosResult> {
    const digits = cpf.replace(/\D/g, '')
    if (digits.length !== 11) {
        return { pending: true, protestos: [], message: 'CPF inválido para consultar protestos.' }
    }
    try {
        const params: Record<string, string> = { cpf: digits }
        // Credenciais GOV.BR opcionais (necessárias se a fonte exigir login).
        if (process.env.INFOSIMPLES_GOVBR_CPF && process.env.INFOSIMPLES_GOVBR_SENHA) {
            params.login_cpf = process.env.INFOSIMPLES_GOVBR_CPF
            params.login_senha = process.env.INFOSIMPLES_GOVBR_SENHA
        }
        const r = await infosimplesPost('ieptb/protestos', params)
        if (r.code === 200) {
            return { pending: false, protestos: parseCartorios(r.data ?? []) }
        }
        if (r.code === 612) {
            // Nada consta — sucesso com zero protestos.
            return { pending: false, protestos: [] }
        }
        return {
            pending: true,
            protestos: [],
            message: `Infosimples ${r.code}: ${r.code_message || 'erro na consulta de protestos'}`,
        }
    } catch (e) {
        return {
            pending: true,
            protestos: [],
            message: `Falha ao consultar protestos: ${e instanceof Error ? e.message : 'erro'}`,
        }
    }
}

/* ─── Sintegra / Inscrição Estadual ────────────────────────────────────── */

export interface SintegraRecord {
    inscricao_estadual?: string
    razao_social?: string
    /** Nome da propriedade rural (ex.: "FAZENDA SANTANA") — o `nome` vem vazio para PF. */
    nome_fantasia?: string
    situacao_ie?: string
    uf_ie?: string
    tipo_ie?: string
    municipio?: string
    situacao_cadastral?: string
    endereco_logradouro?: string
    endereco_numero?: string
    endereco_bairro?: string
    endereco_cep?: string
    atividade_economica?: string
    /** PDF do comprovante emitido pela SEFAZ — serve como comprovante de I.E. */
    site_receipt?: string
}

export interface SintegraResult {
    pending: boolean
    records: SintegraRecord[]
    message?: string
}

function parseSintegra(data: unknown[], uf: string): SintegraRecord[] {
    const out: SintegraRecord[] = []
    for (const item of data) {
        if (!item || typeof item !== 'object') continue
        const row = item as Record<string, unknown>
        const ie = row.normalizado_inscricao_estadual || row.inscricao_estadual
        if (!ie) continue
        const s = (v: unknown) => (v ? String(v).trim() || undefined : undefined)
        out.push({
            inscricao_estadual: String(ie),
            razao_social: s(row.razao_social) ?? s(row.nome),
            // Produtor rural pessoa física costuma vir com `nome` vazio e o nome
            // da propriedade em `nome_fantasia` ("FAZENDA SANTANA").
            nome_fantasia: s(row.nome_fantasia),
            situacao_ie: s(row.situacao_ie),
            situacao_cadastral: s(row.situacao_cadastral),
            uf_ie: s(row.endereco_uf) ?? uf,
            tipo_ie: s(row.tipo_ie),
            municipio: s(row.endereco_municipio) ?? s(row.municipio),
            endereco_logradouro: s(row.endereco_logradouro),
            endereco_numero: s(row.endereco_numero),
            endereco_bairro: s(row.endereco_bairro),
            endereco_cep: s(row.endereco_cep),
            atividade_economica: s(row.atividade_economica),
            site_receipt: s(row.site_receipt),
        })
    }
    return out
}

export async function consultarSintegraInfosimples(cpf: string, uf: string): Promise<SintegraResult> {
    const digits = cpf.replace(/\D/g, '')
    if (digits.length !== 11) {
        return { pending: true, records: [], message: 'CPF inválido para consultar Sintegra.' }
    }
    if (!uf) {
        return { pending: true, records: [], message: 'UF obrigatória na consulta Sintegra.' }
    }
    try {
        const r = await infosimplesPost('sintegra/unificada', { cpf: digits, uf })
        if (r.code === 200) {
            return { pending: false, records: parseSintegra(r.data ?? [], uf) }
        }
        if (r.code === 612) {
            return { pending: false, records: [] } // sem inscrição na UF
        }
        return {
            pending: true,
            records: [],
            message: `Infosimples ${r.code}: ${r.code_message || 'erro na consulta Sintegra'}`,
        }
    } catch (e) {
        return {
            pending: true,
            records: [],
            message: `Falha ao consultar Sintegra: ${e instanceof Error ? e.message : 'erro'}`,
        }
    }
}
