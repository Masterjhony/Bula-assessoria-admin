/**
 * FOLHA & COMISSÕES.
 *
 * O bug estrutural que este domínio existe para pegar: a tela de Folha edita
 * `erp_folha_estrutura` (o CADASTRO), mas o caixa é movido pelos CP projetados
 * já gravados. Mudar o salário na tela NÃO muda o fluxo — é preciso reprojetar
 * (`scripts/reprojeta-folha.mts`). Quem confia na tela apresenta um custo de
 * folha que o ERP não vai pagar, ou o contrário.
 *
 * A validação `folha_cadastro_x_projecao` compara os dois e denuncia a
 * diferença em reais, mês a mês.
 */

import type { DefinicaoValidacao, DefinicaoVariavel, ResultadoCalculo } from '../tipos'
import { cobertura, cobreTudo } from '../tipos'
import { type Fatos, aberto, devido, maxData, num, r2 } from '../fatos'

const brl = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const lista = (xs: string[], n = 5) =>
    xs.slice(0, n).join('; ') + (xs.length > n ? ` … (+${xs.length - n})` : '')
const mesDe = (iso: string) => String(iso || '').slice(0, 7)
const ehFolha = (desc: string) => /folha|salario|salário|pro.?labore/i.test(desc)

export const VARIAVEIS: DefinicaoVariavel<Fatos>[] = [
    {
        id: 'folha.custo_cadastrado',
        titulo: 'Custo mensal da folha, pelo cadastro',
        unidade: 'BRL',
        classe: 'declarada',
        formula: 'Σ salario_fixo das linhas ativas de erp_folha_estrutura',
        calcular: (f): ResultadoCalculo => {
            const ativos = f.folha.filter(x => x.ativo)
            const semFornecedor = ativos.filter(x => !x.fornecedor_id)
            return {
                valor: r2(ativos.reduce((s, x) => s + num(x.salario_fixo), 0)),
                origens: [{ fonte: 'erp_folha_estrutura', filtro: 'ativo = true', linhas: ativos.length }],
                cobertura: cobreTudo(ativos.length, semFornecedor.length ? [{
                    motivo: 'linha da folha sem fornecedor vinculado — não casa com o título que paga',
                    impacto: 'atribuicao',
                    linhas: semFornecedor.length,
                    exemplos: semFornecedor.slice(0, 4).map(x => x.nome),
                }] : []),
                atualizado_em: null,
                composicao: ativos
                    .slice()
                    .sort((a, b) => num(b.salario_fixo) - num(a.salario_fixo))
                    .map(x => ({ rotulo: x.nome, valor: r2(num(x.salario_fixo)) })),
            }
        },
    },
    {
        id: 'folha.custo_projetado_mes',
        titulo: 'Folha projetada no caixa para o próximo vencimento',
        unidade: 'BRL',
        classe: 'estimada',
        formula: 'Σ devido dos CP de folha em aberto, no menor vencimento a partir de hoje',
        calcular: (f): ResultadoCalculo => {
            const cps = f.cp.filter(t => aberto(t) && ehFolha(t.descricao) && t.vencimento >= f.hoje)
            const alvo = cps.map(t => t.vencimento).sort()[0] || null
            const doCiclo = alvo ? cps.filter(t => t.vencimento === alvo) : []
            return {
                valor: r2(doCiclo.reduce((s, t) => s + devido(t, 'valor_pago'), 0)),
                origens: [{ fonte: 'erp_contas_pagar', filtro: `descrição ~ folha/salário, vencimento = ${alvo || '—'}`, linhas: doCiclo.length }],
                cobertura: cobreTudo(doCiclo.length),
                atualizado_em: maxData(doCiclo.map(t => t.updated_at)),
                formula: `Σ devido dos CP de folha com vencimento em ${alvo || '—'}`,
                composicao: doCiclo
                    .slice()
                    .sort((a, b) => devido(b, 'valor_pago') - devido(a, 'valor_pago'))
                    .map(t => ({ rotulo: t.descricao.slice(0, 46), valor: r2(devido(t, 'valor_pago')) })),
            }
        },
    },
    {
        id: 'folha.meses_projetados',
        titulo: 'Até quando a folha está projetada no caixa',
        unidade: 'data',
        classe: 'primaria',
        formula: 'maior vencimento entre os CP de folha em aberto',
        calcular: (f): ResultadoCalculo => {
            const cps = f.cp.filter(t => aberto(t) && ehFolha(t.descricao))
            const meses = new Set(cps.map(t => mesDe(t.vencimento)))
            return {
                valor: maxData(cps.map(t => t.vencimento)),
                origens: [{ fonte: 'erp_contas_pagar', filtro: 'folha em aberto', linhas: cps.length }],
                cobertura: cobreTudo(cps.length),
                atualizado_em: maxData(cps.map(t => t.updated_at)),
                composicao: [{ rotulo: 'meses com folha projetada', valor: meses.size }],
            }
        },
    },
]

