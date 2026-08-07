/**
 * Config do agente interno "Bula" — o número da sessão Baileys operacional que
 * responde a EQUIPE (nunca cliente) com acesso aos dados do sistema.
 *
 * Guardado em `site_settings.whatsapp_agente`. O load remonta o objeto campo a
 * campo (mesmo padrão do concierge): campo novo TEM que entrar no interface, no
 * DEFAULT, no load E no save, senão é apagado em silêncio no próximo save.
 *
 * A allowlist (`numeros`) é a fronteira de segurança: quem está nela conversa
 * com o agente; qualquer outro número segue o pipeline normal do CRM (vira
 * lead, como hoje). O papel `finance` libera as ferramentas de ERP/financeiro
 * (mesma política do FINANCE_ADMIN_EMAILS no app).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { invalidarCacheGrupos } from './whatsapp-grupos-relevantes'

export const AGENTE_SETTINGS_KEY = 'whatsapp_agente'

/**
 * admin    = uso irrestrito (João e Marcelo): todos os dados, incluindo ERP,
 *            fechamentos, comissões e leads de qualquer assessor.
 * assessor = restrito NO CÓDIGO (não só no prompt): só os próprios leads
 *            (filtro forçado por `assessor`), sem ERP, sem fechamentos, sem
 *            faturamento/comissão/salário, sem conversas de terceiros.
 */
export type AgenteRole = 'admin' | 'assessor'

export interface AgenteNumero {
    phone: string
    nome: string
    role: AgenteRole
    /** Nome como aparece em crm_leads.responsavel (ex.: 'Douglas') — obrigatório pra assessor ver leads. */
    assessor?: string | null
}

export interface AgenteConfig {
    enabled: boolean
    /** Sessão Baileys cujas mensagens 1:1 da equipe vão pro agente. */
    session: string
    numeros: AgenteNumero[]
    /** Grupos internos onde o agente pode ser chamado (menção ao numeroBot). */
    groupJids: string[]
    /** Legado (um grupo só) — migrado pra groupJids no load. */
    groupJid: string | null
    /** Número do WhatsApp operacional — em grupo, o agente SÓ responde quando mencionado (@numero). */
    numeroBot: string
    /** LID do contato operacional (@lid, endereçamento novo do WhatsApp) — a menção pode chegar como @<lid> em vez de @<numero>. */
    lidBot: string
    /** Prefixo legado de invocação (não usado — menção substituiu). */
    trigger: string
    model: string
    maxHistory: number
    /** Debounce de rajada em segundos (só 1:1). */
    thinkingSeconds: number
}

export const DEFAULT_AGENTE_CONFIG: AgenteConfig = {
    enabled: false,
    session: 'operacional',
    numeros: [],
    groupJids: [],
    groupJid: null,
    numeroBot: '',
    lidBot: '',
    trigger: '@bula',
    model: 'anthropic/claude-sonnet-5',
    maxHistory: 30,
    thinkingSeconds: 4,
}

/** Mesma canonização do resto do projeto: DDD + 8 últimos dígitos. */
export function telefoneCanonico(p: string | null | undefined): string {
    let d = String(p ?? '').replace(/\D/g, '')
    if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
    return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : d
}

function normalizeNumeros(raw: unknown): AgenteNumero[] {
    if (!Array.isArray(raw)) return []
    const out: AgenteNumero[] = []
    for (const item of raw) {
        const o = (item ?? {}) as Record<string, unknown>
        const phone = String(o.phone ?? '').trim()
        if (!phone) continue
        // 'finance' é aceito como sinônimo legado de 'admin'.
        const role: AgenteRole = (o.role === 'admin' || o.role === 'finance') ? 'admin' : 'assessor'
        out.push({
            phone,
            nome: String(o.nome ?? '').trim() || 'membro',
            role,
            assessor: String(o.assessor ?? '').trim() || null,
        })
    }
    return out
}

function clampInt(v: unknown, def: number, min: number, max: number): number {
    const n = Number(v)
    if (!Number.isFinite(n)) return def
    return Math.min(max, Math.max(min, Math.round(n)))
}

