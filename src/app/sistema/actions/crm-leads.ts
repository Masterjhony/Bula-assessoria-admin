'use server';

import { createClient } from '@/utils/supabase/server';
import { supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { dispatchCrmWelcome } from '@/lib/crm-welcome';
import {
    CRM_STAGE_ENTRY,
    CRM_STAGE_CONNECTION,
    CRM_STAGE_QUALIFICATION,
    CRM_STAGE_INFO_CAPTURED,
    CRM_STAGE_REGISTRATION,
    DEFAULT_JMP_MQL_RULE,
    evaluateMql,
    JMP_FUNNEL_ID,
    normalizeCRMStatus,
} from '@/lib/crm-types';
import { getCRMConfig } from './crm-config';
import { maybeNotifyAssessorOnLeadStage } from '@/lib/crm-whatsapp-assessor';
import { maybeRunStateRegistrationCheck } from '@/lib/crm-state-registration-automation';
import { maybeRunCreditCheck } from '@/lib/crm-credit-automation';
import { syncLeadToClientes } from '@/lib/crm-to-clientes-sync';
import {
    readSheetLeadRows, readSheetLeadRowsWithColor, readCadastroSheetRows,
    readSecondaryTabLeadRows, LEADS_BULA_TAB,
    type SheetLeadRow, type SheetColor, type CadastroSheetRow,
} from '@/lib/jmp-sheets';
import { normalizePhone, phoneVariants } from '@/lib/whatsapp-central';

export interface CRMContactEntry {
    id: string;              // uuid local
    type: 'ligacao' | 'whatsapp' | 'email' | 'visita' | 'outro';
    date: string;            // ISO
    notes?: string | null;
    by?: string | null;      // responsável que fez o contato
}

export interface CRMLead {
    id: string;
    nome: string;
    status: string;
    prioridade?: string | null;
    interesse?: string | null;
    empresa?: string | null;
    ultimo_contato?: string | null;
    data_estimada_fechamento?: string | null;
    telefone?: string | null;
    celular?: string | null;
    responsavel?: string | null;
    created_at: string;
    updated_at: string;
    position: number;
    // Identificação fiscal
    cpf?: string | null;
    inscricao_estadual?: string | null;
    tem_inscricao_estadual?: string | null;
    score_serasa?: number | null;
    pendencias_financeiras?: string | null;
    // Funil de vendas
    funnel_id?: string | null;
    valor_estimado?: number | null;
    probabilidade?: number | null;
    temperatura?: string | null;
    // Campos da integração Google Sheets / LP
    instagram?: string | null;
    estado?: string | null;
    cidade?: string | null;
    o_que_busca?: string | null;
    quantidade_animais?: string | null;
    momento_pecuaria?: string | null;
    operacao_pecuaria?: string | null;
    intencao_investimento?: string | null;
    assessoria?: string | null;
    is_mql?: boolean | null;
    source_page?: string | null;
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
    gclid?: string | null;
    fbclid?: string | null;
    referrer?: string | null;
    landing_url?: string | null;
    email?: string | null;
    notes?: string | null;
    origem?: string | null;
    data_entrada?: string | null;
    extra_data?: Record<string, any> | null;
    // Qualificação / Contatos
    contact_history?: CRMContactEntry[] | null;
    is_preferencial?: boolean | null;
    contact_count?: number | null;
    // Arquivamento (soft-delete)
    arquivado?: boolean | null;
    arquivado_at?: string | null;
}

// Colunas reais da tabela crm_leads que o painel pode gravar. Qualquer chave
// fora desta lista é descartada antes do INSERT/UPDATE — evita o erro
// "column ... does not exist" quando o formulário envia um campo só de UI.
const WRITABLE_COLUMNS = new Set<string>([
    'nome', 'status', 'prioridade', 'interesse', 'empresa', 'ultimo_contato',
    'data_estimada_fechamento', 'telefone', 'celular', 'responsavel', 'position',
    'cpf', 'inscricao_estadual', 'tem_inscricao_estadual',
    'score_serasa', 'pendencias_financeiras',
    'funnel_id', 'valor_estimado', 'probabilidade', 'temperatura',
    'instagram', 'estado', 'cidade', 'o_que_busca', 'quantidade_animais',
    'momento_pecuaria', 'operacao_pecuaria', 'intencao_investimento', 'assessoria', 'is_mql',
    'source_page', 'source', 'medium', 'campaign', 'utm_content', 'utm_term',
    'gclid', 'fbclid', 'referrer', 'landing_url', 'email', 'notes', 'origem',
    'data_entrada', 'extra_data', 'contact_history', 'is_preferencial', 'contact_count',
    'arquivado', 'arquivado_at',
]);

/** Remove chaves que não são colunas graváveis (id/created_at/updated_at e campos só de UI). */
function sanitizeLeadData(data: Partial<CRMLead>): Partial<CRMLead> {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        if (!WRITABLE_COLUMNS.has(key)) continue;
        clean[key] = key === 'status' ? normalizeCRMStatus(String(value || '')) : value;
    }
    return clean as Partial<CRMLead>;
}

function normalizeLeadRow<T extends CRMLead>(lead: T): T {
    return { ...lead, status: normalizeCRMStatus(lead.status) };
}

function normalizeLeadRows(data: CRMLead[] | null | undefined): CRMLead[] {
    return (data ?? []).map(lead => normalizeLeadRow(lead));
}

async function notifyAssessorIfNeeded(
    supabase: Awaited<ReturnType<typeof createClient>>,
    lead: CRMLead,
    previous?: Pick<CRMLead, 'status' | 'responsavel' | 'extra_data'> | null,
) {
    try {
        const config = await getCRMConfig();
        await maybeNotifyAssessorOnLeadStage(supabase as any, config, lead, previous);
    } catch (e) {
        console.warn('[CRM] Falha ao notificar assessor no WhatsApp:', e instanceof Error ? e.message : e);
    }
}

