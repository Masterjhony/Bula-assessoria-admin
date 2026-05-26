'use server';

/**
 * Server actions que consultam o PostHog via HogQL (Query API).
 *
 * Requer POSTHOG_PERSONAL_API_KEY + POSTHOG_PROJECT_ID. Se faltar qualquer
 * uma das duas, todas as funções devolvem `null` ou `[]` (degradação
 * silenciosa — o painel /web-admin/analytics segue funcionando só com GA4).
 *
 * Doc: https://posthog.com/docs/api/query
 */

const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
// PROJECT_ID 430113 é público (aparece no URL do PostHog) — defaultar evita
// depender de uma env var só pra isso. Override via POSTHOG_PROJECT_ID se mudar.
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID || '430113';
const API_KEY = process.env.POSTHOG_PERSONAL_API_KEY || '';
const TIMEOUT_MS = 15_000;

function apiHostForQueries(): string {
    // us.i.posthog.com → us.posthog.com (a Query API vive no host "app")
    try {
        const u = new URL(HOST);
        const fixed = u.host.replace(/^([a-z]+)\.i\.posthog\.com$/, '$1.posthog.com');
        return `${u.protocol}//${fixed}`;
    } catch {
        return 'https://us.posthog.com';
    }
}

function isConfigured(): boolean {
    return Boolean(PROJECT_ID && API_KEY);
}

interface HogQLResponse {
    results?: unknown[][];
    columns?: string[];
}

async function runHogQL(query: string): Promise<HogQLResponse | null> {
    if (!isConfigured()) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(
            `${apiHostForQueries()}/api/projects/${PROJECT_ID}/query/`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${API_KEY}`,
                },
                body: JSON.stringify({
                    query: { kind: 'HogQLQuery', query },
                }),
                signal: controller.signal,
                cache: 'no-store',
            },
        );
        if (!res.ok) {
            console.error('PostHog HogQL error:', res.status, await res.text().catch(() => ''));
            return null;
        }
        return (await res.json()) as HogQLResponse;
    } catch (err) {
        if ((err as Error).name !== 'AbortError') {
            console.error('PostHog HogQL fetch failed:', err);
        }
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export interface PostHogSummary {
    pageviews: number;
    uniqueVisitors: number;
    sessions: number;
    avgSessionSeconds: number;
    recordingsAvailable: number;
}

export async function getPosthogSummary(): Promise<PostHogSummary | null> {
    const data = await runHogQL(`
        SELECT
            count() AS pageviews,
            count(DISTINCT person_id) AS unique_visitors,
            count(DISTINCT properties.$session_id) AS sessions
        FROM events
        WHERE event = '$pageview'
          AND timestamp >= now() - INTERVAL 30 DAY
    `);
    if (!data?.results?.[0]) return null;
    const row = data.results[0];
    const pageviews = Number(row[0] ?? 0);
    const uniqueVisitors = Number(row[1] ?? 0);
    const sessions = Number(row[2] ?? 0);

    const dur = await runHogQL(`
        SELECT avg(duration) FROM (
            SELECT max(timestamp) - min(timestamp) AS duration
            FROM events
            WHERE timestamp >= now() - INTERVAL 30 DAY
              AND properties.$session_id IS NOT NULL
            GROUP BY properties.$session_id
        )
    `);
    const avgSessionSeconds = Number(dur?.results?.[0]?.[0] ?? 0);

    const rec = await runHogQL(`
        SELECT count(DISTINCT properties.$session_id)
        FROM events
        WHERE event = '$session_recording'
          AND timestamp >= now() - INTERVAL 30 DAY
    `);
    const recordingsAvailable = Number(rec?.results?.[0]?.[0] ?? 0);

    return { pageviews, uniqueVisitors, sessions, avgSessionSeconds, recordingsAvailable };
}

export interface TopEventRow {
    event: string;
    count: number;
}

export async function getTopEvents(): Promise<TopEventRow[]> {
    const data = await runHogQL(`
        SELECT event, count() AS c
        FROM events
        WHERE timestamp >= now() - INTERVAL 30 DAY
          AND event NOT LIKE '$%'
        GROUP BY event
        ORDER BY c DESC
        LIMIT 15
    `);
    if (!data?.results) return [];
    return data.results.map((r) => ({
        event: String(r[0] ?? ''),
        count: Number(r[1] ?? 0),
    }));
}

export interface TopPageRow {
    path: string;
    pageviews: number;
}

export async function getTopPages(): Promise<TopPageRow[]> {
    const data = await runHogQL(`
        SELECT properties.$pathname AS path, count() AS c
        FROM events
        WHERE event = '$pageview'
          AND timestamp >= now() - INTERVAL 30 DAY
          AND properties.$pathname IS NOT NULL
        GROUP BY path
        ORDER BY c DESC
        LIMIT 10
    `);
    if (!data?.results) return [];
    return data.results.map((r) => ({
        path: String(r[0] ?? ''),
        pageviews: Number(r[1] ?? 0),
    }));
}

export interface BrowserRow {
    browser: string;
    sessions: number;
}

export async function getTopBrowsers(): Promise<BrowserRow[]> {
    const data = await runHogQL(`
        SELECT properties.$browser AS browser, count(DISTINCT properties.$session_id) AS s
        FROM events
        WHERE timestamp >= now() - INTERVAL 30 DAY
          AND properties.$browser IS NOT NULL
        GROUP BY browser
        ORDER BY s DESC
        LIMIT 10
    `);
    if (!data?.results) return [];
    return data.results.map((r) => ({
        browser: String(r[0] ?? 'Outro'),
        sessions: Number(r[1] ?? 0),
    }));
}

export interface DeviceRow {
    device: string;
    sessions: number;
}

export async function getDeviceBreakdown(): Promise<DeviceRow[]> {
    const data = await runHogQL(`
        SELECT properties.$device_type AS device, count(DISTINCT properties.$session_id) AS s
        FROM events
        WHERE timestamp >= now() - INTERVAL 30 DAY
          AND properties.$device_type IS NOT NULL
        GROUP BY device
        ORDER BY s DESC
    `);
    if (!data?.results) return [];
    return data.results.map((r) => ({
        device: String(r[0] ?? 'Outro'),
        sessions: Number(r[1] ?? 0),
    }));
}

export async function isPosthogConfigured(): Promise<boolean> {
    return isConfigured();
}
