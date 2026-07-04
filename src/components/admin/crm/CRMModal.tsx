'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Save, Trash2, Trophy, ChevronDown, ChevronUp, Crown, User, TrendingUp, Phone, Target, SlidersHorizontal, BarChart3, MessageCircle, FileText, History, Loader2, Beef, Gauge, Thermometer, Send, MapPin, ClipboardCheck, type LucideIcon } from 'lucide-react';
import { CRMLead, deleteLead, marcarLeadGanho, listLeadDocumentos } from '@/app/sistema/actions/crm-leads';
import { computeHabilitacaoChecklist } from '@/lib/crm-habilitacao';
import { CRM_COLUMNS } from './CRMKanbanBoard';
import type { CRMCustomField, CRMFunnel, CRMResponsavel } from '@/lib/crm-types';
import { CRM_STAGE_CONNECTION, evaluateMql } from '@/lib/crm-types';
import { CRMContactsHistory } from './CRMContactsHistory';
import { CRMConversationDrawer } from './CRMConversationDrawer';
import { CRMLeadDocumentos } from './CRMLeadDocumentos';

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

type DrawerTab = 'dados' | 'whatsapp' | 'documentos' | 'historico';

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

/* ───────────────────────── WhatsApp: registros inline ───────────────────────── */

interface WaMsg {
    id: string;
    body: string | null;
    direction: 'inbound' | 'outbound';
    status: string;
    channel?: string | null;
    origin: string | null;
    created_at: string;
    media_type?: string | null;
    media_filename?: string | null;
}

const WA_MEDIA_LABEL: Record<string, string> = {
    audio: '🎤 Áudio',
    image: '📷 Imagem',
    video: '🎬 Vídeo',
    document: '📄 Documento',
    sticker: '💟 Figurinha',
};

function waMessageText(m: WaMsg): string {
    if (m.body && m.body.trim()) return m.body.trim();
    if (m.media_type) return `${WA_MEDIA_LABEL[m.media_type] ?? '📎 Mídia'}${m.media_filename ? ` — ${m.media_filename}` : ''}`;
    return '(sem texto)';
}

