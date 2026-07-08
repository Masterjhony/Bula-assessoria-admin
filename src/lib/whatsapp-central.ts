/**
 * Central WhatsApp — utilitários compartilhados
 *
 * Este módulo concentra a lógica de classificação do bot, normalização de
 * telefones e renderização de templates. Usado por:
 *   - /api/whatsapp/inbound          (mensagem recebida → classifica e responde)
 *   - /api/whatsapp/render-welcome   (renderiza welcome dinâmico para o VPS)
 *   - /api/whatsapp/templates        (CRUD de templates)
 *   - /api/whatsapp/campaigns/...    (campanhas usam o renderer também)
 */

export type Interesse =
    | 'touros'
    | 'matrizes'
    | 'embrioes'
    | 'central_embrioes'      // Central de embriões (operação) — diferente do produto "embrioes"
    | 'semen'
    | 'leiloes'
    | 'venda_genetica'        // legacy: "quero vender minha genética" (welcome-default antigo)
    | 'compra_venda_genetica' // welcome Matheus institucional — cobre comprar OU vender
    | 'oferta_genetica'       // (Academia) "quero ofertar genética"
    | 'oportunidades'         // (Academia) "quero receber oportunidades selecionadas"
    | 'interesse_amplo'       // welcome Matheus — opção "Todos"
    | 'consultor'
    | 'outro';

export interface InteresseDef {
    id: Interesse;
    label: string;
    /** Slug do template usado para responder à triagem desse interesse. */
    triagem_template_slug: string;
}

export const INTERESSES: InteresseDef[] = [
    // Os 7 primeiros existem por compatibilidade com leads históricos
    // (welcome-default antigo tinha menu 1..7). A partir do novo welcome do
    // Matheus, o mapeamento numérico default vive em DEFAULT_NUMERIC_MAP
    // (1..4) e NÃO depende mais do índice deste array.
    { id: 'touros',          label: 'Touros',                 triagem_template_slug: 'triagem-touros' },
    { id: 'matrizes',        label: 'Matrizes',               triagem_template_slug: 'triagem-matrizes' },
    { id: 'embrioes',        label: 'Embriões',               triagem_template_slug: 'triagem-embrioes' },
    { id: 'semen',           label: 'Sêmen',                  triagem_template_slug: 'triagem-semen' },
    { id: 'leiloes',         label: 'Leilões',                triagem_template_slug: 'triagem-leiloes' },
    { id: 'venda_genetica',  label: 'Venda de genética',      triagem_template_slug: 'triagem-venda-genetica' },
    { id: 'consultor',       label: 'Falar com consultor',    triagem_template_slug: 'consultor-handoff' },
    // Interesses adicionais (Academia / Matheus institucional). Acessados por id
    // pelos mapeamentos de audiência e pelas palavras-chave, nunca por índice
    // no mapeamento default.
    { id: 'oferta_genetica',       label: 'Quero ofertar genética',         triagem_template_slug: 'triagem-oferta-genetica' },
    { id: 'oportunidades',         label: 'Receber oportunidades',          triagem_template_slug: 'receber-oportunidades-academia' },
    { id: 'central_embrioes',      label: 'Central de embriões',            triagem_template_slug: 'triagem-central-embrioes' },
    { id: 'compra_venda_genetica', label: 'Compra/venda de genética',       triagem_template_slug: 'triagem-compra-venda-genetica' },
    { id: 'interesse_amplo',       label: 'Todos os segmentos',             triagem_template_slug: 'triagem-interesse-amplo' },
];

/**
 * Tag aplicada nos leads que pertencem à lista institucional
 * "Academia do Nelore P.O". Quando presente, o engine usa o mapeamento
 * numérico Academia (1..6) e prefere as variantes de template "-academia"
 * / consultor-handoff-matheus ao responder.
 */
export const ACADEMIA_TAG = 'grupo_academia_nelore_po';

/**
 * Tag aplicada nos leads que receberam o welcome institucional do Matheus
 * (template `welcome-matheus-institucional`). Quando presente, o classifier
 * usa o mapeamento numérico Matheus (1..6) com os 6 segmentos atuais da
 * empresa, em vez do mapeamento default do welcome-default.
 */
export const LISTA_MATHEUS_TAG = 'lista_matheus_personalizada';

