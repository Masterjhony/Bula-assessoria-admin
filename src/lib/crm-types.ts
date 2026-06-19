export interface CRMStage {
    id: string;
    name: string;
    color: string;
    probability?: number; // 0-100, default win probability for this stage
    /** Marca essa etapa como pré-CRM (entrada para qualificar). Não aparece no Kanban principal. */
    is_qualification?: boolean;
}

export interface CRMCustomField {
    id: string;
    label: string;
    type: 'text' | 'textarea' | 'number' | 'date' | 'select';
    options?: string[];
    required?: boolean;
}

/**
 * Critério que define quando um lead deste funil é MQL (Marketing Qualified Lead).
 * Editável por funil nas Configurações do CRM.
 */
export interface CRMMqlRule {
    /** Mínimo de cabeças (piso da faixa) para o lead ser MQL. Default 100. */
    min_cabecas?: number | null;
    /** Se true, o lead só é MQL quando tem Inscrição Estadual ("Sim"). */
    require_ie?: boolean;
}

export interface CRMFunnel {
    id: string;
    name: string;
    color?: string;
    stages: CRMStage[];
    custom_fields: CRMCustomField[];
    /** Regra de MQL deste funil. Ausente = sem qualificação automática por regra. */
    mql_rule?: CRMMqlRule;
}

export interface CRMResponsavel {
    id: string;
    name: string;
    email?: string;
    whatsapp?: string;
    role?: string;
    color?: string;
    active?: boolean;
}

export interface CRMConfig {
    stages: CRMStage[];
    custom_fields: CRMCustomField[];
    funnels: CRMFunnel[];
    responsaveis: CRMResponsavel[];
}

/** Fila pré-CRM (página "Entrada Leads"). Não aparece como coluna no Kanban. */
export const CRM_STAGE_ENTRY = 'ENTRADA';
export const CRM_STAGE_CONNECTION = 'CONEXÃO';
export const CRM_STAGE_QUALIFICATION = 'QUALIFICAÇÃO';
export const CRM_STAGE_REGISTRATION = 'CADASTRO';
export const CRM_STAGE_ASSESSORS = 'ASSESSORES';

export const DEFAULT_STAGES: CRMStage[] = [
    // Entrada Leads: triagem pré-CRM (is_qualification). Ao "Mover para o CRM" o
    // lead sai daqui e cai em CONEXÃO — a primeira coluna do Kanban.
    { id: 'entrada', name: CRM_STAGE_ENTRY, color: 'gray', probability: 5, is_qualification: true },
    { id: 'conexao', name: CRM_STAGE_CONNECTION, color: 'blue', probability: 10, is_qualification: false },
    { id: 'qualificacao', name: CRM_STAGE_QUALIFICATION, color: 'orange', probability: 25, is_qualification: false },
    { id: 'cadastro', name: CRM_STAGE_REGISTRATION, color: 'yellow', probability: 50 },
    // ASSESSORES foi extinta: o lead aprovado no CADASTRO vira cliente e é
    // arquivado (sai do Kanban) — ver crm-to-clientes-sync. O CADASTRO é a
    // última etapa do pipeline.
];

/** Flag heurística (caso o usuário tenha config legada sem is_qualification). */
export const DEFAULT_QUALIFICATION_STAGE_IDS = ['entrada', 'Lead', 'Sem Status'];

/** Etapa que dispara a automação de encaminhamento do lead para o assessor. */
export const ASSESSOR_NOTIFICATION_STAGE = CRM_STAGE_ASSESSORS;

