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
import { type Fatos, type FolhaLinha, type Titulo, aberto, compromissoFuturo, devido, maxData, naoSubstituido, num, r2 } from '../fatos'

const brl = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const lista = (xs: string[], n = 5) =>
    xs.slice(0, n).join('; ') + (xs.length > n ? ` … (+${xs.length - n})` : '')
const mesDe = (iso: string | null | undefined): string | null => iso ? iso.slice(0, 7) : null
const ehFolha = (desc: string) => /folha|salario|salário|pro.?labore/i.test(desc)
// O vencimento é apenas a referência legada quando a competência não foi registrada.
const mesCompetencia = (t: Titulo) => mesDe(t.apuracao?.competencia_inicio) ?? mesDe(t.vencimento)
const projecoes = (f: Fatos) => f.cp.filter(t => aberto(t) && naoSubstituido(t) && compromissoFuturo(t) && ehFolha(t.descricao))
const futuras = (f: Fatos) => projecoes(f).filter(t => {
    const mes = mesCompetencia(t)
    return mes !== null && mes >= f.hoje.slice(0, 7)
})
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const daPessoa = (t: Titulo, pessoa: FolhaLinha) => {
    if (t.fornecedor_id && pessoa.fornecedor_id) return t.fornecedor_id === pessoa.fornecedor_id
    const nomes = [pessoa.nome, pessoa.pagamento_nome, ...(pessoa.apelidos || [])]
        .filter((n): n is string => Boolean(n)).map(norm).filter(n => n.length > 2)
    return nomes.some(n => norm(t.descricao).includes(n))
}

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
        titulo: 'Folha projetada para a próxima competência',
        unidade: 'BRL',
        classe: 'estimada',
        formula: 'Σ devido das projeções de folha na primeira competência atual ou futura; vencimento é referência somente no legado sem competência',
        calcular: (f): ResultadoCalculo => {
            const cps = futuras(f)
            const alvo = cps.map(mesCompetencia).filter((m): m is string => m !== null).sort()[0] || null
            const doCiclo = alvo ? cps.filter(t => mesCompetencia(t) === alvo) : []
            const semReferencia = projecoes(f).filter(t => mesCompetencia(t) === null)
            const legado = doCiclo.filter(t => !t.apuracao?.competencia_inicio)
            return {
                valor: r2(doCiclo.reduce((s, t) => s + devido(t, 'valor_pago'), 0)),
                origens: [{ fonte: 'erp_contas_pagar', filtro: `projeção de folha, referência de competência = ${alvo || 'não informada'}`, linhas: doCiclo.length }],
                cobertura: cobertura(doCiclo.length + semReferencia.length, doCiclo.length - legado.length, [
                    ...(semReferencia.length ? [{ motivo: 'projeção de folha sem competência nem vencimento de referência; não alocada em mês', impacto: 'interpretacao' as const, linhas: semReferencia.length, exemplos: semReferencia.map(t => t.descricao) }] : []),
                    ...(legado.length ? [{ motivo: 'competência não informada; agrupamento usa o vencimento legado e pode estar no mês seguinte ao serviço', impacto: 'interpretacao' as const, linhas: legado.length }] : []),
                ]),
                atualizado_em: maxData(doCiclo.map(t => t.updated_at)),
                formula: `Σ devido das projeções de folha da competência ${alvo || 'não informada'}`,
                composicao: doCiclo
                    .slice()
                    .sort((a, b) => devido(b, 'valor_pago') - devido(a, 'valor_pago'))
                    .map(t => ({ rotulo: t.descricao.slice(0, 46), valor: r2(devido(t, 'valor_pago')) })),
            }
        },
    },
    {
        id: 'folha.meses_projetados',
        titulo: 'Última referência de competência da folha projetada',
        unidade: 'data',
        classe: 'primaria',
        formula: 'maior fim/início de competência informado; vencimento como referência do cadastro legado',
        calcular: (f): ResultadoCalculo => {
            const cps = projecoes(f)
            const meses = new Set(cps.map(mesCompetencia).filter((m): m is string => m !== null))
            const sem = cps.filter(t => !t.apuracao?.competencia_inicio)
            return {
                valor: maxData(cps.map(t => t.apuracao?.competencia_fim ?? t.apuracao?.competencia_inicio ?? t.vencimento)),
                origens: [{ fonte: 'erp_contas_pagar', filtro: 'folha em aberto', linhas: cps.length }],
                cobertura: cobertura(cps.length, cps.length - sem.length, sem.length ? [{ motivo: 'projeções sem competência explícita; referência legada não comprova mês do serviço', impacto: 'interpretacao', linhas: sem.length }] : []),
                atualizado_em: maxData(cps.map(t => t.updated_at)),
                composicao: [{ rotulo: 'meses com folha projetada', valor: meses.size }],
            }
        },
    },
]