// Dispara a consulta de score/protestos quando o lead entra na QUALIFICAÇÃO
// (ver crm-credit-automation). Best-effort: não derruba a ação que chamou.
async function runCreditCheckIfNeeded(
    supabase: Awaited<ReturnType<typeof createClient>>,
    lead: CRMLead,
    previous?: Pick<CRMLead, 'status'> | null,
) {
    try {
        await maybeRunCreditCheck(supabase as any, lead as any, previous as any);
    } catch (e) {
        console.warn('[CRM] Falha na automação de crédito:', e instanceof Error ? e.message : e);
    }
}

// Consulta I.E. por CPF/UF quando o lead entra na QUALIFICACAO.
// Best-effort e economica: por padrao consulta apenas a UF do lead.
async function runStateRegistrationCheckIfNeeded(
    supabase: Awaited<ReturnType<typeof createClient>>,
    lead: CRMLead,
    previous?: Pick<CRMLead, 'status'> | null,
) {
    try {
        const config = await getCRMConfig();
        const rule = config.funnels.find(f => f.id === (lead.funnel_id || JMP_FUNNEL_ID))?.mql_rule ?? DEFAULT_JMP_MQL_RULE;
        await maybeRunStateRegistrationCheck(supabase as any, lead as any, previous as any, rule);
    } catch (e) {
        console.warn('[CRM] Falha na automacao de I.E.:', e instanceof Error ? e.message : e);
    }
}

// Quando o lead chega na etapa CADASTRO já aprovado, vira cliente e é arquivado
// no CRM (ver crm-to-clientes-sync). Best-effort.
async function syncLeadToClientesIfApproved(
    supabase: Awaited<ReturnType<typeof createClient>>,
    lead: CRMLead,
    force = false,
) {
    try {
        await syncLeadToClientes(supabase as any, lead as any, { force });
    } catch (e) {
        console.warn('[CRM] Falha ao migrar lead para Clientes:', e instanceof Error ? e.message : e);
    }
}

type MqlSource = Pick<CRMLead, 'quantidade_animais' | 'tem_inscricao_estadual' | 'inscricao_estadual' | 'funnel_id'>;

async function withComputedMql(data: Partial<CRMLead>, previous?: Partial<MqlSource> | null): Promise<Partial<CRMLead>> {
    const merged = { ...(previous || {}), ...data };
    const config = await getCRMConfig();
    const funnelId = merged.funnel_id || JMP_FUNNEL_ID;
    const rule = config.funnels.find(f => f.id === funnelId)?.mql_rule ?? DEFAULT_JMP_MQL_RULE;
    return {
        ...data,
        is_mql: evaluateMql(rule, {
            quantidade_animais: merged.quantidade_animais,
            tem_inscricao_estadual: merged.tem_inscricao_estadual,
            inscricao_estadual: merged.inscricao_estadual,
        }),
    };
}

function shouldComputeMql(data: Partial<CRMLead>): boolean {
    return (
        'is_mql' in data ||
        'quantidade_animais' in data ||
        'tem_inscricao_estadual' in data ||
        'inscricao_estadual' in data ||
        'funnel_id' in data
    );
}

export async function getLeads(funnelId?: string): Promise<CRMLead[]> {
    const supabase = await createClient();

    // Leads arquivados ficam de fora de todas as telas operacionais — só aparecem
    // na aba "Arquivados" (getArchivedLeads).
    let query = supabase
        .from('crm_leads')
        .select('*')
        .eq('arquivado', false)
        .order('position', { ascending: true });

    if (funnelId) {
        query = query.eq('funnel_id', funnelId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching CRM leads:', error);
        return [];
    }

    return normalizeLeadRows(data as CRMLead[]);
}

/** Leads arquivados (soft-delete), mais recentes primeiro. Usado pela aba "Arquivados". */
export async function getArchivedLeads(): Promise<CRMLead[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('arquivado', true)
        .order('arquivado_at', { ascending: false });

    if (error) {
        console.error('Error fetching archived CRM leads:', error);
        return [];
    }

    return normalizeLeadRows(data as CRMLead[]);
}

/** Arquiva um lead (soft-delete): some das telas operacionais, mas continua no banco. */
export async function archiveLead(id: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('crm_leads')
        .update({ arquivado: true, arquivado_at: new Date().toISOString() })
        .eq('id', id);

    if (error) throw new Error(`Error archiving lead: ${error.message}`);

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/funil-vendas');
}

/** Restaura um lead arquivado de volta para as telas operacionais. */
export async function unarchiveLead(id: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('crm_leads')
        .update({ arquivado: false, arquivado_at: null })
        .eq('id', id);

    if (error) throw new Error(`Error unarchiving lead: ${error.message}`);

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/funil-vendas');
}

export async function createLead(data: Partial<CRMLead>): Promise<CRMLead> {
    const supabase = await createClient();
    const payload = sanitizeLeadData(await withComputedMql(data));
    if (!payload.status) payload.status = CRM_STAGE_ENTRY;

    const { data: newLead, error } = await supabase
        .from('crm_leads')
        .insert([payload])
        .select()
        .single();

    if (error) {
        throw new Error(`Error creating lead: ${error.message}`);
    }

    await notifyAssessorIfNeeded(supabase, newLead as CRMLead, null);
    await runStateRegistrationCheckIfNeeded(supabase, newLead as CRMLead, null);
    await runCreditCheckIfNeeded(supabase, newLead as CRMLead, null);

    const welcomePhone = newLead?.celular || newLead?.telefone || data.telefone;
    if (welcomePhone) {
        // Mensagem automática de boas-vindas pelo número conectado (Baileys).
        // Fire-and-forget: dedup 24h + opt-out + log centralizados no gateway.
        dispatchCrmWelcome(supabase as any, {
            phone: welcomePhone,
            nome: newLead?.nome || data.nome,
            leadId: newLead?.id,
            origin: 'crm-manual',
        }).catch((e: unknown) => {
            console.error('[CRM Action] Falha ao enviar boas-vindas no WhatsApp:', e);
        });
    }

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/funil-vendas');
    return normalizeLeadRow(newLead as CRMLead);
}

export async function updateLead(id: string, data: Partial<CRMLead>): Promise<CRMLead> {
    const supabase = await createClient();

    const { data: previous } = await supabase
        .from('crm_leads')
        .select('status, responsavel, extra_data, quantidade_animais, tem_inscricao_estadual, inscricao_estadual, funnel_id')
        .eq('id', id)
        .single();

    const payload = sanitizeLeadData(
        shouldComputeMql(data)
            ? await withComputedMql(data, previous as Partial<MqlSource> | null)
            : data
    );

    const { data: updatedLead, error } = await supabase
        .from('crm_leads')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw new Error(`Error updating lead: ${error.message}`);
    }

    await notifyAssessorIfNeeded(supabase, updatedLead as CRMLead, previous as Pick<CRMLead, 'status' | 'responsavel' | 'extra_data'> | null);
    await runStateRegistrationCheckIfNeeded(supabase, updatedLead as CRMLead, previous as Pick<CRMLead, 'status'> | null);
    await runCreditCheckIfNeeded(supabase, updatedLead as CRMLead, previous as Pick<CRMLead, 'status'> | null);

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/funil-vendas');
    return normalizeLeadRow(updatedLead as CRMLead);
}