function normalizeStageLookup(value?: string | null): string {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

export function normalizeCRMStatus(status?: string | null): string {
    const key = normalizeStageLookup(status);

    // Vazio ou rótulos legados de captação → fila pré-CRM (Entrada Leads).
    if (!key || key === 'lead' || key === 'sem status' || key === 'entrada') {
        return CRM_STAGE_ENTRY;
    }

    if (key === 'conexao') return CRM_STAGE_CONNECTION;
    if (key === 'qualificacao') return CRM_STAGE_QUALIFICATION;
    if (key === 'cadastro' || key === 'qualificado') return CRM_STAGE_REGISTRATION;

    // ASSESSORES extinta: status legados avançados caem no CADASTRO (última
    // etapa). Leads que estavam em ASSESSORES são arquivados pela migração.
    if (
        key === 'assessores' ||
        key === 'direcionamento leilao' ||
        key === 'proposta' ||
        key === 'negociacao' ||
        key === 'fechado'
    ) {
        return CRM_STAGE_REGISTRATION;
    }

    if (key === 'perdido') return CRM_STAGE_QUALIFICATION;

    return DEFAULT_STAGES.some(stage => normalizeStageLookup(stage.name) === key)
        ? status!.trim()
        : CRM_STAGE_ENTRY;
}

export function isQualificationStage(stage: CRMStage | undefined | null): boolean {
    if (!stage) return false;
    if (typeof stage.is_qualification === 'boolean') return stage.is_qualification;
    return DEFAULT_QUALIFICATION_STAGE_IDS.includes(stage.id);
}

/** Regra de MQL padrão do Funil JMP: ≥100 cabeças E tem Inscrição Estadual. */
export const DEFAULT_JMP_MQL_RULE: CRMMqlRule = { min_cabecas: 100, require_ie: true };

export const DEFAULT_FUNNEL: CRMFunnel = {
    id: 'default',
    name: 'Funil Unificado',
    color: 'yellow',
    stages: DEFAULT_STAGES,
    custom_fields: [],
    mql_rule: DEFAULT_JMP_MQL_RULE,
};

/**
 * Id do funil que recebe os leads da landing JMP. Mantido como alias por
 * compatibilidade com imports antigos, mas agora tudo entra no funil unificado.
 */
export const JMP_FUNNEL_ID = 'default';

/**
 * Funil dedicado aos leads da landing JMP. É sempre garantido por getCRMConfig
 * (mesmo que o admin nunca o tenha salvo), para que o seletor de funil e a regra
 * de MQL existam de cara. As etapas espelham o pipeline padrão.
 */
export const JMP_FUNNEL: CRMFunnel = {
    ...DEFAULT_FUNNEL,
    id: JMP_FUNNEL_ID,
};

export const DEFAULT_CRM_CONFIG: CRMConfig = {
    stages: DEFAULT_STAGES,
    custom_fields: [],
    funnels: [DEFAULT_FUNNEL],
    responsaveis: [],
};

/**
 * Extrai o piso numérico de uma faixa de cabeças vinda do quiz/landing:
 *   "100-300" → 100 · "500+" → 500 · "50-100" → 50 · "250" → 250 · "nenhuma" → 0
 * Usa o primeiro número da string (o limite inferior da faixa), que é o valor
 * conservador para comparar com o mínimo exigido.
 */
export function parseCabecasFloor(value?: string | null): number | null {
    if (value == null) return null;
    const v = String(value).trim().toLowerCase();
    if (!v) return null;
    if (v === 'nenhuma') return 0;
    const m = v.match(/\d+/);
    return m ? Number(m[0]) : null;
}

export function hasStateRegistration(flag?: string | null, number?: string | null): boolean {
    const normalizedFlag = String(flag ?? '').trim().toLowerCase();
    const normalizedNumber = String(number ?? '').trim();
    return normalizedFlag === 'sim' || normalizedNumber.length > 0;
}

/**
 * Avalia se um lead é MQL segundo a regra do funil.
 * - cabeças: piso da faixa precisa ser ≥ min_cabecas (default 100)
 * - IE: por padrão exige "Tem I.E. = Sim" ou número de inscrição preenchido
 */
export function evaluateMql(
    rule: CRMMqlRule | undefined | null,
    lead: {
        quantidade_animais?: string | null;
        tem_inscricao_estadual?: string | null;
        inscricao_estadual?: string | null;
    }
): boolean {
    const min = rule?.min_cabecas ?? 100;
    const floor = parseCabecasFloor(lead.quantidade_animais);
    const hasHeads = floor != null && floor >= min;
    const requireIe = rule?.require_ie ?? true;
    const ieOk = !requireIe || hasStateRegistration(lead.tem_inscricao_estadual, lead.inscricao_estadual);
    return hasHeads && ieOk;
}

export const STAGE_COLOR_HEX: Record<string, string> = {
    pink: '#ec4899',
    orange: '#f97316',
    blue: '#3b82f6',
    purple: '#a855f7',
    green: '#22c55e',
    red: '#ef4444',
    gray: '#6b7280',
    yellow: '#eab308',
    cyan: '#06b6d4',
    indigo: '#6366f1',
};

export function getStageColorHex(color?: string): string {
    if (!color) return STAGE_COLOR_HEX.gray;
    return STAGE_COLOR_HEX[color] || color;
}
