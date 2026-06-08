'use client';

import { useState, useEffect } from 'react';
import { X, Save, Trash2, ChevronDown, ChevronUp, Crown, User, TrendingUp, Phone, Target, SlidersHorizontal, BarChart3, type LucideIcon } from 'lucide-react';
import { CRMLead, deleteLead } from '@/app/sistema/actions/crm-leads';
import { CRM_COLUMNS } from './CRMKanbanBoard';
import type { CRMCustomField, CRMFunnel, CRMResponsavel } from '@/lib/crm-types';
import { CRMContactsHistory } from './CRMContactsHistory';

interface CRMModalProps {
    isOpen: boolean;
    onClose: () => void;
    lead?: CRMLead;
    defaultStatus: string;
    defaultFunnelId?: string;
    stages?: string[];
    customFields?: CRMCustomField[];
    responsaveis?: CRMResponsavel[];
    funnels?: CRMFunnel[];
    onSave: (data: any) => Promise<void>;
    onDelete?: () => void;
    onLeadUpdated?: (lead: CRMLead) => void;
}

/** Cartão de seção do formulário — agrupa campos relacionados sob um cabeçalho com ícone. */
function FormSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
    return (
        <section className="border border-gray-200 dark:border-[#333] rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-[#1A1A1A] border-b border-gray-200 dark:border-[#333]">
                <Icon size={15} className="text-[#A68B4B]" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</span>
            </div>
            <div className="p-4 space-y-4">{children}</div>
        </section>
    );
}

