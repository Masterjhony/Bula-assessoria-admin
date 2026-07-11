/**
 * QUALIFICAÇÃO do lead — fonte única do "o que sabemos sobre este produtor".
 *
 * O card do CRM mostrava só `interesse_principal`, que por ironia é o campo mais
 * pobre (vira "Leilões"). Enquanto isso o formulário da Meta já entrega momento
 * na pecuária, quantidade de cabeças, se tem I.E. e o que busca — e o concierge
 * ainda acrescenta sistema de produção, rebanho atual, objetivo e urgência.
 * Tudo isso estava gravado e invisível.
 *
 * Este módulo lê os três lugares onde o dado mora (colunas de `crm_leads`,
 * `extra_data` do concierge, e o formulário) e devolve uma lista uniforme, com
 * a PROCEDÊNCIA de cada valor — dá para o time saber se "cria e engorda" veio do
 * formulário ou a IA arrancou na conversa.
 *
 * É puro (sem dependência de servidor) porque roda nos dois lados: no card do
 * CRM (React) e no prompt do concierge.
 */

export type QualOrigem = 'formulário' | 'conversa' | 'consulta'
export type QualGrupo = 'perfil' | 'intenção' | 'fiscal' | 'jornada'

export interface QualItem {
    key: string
    label: string
    value: string
    origem: QualOrigem
    grupo: QualGrupo
}

export interface QualLead {
    interesse?: string | null
    interesse_principal?: string | null
    o_que_busca?: string | null
    momento_pecuaria?: string | null
    quantidade_animais?: string | null
    estado?: string | null
    cidade?: string | null
    tem_inscricao_estadual?: string | null
    inscricao_estadual?: string | null
    extra_data?: Record<string, unknown> | null
}

const str = (v: unknown) => String(v ?? '').trim()
/** Os slugs do formulário vêm com hífen e, num caso, com underscore. */
const slug = (v: unknown) => str(v).toLowerCase().replace(/_/g, '-')

/**
 * Colunas que a IA sobrescreveu durante a conversa (`extra_data.campos_ia`).
 * Sem isso o card mentiria: a Edianne marcou "50+" no anúncio, mas o "120
 * cabeças" saiu da boca dela no WhatsApp — e apareceria como [formulário].
 */
function origemDaColuna(xd: Record<string, unknown>, coluna: string, padrao: QualOrigem): QualOrigem {
    const campos = Array.isArray(xd.campos_ia) ? xd.campos_ia.map(String) : []
    return campos.includes(coluna) ? 'conversa' : padrao
}

/** Rótulos legíveis do "momento na pecuária" que o formulário da Meta grava. */
export const MOMENTO_PECUARIA_LABEL: Record<string, string> = {
    'pecuaria-de-corte': 'Trabalha com pecuária de corte',
    'nao-trabalho-quero-aprender': 'Ainda não trabalha com gado — quer entrar',
    'corte-e-po': 'Trabalha com corte e já mexe com P.O.',
    'criador-renomado-de-po': 'Criador renomado de P.O.',
    'trabalho-com-corte-e-po': 'Trabalha com corte e já mexe com P.O.',
    'trabalho-com-pecuaria-de-corte': 'Trabalha com pecuária de corte',
}

export const SISTEMA_PRODUCAO_LABEL: Record<string, string> = {
    cria: 'Cria',
    recria: 'Recria',
    engorda: 'Engorda',
    ciclo_completo: 'Ciclo completo (cria + engorda)',
    nao_definido: 'Não definido',
}

export const URGENCIA_LABEL: Record<string, string> = {
    agora: 'Quer comprar agora',
    proximos_30_dias: 'Próximos 30 dias',
    proximos_leiloes: 'Nos próximos leilões',
    sem_prazo: 'Sem prazo definido',
}

export const EXPERIENCIA_LABEL: Record<string, string> = {
    ja_compra: 'Já compra em leilão',
    ja_tentou: 'Já tentou, não concluiu',
    nunca_comprou: 'Nunca comprou em leilão',
}

