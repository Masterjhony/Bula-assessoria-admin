/**
 * VALIDAÇÕES CRUZADAS — as invariantes que amarram o sistema.
 *
 * A diferença para um auditor comum: cada validação declara QUAIS VARIÁVEIS
 * ela contamina. Quando falha, não vira só uma linha vermelha num relatório que
 * ninguém lê — ela derruba a confiança do número afetado e o tira do ar até
 * alguém decidir. É o que impede um valor incoerente de chegar na reunião.
 *
 * Toda regra aqui é de leitura pura sobre a foto (`Fatos`).
 */

import type { DefinicaoValidacao } from './tipos'
import {
    type Fatos, type Titulo, aberto, devido, maxData, num, operacional, r2, vivo,
} from './fatos'
import { VALIDACOES as VAL_CONVENCOES } from './dominios/convencoes'
import { VALIDACOES as VAL_CONTABIL } from './dominios/contabil'
import { VALIDACOES as VAL_CARTOES } from './dominios/cartoes'
import { VALIDACOES as VAL_FOLHA } from './dominios/folha'
import { VALIDACOES as VAL_LEILOES } from './dominios/leiloes'
import { VALIDACOES as VAL_CADASTROS } from './dominios/cadastros'

const brl = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const lista = (xs: string[], n = 4) =>
    xs.slice(0, n).join('; ') + (xs.length > n ? ` … (+${xs.length - n})` : '')

