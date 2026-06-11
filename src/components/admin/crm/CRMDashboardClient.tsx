'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
    CRMLead, updateLead, createLead, moveLead, deleteLead,
    archiveLead, unarchiveLead, getArchivedLeads,
    setCadastroAprovado,
} from '@/app/sistema/actions/crm-leads';
import type { CRMConfig } from '@/lib/crm-types';
import { CRM_STAGE_CONNECTION, isQualificationStage } from '@/lib/crm-types';
import { CRMKanbanBoard } from './CRMKanbanBoard';
import { CRMModal } from './CRMModal';
import { CRMSettingsView } from './CRMSettingsView';
import { CRMQualificacaoView } from './CRMQualificacaoView';
import { CRMArquivadosView } from './CRMArquivadosView';
import { CRMPreferenciaisStrip } from './CRMPreferenciaisStrip';
import { CRMLeadsView } from './CRMLeadsView';
import { CRMTeamView } from './CRMTeamView';
import { CRMWhatsappView } from './CRMWhatsappView';
import { CRMValidationView } from './CRMValidationView';
import {
    LayoutGrid, Plus, Maximize2, Minimize2, Settings, ListChecks, Archive,
    Users, MessageCircle, FileSpreadsheet, ClipboardList,
} from 'lucide-react';

interface CRMDashboardClientProps {
    initialLeads: CRMLead[];
    crmConfig: CRMConfig;
}

type ViewType = 'qualificacao' | 'kanban' | 'lista' | 'validacao' | 'arquivados' | 'equipe' | 'whatsapp' | 'configuracoes';
const VALID_VIEWS: ViewType[] = ['qualificacao', 'kanban', 'lista', 'validacao', 'arquivados', 'equipe', 'whatsapp', 'configuracoes'];

