'use client';

import { useState, useEffect, useRef } from 'react';
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    DragStartEvent,
    DragOverEvent,
    DragEndEvent,
    MeasuringStrategy,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CRMColumn } from './CRMColumn';
import { CRMCardView } from './CRMCard';
import { CRMLead } from '@/app/sistema/actions/crm-leads';
import {
    CRM_STAGE_ASSESSORS,
    CRM_STAGE_CONNECTION,
    CRM_STAGE_QUALIFICATION,
    CRM_STAGE_REGISTRATION,
} from '@/lib/crm-types';
import { createPortal } from 'react-dom';

interface CRMKanbanBoardProps {
    leads: CRMLead[];
    stages?: string[];
    onEditLead: (lead: CRMLead) => void;
    onAddLead: (status: string) => void;
    onMoveLead: (id: string, newStatus: string, newPosition: number) => Promise<void>;
    onRenameStage?: (oldName: string, newName: string) => Promise<void>;
    onCadastroApprovalChange?: (lead: CRMLead, aprovado: boolean) => Promise<void> | void;
}

export const CRM_COLUMNS = [
    CRM_STAGE_CONNECTION,
    CRM_STAGE_QUALIFICATION,
    CRM_STAGE_REGISTRATION,
    CRM_STAGE_ASSESSORS,
];

