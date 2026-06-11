'use client';

import { useRef, useState } from 'react';
import {
    Plus, Trash2, GripVertical, Save, Check, X,
    ChevronUp, ChevronDown, ChevronRight, Eye, EyeOff,
} from 'lucide-react';
import { saveCRMConfig, renameStage } from '@/app/sistema/actions/crm-config';
import { reavaliarLeadsJmp } from '@/app/sistema/actions/crm-leads';
import type { CRMConfig, CRMCustomField, CRMFunnel, CRMMqlRule, CRMStage } from '@/lib/crm-types';
import { DEFAULT_STAGES, isQualificationStage, JMP_FUNNEL_ID } from '@/lib/crm-types';

interface FunnelsEditorProps {
    initialConfig: CRMConfig;
    onConfigSaved: (config: CRMConfig) => void;
}

const STAGE_COLORS = [
    { id: 'pink', label: 'Rosa', dot: 'bg-pink-500', badge: 'bg-pink-500/10 text-pink-600 border-pink-500/30 dark:bg-pink-500/20 dark:text-pink-300' },
    { id: 'orange', label: 'Laranja', dot: 'bg-orange-500', badge: 'bg-orange-500/10 text-orange-600 border-orange-500/30 dark:bg-orange-500/20 dark:text-orange-300' },
    { id: 'blue', label: 'Azul', dot: 'bg-blue-500', badge: 'bg-blue-500/10 text-blue-600 border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-300' },
    { id: 'purple', label: 'Roxo', dot: 'bg-purple-500', badge: 'bg-purple-500/10 text-purple-600 border-purple-500/30 dark:bg-purple-500/20 dark:text-purple-300' },
    { id: 'green', label: 'Verde', dot: 'bg-green-500', badge: 'bg-green-500/10 text-green-600 border-green-500/30 dark:bg-green-500/20 dark:text-green-300' },
    { id: 'red', label: 'Vermelho', dot: 'bg-red-500', badge: 'bg-red-500/10 text-red-600 border-red-500/30 dark:bg-red-500/20 dark:text-red-300' },
    { id: 'gray', label: 'Cinza', dot: 'bg-gray-500', badge: 'bg-gray-500/10 text-gray-600 border-gray-500/30 dark:bg-gray-500/20 dark:text-gray-300' },
    { id: 'yellow', label: 'Amarelo', dot: 'bg-yellow-500', badge: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/30 dark:bg-yellow-500/20 dark:text-yellow-300' },
    { id: 'teal', label: 'Teal', dot: 'bg-teal-500', badge: 'bg-teal-500/10 text-teal-600 border-teal-500/30 dark:bg-teal-500/20 dark:text-teal-300' },
    { id: 'indigo', label: 'Índigo', dot: 'bg-indigo-500', badge: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30 dark:bg-indigo-500/20 dark:text-indigo-300' },
];

const FIELD_TYPES = [
    { id: 'text', label: 'Texto' },
    { id: 'textarea', label: 'Texto longo' },
    { id: 'number', label: 'Número' },
    { id: 'date', label: 'Data' },
    { id: 'select', label: 'Seleção (lista)' },
];

const getColorDot = (color?: string) => STAGE_COLORS.find(c => c.id === color)?.dot ?? 'bg-gray-400';
const getStageBadge = (color: string) => STAGE_COLORS.find(c => c.id === color)?.badge ?? STAGE_COLORS[6].badge;

function initFunnels(config: CRMConfig): CRMFunnel[] {
    if (config.funnels?.length) return config.funnels;
    return [{
        id: 'default',
        name: 'Pipeline Principal',
        color: 'yellow',
        stages: config.stages?.length ? config.stages : DEFAULT_STAGES,
        custom_fields: config.custom_fields || [],
    }];
}

export function FunnelsEditor({ initialConfig, onConfigSaved }: FunnelsEditorProps) {
    const [funnels, setFunnels] = useState<CRMFunnel[]>(initFunnels(initialConfig));
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(funnels[0]?.id ?? null);

    const [showNewFunnel, setShowNewFunnel] = useState(false);
    const [newFunnelName, setNewFunnelName] = useState('');
    const [newFunnelColor, setNewFunnelColor] = useState('blue');

    const [showNewStage, setShowNewStage] = useState(false);
    const [newStageName, setNewStageName] = useState('');
    const [newStageColor, setNewStageColor] = useState('blue');
    const [newStageProbability, setNewStageProbability] = useState<number | ''>('');

    const [showNewField, setShowNewField] = useState(false);
    const [newFieldLabel, setNewFieldLabel] = useState('');
    const [newFieldType, setNewFieldType] = useState<CRMCustomField['type']>('text');
    const [newFieldOptions, setNewFieldOptions] = useState('');
    const [newFieldRequired, setNewFieldRequired] = useState(false);

    const toggleExpand = (id: string) => {
        if (expandedId === id) {
            setExpandedId(null);
        } else {
            setExpandedId(id);
            setShowNewStage(false);
            setShowNewField(false);
            setNewStageName('');
            setNewStageColor('blue');
            setNewStageProbability('');
            setNewFieldLabel('');
            setNewFieldType('text');
            setNewFieldOptions('');
            setNewFieldRequired(false);
        }
    };

    const addFunnel = () => {
        const name = newFunnelName.trim();
        if (!name) return;
        const id = `funnel_${Date.now()}`;
        const funnel: CRMFunnel = {
            id,
            name,
            color: newFunnelColor,
            stages: [
                { id: 'Lead', name: 'Lead', color: 'pink', probability: 10 },
                { id: 'Em andamento', name: 'Em andamento', color: 'blue', probability: 50 },
                { id: 'Fechado', name: 'Fechado', color: 'green', probability: 100 },
                { id: 'Perdido', name: 'Perdido', color: 'red', probability: 0 },
            ],
            custom_fields: [],
        };
        setFunnels(prev => [...prev, funnel]);
        setNewFunnelName('');
        setNewFunnelColor('blue');
        setShowNewFunnel(false);
        setExpandedId(id);
    };

    const deleteFunnel = (id: string) => {
        if (funnels.length <= 1) return;
        setFunnels(prev => prev.filter(f => f.id !== id));
        if (expandedId === id) setExpandedId(funnels.find(f => f.id !== id)?.id ?? null);
    };

    const renameFunnel = (id: string, name: string) => {
        setFunnels(prev => prev.map(f => f.id === id ? { ...f, name } : f));
    };

    const moveStage = (funnelId: string, idx: number, dir: -1 | 1) => {
        setFunnels(prev => prev.map(f => {
            if (f.id !== funnelId) return f;
            const arr = [...f.stages];
            const target = idx + dir;
            if (target < 0 || target >= arr.length) return f;
            [arr[idx], arr[target]] = [arr[target], arr[idx]];
            return { ...f, stages: arr };
        }));
    };

    const deleteStage = (funnelId: string, stageId: string) => {
        setFunnels(prev => prev.map(f => {
            if (f.id !== funnelId || f.stages.length <= 1) return f;
            return { ...f, stages: f.stages.filter(s => s.id !== stageId) };
        }));
    };

    const updateStageProbability = (funnelId: string, stageId: string, probability: number | null) => {
        setFunnels(prev => prev.map(f => {
            if (f.id !== funnelId) return f;
            return {
                ...f,
                stages: f.stages.map(s => s.id === stageId ? { ...s, probability: probability ?? undefined } : s),
            };
        }));
    };

    const toggleStageVisibility = (funnelId: string, stageId: string) => {
        setFunnels(prev => prev.map(f => {
            if (f.id !== funnelId) return f;
            return {
                ...f,
                stages: f.stages.map(s => {
                    if (s.id !== stageId) return s;
                    return { ...s, is_qualification: !isQualificationStage(s) };
                }),
            };
        }));
    };

    // Rename é persistido imediatamente (no blur) porque precisa migrar `crm_leads.status`
    // dos leads que estão na etapa antiga. As demais alterações (probabilidade, visibilidade,
    // novos campos) seguem o fluxo do botão "Salvar funis".
    const [editingStageId, setEditingStageId] = useState<string | null>(null);
    const [stageDraft, setStageDraft] = useState('');
    const stageRenamingRef = useRef(false);

    const startEditStage = (stage: CRMStage) => {
        setEditingStageId(stage.id);
        setStageDraft(stage.name);
    };

    const cancelEditStage = () => {
        setEditingStageId(null);
        setStageDraft('');
    };

    // Renomeia só a etapa-alvo (por id) dentro do funil informado.
    const renameStageLocal = (funnelId: string, stageId: string, name: string) =>
        setFunnels(prev => prev.map(f =>
            f.id === funnelId
                ? { ...f, stages: f.stages.map(s => (s.id === stageId ? { ...s, name } : s)) }
                : f
        ));

    const commitStageRename = async (funnelId: string, stage: CRMStage) => {
        const next = stageDraft.trim();
        const prevName = stage.name;
        setEditingStageId(null);
        setStageDraft('');
        if (!next || next === prevName) return;

        // Conflito dentro do MESMO funil — feedback imediato, sem ida ao servidor.
        const funnel = funnels.find(f => f.id === funnelId);
        if (funnel?.stages.some(s => s.id !== stage.id && s.name === next)) {
            alert(`Já existe uma etapa chamada "${next}" neste funil.`);
            return;
        }

        // Evita disparos duplicados (Enter dispara blur)
        if (stageRenamingRef.current) return;
        stageRenamingRef.current = true;

        // Atualização otimista: a etapa aparece com o novo nome na hora; o servidor
        // (que migra crm_leads.status e grava a config) roda em segundo plano.
        renameStageLocal(funnelId, stage.id, next);
        try {
            const newConfig = await renameStage(funnelId, stage.id, next);
            onConfigSaved(newConfig);
        } catch (e) {
            // Reverte a renomeação otimista e avisa.
            renameStageLocal(funnelId, stage.id, prevName);
            const msg = e instanceof Error ? e.message : 'Erro ao renomear etapa.';
            alert(msg);
        } finally {
            stageRenamingRef.current = false;
        }
    };

    const addStage = (funnelId: string) => {
        const name = newStageName.trim();
        if (!name) return;
        setFunnels(prev => prev.map(f =>
            f.id === funnelId
                ? {
                    ...f,
                    stages: [...f.stages, {
                        id: `${name}_${Date.now()}`,
                        name,
                        color: newStageColor,
                        probability: newStageProbability === '' ? undefined : Number(newStageProbability),
                    }],
                }
                : f
        ));
        setNewStageName('');
        setNewStageColor('blue');
        setNewStageProbability('');
        setShowNewStage(false);
    };

    const updateMqlRule = (funnelId: string, patch: Partial<CRMMqlRule>) => {
        setFunnels(prev => prev.map(f =>
            f.id === funnelId ? { ...f, mql_rule: { ...f.mql_rule, ...patch } } : f
        ));
    };

    // Reavaliação dos leads do JMP (corrige MQL/telefone/funil dos já cadastrados).
    const [reavaliando, setReavaliando] = useState(false);
    const [reavaliouMsg, setReavaliouMsg] = useState<string | null>(null);

    const handleReavaliarJmp = async () => {
        setReavaliando(true);
        setReavaliouMsg(null);
        try {
            const { updated, total } = await reavaliarLeadsJmp();
            setReavaliouMsg(`${updated} de ${total} lead(s) do JMP atualizados.`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Erro ao reavaliar leads.';
            setReavaliouMsg(msg);
        } finally {
            setReavaliando(false);
        }
    };

    const deleteField = (funnelId: string, fieldId: string) => {
        setFunnels(prev => prev.map(f =>
            f.id === funnelId ? { ...f, custom_fields: f.custom_fields.filter(cf => cf.id !== fieldId) } : f
        ));
    };

    const addField = (funnelId: string) => {
        const label = newFieldLabel.trim();
        if (!label) return;
        const field: CRMCustomField = {
            id: `cf_${Date.now()}`,
            label,
            type: newFieldType,
            required: newFieldRequired,
            options: newFieldType === 'select'
                ? newFieldOptions.split(',').map(s => s.trim()).filter(Boolean)
                : undefined,
        };
        setFunnels(prev => prev.map(f =>
            f.id === funnelId ? { ...f, custom_fields: [...f.custom_fields, field] } : f
        ));
        setNewFieldLabel('');
        setNewFieldType('text');
        setNewFieldOptions('');
        setNewFieldRequired(false);
        setShowNewField(false);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const first = funnels[0];
            const config: CRMConfig = {
                stages: first?.stages ?? DEFAULT_STAGES,
                custom_fields: first?.custom_fields ?? [],
                funnels,
                responsaveis: initialConfig.responsaveis || [],
            };
            const savedConfig = await saveCRMConfig(config);
            onConfigSaved(savedConfig);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch {
            alert('Erro ao salvar funis. Tente novamente.');
        } finally {
            setIsSaving(false);
        }
    };

    const inputCls = 'px-3 py-2 text-sm bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-lg outline-none focus:ring-2 focus:ring-[#A68B4B] dark:text-white';
    const btnSecondary = 'flex items-center gap-1.5 text-sm px-3 py-1.5 bg-gray-100 dark:bg-[#3f3f3f] hover:bg-gray-200 dark:hover:bg-[#444] rounded-lg text-gray-700 dark:text-gray-300 transition-colors font-medium';
    const btnGold = 'flex items-center gap-1 px-3 py-2 bg-[#A68B4B] hover:bg-[#9A7209] text-black text-sm font-semibold rounded-lg transition-colors';
    const btnCancel = 'p-2 text-gray-400 hover:bg-gray-200 dark:hover:bg-[#3f3f3f] rounded-lg transition-colors';

    return (
        <div className="flex flex-col gap-6 max-w-3xl pb-8">
            <div className="bg-white dark:bg-[#1A1A1A] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-[#333] flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">Funil unificado</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Configure etapas, regra de MQL e campos personalizados do CRM</p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#A68B4B]/10 text-[#A68B4B]">
                        único
                    </span>
                </div>

                {false && showNewFunnel && (
                    <div className="px-6 py-4 bg-gray-50 dark:bg-[#141414] border-b border-gray-200 dark:border-[#333]">
                        <div className="flex gap-3 items-end flex-wrap">
                            <div className="flex-1 min-w-[160px]">
                                <label className="text-xs font-medium text-gray-500 mb-1 block">Nome do funil</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Pós-venda, Parceiros..."
                                    value={newFunnelName}
                                    onChange={e => setNewFunnelName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addFunnel()}
                                    className={`${inputCls} w-full`}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 mb-1 block">Cor</label>
                                <div className="flex gap-1.5 flex-wrap">
                                    {STAGE_COLORS.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => setNewFunnelColor(c.id)}
                                            title={c.label}
                                            className={`w-6 h-6 rounded-full ${c.dot} transition-transform ${newFunnelColor === c.id ? 'scale-125 ring-2 ring-offset-2 ring-[#A68B4B]' : 'hover:scale-110'}`}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={addFunnel} className={btnGold}>
                                    <Check size={14} /> Criar funil
                                </button>
                                <button onClick={() => { setShowNewFunnel(false); setNewFunnelName(''); }} className={btnCancel}>
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
                    {funnels.map((funnel, fi) => {
                        const isExpanded = expandedId === funnel.id;
                        return (
                            <div key={funnel.id}>
                                <div
                                    className="flex items-center gap-3 px-6 py-4 hover:bg-gray-50 dark:hover:bg-[#2e2e2e] group transition-colors cursor-pointer"
                                    onClick={() => toggleExpand(funnel.id)}
                                >
                                    <span className={`w-3 h-3 rounded-full shrink-0 ${getColorDot(funnel.color)}`} />
                                    <div className="flex-1 min-w-0">
                                        <input
                                            value={funnel.name}
                                            onChange={e => renameFunnel(funnel.id, e.target.value)}
                                            onClick={e => e.stopPropagation()}
                                            className="text-sm font-semibold text-gray-900 dark:text-white bg-transparent border-none outline-none focus:ring-2 focus:ring-[#A68B4B]/40 rounded px-1 -ml-1 w-full"
                                        />
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {funnel.stages.length} etapa{funnel.stages.length !== 1 ? 's' : ''}
                                            {funnel.custom_fields.length > 0 && ` · ${funnel.custom_fields.length} campo${funnel.custom_fields.length !== 1 ? 's' : ''} extra${funnel.custom_fields.length !== 1 ? 's' : ''}`}
                                            {fi === 0 && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-[#A68B4B]/10 text-[#A68B4B] font-semibold">principal</span>}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={() => deleteFunnel(funnel.id)}
                                            disabled={funnels.length <= 1}
                                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-400 disabled:opacity-25 transition-colors"
                                            title="Excluir funil"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                    <ChevronRight
                                        size={16}
                                        className={`text-gray-400 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                                    />
                                </div>

                                {isExpanded && (
                                    <div className="bg-gray-50 dark:bg-[#141414] border-t border-gray-100 dark:border-[#2A2A2A]">
                                        <div className="px-6 pt-4 pb-2">
                                            <div className="flex items-center justify-between mb-3">
                                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Etapas</p>
                                                <button
                                                    onClick={() => setShowNewStage(v => !v)}
                                                    className="flex items-center gap-1 text-xs px-2.5 py-1 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] hover:border-[#A68B4B] rounded-lg text-gray-600 dark:text-gray-300 transition-colors font-medium"
                                                >
                                                    <Plus size={11} /> Adicionar etapa
                                                </button>
                                            </div>

                                            {showNewStage && (
                                                <div className="mb-3 p-3 bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#333]">
                                                    <div className="flex gap-3 items-end flex-wrap">
                                                        <div className="flex-1 min-w-[140px]">
                                                            <label className="text-xs font-medium text-gray-500 mb-1 block">Nome</label>
                                                            <input
                                                                type="text"
                                                                placeholder="Nome da etapa"
                                                                value={newStageName}
                                                                onChange={e => setNewStageName(e.target.value)}
                                                                onKeyDown={e => e.key === 'Enter' && addStage(funnel.id)}
                                                                className={`${inputCls} w-full`}
                                                                autoFocus
                                                            />
                                                        </div>
                                                        <div className="w-28">
                                                            <label className="text-xs font-medium text-gray-500 mb-1 block">Prob. (%)</label>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={100}
                                                                placeholder="50"
                                                                value={newStageProbability}
                                                                onChange={e => setNewStageProbability(e.target.value === '' ? '' : Number(e.target.value))}
                                                                className={`${inputCls} w-full`}
                                                            />
                                                        </div>
                                                        <div className="flex gap-1.5 flex-wrap">
                                                            {STAGE_COLORS.map(c => (
                                                                <button
                                                                    key={c.id}
                                                                    type="button"
                                                                    onClick={() => setNewStageColor(c.id)}
                                                                    title={c.label}
                                                                    className={`w-5 h-5 rounded-full ${c.dot} transition-transform ${newStageColor === c.id ? 'scale-125 ring-2 ring-offset-1 ring-[#A68B4B]' : 'hover:scale-110'}`}
                                                                />
                                                            ))}
                                                        </div>
                                                        <div className="flex gap-1.5">
                                                            <button onClick={() => addStage(funnel.id)} className={btnGold}>
                                                                <Check size={13} /> Adicionar
                                                            </button>
                                                            <button onClick={() => { setShowNewStage(false); setNewStageName(''); setNewStageProbability(''); }} className={btnCancel}>
                                                                <X size={13} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <p className="text-[10px] text-gray-400 mb-2 leading-relaxed">
                                                Clique no nome da etapa para renomeá-la — leads existentes são migrados automaticamente. Use o botão à direita para escolher se a etapa aparece como coluna no <span className="font-semibold">CRM</span> ou só na fila de <span className="font-semibold">Entrada Leads</span>.
                                            </p>

                                            <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#333] divide-y divide-gray-100 dark:divide-[#2e2e2e] overflow-hidden">
                                                {funnel.stages.map((stage, idx) => {
                                                    const hidden = isQualificationStage(stage);
                                                    const isEditing = editingStageId === stage.id;
                                                    return (
                                                        <div
                                                            key={stage.id}
                                                            className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-[#2e2e2e] group/row transition-colors"
                                                        >
                                                            <GripVertical size={14} className="text-gray-300 dark:text-gray-600 shrink-0" />
                                                            {isEditing ? (
                                                                <input
                                                                    autoFocus
                                                                    value={stageDraft}
                                                                    onChange={e => setStageDraft(e.target.value)}
                                                                    onBlur={() => commitStageRename(funnel.id, stage)}
                                                                    onKeyDown={e => {
                                                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                                                        if (e.key === 'Escape') cancelEditStage();
                                                                    }}
                                                                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStageBadge(stage.color)} min-w-[100px] text-center outline-none focus:ring-2 focus:ring-[#A68B4B]/40`}
                                                                />
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => startEditStage(stage)}
                                                                    title="Clique para renomear"
                                                                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStageBadge(stage.color)} min-w-[100px] text-center cursor-text hover:opacity-80 transition-opacity`}
                                                                >
                                                                    {stage.name}
                                                                </button>
                                                            )}
                                                            <span className="text-xs text-gray-400">{idx + 1}ª</span>
                                                            <div className="flex items-center gap-1.5 ml-4">
                                                                <label className="text-xs text-gray-400">Prob.</label>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    max={100}
                                                                    value={stage.probability ?? ''}
                                                                    onChange={e => updateStageProbability(
                                                                        funnel.id,
                                                                        stage.id,
                                                                        e.target.value === '' ? null : Number(e.target.value)
                                                                    )}
                                                                    className="w-16 px-2 py-1 text-xs bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-[#333] rounded outline-none focus:ring-2 focus:ring-[#A68B4B]/40 dark:text-white"
                                                                    placeholder="—"
                                                                />
                                                                <span className="text-xs text-gray-400">%</span>
                                                            </div>
                                                            <button
                                                                onClick={() => toggleStageVisibility(funnel.id, stage.id)}
                                                                title={hidden ? 'Etapa só na fila de Entrada Leads. Clique para mostrar como coluna no CRM.' : 'Etapa visível como coluna no CRM. Clique para mover para a fila de Entrada Leads.'}
                                                                className={`flex items-center gap-1 ml-2 text-[10px] font-semibold px-2 py-1 rounded-md border transition-colors ${
                                                                    hidden
                                                                        ? 'border-gray-200 dark:border-[#333] bg-gray-50 dark:bg-[#141414] text-gray-500 dark:text-gray-400 hover:border-[#A68B4B]/40'
                                                                        : 'border-[#A68B4B]/40 bg-[#A68B4B]/10 text-[#A68B4B] hover:bg-[#A68B4B]/20'
                                                                }`}
                                                            >
                                                                {hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                                                                {hidden ? 'Entrada' : 'CRM'}
                                                            </button>
                                                            <div className="flex gap-0.5 ml-auto opacity-0 group-hover/row:opacity-100 transition-opacity">
                                                                <button onClick={() => moveStage(funnel.id, idx, -1)} disabled={idx === 0} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#3f3f3f] disabled:opacity-25 text-gray-500 transition-colors" title="Subir">
                                                                    <ChevronUp size={13} />
                                                                </button>
                                                                <button onClick={() => moveStage(funnel.id, idx, 1)} disabled={idx === funnel.stages.length - 1} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-[#3f3f3f] disabled:opacity-25 text-gray-500 transition-colors" title="Descer">
                                                                    <ChevronDown size={13} />
                                                                </button>
                                                                <button onClick={() => deleteStage(funnel.id, stage.id)} disabled={funnel.stages.length <= 1} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-400 disabled:opacity-25 transition-colors" title="Remover">
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="px-6 pt-3 pb-4 border-t border-gray-100 dark:border-[#2A2A2A]">
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Critério de MQL</p>
                                            <p className="text-[10px] text-gray-400 mb-3 leading-relaxed">
                                                Um lead deste funil vira <span className="font-semibold">MQL</span> (prioridade de atendimento) automaticamente quando tem no mínimo 100 cabeças e Inscrição Estadual.
                                            </p>
                                            <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#333] p-4 flex flex-wrap items-end gap-4">
                                                <div>
                                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Mínimo de cabeças</label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        placeholder="100"
                                                        value={100}
                                                        disabled
                                                        onChange={() => updateMqlRule(funnel.id, { min_cabecas: 100 })}
                                                        className={`${inputCls} w-32 opacity-70 cursor-not-allowed`}
                                                    />
                                                </div>
                                                <label className="flex items-center gap-2 pb-2.5 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        checked={funnel.mql_rule?.require_ie ?? true}
                                                        disabled
                                                        onChange={() => updateMqlRule(funnel.id, { require_ie: true })}
                                                        className="w-4 h-4 accent-[#A68B4B]"
                                                    />
                                                    <span className="text-sm text-gray-700 dark:text-gray-300">Inscrição Estadual obrigatória</span>
                                                </label>
                                            </div>

                                            {funnel.id === JMP_FUNNEL_ID && (
                                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={handleReavaliarJmp}
                                                        disabled={reavaliando}
                                                        className={`${btnSecondary} disabled:opacity-50`}
                                                        title="Recalcula MQL, copia telefone → celular e atribui o Funil JMP aos leads da landing já cadastrados."
                                                    >
                                                        {reavaliando ? 'Reavaliando…' : 'Reavaliar leads do JMP'}
                                                    </button>
                                                    {reavaliouMsg && (
                                                        <span className="text-xs text-gray-500 dark:text-gray-400">{reavaliouMsg}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="px-6 pt-3 pb-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Campos do formulário</p>
                                                <button
                                                    onClick={() => setShowNewField(v => !v)}
                                                    className="flex items-center gap-1 text-xs px-2.5 py-1 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] hover:border-[#A68B4B] rounded-lg text-gray-600 dark:text-gray-300 transition-colors font-medium"
                                                >
                                                    <Plus size={11} /> Adicionar campo
                                                </button>
                                            </div>

                                            {showNewField && (
                                                <div className="mb-3 p-3 bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#333]">
                                                    <div className="flex gap-3 items-end flex-wrap">
                                                        <div className="flex-1 min-w-[140px]">
                                                            <label className="text-xs font-medium text-gray-500 mb-1 block">Nome</label>
                                                            <input
                                                                type="text"
                                                                placeholder="Ex: Quantidade de hectares"
                                                                value={newFieldLabel}
                                                                onChange={e => setNewFieldLabel(e.target.value)}
                                                                className={`${inputCls} w-full`}
                                                                autoFocus
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs font-medium text-gray-500 mb-1 block">Tipo</label>
                                                            <select value={newFieldType} onChange={e => setNewFieldType(e.target.value as CRMCustomField['type'])} className={inputCls}>
                                                                {FIELD_TYPES.map(t => (
                                                                    <option key={t.id} value={t.id}>{t.label}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        {newFieldType === 'select' && (
                                                            <div className="flex-1 min-w-[160px]">
                                                                <label className="text-xs font-medium text-gray-500 mb-1 block">Opções (por vírgula)</label>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Opção A, Opção B"
                                                                    value={newFieldOptions}
                                                                    onChange={e => setNewFieldOptions(e.target.value)}
                                                                    className={`${inputCls} w-full`}
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-1.5 pb-0.5">
                                                            <input
                                                                id={`req-${funnel.id}`}
                                                                type="checkbox"
                                                                checked={newFieldRequired}
                                                                onChange={e => setNewFieldRequired(e.target.checked)}
                                                                className="w-4 h-4 accent-[#A68B4B]"
                                                            />
                                                            <label htmlFor={`req-${funnel.id}`} className="text-xs text-gray-500 cursor-pointer">Obrigatório</label>
                                                        </div>
                                                        <div className="flex gap-1.5">
                                                            <button onClick={() => addField(funnel.id)} className={btnGold}>
                                                                <Check size={13} /> Adicionar
                                                            </button>
                                                            <button onClick={() => { setShowNewField(false); setNewFieldLabel(''); }} className={btnCancel}>
                                                                <X size={13} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {funnel.custom_fields.length > 0 ? (
                                                <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#333] divide-y divide-gray-100 dark:divide-[#2e2e2e] overflow-hidden">
                                                    {funnel.custom_fields.map(field => (
                                                        <div key={field.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-[#2e2e2e] group/row transition-colors">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-medium text-gray-900 dark:text-white">{field.label}</span>
                                                                    {field.required && (
                                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400 font-semibold">obrigatório</span>
                                                                    )}
                                                                    <span className="text-xs text-gray-400">
                                                                        ({FIELD_TYPES.find(t => t.id === field.type)?.label || field.type})
                                                                    </span>
                                                                </div>
                                                                {field.options && field.options.length > 0 && (
                                                                    <div className="flex gap-1 mt-1 flex-wrap">
                                                                        {field.options.map(opt => (
                                                                            <span key={opt} className="px-1.5 py-0.5 bg-gray-100 dark:bg-[#3f3f3f] rounded text-xs text-gray-500">{opt}</span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <button onClick={() => deleteField(funnel.id, field.id)} className="opacity-0 group-hover/row:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-400 transition-all" title="Remover">
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-400 text-center py-4 bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-[#333]">
                                                    Nenhum campo extra. Clique em &quot;Adicionar campo&quot; para criar.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-lg disabled:opacity-50 ${
                        saved
                            ? 'bg-green-500 text-white shadow-green-500/20'
                            : 'bg-gradient-to-r from-[#A68B4B] to-[#C8A96E] hover:from-[#9A7209] hover:to-[#A68B4B] text-black shadow-[#A68B4B]/20'
                    }`}
                >
                    {saved ? (
                        <><Check size={16} /> Funis salvos!</>
                    ) : isSaving ? (
                        'Salvando...'
                    ) : (
                        <><Save size={16} /> Salvar funis</>
                    )}
                </button>
            </div>
        </div>
    );
}
