'use server';

const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || 'act_2705134163151418';
const META_BUSINESS_ID = process.env.META_BUSINESS_ID || '6034968389924192';
const META_CAMPAIGN_IDS = (process.env.META_CAMPAIGN_IDS || '120247464210140708')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
const TIMEOUT_MS = 15_000;

function isConfigured(): boolean {
    return Boolean(META_ACCESS_TOKEN && META_AD_ACCOUNT_ID && META_CAMPAIGN_IDS.length);
}

function addDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

function formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function toNumber(value: unknown): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
}

export interface JmpMetaAdsCampaignRow {
    campaignId: string;
    campaignName: string;
    impressions: number;
    clicks: number;
    linkClicks: number;
    spend: number;
}

export interface JmpMetaAdsAnalytics {
    configured: boolean;
    businessId: string;
    adAccountId: string;
    campaignIds: string[];
    since: string;
    until: string;
    impressions: number;
    clicks: number;
    linkClicks: number;
    spend: number;
    currency: string;
    campaigns: JmpMetaAdsCampaignRow[];
    error?: string;
}

interface MetaInsightsResponse {
    data?: Array<Record<string, unknown>>;
    paging?: {
        next?: string;
    };
    error?: {
        message?: string;
    };
}

async function fetchInsightsPage(url: string, signal: AbortSignal): Promise<MetaInsightsResponse> {
    const res = await fetch(url, { signal, cache: 'no-store' });
    const body = (await res.json().catch(() => ({}))) as MetaInsightsResponse;
    if (!res.ok) {
        return {
            error: {
                message: body.error?.message || `Meta Ads API retornou HTTP ${res.status}`,
            },
        };
    }
    return body;
}

export async function isMetaAdsConfigured(): Promise<boolean> {
    return isConfigured();
}

/** Período em dias-calendário (YYYY-MM-DD, inclusivo). Sem range → últimos 30 dias. */
export interface JmpMetaAdsRange {
    since: string;
    until: string;
}

const RANGE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function getJmpMetaAdsAnalytics(range?: JmpMetaAdsRange): Promise<JmpMetaAdsAnalytics> {
    const hasRange = Boolean(range && RANGE_DATE_RE.test(range.since) && RANGE_DATE_RE.test(range.until));
    const until = new Date();
    const since = addDays(until, -30);
    const base: JmpMetaAdsAnalytics = {
        configured: isConfigured(),
        businessId: META_BUSINESS_ID,
        adAccountId: META_AD_ACCOUNT_ID,
        campaignIds: META_CAMPAIGN_IDS,
        since: hasRange ? range!.since : formatDate(since),
        until: hasRange ? range!.until : formatDate(until),
        impressions: 0,
        clicks: 0,
        linkClicks: 0,
        spend: 0,
        currency: 'BRL',
        campaigns: [],
    };

    if (!isConfigured()) return base;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const params = new URLSearchParams({
            access_token: META_ACCESS_TOKEN,
            fields: 'campaign_id,campaign_name,impressions,clicks,inline_link_clicks,spend,account_currency',
            level: 'campaign',
            time_increment: 'all_days',
            time_range: JSON.stringify({ since: base.since, until: base.until }),
            filtering: JSON.stringify([
                { field: 'campaign.id', operator: 'IN', value: META_CAMPAIGN_IDS },
            ]),
        });
        let nextUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${META_AD_ACCOUNT_ID}/insights?${params.toString()}`;
        const rows: JmpMetaAdsCampaignRow[] = [];
        let currency = base.currency;

        while (nextUrl) {
            const page = await fetchInsightsPage(nextUrl, controller.signal);
            if (page.error?.message) return { ...base, error: page.error.message };

            for (const item of page.data ?? []) {
                currency = String(item.account_currency || currency);
                rows.push({
                    campaignId: String(item.campaign_id || ''),
                    campaignName: String(item.campaign_name || 'Campanha Meta Ads'),
                    impressions: toNumber(item.impressions),
                    clicks: toNumber(item.clicks),
                    linkClicks: toNumber(item.inline_link_clicks),
                    spend: toNumber(item.spend),
                });
            }

            nextUrl = page.paging?.next || '';
        }

        return {
            ...base,
            campaigns: rows,
            currency,
            impressions: rows.reduce((sum, row) => sum + row.impressions, 0),
            clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
            linkClicks: rows.reduce((sum, row) => sum + row.linkClicks, 0),
            spend: rows.reduce((sum, row) => sum + row.spend, 0),
        };
    } catch (err) {
        const message = (err as Error).name === 'AbortError'
            ? 'Tempo limite ao consultar Meta Ads.'
            : 'Nao foi possivel consultar o Meta Ads.';
        return { ...base, error: message };
    } finally {
        clearTimeout(timer);
    }
}
