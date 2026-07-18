'use server';

/**
 * Aba RELATÓRIOS do CRM — agregados de governança calculados no servidor.
 * Tudo sai das fontes que já existem (crm_leads, whatsapp_messages,
 * crm_conversa_auditorias); nenhum número é inventado no cliente.
 */
import { requireUser, supabaseAdmin } from '@/lib/supabase';
import { normalizeCRMStatus, CRM_STAGE_ENTRY } from '@/lib/crm-types';
import { atendimentoGrowth, type AtendimentoMsg, type OrigemResposta } from '@/lib/atendimento-stats';

export interface RelatorioFunilEtapa { etapa: string; total: number }
export interface RelatorioBucket { label: string; total: number }
export interface RelatorioDiaScore { dia: string; media: number; conversas: number }

export interface CrmRelatorios {
    periodoDias: number;
    geradoEm: string;
    // Base & funil
    leadsAtivos: number;
    novosNoPeriodo: number;
    contextoIncorreto: number;
    funil: RelatorioFunilEtapa[];
    topOrigens: RelatorioBucket[];
    mqlAtivos: number;
    // Atendimento (janela do período)
    atendimento: {
        disparados: number; responderam: number; pct: number;
        enviadas: number; recebidas: number; contatos: number;
        serieDias: string[]; serieContatados: number[]; serieResponderam: number[];
        porOrigem: OrigemResposta[];
    };
    // Habilitação
    habilitacao: {
        aceitaramAssessoria: number;
        cadastroStatus: RelatorioBucket[];
        submetidos: number;
        aprovados: number;
    };
    // Termômetro (equação de conversão)
    prontidao: {
        comScore: number;
        buckets: RelatorioBucket[];
        gargalos: RelatorioBucket[];
    };
    // Auditoria IA
    auditoria: {
        totalConversas: number;
        scoreMedioGeral: number | null;
        porDia: RelatorioDiaScore[];
        falhasPorTipo: RelatorioBucket[];
    };
}

const PAGE = 1000;

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
    const all: T[] = [];
    const CONC = 6;
    for (let base = 0; ; base += PAGE * CONC) {
        const pages = await Promise.all(
            Array.from({ length: CONC }, (_, i) => build(base + i * PAGE, base + i * PAGE + PAGE - 1)),
        );
        let done = false;
        for (const { data, error } of pages) {
            if (error) throw new Error(error.message);
            all.push(...(data ?? []));
            if (!data || data.length < PAGE) { done = true; break; }
        }
        if (done) break;
    }
    return all;
}

const ETAPAS_FUNIL = [CRM_STAGE_ENTRY, 'CONEXÃO', 'QUALIFICAÇÃO', 'INFORMAÇÕES CAPTADAS', 'CADASTRO', 'PERDIDOS'];

