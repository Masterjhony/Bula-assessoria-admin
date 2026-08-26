/**
 * CATÁLOGO DE VARIÁVEIS — os números que a Bula apresenta.
 *
 * Se um número aparece numa reunião, num PDF ou numa mensagem, ele precisa
 * estar declarado aqui. Declarar significa dizer, em código: de quais fatos
 * nasce, por que fórmula, e o que faz a conta ficar incompleta.
 *
 * Nada de `const receita = 847300`. A variável é a função que a produz.
 */

import type { DefinicaoVariavel, Lacuna, ResultadoCalculo, VariavelResolvida } from './tipos'
import { cobertura, cobreTudo } from './tipos'
import {
    type Fatos, aberto, compromissoFuturo, devido, maxData, naoSubstituido, num, operacional, r2,
} from './fatos'
import { VARIAVEIS as VARS_CONVENCOES } from './dominios/convencoes'
import { VARIAVEIS as VARS_CONTABIL } from './dominios/contabil'
import { VARIAVEIS as VARS_CARTOES } from './dominios/cartoes'
import { VARIAVEIS as VARS_FOLHA } from './dominios/folha'
import { VARIAVEIS as VARS_LEILOES } from './dominios/leiloes'
import { VARIAVEIS as VARS_CADASTROS } from './dominios/cadastros'
import { VARIAVEIS as VARS_COBERTURA } from './dominios/cobertura'

const mesDe = (iso: string) => iso.slice(0, 7)
const primeiroDia = (iso: string) => iso.slice(0, 7) + '-01'
const ultimoDia = (iso: string) => {
    const [a, m] = iso.split('-').map(Number)
    return new Date(a, m, 0).toISOString().slice(0, 10)
}
const somaDias = (iso: string, n: number) => {
    const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
}
const GRUPOS_SAIDA = ['imposto', 'custo_direto', 'despesa_variavel', 'despesa_fixa']

