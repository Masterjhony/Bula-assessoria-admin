'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SettingsService } from '@/services/settingsService';
import {
    Loader2, Save, MessageCircle, Shield, ChevronRight, ExternalLink, Settings as SettingsIcon,
} from 'lucide-react';

export default function SettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [waGroupLink, setWaGroupLink] = useState('');
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const v = await SettingsService.getSetting('whatsapp_group_link');
                if (typeof v === 'string') setWaGroupLink(v);
                else if (v && typeof (v as { url?: string }).url === 'string') setWaGroupLink((v as { url: string }).url);
            } catch (e) {
                console.error('Failed to load settings', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    async function handleSave() {
        setSaving(true);
        setMessage(null);
        try {
            await SettingsService.updateSetting('whatsapp_group_link', waGroupLink.trim());
            setMessage({ type: 'success', text: 'Configurações salvas com sucesso.' });
        } catch {
            setMessage({ type: 'error', text: 'Erro ao salvar configurações.' });
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-brand-gold" />
            </div>
        );
    }

    const isValidUrl = !waGroupLink || /^https?:\/\//i.test(waGroupLink);

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Configurações Gerais</h1>
                    <p className="text-gray-500 dark:text-gray-400">
                        Ajustes operacionais que aparecem no site público e na landing page.
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving || !isValidUrl}
                    className="flex items-center gap-2 px-6 py-2.5 bg-brand-gold text-black font-bold rounded-lg hover:bg-yellow-500 transition-colors disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Salvar Alterações
                </button>
            </div>

            {message && (
                <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                    {message.text}
                </div>
            )}

            {/* ── Comunicação ──────────────────────────────────────────── */}
            <div className="bg-white dark:bg-[#212121] rounded-xl border border-gray-200 dark:border-[#2e2e2e] overflow-hidden mb-6">
                <div className="p-6 border-b border-gray-200 dark:border-[#2e2e2e]">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-brand-gold" />
                        Comunicação
                    </h2>
                </div>

                <div className="p-6 space-y-6">
                    <div className="p-4 bg-gray-50 dark:bg-[#161616] rounded-lg border border-gray-200 dark:border-[#3f3f3f]">
                        <label className="block">
                            <span className="block font-bold text-gray-900 dark:text-white mb-1">Link do grupo WhatsApp</span>
                            <span className="block text-sm text-gray-500 dark:text-gray-400 mb-3">
                                Aparece no botão de entrada da landing page (<code className="text-xs">/lp</code>) e no fluxo pós-cadastro.
                                Cole o link de convite atual do grupo.
                            </span>
                            <input
                                type="url"
                                value={waGroupLink}
                                onChange={(e) => setWaGroupLink(e.target.value)}
                                placeholder="https://chat.whatsapp.com/..."
                                className="w-full px-3 py-2.5 bg-white dark:bg-[#262626] border border-gray-300 dark:border-[#3f3f3f] rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold"
                            />
                            {!isValidUrl && (
                                <p className="mt-2 text-xs text-red-500">O link deve começar com http:// ou https://</p>
                            )}
                            {waGroupLink && isValidUrl && (
                                <a
                                    href={waGroupLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 inline-flex items-center gap-1 text-xs text-brand-gold hover:underline"
                                >
                                    Abrir link em nova aba <ExternalLink className="w-3 h-3" />
                                </a>
                            )}
                        </label>
                    </div>
                </div>
            </div>

            {/* ── Atalhos para outras configurações ──────────────────── */}
            <div className="bg-white dark:bg-[#212121] rounded-xl border border-gray-200 dark:border-[#2e2e2e] overflow-hidden">
                <div className="p-6 border-b border-gray-200 dark:border-[#2e2e2e]">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <SettingsIcon className="w-5 h-5 text-brand-gold" />
                        Outras áreas de configuração
                    </h2>
                </div>
                <div className="p-2">
                    <ShortcutLink
                        href="/whatsapp"
                        icon={<MessageCircle className="w-5 h-5" />}
                        title="Automação WhatsApp"
                        desc="Mensagem de boas-vindas, opções do menu interativo e timeout de resposta."
                    />
                    <ShortcutLink
                        href="/users"
                        icon={<Shield className="w-5 h-5" />}
                        title="Usuários & Permissões"
                        desc="Gerencie quem tem acesso ao painel administrativo."
                    />
                </div>
            </div>
        </div>
    );
}

function ShortcutLink({
    href, icon, title, desc,
}: { href: string; icon: React.ReactNode; title: string; desc: string }) {
    return (
        <Link
            href={href}
            className="flex items-center gap-4 p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-[#161616] transition-colors group"
        >
            <div className="w-10 h-10 rounded-lg bg-brand-gold/10 text-brand-gold flex items-center justify-center shrink-0">
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 dark:text-white">{title}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{desc}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-brand-gold transition-colors shrink-0" />
        </Link>
    );
}
