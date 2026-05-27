import {
    Gavel, Users, Clock, Megaphone, Phone, ListChecks,
    DollarSign, ScrollText, CheckCircle2,
    type LucideIcon,
} from 'lucide-react';
import type { AgendaEventType, AgendaEventStatus, AgendaEventPriority } from '@/app/sistema/actions/agenda';

export interface EventTypeMeta {
    key: AgendaEventType;
    label: string;
    short: string;
    color: string;       // base hex (used for chip bg / accent)
    icon: LucideIcon;
    description: string;
}

// Each type carries the brand gold as halo but uses a distinct accent so the
// month grid stays readable.
export const EVENT_TYPES: EventTypeMeta[] = [
    { key: 'leilao',         label: 'Leilão',           short: 'LEI',  color: '#A68B4B', icon: Gavel,         description: 'Pregão / dia do leilão' },
    { key: 'reuniao',        label: 'Reunião',          short: 'RNI',  color: '#4F46E5', icon: Users,         description: 'Reunião com criador, equipe ou parceiro' },
    { key: 'prazo',          label: 'Prazo',            short: 'PRZ',  color: '#DC2626', icon: Clock,         description: 'Entrega, deadline operacional' },
    { key: 'publicacao',     label: 'Publicação',       short: 'PUB',  color: '#0EA5E9', icon: Megaphone,     description: 'Post, disparo, anúncio agendado' },
    { key: 'follow_up',      label: 'Follow-up',        short: 'FLW',  color: '#10B981', icon: Phone,         description: 'Retorno comercial, contato pós-leilão' },
    { key: 'tarefa_interna', label: 'Tarefa interna',   short: 'TRF',  color: '#8B5CF6', icon: ListChecks,    description: 'Atividade operacional do time' },
    { key: 'financeiro',     label: 'Financeiro',       short: 'FIN',  color: '#F59E0B', icon: DollarSign,    description: 'Cobrança, comissão, pagamento' },
    { key: 'juridico',       label: 'Jurídico',         short: 'JUR',  color: '#64748B', icon: ScrollText,    description: 'Contrato, autorização, documento' },
    { key: 'pos_evento',     label: 'Pós-evento',       short: 'POS',  color: '#0D9488', icon: CheckCircle2,  description: 'Relatório, resultado, ata' },
];

export const EVENT_TYPES_MAP: Record<AgendaEventType, EventTypeMeta> =
    Object.fromEntries(EVENT_TYPES.map(t => [t.key, t])) as Record<AgendaEventType, EventTypeMeta>;

export interface StatusMeta {
    key: AgendaEventStatus;
    label: string;
    dot: string;
    badge: string;     // tailwind classes
}

export const EVENT_STATUS: StatusMeta[] = [
    { key: 'planejado',     label: 'Planejado',     dot: '#94A3B8', badge: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300' },
    { key: 'em_andamento',  label: 'Em andamento',  dot: '#3B82F6', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
    { key: 'pendente',      label: 'Pendente',      dot: '#F59E0B', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
    { key: 'atrasado',      label: 'Atrasado',      dot: '#DC2626', badge: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
    { key: 'concluido',     label: 'Concluído',     dot: '#10B981', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
    { key: 'cancelado',     label: 'Cancelado',     dot: '#64748B', badge: 'bg-gray-100 text-gray-500 dark:bg-gray-500/15 dark:text-gray-400' },
];

export const EVENT_STATUS_MAP: Record<AgendaEventStatus, StatusMeta> =
    Object.fromEntries(EVENT_STATUS.map(s => [s.key, s])) as Record<AgendaEventStatus, StatusMeta>;

export const PRIORITY_LABELS: Record<AgendaEventPriority, string> = {
    baixa: 'Baixa',
    media: 'Média',
    alta:  'Alta',
};

export const PRIORITY_DOT: Record<AgendaEventPriority, string> = {
    baixa: '#94A3B8',
    media: '#F59E0B',
    alta:  '#DC2626',
};

export const MES_NOMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const DIAS_CURTOS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
export const DIAS_LONGOS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function parseDateLocal(iso: string): Date {
    // start_at is TIMESTAMPTZ — Date constructor handles UTC offset; we read
    // local components when rendering so the user sees São Paulo time.
    return new Date(iso);
}

export function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

export function endOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

export function sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function addDays(d: Date, n: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

export function addMonths(d: Date, n: number): Date {
    const x = new Date(d);
    x.setMonth(x.getMonth() + n);
    return x;
}

export function startOfWeek(d: Date): Date {
    const x = startOfDay(d);
    x.setDate(x.getDate() - x.getDay()); // Sunday = 0
    return x;
}

export function startOfMonth(d: Date): Date {
    const x = new Date(d.getFullYear(), d.getMonth(), 1);
    return startOfDay(x);
}

export function endOfMonth(d: Date): Date {
    const x = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return endOfDay(x);
}

export function formatHora(d: Date): string {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDataCurta(d: Date): string {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function formatDataLonga(d: Date): string {
    return `${DIAS_LONGOS[d.getDay()]}, ${d.getDate()} de ${MES_NOMES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function toIsoLocal(d: Date): string {
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60_000);
    return local.toISOString().slice(0, 16);
}

export function fromInputLocal(value: string): string {
    // value: "YYYY-MM-DDTHH:mm" interpreted as local time → ISO UTC
    if (!value) return '';
    const d = new Date(value);
    return d.toISOString();
}
