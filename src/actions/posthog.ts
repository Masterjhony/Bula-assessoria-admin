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

const JMP_LANDING_FILTER = `
  AND (
    properties.app = 'jmp-landing'
    OR properties.landing = 'nelore-jmp'
    OR properties.$host = 'jmp.bulaassessoria.com'
  )
`;

/** Período em dias-calendário no fuso de Brasília (YYYY-MM-DD, inclusivo). */
export interface JmpAnalyticsRange {
    since: string;
    until: string;
}

const RANGE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cláusula de período das queries HogQL. Datas validadas por regex (nunca
 * interpolar texto livre na query). Sem range → últimos 30 dias (comportamento
 * original do painel).
 */
function jmpRangeFilter(range?: JmpAnalyticsRange): string {
    if (range && RANGE_DATE_RE.test(range.since) && RANGE_DATE_RE.test(range.until)) {
        return `timestamp >= toDateTime('${range.since} 00:00:00', 'America/Sao_Paulo')
          AND timestamp < toDateTime('${range.until} 00:00:00', 'America/Sao_Paulo') + INTERVAL 1 DAY`;
    }
    return `timestamp >= now() - INTERVAL 30 DAY`;
}

export interface JmpPostHogSummary {
    pageviews: number;
    uniqueVisitors: number;
    sessions: number;
    avgTimeOnPageSeconds: number;
    avgActiveSeconds: number;
    avgScrollDepthPercent: number;
    ctaClicks: number;
    whatsappClicks: number;
    formClicks: number;
    socialClicks: number;
    trackedClicks: number;
    formStarts: number;
    formSubmitAttempts: number;
    formSubmissions: number;
    formAbandonments: number;
    recordingsAvailable: number;
}

export interface JmpPostHogDailyRow {
    date: string;
    pageviews: number;
    visitors: number;
    submissions: number;
}

export interface JmpPostHogEventRow {
    event: string;
    count: number;
}

export interface JmpPostHogStepRow {
    step: number;
    views: number;
    completions: number;
    validationFailures: number;
}

export interface JmpPostHogBreakdownRow {
    label: string;
    count: number;
}

export interface JmpPostHogAnalytics {
    summary: JmpPostHogSummary;
    daily: JmpPostHogDailyRow[];
    events: JmpPostHogEventRow[];
    formSteps: JmpPostHogStepRow[];
    interests: JmpPostHogBreakdownRow[];
    sources: JmpPostHogBreakdownRow[];
    scrollDepths: JmpPostHogBreakdownRow[];
}