const NUCLEO_FINANCEIRO: DefinicaoVariavel<Fatos>[] = [
    // ═══ CAIXA ═════════════════════════════════════════════════════════════
    {
        id: 'caixa.saldo',
        titulo: 'Saldo em caixa (todas as contas ativas)',
        unidade: 'BRL',
        classe: 'primaria_conciliada',
        formula: 'Σ (saldo_inicial + entradas − saídas) de cada conta bancária ativa',
        calcular: (f): ResultadoCalculo => {
            const ativas = f.contas.filter(c => c.ativo)
            const valor = r2(ativas.reduce((s, c) => s + num(c.saldo_atual), 0))
            const naoConciliados = f.movimentos.filter(m => m.status_conciliacao !== 'conciliado')
            const lacunas: Lacuna[] = naoConciliados.length ? [{
                motivo: 'movimento ainda não conciliado contra o extrato',
                impacto: 'valor',
                linhas: naoConciliados.length,
                valor: r2(naoConciliados.reduce((s, m) => s + num(m.valor), 0)),
                exemplos: naoConciliados.slice(0, 4).map(m => `${m.data} ${String(m.descricao || '').slice(0, 36)}`),
            }] : []
            return {
                valor,
                origens: [
                    { fonte: 'erp_contas_bancarias', filtro: 'ativo = true', linhas: ativas.length },
                    { fonte: 'erp_movimentos_bancarios', filtro: 'todos', linhas: f.movimentos.length },
                ],
                cobertura: cobertura(f.movimentos.length, f.movimentos.length - naoConciliados.length, lacunas),
                atualizado_em: maxData(f.movimentos.map(m => m.data)),
            }
        },
    },
    {
        id: 'caixa.conciliado_ate',
        titulo: 'Extrato conciliado até',
        unidade: 'data',
        classe: 'primaria_conciliada',
        formula: 'maior data entre os movimentos com status_conciliacao = conciliado',
        calcular: (f): ResultadoCalculo => {
            const conc = f.movimentos.filter(m => m.status_conciliacao === 'conciliado')
            return {
                valor: maxData(conc.map(m => m.data)),
                origens: [{ fonte: 'erp_movimentos_bancarios', filtro: 'status_conciliacao = conciliado', linhas: conc.length }],
                cobertura: cobreTudo(conc.length),
                atualizado_em: maxData(conc.map(m => m.data)),
            }
        },
    },

    // ═══ TÍTULOS ═══════════════════════════════════════════════════════════
    {
        id: 'receber.contratado',
        titulo: 'A receber — contratado (comissão já apurada)',
        unidade: 'BRL',
        classe: 'primaria',
        formula: 'Σ devido dos CR abertos com origem = real — o leilão aconteceu e a comissão está apurada',
        calcular: (f): ResultadoCalculo => {
            const ts = f.cr.filter(t => aberto(t) && naoSubstituido(t) && !compromissoFuturo(t))
            return {
                valor: r2(ts.reduce((s, t) => s + devido(t, 'valor_recebido'), 0)),
                origens: [{ fonte: 'erp_contas_receber', filtro: 'aberto, origem = real, não substituído', linhas: ts.length }],
                cobertura: cobreTudo(ts.length),
                atualizado_em: maxData(ts.map(t => t.updated_at)),
            }
        },
    },
    {
        id: 'receber.estimado',
        titulo: 'A receber — estimado (leilão previsto, sem apuração)',
        unidade: 'BRL',
        classe: 'estimada',
        formula: 'Σ devido dos CR abertos com origem = estimativa',
        calcular: (f): ResultadoCalculo => {
            const ts = f.cr.filter(t => aberto(t) && naoSubstituido(t) && compromissoFuturo(t))
            return {
                valor: r2(ts.reduce((s, t) => s + devido(t, 'valor_recebido'), 0)),
                origens: [{ fonte: 'erp_contas_receber', filtro: 'aberto, origem = estimativa', linhas: ts.length }],
                cobertura: cobreTudo(ts.length),
                atualizado_em: maxData(ts.map(t => t.updated_at)),
            }
        },
    },
    {
        id: 'receber.aberto',
        titulo: 'A receber em aberto (total)',
        unidade: 'BRL',
        classe: 'derivada',
        formula: 'receber.contratado + receber.estimado',
        deriva_de: ['receber.contratado', 'receber.estimado'],
        heranca: 'ponderada',
        calcular: (f, dep): ResultadoCalculo => {
            const contratado = Number(dep['receber.contratado']?.valor || 0)
            const estimado = Number(dep['receber.estimado']?.valor || 0)
            const ts = f.cr.filter(t => aberto(t) && naoSubstituido(t))
            return {
                valor: r2(contratado + estimado),
                origens: [{ fonte: 'erp_contas_receber', filtro: 'status ∈ (aberto,parcial,vencido), não substituído', linhas: ts.length }],
                cobertura: cobreTudo(ts.length),
                atualizado_em: maxData(ts.map(t => t.updated_at)),
                composicao: [
                    { rotulo: 'contratado (comissão apurada)', valor: contratado, nota: 'o leilão já aconteceu' },
                    { rotulo: 'estimado (leilão previsto)', valor: estimado, nota: 'pode não acontecer, ou vir com outro valor' },
                ],
            }
        },
    },
    {
        id: 'receber.vencido',
        titulo: 'A receber vencido',
        unidade: 'BRL',
        classe: 'primaria',
        formula: 'Σ devido dos CR abertos com vencimento < hoje',
        calcular: (f): ResultadoCalculo => {
            const ts = f.cr.filter(t => aberto(t) && naoSubstituido(t) && t.vencimento < f.hoje)
            const valor = r2(ts.reduce((s, t) => s + devido(t, 'valor_recebido'), 0))
            // Vencimento automático (leilão+45d) não é promessa: entra como lacuna.
            const acordados = ts.filter(t =>
                (t.tags || []).includes('data-acordada') || /acordo|acordad/i.test(String(t.observacoes || '')))
            const lacunas: Lacuna[] = ts.length > acordados.length ? [{
                motivo: 'vencimento automático (leilão+45d), sem data combinada com a leiloeira',
                impacto: 'interpretacao',
                linhas: ts.length - acordados.length,
                valor: r2(ts.filter(t => !acordados.includes(t)).reduce((s, t) => s + devido(t, 'valor_recebido'), 0)),
                exemplos: ts.filter(t => !acordados.includes(t)).slice(0, 4).map(t => t.descricao.slice(0, 44)),
            }] : []
            return {
                valor,
                origens: [{ fonte: 'erp_contas_receber', filtro: `aberto e vencimento < ${f.hoje}`, linhas: ts.length }],
                // O valor está certo: todo CR vencido entrou na soma. O que a lacuna
                // estraga é a leitura de "vencido", não o total.
                cobertura: cobreTudo(ts.length, lacunas),
                atualizado_em: maxData(ts.map(t => t.updated_at)),
            }
        },
    },
    {
        id: 'pagar.compromissado',
        titulo: 'A pagar — dívida contraída',
        unidade: 'BRL',
        classe: 'primaria',
        formula: 'Σ devido dos CP abertos com origem = real — obrigação que já existe (serviço prestado, comissão apurada)',
        calcular: (f): ResultadoCalculo => {
            const ts = f.cp.filter(t => aberto(t) && naoSubstituido(t) && !compromissoFuturo(t))
            return {
                valor: r2(ts.reduce((s, t) => s + devido(t, 'valor_pago'), 0)),
                origens: [{ fonte: 'erp_contas_pagar', filtro: 'aberto, origem = real, não substituído', linhas: ts.length }],
                cobertura: cobreTudo(ts.length),
                atualizado_em: maxData(ts.map(t => t.updated_at)),
            }
        },
    },
    {
        id: 'pagar.projetado',
        titulo: 'A pagar — custo futuro projetado (folha e recorrentes)',
        unidade: 'BRL',
        classe: 'estimada',
        formula: 'Σ devido dos CP abertos com origem = estimativa — custo planejado, ainda não incorrido',
        calcular: (f): ResultadoCalculo => {
            const ts = f.cp.filter(t => aberto(t) && naoSubstituido(t) && compromissoFuturo(t))
            const ate = maxData(ts.map(t => t.vencimento))
            return {
                valor: r2(ts.reduce((s, t) => s + devido(t, 'valor_pago'), 0)),
                origens: [{ fonte: 'erp_contas_pagar', filtro: 'aberto, origem = estimativa', linhas: ts.length }],
                cobertura: cobreTudo(ts.length),
                atualizado_em: maxData(ts.map(t => t.updated_at)),
                formula: 'Σ devido dos CP projetados, vencimentos até ' + (ate || '—') + ' — custo planejado, nao e divida',
            }
        },
    },
    {
        id: 'pagar.aberto',
        titulo: 'A pagar em aberto (total)',
        unidade: 'BRL',
        classe: 'derivada',
        formula: 'pagar.compromissado + pagar.projetado',
        deriva_de: ['pagar.compromissado', 'pagar.projetado'],
        heranca: 'ponderada',
        calcular: (f, dep): ResultadoCalculo => {
            const divida = Number(dep['pagar.compromissado']?.valor || 0)
            const projetado = Number(dep['pagar.projetado']?.valor || 0)
            const ts = f.cp.filter(t => aberto(t) && naoSubstituido(t))
            return {
                valor: r2(divida + projetado),
                origens: [{ fonte: 'erp_contas_pagar', filtro: 'status ∈ (aberto,parcial,vencido), não substituído', linhas: ts.length }],
                cobertura: cobreTudo(ts.length),
                atualizado_em: maxData(ts.map(t => t.updated_at)),
                composicao: [
                    { rotulo: 'dívida contraída', valor: divida, nota: 'isto a Bula deve hoje' },
                    { rotulo: 'custo futuro projetado', valor: projetado, nota: 'folha e recorrentes lançados adiante — não é dívida' },
                ],
            }
        },
    },
    {
        id: 'pagar.vencido',
        titulo: 'A pagar vencido',
        unidade: 'BRL',
        classe: 'primaria',
        formula: 'Σ devido dos CP abertos com vencimento < hoje',
        calcular: (f): ResultadoCalculo => {
            const ts = f.cp.filter(t => aberto(t) && naoSubstituido(t) && t.vencimento < f.hoje)
            return {
                valor: r2(ts.reduce((s, t) => s + devido(t, 'valor_pago'), 0)),
                origens: [{ fonte: 'erp_contas_pagar', filtro: `aberto e vencimento < ${f.hoje}`, linhas: ts.length }],
                cobertura: cobreTudo(ts.length),
                atualizado_em: maxData(ts.map(t => t.updated_at)),
            }
        },
    },

    // ═══ RESULTADO DO MÊS ══════════════════════════════════════════════════
    {
        id: 'receita.mes',
        titulo: 'Receita realizada no mês corrente',
        unidade: 'BRL',
        classe: 'primaria_conciliada',
        formula: 'Σ entradas do mês cuja categoria tem dre_grupo = receita (transferências entre contas fora)',
        calcular: (f): ResultadoCalculo => {
            const de = primeiroDia(f.hoje), ate = ultimoDia(f.hoje)
            const doMes = f.movimentos.filter(m => m.data >= de && m.data <= ate && operacional(m, f))
            const receitas = doMes.filter(m => m.tipo === 'entrada' && f.dreGrupo.get(m.categoria_id || '') === 'receita')
            const semCat = doMes.filter(m => m.tipo === 'entrada' && !f.dreGrupo.get(m.categoria_id || ''))
            const lacunas: Lacuna[] = semCat.length ? [{
                motivo: 'entrada do mês sem categoria com dre_grupo — não entra em receita nenhuma',
                impacto: 'valor',
                linhas: semCat.length,
                valor: r2(semCat.reduce((s, m) => s + num(m.valor), 0)),
                exemplos: semCat.slice(0, 4).map(m => `${m.data} ${String(m.descricao || '').slice(0, 36)}`),
            }] : []
            const entradas = doMes.filter(m => m.tipo === 'entrada')
            return {
                valor: r2(receitas.reduce((s, m) => s + num(m.valor), 0)),
                origens: [{ fonte: 'erp_movimentos_bancarios', filtro: `${de}..${ate}, entrada, dre_grupo=receita`, linhas: receitas.length }],
                cobertura: cobertura(entradas.length, entradas.length - semCat.length, lacunas),
                atualizado_em: maxData(doMes.map(m => m.data)),
                formula: `Σ entradas de ${de} a ${ate} com dre_grupo = receita`,
            }
        },
    },
    {
        id: 'despesa.mes',
        titulo: 'Saídas do mês (imposto + custo direto + despesa variável + fixa)',
        unidade: 'BRL',
        classe: 'primaria_conciliada',
        formula: 'Σ saídas do mês com dre_grupo ∈ (imposto, custo_direto, despesa_variavel, despesa_fixa)',
        calcular: (f): ResultadoCalculo => {
            const de = primeiroDia(f.hoje), ate = ultimoDia(f.hoje)
            const doMes = f.movimentos.filter(m => m.data >= de && m.data <= ate && operacional(m, f) && m.tipo === 'saida')
            const contam = doMes.filter(m => GRUPOS_SAIDA.includes(f.dreGrupo.get(m.categoria_id || '') || ''))
            const semCat = doMes.filter(m => !f.dreGrupo.get(m.categoria_id || ''))
            const lacunas: Lacuna[] = semCat.length ? [{
                motivo: 'saída do mês sem categoria com dre_grupo',
                impacto: 'valor',
                linhas: semCat.length,
                valor: r2(semCat.reduce((s, m) => s + num(m.valor), 0)),
            }] : []
            return {
                valor: r2(contam.reduce((s, m) => s + num(m.valor), 0)),
                origens: [{ fonte: 'erp_movimentos_bancarios', filtro: `${de}..${ate}, saída, dre_grupo operacional`, linhas: contam.length }],
                cobertura: cobertura(doMes.length, doMes.length - semCat.length, lacunas),
                atualizado_em: maxData(doMes.map(m => m.data)),
            }
        },
    },
    {
        id: 'resultado.mes',
        titulo: 'Resultado do mês (receita − saídas operacionais)',
        unidade: 'BRL',
        classe: 'derivada',
        formula: 'receita.mes − despesa.mes',
        deriva_de: ['receita.mes', 'despesa.mes'],
        calcular: (_f, dep): ResultadoCalculo => {
            const r = Number(dep['receita.mes']?.valor || 0)
            const d = Number(dep['despesa.mes']?.valor || 0)
            const cobs = [dep['receita.mes']?.cobertura, dep['despesa.mes']?.cobertura].filter(Boolean)
            const universo = cobs.reduce((s, c) => s + (c?.universo || 0), 0)
            const usados = cobs.reduce((s, c) => s + (c?.usados || 0), 0)
            return {
                valor: r2(r - d),
                origens: [{ fonte: 'variáveis', filtro: 'receita.mes − despesa.mes', linhas: 2 }],
                cobertura: cobertura(universo, usados, cobs.flatMap(c => c?.lacunas || [])),
                atualizado_em: maxData([dep['receita.mes']?.atualizado_em, dep['despesa.mes']?.atualizado_em]),
            }
        },
    },
    {
        id: 'margem.mes',
        titulo: 'Margem do mês',
        unidade: 'percentual',
        classe: 'derivada',
        formula: 'resultado.mes ÷ receita.mes',
        deriva_de: ['resultado.mes', 'receita.mes'],
        calcular: (_f, dep): ResultadoCalculo => {
            const res = Number(dep['resultado.mes']?.valor || 0)
            const rec = Number(dep['receita.mes']?.valor || 0)
            return {
                valor: rec > 0 ? r2((res / rec) * 100) : null,
                origens: [{ fonte: 'variáveis', filtro: 'resultado.mes ÷ receita.mes', linhas: 2 }],
                cobertura: dep['resultado.mes']?.cobertura || cobreTudo(0),
                atualizado_em: dep['resultado.mes']?.atualizado_em || null,
            }
        },
    },

    // ═══ OPERAÇÃO (fechamentos) ════════════════════════════════════════════
    {
        id: 'vgv.mes',
        titulo: 'VGV dos leilões do mês',
        unidade: 'BRL',
        classe: 'primaria',
        formula: 'Σ vgv_total dos fechamentos com data no mês corrente',
        calcular: (f): ResultadoCalculo => {
            const mes = mesDe(f.hoje)
            const fes = f.fechamentos.filter(fe => mesDe(String(fe.data || '')) === mes)
            const comLances = fes.filter(fe => (fe.lances || []).length > 0)
            const lacunas: Lacuna[] = fes.length > comLances.length ? [{
                motivo: 'fechamento sem detalhe de lances — o VGV é agregado declarado, não somado lote a lote',
                impacto: 'interpretacao',
                linhas: fes.length - comLances.length,
                exemplos: fes.filter(fe => !(fe.lances || []).length).slice(0, 4).map(fe => fe.nome),
            }] : []
            return {
                valor: r2(fes.reduce((s, fe) => s + num(fe.vgv_total), 0)),
                origens: [{ fonte: 'bula_leilao_fechamento', filtro: `data em ${mes}`, linhas: fes.length }],
                // VGV agregado declarado é o valor oficial do fechamento; a falta do
                // detalhe lote a lote tira rastreabilidade, não exatidão.
                cobertura: cobreTudo(fes.length, lacunas),
                atualizado_em: maxData(fes.map(fe => fe.data)),
            }
        },
    },
    {
        id: 'acordo.faturamento_informado',
        titulo: 'Fechamentos com faturamento total informado',
        unidade: 'percentual',
        classe: 'primaria',
        formula: 'nº de fechamentos com faturamento_total_leilao preenchido ÷ total de fechamentos',
        calcular: (f): ResultadoCalculo => {
            const fes = f.fechamentos
            const com = fes.filter(fe => num(fe.faturamento_total_leilao) > 0)
            const lacunas: Lacuna[] = fes.length > com.length ? [{
                motivo: 'faturamento_total_leilao em branco — trava a tabela de performance (acordo padrão)',
                impacto: 'valor',
                linhas: fes.length - com.length,
                exemplos: fes.filter(fe => !num(fe.faturamento_total_leilao)).slice(0, 4).map(fe => fe.nome),
            }] : []
            return {
                valor: fes.length ? r2((com.length / fes.length) * 100) : null,
                origens: [{ fonte: 'bula_leilao_fechamento', filtro: 'todos', linhas: fes.length }],
                // Esta variável MEDE uma cobertura; ela própria enxerga 100% do
                // universo. Penalizá-la pelo que ela denuncia seria contar o
                // mesmo problema duas vezes.
                cobertura: cobreTudo(fes.length, lacunas),
                atualizado_em: maxData(fes.map(fe => fe.updated_at)),
                composicao: [
                    { rotulo: 'com faturamento informado', valor: com.length, nota: 'dá para aplicar a tabela de performance' },
                    { rotulo: 'sem faturamento', valor: fes.length - com.length, nota: 'acordo padrão não pode ser calculado' },
                ],
            }
        },
    },
    {
        id: 'receita.esperada',
        titulo: 'Comissão esperada dos fechamentos (o que deveria virar CR)',
        unidade: 'BRL',
        classe: 'derivada',
        formula: 'Σ (faturamento_total × acordo_pct_faturamento) + (vgv_total × acordo_pct_venda_cobertura) — os pct são FRAÇÕES (0.03 = 3%); só onde os parâmetros existem',
        calcular: (f): ResultadoCalculo => {
            const fes = f.fechamentos
            let valor = 0, usados = 0
            const semParametro: string[] = []
            const semFaturamento: string[] = []
            for (const fe of fes) {
                const pf = num(fe.acordo_pct_faturamento), pv = num(fe.acordo_pct_venda_cobertura)
                if (!pf && !pv) { semParametro.push(fe.nome); continue }
                if (pf && !num(fe.faturamento_total_leilao)) { semFaturamento.push(fe.nome); continue }
                // ATENÇÃO À ESCALA: acordo_pct_* são FRAÇÕES (0.03 = 3%), não
                // percentuais. Dividir por 100 aqui subestimava a comissão
                // esperada em 100 vezes — e o número passava despercebido por
                // ser "pequeno demais para alguém checar".
                valor += num(fe.faturamento_total_leilao) * pf + num(fe.vgv_total) * pv
                usados++
            }
            const lacunas: Lacuna[] = []
            if (semParametro.length) lacunas.push({
                motivo: 'fechamento sem acordo cadastrado (nem % de faturamento nem % de venda)',
                impacto: 'valor',
                linhas: semParametro.length, exemplos: semParametro.slice(0, 4),
            })
            if (semFaturamento.length) lacunas.push({
                motivo: 'acordo por faturamento, mas faturamento_total_leilao em branco',
                impacto: 'valor',
                linhas: semFaturamento.length, exemplos: semFaturamento.slice(0, 4),
            })
            return {
                valor: r2(valor),
                origens: [{ fonte: 'bula_leilao_fechamento', filtro: 'com parâmetros de acordo', linhas: usados }],
                cobertura: cobertura(fes.length, usados, lacunas),
                atualizado_em: maxData(fes.map(fe => fe.updated_at)),
            }
        },
    },

    // ═══ COMPROMISSOS PRÓXIMOS ═════════════════════════════════════════════
    {
        id: 'comissao.proximo_ciclo',
        titulo: 'Comissões a pagar no próximo vencimento',
        unidade: 'BRL',
        classe: 'primaria',
        formula: 'Σ devido dos CP abertos cuja descrição é de comissão, no menor vencimento futuro (ou hoje)',
        calcular: (f): ResultadoCalculo => {
            const comissoes = f.cp.filter(t => aberto(t) && /comiss/i.test(t.descricao))
            const futuras = comissoes.filter(t => t.vencimento >= f.hoje)
            const alvo = futuras.map(t => t.vencimento).sort()[0] || null
            const doCiclo = alvo ? futuras.filter(t => t.vencimento === alvo) : []
            const semDono = doCiclo.filter(t => !t.fornecedor_id || /a\s*definir/i.test(t.descricao))
            const lacunas: Lacuna[] = semDono.length ? [{
                motivo: 'comissão sem beneficiário definido — aparece no total mas ninguém sabe pagar a quem',
                impacto: 'atribuicao',
                linhas: semDono.length,
                valor: r2(semDono.reduce((s, t) => s + devido(t, 'valor_pago'), 0)),
                exemplos: semDono.slice(0, 4).map(t => t.descricao.slice(0, 44)),
            }] : []
            return {
                valor: r2(doCiclo.reduce((s, t) => s + devido(t, 'valor_pago'), 0)),
                origens: [{ fonte: 'erp_contas_pagar', filtro: `descrição ~ comissão, vencimento = ${alvo || '—'}`, linhas: doCiclo.length }],
                cobertura: cobreTudo(doCiclo.length, lacunas),
                atualizado_em: maxData(doCiclo.map(t => t.updated_at)),
                formula: `Σ devido dos CP de comissão com vencimento em ${alvo || '—'}`,
            }
        },
    },
    {
        id: 'fluxo.projetado',
        titulo: 'Caixa projetado em 30 dias',
        unidade: 'BRL',
        classe: 'derivada',
        formula: 'caixa.saldo + (CR a vencer nos próximos 30d) − (CP a vencer nos próximos 30d)',
        deriva_de: ['caixa.saldo'],
        calcular: (f, dep): ResultadoCalculo => {
            const ate = somaDias(f.hoje, 30)
            // Vencimento no passado NÃO é entrada dos próximos 30 dias. Somar o
            // vencido acumulado aqui era o jeito mais rápido de projetar caixa
            // que nunca chega — ele entra como parcela à parte, declarada.
            const naJanela = (t: { vencimento: string }) => t.vencimento >= f.hoje && t.vencimento <= ate
            const crJanela = f.cr.filter(t => aberto(t) && naoSubstituido(t) && naJanela(t))
            const cpJanela = f.cp.filter(t => aberto(t) && naoSubstituido(t) && naJanela(t))
            const crVencido = f.cr.filter(t => aberto(t) && naoSubstituido(t) && t.vencimento < f.hoje)
            const cpVencido = f.cp.filter(t => aberto(t) && naoSubstituido(t) && t.vencimento < f.hoje)
            const entra = crJanela.reduce((s, t) => s + devido(t, 'valor_recebido'), 0)
            const sai = cpJanela.reduce((s, t) => s + devido(t, 'valor_pago'), 0)
            const saldo = Number(dep['caixa.saldo']?.valor || 0)
            // Projeção só vale o que valem as promessas: CR sem data acordada
            // e estimativas não são dinheiro. Isso vira lacuna, não nota de rodapé.
            const frouxos = crJanela.filter(t =>
                compromissoFuturo(t) ||
                !((t.tags || []).includes('data-acordada') || /acordo|acordad/i.test(String(t.observacoes || ''))))
            const lacunas: Lacuna[] = frouxos.length ? [{
                motivo: 'entrada projetada sem data combinada (ou estimativa) — pode não cair na janela',
                impacto: 'interpretacao',
                linhas: frouxos.length,
                valor: r2(frouxos.reduce((s, t) => s + devido(t, 'valor_recebido'), 0)),
                exemplos: frouxos.slice(0, 4).map(t => t.descricao.slice(0, 44)),
            }] : []
            return {
                valor: r2(saldo + entra - sai),
                origens: [
                    { fonte: 'erp_contas_receber', filtro: `aberto, vencimento ≤ ${ate}`, linhas: crJanela.length },
                    { fonte: 'erp_contas_pagar', filtro: `aberto, vencimento ≤ ${ate}`, linhas: cpJanela.length },
                ],
                cobertura: cobreTudo(crJanela.length, lacunas),
                atualizado_em: dep['caixa.saldo']?.atualizado_em || null,
                formula: `${r2(saldo)} (caixa) + ${r2(entra)} (CR vencendo de ${f.hoje} a ${ate}) − ${r2(sai)} (CP no mesmo intervalo). Vencido acumulado fica FORA.`,
                composicao: [
                    { rotulo: 'caixa hoje', valor: r2(saldo) },
                    { rotulo: `a receber vencendo até ${ate}`, valor: r2(entra) },
                    { rotulo: `a pagar vencendo até ${ate}`, valor: r2(-sai) },
                    {
                        rotulo: 'fora da conta: vencido acumulado',
                        valor: r2(crVencido.reduce((s, t) => s + devido(t, 'valor_recebido'), 0)
                            - cpVencido.reduce((s, t) => s + devido(t, 'valor_pago'), 0)),
                        nota: 'não entra na projeção: já era para ter caído e não caiu',
                    },
                ],
            }
        },
    },
]

