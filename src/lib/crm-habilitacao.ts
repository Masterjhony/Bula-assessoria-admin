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
    /**
     * Item DESEJÁVEL ("se possível"), não obrigatório. Não trava `complete` nem
     * a submissão; a IA pede com leveza e a ficha inclui se houver. É o caso dos
     * documentos que a leiloeira aceita receber depois (documento com foto,
     * comprovante de residência) na régua enxuta que a Márcia concedeu.
     */
    optional?: boolean
    /** Valor já coletado (quando aplicável), para exibição. */
    value?: string
}

export interface HabilitacaoChecklist {
    items: ChecklistItem[]
    done: number
    total: number
    /** true quando TODOS os itens obrigatórios (dados + dossiê de documentos) estão ok. */
    complete: boolean
    missingLabels: string[]
}

/**
 * Tipos semânticos de documento que a IA pode marcar como recebidos.
 * Régua vigente (decisão do chefe, 22/07/2026): a flexibilização de 10/07
 * ("documentos se possível") deixou o funil ineficiente — fichas seguiam sem
 * dossiê e voltavam. Documentos voltaram a ser OBRIGATÓRIOS, com equivalências:
 *   • documento pessoal com foto — RG, CNH ou CPF (UM só resolve);
 *   • comprovante de residência;
 *   • certidão de ônus da fazenda — certidão de matrícula/escritura serve
 *     (arrendatário: contrato de arrendamento);
 *   • comprovante de renda — declaração de IR OU extrato bancário dos últimos
 *     3 meses (a leiloeira mede capacidade de pagamento).
 */
