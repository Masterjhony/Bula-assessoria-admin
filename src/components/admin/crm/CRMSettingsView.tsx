'use client';

import { SlidersHorizontal } from 'lucide-react';
import type { CRMConfig } from '@/lib/crm-types';
import { FunnelsEditor } from '@/components/admin/funil-vendas/FunnelsEditor';

interface CRMSettingsViewProps {
    initialConfig: CRMConfig;
    onConfigSaved: (config: CRMConfig) => void;
}

export function CRMSettingsView({ initialConfig, onConfigSaved }: CRMSettingsViewProps) {
    return (
        <div className="flex flex-col gap-6 max-w-4xl pb-8">
            <div className="flex items-center gap-2 text-xs text-gray-500">
                <SlidersHorizontal size={14} />
                <span>Configure etapas, probabilidade, regra de MQL e campos personalizados do funil unificado.</span>
            </div>

            <FunnelsEditor
                key={`fe-${initialConfig.funnels.length}-${initialConfig.funnels.map(f => f.stages.length).join('-')}`}
                initialConfig={initialConfig}
                onConfigSaved={onConfigSaved}
            />
        </div>
    );
}
