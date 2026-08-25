/**
 * CARTÕES DE CRÉDITO.
 *
 * A regra que não pode ser esquecida: o módulo de cartão é ANALÍTICO. A despesa
 * do grupo acontece quando a FATURA é paga (sai do banco). Somar os lançamentos
 * do cartão como despesa, além da fatura, conta o mesmo gasto duas vezes.
 *
 * E há um caso específico da Bula: 100% das compras têm portador FELIPE V
 * ANDRADE (o Bulinha). A fatura ABATE a dívida com ele — não é despesa de
 * estrutura. Quem somar fatura de cartão como custo fixo infla a estrutura.
 */

import type { DefinicaoValidacao, DefinicaoVariavel, ResultadoCalculo } from '../tipos'
import { cobertura, cobreTudo } from '../tipos'
import { type Fatos, maxData, num, r2 } from '../fatos'

const brl = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const lista = (xs: string[], n = 4) =>
    xs.slice(0, n).join('; ') + (xs.length > n ? ` … (+${xs.length - n})` : '')
const mesDe = (iso: string) => String(iso || '').slice(0, 7)

export const VARIAVEIS: DefinicaoVariavel<Fatos>[] = [
    {
        id: 'cartao.fatura_aberta',
        titulo: 'Faturas de cartão em aberto',
        unidade: 'BRL',
        classe: 'primaria',
        formula: 'Σ (total_fatura − valor_pago) das faturas com status diferente de paga',
        calcular: (f): ResultadoCalculo => {
            const abertas = f.faturas.filter(x => x.status !== 'paga' && x.status !== 'cancelada')
            const semTitulo = abertas.filter(x => !x.conta_pagar_id)
            return {
                valor: r2(abertas.reduce((s, x) => s + (num(x.total_fatura) - num(x.valor_pago)), 0)),
                origens: [{ fonte: 'erp_cartao_faturas', filtro: 'status ≠ paga', linhas: abertas.length }],
                cobertura: cobreTudo(abertas.length, semTitulo.length ? [{
                    motivo: 'fatura aberta sem CP correspondente — não aparece no "a pagar"',
                    impacto: 'interpretacao',
                    linhas: semTitulo.length,
                    valor: r2(semTitulo.reduce((s, x) => s + num(x.total_fatura), 0)),
                    exemplos: semTitulo.slice(0, 4).map(x => x.competencia),
                }] : []),
                atualizado_em: maxData(abertas.map(x => x.data_vencimento)),
            }
        },
    },
    {
        id: 'cartao.gasto_mes',
        titulo: 'Gasto no cartão no mês corrente (analítico, não é caixa)',
        unidade: 'BRL',
        classe: 'primaria',
        formula: 'Σ valor dos lançamentos de cartão com data_compra no mês — NÃO somar junto com a fatura paga',
        calcular: (f): ResultadoCalculo => {
            const mes = mesDe(f.hoje)
            const doMes = f.cartaoLancamentos.filter(l => mesDe(l.data_compra) === mes && l.tipo !== 'pagamento')
            const semCategoria = doMes.filter(l => !l.categoria_id)
            const porPortador = new Map<string, number>()
            for (const l of doMes) {
                const k = (l.portador || '(sem portador)').trim()
                porPortador.set(k, (porPortador.get(k) || 0) + num(l.valor))
            }
            return {
                valor: r2(doMes.reduce((s, l) => s + num(l.valor), 0)),
                origens: [{ fonte: 'erp_cartao_lancamentos', filtro: `data_compra em ${mes}`, linhas: doMes.length }],
                cobertura: cobertura(doMes.length, doMes.length - semCategoria.length,
                    semCategoria.length ? [{
                        motivo: 'lançamento de cartão sem categoria — não classifica no DRE analítico',
                        impacto: 'atribuicao',
                        linhas: semCategoria.length,
                    }] : []),
                atualizado_em: maxData(doMes.map(l => l.data_compra)),
                composicao: [...porPortador.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([rotulo, valor]) => ({ rotulo: 'portador ' + rotulo, valor: r2(valor) })),
            }
        },
    },
    {
        id: 'cartao.divida_consolidada',
        titulo: 'Dívida consolidada nos cartões',
        unidade: 'BRL',
        classe: 'declarada',
        formula: 'Σ divida_consolidada dos cartões ativos (campo declarado no cadastro do cartão)',
        calcular: (f): ResultadoCalculo => {
            const ativos = f.cartoes.filter(c => c.ativo)
            const semValor = ativos.filter(c => c.divida_consolidada === null || c.divida_consolidada === undefined)
            return {
                valor: r2(ativos.reduce((s, c) => s + num(c.divida_consolidada), 0)),
                origens: [{ fonte: 'erp_cartoes', filtro: 'ativo = true', linhas: ativos.length }],
                cobertura: cobertura(ativos.length, ativos.length - semValor.length,
                    semValor.length ? [{
                        motivo: 'cartão ativo sem dívida consolidada declarada',
                        impacto: 'valor',
                        linhas: semValor.length,
                        exemplos: semValor.map(c => c.apelido),
                    }] : []),
                atualizado_em: null,
            }
        },
    },
]

