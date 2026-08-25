/**
 * CADASTROS — Pessoas (clientes/fornecedores), Categorias, Centros de Custo,
 * Contas Bancárias.
 *
 * Cadastro sujo não erra conta: erra atribuição. Duas pessoas para o mesmo CNPJ
 * fazem a comissão de um assessor aparecer partida em dois nomes; categoria
 * duplicada racha uma linha do DRE em duas. O prejuízo não aparece no total —
 * aparece quando alguém tenta explicar o total.
 */

import type { DefinicaoValidacao, DefinicaoVariavel, ResultadoCalculo } from '../tipos'
import { cobertura, cobreTudo } from '../tipos'
import { type Fatos, aberto, num, r2, vivo } from '../fatos'

const lista = (xs: string[], n = 5) =>
    xs.slice(0, n).join('; ') + (xs.length > n ? ` … (+${xs.length - n})` : '')
const soDigitos = (s: string | null) => String(s || '').replace(/\D/g, '')

export const VARIAVEIS: DefinicaoVariavel<Fatos>[] = [
    {
        id: 'cadastro.pessoas_com_documento',
        titulo: 'Pessoas com CPF/CNPJ cadastrado',
        unidade: 'percentual',
        classe: 'primaria',
        formula: 'nº de pessoas ativas com documento preenchido ÷ total de pessoas ativas',
        calcular: (f): ResultadoCalculo => {
            const ativas = f.pessoas.filter(p => p.ativo !== false)
            const com = ativas.filter(p => soDigitos(p.documento).length >= 11)
            const sem = ativas.length - com.length
            return {
                valor: ativas.length ? r2((com.length / ativas.length) * 100) : null,
                origens: [{ fonte: 'erp_pessoas', filtro: 'ativo ≠ false', linhas: ativas.length }],
                cobertura: cobreTudo(ativas.length, sem ? [{
                    motivo: 'pessoa sem documento — impede casar com HastaPro, nota fiscal e extrato',
                    impacto: 'atribuicao',
                    linhas: sem,
                }] : []),
                atualizado_em: null,
                composicao: [
                    { rotulo: 'com documento', valor: com.length },
                    { rotulo: 'sem documento', valor: sem },
                ],
            }
        },
    },
    {
        id: 'cadastro.categorias_em_uso',
        titulo: 'Categorias efetivamente usadas',
        unidade: 'percentual',
        classe: 'derivada',
        formula: 'nº de categorias ativas referenciadas por movimento ou título ÷ total de categorias ativas',
        calcular: (f): ResultadoCalculo => {
            const usadas = new Set<string>()
            for (const m of f.movimentos) if (m.categoria_id) usadas.add(m.categoria_id)
            for (const t of [...f.cp, ...f.cr]) if (t.categoria_id) usadas.add(t.categoria_id)
            const ativas = f.categorias.filter(c => c.ativo)
            const ociosas = ativas.filter(c => !usadas.has(c.id))
            return {
                valor: ativas.length ? r2(((ativas.length - ociosas.length) / ativas.length) * 100) : null,
                origens: [{ fonte: 'erp_categorias', filtro: 'ativo = true', linhas: ativas.length }],
                cobertura: cobreTudo(ativas.length, ociosas.length ? [{
                    motivo: 'categoria ativa sem nenhum uso — engorda o seletor e convida a classificação errada',
                    impacto: 'atribuicao',
                    linhas: ociosas.length,
                    exemplos: ociosas.slice(0, 5).map(c => c.nome),
                }] : []),
                atualizado_em: null,
            }
        },
    },
    {
        id: 'cadastro.centros_em_uso',
        titulo: 'Centros de custo efetivamente usados',
        unidade: 'percentual',
        classe: 'derivada',
        formula: 'nº de centros ativos referenciados por partida contábil ÷ total de centros ativos',
        calcular: (f): ResultadoCalculo => {
            const usados = new Set(f.partidas.map(p => p.centro_custo_id).filter(Boolean) as string[])
            const ativos = f.centros.filter(c => c.ativo)
            const ociosos = ativos.filter(c => !usados.has(c.id))
            return {
                valor: ativos.length ? r2(((ativos.length - ociosos.length) / ativos.length) * 100) : null,
                origens: [{ fonte: 'erp_centros_custo', filtro: 'ativo = true', linhas: ativos.length }],
                cobertura: cobreTudo(ativos.length, ociosos.length ? [{
                    motivo: 'centro de custo ativo sem uso',
                    impacto: 'atribuicao',
                    linhas: ociosos.length,
                    exemplos: ociosos.slice(0, 5).map(c => c.nome),
                }] : []),
                atualizado_em: null,
            }
        },
    },
]

