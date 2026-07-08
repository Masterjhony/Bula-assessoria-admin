/**
 * Resumo diário do CRM/WhatsApp — enviado ao grupo interno (Baileys) no fim do
 * dia (cron /api/cron/crm-daily-digest, agendado no vercel.json).
 *
 * O que responde: "como foi o dia?" — quantos leads novos, quantos clientes a
 * gente chamou, quantos responderam, em que etapa do funil está quem conversou
 * hoje, o que a habilitação/cadastro produziu e quem está aguardando resposta
 * agora. Canal: Baileys de propósito (comunicação INTERNA — a API oficial fica
 * para o cliente).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyTeamGroup } from './whatsapp-team-notify'
import { sendVpsGroup } from './whatsapp-vps'
import {
    CRM_STAGE_ENTRY,
    CRM_STAGE_CONNECTION,
    CRM_STAGE_QUALIFICATION,
    CRM_STAGE_INFO_CAPTURED,
    CRM_STAGE_REGISTRATION,
    CRM_STAGE_LOST,
    normalizeCRMStatus,
} from './crm-types'

/** Fuso do negócio (MS, UTC-4 fixo — o Brasil não tem mais horário de verão). */
const TZ_OFFSET = '-04:00'

/** Início do dia de hoje no fuso do negócio, em ISO UTC. */
function todayStart(): { iso: string; label: string } {
    const now = new Date()
    const local = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Campo_Grande', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now) // YYYY-MM-DD
    const [y, m, d] = local.split('-')
    return { iso: new Date(`${local}T00:00:00${TZ_OFFSET}`).toISOString(), label: `${d}/${m}/${y}` }
}

/** Origens/JIDs que não são conversa de cliente (mesma régua do inbox). */
const INTERNAL_ORIGINS = new Set(['crm-assessor', 'group-manual', 'group-inbound', 'gif-lotes'])
const isClientPhone = (p: string) => /^\d{8,15}$/.test(p)

export interface DailyDigestStats {
    date: string
    novosLeads: number
    contatados: number
    responderam: number
    aguardandoAgora: number
    handoffs: number
    optouts: number
    funil: Record<string, number>
    checklistsCompletos: number
    fichasEnviadas: number
    aprovados: number
    recusados: number
    aguardandoLista: { nome: string; status: string }[]
}