export const VALIDACOES: DefinicaoValidacao<Fatos>[] = [
    {
        id: 'fatura_bate_com_lancamentos',
        titulo: 'os campos da fatura batem com os lançamentos que ela agrupa',
        severidade: 'fail',
        afeta: ['cartao.fatura_aberta', 'cartao.gasto_mes'],
        checar: (f) => {
            // Semântica real dos campos, conferida contra os dados:
            //   debitos       = Σ lançamentos tipo 'compra'
            //   encargos      = Σ 'anuidade' + 'seguro' + 'encargo'
            //   pagamentos    = −Σ 'pagamento' (gravado negativo)
            //   total_fatura  = debitos + encargos + Σ 'estorno'
            // Somar tudo num balaio só, como antes, acusava divergência em
            // fatura correta — e escondia a divergência verdadeira.
            const ENCARGO = new Set(['anuidade', 'seguro', 'encargo'])
            const ruins: string[] = []
            for (const fat of f.faturas) {
                const lanc = f.cartaoLancamentos.filter(l => l.fatura_id === fat.id)
                if (!lanc.length) continue
                const soma = (pred: (t: string) => boolean) =>
                    r2(lanc.filter(l => pred(l.tipo || '')).reduce((s, l) => s + num(l.valor), 0))
                const compras = soma(t => t === 'compra')
                const encargos = soma(t => ENCARGO.has(t))
                const estornos = soma(t => t === 'estorno')
                const pagamentos = soma(t => t === 'pagamento')

                const problemas: string[] = []
                if (Math.abs(compras - r2(num(fat.debitos))) > 0.05)
                    problemas.push(`débitos ${brl(fat.debitos)} ≠ compras ${brl(compras)}`)
                if (Math.abs(encargos - r2(num(fat.encargos))) > 0.05)
                    problemas.push(`encargos ${brl(fat.encargos)} ≠ anuidade+seguro+encargo ${brl(encargos)}`)
                if (Math.abs(-pagamentos - r2(num(fat.pagamentos))) > 0.05)
                    problemas.push(`pagamentos ${brl(fat.pagamentos)} ≠ ${brl(-pagamentos)}`)
                const totalCalc = r2(compras + encargos + estornos)
                if (Math.abs(totalCalc - r2(num(fat.total_fatura))) > 0.05)
                    problemas.push(`total ${brl(fat.total_fatura)} ≠ débitos+encargos+estornos ${brl(totalCalc)}`)

                if (problemas.length) ruins.push(`${fat.competencia}: ` + problemas.join(' / '))
            }
            return ruins.length ? { detalhe: `${ruins.length} fatura(s): ` + lista(ruins, 6) } : null
        },
    },
    {
        id: 'fatura_paga_tem_saida',
        titulo: 'fatura marcada como paga tem movimento bancário ou CP baixado',
        severidade: 'warn',
        afeta: ['cartao.fatura_aberta', 'caixa.saldo'],
        checar: (f) => {
            const movIds = new Set(f.movimentos.map(m => m.id))
            const cpPagos = new Set(f.cp.filter(t => t.status === 'pago').map(t => t.id))
            const pagas = f.faturas.filter(x => x.status === 'paga')
            const sem = pagas.filter(x =>
                !(x.movimento_id && movIds.has(x.movimento_id)) &&
                !(x.conta_pagar_id && cpPagos.has(x.conta_pagar_id)))
            if (!sem.length) return null
            return {
                detalhe: `${sem.length} fatura(s) paga(s) sem saída correspondente (${brl(sem.reduce((s, x) => s + num(x.valor_pago), 0))}): ` +
                    lista(sem.map(x => `${x.competencia} ${brl(num(x.total_fatura))}`)),
            }
        },
    },
    {
        id: 'cartao_nao_duplica_caixa',
        titulo: 'gasto do cartão não é contado também como saída do banco',
        severidade: 'fail',
        afeta: ['despesa.mes', 'resultado.mes'],
        checar: (f) => {
            // Um lançamento de cartão nunca deve ter virado movimento bancário
            // próprio: quem sai do banco é a fatura. Se a mesma descrição e
            // valor aparecem nos dois, a despesa foi contada em dobro.
            const chave = (d: string, v: number) =>
                String(d || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
                    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 28) + '|' + Math.round(v * 100)
            const noBanco = new Map<string, string>()
            for (const m of f.movimentos) {
                if (m.tipo !== 'saida') continue
                noBanco.set(chave(m.descricao || '', num(m.valor)), m.data)
            }
            const dobrados: string[] = []
            for (const l of f.cartaoLancamentos) {
                if (l.tipo === 'pagamento') continue // pagamento de fatura SAI do banco, é o esperado
                const k = chave(l.descricao, num(l.valor))
                const data = noBanco.get(k)
                if (!data) continue
                // Mesma compra em até 5 dias: fatura e extrato batendo por acaso
                // no mesmo valor E descrição é improvável.
                const dif = Math.abs(new Date(data + 'T00:00:00').getTime() - new Date(l.data_compra + 'T00:00:00').getTime()) / 86400000
                if (dif <= 5) dobrados.push(`${l.data_compra} ${l.descricao.slice(0, 34)} ${brl(num(l.valor))}`)
            }
            return dobrados.length
                ? { detalhe: `${dobrados.length} gasto(s) aparecem no cartão E como saída do banco: ` + lista(dobrados) }
                : null
        },
    },
    {
        id: 'fatura_competencia_unica_por_cartao',
        titulo: 'um cartão tem no máximo uma fatura por competência',
        severidade: 'fail',
        afeta: ['cartao.fatura_aberta'],
        checar: (f) => {
            const vistos = new Map<string, number>()
            for (const x of f.faturas) {
                const k = `${x.cartao_id}|${x.competencia}`
                vistos.set(k, (vistos.get(k) || 0) + 1)
            }
            const dupes = [...vistos.entries()].filter(([, n]) => n > 1)
            if (!dupes.length) return null
            const apelido = new Map(f.cartoes.map(c => [c.id, c.apelido]))
            return {
                detalhe: `${dupes.length} competência(s) com fatura duplicada: ` +
                    lista(dupes.map(([k, n]) => {
                        const [cid, comp] = k.split('|')
                        return `${apelido.get(cid) || cid} ${comp} (${n}x)`
                    })),
            }
        },
    },
    {
        id: 'lancamento_cartao_sem_fatura',
        titulo: 'todo lançamento de cartão pertence a uma fatura existente',
        severidade: 'warn',
        afeta: ['cartao.gasto_mes'],
        checar: (f) => {
            const ids = new Set(f.faturas.map(x => x.id))
            const soltos = f.cartaoLancamentos.filter(l => !l.fatura_id || !ids.has(l.fatura_id))
            if (!soltos.length) return null
            return {
                detalhe: `${soltos.length} lançamento(s) de cartão sem fatura (${brl(soltos.reduce((s, l) => s + num(l.valor), 0))}) — ` +
                    `ficam fora de qualquer competência: ` + lista(soltos.map(l => `${l.data_compra} ${l.descricao.slice(0, 30)}`)),
            }
        },
    },
]
