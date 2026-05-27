'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
    Loader2,
    Shield,
    User,
    Search,
    MoreVertical,
    KeyRound,
    Trash2,
    ShieldOff,
} from 'lucide-react';

interface Profile {
    id: string;
    email: string;
    full_name?: string | null;
    role: 'admin' | 'user';
    created_at: string;
}

type Toast = { kind: 'success' | 'error'; message: string } | null;

export default function UsersPage() {
    const [users, setUsers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const [toast, setToast] = useState<Toast>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        fetchUsers();
        supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
    }, []);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
    }, [toast]);

    useEffect(() => {
        function handleClick() { setOpenMenu(null); }
        if (openMenu) {
            document.addEventListener('click', handleClick);
            return () => document.removeEventListener('click', handleClick);
        }
    }, [openMenu]);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) setUsers(data as Profile[]);
        } catch (error) {
            console.error('Error fetching users:', error);
            setToast({ kind: 'error', message: 'Erro ao carregar usuários.' });
        } finally {
            setLoading(false);
        }
    };

    const handleRoleUpdate = async (userId: string, newRole: 'admin' | 'user') => {
        if (!confirm(`Alterar o nível deste usuário para ${newRole.toUpperCase()}?`)) return;
        setBusyId(userId);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole })
                .eq('id', userId);
            if (error) throw error;
            setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
            setToast({ kind: 'success', message: `Permissão atualizada para ${newRole.toUpperCase()}.` });
        } catch (error) {
            console.error('Error updating role:', error);
            setToast({ kind: 'error', message: 'Erro ao atualizar permissão.' });
        } finally {
            setBusyId(null);
        }
    };

    const handleResetPassword = async (user: Profile) => {
        if (!confirm(`Enviar link de redefinição de senha para ${user.email}?`)) return;
        setBusyId(user.id);
        try {
            const res = await fetch(`/api/admin/users/${user.id}/reset-password`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Falha ao enviar email.');
            setToast({ kind: 'success', message: `Email enviado para ${user.email}.` });
        } catch (err: any) {
            setToast({ kind: 'error', message: err.message });
        } finally {
            setBusyId(null);
        }
    };

    const handleDelete = async (user: Profile) => {
        const confirmText = `EXCLUIR ${user.email}`;
        const typed = prompt(
            `Esta ação é PERMANENTE.\nDigite "${confirmText}" para confirmar a exclusão da conta:`
        );
        if (typed !== confirmText) {
            if (typed !== null) setToast({ kind: 'error', message: 'Confirmação inválida. Exclusão cancelada.' });
            return;
        }
        setBusyId(user.id);
        try {
            const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'Falha ao excluir.');
            setUsers(users.filter(u => u.id !== user.id));
            setToast({ kind: 'success', message: `${user.email} excluído.` });
        } catch (err: any) {
            setToast({ kind: 'error', message: err.message });
        } finally {
            setBusyId(null);
        }
    };

    const filteredUsers = users.filter(user =>
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.role.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 relative">
            {toast && (
                <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium ${
                    toast.kind === 'success'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-red-600 text-white'
                }`}>
                    {toast.message}
                </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Usuários do Sistema</h1>
                    <p className="text-gray-500 dark:text-gray-400">Gerencie os usuários e suas permissões de acesso.</p>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Buscar por email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-[#C8A96E] w-full md:w-64"
                    />
                </div>
            </div>

            <div className="bg-white dark:bg-[#1A1A1A] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-visible">
                <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#141414] font-medium text-gray-500 dark:text-gray-400 grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center">
                    <div>Email / ID</div>
                    <div className="text-center w-32">Data Cadastro</div>
                    <div className="text-center w-24">Função</div>
                    <div className="text-right w-32">Ações</div>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-gray-500">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                        Carregando usuários...
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        Nenhum usuário encontrado.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {filteredUsers.map((user) => {
                            const isSelf = user.id === currentUserId;
                            const isBusy = busyId === user.id;
                            const isMenuOpen = openMenu === user.id;
                            return (
                                <div key={user.id} className="p-4 grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center hover:bg-gray-50 dark:hover:bg-[#141414] transition-colors">
                                    <div className="space-y-1 overflow-hidden">
                                        <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2 truncate" title={user.email}>
                                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 text-gray-500 dark:text-gray-400">
                                                <User className="w-4 h-4" />
                                            </div>
                                            <span className="truncate">{user.email || 'Sem email'}</span>
                                            {isSelf && (
                                                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">Você</span>
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-400 pl-10 truncate font-mono">ID: {user.id}</div>
                                    </div>

                                    <div className="text-center text-sm text-gray-600 dark:text-gray-400 w-32">
                                        {new Date(user.created_at).toLocaleDateString('pt-BR')}
                                    </div>

                                    <div className="flex justify-center w-24">
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1
                                            ${user.role === 'admin'
                                                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                                : 'bg-blue-50 text-blue-600 border border-blue-100'
                                            }`}>
                                            {user.role === 'admin' && <Shield className="w-3 h-3" />}
                                            {user.role === 'admin' ? 'ADMIN' : 'USER'}
                                        </span>
                                    </div>

                                    <div className="text-right w-32 flex justify-end items-center gap-2 relative">
                                        {isBusy ? (
                                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                                        ) : (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenMenu(isMenuOpen ? null : user.id);
                                                }}
                                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                aria-label="Ações"
                                            >
                                                <MoreVertical className="w-4 h-4 text-gray-500" />
                                            </button>
                                        )}

                                        {isMenuOpen && (
                                            <div
                                                className="absolute top-full right-0 mt-1 w-56 bg-white dark:bg-[#222] border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-30 overflow-hidden"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {user.role === 'user' ? (
                                                    <MenuItem
                                                        icon={<Shield className="w-4 h-4 text-purple-600" />}
                                                        label="Tornar Admin"
                                                        onClick={() => { setOpenMenu(null); handleRoleUpdate(user.id, 'admin'); }}
                                                    />
                                                ) : (
                                                    <MenuItem
                                                        icon={<ShieldOff className="w-4 h-4 text-gray-500" />}
                                                        label="Remover Admin"
                                                        onClick={() => { setOpenMenu(null); handleRoleUpdate(user.id, 'user'); }}
                                                        disabled={isSelf}
                                                        disabledReason="Não é possível remover o próprio admin"
                                                    />
                                                )}
                                                <MenuItem
                                                    icon={<KeyRound className="w-4 h-4 text-amber-600" />}
                                                    label="Redefinir senha"
                                                    sublabel="Envia link por email"
                                                    onClick={() => { setOpenMenu(null); handleResetPassword(user); }}
                                                />
                                                <div className="border-t border-gray-200 dark:border-gray-700" />
                                                <MenuItem
                                                    icon={<Trash2 className="w-4 h-4 text-red-600" />}
                                                    label="Excluir usuário"
                                                    sublabel="Ação permanente"
                                                    danger
                                                    onClick={() => { setOpenMenu(null); handleDelete(user); }}
                                                    disabled={isSelf}
                                                    disabledReason="Não é possível excluir a própria conta"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function MenuItem({
    icon,
    label,
    sublabel,
    onClick,
    danger,
    disabled,
    disabledReason,
}: {
    icon: React.ReactNode;
    label: string;
    sublabel?: string;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
    disabledReason?: string;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={disabled ? disabledReason : undefined}
            className={`w-full flex items-start gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : danger
                        ? 'text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
        >
            <span className="mt-0.5">{icon}</span>
            <span className="flex-1">
                <span className="block font-medium">{label}</span>
                {sublabel && <span className="block text-xs text-gray-500 dark:text-gray-400">{sublabel}</span>}
            </span>
        </button>
    );
}
