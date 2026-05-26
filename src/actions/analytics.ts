'use server';

import { analyticsDataClient, PROPERTY_ID } from '@/utils/google-analytics/client';

const GA4_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms = GA4_TIMEOUT_MS): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`GA4 request timed out after ${ms}ms`)), ms),
        ),
    ]);
}

export interface AnalyticsMetrics {
    activeUsers: number;
    totalUsers: number;
    sessions: number;
    averageSessionDuration: number;
}

export async function getDashboardMetrics(): Promise<AnalyticsMetrics | null> {
    try {
        const [response] = await withTimeout(analyticsDataClient.runReport({
            property: `properties/${PROPERTY_ID}`,
            dateRanges: [
                {
                    startDate: '30daysAgo',
                    endDate: 'today',
                },
            ],
            metrics: [
                { name: 'activeUsers' },
                { name: 'totalUsers' },
                { name: 'sessions' },
                { name: 'averageSessionDuration' },
            ],
        }));

        if (!response.rows || response.rows.length === 0) {
            return {
                activeUsers: 0,
                totalUsers: 0,
                sessions: 0,
                averageSessionDuration: 0,
            };
        }

        const row = response.rows[0];
        return {
            activeUsers: parseInt(row.metricValues?.[0].value || '0', 10),
            totalUsers: parseInt(row.metricValues?.[1].value || '0', 10),
            sessions: parseInt(row.metricValues?.[2].value || '0', 10),
            averageSessionDuration: parseFloat(row.metricValues?.[3].value || '0'),
        };
    } catch (error) {
        console.error('Error fetching GA4 metrics:', error);
        return null;
    }
}

export interface DetailedAnalyticsReport {
    date: string;
    activeUsers: number;
    sessions: number;
}

export async function getDetailedReport(): Promise<DetailedAnalyticsReport[]> {
    try {
        const [response] = await withTimeout(analyticsDataClient.runReport({
            property: `properties/${PROPERTY_ID}`,
            dateRanges: [
                {
                    startDate: '30daysAgo',
                    endDate: 'today',
                },
            ],
            dimensions: [
                { name: 'date' },
            ],
            metrics: [
                { name: 'activeUsers' },
                { name: 'sessions' },
            ],
            orderBys: [
                {
                    dimension: {
                        orderType: 'ALPHANUMERIC',
                        dimensionName: 'date',
                    },
                },
            ],
        }));

        if (!response.rows) {
            return [];
        }

        return response.rows.map(row => ({
            date: row.dimensionValues?.[0].value || '',
            activeUsers: parseInt(row.metricValues?.[0].value || '0', 10),
            sessions: parseInt(row.metricValues?.[1].value || '0', 10),
        }));
    } catch (error) {
        console.error('Error fetching detailed GA4 report:', error);
        return [];
    }
}

export interface PageViewsReport {
    pagePath: string;
    pageTitle: string;
    views: number;
}

export async function getPageViews(): Promise<PageViewsReport[]> {
    try {
        const [response] = await withTimeout(analyticsDataClient.runReport({
            property: `properties/${PROPERTY_ID}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
            metrics: [{ name: 'screenPageViews' }],
            orderBys: [
                {
                    metric: { metricName: 'screenPageViews' },
                    desc: true,
                },
            ],
            limit: 10,
        }));

        if (!response.rows) return [];

        return response.rows.map(row => ({
            pagePath: row.dimensionValues?.[0].value || '',
            pageTitle: row.dimensionValues?.[1].value || '',
            views: parseInt(row.metricValues?.[0].value || '0', 10),
        }));
    } catch (error) {
        console.error('Error fetching GA4 page views:', error);
        return [];
    }
}

export interface SessionChannelsReport {
    channelGroup: string;
    sessions: number;
}

export async function getSessionChannels(): Promise<SessionChannelsReport[]> {
    try {
        const [response] = await withTimeout(analyticsDataClient.runReport({
            property: `properties/${PROPERTY_ID}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'sessionDefaultChannelGroup' }],
            metrics: [{ name: 'sessions' }],
            orderBys: [
                {
                    metric: { metricName: 'sessions' },
                    desc: true,
                },
            ],
            limit: 10,
        }));

        if (!response.rows) return [];

        return response.rows.map(row => ({
            channelGroup: row.dimensionValues?.[0].value || '',
            sessions: parseInt(row.metricValues?.[0].value || '0', 10),
        }));
    } catch (error) {
        console.error('Error fetching GA4 channels:', error);
        return [];
    }
}

export interface AverageTimeReport {
    date: string;
    averageSessionDuration: number;
}

export async function getAverageTimeReport(): Promise<AverageTimeReport[]> {
    try {
        const [response] = await withTimeout(analyticsDataClient.runReport({
            property: `properties/${PROPERTY_ID}`,
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'averageSessionDuration' }],
            orderBys: [
                {
                    dimension: {
                        orderType: 'ALPHANUMERIC',
                        dimensionName: 'date',
                    },
                },
            ],
        }));

        if (!response.rows) return [];

        return response.rows.map(row => ({
            date: row.dimensionValues?.[0].value || '',
            averageSessionDuration: parseFloat(row.metricValues?.[0].value || '0'),
        }));
    } catch (error) {
        console.error('Error fetching GA4 average time report:', error);
        return [];
    }
}
