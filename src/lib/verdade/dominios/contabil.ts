/**
 * CONTÁBIL — Lançamentos, Plano de Contas, Balanço.
 *
 * Aqui moram as invariantes mais duras do ERP: partida dobrada não admite
 * interpretação. Débito = crédito, ou o lançamento está errado. Ponto.
 *
 * O Balanço tem uma peculiaridade que já causou divergência: ele monta uma
 * posição OPERACIONAL (bancos + CR em aberto − CP em aberto) em paralelo à
 * posição contábil vinda das partidas. As duas respondem perguntas diferentes
 * e podem legitimamente divergir — o que não pode é ninguém saber disso.
 */

import type { DefinicaoValidacao, DefinicaoVariavel, ResultadoCalculo } from '../tipos'
import { cobertura, cobreTudo } from '../tipos'
import { type Fatos, aberto, compromissoFuturo, devido, maxData, num, r2 } from '../fatos'

const brl = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const lista = (xs: string[], n = 4) =>
    xs.slice(0, n).join('; ') + (xs.length > n ? ` … (+${xs.length - n})` : '')

/** Lançamentos que valem: só os ativos entram em qualquer soma contábil. */
const ativo = (l: { status: string }) => l.status === 'ativo'

export const VARIAVEIS: DefinicaoVariavel<Fatos>[] = [
    {
        id: 'balanco.patrimonio_operacional',
        titulo: 'Patrimônio operacional (bancos + a receber − a pagar)',
        unidade: 'BRL',
        classe: 'derivada',
        formula: 'caixa.saldo + receber.contratado − pagar.compromissado (compromisso futuro fica fora dos dois lados)',
        deriva_de: ['caixa.saldo', 'receber.contratado', 'pagar.compromissado'],
        heranca: 'ponderada',
        calcular: (f, dep): ResultadoCalculo => {
            const caixa = Number(dep['caixa.saldo']?.valor || 0)
            const receber = Number(dep['receber.contratado']?.valor || 0)
            const pagar = Number(dep['pagar.compromissado']?.valor || 0)
            const futuroCp = f.cp.filter(t => aberto(t) && compromissoFuturo(t))
                .reduce((s, t) => s + devido(t, 'valor_pago'), 0)
            const futuroCr = f.cr.filter(t => aberto(t) && compromissoFuturo(t))
                .reduce((s, t) => s + devido(t, 'valor_recebido'), 0)
            return {
                valor: r2(caixa + receber - pagar),
                origens: [{ fonte: 'variáveis', filtro: 'caixa + a receber contratado − dívida contraída', linhas: 3 }],
                cobertura: cobreTudo(3),
                atualizado_em: dep['caixa.saldo']?.atualizado_em || null,
                composicao: [
                    { rotulo: 'caixa', valor: r2(caixa) },
                    { rotulo: 'a receber contratado', valor: r2(receber) },
                    { rotulo: 'dívida contraída', valor: r2(-pagar) },
                    {
                        rotulo: 'fora: compromisso futuro (líquido)',
                        valor: r2(futuroCr - futuroCp),
                        nota: 'folha e recorrentes lançados adiante não são passivo de hoje',
                    },
                ],
            }
        },
    },
    {
        id: 'contabil.lancamentos_ativos',
        titulo: 'Lançamentos contábeis ativos',
        unidade: 'contagem',
        classe: 'primaria',
        formula: 'nº de registros em erp_lancamentos com status = ativo',
        calcular: (f): ResultadoCalculo => {
            const ativos = f.lancamentos.filter(ativo)
            const semPartida = ativos.filter(l => !f.partidas.some(p => p.lancamento_id === l.id))
            return {
                valor: ativos.length,
                origens: [{ fonte: 'erp_lancamentos', filtro: 'status = ativo', linhas: ativos.length }],
                cobertura: cobertura(ativos.length, ativos.length - semPartida.length,
                    semPartida.length ? [{
                        motivo: 'lançamento ativo sem nenhuma partida — não afeta o Balanço',
                        impacto: 'valor',
                        linhas: semPartida.length,
                        exemplos: semPartida.slice(0, 4).map(l => `${l.data} ${String(l.historico || '').slice(0, 36)}`),
                    }] : []),
                atualizado_em: maxData(ativos.map(l => l.data)),
            }
        },
    },
    {
        id: 'contabil.cobertura_do_caixa',
        titulo: 'Movimentos bancários com lançamento contábil',
        unidade: 'percentual',
        classe: 'derivada',
        formula: 'nº de movimentos referenciados por algum lançamento ativo ÷ total de movimentos',
        calcular: (f): ResultadoCalculo => {
            const comLanc = new Set(f.lancamentos.filter(ativo).map(l => l.movimento_id).filter(Boolean) as string[])
            const total = f.movimentos.length
            const cobertos = f.movimentos.filter(m => comLanc.has(m.id)).length
            return {
                valor: total ? r2((cobertos / total) * 100) : null,
                origens: [
                    { fonte: 'erp_lancamentos', filtro: 'status = ativo com movimento_id', linhas: comLanc.size },
                    { fonte: 'erp_movimentos_bancarios', filtro: 'todos', linhas: total },
                ],
                // Mede uma cobertura: enxerga o universo inteiro.
                cobertura: cobreTudo(total, total > cobertos ? [{
                    motivo: 'movimento bancário sem lançamento contábil — Balanço e DRE contábil não o enxergam',
                    impacto: 'interpretacao',
                    linhas: total - cobertos,
                }] : []),
                atualizado_em: maxData(f.movimentos.map(m => m.data)),
                composicao: [
                    { rotulo: 'com lançamento', valor: cobertos },
                    { rotulo: 'sem lançamento', valor: total - cobertos },
                ],
            }
        },
    },
]