/**
 * Tags de estado do welcome v2 (convite ao bate-papo com o Matheus).
 *
 *  - `whatsapp:bate_papo_pendente` é setada ao enviar `welcome-default` v2 e
 *    indica que o lead ainda não respondeu se quer agendar a conversa. Nessa
 *    janela, "1" = sim agendar (kind 'human') e "2" = só info (kind 'interest'
 *    com `interesse_amplo` — serve como sinal pra mostrar o menu de
 *    interesses no template `bate-papo-recusado`).
 *
 *  - `whatsapp:bate_papo_aceito` é setada quando o lead aceita o bate-papo.
 *    Existe pra timeline/CRM; o classifier não usa.
 *
 *  - `whatsapp:menu_interesses_v2` é setada quando o lead recusa o bate-papo
 *    e recebe o menu de interesses (`bate-papo-recusado`). Nesse estado os
 *    dígitos 1..4 voltam a ter o significado normal do DEFAULT_NUMERIC_MAP
 *    (sêmen / embriões / compra-venda / todos) — basta a ausência de
 *    `bate_papo_pendente` pra que o mapping default volte a valer.
 */
export const BATE_PAPO_PENDENTE_TAG = 'whatsapp:bate_papo_pendente';
export const BATE_PAPO_ACEITO_TAG   = 'whatsapp:bate_papo_aceito';
export const MENU_INTERESSES_V2_TAG = 'whatsapp:menu_interesses_v2';

/**
 * Mapeamento numérico do welcome institucional da Academia do Nelore P.O:
 *   1 — Sêmen
 *   2 — Embriões
 *   3 — Assessoria em leilões
 *   4 — Quero ofertar genética
 *   5 — Quero receber oportunidades
 *   6 — Falar com Matheus / equipe
 *
 * Diferente do welcome-default (que cobre touros/matrizes/embriões/sêmen/
 * leilões/venda/consultor), este menu é usado apenas quando o lead carrega
 * a tag `grupo_academia_nelore_po`.
 */
const ACADEMIA_NUMERIC_MAP: Record<string, Classification> = {
    '1': { kind: 'interest', interesse: 'semen' },
    '2': { kind: 'interest', interesse: 'embrioes' },
    '3': { kind: 'interest', interesse: 'leiloes' },
    '4': { kind: 'interest', interesse: 'oferta_genetica' },
    '5': { kind: 'interest', interesse: 'oportunidades' },
    '6': { kind: 'human' },
};

/**
 * Mapeamento numérico do welcome institucional do Matheus:
 *   1 — Sêmen
 *   2 — Embriões
 *   3 — Central de embriões
 *   4 — Assessoria em leilões
 *   5 — Compra/venda de genética Nelore P.O
 *   6 — Todos
 *
 * Usado quando o lead carrega a tag `lista_matheus_personalizada`.
 * Diferente da Academia (que tem opção 6 = "Falar com Matheus") — aqui a
 * apresentação já é do Matheus e o "humano" entra via PARAR/keyword/inbox.
 */
const LISTA_MATHEUS_NUMERIC_MAP: Record<string, Classification> = {
    '1': { kind: 'interest', interesse: 'semen' },
    '2': { kind: 'interest', interesse: 'embrioes' },
    '3': { kind: 'interest', interesse: 'central_embrioes' },
    '4': { kind: 'interest', interesse: 'leiloes' },
    '5': { kind: 'interest', interesse: 'compra_venda_genetica' },
    '6': { kind: 'interest', interesse: 'interesse_amplo' },
};

/**
 * Mapeamento numérico do welcome-default (novo padrão, voz do Matheus em
 * primeira pessoa). Fonte canônica para todo lead sem tag de audiência
 * específica (Academia / Lista Matheus):
 *
 *   1 — Sêmen
 *   2 — Embriões
 *   3 — Compra e venda de genética Nelore P.O
 *   4 — Todos
 *
 * Substituiu o mapeamento legado por índice de INTERESSES (1..7) que cobria
 * touros/matrizes/embrioes/semen/leiloes/venda/consultor. Para sair da lista
 * o lead responde PARAR; para falar com humano basta usar palavras como
 * "consultor", "Matheus" ou "humano" (HUMAN_WORDS). Os interesses legados
 * (touros, matrizes, central de embriões, leilões etc.) continuam acessíveis
 * via match por palavra-chave abaixo.
 */