export const VALIDACOES: DefinicaoValidacao<Fatos>[] = [
    {
        id: 'folha_cadastro_x_projecao',
        titulo: 'a folha cadastrada bate com a folha projetada no caixa',
        severidade: 'fail',
        afeta: ['folha.custo_cadastrado', 'folha.custo_projetado_mes', 'fluxo.projetado', 'pagar.projetado'],
        checar: (f) => {
            const cadastrado = r2(f.folha.filter(x => x.ativo).reduce((s, x) => s + num(x.salario_fixo), 0))
            if (cadastrado <= 0) return null
            // Compara mês a mês, do próximo vencimento em diante.
            const futuros = f.cp.filter(t => aberto(t) && ehFolha(t.descricao) && t.vencimento >= f.hoje)
            if (!futuros.length) {
                return { detalhe: `folha cadastrada em ${brl(cadastrado)}/mês, mas NENHUM CP de folha em aberto — o caixa não a enxerga` }
            }
            const porMes = new Map<string, number>()
            for (const t of futuros) {
                const k = mesDe(t.vencimento)
                porMes.set(k, (porMes.get(k) || 0) + devido(t, 'valor_pago'))
            }
            const divergentes: string[] = []
            for (const [mes, total] of [...porMes.entries()].sort()) {
                if (Math.abs(r2(total) - cadastrado) > 1) {
                    divergentes.push(`${mes}: projetado ${brl(total)} × cadastrado ${brl(cadastrado)} (dif ${brl(total - cadastrado)})`)
                }
            }
            return divergentes.length
                ? {
                    detalhe: `${divergentes.length} mês(es) com folha projetada diferente do cadastro. ` +
                        `Editar a tela de Folha NÃO reprojeta o caixa — rode scripts/reprojeta-folha.mts. ` +
                        lista(divergentes),
                }
                : null
        },
    },
    {
        id: 'folha_pessoa_sem_titulo',
        titulo: 'toda pessoa ativa na folha tem título de folha no próximo ciclo',
        severidade: 'warn',
        afeta: ['folha.custo_projetado_mes'],
        checar: (f) => {
            const futuros = f.cp.filter(t => aberto(t) && ehFolha(t.descricao) && t.vencimento >= f.hoje)
            const alvo = futuros.map(t => t.vencimento).sort()[0]
            if (!alvo) return null
            const doCiclo = futuros.filter(t => t.vencimento === alvo)
            const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
            const textoCiclo = doCiclo.map(t => norm(t.descricao)).join(' | ')
            const faltando = f.folha.filter(x => x.ativo).filter(x => {
                const nomes = [x.nome, x.pagamento_nome, ...(x.apelidos || [])].filter(Boolean) as string[]
                return !nomes.some(n => {
                    const primeiro = norm(n).split(/\s+/)[0]
                    return primeiro.length > 2 && textoCiclo.includes(primeiro)
                })
            })
            if (!faltando.length) return null
            return {
                detalhe: `${faltando.length} pessoa(s) ativas na folha sem título no ciclo de ${alvo}: ` +
                    lista(faltando.map(x => `${x.nome} (${brl(num(x.salario_fixo))})`)),
            }
        },
    },
    {
        id: 'folha_titulo_sem_pessoa',
        titulo: 'todo título de folha corresponde a alguém cadastrado',
        severidade: 'warn',
        afeta: ['folha.custo_projetado_mes', 'pagar.projetado'],
        checar: (f) => {
            const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
            const nomes = f.folha.flatMap(x => [x.nome, x.pagamento_nome, ...(x.apelidos || [])])
                .filter(Boolean).map(n => norm(n as string).split(/\s+/)[0]).filter(n => n.length > 2)
            const futuros = f.cp.filter(t => aberto(t) && ehFolha(t.descricao) && t.vencimento >= f.hoje)
            const orfaos = futuros.filter(t => {
                const d = norm(t.descricao)
                return !nomes.some(n => d.includes(n))
            })
            if (!orfaos.length) return null
            return {
                detalhe: `${orfaos.length} título(s) de folha sem pessoa correspondente no cadastro: ` +
                    lista(orfaos.map(t => `${t.vencimento} ${t.descricao.slice(0, 40)} (${brl(devido(t, 'valor_pago'))})`)),
            }
        },
    },
    {
        id: 'comissao_percentual_declarado',
        titulo: 'quem tem comissão por percentual tem o percentual cadastrado',
        severidade: 'warn',
        afeta: ['comissao.proximo_ciclo'],
        checar: (f) => {
            const sem = f.folha.filter(x => x.ativo && !num(x.comissao_pct) && !num(x.comissao_fixa))
            if (!sem.length) return null
            return {
                detalhe: `${sem.length} pessoa(s) ativas sem comissão declarada (nem % nem fixa) — ` +
                    `se receberem comissão, ela não sai de regra nenhuma: ` + lista(sem.map(x => x.nome)),
            }
        },
    },
]
