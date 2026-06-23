'use client';

import { useState } from 'react';
import {
    Archive, CheckCircle2, DatabaseZap, FileSpreadsheet, Loader2, RefreshCw, Palette, ArrowRight,
} from 'lucide-react';
import {
    archiveObviousTestLeads,
    importMissingLeadsFromSheet,
    validateLeadsAgainstSheet,
    syncSheetColorsToCrm,
    type CRMLeadSheetValidation,
    type CRMColorSyncResult,
} from '@/app/sistema/actions/crm-leads';

export function CRMValidationView() {
    const [validation, setValidation] = useState<CRMLeadSheetValidation | null>(null);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [archiving, setArchiving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Sincronização por cor da planilha (Leads JMP) + cadastros (Cadastro JMP).
    const [colorSync, setColorSync] = useState<CRMColorSyncResult | null>(null);
    const [colorPreviewing, setColorPreviewing] = useState(false);
    const [colorApplying, setColorApplying] = useState(false);

    async function previewColorSync() {
        setColorPreviewing(true);
        setError(null);
        setMessage(null);
        try {
            setColorSync(await syncSheetColorsToCrm(false));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao prever sincronização por cor.');
        } finally {
            setColorPreviewing(false);
        }
    }

    async function applyColorSync() {
        setColorApplying(true);
        setError(null);
        setMessage(null);
        try {
            const result = await syncSheetColorsToCrm(true);
            setColorSync(result);
            const c = result.cadastros;
            setMessage(
                `${result.changes.length} status atualizado(s) pela cor · ` +
                `cadastros: ${c.matched} casado(s), ${c.created} criado(s), ${c.aprovados} aprovado(s) → cliente.`,
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao aplicar sincronização por cor.');
        } finally {
            setColorApplying(false);
        }
    }

    async function runValidation() {
        setLoading(true);
        setError(null);
        setMessage(null);
        try {
            setValidation(await validateLeadsAgainstSheet());
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao validar planilha.');
        } finally {
            setLoading(false);
        }
    }

    async function importMissing() {
        setImporting(true);
        setError(null);
        setMessage(null);
        try {
            const result = await importMissingLeadsFromSheet();
            setValidation(result.validation);
            setMessage(`${result.created} lead(s) importado(s) da planilha para o CRM.`);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao importar leads.');
        } finally {
            setImporting(false);
        }
    }

    async function archiveTests() {
        setArchiving(true);
        setError(null);
        setMessage(null);
        try {
            const result = await archiveObviousTestLeads();
            setMessage(`${result.archived} lead(s) de teste arquivado(s).`);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Erro ao arquivar testes.');
        } finally {
            setArchiving(false);
        }
    }

    return (
        <div className="max-w-5xl space-y-4 pb-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <FileSpreadsheet size={14} />
                    <span>Conferência da planilha de leads contra os registros do CRM.</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={runValidation} disabled={loading} className="btn ghost">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Validar
                    </button>
                    <button onClick={importMissing} disabled={importing || !validation || validation.missing.length === 0} className="btn primary">
                        {importing ? <Loader2 size={14} className="animate-spin" /> : <DatabaseZap size={14} />}
                        Importar faltantes
                    </button>
                    <button onClick={archiveTests} disabled={archiving} className="btn ghost">
                        {archiving ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                        Arquivar testes
                    </button>
                </div>
            </div>

            {message && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={15} /> {message}
                </div>
            )}
            {error && (
                <div className="px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-600 dark:text-red-400">
                    {error}
                </div>
            )}

            {/* Sincronização por cor */}
            <section className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A] rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-2 text-xs text-gray-500 max-w-xl">
                        <Palette size={15} className="text-[#A68B4B] mt-0.5 shrink-0" />
                        <span>
                            Sincroniza o estágio dos leads pela cor da planilha <strong>Leads JMP</strong>
                            {' '}(branco→Entrada, vermelho→Conexão, amarelo→Qualificação, verde→Informações Captadas)
                            {' '}e processa os cadastros prontos da aba <strong>Cadastro JMP</strong>.
                            Movimentos feitos à mão no CRM são preservados.
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={previewColorSync} disabled={colorPreviewing || colorApplying} className="btn ghost">
                            {colorPreviewing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            Prever
                        </button>
                        <button onClick={applyColorSync} disabled={colorApplying || colorPreviewing} className="btn primary">
                            {colorApplying ? <Loader2 size={14} className="animate-spin" /> : <Palette size={14} />}
                            Sincronizar cores
                        </button>
                    </div>
                </div>

                {colorSync && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {[
                                ['Linhas', colorSync.totalSheetRows],
                                ['Coloridas', colorSync.totalColored],
                                [colorSync.applied ? 'Atualizados' : 'A atualizar', colorSync.changes.length],
                                ['Preservados (manual)', colorSync.skippedManual],
                                ['Coloridos sem CRM', colorSync.unmatchedColored],
                            ].map(([label, value]) => (
                                <div key={String(label)} className="rounded-xl border border-gray-200 dark:border-[#2A2A2A] p-3">
                                    <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
                                    <p className="text-[11px] text-gray-500 leading-tight">{label}</p>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-gray-500">
                            Cadastros (Cadastro JMP): {colorSync.cadastros.matched} casado(s)
                            {colorSync.applied && <> · {colorSync.cadastros.created} criado(s) · {colorSync.cadastros.aprovados} aprovado(s) → cliente</>}
                        </p>
                        {colorSync.changes.length > 0 && (
                            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#2A2A2A]">
                                <table className="w-full text-sm">
                                    <thead className="text-xs uppercase text-gray-400 bg-gray-50 dark:bg-[#141414]">
                                        <tr>
                                            <th className="text-left px-4 py-2">Lead</th>
                                            <th className="text-left px-4 py-2">Cor</th>
                                            <th className="text-left px-4 py-2">Mudança</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
                                        {colorSync.changes.slice(0, 100).map(ch => (
                                            <tr key={`${ch.leadId}-${ch.rowNumber}`}>
                                                <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{ch.nome || '-'}</td>
                                                <td className="px-4 py-2 text-gray-500">{ch.colorLabel}</td>
                                                <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        {ch.fromStatus} <ArrowRight size={12} className="text-[#A68B4B]" /> <strong>{ch.toStatus}</strong>
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </section>

            {!validation ? (
                <div className="rounded-2xl border border-dashed border-gray-200 dark:border-[#333] py-12 text-center text-gray-400">
                    <FileSpreadsheet size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Clique em Validar para comparar planilha e CRM.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            ['Linhas na planilha', validation.totalSheetRows],
                            ['Leads no CRM', validation.totalCrmLeads],
                            ['Faltando no CRM', validation.missing.length],
                            ['Com dados incompletos', validation.incomplete.length],
                        ].map(([label, value]) => (
                            <div key={String(label)} className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A] rounded-xl p-4">
                                <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
                                <p className="text-xs text-gray-500">{label}</p>
                            </div>
                        ))}
                    </div>

                    {validation.sheetUrl && (
                        <a href={validation.sheetUrl} target="_blank" rel="noreferrer" className="text-xs text-[#A68B4B] hover:underline">
                            Abrir planilha conectada
                        </a>
                    )}

                    <section className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A] rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200 dark:border-[#333]">
                            <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Linhas faltando no CRM</h3>
                        </div>
                        {validation.missing.length === 0 ? (
                            <div className="px-4 py-6 text-sm text-gray-400">Nenhuma linha faltando.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-xs uppercase text-gray-400 bg-gray-50 dark:bg-[#141414]">
                                        <tr>
                                            <th className="text-left px-4 py-2">Linha</th>
                                            <th className="text-left px-4 py-2">Nome</th>
                                            <th className="text-left px-4 py-2">Contato</th>
                                            <th className="text-left px-4 py-2">Cidade/UF</th>
                                            <th className="text-left px-4 py-2">Motivo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
                                        {validation.missing.slice(0, 100).map(row => (
                                            <tr key={row.rowNumber}>
                                                <td className="px-4 py-2 text-gray-500">{row.rowNumber}</td>
                                                <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">{row.nome || '-'}</td>
                                                <td className="px-4 py-2 text-gray-500">{row.whatsapp || row.email || '-'}</td>
                                                <td className="px-4 py-2 text-gray-500">{[row.cidade, row.uf].filter(Boolean).join(' / ') || '-'}</td>
                                                <td className="px-4 py-2 text-gray-500">{row.reason}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    <section className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#2A2A2A] rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200 dark:border-[#333]">
                            <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Dados que não puxaram completos</h3>
                        </div>
                        {validation.incomplete.length === 0 ? (
                            <div className="px-4 py-6 text-sm text-gray-400">Nenhum lead incompleto pela comparação.</div>
                        ) : (
                            <div className="divide-y divide-gray-100 dark:divide-[#2e2e2e]">
                                {validation.incomplete.slice(0, 100).map(row => (
                                    <div key={`${row.leadId}-${row.rowNumber}`} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-medium text-gray-900 dark:text-white">{row.nome}</p>
                                            <p className="text-xs text-gray-500">Linha {row.rowNumber}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {row.missingFields.map(field => (
                                                <span key={field} className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                                    {field}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
