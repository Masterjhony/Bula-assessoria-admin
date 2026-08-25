/**
 * O MOTOR. Uma foto dos fatos → validações cruzadas → variáveis carimbadas.
 *
 * Ponto único de entrada do sistema de verdade: a CLI, a API e os geradores de
 * relatório chamam `apurarVerdade()`. Ninguém recalcula nada por fora — é o que
 * garante que a tela, o PDF e a mensagem do WhatsApp digam o mesmo número.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { CATALOGO, ordemDeCalculo } from './catalogo'
import { calculaConfianca, rotuloConfianca } from './confianca'
import { type Fatos, carregarFatos } from './fatos'
import { VALIDACOES } from './validacoes'
import {
    CONFIANCA_MINIMA_PUBLICACAO, type Conflito, type DefinicaoVariavel,
    type RelatorioVerdade, type VariavelResolvida, cobreTudo,
} from './tipos'

export async function apurarVerdade(
    sb: SupabaseClient,
    opts: { hoje?: string; somente?: string[] } = {},
): Promise<RelatorioVerdade> {
    const fatos = await carregarFatos(sb, { hoje: opts.hoje })
    return apurarSobreFatos(fatos, opts)
}

/** Mesma apuração, sobre uma foto já carregada (testes e reuso). */
export async function apurarSobreFatos(
    fatos: Fatos,
    opts: { somente?: string[] } = {},
): Promise<RelatorioVerdade> {
    // ── 1. validações cruzadas ─────────────────────────────────────────────
    const conflitos: Conflito[] = []
    const validacoes: RelatorioVerdade['validacoes'] = []
    for (const v of VALIDACOES) {
        let achado: { detalhe: string; severidade?: import('./tipos').Severidade } | null = null
        try {
            achado = await v.checar(fatos)
        } catch (e) {
            achado = { detalhe: `erro ao checar: ${(e as Error).message}`, severidade: 'fail' }
        }
        const severidade = achado?.severidade || v.severidade
        validacoes.push({
            id: v.id, titulo: v.titulo, severidade,
            passou: !achado, detalhe: achado?.detalhe || null, afeta: v.afeta,
        })
        if (achado) {
            conflitos.push({ id: v.id, titulo: v.titulo, severidade, detalhe: achado.detalhe, afeta: v.afeta })
        }
    }

    // ── 2. variáveis, em ordem de dependência ──────────────────────────────
    const alvo = opts.somente?.length
        ? CATALOGO.filter(d => opts.somente!.includes(d.id))
        : CATALOGO
    const ordem = ordemDeCalculo(alvo.length ? CATALOGO : CATALOGO)
    const resolvidas = new Map<string, VariavelResolvida>()

    for (const def of ordem) {
        resolvidas.set(def.id, await resolveUma(def, fatos, resolvidas, conflitos))
    }

    const variaveis = (opts.somente?.length
        ? opts.somente.map(id => resolvidas.get(id)).filter(Boolean) as VariavelResolvida[]
        : [...resolvidas.values()])

    const publicaveis = variaveis.filter(v => v.publicavel).length
    const notas = variaveis.map(v => v.confianca.nota)

    return {
        gerado_em: new Date().toISOString(),
        foto_em: fatos.foto_em,
        variaveis,
        validacoes,
        resumo: {
            variaveis: variaveis.length,
            publicaveis,
            bloqueadas: variaveis.length - publicaveis,
            confianca_media: notas.length ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10 : 0,
            fails: validacoes.filter(v => !v.passou && v.severidade === 'fail').length,
            warns: validacoes.filter(v => !v.passou && v.severidade === 'warn').length,
        },
    }
}