export const DOC_TIPOS_SEMANTICOS = [
    'identidade',            // documento pessoal com foto (RG/CNH/CPF)
    'comprovante_endereco',  // comprovante de residência/correspondência
    'certidao_matricula',    // certidão de ônus/matrícula/escritura da fazenda (ou arrendamento)
    'comprovante_renda',     // declaração de IR ou extrato bancário (3 meses)
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
     * LEGADO (sem efeito desde 22/07/2026): a flexibilização "consulta oficial
     * substitui documento" deixou o funil ineficiente — o dossiê completo voltou
     * a ser obrigatório. O campo fica aceito para não quebrar os chamadores.
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
    // Além dos "null"/"undefined", pega declarações NEGATIVAS que vazaram para
    // campos de valor (ex.: inscricao_estadual = "nao_tem"): sem isto, "nao_tem"
    // (7 chars) passava por I.E. válida e o checklist fechava com dado falso.
    return /^(null|undefined|nulo|n\/a|na|-|--|n[aã]o[ _]?tem|n[aã]o[ _]?possui|nenhuma?|sem)$/i.test(s) ? '' : s
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

    // Documentos OBRIGATÓRIOS (régua 22/07). A marcação semântica da IA só vale
    // com arquivo real por trás; o tipo real do arquivo (docTipos) é o mais
    // confiável. Equivalências: RG/CNH/CPF = um documento só; certidão de ônus
    // aceita matrícula/escritura (arrendatário: contrato); renda aceita IR ou
    // extrato bancário dos últimos 3 meses.
    const docIdentidade = temArquivoReal && (semantic.has('identidade') || tipos.has('cpf'))
    const docResidencia = temArquivoReal && (semantic.has('comprovante_endereco') || tipos.has('endereco') || tipos.has('comprovante'))
    const docMatricula = temArquivoReal && (semantic.has('certidao_matricula') || tipos.has('matricula') || tipos.has('contrato'))
    const docRenda = temArquivoReal && (semantic.has('comprovante_renda') || tipos.has('renda'))

    // OBRIGATÓRIO = dados (nome, CPF, I.E., endereço, telefone, propriedade)
    // + os 4 documentos do dossiê. Só o e-mail segue desejável.
    const items: ChecklistItem[] = [
        { key: 'nome_completo', label: 'Nome completo', group: 'titular', done: /\S+\s+\S+/.test(nome), value: nome || undefined },
        { key: 'cpf', label: 'CPF', group: 'titular', done: cpf.length === 11, value: cpf || undefined },
        { key: 'telefone', label: 'Telefone', group: 'titular', done: fone.length >= 8, value: fone || undefined },
        { key: 'endereco', label: 'Endereço de correspondência', group: 'titular', done: endereco.length >= 8, value: endereco || undefined },
        { key: 'email', label: 'E-mail', group: 'titular', optional: true, done: email.includes('@'), value: email || undefined },

        {
            key: 'inscricao_estadual',
            label: ieDispensada ? `Inscrição Estadual (dispensada — ${str(input.ieDispensadaPara)})` : 'Inscrição Estadual (ou NIRF)',
            group: 'propriedade',
            // I.E. real tem DÍGITOS: exigir número (≥3 dígitos) evita que lixo de
            // texto ("nao_tem") ou nome ffeche o item por engano.
            done: ie.replace(/\D/g, '').length >= 3 || temIe || ieDispensada,
            value: ie.replace(/\D/g, '').length >= 3 ? ie : (temIe ? 'Tem (nº pendente)' : ieDispensada ? 'Dispensada para este leilão' : undefined),
        },
        // Propriedade é OBRIGATÓRIA: ficha com Fazenda/Cidade "—" é vaga e a
        // leiloeira barra. Vem das consultas oficiais (Sintegra/CNIR) quando há
        // I.E.; senão, o lead informa. Sem isto não submete.
        { key: 'fazenda_nome', label: 'Nome da fazenda (entrega)', group: 'propriedade', done: fazendaNome.length >= 2, value: fazendaNome || undefined },
        {
            key: 'fazenda_local', label: 'Cidade/UF da fazenda', group: 'propriedade',
            done: fazendaCidade.length >= 2 && fazendaUf.length === 2,
            value: fazendaCidade ? `${fazendaCidade}${fazendaUf ? '/' + fazendaUf : ''}` : undefined,
        },

        // Dossiê obrigatório (régua 22/07) — trava a submissão até fechar.
        { key: 'doc_identidade', label: 'Documento pessoal com foto (RG/CNH ou CPF)', group: 'documentos', done: docIdentidade },
        { key: 'doc_endereco', label: 'Comprovante de residência', group: 'documentos', done: docResidencia },
        { key: 'doc_matricula', label: 'Certidão de ônus ou matrícula da fazenda', group: 'documentos', done: docMatricula },
        { key: 'doc_renda', label: 'Comprovante de renda (IR ou extrato bancário 3 meses)', group: 'documentos', done: docRenda },
    ]

    const obrigatorios = items.filter(i => !i.optional)
    const done = items.filter(i => i.done).length
    // `complete` = todos os OBRIGATÓRIOS ok (os desejáveis não seguram).
    const complete = obrigatorios.every(i => i.done)
    return {
        items,
        done,
        total: items.length,
        // missingLabels lista os obrigatórios que faltam (é o que a IA pede
        // primeiro); os desejáveis a IA pede "se possível" via checklistPromptBlock.
        missingLabels: obrigatorios.filter(i => !i.done).map(i => i.label),
        complete,
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
            const marca = i.optional ? ' (se possível)' : ''
            lines.push(i.done
                ? `  ✔ ${i.label}${i.value ? `: ${i.value}` : ''}`
                : `  ✘ FALTA — ${i.label}${marca}`)
        }
    }
    lines.push(cl.complete
        ? 'CHECKLIST COMPLETO (dados + documentos): a habilitação já pode ser encaminhada às leiloeiras. Não peça mais nada.'
        : `Progresso interno: ${cl.done}/${cl.total}. Peça primeiro os itens ✘ sem "(se possível)" — dados E documentos são obrigatórios; só os "(se possível)" (ex.: e-mail) não travam. EQUIVALÊNCIAS que facilitam pro lead: RG, CNH ou CPF = UM documento com foto só; certidão de ônus pode ser a certidão de matrícula/escritura da fazenda (arrendatário: contrato de arrendamento); comprovante de renda pode ser a declaração de IR OU extrato bancário dos últimos 3 meses — sempre ofereça a alternativa mais fácil e explique que a leiloeira usa pra dimensionar o crédito do parcelamento.`)
    lines.push('PARA O LEAD, fale por BLOCO, nunca por contagem de itens: bloco completo = "Identificação concluída"; incompleto = "falta só a parte da propriedade". NUNCA diga "X de 12 itens" — jornada longa percebida derruba a conclusão.')
    return lines.join('\n')
}