export const VALIDACOES: DefinicaoValidacao<Fatos>[] = [
    {
        id: 'pessoa_documento_duplicado',
        titulo: 'um CPF/CNPJ pertence a uma pessoa só',
        severidade: 'fail',
        afeta: ['comissao.devida_por_assessor', 'pagar.compromissado', 'receber.contratado', 'cadastro.pessoas_com_documento'],
        checar: (f) => {
            const porDoc = new Map<string, string[]>()
            for (const p of f.pessoas) {
                const d = soDigitos(p.documento)
                if (d.length < 11) continue
                porDoc.set(d, [...(porDoc.get(d) || []), p.nome])
            }
            const dupes = [...porDoc.entries()].filter(([, ns]) => ns.length > 1)
            return dupes.length
                ? {
                    detalhe: `${dupes.length} documento(s) em mais de um cadastro — o mesmo fornecedor aparece ` +
                        `partido em dois nomes: ` + lista(dupes.map(([d, ns]) => `${d}: ${ns.join(' / ')}`)),
                }
                : null
        },
    },
    {
        id: 'pessoa_nome_duplicado',
        titulo: 'não há dois cadastros com o mesmo nome',
        severidade: 'warn',
        afeta: ['cadastro.pessoas_com_documento', 'comissao.devida_por_assessor'],
        checar: (f) => {
            const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
                .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
            const porNome = new Map<string, number>()
            for (const p of f.pessoas) {
                const k = norm(p.nome)
                if (!k) continue
                porNome.set(k, (porNome.get(k) || 0) + 1)
            }
            const dupes = [...porNome.entries()].filter(([, n]) => n > 1)
            return dupes.length
                ? { detalhe: `${dupes.length} nome(s) repetidos no cadastro: ` + lista(dupes.map(([k, n]) => `${k} (${n}x)`)) }
                : null
        },
    },
    {
        id: 'titulo_aponta_pessoa_viva',
        titulo: 'todo título aberto aponta para pessoa que existe',
        severidade: 'fail',
        afeta: ['pagar.compromissado', 'receber.contratado'],
        checar: (f) => {
            const ids = new Set(f.pessoas.map(p => p.id))
            const orfaos = [
                ...f.cp.filter(t => aberto(t) && t.fornecedor_id && !ids.has(t.fornecedor_id))
                    .map(t => `CP ${t.descricao.slice(0, 40)}`),
                ...f.cr.filter(t => aberto(t) && t.cliente_id && !ids.has(t.cliente_id))
                    .map(t => `CR ${t.descricao.slice(0, 40)}`),
            ]
            return orfaos.length
                ? { detalhe: `${orfaos.length} título(s) apontam para pessoa inexistente: ` + lista(orfaos) }
                : null
        },
    },
    {
        id: 'categoria_nome_duplicado',
        titulo: 'não há duas categorias ativas com o mesmo nome',
        severidade: 'fail',
        afeta: ['receita.mes', 'despesa.mes', 'cadastro.categorias_em_uso'],
        checar: (f) => {
            const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
                .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
            const porNome = new Map<string, number>()
            for (const c of f.categorias.filter(c => c.ativo)) {
                const k = norm(c.nome)
                porNome.set(k, (porNome.get(k) || 0) + 1)
            }
            const dupes = [...porNome.entries()].filter(([, n]) => n > 1)
            return dupes.length
                ? {
                    detalhe: `${dupes.length} categoria(s) com nome repetido — o DRE agrega por nome e ` +
                        `racha a linha em duas: ` + lista(dupes.map(([k, n]) => `${k} (${n}x)`)),
                }
                : null
        },
    },
    {
        id: 'categoria_dre_coerente_com_tipo',
        titulo: 'categoria de receita não está marcada como despesa no DRE (e vice-versa)',
        severidade: 'fail',
        afeta: ['receita.mes', 'despesa.mes', 'resultado.mes'],
        checar: (f) => {
            const gruposSaida = new Set(['imposto', 'custo_direto', 'despesa_variavel', 'despesa_fixa'])
            // Recuperação/estorno é entrada que ABATE a própria linha de saída
            // — 'Recuperacao de Imposto sobre NF' com tipo=receita e
            // dre_grupo=imposto está certo, e acusá-lo era falso positivo.
            const abatimento = (nome: string) => /recupera|estorno|devolu|reembols|abatimento/i.test(nome)
            const ruins = f.categorias.filter(c => {
                if (!c.ativo || !c.dre_grupo) return false
                if (abatimento(c.nome)) return false
                if (c.tipo === 'receita' && gruposSaida.has(c.dre_grupo)) return true
                if (c.tipo === 'despesa' && c.dre_grupo === 'receita') return true
                return false
            })
            return ruins.length
                ? {
                    detalhe: `${ruins.length} categoria(s) com tipo e dre_grupo se contradizendo: ` +
                        lista(ruins.map(c => `${c.nome} (tipo=${c.tipo}, dre=${c.dre_grupo})`)),
                }
                : null
        },
    },
    {
        id: 'conta_bancaria_ativa_tem_movimento',
        titulo: 'conta bancária ativa tem movimentação registrada',
        severidade: 'warn',
        afeta: ['caixa.saldo'],
        checar: (f) => {
            const comMov = new Set(f.movimentos.map(m => m.conta_bancaria_id))
            const paradas = f.contas.filter(c => c.ativo && !comMov.has(c.id))
            return paradas.length
                ? {
                    detalhe: `${paradas.length} conta(s) ativas sem nenhum movimento — entram no saldo ` +
                        `total sem nada por trás: ` + lista(paradas.map(c => `${c.nome} (saldo ${num(c.saldo_atual).toFixed(2)})`)),
                }
                : null
        },
    },
]