const DEFAULT_NUMERIC_MAP: Record<string, Classification> = {
    '1': { kind: 'interest', interesse: 'semen' },
    '2': { kind: 'interest', interesse: 'embrioes' },
    '3': { kind: 'interest', interesse: 'compra_venda_genetica' },
    '4': { kind: 'interest', interesse: 'interesse_amplo' },
};

/**
 * Mapeamento numérico do welcome v2 (convite ao bate-papo com o Matheus).
 * Só vale enquanto o lead tem a tag `BATE_PAPO_PENDENTE_TAG` — ou seja, na
 * janela entre receber o welcome e responder se topa ou não a conversa:
 *
 *   1 — Sim, agendar bate-papo  → kind 'human' (lane do handoff bifurca pra
 *                                  enviar `bate-papo-aceito` com o link do
 *                                  Calendly em vez de `consultor-handoff`).
 *   2 — Não, só info por aqui  → kind 'interest' / interesse_amplo (a lane do
 *                                  interesse bifurca pra enviar
 *                                  `bate-papo-recusado` com o menu de
 *                                  interesses).
 *
 * Quando o lead sai dessa janela (tag `BATE_PAPO_PENDENTE_TAG` removida pelo
 * grafo após responder), o DEFAULT_NUMERIC_MAP volta a valer normalmente.
 */
const BATE_PAPO_PENDENTE_NUMERIC_MAP: Record<string, Classification> = {
    '1': { kind: 'human' },
    '2': { kind: 'interest', interesse: 'interesse_amplo' },
};

/**
 * Normaliza um telefone para o formato armazenado em crm_leads.telefone:
 * apenas dígitos, com DDI (55) à frente. Retorna null se não puder normalizar.
 */
export function normalizePhone(input: string): string | null {
    if (!input) return null;
    let cleaned = input.replace(/\D/g, '');
    if (!cleaned) return null;
    if (cleaned.startsWith('55') && cleaned.length >= 12) {
        // já tem DDI
    } else if (cleaned.length === 10 || cleaned.length === 11) {
        cleaned = `55${cleaned}`;
    }
    if (cleaned.length < 12 || cleaned.length > 13) return null;
    return cleaned;
}

/** Variantes do mesmo número que podem aparecer salvas no CRM histórico. */
export function phoneVariants(phone: string): string[] {
    const variants = new Set<string>();
    const onlyDigits = phone.replace(/\D/g, '');
    if (!onlyDigits) return [];

    variants.add(onlyDigits);
    if (onlyDigits.startsWith('55')) {
        variants.add(onlyDigits.slice(2));
    } else {
        variants.add(`55${onlyDigits}`);
    }

    // Variante sem o nono dígito (números mais antigos no CRM podem ter sido
    // gravados com 10 dígitos: DDD + 8 dígitos).
    const woDdi = onlyDigits.startsWith('55') ? onlyDigits.slice(2) : onlyDigits;
    if (woDdi.length === 11 && woDdi[2] === '9') {
        const drop9 = woDdi.slice(0, 2) + woDdi.slice(3);
        variants.add(drop9);
        variants.add(`55${drop9}`);
    } else if (woDdi.length === 10) {
        const add9 = woDdi.slice(0, 2) + '9' + woDdi.slice(2);
        variants.add(add9);
        variants.add(`55${add9}`);
    }

    // Variantes FORMATADAS "(DD) 98108-0075" — imports de planilha gravaram o
    // telefone assim no CRM; sem elas o lookup por telefone nunca casava esses
    // leads (a conversa aparecia "sem lead vinculado" no inbox).
    for (const v of [...variants]) {
        const d = v.startsWith('55') ? v.slice(2) : v;
        if (d.length === 11) variants.add(`(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`);
        else if (d.length === 10) variants.add(`(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`);
    }

    return [...variants];
}

