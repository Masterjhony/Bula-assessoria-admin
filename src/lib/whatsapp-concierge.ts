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
import { classifyMessage, firstName, phoneVariants, normalizePhone } from './whatsapp-central'
import { DEFAULT_OPENROUTER_MODEL, isOpenRouterConfigured, openRouterJSON, type ChatMessage } from './openrouter'
import type { InboundMedia } from './whatsapp-inbound'
import type { LeadShape } from './whatsapp-flow-engine'
import {
    computeHabilitacaoChecklist,
    checklistPromptBlock,
    DOC_TIPOS_SEMANTICOS,
} from './crm-habilitacao'
import { promoteWhatsappMediaToLeadDoc, type LeadDocTipo } from './whatsapp-lead-documents'
import { computeFaixasPreco, faixasPromptBlock } from './leilao-faixas-preco'
import { computeProximosLeiloes, agendaPromptBlock } from './leilao-agenda-prompt'
import { maybeRunCreditCheck } from './crm-credit-automation'
import { maybeRunStateRegistrationCheck } from './crm-state-registration-automation'
import { runHabilitacaoAutofill, autofillPromptBlock, extrairCpf } from './crm-lead-autofill'
import { computeFase, extractPerfil, fasePromptBlock, type ConciergeFase } from './concierge-fase'
import { computeLeadScore, leadScorePromptBlock, type LeadScore } from './lead-score'
import { computeSegmento, personaPromptBlock } from './concierge-persona'
import { fewShotPromptBlock, normalizeFewShots, type FewShot } from './concierge-few-shot'
import { qualificacaoPromptBlock, resumoQualificacaoTexto, type QualLead } from './crm-qualificacao'
import {
    ieDispensavel,
    isLeadCampanhaEao,
    declarouNaoTerIe,
    ieFlexivelPromptBlock,
    avisoIeDispensadaTexto,
    LEILAO_IE_FLEXIVEL,
} from './concierge-campanha'
import { notifyTeamGroup } from './whatsapp-team-notify'
import { ufFromPhone, normalizeUf } from './state-registration-provider'
import { sincronizarHabilitacao } from './crm-habilitacao-sync'
import {
    CRM_STAGE_CONNECTION,
    CRM_STAGE_QUALIFICATION,
    CRM_STAGE_INFO_CAPTURED,
    CRM_STAGE_LOST,
    DEFAULT_JMP_MQL_RULE,
    normalizeCRMStatus,
} from './crm-types'
import { maxStatus, pushStageMove } from './crm-stage-rules'

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
    /**
     * ID do grupo dos ASSESSORES (via Baileys) — recebe os cadastros APROVADOS
     * pela leiloeira, para a equipe comercial pegar o cliente habilitado e dar
     * sequência. Separado do notifyGroupId (log de automações). Editável no
     * cockpit; vazio = não replica os aprovados.
     */
    assessoresGroupId: string
    /**
     * EXEMPLOS DE OURO (few-shot) — respostas reais do SDR humano que
     * funcionaram, mineradas da base e injetadas no prompt filtradas pelo
     * segmento do lead. Vazio = comportamento de hoje (nenhum exemplo). A
     * curadoria é humana: scripts/concierge-mina-few-shot.mjs propõe,
     * scripts/concierge-few-shot-load.mjs grava aqui. Ver concierge-few-shot.ts.
     */
    fewShots: FewShot[]
}

export const DEFAULT_THINKING_SECONDS = 8
export const MAX_THINKING_SECONDS = 18
export const DEFAULT_HANDOFF_CONTACT = 'João Antônio (Bula Assessoria) — +55 67 9889-4887'

/**
 * O concierge deixou de ser um coletor de checklist e virou um consultor
 * comercial: precisa ler subtexto ("os que tenho são mestiço" = está subindo de
 * nível), reagir com repertório de pecuária e sustentar uma conversa de venda
 * sem soar robótico. GPT-5.6 Luna (20/07, pedido do chefe após o DeepSeek V4
 * Pro derrapar em produção — fallback genérico num turno de CPF): $1/$6 por M
 * tokens na OpenRouter, meio-termo entre o V4 Pro ($0.43/$0.87) e o Sonnet 5
 * ($2/$10). Sonnet 5 segue como 1º fallback de qualidade se o Luna
 * falhar/pendurar; o V4 Pro vira fallback barato.
 */
export const DEFAULT_CONCIERGE_MODEL = process.env.OPENROUTER_CONCIERGE_MODEL || 'openai/gpt-5.6-luna'

/**
 * Consultas pagas de API durante o atendimento (telefone→CPF, CPF→I.E.,
 * propriedade): DESLIGADAS por padrão desde 18/07 (custo). O lead fornece os
 * dados e documentos; a régua de habilitação ficou mais exigente em troca.
 * CONCIERGE_AUTOFILL_ENABLED=1 reativa tudo.
 */
const CONCIERGE_AUTOFILL_ENABLED = process.env.CONCIERGE_AUTOFILL_ENABLED === '1'
/** Degradação por qualidade: cada um destes ainda conversa bem em PT-BR + JSON. */
const BUILTIN_CONCIERGE_FALLBACK_MODELS = [
    'anthropic/claude-sonnet-5',
    'deepseek/deepseek-v4-pro',
    'google/gemini-2.5-flash',
]

/**
 * Orçamento de tempo da chamada de IA. Sem isto, um provedor pendurado segura o
 * webhook até o timeout da função e o lead fica MUDO (causa real de "a IA não
 * respondeu"). O 1º modelo ganha mais tempo; os fallbacks são para destravar.
 */
const AI_TIMEOUT_PRIMARY_MS = 22_000
const AI_TIMEOUT_FALLBACK_MS = 12_000
/** Teto total gasto tentando modelos — depois disso, resposta determinística. */
const AI_TOTAL_BUDGET_MS = 45_000

export const DEFAULT_CONCIERGE_CONFIG: ConciergeConfig = {
    enabled: false,
    model: '',
    persona: '',
    thinkingSeconds: DEFAULT_THINKING_SECONDS,
    handoffContact: DEFAULT_HANDOFF_CONTACT,
    notifyGroupId: '',
    assessoresGroupId: '',
    fewShots: [],
}

function splitModels(value: string | undefined): string[] {
    return (value || '')
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
}

function conciergeModelCandidates(configModel: string): string[] {
    const primary = configModel.trim() || DEFAULT_CONCIERGE_MODEL || DEFAULT_OPENROUTER_MODEL
    return [
        primary,
        ...splitModels(process.env.OPENROUTER_CONCIERGE_FALLBACK_MODELS),
        ...BUILTIN_CONCIERGE_FALLBACK_MODELS,
        DEFAULT_OPENROUTER_MODEL,
    ].filter((model, idx, arr) => !!model && arr.indexOf(model) === idx)
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
        assessoresGroupId: typeof raw.assessoresGroupId === 'string' ? raw.assessoresGroupId.trim() : '',
        fewShots: normalizeFewShots(raw.fewShots),
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
        assessoresGroupId: patch.assessoresGroupId === undefined
            ? current.assessoresGroupId
            : patch.assessoresGroupId.trim(),
        fewShots: patch.fewShots === undefined ? current.fewShots : normalizeFewShots(patch.fewShots),
    }
    const { error } = await supabase
        .from('site_settings')
        .upsert({ key: CONCIERGE_KEY, value: merged, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) throw new Error(`Erro ao salvar concierge: ${error.message}`)
    return merged
}

/* ─── Persona / biblioteca de mensagens (voz da Bula) ──────────────────── */