export function momentoPecuariaLabel(v: unknown): string {
    const s = slug(v)
    if (!s) return ''
    return MOMENTO_PECUARIA_LABEL[s] ?? str(v)
}

/**
 * Monta a lista de qualificação. Só entram itens COM valor — o card mostra o que
 * sabemos, e o que falta aparece pela ausência (o checklist cuida das lacunas).
 */
export function buildQualificacao(lead: QualLead): QualItem[] {
    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    const out: QualItem[] = []
    const add = (key: string, label: string, value: unknown, origem: QualOrigem, grupo: QualGrupo) => {
        const v = str(value)
        if (v) out.push({ key, label, value: v, origem, grupo })
    }

    // ── Perfil (quem é o produtor) ──────────────────────────────────────────
    add('momento_pecuaria', 'Momento na pecuária', momentoPecuariaLabel(lead.momento_pecuaria), 'formulário', 'perfil')
    add('sistema_producao', 'Sistema de produção',
        SISTEMA_PRODUCAO_LABEL[str(xd.sistema_producao)] ?? xd.sistema_producao, 'conversa', 'perfil')
    add('rebanho_atual', 'Rebanho hoje', xd.rebanho_atual, 'conversa', 'perfil')
    add('quantidade_animais', 'Quantidade de cabeças', lead.quantidade_animais,
        origemDaColuna(xd, 'quantidade_animais', 'formulário'), 'perfil')
    const local = [str(lead.cidade), str(lead.estado)].filter(Boolean).join('/')
    add('local', 'Cidade/UF', local, 'formulário', 'perfil')

    // ── Intenção (o que ele quer) ───────────────────────────────────────────
    add('o_que_busca', 'O que busca (formulário)', lead.o_que_busca, 'formulário', 'intenção')
    add('interesse', 'Interesse declarado', lead.interesse, 'formulário', 'intenção')
    add('interesse_principal', 'Interesse (classificado)', lead.interesse_principal, 'conversa', 'intenção')
    add('objetivo', 'Objetivo da compra', xd.objetivo_compra_resumido, 'conversa', 'intenção')
    add('urgencia', 'Urgência',
        URGENCIA_LABEL[str(xd.urgencia_compra)] ?? xd.urgencia_compra, 'conversa', 'intenção')
    add('experiencia', 'Experiência em leilão',
        EXPERIENCIA_LABEL[str(xd.experiencia_leilao)] ?? xd.experiencia_leilao, 'conversa', 'intenção')

    // ── Fiscal ──────────────────────────────────────────────────────────────
    const temIe = str(lead.tem_inscricao_estadual)
    add('tem_ie', 'Tem Inscrição Estadual?', temIe, 'formulário', 'fiscal')
    add('ie', 'Nº da Inscrição Estadual', lead.inscricao_estadual,
        str(xd.ie_status) ? 'conversa' : 'consulta', 'fiscal')
    if (xd.ie_dispensada_leilao) {
        add('ie_dispensada', 'I.E. dispensada', `Sim — ${str(xd.ie_dispensada_leilao)}`, 'conversa', 'fiscal')
    }

    // ── Jornada (onde ele está no funil consultivo) ─────────────────────────
    if (xd.assessoria_apresentada_at) add('apresentada', 'Assessoria apresentada', 'Sim', 'conversa', 'jornada')
    if (xd.aceitou_assessoria === true) add('aceitou', 'Aceitou o acompanhamento', 'Sim', 'conversa', 'jornada')
    add('cadastro_status', 'Status do cadastro', xd.cadastro_status, 'conversa', 'jornada')
    add('proxima_acao', 'Próxima ação', xd.proxima_acao, 'conversa', 'jornada')

    return out
}

/**
 * Resumo COMPACTO da qualificação para os avisos internos do WhatsApp (Baileys).
 * Serve ao assessor que vai assumir o lead: em 2–4 linhas ele já sabe quem é o
 * produtor, o que quer e como está no fiscal — sem abrir o CRM. Uma linha por
 * grupo (`Perfil:`, `Intenção:`, `Fiscal:`), valores separados por ` · `; grupos
 * sem dado somem. Local/UF fica de fora (a notificação já traz a linha de UF).
 * Reaproveita os mesmos rótulos/mapas da fonte única acima.
 */