export async function deleteLead(id: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('crm_leads')
        .delete()
        .eq('id', id);

    if (error) {
        throw new Error(`Error deleting lead: ${error.message}`);
    }

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/funil-vendas');
}

export async function moveLead(id: string, newStatus: string, newPosition: number): Promise<void> {
    const supabase = await createClient();
    const status = normalizeCRMStatus(newStatus);

    const { data: previous } = await supabase
        .from('crm_leads')
        .select('status, responsavel, extra_data')
        .eq('id', id)
        .single();

    const { error } = await supabase
        .from('crm_leads')
        .update({
            status,
            position: newPosition
        })
        .eq('id', id);

    if (error) {
        throw new Error(`Error moving lead: ${error.message}`);
    }

    const { data: lead } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('id', id)
        .single();
    if (lead) {
        await notifyAssessorIfNeeded(supabase, lead as CRMLead, previous as Pick<CRMLead, 'status' | 'responsavel' | 'extra_data'> | null);
        await runStateRegistrationCheckIfNeeded(supabase, lead as CRMLead, previous as Pick<CRMLead, 'status'> | null);
        await runCreditCheckIfNeeded(supabase, lead as CRMLead, previous as Pick<CRMLead, 'status'> | null);
        await syncLeadToClientesIfApproved(supabase, lead as CRMLead);
    }

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/funil-vendas');
}

export async function moveLeadToFunnel(id: string, funnelId: string, newStatus: string): Promise<void> {
    const supabase = await createClient();
    const status = normalizeCRMStatus(newStatus);

    const { data: previous } = await supabase
        .from('crm_leads')
        .select('status, responsavel, extra_data')
        .eq('id', id)
        .single();

    const { error } = await supabase
        .from('crm_leads')
        .update({
            funnel_id: funnelId,
            status,
        })
        .eq('id', id);

    if (error) {
        throw new Error(`Error moving lead to funnel: ${error.message}`);
    }

    const { data: lead } = await supabase
        .from('crm_leads')
        .select('*')
        .eq('id', id)
        .single();
    if (lead) {
        await notifyAssessorIfNeeded(supabase, lead as CRMLead, previous as Pick<CRMLead, 'status' | 'responsavel' | 'extra_data'> | null);
        await runStateRegistrationCheckIfNeeded(supabase, lead as CRMLead, previous as Pick<CRMLead, 'status'> | null);
        await runCreditCheckIfNeeded(supabase, lead as CRMLead, previous as Pick<CRMLead, 'status'> | null);
        await syncLeadToClientesIfApproved(supabase, lead as CRMLead);
    }

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/funil-vendas');
}

export async function setCadastroAprovado(id: string, aprovado: boolean): Promise<CRMLead> {
    const supabase = await createClient();

    const { data: existing, error: fetchErr } = await supabase
        .from('crm_leads')
        .select('extra_data')
        .eq('id', id)
        .single();

    if (fetchErr) throw new Error(`Error fetching lead: ${fetchErr.message}`);

    const extra = {
        ...((existing?.extra_data || {}) as Record<string, unknown>),
        cadastro_aprovado: aprovado,
        cadastro_aprovado_at: aprovado ? new Date().toISOString() : null,
    };

    const { data: updated, error } = await supabase
        .from('crm_leads')
        .update({ extra_data: extra })
        .eq('id', id)
        .select()
        .single();

    if (error) throw new Error(`Error updating cadastro approval: ${error.message}`);

    // Aprovação manual: migra o lead para Clientes e arquiva no CRM.
    if (aprovado) {
        await syncLeadToClientesIfApproved(supabase, updated as CRMLead, true);
    }

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/leads');
    revalidatePath('/sistema/clientes');
    return normalizeLeadRow(updated as CRMLead);
}

/**
 * Reavalia os leads que vieram da landing JMP (source = 'jmp-landing'), corrigindo
 * o histórico criado antes da regra de MQL: recalcula is_mql pela regra atual do
 * Funil JMP, copia telefone → celular (contato principal do CRM) e atribui o
 * funnel_id do Funil JMP. Idempotente — só grava nos leads que de fato mudam.
 * Retorna quantos leads foram atualizados.
 */
export async function reavaliarLeadsJmp(): Promise<{ updated: number; total: number }> {
    const supabase = await createClient();

    const config = await getCRMConfig();
    const rule = config.funnels.find(f => f.id === JMP_FUNNEL_ID)?.mql_rule ?? DEFAULT_JMP_MQL_RULE;

    const { data, error } = await supabase
        .from('crm_leads')
        .select('id, telefone, celular, funnel_id, is_mql, quantidade_animais, tem_inscricao_estadual, inscricao_estadual')
        .eq('source', 'jmp-landing');

    if (error) throw new Error(`Error fetching JMP leads: ${error.message}`);

    const leads = (data ?? []) as Array<Pick<CRMLead,
        'id' | 'telefone' | 'celular' | 'funnel_id' | 'is_mql' | 'quantidade_animais' | 'tem_inscricao_estadual' | 'inscricao_estadual'>>;

    let updated = 0;
    for (const lead of leads) {
        const patch: Partial<CRMLead> = {};

        const nextMql = evaluateMql(rule, {
            quantidade_animais: lead.quantidade_animais,
            tem_inscricao_estadual: lead.tem_inscricao_estadual,
            inscricao_estadual: lead.inscricao_estadual,
        });
        if (!!lead.is_mql !== nextMql) patch.is_mql = nextMql;

        if (!lead.celular && lead.telefone) patch.celular = lead.telefone;

        if (lead.funnel_id !== JMP_FUNNEL_ID) patch.funnel_id = JMP_FUNNEL_ID;

        if (Object.keys(patch).length === 0) continue;

        const { error: updErr } = await supabase
            .from('crm_leads')
            .update(patch)
            .eq('id', lead.id);
        if (updErr) throw new Error(`Error updating lead ${lead.id}: ${updErr.message}`);
        updated++;
    }

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/funil-vendas');
    return { updated, total: leads.length };
}

