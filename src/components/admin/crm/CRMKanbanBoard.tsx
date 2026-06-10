'use client';

import { useState, useEffect } from 'react';
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
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CRMColumn } from './CRMColumn';
import { CRMCard } from './CRMCard';
import { CRMLead } from '@/app/sistema/actions/crm-leads';
import { createPortal } from 'react-dom';

interface CRMKanbanBoardProps {
    leads: CRMLead[];
    stages?: string[];
    onEditLead: (lead: CRMLead) => void;
    onAddLead: (status: string) => void;
    onMoveLead: (id: string, newStatus: string, newPosition: number) => Promise<void>;
    onRenameStage?: (oldName: string, newName: string) => Promise<void>;
}

export const CRM_COLUMNS = ['Lead', 'Qualificado', 'Proposta', 'Negociação', 'Fechado', 'Perdido', 'Sem Status'];

export function CRMKanbanBoard({ leads: externalLeads, stages, onEditLead, onAddLead, onMoveLead, onRenameStage }: CRMKanbanBoardProps) {
    const columns = stages && stages.length > 0 ? stages : CRM_COLUMNS;
    const [leads, setLeads] = useState<CRMLead[]>(externalLeads);
    const [activeLead, setActiveLead] = useState<CRMLead | null>(null);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        setLeads(externalLeads);
    }, [externalLeads]);

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
        const lead = leads.find(l => l.id === active.id);
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

        setLeads((prev) => {
            // Guard: o dnd-kit pode disparar com um id ainda fora da lista durante o
            // arrasto. Sem isso, prev[-1].status lançava TypeError e quebrava a tela.
            const activeIndex = prev.findIndex((l) => l.id === activeId);
            if (activeIndex === -1) return prev;
            const activeLead = prev[activeIndex];

            if (isOverLead) {
                const overIndex = prev.findIndex((l) => l.id === overId);
                if (overIndex === -1) return prev;
                const overLead = prev[overIndex];
                if (activeLead.status !== overLead.status) {
                    const updated = [...prev];
                    updated[activeIndex] = { ...activeLead, status: overLead.status };
                    return arrayMove(updated, activeIndex, overIndex);
                }
                return arrayMove(prev, activeIndex, overIndex);
            }

            if (isOverColumn) {
                const newStatus = overId as string;
                if (activeLead.status !== newStatus) {
                    const updated = [...prev];
                    updated[activeIndex] = { ...activeLead, status: newStatus };
                    return updated;
                }
            }

            return prev;
        });
    };

    const onDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveLead(null);
        if (!over) return;

        const activeId = active.id as string;
        const currentLead = leads.find(l => l.id === activeId);
        if (!currentLead) return;

        const columnLeads = leads.filter(l => l.status === currentLead.status);
        const indexInColumn = columnLeads.findIndex(l => l.id === currentLead.id);
        const prevLead = columnLeads[indexInColumn - 1];
        const nextLead = columnLeads[indexInColumn + 1];

        let newPosition = currentLead.position || 1000;

        if (!prevLead && !nextLead) {
            newPosition = 1000;
        } else if (!prevLead) {
            newPosition = (nextLead?.position || 2000) / 2;
        } else if (!nextLead) {
            newPosition = (prevLead?.position || 0) + 1000;
        } else {
            newPosition = (prevLead.position + nextLead.position) / 2;
        }

        await onMoveLead(currentLead.id, currentLead.status, newPosition);
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
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
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
                    />
                ))}
            </div>

            {typeof window === 'object' && createPortal(
                <DragOverlay dropAnimation={dropAnimation}>
                    {activeLead && (
                        <CRMCard
                            lead={activeLead}
                            onClick={() => { }}
                        />
                    )}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
}
