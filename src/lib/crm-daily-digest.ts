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
import { sessaoOperacional } from './whatsapp-operacional'
import { ufFromPhone, normalizeUf } from './state-registration-provider'
import {
    FILTRO_API_OFICIAL, classificaDisparos, foneKey, JANELA_RESPOSTA_MS,
    type AtendimentoMsg,
} from './atendimento-stats'
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
    /** Pessoas que levaram uma abordagem que saiu de fato. */
    contatados: number
    /** Dessas, quantas responderam em até 72h. */
    responderam: number
    /** Quem escreveu no dia, tenha sido chamado ou não (inclui quem procurou). */
    escreveramNoDia: number
    aguardandoAgora: number
    handoffs: number
    optouts: number
    funil: Record<string, number>
    checklistsCompletos: number
    fichasEnviadas: number
    aprovados: number
    recusados: number
    aguardandoLista: { nome: string; status: string; uf: string }[]
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

    // ── Mensagens de hoje (só API oficial — a conversa com cliente) ──
    // Recorte e contagem seguem a fonte única. Antes este bloco somava qualquer
    // outbound de qualquer canal: Baileys (histórico importado, espelho, agente
    // da equipe) entrava como "cliente chamado", e mensagem que FALHOU contava
    // igual — nos dias do bloqueio de pagamento da Meta o resumo dizia que 190
    // pessoas tinham sido chamadas quando nenhuma recebeu nada.
    // PostgREST devolve no máximo 1000 linhas por chamada e ignora `.limit`
    // acima disso — o `.limit(5000)` que estava aqui truncava em silêncio, e num
    // dia movimentado o resumo saía com menos gente do que houve de verdade.
    type DigestMsg = AtendimentoMsg & { name?: string | null; intent?: string | null }
    const msgs: DigestMsg[] = []
    for (let from = 0; ; from += 1000) {
        const { data } = await supabase
            .from('whatsapp_messages')
            .select('phone, name, direction, status, origin, channel, intent, created_at')
            .gte('created_at', start)
            .not('phone', 'is', null)
            .or(FILTRO_API_OFICIAL)
            .not('phone', 'like', '%@g.us')
            .order('created_at', { ascending: true })
            .range(from, from + 999)
        if (!data?.length) break
        msgs.push(...(data as unknown as DigestMsg[]))
        if (data.length < 1000) break
    }

    const doCliente = msgs.filter(m =>
        isClientPhone(m.phone)
        && !INTERNAL_ORIGINS.has(m.origin ?? '')
        && m.intent !== 'assessor')

    // "Chamados" = quem levou ABORDAGEM que saiu de fato (não resposta nossa
    // dentro de conversa aberta, não mensagem que falhou). "Responderam" = dos
    // chamados, quem escreveu depois — não é o total de quem escreveu no dia,
    // que incluía quem procurou a Bula sozinho e inflava a taxa.
    const { disparos, inboundPorFone } = classificaDisparos(doCliente)
    const primeiroDisparo = new Map<string, number>()
    for (const d of disparos) {
        const p = primeiroDisparo.get(d.key)
        if (p === undefined || d.t < p) primeiroDisparo.set(d.key, d.t)
    }
    let responderamAoDisparo = 0
    for (const [k, t] of primeiroDisparo) {
        const ins = inboundPorFone.get(k)
        if (ins?.some(x => x > t && x - t < JANELA_RESPOSTA_MS)) responderamAoDisparo++
    }

    const outboundPhones = new Set<string>()
    const inboundPhones = new Set<string>()
    // Última direção por phone (pra saber quem está aguardando resposta agora).
    const lastByPhone = new Map<string, { direction: string; name: string }>()
    for (const m of doCliente) {
        const phone = m.phone
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
    const statusByPhone = new Map<string, { nome: string; status: string; estado: string | null }>()
    if (phones.length) {
        const { data: leads } = await supabase
            .from('crm_leads')
            .select('nome, telefone, status, estado')
            .in('telefone', phones)
        for (const l of leads ?? []) {
            const st = normalizeCRMStatus(l.status) || '—'
            funil[st] = (funil[st] ?? 0) + 1
            if (l.telefone) statusByPhone.set(l.telefone, { nome: l.nome || l.telefone, status: st, estado: l.estado ?? null })
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
        const ufReal = normalizeUf(lead?.estado)
        const uf = ufReal || (ufFromPhone(phone) ? `${ufFromPhone(phone)}?` : '')
        return { nome: lead?.nome || v.name, status: lead?.status || '—', uf }
    })

    const stats: DailyDigestStats = {
        date: label,
        novosLeads: novosLeads ?? 0,
        contatados: primeiroDisparo.size,
        responderam: responderamAoDisparo,
        escreveramNoDia: inboundPhones.size,
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
        ? ` (${Math.round((stats.responderam / stats.contatados) * 100)}% dos chamados, em até 72h)`
        : ''
    const f = (k: string) => funil[k] ?? 0
    const linhas = [
        `🌇 *Resumo ${days === 1 ? 'do dia' : 'do período'} — CRM/WhatsApp* · ${label}`,
        '',
        '*Movimento*',
        `• Leads novos: ${stats.novosLeads}`,
        `• Clientes chamados: ${stats.contatados}`,
        `• Responderam: ${stats.responderam}${taxa}`,
        `• Escreveram no dia (chamados ou não): ${stats.escreveramNoDia}`,
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
        for (const a of aguardandoLista) linhas.push(`• ${a.nome}${a.uf ? ` (${a.uf})` : ''} — ${a.status}`)
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
        // Grupo explícito também sai pelo número operacional — omitir a sessão
        // cairia na default do VPS, que é justamente o que ficou órfão.
        const r = await sendVpsGroup(opts.groupId, text, undefined, await sessaoOperacional(supabase))
        return { sent: r.queued, reason: r.error, stats }
    }
    const r = await notifyTeamGroup(supabase, text)
    return { sent: r.sent, reason: r.reason, stats }
}
