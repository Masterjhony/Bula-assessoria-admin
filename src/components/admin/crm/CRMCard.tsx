'use client';

import { useState, type CSSProperties, type MouseEvent, type Ref } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CRMLead } from '@/app/sistema/actions/crm-leads';
import { CRM_STAGE_REGISTRATION } from '@/lib/crm-types';
import { Phone, Building, DollarSign, MapPin, Beef, MessageCircle, Crown, Search, Gauge, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

/** Rótulo curto para mensagens de mídia (sem corpo de texto). */
const WA_MEDIA_LABEL: Record<string, string> = {
    audio: '🎤 Áudio',
    image: '📷 Imagem',
    video: '🎬 Vídeo',
    document: '📄 Documento',
    sticker: '💟 Figurinha',
};

/** Texto exibível de uma mensagem (corpo ou rótulo de mídia). */
function waMessageText(m: { body?: string | null; media_type?: string | null }): string {
    if (m.body && m.body.trim()) return m.body.trim();
    if (m.media_type) return WA_MEDIA_LABEL[m.media_type] ?? '📎 Mídia';
    return '—';
}

/** Data/hora curta para a prévia das mensagens (dd/mm HH:mm). */
function waShortWhen(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

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
        // Placeholder com a MESMA altura do card (conteúdo invisível). Um
        // placeholder de altura fixa encolhia/crescia a coluna ao pegar o card,
        // deslocando o layout; com os rects do dnd-kit medidos durante o arrasto
        // isso fazia o alvo da soltura virar vazio (over=null) e o card "voltava
        // pro lugar". Mantendo a altura, não há deslocamento.
        return (
            <div
                ref={setNodeRef}
                style={style}
                data-crm-card-id={lead.id}
                data-crm-card-status={lead.status}
                className="rounded-xl border-2 border-dashed border-[#A68B4B] bg-[#A68B4B]/5"
            >
                <div className="invisible" aria-hidden>
                    <CRMCardView lead={lead} onCadastroApprovalChange={onCadastroApprovalChange} />
                </div>
            </div>
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

    const wa = lead.whatsapp ?? null;
    const waMessages = wa?.messages ?? [];
    const inicial = (lead.nome?.trim()?.charAt(0) || '?').toUpperCase();
    const localizacao = lead.cidade && lead.estado
        ? `${lead.cidade}/${lead.estado}`
        : (lead.cidade || lead.estado || '');
    const temPerfil = !!(lead.quantidade_animais || lead.o_que_busca || lead.score_serasa != null || lead.pendencias_financeiras || (lead.interesse && lead.interesse !== lead.o_que_busca));

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

    // Divisor visual entre seções (estilo do card de Clientes).
    const Divider = () => <div className="h-px bg-gray-100 dark:bg-[#262626]" />;

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
            className={`group relative touch-none overflow-hidden bg-white dark:bg-[#1A1A1A] rounded-xl border shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing flex flex-col ${
                lead.is_preferencial
                    ? 'border-[#A68B4B]/50 hover:border-[#A68B4B]/80 ring-1 ring-[#A68B4B]/15'
                    : 'border-gray-200 dark:border-[#2A2A2A] hover:border-[#A68B4B]/50'
            }`}
        >
            {/* ── Seção: cabeçalho (avatar + nome + localização + prioridade) ── */}
            <div className="flex items-start gap-2.5 px-3.5 pt-3.5 pb-3">
                <div
                    className="shrink-0 flex items-center justify-center font-bold text-[13px] text-white"
                    style={{ width: 38, height: 38, borderRadius: 9, background: 'linear-gradient(135deg, #C8A96E 0%, #A68B4B 100%)' }}
                >
                    {inicial}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <h4 className="font-bold text-gray-900 dark:text-white text-sm leading-tight line-clamp-2 flex-1 min-w-0">
                            {lead.nome}
                        </h4>
                        {lead.is_preferencial && <Crown size={13} className="text-[#A68B4B] shrink-0" />}
                        {lead.prioridade && (
                            <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold border ${priorityColors[lead.prioridade] || 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-[#262626] dark:border-[#333]'}`}>
                                {lead.prioridade}
                            </span>
                        )}
                    </div>
                    {(localizacao || lead.empresa) && (
                        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-0.5 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                            {localizacao && (
                                <span className="inline-flex items-center gap-1 min-w-0">
                                    <MapPin size={11} className="shrink-0 text-orange-400" />
                                    <span className="truncate">{localizacao}</span>
                                </span>
                            )}
                            {lead.empresa && (
                                <span className="inline-flex items-center gap-1 min-w-0">
                                    <Building size={11} className="shrink-0" />
                                    <span className="truncate">{lead.empresa}</span>
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Seção: perfil (cabeças, o que busca, score, interesse) ── */}
            {temPerfil && (
                <>
                    <Divider />
                    <div className="px-3.5 py-3 flex flex-col gap-2">
                        {(lead.quantidade_animais || lead.o_que_busca || lead.score_serasa != null || lead.pendencias_financeiras) && (
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

                        {lead.interesse && lead.interesse !== lead.o_que_busca && (
                            <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                                <DollarSign size={12} className="shrink-0 text-emerald-500" />
                                <span className="line-clamp-2">{lead.interesse}</span>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ── Seção: contato ── */}
            {(lead.telefone || lead.celular) && (
                <>
                    <Divider />
                    <div className="px-3.5 py-2.5 flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                        <Phone size={12} className="shrink-0 text-blue-500" />
                        <span>{lead.celular || lead.telefone}</span>
                    </div>
                </>
            )}

            {/* ── Seção: aprovação de cadastro (etapa CADASTRO) ── */}
            {isCadastroStage && (
                <>
                    <Divider />
                    <div className="px-3.5 py-2.5">
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
                    </div>
                </>
            )}

            {/* ── Seção: conversa de WhatsApp (mensagens do cockpit) ── */}
            <Divider />
            <div className="px-3.5 py-3 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.04]">
                <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                        <MessageCircle size={12} className="shrink-0" /> WhatsApp
                        {wa && wa.count > 0 && (
                            <span className="text-emerald-600/70 dark:text-emerald-400/70 font-semibold">· {wa.count}</span>
                        )}
                    </span>
                    {wa && wa.inbound_pending > 0 && (
                        <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-white">
                            {wa.inbound_pending} nova{wa.inbound_pending > 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {waMessages.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                        {waMessages.map((m) => {
                            const isOut = m.direction === 'outbound';
                            return (
                                <div key={m.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                                    <div
                                        className={`max-w-[88%] px-2.5 py-1.5 rounded-lg text-[11px] leading-snug ${
                                            isOut
                                                ? 'bg-[#A68B4B]/15 text-[#7a6230] dark:text-[#d8c08a] rounded-br-sm'
                                                : 'bg-gray-100 dark:bg-[#262626] text-gray-700 dark:text-gray-200 rounded-bl-sm'
                                        }`}
                                    >
                                        <p className="line-clamp-2 break-words">{waMessageText(m)}</p>
                                        <span className={`block mt-0.5 text-[9px] ${isOut ? 'text-[#A68B4B]/70' : 'text-gray-400 dark:text-gray-500'}`}>
                                            {isOut ? 'Enviada' : 'Recebida'} · {waShortWhen(m.created_at)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                        {wa && wa.count > waMessages.length && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-0.5">
                                + {wa.count - waMessages.length} mensage{wa.count - waMessages.length > 1 ? 'ns' : 'm'} · abrir para ver a conversa
                            </span>
                        )}
                    </div>
                ) : (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">Sem mensagens registradas no WhatsApp.</p>
                )}
            </div>

            {/* ── Rodapé: responsável + contatos manuais + data ── */}
            <Divider />
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
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
                {(lead.ultimo_contato || lead.data_entrada) && (
                    <span className="shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
                        {lead.ultimo_contato
                            ? `Contato ${new Date(lead.ultimo_contato).toLocaleDateString('pt-BR')}`
                            : `Entrada ${new Date(lead.data_entrada!).toLocaleDateString('pt-BR')}`
                        }
                    </span>
                )}
            </div>
        </div>
    );
}