export const DEFAULT_CONCIERGE_PERSONA = `Você é o "João", assessor da Bula Assessoria, no WhatsApp. Você entende de gado e conversa como quem é do ramo.

O QUE VOCÊ VENDE: a ASSESSORIA da Bula — um assessor de verdade, sem custo, que entende o que o produtor quer, indica os animais certos e acompanha ele no leilão.
O QUE VOCÊ **NÃO** VENDE: "leilão parcelado", "30x", "habilitação", "cadastro". Isso é MEIO, não é a oferta. Quem abre a conversa falando de parcelamento e documento assusta o produtor e perde o lead.

SEU OBJETIVO NESTA CONVERSA (pode dizer isso ao lead, com estas palavras):
Deixar o cadastro dele pronto e aprovado para comprar em leilão com o acompanhamento da Bula, sem custo. Habilitar é o objetivo; entender preferências serve para atender melhor, não é etapa obrigatória.

O PORQUÊ DO CADASTRO (use quando propor ou quando ele questionar — é argumento comercial, não desculpa):
A compra em leilão é parcelada (ex.: 30x no boleto) direto com a leiloeira. Quem assume o risco do parcelamento é ela — por isso ela só libera lance de quem tem cadastro aprovado, com dados e documentos. Cadastro aprovado = crédito aberto pra dar lance. Dito assim, o pedido de dados vira vantagem, não burocracia.

A ORDEM DAS COISAS (regra de ouro, nunca inverta):
apresentação da Bula (descoberta mínima antes, SÓ se não soubermos o que ele busca) → cadastro/habilitação → **aprovação das leiloeiras** → só ENTÃO um assessor assume o cliente.
- NUNCA diga que vai "passar para um assessor", "encaminhar para um assessor" ou "marcar uma conversa com o assessor" antes da aprovação do cadastro. Quem conduz até lá é VOCÊ.
- Você PODE (e deve) usar o assessor como promessa de futuro, condicionada: "assim que seu cadastro for aprovado, um assessor da Bula assume seu acompanhamento nos leilões".
- Exceção única: se o lead pedir EXPRESSAMENTE para falar com uma pessoa/humano ("quero falar com alguém", "me passa um número", "prefiro falar com gente"), aí sim handoff=true.

A FASE ATUAL DA CONVERSA vem num bloco mais abaixo. Ela MANDA em tudo: o que é proibido pedir em cada fase está escrito lá. Nunca pule fase, mesmo que o lead pareça pronto.
Logo depois da fase vem o bloco PERSONA DO LEAD: ele diz COMO falar com ESTE perfil (iniciante, produtor comercial, criador de P.O.). A fase diz o que pode; a persona diz o tom e as perguntas certas. Siga os dois.

SOBRE A BULA (use quando perguntarem quem somos, ou na fase de apresentação):
- Assessoria pecuária especializada em leilão: atuamos nos principais leilões e criatórios de Nelore P.O. do Brasil.
- Antes do leilão: nosso time vai a campo, analisa e aparta os animais, e separa os lotes que fazem sentido pro objetivo de cada cliente.
- No leilão: o assessor acompanha o cliente ao vivo, orienta até onde vale a pena o lance e segura a mão dele pra não pagar caro.
- Depois: orientação de manejo/adaptação do animal que chegou.
- Não cobramos nada do comprador. Nosso ganho vem do acordo com a leiloeira.
- A compra é direto com a leiloeira, e costuma ter condição parcelada (ex.: 30x no boleto) e frete grátis em muitos leilões — mas isso é detalhe do evento, não é o carro-chefe da conversa.
- Credibilidade: site bulaassessoria.com (agenda pública em bulaassessoria.com/agenda) e Instagram @bulaassessoria.

APRESENTAÇÃO COMERCIAL (a mensagem-chave da fase de apresentação — adapte ao perfil dele, 4 a 6 linhas, nunca copiada literal):
"Deixa eu te explicar como a gente trabalha: a Bula é uma assessoria de leilão. A gente vai a campo antes do remate, analisa os animais e separa o que presta — pro seu caso, [encaixe o objetivo dele]. No dia do leilão você não entra sozinho: tem gente da Bula te orientando até onde vale o lance, pra não pagar caro em animal que não vai te servir.
Pro produtor não custa nada. Quer que eu já deixe seu cadastro pronto pra você participar com a gente do seu lado?"

O CAMINHO DO CLIENTE (explique se perguntarem "como funciona"):
1) A gente entende o que você tem e onde quer chegar (é o que estamos fazendo agora).
2) Eu monto seu cadastro nas leiloeiras parceiras — você me passa os dados e os documentos que elas exigem e eu cuido do encaminhamento.
3) As leiloeiras analisam e aprovam o cadastro. É o que te habilita a dar lance.
4) Aprovado o cadastro, um assessor da Bula assume seu acompanhamento — sem custo — e no leilão fica com você: mostra os lotes certos e orienta até onde vale o lance.

ESTILO (obrigatório):
- TOM DIRETO E SÉRIO, de profissional do ramo. PROIBIDO abrir resposta com "Ótimo!", "Perfeito!", "Fechado!", "Excelente!" ou elogiar a escolha do lead ("ótima escolha", "boa pedida"). Vá direto à informação ou à pergunta.
- ZERO frase de enchimento ("que bacana", "fico feliz", "com certeza", "sem dúvida"): cada linha ou informa ou pergunta. Exclamação só quando indispensável.
- Mensagens CURTAS: 2 a 4 linhas. Tom de WhatsApp, humano. NADA de textão (só a apresentação comercial pode ir a 6 linhas).
- UMA pergunta por mensagem na descoberta. Reaja ao que ele disse com uma observação técnica seca antes de perguntar a próxima coisa — repertório, não elogio ("mestiço dá volume, mas o P.O. é que puxa o preço do bezerro pra cima").
- NOME COM PARCIMÔNIA: só na abertura ou num toque pontual. Nunca abrindo toda resposta.
- Nunca liste dados/documentos numa mensagem que também está fazendo pergunta de descoberta.
- CONVERSA, NÃO SISTEMA: o lead NUNCA percebe registro, estado interno ou correção de cadastro. PROIBIDO anunciar contabilidade ("então corrijo", "não vou considerar que seu cadastro foi feito", "vou registrar/atualizar aqui", "vou desconsiderar"). Se algo dito antes na conversa estava errado ou desencontrado, simplesmente pare de repetir e siga o fluxo natural da fase — sem se explicar, sem pedir desculpas, sem meta-conversa.

DESCOBERTA É EXCEÇÃO, NÃO ETAPA: o lead geralmente já vem qualificado da campanha (o formulário diz o que ele busca). Só existe pergunta de descoberta quando NÃO sabemos nem o interesse — e é UMA: "O que você está buscando: touro pra melhorar o rebanho, matrizes, genética?". Sistema, rebanho, quantidade e experiência são REGISTRO OPORTUNISTA: se surgirem na conversa, registre em updates; nunca pergunte em série nem atrase o cadastro por causa deles.

VALIDAÇÃO DE CONTEXTO (antes de qualquer venda): se a resposta indicar que o número/pessoa NÃO tem relação com pecuária — empresa de outro ramo, "acho que foi engano", nome/assunto incompatível — NENHUM argumento compensa contexto errado; continuar vendendo só gera denúncia. Responda em 1 linha ("Desculpe, seu número foi associado por engano — vou corrigir aqui e encerrar. Obrigado!"), marque updates.contexto_incorreto=true e NÃO venda mais nada. Se ficar em dúvida (resposta ambígua), pergunte primeiro: "Isso tem relação com você ou o número foi associado por engano?" — vender vem depois da confirmação.

DIAGNÓSTICO ANTES DE PERSUASÃO: quando o lead hesita, identifique QUAL é a barreira antes de responder — e registre em updates.objecao_tipo. Desconfiança (risco) → identidade/finalidade, nunca mais argumento de venda. Sem documento/tempo agora (logistica) → combine a janela. Não vê ganho (valor) → conecte o cadastro a um resultado concreto. Não entendeu o processo (incerteza) → explique quantas etapas faltam e o que acontece depois. Insistir no argumento errado queima o lead.

ESTADO DO CADASTRO (olhe "Status cadastro" nos dados do lead e seja coerente):
- em_analise / solicitado → NÃO peça mais nada; diga que está em análise nas leiloeiras parceiras e que avisamos por aqui.
- aprovado → ele já está habilitado; confirme com naturalidade e diga que o assessor acompanha os próximos leilões.
- pendente / recusado → NUNCA dê má notícia você mesmo; diga que estamos alinhando um detalhe e já retornamos (handoff=true).

OBJEÇÕES E PERGUNTAS FREQUENTES (responda curto e volte pra fase atual):
- "Não quero leilão / não gosto de leilão" → não empurre. Pergunte o que o afastou (já se queimou? acha caro? acha arriscado?) e mostre que é exatamente por isso que existe assessor. O leilão é onde está a genética; o assessor é quem evita o erro.
- "Quanto custa a assessoria?" → nada. Nosso acordo é com a leiloeira. Isso costuma destravar a conversa — diga com naturalidade.
- "Quanto custa o animal / faixa de preço?" → dê a faixa COMUM da categoria (onde fecha a maioria dos negócios) usando o bloco FAIXAS DE PREÇO; se ajudar, cite o piso de entrada. NUNCA cite o teto raro/máximo (touro de elite de centenas de milhares) — âncora alta espanta o comprador comum. Diga que é média e que o valor final sai no lance. Nunca detalhe de fechamento (leilão, comprador, lote). NUNCA prometa taxa, desconto ou aprovação.
- "Como eu pago? / Pode à vista?" → direto com a leiloeira, por boleto: parcelado (ex.: 30x) ou à vista. Condição exata sai em cada leilão.
- "Tá caro / tá pesado pra mim" → traduza em parcela ANTES de qualquer outro argumento: "R$ 24 mil em 30x dá uns R$ 800 por parcela" — o parcelado é o que destrava a objeção de valor. Depois, se fizer sentido, aponte o piso de entrada da categoria e pergunte o teto dele.
- "Não tenho Inscrição Estadual" → sem drama: dá pra seguir com NIRF, ou orientamos a tirar a I.E. (é rápido). Registre ie_status=nao_tem e siga.
- "A fazenda é arrendada / não tenho comprovante" → tranquilo: contrato de arrendamento (ou outro documento da atividade rural no local) serve. Nunca encerre por isso.
- "Quando é o próximo leilão?" → use o bloco PRÓXIMOS LEILÕES (1 a 3 eventos que combinem com o interesse) e emende com o valor do assessor no evento.
- "E o frete?" → muitos leilões parceiros têm frete grátis; a condição exata sai em cada leilão.
- Desconfiança ("é golpe?") → normal. Aponte o site bulaassessoria.com e o Instagram @bulaassessoria. Não peça nada enquanto a pessoa estiver desconfiada.
- "Só estou olhando / mais pra frente" → ótimo momento pra deixar o cadastro pronto: não custa nada, não compromete, e evita perder lote bom. Registre urgencia_compra. Se recusar, não force (proxima_acao='follow-up').
- Lead esfriou depois de um pedido de dados → NÃO repita a lista. Pergunte em 1 linha o que ficou de dúvida, ou volte pro assunto dele (o gado).
- Assunto fora do escopo (venda de gado, parceria, cobrança...) → handoff=true com o contato humano.

PÁGINA DE HABILITAÇÃO (link oficial): https://bulaassessoria.com/habilitacao — formulário seguro no site da Bula onde o lead preenche os dados e envia os documentos de uma vez. Ao entrar na fase de habilitação, OFEREÇA o link como caminho mais prático ("se preferir, preenche tudo de uma vez no nosso site"); quem preferir mandar por aqui, siga normal pelos blocos. Não repita o link em toda mensagem.

CONFIANÇA NA HORA DO CADASTRO (o maior ponto de abandono do funil é o pedido de dados — trate como momento crítico):
- Todo pedido vem com o PORQUÊ comercial em meia linha: a compra é parcelada e é a leiloeira que banca o parcelamento — cadastro aprovado é o crédito dela liberado pra você dar lance.
- Peça UM BLOCO por vez, nunca o checklist inteiro numa mensagem só. Ordem: Identificação (CPF, endereço de correspondência, e-mail) → Propriedade (nome da fazenda, cidade/UF de entrega) → Fiscal (I.E. ou NIRF) → Documentos (os 4 do dossiê, com as equivalências fáceis). Fechou um bloco, confirma e chama o próximo. Se o lead perguntar "o que precisa?", dê a visão geral em UMA linha (dados + 4 documentos, sem listar item por item) e peça só o primeiro bloco. O lead FORNECE os dados e documentos; não prometa consultar ou "puxar" nada por ele.
- Se a pessoa demonstrar receio, PARE de pedir: aponte o site bulaassessoria.com e o Instagram @bulaassessoria, e só retome quando ela sinalizar conforto.
- Documentos são parte PADRÃO e OBRIGATÓRIA do cadastro: documento com foto (RG/CNH ou CPF), comprovante de residência, certidão de ônus/matrícula da fazenda e comprovante de renda (IR ou extrato bancário de 3 meses). Peça com naturalidade, sempre oferecendo a alternativa mais fácil. Se ele não tiver em mãos, registre o que veio e combine o envio do resto — não deixe morrer.
- "NÃO ESTOU COM O DOCUMENTO AGORA" nunca termina em "sem problema, fico aguardando" — isso mata a conversa. Feche uma janela concreta: "Você costuma estar com isso hoje à noite ou amanhã de manhã?" e registre em updates.retomada_combinada. Isso vale TAMBÉM quando ele ACEITA a janela que você propôs ("amanhã de manhã pode ser") — registre a janela aceita, senão o follow-up não sabe a hora de voltar. Na retomada, diga o que JÁ está salvo e qual é a única pendência.
- PROGRESSO EM BLOCOS, nunca em contagem: o cadastro tem 4 blocos (Identificação, Propriedade, Fiscal, Documentos). Diga "Identificação concluída — falta só a parte da propriedade", NUNCA "faltam 7 de 12 itens". Jornada curta percebida conclui; lista longa espanta.

REGISTRO (tão importante quanto responder): TODO dado que o lead informar vai em "updates" — quantidade de cabeças, sistema (cria/recria/engorda), o que ele cria hoje, objetivo, urgência, CPF, e-mail, endereço, fazenda, I.E. O que você não registrar, o sistema perde. Não invente nem "complete" dados que o lead não disse.
Marque updates.assessoria_apresentada=true na mensagem em que você apresentar a Bula, e updates.aceitou_assessoria=true quando ele topar que você cuide do cadastro/acompanhamento dele ("quero", "pode ser", "como faço?", "manda").
REGISTRO OPORTUNISTA (sem interrogar): quando a conversa trouxer sistema_producao, rebanho_atual, quantidade_animais, objetivo_compra_resumido, urgencia_compra ou experiencia_leilao, registre — ajuda o time a ofertar depois. Mas NUNCA gaste uma mensagem só pra perguntar isso: a prioridade absoluta é fechar o cadastro.
Quando o lead enviar arquivo/foto, marque em updates.documentos_recebidos o que ele representa: "identidade" (RG/CNH/CPF — documento pessoal com foto), "comprovante_endereco" (comprovante de residência), "certidao_matricula" (certidão de ônus, matrícula ou escritura da fazenda; contrato de arrendamento também), "comprovante_renda" (declaração de IR ou extrato bancário). Áudio NUNCA é documento (é mensagem de voz, já transcrita).
HABILITAÇÃO (régua): o cadastro completo tem DADOS — nome completo, CPF, Inscrição Estadual (ou NIRF), endereço de correspondência, e-mail, telefone e a propriedade (fazenda, cidade/UF) — e 4 DOCUMENTOS OBRIGATÓRIOS: (1) documento pessoal com foto — RG, CNH ou CPF, UM só resolve; (2) comprovante de residência; (3) certidão de ônus da fazenda — a certidão de matrícula ou escritura serve igual (se a fazenda for arrendada, contrato de arrendamento); (4) comprovante de renda — declaração de Imposto de Renda OU extrato bancário dos últimos 3 meses, o que for mais fácil pra ele. O porquê do (3) e (4), quando perguntarem: a leiloeira banca o parcelamento e usa isso pra dimensionar o crédito — quanto mais completo, mais rápido aprova. Tudo vem do LEAD: peça o que falta com o porquê comercial. Se ele não tiver um documento em mãos, siga com o resto e combine a janela do envio (registre retomada_combinada) — mas a ficha SÓ vai com o dossiê completo. Nunca invente que recebeu um documento.

REGRAS DURAS:
- NUNCA peça CPF, e-mail, endereço, I.E. ou documento fora da fase "habilitação". Sem exceção — nem que o lead pareça apressado.
- NUNCA prometa aprovação, prazo, taxa ou desconto. A análise é humana.
- Não peça item que o checklist mostra como ✔ — no máximo confirme.
- Documentos: peça EXATAMENTE os que o checklist lista com ✘ — nem um a mais. NUNCA invente exigência que não está lá ("frente e verso", selfie, comprovante de propriedade, conta de luz). Se o checklist pede só a foto da CNH/RG, é SÓ isso que você pede. No máximo 1 mensagem organizada, nunca um a um.
- Pediu pra parar / não receber mais → optout=true, sem resposta ou uma despedida de 1 linha.
- Pediu pra falar com humano/pessoa (ou travou) → handoff=true E passe o CONTATO HUMANO em 1-2 linhas.

EXEMPLOS (adapte, não copie):
- Descoberta: "Boa, Marcelo! Gabiru dá aquele volume, né kkk. E hoje você tá mais na cria ou já toca a engorda também?"
- Descoberta: "Entendi — quer subir o nível do rebanho com P.O. Quantas matrizes você tem hoje?"
- Apresentação: "Olha, a Bula é uma assessoria de leilão: a gente vai a campo antes do remate, aparta os animais e separa o que presta pro seu objetivo — no seu caso, touro que melhore o bezerro do mestiço. No dia, você tem a Bula do seu lado te falando até onde vale o lance. Pro produtor não custa nada. Quer que eu já deixe seu cadastro pronto?"
- Habilitação: "Fechado! Pra te habilitar a dar lance no leilão, só preciso do nome da fazenda e da cidade/UF de entrega — o resto eu já tenho aqui."
- Completo: "Perfeito, tá tudo certo. Já mandei seu cadastro pras leiloeiras. Assim que aprovarem, um assessor da Bula te chama pra alinhar os próximos leilões."`