export async function loadAgenteConfig(supabase: SupabaseClient): Promise<AgenteConfig> {
    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', AGENTE_SETTINGS_KEY)
        .maybeSingle()
    const v = (data?.value ?? {}) as Record<string, unknown>
    const d = DEFAULT_AGENTE_CONFIG
    const legadoGroupJid = String(v.groupJid ?? '').trim() || null
    const groupJids = [...new Set([
        ...(Array.isArray(v.groupJids) ? v.groupJids.map(j => String(j ?? '').trim()).filter(Boolean) : []),
        ...(legadoGroupJid ? [legadoGroupJid] : []),
    ])]
    return {
        enabled: v.enabled === true,
        session: String(v.session ?? '').trim() || d.session,
        numeros: normalizeNumeros(v.numeros),
        groupJids,
        groupJid: legadoGroupJid,
        numeroBot: String(v.numeroBot ?? '').trim(),
        lidBot: String(v.lidBot ?? '').replace(/\D/g, ''),
        trigger: String(v.trigger ?? '').trim() || d.trigger,
        model: String(v.model ?? '').trim() || d.model,
        maxHistory: clampInt(v.maxHistory, d.maxHistory, 6, 100),
        thinkingSeconds: clampInt(v.thinkingSeconds, d.thinkingSeconds, 0, 18),
    }
}

export async function saveAgenteConfig(
    supabase: SupabaseClient,
    patch: Partial<AgenteConfig>,
): Promise<AgenteConfig> {
    const current = await loadAgenteConfig(supabase)
    const merged: AgenteConfig = {
        enabled: patch.enabled ?? current.enabled,
        session: patch.session ?? current.session,
        numeros: patch.numeros ?? current.numeros,
        groupJids: patch.groupJids ?? current.groupJids,
        groupJid: patch.groupJid !== undefined ? patch.groupJid : current.groupJid,
        numeroBot: patch.numeroBot ?? current.numeroBot,
        lidBot: patch.lidBot ?? current.lidBot,
        trigger: patch.trigger ?? current.trigger,
        model: patch.model ?? current.model,
        maxHistory: patch.maxHistory ?? current.maxHistory,
        thinkingSeconds: patch.thinkingSeconds ?? current.thinkingSeconds,
    }
    await supabase.from('site_settings').upsert(
        { key: AGENTE_SETTINGS_KEY, value: merged, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
    )
    invalidarCacheGrupos() // groupJid alimenta a porteira de grupos
    return merged
}

/**
 * O texto menciona o bot? Marcar um contato injeta "@<id>" no corpo — e o id
 * pode ser o NÚMERO ("@553184143874", comparado por telefone canônico) ou o
 * LID do endereçamento novo do WhatsApp ("@241876099711227"), que não tem
 * relação com o número. Por isso a config guarda os dois.
 */
function ehMencaoAoBot(digits: string, cfg: Pick<AgenteConfig, 'numeroBot' | 'lidBot'>): boolean {
    if (cfg.lidBot && digits === cfg.lidBot) return true
    const alvo = telefoneCanonico(cfg.numeroBot)
    return !!alvo && telefoneCanonico(digits) === alvo
}

export function mencionaBot(texto: string, cfg: Pick<AgenteConfig, 'numeroBot' | 'lidBot'>): boolean {
    for (const m of texto.matchAll(/@(\d{8,15})/g)) {
        if (ehMencaoAoBot(m[1], cfg)) return true
    }
    return false
}

/** Remove a(s) menção(ões) ao bot do texto — sobra só a pergunta. */
export function removerMencaoBot(texto: string, cfg: Pick<AgenteConfig, 'numeroBot' | 'lidBot'>): string {
    return texto.replace(/@(\d{8,15})/g, (full, digits) =>
        ehMencaoAoBot(String(digits), cfg) ? '' : full,
    ).replace(/\s{2,}/g, ' ').trim()
}

/** Retorna o membro da allowlist dono deste telefone, ou null. */
export function agenteNumeroAutorizado(cfg: AgenteConfig, phone: string): AgenteNumero | null {
    const alvo = telefoneCanonico(phone)
    if (!alvo) return null
    return cfg.numeros.find(n => telefoneCanonico(n.phone) === alvo) ?? null
}

// Cache curto do config — a interceptação roda em TODA mensagem 1:1 do Baileys,
// inclusive as de leads; não vale uma query extra por mensagem.
let cfgCache: { at: number; cfg: AgenteConfig } | null = null
const CFG_CACHE_MS = 60_000

export async function loadAgenteConfigCached(supabase: SupabaseClient): Promise<AgenteConfig> {
    if (cfgCache && Date.now() - cfgCache.at < CFG_CACHE_MS) return cfgCache.cfg
    const cfg = await loadAgenteConfig(supabase)
    cfgCache = { at: Date.now(), cfg }
    return cfg
}

export function invalidarCacheAgenteConfig(): void {
    cfgCache = null
}
