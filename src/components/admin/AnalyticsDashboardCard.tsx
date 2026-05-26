'use client';

import { Activity, ArrowUp, ArrowDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getDashboardMetrics, type AnalyticsMetrics } from '@/actions/analytics';

export default function AnalyticsDashboardCard() {
    const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchMetrics() {
            try {
                const data = await getDashboardMetrics();
                setMetrics(data);
            } catch (error) {
                console.error('Failed to load analytics:', error);
            } finally {
                setLoading(false);
            }
        }

        fetchMetrics();
    }, []);

    if (loading) {
        return (
            <div className="bg-white dark:bg-[#1d1d1d] p-6 rounded-2xl border border-gray-200 dark:border-[#2e2e2e] shadow-xl animate-pulse">
                <div className="flex justify-between items-start mb-6 border-b border-gray-200 dark:border-[#2e2e2e] pb-4">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Activity className="w-5 h-5 text-blue-400" />
                        Google Analytics
                    </h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="h-20 bg-gray-100 dark:bg-[#2e2e2e] rounded-xl"></div>
                    <div className="h-20 bg-gray-100 dark:bg-[#2e2e2e] rounded-xl"></div>
                </div>
            </div>
        );
    }

    // Format time (seconds) to mm:ss
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="bg-white dark:bg-[#1d1d1d] p-6 rounded-2xl border border-gray-200 dark:border-[#2e2e2e] shadow-xl">
            <div className="flex justify-between items-start mb-6 border-b border-gray-200 dark:border-[#2e2e2e] pb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-400" />
                    Google Analytics
                </h2>
                <span className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded border border-green-500/20">Últimos 30 dias</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {/* Users */}
                <div className="p-4 bg-gray-50 dark:bg-[#262626] rounded-xl border border-gray-200 dark:border-[#2e2e2e] flex flex-col gap-1">
                    <span className="text-gray-500 text-xs uppercase">Usuários Ativos</span>
                    <div className="flex items-end gap-2">
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">{metrics?.activeUsers || 0}</span>
                        {/* <span className="text-xs text-green-500 flex items-center mb-1">
              <ArrowUp size={12} />
              12%
            </span> */}
                    </div>
                </div>

                {/* Sessions */}
                <div className="p-4 bg-gray-50 dark:bg-[#262626] rounded-xl border border-gray-200 dark:border-[#2e2e2e] flex flex-col gap-1">
                    <span className="text-gray-500 text-xs uppercase">Sessões</span>
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">{metrics?.sessions || 0}</span>
                </div>

                {/* Time */}
                <div className="p-4 bg-gray-50 dark:bg-[#262626] rounded-xl border border-gray-200 dark:border-[#2e2e2e] flex flex-col gap-1 col-span-2">
                    <span className="text-gray-500 text-xs uppercase">Tempo Médio de Engajamento</span>
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">{formatTime(metrics?.averageSessionDuration || 0)}</span>
                </div>
            </div>

            <p className="mt-4 text-sm text-gray-500">
                Dados em tempo real diretamente do Google Google Analytics 4.
            </p>
        </div>
    );
}
