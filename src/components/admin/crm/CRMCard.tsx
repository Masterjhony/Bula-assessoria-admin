'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CRMLead } from '@/app/sistema/actions/crm-leads';
import { Phone, Building, DollarSign, MapPin, Beef, MessageCircle, Crown, Search } from 'lucide-react';

interface CRMCardProps {
    lead: CRMLead;
    onClick: (lead: CRMLead) => void;
}

export function CRMCard({ lead, onClick }: CRMCardProps) {
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
                className="opacity-30 border-2 border-dashed border-[#A0792E] rounded-xl h-[120px]"
            />
        );
    }

    const priorityColors: Record<string, string> = {
        'Alta': 'bg-red-500/10 text-red-500 border-red-500/20',
        'Baixa': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    };

    const contatos = lead.contact_count ?? (lead.contact_history?.length ?? 0);

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            onClick={() => onClick(lead)}
            className={`group relative bg-white dark:bg-[#262626] p-4 rounded-xl border shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing flex flex-col gap-3 ${
                lead.is_preferencial
                    ? 'border-[#A0792E]/50 hover:border-[#A0792E]/80 ring-1 ring-[#A0792E]/15'
                    : 'border-gray-200 dark:border-[#2e2e2e] hover:border-[#A0792E]/50'
            }`}
        >
            {/* Header */}
            <div className="flex justify-between items-start gap-2">
                <h4 className="font-bold text-gray-900 dark:text-white text-sm line-clamp-2 leading-tight flex-1">
                    {lead.nome}
                </h4>
                {lead.is_preferencial && (
                    <Crown size={13} className="text-[#A0792E] shrink-0" />
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

            <div className="flex items-center justify-between pt-2 mt-auto border-t border-gray-100 dark:border-[#2e2e2e]">
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
                    <span className="text-[10px] bg-gray-100 dark:bg-[#2e2e2e] text-gray-500 dark:text-gray-400 px-3 py-1 rounded-full border border-gray-200 dark:border-[#3f3f3f] w-full text-center">
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