export async function buildCrmDailyDigest(
    supabase: SupabaseClient,
    opts: { days?: number } = {},
): Promise<{ text: string; stats: DailyDigestStats }> {
    // Janela: 1 dia (padrão, "resumo do dia") ou N dias (testes / retrospecto).
    const days = Math.max(1, Math.min(30, Math.round(opts.days ?? 1)))
    const today = todayStart()
    const start = days === 1
        ? today.iso
        : new Date(new Date(today.iso).getTime() - (days - 1) * 86_400_000).toISOString()
    const label = days === 1 ? today.label : `últimos ${days} dias (até ${today.label})`

    // ── Mensagens de hoje (conversas de cliente) ──
    const { data: msgs } = await supabase
        .from('whatsapp_messages')
        .select('phone, name, direction, origin, intent, created_at')
        .gte('created_at', start)
        .not('phone', 'is', null)
        .order('created_at', { ascending: true })
        .limit(5000)

    const outboundPhones = new Set<string>()
    const inboundPhones = new Set<string>()
    // Última direção por phone (pra saber quem está aguardando resposta agora).
    const lastByPhone = new Map<string, { direction: string; name: string }>()
    for (const m of msgs ?? []) {
        const phone = m.phone as string
        if (!isClientPhone(phone)) continue
        if (INTERNAL_ORIGINS.has(m.origin ?? '') || m.intent === 'assessor') continue
        if (m.direction === 'outbound') outboundPhones.add(phone)
        if (m.direction === 'inbound') inboundPhones.add(phone)
        lastByPhone.set(phone, { direction: m.direction, name: m.name || phone })
    }
    const aguardando = [...lastByPhone.entries()].filter(([, v]) => v.direction === 'inbound')

    // ── Leads novos / handoff / opt-out de hoje ──
    const [{ count: novosLeads }, { count: handoffs }, { count: optouts }] = await Promise.all([
        supabase.from('crm_leads').select('id', { count: 'exact', head: true }).gte('created_at', start),
        supabase.from('crm_leads').select('id', { count: 'exact', head: true }).gte('handoff_at', start),
        supabase.from('crm_leads').select('id', { count: 'exact', head: true }).gte('optout_at', start),
    ])

    // ── Funil: etapa atual de quem teve conversa hoje ──
    const phones = [...new Set([...outboundPhones, ...inboundPhones])]
    const funil: Record<string, number> = {}
    const statusByPhone = new Map<string, { nome: string; status: string }>()
    if (phones.length) {
        const { data: leads } = await supabase
            .from('crm_leads')
            .select('nome, telefone, status')
            .in('telefone', phones)
        for (const l of leads ?? []) {
            const st = normalizeCRMStatus(l.status) || '—'
            funil[st] = (funil[st] ?? 0) + 1
            if (l.telefone) statusByPhone.set(l.telefone, { nome: l.nome || l.telefone, status: st })
        }
    }

    // ── Habilitação / cadastro em leiloeiras ──
    const { count: checklistsCompletos } = await supabase
        .from('crm_leads')
        .select('id', { count: 'exact', head: true })
        .gte('extra_data->>habilitacao_notificada_at', start)
    const { count: fichasEnviadas } = await supabase
        .from('cliente_leiloeira_cadastro')
        .select('id', { count: 'exact', head: true })
        .gte('enviado_at', start)
    const { data: decisoes } = await supabase
        .from('cliente_leiloeira_cadastro')
        .select('status')
        .gte('decidido_at', start)
    const aprovados = (decisoes ?? []).filter(d => d.status === 'aprovado').length
    const recusados = (decisoes ?? []).filter(d => d.status === 'recusado').length

    const aguardandoLista = aguardando.slice(-6).reverse().map(([phone, v]) => {
        const lead = statusByPhone.get(phone)
        return { nome: lead?.nome || v.name, status: lead?.status || '—' }
    })

    const stats: DailyDigestStats = {
        date: label,
        novosLeads: novosLeads ?? 0,
        contatados: outboundPhones.size,
        responderam: inboundPhones.size,
        aguardandoAgora: aguardando.length,
        handoffs: handoffs ?? 0,
        optouts: optouts ?? 0,
        funil,
        checklistsCompletos: checklistsCompletos ?? 0,
        fichasEnviadas: fichasEnviadas ?? 0,
        aprovados,
        recusados,
        aguardandoLista,
    }

    // ── Texto ──
    const taxa = stats.contatados > 0
        ? ` (${Math.round((stats.responderam / stats.contatados) * 100)}% dos chamados)`
        : ''
    const f = (k: string) => funil[k] ?? 0
    const linhas = [
        `🌇 *Resumo ${days === 1 ? 'do dia' : 'do período'} — CRM/WhatsApp* · ${label}`,
        '',
        '*Movimento*',
        `• Leads novos: ${stats.novosLeads}`,
        `• Clientes chamados: ${stats.contatados}`,
        `• Responderam: ${stats.responderam}${taxa}`,
        `• Aguardando resposta agora: ${stats.aguardandoAgora}`,
        `• Pediram humano: ${stats.handoffs} · Opt-out: ${stats.optouts}`,
        '',
        `*Funil (quem conversou no ${days === 1 ? 'dia' : 'período'})*`,
        `• ${CRM_STAGE_ENTRY}: ${f(CRM_STAGE_ENTRY)} · ${CRM_STAGE_CONNECTION}: ${f(CRM_STAGE_CONNECTION)} · ${CRM_STAGE_QUALIFICATION}: ${f(CRM_STAGE_QUALIFICATION)}`,
        `• ${CRM_STAGE_INFO_CAPTURED}: ${f(CRM_STAGE_INFO_CAPTURED)} · ${CRM_STAGE_REGISTRATION}: ${f(CRM_STAGE_REGISTRATION)} · ${CRM_STAGE_LOST}: ${f(CRM_STAGE_LOST)}`,
        '',
        '*Habilitação & cadastro*',
        `• Checklists completos: ${stats.checklistsCompletos}`,
        `• Fichas enviadas às leiloeiras: ${stats.fichasEnviadas}`,
        `• Decisões: ${stats.aprovados} aprovada(s) · ${stats.recusados} recusada(s)`,
    ]
    if (aguardandoLista.length) {
        linhas.push('', '*Aguardando resposta (mais recentes)*')
        for (const a of aguardandoLista) linhas.push(`• ${a.nome} — ${a.status}`)
    }
    linhas.push('', '_Resumo automático · Central WhatsApp_')

    return { text: linhas.join('\n'), stats }
}

/**
 * Monta e envia o resumo. Sem `groupId`, vai pro grupo interno configurado no
 * cockpit (notifyGroupId); com `groupId`, envia direto pro grupo informado
 * (usado em testes).
 */
export async function sendCrmDailyDigest(
    supabase: SupabaseClient,
    opts: { groupId?: string; days?: number } = {},
): Promise<{ sent: boolean; reason?: string; stats: DailyDigestStats }> {
    const { text, stats } = await buildCrmDailyDigest(supabase, { days: opts.days })
    if (opts.groupId) {
        const r = await sendVpsGroup(opts.groupId, text)
        return { sent: r.queued, reason: r.error, stats }
    }
    const r = await notifyTeamGroup(supabase, text)
    return { sent: r.sent, reason: r.reason, stats }
}