export function resumoQualificacaoLinhas(lead: QualLead): string[] {
    const xd = (lead.extra_data ?? {}) as Record<string, unknown>
    const linhas: string[] = []

    const perfil = [
        momentoPecuariaLabel(lead.momento_pecuaria),
        SISTEMA_PRODUCAO_LABEL[str(xd.sistema_producao)] ?? str(xd.sistema_producao),
        str(lead.quantidade_animais) ? `${str(lead.quantidade_animais)} cabeças` : '',
        str(xd.rebanho_atual) ? `rebanho: ${str(xd.rebanho_atual)}` : '',
    ].filter(Boolean)
    if (perfil.length) linhas.push(`Perfil: ${perfil.join(' · ')}`)

    const intencao = [
        str(lead.interesse_principal) || str(lead.o_que_busca) || str(lead.interesse),
        str(xd.objetivo_compra_resumido),
        URGENCIA_LABEL[str(xd.urgencia_compra)] ?? str(xd.urgencia_compra),
        EXPERIENCIA_LABEL[str(xd.experiencia_leilao)] ?? str(xd.experiencia_leilao),
    ].filter(Boolean)
    if (intencao.length) linhas.push(`Intenção: ${intencao.join(' · ')}`)

    const fiscal: string[] = []
    if (str(lead.tem_inscricao_estadual)) fiscal.push(`Tem I.E.: ${str(lead.tem_inscricao_estadual)}`)
    else if (str(lead.inscricao_estadual)) fiscal.push(`I.E.: ${str(lead.inscricao_estadual)}`)
    if (str(xd.ie_dispensada_leilao)) fiscal.push(`I.E. dispensada (${str(xd.ie_dispensada_leilao)})`)
    if (fiscal.length) linhas.push(`Fiscal: ${fiscal.join(' · ')}`)

    return linhas
}

/** Resumo da qualificação como bloco de texto (linhas já com "📋"), ou '' se vazio. */
export function resumoQualificacaoTexto(lead: QualLead): string {
    const linhas = resumoQualificacaoLinhas(lead)
    if (!linhas.length) return ''
    return ['📋 *Qualificação*', ...linhas].join('\n')
}

export const QUAL_GRUPO_LABEL: Record<QualGrupo, string> = {
    perfil: 'Perfil do produtor',
    'intenção': 'Intenção de compra',
    fiscal: 'Situação fiscal',
    jornada: 'Jornada',
}

/**
 * Bloco para o prompt do concierge. Diferente do card, aqui a PROCEDÊNCIA
 * importa muito: o que veio do formulário o lead pode ter respondido no
 * automático (a Edianne marcou "quero aprender" e depois disse que toca 120
 * cabeças). Então a IA é instruída a confirmar, não a assumir.
 */
export function qualificacaoPromptBlock(lead: QualLead): string {
    const items = buildQualificacao(lead)
    if (!items.length) return 'QUALIFICAÇÃO: (nada levantado ainda)'
    const lines = ['QUALIFICAÇÃO JÁ LEVANTADA (não pergunte de novo o que está aqui):']
    for (const g of ['perfil', 'intenção', 'fiscal', 'jornada'] as QualGrupo[]) {
        const doGrupo = items.filter(i => i.grupo === g)
        if (!doGrupo.length) continue
        lines.push(`  ${QUAL_GRUPO_LABEL[g]}:`)
        for (const i of doGrupo) lines.push(`    • ${i.label}: ${i.value}  [${i.origem}]`)
    }
    lines.push('')
    lines.push('Dado marcado [formulário] foi clicado num anúncio e pode estar desatualizado ou impreciso —')
    lines.push('se a conversa contradisser, VALE O QUE ELE DISSER AGORA e você atualiza em updates.')
    lines.push('Dado marcado [conversa] veio da boca dele: trate como verdade e nunca repita a pergunta.')
    return lines.join('\n')
}
