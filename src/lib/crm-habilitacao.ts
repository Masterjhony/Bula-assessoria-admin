/**
 * Checklist de HABILITAÇÃO do lead — fonte única de verdade sobre "o que falta"
 * para o cadastro em leiloeiras (comprar parcelado em leilão).
 *
 * É usado em três lugares, sempre com a MESMA regra:
 *   • Concierge IA — o checklist é injetado no prompt ("já temos X, falta Y"),
 *     então a IA nunca pede o que já foi coletado e sabe exatamente o próximo
 *     passo (assertividade vem daqui, não do "feeling" do modelo);
 *   • Lógica determinística de etapas — INFORMAÇÕES CAPTADAS/pronto-para-
 *     cadastro é decidido por dados, auditável;
 *   • UI (inbox/cockpit/card do CRM) — o humano vê o progresso da conversa.
 *
 * Os campos do titular vivem nas colunas reais de `crm_leads`; os da
 * propriedade e o "recibo semântico" dos documentos vivem em `extra_data`
 * (padrão do projeto). Documentos têm dupla checagem: a IA marca o que
 * reconheceu (`docs_recebidos`), mas só conta se existir arquivo REAL em
 * `crm_lead_documentos` — o modelo não consegue "inventar" documento.
 */

export type ChecklistGroup = 'titular' | 'propriedade' | 'documentos'

export interface ChecklistItem {
    key: string
    /** Rótulo curto exibido na UI e no prompt da IA. */
    label: string
    group: ChecklistGroup
    done: boolean
    /** Valor já coletado (quando aplicável), para exibição. */
    value?: string
}

export interface HabilitacaoChecklist {
    items: ChecklistItem[]
    done: number
    total: number
    /** true quando TODOS os itens estão ok e há ≥2 arquivos reais. */
    complete: boolean
    missingLabels: string[]
}

/** Tipos semânticos de documento que a IA pode marcar como recebidos. */
export const DOC_TIPOS_SEMANTICOS = [
    'identidade',            // foto da CNH/RG
    'identidade_selfie',     // foto segurando o documento (autenticidade)
    'comprovante_propriedade',
    'ie_nirf',               // cartão/comprovante de I.E. ou NIRF
    'movimentacao_pecuaria', // GTA, nota fiscal de gado, cartão/declaração de produtor
] as const
export type DocTipoSemantico = (typeof DOC_TIPOS_SEMANTICOS)[number]

export interface HabilitacaoInput {
    nome?: string | null
    cpf?: string | null
    telefone?: string | null
    celular?: string | null
    email?: string | null
    inscricao_estadual?: string | null
    tem_inscricao_estadual?: string | null
    extra_data?: Record<string, unknown> | null
    /** Quantos arquivos reais existem em crm_lead_documentos. */
    docsCount: number
    /** Tipos (heurísticos) dos arquivos reais: 'ie' | 'cpf' | 'comprovante' | ... */
    docTipos?: string[]
    /**
     * Leilão que aceita cadastro SEM Inscrição Estadual (ex.: EAO Baviera).
     * Quando o lead é dessa campanha E declarou não ter I.E., o item da I.E.
     * conta como resolvido — senão o checklist nunca fecha e a ficha nunca é
     * enviada às leiloeiras. Vazio = regra normal (I.E. obrigatória).
     */
    ieDispensadaPara?: string | null
    /**
     * A consulta oficial (Sintegra) já trouxe a propriedade e a I.E. do titular.
     * Nesse caso pedimos UM documento (foto da CNH/RG) em vez de três: os dados
     * já foram conferidos numa base do Estado, então a selfie e o comprovante de
     * propriedade deixam de ser a única prova. Foi assim que o cadastro do
     * Ricardo (aprovado) entrou: dados + um documento.
     */
    documentosSimplificados?: boolean
}

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/**
 * A IA às vezes grava a PALAVRA "null" (ou "undefined", "-", "n/a") em vez de
 * deixar o campo vazio. Como "null" tem 4 caracteres, o checklist dava o item
 * como preenchido: um lead chegou a 11/11 com `inscricao_estadual = "null"` e
 * `fazenda_nome = "null"`, pronto para ir à leiloeira com dado falso.
 */
