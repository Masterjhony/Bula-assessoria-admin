// ─────────────────────────────────────────────────────────────────────────────
// Adaptador Direct Data (apiv3.directd.com.br) — marketplace de dados via API.
//
// Serviços usados (todos GET com `TOKEN` na query, pré-pago por consulta):
//   • /api/EnriquecimentoLead  → telefone/e-mail → CPF + dados cadastrais
//     (é o que permite habilitar o lead SEM pedir CPF na conversa)
//   • /api/Score               → score de crédito QUOD por CPF (score + faixa)
//   • /api/ProtestosOnline     → protestos nacionais IEPTB (sem login GOV.BR)
//   • /api/Sintegra            → Inscrição Estadual por CPF + UF
//
// Envelope de resposta: { metaDados: { resultado, mensagem, ... }, retorno: {...} }.
// Config via env: DIRECTD_TOKEN. Sem token → chamadas viram "pending" (stub),
// mesmo contrato dos demais provedores. Conta é pré-paga: sem saldo, a API
// devolve erro — reportamos como pendente, nunca inventamos dado.
// ─────────────────────────────────────────────────────────────────────────────

const DIRECTD_BASE = 'https://apiv3.directd.com.br/api'

export function isDirectdConfigured(): boolean {
    return Boolean(process.env.DIRECTD_TOKEN)
}

interface DirectdEnvelope<T> {
    metaDados?: {
        resultado?: unknown
        resultadoId?: number
        mensagem?: string | null
        consultaNome?: string | null
    }
    retorno?: T | null
}

async function directdGet<T>(service: string, params: Record<string, string>): Promise<DirectdEnvelope<T>> {
    const token = process.env.DIRECTD_TOKEN || ''
    if (!token) throw new Error('DIRECTD_TOKEN ausente.')
    const url = new URL(`${DIRECTD_BASE}/${service}`)
    for (const [k, v] of Object.entries(params)) {
        if (v) url.searchParams.set(k, v)
    }
    url.searchParams.set('TOKEN', token)
    const res = await fetch(url.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(45_000),
    })
    const json = (await res.json().catch(() => null)) as DirectdEnvelope<T> | null
    if (!json) throw new Error(`Resposta inesperada da Direct Data (HTTP ${res.status}).`)
    if (!res.ok) {
        throw new Error(json.metaDados?.mensagem || `Direct Data HTTP ${res.status}`)
    }
    return json
}

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/* ─── Enriquecimento de lead (telefone/e-mail → CPF + cadastro) ────────── */

export interface LeadEnrichment {
    pending: boolean
    cpf: string | null
    nome: string | null
    email: string | null
    endereco: string | null
    rendaFaixa: string | null
    message?: string
}

interface EnriquecimentoRetorno {
    cpf?: string | null
    nome?: string | null
    emails?: unknown[]
    enderecos?: unknown[]
    rendaFaixaSalarial?: string | null
}

function firstEmail(list: unknown[] | undefined): string | null {
    for (const e of list ?? []) {
        const s = typeof e === 'string' ? e : String((e as Record<string, unknown>)?.email ?? (e as Record<string, unknown>)?.enderecoEmail ?? '')
        if (s.includes('@')) return s.trim()
    }
    return null
}

function firstEndereco(list: unknown[] | undefined): string | null {
    const e = (list ?? [])[0]
    if (!e) return null
    if (typeof e === 'string') return e
    const o = e as Record<string, unknown>
    const parts = [o.logradouro, o.numero, o.bairro, o.cidade || o.municipio, o.uf, o.cep]
        .map(v => String(v ?? '').trim())
        .filter(Boolean)
    return parts.length ? parts.join(', ') : null
}

/**
 * Descobre CPF + dados cadastrais a partir do CELULAR (o dado que todo lead do
 * WhatsApp/formulário já tem). Não possui comprovante; uso interno de cadastro.
 */
export async function enriquecerLeadPorTelefone(celular: string): Promise<LeadEnrichment> {
    const fone = digits(celular)
    // Formato nacional (DDD + número). Remove o DDI 55 se veio junto.
    const nacional = fone.startsWith('55') && fone.length > 11 ? fone.slice(2) : fone
    if (nacional.length < 10) {
        return { pending: true, cpf: null, nome: null, email: null, endereco: null, rendaFaixa: null, message: 'Telefone inválido para enriquecimento.' }
    }
    try {
        const r = await directdGet<EnriquecimentoRetorno>('EnriquecimentoLead', { CELULAR: nacional })
        const ret = r.retorno
        const cpf = digits(ret?.cpf)
        if (!ret || (!cpf && !ret.nome)) {
            return {
                pending: false,
                cpf: null, nome: null, email: null, endereco: null, rendaFaixa: null,
                message: r.metaDados?.mensagem || 'Nenhum dado encontrado para este telefone.',
            }
        }
        return {
            pending: false,
            cpf: cpf.length === 11 ? cpf : null,
            nome: (ret.nome || '').trim() || null,
            email: firstEmail(ret.emails),
            endereco: firstEndereco(ret.enderecos),
            rendaFaixa: (ret.rendaFaixaSalarial || '').trim() || null,
        }
    } catch (e) {
        return {
            pending: true,
            cpf: null, nome: null, email: null, endereco: null, rendaFaixa: null,
            message: `Falha no enriquecimento: ${e instanceof Error ? e.message : 'erro'}`,
        }
    }
}

/* ─── Score de crédito (QUOD) ──────────────────────────────────────────── */