export const VALIDACOES: DefinicaoValidacao<Fatos>[] = [
    {
        id: 'folha_cadastro_x_projecao',
        titulo: 'a folha projetada bate com o cadastro, pessoa a pessoa',
        severidade: 'fail',
        afeta: ['folha.custo_cadastrado', 'folha.custo_projetado_mes', 'fluxo.projetado', 'pagar.projetado'],
        checar: (f) => {
            // Comparar só os TOTAIS acusava mês legítimo: quem entra no meio do
            // mês recebe pró-rata, e o primeiro título dela é menor que o
            // salário de propósito. Comparando pessoa a pessoa dá para separar
            // "está a menor porque entrou dia 15" de "o salário mudou e ninguém
            // reprojetou" — que é o erro que esta validação existe para pegar.
            const ativos = f.folha.filter(x => x.ativo && num(x.salario_fixo) > 0)
            if (!ativos.length) return null
            const futuros = futuras(f)
            if (!futuros.length) {
                return {
                    detalhe: `folha cadastrada em ${brl(ativos.reduce((s, x) => s + num(x.salario_fixo), 0))}/mes, ` +
                        `mas NENHUM CP de folha em aberto — o caixa nao a enxerga`,
                }
            }
            const meses = [...new Set(futuros.map(mesCompetencia))].filter((m): m is string => m !== null).sort()

            const aMaior: string[] = []
            const proRata: string[] = []
            const semTitulo: string[] = []
            for (const mes of meses) {
                const doMes = futuros.filter(t => mesCompetencia(t) === mes)
                for (const pessoa of ativos) {
                    // Nome COMPLETO, nao o primeiro: a Bula tem Joao Gabriel,
                    // Joao Eduardo e Joao Antonio, e casar por "joao" fazia o
                    // titulo de um virar divergencia do outro.
                    const titulos = doMes.filter(t => daPessoa(t, pessoa))
                    if (!titulos.length) { semTitulo.push(`${mes} ${pessoa.nome}`); continue }
                    const projetado = r2(titulos.reduce((s, t) => s + devido(t, 'valor_pago'), 0))
                    const dif = r2(projetado - num(pessoa.salario_fixo))
                    if (Math.abs(dif) <= 1) continue
                    if (dif < 0) proRata.push(`${mes} ${pessoa.nome}: ${brl(projetado)} de ${brl(num(pessoa.salario_fixo))}`)
                    else aMaior.push(`${mes} ${pessoa.nome}: projetado ${brl(projetado)} > cadastro ${brl(num(pessoa.salario_fixo))}`)
                }
            }
            // Título A MAIOR que o cadastro nunca é pró-rata: ou o salário caiu e
            // ninguém reprojetou, ou o título está errado.
            if (aMaior.length) {
                return {
                    detalhe: `${aMaior.length} titulo(s) de folha acima do cadastro — editar a tela de Folha NAO ` +
                        `reprojeta o caixa, rode scripts/reprojeta-folha.mts: ` + lista(aMaior),
                }
            }
            if (semTitulo.length) {
                return { severidade: 'warn', detalhe: `${semTitulo.length} pessoa(s) sem titulo de folha no mes: ` + lista(semTitulo) }
            }
            if (proRata.length) {
                return {
                    severidade: 'warn',
                    detalhe: `${proRata.length} titulo(s) abaixo do cadastro — compativel com pro-rata de mes de ` +
                        `entrada; confira se e o caso: ` + lista(proRata),
                }
            }
            return null
        },
    },
    {
        id: 'folha_pessoa_sem_titulo',
        titulo: 'toda pessoa ativa na folha tem título de folha no próximo ciclo',
        severidade: 'warn',
        afeta: ['folha.custo_projetado_mes'],
        checar: (f) => {
            const futuros = futuras(f)
            const alvo = futuros.map(mesCompetencia).filter((m): m is string => m !== null).sort()[0]
            if (!alvo) return null
            const doCiclo = futuros.filter(t => mesCompetencia(t) === alvo)
            const faltando = f.folha.filter(x => x.ativo && num(x.salario_fixo) > 0)
                .filter(x => !doCiclo.some(t => daPessoa(t, x)))
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
            const futuros = futuras(f)
            const orfaos = futuros.filter(t => !f.folha.some(x => daPessoa(t, x)))
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
