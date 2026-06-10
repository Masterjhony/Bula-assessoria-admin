'use server';

import { supabaseAdmin } from '@/lib/supabase';
import { DEFAULT_JMP_MQL_RULE } from '@/lib/crm-types';

const TIME_WINDOW_DAYS = 30;

function addDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

function hasStateRegistration(flag?: string | null, number?: string | null): boolean {
    const normalizedFlag = String(flag ?? '').trim().toLowerCase();
    const normalizedNumber = String(number ?? '').trim();
    return normalizedFlag === 'sim' || normalizedNumber.length > 0;
}

export interface JmpLeadQualificationAnalytics {
    since: string;
    until: string;
    totalLeads: number;
    mqlLeads: number;
    leadsWithIe: number;
    leadsWithIeNotMql: number;
    mqlRate: number;
    ieRate: number;
    mqlDefinition: string;
    error?: string;
}

type JmpLeadRow = {
    id: string;
    is_mql: boolean | null;
    tem_inscricao_estadual: string | null;
    inscricao_estadual: string | null;
}

export async function getJmpLeadQualificationAnalytics(): Promise<JmpLeadQualificationAnalytics> {
    const untilDate = new Date();
    const sinceDate = addDays(untilDate, -TIME_WINDOW_DAYS);
    const base: JmpLeadQualificationAnalytics = {
        since: sinceDate.toISOString(),
        until: untilDate.toISOString(),
        totalLeads: 0,
        mqlLeads: 0,
        leadsWithIe: 0,
        leadsWithIeNotMql: 0,
        mqlRate: 0,
        ieRate: 0,
        mqlDefinition: `MQL = lead qualificado pelo marketing. No Funil JMP, a regra padrao e ${DEFAULT_JMP_MQL_RULE.min_cabecas}+ cabecas e Inscricao Estadual = Sim.`,
    };

    try {
        const { data, error } = await supabaseAdmin()
            .from('crm_leads')
            .select('id, is_mql, tem_inscricao_estadual, inscricao_estadual')
            .or('source.eq.jmp-landing,source_page.eq.jmp.bulaassessoria.com,origem.ilike.%Landing JMP%')
            .gte('data_entrada', base.since);

        if (error) return { ...base, error: error.message };

        const rows = (data ?? []) as JmpLeadRow[];
        const totalLeads = rows.length;
        const mqlLeads = rows.filter((lead) => !!lead.is_mql).length;
        const leadsWithIe = rows.filter((lead) => hasStateRegistration(lead.tem_inscricao_estadual, lead.inscricao_estadual)).length;
        const leadsWithIeNotMql = rows.filter((lead) => hasStateRegistration(lead.tem_inscricao_estadual, lead.inscricao_estadual) && !lead.is_mql).length;

        return {
            ...base,
            totalLeads,
            mqlLeads,
            leadsWithIe,
            leadsWithIeNotMql,
            mqlRate: totalLeads ? Math.round((mqlLeads / totalLeads) * 1000) / 10 : 0,
            ieRate: totalLeads ? Math.round((leadsWithIe / totalLeads) * 1000) / 10 : 0,
        };
    } catch (err) {
        return {
            ...base,
            error: err instanceof Error ? err.message : 'Nao foi possivel consultar os leads JMP.',
        };
    }
}
