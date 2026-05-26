'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Users } from 'lucide-react';
import { TacticalMember, createMember, updateMember, deleteMember } from '@/app/sistema/actions/tactical-strategic';
import { TacticalTask } from '@/app/sistema/actions/tactical-tasks';

const AVATAR_COLORS = [
    '#A0792E', '#D4A85C', '#3B82F6', '#10B981', '#EF4444',
    '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#84CC16',
];

interface MembersViewProps {
    members: TacticalMember[];
    onMembersChange: (members: TacticalMember[]) => void;
    tasks: TacticalTask[];
}

export function MembersView({ members, onMembersChange, tasks }: MembersViewProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newRole, setNewRole] = useState('');
    const [newColor, setNewColor] = useState('#A0792E');
    const [isSaving, setIsSaving] = useState(false);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editRole, setEditRole] = useState('');
    const [editColor, setEditColor] = useState('');

    // Task count per member (by name match in assignees array)
    const taskCountByMember = (name: string) =>
        tasks.filter(t => t.assignees?.includes(name)).length;

    const openTasks = (name: string) =>
        tasks.filter(t => t.assignees?.includes(name) && t.status !== 'Completa' && t.status !== 'Concluído').length;

    const handleAdd = async () => {
        if (!newName.trim()) return;
        setIsSaving(true);
        try {
            const created = await createMember({ name: newName.trim(), role: newRole.trim() || undefined, avatar_color: newColor });
            onMembersChange([...members, created]);
            setNewName('');
            setNewRole('');
            setNewColor('#A0792E');
            setIsAdding(false);
        } catch (e) { console.error(e); }
        finally { setIsSaving(false); }
    };

    const startEdit = (m: TacticalMember) => {
        setEditingId(m.id);
        setEditName(m.name);
        setEditRole(m.role || '');
        setEditColor(m.avatar_color);
    };

    const handleUpdate = async (id: string) => {
        try {
            const updated = await updateMember(id, { name: editName.trim(), role: editRole.trim() || undefined, avatar_color: editColor });
            onMembersChange(members.map(m => m.id === id ? updated : m));
            setEditingId(null);
        } catch (e) { console.error(e); }
    };

    const handleDelete = async (member: TacticalMember) => {
        const count = taskCountByMember(member.name);
        const msg = count > 0
            ? `"${member.name}" está atribuído a ${count} tarefa(s). Ao excluir, ele sairá dessas tarefas automaticamente. Confirmar?`
            : `Excluir "${member.name}"?`;
        if (!window.confirm(msg)) return;
        await deleteMember(member.id);
        onMembersChange(members.filter(m => m.id !== member.id));
    };

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-4">
            {/* Header stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <StatCard label="Membros" value={members.length} />
                <StatCard label="Com tarefas abertas" value={members.filter(m => openTasks(m.name) > 0).length} />
                <StatCard label="Total de tarefas" value={tasks.length} />
                <StatCard label="Sem responsável" value={tasks.filter(t => !t.assignees?.length).length} />
            </div>

            {/* Member cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {members.map(member => {
                    const total = taskCountByMember(member.name);
                    const open = openTasks(member.name);
                    const isEditing = editingId === member.id;

                    return (
                        <div
                            key={member.id}
                            className="bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-2xl p-5 flex flex-col gap-4 hover:border-[#A0792E]/40 transition-colors"
                        >
                            {isEditing ? (
                                <div className="flex flex-col gap-3">
                                    {/* Color picker */}
                                    <div className="flex gap-1.5 flex-wrap">
                                        {AVATAR_COLORS.map(c => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setEditColor(c)}
                                                className={`w-5 h-5 rounded-full transition-transform ${editColor === c ? 'ring-2 ring-offset-1 ring-gray-900 dark:ring-white scale-110' : ''}`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                    <input
                                        autoFocus
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#3f3f3f] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#A0792E] text-gray-900 dark:text-white"
                                        placeholder="Nome"
                                    />
                                    <input
                                        value={editRole}
                                        onChange={e => setEditRole(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#3f3f3f] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#A0792E] text-gray-900 dark:text-white"
                                        placeholder="Função (ex: Dev, Growth)"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => handleUpdate(member.id)}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#A0792E] text-black rounded-lg text-sm font-bold hover:bg-[#D4A85C] transition-colors">
                                            <Check size={14} /> Salvar
                                        </button>
                                        <button onClick={() => setEditingId(null)}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-100 dark:bg-[#2e2e2e] text-gray-600 dark:text-gray-400 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-[#3f3f3f] transition-colors">
                                            <X size={14} /> Cancelar
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-black shrink-0 shadow-sm"
                                            style={{ backgroundColor: member.avatar_color }}
                                        >
                                            {member.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-gray-900 dark:text-white truncate">{member.name}</p>
                                            {member.role && (
                                                <p className="text-xs text-gray-400 truncate">{member.role}</p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button onClick={() => startEdit(member)}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-[#2e2e2e] text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">
                                                <Pencil size={13} />
                                            </button>
                                            <button onClick={() => handleDelete(member)}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 transition-colors">
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Task stats */}
                                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-[#2e2e2e]">
                                        <div className="flex-1 text-center">
                                            <p className="text-lg font-bold text-gray-900 dark:text-white">{open}</p>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider">em aberto</p>
                                        </div>
                                        <div className="w-px h-8 bg-gray-100 dark:bg-[#2e2e2e]" />
                                        <div className="flex-1 text-center">
                                            <p className="text-lg font-bold text-gray-900 dark:text-white">{total}</p>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider">total</p>
                                        </div>
                                        <div className="w-px h-8 bg-gray-100 dark:bg-[#2e2e2e]" />
                                        <div className="flex-1 text-center">
                                            <p className="text-lg font-bold text-[#A0792E]">
                                                {total > 0 ? Math.round(((total - open) / total) * 100) : 0}%
                                            </p>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider">concluído</p>
                                        </div>
                                    </div>

                                    {/* Mini task list preview */}
                                    {open > 0 && (
                                        <div className="flex flex-col gap-1">
                                            {tasks
                                                .filter(t => t.assignees?.includes(member.name) && t.status !== 'Completa' && t.status !== 'Concluído')
                                                .slice(0, 3)
                                                .map(t => (
                                                    <div key={t.id} className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.priority === 'Alta' ? 'bg-red-500' : t.priority === 'Média' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                                        <span className="truncate">{t.title}</span>
                                                    </div>
                                                ))}
                                            {open > 3 && (
                                                <p className="text-[10px] text-gray-400 pl-3.5">+{open - 3} mais...</p>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}

                {/* Add member card */}
                {isAdding ? (
                    <div className="bg-white dark:bg-[#262626] border border-[#A0792E]/40 rounded-2xl p-5 flex flex-col gap-3">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Novo membro</p>
                        {/* Color picker */}
                        <div className="flex gap-1.5 flex-wrap">
                            {AVATAR_COLORS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setNewColor(c)}
                                    className={`w-5 h-5 rounded-full transition-transform ${newColor === c ? 'ring-2 ring-offset-1 ring-gray-900 dark:ring-white scale-110' : ''}`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                        <input
                            autoFocus
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); else if (e.key === 'Escape') setIsAdding(false); }}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#3f3f3f] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#A0792E] text-gray-900 dark:text-white"
                            placeholder="Nome *"
                        />
                        <input
                            value={newRole}
                            onChange={e => setNewRole(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                            className="w-full px-3 py-2 bg-gray-50 dark:bg-[#1d1d1d] border border-gray-200 dark:border-[#3f3f3f] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#A0792E] text-gray-900 dark:text-white"
                            placeholder="Função (opcional)"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={handleAdd}
                                disabled={!newName.trim() || isSaving}
                                className="flex-1 py-2 bg-[#A0792E] text-black rounded-lg text-sm font-bold hover:bg-[#D4A85C] disabled:opacity-50 transition-colors"
                            >
                                {isSaving ? 'Salvando...' : 'Adicionar'}
                            </button>
                            <button
                                onClick={() => { setIsAdding(false); setNewName(''); setNewRole(''); }}
                                className="flex-1 py-2 bg-gray-100 dark:bg-[#2e2e2e] text-gray-600 dark:text-gray-400 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-[#3f3f3f] transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="border-2 border-dashed border-gray-200 dark:border-[#2e2e2e] rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-[#A0792E]/50 hover:text-[#A0792E] transition-colors min-h-[120px]"
                    >
                        <Plus size={20} />
                        <span className="text-sm font-medium">Adicionar membro</span>
                    </button>
                )}
            </div>

            {/* Empty state */}
            {members.length === 0 && !isAdding && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <Users size={40} className="mb-3 opacity-30" />
                    <p className="font-medium">Nenhum membro cadastrado</p>
                    <p className="text-sm mt-1">Adicione membros para atribuir responsáveis nas tarefas</p>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: number }) {
    return (
        <div className="bg-white dark:bg-[#262626] border border-gray-200 dark:border-[#2e2e2e] rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            <p className="text-xs text-gray-400 mt-1">{label}</p>
        </div>
    );
}