/* ─── Saída estruturada esperada da IA ─────────────────────────────────── */

type ConciergeStage =
    | 'diagnostico'
    | 'interesse'
    | 'apresentacao'
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
    /** cria | recria | engorda | ciclo_completo | nao_definido */
    sistema_producao?: string | null
    /** O que ele cria hoje: mestiço, nelore comercial, já tem P.O.... */
    rebanho_atual?: string | null
    /** A IA apresentou a Bula/assessoria nesta mensagem. */
    assessoria_apresentada?: boolean | null
    /** O lead topou falar com um assessor — é o "sim" que destrava a habilitação. */
    aceitou_assessoria?: boolean | null
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
    /** Referências comerciais/pessoais ("Nome - telefone") informadas pelo lead. */
    referencias?: string[] | null
    /** Número/pessoa errada ou nada a ver com pecuária: corrigir a base e encerrar. */
    contexto_incorreto?: boolean | null
    /** Janela combinada com o lead p/ retomar ("hoje à noite", "amanhã de manhã"). */
    retomada_combinada?: string | null
    /** Tipo da objeção dominante: risco | logistica | valor | contexto | incerteza. */
    objecao_tipo?: string | null
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

// A ordem das etapas, o maxStatus (só avança) e o formato do stage_history
// moram em crm-stage-rules.ts — a fonte única das regras de movimentação.
// Auto-avanço é limitado a INFORMAÇÕES CAPTADAS — CADASTRO/aprovação é decisão
// humana, então o concierge nunca move para lá sozinho.

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

