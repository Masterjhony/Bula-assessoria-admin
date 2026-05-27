'use client';

import { useMemo } from 'react';
import { CRMLead } from '@/app/sistema/actions/crm-leads';
import type { CRMConfig } from '@/lib/crm-types';
import { isQualificationStage, getStageColorHex } from '@/lib/crm-types';
import { Crown, Beef, MapPin, Phone, ChevronRight } from 'lucide-react';

interface CRMPreferenciaisStripProps {
    leads: CRMLead[];
    crmConfig: CRMConfig;
    onOpenLead: (lead: CRMLead) => void;
}

function parseAnimaisCount(s?: string | null): number {
    if (!s) return 0;
    const match = s.match(/\d{2,}/);
    return match ? Number(match[0]) : 0;
}

export function CRMPreferenciaisStrip({ leads, crmConfig, onOpenLead }: CRMPreferenciaisStripProps) {
    const stageMap = useMemo(() => {
        const m = new Map<string, { color: string; isQualification: boolean }>();
        for (const s of crmConfig.stages) m.set(s.name, { color: getStageColorHex(s.color), isQualification: isQualificationStage(s) });
        return m;
    }, [crmConfig.stages]);

    const preferenciais = useMemo(() => {
        const advanced = leads.filter(l => {
            const s = stageMap.get(l.status);
            return s ? !s.isQualification : true;
        });

        // 1) flag explícita; 2) heurística: alto valor estimado OU muitas cabeçinhas
        const flagged = advanced.filter(l => l.is_preferencial === true);
        const candidates = advanced
            .filter(l => l.is_preferencial !== true)
            .map(l => ({ lead: l, animais: parseAnimaisCount(l.quantidade_animais), valor: Number(l.valor_estimado) || 0 }))
            .filter(x => x.animais >= 200 || x.valor >= 50000)
            .sort((a, b) => (b.valor + b.animais * 100) - (a.valor + a.animais * 100))
            .slice(0, Math.max(0, 6 - flagged.length))
            .map(x => x.lead);

        return [...flagged, ...candidates].slice(0, 8);
    }, [leads, stageMap]);

    if (preferenciais.length === 0) return null;

    return (
        <div className="rounded-2xl border border-[#A68B4B]/30 bg-gradient-to-br from-[#A68B4B]/8 via-[#A68B4B]/3 to-transparent p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#A68B4B] flex items-center justify-center shadow-md shadow-[#A68B4B]/30">
                        <Crown size={16} className="text-black" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">Leads preferenciais</h3>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                            Maiores e mais quentes — atendimento prioritário
                        </p>
                    </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#A68B4B] bg-[#A68B4B]/10 px-2.5 py-1 rounded-full">
                    {preferenciais.length} destacado{preferenciais.length > 1 ? 's' : ''}
                </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {preferenciais.map(lead => {
                    const stage = stageMap.get(lead.status);
                    const animais = parseAnimaisCount(lead.quantidade_animais);
                    return (
                        <button
                            key={lead.id}
                            type="button"
                            onClick={() => onOpenLead(lead)}
                            className="group text-left bg-white dark:bg-[#1A1A1A] border border-[#A68B4B]/20 hover:border-[#A68B4B]/60 hover:shadow-lg hover:shadow-[#A68B4B]/10 rounded-xl p-3 transition-all"
                        >
                            <div className="flex items-start gap-2">
                                <div className="w-1 self-stretch rounded-full" style={{ background: stage?.color || '#A68B4B' }} />
                                <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-start justify-between gap-1">
                                        <p className="font-bold text-sm text-gray-900 dark:text-white leading-tight line-clamp-1">
                                            {lead.nome}
                                        </p>
                                        {lead.is_preferencial && <Crown size={11} className="text-[#A68B4B] flex-shrink-0 mt-0.5" />}
                                    </div>

                                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                                        {animais > 0 && (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold">
                                                <Beef size={9} /> {animais.toLocaleString('pt-BR')}
                                            </span>
                                        )}
                                        {(lead.estado || lead.cidade) && (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                                                <MapPin size={9} /> {lead.estado || lead.cidade}
                                            </span>
                                        )}
                                        {lead.celular && (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                                                <Phone size={9} />
                                            </span>
                                        )}
                                    </div>

                                    {(lead.o_que_busca || lead.interesse) && (
                                        <p className="text-[10px] text-gray-500 line-clamp-1">
                                            {lead.o_que_busca || lead.interesse}
                                        </p>
                                    )}

                                    <div className="flex items-center justify-between pt-1">
                                        <span
                                            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                            style={{ background: (stage?.color || '#A68B4B') + '20', color: stage?.color || '#A68B4B' }}
                                        >
                                            {lead.status}
                                        </span>
                                        <ChevronRight size={11} className="text-gray-400 group-hover:text-[#A68B4B] transition-colors" />
                                    </div>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