export function CRMKanbanBoard({ leads: externalLeads, stages, onEditLead, onAddLead, onMoveLead, onRenameStage, onCadastroApprovalChange }: CRMKanbanBoardProps) {
    const columns = stages && stages.length > 0 ? stages : CRM_COLUMNS;
    const [leads, setLeads] = useState<CRMLead[]>(externalLeads);
    const leadsRef = useRef<CRMLead[]>(externalLeads);
    const [activeLead, setActiveLead] = useState<CRMLead | null>(null);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        leadsRef.current = externalLeads;
        setLeads(externalLeads);
    }, [externalLeads]);

    const setLocalLeads = (updater: (prev: CRMLead[]) => CRMLead[]) => {
        const next = updater(leadsRef.current);
        leadsRef.current = next;
        setLeads(next);
    };

    const resetLocalLeads = () => {
        leadsRef.current = externalLeads;
        setLeads(externalLeads);
        setActiveLead(null);
    };

    const resolveOverStatus = (
        over: DragOverEvent['over'] | DragEndEvent['over'],
        snapshot: CRMLead[] = leadsRef.current
    ) => {
        if (!over) return null;

        if (over.data.current?.type === 'Column') {
            return String(over.id);
        }

        if (over.data.current?.type === 'Lead') {
            const overLead = snapshot.find((lead) => lead.id === over.id) ?? (over.data.current.lead as CRMLead | undefined);
            return overLead?.status ?? null;
        }

        const overId = String(over.id);
        return columns.includes(overId) ? overId : null;
    };

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const onDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const lead = leadsRef.current.find(l => l.id === active.id);
        if (lead) setActiveLead(lead);
    };

    const onDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        if (activeId === overId) return;

        const isActiveLead = active.data.current?.type === 'Lead';
        if (!isActiveLead) return;

        const isOverLead = over.data.current?.type === 'Lead';
        const isOverColumn = over.data.current?.type === 'Column';

        setLocalLeads((prev) => {
            // Guard: o dnd-kit pode disparar com um id ainda fora da lista durante o
            // arrasto. Sem isso, prev[-1].status lançava TypeError e quebrava a tela.
            const activeIndex = prev.findIndex((l) => l.id === activeId);
            if (activeIndex === -1) return prev;
            const activeLead = prev[activeIndex];
            const newStatus = resolveOverStatus(over, prev);
            if (!newStatus) return prev;

            if (isOverLead) {
                const overIndex = prev.findIndex((l) => l.id === overId);
                if (overIndex === -1) return prev;
                const overLead = prev[overIndex];
                if (activeLead.status !== overLead.status) {
                    const updated = [...prev];
                    updated[activeIndex] = { ...activeLead, status: newStatus };
                    return arrayMove(updated, activeIndex, overIndex);
                }
                return arrayMove(prev, activeIndex, overIndex);
            }

            if (isOverColumn) {
                if (activeLead.status !== newStatus) {
                    const updated = [...prev];
                    updated[activeIndex] = { ...activeLead, status: newStatus };
                    return updated;
                }
            }

            return prev;
        });
    };

    /**
     * Coluna onde o card foi SOLTO de verdade: hit-test no DOM usando o
     * retângulo final do card flutuante. Lê a geometria viva da página no
     * instante do drop, então é imune a medições defasadas do dnd-kit (a
     * causa de "arrasto até a coluna, solto e o card volta pra origem").
     */
    const resolveDropColumnFromRect = (active: DragEndEvent['active']): string | null => {
        if (typeof document === 'undefined') return null;
        const translated = active.rect.current?.translated;
        if (!translated) return null;
        const cx = translated.left + translated.width / 2;
        const cy = translated.top + translated.height / 2;
        const cols = Array.from(document.querySelectorAll<HTMLElement>('[data-crm-column]'));
        const hit =
            cols.find(el => {
                const r = el.getBoundingClientRect();
                return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
            }) ??
            // Solto acima/abaixo do quadro mas alinhado a uma coluna → vale a
            // faixa horizontal (intenção clara de "naquela coluna").
            cols.find(el => {
                const r = el.getBoundingClientRect();
                return cx >= r.left && cx <= r.right;
            });
        const colId = hit?.getAttribute('data-crm-column');
        return colId && columns.includes(colId) ? colId : null;
    };

    const onDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveLead(null);

        const activeId = active.id as string;
        const snapshot = leadsRef.current;
        const leadFromDrag = active.data.current?.lead as CRMLead | undefined;
        const currentLead = snapshot.find(l => l.id === activeId) ?? leadFromDrag;
        if (!currentLead) return;

        // Ordem de confiança para decidir a coluna destino:
        // 1) hit-test do DOM (onde o card flutuante REALMENTE está ao soltar);
        // 2) alvo informado pelo dnd-kit;
        // 3) o estado visual local (o que o onDragOver já aplicou e o usuário vê).
        // NUNCA resetamos para a coluna de origem aqui — soltar sempre commita o
        // que está na tela. O único caminho de reverter é onDragCancel (Esc).
        const newStatus =
            resolveDropColumnFromRect(active) ??
            resolveOverStatus(over, snapshot) ??
            currentLead.status;
        const movedLead = currentLead.status === newStatus ? currentLead : { ...currentLead, status: newStatus };

        const orderedLeads = snapshot.some(l => l.id === movedLead.id && l.status === movedLead.status)
            ? snapshot
            : snapshot.map(l => l.id === movedLead.id ? movedLead : l);
        const columnLeads = orderedLeads.filter(l => l.status === movedLead.status);
        const indexInColumn = columnLeads.findIndex(l => l.id === movedLead.id);
        const prevLead = indexInColumn > 0 ? columnLeads[indexInColumn - 1] : undefined;
        const nextLead = indexInColumn >= 0 ? columnLeads[indexInColumn + 1] : undefined;

        let newPosition = movedLead.position || 1000;

        if (!prevLead && !nextLead) {
            newPosition = 1000;
        } else if (!prevLead) {
            newPosition = (nextLead?.position || 2000) / 2;
        } else if (!nextLead) {
            newPosition = (prevLead?.position || 0) + 1000;
        } else {
            newPosition = ((prevLead.position || 0) + (nextLead.position || 0)) / 2;
        }

        await onMoveLead(movedLead.id, movedLead.status, newPosition);
    };

    const onDragCancel = () => {
        resetLocalLeads();
    };

    const dropAnimation = {
        sideEffects: defaultDropAnimationSideEffects({
            styles: { active: { opacity: '0.5' } },
        }),
    };

    if (!isClient) {
        return <div className="flex gap-6 overflow-x-auto pb-4 h-full snap-x">Carregando quadro...</div>;
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            // Mede os droppables continuamente: as colunas têm altura variável e
            // rolam, então rects medidos só no início do drag ficavam errados e o
            // alvo da soltura era calculado fora do lugar.
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
        >
            <div className="flex gap-6 overflow-x-auto pb-4 h-full snap-x">
                {columns.map((colId) => (
                    <CRMColumn
                        key={colId}
                        id={colId}
                        title={colId}
                        leads={leads.filter((l) => l.status === colId)}
                        onLeadClick={onEditLead}
                        onAddLead={onAddLead}
                        onRename={onRenameStage}
                        onCadastroApprovalChange={onCadastroApprovalChange}
                    />
                ))}
            </div>

            {typeof window === 'object' && createPortal(
                <DragOverlay dropAnimation={dropAnimation}>
                    {activeLead && (
                        <CRMCardView
                            lead={activeLead}
                            onCadastroApprovalChange={onCadastroApprovalChange}
                        />
                    )}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
}