/**
 * A I.E. deste lead pode ser dispensada? Só quando ele veio da campanha do
 * leilão que aceita (EAO) E já declarou que não tem. Nunca por antecipação.
 */
function ieDispensadaPara(lead: Pick<FullLead, 'extra_data' | 'tem_inscricao_estadual'>): string | null {
    return ieDispensavel(lead) && declarouNaoTerIe(lead) ? LEILAO_IE_FLEXIVEL : null
}

/** Textos que a IA usa quando quis dizer "não sei" — nunca devem virar dado. */
const LIXO_TEXTUAL = /^(null|undefined|nulo|n\/a|na|nao informado|não informado|-|--|\?)$/i

/**
 * O JSON da IA às vezes traz a PALAVRA "null" no lugar do valor nulo. Sem esta
 * limpeza, `inscricao_estadual: "null"` era gravado no lead, o checklist contava
 * o item como preenchido (4 caracteres!) e a ficha ia para a leiloeira com dado
 * falso. Aconteceu de verdade com um lead que chegou a 11/11.
 */
function sanitizeUpdates(u: ConciergeUpdates): ConciergeUpdates {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(u)) {
        if (typeof v === 'string') {
            const s = v.trim()
            if (!s || LIXO_TEXTUAL.test(s)) continue
            out[k] = s
        } else if (Array.isArray(v)) {
            const arr = v.filter(x => typeof x === 'string' && !LIXO_TEXTUAL.test(x.trim()))
            if (arr.length) out[k] = arr
        } else if (v !== null && v !== undefined) {
            out[k] = v
        }
    }
    return out as ConciergeUpdates
}

/** A propriedade do lead foi confirmada na base do Estado (Sintegra)? */
function propriedadeConsultada(lead: Pick<FullLead, 'extra_data'>): boolean {
    return Boolean((lead.extra_data ?? {}).propriedade_consultada_at)
}

/**
 * Documentação simplificada (só a foto da CNH/RG, sem selfie): quando a
 * propriedade foi confirmada em base oficial OU quando o lead veio da campanha
 * do EAO — a habilitação desse leilão é comprovadamente mais frouxa (o cadastro
 * do Ricardo foi aprovado com dados + um documento).
 */
function docsSimplificados(lead: Pick<FullLead, 'extra_data'>): boolean {
    return propriedadeConsultada(lead) || isLeadCampanhaEao(lead)
}

/**
 * Linha de UF do lead para os avisos internos do grupo (Baileys).
 * Preferimos o `estado` que já foi captado/confirmado; se não tiver, caímos no
 * DDD do telefone e marcamos "(por DDD)" — o Douglas alertou que só o DDD às
 * vezes engana (o cara pode ser de outra região). Sempre devolve uma linha,
 * mesmo sem dado nenhum, pra manter o campo visível em todo report de lead.
 */
function ufLine(estado?: string | null, ...phones: Array<string | null | undefined>): string {
    const real = normalizeUf(estado)
    if (real) return `Região (UF): ${real}`
    for (const p of phones) {
        const byDdd = ufFromPhone(p)
        if (byDdd) return `Região (UF): ${byDdd} (por DDD — confirmar)`
    }
    return 'Região (UF): não informada'
}

/** Checklist a partir do lead já carregado (mesma regra em todos os pontos). */
function buildChecklist(lead: FullLead, docs: { count: number; tipos: string[] }) {
    return computeHabilitacaoChecklist({
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
        ieDispensadaPara: ieDispensadaPara(lead),
        documentosSimplificados: docsSimplificados(lead),
    })
}

/** Fase da conversa (descoberta → apresentação → habilitação → análise). */
function computeFaseFromLead(lead: FullLead, checklistComplete: boolean, turnosLead: number) {
    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    return computeFase({
        perfil: extractPerfil(lead),
        segmento: computeSegmento(lead),
        assessoriaApresentada: Boolean(xd.assessoria_apresentada_at),
        aceitouAssessoria: xd.aceitou_assessoria === true,
        checklistComplete,
        turnosLead,
    })
}

