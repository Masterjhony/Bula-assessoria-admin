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
    color?: string;
}

export interface CRMConfig {
    stages: CRMStage[];
    custom_fields: CRMCustomField[];
    funnels: CRMFunnel[];
    responsaveis: CRMResponsavel[];
}

export const DEFAULT_STAGES: CRMStage[] = [
    { id: 'Lead', name: 'Lead', color: 'pink', probability: 10, is_qualification: true },
    { id: 'Qualificado', name: 'Qualificado', color: 'orange', probability: 25 },
    { id: 'Proposta', name: 'Proposta', color: 'blue', probability: 50 },
    { id: 'Negociação', name: 'Negociação', color: 'purple', probability: 75 },
    { id: 'Fechado', name: 'Fechado', color: 'green', probability: 100 },
    { id: 'Perdido', name: 'Perdido', color: 'red', probability: 0 },
    { id: 'Sem Status', name: 'Sem Status', color: 'gray', probability: 0 },
];

/** Flag heurística (caso o usuário tenha config legada sem is_qualification). */
export const DEFAULT_QUALIFICATION_STAGE_IDS = ['Lead', 'Sem Status'];

export function isQualificationStage(stage: CRMStage | undefined | null): boolean {
    if (!stage) return false;
    if (typeof stage.is_qualification === 'boolean') return stage.is_qualification;
    return DEFAULT_QUALIFICATION_STAGE_IDS.includes(stage.id);
}

export const DEFAULT_FUNNEL: CRMFunnel = {
    id: 'default',
    name: 'Pipeline Principal',
    color: 'yellow',
    stages: DEFAULT_STAGES,
    custom_fields: [],
};

/** Regra de MQL padrão do Funil JMP: ≥100 cabeças E tem Inscrição Estadual. */
export const DEFAULT_JMP_MQL_RULE: CRMMqlRule = { min_cabecas: 100, require_ie: true };

/** Id fixo do funil que recebe os leads do formulário jmp.bulaassessoria.com. */
export const JMP_FUNNEL_ID = 'funnel_jmp';

/**
 * Funil dedicado aos leads da landing JMP. É sempre garantido por getCRMConfig
 * (mesmo que o admin nunca o tenha salvo), para que o seletor de funil e a regra
 * de MQL existam de cara. As etapas espelham o pipeline padrão.
 */
export const JMP_FUNNEL: CRMFunnel = {
    id: JMP_FUNNEL_ID,
    name: 'Funil JMP',
    color: 'green',
    stages: DEFAULT_STAGES,
    custom_fields: [],
    mql_rule: DEFAULT_JMP_MQL_RULE,
};

export const DEFAULT_CRM_CONFIG: CRMConfig = {
    stages: DEFAULT_STAGES,
    custom_fields: [],
    funnels: [DEFAULT_FUNNEL, JMP_FUNNEL],
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

/**
 * Avalia se um lead é MQL segundo a regra do funil.
 * - cabeças: piso da faixa precisa ser ≥ min_cabecas (default 100)
 * - IE: se require_ie, tem_inscricao_estadual precisa ser "Sim"
 */
export function evaluateMql(
    rule: CRMMqlRule | undefined | null,
    lead: { quantidade_animais?: string | null; tem_inscricao_estadual?: string | null }
): boolean {
    const min = rule?.min_cabecas ?? 100;
    const floor = parseCabecasFloor(lead.quantidade_animais);
    const hasHeads = floor != null && floor >= min;
    const requireIe = rule?.require_ie ?? false;
    const ieOk = !requireIe || (lead.tem_inscricao_estadual || '').trim().toLowerCase() === 'sim';
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