async function resolveUma(
    def: DefinicaoVariavel<Fatos>,
    fatos: Fatos,
    resolvidas: Map<string, VariavelResolvida>,
    conflitos: Conflito[],
): Promise<VariavelResolvida> {
    const meus = conflitos.filter(c => c.afeta.includes(def.id))
    const deps: Record<string, VariavelResolvida> = {}
    for (const id of def.deriva_de || []) {
        const r = resolvidas.get(id)
        if (r) deps[id] = r
    }

    const base = {
        id: def.id,
        titulo: def.titulo,
        unidade: def.unidade,
        classe: def.classe,
        deriva_de: def.deriva_de || [],
        composicao: [],
        conflitos: meus,
    }

    let calc
    try {
        calc = await def.calcular(fatos, deps)
    } catch (e) {
        // Variável que quebra não desaparece da tela — ela se declara quebrada.
        return {
            ...base,
            valor: null,
            formula: def.formula,
            origens: [],
            cobertura: cobreTudo(0),
            atualizado_em: null,
            confianca: { nota: 0, motivos: [{ motivo: 'cálculo falhou', delta: -100 }] },
            publicavel: false,
            erro: (e as Error).message,
        }
    }

    const notasInsumos = (def.deriva_de || [])
        .map(id => resolvidas.get(id)?.confianca.nota)
        .filter((n): n is number => typeof n === 'number')

    // Peso de cada insumo na soma: quando a variável declara composição, cada
    // parcela vale pelo tamanho dela, não por existir.
    const pesosInsumos = (def.deriva_de || []).map(id => {
        const parcela = (calc.composicao || []).find(c => c.rotulo && resolvidas.get(id)
            && Math.abs(c.valor - Number(resolvidas.get(id)!.valor || 0)) < 0.005)
        return parcela ? Math.abs(parcela.valor) : Math.abs(Number(resolvidas.get(id)?.valor || 0))
    })

    const confianca = calculaConfianca({
        classe: def.classe,
        cobertura: calc.cobertura,
        conflitos: meus,
        atualizado_em: calc.atualizado_em ?? null,
        notasInsumos,
        pesosInsumos,
        heranca: def.heranca,
        hoje: fatos.hoje,
    })

    return {
        ...base,
        valor: calc.valor,
        composicao: calc.composicao || [],
        formula: calc.formula || def.formula,
        origens: calc.origens,
        cobertura: calc.cobertura,
        atualizado_em: calc.atualizado_em ?? null,
        confianca,
        publicavel: confianca.nota >= CONFIANCA_MINIMA_PUBLICACAO && !meus.some(c => c.severidade === 'fail'),
    }
}

// ---------------------------------------------------------------------------
// Gate de publicação — o que impede número ruim de virar PDF
// ---------------------------------------------------------------------------

export class ValorNaoPublicavel extends Error {
    constructor(public variavel: VariavelResolvida) {
        super(
            `"${variavel.titulo}" não é publicável (confiança ${variavel.confianca.nota}, ` +
            `mínimo ${CONFIANCA_MINIMA_PUBLICACAO}). ` +
            (variavel.conflitos.length
                ? `Conflitos: ${variavel.conflitos.map(c => c.titulo).join('; ')}. `
                : '') +
            (variavel.cobertura.lacunas.length
                ? `Lacunas: ${variavel.cobertura.lacunas.map(l => `${l.motivo} (${l.linhas})`).join('; ')}.`
                : ''),
        )
        this.name = 'ValorNaoPublicavel'
    }
}

/**
 * Usado pelos geradores de relatório: devolve o valor ou explode.
 * `forcar: true` deixa passar, mas devolve o carimbo para o relatório imprimir
 * a ressalva — nunca some com o aviso em silêncio.
 */
export function exigePublicavel(
    rel: RelatorioVerdade,
    id: string,
    opts: { forcar?: boolean } = {},
): VariavelResolvida {
    const v = rel.variaveis.find(x => x.id === id)
    if (!v) throw new Error(`variável desconhecida: ${id} — declare em src/lib/verdade/catalogo.ts`)
    if (!v.publicavel && !opts.forcar) throw new ValorNaoPublicavel(v)
    return v
}

export { rotuloConfianca, CONFIANCA_MINIMA_PUBLICACAO }
export type { RelatorioVerdade, VariavelResolvida }
