'use client';

import { useState } from 'react';
import { CRMLead, CRMContactEntry, recordContact, deleteContact } from '@/app/sistema/actions/crm-leads';
import { Phone, MessageSquare, Mail, MapPin, Plus, Trash2, Loader2, MessageCircle } from 'lucide-react';

interface CRMContactsHistoryProps {
    lead: CRMLead;
    onUpdated: (lead: CRMLead) => void;
}

const TYPE_OPTIONS: { value: CRMContactEntry['type']; label: string; icon: typeof Phone; color: string }[] = [
    { value: 'ligacao', label: 'Ligação', icon: Phone, color: 'text-blue-500' },
    { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-green-500' },
    { value: 'email', label: 'E-mail', icon: Mail, color: 'text-purple-500' },
    { value: 'visita', label: 'Visita', icon: MapPin, color: 'text-orange-500' },
    { value: 'outro', label: 'Outro', icon: MessageSquare, color: 'text-gray-500' },
];

const TYPE_META = Object.fromEntries(TYPE_OPTIONS.map(o => [o.value, o]));

function fmtDateTime(iso: string) {
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function CRMContactsHistory({ lead, onUpdated }: CRMContactsHistoryProps) {
    const [adding, setAdding] = useState(false);
    const [type, setType] = useState<CRMContactEntry['type']>('whatsapp');
    const [notes, setNotes] = useState('');
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16));
    const [saving, setSaving] = useState(false);
    const [removingId, setRemovingId] = useState<string | null>(null);

    const history = Array.isArray(lead.contact_history) ? lead.contact_history : [];

    const handleAdd = async () => {
        setSaving(true);
        try {
            const updated = await recordContact(lead.id, {
                type,
                date: new Date(date).toISOString(),
                notes: notes.trim() || null,
                by: lead.responsavel || null,
            });
            onUpdated(updated);
            setAdding(false);
            setNotes('');
            setDate(new Date().toISOString().slice(0, 16));
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async (entry: CRMContactEntry) => {
        if (!window.confirm('Remover este contato do histórico?')) return;
        setRemovingId(entry.id);
        try {
            const updated = await deleteContact(lead.id, entry.id);
            onUpdated(updated);
        } finally {
            setRemovingId(null);
        }
    };

    return (
        <div className="border border-gray-200 dark:border-[#3f3f3f] rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-[#262626] border-b border-gray-200 dark:border-[#3f3f3f] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">📞 Histórico de contatos</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#A0792E] bg-[#A0792E]/10 px-2 py-0.5 rounded-full">
                        {history.length} contato{history.length !== 1 ? 's' : ''}
                    </span>
                </div>
                {!adding && (
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-[#A0792E] hover:bg-[#A0792E]/10 transition-colors"
                    >
                        <Plus size={12} /> Registrar contato
                    </button>
                )}
            </div>

            {adding && (
                <div className="p-4 space-y-3 border-b border-gray-200 dark:border-[#3f3f3f] bg-[#A0792E]/5">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
                            <select
                                value={type}
                                onChange={e => setType(e.target.value as CRMContactEntry['type'])}
                                className="w-full bg-white dark:bg-[#1B1B1B] border border-gray-200 dark:border-[#3f3f3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#A0792E]"
                            >
                                {TYPE_OPTIONS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Data / hora</label>
                            <input
                                type="datetime-local"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="w-full bg-white dark:bg-[#1B1B1B] border border-gray-200 dark:border-[#3f3f3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#A0792E]"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Observação</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={2}
                            placeholder="O que foi discutido, próximos passos…"
                            className="w-full bg-white dark:bg-[#1B1B1B] border border-gray-200 dark:border-[#3f3f3f] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#A0792E] resize-none"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => { setAdding(false); setNotes(''); }}
                            className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2e2e2e] rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleAdd}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#A0792E] text-black text-xs font-bold rounded-lg hover:bg-[#D4A85C] transition-colors disabled:opacity-50"
                        >
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                            Salvar contato
                        </button>
                    </div>
                </div>
            )}

            <div className="max-h-64 overflow-y-auto">
                {history.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-gray-400">
                        Nenhum contato registrado ainda.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
                        {history.map(entry => {
                            const meta = TYPE_META[entry.type] ?? TYPE_META.outro;
                            const Icon = meta.icon;
                            return (
                                <div key={entry.id} className="px-4 py-2.5 flex items-start gap-2.5 group hover:bg-gray-50 dark:hover:bg-[#262626]">
                                    <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-[#2e2e2e] flex items-center justify-center flex-shrink-0">
                                        <Icon size={13} className={meta.color} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{meta.label}</p>
                                            <span className="text-[10px] text-gray-400">{fmtDateTime(entry.date)}</span>
                                        </div>
                                        {entry.notes && (
                                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">{entry.notes}</p>
                                        )}
                                        {entry.by && (
                                            <p className="text-[10px] text-gray-400 mt-0.5">por {entry.by}</p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRemove(entry)}
                                        disabled={removingId === entry.id}
                                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all flex-shrink-0"
                                        title="Remover"
                                    >
                                        {removingId === entry.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
