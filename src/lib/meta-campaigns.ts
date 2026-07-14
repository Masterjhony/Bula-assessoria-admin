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
    // TODAS as 7 campanhas da conta CA2 - Bula 360 (todas já encerradas/pausadas).
    // Entrega (spend/impressões/alcance/cliques/ctr/cpc/cpm) e `leads` puxados ao
    // vivo do conector da Meta em 14/07/2026 (date_preset=maximum). MQL e interesses
    // são recalculados da nossa base (crm_leads.is_mql / o_que_busca) cruzando pelo
    // NOME da campanha. CPL = spend ÷ leads (Meta).
    //
    // As campanhas "JMP SITE" mandavam tráfego para o site (não form da Meta): a
    // Meta reporta leads N/A e a base não as tagueia por nome, então ficam com
    // leads/MQL 0 (o investimento aparece, a conversão foi captada fora daqui).
    updatedAt: '2026-07-14',
    account: 'CA2 - Bula 360',
    campaigns: [
        {
            id: '120249049934240708',
            name: 'LEADS - FORMS INST EAO — Cópia',
            status: 'PAUSED',
            start: '2026-07-08',
            spend: 2887.76,
            leads: 216,
            mql: 37,
            impressions: 258815,
            reach: 129735,
            clicks: 3509,
            ctr: 1.36,
            cpc: 0.82,
            cpm: 11.16,
            cpl: 13.37,
            interesses: [
                { label: '1 a 5', n: 60 },
                { label: '1 a 5 bezerras', n: 23 },
                { label: '6 a 10 bezerras', n: 13 },
                { label: '1 a 5 matrizes', n: 11 },
                { label: 'Ainda não sei', n: 10 },
            ],
        },
        {
            // Variante da EAO que quase não veiculou (subiu e foi pausada no mesmo dia).
            id: '120249047242270708',
            name: 'LEADS - FORMS INST EAO',
            status: 'PAUSED',
            start: '2026-07-08',
            spend: 35.39,
            leads: 0,
            mql: 0,
            impressions: 2689,
            reach: 2502,
            clicks: 15,
            ctr: 0.56,
            cpc: 2.36,
            cpm: 13.16,
            cpl: 0,
            interesses: [],
        },
        {
            id: '120248414742440708',
            name: 'LEADS - FORMS INST MAGDA Macho',
            status: 'PAUSED',
            start: '2026-06-25',
            spend: 1223.30,
            leads: 369,
            mql: 46,
            impressions: 130199,
            reach: 88753,
            clicks: 2978,
            ctr: 2.29,
            cpc: 0.41,
            cpm: 9.40,
            cpl: 3.32,
            interesses: [
                { label: '1 a 5', n: 166 },
                { label: '1 a 5 bezerras', n: 44 },
                { label: '6 a 10 bezerras', n: 30 },
                { label: 'Ainda não sei', n: 19 },
                { label: '11 a 20 bezerras', n: 18 },
            ],
        },
        {
            id: '120248241763020708',
            name: 'LEADS - FORMS INST PERPETUO',
            status: 'PAUSED',
            start: '2026-06-23',
            spend: 1124.55,
            leads: 557,
            mql: 17,
            impressions: 120745,
            reach: 83673,
            clicks: 2955,
            ctr: 2.45,
            cpc: 0.38,
            cpm: 9.31,
            cpl: 2.02,
            interesses: [
                { label: '1 a 5 bezerras', n: 95 },
                { label: '6 a 10 bezerras', n: 71 },
                { label: '21 a 50 bezerras', n: 48 },
                { label: '11 a 20 bezerras', n: 47 },
                { label: '1 a 5 matrizes', n: 35 },
            ],
        },
        {
            id: '120247596748550708',
            name: '13/06 e 14/06 LEADS JMP SITE — Cópia',
            status: 'PAUSED',
            start: '2026-06-11',
            spend: 606.91,
            leads: 31,
            mql: 0,
            impressions: 21600,
            reach: 17658,
            clicks: 565,
            ctr: 2.62,
            cpc: 1.07,
            cpm: 28.10,
            cpl: 19.58,
            interesses: [],
        },
        {
            id: '120247531284740708',
            name: 'Leilao JMP 13 14/06 Forms Insta',
            status: 'PAUSED',
            start: '2026-06-10',
            spend: 1286.53,
            leads: 110,
            mql: 0,
            impressions: 158600,
            reach: 102408,
            clicks: 1712,
            ctr: 1.08,
            cpc: 0.75,
            cpm: 8.11,
            cpl: 11.70,
            interesses: [],
        },
        {
            // Tráfego para o site (JMP): leads captados fora da Meta — leads/MQL 0 aqui.
            id: '120247464210140708',
            name: '13/06 e 14/06 LEADS JMP SITE',
            status: 'PAUSED',
            start: '2026-06-09',
            spend: 2498.26,
            leads: 0,
            mql: 0,
            impressions: 117115,
            reach: 61825,
            clicks: 3236,
            ctr: 2.76,
            cpc: 0.77,
            cpm: 21.33,
            cpl: 0,
            interesses: [],
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
