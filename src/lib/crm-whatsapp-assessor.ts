import type { SupabaseClient } from '@supabase/supabase-js';
import { ASSESSOR_NOTIFICATION_STAGE, type CRMConfig, type CRMResponsavel } from '@/lib/crm-types';
import { normalizePhone } from '@/lib/whatsapp-central';
import { sendOutbound } from '@/lib/whatsapp-gateway';

type LeadForAssessor = {
    id: string;
    nome: string;
    status?: string | null;
    telefone?: string | null;
    celular?: string | null;
    email?: string | null;
    responsavel?: string | null;
    empresa?: string | null;
    cidade?: string | null;
    estado?: string | null;
    o_que_busca?: string | null;
    quantidade_animais?: string | null;
    score_serasa?: number | null;
    pendencias_financeiras?: string | null;
    tem_inscricao_estadual?: string | null;
    inscricao_estadual?: string | null;
    source?: string | null;
    origem?: string | null;
    data_entrada?: string | null;
    created_at?: string | null;
    extra_data?: Record<string, unknown> | null;
};

type PreviousLeadState = Pick<LeadForAssessor, 'status' | 'responsavel' | 'extra_data'> | null | undefined;

type DispatchResult =
    | { attempted: false; reason: string }
    | { attempted: true; sent: boolean; status: 'sent' | 'queued' | 'failed'; reason?: string };

function normalizeText(value?: string | null): string {
    return (value || '').trim().toLowerCase();
}

function findUser(config: CRMConfig, lead: LeadForAssessor): CRMResponsavel | null {
    const raw = normalizeText(lead.responsavel);
    if (!raw) return null;
    return config.responsaveis.find((u) => {
        if (u.active === false) return false;
        return normalizeText(u.name) === raw || normalizeText(u.id) === raw;
    }) ?? null;
}

function notificationKey(user: CRMResponsavel): string {
    const id = user.id || user.name;
    return `${ASSESSOR_NOTIFICATION_STAGE}:${id}`.toLowerCase();
}

function alreadyNotified(lead: LeadForAssessor, user: CRMResponsavel, phone: string): boolean {
    const notifications = (lead.extra_data?.assessor_notifications ?? {}) as Record<string, { phone?: string; sent_at?: string }>;
    const item = notifications[notificationKey(user)];
    return !!item?.sent_at && item.phone === phone;
}

function formatDate(iso?: string | null): string {
    if (!iso) return '-';
    try {
        return new Date(iso).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

function leadMessage(lead: LeadForAssessor, user: CRMResponsavel): string {
    const contact = lead.celular || lead.telefone || '-';
    const location = [lead.cidade, lead.estado].filter(Boolean).join(' / ') || '-';
    const score = lead.score_serasa == null ? '-' : String(lead.score_serasa);
    const pendencias = lead.pendencias_financeiras || '-';

    return [
        `Novo lead em ${ASSESSOR_NOTIFICATION_STAGE}`,
        '',
        `Usuário: ${user.name}`,
        `Lead: ${lead.nome || '-'}`,
        `Contato: ${contact}`,
        `E-mail: ${lead.email || '-'}`,
        `Empresa/Fazenda: ${lead.empresa || '-'}`,
        `Localização: ${location}`,
        `Interesse: ${lead.o_que_busca || '-'}`,
        `Cabeças: ${lead.quantidade_animais || '-'}`,
        `I.E.: ${lead.tem_inscricao_estadual || lead.inscricao_estadual || '-'}`,
        `Score Serasa: ${score}`,
        `Pendências financeiras: ${pendencias}`,
        `Origem: ${lead.origem || lead.source || '-'}`,
        `Entrada: ${formatDate(lead.data_entrada || lead.created_at)}`,
    ].join('\n');
}

function shouldDispatch(lead: LeadForAssessor, previous: PreviousLeadState): boolean {
    const isTarget = lead.status === ASSESSOR_NOTIFICATION_STAGE;
    if (!isTarget) return false;
    if (!previous) return true;
    if (previous.status !== ASSESSOR_NOTIFICATION_STAGE) return true;
    return !!lead.responsavel && lead.responsavel !== previous.responsavel;
}

export async function maybeNotifyAssessorOnLeadStage(
    supabase: SupabaseClient,
    config: CRMConfig,
    lead: LeadForAssessor,
    previous?: PreviousLeadState,
): Promise<DispatchResult> {
    if (!shouldDispatch(lead, previous)) return { attempted: false, reason: 'stage_not_entered' };

    const user = findUser(config, lead);
    if (!user) return { attempted: false, reason: 'user_not_found' };

    const phone = normalizePhone(user.whatsapp || '');
    if (!phone) return { attempted: false, reason: 'user_without_whatsapp' };

    if (alreadyNotified(lead, user, phone)) {
        return { attempted: false, reason: 'already_notified' };
    }

    const message = leadMessage(lead, user);

    // Encaminhamento de assessor é transacional/interno: força Baileys e pula
    // guard rails (não é marketing, vai pro número do próprio assessor). O
    // gateway é dono do log em whatsapp_messages — não logamos aqui de novo.
    const result = await sendOutbound(supabase, {
        to: { phone, leadId: lead.id, name: user.name },
        text: message,
        intent: 'assessor',
        channelHint: 'baileys',
        origin: 'crm-assessor',
        botStep: 'assessor-notification',
        skipGuardrails: true,
    });

    const delivered = result.status === 'sent' || result.status === 'queued';
    const status: 'sent' | 'queued' | 'failed' =
        result.status === 'sent' ? 'sent' : result.status === 'queued' ? 'queued' : 'failed';
    const reason = delivered ? undefined : result.reason;

    if (delivered) {
        const extra = { ...(lead.extra_data || {}) } as Record<string, unknown>;
        const notifications = {
            ...((extra.assessor_notifications || {}) as Record<string, unknown>),
            [notificationKey(user)]: {
                phone,
                user_id: user.id,
                user_name: user.name,
                stage: ASSESSOR_NOTIFICATION_STAGE,
                sent_at: new Date().toISOString(),
                status,
            },
        };
        extra.assessor_notifications = notifications;
        await supabase.from('crm_leads').update({ extra_data: extra }).eq('id', lead.id);
    }

    return { attempted: true, sent: delivered, status, reason };
}
