'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { dispatchWelcome } from '@/lib/whatsapp';

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
}

// Colunas reais da tabela crm_leads que o painel pode gravar. Qualquer chave
// fora desta lista é descartada antes do INSERT/UPDATE — evita o erro
// "column ... does not exist" quando o formulário envia um campo só de UI.
const WRITABLE_COLUMNS = new Set<string>([
    'nome', 'status', 'prioridade', 'interesse', 'empresa', 'ultimo_contato',
    'data_estimada_fechamento', 'telefone', 'celular', 'responsavel', 'position',
    'cpf', 'inscricao_estadual',
    'funnel_id', 'valor_estimado', 'probabilidade', 'temperatura',
    'instagram', 'estado', 'cidade', 'o_que_busca', 'quantidade_animais',
    'momento_pecuaria', 'operacao_pecuaria', 'intencao_investimento', 'assessoria', 'is_mql',
    'source_page', 'source', 'medium', 'campaign', 'utm_content', 'utm_term',
    'gclid', 'fbclid', 'referrer', 'landing_url', 'email', 'notes', 'origem',
    'data_entrada', 'extra_data', 'contact_history', 'is_preferencial', 'contact_count',
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

    let query = supabase
        .from('crm_leads')
        .select('*')
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