/**
 * O catálogo inteiro do ERP. Uma variável que não está aqui não pode ser
 * apresentada — é essa a regra que impede número solto de voltar a existir.
 */
export const CATALOGO: DefinicaoVariavel<Fatos>[] = [
    ...NUCLEO_FINANCEIRO,
    ...VARS_CONTABIL,
    ...VARS_CARTOES,
    ...VARS_FOLHA,
    ...VARS_LEILOES,
    ...VARS_CADASTROS,
    ...VARS_COBERTURA,
    ...VARS_CONVENCOES,
]

export const porId = (id: string): DefinicaoVariavel<Fatos> | undefined => CATALOGO.find(v => v.id === id)

/** Ordem topológica: insumo antes de quem o consome. */
export function ordemDeCalculo(defs: DefinicaoVariavel<Fatos>[] = CATALOGO): DefinicaoVariavel<Fatos>[] {
    const porIdMap = new Map(defs.map(d => [d.id, d]))
    const visto = new Set<string>()
    const saida: DefinicaoVariavel<Fatos>[] = []
    const visita = (d: DefinicaoVariavel<Fatos>, pilha: Set<string>) => {
        if (visto.has(d.id)) return
        if (pilha.has(d.id)) throw new Error(`ciclo de dependência em ${d.id}`)
        pilha.add(d.id)
        for (const dep of d.deriva_de || []) {
            const alvo = porIdMap.get(dep)
            if (alvo) visita(alvo, pilha)
        }
        pilha.delete(d.id)
        visto.add(d.id)
        saida.push(d)
    }
    for (const d of defs) visita(d, new Set())
    return saida
}

export type { VariavelResolvida }
