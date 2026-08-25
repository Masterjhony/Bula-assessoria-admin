/**
 * LEILÕES — Resultados, Fechamento, Acordos Comerciais, Comissionamento.
 *
 * É de onde vem toda a receita da Bula, e é onde mora a maior densidade de
 * armadilha semântica do ERP:
 *
 *  · VGV é COBERTURA (o que a Bula cobriu na pista), não o faturamento do
 *    leilão. Confundir os dois inverte a conta da comissão.
 *  · A tabela de performance (acordo padrão) precisa do faturamento_total do
 *    leilão. Sem ele, não existe degrau — e a comissão esperada é indefinida,
 *    não zero.
 *  · O histórico (erp_resultados_historico) e os fechamentos são fontes
 *    distintas do mesmo fato; divergência entre eles já rendeu relatório errado.
 */

import type { DefinicaoValidacao, DefinicaoVariavel, Lacuna, ResultadoCalculo } from '../tipos'
import { cobertura, cobreTudo } from '../tipos'
import { type Fatos, aberto, devido, maxData, num, r2, vivo } from '../fatos'

const brl = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const lista = (xs: string[], n = 4) =>
    xs.slice(0, n).join('; ') + (xs.length > n ? ` … (+${xs.length - n})` : '')
const anoDe = (iso: string) => String(iso || '').slice(0, 4)
const mesDe = (iso: string) => String(iso || '').slice(0, 7)

