/**
 * MODO HANDOFF — responder é passar pro assessor, e mais nada.
 *
 * Decisão do dono (28/07/2026): por enquanto o WhatsApp "funcionário" tem UMA
 * função só. O motor segue disparando; quem responder recebe uma frase curta
 * dizendo que o assessor vai chamar, e o assessor da região é acionado na hora.
 *
 * O que isso substitui: o concierge conduzia a conversa inteira — qualificava,
 * apresentava a assessoria, coletava CPF, documentos, e só no fim entregava
 * alguém. Agora o robô não conduz nada. Ele reconhece, promete e sai.
 *
 * Por que é melhor do que parece: o gargalo nunca foi a quantidade de conversa,
 * foi lead quente esfriando enquanto a máquina pedia documento. Resposta = sinal
 * de interesse; sinal de interesse vale mais na mão de gente do que num
 * checklist. E o handoff é IMEDIATO — não espera fase, aceite, nem checklist.
 *
 * Fica ligado por `crm_concierge.modo = 'handoff'`. Voltar ao funil completo é
 * trocar para 'completo' — nada foi apagado, só desviado.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendOutbound } from './whatsapp-gateway'
import { sendVpsDirect } from './whatsapp-vps'
import { avisarAssessor, telefoneDoAssessor, sessaoOperacional, ehNumeroInterno } from './whatsapp-operacional'
import { resolveZona, type Assessor } from './assessor-zona'
import { ufFromPhone } from './state-registration-provider'
import { resumoQualificacaoTexto } from './crm-qualificacao'
import { firstName } from './whatsapp-central'

export type ModoAtendimento = 'completo' | 'handoff'

/** Lê o modo da config do concierge. Default 'completo' (não muda quem não optou). */
export function modoAtendimento(config: unknown): ModoAtendimento {
    const m = String((config as { modo?: unknown })?.modo ?? '').trim().toLowerCase()
    return m === 'handoff' ? 'handoff' : 'completo'
}

/** Recorte do lead que o handoff precisa. */
export interface LeadHandoff {
    id: string
    nome: string | null
    telefone: string | null
    celular: string | null
    estado: string | null
    cidade: string | null
    cpf?: string | null
    email?: string | null
    interesse?: string | null
    interesse_principal?: string | null
    o_que_busca?: string | null
    quantidade_animais?: string | null
    momento_pecuaria?: string | null
    tem_inscricao_estadual?: string | null
    inscricao_estadual?: string | null
    responsavel?: string | null
    handoff_humano?: boolean | null
    contact_history?: unknown
    extra_data?: Record<string, unknown> | null
}

export interface HandoffResult {
    handled: boolean
    /** Assessor escolhido pela zona (null = UF desconhecida). */
    assessor: Assessor | null
    /** Respondeu ao lead. */
    respondido: boolean
    /** Assessor avisado no WhatsApp dele. */
    assessorAvisado: boolean
    /** Documentos do lead reenviados como anexo pro assessor. */
    docsEnviados: number
    /** UF declarada e DDD divergem — vale conferência humana. */
    conflitoZona: boolean
    reason?: string
}

/**
 * Já passamos este lead recentemente? Sem isso, cada balão que o lead manda
 * ("oi", "tudo bem?", "quero sim") dispararia um aviso novo pro assessor —
 * três mensagens em sequência viram três notificações do mesmo cliente, e o
 * assessor aprende a ignorar.
 */
const REPASSE_COOLDOWN_MS = 12 * 3_600_000

function repassadoRecentemente(lead: LeadHandoff, agora: Date): boolean {
    const at = String((lead.extra_data ?? {}).handoff_assessor_at ?? '')
    if (!at) return false
    const t = new Date(at).getTime()
    return Number.isFinite(t) && agora.getTime() - t < REPASSE_COOLDOWN_MS
}

/** Frase para o lead. Curta: promete uma coisa só e não abre pergunta nova. */
export function textoParaLead(nome: string, assessor: Assessor | null): string {
    const oi = nome ? `Oi, ${nome}!` : 'Oi!'
    if (assessor) {
        const primeiro = assessor.split(/\s+/)[0]
        return `${oi} Que bom que você respondeu. Vou passar seu contato pro ${primeiro}, que é o assessor da Bula na sua região — ele te chama por aqui em breve pra entender o que você procura e te acompanhar no leilão. 👊`
    }
    // Sem UF não dá pra nomear o assessor; promete a mesma coisa sem inventar.
    return `${oi} Que bom que você respondeu. Já estou passando seu contato pro assessor da Bula responsável pela sua região — ele te chama por aqui em breve pra entender o que você procura e te acompanhar no leilão. 👊`
}

const DOCS_BUCKET = 'cliente-documentos'