export const VALIDACOES: DefinicaoValidacao<Fatos>[] = [
    {
        id: 'partida_dobrada',
        titulo: 'em todo lançamento ativo, Σ débitos = Σ créditos',
        severidade: 'fail',
        afeta: ['contabil.lancamentos_ativos', 'balanco.patrimonio_operacional'],
        checar: (f) => {
            const porLanc = new Map<string, { d: number; c: number }>()
            for (const p of f.partidas) {
                const a = porLanc.get(p.lancamento_id) || { d: 0, c: 0 }
                if (p.natureza === 'debito') a.d += num(p.valor); else a.c += num(p.valor)
                porLanc.set(p.lancamento_id, a)
            }
            const ruins: string[] = []
            for (const l of f.lancamentos.filter(ativo)) {
                const a = porLanc.get(l.id)
                if (!a) continue
                if (Math.abs(r2(a.d) - r2(a.c)) > 0.005) {
                    ruins.push(`${l.data} ${String(l.historico || '').slice(0, 34)}: D ${brl(a.d)} ≠ C ${brl(a.c)}`)
                }
            }
            return ruins.length ? { detalhe: `${ruins.length} lançamento(s) desbalanceados: ` + lista(ruins) } : null
        },
    },
    {
        id: 'lancamento_valor_total',
        titulo: 'valor_total do lançamento = soma dos débitos',
        severidade: 'warn',
        afeta: ['contabil.lancamentos_ativos'],
        checar: (f) => {
            const porLanc = new Map<string, number>()
            for (const p of f.partidas) {
                if (p.natureza !== 'debito') continue
                porLanc.set(p.lancamento_id, (porLanc.get(p.lancamento_id) || 0) + num(p.valor))
            }
            const ruins: string[] = []
            for (const l of f.lancamentos.filter(ativo)) {
                const d = porLanc.get(l.id)
                if (d === undefined) continue
                if (Math.abs(r2(d) - r2(num(l.valor_total))) > 0.005) {
                    ruins.push(`${l.data} ${String(l.historico || '').slice(0, 30)}: total ${brl(l.valor_total)} ≠ débitos ${brl(d)}`)
                }
            }
            return ruins.length ? { detalhe: `${ruins.length} lançamento(s): ` + lista(ruins) } : null
        },
    },
    {
        id: 'partida_aponta_conta_viva',
        titulo: 'toda partida aponta para conta do plano que existe e está ativa',
        severidade: 'fail',
        afeta: ['contabil.lancamentos_ativos', 'balanco.patrimonio_operacional'],
        checar: (f) => {
            const vivas = new Set(f.plano.filter(c => c.ativo).map(c => c.id))
            const todas = new Set(f.plano.map(c => c.id))
            const lancAtivos = new Set(f.lancamentos.filter(ativo).map(l => l.id))
            const orfas = f.partidas.filter(p => lancAtivos.has(p.lancamento_id) && !todas.has(p.plano_conta_id))
            const inativas = f.partidas.filter(p => lancAtivos.has(p.lancamento_id) && todas.has(p.plano_conta_id) && !vivas.has(p.plano_conta_id))
            if (!orfas.length && !inativas.length) return null
            const partes: string[] = []
            if (orfas.length) partes.push(`${orfas.length} partida(s) apontam para conta inexistente`)
            if (inativas.length) partes.push(`${inativas.length} partida(s) usam conta inativa`)
            return { detalhe: partes.join(' · '), severidade: orfas.length ? 'fail' : 'warn' }
        },
    },
    {
        id: 'partida_em_conta_sintetica',
        titulo: 'partida só lança em conta analítica (sintética é totalizadora)',
        severidade: 'warn',
        afeta: ['contabil.lancamentos_ativos', 'balanco.patrimonio_operacional'],
        checar: (f) => {
            const sinteticas = new Set(f.plano.filter(c => c.natureza !== 'analitica').map(c => c.id))
            const lancAtivos = new Set(f.lancamentos.filter(ativo).map(l => l.id))
            const erradas = f.partidas.filter(p => lancAtivos.has(p.lancamento_id) && sinteticas.has(p.plano_conta_id))
            if (!erradas.length) return null
            const nomes = new Map(f.plano.map(c => [c.id, c.nome]))
            return {
                detalhe: `${erradas.length} partida(s) lançadas em conta sintética — o total sobe duas vezes na árvore: ` +
                    lista([...new Set(erradas.map(p => nomes.get(p.plano_conta_id) || p.plano_conta_id))]),
            }
        },
    },
    {
        id: 'plano_hierarquia',
        titulo: 'plano de contas sem pai órfão e sem ciclo',
        severidade: 'fail',
        afeta: ['balanco.patrimonio_operacional'],
        checar: (f) => {
            const ids = new Set(f.plano.map(c => c.id))
            const orfas = f.plano.filter(c => c.parent_id && !ids.has(c.parent_id))
            const ciclos: string[] = []
            const pai = new Map(f.plano.map(c => [c.id, c.parent_id]))
            for (const c of f.plano) {
                const visto = new Set<string>([c.id])
                let p = pai.get(c.id) || null
                while (p) {
                    if (visto.has(p)) { ciclos.push(c.nome); break }
                    visto.add(p); p = pai.get(p) || null
                }
            }
            if (!orfas.length && !ciclos.length) return null
            const partes: string[] = []
            if (orfas.length) partes.push(`${orfas.length} conta(s) com pai inexistente: ` + lista(orfas.map(c => c.codigo + ' ' + c.nome)))
            if (ciclos.length) partes.push(`${ciclos.length} conta(s) em ciclo: ` + lista(ciclos))
            return { detalhe: partes.join(' · ') }
        },
    },
    {
        id: 'lancamento_titulo_vivo',
        titulo: 'lançamento que referencia título/movimento aponta para registro existente',
        severidade: 'fail',
        afeta: ['contabil.lancamentos_ativos'],
        checar: (f) => {
            const cpIds = new Set(f.cp.map(t => t.id))
            const crIds = new Set(f.cr.map(t => t.id))
            const movIds = new Set(f.movimentos.map(m => m.id))
            const orfaos = f.lancamentos.filter(l => ativo(l) && (
                (l.conta_pagar_id && !cpIds.has(l.conta_pagar_id)) ||
                (l.conta_receber_id && !crIds.has(l.conta_receber_id)) ||
                (l.movimento_id && !movIds.has(l.movimento_id))))
            return orfaos.length
                ? { detalhe: `${orfaos.length} lançamento(s) referenciam registro que não existe mais: ` +
                    lista(orfaos.map(l => `${l.data} ${String(l.historico || '').slice(0, 36)}`)) }
                : null
        },
    },
]
