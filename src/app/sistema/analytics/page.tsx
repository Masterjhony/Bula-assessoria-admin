'use client';

import { Activity, Calendar, Users, MousePointerClick, FileText, Share2, Timer, Video, Zap, Globe, Smartphone, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    getDetailedReport,
    getPageViews,
    getSessionChannels,
    getAverageTimeReport,
    type DetailedAnalyticsReport,
    type PageViewsReport,
    type SessionChannelsReport,
    type AverageTimeReport
} from '@/actions/analytics';
import {
    getPosthogSummary,
    getTopEvents,
    getTopPages,
    getTopBrowsers,
    getDeviceBreakdown,
    isPosthogConfigured,
    type PostHogSummary,
    type TopEventRow,
    type TopPageRow,
    type BrowserRow,
    type DeviceRow,
} from '@/actions/posthog';

const POSTHOG_PROJECT_URL = 'https://us.posthog.com/project/430113';

export default function AnalyticsPage() {
    const [reportData, setReportData] = useState<DetailedAnalyticsReport[]>([]);
    const [pageViews, setPageViews] = useState<PageViewsReport[]>([]);
    const [channels, setChannels] = useState<SessionChannelsReport[]>([]);
    const [averageTime, setAverageTime] = useState<AverageTimeReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [phSummary, setPhSummary] = useState<PostHogSummary | null>(null);
    const [phEvents, setPhEvents] = useState<TopEventRow[]>([]);
    const [phPages, setPhPages] = useState<TopPageRow[]>([]);
    const [phBrowsers, setPhBrowsers] = useState<BrowserRow[]>([]);
    const [phDevices, setPhDevices] = useState<DeviceRow[]>([]);
    const [phConfigured, setPhConfigured] = useState<boolean>(false);

    useEffect(() => {
        async function loadData() {
            try {
                const [data, pages, ch, avg, configured] = await Promise.all([
                    getDetailedReport(),
                    getPageViews(),
                    getSessionChannels(),
                    getAverageTimeReport(),
                    isPosthogConfigured(),
                ]);
                setReportData(data);
                setPageViews(pages);
                setChannels(ch);
                setAverageTime(avg);
                setPhConfigured(configured);

                if (configured) {
                    const [summary, events, topPages, browsers, devices] = await Promise.all([
                        getPosthogSummary(),
                        getTopEvents(),
                        getTopPages(),
                        getTopBrowsers(),
                        getDeviceBreakdown(),
                    ]);
                    setPhSummary(summary);
                    setPhEvents(events);
                    setPhPages(topPages);
                    setPhBrowsers(browsers);
                    setPhDevices(devices);
                }
            } catch (error) {
                console.error("Failed to load analytics data", error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    // Helper to format date YYYYMMDD to DD/MM/YYYY
    const formatDate = (dateString: string) => {
        if (!dateString || dateString.length !== 8) return dateString;
        const year = dateString.substring(0, 4);
        const month = dateString.substring(4, 6);
        const day = dateString.substring(6, 8);
        return `${day}/${month}/${year}`;
    };

    const formatTime = (seconds: number) => {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const maxPageViews = Math.max(...pageViews.map(p => p.views), 1);
    const maxChannels = Math.max(...channels.map(c => c.sessions), 1);

    return (
        <div className="space-y-8 pb-12">
            <div className="border-b border-gray-200 dark:border-[#2A2A2A] pb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Analytics</h1>
                    <p className="text-gray-500 dark:text-gray-400">Detalhamento de acesso e comportamento (Últimos 30 dias)</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-[#1A1A1A] px-3 py-1 rounded-full border border-gray-200 dark:border-[#2A2A2A]">
                    <Calendar className="w-4 h-4" />
                    Atualizado em: {new Date().toLocaleDateString('pt-BR')}
                </div>
            </div>

            {loading ? (
                <div className="p-12 flex justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#C8A96E]"></div>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Grids Superiores: Acessos e Tempo */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Histórico de Acessos */}
                        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] shadow-xl overflow-hidden flex flex-col h-96">
                            <div className="p-6 border-b border-gray-200 dark:border-[#2A2A2A] shrink-0">
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Activity className="w-5 h-5 text-blue-400" />
                                    Histórico de Acessos
                                </h2>
                            </div>
                            <div className="overflow-x-auto overflow-y-auto grow custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-gray-50 dark:bg-[#1A1A1A] z-10">
                                        <tr className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                                            <th className="p-4 font-medium border-b border-gray-200 dark:border-[#2A2A2A]">Data</th>
                                            <th className="p-4 font-medium border-b border-gray-200 dark:border-[#2A2A2A]">
                                                <div className="flex items-center gap-2">
                                                    <Users className="w-4 h-4" />
                                                    Ativos
                                                </div>
                                            </th>
                                            <th className="p-4 font-medium border-b border-gray-200 dark:border-[#2A2A2A]">
                                                <div className="flex items-center gap-2">
                                                    <MousePointerClick className="w-4 h-4" />
                                                    Sessões
                                                </div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
                                        {reportData.length > 0 ? (
                                            reportData.map((row) => (
                                                <tr key={row.date} className="hover:bg-gray-50 dark:hover:bg-[#1A1A1A] transition-colors">
                                                    <td className="p-4 text-gray-900 dark:text-gray-300 font-medium">{formatDate(row.date)}</td>
                                                    <td className="p-4 text-gray-700 dark:text-gray-400">{row.activeUsers}</td>
                                                    <td className="p-4 text-gray-700 dark:text-gray-400">{row.sessions}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={3} className="p-8 text-center text-gray-500 dark:text-gray-400 italic">
                                                    Nenhum dado encontrado.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Tempo Médio */}
                        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] shadow-xl overflow-hidden flex flex-col h-96">
                            <div className="p-6 border-b border-gray-200 dark:border-[#2A2A2A] shrink-0">
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Timer className="w-5 h-5 text-emerald-400" />
                                    Tempo Médio por Dia
                                </h2>
                            </div>
                            <div className="overflow-x-auto overflow-y-auto grow custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-gray-50 dark:bg-[#1A1A1A] z-10">
                                        <tr className="text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                                            <th className="p-4 font-medium border-b border-gray-200 dark:border-[#2A2A2A]">Data</th>
                                            <th className="p-4 font-medium border-b border-gray-200 dark:border-[#2A2A2A]">Duração Média</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
                                        {averageTime.length > 0 ? (
                                            averageTime.map((row) => (
                                                <tr key={row.date} className="hover:bg-gray-50 dark:hover:bg-[#1A1A1A] transition-colors">
                                                    <td className="p-4 text-gray-900 dark:text-gray-300 font-medium">{formatDate(row.date)}</td>
                                                    <td className="p-4 text-gray-700 dark:text-gray-400 font-mono">{formatTime(row.averageSessionDuration)}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={2} className="p-8 text-center text-gray-500 dark:text-gray-400 italic">
                                                    Nenhum dado encontrado.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Grids Inferiores: Views e Canais */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Páginas Mais Vistas (Lotes) */}
                        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] shadow-xl overflow-hidden flex flex-col h-max">
                            <div className="p-6 border-b border-gray-200 dark:border-[#2A2A2A] shrink-0">
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <FileText className="w-5 h-5 text-amber-500" />
                                    Visualizações por Página
                                </h2>
                                <p className="text-xs text-gray-500 mt-1">Top 10 páginas mais acessadas</p>
                            </div>
                            <div className="p-6 space-y-5 overflow-x-hidden">
                                {pageViews.length > 0 ? (
                                    pageViews.map((page, i) => (
                                        <div key={i} className="flex flex-col gap-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="font-medium text-gray-900 dark:text-gray-200 truncate pr-4" title={page.pageTitle || page.pagePath}>
                                                    {page.pageTitle ? page.pageTitle.replace('', '') : page.pagePath}
                                                </span>
                                                <span className="text-gray-500 whitespace-nowrap">{page.views} views</span>
                                            </div>
                                            <div className="w-full bg-gray-100 dark:bg-[#2e2e2e] rounded-full h-2">
                                                <div
                                                    className="bg-amber-500 h-2 rounded-full transition-all duration-1000 ease-out"
                                                    style={{ width: `${(page.views / maxPageViews) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center text-gray-500 italic py-4">Nenhum dado encontrado</div>
                                )}
                            </div>
                        </div>

                        {/* Canais de Sessão */}
                        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] shadow-xl overflow-hidden flex flex-col h-max">
                            <div className="p-6 border-b border-gray-200 dark:border-[#2A2A2A] shrink-0">
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Share2 className="w-5 h-5 text-indigo-400" />
                                    Canais de Tráfego
                                </h2>
                                <p className="text-xs text-gray-500 mt-1">Origem dos acessos (Direct, Organic, Social, etc)</p>
                            </div>
                            <div className="p-6 space-y-5 overflow-x-hidden">
                                {channels.length > 0 ? (
                                    channels.map((ch, i) => (
                                        <div key={i} className="flex flex-col gap-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="font-medium text-gray-900 dark:text-gray-200 capitalize">
                                                    {ch.channelGroup === '(other)' ? 'Outros' : ch.channelGroup}
                                                </span>
                                                <span className="text-gray-500 whitespace-nowrap">{ch.sessions} sessões</span>
                                            </div>
                                            <div className="w-full bg-gray-100 dark:bg-[#2e2e2e] rounded-full h-2">
                                                <div
                                                    className="bg-indigo-500 h-2 rounded-full transition-all duration-1000 ease-out"
                                                    style={{ width: `${(ch.sessions / maxChannels) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center text-gray-500 italic py-4">Nenhum dado encontrado</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================== PostHog ============================== */}
            <div className="border-t border-gray-200 dark:border-[#2A2A2A] pt-8">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Zap className="w-6 h-6 text-fuchsia-500" />
                            PostHog · Comportamento detalhado
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                            Product Analytics + Session Replay + eventos custom (últimos 30 dias)
                        </p>
                    </div>
                    <a
                        href={POSTHOG_PROJECT_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-400 px-3 py-1.5 rounded-lg border border-fuchsia-500/20 transition"
                    >
                        Abrir PostHog <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                </div>

                {!phConfigured ? (
                    <div className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-6 text-sm text-amber-700 dark:text-amber-300">
                        <p className="font-semibold mb-1">PostHog em modo somente-captura</p>
                        <p>
                            O script PostHog está rodando no site e na LP, capturando pageviews,
                            session replays e eventos custom. Pra exibir os números aqui no painel,
                            adicione <code className="px-1.5 py-0.5 rounded bg-amber-500/10">POSTHOG_PERSONAL_API_KEY</code> nas variáveis de ambiente.
                            Por enquanto consulte os dashboards diretamente em{' '}
                            <a href={POSTHOG_PROJECT_URL} target="_blank" rel="noopener noreferrer" className="underline">
                                us.posthog.com/project/430113
                            </a>.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* KPI cards */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <PHKpi label="Pageviews" value={phSummary?.pageviews ?? 0} icon={<FileText className="w-4 h-4" />} color="text-amber-500" />
                            <PHKpi label="Visitantes únicos" value={phSummary?.uniqueVisitors ?? 0} icon={<Users className="w-4 h-4" />} color="text-blue-400" />
                            <PHKpi label="Sessões" value={phSummary?.sessions ?? 0} icon={<MousePointerClick className="w-4 h-4" />} color="text-indigo-400" />
                            <PHKpi label="Tempo médio" value={formatTime(phSummary?.avgSessionSeconds ?? 0)} icon={<Timer className="w-4 h-4" />} color="text-emerald-400" raw />
                            <PHKpi label="Replays disponíveis" value={phSummary?.recordingsAvailable ?? 0} icon={<Video className="w-4 h-4" />} color="text-fuchsia-500" />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Eventos custom */}
                            <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] shadow-xl overflow-hidden">
                                <div className="p-6 border-b border-gray-200 dark:border-[#2A2A2A]">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <Zap className="w-5 h-5 text-fuchsia-500" />
                                        Eventos mais capturados
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1">Excluindo eventos $auto do PostHog</p>
                                </div>
                                <div className="p-6 space-y-3">
                                    {phEvents.length > 0 ? (
                                        phEvents.map((e, i) => (
                                            <div key={i} className="flex items-center justify-between text-sm border-b border-gray-100 dark:border-[#262626] pb-2 last:border-0">
                                                <code className="text-fuchsia-600 dark:text-fuchsia-400 font-mono text-xs">{e.event}</code>
                                                <span className="text-gray-700 dark:text-gray-300 font-medium">{e.count.toLocaleString('pt-BR')}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center text-gray-500 italic py-4">Nenhum evento custom capturado ainda</div>
                                    )}
                                </div>
                            </div>

                            {/* Páginas PostHog */}
                            <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] shadow-xl overflow-hidden">
                                <div className="p-6 border-b border-gray-200 dark:border-[#2A2A2A]">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <FileText className="w-5 h-5 text-amber-500" />
                                        Páginas (PostHog $pageview)
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1">Top 10 paths registrados pelo SDK no browser</p>
                                </div>
                                <div className="p-6 space-y-3">
                                    {phPages.length > 0 ? (
                                        phPages.map((p, i) => {
                                            const max = Math.max(...phPages.map((x) => x.pageviews), 1);
                                            return (
                                                <div key={i} className="flex flex-col gap-1.5">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="font-mono text-xs text-gray-900 dark:text-gray-200 truncate pr-4">{p.path}</span>
                                                        <span className="text-gray-500 whitespace-nowrap">{p.pageviews.toLocaleString('pt-BR')}</span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 dark:bg-[#2e2e2e] rounded-full h-1.5">
                                                        <div className="bg-amber-500 h-1.5 rounded-full transition-all duration-1000 ease-out" style={{ width: `${(p.pageviews / max) * 100}%` }}></div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-center text-gray-500 italic py-4">Sem dados</div>
                                    )}
                                </div>
                            </div>

                            {/* Browsers */}
                            <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] shadow-xl overflow-hidden">
                                <div className="p-6 border-b border-gray-200 dark:border-[#2A2A2A]">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <Globe className="w-5 h-5 text-cyan-400" />
                                        Navegadores
                                    </h3>
                                </div>
                                <div className="p-6 space-y-3">
                                    {phBrowsers.length > 0 ? (
                                        phBrowsers.map((b, i) => {
                                            const max = Math.max(...phBrowsers.map((x) => x.sessions), 1);
                                            return (
                                                <div key={i} className="flex flex-col gap-1.5">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-gray-900 dark:text-gray-200">{b.browser}</span>
                                                        <span className="text-gray-500">{b.sessions.toLocaleString('pt-BR')} sessões</span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 dark:bg-[#2e2e2e] rounded-full h-1.5">
                                                        <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: `${(b.sessions / max) * 100}%` }}></div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-center text-gray-500 italic py-4">Sem dados</div>
                                    )}
                                </div>
                            </div>

                            {/* Devices */}
                            <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] shadow-xl overflow-hidden">
                                <div className="p-6 border-b border-gray-200 dark:border-[#2A2A2A]">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <Smartphone className="w-5 h-5 text-rose-400" />
                                        Tipo de dispositivo
                                    </h3>
                                </div>
                                <div className="p-6 space-y-3">
                                    {phDevices.length > 0 ? (
                                        phDevices.map((d, i) => {
                                            const max = Math.max(...phDevices.map((x) => x.sessions), 1);
                                            return (
                                                <div key={i} className="flex flex-col gap-1.5">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-gray-900 dark:text-gray-200 capitalize">{d.device}</span>
                                                        <span className="text-gray-500">{d.sessions.toLocaleString('pt-BR')} sessões</span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 dark:bg-[#2e2e2e] rounded-full h-1.5">
                                                        <div className="bg-rose-500 h-1.5 rounded-full" style={{ width: `${(d.sessions / max) * 100}%` }}></div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-center text-gray-500 italic py-4">Sem dados</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Quick links */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <PHLink href={`${POSTHOG_PROJECT_URL}/replay/home`} icon={<Video className="w-5 h-5" />} title="Session Replays" subtitle="Reveja gravações reais de visitantes" />
                            <PHLink href={`${POSTHOG_PROJECT_URL}/heatmaps`} icon={<Activity className="w-5 h-5" />} title="Heatmaps" subtitle="Mapa de cliques por página" />
                            <PHLink href={`${POSTHOG_PROJECT_URL}/web`} icon={<Globe className="w-5 h-5" />} title="Web Analytics" subtitle="Funil, retenção e conversões" />
                        </div>
                    </div>
                )}
            </div>

            <p className="text-center text-sm text-gray-500 dark:text-gray-600">
                Dados fornecidos via Google Analytics Data API (Beta) + PostHog (US Cloud).
            </p>
        </div>
    );
}

function PHKpi({ label, value, icon, color, raw }: { label: string; value: number | string; icon: React.ReactNode; color: string; raw?: boolean }) {
    const formatted = raw ? value : (typeof value === 'number' ? value.toLocaleString('pt-BR') : value);
    return (
        <div className="bg-white dark:bg-[#141414] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] p-4 shadow-lg">
            <div className={`flex items-center gap-1.5 ${color} text-xs uppercase tracking-wider font-medium`}>
                {icon}
                {label}
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-white font-mono">{formatted}</div>
        </div>
    );
}

function PHLink({ href, icon, title, subtitle }: { href: string; icon: React.ReactNode; title: string; subtitle: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-white dark:bg-[#141414] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] p-5 hover:border-fuchsia-500/40 hover:shadow-xl transition group"
        >
            <div className="flex items-center justify-between mb-2">
                <div className="text-fuchsia-500">{icon}</div>
                <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-fuchsia-400 transition" />
            </div>
            <div className="font-bold text-gray-900 dark:text-white">{title}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</div>
        </a>
    );
}
