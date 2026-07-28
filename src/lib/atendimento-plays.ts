/**
 * CATÁLOGO DE PLAYS — o "como chamar".
 *
 * A ontologia decide QUEM e PRA QUÊ; aqui a gente resolve COM O QUÊ. Cada play
 * aponta para um template Meta JÁ APROVADO e monta as variáveis a partir do que
 * se sabe do lead (qualificação, checklist) e do mundo (agenda de leilões).
 *
 * Por que template e não texto livre: fora da janela de 24h a Meta só entrega
 * template. Como o motor fala justamente com quem está calado — que por
 * definição está fora da janela — template é a regra, não a exceção. Quando a
 * janela está aberta (resgate de quem acabou de escrever), o play devolve texto
 * livre e o gateway entrega direto.
 *
 * REGRAS DE VARIÁVEL DA META (aprender uma vez, respeitar sempre):
 *   • nada de quebra de linha, tab ou 5+ espaços seguidos dentro de {{n}};
 *   • variável vazia = mensagem recusada no envio;
 *   • o texto renderizado aqui é só para log/cockpit — quem monta a mensagem
 *     real é a Meta, encaixando os params no corpo aprovado.
 *
 * Conteúdo dos templates: ver `scripts/atendimento-motor-preview.mjs --bodies`
 * ou a aba Templates da Central WhatsApp.
 */

import type { HabilitacaoChecklist } from './crm-habilitacao'
import type { Segmento } from './concierge-persona'
import type { LeadOntologia, PlayId } from './atendimento-ontologia'

/** Leilão futuro, do jeito que o motor precisa (subset de `bula_leiloes`). */
export interface LeilaoResumo {
    nome: string
    /** ISO date (YYYY-MM-DD). */
    data: string
    tipo: string | null
    leiloeira: string | null
}

export interface ContextoPlay {
    lead: LeadOntologia
    checklist: HabilitacaoChecklist
    segmento: Segmento
    /** Próximos leilões, já ordenados por data. */
    agenda: LeilaoResumo[]
    agora: Date
}

export interface Mensagem {
    /** Nome do template Meta. null quando a janela está aberta (texto livre). */
    templateName: string | null
    templateParams: string[]
    /** Corpo para log/cockpit — e o texto REAL quando templateName é null. */
    texto: string
    botStep: string
}

// ── Utilitários de texto ────────────────────────────────────────────────────

