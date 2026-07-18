'use client';

/**
 * Aba "Auditoria IA" — resumos e avaliação das conversas do atendimento,
 * gerados pelo auditor noturno (crm_conversa_auditorias). Substituiu a aba
 * Planilha (18/07/2026). Piores conduções primeiro: é onde está o trabalho.
 */
import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle, Bot, Loader2, MessageSquareText, RefreshCw, Sparkles, TrendingUp,
} from 'lucide-react';
import {
    getAuditoriaDias, getAuditorias, rodarAuditoria,
    type AuditoriaDia, type AuditoriaRow,
} from '@/app/sistema/actions/auditoria';

const FALHA_LABEL: Record<string, string> = {
    pergunta_redundante: 'Pergunta redundante',
    nao_pediu_sim: 'Não pediu o "sim"',
    nao_pediu_dados: 'Não pediu os dados',
    fase_errada: 'Fase errada',
    tom: 'Tom fora do padrão',
    oferta_assessor_cedo: 'Ofereceu assessor cedo',
    resposta_ruim: 'Resposta ruim',
    oportunidade_perdida: 'Oportunidade perdida',
    outro: 'Outro',
};

const FASE_LABEL: Record<string, string> = {
    descoberta: 'Descoberta',
    apresentacao: 'Apresentação',
    habilitacao: 'Habilitação',
    analise: 'Em análise',
    perdido: 'Perdido',
    fora_de_escopo: 'Fora de escopo',
};

function hojeMS(): string {
    return new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
}

function scoreClasses(score: number | null): string {
    if (score == null) return 'bg-gray-500/15 text-gray-400';
    if (score >= 8) return 'bg-emerald-500/15 text-emerald-500';
    if (score >= 5) return 'bg-amber-500/15 text-amber-500';
    return 'bg-red-500/15 text-red-500';
}

export function CRMAuditoriaView({ onOpenLead }: { onOpenLead?: (leadId: string) => void }) {
    const [dias, setDias] = useState<AuditoriaDia[]>([]);
    const [dia, setDia] = useState<string>(hojeMS());
    const [rows, setRows] = useState<AuditoriaRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    const loadDias = useCallback(async () => {
        try {
            const d = await getAuditoriaDias();
            setDias(d);
            if (d.length && !d.some(x => x.dia === dia)) setDia(d[0].dia);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar dias.');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadRows = useCallback(async (d: string) => {
        setLoading(true);
        setError(null);
        try {
            setRows(await getAuditorias(d));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao carregar auditorias.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadDias(); }, [loadDias]);
    useEffect(() => { loadRows(dia); }, [dia, loadRows]);

    async function handleRodar() {
        setRunning(true);
        setError(null);
        setInfo(null);
        try {
            const r = await rodarAuditoria(dia);
            setInfo(`Auditadas ${r.auditadas} conversa(s)${r.erros ? ` · ${r.erros} erro(s)` : ''}.`);
            await Promise.all([loadRows(dia), loadDias()]);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao rodar auditoria.');
        } finally {
            setRunning(false);
        }
    }

    const diaInfo = dias.find(d => d.dia === dia);
    const comFalha = rows.filter(r => (r.falhas?.length ?? 0) > 0).length;
    const destaques = rows.filter(r => r.destaque).length;

    return (
        <div className="max-w-5xl space-y-4 pb-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Bot size={14} className="text-[#A68B4B] shrink-0" />
                    Auditor noturno: cada conversa do dia é avaliada contra o playbook de habilitação.
                    Roda sozinho de madrugada — ou agora, pelo botão.
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={dia}
                        onChange={e => setDia(e.target.value)}
                        className="rounded-lg border border-gray-700/40 bg-transparent px-2 py-1.5 text-sm"
                    >
                        {!dias.some(d => d.dia === hojeMS()) && (
                            <option value={hojeMS()}>{hojeMS()} (hoje)</option>
                        )}
                        {dias.map(d => (
                            <option key={d.dia} value={d.dia}>
                                {d.dia} · {d.total} conversa{d.total === 1 ? '' : 's'}
                                {d.scoreMedio != null ? ` · média ${d.scoreMedio}` : ''}
                            </option>
                        ))}
                    </select>
                    <button className="btn primary" onClick={handleRodar} disabled={running}>
                        {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        {running ? 'Auditando…' : 'Auditar este dia'}
                    </button>
                </div>
            </div>

            {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</div>}
            {info && <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">{info}</div>}

            {diaInfo && (
                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1"><MessageSquareText size={13} /> {rows.length} conversas auditadas</span>
                    <span className="inline-flex items-center gap-1"><TrendingUp size={13} /> score médio {diaInfo.scoreMedio ?? '—'}</span>
                    <span className="inline-flex items-center gap-1"><AlertTriangle size={13} /> {comFalha} com falhas</span>
                    <span className="inline-flex items-center gap-1"><Sparkles size={13} /> {destaques} destaques</span>
                </div>
            )}

            {loading && (
                <div className="flex items-center justify-center py-16 text-gray-500">
                    <Loader2 size={20} className="animate-spin" />
                </div>
            )}

            {!loading && rows.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-700/40 px-4 py-10 text-center text-sm text-gray-500">
                    Nenhuma auditoria para {dia}. Clique em “Auditar este dia” para gerar agora
                    (só entram conversas em que o lead respondeu).
                </div>
            )}

            <div className="space-y-3">
                {rows.map(r => (
                    <div key={r.id} className="rounded-xl border border-gray-700/30 p-4 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-2 text-sm font-bold ${scoreClasses(r.score)}`}>
                                {r.score ?? '—'}
                            </span>
                            <button
                                type="button"
                                onClick={() => r.lead_id && onOpenLead?.(r.lead_id)}
                                className={`text-sm font-semibold ${r.lead_id ? 'hover:underline' : 'cursor-default'}`}
                            >
                                {r.lead_nome || r.phone}
                            </button>
                            <span className="text-xs text-gray-500">{r.phone}</span>
                            {r.fase_final && (
                                <span className="rounded-full bg-gray-500/10 px-2 py-0.5 text-xs text-gray-400">
                                    {FASE_LABEL[r.fase_final] ?? r.fase_final}
                                </span>
                            )}
                            <span className="ml-auto text-xs text-gray-500">
                                {r.msgs_lead}× lead · {r.msgs_bot}× IA
                            </span>
                        </div>

                        {r.resumo && <p className="text-sm text-gray-300">{r.resumo}</p>}

                        {(r.falhas?.length ?? 0) > 0 && (
                            <ul className="space-y-1">
                                {r.falhas.map((f, i) => (
                                    <li key={i} className="flex items-start gap-2 text-xs text-amber-500/90">
                                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                                        <span>
                                            <b>{FALHA_LABEL[f.tipo] ?? f.tipo}:</b> {f.detalhe}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {r.trava && (
                            <p className="text-xs text-red-400/90"><b>Trava:</b> {r.trava}</p>
                        )}
                        {r.proxima_acao && (
                            <p className="text-xs text-emerald-500/90"><b>Próxima ação:</b> {r.proxima_acao}</p>
                        )}
                        {r.destaque && (
                            <p className="text-xs text-gray-500 border-l-2 border-[#A68B4B]/50 pl-2">
                                <Sparkles size={11} className="inline mr-1 text-[#A68B4B]" />
                                Resposta exemplar: “{r.destaque}”
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