function fmtWhen(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Mostra os registros das mensagens de WhatsApp do lead (mesma fonte do cockpit
 * /sistema/crm?view=whatsapp), em estilo de conversa, somente leitura. Para
 * responder, o botão abre o drawer completo de conversa.
 */
function WhatsappRecords({ phone, onReply }: { phone: string; onReply: () => void }) {
    const [messages, setMessages] = useState<WaMsg[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/whatsapp/central/thread/${encodeURIComponent(phone)}`, { cache: 'no-store' });
                if (res.ok && !cancelled) {
                    const d = await res.json();
                    setMessages(d.messages ?? []);
                }
            } catch {
                if (!cancelled) setMessages([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [phone]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [messages]);

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                    <MessageCircle size={15} className="text-green-500 shrink-0" />
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Conversa de WhatsApp</span>
                    {!loading && messages.length > 0 && (
                        <span className="text-[11px] text-gray-400">· {messages.length} mensage{messages.length > 1 ? 'ns' : 'm'}</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onReply}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-green-600 dark:text-green-400 bg-green-500/10 hover:bg-green-500/20 transition-colors shrink-0"
                    title="Abrir conversa para responder"
                >
                    <Send size={13} /> Responder
                </button>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 min-h-[280px] overflow-y-auto rounded-xl border border-gray-200 dark:border-[#2A2A2A] bg-gray-50 dark:bg-[#0e0e0e] px-3 py-3 space-y-2"
            >
                {loading ? (
                    <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#A68B4B]" size={22} /></div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 text-center">
                        <MessageCircle size={26} className="text-gray-300 dark:text-[#333]" />
                        <p className="text-[12px] mt-3 text-gray-400">Nenhuma mensagem registrada no WhatsApp.</p>
                        <button type="button" onClick={onReply} className="mt-3 text-[12px] font-semibold text-green-600 dark:text-green-400 hover:underline">
                            Iniciar conversa
                        </button>
                    </div>
                ) : (
                    messages.map(m => {
                        const out = m.direction === 'outbound';
                        const failed = m.status === 'failed' || m.status === 'held' || m.status === 'blocked';
                        return (
                            <div key={m.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs ${
                                    out
                                        ? failed ? 'bg-red-500/15 text-red-700 dark:text-red-300 rounded-br-sm' : 'bg-[#A68B4B]/20 text-gray-800 dark:text-gray-100 rounded-br-sm'
                                        : 'bg-white dark:bg-[#1f1f1f] text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-[#333] rounded-bl-sm'
                                }`}>
                                    <p className="whitespace-pre-wrap break-words">{waMessageText(m)}</p>
                                    <div className="flex items-center gap-1 mt-1 opacity-60">
                                        <span className="text-[9px]">{out ? 'Enviada' : 'Recebida'} · {fmtWhen(m.created_at)}</span>
                                        {out && m.channel && <span className="text-[9px] uppercase">· {m.channel}</span>}
                                        {failed && <span className="text-[9px] uppercase font-bold">· {m.status}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

/* ───────────────────────────────── Drawer ───────────────────────────────── */

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
        tem_inscricao_estadual: '',
        score_serasa: null,
        pendencias_financeiras: '',
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
    const [isGanhando, setIsGanhando] = useState(false);
    const [showOrigemSection, setShowOrigemSection] = useState(false);
    const [showWhatsapp, setShowWhatsapp] = useState(false);
    const [tab, setTab] = useState<DrawerTab>('dados');

    // Documentos do lead (contagem/tipos) — alimentam o checklist de habilitação.
    const [docsInfo, setDocsInfo] = useState<{ count: number; tipos: string[] }>({ count: 0, tipos: [] });
    useEffect(() => {
        let active = true;
        if (lead?.id && isOpen) {
            listLeadDocumentos(lead.id)
                .then(d => { if (active) setDocsInfo({ count: d.length, tipos: d.map(x => x.tipo || 'outro') }); })
                .catch(() => { if (active) setDocsInfo({ count: 0, tipos: [] }); });
        } else {
            setDocsInfo({ count: 0, tipos: [] });
        }
        return () => { active = false; };
    }, [lead?.id, isOpen]);

    // Telefone do lead para a conversa (celular é o principal; telefone é o
    // fallback de integrações como a landing JMP).
    const waPhone = (lead?.celular || lead?.telefone || formData.celular || '').trim();

    // Checklist de habilitação calculado AO VIVO dos dados do card — o que o
    // formulário de entrada capturou já conta antes de a IA atender; a IA e o
    // humano vão completando os buracos (mesma régua de src/lib/crm-habilitacao).
    const xdata = (formData.extra_data ?? {}) as Record<string, any>;
    const setXd = (key: string, value: string) =>
        setFormData({ ...formData, extra_data: { ...(formData.extra_data ?? {}), [key]: value } });
    const habChecklist = computeHabilitacaoChecklist({
        nome: formData.nome,
        cpf: formData.cpf,
        telefone: (formData as any).telefone ?? lead?.telefone,
        celular: formData.celular,
        email: (formData as any).email,
        inscricao_estadual: formData.inscricao_estadual,
        tem_inscricao_estadual: formData.tem_inscricao_estadual,
        extra_data: xdata,
        docsCount: docsInfo.count,
        docTipos: docsInfo.tipos,
    });

    // Regra de MQL do funil deste lead (cabeças + IE). Default: 'default'.
    const mqlRule = funnels.find(f => f.id === (formData.funnel_id || 'default'))?.mql_rule;
    const requireIe = mqlRule?.require_ie ?? true;
    const minCabecas = mqlRule?.min_cabecas ?? 100;

    const calculateMql = (patch: Partial<CRMLead> = {}) => {
        const next = { ...formData, ...patch };
        return evaluateMql(mqlRule, {
            quantidade_animais: next.quantidade_animais,
            tem_inscricao_estadual: next.tem_inscricao_estadual,
            inscricao_estadual: next.inscricao_estadual,
        });
    };

    useEffect(() => {
        setTab('dados');
        if (lead) {
            // `celular` é o contato principal do CRM. Leads vindos de integrações
            // (ex.: landing JMP) gravam o número em `telefone` — sem este fallback
            // o campo "puxa" vazio ao abrir o lead.
            setFormData({ ...lead, celular: lead.celular || lead.telefone || '' });
            // Auto-expand origem section if lead has source data OR dados de rastreio
            // da planilha (lead_id/ad-id/data) que hoje ficam presos no extra_data.
            if (lead.source || lead.medium || lead.campaign
                || lead.extra_data?.utm?.ad_id
                || lead.extra_data?.sheet_validation_import) {
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
                tem_inscricao_estadual: '',
                score_serasa: null,
                pendencias_financeiras: '',
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
        // Nome é obrigatório. Como o campo pode estar numa aba não visível, valido
        // em JS e levo o usuário de volta para os Dados.
        if (!formData.nome?.trim()) {
            setTab('dados');
            alert('Informe o nome do lead.');
            return;
        }
        setIsSaving(true);
        try {
            await onSave({ ...formData, is_mql: calculateMql() });
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

    // GANHO: encerra o lead no funil → arquiva no CRM e cria cliente na aba Clientes.
    const handleGanho = async () => {
        if (!lead) return;
        if (!window.confirm('Marcar como GANHO?\n\nO lead sai do funil (arquivado) e vira cliente na aba Clientes.')) return;
        setIsGanhando(true);
        try {
            const r = await marcarLeadGanho(lead.id);
            if (!r.ok) { alert(r.error || 'Não foi possível marcar como ganho.'); return; }
            onClose();
            window.location.reload();
        } catch (error) {
            console.error('Failed to mark ganho:', error);
            alert('Erro ao marcar como ganho.');
        } finally {
            setIsGanhando(false);
        }
    };

    const inputClass = "w-full bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333] rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#A68B4B] focus:border-transparent transition-all";
    const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

    const inicial = (formData.nome || lead?.nome || '?').trim().charAt(0).toUpperCase() || '?';
    const localizacao = formData.cidade && formData.estado
        ? `${formData.cidade}/${formData.estado}`
        : (formData.cidade || formData.estado || '');
    const contatos = lead?.contact_count ?? (lead?.contact_history?.length ?? 0);
    const mqlAtivo = calculateMql();

    const tabs: { id: DrawerTab; label: string; icon: LucideIcon; show: boolean }[] = [
        { id: 'dados', label: 'Dados', icon: User, show: true },
        { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, show: !!(lead?.id && waPhone) },
        { id: 'documentos', label: 'Documentos', icon: FileText, show: !!lead?.id },
        { id: 'historico', label: 'Histórico', icon: History, show: !!(lead && onLeadUpdated) },
    ];

    // Pílula reutilizável do cabeçalho.
    const HeaderPill = ({ children, tone = 'gold' }: { children: React.ReactNode; tone?: 'gold' | 'green' | 'amber' | 'blue' | 'gray' }) => {
        const tones: Record<string, string> = {
            gold: 'bg-[#A68B4B]/15 text-[#A68B4B]',
            green: 'bg-green-500/15 text-green-600 dark:text-green-400',
            amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
            blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
            gray: 'bg-gray-200 dark:bg-[#2e2e2e] text-gray-600 dark:text-gray-300',
        };
        return <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${tones[tone]}`}>{children}</span>;
    };

    const tempTone = formData.temperatura === 'quente' ? 'amber' : formData.temperatura === 'frio' ? 'blue' : 'gray';

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
            <aside className="relative bg-white dark:bg-[#141414] w-full max-w-[920px] h-full flex flex-col border-l border-gray-200 dark:border-[#2A2A2A] shadow-2xl">
                <form onSubmit={handleSubmit} className="flex flex-col h-full min-h-0">
                    {/* ───────── Cabeçalho ───────── */}
                    <div className="px-6 pt-5 pb-4 border-b border-gray-200 dark:border-[#2A2A2A]">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                                <div
                                    className="shrink-0 flex items-center justify-center font-bold text-[15px] text-white"
                                    style={{ width: 46, height: 46, borderRadius: 10, background: 'linear-gradient(135deg, #C8A96E 0%, #A68B4B 100%)' }}
                                >
                                    {inicial}
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-[17px] font-bold leading-tight truncate dark:text-white">
                                        {lead ? (formData.nome || 'Editar Lead') : 'Novo Lead'}
                                    </h2>
                                    <div className="flex items-center gap-2 mt-0.5 text-[12px] text-gray-500 dark:text-gray-400 flex-wrap">
                                        {formData.responsavel && <span className="truncate">{formData.responsavel}</span>}
                                        {localizacao && (
                                            <span className="inline-flex items-center gap-1"><MapPin size={11} className="text-orange-400" /> {localizacao}</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                        {formData.status && <HeaderPill tone="gold">{formData.status}</HeaderPill>}
                                        {mqlAtivo && <HeaderPill tone="green">MQL</HeaderPill>}
                                        {formData.temperatura && <HeaderPill tone={tempTone}><Thermometer size={9} /> {formData.temperatura}</HeaderPill>}
                                        {formData.prioridade && <HeaderPill tone="gray">{formData.prioridade}</HeaderPill>}
                                        {formData.is_preferencial && <HeaderPill tone="gold"><Crown size={9} /> Preferencial</HeaderPill>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {lead?.id && waPhone && (
                                    <button
                                        type="button"
                                        onClick={() => setShowWhatsapp(true)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold text-green-600 dark:text-green-400 hover:bg-green-500/10 transition-colors"
                                        title="Abrir conversa de WhatsApp"
                                    >
                                        <MessageCircle size={16} /> WhatsApp
                                    </button>
                                )}
                                <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-[#2e2e2e] rounded-full transition-colors text-gray-500">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Stats rápidos */}
                        <div className="grid grid-cols-3 gap-2 mt-4">
                            {[
                                { l: 'Cabeças', v: formData.quantidade_animais ? String(formData.quantidade_animais) : '—', icon: Beef },
                                { l: 'Score Serasa', v: formData.score_serasa != null ? String(formData.score_serasa) : '—', icon: Gauge },
                                { l: 'Contatos', v: String(contatos), icon: MessageCircle },
                            ].map((s) => (
                                <div key={s.l} className="text-center py-2.5 rounded-lg bg-gray-50 dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A]">
                                    <div className="text-[15px] font-extrabold text-gray-900 dark:text-white">{s.v}</div>
                                    <div className="text-[9px] mt-0.5 text-gray-400 uppercase tracking-wide">{s.l}</div>
                                </div>
                            ))}
                        </div>

                        {lead?.data_entrada && (
                            <p className="text-[11px] text-gray-400 mt-2">
                                Entrada em {new Date(lead.data_entrada).toLocaleDateString('pt-BR')} às {new Date(lead.data_entrada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        )}
                    </div>

                    {/* ───────── Corpo: abas + conteúdo ───────── */}
                    <div className="flex flex-1 min-h-0 flex-col md:flex-row">
                        <nav className="flex md:flex-col gap-1 p-3 md:w-[190px] md:shrink-0 overflow-x-auto md:overflow-y-auto border-b md:border-b-0 md:border-r border-gray-200 dark:border-[#2A2A2A]">
                            {tabs.filter(t => t.show).map(t => {
                                const active = tab === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setTab(t.id)}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[12.5px] font-semibold whitespace-nowrap transition-colors md:w-full shrink-0 ${
                                            active
                                                ? 'bg-[#A68B4B]/15 text-[#A68B4B]'
                                                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1f1f1f]'
                                        }`}
                                    >
                                        <t.icon size={14} /> {t.label}
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
                            {/* Aba: Dados (formulário) */}
                            <div className={tab === 'dados' ? 'space-y-4' : 'hidden'}>
                                {/* ───── Habilitação p/ compra ─────
                                    Régua única (crm-habilitacao): formulário de entrada
                                    preenche na criação, IA e humano completam depois. */}
                                <FormSection icon={ClipboardCheck} title={`Habilitação p/ compra — ${habChecklist.done}/${habChecklist.total}`}>
                                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-[#333] overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${habChecklist.complete ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                            style={{ width: `${Math.round((habChecklist.done / Math.max(1, habChecklist.total)) * 100)}%` }}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {([['titular', 'Titular'], ['propriedade', 'Propriedade'], ['documentos', 'Documentos']] as const).map(([group, label]) => (
                                            <div key={group} className="space-y-1">
                                                <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
                                                {habChecklist.items.filter(i => i.group === group).map(i => (
                                                    <div key={i.key} className="flex items-start gap-1.5 text-xs">
                                                        <span className={i.done ? 'text-emerald-500' : 'text-amber-500'}>{i.done ? '✓' : '•'}</span>
                                                        <span className={i.done ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400'} title={i.value || undefined}>{i.label}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                    {habChecklist.complete && (
                                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                            ✓ Checklist completo — pronto para aprovação do cadastro.
                                        </p>
                                    )}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <label className={labelClass}>Endereço do titular</label>
                                            <input
                                                type="text"
                                                value={xdata.endereco_titular || ''}
                                                onChange={e => setXd('endereco_titular', e.target.value)}
                                                className={inputClass}
                                                placeholder="Rua, bairro, cidade/UF, CEP"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Fazenda (entrega)</label>
                                            <input
                                                type="text"
                                                value={xdata.fazenda_nome || ''}
                                                onChange={e => setXd('fazenda_nome', e.target.value)}
                                                className={inputClass}
                                                placeholder="Nome da fazenda"
                                            />
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="col-span-2">
                                                <label className={labelClass}>Cidade da fazenda</label>
                                                <input
                                                    type="text"
                                                    value={xdata.fazenda_cidade || ''}
                                                    onChange={e => setXd('fazenda_cidade', e.target.value)}
                                                    className={inputClass}
                                                    placeholder="Cidade"
                                                />
                                            </div>
                                            <div>
                                                <label className={labelClass}>UF</label>
                                                <input
                                                    type="text"
                                                    maxLength={2}
                                                    value={xdata.fazenda_uf || ''}
                                                    onChange={e => setXd('fazenda_uf', e.target.value.toUpperCase())}
                                                    className={inputClass}
                                                    placeholder="UF"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    {(xdata.urgencia_compra || xdata.objetivo_compra_resumido || xdata.proxima_acao) && (
                                        <div className="flex flex-wrap gap-1.5 text-[11px]">
                                            {xdata.urgencia_compra && (
                                                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">Urgência: {String(xdata.urgencia_compra).replace(/_/g, ' ')}</span>
                                            )}
                                            {xdata.objetivo_compra_resumido && (
                                                <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#222] text-gray-600 dark:text-gray-300">Objetivo: {String(xdata.objetivo_compra_resumido)}</span>
                                            )}
                                            {xdata.proxima_acao && (
                                                <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-400">Próx. ação: {String(xdata.proxima_acao)}</span>
                                            )}
                                        </div>
                                    )}
                                    {Array.isArray(xdata.stage_history) && xdata.stage_history.length > 0 && (
                                        <div className="space-y-1 pt-1 border-t border-gray-100 dark:border-[#2a2a2a]">
                                            <p className="text-[10px] uppercase tracking-wider text-gray-400">Movimentações de etapa</p>
                                            {xdata.stage_history.slice(0, 4).map((h: any, i: number) => (
                                                <p key={i} className="text-[11px] text-gray-500 dark:text-gray-400">
                                                    <span className="font-medium text-gray-700 dark:text-gray-300">{h.from} → {h.to}</span>
                                                    {' '}· {h.reason} ({h.by === 'ia' ? 'IA' : h.by}{h.at ? ` · ${new Date(h.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''})
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </FormSection>

                                {/* ───── Identificação ───── */}
                                <FormSection icon={User} title="Identificação">
                                    <div>
                                        <label className={labelClass}>Nome do Lead / Contato *</label>
                                        <input
                                            type="text"
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
                                                onChange={e => {
                                                    const v = e.target.value;
                                                    setFormData({
                                                        ...formData,
                                                        inscricao_estadual: v,
                                                        is_mql: calculateMql({ inscricao_estadual: v }),
                                                    });
                                                }}
                                                className={inputClass}
                                                placeholder="Nº da inscrição estadual"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Tem Inscrição Estadual?</label>
                                            <select
                                                value={formData.tem_inscricao_estadual || ''}
                                                onChange={e => {
                                                    const v = e.target.value;
                                                    setFormData({
                                                        ...formData,
                                                        tem_inscricao_estadual: v,
                                                        // IE entra no critério de MQL — recalcula junto.
                                                        is_mql: evaluateMql(mqlRule, {
                                                            quantidade_animais: formData.quantidade_animais,
                                                            tem_inscricao_estadual: v,
                                                            inscricao_estadual: formData.inscricao_estadual,
                                                        }),
                                                    });
                                                }}
                                                className={inputClass}
                                            >
                                                <option value="">—</option>
                                                <option value="Sim">Sim</option>
                                                <option value="Não">Não</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelClass}>Score Serasa</label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={1000}
                                                value={formData.score_serasa ?? ''}
                                                onChange={e => setFormData({
                                                    ...formData,
                                                    score_serasa: e.target.value === '' ? null : Number(e.target.value),
                                                })}
                                                className={inputClass}
                                                placeholder="0 a 1000"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClass}>Pendências financeiras no nome?</label>
                                            <select
                                                value={formData.pendencias_financeiras || ''}
                                                onChange={e => setFormData({ ...formData, pendencias_financeiras: e.target.value || null })}
                                                className={inputClass}
                                            >
                                                <option value="">—</option>
                                                <option value="Sim">Sim</option>
                                                <option value="Não">Não</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className={labelClass}>Usuário da equipe</label>
                                        {responsaveis.length > 0 ? (
                                            <select
                                                value={formData.responsavel || ''}
                                                onChange={e => setFormData({ ...formData, responsavel: e.target.value })}
                                                className={inputClass}
                                            >
                                                <option value="">Selecionar usuário...</option>
                                                {responsaveis.filter(r => r.active !== false).map(r => (
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
                                                value={formData.status || CRM_STAGE_CONNECTION}
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
                                    <div>
                                        <label className={labelClass}>E-mail</label>
                                        <input
                                            type="email"
                                            value={formData.email || ''}
                                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                                            className={inputClass}
                                            placeholder="email@exemplo.com"
                                        />
                                    </div>
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
                                                    setFormData({
                                                        ...formData,
                                                        quantidade_animais: v,
                                                        is_mql: evaluateMql(mqlRule, {
                                                            quantidade_animais: v,
                                                            tem_inscricao_estadual: formData.tem_inscricao_estadual,
                                                            inscricao_estadual: formData.inscricao_estadual,
                                                        }),
                                                    });
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
                                                <option value="leite">Leite</option>
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
                                                Definido automaticamente quando o lead tem ≥{minCabecas} cabeças{requireIe ? ' e Inscrição Estadual' : ''}.
                                            </span>
                                        </span>
                                        <span
                                            className={`px-3 py-1 rounded-full text-[11px] font-extrabold uppercase border shrink-0 ${
                                                mqlAtivo
                                                    ? 'border-[#A68B4B]/40 bg-[#A68B4B]/15 text-[#A68B4B]'
                                                    : 'border-gray-200 dark:border-[#333] bg-gray-100 dark:bg-[#2e2e2e] text-gray-500 dark:text-gray-400'
                                            }`}
                                        >
                                            {mqlAtivo ? 'MQL' : 'Não MQL'}
                                        </span>
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
                                            {/* Rastreio da planilha — só leitura (vem do import, não editar à mão). */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Lead ID (planilha)</label>
                                                    <input
                                                        type="text"
                                                        value={formData.extra_data?.sheet_validation_import?.sheetLeadId || ''}
                                                        readOnly
                                                        className={`${inputClass} opacity-70`}
                                                        placeholder="—"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Anúncio (ad-id)</label>
                                                    <input
                                                        type="text"
                                                        value={formData.extra_data?.utm?.ad_id || ''}
                                                        readOnly
                                                        className={`${inputClass} opacity-70`}
                                                        placeholder="—"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Data original (planilha)</label>
                                                <input
                                                    type="text"
                                                    value={formData.extra_data?.sheet_validation_import?.sheetDate || ''}
                                                    readOnly
                                                    className={`${inputClass} opacity-70`}
                                                    placeholder="—"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Aba: WhatsApp */}
                            {tab === 'whatsapp' && lead?.id && waPhone && (
                                <WhatsappRecords phone={waPhone} onReply={() => setShowWhatsapp(true)} />
                            )}

                            {/* Aba: Documentos */}
                            {tab === 'documentos' && lead?.id && (
                                <CRMLeadDocumentos leadId={lead.id} />
                            )}

                            {/* Aba: Histórico de contatos */}
                            {tab === 'historico' && lead && onLeadUpdated && (
                                <CRMContactsHistory lead={lead} onUpdated={onLeadUpdated} />
                            )}
                        </div>
                    </div>

                    {/* ───────── Rodapé ───────── */}
                    <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 dark:border-[#2A2A2A]">
                        {lead ? (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                    className="flex items-center gap-2 px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-colors font-medium text-sm"
                                >
                                    <Trash2 size={18} />
                                    {isDeleting ? 'Apagando...' : 'Apagar'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleGanho}
                                    disabled={isGanhando}
                                    title="Ganho: sai do funil (arquivado) e vira cliente na aba Clientes"
                                    className="flex items-center gap-2 px-4 py-2 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-xl transition-colors font-semibold text-sm disabled:opacity-50"
                                >
                                    <Trophy size={18} />
                                    {isGanhando ? 'Processando...' : 'Ganho'}
                                </button>
                            </div>
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
            </aside>

            {showWhatsapp && lead?.id && waPhone && (
                <CRMConversationDrawer
                    leadId={lead.id}
                    phone={waPhone}
                    name={lead.nome || formData.nome || null}
                    onClose={() => setShowWhatsapp(false)}
                />
            )}
        </div>
    );
}