/** Rótulos legíveis dos tipos de documento, para a legenda do anexo. */
const DOC_ROTULO: Record<string, string> = {
    cpf: 'Documento com foto',
    identidade: 'Documento com foto',
    endereco: 'Comprovante de endereço',
    comprovante: 'Comprovante de endereço',
    matricula: 'Matrícula/certidão da fazenda',
    contrato: 'Contrato de arrendamento',
    renda: 'Comprovante de renda',
    ie: 'Inscrição Estadual',
    outro: 'Documento',
}

interface DocLink {
    nome: string
    url: string
    tipo: string
    contentType: string
}

/**
 * Documentos que o lead já mandou, com URL assinada (7 dias) para o VPS baixar.
 *
 * Vão como ANEXO na conversa do assessor, não como link: o assessor abre no
 * próprio WhatsApp, no celular, sem copiar URL de 300 caracteres que ainda por
 * cima expira. Se o lead mandou o comprovante, o assessor precisa VER o
 * comprovante — senão vai pedir de novo e queimar a boa vontade do cliente.
 */
async function carregarDocs(supabase: SupabaseClient, leadId: string): Promise<DocLink[]> {
    const { data } = await supabase
        .from('crm_lead_documentos')
        .select('nome_arquivo, path, tipo, content_type')
        .eq('lead_id', leadId)
    const out: DocLink[] = []
    const vistos = new Set<string>()
    for (const d of (data ?? []) as Array<{ nome_arquivo: string; path: string | null; tipo: string | null; content_type: string | null }>) {
        if (!d.path || vistos.has(d.nome_arquivo)) continue
        vistos.add(d.nome_arquivo)
        const { data: signed } = await supabase.storage
            .from(DOCS_BUCKET)
            .createSignedUrl(d.path, 7 * 24 * 3600)
        if (!signed?.signedUrl) continue
        out.push({
            nome: d.nome_arquivo,
            url: signed.signedUrl,
            tipo: String(d.tipo || 'outro'),
            contentType: String(d.content_type || ''),
        })
    }
    return out
}

/** Bloco que o assessor recebe: quem é, onde está, o que quer, e o que ele disse. */
function textoParaAssessor(
    lead: LeadHandoff,
    uf: string | null,
    fone: string,
    mensagemDoLead: string,
    conflito: string,
    docs: DocLink[],
): string {
    const qual = resumoQualificacaoTexto(lead)
    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    const str = (v: unknown) => String(v ?? '').trim()

    // Dados de cadastro que já temos: poupa o assessor de perguntar de novo o
    // que o cliente já respondeu — repetir pergunta é o que faz o lead achar
    // que ninguém se falou.
    const cadastro: string[] = []
    if (str((lead as { cpf?: string }).cpf)) cadastro.push(`*CPF:* ${str((lead as { cpf?: string }).cpf)}`)
    if (str((lead as { email?: string }).email)) cadastro.push(`*E-mail:* ${str((lead as { email?: string }).email)}`)
    if (str(xd.endereco_titular)) cadastro.push(`*Endereço:* ${str(xd.endereco_titular)}`)
    const faz = [str(xd.fazenda_nome), str(xd.fazenda_cidade), str(xd.fazenda_uf)].filter(Boolean).join(' · ')
    if (faz) cadastro.push(`*Fazenda:* ${faz}`)
    const ie = str(lead.inscricao_estadual) || (str(lead.tem_inscricao_estadual).toLowerCase() === 'sim' ? 'declara ter (nº não informado)' : '')
    if (ie) cadastro.push(`*I.E.:* ${ie}`)

    return [
        '🔔 *Lead respondeu — é seu*',
        '',
        `*${lead.nome || 'Sem nome'}*`,
        `📱 ${fone}`,
        uf ? `📍 ${[lead.cidade, uf].filter(Boolean).join('/')}` : '📍 UF não identificada',
        '',
        mensagemDoLead ? `_"${mensagemDoLead.slice(0, 280)}"_` : '',
        qual ? `\n${qual}` : '',
        cadastro.length ? `\n📇 *Cadastro já coletado*\n${cadastro.join('\n')}` : '',
        docs.length
            ? `\n📎 *${docs.length} documento${docs.length > 1 ? 's' : ''}* que ele já enviou vão logo abaixo.`
            : '\n📎 Nenhum documento enviado ainda.',
        conflito ? `\n⚠ ${conflito}` : '',
        '',
        '_Ele já foi avisado de que você vai chamar._',
    ].filter(Boolean).join('\n')
}

/**
 * Executa o repasse. Idempotente por cooldown: chamar de novo no mesmo dia não
 * gera aviso duplicado, mas o lead continua sendo respondido (ficar mudo depois
 * de o cliente escrever é pior que repetir).
 */
