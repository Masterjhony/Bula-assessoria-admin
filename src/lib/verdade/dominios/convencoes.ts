/**
 * CONVENÇÕES — as regras de vocabulário que o ERP inteiro precisa obedecer.
 *
 * Este é o domínio mais importante do sistema de verdade, e o menos óbvio.
 * A maioria das incoerências do ERP não veio de conta errada: veio de duas
 * partes do sistema chamando coisas diferentes pelo mesmo nome. Enquanto cada
 * tela definia "transferência interna" ou "compromisso futuro" do seu jeito,
 * elas somavam universos diferentes e mostravam números diferentes — sem que
 * nada estivesse "quebrado".
 *
 * As validações daqui não olham para valores. Olham para o acordo semântico.
 */

import type { DefinicaoValidacao, DefinicaoVariavel, ResultadoCalculo } from '../tipos'
import { cobreTudo } from '../tipos'
import { type Fatos, aberto, num, r2, vivo } from '../fatos'

const brl = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const lista = (xs: string[], n = 4) =>
    xs.slice(0, n).join('; ') + (xs.length > n ? ` … (+${xs.length - n})` : '')

export const VARIAVEIS: DefinicaoVariavel<Fatos>[] = [
    {
        id: 'convencao.aderencia',
        titulo: 'Aderência às convenções do ERP',
        unidade: 'percentual',
        classe: 'derivada',
        formula: 'fração dos registros em que as convenções concorrentes (transferência, compromisso futuro) coincidem',
        calcular: (f): ResultadoCalculo => {
            // Transferência: união canônica × cada definição isolada.
            const porDre = new Set(f.movimentos.filter(m => f.dreGrupo.get(m.categoria_id || '') === 'ignorar').map(m => m.id))
            const porPar = new Set(f.movimentos.filter(m => m.transferencia_par_id).map(m => m.id))
            const canonico = f.transferencias
            const divergemMov = [...canonico].filter(id => !porDre.has(id) || !porPar.has(id)).length

            // Compromisso futuro: origem = estimativa × tag 'orcamento'.
            const titulos = [...f.cp, ...f.cr].filter(t => aberto(t))
            const divergemTit = titulos.filter(t => {
                const est = t.origem === 'estimativa'
                const orc = (t.tags || []).includes('orcamento')
                return est !== orc
            }).length

            const universo = canonico.size + titulos.length
            const alinhados = universo - divergemMov - divergemTit
            return {
                valor: universo ? r2((alinhados / universo) * 100) : 100,
                origens: [
                    { fonte: 'erp_movimentos_bancarios', filtro: 'transferências internas', linhas: canonico.size },
                    { fonte: 'erp_contas_pagar + erp_contas_receber', filtro: 'títulos em aberto', linhas: titulos.length },
                ],
                cobertura: cobreTudo(universo),
                composicao: [
                    { rotulo: 'registros com convenções alinhadas', valor: alinhados },
                    { rotulo: 'transferências marcadas de um jeito só', valor: divergemMov },
                    { rotulo: 'títulos futuros marcados de um jeito só', valor: divergemTit },
                ],
                atualizado_em: f.hoje,
            }
        },
    },
]

