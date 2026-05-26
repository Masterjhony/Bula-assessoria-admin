'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { CRMLead, updateLead, createLead, moveLead, deleteLead } from '@/app/sistema/actions/crm-leads';
import { renameStage } from '@/app/sistema/actions/crm-config';
import type { CRMConfig } from '@/lib/crm-types';
import { isQualificationStage } from '@/lib/crm-types';
import { CRMKanbanBoard } from './CRMKanbanBoard';
import { CRMModal } from './CRMModal';
import { CRMSettingsView } from './CRMSettingsView';
import { CRMQualificacaoView } from './CRMQualificacaoView';
import { CRMPreferenciaisStrip } from './CRMPreferenciaisStrip';
import {
    LayoutGrid, Plus, Maximize2, Minimize2, Settings, ListChecks,
} from 'lucide-react';

interface CRMDashboardClientProps {
    initialLeads: CRMLead[];
    crmConfig: CRMConfig;
}

type ViewType = 'qualificacao' | 'kanban' | 'configuracoes';
const VALID_VIEWS: ViewType[] = ['qualificacao', 'kanban', 'configuracoes'];

export function CRMDashboardClient({ initialLeads, crmConfig: initialConfig }: CRMDashboardClientProps) {
    const [leads, setLeads] = useState<CRMLead[]>(initialLeads);
    const [crmConfig, setCrmConfig] = useState<CRMConfig>(initialConfig);

    // Modal "novo lead" (sem id) é estado local; edição é derivada de `?lead=<id>`.
    const [isCreatingLead, setIsCreatingLead] = useState(false);
    const [defaultStatus, setDefaultStatus] = useState('Lead');
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Deep-link: `?view=<qualificacao|kanban|configuracoes>` controla a aba,
    // `?lead=<id>` controla qual lead está aberto no modal de edição.
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const rawView = searchParams.get('view');
    const activeView: ViewType = (rawView && (VALID_VIEWS as string[]).includes(rawView))
        ? (rawView as ViewType) : 'qualificacao';
    const editingLeadId = searchParams.get('lead');
    const editingLead = useMemo<CRMLead | undefined>(
        () => (editingLeadId ? leads.find(l => l.id === editingLeadId) : undefined),
        [leads, editingLeadId]
    );
    const isModalOpen = isCreatingLead || editingLead != null;

    const updateUrl = useCallback((mutate: (params: URLSearchParams) => void) => {
        const params = new URLSearchParams(searchParams.toString());
        mutate(params);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, [router, pathname, searchParams]);

    const setActiveView = (next: ViewType) => {
        updateUrl(p => { if (next === 'qualificacao') p.delete('view'); else p.set('view', next); });
    };
    const setEditingLeadId = (id: string | null) => {
        updateUrl(p => { if (id) p.set('lead', id); else p.delete('lead'); });
    };
    const closeModal = () => {
        setIsCreatingLead(false);
        setEditingLeadId(null);
    };

    const allStages = crmConfig.stages.map(s => s.name);

    // Etapas que aparecem no Kanban principal (exclui as marcadas como qualificação)
    const advancedStages = useMemo(
        () => crmConfig.stages.filter(s => !isQualificationStage(s)).map(s => s.name),
        [crmConfig.stages]
    );

    const qualificationStageNames = useMemo(
        () => new Set(crmConfig.stages.filter(isQualificationStage).map(s => s.name)),
        [crmConfig.stages]
    );

    const qualificationCount = useMemo(
        () => leads.filter(l => qualificationStageNames.has(l.status)).length,
        [leads, qualificationStageNames]
    );

    const handleOpenNewLead = (status: string = advancedStages[0] || 'Qualificado') => {
        setEditingLeadId(null);
        setDefaultStatus(status);
        setIsCreatingLead(true);
    };

    const handleEditLead = (lead: CRMLead) => {
        setIsCreatingLead(false);
        setEditingLeadId(lead.id);
    };

    const handleSaveLead = async (leadData: Partial<CRMLead>) => {
        if (editingLead) {
            const updated = await updateLead(editingLead.id, leadData);
            setLeads(leads.map(l => l.id === updated.id ? updated : l));
            // editingLead é derivado de URL+leads, então atualiza sozinho.
        } else {
            const newLead = await createLead({ ...leadData, status: leadData.status || defaultStatus });
            setLeads([...leads, newLead]);
        }
    };

    const handleMoveLead = async (id: string, newStatus: string, newPosition: number) => {
        setLeads(leads.map(l => l.id === id ? { ...l, status: newStatus, position: newPosition } : l));
        try {
            await moveLead(id, newStatus, newPosition);
        } catch (error) {
            console.error('Failed to move lead:', error);
            window.location.reload();
        }
    };

    const handleDeleteLead = async (id: string) => {
        setLeads(leads.filter(l => l.id !== id));
        await deleteLead(id);
        closeModal();
    };

    const handleLeadUpdated = (lead: CRMLead) => {
        setLeads(prev => prev.map(l => l.id === lead.id ? lead : l));
        // editingLead é derivado, então atualiza sozinho quando `leads` muda.
    };

    const handleRenameStage = async (oldName: string, newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName) return;
        try {
            const newConfig = await renameStage(oldName, trimmed);
            setCrmConfig(newConfig);
            setLeads(prev => prev.map(l => (l.status === oldName ? { ...l, status: trimmed } : l)));
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro ao renomear etapa.';
            alert(msg);
        }
    };

    // Leads que podem aparecer no kanban / listas (exclui qualificação)
    const advancedLeads = useMemo(
        () => leads.filter(l => !qualificationStageNames.has(l.status)),
        [leads, qualificationStageNames]
    );

    const views = [
        { id: 'qualificacao', label: 'Qualificação', icon: ListChecks, badge: qualificationCount },
        { id: 'kanban', label: 'CRM', icon: LayoutGrid },
        { id: 'configuracoes', label: 'Configurações', icon: Settings },
    ] as const;

    const isSettings = activeView === 'configuracoes';
    const isQualificacao = activeView === 'qualificacao';
    const isScrollable = isSettings || isQualificacao;

    return (
        <div className={
            isFullscreen
                ? 'fixed inset-0 z-[100] bg-white dark:bg-[#1d1d1d] w-screen h-screen flex flex-col overflow-hidden'
                : 'flex flex-col h-full bg-white dark:bg-[#1d1d1d] rounded-2xl border border-gray-200 dark:border-[#2e2e2e] overflow-hidden'
        }>
            {/* Header */}
            <div className="p-6 pb-0 shrink-0">
                <p className="text-gray-500 text-sm mb-3">
                    Concentre todo o ciclo de vendas aqui — qualifique novos leads, acompanhe o pipeline avançado e priorize quem mais importa.
                </p>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                    CRM de vendas
                </h2>

                {/* Tabs & Controls */}
                <div className="flex justify-between items-center border-b border-gray-200 dark:border-[#2e2e2e]">
                    <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                        {views.map((view) => {
                            const Icon = view.icon;
                            const isActive = activeView === view.id;
                            const isSpecial = view.id === 'configuracoes';
                            const badge = (view as { badge?: number }).badge;
                            return (
                                <button
                                    key={view.id}
                                    onClick={() => setActiveView(view.id as ViewType)}
                                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                                        isActive
                                            ? 'border-[#A0792E] text-gray-900 dark:text-white bg-gray-50 dark:bg-[#262626]'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#262626]'
                                    } ${isSpecial && !isActive ? 'ml-1' : ''}`}
                                >
                                    <Icon size={15} />
                                    {view.label}
                                    {badge != null && badge > 0 && (
                                        <span className={`ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold rounded-full ${
                                            isActive ? 'bg-[#A0792E] text-black' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                                        }`}>
                                            {badge}
                                        </span>
                                    )}
                                    {view.id === 'configuracoes' && (
                                        <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 inline-block" />
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-2 pb-2 pr-2 shrink-0">
                        <button
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-[#2e2e2e] transition-colors"
                            title={isFullscreen ? 'Sair da Tela Cheia' : 'Tela Cheia'}
                        >
                            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        </button>
                        {!isSettings && (
                            <button
                                onClick={() => handleOpenNewLead()}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 shadow-sm"
                            >
                                Novo <Plus size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className={`flex-1 ${isScrollable ? 'overflow-auto' : 'overflow-hidden'} p-6 bg-gray-50/50 dark:bg-[#161616]`}>
                {activeView === 'qualificacao' && (
                    <CRMQualificacaoView
                        leads={leads}
                        crmConfig={crmConfig}
                        onLeadUpdated={handleLeadUpdated}
                        onOpenLead={handleEditLead}
                    />
                )}

                {activeView === 'kanban' && (
                    <div className="flex flex-col h-full min-h-0">
                        <CRMPreferenciaisStrip
                            leads={advancedLeads}
                            crmConfig={crmConfig}
                            onOpenLead={handleEditLead}
                        />
                        <div className="flex-1 min-h-0 overflow-hidden">
                            <CRMKanbanBoard
                                leads={advancedLeads}
                                stages={advancedStages}
                                onEditLead={handleEditLead}
                                onAddLead={handleOpenNewLead}
                                onMoveLead={handleMoveLead}
                                onRenameStage={handleRenameStage}
                            />
                        </div>
                    </div>
                )}

                {activeView === 'configuracoes' && (
                    <CRMSettingsView
                        initialConfig={crmConfig}
                        onConfigSaved={(config) => setCrmConfig(config)}
                    />
                )}
            </div>

            <CRMModal
                isOpen={isModalOpen}
                onClose={closeModal}
                lead={editingLead}
                defaultStatus={defaultStatus}
                stages={allStages}
                customFields={crmConfig.custom_fields}
                responsaveis={crmConfig.responsaveis}
                funnels={crmConfig.funnels}
                onSave={handleSaveLead}
                onDelete={editingLead ? () => handleDeleteLead(editingLead.id) : undefined}
                onLeadUpdated={handleLeadUpdated}
            />
        </div>
    );
}
