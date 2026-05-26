// ── Membros ──────────────────────────────────────────────
export interface BulaMembro {
    id: string
    nome: string
    iniciais: string
    cor: string
}

// ── Leilões ──────────────────────────────────────────────
export type LeilaoStatus = 'confirmado' | 'negociacao' | 'prospecto' | 'concluido'

export interface LeilaoSubtask {
    lbl: string
    done: boolean
}

export interface LeilaoAnexo {
    lbl: string
    url: string
}

export interface LeilaoTaskResp {
    nome: string
    ini: string
    /** ID do membro em leiloes_equipe quando escolhido pelo dropdown.
     *  Opcional para retrocompat com checklists já preenchidas com texto livre. */
    membro_id?: string | null
}

export interface LeilaoTask {
    id: string
    nome: string
    ini: string
    fim: string
    resp: LeilaoTaskResp
    subs: LeilaoSubtask[]
    /** Status de conclusão (usado quando a task é um item plano, sem subs). */
    done?: boolean
    /** Observação rápida sobre o item. */
    observacao?: string
    /** Anexos / links relacionados. */
    anexos?: LeilaoAnexo[]
}

export interface LeilaoGrupo {
    nome: string
    cor: string
    /** Subtítulo descritivo do bloco (ex.: "Organização dos materiais e classificação dos lotes"). */
    subtitulo?: string
    tasks: LeilaoTask[]
}

export interface BulaLeilao {
    id: string
    nome: string
    data: string
    tipo: string
    local: string
    animais: number
    expectativa: number
    meta_bula: number
    realizado_bula: number
    status: LeilaoStatus
    img: string
    tasks: LeilaoGrupo[]
    assessores: BulaMembro[]
    horario?: string
    transmissao?: string
    modelo?: string
    leiloeira?: string
    condicao?: string
    frete_gratis?: string
    acordo_comissao?: string
    catalogo_url?: string
}

// ── Projeto / Kanban ─────────────────────────────────────
export type CardColuna = 'backlog' | 'afazer' | 'andamento' | 'concluido'
export type CardPrioridade = 'alta' | 'media' | 'baixa'

export interface CardCheck {
    l: string
    d: boolean
}

export interface CardComentario {
    autor: string
    texto: string
    data: string
}

export interface BulaCard {
    id: string
    titulo: string
    descricao: string
    coluna: CardColuna
    prioridade: CardPrioridade
    vencimento: string | null
    checks: CardCheck[]
    comentarios: CardComentario[]
    posicao: number
    responsaveis: BulaMembro[]
}

// ── CRM ──────────────────────────────────────────────────
export type DealTemperatura = 'quente' | 'morno' | 'frio'

export interface CrmEtapa {
    id: string
    nome: string
    cor: string
}

export interface DealAtividade {
    type: string
    date: string
    text: string
}

export interface BulaDeal {
    id: string
    funil_id: string
    etapa_id: string
    nome: string
    localizacao: string
    telefone: string
    email: string
    valor: number
    temperatura: DealTemperatura
    assessor_id: string | null
    assessor?: BulaMembro | null
    notas: string
    timeline: DealAtividade[]
    dias_no_estagio: number
}

export interface BulaFunil {
    id: string
    slug: string
    nome: string
    icone: string
    etapas: CrmEtapa[]
    deals: BulaDeal[]
}

// ── Leads ─────────────────────────────────────────────────
export type LeadStatus = 'novo' | 'atendimento' | 'qualificado' | 'descartado'
export type LeadOrigem = 'Instagram' | 'Google Ads' | 'Facebook' | 'WhatsApp' | 'Site'

export interface BulaLead {
    id: string
    nome: string
    telefone: string
    regiao: string
    rebanho: number
    origem: LeadOrigem
    status: LeadStatus
    interesse: string
    orcamento: number
    created_at: string
}

// ── Marketing config ──────────────────────────────────────
export interface BulaMarketingConfig {
    id: string
    investimento: number
}