export const VALIDACOES: DefinicaoValidacao<Fatos>[] = [
    {
        id: 'convencao_transferencia',
        titulo: 'as definições de "transferência interna" coincidem',
        severidade: 'warn',
        afeta: ['receita.mes', 'despesa.mes', 'resultado.mes', 'margem.mes', 'convencao.aderencia'],
        checar: (f) => {
            const porDre = f.movimentos.filter(m => f.dreGrupo.get(m.categoria_id || '') === 'ignorar')
            const porPar = f.movimentos.filter(m => m.transferencia_par_id)
            const idsDre = new Set(porDre.map(m => m.id))
            const idsPar = new Set(porPar.map(m => m.id))
            const soDre = porDre.filter(m => !idsPar.has(m.id))
            const soPar = porPar.filter(m => !idsDre.has(m.id))
            if (!soDre.length && !soPar.length) return null
            const partes: string[] = []
            if (soDre.length) partes.push(
                `${soDre.length} movimento(s) (${brl(soDre.reduce((s, m) => s + num(m.valor), 0))}) ` +
                `estão em categoria de transferência mas NÃO têm par vinculado`)
            if (soPar.length) partes.push(
                `${soPar.length} movimento(s) têm par vinculado mas a categoria não é de transferência`)
            return {
                detalhe: partes.join(' · ') +
                    ` — quem filtrar por transferencia_par_id soma dinheiro que nunca foi receita. ` +
                    `Exemplos: ` + lista(soDre.map(m => `${m.data} ${brl(num(m.valor))}`)),
            }
        },
    },
    {
        id: 'convencao_compromisso_futuro',
        titulo: 'as definições de "compromisso futuro" coincidem (origem=estimativa × tag orcamento)',
        severidade: 'warn',
        afeta: ['pagar.projetado', 'receber.estimado', 'balanco.patrimonio_operacional', 'convencao.aderencia'],
        checar: (f) => {
            const problemas: string[] = []
            let valorForaDoBalanco = 0
            for (const [nome, arr] of [['CP', f.cp], ['CR', f.cr]] as const) {
                for (const t of arr.filter(aberto)) {
                    const est = t.origem === 'estimativa'
                    const orc = (t.tags || []).includes('orcamento')
                    if (est === orc) continue
                    if (est && !orc) valorForaDoBalanco += num(t.valor)
                    problemas.push(`${nome} ${t.descricao.slice(0, 40)} (${brl(num(t.valor))}) ` +
                        `${est ? 'é estimativa sem tag orcamento' : 'tem tag orcamento sem ser estimativa'}`)
                }
            }
            if (!problemas.length) return null
            return {
                detalhe: `${problemas.length} título(s) marcados de um jeito só. O Balanço filtra por tag ` +
                    `'orcamento'; o resto do ERP por origem = 'estimativa'. ` +
                    `${brl(valorForaDoBalanco)} de compromisso futuro entram no Balanço como se fossem reais. ` +
                    lista(problemas),
            }
        },
    },
    {
        id: 'convencao_sintetico',
        titulo: 'título sintético (pagamento em lote) não convive com os analíticos do mesmo evento',
        severidade: 'warn',
        afeta: ['pagar.compromissado', 'resultado.mes'],
        checar: (f) => {
            // O sintético existe para o regime de caixa; os analíticos para a
            // competência. Se ambos estão VIVOS e em aberto no mesmo evento, o
            // "a pagar" conta a mesma comissão duas vezes.
            const sinteticos = f.cp.filter(t => t.origem === 'sintetico' && aberto(t) && t.evento_key)
            const analiticosPorEvento = new Map<string, number>()
            for (const t of f.cp.filter(t => t.origem === 'real' && aberto(t) && t.evento_key)) {
                analiticosPorEvento.set(t.evento_key!, (analiticosPorEvento.get(t.evento_key!) || 0) + 1)
            }
            const conflitantes = sinteticos.filter(t => analiticosPorEvento.has(t.evento_key!))
            if (!conflitantes.length) return null
            return {
                detalhe: `${conflitantes.length} título(s) sintéticos em aberto com analíticos vivos no mesmo evento: ` +
                    lista(conflitantes.map(t => `${t.evento_key} ${t.descricao.slice(0, 36)} (${brl(num(t.valor))})`)),
            }
        },
    },
    {
        id: 'convencao_cancelado_fora',
        titulo: 'nenhum cancelado sobrou em posição de ser somado',
        severidade: 'fail',
        afeta: ['receber.aberto', 'pagar.aberto'],
        checar: (f) => {
            // Cancelado com valor_pago/valor_recebido registrado é sinal de que
            // alguém cancelou um título que já tinha movimento — o dinheiro
            // aconteceu, mas o título nega.
            const suspeitos = [...f.cp, ...f.cr].filter(t =>
                !vivo(t) && (num(t.valor_pago) > 0 || num(t.valor_recebido) > 0))
            if (!suspeitos.length) return null
            return {
                detalhe: `${suspeitos.length} título(s) cancelados com baixa registrada — ` +
                    `o caixa diz que aconteceu, o título diz que não existe: ` +
                    lista(suspeitos.map(t => `${t.descricao.slice(0, 40)} (${brl(num(t.valor_pago) || num(t.valor_recebido))})`)),
            }
        },
    },
]
