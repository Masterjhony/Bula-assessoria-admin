'use client';

import { useMemo, useState } from 'react';
import { CRMLead } from '@/app/sistema/actions/crm-leads';
import { CRMConfig, CRMFunnel } from '@/lib/crm-types';
import { FunnelSelector } from './FunnelSelector';
import { FunnelMetrics } from './FunnelMetrics';
import { FunnelChart } from './FunnelChart';
import { StageBreakdown } from './StageBreakdown';
import { FunnelsEditor } from './FunnelsEditor';
import { BarChart2, Sliders } from 'lucide-react';

interface CRMFunnelViewProps {
    leads: CRMLead[];
    crmConfig: CRMConfig;
    onConfigSaved?: (config: CRMConfig) => void;
}

type SubTab = 'analise' | 'gerenciar';

export function CRMFunnelView({ leads, crmConfig, onConfigSaved }: CRMFunnelViewProps) {
    const funnels = crmConfig.funnels.length > 0
        ? crmConfig.funnels
        : [{ id: 'default', name: 'Pipeline Principal', color: 'yellow', stages: crmConfig.stages, custom_fields: crmConfig.custom_fields }];

    const [activeFunnelId, setActiveFunnelId] = useState<string>(funnels[0].id);
    const [subTab, setSubTab] = useState<SubTab>('analise');

    const activeFunnel: CRMFunnel = funnels.find(f => f.id === activeFunnelId) || funnels[0];

    const funnelLeads = useMemo(() => {
        return leads.filter(l => (l.funnel_id || 'default') === activeFunnelId);
    }, [leads, activeFunnelId]);

    const funnelCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const l of leads) {
            const k = l.funnel_id || 'default';
            counts[k] = (counts[k] || 0) + 1;
        }
        return counts;
    }, [leads]);

    const subTabs = [
        { id: 'analise' as const, label: 'Análise', icon: BarChart2 },
        { id: 'gerenciar' as const, label: 'Gerenciar funis', icon: Sliders },
    ];

    return (
        <div className="space-y-5">
            <div className="flex gap-1 border-b border-gray-200 dark:border-[#2e2e2e]">
                {subTabs.map(t => {
                    const Icon = t.icon;
                    const active = subTab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setSubTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                                active
                                    ? 'border-[#A0792E] text-gray-900 dark:text-white'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                        >
                            <Icon size={14} />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {subTab === 'analise' && (
                <>
                    <FunnelSelector
                        funnels={funnels}
                        activeFunnelId={activeFunnelId}
                        onSelect={setActiveFunnelId}
                        counts={funnelCounts}
                    />

                    <FunnelMetrics leads={funnelLeads} stages={activeFunnel.stages} />

                    <FunnelChart leads={funnelLeads} stages={activeFunnel.stages} />

                    <StageBreakdown leads={funnelLeads} stages={activeFunnel.stages} />
                </>
            )}

            {subTab === 'gerenciar' && (
                <FunnelsEditor
                    initialConfig={crmConfig}
                    onConfigSaved={(config) => {
                        onConfigSaved?.(config);
                        // If the active funnel was deleted, reset to first
                        if (!config.funnels.find(f => f.id === activeFunnelId)) {
                            setActiveFunnelId(config.funnels[0]?.id || 'default');
                        }
                    }}
                />
            )}
        </div>
    );
}