export const VARIAVEIS: DefinicaoVariavel<Fatos>[] = [
    {
        id: 'leilao.vgv_ano',
        titulo: 'VGV coberto no ano corrente',
        unidade: 'BRL',
        classe: 'primaria',
        formula: 'Σ vgv_total dos fechamentos com data no ano — VGV é COBERTURA da Bula, não faturamento do leilão',
        calcular: (f): ResultadoCalculo => {
            const ano = anoDe(f.hoje)
            const fes = f.fechamentos.filter(x => anoDe(String(x.data || '')) === ano)
            const porMes = new Map<string, number>()
            for (const x of fes) {
                const k = mesDe(String(x.data || ''))
                porMes.set(k, (porMes.get(k) || 0) + num(x.vgv_total))
            }
            return {
                valor: r2(fes.reduce((s, x) => s + num(x.vgv_total), 0)),
                origens: [{ fonte: 'bula_leilao_fechamento', filtro: `data em ${ano}`, linhas: fes.length }],
                cobertura: cobreTudo(fes.length),
                atualizado_em: maxData(fes.map(x => x.data)),
                composicao: [...porMes.entries()].sort()
                    .map(([rotulo, valor]) => ({ rotulo, valor: r2(valor) })),
            }
        },
    },
    {
        id: 'leilao.quantidade_ano',
        titulo: 'Leilões fechados no ano',
        unidade: 'contagem',
        classe: 'primaria',
        formula: 'nº de fechamentos com data no ano corrente',
        calcular: (f): ResultadoCalculo => {
            const ano = anoDe(f.hoje)
            const fes = f.fechamentos.filter(x => anoDe(String(x.data || '')) === ano)
            return {
                valor: fes.length,
                origens: [{ fonte: 'bula_leilao_fechamento', filtro: `data em ${ano}`, linhas: fes.length }],
                cobertura: cobreTudo(fes.length),
                atualizado_em: maxData(fes.map(x => x.data)),
            }
        },
    },
    {
        id: 'leilao.ticket_medio_lote',
        titulo: 'Ticket médio por lote no ano',
        unidade: 'BRL',
        classe: 'derivada',
        formula: 'Σ vgv_total ÷ Σ lotes_vendidos, nos fechamentos do ano',
        deriva_de: ['leilao.vgv_ano'],
        calcular: (f, dep): ResultadoCalculo => {
            const ano = anoDe(f.hoje)
            const fes = f.fechamentos.filter(x => anoDe(String(x.data || '')) === ano)
            const lotes = fes.reduce((s, x) => s + num(x.lotes_vendidos), 0)
            const vgv = Number(dep['leilao.vgv_ano']?.valor || 0)
            const semLotes = fes.filter(x => !num(x.lotes_vendidos))
            return {
                valor: lotes > 0 ? r2(vgv / lotes) : null,
                origens: [{ fonte: 'bula_leilao_fechamento', filtro: `data em ${ano}`, linhas: fes.length }],
                cobertura: cobertura(fes.length, fes.length - semLotes.length, semLotes.length ? [{
                    motivo: 'fechamento sem lotes_vendidos — entra no VGV mas não no denominador',
                    impacto: 'valor',
                    linhas: semLotes.length,
                    exemplos: semLotes.slice(0, 4).map(x => x.nome),
                }] : []),
                atualizado_em: maxData(fes.map(x => x.data)),
                formula: `${brl(vgv)} ÷ ${lotes} lotes vendidos em ${ano}`,
            }
        },
    },
    {
        id: 'acordo.cobertura_parametros',
        titulo: 'Fechamentos com acordo comercial parametrizado',
        unidade: 'percentual',
        classe: 'primaria',
        formula: 'nº de fechamentos com % de faturamento ou % de venda cadastrado ÷ total',
        calcular: (f): ResultadoCalculo => {
            const fes = f.fechamentos
            const com = fes.filter(x => num(x.acordo_pct_faturamento) > 0 || num(x.acordo_pct_venda_cobertura) > 0)
            const sem = fes.filter(x => !com.includes(x))
            return {
                valor: fes.length ? r2((com.length / fes.length) * 100) : null,
                origens: [{ fonte: 'bula_leilao_fechamento', filtro: 'todos', linhas: fes.length }],
                cobertura: cobreTudo(fes.length, sem.length ? [{
                    motivo: 'fechamento sem parâmetro de acordo — a comissão dele não sai de regra nenhuma',
                    impacto: 'interpretacao',
                    linhas: sem.length,
                    exemplos: sem.slice(0, 4).map(x => x.nome),
                }] : []),
                atualizado_em: maxData(fes.map(x => x.updated_at)),
                composicao: [
                    { rotulo: 'com acordo parametrizado', valor: com.length },
                    { rotulo: 'sem parâmetro', valor: sem.length, nota: 'comissão calculada à mão, fora do sistema' },
                ],
            }
        },
    },
    {
        id: 'leilao.receita_por_fechamento',
        titulo: 'Fechamentos com CR de comissão lançado',
        unidade: 'percentual',
        classe: 'derivada',
        formula: 'nº de fechamentos referenciados por algum CR vivo ÷ total de fechamentos',
        calcular: (f): ResultadoCalculo => {
            const comCr = new Set(f.cr.filter(vivo).map(t => t.fechamento_id).filter(Boolean) as string[])
            const fes = f.fechamentos
            const sem = fes.filter(x => !comCr.has(x.id))
            return {
                valor: fes.length ? r2(((fes.length - sem.length) / fes.length) * 100) : null,
                origens: [
                    { fonte: 'erp_contas_receber', filtro: 'vivos com fechamento_id', linhas: comCr.size },
                    { fonte: 'bula_leilao_fechamento', filtro: 'todos', linhas: fes.length },
                ],
                cobertura: cobreTudo(fes.length, sem.length ? [{
                    motivo: 'leilão fechado sem nenhum CR de comissão — receita apurada que ninguém está cobrando',
                    impacto: 'valor',
                    linhas: sem.length,
                    valor: r2(sem.reduce((s, x) => s + num(x.comissao_assessoria), 0)),
                    exemplos: sem.slice(0, 4).map(x => `${x.data} ${x.nome}`),
                }] : []),
                atualizado_em: maxData(fes.map(x => x.data)),
                composicao: [
                    { rotulo: 'com CR lançado', valor: fes.length - sem.length },
                    { rotulo: 'sem CR', valor: sem.length, nota: 'não vira cobrança' },
                ],
            }
        },
    },
    {
        id: 'comissao.devida_por_assessor',
        titulo: 'Comissão a pagar por assessor, no próximo ciclo',
        unidade: 'BRL',
        classe: 'primaria',
        formula: 'Σ devido dos CP de comissão no menor vencimento futuro, agrupado por fornecedor',
        calcular: (f): ResultadoCalculo => {
            const comissoes = f.cp.filter(t => aberto(t) && /comiss/i.test(t.descricao) && t.vencimento >= f.hoje)
            const alvo = comissoes.map(t => t.vencimento).sort()[0] || null
            const doCiclo = alvo ? comissoes.filter(t => t.vencimento === alvo) : []
            const nomePessoa = new Map(f.pessoas.map(p => [p.id, p.nome]))
            const porPessoa = new Map<string, number>()
            for (const t of doCiclo) {
                const k = t.fornecedor_id ? (nomePessoa.get(t.fornecedor_id) || t.fornecedor_id) : '(sem beneficiário)'
                porPessoa.set(k, (porPessoa.get(k) || 0) + devido(t, 'valor_pago'))
            }
            const semDono = doCiclo.filter(t => !t.fornecedor_id)
            const lacunas: Lacuna[] = semDono.length ? [{
                motivo: 'comissão sem beneficiário — entra no total, mas não se sabe a quem pagar',
                impacto: 'atribuicao',
                linhas: semDono.length,
                valor: r2(semDono.reduce((s, t) => s + devido(t, 'valor_pago'), 0)),
                exemplos: semDono.slice(0, 4).map(t => t.descricao.slice(0, 42)),
            }] : []
            return {
                valor: r2(doCiclo.reduce((s, t) => s + devido(t, 'valor_pago'), 0)),
                origens: [{ fonte: 'erp_contas_pagar', filtro: `comissão, vencimento = ${alvo || '—'}`, linhas: doCiclo.length }],
                cobertura: cobreTudo(doCiclo.length, lacunas),
                atualizado_em: maxData(doCiclo.map(t => t.updated_at)),
                formula: `Σ devido dos CP de comissão vencendo em ${alvo || '—'}, por beneficiário`,
                composicao: [...porPessoa.entries()].sort((a, b) => b[1] - a[1])
                    .map(([rotulo, valor]) => ({ rotulo, valor: r2(valor) })),
            }
        },
    },
]