const str = (v: unknown) => {
    const s = String(v ?? '').trim()
    return /^(null|undefined|nulo|n\/a|na|-|--)$/i.test(s) ? '' : s
}

function xd(input: HabilitacaoInput, key: string): string {
    return str((input.extra_data ?? {})[key])
}

function docsRecebidos(input: HabilitacaoInput): Set<string> {
    const raw = (input.extra_data ?? {}).docs_recebidos
    const set = new Set<string>()
    if (Array.isArray(raw)) for (const d of raw) set.add(String(d))
    return set
}

/**
 * Calcula o checklist de habilitação a partir do estado atual do lead.
 * Determinístico e barato — pode rodar a cada mensagem.
 */
export function computeHabilitacaoChecklist(input: HabilitacaoInput): HabilitacaoChecklist {
    const semantic = docsRecebidos(input)
    const tipos = new Set((input.docTipos ?? []).map(t => String(t)))
    const temArquivoReal = input.docsCount >= 1

    const nome = str(input.nome)
    const cpf = digits(input.cpf)
    const fone = str(input.celular) || str(input.telefone)
    const email = str(input.email)
    const endereco = xd(input, 'endereco_titular')
    const fazendaNome = xd(input, 'fazenda_nome')
    const fazendaCidade = xd(input, 'fazenda_cidade')
    const fazendaUf = xd(input, 'fazenda_uf')
    const ie = str(input.inscricao_estadual)
    const temIe = str(input.tem_inscricao_estadual).toLowerCase() === 'sim'
    const ieDispensada = Boolean(str(input.ieDispensadaPara))

    // Documentos: a marcação semântica da IA só vale com arquivo real por trás,
    // e cada foto exige o SEU arquivo. Com um único arquivo a IA marcava
    // "identidade" e "identidade_selfie" ao mesmo tempo — o checklist zerava as
    // pendências mas `complete` continuava falso, e ninguém entendia o porquê.
    const docIdentidade = input.docsCount >= 1 && (semantic.has('identidade') || tipos.has('cpf'))
    const docSelfie = input.docsCount >= 2 && semantic.has('identidade_selfie')
    const docFiscal = temArquivoReal && (
        semantic.has('comprovante_propriedade') || semantic.has('ie_nirf')
        || tipos.has('ie') || tipos.has('comprovante')
    )
    // Movimentação pecuária: prova que o produtor OPERA (GTA, nota de gado,
    // cartão/declaração de produtor). A leiloeira (Programa/EAO) exige para
    // analisar — e nenhuma API entrega, então SÓ o lead pode enviar.
    const docMovimentacao = temArquivoReal && (semantic.has('movimentacao_pecuaria') || tipos.has('movimentacao'))

    const items: ChecklistItem[] = [
        { key: 'nome_completo', label: 'Nome completo', group: 'titular', done: /\S+\s+\S+/.test(nome), value: nome || undefined },
        { key: 'cpf', label: 'CPF', group: 'titular', done: cpf.length === 11, value: cpf || undefined },
        { key: 'telefone', label: 'Telefone', group: 'titular', done: fone.length >= 8, value: fone || undefined },
        { key: 'email', label: 'E-mail', group: 'titular', done: email.includes('@'), value: email || undefined },
        { key: 'endereco', label: 'Endereço do titular (cidade/UF/CEP)', group: 'titular', done: endereco.length >= 8, value: endereco || undefined },

        { key: 'fazenda_nome', label: 'Nome da fazenda (entrega)', group: 'propriedade', done: fazendaNome.length >= 2, value: fazendaNome || undefined },
        {
            key: 'fazenda_local', label: 'Cidade/UF da fazenda', group: 'propriedade',
            done: fazendaCidade.length >= 2 && fazendaUf.length === 2,
            value: fazendaCidade ? `${fazendaCidade}${fazendaUf ? '/' + fazendaUf : ''}` : undefined,
        },
        {
            key: 'inscricao_estadual',
            label: ieDispensada ? `Inscrição Estadual (dispensada — ${str(input.ieDispensadaPara)})` : 'Inscrição Estadual (ou NIRF)',
            group: 'propriedade',
            done: ie.length >= 3 || temIe || ieDispensada,
            value: ie || (temIe ? 'Tem (nº pendente)' : ieDispensada ? 'Dispensada para este leilão' : undefined),
        },

        { key: 'doc_identidade', label: 'Foto da CNH/RG', group: 'documentos', done: docIdentidade },
    ]

    // A ficha que a leiloeira aprovou (Ricardo P. Moreira, 07/2026) pediu:
    // dados + "foto do documento e foto segurando o documento". NÃO pediu
    // comprovante de propriedade — e era esse item que travava 34 dos 35 leads.
    // Ele deixou de ser exigido; quando o lead manda, entra como ✔ extra.
    // Com a propriedade já confirmada no Sintegra, a selfie também cai: os dados
    // foram conferidos numa base do Estado, não na palavra do lead.
    if (!input.documentosSimplificados) {
        items.push({ key: 'doc_identidade_selfie', label: 'Foto segurando o documento', group: 'documentos', done: docSelfie })
    }
    // Movimentação pecuária é agora item OBRIGATÓRIO: a leiloeira só analisa o
    // cadastro com a prova de que o produtor atua no meio (Márcia/Programa,
    // 07/2026). É o único documento que a consulta não substitui.
    items.push({
        key: 'doc_movimentacao',
        label: 'Comprovante de movimentação pecuária (GTA, nota de gado ou cartão de produtor)',
        group: 'documentos',
        done: docMovimentacao,
    })
    if (docFiscal) {
        items.push({ key: 'doc_fiscal', label: 'Comprovante da propriedade / I.E. (extra)', group: 'documentos', done: true })
    }

    // Com movimentação obrigatória, o cadastro completo tem sempre ≥2 arquivos
    // (identidade + movimentação), mesmo no fluxo simplificado por consulta.
    const minDocs = 2
    const done = items.filter(i => i.done).length
    const complete = done === items.length && input.docsCount >= minDocs
    return {
        items,
        done,
        total: items.length,
        complete,
        missingLabels: items.filter(i => !i.done).map(i => i.label),
    }
}

const GROUP_LABEL: Record<ChecklistGroup, string> = {
    titular: 'Dados do titular',
    propriedade: 'Dados da propriedade',
    documentos: 'Documentos',
}

/**
 * Bloco de texto do checklist para o prompt da IA: o que JÁ TEMOS (com valor)
 * e o que FALTA, agrupado. É isto que impede a IA de repetir perguntas e a faz
 * pedir exatamente o próximo item.
 */
export function checklistPromptBlock(cl: HabilitacaoChecklist): string {
    const lines: string[] = []
    for (const group of ['titular', 'propriedade', 'documentos'] as ChecklistGroup[]) {
        const items = cl.items.filter(i => i.group === group)
        lines.push(`${GROUP_LABEL[group]}:`)
        for (const i of items) {
            lines.push(i.done ? `  ✔ ${i.label}${i.value ? `: ${i.value}` : ''}` : `  ✘ FALTA — ${i.label}`)
        }
    }
    lines.push(cl.complete
        ? 'CHECKLIST COMPLETO: não peça mais nada; confirme e informe que a habilitação foi encaminhada.'
        : `Progresso: ${cl.done}/${cl.total}. Peça SOMENTE itens marcados com ✘, priorizando dados antes de documentos.`)
    return lines.join('\n')
}
