'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import {
    ASSESSOR_NOTIFICATION_STAGE,
    CRMConfig,
    CRMCustomField,
    CRMFunnel,
    CRMResponsavel,
    CRMStage,
    DEFAULT_CRM_CONFIG,
    DEFAULT_FUNNEL,
    DEFAULT_STAGES,
} from '@/lib/crm-types';

function mergeStages(funnels: CRMFunnel[], fallback: CRMStage[]): CRMStage[] {
    const merged: CRMStage[] = [];
    const seen = new Set<string>();

    const add = (stage: CRMStage) => {
        const key = (stage.name || stage.id).trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(stage);
    };

    for (const stage of fallback) add(stage);
    for (const funnel of funnels) {
        for (const stage of funnel.stages || []) add(stage);
    }

    if (!merged.some(s => s.name === ASSESSOR_NOTIFICATION_STAGE)) {
        const idx = Math.max(0, merged.findIndex(s => s.name === 'Qualificado'));
        merged.splice(idx + 1, 0, {
            id: 'Direcionamento Leilao',
            name: ASSESSOR_NOTIFICATION_STAGE,
            color: 'cyan',
            probability: 35,
        });
    }

    return merged.length ? merged : DEFAULT_STAGES;
}

function mergeCustomFields(funnels: CRMFunnel[], fallback: CRMCustomField[]): CRMCustomField[] {
    const merged: CRMCustomField[] = [];
    const seen = new Set<string>();

    const add = (field: CRMCustomField) => {
        const key = (field.id || field.label).trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(field);
    };

    for (const field of fallback) add(field);
    for (const funnel of funnels) {
        for (const field of funnel.custom_fields || []) add(field);
    }

    return merged;
}

function normalizeResponsaveis(responsaveis?: CRMResponsavel[]): CRMResponsavel[] {
    return (responsaveis || []).map((r) => ({
        ...r,
        active: r.active !== false,
    }));
}

function normalizeUnifiedConfig(raw: Partial<CRMConfig> | CRMConfig | null | undefined): CRMConfig {
    const storedFunnels = raw?.funnels?.length ? raw.funnels : [];
    const base = storedFunnels[0] ?? DEFAULT_FUNNEL;
    const fallbackStages = base.stages?.length
        ? base.stages
        : (raw?.stages?.length ? raw.stages : DEFAULT_STAGES);
    const fallbackFields = base.custom_fields?.length
        ? base.custom_fields
        : (raw?.custom_fields || []);

    const stages = mergeStages(storedFunnels, fallbackStages);
    const custom_fields = mergeCustomFields(storedFunnels, fallbackFields);
    const legacyName = base.name === 'Funil JMP' || base.name === 'Pipeline Principal';

    const unified: CRMFunnel = {
        ...base,
        id: DEFAULT_FUNNEL.id,
        name: legacyName ? DEFAULT_FUNNEL.name : (base.name || DEFAULT_FUNNEL.name),
        color: base.color || DEFAULT_FUNNEL.color,
        stages,
        custom_fields,
        mql_rule: base.mql_rule ?? storedFunnels.find(f => f.mql_rule)?.mql_rule ?? DEFAULT_FUNNEL.mql_rule,
    };

    return {
        stages,
        custom_fields,
        funnels: [unified],
        responsaveis: normalizeResponsaveis(raw?.responsaveis),
    };
}

export async function getCRMConfig(): Promise<CRMConfig> {
    const supabase = await createClient();

    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'crm_config')
        .single();

    if (!data?.value) return DEFAULT_CRM_CONFIG;
    return normalizeUnifiedConfig(data.value as Partial<CRMConfig>);
}

export async function saveCRMConfig(config: CRMConfig): Promise<void> {
    const supabase = await createClient();
    const normalized = normalizeUnifiedConfig(config);

    const { error } = await supabase
        .from('site_settings')
        .upsert(
            { key: 'crm_config', value: normalized, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
        );

    if (error) throw new Error(`Error saving CRM config: ${error.message}`);

    revalidatePath('/web-admin/crm');
    revalidatePath('/sistema/crm');
}

/**
 * Renomeia uma etapa do funil unificado e propaga para todos os leads com esse
 * status. O `funnelId` segue no contrato para compatibilidade com componentes
 * existentes.
 */
export async function renameStage(funnelId: string, stageId: string, newName: string): Promise<CRMConfig> {
    const supabase = await createClient();
    const trimmed = newName.trim();
    const current = await getCRMConfig();

    const funnel = current.funnels.find(f => f.id === funnelId) ?? current.funnels[0];
    if (!funnel) throw new Error('Funil não encontrado.');
    const stage = funnel.stages.find(s => s.id === stageId);
    if (!stage) throw new Error('Etapa não encontrada.');

    const oldName = stage.name;
    if (!trimmed || trimmed === oldName) return current;

    const conflict = funnel.stages.some(s => s.id !== stageId && s.name === trimmed);
    if (conflict) throw new Error(`Já existe uma etapa chamada "${trimmed}" neste funil.`);

    const { error: leadsErr } = await supabase
        .from('crm_leads')
        .update({ status: trimmed })
        .eq('status', oldName);
    if (leadsErr) throw new Error(`Error renaming lead statuses: ${leadsErr.message}`);

    const newFunnels = current.funnels.map(f =>
        f.id === funnel.id
            ? { ...f, stages: f.stages.map(s => (s.id === stageId ? { ...s, name: trimmed } : s)) }
            : f
    );
    const newConfig = normalizeUnifiedConfig({
        ...current,
        funnels: newFunnels,
        stages: newFunnels[0]?.stages ?? current.stages,
    });

    const { error: cfgErr } = await supabase
        .from('site_settings')
        .upsert(
            { key: 'crm_config', value: newConfig, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
        );
    if (cfgErr) throw new Error(`Error saving CRM config: ${cfgErr.message}`);

    revalidatePath('/web-admin/crm');
    revalidatePath('/sistema/crm');
    return newConfig;
}