export async function getJmpPosthogAnalytics(range?: JmpAnalyticsRange): Promise<JmpPostHogAnalytics | null> {
    if (!isConfigured()) return null;
    const RANGE = jmpRangeFilter(range);

    const [
        traffic,
        engagement,
        events,
        daily,
        steps,
        interests,
        sources,
        scrollDepths,
        recordings,
    ] = await Promise.all([
        runHogQL(`
            SELECT
                countIf(event = '$pageview') AS pageviews,
                count(DISTINCT person_id) AS unique_visitors,
                count(DISTINCT properties.$session_id) AS sessions
            FROM events
            WHERE ${RANGE}
            ${JMP_LANDING_FILTER}
        `),
        runHogQL(`
            SELECT
                avg(toFloat(properties.seconds_on_page)) AS avg_time,
                avg(toFloat(properties.active_seconds)) AS avg_active,
                avg(toFloat(properties.max_scroll_depth_percent)) AS avg_scroll
            FROM events
            WHERE event = 'jmp_page_engagement'
              AND ${RANGE}
            ${JMP_LANDING_FILTER}
        `),
        runHogQL(`
            SELECT event, count() AS c
            FROM events
            WHERE event LIKE 'jmp_%'
              AND ${RANGE}
            ${JMP_LANDING_FILTER}
            GROUP BY event
            ORDER BY c DESC
            LIMIT 30
        `),
        runHogQL(`
            SELECT
                formatDateTime(timestamp, '%Y-%m-%d', 'America/Sao_Paulo') AS day,
                countIf(event = '$pageview') AS pageviews,
                count(DISTINCT person_id) AS visitors,
                countIf(event = 'jmp_form_submitted') AS submissions
            FROM events
            WHERE ${RANGE}
            ${JMP_LANDING_FILTER}
            GROUP BY day
            ORDER BY day ASC
        `),
        runHogQL(`
            SELECT toInt(properties.step) AS step, event, count() AS c
            FROM events
            WHERE event IN ('jmp_form_step_viewed', 'jmp_form_step_completed', 'jmp_form_validation_failed')
              AND ${RANGE}
            ${JMP_LANDING_FILTER}
            GROUP BY step, event
            ORDER BY step ASC
        `),
        runHogQL(`
            SELECT properties.interesse AS label, count() AS c
            FROM events
            WHERE event = 'jmp_form_submitted'
              AND ${RANGE}
            ${JMP_LANDING_FILTER}
            GROUP BY label
            ORDER BY c DESC
            LIMIT 10
        `),
        runHogQL(`
            SELECT coalesce(properties.utm_source, '$direct') AS label, count() AS c
            FROM events
            WHERE event IN ('$pageview', 'jmp_form_submitted')
              AND ${RANGE}
            ${JMP_LANDING_FILTER}
            GROUP BY label
            ORDER BY c DESC
            LIMIT 10
        `),
        runHogQL(`
            SELECT concat(toString(toInt(properties.depth_percent)), '%') AS label, count() AS c
            FROM events
            WHERE event = 'jmp_scroll_depth_reached'
              AND ${RANGE}
            ${JMP_LANDING_FILTER}
            GROUP BY label
            ORDER BY toInt(replaceAll(label, '%', '')) ASC
        `),
        runHogQL(`
            SELECT count(DISTINCT properties.$session_id)
            FROM events
            WHERE event = '$session_recording'
              AND ${RANGE}
            ${JMP_LANDING_FILTER}
        `),
    ]);

    const trafficRow = traffic?.results?.[0] ?? [];
    const engagementRow = engagement?.results?.[0] ?? [];
    const eventCounts = new Map<string, number>(
        (events?.results ?? []).map((r) => [String(r[0] ?? ''), Number(r[1] ?? 0)]),
    );

    const summary: JmpPostHogSummary = {
        pageviews: Number(trafficRow[0] ?? 0),
        uniqueVisitors: Number(trafficRow[1] ?? 0),
        sessions: Number(trafficRow[2] ?? 0),
        avgTimeOnPageSeconds: Number(engagementRow[0] ?? 0),
        avgActiveSeconds: Number(engagementRow[1] ?? 0),
        avgScrollDepthPercent: Number(engagementRow[2] ?? 0),
        ctaClicks: eventCounts.get('jmp_cta_click') ?? 0,
        whatsappClicks: eventCounts.get('jmp_whatsapp_click') ?? 0,
        formClicks: eventCounts.get('jmp_form_click') ?? 0,
        socialClicks: (eventCounts.get('jmp_youtube_click') ?? 0) + (eventCounts.get('jmp_instagram_click') ?? 0),
        trackedClicks: (
            (eventCounts.get('jmp_cta_click') ?? 0)
            + (eventCounts.get('jmp_whatsapp_click') ?? 0)
            + (eventCounts.get('jmp_form_click') ?? 0)
            + (eventCounts.get('jmp_youtube_click') ?? 0)
            + (eventCounts.get('jmp_instagram_click') ?? 0)
        ),
        formStarts: eventCounts.get('jmp_form_started') ?? 0,
        formSubmitAttempts: eventCounts.get('jmp_form_submit_attempt') ?? 0,
        formSubmissions: eventCounts.get('jmp_form_submitted') ?? 0,
        formAbandonments: eventCounts.get('jmp_form_abandoned') ?? 0,
        recordingsAvailable: Number(recordings?.results?.[0]?.[0] ?? 0),
    };

    const formStepMap = new Map<number, JmpPostHogStepRow>();
    for (const row of steps?.results ?? []) {
        const step = Number(row[0] ?? 0);
        if (!step) continue;
        const current = formStepMap.get(step) ?? { step, views: 0, completions: 0, validationFailures: 0 };
        const event = String(row[1] ?? '');
        const count = Number(row[2] ?? 0);
        if (event === 'jmp_form_step_viewed') current.views = count;
        if (event === 'jmp_form_step_completed') current.completions = count;
        if (event === 'jmp_form_validation_failed') current.validationFailures = count;
        formStepMap.set(step, current);
    }

    return {
        summary,
        daily: (daily?.results ?? []).map((r) => ({
            date: String(r[0] ?? ''),
            pageviews: Number(r[1] ?? 0),
            visitors: Number(r[2] ?? 0),
            submissions: Number(r[3] ?? 0),
        })),
        events: (events?.results ?? []).map((r) => ({
            event: String(r[0] ?? ''),
            count: Number(r[1] ?? 0),
        })),
        formSteps: Array.from(formStepMap.values()).sort((a, b) => a.step - b.step),
        interests: (interests?.results ?? []).map((r) => ({
            label: String(r[0] || 'Nao informado'),
            count: Number(r[1] ?? 0),
        })),
        sources: (sources?.results ?? []).map((r) => ({
            label: String(r[0] === '$direct' ? 'Direto/sem UTM' : r[0] || 'Nao informado'),
            count: Number(r[1] ?? 0),
        })),
        scrollDepths: (scrollDepths?.results ?? []).map((r) => ({
            label: String(r[0] ?? ''),
            count: Number(r[1] ?? 0),
        })),
    };
}
