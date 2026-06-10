'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { dispatchWelcome } from '@/lib/whatsapp';
import { evaluateMql, JMP_FUNNEL_ID, DEFAULT_JMP_MQL_RULE } from '@/lib/crm-types';
import { getCRMConfig } from './crm-config';

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
        if (WRITABLE_COLUMNS.has(key)) clean[key] = value;
    }
    return clean as Partial<CRMLead>;
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

    return data as CRMLead[];
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

    return data as CRMLead[];
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

    const { data: newLead, error } = await supabase
        .from('crm_leads')
        .insert([sanitizeLeadData(data)])
        .select()
        .single();

    if (error) {
        throw new Error(`Error creating lead: ${error.message}`);
    }

    if (data.telefone) {
        // Fire and forget welcome (dedup + opt-out + log centralizados em dispatchWelcome)
        dispatchWelcome(data.telefone, data.nome || 'Amigo(a)', 'admin-manual', { lead_id: newLead?.id }).catch((e: unknown) => {
            console.error('[CRM Action] Failed to send WhatsApp message:', e);
        });
    }

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/funil-vendas');
    return newLead as CRMLead;
}

export async function updateLead(id: string, data: Partial<CRMLead>): Promise<CRMLead> {
    const supabase = await createClient();

    const { data: updatedLead, error } = await supabase
        .from('crm_leads')
        .update(sanitizeLeadData(data))
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw new Error(`Error updating lead: ${error.message}`);
    }

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/funil-vendas');
    return updatedLead as CRMLead;
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

    const { error } = await supabase
        .from('crm_leads')
        .update({
            status: newStatus,
            position: newPosition
        })
        .eq('id', id);

    if (error) {
        throw new Error(`Error moving lead: ${error.message}`);
    }

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/funil-vendas');
}

export async function moveLeadToFunnel(id: string, funnelId: string, newStatus: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('crm_leads')
        .update({
            funnel_id: funnelId,
            status: newStatus,
        })
        .eq('id', id);

    if (error) {
        throw new Error(`Error moving lead to funnel: ${error.message}`);
    }

    revalidatePath('/web-admin/crm');
    revalidatePath('/web-admin/funil-vendas');
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
        .select('id, telefone, celular, funnel_id, is_mql, quantidade_animais, tem_inscricao_estadual')
        .eq('source', 'jmp-landing');

    if (error) throw new Error(`Error fetching JMP leads: ${error.message}`);

    const leads = (data ?? []) as Array<Pick<CRMLead,
        'id' | 'telefone' | 'celular' | 'funnel_id' | 'is_mql' | 'quantidade_animais' | 'tem_inscricao_estadual'>>;

    let updated = 0;
    for (const lead of leads) {
        const patch: Partial<CRMLead> = {};

        const nextMql = evaluateMql(rule, {
            quantidade_animais: lead.quantidade_animais,
            tem_inscricao_estadual: lead.tem_inscricao_estadual,
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
    return updated as CRMLead;
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
    return updated as CRMLead;
}
