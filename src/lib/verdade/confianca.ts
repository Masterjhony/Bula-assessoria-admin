/**
 * A fórmula da confiança. Determinística e decomposta — quando o card diz 62%,
 * ele diz também quais pontos foram perdidos e onde ir consertar.
 *
 * Não é chute nem "score de ML": é uma conta de quatro parcelas que qualquer
 * um pode refazer.
 *
 *   nota = teto(classe) × cobertura − penalidade(conflitos) − penalidade(idade)
 *
 * As constantes vivem aqui e em lugar nenhum mais.
 */

import type { ClasseFonte, Confianca, Conflito, Cobertura, MotivoConfianca } from './tipos'

/** Teto por classe de fonte. Uma derivada nunca vale mais que o pior insumo. */
const TETO: Record<ClasseFonte, number> = {
    primaria_conciliada: 100, // batida contra o extrato do banco
    primaria: 90,             // registrada no sistema, sem confirmação externa
    derivada: 95,             // ainda será limitada pelo pior insumo
    declarada: 80,            // acordo/cadastro digitado por gente
    estimada: 60,             // projeção; não aconteceu
}

const PENALIDADE_FAIL = 40
const PENALIDADE_WARN = 8
/** Teto do acumulado de alertas — ver comentário no uso. */
const PENALIDADE_WARN_MAX = 24
/**
 * Lacuna que não mexe no valor não pode zerar o número — mas também não pode
 * passar batida. "Vencido" que ninguém combinou é o caso que mais custou caro:
 * o valor está certo, a leitura é que induz ao erro.
 */
const PENALIDADE_INTERPRETACAO = 14
const PENALIDADE_ATRIBUICAO = 5
/** A partir de quantos dias sem fato novo a variável começa a envelhecer. */
const DIAS_FRESCOR = 7
const PENALIDADE_POR_DIA_VELHO = 1.5
const PENALIDADE_IDADE_MAX = 25

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n))
const r1 = (n: number) => Math.round(n * 10) / 10

export function calculaConfianca(opts: {
    classe: ClasseFonte
    cobertura: Cobertura
    conflitos: Conflito[]
    atualizado_em?: string | null
    /** Notas das variáveis usadas como insumo. */
    notasInsumos?: number[]
    /** Peso de cada insumo na soma, na mesma ordem — usado por heranca 'ponderada'. */
    pesosInsumos?: number[]
    heranca?: 'pior' | 'ponderada'
    hoje?: string
}): Confianca {
    const motivos: MotivoConfianca[] = []
    const teto = TETO[opts.classe]
    let nota = teto
    motivos.push({ motivo: `fonte ${opts.classe.replace(/_/g, ' ')}`, delta: teto - 100 })

    // 1. Cobertura — o número responde por quanto da realidade?
    const frac = Number.isFinite(opts.cobertura.fracao) ? opts.cobertura.fracao : 1
    if (frac < 1) {
        const antes = nota
        nota = nota * frac
        const faltando = opts.cobertura.universo - opts.cobertura.usados
        motivos.push({
            motivo: `cobertura ${(frac * 100).toFixed(1)}% — ${faltando} de ${opts.cobertura.universo} fato(s) fora da conta`,
            delta: r1(nota - antes),
        })
    }

    // 1b. Lacunas que não mexem no valor: o número está certo, a leitura não.
    const porImpacto = (imp: 'interpretacao' | 'atribuicao') =>
        (opts.cobertura.lacunas || []).filter(l => l.impacto === imp)
    const interp = porImpacto('interpretacao')
    if (interp.length) {
        const p = PENALIDADE_INTERPRETACAO
        nota -= p
        motivos.push({ motivo: `valor correto, rótulo enganoso: ${interp[0].motivo}`, delta: -p })
    }
    const atrib = porImpacto('atribuicao')
    if (atrib.length) {
        const p = PENALIDADE_ATRIBUICAO
        nota -= p
        motivos.push({ motivo: `falta detalhe/dono em ${atrib.reduce((s, l) => s + l.linhas, 0)} linha(s)`, delta: -p })
    }

    // 2. Insumos — derivada não pode ser mais confiável que a pior parcela.
    const insumos = opts.notasInsumos || []
    if (insumos.length) {
        const heranca = opts.heranca || 'pior'
        const pesos = opts.pesosInsumos || []
        const somaPesos = pesos.reduce((s, w) => s + Math.abs(w), 0)
        if (heranca === 'ponderada' && pesos.length === insumos.length && somaPesos > 0) {
            // Soma de parcelas conhecidas: o total é exato, sua qualidade é a
            // média das partes no peso de cada uma.
            const media = insumos.reduce((s, n, i) => s + n * (Math.abs(pesos[i]) / somaPesos), 0)
            if (media < nota) {
                const antes = nota
                nota = media
                const maior = pesos.map((w, i) => ({ w: Math.abs(w), i }))
                    .sort((x, y) => y.w - x.w)[0]
                motivos.push({
                    motivo: `média das parcelas no peso de cada uma — ${(100 * Math.abs(pesos[maior.i]) / somaPesos).toFixed(0)}% do total vem da parcela de nota ${r1(insumos[maior.i])}`,
                    delta: r1(nota - antes),
                })
            }
        } else {
            const pior = Math.min(...insumos)
            if (pior < nota) {
                const antes = nota
                nota = pior
                motivos.push({ motivo: `limitada pelo pior insumo (${r1(pior)})`, delta: r1(nota - antes) })
            }
        }
    }

    // 3. Conflitos — validação cruzada que não fecha.
    const fails = opts.conflitos.filter(c => c.severidade === 'fail')
    const warns = opts.conflitos.filter(c => c.severidade === 'warn')
    if (fails.length) {
        const p = PENALIDADE_FAIL * fails.length
        nota -= p
        motivos.push({ motivo: `${fails.length} validação(ões) cruzada(s) FALHANDO`, delta: -p })
    }
    if (warns.length) {
        // Teto: alerta não é erro. Um valor exato cercado de ressalvas cai para
        // "confira antes de usar", nunca para zero — senão o painel inteiro
        // fica vermelho e as pessoas param de olhar, que é o fracasso clássico
        // deste tipo de sistema.
        const p = Math.min(PENALIDADE_WARN_MAX, PENALIDADE_WARN * warns.length)
        nota -= p
        motivos.push({
            motivo: `${warns.length} alerta(s) de consistência` +
                (PENALIDADE_WARN * warns.length > PENALIDADE_WARN_MAX ? ' (penalidade no teto)' : ''),
            delta: -p,
        })
    }

    // 4. Frescor — fato velho vale menos que fato de hoje.
    if (opts.atualizado_em) {
        const hoje = opts.hoje || new Date().toISOString().slice(0, 10)
        const dias = Math.round(
            (new Date(hoje + 'T00:00:00').getTime() - new Date(opts.atualizado_em + 'T00:00:00').getTime()) / 86400000,
        )
        if (dias > DIAS_FRESCOR) {
            const p = Math.min(PENALIDADE_IDADE_MAX, (dias - DIAS_FRESCOR) * PENALIDADE_POR_DIA_VELHO)
            nota -= p
            motivos.push({ motivo: `fato mais novo tem ${dias} dias`, delta: -r1(p) })
        }
    }

    return { nota: r1(clamp(nota)), motivos }
}

/** Rótulo curto para a tela — a mesma escala em todo lugar. */
export function rotuloConfianca(nota: number): 'alta' | 'media' | 'baixa' | 'nao_publicar' {
    if (nota >= 85) return 'alta'
    if (nota >= 70) return 'media'
    if (nota >= 50) return 'baixa'
    return 'nao_publicar'
}
