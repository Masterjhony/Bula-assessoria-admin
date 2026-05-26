import { BetaAnalyticsDataClient } from '@google-analytics/data';

// ID da Propriedade do Google Analytics 4
const PROPERTY_ID = process.env.GOOGLE_GA4_PROPERTY_ID || '483341191';

const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    : undefined;

if (!credentials) {
    console.error("GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set.");
}

const analyticsDataClient = new BetaAnalyticsDataClient({
    credentials,
});

export { analyticsDataClient, PROPERTY_ID };
