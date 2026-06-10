'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { CRMConfig, CRMFunnel, DEFAULT_STAGES, DEFAULT_CRM_CONFIG, JMP_FUNNEL, JMP_FUNNEL_ID } from '@/lib/crm-types';

export async function getCRMConfig(): Promise<CRMConfig> {
    const supabase = await createClient();

    const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'crm_config')
        .single();

    if (!data?.value) return DEFAULT_CRM_CONFIG;

    const config = data.value as Partial<CRMConfig>;
    const stages = config.stages?.length ? config.stages : DEFAULT_STAGES;
    const custom_fields = config.custom_fields || [];

    // Migrate: if no funnels array, build one from existing stages/custom_fields
    let funnels: CRMFunnel[] = config.funnels || [];
    if (funnels.length === 0) {
        funnels = [{ id: 'default', name: 'Pipeline Principal', color: 'yellow', stages, custom_fields }];
    }

    // Garante o Funil JMP (sistema): mesmo que o admin nunca o tenha salvo, ele
    // precisa existir para o seletor de funil e para a regra de MQL dos leads da
    // landing. Idempotente — só adiciona se ausente; preserva edições do admin.
    if (!funnels.some(f => f.id === JMP_FUNNEL_ID)) {
        funnels = [...funnels, JMP_FUNNEL];
    }

    return {
        stages,
        custom_fields,
        funnels,
        responsaveis: config.responsaveis || [],
    };
}

export async function saveCRMConfig(config: CRMConfig): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
        .from('site_settings')
        .upsert(
            { key: 'crm_config', value: config, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
        );

    if (error) throw new Error(`Error saving CRM config: ${error.message}`);

    revalidatePath('/web-admin/crm');
}

/**
 * Renomeia uma etapa do CRM e propaga em duas direções:
 *  1. atualiza `crm_leads.status` (todos os leads que estavam na etapa antiga passam a apontar para o novo nome)
 *  2. renomeia o `name` da etapa em `crmConfig.stages` e em todos os funis (`funnels[*].stages`)
 *
 * O `id` da etapa não muda — só o rótulo exibido. Como `crm_leads.status` guarda o nome,
 * a migração dos leads é necessária para a coluna não "sumir".
 */
export async function renameStage(oldName: string, newName: string): Promise<CRMConfig> {
    const supabase = await createClient();
    const trimmed = newName.trim();
    const current = await getCRMConfig();

    if (!trimmed || trimmed === oldName) return current;

    // Garante que o novo nome não conflite com outra etapa existente do funil principal
    const exists = current.stages.some(s => s.name === trimmed && s.name !== oldName);
    if (exists) {
        throw new Error(`Já existe uma etapa chamada "${trimmed}".`);
    }

    const { error: leadsErr } = await supabase
        .from('crm_leads')
        .update({ status: trimmed })
        .eq('status', oldName);
    if (leadsErr) throw new Error(`Error renaming lead statuses: ${leadsErr.message}`);

    const renameInList = <T extends { name: string }>(stages: T[]) =>
        stages.map(s => (s.name === oldName ? { ...s, name: trimmed } : s));

    const newConfig: CRMConfig = {
        ...current,
        stages: renameInList(current.stages),
        funnels: current.funnels.map(f => ({ ...f, stages: renameInList(f.stages) })),
    };

    const { error: cfgErr } = await supabase
        .from('site_settings')
        .upsert(
            { key: 'crm_config', value: newConfig, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
        );
    if (cfgErr) throw new Error(`Error saving CRM config: ${cfgErr.message}`);

    revalidatePath('/web-admin/crm');
    return newConfig;
}
