/**
 * A FOTO. Todas as variáveis e validações leem daqui — uma única leitura, um
 * único instante.
 *
 * Isto resolve uma classe inteira de incoerência que não é erro de fórmula:
 * duas telas mostrarem números diferentes porque consultaram o banco com
 * segundos de diferença, ou porque uma paginou em 1000 linhas e a outra não.
 * Aqui tudo é paginado até o fim e congelado numa estrutura só.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ContaBancaria {
    id: string; nome: string; saldo_inicial: number; saldo_atual: number
    ativo: boolean; tipo: string | null
}
export interface Movimento {
    id: string; conta_bancaria_id: string; data: string; tipo: string; valor: number
    descricao: string | null; categoria_id: string | null; pessoa_id: string | null
    conta_pagar_id: string | null; conta_receber_id: string | null
    transferencia_par_id: string | null
    status_conciliacao: string; conciliado: boolean; origem: string | null
    created_at: string | null; updated_at: string | null
}
export interface Titulo {
    id: string; descricao: string; valor: number
    desconto: number; juros: number; multa: number
    valor_pago?: number; valor_recebido?: number
    emissao: string | null; vencimento: string
    data_pagamento?: string | null; data_recebimento?: string | null
    status: string; categoria_id: string | null
    conta_bancaria_id: string | null; fechamento_id: string | null
    origem: string | null; evento_key: string | null
    substituido_por: string | null; substituido_em: string | null
    observacoes: string | null; tags: string[] | null
    fornecedor_id?: string | null; cliente_id?: string | null
    created_at: string | null; updated_at: string | null
}
export interface Categoria {
    id: string; nome: string; tipo: string; dre_grupo: string | null; ativo: boolean
}
export interface Fechamento {
    id: string; nome: string; data: string
    vgv_total: number; lotes_vendidos: number; animais_vendidos: number
    comissao_assessoria: number; receita_bula: number | null
    faturamento_total_leilao: number | null
    acordo_pct_faturamento: number | null; acordo_pct_venda_cobertura: number | null
    acordo_descricao: string | null
    lances: { vgv?: number; animais?: number }[] | null
    por_assessor: { assessor?: string; vgv?: number; comissao?: number }[] | null
    compradores: { comprador?: string; vgv?: number }[] | null
    observacoes: string | null
    created_at: string | null; updated_at: string | null
}

export interface Cartao {
    id: string; apelido: string; bandeira: string | null; final: string | null
    titular: string | null; limite_credito: number | null; limite_disponivel: number | null
    divida_consolidada: number | null; parcelas_a_faturar: number | null
    vencimento_dia: number | null; debito_automatico: boolean | null
    conta_pagamento_id: string | null; ativo: boolean
}
export interface CartaoFatura {
    id: string; cartao_id: string; competencia: string
    saldo_anterior: number; debitos: number; encargos: number; pagamentos: number
    total_fatura: number; data_vencimento: string | null; data_pagamento: string | null
    valor_pago: number | null; status: string
    movimento_id: string | null; conta_pagar_id: string | null; origem: string | null
}
export interface CartaoLancamento {
    id: string; fatura_id: string | null; cartao_id: string; data_compra: string
    descricao: string; portador: string | null; valor: number; tipo: string | null
    categoria_id: string | null
}
export interface FolhaLinha {
    id: string; nome: string; funcao: string | null
    salario_fixo: number | null; comissao_pct: number | null; comissao_fixa: number | null
    ativo: boolean; empresa: string | null; fornecedor_id: string | null
    pagamento_nome: string | null; apelidos: string[] | null
}
export interface Pessoa {
    id: string; tipo: string; nome: string; documento: string | null
    is_cliente: boolean | null; is_fornecedor: boolean | null; ativo: boolean | null
}
export interface PlanoConta {
    id: string; codigo: string; nome: string; tipo: string
    natureza: string; parent_id: string | null; dre_grupo: string | null; ativo: boolean
}
export interface Lancamento {
    id: string; numero: number | null; data: string; historico: string | null
    valor_total: number; status: string; origem: string | null
    conta_pagar_id: string | null; conta_receber_id: string | null; movimento_id: string | null
}
export interface Partida {
    id: string; lancamento_id: string; plano_conta_id: string
    centro_custo_id: string | null; natureza: string; valor: number
}
export interface CentroCusto { id: string; codigo: string | null; nome: string; ativo: boolean }
export interface ResultadoHistorico {
    id: string; ano: number; mes: number; leiloes: number | null; lotes: number | null
    vgv: number | null; receita: number | null
    vendedores: number | null; compradores: number | null
}

export interface Fatos {
    /** Instante da foto (ISO). */
    foto_em: string
    hoje: string
    contas: ContaBancaria[]
    movimentos: Movimento[]
    cp: Titulo[]
    cr: Titulo[]
    categorias: Categoria[]
    fechamentos: Fechamento[]
    cartoes: Cartao[]
    faturas: CartaoFatura[]
    cartaoLancamentos: CartaoLancamento[]
    folha: FolhaLinha[]
    pessoas: Pessoa[]
    plano: PlanoConta[]
    lancamentos: Lancamento[]
    partidas: Partida[]
    centros: CentroCusto[]
    resultadosHistorico: ResultadoHistorico[]
    /** categoria_id -> dre_grupo, para não repetir lookup em toda variável. */
    dreGrupo: Map<string, string>
    catNome: Map<string, string>
    /**
     * Ids dos movimentos que são transferência interna pela DEFINIÇÃO CANÔNICA.
     * Ver `ehTransferencia` — existe porque o ERP tinha quatro definições
     * concorrentes e elas não coincidiam.
     */
    transferencias: Set<string>
}

