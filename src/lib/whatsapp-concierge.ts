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
    computeHabilitacaoChecklist,
    checklistPromptBlock,
    DOC_TIPOS_SEMANTICOS,
} from './crm-habilitacao'
import { promoteWhatsappMediaToLeadDoc, type LeadDocTipo } from './whatsapp-lead-documents'
import { computeFaixasPreco, faixasPromptBlock } from './leilao-faixas-preco'
import { maybeRunCreditCheck } from './crm-credit-automation'
import { maybeRunStateRegistrationCheck } from './crm-state-registration-automation'
import { maybeEnrichLeadFromPhone } from './crm-lead-enrichment'
import { notifyTeamGroup } from './whatsapp-team-notify'
import { submitLeadCadastroToLeiloeiraGroups } from './leiloeira-whatsapp-cadastro'
import {
    CRM_STAGE_CONNECTION,
    CRM_STAGE_QUALIFICATION,
    CRM_STAGE_INFO_CAPTURED,
    CRM_STAGE_LOST,
    DEFAULT_JMP_MQL_RULE,
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
    /**
     * ID do grupo interno do WhatsApp (via Baileys) que recebe os avisos de
     * automação — habilitação completa, cadastro enviado às leiloeiras.
     * Vazio = avisos desligados. Editável no cockpit.
     */
    notifyGroupId: string
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
    notifyGroupId: '',
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
        notifyGroupId: typeof raw.notifyGroupId === 'string' ? raw.notifyGroupId.trim() : '',
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
        notifyGroupId: patch.notifyGroupId === undefined
            ? current.notifyGroupId
            : patch.notifyGroupId.trim(),
    }
    const { error } = await supabase
        .from('site_settings')
        .upsert({ key: CONCIERGE_KEY, value: merged, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw new Error(`Erro ao salvar concierge: ${error.message}`)
    return merged
}

/* ─── Persona / biblioteca de mensagens (voz da Bula) ──────────────────── */

export const DEFAULT_CONCIERGE_PERSONA = `Você é o "João", consultor da Bula Assessoria, no WhatsApp. A Bula habilita produtores a comprar gado em LEILÃO de forma PARCELADA (financiada). Sua missão: CONFIRMAR o interesse do lead e conduzi-lo, sem enrolação, até completar o CHECKLIST DE HABILITAÇÃO (dados + documentos). O checklist atualizado vem logo abaixo — ele é o seu mapa: peça SEMPRE e SOMENTE o que está marcado como FALTA.

ESTILO (obrigatório):
- Mensagens CURTAS: 2 a 4 linhas no máximo. Tom de WhatsApp, humano e direto. NADA de textão.
- UMA ação/pedido claro por mensagem. Sem rodeios, sem repetir o que já foi dito.
- NOME COM PARCIMÔNIA: use o primeiro nome só na abertura ou num toque pontual — nunca em mensagens seguidas, nunca abrindo toda resposta. Na dúvida, fale direto (2ª pessoa), sem vocativo.
- Sempre feche com o próximo passo concreto (o item do checklist que falta), a não ser que o checklist esteja completo.

FLUXO (siga na ordem; pule etapas que o checklist mostra como resolvidas):
1) INTERESSE não confirmado → UMA pergunta curta: o que ele busca (touros, matrizes, bezerras...) e se é pra comprar. Registre em updates.interesse.
2) Interesse confirmado → apresente o caminho em 1 linha ("dá pra comprar parcelado direto no leilão; pra te habilitar preciso de uns dados rápidos") e peça, numa ÚNICA mensagem organizada, os DADOS que faltam (titular e propriedade) — sem documentos ainda.
3) Dados essenciais ok (nome, CPF, fazenda, I.E.) → peça os DOCUMENTOS que faltam numa única mensagem: foto da CNH/RG, foto segurando o documento, comprovante da propriedade / I.E. / NIRF.
4) Chegou documento/dado parcial → confirme em 1 linha O QUE recebeu e peça especificamente SÓ o que ainda falta (olhe o checklist).
5) CHECKLIST COMPLETO → confirme o recebimento, diga que a habilitação já foi encaminhada para análise e que retornamos em breve. Marque documents_received=true e handoff=true. NÃO peça mais nada.

OBJEÇÕES (responda curto e volte pro fluxo):
- "Não tenho Inscrição Estadual" → sem drama: dá pra habilitar como produtor com NIRF, ou orientamos a tirar a I.E. (é rápido). Registre ie_status=nao_tem e siga o resto do checklist.
- "Quanto custa / qual a faixa de preço?" → dê a FAIXA aproximada da categoria que ele busca (touros, matrizes ou bezerras) usando o bloco FAIXAS DE PREÇO abaixo; diga que é média e que o valor final sai no lance. Só a faixa — nunca detalhe de fechamento (leilão, comprador, lote). Sobre juros/parcelamento: é direto com a leiloeira, condição sai no leilão (ex.: 30x); NUNCA prometa taxa, desconto ou aprovação. Depois volte pro checklist.
- Desconfiança ("é golpe?") → normal. Ofereça o contato humano (abaixo) e o site da Bula; sem pressão. Não insista em documento enquanto a pessoa estiver desconfiada.
- "Só estou olhando / mais pra frente" → registre urgencia_compra e diga que deixar a habilitação pronta não custa nada e evita perder lote bom; se recusar, não force (proxima_acao='follow-up').
- Assunto fora do escopo (venda de gado, parceria, cobrança...) → handoff=true com o contato humano.

REGISTRO (tão importante quanto responder): TODO dado que o lead informar deve ir em "updates" — CPF, e-mail, endereço, nome/cidade/UF da fazenda, I.E., quantidade de animais, urgência. O que você não registrar, o sistema perde. Não invente nem "complete" dados que o lead não disse.
Quando o lead enviar arquivo/foto, marque em updates.documentos_recebidos o que ele representa: "identidade" (CNH/RG), "identidade_selfie" (segurando o doc), "comprovante_propriedade", "ie_nirf". Áudio NUNCA é documento (é mensagem de voz, já transcrita).

REGRAS DURAS:
- NUNCA prometa aprovação, prazo de aprovação, taxa ou desconto. Você habilita/encaminha; a análise é humana.
- Não peça item que o checklist mostra como ✔.
- Documentos: peça em no máximo 1 mensagem organizada — nunca arrastando um a um.
- Pediu pra parar / não receber mais → optout=true, sem resposta ou uma despedida de 1 linha.
- Pediu pra falar com humano/pessoa/consultor (ou travou) → handoff=true E passe o CONTATO HUMANO abaixo (nome + número) em 1-2 linhas.

EXEMPLOS (adapte, não copie — o nome NÃO aparece em toda mensagem):
- Abertura: "Boa, {nome}! Você procura touros pra compra agora, é isso?"
- Pedir dados: "Show. Pra te habilitar a comprar parcelado no leilão eu preciso de: seu CPF, e-mail, e o nome e cidade/UF da fazenda onde entrega. Tem a Inscrição Estadual dela?"
- Pedir docs: "Falta pouco: me manda uma foto da CNH ou RG, uma foto sua segurando o documento e o comprovante da I.E. (ou NIRF). Aí eu já encaminho sua habilitação."
- Parcial: "Recebi a CNH, valeu! Agora só falta a foto segurando o documento e o comprovante da I.E."
- Completo: "Perfeito, documentação completa! Já encaminhei sua habilitação pra análise e te retorno em breve com o próximo passo."`

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
    // Dados do cadastro/habilitação (colunas reais ou extra_data)
    nome_completo?: string | null
    cpf?: string | null
    email?: string | null
    endereco_titular?: string | null
    fazenda_nome?: string | null
    fazenda_cidade?: string | null
    fazenda_uf?: string | null
    /** Tipos semânticos dos documentos recebidos nesta troca. */
    documentos_recebidos?: string[] | null
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
 *   • checklist de habilitação completo → INFORMAÇÕES CAPTADAS
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
    checklistComplete: boolean
}): { status: string; reason: string } {
    if (input.aiStage === 'nao_apto') {
        return { status: CRM_STAGE_LOST, reason: 'IA classificou o lead como não apto' }
    }
    if (input.checklistComplete) {
        return { status: CRM_STAGE_INFO_CAPTURED, reason: 'checklist de habilitação completo' }
    }
    if (input.hasInteresse && input.hasIe && input.hasDoc) {
        return { status: CRM_STAGE_INFO_CAPTURED, reason: 'interesse + IE + documento recebidos' }
    }
    if (input.hasAnyQualData) {
        return { status: CRM_STAGE_QUALIFICATION, reason: 'coletando dados de qualificação' }
    }
    return { status: CRM_STAGE_CONNECTION, reason: 'lead respondeu (conexão)' }
}

