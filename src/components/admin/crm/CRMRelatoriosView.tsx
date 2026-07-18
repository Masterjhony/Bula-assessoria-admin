'use client';

/**
 * Aba RELATÓRIOS — governança do CRM em uma tela: funil, atendimento,
 * habilitação, termômetro (equação de conversão), qualidade da IA e
 * relatórios linha a linha (conversas e leads) com export XLSX.
 * Gráficos de série única em um só matiz (dourado) com rótulos diretos.
 */
import { useCallback, useEffect, useState } from 'react';
import {
    BarChart3, Download, Loader2, MessageSquareText, RefreshCw, Users,
} from 'lucide-react';
import {
    getCrmRelatorios, getRelatorioConversas, getRelatorioLeads,
    type CrmRelatorios, type RelatorioBucket, type RelatorioConversaRow, type RelatorioLeadRow,
} from '@/app/sistema/actions/relatorios';

const GOLD = '#A68B4B';

const GARGALO_LABEL: Record<string, string> = {
    valor: 'Valor percebido', confianca: 'Confiança', facilidade: 'Facilidade',
    momento: 'Momento', progresso: 'Progresso', atrito: 'Atrito restante',
};
const FALHA_LABEL: Record<string, string> = {
    pergunta_redundante: 'Pergunta redundante', nao_pediu_sim: 'Não pediu o "sim"',
    nao_pediu_dados: 'Não pediu os dados', fase_errada: 'Fase errada', tom: 'Tom fora do padrão',
    oferta_assessor_cedo: 'Assessor cedo demais', resposta_ruim: 'Resposta ruim',
    oportunidade_perdida: 'Oportunidade perdida', outro: 'Outro',
};
const CAD_LABEL: Record<string, string> = {
    nao_iniciado: 'Não iniciado', solicitado: 'Solicitado', em_analise: 'Em análise',
    pendente: 'Pendente', aprovado: 'Aprovado', recusado: 'Recusado',
};

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
    return (
        <div className="rounded-xl border border-gray-700/30 px-4 py-3 min-w-[130px]">
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-gray-500">{label}</div>
            {hint && <div className="text-[10px] text-gray-600 mt-0.5">{hint}</div>}
        </div>
    );
}