async function todos<T>(sb: SupabaseClient, tabela: string, cols: string): Promise<T[]> {
    const out: T[] = []
    for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from(tabela).select(cols).range(from, from + 999)
        if (error) throw new Error(`${tabela}: ${error.message}`)
        out.push(...((data || []) as unknown as T[]))
        if (!data || data.length < 1000) break
    }
    return out
}

const COLS_TITULO =
    'id,descricao,valor,desconto,juros,multa,emissao,vencimento,status,categoria_id,' +
    'conta_bancaria_id,fechamento_id,origem,evento_key,substituido_por,substituido_em,' +
    'observacoes,tags,created_at,updated_at'

export async function carregarFatos(sb: SupabaseClient, opts: { hoje?: string } = {}): Promise<Fatos> {
    const foto_em = new Date().toISOString()
    const hoje = opts.hoje || foto_em.slice(0, 10)

    const [
        contas, movimentos, cp, cr, categorias, fechamentos,
        cartoes, faturas, cartaoLancamentos, folha, pessoas,
        plano, lancamentos, partidas, centros, resultadosHistorico,
    ] = await Promise.all([
        todos<ContaBancaria>(sb, 'erp_contas_bancarias', 'id,nome,saldo_inicial,saldo_atual,ativo,tipo'),
        todos<Movimento>(sb, 'erp_movimentos_bancarios',
            'id,conta_bancaria_id,data,tipo,valor,descricao,categoria_id,pessoa_id,' +
            'conta_pagar_id,conta_receber_id,transferencia_par_id,status_conciliacao,conciliado,' +
            'origem,created_at,updated_at'),
        todos<Titulo>(sb, 'erp_contas_pagar', COLS_TITULO + ',valor_pago,data_pagamento,fornecedor_id'),
        todos<Titulo>(sb, 'erp_contas_receber', COLS_TITULO + ',valor_recebido,data_recebimento,cliente_id'),
        todos<Categoria>(sb, 'erp_categorias', 'id,nome,tipo,dre_grupo,ativo'),
        todos<Fechamento>(sb, 'bula_leilao_fechamento',
            'id,nome,data,vgv_total,lotes_vendidos,animais_vendidos,comissao_assessoria,receita_bula,' +
            'faturamento_total_leilao,acordo_pct_faturamento,acordo_pct_venda_cobertura,acordo_descricao,' +
            'lances,por_assessor,compradores,observacoes,created_at,updated_at'),
        todos<Cartao>(sb, 'erp_cartoes',
            'id,apelido,bandeira,final,titular,limite_credito,limite_disponivel,' +
            'divida_consolidada,parcelas_a_faturar,vencimento_dia,debito_automatico,' +
            'conta_pagamento_id,ativo'),
        todos<CartaoFatura>(sb, 'erp_cartao_faturas',
            'id,cartao_id,competencia,saldo_anterior,debitos,encargos,pagamentos,total_fatura,' +
            'data_vencimento,data_pagamento,valor_pago,status,movimento_id,conta_pagar_id,origem'),
        todos<CartaoLancamento>(sb, 'erp_cartao_lancamentos',
            'id,fatura_id,cartao_id,data_compra,descricao,portador,valor,tipo,categoria_id'),
        todos<FolhaLinha>(sb, 'erp_folha_estrutura',
            'id,nome,funcao,salario_fixo,comissao_pct,comissao_fixa,ativo,empresa,' +
            'fornecedor_id,pagamento_nome,apelidos'),
        todos<Pessoa>(sb, 'erp_pessoas', 'id,tipo,nome,documento,is_cliente,is_fornecedor,ativo'),
        todos<PlanoConta>(sb, 'erp_plano_contas', 'id,codigo,nome,tipo,natureza,parent_id,dre_grupo,ativo'),
        todos<Lancamento>(sb, 'erp_lancamentos',
            'id,numero,data,historico,valor_total,status,origem,conta_pagar_id,conta_receber_id,movimento_id'),
        todos<Partida>(sb, 'erp_lancamento_partidas',
            'id,lancamento_id,plano_conta_id,centro_custo_id,natureza,valor'),
        todos<CentroCusto>(sb, 'erp_centros_custo', 'id,codigo,nome,ativo'),
        todos<ResultadoHistorico>(sb, 'erp_resultados_historico',
            'id,ano,mes,leiloes,lotes,vgv,receita,vendedores,compradores'),
    ])

    const dreGrupo = new Map<string, string>()
    const catNome = new Map<string, string>()
    for (const c of categorias) {
        if (c.dre_grupo) dreGrupo.set(c.id, c.dre_grupo)
        catNome.set(c.id, c.nome)
    }

    const transferencias = new Set(
        movimentos.filter(m => dreGrupo.get(m.categoria_id || '') === 'ignorar' || !!m.transferencia_par_id)
            .map(m => m.id))

    return {
        foto_em, hoje, contas, movimentos, cp, cr, categorias, fechamentos,
        cartoes, faturas, cartaoLancamentos, folha, pessoas,
        plano, lancamentos, partidas, centros, resultadosHistorico,
        dreGrupo, catNome, transferencias,
    }
}