export async function recordContact(
    leadId: string,
    entry: Omit<CRMContactEntry, 'id'>
): Promise<CRMLead> {
    const supabase = await createClient();

    const { data: existing, error: fetchErr } = await supabase
        .from('crm_leads')
        .select('contact_history')
        .eq('id', leadId)
        .single();

    if (fetchErr) throw new Error(`Error fetching lead: ${fetchErr.message}`);

    const history: CRMContactEntry[] = Array.isArray(existing?.contact_history) ? existing.contact_history : [];
    const newEntry: CRMContactEntry = {
        ...entry,
        id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    };
    const nextHistory = [newEntry, ...history];

    const { data: updated, error } = await supabase
        .from('crm_leads')
        .update({
            contact_history: nextHistory,
            contact_count: nextHistory.length,
            ultimo_contato: entry.date,
        })
        .eq('id', leadId)
        .select()
        .single();

    if (error) throw new Error(`Error recording contact: ${error.message}`);

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/leads');
    return normalizeLeadRow(updated as CRMLead);
}

export async function deleteContact(leadId: string, contactId: string): Promise<CRMLead> {
    const supabase = await createClient();

    const { data: existing, error: fetchErr } = await supabase
        .from('crm_leads')
        .select('contact_history')
        .eq('id', leadId)
        .single();

    if (fetchErr) throw new Error(`Error fetching lead: ${fetchErr.message}`);

    const history: CRMContactEntry[] = Array.isArray(existing?.contact_history) ? existing.contact_history : [];
    const nextHistory = history.filter(c => c.id !== contactId);
    const lastDate = nextHistory[0]?.date ?? null;

    const { data: updated, error } = await supabase
        .from('crm_leads')
        .update({
            contact_history: nextHistory,
            contact_count: nextHistory.length,
            ultimo_contato: lastDate,
        })
        .eq('id', leadId)
        .select()
        .single();

    if (error) throw new Error(`Error deleting contact: ${error.message}`);

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/leads');
    return normalizeLeadRow(updated as CRMLead);
}

type CRMLeadMatchRow = Pick<CRMLead,
    'id' | 'nome' | 'email' | 'telefone' | 'celular' | 'estado' | 'cidade' |
    'quantidade_animais' | 'o_que_busca' | 'created_at' | 'extra_data'>;

export interface MissingSheetLead {
    rowNumber: number;
    nome: string;
    email: string;
    whatsapp: string;
    cidade: string | null;
    uf: string | null;
    leadId: string | null;
    reason: string;
}

export interface IncompleteSheetLead {
    rowNumber: number;
    leadId: string;
    nome: string;
    missingFields: string[];
}

export interface CRMLeadSheetValidation {
    sheetUrl: string | null;
    totalSheetRows: number;
    totalCrmLeads: number;
    missing: MissingSheetLead[];
    incomplete: IncompleteSheetLead[];
}

function normalizeEmail(email?: string | null): string {
    return String(email || '').trim().toLowerCase();
}

function leadPhoneKeys(phone?: string | null): string[] {
    const normalized = normalizePhone(phone || '');
    if (normalized) return phoneVariants(normalized);
    const raw = String(phone || '').replace(/\D/g, '');
    return raw ? [raw] : [];
}

function findCrmMatch(row: SheetLeadRow, crmLeads: CRMLeadMatchRow[]): CRMLeadMatchRow | null {
    if (row.leadId) {
        const byId = crmLeads.find(l => {
            const importData = l.extra_data?.sheet_validation_import;
            return l.id === row.leadId || importData?.sheetLeadId === row.leadId;
        });
        if (byId) return byId;
    }

    const rowPhones = new Set(leadPhoneKeys(row.whatsapp));
    if (rowPhones.size > 0) {
        const byPhone = crmLeads.find(l => {
            const keys = [...leadPhoneKeys(l.celular), ...leadPhoneKeys(l.telefone)];
            return keys.some(k => rowPhones.has(k));
        });
        if (byPhone) return byPhone;
    }

    const email = normalizeEmail(row.email);
    if (email) {
        const byEmail = crmLeads.find(l => normalizeEmail(l.email) === email);
        if (byEmail) return byEmail;
    }

    return null;
}

function missingCrmFields(row: SheetLeadRow, lead: CRMLeadMatchRow): string[] {
    const missing: string[] = [];
    if (row.whatsapp && !lead.celular && !lead.telefone) missing.push('WhatsApp');
    if (row.uf && !lead.estado) missing.push('UF');
    if (row.cidade && !lead.cidade) missing.push('Cidade');
    if (row.cabecas && !lead.quantidade_animais) missing.push('Cabeças');
    if (row.oQueBusca && !lead.o_que_busca) missing.push('Interesse');
    return missing;
}

