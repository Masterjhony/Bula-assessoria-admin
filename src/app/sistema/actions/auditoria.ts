'use server';

import { requireUser, supabaseAdmin } from '@/lib/supabase';
import { runAuditoriaDoDia, type AuditoriaFalha } from '@/lib/concierge-auditoria';

export interface AuditoriaRow {
    id: string;
    dia: string;
    phone: string;
    lead_id: string | null;
    lead_nome: string | null;
    msgs_lead: number;
    msgs_bot: number;
    fase_final: string | null;
    score: number | null;
    resumo: string | null;
    falhas: AuditoriaFalha[];
    trava: string | null;
    proxima_acao: string | null;
    destaque: string | null;
    created_at: string;
}

export interface AuditoriaDia {
    dia: string;
    total: number;
    scoreMedio: number | null;
}

/** Dias com auditoria (para o seletor), mais recente primeiro. */
export async function getAuditoriaDias(): Promise<AuditoriaDia[]> {
    await requireUser();
    const supa = supabaseAdmin();
    const { data, error } = await supa
        .from('crm_conversa_auditorias')
        .select('dia, score')
        .order('dia', { ascending: false })
        .limit(3000);
    if (error) throw new Error(error.message);
    const byDia = new Map<string, { total: number; soma: number; comScore: number }>();
    for (const r of data ?? []) {
        const d = byDia.get(r.dia) ?? { total: 0, soma: 0, comScore: 0 };
        d.total++;
        if (typeof r.score === 'number') { d.soma += r.score; d.comScore++; }
        byDia.set(r.dia, d);
    }
    return [...byDia.entries()].map(([dia, d]) => ({
        dia, total: d.total,
        scoreMedio: d.comScore ? Math.round((d.soma / d.comScore) * 10) / 10 : null,
    }));
}

/** Auditorias de um dia, piores scores primeiro (é onde está o trabalho). */
export async function getAuditorias(dia: string): Promise<AuditoriaRow[]> {
    await requireUser();
    const supa = supabaseAdmin();
    const { data, error } = await supa
        .from('crm_conversa_auditorias')
        .select('*')
        .eq('dia', dia)
        .order('score', { ascending: true, nullsFirst: false })
        .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as AuditoriaRow[];
}

/** Roda (ou reroda) a auditoria de um dia sob demanda, direto da aba. */
export async function rodarAuditoria(dia: string): Promise<{ auditadas: number; puladas: number; erros: number }> {
    await requireUser();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error('Dia inválido');
    return runAuditoriaDoDia(supabaseAdmin(), dia);
}