// Opt-out determinístico: SÓ comando inequívoco — a mensagem INTEIRA é a
// palavra (ex.: "PARAR") ou uma frase explícita de descadastro. O match antigo
// por includes/startsWith marcava falso positivo demais ("vou SAIR pra
// fazenda", "PAREce bom", "quero CANCELAR o boleto" → opt-out indevido).
// Com o concierge (IA) ligado este classificador nem decide opt-out — a IA
// decide pelo contexto (ver whatsapp-inbound.ts / persona do concierge).
const STOP_WORDS = ['parar', 'sair', 'cancelar', 'remover', 'pare', 'descadastrar', 'unsubscribe'];
const STOP_PHRASES = [
    'parar de receber', 'quero parar de receber', 'nao quero receber',
    'nao quero mais receber', 'nao mandar mais', 'nao me mande mais',
    'me tira da lista', 'me tirem da lista', 'remover da lista', 'me descadastra',
];
const RESUBSCRIBE_WORDS = ['voltar', 'reativar', 'reinscrever'];
const HUMAN_WORDS = [
    'consultor', 'humano', 'atendente', 'pessoa', 'equipe', 'atendimento humano',
    'falar com alguem', 'falar com alguém', 'falar com matheus', 'matheus',
];

/**
 * Classificação determinística (sem IA) da intenção da mensagem.
 *
 * Regras (em ordem):
 *   1. Opt-out: PARAR / SAIR / CANCELAR…
 *   2. Re-subscribe: VOLTAR / REATIVAR…
 *   3. Pedido explícito de humano: "consultor", "humano", "atendente", "Matheus"…
 *   4. Resposta numérica do menu — mapeamento depende da audiência:
 *        - Lista Matheus (tag `lista_matheus_personalizada`): 1..6 institucional
 *        - Academia (tag `grupo_academia_nelore_po`): 1..6 menu institucional
 *        - Default: 1..4 — DEFAULT_NUMERIC_MAP (welcome-default voz Matheus:
 *          sêmen, embriões, compra/venda de genética, todos)
 *   5. Match por palavras-chave do interesse (touro, matriz, embrião, sêmen,
 *      leilão, venda, ofertar, oportunidades).
 *   6. Caso contrário: 'unknown' — ainda registramos a mensagem mas não
 *      respondemos automaticamente (evita spam do bot quando o lead já está
 *      conversando livremente com a equipe).
 */
export type Classification =
    | { kind: 'optout' }
    | { kind: 'resubscribe' }
    | { kind: 'human' }
    | { kind: 'interest'; interesse: Interesse }
    | { kind: 'unknown' };

export interface ClassifyContext {
    /** Tags WhatsApp do lead (vindas de crm_leads.tags_whatsapp) */
    tags?: string[] | null;
}

function isAcademiaAudience(ctx?: ClassifyContext): boolean {
    if (!ctx?.tags) return false;
    return ctx.tags.includes(ACADEMIA_TAG);
}

function isListaMatheusAudience(ctx?: ClassifyContext): boolean {
    if (!ctx?.tags) return false;
    return ctx.tags.includes(LISTA_MATHEUS_TAG);
}

function isBatePapoPendente(ctx?: ClassifyContext): boolean {
    if (!ctx?.tags) return false;
    return ctx.tags.includes(BATE_PAPO_PENDENTE_TAG);
}

