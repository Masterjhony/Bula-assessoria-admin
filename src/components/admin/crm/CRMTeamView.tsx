'use client';

import { useEffect, useState } from 'react';
import { Check, Plus, Save, Trash2, UserRound, X } from 'lucide-react';
import { saveCRMConfig } from '@/app/sistema/actions/crm-config';
import type { CRMConfig, CRMResponsavel } from '@/lib/crm-types';

interface CRMTeamViewProps {
    initialConfig: CRMConfig;
    onConfigSaved: (config: CRMConfig) => void;
}

const COLORS = [
    { id: 'blue', label: 'Azul', dot: 'bg-blue-500' },
    { id: 'green', label: 'Verde', dot: 'bg-green-500' },
    { id: 'yellow', label: 'Amarelo', dot: 'bg-yellow-500' },
    { id: 'purple', label: 'Roxo', dot: 'bg-purple-500' },
    { id: 'pink', label: 'Rosa', dot: 'bg-pink-500' },
    { id: 'orange', label: 'Laranja', dot: 'bg-orange-500' },
    { id: 'gray', label: 'Cinza', dot: 'bg-gray-500' },
];

function colorDot(color?: string) {
    return COLORS.find(c => c.id === color)?.dot ?? 'bg-gray-500';
}

function newUser(): CRMResponsavel {
    return {
        id: `user_${Date.now()}`,
        name: '',
        email: '',
        whatsapp: '',
        role: '',
        color: 'blue',
        active: true,
    };
}

export function CRMTeamView({ initialConfig, onConfigSaved }: CRMTeamViewProps) {
    const [users, setUsers] = useState<CRMResponsavel[]>(initialConfig.responsaveis || []);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setUsers(initialConfig.responsaveis || []);
    }, [initialConfig.responsaveis]);

    const updateUser = (id: string, patch: Partial<CRMResponsavel>) => {
        setUsers(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u));
    };

    const addUser = () => setUsers(prev => [...prev, newUser()]);
    const removeUser = (id: string) => setUsers(prev => prev.filter(u => u.id !== id));

    const handleSave = async () => {
        const clean = users
            .map(u => ({
                ...u,
                name: u.name.trim(),
                email: u.email?.trim() || undefined,
                whatsapp: u.whatsapp?.trim() || undefined,
                role: u.role?.trim() || undefined,
                color: u.color || 'blue',
                active: u.active !== false,
            }))
            .filter(u => u.name);

        setIsSaving(true);
        try {
            const config = { ...initialConfig, responsaveis: clean };
            await saveCRMConfig(config);
            onConfigSaved(config);
            setSaved(true);
            setTimeout(() => setSaved(false), 2200);
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Erro ao salvar equipe.');
        } finally {
            setIsSaving(false);
        }
    };

    const inputCls = 'w-full px-3 py-2 text-sm bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#333] rounded-lg outline-none focus:ring-2 focus:ring-[#A68B4B] dark:text-white';

    return (
        <div className="max-w-5xl space-y-4 pb-8">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <UserRound size={14} />
                    <span>Usuários usados no CRM e nos encaminhamentos por WhatsApp.</span>
                </div>
                <button onClick={addUser} className="btn ghost">
                    <Plus size={14} /> Usuário
                </button>
            </div>

            <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A] rounded-xl overflow-hidden">
                <div className="grid grid-cols-[44px_1.1fr_1fr_1fr_0.8fr_0.8fr_44px] gap-2 px-4 py-3 border-b border-gray-200 dark:border-[#333] text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    <span />
                    <span>Nome</span>
                    <span>WhatsApp</span>
                    <span>E-mail</span>
                    <span>Cargo</span>
                    <span>Status</span>
                    <span />
                </div>

                {users.length === 0 ? (
                    <div className="px-6 py-12 text-center text-sm text-gray-400">
                        Nenhum usuário cadastrado.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
                        {users.map(user => (
                            <div key={user.id} className="grid grid-cols-[44px_1.1fr_1fr_1fr_0.8fr_0.8fr_44px] gap-2 px-4 py-3 items-center">
                                <div className={`w-8 h-8 rounded-lg ${colorDot(user.color)} text-white text-xs font-bold flex items-center justify-center`}>
                                    {(user.name || '?').charAt(0).toUpperCase()}
                                </div>
                                <input
                                    value={user.name}
                                    onChange={e => updateUser(user.id, { name: e.target.value })}
                                    className={inputCls}
                                    placeholder="Nome"
                                />
                                <input
                                    value={user.whatsapp || ''}
                                    onChange={e => updateUser(user.id, { whatsapp: e.target.value })}
                                    className={inputCls}
                                    placeholder="55 34 99999-9999"
                                />
                                <input
                                    value={user.email || ''}
                                    onChange={e => updateUser(user.id, { email: e.target.value })}
                                    className={inputCls}
                                    placeholder="email@empresa.com"
                                />
                                <input
                                    value={user.role || ''}
                                    onChange={e => updateUser(user.id, { role: e.target.value })}
                                    className={inputCls}
                                    placeholder="Assessor"
                                />
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => updateUser(user.id, { active: user.active === false })}
                                        className={`relative w-10 h-6 rounded-full p-0.5 transition-colors ${
                                            user.active === false ? 'bg-gray-300 dark:bg-[#3f3f3f]' : 'bg-[#A68B4B]'
                                        }`}
                                        title={user.active === false ? 'Inativo' : 'Ativo'}
                                    >
                                        <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${user.active === false ? '' : 'translate-x-4'}`} />
                                    </button>
                                    <select
                                        value={user.color || 'blue'}
                                        onChange={e => updateUser(user.id, { color: e.target.value })}
                                        className="px-2 py-2 text-sm bg-white dark:bg-[#141414] border border-gray-200 dark:border-[#333] rounded-lg dark:text-white"
                                    >
                                        {COLORS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </div>
                                <button
                                    onClick={() => removeUser(user.id)}
                                    className="p-2 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                                    title="Remover usuário"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-2">
                {users.some(u => !u.name.trim()) && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                        <X size={13} /> Usuários sem nome serão ignorados.
                    </span>
                )}
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className={`btn primary ${saved ? '!bg-green-500 !text-white' : ''}`}
                >
                    {saved ? <Check size={14} /> : <Save size={14} />}
                    {saved ? 'Salvo' : isSaving ? 'Salvando...' : 'Salvar equipe'}
                </button>
            </div>
        </div>
    );
}
