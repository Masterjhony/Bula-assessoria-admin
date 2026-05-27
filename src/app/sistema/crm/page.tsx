import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { CRMDashboardClient } from '@/components/admin/crm/CRMDashboardClient';
import { getLeads } from '@/app/sistema/actions/crm-leads';
import { getCRMConfig } from '@/app/sistema/actions/crm-config';

export const dynamic = 'force-dynamic';

export default async function CRMPage() {
    const [leads, crmConfig] = await Promise.all([
        getLeads(),
        getCRMConfig(),
    ]);

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden">
                <Suspense fallback={<div className="flex items-center justify-center py-24"><Loader2 size={28} className="animate-spin text-[#A68B4B]" /></div>}>
                    <CRMDashboardClient initialLeads={leads || []} crmConfig={crmConfig} />
                </Suspense>
            </div>
        </div>
    );
}