export async function validateLeadsAgainstSheet(): Promise<CRMLeadSheetValidation> {
    const supabase = await createClient();
    const [{ info, rows }, crmRes] = await Promise.all([
        readSheetLeadRows(),
        supabase
            .from('crm_leads')
            .select('id, nome, email, telefone, celular, estado, cidade, quantidade_animais, o_que_busca, created_at, extra_data'),
    ]);

    if (crmRes.error) throw new Error(`Error fetching CRM leads: ${crmRes.error.message}`);
    const crmLeads = (crmRes.data ?? []) as CRMLeadMatchRow[];

    const missing: MissingSheetLead[] = [];
    const incomplete: IncompleteSheetLead[] = [];

    for (const row of rows) {
        const match = findCrmMatch(row, crmLeads);
        if (!match) {
            missing.push({
                rowNumber: row.rowNumber,
                nome: row.nome,
                email: row.email,
                whatsapp: row.whatsapp,
                cidade: row.cidade,
                uf: row.uf,
                leadId: row.leadId,
                reason: row.leadId ? 'Lead ID ausente no CRM' : 'Telefone/e-mail não encontrado no CRM',
            });
            continue;
        }
        const fields = missingCrmFields(row, match);
        if (fields.length > 0) {
            incomplete.push({
                rowNumber: row.rowNumber,
                leadId: match.id,
                nome: match.nome || row.nome,
                missingFields: fields,
            });
        }
    }

    return {
        sheetUrl: info.url,
        totalSheetRows: rows.length,
        totalCrmLeads: crmLeads.length,
        missing,
        incomplete,
    };
}

interface SheetLeadSourceMeta {
    origem: string;
    source: string;
    sourcePage: string;
}

const DEFAULT_SHEET_LEAD_SOURCE: SheetLeadSourceMeta = {
    origem: 'Planilha JMP — importação de validação',
    source: 'jmp-sheet-repair',
    sourcePage: 'Leads JMP',
};

function sheetRowToLead(
    row: SheetLeadRow,
    isMql: boolean,
    position: number,
    sourceMeta: SheetLeadSourceMeta = DEFAULT_SHEET_LEAD_SOURCE,
): Partial<CRMLead> {
    return {
        nome: row.nome || row.email || row.whatsapp || `Lead planilha linha ${row.rowNumber}`,
        email: row.email || null,
        telefone: row.whatsapp || null,
        celular: row.whatsapp || null,
        estado: row.uf,
        cidade: row.cidade,
        momento_pecuaria: row.momento,
        quantidade_animais: row.cabecas,
        interesse: row.interesse,
        o_que_busca: row.oQueBusca,
        tem_inscricao_estadual: row.inscricaoEstadual,
        status: CRM_STAGE_ENTRY,
        funnel_id: JMP_FUNNEL_ID,
        is_mql: isMql,
        origem: sourceMeta.origem,
        source: sourceMeta.source,
        source_page: sourceMeta.sourcePage,
        data_entrada: new Date().toISOString(),
        position,
        extra_data: {
            sheet_validation_import: {
                rowNumber: row.rowNumber,
                sheetLeadId: row.leadId,
                sheetDate: row.data,
                importedAt: new Date().toISOString(),
            },
            utm: {
                source: row.utm_source,
                medium: row.utm_medium,
                campaign: row.utm_campaign,
                content: row.utm_content,
                ad_id: row.ad_id,
            },
        },
    };
}

