/**
 * Concierge de qualificação do WhatsApp (IA).
 *
 * Conduz o lead, de forma humana, da abertura até estar pronto para a análise
 * cadastral — o "concierge de habilitação para compra" do desenho aprovado. A
 * cada inbound (dentro da janela de 24h, então sempre texto livre), a IA recebe:
 *   • o que já sabemos do lead (formulário + campos de qualificação acumulados),
 *   • o histórico recente da conversa,
 *   • a persona/biblioteca de mensagens da Bula (voz do "João"),
 * e devolve, em JSON estruturado:
 *   • a próxima fala natural,
 *   • atualizações de CRM (intenção, urgência, IE, status cadastral, etapa),
 *   • sinais de ação (pedir documentos, documentos recebidos, handoff, opt-out).
 *
 * Princípios (do PDF): funil guiado por lacunas (só pergunta o que falta),
 * tom consultivo e não robótico, documentos pedidos como facilitadores da
 * compra (não burocracia), e NUNCA prometer aprovação — score/cadastro é
 * decisão humana. Ao receber a documentação mínima, marca "em análise" e passa
 * para o humano.
 *
 * Provider: OpenRouter (modelo configurável). Sem OPENROUTER_API_KEY ou com a
 * config desligada, `runConcierge` devolve `enabled:false` e o pipeline cai no
 * grafo de fluxo legado — zero regressão.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { firstName, phoneVariants, normalizePhone } from './whatsapp-central'
import { isOpenRouterConfigured, openRouterJSON, type ChatMessage } from './openrouter'
import type { InboundMedia } from './whatsapp-inbound'
import type { LeadShape } from './whatsapp-flow-engine'
import {
    CRM_STAGE_CONNECTION,
    CRM_STAGE_QUALIFICATION,
    CRM_STAGE_INFO_CAPTURED,
    CRM_STAGE_LOST,
    normalizeCRMStatus,
} from './crm-types'

export const CONCIERGE_KEY = 'crm_concierge'

/* ─── Config ───────────────────────────────────────────────────────────── */

export interface ConciergeConfig {
    /** Liga/desliga o atendimento automático por IA. Default OFF (seguro). */
    enabled: boolean
    /** Modelo OpenRouter (vazio = default do código/env). */
    model: string
    /** Override das instruções/persona. Vazio = persona default abaixo. */
    persona: string
    /**
     * Janela de "pensar" (segundos) que o bot espera antes de responder. Serve
     * para agrupar mensagens enviadas em sequência (o lead manda 3 balões
     * seguidos) e responder uma vez só, com contexto completo. Se chegar uma
     * inbound mais nova durante a espera, esta é descartada e a mais nova responde.
     */
    thinkingSeconds: number
    /**
     * Contato humano repassado ao lead quando ele pede para falar com uma
     * pessoa (nome + número). Editável no cockpit.
     */
    handoffContact: string
}

export const DEFAULT_THINKING_SECONDS = 8
export const MAX_THINKING_SECONDS = 18
export const DEFAULT_HANDOFF_CONTACT = 'João Antônio (Bula Assessoria) — +55 67 9889-4887'

export const DEFAULT_CONCIERGE_CONFIG: ConciergeConfig = {
    enabled: false,
    model: '',
    persona: '',
    thinkingSeconds: DEFAULT_THINKING_SECONDS,
    handoffContact: DEFAULT_HANDOFF_CONTACT,
}

function clampThinking(v: unknown): number {
    const n = Number(v)
    if (!Number.isFinite(n)) return DEFAULT_THINKING_SECONDS
    return Math.min(MAX_THINKING_SECONDS, Math.max(0, Math.round(n)))
}