/** Barras horizontais de série única (magnitude), rótulo direto em texto. */
function Bars({ data, labelMap, titulo }: { data: RelatorioBucket[]; labelMap?: Record<string, string>; titulo: string }) {
    const max = Math.max(1, ...data.map(d => d.total));
    return (
        <div className="rounded-xl border border-gray-700/30 p-4">
            <h3 className="text-sm font-semibold mb-3">{titulo}</h3>
            {data.length === 0 && <div className="text-xs text-gray-500">Sem dados no período.</div>}
            <div className="space-y-2">
                {data.map(d => (
                    <div key={d.label} className="flex items-center gap-2" title={`${labelMap?.[d.label] ?? d.label}: ${d.total}`}>
                        <span className="w-40 shrink-0 truncate text-xs text-gray-400">{labelMap?.[d.label] ?? d.label}</span>
                        <div className="flex-1 h-4 rounded-[4px] bg-gray-500/10 overflow-hidden">
                            <div className="h-full rounded-[4px]" style={{ width: `${(d.total / max) * 100}%`, background: GOLD }} />
                        </div>
                        <span className="w-14 shrink-0 text-right text-xs tabular-nums text-gray-300">{d.total.toLocaleString('pt-BR')}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Colunas diárias de série única com rótulo no pico (sparkline de barras). */
function MiniSerie({ titulo, dias, valores }: { titulo: string; dias: string[]; valores: number[] }) {
    const max = Math.max(1, ...valores);
    const total = valores.reduce((a, b) => a + b, 0);
    return (
        <div className="rounded-xl border border-gray-700/30 p-4">
            <h3 className="text-sm font-semibold mb-1">{titulo}</h3>
            <div className="text-xs text-gray-500 mb-2">total {total.toLocaleString('pt-BR')} · pico {max.toLocaleString('pt-BR')}</div>
            <div className="flex items-end gap-[2px] h-16">
                {valores.map((v, i) => (
                    <div
                        key={i}
                        className="flex-1 rounded-t-[3px] min-w-[3px]"
                        style={{ height: `${(v / max) * 100}%`, background: GOLD, opacity: v === 0 ? 0.15 : 0.9 }}
                        title={`${dias[i]}: ${v}`}
                    />
                ))}
            </div>
        </div>
    );
}

async function exportXLSX(nome: string, rows: Record<string, unknown>[]) {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
    XLSX.writeFile(wb, `${nome}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function CRMRelatoriosView() {
    const [dias, setDias] = useState(30);
    const [rel, setRel] = useState<CrmRelatorios | null>(null);
    const [conversas, setConversas] = useState<RelatorioConversaRow[]>([]);
    const [leadsRows, setLeadsRows] = useState<RelatorioLeadRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [exporting, setExporting] = useState<string | null>(null);

    const load = useCallback(async (d: number) => {
        setLoading(true);
        setError(null);
        try {
            const [r, c, l] = await Promise.all([
                getCrmRelatorios(d), getRelatorioConversas(d), getRelatorioLeads(d),
            ]);
            setRel(r); setConversas(c); setLeadsRows(l);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao gerar relatórios.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(dias); }, [dias, load]);

    async function baixarConversas() {
        setExporting('conversas');
        try {
            await exportXLSX('relatorio-conversas', conversas.map(c => ({
                Telefone: c.phone, Nome: c.nome ?? '', 'Msgs do lead': c.msgsLead, 'Msgs nossas': c.msgsNossas,
                Respondeu: c.respondeu ? 'sim' : 'não', 'Primeira msg': c.primeira.slice(0, 16).replace('T', ' '),
                'Última msg': c.ultima.slice(0, 16).replace('T', ' '), 'Score IA': c.scoreAuditoria ?? '',
                Resumo: c.resumoAuditoria ?? '', Trava: c.trava ?? '', 'Próxima ação': c.proximaAcao ?? '',
            })));
        } finally { setExporting(null); }
    }
    async function baixarLeads() {
        setExporting('leads');
        try {
            await exportXLSX('relatorio-leads', leadsRows.map(l => ({
                Nome: l.nome ?? '', Telefone: l.telefone ?? '', Etapa: l.etapa, Origem: l.origem ?? '',
                Interesse: l.interesse ?? '', Cidade: l.cidade ?? '', UF: l.estado ?? '',
                Cabeças: l.quantidadeAnimais ?? '', MQL: l.mql ? 'sim' : 'não',
                'Status cadastro': l.cadastroStatus ?? '', 'Prontidão %': l.prontidao != null ? Math.round(l.prontidao * 100) : '',
                Gargalo: l.gargalo ?? '', 'Criado em': l.criadoEm.slice(0, 16).replace('T', ' '),
            })));
        } finally { setExporting(null); }
    }

    return (
        <div className="max-w-6xl space-y-4 pb-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <BarChart3 size={14} className="text-[#A68B4B] shrink-0" />
                    Governança do CRM: funil, atendimento, habilitação, termômetro e qualidade da IA — tudo do banco, nada estimado.
                </div>
                <div className="flex items-center gap-2">
                    {[7, 30, 90].map(d => (
                        <button
                            key={d}
                            onClick={() => setDias(d)}
                            className={`rounded-lg border px-3 py-1.5 text-sm ${dias === d ? 'border-[#A68B4B] text-[#A68B4B]' : 'border-gray-700/40 text-gray-400'}`}
                        >
                            {d}d
                        </button>
                    ))}
                    <button className="btn primary" onClick={() => load(dias)} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Atualizar
                    </button>
                </div>
            </div>

            {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</div>}
            {loading && !rel && (
                <div className="flex items-center justify-center py-16 text-gray-500"><Loader2 size={20} className="animate-spin" /></div>
            )}

            {rel && (
                <>
                    {/* Visão geral */}
                    <div className="flex flex-wrap gap-3">
                        <Tile label="Leads ativos" value={rel.leadsAtivos.toLocaleString('pt-BR')} />
                        <Tile label={`Novos (${rel.periodoDias}d)`} value={rel.novosNoPeriodo.toLocaleString('pt-BR')} />
                        <Tile label={`Taxa de resposta (${rel.periodoDias}d)`} value={`${rel.atendimento.pct}%`} hint={`${rel.atendimento.responderam}/${rel.atendimento.disparados} abordados`} />
                        <Tile label="Aceitaram assessoria" value={rel.habilitacao.aceitaramAssessoria} />
                        <Tile label="Cadastros aprovados" value={rel.habilitacao.aprovados} />
                        <Tile label={`Score IA (${rel.periodoDias}d)`} value={rel.auditoria.scoreMedioGeral ?? '—'} hint={`${rel.auditoria.totalConversas} conversas auditadas`} />
                        <Tile label="MQL ativos" value={rel.mqlAtivos.toLocaleString('pt-BR')} />
                        <Tile label="Contexto incorreto" value={rel.contextoIncorreto} hint="números suprimidos" />
                    </div>

                    {/* Funil + origens */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <Bars titulo="Funil por etapa (base ativa)" data={rel.funil.map(f => ({ label: f.etapa, total: f.total }))} />
                        <Bars titulo="Leads por origem (top 8)" data={rel.topOrigens} />
                    </div>

                    {/* Atendimento */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <MiniSerie titulo={`Pessoas abordadas por dia (${rel.periodoDias}d)`} dias={rel.atendimento.serieDias} valores={rel.atendimento.serieContatados} />
                        <MiniSerie titulo="Responderam (≤72h do disparo)" dias={rel.atendimento.serieDias} valores={rel.atendimento.serieResponderam} />
                    </div>
                    <div className="rounded-xl border border-gray-700/30 p-4">
                        <h3 className="text-sm font-semibold mb-3">Taxa de resposta por origem de disparo</h3>
                        <div className="space-y-2">
                            {rel.atendimento.porOrigem.map(o => (
                                <div key={o.origin} className="flex items-center gap-2" title={`${o.origin}: ${o.responderam}/${o.enviados} (${o.pct}%)`}>
                                    <span className="w-52 shrink-0 truncate text-xs text-gray-400">{o.origin}</span>
                                    <div className="flex-1 h-4 rounded-[4px] bg-gray-500/10 overflow-hidden">
                                        <div className="h-full rounded-[4px]" style={{ width: `${Math.min(100, o.pct)}%`, background: GOLD }} />
                                    </div>
                                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-gray-300">{o.pct}% · {o.responderam}/{o.enviados}</span>
                                </div>
                            ))}
                            {rel.atendimento.porOrigem.length === 0 && <div className="text-xs text-gray-500">Sem disparos no período.</div>}
                        </div>
                    </div>

                    {/* Habilitação + termômetro */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-4">
                            <div className="rounded-xl border border-gray-700/30 p-4">
                                <h3 className="text-sm font-semibold mb-3">Funil de habilitação</h3>
                                <div className="flex flex-wrap gap-3">
                                    <Tile label={'Aceitaram o "sim"'} value={rel.habilitacao.aceitaramAssessoria} />
                                    <Tile label="Submetidos" value={rel.habilitacao.submetidos} />
                                    <Tile label="Aprovados" value={rel.habilitacao.aprovados} />
                                </div>
                            </div>
                            <Bars titulo="Status de cadastro (quem iniciou)" data={rel.habilitacao.cadastroStatus} labelMap={CAD_LABEL} />
                        </div>
                        <div className="space-y-4">
                            <Bars titulo={`Prontidão da base conversada (${rel.prontidao.comScore} com termômetro)`} data={rel.prontidao.buckets} />
                            <Bars titulo="Gargalo dominante (o que está segurando cada lead)" data={rel.prontidao.gargalos} labelMap={GARGALO_LABEL} />
                        </div>
                    </div>

                    {/* Auditoria IA */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <MiniSerie
                            titulo="Score médio da IA por dia (0-10)"
                            dias={rel.auditoria.porDia.map(d => d.dia.slice(5))}
                            valores={rel.auditoria.porDia.map(d => d.media)}
                        />
                        <Bars titulo="Falhas de condução por tipo" data={rel.auditoria.falhasPorTipo} labelMap={FALHA_LABEL} />
                    </div>

                    {/* Relatório de conversas */}
                    <div className="rounded-xl border border-gray-700/30 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <h3 className="text-sm font-semibold inline-flex items-center gap-2">
                                <MessageSquareText size={14} className="text-[#A68B4B]" />
                                Relatório de conversas ({conversas.length} no período)
                            </h3>
                            <button className="btn" onClick={baixarConversas} disabled={exporting !== null}>
                                {exporting === 'conversas' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                Baixar XLSX
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-left text-gray-500">
                                        <th className="py-1 pr-3">Contato</th><th className="py-1 pr-3">Lead×IA</th>
                                        <th className="py-1 pr-3">Respondeu</th><th className="py-1 pr-3">Score IA</th>
                                        <th className="py-1 pr-3">Última msg</th><th className="py-1">Resumo / trava</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {conversas.slice(0, 30).map(c => (
                                        <tr key={c.phone} className="border-t border-gray-700/20 align-top">
                                            <td className="py-1.5 pr-3 whitespace-nowrap">{c.nome || c.phone}</td>
                                            <td className="py-1.5 pr-3 tabular-nums">{c.msgsLead}×{c.msgsNossas}</td>
                                            <td className="py-1.5 pr-3">{c.respondeu ? 'sim' : '—'}</td>
                                            <td className="py-1.5 pr-3 tabular-nums">{c.scoreAuditoria ?? '—'}</td>
                                            <td className="py-1.5 pr-3 whitespace-nowrap">{c.ultima.slice(5, 16).replace('T', ' ')}</td>
                                            <td className="py-1.5 text-gray-400">{(c.trava || c.resumoAuditoria || '').slice(0, 120)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {conversas.length > 30 && <div className="text-[11px] text-gray-600 mt-2">Mostrando 30 de {conversas.length} — o XLSX traz tudo.</div>}
                        </div>
                    </div>

                    {/* Relatório de leads */}
                    <div className="rounded-xl border border-gray-700/30 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <h3 className="text-sm font-semibold inline-flex items-center gap-2">
                                <Users size={14} className="text-[#A68B4B]" />
                                Relatório de leads novos ({leadsRows.length} no período)
                            </h3>
                            <button className="btn" onClick={baixarLeads} disabled={exporting !== null}>
                                {exporting === 'leads' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                Baixar XLSX
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-left text-gray-500">
                                        <th className="py-1 pr-3">Nome</th><th className="py-1 pr-3">Etapa</th>
                                        <th className="py-1 pr-3">Origem</th><th className="py-1 pr-3">Interesse</th>
                                        <th className="py-1 pr-3">UF</th><th className="py-1 pr-3">Prontidão</th>
                                        <th className="py-1">Criado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leadsRows.slice(0, 30).map(l => (
                                        <tr key={l.id} className="border-t border-gray-700/20">
                                            <td className="py-1.5 pr-3 whitespace-nowrap">{l.nome || l.telefone || '—'}</td>
                                            <td className="py-1.5 pr-3">{l.etapa}</td>
                                            <td className="py-1.5 pr-3 truncate max-w-[160px]">{l.origem ?? '—'}</td>
                                            <td className="py-1.5 pr-3">{l.interesse ?? '—'}</td>
                                            <td className="py-1.5 pr-3">{l.estado ?? '—'}</td>
                                            <td className="py-1.5 pr-3 tabular-nums">{l.prontidao != null ? `${Math.round(l.prontidao * 100)}%` : '—'}</td>
                                            <td className="py-1.5 whitespace-nowrap">{l.criadoEm.slice(5, 16).replace('T', ' ')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {leadsRows.length > 30 && <div className="text-[11px] text-gray-600 mt-2">Mostrando 30 de {leadsRows.length} — o XLSX traz tudo.</div>}
                        </div>
                    </div>

                    <div className="text-[11px] text-gray-600">Gerado em {new Date(rel.geradoEm).toLocaleString('pt-BR')} · janela de {rel.periodoDias} dias.</div>
                </>
            )}
        </div>
    );
}