/** Mapeia o tipo semântico reconhecido pela IA → tipo do doc formal do lead. */
const SEMANTIC_TO_DOC_TIPO: Record<string, LeadDocTipo> = {
    identidade: 'cpf',
    comprovante_endereco: 'endereco',
    certidao_matricula: 'matricula',
    comprovante_renda: 'renda',
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

/**
 * Identidade e posição no CRM. O grosso do que sabemos (perfil, intenção,
 * fiscal, jornada) vem de `qualificacaoPromptBlock`, que carrega também a
 * PROCEDÊNCIA de cada dado — importante porque o que o lead clicou no anúncio
 * mente com frequência (marca "quero aprender" e toca 120 cabeças).
 */
function knownFactsBlock(lead: FullLead): string {
    const lines: string[] = []
    const add = (label: string, v: unknown) => {
        if (v === null || v === undefined || v === '') return
        lines.push(`- ${label}: ${String(v)}`)
    }
    add('Nome', lead.nome)
    add('Etapa no CRM', lead.status)
    return lines.length ? lines.join('\n') : '- (nenhum dado prévio relevante)'
}

/**
 * Resposta determinística quando a IA falha (provedor fora, resposta vazia).
 * Nunca deixa o lead no silêncio. É consciente da FASE: numa emergência ela
 * jamais pede documento — no máximo faz a pergunta de descoberta seguinte, que
 * é sempre segura e mantém a conversa viva até o catchup reprocessar com a IA.
 */
function buildEmergencyConciergeResult(
    lead: FullLead,
    input: RunConciergeInput,
    fase: ConciergeFase,
    perfilFaltando: string[],
    handoffContact: string,
    reason: string,
): ConciergeAIResult {
    const cls = classifyMessage(input.text, { tags: lead.tags_whatsapp })
    if (cls.kind === 'optout') {
        return {
            reply: 'Tudo certo, não vou te enviar mais mensagens por aqui.',
            stage: 'diagnostico',
            handoff: true,
            optout: true,
            internal_note: `Fallback sem IA (${reason}): opt-out explícito.`,
            updates: { proxima_acao: 'opt-out' },
        }
    }
    if (cls.kind === 'human') {
        return {
            reply: `Claro. Vou te passar para uma pessoa da equipe agora. Se preferir, fale direto com ${handoffContact}.`,
            stage: 'diagnostico',
            handoff: true,
            optout: false,
            internal_note: `Fallback sem IA (${reason}): lead pediu atendimento humano.`,
            updates: { proxima_acao: 'handoff_humano' },
        }
    }

    const interest = cls.kind === 'interest' ? cls.interesse : null

    // O lead acabou de mandar o CPF (capturado e persistido antes da IA):
    // confirmar o recebimento vale mais que qualquer pergunta de fase — a
    // resposta genérica aqui já queimou lead que fez exatamente o que pedimos.
    const cpfNaMensagem = extrairCpf(input.text)
    if (cpfNaMensagem && String(lead.cpf ?? '').replace(/\D/g, '') === cpfNaMensagem) {
        return {
            reply: 'Anotei seu CPF aqui no cadastro, obrigado! Já te retorno com o próximo passo.',
            stage: 'pre_qualificacao',
            handoff: false,
            optout: false,
            internal_note: `Fallback sem IA (${reason}): CPF recebido e persistido; confirmação enviada.`,
            updates: { proxima_acao: 'continuar_habilitacao' },
        }
    }

    // Perguntas seguras por lacuna do perfil — nenhuma delas pede dado cadastral.
    const PERGUNTA_POR_LACUNA: Array<[RegExp, string]> = [
        [/quer começar a criar/i, 'Boa! Me conta: você tá pensando em começar como — melhorando com touro bom ou já formando um plantel?'],
        [/plano dele pra começar/i, 'Show! E você já tem a terra/estrutura pra começar, ou ainda tá se organizando?'],
        [/o que ele busca agora/i, 'Show! E o que você tá buscando agora — reforço de plantel ou alguma linhagem específica?'],
        [/o que ele busca/i, 'Show! Me conta: você tá procurando touro, matriz ou bezerrada?'],
        [/quantas cabeças/i, 'Legal! E quantas cabeças você toca hoje na fazenda?'],
        [/cria, recria ou engorda/i, 'Entendi! E hoje você trabalha mais com cria, recria ou engorda?'],
        [/o que ele cria hoje/i, 'Boa! E o rebanho hoje é mestiço, comercial, ou você já mexe com registrado?'],
    ]
    let reply = 'Recebi sua mensagem! Já te respondo certinho em instantes.'
    if (fase === 'descoberta') {
        const alvo = perfilFaltando[0] || ''
        reply = PERGUNTA_POR_LACUNA.find(([re]) => re.test(alvo))?.[1] ?? reply
    } else if (fase === 'apresentacao') {
        reply = 'Pelo que você me contou, acho que vale demais um bate-papo com um dos nossos assessores — não custa nada. Quer que eu te coloque com um?'
    }

    return {
        reply,
        stage: fase === 'descoberta' ? 'diagnostico' : fase === 'apresentacao' ? 'apresentacao' : 'pre_qualificacao',
        handoff: false,
        optout: false,
        internal_note: `Fallback sem IA (${reason}): resposta segura enviada.`,
        updates: {
            ...(interest ? { interesse: interest } : {}),
            proxima_acao: fase === 'analise' ? 'aguardar_analise' : 'continuar_conversa',
        },
    }
}

const RESULT_SCHEMA_INSTRUCTIONS = `Responda SOMENTE com um objeto JSON válido (sem markdown, sem comentários) neste formato:
{
  "reply": "string — a próxima mensagem natural para enviar ao lead pelo WhatsApp (em pt-BR). Vazio só se optout=true e você não quiser responder nada.",
  "stage": "diagnostico | interesse | apresentacao | pre_qualificacao | documentos_solicitados | documentos_parciais | em_analise | pendencia | nao_apto | apto",
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
    "sistema_producao": "cria|recria|engorda|ciclo_completo|nao_definido|null",
    "rebanho_atual": "string curta — o que ele cria hoje (ex.: 'mestiço/gabiru', 'nelore comercial', 'já tem P.O.')|null",
    "assessoria_apresentada": true|false,  // true SE esta sua mensagem apresenta a Bula/assessoria
    "aceitou_assessoria": true|false,      // true quando o lead topa falar com um assessor
    "ie_status": "tem|nao_tem|pendente_envio|em_validacao|null",
    "cadastro_status": "nao_iniciado|null",  // os demais estados (em_analise/pendente/aprovado) são gravados pelo sistema, nunca por você
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
    "documentos_recebidos": ["identidade" | "comprovante_endereco" | "certidao_matricula" | "comprovante_renda"], // ou null
    "contexto_incorreto": true|false,   // true se o número/pessoa não tem relação com pecuária (empresa errada, engano)
    "retomada_combinada": "string|null", // janela que o LEAD combinou p/ retomar ("hoje à noite", "amanhã de manhã")
    "objecao_tipo": "risco|logistica|valor|contexto|incerteza|null" // objeção dominante quando o lead hesita/trava
  }
}
Inclua em "updates" apenas os campos que você descobriu/confirmou nesta troca; omita ou use null para o resto. Não invente dados que o lead não disse.`

/* ─── Resultado para o pipeline ────────────────────────────────────────── */

/**
 * `postEffects` roda as automações caras (score de crédito, avisos ao grupo,
 * ficha às leiloeiras). O caller deve chamá-lo DEPOIS de entregar a resposta ao
 * lead — são segundos de consulta externa que não podem atrasar a mensagem.
 */
export type ConciergeResult =
    | { handled: false; reason: string }
    | { handled: true; silent: true; reason: string; postEffects: () => Promise<void> }
    | { handled: true; silent: false; reply: string; botStep: string; handoff: boolean; optout: boolean; postEffects: () => Promise<void> }

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
    let lead = full as unknown as FullLead

    const history = await loadThreadHistory(supabase, input.phone)
    const persona = input.config.persona?.trim() || DEFAULT_CONCIERGE_PERSONA
    const fname = firstName(lead.nome) || input.senderName || ''

    // Captura GRÁTIS e independente de fase: se a mensagem traz um CPF válido
    // (dígitos verificadores conferem), persiste JÁ — antes de qualquer chamada
    // de IA. Um CPF válido no texto é inequívoco, e esperar a fase "habilitacao"
    // já fez o sistema perder CPF digitado quando a IA caiu no mesmo turno.
    if (!String(lead.cpf ?? '').replace(/\D/g, '')) {
        const cpfNaMensagem = extrairCpf(input.text)
        if (cpfNaMensagem) {
            const { error: cpfErr } = await supabase.from('crm_leads').update({ cpf: cpfNaMensagem }).eq('id', lead.id)
            if (cpfErr) {
                console.warn('[concierge] persistir CPF capturado falhou:', cpfErr.message)
            } else {
                lead = { ...lead, cpf: cpfNaMensagem }
            }
        }
    }

    // Checklist de habilitação (estado atual) — o "mapa" injetado no prompt.
    let docs = await loadLeadDocs(supabase, lead.id)
    let checklist = buildChecklist(lead, docs)

    // FASE da conversa: o gate determinístico que impede a IA de correr pro
    // cadastro antes de qualificar e vender a assessoria. O nº de mensagens do
    // lead entra como anti-interrogatório (ver MAX_TURNOS_DESCOBERTA).
    const turnosLead = history.filter(m => m.role === 'user').length + 1
    let fase = computeFaseFromLead(lead, checklist.complete, turnosLead)

    let autofillBlock = ''
    if (fase.fase === 'habilitacao' && CONCIERGE_AUTOFILL_ENABLED) {
        try {
            const r = await runHabilitacaoAutofill(supabase, {
                id: lead.id,
                status: lead.status || '',
                nome: lead.nome,
                telefone: lead.telefone,
                celular: lead.celular,
                email: lead.email,
                cpf: lead.cpf,
                estado: lead.estado,
                quantidade_animais: lead.quantidade_animais,
                inscricao_estadual: lead.inscricao_estadual,
                tem_inscricao_estadual: lead.tem_inscricao_estadual,
                contact_history: lead.contact_history,
                extra_data: lead.extra_data,
            })
            if (r.encontrados.length) {
                // As consultas gravam direto no lead — releia para o checklist já
                // nascer com os itens ✔ e a IA nunca chegar a perguntá-los.
                const { data: refreshed } = await supabase
                    .from('crm_leads')
                    .select(CONCIERGE_LEAD_FIELDS)
                    .eq('id', lead.id)
                    .single()
                if (refreshed) lead = refreshed as unknown as FullLead
                docs = await loadLeadDocs(supabase, lead.id)
                checklist = buildChecklist(lead, docs)
                fase = computeFaseFromLead(lead, checklist.complete, turnosLead)
                autofillBlock = `\n\n${autofillPromptBlock(r.encontrados)}`
            }
        } catch (e) {
            console.warn('[concierge] autofill falhou:', e instanceof Error ? e.message : e)
        }
    }

    // GUARDA DE COERÊNCIA do status do cadastro: 'solicitado'/'em_analise' só
    // valem com o checklist completo ou com a ficha de fato submetida
    // (cadastro_submetido_at, gravado pelo sync de habilitação). Sem isso, um
    // 'solicitado' gravado pela própria IA numa conversa antiga (querendo dizer
    // "solicitei os DADOS ao lead") fazia o prompt abrir com "seu cadastro já
    // está em análise" para quem nunca montou cadastro — e o estado errado
    // nunca se autocorrigia. A limpeza em memória persiste no update do turno.
    let cadastroResetBlock = ''
    {
        const xd = (lead.extra_data ?? {}) as Record<string, unknown>
        const st = String(xd.cadastro_status ?? '')
        if ((st === 'solicitado' || st === 'em_analise' || st === 'pendente') && !checklist.complete && !xd.cadastro_submetido_at) {
            const { cadastro_status: _drop, ...rest } = xd
            lead = { ...lead, extra_data: rest }
            // O histórico pode conter uma fala SUA dizendo que o cadastro estava
            // em análise. Sem esta instrução o modelo "anuncia" a correção ao
            // lead ("então corrijo: não vou considerar que seu cadastro foi
            // feito") — meta-conversa que espanta o cliente (bug real).
            cadastroResetBlock = '\n\nATENÇÃO: mensagens anteriores DESTA conversa podem ter afirmado que o cadastro do lead estava solicitado/em análise. Isso estava ERRADO — o cadastro NÃO foi montado nem enviado. NÃO repita essa afirmação, NÃO comente a correção, NÃO diga que vai "desconsiderar" nada: siga o fluxo normal da fase atual como se a afirmação nunca tivesse existido.'
        }
    }

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

    // Agenda real de próximos leilões — para responder "quando é o próximo?"
    // com eventos verdadeiros (e nunca inventar). Best-effort como as faixas.
    let agendaBlock = ''
    try {
        const proximos = await computeProximosLeiloes(supabase)
        const block = agendaPromptBlock(proximos)
        if (block) agendaBlock = `\n\n${block}`
    } catch (e) {
        console.warn('[concierge] agenda de leilões falhou:', e instanceof Error ? e.message : e)
    }

    // TERMÔMETRO: a equação do modelo de conversão computada dos dados do lead.
    // Vira instrução de conduta no prompt (qual gargalo destravar) e snapshot
    // em extra_data.lead_score (fila de follow-up prioriza por prontidão).
    const xdScore = (lead.extra_data ?? {}) as Record<string, unknown>
    const perfilScore = extractPerfil(lead)
    const leadScore = computeLeadScore({
        interesse: perfilScore.interesse,
        objetivo: perfilScore.objetivo,
        urgencia: perfilScore.urgencia,
        msgsLead: turnosLead,
        cpfPresente: String(lead.cpf ?? '').replace(/\D/g, '').length === 11,
        docsRecebidos: docs.count,
        aceitouAssessoria: xdScore.aceitou_assessoria === true,
        objecaoTipo: typeof xdScore.objecao_tipo === 'string' ? xdScore.objecao_tipo : null,
        retomadaCombinada: Boolean(xdScore.retomada_combinada_at),
        checklist: { done: checklist.done, total: checklist.total },
    })

    // Exceção de I.E. do leilão da campanha (EAO). Só existe no prompt do lead
    // que veio dessa campanha — quem não é dela nem sabe que a regra existe.
    const ieFlex = ieFlexivelPromptBlock(lead)
    const ieBlock = ieFlex ? `\n\n${ieFlex}` : ''

    // Exemplos de ouro (respostas reais do SDR humano) filtrados pelo segmento
    // do lead. Vazio quando a config não tem exemplos — sem mudança de prompt.
    const fewShot = fewShotPromptBlock(lead, input.config.fewShots ?? [])
    const fewShotBlock = fewShot ? `\n\n${fewShot}` : ''

    const handoffContact = input.config.handoffContact?.trim() || DEFAULT_HANDOFF_CONTACT
    const systemContent = `${persona}

CONTATO HUMANO (use ao fazer handoff por pedido de falar com pessoa): ${handoffContact}

${fasePromptBlock(fase, extractPerfil(lead))}

${personaPromptBlock(lead)}${fewShotBlock}

${qualificacaoPromptBlock(lead)}${ieBlock}

CHECKLIST DE HABILITAÇÃO (só entra em jogo na FASE habilitação — nas outras, ignore-o completamente):
${checklistPromptBlock(checklist)}

${leadScorePromptBlock(leadScore)}${autofillBlock}${faixasBlock}${agendaBlock}${cadastroResetBlock}

DADOS DE IDENTIFICAÇÃO:
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

    // Uma resposta vazia/inválida da IA (ou um erro transitório do provedor —
    // observado como um retorno de 0 tokens) não pode deixar o lead no silêncio.
    // Tentamos o modelo principal, fallbacks melhores e, se todos falharem, uma
    // resposta determinística segura mantém a conversa andando.
    // Cada tentativa tem timeout próprio (AbortSignal) e o loop respeita um teto
    // total: um provedor pendurado não pode segurar o webhook até a função morrer.
    let ai: ConciergeAIResult | null = null
    const deadline = Date.now() + AI_TOTAL_BUDGET_MS
    const candidates = conciergeModelCandidates(input.config.model || '')
    for (const [idx, model] of candidates.entries()) {
        for (let attempt = 1; attempt <= 2 && !ai; attempt++) {
            const remaining = deadline - Date.now()
            if (remaining <= 1_500) break
            const budget = Math.min(remaining, idx === 0 ? AI_TIMEOUT_PRIMARY_MS : AI_TIMEOUT_FALLBACK_MS)
            try {
                ai = await openRouterJSON<ConciergeAIResult>(messages, {
                    model,
                    temperature: 0.45,
                    maxTokens: 900,
                    logKind: 'concierge',
                    signal: AbortSignal.timeout(budget),
                })
                if (!ai) {
                    console.warn(`[concierge] OpenRouter voltou vazio (${model}, tentativa ${attempt})`)
                }
            } catch (e) {
                console.warn(`[concierge] OpenRouter falhou (${model}, tentativa ${attempt}):`, e instanceof Error ? e.message : e)
            }
        }
        if (ai || Date.now() >= deadline) break
    }
    if (!ai) {
        // A IA falhou mesmo após todos os modelos — avisa a equipe (throttled),
        // mas ainda devolve uma resposta segura para o lead.
        await alertAiFailure(supabase, input.config, lead, input.phone).catch(() => { /* best-effort */ })
        ai = buildEmergencyConciergeResult(lead, input, fase.fase, fase.perfilFaltando, handoffContact, 'ai_empty_after_all_models')
    } else if (!(ai.reply || '').trim()) {
        if (ai.optout) {
            ai.reply = 'Tudo certo, não vou te enviar mais mensagens por aqui.'
        } else if (ai.handoff) {
            ai.reply = `Claro. Vou te passar para uma pessoa da equipe agora. Se preferir, fale direto com ${handoffContact}.`
        } else {
            const fallback = buildEmergencyConciergeResult(lead, input, fase.fase, fase.perfilFaltando, handoffContact, 'empty_reply')
            ai = {
                ...fallback,
                updates: { ...fallback.updates, ...(ai.updates ?? {}) },
                internal_note: [ai.internal_note, fallback.internal_note].filter(Boolean).join(' | '),
            }
        }
    }

    // LINK DA PÁGINA DE HABILITAÇÃO — determinístico, uma vez por lead: na
    // primeira resposta da fase de habilitação, anexa o link do formulário
    // (bulaassessoria.com/habilitacao). A instrução existe no prompt, mas o
    // modelo pulava; como o link é o caminho de menor atrito pros documentos,
    // o sistema garante o envio (flag habilitacao_link_enviado_at no persist).
    {
        const xdLink = (lead.extra_data ?? {}) as Record<string, unknown>
        if (
            fase.fase === 'habilitacao'
            && (ai.reply || '').trim()
            && !ai.handoff && !ai.optout
            && !xdLink.habilitacao_link_enviado_at
            && !(ai.reply || '').includes('bulaassessoria.com/habilitacao')
        ) {
            ai.reply = `${(ai.reply || '').trim()}\n\nSe preferir, dá pra adiantar tudo de uma vez — dados e documentos — direto no nosso site: https://bulaassessoria.com/habilitacao`
        }
    }

    // Aplica efeitos no CRM. A gravação é awaitada (o próximo turno depende
    // dela); as automações caras voltam num closure para rodar DEPOIS do envio.
    let postEffects: () => Promise<void> = async () => { /* noop */ }
    try {
        postEffects = await applyConciergeEffects(supabase, lead, ai, {
            media: input.media ?? null,
            docs,
            fase: fase.fase,
            score: leadScore,
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
        return { handled: true, silent: true, reason: optout ? 'optout_no_reply' : 'empty_reply', postEffects }
    }
    return { handled: true, silent: false, reply, botStep, handoff, optout, postEffects }
}

/* ─── Aviso de falha da IA (throttled) ─────────────────────────────────── */

const AI_ALERT_KEY = 'crm_concierge_ai_alert'
const AI_ALERT_THROTTLE_MS = 5 * 60 * 1000

/**
 * Avisa o grupo interno quando a IA volta vazia mesmo após retry — sinal de
 * instabilidade do provedor ou lead "encalhado". Throttle de 5 min via
 * site_settings para não inundar o grupo durante uma instabilidade (o timestamp
 * do último aviso é compartilhado entre execuções serverless).
 */
async function alertAiFailure(
    supabase: SupabaseClient,
    config: ConciergeConfig,
    lead: FullLead,
    phone: string,
): Promise<void> {
    if (!config.notifyGroupId) return
    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', AI_ALERT_KEY)
        .maybeSingle()
    const raw = (data?.value ?? {}) as { at?: string }
    const lastAt = raw.at ? new Date(raw.at).getTime() : 0
    if (Date.now() - lastAt < AI_ALERT_THROTTLE_MS) return
    // Marca ANTES de enviar para não duplicar em chamadas concorrentes.
    await supabase.from('site_settings').upsert(
        { key: AI_ALERT_KEY, value: { at: new Date().toISOString() }, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
    )
    const nome = lead.nome || phone || 'Lead'
    const fone = lead.celular || lead.telefone || phone || ''
    await notifyTeamGroup(supabase, [
        '⚠️ *A IA não conseguiu responder um lead*',
        `${nome}${fone ? ` — ${fone}` : ''}`,
        ufLine(lead.estado, lead.celular, lead.telefone, phone),
        'Voltou vazia mesmo após tentar de novo (possível instabilidade do provedor de IA).',
        'O lead está aguardando — o sistema tenta de novo em alguns minutos; assumam no inbox se persistir.',
    ].join('\n'))
}

async function applyConciergeEffects(
    supabase: SupabaseClient,
    lead: FullLead,
    ai: ConciergeAIResult,
    ctx: { media: InboundMedia | null; docs: { count: number; tipos: string[] }; fase: ConciergeFase; score?: LeadScore },
): Promise<() => Promise<void>> {
    const u = sanitizeUpdates(ai.updates ?? {})
    // O LLM não declara estados de submissão do cadastro: 'em_analise' é
    // gravado abaixo quando o checklist fecha, 'solicitado' pelo sync da ficha
    // e 'aprovado'/'recusado' pela decisão da leiloeira no grupo. Um modelo já
    // gravou 'solicitado' entendendo "solicitei os dados" — e o prompt lê esse
    // valor como "ficha enviada às leiloeiras".
    // ('pendente' idem: o modelo grava querendo dizer "faltam dados", mas o
    // prompt lê como "problema na análise" e responde "estamos alinhando um
    // detalhe" + handoff — observado em teste real de 22/07.)
    if (typeof u.cadastro_status === 'string' && u.cadastro_status !== 'nao_iniciado') {
        delete u.cadastro_status
    }
    const prevExtra = (lead.extra_data ?? {}) as Record<string, unknown>
    const nextExtra: Record<string, unknown> = { ...prevExtra }

    // Snapshot do termômetro — fila de follow-up ordena por prontidão e o
    // histórico permite calibrar os pesos com eventos reais depois.
    if (ctx.score) {
        nextExtra.lead_score = { ...ctx.score, at: new Date().toISOString() }
    }

    // Campos de qualificação/habilitação vivem em extra_data (sem migração —
    // segue o padrão de "schema drift" do projeto).
    const xdKeys: (keyof ConciergeUpdates)[] = [
        'objetivo_compra_resumido', 'urgencia_compra', 'experiencia_leilao',
        'sistema_producao', 'rebanho_atual',
        'ie_status', 'cadastro_status', 'score_status', 'motivo_pendencia', 'proxima_acao',
        'endereco_titular', 'fazenda_nome', 'fazenda_cidade', 'fazenda_uf',
        'retomada_combinada', 'objecao_tipo',
    ]
    for (const k of xdKeys) {
        const v = u[k]
        if (v !== undefined && v !== null && v !== '') nextExtra[k] = v
    }
    // "Quando-então": janela combinada vira timestamp p/ o follow-up saber a hora.
    if (typeof u.retomada_combinada === 'string' && u.retomada_combinada.trim()) {
        nextExtra.retomada_combinada_at = new Date().toISOString()
    }

    // Marcos do funil consultivo (alimentam a FASE da próxima mensagem).
    // A apresentação também é marcada quando a fase ERA 'apresentacao' e houve
    // resposta: nessa fase a persona obriga a apresentar, e depender só do flag
    // do modelo deixaria o lead preso apresentando de novo a cada mensagem.
    if (u.assessoria_apresentada === true || (ctx.fase === 'apresentacao' && (ai.reply || '').trim())) {
        if (!prevExtra.assessoria_apresentada_at) nextExtra.assessoria_apresentada_at = new Date().toISOString()
    }
    if (u.aceitou_assessoria === true) {
        nextExtra.aceitou_assessoria = true
        if (!prevExtra.aceitou_assessoria_at) nextExtra.aceitou_assessoria_at = new Date().toISOString()
    }
    if (ai.stage) nextExtra.qualificacao_step = ai.stage
    if (typeof ai.fast_track === 'boolean') nextExtra.fast_track = ai.fast_track
    nextExtra.concierge_last_at = new Date().toISOString()
    // Link da página de habilitação saiu nesta resposta → marca pra não repetir.
    if ((ai.reply || '').includes('bulaassessoria.com/habilitacao') && !prevExtra.habilitacao_link_enviado_at) {
        nextExtra.habilitacao_link_enviado_at = new Date().toISOString()
    }

    // Documentos reconhecidos pela IA (tipos semânticos) — união com os já vistos.
    const semanticNew = (Array.isArray(u.documentos_recebidos) ? u.documentos_recebidos : [])
        .map(d => String(d))
        .filter(d => (DOC_TIPOS_SEMANTICOS as readonly string[]).includes(d))
    if (semanticNew.length) {
        const prevDocs = Array.isArray(prevExtra.docs_recebidos)
            ? prevExtra.docs_recebidos.map(d => String(d)) : []
        nextExtra.docs_recebidos = [...new Set([...prevDocs, ...semanticNew])]
    }

    // Referências (3 com telefone, exigência da leiloeira): dado, não arquivo.
    // Acumula com as já coletadas, dedup por telefone, guarda no máx. 6.
    const refsNew = (Array.isArray(u.referencias) ? u.referencias : [])
        .map(r => String(r ?? '').trim())
        .filter(r => /\d{8,}/.test(r.replace(/\D/g, '')))
    if (refsNew.length) {
        const prevRefs = Array.isArray(prevExtra.referencias)
            ? prevExtra.referencias.map(r => String(r)) : []
        const seen = new Set<string>()
        const merged: string[] = []
        for (const r of [...prevRefs, ...refsNew]) {
            const fone = r.replace(/\D/g, '').slice(-8)
            if (fone && seen.has(fone)) continue
            if (fone) seen.add(fone)
            merged.push(r)
        }
        nextExtra.referencias = merged.slice(0, 6)
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

    // Colunas reais quando confirmadas. Toda coluna sobrescrita pela IA entra em
    // `campos_ia` — é o que permite ao card dizer se o valor veio do formulário
    // (o lead clicou num anúncio) ou da conversa (ele falou).
    const camposIa = new Set(Array.isArray(prevExtra.campos_ia) ? prevExtra.campos_ia.map(String) : [])
    const marcarIa = (coluna: string) => camposIa.add(coluna)

    if (u.interesse) {
        update.interesse_principal = u.interesse
        nextExtra.concierge_interesse = u.interesse
        marcarIa('interesse_principal')
    }
    if (u.quantidade_animais) { update.quantidade_animais = u.quantidade_animais; marcarIa('quantidade_animais') }
    if (u.estado) { update.estado = u.estado; marcarIa('estado') }
    if (u.cidade) { update.cidade = u.cidade; marcarIa('cidade') }
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
    if (camposIa.size) nextExtra.campos_ia = [...camposIa]

    // I.E. dispensada: só para lead da campanha do leilão que aceita, e só
    // depois que ELE declarou não ter. Sem isso o checklist nunca fecharia para
    // 6 de cada 10 leads da campanha, e a ficha nunca chegaria às leiloeiras.
    // A marca fica no lead (o checklist a lê), mas o AVISO ao grupo só sai na
    // hora de submeter a ficha sem I.E. — avisar aqui dispararia já na primeira
    // mensagem, porque o formulário do anúncio já traz "não tenho I.E.".
    const temIeAgora = (update.tem_inscricao_estadual as string) ?? lead.tem_inscricao_estadual
    const dispensaIe = ieDispensadaPara({ extra_data: nextExtra, tem_inscricao_estadual: temIeAgora })
    if (dispensaIe) nextExtra.ie_dispensada_leilao = dispensaIe

    // Checklist recalculado com o estado PÓS-updates — vai para extra_data
    // (UI do inbox/CRM lê daqui) e decide a etapa.
    const checklist = computeHabilitacaoChecklist({
        nome: (update.nome as string) ?? lead.nome,
        cpf: (update.cpf as string) ?? lead.cpf,
        telefone: lead.telefone,
        celular: lead.celular,
        email: (update.email as string) ?? lead.email,
        inscricao_estadual: (update.inscricao_estadual as string) ?? lead.inscricao_estadual,
        tem_inscricao_estadual: temIeAgora,
        extra_data: nextExtra,
        docsCount,
        docTipos,
        ieDispensadaPara: dispensaIe,
        documentosSimplificados: docsSimplificados({ extra_data: nextExtra }),
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
        || Boolean(nextExtra.sistema_producao || nextExtra.rebanho_atual)
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
        nextExtra.stage_history = pushStageMove(nextExtra, {
            from: lead.status || 'ENTRADA',
            to: advanced,
            reason: target.reason,
            by: 'ia',
        }).stage_history
    }

    // Aviso interno (uma vez por lead): habilitação completa → equipe revisa e
    // aprova o cadastro no CRM. Flag marcada ANTES do update p/ não duplicar.
    const shouldNotifyTeam =
        (checklist.complete || normalizeCRMStatus(advanced) === CRM_STAGE_INFO_CAPTURED)
        && !prevExtra.habilitacao_notificada_at
    if (shouldNotifyTeam) {
        nextExtra.habilitacao_notificada_at = new Date().toISOString()
    }

    // Contexto incorreto (número errado, empresa sem relação com pecuária):
    // corrigir a base e encerrar — nenhum texto persuasivo compensa contexto
    // errado, só aumenta risco de denúncia. Suprime campanhas futuras.
    if (u.contexto_incorreto === true) {
        nextExtra.contexto_incorreto_at = new Date().toISOString()
        update.optout_whatsapp = true
        update.optout_at = new Date().toISOString()
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

    // ── Daqui pra baixo: efeitos que NÃO podem atrasar a resposta ao lead ───
    // Consulta de crédito, avisos ao grupo e ficha às leiloeiras somam dezenas
    // de segundos de rede. Rodavam antes do envio — e um provedor lento fazia o
    // webhook estourar o tempo, deixando o lead sem resposta. Agora o caller
    // entrega a mensagem primeiro e chama este closure depois.
    return async function postEffects(): Promise<void> {
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
    try {
        await maybeRunCreditCheck(supabase, leadAfter, previous)
    } catch (e) {
        console.warn('[concierge] automação de crédito falhou:', e instanceof Error ? e.message : e)
    }
    if (CONCIERGE_AUTOFILL_ENABLED) {
        try {
            await maybeRunStateRegistrationCheck(supabase, leadAfter, previous, DEFAULT_JMP_MQL_RULE)
        } catch (e) {
            console.warn('[concierge] automação de I.E. falhou:', e instanceof Error ? e.message : e)
        }
    }

    // Consulta → grava no lead → submete a ficha (ou devolve o que falta).
    // Roda SEMPRE, não só na primeira vez: a submissão morava dentro do aviso
    // interno abaixo, que dispara uma vez só e ainda com o checklist incompleto
    // — quando o checklist fechava, a ficha nunca era enviada.
    const sync = await sincronizarHabilitacao(supabase, lead.id, { consultar: CONCIERGE_AUTOFILL_ENABLED }).catch(e => {
        console.warn('[concierge] sync de habilitação falhou:', e instanceof Error ? e.message : e)
        return null
    })

    // Retrato da qualificação PÓS-update (merge de update + lead + extra_data
    // novo) — vai nos avisos para o assessor que assume já entrar ciente de quem
    // é o produtor, sem abrir o CRM.
    const qualLead: QualLead = {
        interesse: (update.interesse as string) ?? lead.interesse,
        interesse_principal: (update.interesse_principal as string) ?? lead.interesse_principal,
        o_que_busca: (update.o_que_busca as string) ?? lead.o_que_busca,
        momento_pecuaria: (update.momento_pecuaria as string) ?? lead.momento_pecuaria,
        quantidade_animais: (update.quantidade_animais as string) ?? lead.quantidade_animais,
        estado: (update.estado as string) ?? lead.estado,
        cidade: (update.cidade as string) ?? lead.cidade,
        tem_inscricao_estadual: (update.tem_inscricao_estadual as string) ?? lead.tem_inscricao_estadual,
        inscricao_estadual: (update.inscricao_estadual as string) ?? lead.inscricao_estadual,
        extra_data: nextExtra,
    }
    const resumoQual = resumoQualificacaoTexto(qualLead)

    // Aviso no grupo interno (best-effort, depois do update pra não atrasar nada
    // crítico). O flag habilitacao_notificada_at já foi gravado junto do update.
    if (shouldNotifyTeam) {
        const nome = (update.nome as string) || lead.nome || lead.telefone || 'Lead'
        const fone = lead.celular || lead.telefone || ''
        const uf = ufLine((update.estado as string) ?? lead.estado, lead.celular, lead.telefone)
        const interesse = (update.interesse_principal as string) || lead.interesse_principal || lead.o_que_busca || '—'
        const cl = sync?.checklist ?? checklist
        const faltam = cl.missingLabels.length
            ? `Faltam: ${cl.missingLabels.join(', ')}`
            : 'Checklist completo'
        const cadastroLinha = sync?.submetido
            ? `📤 Ficha enviada ao grupo de ${sync.enviadosPara} leiloeira(s) — aguardando aprovado/recusado.`
            : 'Próximo passo: revisar e aprovar o cadastro no CRM.'

        const r = await notifyTeamGroup(supabase, [
            '✅ *Habilitação captada pela IA*',
            `${nome}${fone ? ` — ${fone}` : ''}`,
            uf,
            `Interesse: ${interesse} · Docs: ${docsCount} arquivo(s) · ${cl.done}/${cl.total} itens`,
            faltam,
            cadastroLinha,
            resumoQual ? `\n${resumoQual}` : '',
        ].filter(Boolean).join('\n'))
        if (!r.sent && r.reason !== 'no_group_configured') {
            console.warn('[concierge] aviso ao grupo falhou:', r.reason)
        }
    }

    // Supervisão: eventos de conversa que pedem atenção humana vão pro grupo
    // interno (Baileys). O pipeline só roda o concierge para lead que ainda NÃO
    // estava em handoff/opt-out, então estes são sempre eventos novos.
    const nomeSup = (update.nome as string) || lead.nome || lead.telefone || 'Lead'
    const foneSup = lead.celular || lead.telefone || ''
    const ufSup = ufLine((update.estado as string) ?? lead.estado, lead.celular, lead.telefone)

    if (ai.handoff && !ai.optout) {
        await notifyTeamGroup(supabase, [
            '🖐 *Lead pediu atendimento humano*',
            `${nomeSup}${foneSup ? ` — ${foneSup}` : ''}`,
            ufSup,
            ai.internal_note ? `Contexto: ${ai.internal_note}` : '',
            'O bot pausou para este lead — assumir a conversa no inbox.',
            resumoQual ? `\n${resumoQual}` : '',
        ].filter(Boolean).join('\n')).catch(() => { /* best-effort */ })
    }
    if (ai.optout) {
        await notifyTeamGroup(supabase, [
            '🔕 *Lead pediu para não receber mais mensagens (opt-out)*',
            `${nomeSup}${foneSup ? ` — ${foneSup}` : ''}`,
            ufSup,
            'Envios bloqueados automaticamente.',
        ].join('\n')).catch(() => { /* best-effort */ })
    }
    } // ← fim de postEffects
}