export async function loadConciergeConfig(supabase: SupabaseClient): Promise<ConciergeConfig> {
    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', CONCIERGE_KEY)
        .maybeSingle()
    const raw = (data?.value ?? {}) as Partial<ConciergeConfig>
    return {
        enabled: raw.enabled ?? DEFAULT_CONCIERGE_CONFIG.enabled,
        model: typeof raw.model === 'string' ? raw.model : '',
        persona: typeof raw.persona === 'string' ? raw.persona : '',
        thinkingSeconds: raw.thinkingSeconds === undefined ? DEFAULT_THINKING_SECONDS : clampThinking(raw.thinkingSeconds),
        handoffContact: typeof raw.handoffContact === 'string' && raw.handoffContact.trim()
            ? raw.handoffContact : DEFAULT_HANDOFF_CONTACT,
    }
}

export async function saveConciergeConfig(
    supabase: SupabaseClient,
    patch: Partial<ConciergeConfig>,
): Promise<ConciergeConfig> {
    const current = await loadConciergeConfig(supabase)
    const merged: ConciergeConfig = {
        enabled: patch.enabled ?? current.enabled,
        model: patch.model ?? current.model,
        persona: patch.persona ?? current.persona,
        thinkingSeconds: patch.thinkingSeconds === undefined ? current.thinkingSeconds : clampThinking(patch.thinkingSeconds),
        handoffContact: patch.handoffContact === undefined
            ? current.handoffContact
            : (patch.handoffContact.trim() || DEFAULT_HANDOFF_CONTACT),
    }
    const { error } = await supabase
        .from('site_settings')
        .upsert({ key: CONCIERGE_KEY, value: merged, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw new Error(`Erro ao salvar concierge: ${error.message}`)
    return merged
}

/* ─── Persona / biblioteca de mensagens (voz da Bula) ──────────────────── */

export const DEFAULT_CONCIERGE_PERSONA = `Você é o "João", consultor da Bula Assessoria, no WhatsApp. A Bula habilita produtores a comprar gado em LEILÃO de forma PARCELADA (financiada). Sua missão tem só dois passos: (1) CONFIRMAR o interesse do lead e (2) levá-lo a ENVIAR os dados e documentos que o habilitam a comprar parcelado.

ESTILO (obrigatório):
- Mensagens CURTAS: 2 a 4 linhas no máximo. Tom de WhatsApp, humano e direto. NADA de textão.
- UMA ação por mensagem. Direto ao ponto, sem rodeios, sem repetir o que já foi dito.
- O rumo é sempre o mesmo: avançar para o envio dos documentos de habilitação.

NÃO REPETIR: os dados que JÁ TEMOS deste lead vêm logo abaixo. NUNCA peça algo que já está preenchido — peça só o que falta.

REGISTRAR INTERESSE: se o lead disser claramente o que quer (ex.: "quero touros", "procuro matrizes", "quero comprar bezerras"), registre em updates.interesse. Não invente interesse que ele não declarou.

FLUXO:
1) Interesse não confirmado → UMA pergunta curta: o que ele busca e se é pra comprar. Se já está claro pelo que ele disse ou pelos dados, pule esta etapa.
2) Interesse confirmado → em 1 linha: dá pra comprar parcelado no leilão; pra habilitar você precisa de uns dados + documentos. Aí peça, numa única mensagem organizada, SÓ o que falta:
   • Titular: nome completo, CPF, telefone, e-mail, endereço (bairro, cidade, estado, CEP).
   • Propriedade (onde os animais serão entregues): nome da fazenda, cidade, estado, Inscrição Estadual (I.E.), roteiro, telefone e responsável pelo telefone.
   • Documentos (fotos/arquivos): identidade (CNH ou RG) com foto do documento E uma foto segurando o documento (autenticidade); comprovação da propriedade; documento fiscal (I.E. ou NIRF, quando aplicável).
3) Lead enviou dados/documentos → confirme em 1 linha o recebimento e diga que vai encaminhar a habilitação. Marque documents_received e handoff (humano assume daqui).

REGRAS:
- NUNCA prometa aprovação. Você habilita/encaminha.
- Peça os documentos em no MÁXIMO 1 mensagem organizada (lista curta) — nunca arrastando um a um.
- Se faltar só parte, peça especificamente o que falta.
- Pediu pra parar / não receber mais → opt-out.
- Pediu pra falar com humano/pessoa/consultor (ou travou / assunto fora do escopo) → marque handoff=true E, na resposta, passe o CONTATO HUMANO informado abaixo (nome + número), em 1 ou 2 linhas. Ex.: "Claro! Pode falar direto com o {nome do contato}: {número}. É só chamar lá que ele te atende."

EXEMPLOS (adapte, não copie):
- Confirmar: "Boa, {nome}! Você procura touros pra compra agora, é isso?"
- Pedir docs: "Mando ver as oportunidades pra você comprar parcelado no leilão. Pra habilitar, me envia: nome completo, CPF, telefone e endereço; dados da fazenda (nome, cidade/UF, I.E.); e fotos de um documento (CNH/RG) — uma do doc e uma segurando ele. Aí já encaminho sua habilitação."
- Recebido: "Recebi, {nome}, valeu! Já encaminho sua habilitação e te retorno com o próximo passo."`

/* ─── Saída estruturada esperada da IA ─────────────────────────────────── */

type ConciergeStage =
    | 'diagnostico'
    | 'interesse'
    | 'pre_qualificacao'
    | 'documentos_solicitados'
    | 'documentos_parciais'
    | 'em_analise'
    | 'pendencia'
    | 'nao_apto'
    | 'apto'

interface ConciergeUpdates {
    interesse?: string | null
    objetivo_compra_resumido?: string | null
    urgencia_compra?: string | null
    experiencia_leilao?: string | null
    ie_status?: string | null
    cadastro_status?: string | null
    score_status?: string | null
    motivo_pendencia?: string | null
    proxima_acao?: string | null
    quantidade_animais?: string | null
    estado?: string | null
    cidade?: string | null
    inscricao_estadual?: string | null
}

interface ConciergeAIResult {
    reply?: string
    stage?: ConciergeStage
    fast_track?: boolean
    request_documents?: boolean
    documents_received?: boolean
    handoff?: boolean
    optout?: boolean
    internal_note?: string
    updates?: ConciergeUpdates
}

/* ─── Mapeamento de etapa → status no Kanban (avanço conservador) ──────── */

// Ordem para garantir que só avançamos (nunca regredimos por uma mensagem
// ambígua). Auto-avanço é limitado a INFORMAÇÕES CAPTADAS — CADASTRO/aprovação
// é decisão humana, então o concierge nunca move para lá sozinho.
const STATUS_ORDER = [
    'ENTRADA', 'CONEXÃO', 'QUALIFICAÇÃO', 'INFORMAÇÕES CAPTADAS', 'CADASTRO', 'PERDIDOS',
]

/**
 * Decide a etapa do lead a partir dos DADOS coletados — não do "feeling" do LLM.
 * Regras de negócio (definidas com o cliente):
 *   • nao_apto                         → PERDIDOS
 *   • interesse + IE + ≥1 documento    → INFORMAÇÕES CAPTADAS
 *   • qualquer dado de qualificação    → QUALIFICAÇÃO
 *   • apenas respondeu                 → CONEXÃO
 * Nunca propõe CADASTRO (decisão humana). O motivo volta junto para auditoria.
 * Combinado com maxStatus() (só avança), isto vira um "piso" por etapa: previne
 * pular a qualificação e torna a classificação previsível/auditável.
 */
function computeStageFromData(input: {
    aiStage: ConciergeStage | undefined
    hasInteresse: boolean
    hasIe: boolean
    hasDoc: boolean
    hasAnyQualData: boolean
}): { status: string; reason: string } {
    if (input.aiStage === 'nao_apto') {
        return { status: CRM_STAGE_LOST, reason: 'IA classificou o lead como não apto' }
    }
    if (input.hasInteresse && input.hasIe && input.hasDoc) {
        return { status: CRM_STAGE_INFO_CAPTURED, reason: 'interesse + IE + documento recebidos' }
    }
    if (input.hasAnyQualData) {
        return { status: CRM_STAGE_QUALIFICATION, reason: 'coletando dados de qualificação' }
    }
    return { status: CRM_STAGE_CONNECTION, reason: 'lead respondeu (conexão)' }
}

/** Conta documentos reais já recebidos do lead (crm_lead_documentos, migration 0037). */
async function countLeadDocuments(supabase: SupabaseClient, leadId: string): Promise<number> {
    const { count, error } = await supabase
        .from('crm_lead_documentos')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', leadId)
    if (error) return 0
    return count ?? 0
}

function maxStatus(current: string, candidate: string): string {
    const ci = STATUS_ORDER.indexOf(normalizeCRMStatus(current))
    const ni = STATUS_ORDER.indexOf(normalizeCRMStatus(candidate))
    if (ni < 0) return current
    if (ci < 0) return candidate
    return ni > ci ? candidate : current
}

/* ─── Contexto enviado à IA ────────────────────────────────────────────── */

// Colunas do lead úteis para a IA personalizar (além das do LeadShape).
const CONCIERGE_LEAD_FIELDS =
    'id, nome, telefone, estado, cidade, interesse, interesse_principal, o_que_busca, quantidade_animais, momento_pecuaria, tem_inscricao_estadual, inscricao_estadual, status, tags_whatsapp, optout_whatsapp, handoff_humano, contact_history, extra_data'

interface FullLead {
    id: string
    nome: string | null
    telefone: string | null
    estado: string | null
    cidade: string | null
    interesse: string | null
    interesse_principal: string | null
    o_que_busca: string | null
    quantidade_animais: string | null
    momento_pecuaria: string | null
    tem_inscricao_estadual: string | null
    inscricao_estadual: string | null
    status: string | null
    tags_whatsapp: string[] | null
    contact_history: Array<{ id: string; type: string; date: string; notes?: string | null; by?: string | null }> | null
    extra_data: Record<string, unknown> | null
}

function knownFactsBlock(lead: FullLead): string {
    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    const lines: string[] = []
    const add = (label: string, v: unknown) => {
        if (v === null || v === undefined || v === '') return
        lines.push(`- ${label}: ${String(v)}`)
    }
    add('Nome', lead.nome)
    add('Estado/UF', lead.estado)
    add('Cidade', lead.cidade)
    add('Interesse (form)', lead.o_que_busca || lead.interesse)
    add('Interesse principal', lead.interesse_principal)
    add('Quantidade de cabeças', lead.quantidade_animais)
    add('Momento na pecuária', lead.momento_pecuaria)
    add('Tem Inscrição Estadual?', lead.tem_inscricao_estadual)
    add('Nº Inscrição Estadual', lead.inscricao_estadual)
    add('Etapa atual', lead.status)
    // Campos de qualificação acumulados pelo próprio concierge.
    add('Objetivo de compra', xd.objetivo_compra_resumido)
    add('Urgência', xd.urgencia_compra)
    add('Experiência em leilão', xd.experiencia_leilao)
    add('Status IE', xd.ie_status)
    add('Status cadastro', xd.cadastro_status)
    add('Etapa de qualificação', xd.qualificacao_step)
    add('Próxima ação prevista', xd.proxima_acao)
    return lines.length ? lines.join('\n') : '- (nenhum dado prévio relevante)'
}

const RESULT_SCHEMA_INSTRUCTIONS = `Responda SOMENTE com um objeto JSON válido (sem markdown, sem comentários) neste formato:
{
  "reply": "string — a próxima mensagem natural para enviar ao lead pelo WhatsApp (em pt-BR). Vazio só se optout=true e você não quiser responder nada.",
  "stage": "diagnostico | interesse | pre_qualificacao | documentos_solicitados | documentos_parciais | em_analise | pendencia | nao_apto | apto",
  "fast_track": true|false,
  "request_documents": true|false,  // true quando esta mensagem está pedindo os documentos
  "documents_received": true|false, // true quando o lead acabou de enviar a documentação mínima (IE + identificação)
  "handoff": true|false,            // true para passar para um humano agora
  "optout": true|false,             // true se o lead pediu para não receber mais mensagens
  "internal_note": "string curta — anotação interna do que avançou (para o histórico do CRM)",
  "updates": {
    "interesse": "touros|matrizes|embrioes|semen|leiloes|venda_genetica|null",
    "objetivo_compra_resumido": "string|null",
    "urgencia_compra": "agora|proximos_30_dias|proximos_leiloes|sem_prazo|null",
    "experiencia_leilao": "ja_compra|ja_tentou|nunca_comprou|null",
    "ie_status": "tem|nao_tem|pendente_envio|em_validacao|null",
    "cadastro_status": "nao_iniciado|solicitado|em_analise|pendente|null",
    "score_status": "bom|mediano|sensivel|nao_informado|null",
    "motivo_pendencia": "ie|documento|score|protesto|outro|null",
    "proxima_acao": "string|null",
    "quantidade_animais": "string|null",
    "estado": "UF|null",
    "cidade": "string|null",
    "inscricao_estadual": "string|null"
  }
}
Inclua em "updates" apenas os campos que você descobriu/confirmou nesta troca; omita ou use null para o resto. Não invente dados que o lead não disse.`

/* ─── Resultado para o pipeline ────────────────────────────────────────── */

export type ConciergeResult =
    | { handled: false; reason: string }
    | { handled: true; silent: true; reason: string }
    | { handled: true; silent: false; reply: string; botStep: string; handoff: boolean; optout: boolean }

/* ─── Helpers de histórico ─────────────────────────────────────────────── */

async function loadThreadHistory(
    supabase: SupabaseClient,
    phone: string,
    limit = 16,
): Promise<ChatMessage[]> {
    const variants = phoneVariants(phone)
    if (variants.length === 0) return []
    const { data } = await supabase
        .from('whatsapp_messages')
        .select('body, direction, media_type, created_at')
        .in('phone', variants)
        .order('created_at', { ascending: false })
        .limit(limit)
    const rows = (data ?? []).reverse()
    const msgs: ChatMessage[] = []
    for (const r of rows) {
        const body = (r.body || '').trim()
        // Áudio é transcrito no inbound (o texto falado já vem em `body`), então
        // NÃO marcamos como mídia/anexo — senão a IA confunde voz com documento.
        const mediaTag = (r.media_type && r.media_type !== 'audio') ? `[${r.media_type} recebido]` : ''
        const content = [body, mediaTag].filter(Boolean).join(' ').trim()
        if (!content) continue
        msgs.push({ role: r.direction === 'inbound' ? 'user' : 'assistant', content })
    }
    return msgs
}

/* ─── Núcleo ───────────────────────────────────────────────────────────── */

export interface RunConciergeInput {
    lead: LeadShape
    phone: string
    senderName?: string
    text: string
    media?: InboundMedia | null
    config: ConciergeConfig
}

/**
 * Roda o concierge para uma inbound. Aplica os efeitos no CRM e devolve a
 * próxima fala (ou silêncio). Best-effort: qualquer erro vira `handled:false`
 * para o pipeline cair no fluxo legado sem perder a mensagem.
 */
export async function runConcierge(
    supabase: SupabaseClient,
    input: RunConciergeInput,
): Promise<ConciergeResult> {
    if (!input.config.enabled) return { handled: false, reason: 'disabled' }
    if (!isOpenRouterConfigured()) return { handled: false, reason: 'no_api_key' }

    // Carrega o lead completo (campos extras para personalização).
    const { data: full } = await supabase
        .from('crm_leads')
        .select(CONCIERGE_LEAD_FIELDS)
        .eq('id', input.lead.id)
        .single()
    if (!full) return { handled: false, reason: 'lead_not_found' }
    const lead = full as unknown as FullLead

    const history = await loadThreadHistory(supabase, input.phone)
    const persona = input.config.persona?.trim() || DEFAULT_CONCIERGE_PERSONA
    const fname = firstName(lead.nome) || input.senderName || ''

    // Só imagem/vídeo/documento contam como possível documento de habilitação.
    // Áudio é MENSAGEM DE VOZ (já transcrita para texto no inbound) — nunca deve
    // ser interpretado como documento, senão a IA responde "encaminhei sua
    // habilitação" para um simples áudio (bug real observado).
    const mediaNote = (input.media && input.media.type !== 'audio')
        ? `\n\nIMPORTANTE: o lead ACABOU de enviar um arquivo pelo WhatsApp (tipo: ${input.media.type}${input.media.filename ? `, nome: ${input.media.filename}` : ''}). Trate como possível documento de habilitação (ex.: inscrição estadual, CPF/CNPJ, comprovante). Se for a documentação mínima, marque documents_received=true.`
        : ''

    const handoffContact = input.config.handoffContact?.trim() || DEFAULT_HANDOFF_CONTACT
    const systemContent = `${persona}

CONTATO HUMANO (use ao fazer handoff por pedido de falar com pessoa): ${handoffContact}

DADOS QUE JÁ TEMOS DESTE LEAD (use para personalizar e NÃO repetir perguntas):
${knownFactsBlock(lead)}

O primeiro nome do lead é "${fname || 'desconhecido'}" — use {nome} mentalmente, mas escreva o nome real na resposta.${mediaNote}

${RESULT_SCHEMA_INSTRUCTIONS}`

    const messages: ChatMessage[] = [
        { role: 'system', content: systemContent },
        ...history,
    ]
    // Garante que a última inbound (mesmo que ainda não esteja no histórico
    // carregado por timing) está presente como turno do usuário.
    const lastIsThisUser =
        history.length > 0 &&
        history[history.length - 1].role === 'user' &&
        history[history.length - 1].content.includes(input.text.trim().slice(0, 24))
    if (!lastIsThisUser && input.text.trim()) {
        messages.push({ role: 'user', content: input.text.trim() })
    }

    let ai: ConciergeAIResult | null = null
    try {
        ai = await openRouterJSON<ConciergeAIResult>(messages, {
            model: input.config.model || undefined,
            temperature: 0.45,
            maxTokens: 700,
        })
    } catch (e) {
        console.warn('[concierge] OpenRouter falhou:', e instanceof Error ? e.message : e)
        return { handled: false, reason: 'ai_error' }
    }
    if (!ai) return { handled: false, reason: 'ai_unparseable' }

    // Aplica efeitos no CRM (best-effort).
    try {
        await applyConciergeEffects(supabase, lead, ai)
    } catch (e) {
        console.warn('[concierge] aplicar efeitos falhou:', e instanceof Error ? e.message : e)
    }

    const reply = (ai.reply || '').trim()
    const handoff = !!ai.handoff
    const optout = !!ai.optout
    const stage = ai.stage || 'diagnostico'
    const botStep = `concierge:${stage}`

    if (!reply) {
        return { handled: true, silent: true, reason: optout ? 'optout_no_reply' : 'empty_reply' }
    }
    return { handled: true, silent: false, reply, botStep, handoff, optout }
}

async function applyConciergeEffects(
    supabase: SupabaseClient,
    lead: FullLead,
    ai: ConciergeAIResult,
): Promise<void> {
    const u = ai.updates ?? {}
    const prevExtra = (lead.extra_data ?? {}) as Record<string, unknown>
    const nextExtra: Record<string, unknown> = { ...prevExtra }

    // Campos de qualificação vivem em extra_data (sem migração — segue o padrão
    // de "schema drift" do projeto).
    const xdKeys: (keyof ConciergeUpdates)[] = [
        'objetivo_compra_resumido', 'urgencia_compra', 'experiencia_leilao',
        'ie_status', 'cadastro_status', 'score_status', 'motivo_pendencia', 'proxima_acao',
    ]
    for (const k of xdKeys) {
        const v = u[k]
        if (v !== undefined && v !== null && v !== '') nextExtra[k] = v
    }
    if (ai.stage) nextExtra.qualificacao_step = ai.stage
    if (typeof ai.fast_track === 'boolean') nextExtra.fast_track = ai.fast_track
    nextExtra.concierge_last_at = new Date().toISOString()

    const update: Record<string, unknown> = {
        extra_data: nextExtra,
        last_whatsapp_at: new Date().toISOString(),
        ultimo_contato: new Date().toISOString(),
    }

    // Colunas reais quando confirmadas.
    if (u.interesse) {
        update.interesse_principal = u.interesse
        nextExtra.concierge_interesse = u.interesse
    }
    if (u.quantidade_animais) update.quantidade_animais = u.quantidade_animais
    if (u.estado) update.estado = u.estado
    if (u.cidade) update.cidade = u.cidade
    if (u.inscricao_estadual) {
        update.inscricao_estadual = u.inscricao_estadual
        update.tem_inscricao_estadual = 'Sim'
    } else if (u.ie_status === 'tem') {
        update.tem_inscricao_estadual = 'Sim'
    } else if (u.ie_status === 'nao_tem') {
        update.tem_inscricao_estadual = 'Não'
    }

    // Avanço de etapa DETERMINÍSTICO: a etapa é decidida pelos dados coletados,
    // não pelo "feeling" do LLM (o ai.stage só entra para o caso nao_apto). Isso
    // evita pular a qualificação e torna a classificação previsível/auditável.
    const hasInteresse = Boolean(
        update.interesse_principal || lead.interesse_principal || lead.interesse || lead.o_que_busca,
    )
    const hasIe = update.tem_inscricao_estadual === 'Sim'
        || Boolean(update.inscricao_estadual)
        || lead.tem_inscricao_estadual === 'Sim'
        || Boolean(lead.inscricao_estadual)
    const hasDoc = (await countLeadDocuments(supabase, lead.id)) >= 1
    const hasAnyQualData = hasInteresse || hasIe
        || Boolean(update.quantidade_animais || lead.quantidade_animais)
        || Boolean(update.estado || lead.estado)
        || Boolean(nextExtra.objetivo_compra_resumido || nextExtra.urgencia_compra)

    const target = computeStageFromData({ aiStage: ai.stage, hasInteresse, hasIe, hasDoc, hasAnyQualData })
    const advanced = maxStatus(lead.status || 'ENTRADA', target.status)
    if (normalizeCRMStatus(advanced) !== normalizeCRMStatus(lead.status || '')) {
        update.status = advanced
        // Auditoria estruturada da mudança de etapa (base do fluxograma/gestão do
        // chefe): quem moveu, de/para, por quê e quando. Mantém as últimas 30.
        const rawHist = nextExtra.stage_history
        const history = Array.isArray(rawHist) ? [...rawHist] : []
        history.unshift({
            from: lead.status || 'ENTRADA',
            to: advanced,
            reason: target.reason,
            by: 'ia',
            at: new Date().toISOString(),
        })
        nextExtra.stage_history = history.slice(0, 30)
    }

    // Handoff → humano assume; bot para de responder esse lead.
    if (ai.handoff) {
        update.handoff_humano = true
        update.handoff_at = new Date().toISOString()
    }

    // Opt-out respeitoso.
    if (ai.optout) {
        update.optout_whatsapp = true
        update.optout_at = new Date().toISOString()
        update.handoff_humano = true
        void supabase.from('whatsapp_optouts').upsert(
            { phone: normalizePhone(lead.telefone || '') || lead.telefone, lead_id: lead.id, reason: 'user_request' },
            { onConflict: 'phone' },
        )
    }

    // Histórico de contato (anotação interna).
    if (ai.internal_note) {
        const history = Array.isArray(lead.contact_history) ? [...lead.contact_history] : []
        history.unshift({
            id: crypto.randomUUID(),
            type: 'whatsapp',
            date: new Date().toISOString(),
            notes: `[IA] ${ai.internal_note}`,
            by: 'concierge',
        })
        update.contact_history = history
        update.contact_count = history.length
    }

    await supabase.from('crm_leads').update(update).eq('id', lead.id)
}