export async function executarHandoff(
    supabase: SupabaseClient,
    input: {
        lead: LeadHandoff
        phone: string
        /** Última mensagem do lead — vai no aviso do assessor. */
        mensagem?: string | null
        agora?: Date
    },
): Promise<HandoffResult> {
    const agora = input.agora ?? new Date()
    const lead = input.lead
    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    const fone = input.phone || lead.celular || lead.telefone || ''

    // Zona: UF declarada manda; DDD é o último recurso e, quando diverge, marca
    // conflito em vez de alocar em silêncio (o chip segue a pessoa, a fazenda não).
    const zona = resolveZona({
        ufCadastro: lead.estado,
        ufFazenda: String(xd.fazenda_uf ?? '') || null,
        ufDdd: ufFromPhone(fone),
    })

    const jaRepassado = repassadoRecentemente(lead, agora)

    // 1) Responde o lead. Sempre — mesmo em repasse repetido.
    const r = await sendOutbound(supabase, {
        to: { phone: fone, leadId: lead.id, name: lead.nome },
        text: textoParaLead(firstName(lead.nome) || '', zona.assessor),
        // Resposta a quem acabou de escrever: janela de 24h aberta, texto livre,
        // sem trava de horário comercial (responder é educação, não campanha).
        intent: 'crm_reply',
        origin: 'handoff-assessor',
        botStep: 'handoff_modo_assessor',
    })
    const respondido = r.status === 'sent' || r.status === 'queued'

    // 2) Avisa o assessor — nunca quando o "lead" é gente da casa testando, e
    // só se ainda não avisamos há pouco. O sócio conferindo a régua com o
    // próprio WhatsApp chegou a virar "cliente novo" na caixa de um assessor;
    // a resposta ao lead continua saindo (dá pra testar a experiência do
    // cliente), o que não sai é a notificação interna.
    const interno = await ehNumeroInterno(supabase, fone)
    let assessorAvisado = false
    let docsEnviados = 0
    if (!jaRepassado && !interno.interno) {
        const docs = await carregarDocs(supabase, lead.id)
        const aviso = await avisarAssessor(supabase, {
            assessor: zona.assessor,
            leadId: lead.id,
            texto: textoParaAssessor(
                lead,
                zona.uf,
                fone,
                String(input.mensagem ?? ''),
                zona.conflito ? zona.detalhe : '',
                docs,
            ),
        })
        assessorAvisado = aviso.sent

        // 2b) Os arquivos, logo depois do texto. Best-effort: o recado já foi, e
        // anexo que falha não pode derrubar o repasse.
        if (assessorAvisado && docs.length) {
            const { phone: foneAssessor } = await telefoneDoAssessor(supabase, zona.assessor)
            const sessao = await sessaoOperacional(supabase)
            if (foneAssessor) {
                for (const d of docs) {
                    const ehPdf = d.contentType.includes('pdf') || /\.pdf$/i.test(d.nome)
                    const r = await sendVpsDirect(foneAssessor, '', {
                        type: ehPdf ? 'document' : 'image',
                        url: d.url,
                        ...(d.contentType ? { mimetype: d.contentType } : {}),
                        caption: `${lead.nome || 'Lead'} — ${DOC_ROTULO[d.tipo] ?? DOC_ROTULO.outro}`,
                        ...(ehPdf ? { fileName: d.nome } : {}),
                    }, sessao)
                    if (r.ok) docsEnviados++
                }
            }
        }
    }

    // 3) Marca o lead: dono definido, robô fora.
    const history = Array.isArray(lead.contact_history) ? [...lead.contact_history] : []
    if (!jaRepassado) {
        history.unshift({
            id: crypto.randomUUID(),
            type: 'whatsapp',
            date: agora.toISOString(),
            notes: `Lead respondeu — repassado para ${zona.assessor ?? 'assessor não identificado'} (${zona.detalhe})`,
            by: 'handoff-automatico',
        })
    }

    if (interno.interno) {
        return {
            handled: true, assessor: zona.assessor, respondido,
            assessorAvisado: false, docsEnviados: 0, conflitoZona: zona.conflito,
            reason: `numero_interno:${interno.nome ?? 'equipe'}`,
        }
    }

    const update: Record<string, unknown> = {
        handoff_humano: true,
        handoff_at: agora.toISOString(),
        extra_data: {
            ...xd,
            ...(jaRepassado ? {} : { handoff_assessor_at: agora.toISOString() }),
            handoff_assessor: zona.assessor,
            handoff_zona: zona.detalhe,
            ...(zona.conflito ? { handoff_zona_conflito: true } : {}),
        },
        ...(jaRepassado ? {} : { contact_history: history }),
        // Não sobrescreve responsável já definido por gente.
        ...(zona.assessor && !String(lead.responsavel ?? '').trim() ? { responsavel: zona.assessor } : {}),
    }
    const { error } = await supabase.from('crm_leads').update(update).eq('id', lead.id)
    if (error) console.warn('[handoff] marcar lead falhou:', error.message)

    return {
        handled: true,
        assessor: zona.assessor,
        respondido,
        assessorAvisado,
        docsEnviados,
        conflitoZona: zona.conflito,
        reason: jaRepassado ? 'ja_repassado_recentemente' : undefined,
    }
}