const NUCLEO: DefinicaoValidacao<Fatos>[] = [
    // ── Caixa ───────────────────────────────────────────────────────────────
    {
        id: 'saldo_derivado',
        titulo: 'saldo_atual = saldo_inicial + Σ movimentos',
        severidade: 'fail',
        afeta: ['caixa.saldo', 'resultado.mes', 'fluxo.projetado'],
        checar: (f) => {
            const ruins: string[] = []
            for (const c of f.contas) {
                const net = f.movimentos
                    .filter(m => m.conta_bancaria_id === c.id)
                    .reduce((s, m) => s + (m.tipo === 'entrada' ? 1 : m.tipo === 'saida' ? -1 : 0) * num(m.valor), 0)
                const calc = r2(num(c.saldo_inicial) + net)
                if (Math.abs(calc - r2(num(c.saldo_atual))) > 0.005) {
                    ruins.push(`${c.nome}: gravado ${brl(c.saldo_atual)} ≠ recalculado ${brl(calc)}`)
                }
            }
            return ruins.length ? { detalhe: lista(ruins) } : null
        },
    },
    {
        id: 'movimento_pendente',
        titulo: 'todo movimento do extrato está classificado e conciliado',
        severidade: 'warn',
        afeta: ['caixa.saldo', 'receita.mes', 'despesa.mes', 'resultado.mes'],
        checar: (f) => {
            const pend = f.movimentos.filter(m => m.status_conciliacao !== 'conciliado')
            if (!pend.length) return null
            const valor = pend.reduce((s, m) => s + num(m.valor), 0)
            return {
                detalhe: `${pend.length} movimento(s) não conciliado(s) (${brl(valor)}): ` +
                    lista(pend.map(m => `${m.data} ${brl(num(m.valor))} ${String(m.descricao || '').slice(0, 40)}`)),
                severidade: pend.length > 5 ? 'fail' : 'warn',
            }
        },
    },
    {
        id: 'movimento_sem_categoria',
        titulo: 'todo movimento tem categoria (senão some do DRE)',
        severidade: 'fail',
        afeta: ['receita.mes', 'despesa.mes', 'resultado.mes', 'margem.mes'],
        checar: (f) => {
            const sem = f.movimentos.filter(m => !m.categoria_id && operacional(m, f))
            if (!sem.length) return null
            const valor = sem.reduce((s, m) => s + num(m.valor), 0)
            return { detalhe: `${sem.length} movimento(s) sem categoria (${brl(valor)}) — invisíveis no DRE: ` +
                lista(sem.map(m => `${m.data} ${brl(num(m.valor))}`)) }
        },
    },
    {
        id: 'categoria_sem_dre',
        titulo: 'toda categoria tem dre_grupo',
        severidade: 'fail',
        afeta: ['receita.mes', 'despesa.mes', 'resultado.mes', 'margem.mes'],
        checar: (f) => {
            const sem = f.categorias.filter(c => c.ativo && !c.dre_grupo)
            return sem.length
                ? { detalhe: `${sem.length} categoria(s) ativas sem dre_grupo: ` + lista(sem.map(c => c.nome)) }
                : null
        },
    },

    // ── Caixa × títulos ─────────────────────────────────────────────────────
    {
        id: 'movimento_operacional_sem_titulo',
        titulo: 'toda entrada/saída operacional tem título por trás',
        severidade: 'warn',
        afeta: ['receber.aberto', 'pagar.aberto', 'resultado.mes'],
        checar: (f) => {
            const ignorar = new Set(['financeiro', 'ignorar', 'distribuicao'])
            const sem = f.movimentos.filter(m =>
                operacional(m, f) && m.conciliado &&
                !m.conta_pagar_id && !m.conta_receber_id &&
                !ignorar.has(f.dreGrupo.get(m.categoria_id || '') || 'ignorar'))
            if (!sem.length) return null
            const valor = sem.reduce((s, m) => s + num(m.valor), 0)
            return {
                detalhe: `${sem.length} movimento(s) sem título (${brl(valor)}) — o caixa mostra, o "a pagar/receber" não: ` +
                    lista(sem.map(m => `${m.data} ${brl(num(m.valor))} ${String(m.descricao || '').slice(0, 36)}`)),
                severidade: sem.length > 6 ? 'fail' : 'warn',
            }
        },
    },
    {
        id: 'titulo_vinculado_vivo',
        titulo: 'movimento vinculado aponta para título que existe e não foi cancelado',
        severidade: 'fail',
        afeta: ['receber.aberto', 'pagar.aberto', 'resultado.mes'],
        checar: (f) => {
            const cpVivo = new Set(f.cp.filter(vivo).map(t => t.id))
            const crVivo = new Set(f.cr.filter(vivo).map(t => t.id))
            const orfaos = f.movimentos.filter(m =>
                (m.conta_pagar_id && !cpVivo.has(m.conta_pagar_id)) ||
                (m.conta_receber_id && !crVivo.has(m.conta_receber_id)))
            return orfaos.length
                ? { detalhe: `${orfaos.length} movimento(s) apontam para título inexistente ou cancelado: ` +
                    lista(orfaos.map(m => `${m.data} ${brl(num(m.valor))}`)) }
                : null
        },
    },

    // ── Dupla contagem ──────────────────────────────────────────────────────
    {
        id: 'previsao_e_real_no_mesmo_evento',
        titulo: 'o mesmo compromisso não conta duas vezes (estimativa viva + real do mesmo evento)',
        severidade: 'fail',
        afeta: ['receber.aberto', 'pagar.aberto', 'fluxo.projetado'],
        checar: (f) => {
            const problemas: string[] = []
            for (const [nome, arr] of [['CR', f.cr], ['CP', f.cp]] as const) {
                const reaisPorEvento = new Set(
                    arr.filter(t => t.origem === 'real' && vivo(t) && t.evento_key).map(t => t.evento_key as string))
                const dupes = arr.filter(t =>
                    t.origem === 'estimativa' && vivo(t) && !t.substituido_por &&
                    t.evento_key && reaisPorEvento.has(t.evento_key))
                for (const d of dupes) problemas.push(`${nome} ${d.evento_key}: ${d.descricao.slice(0, 44)} (${brl(num(d.valor))})`)
            }
            return problemas.length
                ? { detalhe: `${problemas.length} estimativa(s) vivas com real do mesmo evento — dinheiro contado em dobro: ` + lista(problemas) }
                : null
        },
    },

    // ── Fechamentos: o VGV é a base de tudo ────────────────────────────────
    {
        id: 'vgv_bate_com_lances',
        titulo: 'vgv_total = Σ lances.vgv',
        severidade: 'fail',
        afeta: ['vgv.mes', 'cobertura.mes', 'receita.esperada'],
        checar: (f) => {
            const ruins: string[] = []
            for (const fe of f.fechamentos) {
                const lances = fe.lances || []
                if (!lances.length) continue
                if (String(fe.observacoes || '').includes('[detalhe-parcial')) continue
                const soma = r2(lances.reduce((s, l) => s + num(l.vgv), 0))
                const tol = Math.max(0.5, r2(num(fe.vgv_total)) * 0.001)
                if (Math.abs(soma - r2(num(fe.vgv_total))) > tol) {
                    ruins.push(`${fe.nome}: vgv ${brl(fe.vgv_total)} ≠ Σ lances ${brl(soma)}`)
                }
            }
            return ruins.length ? { detalhe: lista(ruins) } : null
        },
    },
    {
        id: 'faturamento_total_ausente',
        titulo: 'fechamento com acordo por faturamento informa faturamento_total_leilao',
        severidade: 'warn',
        afeta: ['receita.esperada', 'acordo.faturamento_informado'],
        checar: (f) => {
            const precisam = f.fechamentos.filter(fe => num(fe.acordo_pct_faturamento) > 0)
            const sem = precisam.filter(fe => !num(fe.faturamento_total_leilao))
            if (!sem.length) return null
            return {
                detalhe: `${sem.length} de ${precisam.length} fechamento(s) com acordo por faturamento estão sem ` +
                    `faturamento_total_leilao — a comissão esperada desses não pode ser calculada: ` +
                    lista(sem.map(fe => fe.nome)),
                severidade: sem.length / Math.max(1, precisam.length) > 0.5 ? 'fail' : 'warn',
            }
        },
    },
    {
        id: 'comissao_assessoria_bate',
        titulo: 'comissao_assessoria = Σ comissões por assessor',
        severidade: 'fail',
        afeta: ['comissao.proximo_ciclo', 'resultado.mes'],
        checar: (f) => {
            const ruins: string[] = []
            for (const fe of f.fechamentos) {
                const pa = fe.por_assessor || []
                if (!pa.length) continue
                const soma = r2(pa.reduce((s, a) => s + num(a.comissao), 0))
                const decl = r2(num(fe.comissao_assessoria))
                if (decl > 0 && Math.abs(soma - decl) > Math.max(0.5, decl * 0.001)) {
                    ruins.push(`${fe.nome}: declarada ${brl(decl)} ≠ Σ assessores ${brl(soma)}`)
                }
            }
            return ruins.length ? { detalhe: lista(ruins) } : null
        },
    },

    // ── Títulos: o que sustenta a promessa ──────────────────────────────────
    {
        id: 'cr_de_fechamento_existe',
        titulo: 'CR que aponta para fechamento aponta para um que existe',
        severidade: 'fail',
        afeta: ['receber.aberto', 'receita.esperada'],
        checar: (f) => {
            const ids = new Set(f.fechamentos.map(fe => fe.id))
            const orfaos = f.cr.filter(t => t.fechamento_id && !ids.has(t.fechamento_id) && vivo(t))
            return orfaos.length
                ? { detalhe: `${orfaos.length} CR apontam para fechamento inexistente: ` +
                    lista(orfaos.map(t => t.descricao.slice(0, 44))) }
                : null
        },
    },
    {
        id: 'titulo_sem_beneficiario',
        titulo: 'todo título aberto tem contraparte identificada',
        severidade: 'warn',
        afeta: ['pagar.aberto', 'receber.aberto', 'comissao.proximo_ciclo'],
        checar: (f) => {
            const semDono = [
                ...f.cp.filter(t => aberto(t) && !t.fornecedor_id).map(t => `CP ${t.descricao.slice(0, 40)}`),
                ...f.cr.filter(t => aberto(t) && !t.cliente_id).map(t => `CR ${t.descricao.slice(0, 40)}`),
            ]
            // "A DEFINIR" no texto é pior que campo vazio: parece preenchido.
            const aDefinir = [...f.cp, ...f.cr]
                .filter(t => aberto(t) && /a\s*definir/i.test(t.descricao))
                .map(t => t.descricao.slice(0, 44))
            const todos = [...semDono, ...aDefinir]
            if (!todos.length) return null
            return { detalhe: `${todos.length} título(s) aberto(s) sem dono claro: ` + lista(todos) }
        },
    },
    {
        id: 'vencimento_automatico_sem_acordo',
        titulo: 'CR vencido apresenta data acordada, não leilão+45d automático',
        severidade: 'warn',
        afeta: ['receber.vencido', 'fluxo.projetado'],
        checar: (f) => {
            // Só é dívida cobrável quando a data foi combinada com a leiloeira.
            // O vencimento default (leilão+45d) não representa promessa nenhuma.
            const vencidos = f.cr.filter(t => aberto(t) && t.vencimento < f.hoje)
            const comAcordo = vencidos.filter(t =>
                (t.tags || []).includes('data-acordada') || /acordo|acordad/i.test(String(t.observacoes || '')))
            const sem = vencidos.length - comAcordo.length
            if (!sem) return null
            const valor = vencidos
                .filter(t => !((t.tags || []).includes('data-acordada') || /acordo|acordad/i.test(String(t.observacoes || ''))))
                .reduce((s, t) => s + devido(t, 'valor_recebido'), 0)
            return {
                detalhe: `${sem} de ${vencidos.length} CR "vencidos" (${brl(valor)}) têm vencimento automático ` +
                    `(leilão+45d), não data combinada — a estatística de atraso que sai daqui é circular`,
            }
        },
    },
    {
        id: 'titulo_pago_sem_movimento',
        titulo: 'título baixado tem movimento bancário correspondente',
        severidade: 'warn',
        afeta: ['resultado.mes', 'caixa.saldo'],
        checar: (f) => {
            const comMov = new Set<string>()
            for (const m of f.movimentos) {
                if (m.conta_pagar_id) comMov.add(m.conta_pagar_id)
                if (m.conta_receber_id) comMov.add(m.conta_receber_id)
            }
            const baixados: Titulo[] = [
                ...f.cp.filter(t => t.status === 'pago'),
                ...f.cr.filter(t => t.status === 'recebido'),
            ]
            const sem = baixados.filter(t => !comMov.has(t.id))
            if (!sem.length) return null
            const valor = sem.reduce((s, t) => s + num(t.valor), 0)
            return {
                detalhe: `${sem.length} título(s) baixados sem movimento próprio (${brl(valor)}) — ` +
                    `normal em pagamento agregado (1 PIX : N títulos), suspeito em baixa manual`,
            }
        },
    },
]

/** Todas as invariantes do ERP, de todos os domínios. */
export const VALIDACOES: DefinicaoValidacao<Fatos>[] = [
    ...NUCLEO,
    ...VAL_CONVENCOES,
    ...VAL_CONTABIL,
    ...VAL_CARTOES,
    ...VAL_FOLHA,
    ...VAL_LEILOES,
    ...VAL_CADASTROS,
]

/** Frescor da foto: qual o fato mais novo que existe no ERP. */
export function fatoMaisNovo(f: Fatos): string | null {
    return maxData([
        ...f.movimentos.map(m => m.data),
        ...f.cp.map(t => t.updated_at),
        ...f.cr.map(t => t.updated_at),
    ])
}
