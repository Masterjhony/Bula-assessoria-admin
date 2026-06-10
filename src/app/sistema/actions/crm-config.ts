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
 * Renomeia UMA etapa de UM funil específico (identificada por `funnelId` + `stageId`)
 * e propaga em duas direções, sempre escopadas a esse funil:
 *  1. atualiza `crm_leads.status` apenas dos leads daquele funil que estavam na etapa antiga
 *  2. renomeia o `name` somente da etapa-alvo dentro daquele funil
 *
 * Identificar por `id` (e não por nome) é essencial: funis diferentes podem ter etapas
 * homônimas (ex.: "Lead" existe no Principal e no Funil JMP). A versão antiga renomeava
 * por nome globalmente — o que vazava a renomeação para outros funis, migrava leads de
 * todos os funis e ainda checava conflito contra o funil errado (gerava o falso
 * "Já existe uma etapa chamada X" ao editar etapas do JMP).
 *
 * O `id` da etapa não muda — só o rótulo. Como `crm_leads.status` guarda o nome, a
 * migração dos leads é necessária para a coluna não "sumir".
 */
export async function renameStage(funnelId: string, stageId: string, newName: string): Promise<CRMConfig> {
    const supabase = await createClient();
    const trimmed = newName.trim();
    const current = await getCRMConfig();

    const funnel = current.funnels.find(f => f.id === funnelId);
    if (!funnel) throw new Error('Funil não encontrado.');
    const stage = funnel.stages.find(s => s.id === stageId);
    if (!stage) throw new Error('Etapa não encontrada.');

    const oldName = stage.name;
    if (!trimmed || trimmed === oldName) return current;

    // Conflito apenas dentro do MESMO funil — outros funis podem ter etapas homônimas.
    const conflict = funnel.stages.some(s => s.id !== stageId && s.name === trimmed);
    if (conflict) throw new Error(`Já existe uma etapa chamada "${trimmed}" neste funil.`);

    // Migra os leads DESTE funil que estavam na etapa antiga. O funil principal é o
    // primeiro da lista; leads legados sem `funnel_id` pertencem a ele (mesma regra do
    // CRMDashboardClient: `funnel_id || 'default'`).
    const isPrincipal = current.funnels[0]?.id === funnelId;
    let leadsQuery = supabase.from('crm_leads').update({ status: trimmed }).eq('status', oldName);
    leadsQuery = isPrincipal
        ? leadsQuery.or(`funnel_id.eq.${funnelId},funnel_id.is.null`)
        : leadsQuery.eq('funnel_id', funnelId);
    const { error: leadsErr } = await leadsQuery;
    if (leadsErr) throw new Error(`Error renaming lead statuses: ${leadsErr.message}`);

    // Renomeia só a etapa-alvo (por id) no funil; mantém `stages` espelhando o principal.
    const newFunnels = current.funnels.map(f =>
        f.id === funnelId
            ? { ...f, stages: f.stages.map(s => (s.id === stageId ? { ...s, name: trimmed } : s)) }
            : f
    );
    const newConfig: CRMConfig = {
        ...current,
        funnels: newFunnels,
        stages: newFunnels[0]?.stages ?? current.stages,
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
