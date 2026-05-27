import { createClient } from '@/utils/supabase/server';
import { normalizeAssessorNome } from '@/lib/assessor-normalize';
import DashboardClient, {
    type DashboardProps,
    type ProximoLeilao,
    type ProximoLeilaoRow,
    type FeedItem,
    type PeriodKey,
    type AssessorOption,
} from './DashboardClient';

const MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const WEEK_ABBR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function daysFromNow(dateStr: string | null | undefined): number | null {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y) return null;
    const dt = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.ceil((dt.getTime() - today.getTime()) / 86400000);
}

function parseLeilaoDate(iso: string | null | undefined, horario?: string | null) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y) return null;
    let hh = 20, mm = 0;
    if (horario) {
        const mMatch = horario.match(/(\d{1,2})[:h](\d{2})?/i);
        if (mMatch) { hh = Number(mMatch[1]); mm = Number(mMatch[2] ?? 0); }
    }
    const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
    return {
        dia: String(d).padStart(2, '0'),
        mes: MONTH_ABBR[m - 1],
        semana: WEEK_ABBR[dt.getDay()],
        ts: dt.getTime(),
    };
}

function truncate(s: string | null | undefined, n: number) {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function timeAgo(iso: string | null | undefined): string {
    if (!iso) return '—';
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    if (diff < 60_000) return 'agora';
    const min = Math.floor(diff / 60_000);
    if (min < 60) return `${min} min`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const days = Math.floor(hr / 24);
    return `${days}d`;
}

function toISODate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Resolve searchParams (period, from, to, assessor) → janela ISO + labels.
function resolvePeriod(period: PeriodKey, fromRaw?: string, toRaw?: string) {
    const now = new Date();
    let from: Date;
    let to: Date = new Date(now);
    let label = '';
    switch (period) {
        case 'this_month':
            from = new Date(now.getFullYear(), now.getMonth(), 1);
            label = `${MONTH_ABBR[now.getMonth()]}/${now.getFullYear()}`;
            break;
        case 'last_30d':
            from = new Date(now); from.setDate(from.getDate() - 29);
            label = 'Últimos 30 dias';
            break;
        case 'last_90d':
            from = new Date(now); from.setDate(from.getDate() - 89);
            label = 'Últimos 90 dias';
            break;
        case 'this_quarter': {
            const q = Math.floor(now.getMonth() / 3);
            from = new Date(now.getFullYear(), q * 3, 1);
            label = `T${q + 1}/${now.getFullYear()}`;
            break;
        }
        case 'this_year':
            from = new Date(now.getFullYear(), 0, 1);
            label = String(now.getFullYear());
            break;
        case 'all':
            from = new Date(2000, 0, 1);
            label = 'Todo o histórico';
            break;
        case 'custom': {
            const f = fromRaw && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? new Date(fromRaw + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth() - 5, 1);
            const t = toRaw && /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? new Date(toRaw + 'T23:59:59') : new Date(now);
            from = f; to = t;
            label = `${toISODate(f).split('-').reverse().join('/')} → ${toISODate(t).split('-').reverse().join('/')}`;
            break;
        }
        default:
            from = new Date(now.getFullYear(), 0, 1);
            label = String(now.getFullYear());
    }
    return { from: toISODate(from), to: toISODate(to), label };
}

type SearchParams = Promise<{
    period?: string;
    from?: string;
    to?: string;
    assessor?: string;
}>;

// ───────────────────────────────────────────────────────────────────────────

export default async function AdminDashboard({ searchParams }: { searchParams?: SearchParams }) {
    const params = (await searchParams) ?? {};
    const periodKey: PeriodKey = (['this_month', 'last_30d', 'last_90d', 'this_quarter', 'this_year', 'all', 'custom'] as PeriodKey[])
        .includes(params.period as PeriodKey) ? (params.period as PeriodKey) : 'this_year';
    const range = resolvePeriod(periodKey, params.from, params.to);
    const assessorFilter = (params.assessor || '').trim();

    const supabase = await createClient();

    const [
        { data: leads },
        { data: leiloes },
        { data: fechamentosAll },
    ] = await Promise.all([
        supabase.from('crm_leads')
            .select('id, nome, status, prioridade, data_estimada_fechamento, created_at')
            .order('created_at', { ascending: false }),
        supabase.from('bula_leiloes')
            .select('id, nome, data, tipo, animais, expectativa, meta_bula, realizado_bula, status, horario, modelo, leiloeira, local, transmissao')
            .order('data', { ascending: true }),
        supabase.from('bula_leilao_fechamento')
            .select('id, nome, data, local, lotes_ofertados, lotes_vendidos, animais_vendidos, vgv_total, ticket_medio, maior_lance, compradores_unicos, estados_alcancados, por_assessor')
            .order('data', { ascending: false }),
    ]);

    const now = new Date();

    // ── Leilões (próximos, hero) ─────────────────────────────────────────────
    const allLeiloes = leiloes ?? [];
    const todayStr = now.toISOString().split('T')[0];
    const upcomingLeiloes = allLeiloes
        .filter(l => (l.data ?? '') >= todayStr && l.status !== 'concluido')
        .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''));

    const confirmedCount = upcomingLeiloes.filter(l => l.status === 'confirmado').length;

    const proximoRaw = upcomingLeiloes[0] ?? null;
    const proxParsed = proximoRaw ? parseLeilaoDate(proximoRaw.data, proximoRaw.horario) : null;
    const proximo: ProximoLeilao | null = proximoRaw && proxParsed ? {
        nome: proximoRaw.nome || 'Sem nome',
        tipo: proximoRaw.tipo,
        animais: Number(proximoRaw.animais) || 0,
        meta_bula: Number(proximoRaw.meta_bula) || 0,
        expectativa: Number(proximoRaw.expectativa) || 0,
        horario: proximoRaw.horario,
        leiloeira: proximoRaw.leiloeira,
        local: proximoRaw.local,
        status: proximoRaw.status || 'prospecto',
        data: proximoRaw.data,
        wk: proxParsed.semana,
        day: proxParsed.dia,
        mo: proxParsed.mes,
        targetTs: proxParsed.ts,
        diasParaProximo: daysFromNow(proximoRaw.data),
    } : null;

    const upcoming: ProximoLeilaoRow[] = upcomingLeiloes.slice(0, 6).map((l) => {
        const p = parseLeilaoDate(l.data);
        const meta = Number(l.meta_bula) || 0;
        const exp = Number(l.expectativa) || 0;
        const base = Math.max(meta, exp, 1);
        const pct = Math.round((meta / base) * 100);
        let status: 'ok' | 'warn' | 'pend' = 'pend';
        let statusLabel = 'Em montagem';
        if (l.status === 'confirmado') { status = 'ok'; statusLabel = 'Confirmado'; }
        else if (l.status === 'negociacao') { status = 'warn'; statusLabel = 'Em negociação'; }
        return {
            id: l.id,
            d: p?.dia ?? '—', m: p?.mes ?? '—', wk: p?.semana ?? '—',
            title: l.nome || 'Sem nome',
            type: [l.tipo, l.leiloeira].filter(Boolean).join(' · '),
            status, statusLabel,
            pct: Math.max(0, Math.min(100, pct)),
            animais: Number(l.animais) || 0,
            expectativaLabel: exp > 0 ? `Exp: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(exp)}` : '',
        };
    });

    // ── Lista única de assessores (todos os fechamentos, sem filtro de data) ─
    const allFechamentos = fechamentosAll ?? [];
    const assessorSet = new Map<string, number>(); // nome canônico → contagem
    for (const f of allFechamentos) {
        for (const a of ((f.por_assessor ?? []) as Array<{ nome?: string }>)) {
            const canon = normalizeAssessorNome(a.nome);
            if (!canon) continue;
            assessorSet.set(canon, (assessorSet.get(canon) || 0) + 1);
        }
    }
    const assessorOptions: AssessorOption[] = [...assessorSet.entries()]
        .map(([nome, count]) => ({ nome, count }))
        .sort((a, b) => a.nome.localeCompare(b.nome));

    // ── Fechamentos filtrados pelo período ───────────────────────────────────
    const fechamentosPeriodo = allFechamentos.filter(f => {
        const d = f.data || '';
        return d >= range.from && d <= range.to;
    });

    // ── Aplicar filtro de assessor (se houver) ──────────────────────────────
    // Quando há assessor selecionado, agregamos APENAS o que esse assessor
    // vendeu dentro de cada fechamento (somando os campos do por_assessor[]).
    // Para cobertura média, mantemos a métrica do LEILÃO (lotes vendidos /
    // ofertados do leilão inteiro), pois não há granularidade por assessor —
    // o filtro restringe quais leilões entram no cálculo.
    let totalVgv = 0;
    let totalAnimais = 0;
    let totalLotesVendidos = 0; // transações do assessor (ticket médio)
    let coberturaLotesVendidos = 0; // lotes vendidos do leilão (cobertura)
    let coberturaLotesOfertados = 0;

    for (const f of fechamentosPeriodo) {
        const lotesOf = Number(f.lotes_ofertados) || 0;
        const lotesVe = Number(f.lotes_vendidos) || 0;

        if (assessorFilter) {
            let assessorVgv = 0;
            let assessorAnimais = 0;
            let assessorLotes = 0;
            let participou = false;

            for (const a of ((f.por_assessor ?? []) as Array<{ nome?: string; vgv?: number; animais?: number; transacoes?: number }>)) {
                if (normalizeAssessorNome(a.nome) === assessorFilter) {
                    assessorVgv += Number(a.vgv) || 0;
                    assessorAnimais += Number(a.animais) || 0;
                    assessorLotes += Number(a.transacoes) || 0;
                    participou = true;
                }
            }

            if (!participou) continue;

            totalVgv += assessorVgv;
            totalAnimais += assessorAnimais;
            totalLotesVendidos += assessorLotes;
            coberturaLotesVendidos += lotesVe;
            coberturaLotesOfertados += lotesOf;
        } else {
            totalVgv += Number(f.vgv_total) || 0;
            totalAnimais += Number(f.animais_vendidos) || 0;
            totalLotesVendidos += lotesVe;
            coberturaLotesVendidos += lotesVe;
            coberturaLotesOfertados += lotesOf;
        }
    }

    const ticketMedio = totalLotesVendidos > 0 ? totalVgv / totalLotesVendidos : 0;
    // Cobertura média ponderada (alinhada com FechamentoView):
    // totalVendidos / totalOfertados nos leilões dentro do filtro.
    const coberturaMedia = coberturaLotesOfertados > 0
        ? coberturaLotesVendidos / coberturaLotesOfertados
        : 0;
    const fechamentosCount = assessorFilter
        ? fechamentosPeriodo.filter(f => (f.por_assessor ?? []).some((a: { nome?: string }) => normalizeAssessorNome(a.nome) === assessorFilter)).length
        : fechamentosPeriodo.length;

    // ── Leads / funnel (mantido — não duplica fechamento) ───────────────────
    const allLeads = leads ?? [];
    const totalLeads = allLeads.length;
    const leadsByStatus: Record<string, number> = {};
    for (const l of allLeads) leadsByStatus[l.status || 'Sem status'] = (leadsByStatus[l.status || 'Sem status'] || 0) + 1;
    const hotLeads = allLeads.filter(l => l.prioridade === 'Alta').length;
    const activeLeads = totalLeads - (leadsByStatus['Fechado'] || 0);

    // ── Feed (apenas leads — fechamentos individuais agora ficam só na página de fechamento) ─
    const feed: FeedItem[] = [];
    for (const l of allLeads.slice(0, 8)) {
        feed.push({
            id: `l-${l.id}`,
            kind: 'lead',
            text: `<b>${truncate(l.nome, 30) || 'Lead'}</b> entrou no CRM${l.status ? ` · status <b>${l.status}</b>` : ''}${l.prioridade === 'Alta' ? ' · <b>prioridade alta</b>' : ''}`,
            when: timeAgo(l.created_at),
        });
    }

    const today = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    const todayFmt = today.charAt(0).toUpperCase() + today.slice(1);

    const props: DashboardProps = {
        today: todayFmt,
        proximo,
        upcoming,
        filters: {
            period: periodKey,
            from: range.from,
            to: range.to,
            label: range.label,
            assessor: assessorFilter,
            assessores: assessorOptions,
        },
        kpi: {
            valorVendido: totalVgv,
            animaisVendidos: totalAnimais,
            ticketMedio,
            coberturaMedia,
            fechamentosCount,
            upcomingCount: upcomingLeiloes.length,
            confirmedCount,
            activeLeads,
            hotLeads,
            totalLeads,
        },
        feed,
    };

    return <DashboardClient {...props} />;
}