export async function getCrmRelatorios(periodoDias: number = 30): Promise<CrmRelatorios> {
    await requireUser();
    const supa = supabaseAdmin();
    const dias = [7, 30, 90].includes(periodoDias) ? periodoDias : 30;
    const nowMs = Date.now();
    const cutoffIso = new Date(nowMs - dias * 24 * 3600_000).toISOString();

    // ── Leads (colunas mínimas; extra_data traz cadastro/score) ──────────────
    interface LeadRow {
        status: string | null; source: string | null; origem: string | null;
        created_at: string; is_mql: boolean | null;
        extra_data: Record<string, unknown> | null;
    }
    const leads = await fetchAll<LeadRow>((from, to) => supa
        .from('crm_leads')
        .select('status, source, origem, created_at, is_mql, extra_data')
        .eq('arquivado', false)
        .range(from, to) as never);

    const porEtapa = new Map<string, number>();
    const porOrigem = new Map<string, number>();
    const cadastroStatus = new Map<string, number>();
    const gargalos = new Map<string, number>();
    const probBuckets = [0, 0, 0, 0]; // 0-25, 25-50, 50-75, 75-100
    let novos = 0, contextoIncorreto = 0, mqlAtivos = 0;
    let aceitaram = 0, submetidos = 0, aprovados = 0, comScore = 0;

    for (const l of leads) {
        const etapa = normalizeCRMStatus(l.status);
        porEtapa.set(etapa, (porEtapa.get(etapa) ?? 0) + 1);
        const orig = (l.source || l.origem || '(sem origem)').trim() || '(sem origem)';
        porOrigem.set(orig, (porOrigem.get(orig) ?? 0) + 1);
        if (l.created_at >= cutoffIso) novos++;
        if (l.is_mql) mqlAtivos++;
        const xd = l.extra_data ?? {};
        if (xd.contexto_incorreto_at) contextoIncorreto++;
        if (xd.aceitou_assessoria === true) aceitaram++;
        const cs = String(xd.cadastro_status ?? '').trim();
        if (cs) cadastroStatus.set(cs, (cadastroStatus.get(cs) ?? 0) + 1);
        if (xd.cadastro_submetido_at || cs === 'em_analise' || cs === 'solicitado') submetidos++;
        if (xd.cadastro_aprovado === true || cs === 'aprovado') aprovados++;
        const score = xd.lead_score as { prob?: number; gargalo?: string } | undefined;
        if (score && typeof score.prob === 'number') {
            comScore++;
            probBuckets[Math.min(3, Math.floor(score.prob * 4))]++;
            if (score.gargalo) gargalos.set(score.gargalo, (gargalos.get(score.gargalo) ?? 0) + 1);
        }
    }

    // ── Atendimento (whatsapp_messages do período, fonte única de métricas) ──
    const msgs = await fetchAll<AtendimentoMsg>((from, to) => supa
        .from('whatsapp_messages')
        .select('phone, direction, status, origin, channel, created_at')
        .gte('created_at', cutoffIso)
        .not('phone', 'is', null)
        .order('created_at', { ascending: true })
        .range(from, to) as never);
    const growth = atendimentoGrowth(msgs, dias, nowMs);
    const serieDias = Array.from({ length: growth.serie_contatados.length }, (_, i) => {
        const d = new Date(nowMs - (growth.serie_contatados.length - 1 - i) * 24 * 3600_000);
        return d.toISOString().slice(5, 10); // MM-DD
    });

    // ── Auditoria IA ──────────────────────────────────────────────────────────
    interface AudRow { dia: string; score: number | null; falhas: Array<{ tipo?: string }> | null }
    const { data: audRows } = await supa
        .from('crm_conversa_auditorias')
        .select('dia, score, falhas')
        .gte('dia', cutoffIso.slice(0, 10))
        .order('dia', { ascending: true })
        .limit(3000);
    const porDiaMap = new Map<string, { soma: number; n: number }>();
    const falhasTipo = new Map<string, number>();
    let audSoma = 0, audN = 0;
    for (const r of (audRows ?? []) as AudRow[]) {
        if (typeof r.score === 'number') {
            audSoma += r.score; audN++;
            const d = porDiaMap.get(r.dia) ?? { soma: 0, n: 0 };
            d.soma += r.score; d.n++;
            porDiaMap.set(r.dia, d);
        }
        for (const f of r.falhas ?? []) {
            const t = String(f?.tipo ?? 'outro');
            falhasTipo.set(t, (falhasTipo.get(t) ?? 0) + 1);
        }
    }

    const toBuckets = (m: Map<string, number>, limit = 12): RelatorioBucket[] =>
        [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
            .map(([label, total]) => ({ label, total }));

    return {
        periodoDias: dias,
        geradoEm: new Date().toISOString(),
        leadsAtivos: leads.length,
        novosNoPeriodo: novos,
        contextoIncorreto,
        funil: ETAPAS_FUNIL.map(etapa => ({ etapa, total: porEtapa.get(etapa) ?? 0 })),
        topOrigens: toBuckets(porOrigem, 8),
        mqlAtivos,
        atendimento: {
            disparados: growth.disparados, responderam: growth.responderam, pct: growth.pct,
            enviadas: growth.enviadas, recebidas: growth.recebidas, contatos: growth.contatos,
            serieDias, serieContatados: growth.serie_contatados, serieResponderam: growth.serie_responderam,
            porOrigem: growth.por_origem.slice(0, 8),
        },
        habilitacao: {
            aceitaramAssessoria: aceitaram,
            cadastroStatus: toBuckets(cadastroStatus),
            submetidos, aprovados,
        },
        prontidao: {
            comScore,
            buckets: [
                { label: '0-25%', total: probBuckets[0] },
                { label: '25-50%', total: probBuckets[1] },
                { label: '50-75%', total: probBuckets[2] },
                { label: '75-100%', total: probBuckets[3] },
            ],
            gargalos: toBuckets(gargalos),
        },
        auditoria: {
            totalConversas: audN,
            scoreMedioGeral: audN ? Math.round((audSoma / audN) * 10) / 10 : null,
            porDia: [...porDiaMap.entries()].map(([dia, d]) => ({
                dia, media: Math.round((d.soma / d.n) * 10) / 10, conversas: d.n,
            })),
            falhasPorTipo: toBuckets(falhasTipo),
        },
    };
}

// ─── Relatórios linha a linha (tabela na aba + export XLSX no cliente) ───────

export interface RelatorioConversaRow {
    phone: string;
    nome: string | null;
    leadId: string | null;
    msgsLead: number;
    msgsNossas: number;
    primeira: string;
    ultima: string;
    respondeu: boolean;
    scoreAuditoria: number | null;
    resumoAuditoria: string | null;
    trava: string | null;
    proximaAcao: string | null;
}

/** Conversas 1:1 do período (inbox oficial), enriquecidas com a auditoria. */
export async function getRelatorioConversas(periodoDias: number = 30): Promise<RelatorioConversaRow[]> {
    await requireUser();
    const supa = supabaseAdmin();
    const dias = [7, 30, 90].includes(periodoDias) ? periodoDias : 30;
    const cutoffIso = new Date(Date.now() - dias * 24 * 3600_000).toISOString();

    interface Msg { phone: string | null; name: string | null; direction: string | null; created_at: string; lead_id: string | null; intent: string | null }
    const msgs = await fetchAll<Msg>((from, to) => supa
        .from('whatsapp_messages')
        .select('phone, name, direction, created_at, lead_id, intent')
        .or('inbox_id.eq.cloud,and(inbox_id.is.null,channel.eq.cloud)')
        .gte('created_at', cutoffIso)
        .not('phone', 'is', null)
        .order('created_at', { ascending: true })
        .range(from, to) as never);

    const byPhone = new Map<string, RelatorioConversaRow>();
    for (const m of msgs) {
        const p = String(m.phone ?? '').replace(/\D/g, '');
        if (!/^\d{10,13}$/.test(p) || m.intent === 'assessor') continue;
        let r = byPhone.get(p);
        if (!r) {
            r = { phone: p, nome: null, leadId: null, msgsLead: 0, msgsNossas: 0, primeira: m.created_at, ultima: m.created_at, respondeu: false, scoreAuditoria: null, resumoAuditoria: null, trava: null, proximaAcao: null };
            byPhone.set(p, r);
        }
        if (m.direction === 'inbound') { r.msgsLead++; r.respondeu = true; } else r.msgsNossas++;
        if (m.name && !r.nome) r.nome = m.name;
        if (m.lead_id && !r.leadId) r.leadId = m.lead_id;
        r.ultima = m.created_at;
    }

    // Última auditoria de cada telefone no período.
    const { data: auds } = await supa
        .from('crm_conversa_auditorias')
        .select('phone, dia, score, resumo, trava, proxima_acao, lead_nome')
        .gte('dia', cutoffIso.slice(0, 10))
        .order('dia', { ascending: true })
        .limit(3000);
    for (const a of auds ?? []) {
        const r = byPhone.get(String(a.phone).replace(/\D/g, ''));
        if (!r) continue;
        r.scoreAuditoria = a.score ?? r.scoreAuditoria;
        r.resumoAuditoria = a.resumo ?? r.resumoAuditoria;
        r.trava = a.trava ?? r.trava;
        r.proximaAcao = a.proxima_acao ?? r.proximaAcao;
        if (a.lead_nome && !r.nome) r.nome = a.lead_nome;
    }

    return [...byPhone.values()].sort((a, b) => (b.ultima > a.ultima ? 1 : -1));
}

export interface RelatorioLeadRow {
    id: string;
    nome: string | null;
    telefone: string | null;
    etapa: string;
    origem: string | null;
    interesse: string | null;
    cidade: string | null;
    estado: string | null;
    quantidadeAnimais: string | null;
    mql: boolean;
    cadastroStatus: string | null;
    prontidao: number | null;
    gargalo: string | null;
    criadoEm: string;
}

/** Leads criados no período, com etapa, cadastro e termômetro — p/ tabela e XLSX. */
export async function getRelatorioLeads(periodoDias: number = 30): Promise<RelatorioLeadRow[]> {
    await requireUser();
    const supa = supabaseAdmin();
    const dias = [7, 30, 90].includes(periodoDias) ? periodoDias : 30;
    const cutoffIso = new Date(Date.now() - dias * 24 * 3600_000).toISOString();

    interface Row {
        id: string; nome: string | null; telefone: string | null; status: string | null;
        source: string | null; origem: string | null; interesse_principal: string | null;
        cidade: string | null; estado: string | null; quantidade_animais: string | null;
        is_mql: boolean | null; created_at: string; extra_data: Record<string, unknown> | null;
    }
    const rows = await fetchAll<Row>((from, to) => supa
        .from('crm_leads')
        .select('id, nome, telefone, status, source, origem, interesse_principal, cidade, estado, quantidade_animais, is_mql, created_at, extra_data')
        .eq('arquivado', false)
        .gte('created_at', cutoffIso)
        .order('created_at', { ascending: false })
        .range(from, to) as never);

    return rows.map(l => {
        const xd = l.extra_data ?? {};
        const score = xd.lead_score as { prob?: number; gargalo?: string } | undefined;
        return {
            id: l.id,
            nome: l.nome,
            telefone: l.telefone,
            etapa: normalizeCRMStatus(l.status),
            origem: (l.source || l.origem || null),
            interesse: l.interesse_principal,
            cidade: l.cidade,
            estado: l.estado,
            quantidadeAnimais: l.quantidade_animais,
            mql: l.is_mql === true,
            cadastroStatus: typeof xd.cadastro_status === 'string' ? xd.cadastro_status : (xd.cadastro_aprovado === true ? 'aprovado' : null),
            prontidao: score && typeof score.prob === 'number' ? score.prob : null,
            gargalo: score?.gargalo ?? null,
            criadoEm: l.created_at,
        };
    });
}
