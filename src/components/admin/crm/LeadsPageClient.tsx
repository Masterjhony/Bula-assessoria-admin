'use client';

import { useState } from 'react';
import { CRMLead, updateLead, createLead, deleteLead } from '@/app/sistema/actions/crm-leads';
import type { CRMConfig } from '@/lib/crm-types';
import { CRM_STAGE_CONNECTION } from '@/lib/crm-types';
import { CRMLeadsView } from './CRMLeadsView';
import { CRMModal } from './CRMModal';
import { Maximize2, Minimize2, Users } from 'lucide-react';

interface LeadsPageClientProps {
    initialLeads: CRMLead[];
    crmConfig: CRMConfig;
}

export function LeadsPageClient({ initialLeads, crmConfig }: LeadsPageClientProps) {
    const [leads, setLeads] = useState<CRMLead[]>(initialLeads);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingLead, setEditingLead] = useState<CRMLead | undefined>(undefined);
    const [defaultStatus, setDefaultStatus] = useState(CRM_STAGE_CONNECTION);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const stages = crmConfig.stages.map(s => s.name);

    const handleOpenNewLead = () => {
        setEditingLead(undefined);
        setDefaultStatus(stages[0] || CRM_STAGE_CONNECTION);
        setIsModalOpen(true);
    };

    const handleEditLead = (lead: CRMLead) => {
        setEditingLead(lead);
        setIsModalOpen(true);
    };

    const handleSaveLead = async (leadData: any) => {
        if (editingLead) {
            const updated = await updateLead(editingLead.id, leadData);
            setLeads(leads.map(l => l.id === updated.id ? updated : l));
        } else {
            const newLead = await createLead({ ...leadData, status: defaultStatus });
            setLeads([...leads, newLead]);
        }
    };

    const handleDeleteLead = async (id: string) => {
        setLeads(leads.filter(l => l.id !== id));
        await deleteLead(id);
        setIsModalOpen(false);
    };

    return (
        <div className={
            isFullscreen
                ? 'fixed inset-0 z-[100] bg-white dark:bg-[#141414] w-screen h-screen flex flex-col overflow-hidden'
                : 'flex flex-col h-full bg-white dark:bg-[#141414] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] overflow-hidden'
        }>
            <div className="p-6 pb-4 shrink-0 border-b border-gray-200 dark:border-[#2A2A2A]">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-gray-500 text-sm mb-2 flex items-center gap-2">
                            <Users size={14} className="text-bronze" />
                            Base unificada de leads
                        </p>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Leads
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">
                            Todos os contatos captados — busca, filtros e histórico em um só lugar.
                        </p>
                    </div>
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-[#2e2e2e] transition-colors shrink-0"
                        title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
                    >
                        {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-gray-50/50 dark:bg-[#0D0D0D]">
                <CRMLeadsView
                    leads={leads}
                    stages={stages}
                    onEditLead={handleEditLead}
                    onAddLead={handleOpenNewLead}
                />
            </div>

            <CRMModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                lead={editingLead}
                defaultStatus={defaultStatus}
                stages={stages}
                customFields={crmConfig.custom_fields}
                responsaveis={crmConfig.responsaveis}
                funnels={crmConfig.funnels}
                onSave={handleSaveLead}
                onDelete={editingLead ? () => handleDeleteLead(editingLead.id) : undefined}
            />
        </div>
    );
}
