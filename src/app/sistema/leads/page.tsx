import { LeadsPageClient } from '@/components/admin/crm/LeadsPageClient';
import { getLeads } from '@/app/sistema/actions/crm-leads';
import { getCRMConfig } from '@/app/sistema/actions/crm-config';

export const dynamic = 'force-dynamic';

export default async function LeadsPage() {
    const [leads, crmConfig] = await Promise.all([
        getLeads(),
        getCRMConfig(),
    ]);

    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden">
                <LeadsPageClient initialLeads={leads || []} crmConfig={crmConfig} />
            </div>
        </div>
    );
}
