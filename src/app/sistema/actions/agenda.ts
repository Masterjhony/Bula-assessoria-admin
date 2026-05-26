'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AgendaEventType =
    | 'leilao'
    | 'reuniao'
    | 'prazo'
    | 'publicacao'
    | 'follow_up'
    | 'tarefa_interna'
    | 'financeiro'
    | 'juridico'
    | 'pos_evento';

export type AgendaEventStatus =
    | 'planejado'
    | 'em_andamento'
    | 'pendente'
    | 'atrasado'
    | 'concluido'
    | 'cancelado';

export type AgendaEventPriority = 'baixa' | 'media' | 'alta';

export interface AgendaEvent {
    id: string;
    title: string;
    description?: string | null;
    event_type: AgendaEventType;
    status: AgendaEventStatus;
    priority: AgendaEventPriority;
    start_at: string;
    end_at?: string | null;
    all_day: boolean;
    location?: string | null;
    color?: string | null;
    notes?: string | null;
    recurrence_rule?: string | null;
    recurrence_until?: string | null;

    responsible_member_id?: string | null;
    linked_leilao_id?: string | null;
    linked_task_id?: string | null;
    linked_flow_id?: string | null;
    linked_product_id?: number | null;
    linked_breeder_id?: number | null;
    linked_lead_id?: string | null;
    linked_contract_id?: string | null;

    created_at: string;
    updated_at: string;
}

export interface AgendaRelatedOption {
    id: string | number;
    label: string;
    sub?: string;
}

export interface AgendaRelatedOptions {
    leiloes: AgendaRelatedOption[];
    tasks: AgendaRelatedOption[];
    flows: AgendaRelatedOption[];
    products: AgendaRelatedOption[];
    breeders: AgendaRelatedOption[];
    leads: AgendaRelatedOption[];
    contracts: AgendaRelatedOption[];
    members: AgendaRelatedOption[];
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getAgendaEvents(rangeStartIso?: string, rangeEndIso?: string): Promise<AgendaEvent[]> {
    const supabase = await createClient();
    let q = supabase.from('agenda_events').select('*').order('start_at', { ascending: true });
    if (rangeStartIso) q = q.gte('start_at', rangeStartIso);
    if (rangeEndIso) q = q.lte('start_at', rangeEndIso);
    const { data, error } = await q;
    if (error) {
        console.error('[agenda] getAgendaEvents:', error);
        return [];
    }
    return (data || []) as AgendaEvent[];
}

export async function getAgendaRelatedOptions(): Promise<AgendaRelatedOptions> {
    const supabase = await createClient();

    const [leiloes, tasks, flows, products, breeders, leads, contracts, members] = await Promise.all([
        supabase
            .from('cronograma_leiloes')
            .select('id, nome, data, hora')
            .order('data', { ascending: false })
            .limit(500),
        supabase
            .from('tactical_tasks')
            .select('id, title, status')
            .order('created_at', { ascending: false })
            .limit(500),
        supabase
            .from('strategic_flows')
            .select('id, name, active')
            .order('created_at', { ascending: false })
            .limit(200),
        supabase
            .from('products')
            .select('id, name, category')
            .order('created_at', { ascending: false })
            .limit(500),
        supabase
            .from('breeders')
            .select('id, name')
            .order('name', { ascending: true })
            .limit(500),
        supabase
            .from('crm_leads')
            .select('id, nome, celular, telefone')
            .order('created_at', { ascending: false })
            .limit(500),
        supabase
            .from('tactical_contracts')
            .select('id, title, status')
            .order('created_at', { ascending: false })
            .limit(300),
        supabase
            .from('tactical_members')
            .select('id, name, role')
            .order('name', { ascending: true }),
    ]);

    type LeilaoRow   = { id: string;        nome: string;  data?: string | null; hora?: string | null };
    type TaskRow     = { id: string;        title: string; status?: string | null };
    type FlowRow     = { id: string;        name: string;  active?: boolean | null };
    type ProductRow  = { id: number;        name: string;  category?: string | null };
    type BreederRow  = { id: number;        name: string };
    type LeadRow     = { id: string;        nome?: string | null; celular?: string | null; telefone?: string | null };
    type ContractRow = { id: string;        title: string; status?: string | null };
    type MemberRow   = { id: string;        name: string;  role?: string | null };

    return {
        leiloes: ((leiloes.data ?? []) as LeilaoRow[]).map(l => ({
            id: l.id,
            label: l.nome,
            sub: l.data ? `${l.data}${l.hora ? ` · ${l.hora}` : ''}` : undefined,
        })),
        tasks: ((tasks.data ?? []) as TaskRow[]).map(t => ({
            id: t.id,
            label: t.title,
            sub: t.status ?? undefined,
        })),
        flows: ((flows.data ?? []) as FlowRow[]).map(f => ({
            id: f.id,
            label: f.name,
            sub: f.active ? 'Ativo' : 'Arquivado',
        })),
        products: ((products.data ?? []) as ProductRow[]).map(p => ({
            id: p.id,
            label: p.name,
            sub: p.category ?? undefined,
        })),
        breeders: ((breeders.data ?? []) as BreederRow[]).map(b => ({ id: b.id, label: b.name })),
        leads: ((leads.data ?? []) as LeadRow[]).map(l => ({
            id: l.id,
            label: l.nome || '(sem nome)',
            sub: l.celular || l.telefone || undefined,
        })),
        contracts: ((contracts.data ?? []) as ContractRow[]).map(c => ({
            id: c.id,
            label: c.title,
            sub: c.status ?? undefined,
        })),
        members: ((members.data ?? []) as MemberRow[]).map(m => ({
            id: m.id,
            label: m.name,
            sub: m.role ?? undefined,
        })),
    };
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export type AgendaEventInput = Omit<AgendaEvent, 'id' | 'created_at' | 'updated_at'>;

export async function createAgendaEvent(input: Partial<AgendaEventInput>): Promise<AgendaEvent> {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();

    const payload = {
        ...input,
        created_by: userData?.user?.id ?? null,
    };

    const { data, error } = await supabase
        .from('agenda_events')
        .insert(payload)
        .select()
        .single();

    if (error) {
        console.error('[agenda] createAgendaEvent:', error);
        throw new Error(error.message);
    }
    revalidatePath('/sistema/agenda');
    return data as AgendaEvent;
}

export async function updateAgendaEvent(id: string, updates: Partial<AgendaEventInput>): Promise<AgendaEvent> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('agenda_events')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) {
        console.error('[agenda] updateAgendaEvent:', error);
        throw new Error(error.message);
    }
    revalidatePath('/sistema/agenda');
    return data as AgendaEvent;
}

export async function deleteAgendaEvent(id: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from('agenda_events').delete().eq('id', id);
    if (error) {
        console.error('[agenda] deleteAgendaEvent:', error);
        throw new Error(error.message);
    }
    revalidatePath('/sistema/agenda');
}
