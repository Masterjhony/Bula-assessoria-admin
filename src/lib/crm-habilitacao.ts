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

/**
 * Tipos semânticos de documento que a IA pode marcar como recebidos.
 * Espelham a LISTA OFICIAL de análise de crédito PF da leiloeira (Programa/
 * Márcia, 07/2026): documento+selfie, endereço, matrícula do imóvel + ITR,
 * renda, casamento (opcional). Referências (3, com telefone) são DADO, não
 * documento — coletadas na conversa e guardadas em extra_data.referencias.
 */
export const DOC_TIPOS_SEMANTICOS = [
    'identidade',            // documento pessoal com foto (frente/verso)
    'identidade_selfie',     // selfie segurando o documento
    'comprovante_endereco',  // comprovante de endereço p/ correspondência
    'matricula_imovel',      // certidão de matrícula atualizada do imóvel rural
    'itr',                   // ITR do imóvel
    'comprovante_renda',     // IR + extrato bancário (3 meses)
    'certidao_casamento',    // opcional
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

    // Documentos da ANÁLISE DE CRÉDITO PF (lista oficial da leiloeira). Cada
    // marcação semântica da IA só vale com arquivo real por trás; o tipo real do
    // arquivo (docTipos, classificado no upload) é o caminho mais confiável.
    const doc = (sem: string, tipo: string) => temArquivoReal && (semantic.has(sem) || tipos.has(tipo))
    const docIdentidade = input.docsCount >= 1 && (semantic.has('identidade') || tipos.has('cpf'))
    // Selfie precisa do SEU arquivo (a mesma foto não é doc E selfie).
    const docSelfie = input.docsCount >= 2 && semantic.has('identidade_selfie')
    const docEndereco = doc('comprovante_endereco', 'endereco')
    const docMatricula = doc('matricula_imovel', 'matricula')
    const docItr = doc('itr', 'itr')
    const docRenda = doc('comprovante_renda', 'renda')
    const docCasamento = doc('certidao_casamento', 'casamento')

    // Referências: 3 comerciais/pessoais COM telefone. São dado, não arquivo —
    // a IA coleta na conversa e grava em extra_data.referencias (nome + fone).
    const refsRaw = (input.extra_data ?? {}).referencias
    const referencias = (Array.isArray(refsRaw) ? refsRaw : [])
        .map(r => (typeof r === 'string' ? r : `${(r as Record<string, unknown>)?.nome ?? ''} ${(r as Record<string, unknown>)?.telefone ?? ''}`))
        .map(s => String(s).trim())
        .filter(s => /\d{8,}/.test(s.replace(/\D/g, '')))

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

        // Lista oficial de análise de crédito PF (todos OBRIGATÓRIOS, exceto
        // casamento). NENHUMA consulta substitui — vêm do lead.
        { key: 'doc_identidade', label: 'Documento pessoal com foto (frente e verso)', group: 'documentos', done: docIdentidade },
        { key: 'doc_identidade_selfie', label: 'Selfie segurando o documento', group: 'documentos', done: docSelfie },
        { key: 'doc_endereco', label: 'Comprovante de endereço (correspondência, no titular)', group: 'documentos', done: docEndereco },
        { key: 'doc_matricula', label: 'Certidão de matrícula atualizada do imóvel rural (cartório)', group: 'documentos', done: docMatricula },
        { key: 'doc_itr', label: 'ITR do imóvel', group: 'documentos', done: docItr },
        { key: 'doc_renda', label: 'Comprovante de renda (Decl. de IR + extrato bancário 3 meses)', group: 'documentos', done: docRenda },
        { key: 'referencias', label: '3 referências comerciais/pessoais (com telefone)', group: 'documentos', done: referencias.length >= 3, value: referencias.length ? `${referencias.length}/3` : undefined },
    ]

    // Certidão de casamento é OPCIONAL na lista da leiloeira: só aparece como ✔
    // quando o lead manda — nunca trava o checklist.
    if (docCasamento) {
        items.push({ key: 'doc_casamento', label: 'Certidão de casamento', group: 'documentos', done: true })
    }

    const done = items.filter(i => i.done).length
    const complete = done === items.length
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