const MESES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** Sanitiza um valor de variável de template: sem quebras, sem espaço duplo. */
function param(v: unknown, fallback: string): string {
    const s = String(v ?? '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
    return s || fallback
}

function primeiroNome(nome: string | null | undefined): string {
    const n = String(nome ?? '').trim().split(/\s+/)[0]
    // Nome de 1 letra ou lixo ("...", "-") viraria "Olá, .!" — melhor genérico.
    return n && n.length >= 2 && /[a-zA-ZÀ-ú]/.test(n) ? n : 'tudo bem'
}

function xd(lead: LeadOntologia): Record<string, unknown> {
    return (lead.extra_data ?? {}) as Record<string, unknown>
}

function dataCurta(iso: string): string {
    const [, m, d] = iso.split('-')
    return d && m ? `${d}/${m}` : iso
}

/**
 * Frase com os próximos leilões — vira a "novidade" de vários plays.
 * Curta de propósito: template com parágrafo enorme na variável fica ilegível
 * no WhatsApp e derruba a leitura.
 */
export function fraseAgenda(agenda: LeilaoResumo[], max = 3): string {
    const itens = agenda.slice(0, max).map(l => `${l.nome} (${dataCurta(l.data)})`)
    if (itens.length === 0) return 'novos leilões de touros e matrizes entrando na agenda'
    if (itens.length === 1) return itens[0]
    return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

/** Mês dominante da agenda ("agosto"), pro template de agenda. */
function mesDaAgenda(agenda: LeilaoResumo[], agora: Date): string {
    const primeiro = agenda[0]?.data
    const mes = primeiro ? Number(primeiro.split('-')[1]) - 1 : agora.getUTCMonth()
    return MESES[mes] ?? MESES[agora.getUTCMonth()]
}

/**
 * O que o lead declarou buscar, em linguagem de gente. Usado como "assunto" na
 * retomada — dizer "o assunto era touros" prova que a gente lembra dele, que é
 * metade da reabertura.
 */
export function assuntoDoLead(lead: LeadOntologia): string {
    const x = xd(lead)
    const bruto = [
        x.objetivo_compra_resumido,
        (lead as unknown as { interesse_principal?: string }).interesse_principal,
        (lead as unknown as { o_que_busca?: string }).o_que_busca,
        (lead as unknown as { interesse?: string }).interesse,
    ].map(v => String(v ?? '').trim()).find(Boolean)
    if (!bruto) return 'compra de gado em leilão'
    // "Leilões" sozinho não diz nada — o campo é notoriamente pobre.
    if (/^lei(l[ãa]o|l[õo]es)$/i.test(bruto)) return 'compra de gado em leilão'
    return bruto.toLowerCase()
}

// ── Montagem por play ───────────────────────────────────────────────────────

/**
 * Benefício curto usado nos templates de habilitação ({{2}}). Varia com o
 * segmento pra não soar decorado quando o mesmo lead recebe dois toques.
 */
function beneficioHabilitacao(segmento: Segmento): string {
    switch (segmento) {
        case 'iniciante':
            return 'a gente te acompanha desde a escolha do animal até a entrega'
        case 'criador_po':
            return 'você participa dos remates de P.O. com nossa análise a campo'
        default:
            return 'você compra parcelado em até 30x no boleto, com frete grátis na maioria dos leilões'
    }
}

/** Template de boas-vindas + a pergunta de abertura, por persona. */
function primeiroContato(ctx: ContextoPlay, nome: string): Mensagem {
    switch (ctx.segmento) {
        case 'iniciante':
            return {
                templateName: 'bula_boas_vindas_iniciante',
                templateParams: [nome, param('você pensa em começar com matrizes ou já quer um touro pra cobrir', 'qual seu plano pra começar')],
                texto: `Olá, ${nome}! Vi que você quer começar a criar gado. Aqui é o João, da Bula Assessoria — a gente acompanha quem está dando os primeiros passos, sem custo. Você pensa em começar com matrizes ou já quer um touro pra cobrir?`,
                botStep: 'motor_primeiro_contato_iniciante',
            }
        case 'criador_po':
            return {
                templateName: 'bula_boas_vindas_criador',
                templateParams: [nome, param('com laudo, avaliação genética e histórico de família', 'com avaliação a campo')],
                texto: `Olá, ${nome}! João, da Bula Assessoria. A gente acompanha os principais remates de Nelore P.O. do país — nossa equipe vai a campo antes e aparta o que realmente presta, com laudo, avaliação genética e histórico de família. Quer que eu te mande a agenda dos próximos leilões?`,
                botStep: 'motor_primeiro_contato_criador',
            }
        default:
            return {
                templateName: 'bula_boas_vindas_produtor',
                templateParams: [nome, param('cria, recria ou engorda', 'cria ou engorda')],
                texto: `Olá, ${nome}! Aqui é o João, da Bula Assessoria. Trabalho ajudando produtor a subir o padrão do rebanho com genética P.O. — touro certo valoriza a bezerrada na hora da venda. Hoje você trabalha mais com cria, recria ou engorda?`,
                botStep: 'motor_primeiro_contato_produtor',
            }
    }
}

/**
 * Monta a mensagem do play.
 *
 * `janelaAberta` muda o resultado: com a janela aberta a gente fala como gente
 * (texto livre), com ela fechada a Meta só aceita template. `tentativa` é o
 * número do toque deste play (1 = primeira vez) e serve pra trocar o ângulo em
 * vez de repetir a mesma frase — repetição idêntica é o que faz o lead bloquear.
 */
export function montarMensagem(
    play: PlayId,
    ctx: ContextoPlay,
    opts: { janelaAberta: boolean; tentativa: number },
): Mensagem {
    const nome = primeiroNome(ctx.lead.nome)
    const cl = ctx.checklist
    const x = xd(ctx.lead)

    switch (play) {
        // ── Resgate ──────────────────────────────────────────────────────────
        case 'resgate_sem_resposta': {
            const assunto = assuntoDoLead(ctx.lead)
            if (opts.janelaAberta) {
                // Janela aberta: nada de template. Uma desculpa curta e a bola
                // de volta pro lead — quem ficou sem resposta merece a verdade,
                // não um molde de marketing.
                return {
                    templateName: null,
                    templateParams: [],
                    texto: `Oi, ${nome}! Desculpa a demora em te responder aqui. Vi sua mensagem sobre ${assunto} — posso seguir daqui e te ajudar?`,
                    botStep: 'motor_resgate_janela_aberta',
                }
            }
            return {
                templateName: 'retomada_atendimento',
                templateParams: [nome, param(assunto, 'compra de gado em leilão')],
                texto: `Olá, ${nome}! Aqui é da Bula Assessoria. Retomando nosso atendimento: ficou registrado que o assunto era ${assunto}. Posso continuar por aqui e te fazer uma pergunta rápida para direcionar melhor?`,
                botStep: 'motor_resgate_template',
            }
        }

        // ── Habilitação ──────────────────────────────────────────────────────
        case 'doc_pendente': {
            const item = cl.items.find(i => i.group === 'documentos' && !i.done)
            // A equivalência mais fácil vai junto: pedir "certidão de ônus" seco
            // trava o lead; dizer que a matrícula serve destrava.
            const EQUIV: Record<string, string> = {
                doc_identidade: 'um documento com foto (RG, CNH ou CPF serve)',
                doc_endereco: 'um comprovante de residência (conta de luz, água ou telefone)',
                doc_matricula: 'a certidão de ônus da fazenda (a matrícula ou escritura também serve)',
                doc_renda: 'um comprovante de renda (declaração de IR ou extrato bancário dos últimos 3 meses)',
            }
            const oQue = EQUIV[item?.key ?? ''] ?? item?.label ?? 'um documento do cadastro'
            return {
                templateName: 'documento_pendente',
                templateParams: [nome, param(oQue, 'um documento do cadastro')],
                texto: `Olá, ${nome}! Para concluir seu cadastro, ainda falta um documento: ${oQue}. Pode enviar por aqui mesmo que a gente segue com o processo.`,
                botStep: 'motor_doc_pendente',
            }
        }

        case 'dados_pendentes': {
            const faltam = cl.missingLabels
                .filter(l => !/documento|comprovante|certid/i.test(l))
                .slice(0, 2)
            const oQue = faltam.length ? faltam.join(' e ').toLowerCase() : 'um dado do titular'
            // Na 2ª cobrança o ângulo muda: em vez de repetir a lista, trata a
            // objeção silenciosa ("pra que vocês querem meus dados?").
            if (opts.tentativa >= 2) {
                return {
                    templateName: 'bula_cadastro_duvida',
                    templateParams: [nome, param('me manda só o que tiver em mãos que eu completo o resto por aqui', 'me chama que eu te ajudo')],
                    texto: `Olá, ${nome}! Vi que a gente parou na parte do cadastro. Ele é o processo padrão das leiloeiras para liberar seus lances, e seus dados são usados somente para isso. Se ficou qualquer dúvida, me pergunta por aqui.`,
                    botStep: 'motor_dados_pendentes_duvida',
                }
            }
            return {
                templateName: 'bula_cadastro_retomada',
                templateParams: [nome, param(oQue, 'um dado do titular')],
                texto: `Olá, ${nome}! Seu cadastro para participar dos leilões está quase finalizado — falta só ${oQue}. O resto eu resolvo por aqui mesmo, em um minuto. Podemos concluir?`,
                botStep: 'motor_dados_pendentes',
            }
        }

        case 'habilitacao_link':
            return {
                templateName: 'bula_habilitacao_link',
                templateParams: [nome],
                texto: `Olá, ${nome}! Para adiantar sua habilitação na Bula, você mesmo pode preencher os dados e enviar os documentos de uma vez, direto no nosso site — leva alguns minutos e é o mesmo cadastro, no seu tempo.`,
                botStep: 'motor_habilitacao_link',
            }

        case 'cadastro_status': {
            const status = param(x.cadastro_status, 'sua ficha está com as leiloeiras parceiras para análise')
            const proximo = 'assim que sair a aprovação eu te aviso por aqui e já libero seu lance no próximo leilão'
            return {
                templateName: 'bula_cadastro_status',
                templateParams: [nome, status, param(proximo, 'te aviso assim que sair')],
                texto: `Olá, ${nome}! Atualização sobre a sua habilitação: ${status}. Próximo passo: ${proximo}.`,
                botStep: 'motor_cadastro_status',
            }
        }

        // ── Retomada ─────────────────────────────────────────────────────────
        case 'retoma_apresentacao': {
            const beneficio = beneficioHabilitacao(ctx.segmento)
            // 1ª: convite direto. 2ª+: o ângulo "sincero", que nomeia a parte
            // chata em vez de fingir que não existe — converte melhor em quem
            // já ouviu a proposta e não se mexeu.
            if (opts.tentativa >= 2) {
                return {
                    templateName: 'bula_habilitacao_sincera',
                    templateParams: [nome, param(beneficio, 'eu cuido da papelada com você')],
                    texto: `Olá, ${nome}! A assessoria da Bula é gratuita: nosso time vai a campo antes do leilão e fica do seu lado na hora do lance. Vou ser sincero: pra liberar os lances a leiloeira pede uma habilitação com alguns dados e documentos. É a parte chata — mas eu carrego ela com você, e ${beneficio}. Topa começar?`,
                    botStep: 'motor_retoma_apresentacao_sincera',
                }
            }
            return {
                templateName: 'bula_habilitacao_convite',
                templateParams: [nome, param(beneficio, 'a assessoria não custa nada pra você')],
                texto: `Olá, ${nome}! Você pode se habilitar para receber a assessoria gratuita da Bula: nossa equipe analisa os animais a campo antes dos leilões e acompanha seu lance do início ao fim. Sem custo nenhum pra você — ${beneficio}. Quer que eu já deixe sua habilitação pronta?`,
                botStep: 'motor_retoma_apresentacao_convite',
            }
        }

        case 'retoma_interesse': {
            const assunto = assuntoDoLead(ctx.lead)
            const novidade = fraseAgenda(ctx.agenda, 2)
            return {
                templateName: 'bula_retomada_interesse',
                templateParams: [nome, param(assunto, 'compra de gado em leilão'), param(novidade, 'novos leilões na agenda')],
                texto: `Olá, ${nome}! Quando a gente conversou, você comentou sobre ${assunto}. Apareceu novidade que tem tudo a ver: ${novidade}. Quer que eu te passe os detalhes?`,
                botStep: 'motor_retoma_interesse',
            }
        }

        // ── Topo ─────────────────────────────────────────────────────────────
        case 'primeiro_contato':
            return primeiroContato(ctx, nome)

        case 'reengaja_frio': {
            const novidade = fraseAgenda(ctx.agenda, 2)
            return {
                templateName: 'bula_reengajamento',
                templateParams: [nome, param(novidade, 'novos leilões de touros e matrizes na agenda')],
                texto: `Olá, ${nome}! Faz um tempo que a gente conversou por aqui. Nesse meio tempo apareceu coisa boa: ${novidade}. Se fizer sentido pro seu momento, me responde por aqui que eu te passo os detalhes sem compromisso.`,
                botStep: 'motor_reengaja_frio',
            }
        }

        case 'agenda_leiloes': {
            const mes = mesDaAgenda(ctx.agenda, ctx.agora)
            const lista = fraseAgenda(ctx.agenda, 3)
            return {
                templateName: 'bula_agenda_leiloes',
                templateParams: [nome, param(mes, 'este mês'), param(lista, 'leilões de touros e matrizes')],
                texto: `Olá, ${nome}! Nossa agenda de ${mes} está confirmada: ${lista}. Todos com assessoria da Bula, sem custo pra você. Quer que eu te mande os detalhes de algum deles?`,
                botStep: 'motor_agenda_leiloes',
            }
        }
    }
}

/**
 * Todos os templates que o motor pode disparar. O planejador valida contra a
 * lista de aprovados da Meta antes de gravar o plano — template reprovado vira
 * envio recusado e o lead fica sem toque, silenciosamente.
 */
export const TEMPLATES_DO_MOTOR = [
    'retomada_atendimento',
    'documento_pendente',
    'bula_cadastro_retomada',
    'bula_cadastro_duvida',
    'bula_habilitacao_link',
    'bula_cadastro_status',
    'bula_habilitacao_convite',
    'bula_habilitacao_sincera',
    'bula_retomada_interesse',
    'bula_boas_vindas_iniciante',
    'bula_boas_vindas_produtor',
    'bula_boas_vindas_criador',
    'bula_reengajamento',
    'bula_agenda_leiloes',
] as const
