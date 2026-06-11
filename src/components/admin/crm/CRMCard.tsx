'use client';

import { useState, type CSSProperties, type MouseEvent, type Ref } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CRMLead } from '@/app/sistema/actions/crm-leads';
import { CRM_STAGE_REGISTRATION } from '@/lib/crm-types';
import { Phone, Building, DollarSign, MapPin, Beef, MessageCircle, Crown, Search, Gauge, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

interface CRMCardProps {
    lead: CRMLead;
    onClick: (lead: CRMLead) => void;
    onCadastroApprovalChange?: (lead: CRMLead, aprovado: boolean) => Promise<void> | void;
}

/**
 * Wrapper sortable do card. Registra o lead como draggable/droppable no
 * dnd-kit e delega a parte visual para `CRMCardView`.
 *
 * IMPORTANTE: o `DragOverlay` (em CRMKanbanBoard) deve renderizar o
 * `CRMCardView` puro — nunca este componente. Renderizar o `CRMCard` no
 * overlay registrava um segundo sortable com o MESMO id do card arrastado,
 * posicionado sob o cursor; a colisão (`closestCorners`) passava a apontar o
 * próprio card como alvo (`over.id === active.id`) e o `onDragOver` retornava
 * cedo, impedindo mover cards entre colunas.
 */
export function CRMCard({ lead, onClick, onCadastroApprovalChange }: CRMCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: lead.id,
        data: {
            type: 'Lead',
            lead,
        },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                data-crm-card-id={lead.id}
                data-crm-card-status={lead.status}
                className="opacity-30 border-2 border-dashed border-[#A68B4B] rounded-xl h-[120px]"
            />
        );
    }

    return (
        <CRMCardView
            lead={lead}
            onCadastroApprovalChange={onCadastroApprovalChange}
            innerRef={setNodeRef}
            style={style}
            onClick={() => onClick(lead)}
            dragHandleProps={{ ...attributes, ...listeners }}
        />
    );
}

interface CRMCardViewProps {
    lead: CRMLead;
    onCadastroApprovalChange?: (lead: CRMLead, aprovado: boolean) => Promise<void> | void;
    /** Ref do nó raiz (setNodeRef do sortable). Ausente no DragOverlay. */
    innerRef?: Ref<HTMLDivElement>;
    style?: CSSProperties;
    onClick?: () => void;
    /** attributes + listeners do dnd-kit. Ausentes no DragOverlay. */
    dragHandleProps?: Record<string, unknown>;
}

/**
 * Parte visual do card, SEM nenhum hook de DnD. Usado tanto pelo `CRMCard`
 * (passando ref/listeners) quanto pelo `DragOverlay` (apresentacional puro).
 */
