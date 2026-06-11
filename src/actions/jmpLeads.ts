'use server';

import { supabaseAdmin } from '@/lib/supabase';
import {
    DEFAULT_JMP_MQL_RULE,
    JMP_FUNNEL_ID,
    evaluateMql,
    type CRMMqlRule,
} from '@/lib/crm-types';

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
    quantidade_animais: string | null;
    tem_inscricao_estadual: string | null;
    inscricao_estadual: string | null;
}

async function getJmpMqlRule(): Promise<CRMMqlRule> {
    try {
        const { data } = await supabaseAdmin()
            .from('site_settings')
            .select('value')
            .eq('key', 'crm_config')
            .maybeSingle();
        const funnels = (data?.value as { funnels?: Array<{ id: string; mql_rule?: CRMMqlRule }> } | null)?.funnels;
        return funnels?.find((f) => f.id === JMP_FUNNEL_ID)?.mql_rule ?? DEFAULT_JMP_MQL_RULE;
    } catch {
        return DEFAULT_JMP_MQL_RULE;
    }
}

/** Período em dias-calendário no fuso de Brasília (YYYY-MM-DD, inclusivo). */
export interface JmpLeadsRange {
    since: string;
    until: string;
}

const RANGE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function getJmpLeadQualificationAnalytics(range?: JmpLeadsRange): Promise<JmpLeadQualificationAnalytics> {
    const hasRange = Boolean(range && RANGE_DATE_RE.test(range.since) && RANGE_DATE_RE.test(range.until));
    const untilDate = new Date();
    const sinceDate = addDays(untilDate, -TIME_WINDOW_DAYS);
    // Limites do dia no fuso de Brasília (UTC-3, sem horário de verão).
    const sinceIso = hasRange ? `${range!.since}T00:00:00-03:00` : sinceDate.toISOString();
    const untilIso = hasRange
        ? addDays(new Date(`${range!.until}T00:00:00-03:00`), 1).toISOString()
        : untilDate.toISOString();
    const base: JmpLeadQualificationAnalytics = {
        since: sinceIso,
        until: untilIso,
        totalLeads: 0,
        mqlLeads: 0,
        leadsWithIe: 0,
        leadsWithIeNotMql: 0,
        mqlRate: 0,
        ieRate: 0,
        mqlDefinition: `MQL = lead qualificado pelo marketing. No Funil JMP, a regra padrao e ${DEFAULT_JMP_MQL_RULE.min_cabecas}+ cabecas e Inscricao Estadual = Sim.`,
    };

    try {
        const mqlRule = await getJmpMqlRule();
        const { data, error } = await supabaseAdmin()
            .from('crm_leads')
            .select('id, quantidade_animais, tem_inscricao_estadual, inscricao_estadual')
            .or('source.eq.jmp-landing,source_page.eq.jmp.bulaassessoria.com,origem.ilike.%Landing JMP%')
            .gte('data_entrada', base.since)
            .lt('data_entrada', base.until);

        if (error) return { ...base, error: error.message };

        const rows = (data ?? []) as JmpLeadRow[];
        const totalLeads = rows.length;
        const isMql = (lead: JmpLeadRow) => evaluateMql(mqlRule, {
            quantidade_animais: lead.quantidade_animais,
            tem_inscricao_estadual: lead.tem_inscricao_estadual,
            inscricao_estadual: lead.inscricao_estadual,
        });
        const leadsWithIe = rows.filter((lead) => hasStateRegistration(lead.tem_inscricao_estadual, lead.inscricao_estadual)).length;
        const mqlLeads = rows.filter(isMql).length;
        const leadsWithIeNotMql = rows.filter((lead) => hasStateRegistration(lead.tem_inscricao_estadual, lead.inscricao_estadual) && !isMql(lead)).length;

        return {
            ...base,
            mqlDefinition: `MQL = lead qualificado pelo marketing. No Funil JMP, a regra atual e ${mqlRule.min_cabecas ?? 100}+ cabecas${mqlRule.require_ie ?? true ? ' e Inscricao Estadual = Sim' : ''}.`,
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
