/**
 * COBERTURA — o universo é a AGENDA, não o que já foi lançado.
 *
 * Este domínio existe para consertar um defeito de fundo do resto do sistema:
 * todas as outras validações medem o que ESTÁ no ERP. Um leilão que a Bula
 * cobriu e que nunca virou fechamento é invisível para todas elas — o painel
 * diz "VGV com 90% de confiança" sobre um universo que ele não sabe se está
 * completo. Viés de sobrevivência puro.
 *
 * A agenda (`bula_leiloes`) sabe o que a Bula cobriu. Comparar a agenda com os
 * fechamentos transforma OMISSÃO em número visível — e omissão é a classe de
 * erro que ninguém enxerga sozinho, porque ela sempre chega pela boca de outra
 * pessoa ("e o leilão tal, cadê a minha comissão?").
 *
 * O encadeamento completo que precisa fechar:
 *
 *   leilão na agenda → fechamento → CR de comissão → recebimento
 *
 * Cada degrau perdido é receita que ninguém está cobrando.
 *
 * ── SOBRE O CASAMENTO ─────────────────────────────────────────────────────
 * Agenda e fechamento não têm chave em comum: o casamento é por data + nome,
 * ou seja, HEURÍSTICA. E heurística erra: a agenda traz "35º Leilão 4R" em
 * 09/05 e o fechamento "32° Leilão 4R – 09/05/2026" — mesmo evento, número
 * diferente, e um casamento ingênuo conta isso como buraco dos DOIS lados.
 *
 * Por isso o casamento tem três estados: `casado` (nome e data conferem),
 * `revisar` (o sistema não tem certeza) e `ausente` (não há fechamento nenhum
 * na janela). Só o `ausente` vira falha — "não tenho certeza" nunca é acusação.
 * A solução definitiva é `leilao_id` gravado no fechamento; enquanto ela não
 * existe, a validação `casamento_por_heuristica` mantém o custo dessa dívida
 * visível em vez de fingir precisão.
 */

import type { DefinicaoValidacao, DefinicaoVariavel, ResultadoCalculo } from '../tipos'
import { cobertura, cobreTudo } from '../tipos'
import { type Fatos, type Fechamento, type LeilaoAgenda, maxData, num, r2, vivo } from '../fatos'

const brl = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const lista = (xs: string[], n = 6) =>
    xs.slice(0, n).join('; ') + (xs.length > n ? ` … (+${xs.length - n})` : '')
