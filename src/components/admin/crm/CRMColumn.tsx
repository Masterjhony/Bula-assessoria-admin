'use client';

import { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CRMCard } from './CRMCard';
import { CRMLead } from '@/app/sistema/actions/crm-leads';
import { Plus, Pencil } from 'lucide-react';

interface CRMColumnProps {
    id: string;
    title: string;
    leads: CRMLead[];
    onLeadClick: (lead: CRMLead) => void;
    onAddLead: (status: string) => void;
    onRename?: (oldName: string, newName: string) => Promise<void>;
    onCadastroApprovalChange?: (lead: CRMLead, aprovado: boolean) => Promise<void> | void;
}

export function CRMColumn({ id, title, leads, onLeadClick, onAddLead, onRename, onCadastroApprovalChange }: CRMColumnProps) {
    const { setNodeRef } = useDroppable({
        id: id,
        data: {
            type: 'Column',
            status: id,
        },
    });

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(title);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setDraft(title);
    }, [title]);

    useEffect(() => {
        if (editing) inputRef.current?.select();
    }, [editing]);

    const columnColors: Record<string, string> = {
        'Sem Status': 'bg-gray-500/10 text-gray-500 border-gray-500/20',
        'Lead': 'bg-pink-500/10 text-pink-500 border-pink-500/20',
        'Qualificado': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
        'CONEXÃO': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        'QUALIFICAÇÃO': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
        'CADASTRO': 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
        'ASSESSORES': 'bg-green-500/10 text-green-500 border-green-500/20',
        'Proposta': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        'Negociação': 'bg-purple-500/10 text-purple-500 border-purple-500/20',
        'Fechado': 'bg-green-500/10 text-green-500 border-green-500/20',
        'Perdido': 'bg-red-500/10 text-red-500 border-red-500/20',
        'default': 'bg-gray-500/10 text-gray-500 border-gray-500/20'
    };

    const headerColor = columnColors[title] || columnColors['default'];
    const canRename = !!onRename;

    const commit = async () => {
        const next = draft.trim();
        setEditing(false);
        if (!onRename || !next || next === title) {
            setDraft(title);
            return;
        }
        await onRename(title, next);
    };

    const cancel = () => {
        setDraft(title);
        setEditing(false);
    };

    return (
        <div
            ref={setNodeRef}
            data-crm-column={id}
            className="flex-1 min-w-[320px] flex flex-col gap-4 bg-gray-50 dark:bg-[#141414] p-4 rounded-2xl border border-gray-200 dark:border-[#2A2A2A]"
        >
            <div className="flex items-center justify-between">
                <div className={`group/title px-3 py-1 rounded-full text-xs font-bold border flex w-full justify-between items-center gap-2 ${headerColor}`}>
                    {editing ? (
                        <input
                            ref={inputRef}
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onBlur={commit}
                            onKeyDown={e => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                if (e.key === 'Escape') cancel();
                            }}
                            className="flex-1 bg-transparent border-b border-current/40 outline-none text-xs font-bold uppercase tracking-wide"
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={() => canRename && setEditing(true)}
                            disabled={!canRename}
                            title={canRename ? 'Clique para renomear etapa' : undefined}
                            className={`flex items-center gap-1.5 truncate ${canRename ? 'cursor-text hover:opacity-80' : 'cursor-default'}`}
                        >
                            <span className="truncate">{title}</span>
                            {canRename && (
                                <Pencil
                                    size={11}
                                    className="opacity-0 group-hover/title:opacity-60 transition-opacity shrink-0"
                                />
                            )}
                        </button>
                    )}
                    <span className="opacity-70 text-[10px] bg-white/20 px-2 py-0.5 rounded-full shrink-0">{leads.length}</span>
                </div>
            </div>

            <div className="flex-1 flex flex-col gap-3 min-h-[500px]">
                <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy}>
                    {leads.map((lead) => (
                        <CRMCard
                            key={lead.id}
                            lead={lead}
                            onClick={onLeadClick}
                            onCadastroApprovalChange={onCadastroApprovalChange}
                        />
                    ))}
                </SortableContext>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onAddLead(id);
                    }}
                    className="w-full py-3 mt-2 rounded-xl flex items-center justify-center gap-2 text-gray-400 dark:text-gray-500 hover:text-[#A68B4B] hover:bg-[#A68B4B]/5 border border-transparent hover:border-[#A68B4B]/20 transition-all text-sm font-medium"
                >
                    <Plus size={16} /> Nova página
                </button>
            </div>
        </div>
    );
}
