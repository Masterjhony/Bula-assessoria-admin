/**
 * Regras de EXCEÇÃO por campanha/leilão.
 *
 * O Mega Evento EAO Baviera aceita habilitar comprador SEM Inscrição Estadual —
 * é exceção deste leilão, não política da casa. Como 30 dos 49 leads que a
 * campanha trouxe marcaram "não tenho I.E." no formulário, sem esta exceção a
 * maioria da campanha empacava no checklist e nunca chegava às leiloeiras.
 *
 * Duas travas deliberadas, pedidas pelo comercial:
 *   1. A IA NUNCA antecipa que a I.E. é dispensável. Se antecipasse, todo mundo
 *      diria que não tem. A exceção só aparece DEPOIS que o lead, por conta
 *      própria, disser que não tem — e ainda assim como possibilidade
 *      ("para este leilão talvez dê"), nunca como promessa.
 *   2. Quando um lead segue sem I.E., o grupo interno é avisado com a ressalva
 *      de que a dispensa vale só para este evento.
 */

/** Leilão que hoje aceita cadastro sem I.E. Vazio = nenhuma exceção ativa. */
export const LEILAO_IE_FLEXIVEL = 'Mega Evento EAO Baviera (12/07)'

/** Campanhas cujo lead pode cair na exceção — casadas contra os UTMs da Meta. */
const CAMPANHA_IE_FLEXIVEL = /eao/i

export interface CampanhaLead {
    extra_data?: Record<string, unknown> | null
}

/**
 * O lead veio da campanha do EAO? Os anúncios gravam em extra_data.utm:
 *   campaign: "LEADS - FORMS INST EAO — Cópia"
 *   content : "video-leilao-eao-touros-04"
 */
export function isLeadCampanhaEao(lead: CampanhaLead): boolean {
    const utm = ((lead.extra_data ?? {}).utm ?? {}) as Record<string, unknown>
    const campos = [utm.campaign, utm.content, utm.source]
        .map(v => String(v ?? ''))
        .join(' ')
    return CAMPANHA_IE_FLEXIVEL.test(campos)
}

/** A I.E. pode ser dispensada para este lead? */
export function ieDispensavel(lead: CampanhaLead): boolean {
    return Boolean(LEILAO_IE_FLEXIVEL) && isLeadCampanhaEao(lead)
}

/** O lead já declarou (ou o formulário registrou) que não tem I.E.? */
export function declarouNaoTerIe(lead: CampanhaLead & { tem_inscricao_estadual?: string | null }): boolean {
    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    return String(xd.ie_status) === 'nao_tem'
        || String(lead.tem_inscricao_estadual ?? '').trim().toLowerCase() === 'não'
}

/**
 * Bloco de prompt da exceção. Só é injetado para lead da campanha — quem não é
 * dela nem vê a regra existir, então não há como a IA "vazar" a exceção.
 */
export function ieFlexivelPromptBlock(lead: CampanhaLead): string {
    if (!ieDispensavel(lead)) return ''
    return [
        `EXCEÇÃO DE I.E. — ${LEILAO_IE_FLEXIVEL} (este lead veio da campanha deste leilão):`,
        '- NUNCA diga, por iniciativa própria, que a Inscrição Estadual é dispensável. Peça a I.E. normalmente, como sempre.',
        '- SOMENTE se o lead disser que NÃO TEM I.E. (ou que não vai conseguir), aí você responde que, especificamente para',
        `  este leilão (${LEILAO_IE_FLEXIVEL}), TALVEZ seja possível habilitar o cadastro sem ela — que você vai verificar`,
        '  com a equipe e segue com o resto da documentação enquanto isso.',
        '- É POSSIBILIDADE, não promessa: nunca garanta a dispensa, nunca diga "não precisa".',
        '- Ao registrar isso, marque updates.ie_status="nao_tem" e siga o checklist normalmente, sem travar a conversa.',
    ].join('\n')
}

/** Frase do aviso interno quando um lead segue sem I.E. */
export function avisoIeDispensadaTexto(nome: string, fone: string): string {
    return [
        '⚠️ *Lead seguindo SEM Inscrição Estadual*',
        `${nome}${fone ? ` — ${fone}` : ''}`,
        `Veio da campanha do ${LEILAO_IE_FLEXIVEL}, que aceita cadastro sem I.E.`,
        'A dispensa vale SÓ para este leilão — confirmem com a leiloeira antes de prometer qualquer coisa ao cliente.',
    ].join('\n')
}