export function CRMModal({ isOpen, onClose, lead, defaultStatus, defaultFunnelId, stages, customFields = [], responsaveis = [], funnels = [], onSave, onDelete, onLeadUpdated }: CRMModalProps) {
    const activeStages = stages && stages.length > 0 ? stages : CRM_COLUMNS;
    const [formData, setFormData] = useState<Partial<CRMLead>>({
        nome: '',
        status: defaultStatus,
        funnel_id: defaultFunnelId || 'default',
        temperatura: '',
        prioridade: '',
        interesse: '',
        empresa: '',
        cpf: '',
        inscricao_estadual: '',
        celular: '',
        responsavel: '',
        estado: '',
        cidade: '',
        o_que_busca: '',
        quantidade_animais: '',
        operacao_pecuaria: '',
        assessoria: '',
        is_mql: false,
        is_preferencial: false,
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showOrigemSection, setShowOrigemSection] = useState(false);

    useEffect(() => {
        if (lead) {
            setFormData(lead);
            // Auto-expand origem section if lead has source data
            if (lead.source || lead.medium || lead.campaign) {
                setShowOrigemSection(true);
            }
        } else {
            setFormData({
                nome: '',
                status: defaultStatus,
                funnel_id: defaultFunnelId || 'default',
                temperatura: '',
                prioridade: '',
                interesse: '',
                empresa: '',
                cpf: '',
                inscricao_estadual: '',
                celular: '',
                responsavel: '',
                estado: '',
                cidade: '',
                o_que_busca: '',
                quantidade_animais: '',
                operacao_pecuaria: '',
                assessoria: '',
                is_mql: false,
                is_preferencial: false,
            });
            setShowOrigemSection(false);
        }
    }, [lead, defaultStatus, defaultFunnelId, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave(formData);
            onClose();
        } catch (error) {
            console.error('Failed to save lead:', error);
            alert('Erro ao salvar o lead.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!lead || !window.confirm('Tem certeza que deseja apagar este lead?')) return;
        setIsDeleting(true);
        try {
            await deleteLead(lead.id);
            onClose();
            window.location.reload();
        } catch (error) {
            console.error('Failed to delete:', error);
            alert('Erro ao deletar lead.');
        } finally {
            setIsDeleting(false);
        }
    };

    const inputClass = "w-full bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent transition-all";
    const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white dark:bg-[#141414] w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-gray-200 dark:border-[#2A2A2A] shadow-2xl">
                <div className="sticky top-0 bg-white/80 dark:bg-[#141414]/80 backdrop-blur-md p-6 border-b border-gray-200 dark:border-[#2A2A2A] flex justify-between items-start z-10">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold dark:text-white">
                                {lead ? 'Editar Lead' : 'Novo Lead'}
                            </h2>
                            {formData.is_preferencial && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#A68B4B]/15 text-[#A68B4B]">
                                    <Crown size={10} /> Preferencial
                                </span>
                            )}
                        </div>
                        {lead?.data_entrada && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Entrada em {new Date(lead.data_entrada).toLocaleDateString('pt-BR')} às {new Date(lead.data_entrada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-[#2e2e2e] rounded-full transition-colors text-gray-500">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="space-y-4">
                        {/* ───── Identificação ───── */}
                        <FormSection icon={User} title="Identificação">
                            <div>
                                <label className={labelClass}>Nome do Lead / Contato *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.nome || ''}
                                    onChange={e => setFormData({ ...formData, nome: e.target.value })}
                                    className={inputClass}
                                    placeholder="Ex: [Local] Nome do Cliente"
                                />
                            </div>

                            {funnels.length > 1 && (
                                <div>
                                    <label className={labelClass}>Funil</label>
                                    <select
                                        value={formData.funnel_id || 'default'}
                                        onChange={e => setFormData({ ...formData, funnel_id: e.target.value })}
                                        className={`${inputClass} appearance-none`}
                                    >
                                        {funnels.map(f => (
                                            <option key={f.id} value={f.id}>{f.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>CPF</label>
                                    <input
                                        type="text"
                                        value={formData.cpf || ''}
                                        onChange={e => setFormData({ ...formData, cpf: e.target.value })}
                                        className={inputClass}
                                        placeholder="000.000.000-00"
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Inscrição Estadual</label>
                                    <input
                                        type="text"
                                        value={formData.inscricao_estadual || ''}
                                        onChange={e => setFormData({ ...formData, inscricao_estadual: e.target.value })}
                                        className={inputClass}
                                        placeholder="Nº da inscrição estadual"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className={labelClass}>Responsável pela Conta</label>
                                {responsaveis.length > 0 ? (
                                    <select
                                        value={formData.responsavel || ''}
                                        onChange={e => setFormData({ ...formData, responsavel: e.target.value })}
                                        className={inputClass}
                                    >
                                        <option value="">Selecionar responsável...</option>
                                        {responsaveis.map(r => (
                                            <option key={r.id} value={r.name}>{r.name}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type="text"
                                        value={formData.responsavel || ''}
                                        onChange={e => setFormData({ ...formData, responsavel: e.target.value })}
                                        className={inputClass}
                                        placeholder="Ex: Matheus Amormino"
                                    />
                                )}
                            </div>
                        </FormSection>

                        {/* ───── Pipeline & Negócio ───── */}
                        <FormSection icon={TrendingUp} title="Pipeline & Negócio">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Status</label>
                                    <select
                                        value={formData.status || 'Lead'}
                                        onChange={e => setFormData({ ...formData, status: e.target.value })}
                                        className={`${inputClass} appearance-none`}
                                    >
                                        {activeStages.map(col => (
                                            <option key={col} value={col}>{col}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Prioridade</label>
                                    <select
                                        value={formData.prioridade || ''}
                                        onChange={e => setFormData({ ...formData, prioridade: e.target.value })}
                                        className={`${inputClass} appearance-none`}
                                    >
                                        <option value="">Nenhuma</option>
                                        <option value="Alta">Alta</option>
                                        <option value="Baixa">Baixa</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Temperatura do lead</label>
                                    <select
                                        value={formData.temperatura || ''}
                                        onChange={e => setFormData({ ...formData, temperatura: e.target.value })}
                                        className={`${inputClass} appearance-none`}
                                    >
                                        <option value="">— selecionar —</option>
                                        <option value="frio">Frio</option>
                                        <option value="morno">Morno</option>
                                        <option value="quente">Quente</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Data estimada fechamento</label>
                                    <input
                                        type="date"
                                        value={formData.data_estimada_fechamento ? formData.data_estimada_fechamento.slice(0, 10) : ''}
                                        onChange={e => setFormData({ ...formData, data_estimada_fechamento: e.target.value || null })}
                                        className={inputClass}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Último contato</label>
                                    <input
                                        type="date"
                                        value={formData.ultimo_contato ? formData.ultimo_contato.slice(0, 10) : ''}
                                        onChange={e => setFormData({ ...formData, ultimo_contato: e.target.value || null })}
                                        className={inputClass}
                                    />
                                </div>
                            </div>

                            {/* Lead preferencial */}
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, is_preferencial: !formData.is_preferencial })}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                                    formData.is_preferencial
                                        ? 'border-[#A68B4B]/50 bg-[#A68B4B]/8 dark:bg-[#A68B4B]/10'
                                        : 'border-gray-200 dark:border-[#333] bg-gray-50 dark:bg-[#1A1A1A] hover:border-[#A68B4B]/30'
                                }`}
                            >
                                <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                    formData.is_preferencial ? 'bg-[#A68B4B] text-black' : 'bg-gray-200 dark:bg-[#2e2e2e] text-gray-400'
                                }`}>
                                    <Crown size={16} />
                                </span>
                                <div className="flex-1 text-left">
                                    <p className={`text-sm font-bold ${formData.is_preferencial ? 'text-[#A68B4B]' : 'text-gray-700 dark:text-gray-300'}`}>
                                        Lead preferencial
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
                                        Marca este lead para aparecer em destaque no topo do CRM principal.
                                    </p>
                                </div>
                                <div className={`w-10 h-6 rounded-full p-0.5 transition-colors flex-shrink-0 ${
                                    formData.is_preferencial ? 'bg-[#A68B4B]' : 'bg-gray-300 dark:bg-[#3f3f3f]'
                                }`}>
                                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
                                        formData.is_preferencial ? 'translate-x-4' : ''
                                    }`} />
                                </div>
                            </button>
                        </FormSection>

                        {/* ───── Contato ───── */}
                        <FormSection icon={Phone} title="Contato">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Celular / WhatsApp</label>
                                    <input
                                        type="text"
                                        value={formData.celular || ''}
                                        onChange={e => setFormData({ ...formData, celular: e.target.value })}
                                        className={inputClass}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Empresa / Fazenda</label>
                                    <input
                                        type="text"
                                        value={formData.empresa || ''}
                                        onChange={e => setFormData({ ...formData, empresa: e.target.value })}
                                        className={inputClass}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Cidade</label>
                                    <input
                                        type="text"
                                        value={formData.cidade || ''}
                                        onChange={e => setFormData({ ...formData, cidade: e.target.value })}
                                        className={inputClass}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Estado (UF)</label>
                                    <input
                                        type="text"
                                        value={formData.estado || ''}
                                        onChange={e => setFormData({ ...formData, estado: e.target.value })}
                                        className={inputClass}
                                        placeholder="MG, SP, etc."
                                    />
                                </div>
                            </div>
                        </FormSection>

                        {/* ───── Perfil & Qualificação ───── */}
                        <FormSection icon={Target} title="Perfil & Qualificação">
                            <div>
                                <label className={labelClass}>Interesse / Momento Pecuária</label>
                                <textarea
                                    value={formData.interesse || ''}
                                    onChange={e => setFormData({ ...formData, interesse: e.target.value })}
                                    rows={2}
                                    className={inputClass}
                                    placeholder="O que o cliente deseja comprar?"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>O que busca</label>
                                    <input
                                        type="text"
                                        value={formData.o_que_busca || ''}
                                        onChange={e => setFormData({ ...formData, o_que_busca: e.target.value })}
                                        className={inputClass}
                                        placeholder="Touro, Matrizes, etc."
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Qtd. Animais</label>
                                    <input
                                        type="text"
                                        value={formData.quantidade_animais || ''}
                                        onChange={e => {
                                            const v = e.target.value;
                                            const MQL_FAIXAS = new Set(['100-300','300-500','500+','100 a 300','300 a 500','500 ou mais']);
                                            const num = v.match(/^(\d+)\s*$/);
                                            const isMqlNow = MQL_FAIXAS.has(v) || (num ? Number(num[1]) >= 100 : false);
                                            setFormData({ ...formData, quantidade_animais: v, is_mql: isMqlNow });
                                        }}
                                        className={inputClass}
                                        placeholder="0 a 100"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Operação na pecuária</label>
                                    <select
                                        value={formData.operacao_pecuaria || ''}
                                        onChange={e => setFormData({ ...formData, operacao_pecuaria: e.target.value })}
                                        className={inputClass}
                                    >
                                        <option value="">— selecionar —</option>
                                        <option value="cria-corte">Cria (corte)</option>
                                        <option value="recria-corte">Recria (corte)</option>
                                        <option value="engorda-corte">Engorda (corte)</option>
                                        <option value="ciclo-completo-corte">Ciclo completo (corte)</option>
                                        <option value="criador-gado-po">Criador de gado P.O.</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Quer assessoria</label>
                                    <select
                                        value={formData.assessoria || ''}
                                        onChange={e => setFormData({ ...formData, assessoria: e.target.value })}
                                        className={inputClass}
                                    >
                                        <option value="">—</option>
                                        <option value="sim">Sim</option>
                                        <option value="talvez">Talvez</option>
                                        <option value="nao">Não</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#A68B4B]/30 bg-[#A68B4B]/5">
                                <span className="text-xs font-bold uppercase tracking-wider text-[#A68B4B] flex-1">
                                    MQL — Marketing Qualified Lead
                                    <span className="block font-normal normal-case text-[11px] text-gray-500 dark:text-gray-400 tracking-normal mt-0.5">
                                        Definido automaticamente quando o lead tem ≥100 cabeças. Você pode ajustar manualmente.
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setFormData({ ...formData, is_mql: !formData.is_mql })}
                                    className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${formData.is_mql ? 'bg-[#A68B4B]' : 'bg-gray-300 dark:bg-[#3f3f3f]'}`}
                                    aria-label="Alternar MQL"
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${formData.is_mql ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>
                        </FormSection>

                        {/* ───── Campos personalizados ───── */}
                        {customFields.length > 0 && (
                            <FormSection icon={SlidersHorizontal} title="Campos personalizados">
                                {customFields.map(field => (
                                    <div key={field.id}>
                                        <label className={labelClass}>
                                            {field.label}
                                            {field.required && <span className="text-red-500 ml-1">*</span>}
                                        </label>
                                        {field.type === 'textarea' ? (
                                            <textarea
                                                required={field.required}
                                                rows={2}
                                                value={formData.extra_data?.[field.id] ?? ''}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    extra_data: { ...formData.extra_data, [field.id]: e.target.value }
                                                })}
                                                className={inputClass}
                                            />
                                        ) : field.type === 'select' ? (
                                            <select
                                                required={field.required}
                                                value={formData.extra_data?.[field.id] ?? ''}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    extra_data: { ...formData.extra_data, [field.id]: e.target.value }
                                                })}
                                                className={`${inputClass} appearance-none`}
                                            >
                                                <option value="">Selecione...</option>
                                                {(field.options || []).map(opt => (
                                                    <option key={opt} value={opt}>{opt}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                                                required={field.required}
                                                value={formData.extra_data?.[field.id] ?? ''}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    extra_data: { ...formData.extra_data, [field.id]: e.target.value }
                                                })}
                                                className={inputClass}
                                            />
                                        )}
                                    </div>
                                ))}
                            </FormSection>
                        )}

                        {/* Histórico de contatos (apenas em edição) */}
                        {lead && onLeadUpdated && (
                            <CRMContactsHistory lead={lead} onUpdated={onLeadUpdated} />
                        )}

                        {/* Seção Origem (colapsável) */}
                        <div className="border border-gray-200 dark:border-[#333] rounded-xl overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setShowOrigemSection(!showOrigemSection)}
                                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-[#1A1A1A] hover:bg-gray-100 dark:hover:bg-[#2e2e2e] transition-colors text-sm font-semibold text-gray-700 dark:text-gray-300"
                            >
                                <span className="flex items-center gap-2">
                                    <BarChart3 size={15} className="text-[#A68B4B]" />
                                    Origem / Campanha
                                </span>
                                {showOrigemSection ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                            {showOrigemSection && (
                                <div className="p-4 space-y-3 border-t border-gray-200 dark:border-[#333]">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                                            <input
                                                type="text"
                                                value={formData.source || ''}
                                                onChange={e => setFormData({ ...formData, source: e.target.value })}
                                                className={inputClass}
                                                placeholder="facebook, google..."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Medium</label>
                                            <input
                                                type="text"
                                                value={formData.medium || ''}
                                                onChange={e => setFormData({ ...formData, medium: e.target.value })}
                                                className={inputClass}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Campaign</label>
                                        <input
                                            type="text"
                                            value={formData.campaign || ''}
                                            onChange={e => setFormData({ ...formData, campaign: e.target.value })}
                                            className={inputClass}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1">Page</label>
                                        <input
                                            type="text"
                                            value={formData.source_page || ''}
                                            onChange={e => setFormData({ ...formData, source_page: e.target.value })}
                                            className={inputClass}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-[#2A2A2A]">
                        {lead ? (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="flex items-center gap-2 px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors font-medium text-sm"
                            >
                                <Trash2 size={18} />
                                {isDeleting ? 'Apagando...' : 'Apagar'}
                            </button>
                        ) : (
                            <div />
                        )}
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-6 py-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2e2e2e] rounded-xl font-medium transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSaving}
                                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#A68B4B] to-[#C8A96E] hover:from-[#9A7209] hover:to-[#A68B4B] text-black font-bold rounded-xl transition-all shadow-lg shadow-[#A68B4B]/20 disabled:opacity-50"
                            >
                                <Save size={18} />
                                {isSaving ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