export function CRMDashboardClient({ initialLeads, crmConfig: initialConfig }: CRMDashboardClientProps) {
    const [leads, setLeads] = useState<CRMLead[]>(initialLeads);
    const [crmConfig, setCrmConfig] = useState<CRMConfig>(initialConfig);

    // Modal "novo lead" (sem id) é estado local; edição é derivada de `?lead=<id>`.
    const [isCreatingLead, setIsCreatingLead] = useState(false);
    const [defaultStatus, setDefaultStatus] = useState(CRM_STAGE_CONNECTION);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Deep-link: `?view=<qualificacao|kanban|configuracoes>` controla a aba,
    // `?lead=<id>` controla qual lead está aberto no modal de edição.
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const rawView = searchParams.get('view');
    const activeView: ViewType = (rawView && (VALID_VIEWS as string[]).includes(rawView))
        ? (rawView as ViewType) : 'qualificacao';

    // Funil ativo (deep-link `?funnel=<id>`). Default: primeiro funil da config.
    const funnels = crmConfig.funnels;
    const rawFunnel = searchParams.get('funnel');
    const activeFunnel = useMemo(
        () => funnels.find(f => f.id === rawFunnel) ?? funnels[0],
        [funnels, rawFunnel]
    );
    const activeFunnelId = activeFunnel?.id ?? 'default';
    const rawUsuario = searchParams.get('usuario') || '';
    const usuarioFilter = rawUsuario;

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
    const setActiveFunnelId = (id: string) => {
        updateUrl(p => { if (!id || id === funnels[0]?.id) p.delete('funnel'); else p.set('funnel', id); });
    };
    const setUsuarioFilter = (value: string) => {
        updateUrl(p => { if (value) p.set('usuario', value); else p.delete('usuario'); });
    };
    const setEditingLeadId = (id: string | null) => {
        updateUrl(p => { if (id) p.set('lead', id); else p.delete('lead'); });
    };
    const closeModal = () => {
        setIsCreatingLead(false);
        setEditingLeadId(null);
    };

    // Etapas vêm do funil ativo (cada funil tem seu próprio pipeline).
    const funnelStages = activeFunnel?.stages ?? crmConfig.stages;
    const allStages = funnelStages.map(s => s.name);

    // Etapas que aparecem no Kanban principal (exclui as marcadas como qualificação)
    const advancedStages = useMemo(
        () => funnelStages.filter(s => !isQualificationStage(s)).map(s => s.name),
        [funnelStages]
    );

    const qualificationStageNames = useMemo(
        () => new Set(funnelStages.filter(isQualificationStage).map(s => s.name)),
        [funnelStages]
    );

    const usuarios = useMemo(
        () => crmConfig.responsaveis.filter(r => r.active !== false),
        [crmConfig.responsaveis]
    );

    // CRM unificado: todos os leads ativos entram no mesmo funil. O filtro por
    // usuário é aplicado por cima para qualificação, lista e kanban.
    const funnelLeads = useMemo(
        () => leads.filter(l => !usuarioFilter || l.responsavel === usuarioFilter),
        [leads, usuarioFilter]
    );

    // Contagem de leads por funil — exibida nos chips do seletor.
    const funnelCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const l of leads) {
            const fid = l.funnel_id || 'default';
            counts[fid] = (counts[fid] ?? 0) + 1;
        }
        return counts;
    }, [leads]);

    const qualificationCount = useMemo(
        () => funnelLeads.filter(l => qualificationStageNames.has(l.status)).length,
        [funnelLeads, qualificationStageNames]
    );

    const handleOpenNewLead = (status: string = advancedStages[0] || CRM_STAGE_CONNECTION) => {
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
            setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
            // editingLead é derivado de URL+leads, então atualiza sozinho.
        } else {
            const newLead = await createLead({ ...leadData, status: leadData.status || defaultStatus });
            setLeads(prev => [...prev, newLead]);
        }
    };

    const handleMoveLead = async (id: string, newStatus: string, newPosition: number) => {
        setLeads(prev => prev.map(l => l.id === id ? { ...l, status: newStatus, position: newPosition } : l));
        try {
            await moveLead(id, newStatus, newPosition);
        } catch (error) {
            console.error('Failed to move lead:', error);
            window.location.reload();
        }
    };

    const handleCadastroApprovalChange = async (lead: CRMLead, aprovado: boolean) => {
        const previous = lead;
        const optimistic: CRMLead = {
            ...lead,
            extra_data: {
                ...(lead.extra_data || {}),
                cadastro_aprovado: aprovado,
                cadastro_aprovado_at: aprovado ? new Date().toISOString() : null,
            },
        };
        setLeads(prev => prev.map(l => l.id === lead.id ? optimistic : l));
        try {
            const updated = await setCadastroAprovado(lead.id, aprovado);
            setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
        } catch (e) {
            setLeads(prev => prev.map(l => l.id === previous.id ? previous : l));
            alert(e instanceof Error ? e.message : 'Erro ao atualizar aprovação do cadastro.');
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

    // Leads que podem aparecer no kanban / listas (exclui qualificação) — já restritos ao funil ativo.
    const advancedLeads = useMemo(
        () => funnelLeads.filter(l => !qualificationStageNames.has(l.status)),
        [funnelLeads, qualificationStageNames]
    );

    // ── Arquivados ──────────────────────────────────────────────
    // Carregados sob demanda (a lista pode crescer e não é necessária no fluxo normal).
    const [archivedLeads, setArchivedLeads] = useState<CRMLead[]>([]);
    const [archivedLoaded, setArchivedLoaded] = useState(false);
    const [archivedLoading, setArchivedLoading] = useState(false);

    const loadArchived = useCallback(async () => {
        setArchivedLoading(true);
        try {
            setArchivedLeads(await getArchivedLeads());
            setArchivedLoaded(true);
        } finally {
            setArchivedLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeView === 'arquivados' && !archivedLoaded && !archivedLoading) {
            void loadArchived();
        }
    }, [activeView, archivedLoaded, archivedLoading, loadArchived]);

    // Arquivar: sai das telas operacionais; se a aba de arquivados já carregou, entra nela.
    const handleArchiveLead = async (lead: CRMLead) => {
        setLeads(prev => prev.filter(l => l.id !== lead.id));
        if (archivedLoaded) {
            const stamp = new Date().toISOString();
            setArchivedLeads(prev => [{ ...lead, arquivado: true, arquivado_at: stamp }, ...prev]);
        }
        try {
            await archiveLead(lead.id);
        } catch (e) {
            // Reverte: devolve o lead para a lista ativa.
            setLeads(prev => [...prev, lead]);
            setArchivedLeads(prev => prev.filter(l => l.id !== lead.id));
            alert(e instanceof Error ? e.message : 'Erro ao arquivar lead.');
        }
    };

    // Restaurar: volta para a lista ativa (Qualificação/CRM conforme o status atual).
    const handleUnarchiveLead = async (lead: CRMLead) => {
        setArchivedLeads(prev => prev.filter(l => l.id !== lead.id));
        setLeads(prev => [...prev, { ...lead, arquivado: false, arquivado_at: null }]);
        try {
            await unarchiveLead(lead.id);
        } catch (e) {
            setArchivedLeads(prev => [lead, ...prev]);
            setLeads(prev => prev.filter(l => l.id !== lead.id));
            alert(e instanceof Error ? e.message : 'Erro ao restaurar lead.');
        }
    };

    // Exclusão definitiva a partir da aba de arquivados.
    const handleDeleteArchived = async (lead: CRMLead) => {
        setArchivedLeads(prev => prev.filter(l => l.id !== lead.id));
        try {
            await deleteLead(lead.id);
        } catch (e) {
            setArchivedLeads(prev => [lead, ...prev]);
            alert(e instanceof Error ? e.message : 'Erro ao excluir lead.');
        }
    };

    const views = [
        { id: 'qualificacao', label: 'Qualificação', icon: ListChecks, badge: qualificationCount },
        { id: 'kanban', label: 'CRM', icon: LayoutGrid },
        { id: 'lista', label: 'Leads', icon: ClipboardList },
        { id: 'validacao', label: 'Validação', icon: FileSpreadsheet },
        { id: 'arquivados', label: 'Arquivados', icon: Archive },
        { id: 'equipe', label: 'Equipe', icon: Users },
        { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
        { id: 'configuracoes', label: 'Configurações', icon: Settings },
    ] as const;

    const isSettings = activeView === 'configuracoes';
    const isQualificacao = activeView === 'qualificacao';
    const isArquivados = activeView === 'arquivados';
    const isValidation = activeView === 'validacao';
    const isEquipe = activeView === 'equipe';
    const isWhatsapp = activeView === 'whatsapp';
    const isScrollable = isSettings || isQualificacao || isArquivados || isValidation || isEquipe || isWhatsapp;
    const canCreateLead = activeView === 'qualificacao' || activeView === 'kanban' || activeView === 'lista';

    return (
        <div className={
            isFullscreen
                ? 'fixed inset-0 z-[100] bg-[var(--bg)] w-screen h-screen flex flex-col overflow-hidden p-4'
                : 'space-y-4'
        }>
            {/* Header */}
            <div className="page-head">
                <h1>
                    <small>CRM</small>
                    CRM de vendas
                    <span className="block text-[12px] font-normal subtle mt-2">
                        Qualifique novos leads, acompanhe o pipeline avançado e priorize quem mais importa.
                    </span>
                </h1>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-[var(--text3)]">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--border)] bg-[var(--s2)]">
                        Funil unificado
                    </span>
                    {usuarioFilter && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#A68B4B]/30 bg-[#A68B4B]/10 text-[#A68B4B]">
                            Usuário: {usuarioFilter}
                        </span>
                    )}
                </div>
                <label className="flex items-center gap-2 text-xs text-[var(--text3)]">
                    <Users size={14} />
                    <select
                        value={usuarioFilter}
                        onChange={e => setUsuarioFilter(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--s1)] text-sm text-[var(--text)] outline-none focus:border-[var(--gold)]"
                    >
                        <option value="">Todos os usuários</option>
                        {usuarios.map(user => (
                            <option key={user.id} value={user.name}>{user.name}</option>
                        ))}
                    </select>
                </label>
            </div>

            {/* Tabs & Controls */}
            <div className="flex justify-between items-center border-b border-[var(--border)]">
                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                    {views.map((view) => {
                        const Icon = view.icon
                        const isActive = activeView === view.id
                        const badge = (view as { badge?: number }).badge
                        return (
                            <button
                                key={view.id}
                                onClick={() => setActiveView(view.id as ViewType)}
                                className={`flex items-center gap-2 px-3 py-2.5 text-[12px] font-medium uppercase tracking-wide whitespace-nowrap border-b-2 transition-colors ${
                                    isActive
                                        ? 'border-[var(--gold)] text-[var(--gold)]'
                                        : 'border-transparent text-[var(--text3)] hover:text-[var(--text2)]'
                                }`}
                            >
                                <Icon size={14} />
                                {view.label}
                                {badge != null && badge > 0 && (
                                    <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold rounded-full bg-[var(--amber-bg)] text-[var(--amber)]">
                                        {badge}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="btn ghost"
                        title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                    >
                        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                    {canCreateLead && (
                        <button onClick={() => handleOpenNewLead()} className="btn primary">
                            <Plus size={14} /> Novo
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className={isScrollable ? '' : 'flex-1 min-h-[600px] overflow-hidden'}>
                {activeView === 'qualificacao' && (
                    <CRMQualificacaoView
                        leads={funnelLeads}
                        crmConfig={crmConfig}
                        funnelStages={funnelStages}
                        mqlRule={activeFunnel?.mql_rule}
                        onLeadUpdated={handleLeadUpdated}
                        onOpenLead={handleEditLead}
                        onArchive={handleArchiveLead}
                    />
                )}

                {activeView === 'lista' && (
                    <CRMLeadsView
                        leads={funnelLeads}
                        stages={allStages}
                        onEditLead={handleEditLead}
                        onAddLead={() => handleOpenNewLead()}
                    />
                )}

                {activeView === 'validacao' && (
                    <CRMValidationView />
                )}

                {activeView === 'arquivados' && (
                    <CRMArquivadosView
                        leads={archivedLeads}
                        loading={archivedLoading}
                        onRestore={handleUnarchiveLead}
                        onDelete={handleDeleteArchived}
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
                                stages={allStages}
                                onEditLead={handleEditLead}
                                onAddLead={handleOpenNewLead}
                                onMoveLead={handleMoveLead}
                                onCadastroApprovalChange={handleCadastroApprovalChange}
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

                {activeView === 'equipe' && (
                    <CRMTeamView
                        initialConfig={crmConfig}
                        onConfigSaved={(config) => setCrmConfig(config)}
                    />
                )}

                {activeView === 'whatsapp' && (
                    <CRMWhatsappView />
                )}
            </div>

            <CRMModal
                isOpen={isModalOpen}
                onClose={closeModal}
                lead={editingLead}
                defaultStatus={defaultStatus}
                defaultFunnelId={activeFunnelId}
                stages={allStages}
                customFields={activeFunnel?.custom_fields ?? crmConfig.custom_fields}
                responsaveis={crmConfig.responsaveis}
                funnels={crmConfig.funnels}
                onSave={handleSaveLead}
                onDelete={editingLead ? () => handleDeleteLead(editingLead.id) : undefined}
                onLeadUpdated={handleLeadUpdated}
            />
        </div>
    );
}
