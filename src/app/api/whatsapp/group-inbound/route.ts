/**
 * /api/whatsapp/group-inbound — mensagens recebidas em GRUPOS via VPS (Baileys).
 *
 * O VPS encaminha toda mensagem de grupo (de terceiros) para cá. Hoje o único
 * consumidor é a automação de cadastro em leiloeiras: se o grupo é o grupo de
 * cadastros de uma leiloeira (leiloeiras.whatsapp_group_id), detectamos a
 * decisão ("aprovado"/"recusado"), atualizamos o status e fechamos o ciclo
 * (cliente avisado pela API oficial + confirmação no grupo + aviso interno).
 * Grupos não mapeados são ignorados em silêncio.
 *
 * Autenticação: header `x-webhook-secret` = WHATSAPP_GROUP_TASK_SECRET
 * (mesmo contrato do /api/whatsapp/inbound).
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { handleLeiloeiraGroupMessage } from '@/lib/leiloeira-whatsapp-cadastro'
import { handleLanceGroupMessage, ehGrupoDeLancesPorNome } from '@/lib/whatsapp-lances'
import { ingestOperationalSignal } from '@/lib/operational-center'
import { grupoRelevante } from '@/lib/whatsapp-grupos-relevantes'
import { normalizePhone } from '@/lib/whatsapp-central'
import { loadAgenteConfigCached, agenteNumeroAutorizado, mencionaBot, removerMencaoBot } from '@/lib/whatsapp-agente-config'
import { handleAgenteMessage } from '@/lib/whatsapp-agente'

// O agente interno roda no after() desta rota e pode levar mais que 30s.
export const maxDuration = 120

export async function POST(req: NextRequest) {
    const SECRET = process.env.WHATSAPP_GROUP_TASK_SECRET || ''
    const auth = req.headers.get('x-webhook-secret')
    if (!SECRET || auth !== SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: {
        session?: string; group_jid?: string; group_name?: string; participant?: string; name?: string
        body?: string; quoted_body?: string; message_id?: string; ts?: number
        media?: {
            bucket?: string | null; path?: string | null; type?: string | null
            mime?: string | null; filename?: string | null; size?: number | null
            ingest_error?: string | null
        } | null
    }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const groupJid = (body.group_jid || '').trim()
    const text = (body.body || '').trim()
    if (!groupJid || (!text && !body.media?.path)) {
        return NextResponse.json({ error: 'group_jid e conteúdo são obrigatórios' }, { status: 400 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // PORTEIRA: o número Baileys é um WhatsApp de pessoa e está em grupo de
    // família, de bairro, de OLX. Antes disto, TODA mensagem de grupo virava
    // linha em whatsapp_messages e aparecia no painel da Central — conversa
    // particular do dono guardada no banco da empresa, sem nenhum consumidor.
    // Só passa grupo com consumidor declarado (ver whatsapp-grupos-relevantes).
    //
    // Exceção: mídia JÁ ingerida pelo VPS. O VPS só baixa arquivo de grupo que
    // passou pelo gate dele (catálogo/allowlist do Radar), então mídia presente
    // significa que outra porteira já aprovou — descartar aqui perderia catálogo.
    const midiaJaIngerida = !!body.media?.path
    // Grupos "Lances*" passam pela porteira PELO NOME: a leiloeira cria um
    // grupo novo por leilão e a captura de lances precisa começar a ouvir na
    // hora, sem depender de alguém cadastrar o JID (o handler auto-registra).
    const grupoDeLancesPorNome = ehGrupoDeLancesPorNome(body.group_name)
    if (!midiaJaIngerida && !grupoDeLancesPorNome && !(await grupoRelevante(supabase, groupJid))) {
        return NextResponse.json({ ok: true, ignored: 'grupo_sem_consumidor' })
    }

    // Dedup por message_id (o Baileys pode redisparar o upsert): registramos
    // cada inbound de grupo em whatsapp_messages (auditoria) e usamos o registro
    // como trava. `phone` recebe o JID do grupo — o inbox de clientes filtra fora.
    const messageId = (body.message_id || '').trim()
    if (messageId) {
        const { data: dup } = await supabase
            .from('whatsapp_messages')
            .select('id')
            .eq('direction', 'inbound')
            .eq('origin', 'group-inbound')
            .eq('reason', messageId)
            .limit(1)
        if (dup?.length) return NextResponse.json({ ok: true, deduped: true })
    }
    const logBody = text || `[${body.media?.type || 'arquivo'}]`
    const { data: logged } = await supabase.from('whatsapp_messages').insert({
        phone: groupJid,
        name: body.group_name || 'Grupo',
        body: logBody,
        direction: 'inbound',
        status: 'received',
        channel: 'baileys',
        inbox_id: body.session || 'joao',
        intent: 'bot',
        origin: 'group-inbound',
        reason: messageId || null,
        media_url: body.media?.bucket === 'whatsapp-media' ? body.media.path : null,
        media_type: body.media?.type || null,
        media_mime: body.media?.mime || null,
        media_filename: body.media?.filename || null,
        media_ingest_error: body.media?.ingest_error || null,
        media_ingested_at: body.media?.path ? new Date().toISOString() : null,
    }).select('id').maybeSingle()

    after(() => ingestOperationalSignal(supabase, {
        inboxId: body.session || 'joao',
        sessionId: body.session || 'joao',
        chatJid: groupJid,
        chatName: body.group_name || null,
        senderJid: body.participant || null,
        senderName: body.name || null,
        isGroup: true,
        direction: 'inbound',
        body: logBody,
        quotedBody: body.quoted_body || null,
        externalMessageId: messageId || null,
        whatsappMessageId: logged?.id || null,
        occurredAt: typeof body.ts === 'number' ? new Date(body.ts * 1000).toISOString() : null,
        media: body.media ? {
            bucket: body.media.bucket || 'whatsapp-media', path: body.media.path,
            type: body.media.type, mime: body.media.mime, filename: body.media.filename,
            size: body.media.size,
        } : null,
    }).catch(error => {
        console.warn('[group-inbound] triagem operacional falhou:', error instanceof Error ? error.message : error)
    }))

    // Agente interno: nos grupos configurados, o agente SÓ responde quando o
    // contato dele é MENCIONADO (@numero do operacional) — marcar o contato
    // injeta "@<numero>" no corpo. Sem menção, silêncio total. O grupo é a
    // fronteira de auth (participant pode vir como @lid, sem telefone
    // resolvível); quem não está na allowlist participa como papel mais
    // restrito — nunca admin.
    const agenteCfg = await loadAgenteConfigCached(supabase)
    if (
        agenteCfg.enabled && (agenteCfg.numeroBot || agenteCfg.lidBot) &&
        agenteCfg.groupJids.includes(groupJid) &&
        mencionaBot(text, agenteCfg)
    ) {
        const participantPhone = normalizePhone((body.participant || '').split('@')[0] || '') || ''
        const membro = participantPhone ? agenteNumeroAutorizado(agenteCfg, participantPhone) : null
        const pergunta = removerMencaoBot(text, agenteCfg)
        // Só marcaram, sem pergunta: resposta fixa curta (não gasta modelo).
        if (!pergunta) {
            const { sendVpsGroup } = await import('@/lib/whatsapp-vps')
            after(() => sendVpsGroup(groupJid, 'Oi! Precisa de algo? Me chama aqui ou no privado.', undefined, agenteCfg.session)
                .catch(err => console.warn('[agente:grupo]', err)))
            return NextResponse.json({ ok: true, agente: true, saudacao: true })
        }
        if (pergunta) {
            after(() => handleAgenteMessage(supabase, {
                phone: membro ? participantPhone : '',
                nome: membro?.nome || body.name || 'membro',
                // @lid não resolvido / fora da allowlist → papel mais restrito
                role: membro?.role ?? 'assessor',
                assessor: membro?.assessor ?? null,
                text: pergunta,
                messageId: messageId || null,
                session: agenteCfg.session,
                origem: { kind: 'grupo', groupJid },
                config: agenteCfg,
            }).catch(err => console.warn('[agente:grupo]', err)))
            return NextResponse.json({ ok: true, agente: true })
        }
    }

    const outcome = text ? await handleLeiloeiraGroupMessage(supabase, {
        groupJid,
        participant: body.participant || null,
        senderName: body.name || null,
        text,
        quotedText: body.quoted_body || null,
    }) : { kind: 'ignored', reason: 'media_only' }

    // Lances do pregão ao vivo (qualquer grupo "Lances*") → vendas.
    const lance = text ? await handleLanceGroupMessage(supabase, {
        groupJid,
        groupName: body.group_name || null,
        text,
        quotedText: body.quoted_body || null,
        messageId: messageId || null,
        ts: typeof body.ts === 'number' ? body.ts : null,
    }) : { kind: 'ignored', reason: 'media_only' }

    return NextResponse.json({ ok: true, outcome, lance })
}
