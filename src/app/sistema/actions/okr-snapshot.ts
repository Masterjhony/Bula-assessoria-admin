'use server';

import { createClient } from '@/utils/supabase/server';
import {
    CRM_STAGE_ASSESSORS,
    CRM_STAGE_QUALIFICATION,
    CRM_STAGE_REGISTRATION,
    normalizeCRMStatus,
} from '@/lib/crm-types';

// ── Types ───────────────────────────────────────────────────────────────────

export interface OKRLeilaoSummary {
    id: string;
    nome: string;
    data: string;
    status: string;
    expectativa: number;
    meta_bula: number;
    realizado_bula: number;
}

export interface OKRFechamentoSummary {
    id: string;
    nome: string;
    data: string;
    vgv_total: number;
    receita_bula: number;
    comissao_assessoria: number;
}

export interface OKRCampaignSummary {
    id: string;
    name: string;
    status: string;
    total_recipients: number;
    sent_count: number;
    replied_count: number;
}

export interface OKRSnapshot {
    /** Indicadores comerciais — geração de oportunidade */
    leads: {
        total: number;
        new30d: number;
        new7d: number;
        newMonth: number;
        prev30d: number;
        trendDeltaPct: number;
        mqlTotal: number;
        mql30d: number;
        mqlActive: number;
        mqlConvPct: number;
        conversionPct: number;
        pipelineValue: number;
        closingSoonCount: number;
        velocityDays: number;
        stalledCount: number;
        daily30d: number[];
    };
    /** Engajamento — WhatsApp */
    whatsapp: {
        msgs30d: number;
        msgs7d: number;
        out30d: number;
        in30d: number;
        replyRatePct: number;
        daily30d: number[];
    };
    /** Resultado comercial — Leilões */
    auctions: {
        upcoming: OKRLeilaoSummary[];
        recent: OKRFechamentoSummary[];
        vgv90d: number;
        receita90d: number;
        roi90dPct: number;
    };
    /** Campanhas ativas (WhatsApp central) */
    campaigns: OKRCampaignSummary[];
    /** Mapeamento task -> KR ids */
    taskKRLinks: Record<string, string[]>;
    /** Lookup reverso kr_id -> [task_ids] */
    krTaskLinks: Record<string, string[]>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const DAY_MS = 86400000;
const STALLED_STAGES = [CRM_STAGE_QUALIFICATION, CRM_STAGE_REGISTRATION];
const STALLED_DAYS = 30;

function startOfDay(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ── Snapshot ────────────────────────────────────────────────────────────────

export async function getOKRSnapshot(): Promise<OKRSnapshot> {
    const supabase = await createClient();
    const now = new Date();
    const start7d = new Date(now.getTime() - 7 * DAY_MS);
    const start30d = new Date(now.getTime() - 30 * DAY_MS);
    const start90d = new Date(now.getTime() - 90 * DAY_MS);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
        leadsRes,
        wppRes,
        leiloesRes,
        fechamentosRes,
        campaignsRes,
        linksRes,
    ] = await Promise.all([
        supabase.from('crm_leads').select(`
            id, status, created_at, updated_at, is_mql,
            valor_estimado, data_estimada_fechamento
        `).limit(5000),
        supabase.from('whatsapp_messages')
            .select('id, direction, created_at')
            .gte('created_at', start30d.toISOString())
            .limit(5000),
        supabase.from('bula_leiloes')
            .select('id, nome, data, status, expectativa, meta_bula, realizado_bula')
            .order('data', { ascending: true }),
        supabase.from('bula_leilao_fechamento')
            .select('id, nome, data, vgv_total, receita_bula, comissao_assessoria')
            .gte('data', start90d.toISOString().split('T')[0])
            .order('data', { ascending: false }),
        supabase.from('whatsapp_campaigns')
            .select(`
                id, name, status, total_recipients, sent_count,
                whatsapp_campaign_recipients(replied_at)
            `)
            .in('status', ['enviando', 'concluida'])
            .order('created_at', { ascending: false })
            .limit(8),
        supabase.from('tactical_task_kr_links').select('task_id, kr_id'),
    ]);

    const allLeads = (leadsRes.data ?? []).map(lead => ({
        ...lead,
        status: normalizeCRMStatus(lead.status),
    }));
    const allWpp = wppRes.data ?? [];
    const allLeiloes = leiloesRes.data ?? [];
    const allFechamentos = fechamentosRes.data ?? [];
    const allCampaigns = campaignsRes.data ?? [];
    const allLinks = linksRes.data ?? [];

    // ── Leads ──
    const nowMs = now.getTime();
    const start30dMs = start30d.getTime();
    const total = allLeads.length;
    const new30d = allLeads.filter(l => new Date(l.created_at).getTime() >= start30dMs).length;
    const new7d = allLeads.filter(l => new Date(l.created_at) >= start7d).length;
    const newMonth = allLeads.filter(l => new Date(l.created_at) >= startOfMonth).length;
    const prev30d = allLeads.filter(l => {
        const t = new Date(l.created_at).getTime();
        return t >= start30dMs - 30 * DAY_MS && t < start30dMs;
    }).length;
    const trendDeltaPct = prev30d > 0 ? ((new30d - prev30d) / prev30d) * 100 : 0;

    const mqlAll = allLeads.filter(l => !!l.is_mql);
    const mqlTotal = mqlAll.length;
    const mql30d = mqlAll.filter(l => new Date(l.created_at) >= start30d).length;
    const closed = allLeads.filter(l => l.status === CRM_STAGE_ASSESSORS).length;
    const mqlClosed = mqlAll.filter(l => l.status === CRM_STAGE_ASSESSORS).length;
    const mqlLost = 0;
    const mqlActive = mqlTotal - mqlClosed - mqlLost;
    const mqlConvPct = mqlTotal > 0 ? (mqlClosed / mqlTotal) * 100 : 0;
    const conversionPct = total > 0 ? (closed / total) * 100 : 0;

    const pipelineValue = allLeads
        .filter(l => l.status !== CRM_STAGE_ASSESSORS)
        .reduce((s, l) => s + (Number(l.valor_estimado) || 0), 0);

    const closingSoonCount = allLeads.filter(l => {
        if (!l.data_estimada_fechamento) return false;
        const diff = Math.ceil((new Date(l.data_estimada_fechamento).getTime() - nowMs) / DAY_MS);
        return diff >= 0 && diff <= 7;
    }).length;

    const closedWithDates = allLeads.filter(l => l.status === CRM_STAGE_ASSESSORS && l.created_at && l.updated_at);
    const velocityDays = closedWithDates.length > 0
        ? closedWithDates.reduce((s, l) => {
            const days = (new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) / DAY_MS;
            return s + Math.max(days, 0);
        }, 0) / closedWithDates.length
        : 0;

    const stalledMs = STALLED_DAYS * DAY_MS;
    const stalledCount = allLeads.filter(l => {
        if (!STALLED_STAGES.includes(l.status)) return false;
        const ref = new Date(l.updated_at || l.created_at).getTime();
        return nowMs - ref >= stalledMs;
    }).length;

    const todayMid = startOfDay(now).getTime();
    const daily30d: number[] = Array.from({ length: 30 }, () => 0);
    for (const l of allLeads) {
        const d = startOfDay(new Date(l.created_at)).getTime();
        const idx = 29 - Math.floor((todayMid - d) / DAY_MS);
        if (idx >= 0 && idx < 30) daily30d[idx] += 1;
    }

    // ── WhatsApp ──
    const msgs30d = allWpp.length;
    const msgs7d = allWpp.filter(m => new Date(m.created_at) >= start7d).length;
    const out30d = allWpp.filter(m => m.direction === 'outbound' || !m.direction).length;
    const in30d = allWpp.filter(m => m.direction === 'inbound').length;
    const replyRatePct = out30d > 0 ? (in30d / out30d) * 100 : 0;

    const wppDaily30d: number[] = Array.from({ length: 30 }, () => 0);
    for (const m of allWpp) {
        const d = startOfDay(new Date(m.created_at)).getTime();
        const idx = 29 - Math.floor((todayMid - d) / DAY_MS);
        if (idx >= 0 && idx < 30) wppDaily30d[idx] += 1;
    }

    // ── Leilões — próximos (data >= today, status !== concluido) ──
    const todayISO = now.toISOString().split('T')[0];
    const upcoming: OKRLeilaoSummary[] = allLeiloes
        .filter(l => l.data >= todayISO && l.status !== 'concluido')
        .slice(0, 6)
        .map(l => ({
            id: l.id,
            nome: l.nome,
            data: l.data,
            status: l.status,
            expectativa: Number(l.expectativa) || 0,
            meta_bula: Number(l.meta_bula) || 0,
            realizado_bula: Number(l.realizado_bula) || 0,
        }));

    // ── Fechamentos recentes (90d) ──
    const recent: OKRFechamentoSummary[] = allFechamentos
        .slice(0, 8)
        .map(f => ({
            id: f.id,
            nome: f.nome,
            data: f.data,
            vgv_total: Number(f.vgv_total) || 0,
            receita_bula: Number(f.receita_bula) || 0,
            comissao_assessoria: Number(f.comissao_assessoria) || 0,
        }));
    const vgv90d = recent.reduce((s, r) => s + r.vgv_total, 0);
    const receita90d = recent.reduce((s, r) => s + r.receita_bula, 0);
    const investido90d = recent.reduce((s, r) => s + r.comissao_assessoria, 0);
    const roi90dPct = investido90d > 0 ? (receita90d / investido90d) * 100 : 0;

    // ── Campanhas ──
    type RawCampaign = {
        id: string; name: string; status: string;
        total_recipients: number | string | null;
        sent_count: number | string | null;
        whatsapp_campaign_recipients?: Array<{ replied_at: string | null }> | null;
    };
    const campaigns: OKRCampaignSummary[] = (allCampaigns as RawCampaign[]).map(c => {
        const recipients = c.whatsapp_campaign_recipients ?? [];
        const replied = recipients.filter(r => r.replied_at).length;
        return {
            id: c.id,
            name: c.name,
            status: c.status,
            total_recipients: Number(c.total_recipients) || 0,
            sent_count: Number(c.sent_count) || 0,
            replied_count: replied,
        };
    });

    // ── Task ↔ KR links ──
    const taskKRLinks: Record<string, string[]> = {};
    const krTaskLinks: Record<string, string[]> = {};
    for (const link of allLinks) {
        const tid = link.task_id as string;
        const kid = link.kr_id as string;
        if (!taskKRLinks[tid]) taskKRLinks[tid] = [];
        taskKRLinks[tid].push(kid);
        if (!krTaskLinks[kid]) krTaskLinks[kid] = [];
        krTaskLinks[kid].push(tid);
    }

    return {
        leads: {
            total, new30d, new7d, newMonth, prev30d, trendDeltaPct,
            mqlTotal, mql30d, mqlActive, mqlConvPct, conversionPct,
            pipelineValue, closingSoonCount, velocityDays, stalledCount, daily30d,
        },
        whatsapp: {
            msgs30d, msgs7d, out30d, in30d, replyRatePct,
            daily30d: wppDaily30d,
        },
        auctions: {
            upcoming, recent, vgv90d, receita90d, roi90dPct,
        },
        campaigns,
        taskKRLinks,
        krTaskLinks,
    };
}