export function CRMCardView({ lead, onCadastroApprovalChange, innerRef, style, onClick, dragHandleProps }: CRMCardViewProps) {
    const [savingApproval, setSavingApproval] = useState(false);

    const priorityColors: Record<string, string> = {
        'Alta': 'bg-red-500/10 text-red-500 border-red-500/20',
        'Baixa': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    };

    const contatos = lead.contact_count ?? (lead.contact_history?.length ?? 0);
    const isCadastroStage = lead.status === CRM_STAGE_REGISTRATION;
    const cadastroAprovado = !!lead.extra_data?.cadastro_aprovado;

    const handleCadastroApprovalClick = async (e: MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!onCadastroApprovalChange || savingApproval) return;
        setSavingApproval(true);
        try {
            await onCadastroApprovalChange(lead, !cadastroAprovado);
        } finally {
            setSavingApproval(false);
        }
    };

    return (
        <div
            ref={innerRef}
            style={style}
            data-crm-card-id={lead.id}
            data-crm-card-status={lead.status}
            {...dragHandleProps}
            onClick={onClick}
            // touch-none = touch-action: none. Sem isso, o navegador interpreta o
            // arrasto sobre o card como rolagem/pan e cancela o gesto antes do
            // PointerSensor ativar — o card "não arrasta" no mouse/touchpad real
            // (embora funcione em testes sintéticos).
            className={`group relative touch-none bg-white dark:bg-[#1A1A1A] p-4 rounded-xl border shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing flex flex-col gap-3 ${
                lead.is_preferencial
                    ? 'border-[#A68B4B]/50 hover:border-[#A68B4B]/80 ring-1 ring-[#A68B4B]/15'
                    : 'border-gray-200 dark:border-[#2A2A2A] hover:border-[#A68B4B]/50'
            }`}
        >
            {/* Header */}
            <div className="flex justify-between items-start gap-2">
                <h4 className="font-bold text-gray-900 dark:text-white text-sm line-clamp-2 leading-tight flex-1">
                    {lead.nome}
                </h4>
                {lead.is_preferencial && (
                    <Crown size={13} className="text-[#A68B4B] shrink-0" />
                )}
            </div>

            {/* Profile pill: cabeçinhas + o que busca */}
            {(lead.quantidade_animais || lead.o_que_busca) && (
                <div className="flex flex-wrap gap-1.5">
                    {lead.quantidade_animais && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                            <Beef size={10} /> {lead.quantidade_animais} cab.
                        </span>
                    )}
                    {lead.o_que_busca && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 max-w-full">
                            <Search size={10} /> <span className="truncate max-w-[140px]">{lead.o_que_busca}</span>
                        </span>
                    )}
                </div>
            )}

            {(lead.score_serasa != null || lead.pendencias_financeiras) && (
                <div className="flex flex-wrap gap-1.5">
                    {lead.score_serasa != null && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400">
                            <Gauge size={10} /> Serasa {lead.score_serasa}
                        </span>
                    )}
                    {lead.pendencias_financeiras && (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            lead.pendencias_financeiras === 'Sim'
                                ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        }`}>
                            <AlertTriangle size={10} /> Pend. {lead.pendencias_financeiras}
                        </span>
                    )}
                </div>
            )}

            {isCadastroStage && (
                <button
                    type="button"
                    onClick={handleCadastroApprovalClick}
                    disabled={!onCadastroApprovalChange || savingApproval}
                    title={cadastroAprovado ? 'Cadastro aprovado. Clique para remover a aprovação.' : 'Marcar cadastro como aprovado.'}
                    className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-extrabold uppercase transition-all disabled:cursor-not-allowed disabled:opacity-70 ${
                        cadastroAprovado
                            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-600 dark:border-[#333] dark:bg-[#141414] dark:text-gray-400 dark:hover:text-emerald-400'
                    }`}
                >
                    {savingApproval ? (
                        <Loader2 size={12} className="animate-spin" />
                    ) : (
                        <CheckCircle2 size={12} className={cadastroAprovado ? 'fill-emerald-500/20' : ''} />
                    )}
                    {cadastroAprovado ? 'Cadastro aprovado' : 'Aprovar cadastro'}
                </button>
            )}

            {/* Cidade/Estado */}
            {(lead.cidade || lead.estado) && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <MapPin size={12} className="shrink-0 text-orange-400" />
                    <span className="truncate">
                        {lead.cidade && lead.estado ? `${lead.cidade}/${lead.estado}` : (lead.cidade || lead.estado)}
                    </span>
                </div>
            )}

            {/* Empresa (if exists) */}
            {lead.empresa && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Building size={12} className="shrink-0" />
                    <span className="truncate">{lead.empresa}</span>
                </div>
            )}

            {/* Interesse / Momento Pecuária — só se diferente do o_que_busca */}
            {lead.interesse && lead.interesse !== lead.o_que_busca && (
                <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                    <DollarSign size={12} className="shrink-0 text-emerald-500" />
                    <span className="line-clamp-2">{lead.interesse}</span>
                </div>
            )}

            {/* Contato Info */}
            {(lead.telefone || lead.celular) && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                    <Phone size={12} className="shrink-0 text-blue-500" />
                    <span>{lead.celular || lead.telefone}</span>
                </div>
            )}

            <div className="flex items-center justify-between pt-2 mt-auto border-t border-gray-100 dark:border-[#2A2A2A]">
                <div className="flex items-center gap-2 min-w-0">
                    {lead.responsavel && (
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 uppercase font-semibold min-w-0">
                            <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-[#3f3f3f] flex items-center justify-center text-gray-600 dark:text-gray-300 shrink-0">
                                {lead.responsavel.charAt(0)}
                            </div>
                            <span className="truncate max-w-[80px]">{lead.responsavel}</span>
                        </div>
                    )}
                    {contatos > 0 && (
                        <span
                            className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            title={`${contatos} contato${contatos > 1 ? 's' : ''} registrado${contatos > 1 ? 's' : ''}`}
                        >
                            <MessageCircle size={9} /> {contatos}
                        </span>
                    )}
                </div>

                {/* Priority Badge */}
                {lead.prioridade && (
                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold border ${priorityColors[lead.prioridade] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {lead.prioridade}
                    </div>
                )}
            </div>

            {(lead.ultimo_contato || lead.data_entrada) && (
                <div className="flex items-center justify-center mt-2 pb-1">
                    <span className="text-[10px] bg-gray-100 dark:bg-[#2e2e2e] text-gray-500 dark:text-gray-400 px-3 py-1 rounded-full border border-gray-200 dark:border-[#333] w-full text-center">
                        {lead.ultimo_contato
                            ? `Contatado ${new Date(lead.ultimo_contato).toLocaleDateString('pt-BR')}`
                            : `Entrada ${new Date(lead.data_entrada!).toLocaleDateString('pt-BR')}`
                        }
                    </span>
                </div>
            )}
        </div>
    );
}
