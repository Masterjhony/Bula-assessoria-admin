// Snapshot das campanhas de Lead Ads (Meta) usadas no dashboard de CRM.
//
// O app ainda não tem integração ao vivo com a Marketing API do Meta, então os
// números abaixo são um retrato manual (atualize `updatedAt` ao revisar). Leads,
// investimento e CPL vêm do Meta (acumulado desde o início de cada campanha);
// MQL é calculado sobre as respostas dos formulários (≥100 cabeças + Inscrição
// Estadual), cruzadas por campaign_id na aba "LEADS BULA - PERPETUO".
//
// Para atualizar: rode a consulta do conector do Meta (ads_get_ad_entities,
// level=campaign, date_preset=maximum) e o cruzamento de MQL pela planilha.

export interface MetaCampaignStat {
    id: string;
    name: string;
    status: 'ACTIVE' | 'PAUSED';
    /** ISO date (YYYY-MM-DD) de início da campanha. */
    start: string;
    spend: number;        // R$ investido (acumulado)
    leads: number;        // leads (form) reportados pelo Meta
    mql: number;          // MQL calculado (planilha)
    impressions: number;
    reach: number;
    clicks: number;
    ctr: number;          // %
    cpc: number;          // R$
    cpm: number;          // R$
    cpl: number;          // R$ custo por lead
    interesses: { label: string; n: number }[];
}

export interface MetaCampaignsSnapshot {
    updatedAt: string;    // YYYY-MM-DD
    account: string;
    campaigns: MetaCampaignStat[];
}

export const META_CAMPAIGNS: MetaCampaignsSnapshot = {
    updatedAt: '2026-06-27',
    account: 'CA2 - Bula 360',
    campaigns: [
        {
            id: '120248414742440708',
            name: 'LEADS - FORMS INST MAGDA Macho',
            status: 'ACTIVE',
            start: '2026-06-25',
            spend: 552.90,
            leads: 96,
            mql: 12,
            impressions: 45598,
            reach: 37766,
            clicks: 859,
            ctr: 1.88,
            cpc: 0.64,
            cpm: 12.13,
            cpl: 5.76,
            interesses: [
                { label: 'Bezerras P.O.', n: 42 },
                { label: 'Não sei ainda', n: 42 },
                { label: 'Matrizes P.O.', n: 8 },
                { label: 'Embriões', n: 2 },
                { label: 'Sêmen', n: 1 },
            ],
        },
        {
            id: '120248241763020708',
            name: 'LEADS - FORMS INST PERPETUO',
            status: 'PAUSED',
            start: '2026-06-23',
            spend: 307.39,
            leads: 174,
            mql: 9,
            impressions: 29261,
            reach: 20344,
            clicks: 899,
            ctr: 3.07,
            cpc: 0.34,
            cpm: 10.51,
            cpl: 1.77,
            interesses: [
                { label: 'Bezerras P.O.', n: 69 },
                { label: 'Matrizes P.O.', n: 66 },
                { label: 'Não sei ainda', n: 34 },
                { label: 'Sêmen', n: 1 },
            ],
        },
    ],
};

export interface MetaCampaignsTotals {
    spend: number;
    leads: number;
    mql: number;
    impressions: number;
    reach: number;
    clicks: number;
    cpl: number;          // investimento / leads
    cpmql: number;        // investimento / mql
    ctr: number;          // cliques / impressões
    mqlRate: number;      // mql / leads (%)
    activeCount: number;
    campaignCount: number;
}

export function metaCampaignTotals(snap: MetaCampaignsSnapshot = META_CAMPAIGNS): MetaCampaignsTotals {
    const c = snap.campaigns;
    const spend = c.reduce((a, x) => a + x.spend, 0);
    const leads = c.reduce((a, x) => a + x.leads, 0);
    const mql = c.reduce((a, x) => a + x.mql, 0);
    const impressions = c.reduce((a, x) => a + x.impressions, 0);
    const reach = c.reduce((a, x) => a + x.reach, 0);
    const clicks = c.reduce((a, x) => a + x.clicks, 0);
    return {
        spend, leads, mql, impressions, reach, clicks,
        cpl: leads ? spend / leads : 0,
        cpmql: mql ? spend / mql : 0,
        ctr: impressions ? (clicks / impressions) * 100 : 0,
        mqlRate: leads ? (mql / leads) * 100 : 0,
        activeCount: c.filter(x => x.status === 'ACTIVE').length,
        campaignCount: c.length,
    };
}

export function cpmqlOf(c: MetaCampaignStat): number {
    return c.mql ? c.spend / c.mql : 0;
}