/** Documentos reais já recebidos do lead (crm_lead_documentos, migration 0037). */
async function loadLeadDocs(
    supabase: SupabaseClient,
    leadId: string,
): Promise<{ count: number; tipos: string[] }> {
    const { data, error } = await supabase
        .from('crm_lead_documentos')
        .select('tipo')
        .eq('lead_id', leadId)
    if (error || !data) return { count: 0, tipos: [] }
    return { count: data.length, tipos: data.map(d => String(d.tipo || 'outro')) }
}

/** Mapeia o tipo semântico reconhecido pela IA → tipo do doc formal do lead. */
const SEMANTIC_TO_DOC_TIPO: Record<string, LeadDocTipo> = {
    identidade: 'cpf',
    identidade_selfie: 'cpf',
    comprovante_propriedade: 'comprovante',
    ie_nirf: 'ie',
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
    'id, nome, telefone, celular, email, cpf, estado, cidade, interesse, interesse_principal, o_que_busca, quantidade_animais, momento_pecuaria, tem_inscricao_estadual, inscricao_estadual, status, tags_whatsapp, optout_whatsapp, handoff_humano, contact_history, extra_data'

interface FullLead {
    id: string
    nome: string | null
    telefone: string | null
    celular: string | null
    email: string | null
    cpf: string | null
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
    "inscricao_estadual": "string|null",
    "nome_completo": "string|null",   // nome completo do titular, quando o lead informar
    "cpf": "string|null",             // só os 11 dígitos que o lead informou
    "email": "string|null",
    "endereco_titular": "string|null",   // endereço do titular num texto só (rua, bairro, cidade/UF, CEP)
    "fazenda_nome": "string|null",       // nome da fazenda/propriedade de entrega
    "fazenda_cidade": "string|null",
    "fazenda_uf": "UF|null",
    "documentos_recebidos": ["identidade" | "identidade_selfie" | "comprovante_propriedade" | "ie_nirf"] // ou null
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

    // Checklist de habilitação (estado atual) — o "mapa" injetado no prompt.
    const docs = await loadLeadDocs(supabase, lead.id)
    const checklist = computeHabilitacaoChecklist({
        nome: lead.nome,
        cpf: lead.cpf,
        telefone: lead.telefone,
        celular: lead.celular,
        email: lead.email,
        inscricao_estadual: lead.inscricao_estadual,
        tem_inscricao_estadual: lead.tem_inscricao_estadual,
        extra_data: lead.extra_data,
        docsCount: docs.count,
        docTipos: docs.tipos,
    })

    // Só imagem/vídeo/documento contam como possível documento de habilitação.
    // Áudio é MENSAGEM DE VOZ (já transcrita para texto no inbound) — nunca deve
    // ser interpretado como documento, senão a IA responde "encaminhei sua
    // habilitação" para um simples áudio (bug real observado).
    const mediaNote = (input.media && input.media.type !== 'audio')
        ? `\n\nIMPORTANTE: o lead ACABOU de enviar um arquivo pelo WhatsApp (tipo: ${input.media.type}${input.media.filename ? `, nome: ${input.media.filename}` : ''}). Trate como possível documento de habilitação (ex.: inscrição estadual, CPF/CNPJ, comprovante). Se for a documentação mínima, marque documents_received=true.`
        : ''

    // Faixas de preço reais (dos fechamentos) — para responder "quanto custa"
    // sem expor detalhe de fechamento. Best-effort: em erro, segue sem o bloco.
    let faixasBlock = ''
    try {
        const faixas = await computeFaixasPreco(supabase)
        if (faixas) {
            const block = faixasPromptBlock(faixas)
            if (block) faixasBlock = `\n\n${block}`
        }
    } catch (e) {
        console.warn('[concierge] faixas de preço falharam:', e instanceof Error ? e.message : e)
    }

    const handoffContact = input.config.handoffContact?.trim() || DEFAULT_HANDOFF_CONTACT
    const systemContent = `${persona}

CONTATO HUMANO (use ao fazer handoff por pedido de falar com pessoa): ${handoffContact}

CHECKLIST DE HABILITAÇÃO (estado atual — seu mapa; peça só o que está com ✘):
${checklistPromptBlock(checklist)}${faixasBlock}

DADOS QUE JÁ TEMOS DESTE LEAD (use para personalizar e NÃO repetir perguntas):
${knownFactsBlock(lead)}

O primeiro nome do lead é "${fname || 'desconhecido'}". USE O NOME COM PARCIMÔNIA: chamar a pessoa pelo nome toda hora soa robótico e forçado. Como regra, só use o nome quando for realmente natural — na saudação de abertura ou num momento pontual pra dar um toque humano — e, mesmo assim, não em mensagens seguidas. Na dúvida, NÃO use o nome; fale direto com a pessoa (2ª pessoa) sem vocativo. Nunca comece toda resposta com o nome.${mediaNote}

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
            logKind: 'concierge',
        })
    } catch (e) {
        console.warn('[concierge] OpenRouter falhou:', e instanceof Error ? e.message : e)
        return { handled: false, reason: 'ai_error' }
    }
    if (!ai) return { handled: false, reason: 'ai_unparseable' }

    // Aplica efeitos no CRM (best-effort).
    try {
        await applyConciergeEffects(supabase, lead, ai, {
            media: input.media ?? null,
            docs,
        })
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
    ctx: { media: InboundMedia | null; docs: { count: number; tipos: string[] } },
): Promise<void> {
    const u = ai.updates ?? {}
    const prevExtra = (lead.extra_data ?? {}) as Record<string, unknown>
    const nextExtra: Record<string, unknown> = { ...prevExtra }

    // Campos de qualificação/habilitação vivem em extra_data (sem migração —
    // segue o padrão de "schema drift" do projeto).
    const xdKeys: (keyof ConciergeUpdates)[] = [
        'objetivo_compra_resumido', 'urgencia_compra', 'experiencia_leilao',
        'ie_status', 'cadastro_status', 'score_status', 'motivo_pendencia', 'proxima_acao',
        'endereco_titular', 'fazenda_nome', 'fazenda_cidade', 'fazenda_uf',
    ]
    for (const k of xdKeys) {
        const v = u[k]
        if (v !== undefined && v !== null && v !== '') nextExtra[k] = v
    }
    if (ai.stage) nextExtra.qualificacao_step = ai.stage
    if (typeof ai.fast_track === 'boolean') nextExtra.fast_track = ai.fast_track
    nextExtra.concierge_last_at = new Date().toISOString()

    // Documentos reconhecidos pela IA (tipos semânticos) — união com os já vistos.
    const semanticNew = (Array.isArray(u.documentos_recebidos) ? u.documentos_recebidos : [])
        .map(d => String(d))
        .filter(d => (DOC_TIPOS_SEMANTICOS as readonly string[]).includes(d))
    if (semanticNew.length) {
        const prevDocs = Array.isArray(prevExtra.docs_recebidos)
            ? prevExtra.docs_recebidos.map(d => String(d)) : []
        nextExtra.docs_recebidos = [...new Set([...prevDocs, ...semanticNew])]
    }

    // A mídia desta mensagem, quando reconhecida como documento, vira doc formal
    // do lead (crm_lead_documentos) com o tipo certo. Sem isso, FOTOS (CNH,
    // selfie com doc — o grosso da habilitação) nunca contavam como documento:
    // o webhook só promove `document` (PDF).
    let docsCount = ctx.docs.count
    const docTipos = [...ctx.docs.tipos]
    if (ctx.media && ctx.media.type !== 'audio' && ctx.media.url && semanticNew.length) {
        const tipo: LeadDocTipo = SEMANTIC_TO_DOC_TIPO[semanticNew[0]] ?? 'outro'
        const promoted = await promoteWhatsappMediaToLeadDoc(supabase, {
            leadId: lead.id,
            mediaPath: ctx.media.url,
            filename: ctx.media.filename,
            mime: ctx.media.mime,
            tipo,
        }).catch(() => null)
        if (promoted) {
            docsCount++
            docTipos.push(promoted.tipo)
        }
    }

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
    // Dados do titular: CPF/e-mail só preenchem vazio (não sobrescrevem um valor
    // já validado por humano); o nome só melhora (nunca troca um nome completo).
    const cpfDigits = String(u.cpf ?? '').replace(/\D/g, '')
    if (cpfDigits.length === 11 && !String(lead.cpf ?? '').replace(/\D/g, '')) {
        update.cpf = cpfDigits
    }
    const email = String(u.email ?? '').trim()
    if (email.includes('@') && !String(lead.email ?? '').trim()) {
        update.email = email
    }
    const nomeCompleto = String(u.nome_completo ?? '').trim()
    if (/\S+\s+\S+/.test(nomeCompleto) && !/\S+\s+\S+/.test(String(lead.nome ?? '').trim())) {
        update.nome = nomeCompleto
    }

    // Checklist recalculado com o estado PÓS-updates — vai para extra_data
    // (UI do inbox/CRM lê daqui) e decide a etapa.
    const checklist = computeHabilitacaoChecklist({
        nome: (update.nome as string) ?? lead.nome,
        cpf: (update.cpf as string) ?? lead.cpf,
        telefone: lead.telefone,
        celular: lead.celular,
        email: (update.email as string) ?? lead.email,
        inscricao_estadual: (update.inscricao_estadual as string) ?? lead.inscricao_estadual,
        tem_inscricao_estadual: (update.tem_inscricao_estadual as string) ?? lead.tem_inscricao_estadual,
        extra_data: nextExtra,
        docsCount,
        docTipos,
    })
    nextExtra.habilitacao = {
        done: checklist.done,
        total: checklist.total,
        complete: checklist.complete,
        missing: checklist.missingLabels,
        at: new Date().toISOString(),
    }
    if (checklist.complete && nextExtra.cadastro_status !== 'em_analise') {
        nextExtra.cadastro_status = 'em_analise'
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
    const hasDoc = docsCount >= 1
    const hasAnyQualData = hasInteresse || hasIe
        || Boolean(update.quantidade_animais || lead.quantidade_animais)
        || Boolean(update.estado || lead.estado)
        || Boolean(nextExtra.objetivo_compra_resumido || nextExtra.urgencia_compra)

    const target = computeStageFromData({
        aiStage: ai.stage, hasInteresse, hasIe, hasDoc, hasAnyQualData,
        checklistComplete: checklist.complete,
    })
    const advanced = maxStatus(lead.status || 'ENTRADA', target.status)
    const stageChanged = normalizeCRMStatus(advanced) !== normalizeCRMStatus(lead.status || '')
    if (stageChanged) {
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

    // Aviso interno (uma vez por lead): habilitação completa → equipe revisa e
    // aprova o cadastro no CRM. Flag marcada ANTES do update p/ não duplicar.
    const shouldNotifyTeam =
        (checklist.complete || normalizeCRMStatus(advanced) === CRM_STAGE_INFO_CAPTURED)
        && !prevExtra.habilitacao_notificada_at
    if (shouldNotifyTeam) {
        nextExtra.habilitacao_notificada_at = new Date().toISOString()
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

    // ── Automações pós-etapa (as mesmas do moveLead manual) ────────────────
    // Sem isto, lead movido PELA IA nunca disparava consulta de crédito/I.E.
    const statusAfter = normalizeCRMStatus((update.status as string) || lead.status || '')
    const leadAfter = {
        id: lead.id,
        status: statusAfter,
        nome: (update.nome as string) ?? lead.nome,
        telefone: lead.telefone,
        celular: lead.celular,
        email: (update.email as string) ?? lead.email,
        cpf: (update.cpf as string) ?? lead.cpf,
        estado: (update.estado as string) ?? lead.estado,
        inscricao_estadual: (update.inscricao_estadual as string) ?? lead.inscricao_estadual,
        tem_inscricao_estadual: (update.tem_inscricao_estadual as string) ?? lead.tem_inscricao_estadual,
        extra_data: nextExtra,
        contact_history: (update.contact_history as unknown) ?? lead.contact_history,
    }
    const previous = { status: lead.status }
    // Enriquecimento pelo telefone (descobre CPF sem pedir) — antes de
    // crédito/I.E. para o CPF descoberto cascatear no mesmo passo.
    if (!leadAfter.cpf) {
        try {
            const r = await maybeEnrichLeadFromPhone(supabase, leadAfter)
            if (r.cpf) leadAfter.cpf = r.cpf
        } catch (e) {
            console.warn('[concierge] enriquecimento falhou:', e instanceof Error ? e.message : e)
        }
    }
    try {
        await maybeRunCreditCheck(supabase, leadAfter, previous)
    } catch (e) {
        console.warn('[concierge] automação de crédito falhou:', e instanceof Error ? e.message : e)
    }
    try {
        await maybeRunStateRegistrationCheck(supabase, leadAfter, previous, DEFAULT_JMP_MQL_RULE)
    } catch (e) {
        console.warn('[concierge] automação de I.E. falhou:', e instanceof Error ? e.message : e)
    }

    // Aviso no grupo interno (best-effort, depois do update pra não atrasar nada
    // crítico). O flag habilitacao_notificada_at já foi gravado junto do update.
    if (shouldNotifyTeam) {
        const nome = (update.nome as string) || lead.nome || lead.telefone || 'Lead'
        const fone = lead.celular || lead.telefone || ''
        const interesse = (update.interesse_principal as string) || lead.interesse_principal || lead.o_que_busca || '—'
        const faltam = checklist.missingLabels.length
            ? `Faltam: ${checklist.missingLabels.join(', ')}`
            : 'Checklist completo'

        // Checklist COMPLETO → posta a ficha automaticamente nos grupos de
        // cadastro das leiloeiras (Baileys). Idempotente por leiloeira.
        let cadastroLinha = 'Próximo passo: revisar e aprovar o cadastro no CRM.'
        if (checklist.complete) {
            const sub = await submitLeadCadastroToLeiloeiraGroups(supabase, lead.id)
            if (sub.sent > 0) {
                cadastroLinha = `📤 Ficha de cadastro enviada ao grupo de ${sub.sent} leiloeira(s) — aguardando aprovado/recusado no grupo.`
            } else if (sub.skipped.length) {
                cadastroLinha = `⚠ Ficha NÃO enviada às leiloeiras: ${sub.skipped.map(s => `${s.leiloeira}: ${s.reason}`).join(' · ')}`
            }
        }

        const r = await notifyTeamGroup(supabase, [
            '✅ *Habilitação captada pela IA*',
            `${nome}${fone ? ` — ${fone}` : ''}`,
            `Interesse: ${interesse} · Docs: ${docsCount} arquivo(s) · ${checklist.done}/${checklist.total} itens`,
            faltam,
            cadastroLinha,
        ].join('\n'))
        if (!r.sent && r.reason !== 'no_group_configured') {
            console.warn('[concierge] aviso ao grupo falhou:', r.reason)
        }
    }

    // Supervisão: eventos de conversa que pedem atenção humana vão pro grupo
    // interno (Baileys). O pipeline só roda o concierge para lead que ainda NÃO
    // estava em handoff/opt-out, então estes são sempre eventos novos.
    const nomeSup = (update.nome as string) || lead.nome || lead.telefone || 'Lead'
    const foneSup = lead.celular || lead.telefone || ''
    if (ai.handoff && !ai.optout) {
        void notifyTeamGroup(supabase, [
            '🖐 *Lead pediu atendimento humano*',
            `${nomeSup}${foneSup ? ` — ${foneSup}` : ''}`,
            ai.internal_note ? `Contexto: ${ai.internal_note}` : '',
            'O bot pausou para este lead — assumir a conversa no inbox.',
        ].filter(Boolean).join('\n')).catch(() => { /* best-effort */ })
    }
    if (ai.optout) {
        void notifyTeamGroup(supabase, [
            '🔕 *Lead pediu para não receber mais mensagens (opt-out)*',
            `${nomeSup}${foneSup ? ` — ${foneSup}` : ''}`,
            'Envios bloqueados automaticamente.',
        ].join('\n')).catch(() => { /* best-effort */ })
    }
}