export const VALIDACOES: DefinicaoValidacao<Fatos>[] = [
    {
        id: 'vgv_nao_e_faturamento',
        titulo: 'VGV coberto nunca excede o faturamento total do leilão',
        severidade: 'fail',
        afeta: ['leilao.vgv_ano', 'vgv.mes', 'receita.esperada'],
        checar: (f) => {
            const ruins = f.fechamentos.filter(x =>
                num(x.faturamento_total_leilao) > 0 &&
                num(x.vgv_total) > num(x.faturamento_total_leilao) * 1.001)
            return ruins.length
                ? {
                    detalhe: `${ruins.length} fechamento(s) com VGV maior que o faturamento do leilão — ` +
                        `sinal de que um dos dois campos guarda a coisa errada: ` +
                        lista(ruins.map(x => `${x.nome}: VGV ${brl(x.vgv_total)} > faturamento ${brl(num(x.faturamento_total_leilao))}`)),
                }
                : null
        },
    },
    {
        id: 'fechamento_data_valida',
        titulo: 'todo fechamento tem data e ela não está no futuro',
        severidade: 'fail',
        afeta: ['leilao.vgv_ano', 'vgv.mes', 'leilao.quantidade_ano'],
        checar: (f) => {
            const sem = f.fechamentos.filter(x => !x.data)
            const futuro = f.fechamentos.filter(x => x.data && String(x.data).slice(0, 10) > f.hoje)
            if (!sem.length && !futuro.length) return null
            const partes: string[] = []
            if (sem.length) partes.push(`${sem.length} sem data: ` + lista(sem.map(x => x.nome)))
            if (futuro.length) partes.push(`${futuro.length} com data futura (leilão que ainda não ocorreu já contando como fechado): ` +
                lista(futuro.map(x => `${x.data} ${x.nome}`)))
            return { detalhe: partes.join(' · ') }
        },
    },
    {
        id: 'receita_bula_bate_com_acordo',
        titulo: 'receita_bula do fechamento bate com a fórmula do acordo cadastrado',
        severidade: 'warn',
        afeta: ['receita.esperada', 'acordo.cobertura_parametros'],
        checar: (f) => {
            // acordo_pct_* são FRAÇÕES (0.03 = 3%).
            const ruins: string[] = []
            for (const x of f.fechamentos) {
                const pf = num(x.acordo_pct_faturamento), pv = num(x.acordo_pct_venda_cobertura)
                if (!pf && !pv) continue
                // Sem faturamento informado a parcela por faturamento é
                // INDEFINIDA, não zero — comparar seria inventar.
                if (pf > 0 && !num(x.faturamento_total_leilao)) continue
                const esperado = r2(num(x.faturamento_total_leilao) * pf + num(x.vgv_total) * pv)
                const apurado = r2(num(x.receita_bula))
                if (esperado <= 0 && apurado <= 0) continue
                const tol = Math.max(1, Math.max(esperado, apurado) * 0.02)
                if (Math.abs(esperado - apurado) > tol) {
                    ruins.push(`${x.nome}: acordo dá ${brl(esperado)}, receita_bula ${brl(apurado)}`)
                }
            }
            return ruins.length
                ? {
                    detalhe: `${ruins.length} fechamento(s) em que a receita apurada não sai do acordo ` +
                        `cadastrado — ou o acordo está incompleto, ou a apuração foi feita por fora: ` + lista(ruins),
                }
                : null
        },
    },
    {
        id: 'cr_cobre_receita_apurada',
        titulo: 'a receita apurada do fechamento virou CR de cobrança',
        severidade: 'warn',
        afeta: ['receber.contratado', 'leilao.receita_por_fechamento'],
        checar: (f) => {
            const porFechamento = new Map<string, number>()
            for (const t of f.cr.filter(vivo)) {
                if (!t.fechamento_id) continue
                porFechamento.set(t.fechamento_id, (porFechamento.get(t.fechamento_id) || 0) + num(t.valor))
            }
            const ruins: string[] = []
            for (const x of f.fechamentos) {
                const apurado = r2(num(x.receita_bula))
                if (apurado <= 0) continue
                const lancado = r2(porFechamento.get(x.id) || 0)
                const tol = Math.max(1, apurado * 0.02)
                if (Math.abs(apurado - lancado) > tol) {
                    ruins.push(`${x.nome}: apurado ${brl(apurado)}, CR lançado ${brl(lancado)}`)
                }
            }
            return ruins.length
                ? {
                    detalhe: `${ruins.length} fechamento(s) com CR diferente da receita apurada — ` +
                        `receita que ninguém está cobrando, ou cobrança sem lastro: ` + lista(ruins),
                }
                : null
        },
    },
    {
        id: 'historico_bate_com_fechamentos',
        titulo: 'o histórico mensal bate com os fechamentos do mesmo mês',
        severidade: 'warn',
        afeta: ['leilao.vgv_ano', 'leilao.quantidade_ano'],
        checar: (f) => {
            const porMes = new Map<string, { vgv: number; n: number }>()
            for (const x of f.fechamentos) {
                const k = mesDe(String(x.data || ''))
                if (!k) continue
                const a = porMes.get(k) || { vgv: 0, n: 0 }
                a.vgv += num(x.vgv_total); a.n++
                porMes.set(k, a)
            }
            const ruins: string[] = []
            for (const h of f.resultadosHistorico) {
                const k = `${h.ano}-${String(h.mes).padStart(2, '0')}`
                const atual = porMes.get(k)
                if (!atual) continue
                const hv = num(h.vgv)
                if (hv > 0 && Math.abs(hv - atual.vgv) > Math.max(1, hv * 0.01)) {
                    ruins.push(`${k}: histórico ${brl(hv)} × fechamentos ${brl(atual.vgv)}`)
                }
            }
            return ruins.length
                ? {
                    detalhe: `${ruins.length} mês(es) em que o histórico e os fechamentos discordam — ` +
                        `duas fontes do mesmo fato: ` + lista(ruins),
                }
                : null
        },
    },
    {
        id: 'comissao_assessor_sem_cadastro',
        titulo: 'assessor citado no fechamento existe no cadastro da folha',
        severidade: 'warn',
        afeta: ['comissao.devida_por_assessor', 'comissao.proximo_ciclo'],
        checar: (f) => {
            const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
                .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
            const conhecidos = new Set<string>()
            for (const x of f.folha) {
                for (const n of [x.nome, x.pagamento_nome, ...(x.apelidos || [])]) {
                    if (n) conhecidos.add(norm(n).split(' ')[0])
                }
            }
            const desconhecidos = new Set<string>()
            for (const fe of f.fechamentos) {
                for (const a of fe.por_assessor || []) {
                    const nome = norm(a.assessor || '')
                    if (!nome) continue
                    if (!conhecidos.has(nome.split(' ')[0])) desconhecidos.add(a.assessor || '')
                }
            }
            return desconhecidos.size
                ? {
                    detalhe: `${desconhecidos.size} assessor(es) aparecem em fechamento mas não estão na folha — ` +
                        `alias novo quebra a apuração de comissão: ` + lista([...desconhecidos]),
                }
                : null
        },
    },
    {
        id: 'fechamento_duplicado',
        titulo: 'não há fechamento duplicado (mesmo nome e data)',
        severidade: 'fail',
        afeta: ['leilao.vgv_ano', 'vgv.mes', 'leilao.quantidade_ano'],
        checar: (f) => {
            const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
                .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
            const vistos = new Map<string, number>()
            for (const x of f.fechamentos) {
                const k = `${norm(x.nome)}|${String(x.data || '').slice(0, 10)}`
                vistos.set(k, (vistos.get(k) || 0) + 1)
            }
            const dupes = [...vistos.entries()].filter(([, n]) => n > 1)
            return dupes.length
                ? { detalhe: `${dupes.length} fechamento(s) duplicados — o VGV conta duas vezes: ` +
                    lista(dupes.map(([k, n]) => `${k.split('|')[1]} ${k.split('|')[0].slice(0, 40)} (${n}x)`)) }
                : null
        },
    },
]