export async function importMissingLeadsFromSheet(): Promise<{ created: number; validation: CRMLeadSheetValidation }> {
    const supabase = await createClient();
    const [{ rows }, validation, config] = await Promise.all([
        readSheetLeadRows(),
        validateLeadsAgainstSheet(),
        getCRMConfig(),
    ]);

    if (validation.missing.length === 0) return { created: 0, validation };

    const missingRows = new Map(validation.missing.map(m => [m.rowNumber, m]));
    const mqlRule = config.funnels[0]?.mql_rule ?? DEFAULT_JMP_MQL_RULE;

    const { data: maxPosRows } = await supabase
        .from('crm_leads')
        .select('position')
        .order('position', { ascending: false })
        .limit(1);
    let position = Number(maxPosRows?.[0]?.position ?? 0);

    const payload = rows
        .filter(row => missingRows.has(row.rowNumber))
        .map(row => {
            position += 1000;
            return sanitizeLeadData(sheetRowToLead(row, evaluateMql(mqlRule, {
                quantidade_animais: row.cabecas,
                tem_inscricao_estadual: row.inscricaoEstadual,
            }), position));
        });

    const { error } = await supabase.from('crm_leads').insert(payload);
    if (error) throw new Error(`Error importing sheet leads: ${error.message}`);

    revalidatePath('/sistema/crm');
    revalidatePath('/web-admin/crm');
    return {
        created: payload.length,
        validation: await validateLeadsAgainstSheet(),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingestão da aba "Cópia de LEADS BULA" → CRM.
//
// Essa aba recebe os leads do formulário Meta "BULA PERPETUO" (mesmo dump cru da
// "Leads JMP"), MAS também contém um bloco de histórico antigo já normalizado
// (colado pela equipe) que NÃO deve entrar no CRM. Por isso lemos só as linhas
// no formato cru do Meta (onlyMetaForm) — os leads que de fato chegam pelo
// formulário. Aqui só CRIAMOS no CRM os que ainda não existem (casados por
// telefone/e-mail), entrando em ENTRADA. NÃO reescrevemos a planilha (mantida
// pela equipe). Idempotente: rodar de novo não duplica. Roda no cron de 15 min.
// ─────────────────────────────────────────────────────────────────────────────

function leadContactKey(row: SheetLeadRow): string | null {
    const phone = leadPhoneKeys(row.whatsapp)[0];
    if (phone) return `tel:${phone}`;
    const email = normalizeEmail(row.email);
    if (email) return `email:${email}`;
    return null;
}

function isObviousTestSheetLead(row: SheetLeadRow): boolean {
    return /^\[TESTE META\]/i.test(row.nome || '') || normalizeEmail(row.email) === 'test@meta.com';
}

export async function importMissingLeadsFromBulaSheet(): Promise<{ created: number; total: number; matched: number; skippedTest: number }> {
    // Service-role: roda no cron (sem sessão de usuário), então o client SSR
    // seria barrado pelo RLS de crm_leads no INSERT. supabaseAdmin ignora RLS.
    const supabase = supabaseAdmin();
    const [{ rows }, config] = await Promise.all([
        readSecondaryTabLeadRows(LEADS_BULA_TAB, { onlyMetaForm: true }),
        getCRMConfig(),
    ]);

    const realRows = rows.filter(r => !isObviousTestSheetLead(r));
    const skippedTest = rows.length - realRows.length;
    if (realRows.length === 0) return { created: 0, total: rows.length, matched: 0, skippedTest };

    const { data: crm, error: crmError } = await supabase
        .from('crm_leads')
        .select('id, nome, email, telefone, celular, estado, cidade, quantidade_animais, o_que_busca, created_at, extra_data');
    if (crmError) throw new Error(`Error fetching CRM leads: ${crmError.message}`);
    const crmLeads = (crm ?? []) as CRMLeadMatchRow[];

    const sourceMeta: SheetLeadSourceMeta = {
        origem: 'Planilha — Cópia de LEADS BULA (Meta BULA PERPETUO)',
        source: 'jmp-bula-perpetuo-sheet',
        sourcePage: LEADS_BULA_TAB,
    };
    const mqlRule = config.funnels[0]?.mql_rule ?? DEFAULT_JMP_MQL_RULE;

    // Leads ainda sem correspondência no CRM. Dedup também DENTRO do lote (a
    // mesma pessoa pode aparecer 2x na planilha) para não criar cards repetidos.
    const seenInBatch = new Set<string>();
    const missing = realRows.filter(row => {
        if (findCrmMatch(row, crmLeads)) return false;
        const key = leadContactKey(row);
        if (key) {
            if (seenInBatch.has(key)) return false;
            seenInBatch.add(key);
        }
        return true;
    });
    const matched = realRows.length - missing.length;
    if (missing.length === 0) return { created: 0, total: realRows.length, matched, skippedTest };

    const { data: maxPosRows } = await supabase
        .from('crm_leads')
        .select('position')
        .order('position', { ascending: false })
        .limit(1);
    let position = Number(maxPosRows?.[0]?.position ?? 0);

    const payload = missing.map(row => {
        position += 1000;
        return sanitizeLeadData(sheetRowToLead(row, evaluateMql(mqlRule, {
            quantidade_animais: row.cabecas,
            tem_inscricao_estadual: row.inscricaoEstadual,
        }), position, sourceMeta));
    });

    const { data: inserted, error } = await supabase
        .from('crm_leads')
        .insert(payload)
        .select('id, nome, celular, telefone');
    if (error) throw new Error(`Error importing Bula sheet leads: ${error.message}`);

    // Welcome automático (API oficial) para cada lead novo da planilha. Antes
    // só o cadastro manual (createLead) e a landing JMP disparavam — então os
    // leads que chegam pela planilha (a esmagadora maioria) nunca recebiam a 1ª
    // mensagem. Awaited (não fire-and-forget): a rota do cron retorna logo após,
    // e em serverless um promise solto seria cortado antes de enviar. O dispatch
    // já tem dedup de 24h e respeita opt-out, então é idempotente e seguro.
    for (const lead of inserted ?? []) {
        const welcomePhone = lead.celular || lead.telefone;
        if (!welcomePhone) continue;
        try {
            await dispatchCrmWelcome(supabase as any, {
                phone: welcomePhone,
                nome: lead.nome,
                leadId: lead.id,
                origin: 'crm-sheet-import',
            });
        } catch (e) {
            console.error('[sheet-import] Falha ao enviar boas-vindas:', e);
        }
    }

    revalidatePath('/sistema/crm');
    revalidatePath('/web-admin/crm');
    return { created: payload.length, total: realRows.length, matched, skippedTest };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sincronização planilha → CRM por COR (aba "Leads JMP") + cadastros prontos
// (aba "Cadastro JMP"). Mapa de cores:
//   branco/sem cor → ENTRADA · vermelho → CONEXÃO · amarelo → QUALIFICAÇÃO ·
//   verde → INFORMAÇÕES CAPTADAS. "Cadastro JMP" → CADASTRO (e, aprovado, cliente).
// Preserva movimentos MANUAIS no CRM: a cor só sobrescreve o status quando o lead
// ainda está onde a última sincronização o colocou (extra_data.sheet_color_status).
// ─────────────────────────────────────────────────────────────────────────────

function colorToStatus(color: SheetColor): string {
    switch (color) {
        case 'red': return CRM_STAGE_CONNECTION;
        case 'yellow': return CRM_STAGE_QUALIFICATION;
        case 'green': return CRM_STAGE_INFO_CAPTURED;
        default: return CRM_STAGE_ENTRY; // branco / sem preenchimento
    }
}

const SHEET_COLOR_LABEL: Record<SheetColor, string> = {
    none: 'Sem cor (não contatado)',
    red: 'Vermelho (não respondeu)',
    yellow: 'Amarelo (respondeu)',
    green: 'Verde (dados enviados)',
};

type ColorSyncMatchRow = Pick<CRMLead,
    'id' | 'nome' | 'email' | 'telefone' | 'celular' | 'status' | 'extra_data'>;

export interface CRMColorSyncChange {
    leadId: string;
    rowNumber: number;
    nome: string;
    color: SheetColor;
    colorLabel: string;
    fromStatus: string;
    toStatus: string;
}

export interface CRMColorSyncResult {
    sheetUrl: string | null;
    applied: boolean;
    totalSheetRows: number;
    totalColored: number;
    /** Mudanças de status propostas (dry-run) ou aplicadas. */
    changes: CRMColorSyncChange[];
    /** Leads cuja cor diverge do status, mas foram preservados (movidos à mão). */
    skippedManual: number;
    /** Linhas coloridas sem correspondência no CRM (importar pelo fluxo padrão). */
    unmatchedColored: number;
    cadastros: { matched: number; created: number; aprovados: number };
}

function matchByContact<T extends { email?: string | null; telefone?: string | null; celular?: string | null }>(
    email: string | null,
    phone: string | null,
    leads: T[],
): T | null {
    const phones = new Set(leadPhoneKeys(phone));
    if (phones.size > 0) {
        const byPhone = leads.find(l => {
            const keys = [...leadPhoneKeys(l.celular), ...leadPhoneKeys(l.telefone)];
            return keys.some(k => phones.has(k));
        });
        if (byPhone) return byPhone;
    }
    const e = normalizeEmail(email);
    if (e) {
        const byEmail = leads.find(l => normalizeEmail(l.email) === e);
        if (byEmail) return byEmail;
    }
    return null;
}

/**
 * Sincroniza o status dos leads a partir das cores da planilha e processa os
 * cadastros prontos. Com `apply=false` (default) faz dry-run: não grava nada,
 * só devolve o diff para revisão. Com `apply=true` aplica as mudanças.
 */
export async function syncSheetColorsToCrm(apply = false): Promise<CRMColorSyncResult> {
    const supabase = await createClient();

    const [{ info, rows }, cadastro, crmRes] = await Promise.all([
        readSheetLeadRowsWithColor(),
        readCadastroSheetRows().catch(() => ({ info: null, rows: [] as CadastroSheetRow[] })),
        supabase.from('crm_leads').select('id, nome, email, telefone, celular, status, extra_data'),
    ]);
    if (crmRes.error) throw new Error(`Error fetching CRM leads: ${crmRes.error.message}`);
    const crmLeads = (crmRes.data ?? []) as ColorSyncMatchRow[];

    const changes: CRMColorSyncChange[] = [];
    // Atualizações em extra_data para gravar a "baseline" da cor (sheet_color_status).
    const baselineUpdates = new Map<string, { status?: string; extra_data: Record<string, any> }>();
    let skippedManual = 0;
    let unmatchedColored = 0;
    let totalColored = 0;

    for (const row of rows) {
        if (row.color !== 'none') totalColored += 1;
        const match = matchByContact(row.email, row.whatsapp, crmLeads)
            ?? (row.leadId ? crmLeads.find(l => l.id === row.leadId || l.extra_data?.sheet_validation_import?.sheetLeadId === row.leadId) ?? null : null);
        if (!match) {
            if (row.color !== 'none') unmatchedColored += 1;
            continue;
        }

        const mapped = colorToStatus(row.color);
        const current = normalizeCRMStatus(match.status);
        const prevSynced: string | undefined = match.extra_data?.sheet_color_status;

        if (current === mapped) {
            // Já está na etapa da cor — só garante a baseline.
            if (prevSynced !== mapped) {
                baselineUpdates.set(match.id, {
                    extra_data: { ...(match.extra_data || {}), sheet_color_status: mapped },
                });
            }
            continue;
        }

        const safeToUpdate = prevSynced ? current === prevSynced : current === CRM_STAGE_ENTRY;
        if (!safeToUpdate) {
            // Lead foi movido manualmente desde a última sincronização — preserva.
            skippedManual += 1;
            continue;
        }

        changes.push({
            leadId: match.id,
            rowNumber: row.rowNumber,
            nome: match.nome || row.nome,
            color: row.color,
            colorLabel: SHEET_COLOR_LABEL[row.color],
            fromStatus: current,
            toStatus: mapped,
        });
        baselineUpdates.set(match.id, {
            status: mapped,
            extra_data: { ...(match.extra_data || {}), sheet_color_status: mapped },
        });
    }

    // ── Cadastros prontos (aba "Cadastro JMP") ──────────────────────────────
    let cadMatched = 0;
    let cadCreated = 0;
    let cadAprovados = 0;

    if (apply) {
        // Aplica as mudanças de status/baseline da aba de cores.
        for (const [id, patch] of baselineUpdates) {
            const { error } = await supabase.from('crm_leads').update(patch).eq('id', id);
            if (error) console.warn('[CRM] Falha ao sincronizar cor do lead', id, error.message);
        }

        // Processa cadastros prontos: garante o lead em CADASTRO + tenta virar cliente.
        let position = Number(
            (await supabase.from('crm_leads').select('position').order('position', { ascending: false }).limit(1)).data?.[0]?.position ?? 0,
        );
        for (const c of cadastro.rows) {
            const match = matchByContact(c.email, c.whatsapp, crmLeads);
            let leadId: string;
            if (match) {
                cadMatched += 1;
                const patch = sanitizeLeadData({
                    status: CRM_STAGE_REGISTRATION,
                    cpf: c.cpf ?? undefined,
                    inscricao_estadual: c.inscricaoEstadual ?? undefined,
                    tem_inscricao_estadual: c.inscricaoEstadual ? 'Sim' : undefined,
                });
                await supabase.from('crm_leads').update(patch).eq('id', match.id);
                leadId = match.id;
            } else {
                position += 1000;
                const insertData = sanitizeLeadData({
                    nome: c.nome,
                    email: c.email,
                    telefone: c.whatsapp,
                    celular: c.whatsapp,
                    estado: c.uf,
                    cidade: c.cidade,
                    cpf: c.cpf,
                    inscricao_estadual: c.inscricaoEstadual,
                    tem_inscricao_estadual: c.inscricaoEstadual ? 'Sim' : null,
                    quantidade_animais: c.cabecas,
                    o_que_busca: c.interesse,
                    momento_pecuaria: c.momento,
                    status: CRM_STAGE_REGISTRATION,
                    funnel_id: JMP_FUNNEL_ID,
                    origem: 'Planilha JMP — aba Cadastro',
                    source: 'jmp-cadastro-sheet',
                    source_page: 'Cadastro JMP',
                    data_entrada: new Date().toISOString(),
                    position,
                });
                const { data: created, error } = await supabase.from('crm_leads').insert(insertData).select('*').single();
                if (error || !created) { console.warn('[CRM] Falha ao criar lead de cadastro', error?.message); continue; }
                cadCreated += 1;
                leadId = (created as CRMLead).id;
            }

            // Tenta migrar para Clientes respeitando a regra de aprovação (sem forçar).
            const { data: full } = await supabase.from('crm_leads').select('*').eq('id', leadId).single();
            if (full) {
                const before = (full as CRMLead).arquivado;
                await syncLeadToClientesIfApproved(supabase, normalizeLeadRow(full as CRMLead));
                if (!before) {
                    const { data: after } = await supabase.from('crm_leads').select('arquivado').eq('id', leadId).single();
                    if (after?.arquivado) cadAprovados += 1;
                }
            }
        }

        revalidatePath('/sistema/crm');
        revalidatePath('/web-admin/crm');
    } else {
        // Dry-run: apenas conta os cadastros que casam para informar o operador.
        for (const c of cadastro.rows) {
            if (matchByContact(c.email, c.whatsapp, crmLeads)) cadMatched += 1;
        }
    }

    return {
        sheetUrl: info?.url ?? null,
        applied: apply,
        totalSheetRows: rows.length,
        totalColored,
        changes,
        skippedManual,
        unmatchedColored,
        cadastros: { matched: cadMatched, created: cadCreated, aprovados: cadAprovados },
    };
}

type TestLeadCandidate = Pick<CRMLead, 'id' | 'nome' | 'email' | 'telefone' | 'celular' | 'empresa' | 'notes'>;

function stripAccents(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isFakePhone(phone?: string | null): boolean {
    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 8) return false;
    const noCountry = digits.startsWith('55') ? digits.slice(2) : digits;
    if (/^(\d)\1{7,}$/.test(noCountry)) return true;
    return /(12345678|123456789|987654321|00000000|11111111|99999999)/.test(noCountry);
}

function isClearlyTestLead(lead: TestLeadCandidate): boolean {
    const text = stripAccents([
        lead.nome,
        lead.email,
        lead.empresa,
        lead.notes,
    ].filter(Boolean).join(' '));
    const name = stripAccents(lead.nome || '').replace(/\s+/g, '');
    const email = normalizeEmail(lead.email);
    const localPart = email.split('@')[0] || '';

    if (/\b(teste|test|asdf|fulano|ciclano|beltrano)\b/.test(text)) return true;
    if (name.length >= 4 && /^([a-z])\1+$/.test(name)) return true;
    if (localPart && /^(teste|test|asdf|fulano|ciclano|beltrano)([._-]?\d*)?$/.test(localPart)) return true;
    if (email.endsWith('@example.com') || email.endsWith('@teste.com') || email.endsWith('@test.com')) return true;
    return isFakePhone(lead.celular) || isFakePhone(lead.telefone);
}

export async function archiveObviousTestLeads(): Promise<{ archived: number; leads: Array<{ id: string; nome: string }> }> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('crm_leads')
        .select('id, nome, email, telefone, celular, empresa, notes')
        .eq('arquivado', false);
    if (error) throw new Error(`Error fetching test leads: ${error.message}`);

    const candidates = ((data ?? []) as TestLeadCandidate[]).filter(isClearlyTestLead);
    if (candidates.length === 0) return { archived: 0, leads: [] };

    const stamp = new Date().toISOString();
    const { error: updateError } = await supabase
        .from('crm_leads')
        .update({ arquivado: true, arquivado_at: stamp })
        .in('id', candidates.map(c => c.id));
    if (updateError) throw new Error(`Error archiving test leads: ${updateError.message}`);

    revalidatePath('/sistema/crm');
    revalidatePath('/web-admin/crm');
    return {
        archived: candidates.length,
        leads: candidates.map(c => ({ id: c.id, nome: c.nome })),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Documentos anexados aos cards do CRM. Reaproveita o bucket privado
// `cliente-documentos` (policies em 0034) com prefixo de path crm-leads/<id>/.
// Metadados na tabela crm_lead_documentos (0037). Download via signed URL.
// ─────────────────────────────────────────────────────────────────────────────

const LEAD_DOCS_BUCKET = 'cliente-documentos';

export interface LeadDocumento {
    id: string;
    tipo: string;
    nomeArquivo: string;
    path: string;
    tamanhoBytes: number;
    contentType: string;
    createdAt: string;
}

function mapLeadDocRow(r: {
    id: string; tipo: string | null; nome_arquivo: string; path: string;
    tamanho_bytes: number | null; content_type: string | null; created_at: string;
}): LeadDocumento {
    return {
        id: r.id,
        tipo: r.tipo || 'outro',
        nomeArquivo: r.nome_arquivo,
        path: r.path,
        tamanhoBytes: Number(r.tamanho_bytes) || 0,
        contentType: r.content_type || '',
        createdAt: r.created_at,
    };
}

export async function listLeadDocumentos(leadId: string): Promise<LeadDocumento[]> {
    if (!leadId) return [];
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('crm_lead_documentos')
        .select('id, tipo, nome_arquivo, path, tamanho_bytes, content_type, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });
    if (error) {
        console.warn('[CRM] tabela crm_lead_documentos indisponível:', error.message);
        return [];
    }
    return (data ?? []).map(mapLeadDocRow);
}

/** Upload de um documento do lead. FormData { file, leadId, nome, tipo }. */
export async function uploadLeadDocumento(formData: FormData): Promise<LeadDocumento> {
    const supabase = await createClient();
    const file = formData.get('file') as File | null;
    const leadId = String(formData.get('leadId') || '');
    const tipo = String(formData.get('tipo') || 'outro');
    if (!file || !leadId) throw new Error('Arquivo e lead são obrigatórios.');

    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const path = `crm-leads/${leadId}/${crypto.randomUUID()}${ext}`;

    const { error: upErr } = await supabase.storage
        .from(LEAD_DOCS_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (upErr) throw new Error(`Falha ao subir documento: ${upErr.message}`);

    const { data, error } = await supabase
        .from('crm_lead_documentos')
        .insert({
            lead_id: leadId,
            tipo,
            nome_arquivo: file.name,
            path,
            tamanho_bytes: file.size,
            content_type: file.type || '',
        })
        .select('id, tipo, nome_arquivo, path, tamanho_bytes, content_type, created_at')
        .single();
    if (error) {
        await supabase.storage.from(LEAD_DOCS_BUCKET).remove([path]); // rollback
        throw new Error(`Falha ao salvar documento: ${error.message}`);
    }
    revalidatePath('/sistema/crm');
    return mapLeadDocRow(data);
}

/** Signed URL (1h) para baixar/visualizar o documento privado do lead. */
export async function getLeadDocumentoUrl(path: string): Promise<string> {
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from(LEAD_DOCS_BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw new Error('Falha ao gerar link do documento.');
    return data.signedUrl;
}

export async function deleteLeadDocumento(id: string, path: string): Promise<void> {
    const supabase = await createClient();
    await supabase.storage.from(LEAD_DOCS_BUCKET).remove([path]);
    const { error } = await supabase.from('crm_lead_documentos').delete().eq('id', id);
    if (error) throw new Error(`Falha ao excluir documento: ${error.message}`);
    revalidatePath('/sistema/crm');
}