export interface DirectdScore {
    pending: boolean
    score: number | null
    faixa: string | null
    message?: string
}

interface ScoreRetorno {
    pessoaFisica?: { score?: unknown; faixaScore?: unknown } | null
    observacao?: string | null
}

export async function consultarScoreDirectd(cpf: string): Promise<DirectdScore> {
    const doc = digits(cpf)
    if (doc.length !== 11) return { pending: true, score: null, faixa: null, message: 'CPF inválido.' }
    try {
        const r = await directdGet<ScoreRetorno>('Score', { CPF: doc })
        const pf = r.retorno?.pessoaFisica
        const score = Number(pf?.score)
        return {
            pending: false,
            score: Number.isFinite(score) && score > 0 ? Math.round(score) : null,
            faixa: pf?.faixaScore ? String(pf.faixaScore) : null,
        }
    } catch (e) {
        return { pending: true, score: null, faixa: null, message: `Falha no score: ${e instanceof Error ? e.message : 'erro'}` }
    }
}

/* ─── Protestos nacionais (IEPTB Online) ───────────────────────────────── */

export interface DirectdProtesto {
    cartorio?: string
    cidade?: string
    uf?: string
    valor?: number
    data?: string
    titulo?: string
}

export interface DirectdProtestosResult {
    pending: boolean
    constam: boolean
    total: number
    protestos: DirectdProtesto[]
    message?: string
}

interface ProtestosRetorno {
    constamProtestos?: boolean
    numeroTotalProtestos?: number
    protestos?: Array<{
        estado?: string
        cartorios?: Array<Record<string, unknown>>
    }>
}

function parseValor(v: unknown): number | undefined {
    if (v == null) return undefined
    const n = Number(String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : undefined
}

export async function consultarProtestosDirectd(cpf: string): Promise<DirectdProtestosResult> {
    const doc = digits(cpf)
    if (doc.length !== 11) return { pending: true, constam: false, total: 0, protestos: [], message: 'CPF inválido.' }
    try {
        const r = await directdGet<ProtestosRetorno>('ProtestosOnline', { CPF: doc })
        const ret = r.retorno
        const out: DirectdProtesto[] = []
        for (const ufBlock of ret?.protestos ?? []) {
            for (const cart of ufBlock.cartorios ?? []) {
                // Cada cartório pode listar títulos; sem a lista, o cartório em si
                // representa a ocorrência (quantidade/valor agregados).
                const titulos = Array.isArray(cart.protestos) ? (cart.protestos as Record<string, unknown>[]) : [null]
                for (const t of titulos) {
                    out.push({
                        cartorio: cart.nome ? String(cart.nome) : undefined,
                        cidade: (cart.cidade || cart.municipio) ? String(cart.cidade || cart.municipio) : undefined,
                        uf: ufBlock.estado ? String(ufBlock.estado) : undefined,
                        valor: parseValor(t?.valor ?? cart.valorTotal),
                        data: t?.dataProtesto ? String(t.dataProtesto).slice(0, 10) : undefined,
                        titulo: t?.chaveProtesto ? String(t.chaveProtesto) : undefined,
                    })
                }
            }
        }
        return {
            pending: false,
            constam: Boolean(ret?.constamProtestos),
            total: Number(ret?.numeroTotalProtestos) || out.length,
            protestos: out,
        }
    } catch (e) {
        return { pending: true, constam: false, total: 0, protestos: [], message: `Falha nos protestos: ${e instanceof Error ? e.message : 'erro'}` }
    }
}

/* ─── Sintegra (Inscrição Estadual por CPF + UF) ───────────────────────── */

export interface DirectdSintegraResult {
    pending: boolean
    ie: string | null
    situacao: string | null
    uf: string | null
    nome: string | null
    message?: string
}

interface SintegraRetorno {
    ie?: string | null
    ufie?: string | null
    situacaoCadastral?: string | null
    nomeEmpresarial?: string | null
    inscricoesEstaduais?: Array<Record<string, unknown>>
}

export async function consultarSintegraDirectd(cpf: string, uf: string): Promise<DirectdSintegraResult> {
    const doc = digits(cpf)
    if (doc.length !== 11 || !uf) {
        return { pending: true, ie: null, situacao: null, uf: uf || null, nome: null, message: 'CPF/UF inválidos para Sintegra.' }
    }
    try {
        const r = await directdGet<SintegraRetorno>('Sintegra', { CPF: doc, UF: uf })
        const ret = r.retorno
        let ie = (ret?.ie || '').trim()
        let situacao = (ret?.situacaoCadastral || '').trim()
        // Algumas UFs devolvem lista de inscrições — prioriza a ativa.
        if (!ie && Array.isArray(ret?.inscricoesEstaduais)) {
            const list = ret!.inscricoesEstaduais!
            const best = list.find(x => /ativ/i.test(String(x.situacaoCadastral ?? x.situacao ?? ''))) || list[0]
            if (best) {
                ie = String(best.ie ?? best.inscricaoEstadual ?? '').trim()
                situacao = String(best.situacaoCadastral ?? best.situacao ?? '').trim()
            }
        }
        return {
            pending: false,
            ie: ie || null,
            situacao: situacao || null,
            uf: (ret?.ufie || uf || '').trim() || null,
            nome: (ret?.nomeEmpresarial || '').trim() || null,
        }
    } catch (e) {
        return { pending: true, ie: null, situacao: null, uf, nome: null, message: `Falha no Sintegra: ${e instanceof Error ? e.message : 'erro'}` }
    }
}