// ---------------------------------------------------------------------------
// Vocabulário compartilhado — a mesma pergunta respondida do mesmo jeito em
// toda variável. Divergência aqui é divergência em todo o ERP.
// ---------------------------------------------------------------------------

export const num = (n: unknown) => Number(n || 0)
export const r2 = (n: number) => Math.round(n * 100) / 100

/** Cancelado nunca entra em soma nenhuma. Regra fechada na auditoria de 18/08. */
export const vivo = (t: Titulo) => t.status !== 'cancelado'

/** Estimativa substituída por um real já não é compromisso. */
export const naoSubstituido = (t: Titulo) => !t.substituido_por

/** Saldo devido de um título (o que ainda falta entrar/sair). */
export const devido = (t: Titulo, chave: 'valor_pago' | 'valor_recebido') =>
    num(t.valor) - num(t.desconto) + num(t.juros) + num(t.multa) - num(t[chave])

export const EM_ABERTO = ['aberto', 'parcial', 'vencido']
export const aberto = (t: Titulo) => vivo(t) && EM_ABERTO.includes(t.status)

/**
 * DEFINIÇÃO CANÔNICA de transferência interna — dinheiro que anda entre contas
 * do próprio grupo e não é receita nem despesa de ninguém.
 *
 * O ERP tinha QUATRO definições concorrentes, e elas divergiam de verdade:
 *   · nome da categoria ~ /transfer/i   → Dashboard, Fluxo, Previsto×Realizado
 *   · dre_grupo = 'ignorar'             → DRE
 *   · transferencia_par_id preenchido   → schema
 * As duas primeiras batem (188 movimentos); a terceira via só 164 — 24
 * transferências categorizadas jamais receberam o par. Quem usasse só o
 * `transferencia_par_id` somava R$ 473.749,61 de dinheiro que nunca foi
 * receita como se fosse.
 *
 * A regra passa a ser a UNIÃO: é transferência se o DRE manda ignorar OU se
 * existe par vinculado. `Resgate Aplicacao Financeira` entra por aqui, e é o
 * comportamento certo — resgate de aplicação não é receita.
 */
export const ehTransferencia = (m: Movimento, f: Pick<Fatos, 'dreGrupo'>) =>
    f.dreGrupo.get(m.categoria_id || '') === 'ignorar' || !!m.transferencia_par_id

/** Movimento que representa dinheiro de verdade entrando/saindo do grupo. */
export const operacional = (m: Movimento, f: Pick<Fatos, 'dreGrupo'>) => !ehTransferencia(m, f)

/**
 * DEFINIÇÃO CANÔNICA de compromisso ainda não incorrido (folha projetada,
 * recorrentes lançados adiante). Também tinha duas convenções: `origem =
 * 'estimativa'` nos títulos e `tags` contendo 'orcamento' no Balanço. Elas não
 * coincidem — e por causa disso R$ 17.011,00 de CR estimado entravam no
 * Balanço como ativo real.
 */
export const compromissoFuturo = (t: Titulo) =>
    t.origem === 'estimativa' || (t.tags || []).includes('orcamento')

/**
 * Título 'sintetico' é o lançamento agregado do pagamento em lote, criado para
 * o regime de CAIXA. Na competência quem responde pela despesa são os títulos
 * analíticos — somar os dois conta a mesma comissão duas vezes.
 */
export const sintetico = (t: Titulo) => t.origem === 'sintetico'

export const maxData = (datas: (string | null | undefined)[]): string | null => {
    const validas = datas.filter(Boolean).map(d => String(d).slice(0, 10)).sort()
    return validas.length ? validas[validas.length - 1] : null
}