const dia = (s: string | null | undefined) => String(s || '').slice(0, 10)
const diasEntre = (a: string, b: string) =>
    Math.round((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000)

/**
 * Prazo normal entre o pregão e o fechamento entrar no sistema. Dentro dele,
 * a ausência é trabalho em andamento; fora dele, é omissão.
 */
const CARENCIA_DIAS = 12

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Palavras que aparecem em quase todo nome de leilão e não distinguem nada. */
const VAZIAS = new Set([
    'leilao', 'leiloes', 'virtual', 'edicao', 'etapa', 'mega', 'evento', 'especial',
    'com', 'de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a', 'no', 'na', 'ano',
])
/** Ordinais ("32", "35", "1a") mentem: a agenda e o fechamento numeram diferente. */
const ehOrdinal = (w: string) => /^\d{1,3}[ºoa]?$/.test(w)

const tokens = (s: string) => new Set(
    norm(s).split(' ').filter(w => w.length >= 2 && !VAZIAS.has(w) && !ehOrdinal(w)))

export type EstadoCasamento = 'casado' | 'revisar' | 'ausente'

export type Casamento = {
    estado: EstadoCasamento
    leilao: LeilaoAgenda
    fechamento?: Fechamento
    score: number
    /** Por que ficou neste estado — vai inteiro para o painel. */
    motivo: string
}

/**
 * Casa cada leilão concluído da agenda com um fechamento.
 *
 * Duas regras aprendidas errando:
 *
 * 1. **Data igual sozinha não casa nada.** A primeira versão pontuava mesma
 *    data como evidência forte e acabou casando "LEILÃO KATAYAMA TRIOLOGIA"
 *    com "2° LEILÃO DNA NELORE MARCONDES" — dois leilões diferentes no mesmo
 *    dia. Sem ao menos uma palavra distintiva em comum, não há casamento.
 *
 * 2. **"Não achei" e "não tenho certeza" são coisas diferentes.** Se não existe
 *    nenhum fechamento na janela de datas, o leilão sumiu mesmo — isso é falha.
 *    Se existe um fechamento no dia mas o nome não confirma, o sistema não
 *    sabe: isso é revisão humana, não acusação. Tratar os dois como o mesmo
 *    caso produz alarme falso, e alarme falso mata o mecanismo.
 *
 * A atribuição é 1:1 e gulosa pelo melhor score global, para dois leilões não
 * reivindicarem o mesmo fechamento.
 */
export function casarAgendaComFechamentos(f: Fatos): Casamento[] {
    const concluidos = f.agenda.filter(l =>
        l.status === 'concluido' && dia(l.data) && dia(l.data) <= f.hoje)

    type Par = { l: LeilaoAgenda; fe: Fechamento; score: number; inter: number }
    const pares: Par[] = []

    for (const l of concluidos) {
        const d = dia(l.data)
        const t = tokens(l.nome)
        for (const fe of f.fechamentos) {
            const df = dia(fe.data)
            if (!df) continue
            const dist = Math.abs(diasEntre(df, d))
            if (dist > 4) continue
            const tf = tokens(fe.nome)
            let inter = 0
            for (const w of t) if (tf.has(w)) inter++
            if (inter === 0) continue // sem palavra em comum não é candidato
            const denom = Math.max(1, Math.min(t.size, tf.size))
            const score = (dist === 0 ? 2 : dist <= 1 ? 1 : 0) + 4 * (inter / denom)
            pares.push({ l, fe, score, inter })
        }
    }

    pares.sort((a, b) => b.score - a.score)
    const leilaoUsado = new Set<string>()
    const fechamentoUsado = new Set<string>()
    const escolhido = new Map<string, Par>()
    for (const p of pares) {
        if (leilaoUsado.has(p.l.id) || fechamentoUsado.has(p.fe.id)) continue
        leilaoUsado.add(p.l.id)
        fechamentoUsado.add(p.fe.id)
        escolhido.set(p.l.id, p)
    }

    /**
     * Para quem ficou sem par: existe algum fechamento na janela que AINDA não
     * pertence a outro leilão? Se todos os do dia já têm dono, o leilão está
     * mesmo sem fechamento — foi isso que quase escondeu o Kirz de 07/07, que
     * dividia data com outro pregão já casado.
     */
    const sobraFechamentoLivre = (l: LeilaoAgenda) => {
        const d = dia(l.data)
        return f.fechamentos.some(fe => {
            const df = dia(fe.data)
            if (!df || fechamentoUsado.has(fe.id)) return false
            return Math.abs(diasEntre(df, d)) <= 4
        })
    }

    return concluidos.map((l): Casamento => {
        const p = escolhido.get(l.id)
        if (p) {
            // 4.0 = data batendo com nome corroborando bem.
            return p.score >= 4
                ? { estado: 'casado', leilao: l, fechamento: p.fe, score: r2(p.score), motivo: 'nome e data conferem' }
                : {
                    estado: 'revisar', leilao: l, fechamento: p.fe, score: r2(p.score),
                    motivo: 'nome só confere em parte — conferir se é o mesmo evento',
                }
        }
        return sobraFechamentoLivre(l)
            ? {
                estado: 'revisar', leilao: l, score: 0,
                motivo: 'há fechamento sem dono na mesma data, mas com nome que não confirma',
            }
            : {
                estado: 'ausente', leilao: l, score: 0,
                motivo: 'nenhum fechamento disponível em ±4 dias da data do pregão',
            }
    })
}

/** Fechamentos do ano que nenhum leilão da agenda reivindicou. */
export function fechamentosForaDaAgenda(f: Fatos, casamentos: Casamento[]): Fechamento[] {
    const reivindicados = new Set(
        casamentos.map(c => c.fechamento?.id).filter(Boolean) as string[])
    const ano = f.hoje.slice(0, 4)
    return f.fechamentos.filter(fe => dia(fe.data).slice(0, 4) === ano && !reivindicados.has(fe.id))
}

const foraDaCarencia = (f: Fatos, c: Casamento) =>
    diasEntre(f.hoje, dia(c.leilao.data)) > CARENCIA_DIAS

export const VARIAVEIS: DefinicaoVariavel<Fatos>[] = [
    {
        id: 'agenda.leiloes_realizados',
        titulo: 'Leilões que a Bula cobriu (agenda, já ocorridos)',
        unidade: 'contagem',
        classe: 'primaria',
        formula: 'nº de registros em bula_leiloes com status = concluído e data ≤ hoje — este é o UNIVERSO real',
        calcular: (f): ResultadoCalculo => {
            const cs = casarAgendaComFechamentos(f)
            return {
                valor: cs.length,
                origens: [{ fonte: 'bula_leiloes', filtro: 'status = concluido, data ≤ hoje', linhas: cs.length }],
                cobertura: cobreTudo(cs.length),
                atualizado_em: maxData(cs.map(c => dia(c.leilao.data))),
                composicao: [
                    { rotulo: 'com fechamento', valor: cs.filter(c => c.estado === 'casado').length },
                    { rotulo: 'a revisar', valor: cs.filter(c => c.estado === 'revisar').length, nota: 'o sistema não tem certeza de qual fechamento é' },
                    { rotulo: 'sem fechamento', valor: cs.filter(c => c.estado === 'ausente').length, nota: 'não virou VGV, comissão nem cobrança' },
                ],
            }
        },
    },
    {
        id: 'cobertura.fechamento',
        titulo: 'Leilões cobertos que viraram fechamento',
        unidade: 'percentual',
        classe: 'derivada',
        formula: 'nº de leilões concluídos (fora da carência) com fechamento ÷ total de leilões concluídos fora da carência',
        calcular: (f): ResultadoCalculo => {
            const cs = casarAgendaComFechamentos(f).filter(c => foraDaCarencia(f, c))
            const ausentes = cs.filter(c => c.estado === 'ausente')
            const ambiguos = cs.filter(c => c.estado === 'revisar')
            const com = cs.length - ausentes.length
            return {
                valor: cs.length ? r2((com / cs.length) * 100) : null,
                origens: [
                    { fonte: 'bula_leiloes', filtro: `concluídos há mais de ${CARENCIA_DIAS} dias`, linhas: cs.length },
                    { fonte: 'bula_leilao_fechamento', filtro: 'casados por data + nome', linhas: com },
                ],
                cobertura: cobreTudo(cs.length, [
                    ...(ausentes.length ? [{
                        motivo: 'leilão coberto que nunca virou fechamento — some de todo o resto do ERP',
                        impacto: 'valor' as const,
                        linhas: ausentes.length,
                        exemplos: ausentes.slice(0, 4).map(c =>
                            `${dia(c.leilao.data)} ${c.leilao.nome} (${diasEntre(f.hoje, dia(c.leilao.data))}d)`),
                    }] : []),
                    ...(ambiguos.length ? [{
                        motivo: 'casamento incerto — o sistema não sabe se virou fechamento; falta chave estável',
                        impacto: 'atribuicao' as const,
                        linhas: ambiguos.length,
                    }] : []),
                ]),
                atualizado_em: maxData(cs.map(c => dia(c.leilao.data))),
                composicao: [
                    { rotulo: 'com fechamento', valor: com },
                    { rotulo: 'sem fechamento', valor: ausentes.length },
                ],
            }
        },
    },
    {
        id: 'cobertura.cadeia_operacional',
        titulo: 'Cadeia leilão → fechamento → cobrança',
        unidade: 'percentual',
        classe: 'derivada',
        formula: 'nº de leilões concluídos que chegaram até ter CR de comissão ÷ total de leilões concluídos fora da carência',
        deriva_de: ['cobertura.fechamento'],
        calcular: (f): ResultadoCalculo => {
            const cs = casarAgendaComFechamentos(f).filter(c => foraDaCarencia(f, c))
            const comCr = new Set(f.cr.filter(vivo).map(t => t.fechamento_id).filter(Boolean) as string[])
            const chegaram = cs.filter(c => c.estado !== 'ausente' && comCr.has(c.fechamento!.id))
            const paramNoFechamento = cs.filter(c =>
                c.estado !== 'ausente' && !comCr.has(c.fechamento!.id))
            const semFechamento = cs.filter(c => c.estado === 'ausente')
            return {
                valor: cs.length ? r2((chegaram.length / cs.length) * 100) : null,
                origens: [
                    { fonte: 'bula_leiloes', filtro: 'concluídos fora da carência', linhas: cs.length },
                    { fonte: 'erp_contas_receber', filtro: 'vivos com fechamento_id', linhas: comCr.size },
                ],
                cobertura: cobreTudo(cs.length, (semFechamento.length + paramNoFechamento.length) ? [{
                    motivo: 'leilão coberto que não chegou a virar cobrança',
                    impacto: 'valor',
                    linhas: semFechamento.length + paramNoFechamento.length,
                }] : []),
                atualizado_em: maxData(cs.map(c => dia(c.leilao.data))),
                composicao: [
                    { rotulo: 'chegaram a CR de comissão', valor: chegaram.length },
                    { rotulo: 'pararam no fechamento', valor: paramNoFechamento.length, nota: 'apurado, nunca cobrado' },
                    { rotulo: 'nem viraram fechamento', valor: semFechamento.length, nota: 'invisíveis para o ERP inteiro' },
                ],
            }
        },
    },
]

export const VALIDACOES: DefinicaoValidacao<Fatos>[] = [
    {
        id: 'leilao_concluido_sem_fechamento',
        titulo: 'todo leilão coberto pela Bula virou fechamento',
        severidade: 'fail',
        // Alcance deliberadamente contido: um leilão faltando em janeiro
        // invalida os totais do ANO, não o VGV do mês corrente nem a comissão
        // do próximo ciclo. Contaminar demais pinta o painel inteiro de
        // vermelho e ensina as pessoas a ignorá-lo.
        afeta: [
            'agenda.leiloes_realizados', 'cobertura.fechamento', 'cobertura.cadeia_operacional',
            'leilao.vgv_ano', 'leilao.quantidade_ano', 'leilao.ticket_medio_lote', 'receita.esperada',
        ],
        checar: (f) => {
            const ausentes = casarAgendaComFechamentos(f)
                .filter(c => c.estado === 'ausente' && foraDaCarencia(f, c))
            if (!ausentes.length) return null
            const ord = ausentes
                .map(c => ({ c, dias: diasEntre(f.hoje, dia(c.leilao.data)) }))
                .sort((a, b) => b.dias - a.dias)
            return {
                detalhe: `${ausentes.length} leilão(ões) concluído(s) na agenda sem nenhum fechamento no ERP — ` +
                    `não viraram VGV, comissão nem cobrança, e são invisíveis para todas as outras validações: ` +
                    lista(ord.map(x =>
                        `${dia(x.c.leilao.data)} ${x.c.leilao.nome.slice(0, 40)} (${x.dias}d, ${x.c.leilao.leiloeira || 'leiloeira ?'})`)),
            }
        },
    },
    {
        id: 'fechamento_fora_da_agenda',
        titulo: 'todo fechamento corresponde a um leilão da agenda',
        severidade: 'warn',
        afeta: ['agenda.leiloes_realizados', 'cobertura.fechamento', 'leilao.quantidade_ano'],
        checar: (f) => {
            const cs = casarAgendaComFechamentos(f)
            const fora = fechamentosForaDaAgenda(f, cs)
            if (!fora.length) return null
            return {
                detalhe: `${fora.length} fechamento(s) de ${f.hoje.slice(0, 4)} sem leilão correspondente na agenda ` +
                    `(${brl(fora.reduce((s, fe) => s + num(fe.vgv_total), 0))} de VGV) — ou a agenda está incompleta, ` +
                    `ou o nome divergiu a ponto de o casamento falhar: ` +
                    lista(fora.map(fe => `${dia(fe.data)} ${fe.nome.slice(0, 42)}`)),
            }
        },
    },
    {
        id: 'casamento_por_heuristica',
        titulo: 'agenda e fechamento se ligam por chave, não por adivinhação de nome',
        severidade: 'warn',
        afeta: ['cobertura.fechamento', 'cobertura.cadeia_operacional', 'agenda.leiloes_realizados'],
        checar: (f) => {
            const cs = casarAgendaComFechamentos(f)
            const ambiguos = cs.filter(c => c.estado === 'revisar')
            const total = cs.length
            if (!ambiguos.length) return null
            return {
                detalhe: `${ambiguos.length} de ${total} leilão(ões) da agenda não puderam ser ligados a um ` +
                    `fechamento com certeza. Não existe chave entre as duas tabelas — o vínculo é adivinhado por ` +
                    `nome e data, e toda medição de cobertura carrega esse erro. ` +
                    `Correção definitiva: gravar leilao_id no fechamento. Casos: ` + lista(ambiguos.map(c =>
                        `${dia(c.leilao.data)} "${c.leilao.nome.slice(0, 30)}" → ` +
                        (c.fechamento ? `"${c.fechamento.nome.slice(0, 30)}"` : 'nenhum candidato') +
                        ` (${c.motivo})`)),
            }
        },
    },
    {
        id: 'fechamento_sem_cobranca',
        titulo: 'fechamento com receita apurada virou CR de cobrança',
        severidade: 'fail',
        afeta: ['cobertura.cadeia_operacional', 'receber.contratado'],
        checar: (f) => {
            const comCr = new Set(f.cr.filter(vivo).map(t => t.fechamento_id).filter(Boolean) as string[])
            const orfaos = f.fechamentos.filter(fe =>
                num(fe.receita_bula) > 0 &&
                !comCr.has(fe.id) &&
                diasEntre(f.hoje, dia(fe.data)) > CARENCIA_DIAS)
            if (!orfaos.length) return null
            const total = orfaos.reduce((s, fe) => s + num(fe.receita_bula), 0)
            return {
                detalhe: `${orfaos.length} fechamento(s) com receita apurada e nenhum CR — ${brl(total)} que ` +
                    `ninguém está cobrando: ` +
                    lista(orfaos.map(fe => `${dia(fe.data)} ${fe.nome.slice(0, 38)} (${brl(num(fe.receita_bula))})`)),
            }
        },
    },
    {
        id: 'agenda_leilao_passado_nao_concluido',
        titulo: 'leilão com data passada não fica pendurado como confirmado',
        severidade: 'warn',
        afeta: ['agenda.leiloes_realizados', 'cobertura.fechamento'],
        checar: (f) => {
            const pendurados = f.agenda.filter(l =>
                l.status !== 'concluido' && l.status !== 'cancelado' &&
                dia(l.data) && diasEntre(f.hoje, dia(l.data)) > CARENCIA_DIAS)
            if (!pendurados.length) return null
            return {
                detalhe: `${pendurados.length} leilão(ões) com data passada e status "${pendurados[0].status}" — ` +
                    `se aconteceram, estão fora do universo medido; se não, deviam estar cancelados: ` +
                    lista(pendurados.map(l => `${dia(l.data)} ${l.nome.slice(0, 40)} [${l.status}]`)),
            }
        },
    },
]