export function classifyMessage(text: string, ctx?: ClassifyContext): Classification {
    const raw = (text || '').trim();
    if (!raw) return { kind: 'unknown' };
    const lower = raw.toLowerCase();
    const stripped = lower.normalize('NFD').replace(/[̀-ͯ]/g, '');

    // Mensagem inteira = comando (tolera pontuação final) ou frase explícita.
    const strippedBare = stripped.replace(/[!.?\s]+$/g, '');
    if (STOP_WORDS.includes(strippedBare) || STOP_PHRASES.some(p => stripped.includes(p))) {
        return { kind: 'optout' };
    }
    if (RESUBSCRIBE_WORDS.some(w => stripped === w || stripped.startsWith(w))) {
        return { kind: 'resubscribe' };
    }
    if (HUMAN_WORDS.some(w => stripped.includes(w))) {
        return { kind: 'human' };
    }

    // Match numérico — apenas se a mensagem é só o número
    const onlyNumber = raw.match(/^([1-7])\s*[️⃣]?$/);
    if (onlyNumber) {
        const digit = onlyNumber[1];
        // Estado "bate-papo pendente" (welcome v2 enviado, lead ainda não
        // respondeu se topa a conversa) tem prioridade absoluta: enquanto a
        // tag estiver presente, 1 = sim agendar e 2 = só info. A tag é
        // removida pelo grafo após a resposta, voltando aos mapeamentos
        // normais por audiência.
        if (isBatePapoPendente(ctx) && BATE_PAPO_PENDENTE_NUMERIC_MAP[digit]) {
            return BATE_PAPO_PENDENTE_NUMERIC_MAP[digit];
        }
        // Audiências específicas têm prioridade sobre o mapeamento default.
        // Lista Matheus institucional > Academia > default. Um lead pode ter
        // as duas tags se passou pelos dois fluxos — Matheus é o mais novo.
        if (isListaMatheusAudience(ctx) && LISTA_MATHEUS_NUMERIC_MAP[digit]) {
            return LISTA_MATHEUS_NUMERIC_MAP[digit];
        }
        if (isAcademiaAudience(ctx) && ACADEMIA_NUMERIC_MAP[digit]) {
            return ACADEMIA_NUMERIC_MAP[digit];
        }
        // Default = welcome-default do Matheus, 4 opções (1..4).
        // Dígitos 5..7 caem aqui por leads que receberam welcome-default antigo;
        // tratamos como unknown (deixa fluir para keyword match abaixo).
        if (DEFAULT_NUMERIC_MAP[digit]) {
            return DEFAULT_NUMERIC_MAP[digit];
        }
    }

    // ── Match exato das opções da enquete do welcome Matheus institucional ─
    // Estas regras são checadas ANTES das keywords genéricas porque os textos
    // se sobrepõem (ex.: "Central de embriões" casaria com /\bembri/ se viesse
    // depois). Tratam o que o WhatsApp envia quando o lead clica numa opção
    // da poll nativa.
    if (/^todos$|^todos os|todos os segmentos|interesse amplo/.test(stripped)) {
        return { kind: 'interest', interesse: 'interesse_amplo' };
    }
    if (/central.{0,5}embri|central.{0,5}embrioes|central.{0,5}embriao/.test(stripped)) {
        return { kind: 'interest', interesse: 'central_embrioes' };
    }
    if (/compra.{0,3}\/?\s*venda|compra e venda|venda e compra/.test(stripped)) {
        return { kind: 'interest', interesse: 'compra_venda_genetica' };
    }

    // ── Keywords genéricas ─────────────────────────────────────────────────
    if (/\btouros?\b/.test(stripped)) return { kind: 'interest', interesse: 'touros' };
    if (/\bmatriz/.test(stripped))    return { kind: 'interest', interesse: 'matrizes' };
    if (/\bembri/.test(stripped))     return { kind: 'interest', interesse: 'embrioes' };
    if (/\bsemen|\bsemem|\bsêmen|\bdoses?\b/.test(stripped)) return { kind: 'interest', interesse: 'semen' };
    if (/\bleil|assessoria/.test(stripped)) return { kind: 'interest', interesse: 'leiloes' };
    // "ofertar / ofereço / tenho genética" → oferta_genetica (variante institucional)
    if (/\bofert|\bofere[cç]|tenho genetic/.test(stripped)) {
        return { kind: 'interest', interesse: 'oferta_genetica' };
    }
    // "receber oportunidades / lista / avisos"
    if (/\boportunidades?\b|\blista\b|\bavisos?\b|quero receber/.test(stripped)) {
        return { kind: 'interest', interesse: 'oportunidades' };
    }
    if (/\bvender?\b|\brevender|venda de genetic/.test(stripped)) return { kind: 'interest', interesse: 'venda_genetica' };

    return { kind: 'unknown' };
}

/**
 * Substitui variáveis em um corpo de template. Aceita {nome}, {name}, etc.
 * Variáveis ausentes viram string vazia (não polui a mensagem com placeholders).
 */
export function renderTemplate(body: string, vars: Record<string, string | null | undefined>): string {
    return body.replace(/\{(\w+)\}/g, (_match, key) => {
        const v = vars[key as keyof typeof vars];
        if (v === null || v === undefined) return '';
        return String(v);
    });
}

/**
 * Primeiro nome de um nome completo — útil para tornar mensagens menos
 * formais e para casar com "{nome}" nos templates.
 */
export function firstName(full?: string | null): string {
    if (!full) return '';
    return full.trim().split(/\s+/)[0] || '';
}
