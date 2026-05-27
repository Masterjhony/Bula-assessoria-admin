'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Check, X, Users } from 'lucide-react';
import { saveCRMConfig } from '@/app/sistema/actions/crm-config';
import type { CRMConfig, CRMResponsavel } from '@/lib/crm-types';
import { DEFAULT_STAGES } from '@/lib/crm-types';
import { FunnelsEditor } from '@/components/admin/funil-vendas/FunnelsEditor';

interface CRMSettingsViewProps {
    initialConfig: CRMConfig;
    onConfigSaved: (config: CRMConfig) => void;
}

const STAGE_COLORS = [
    { id: 'pink', label: 'Rosa', dot: 'bg-pink-500' },
    { id: 'orange', label: 'Laranja', dot: 'bg-orange-500' },
    { id: 'blue', label: 'Azul', dot: 'bg-blue-500' },
    { id: 'purple', label: 'Roxo', dot: 'bg-purple-500' },
    { id: 'green', label: 'Verde', dot: 'bg-green-500' },
    { id: 'red', label: 'Vermelho', dot: 'bg-red-500' },
    { id: 'gray', label: 'Cinza', dot: 'bg-gray-500' },
    { id: 'yellow', label: 'Amarelo', dot: 'bg-yellow-500' },
    { id: 'teal', label: 'Teal', dot: 'bg-teal-500' },
    { id: 'indigo', label: 'Índigo', dot: 'bg-indigo-500' },
];

const getColorDot = (color?: string) => STAGE_COLORS.find(c => c.id === color)?.dot ?? 'bg-gray-400';

export function CRMSettingsView({ initialConfig, onConfigSaved }: CRMSettingsViewProps) {
    const [responsaveis, setResponsaveis] = useState<CRMResponsavel[]>(initialConfig.responsaveis || []);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const [showNewResp, setShowNewResp] = useState(false);
    const [newRespName, setNewRespName] = useState('');
    const [newRespEmail, setNewRespEmail] = useState('');
    const [newRespColor, setNewRespColor] = useState('blue');

    // Sincroniza responsáveis com a config atualizada quando o FunnelsEditor salvar
    // (ou quando a config for atualizada por outro caminho).
    useEffect(() => {
        setResponsaveis(initialConfig.responsaveis || []);
    }, [initialConfig.responsaveis]);

    const addResponsavel = () => {
        const name = newRespName.trim();
        if (!name) return;
        const r: CRMResponsavel = {
            id: `resp_${Date.now()}`,
            name,
            email: newRespEmail.trim() || undefined,
            color: newRespColor,
        };
        setResponsaveis(prev => [...prev, r]);
        setNewRespName('');
        setNewRespEmail('');
        setNewRespColor('blue');
        setShowNewResp(false);
    };

    const deleteResponsavel = (id: string) => {
        setResponsaveis(prev => prev.filter(r => r.id !== id));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Preserve funnels/stages/custom_fields managed elsewhere.
            const first = initialConfig.funnels?.[0];
            const config: CRMConfig = {
                stages: first?.stages ?? initialConfig.stages ?? DEFAULT_STAGES,
                custom_fields: first?.custom_fields ?? initialConfig.custom_fields ?? [],
                funnels: initialConfig.funnels || [],
                responsaveis,
            };
            await saveCRMConfig(config);
            onConfigSaved(config);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch {
            alert('Erro ao salvar configurações. Tente novamente.');
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
            <div className="flex items-center gap-2 text-xs text-gray-500">
                <Users size={14} />
                <span>Gerencie responsáveis, funis de venda, etapas e campos personalizados.</span>
            </div>

            <FunnelsEditor
                key={`fe-${initialConfig.funnels.length}-${initialConfig.funnels.map(f => f.stages.length).join('-')}`}
                initialConfig={initialConfig}
                onConfigSaved={onConfigSaved}
            />

            <div className="bg-white dark:bg-[#1A1A1A] rounded-2xl border border-gray-200 dark:border-[#2A2A2A] overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-[#333] flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">Responsáveis</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Gerencie quem pode ser atribuído aos leads</p>
                    </div>
                    <button onClick={() => setShowNewResp(v => !v)} className={btnSecondary}>
                        <Plus size={14} /> Adicionar
                    </button>
                </div>

                {showNewResp && (
                    <div className="px-6 py-4 bg-gray-50 dark:bg-[#141414] border-b border-gray-200 dark:border-[#333]">
                        <div className="flex gap-3 items-end flex-wrap">
                            <div className="flex-1 min-w-[140px]">
                                <label className="text-xs font-medium text-gray-500 mb-1 block">Nome</label>
                                <input
                                    type="text"
                                    placeholder="Ex: João Silva"
                                    value={newRespName}
                                    onChange={e => setNewRespName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addResponsavel()}
                                    className={`${inputCls} w-full`}
                                    autoFocus
                                />
                            </div>
                            <div className="flex-1 min-w-[160px]">
                                <label className="text-xs font-medium text-gray-500 mb-1 block">E-mail (opcional)</label>
                                <input
                                    type="email"
                                    placeholder="joao@empresa.com"
                                    value={newRespEmail}
                                    onChange={e => setNewRespEmail(e.target.value)}
                                    className={`${inputCls} w-full`}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 mb-1 block">Cor</label>
                                <div className="flex gap-1.5 flex-wrap">
                                    {STAGE_COLORS.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => setNewRespColor(c.id)}
                                            title={c.label}
                                            className={`w-6 h-6 rounded-full ${c.dot} transition-transform ${newRespColor === c.id ? 'scale-125 ring-2 ring-offset-2 ring-[#A68B4B]' : 'hover:scale-110'}`}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={addResponsavel} className={btnGold}>
                                    <Check size={14} /> Adicionar
                                </button>
                                <button onClick={() => { setShowNewResp(false); setNewRespName(''); setNewRespEmail(''); }} className={btnCancel}>
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {responsaveis.length > 0 ? (
                    <div className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
                        {responsaveis.map(r => (
                            <div key={r.id} className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 dark:hover:bg-[#2e2e2e] group transition-colors">
                                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${getColorDot(r.color)}`}>
                                    {r.name.charAt(0).toUpperCase()}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">{r.name}</p>
                                    {r.email && <p className="text-xs text-gray-400 truncate">{r.email}</p>}
                                </div>
                                <button
                                    onClick={() => deleteResponsavel(r.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-400 transition-all"
                                    title="Remover responsável"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="px-6 py-12 text-center text-gray-400 text-sm">
                        Nenhum responsável cadastrado. Clique em &quot;Adicionar&quot; para criar.
                    </div>
                )}
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
                        <><Check size={16} /> Salvos!</>
                    ) : isSaving ? (
                        'Salvando...'
                    ) : (
                        <><Save size={16} /> Salvar responsáveis</>
                    )}
                </button>
            </div>
        </div>
    );
}
