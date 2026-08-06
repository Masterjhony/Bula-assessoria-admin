/**
 * HastaPro (Firebird do fornecedor) — SOMENTE LEITURA, consultas PRÉ-DEFINIDAS.
 *
 * É a fonte-de-verdade dos leilões/financeiro do sistema HastaPró que a equipe
 * usa na pista. Regras inegociáveis:
 *  - NUNCA escrever (INSERT/UPDATE/DELETE corromperia o sistema do fornecedor).
 *  - NUNCA SQL livre vindo do modelo — só as consultas fixas deste arquivo.
 *  - NUNCA tocar na tabela FILIAIS (tem chaves/senhas do fornecedor).
 *
 * Semântica (validada nas conciliações de jul/2026):
 *  - FIL_CODIGO '2' = Bula Assessoria (cobertura da assessoria — é o escopo
 *    padrão); '01' = Bula Remates (leilão INTEIRO da leiloeira — superestima,
 *    não usar como faturamento da Bula).
 *  - LOT_TOTAL = LOT_LANCE × 30 = VGV (mesma convenção do web-bula).
 *  - FIN_TITULOS.TIT_TIPO: 'D' = a pagar, 'R' = a receber; TIT_STATUS
 *    'ABERTO' | 'PAGO'. Receita oficial continua sendo a dos fechamentos.
 *
 * Credenciais SÓ por env: HASTAPRO_HOST/PORT/DATABASE/USER/PASSWORD.
 * Charset do banco é WIN1252 → strings chegam como Buffer e são decodificadas
 * como latin1 (senão nomes acentuados viram mojibake).
 */

import * as FirebirdNS from 'node-firebird'
import type { FirebirdDb } from 'node-firebird'

// node-firebird é CJS; dependendo do interop o objeto vem no default ou no
// namespace — cobre os dois.
const Firebird = ((FirebirdNS as { default?: unknown }).default ?? FirebirdNS) as typeof FirebirdNS

const ATTACH_TIMEOUT_MS = 15_000
const QUERY_TIMEOUT_MS = 20_000
const MAX_LINHAS = 50

export function isHastaproConfigured(): boolean {
    return !!(process.env.HASTAPRO_HOST && process.env.HASTAPRO_DATABASE && process.env.HASTAPRO_PASSWORD)
}

function options() {
    return {
        host: process.env.HASTAPRO_HOST!,
        port: Number(process.env.HASTAPRO_PORT || 3050),
        database: process.env.HASTAPRO_DATABASE!,
        user: process.env.HASTAPRO_USER || 'SYSDBA',
        password: process.env.HASTAPRO_PASSWORD!,
        encoding: 'NONE',
    }
}

function withTimeout<T>(p: Promise<T>, ms: number, rotulo: string): Promise<T> {
    return Promise.race([
        p,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${rotulo}: timeout ${ms}ms`)), ms)),
    ])
}

function attach(): Promise<FirebirdDb> {
    return withTimeout(new Promise((res, rej) => {
        Firebird.attach(options(), (err, db) => (err ? rej(err) : res(db)))
    }), ATTACH_TIMEOUT_MS, 'hastapro attach')
}

function query(db: FirebirdDb, sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
    return withTimeout(new Promise((res, rej) => {
        db.query(sql, params, (err, rows) => (err ? rej(err) : res(rows ?? [])))
    }), QUERY_TIMEOUT_MS, 'hastapro query')
}

/** Buffer (WIN1252) → string legível; recursivo em linhas/objetos. */
function decode(v: unknown): unknown {
    if (Buffer.isBuffer(v)) return v.toString('latin1').trim()
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    if (Array.isArray(v)) return v.map(decode)
    if (v && typeof v === 'object') {
        const out: Record<string, unknown> = {}
        for (const [k, val] of Object.entries(v)) out[k] = decode(val)
        return out
    }
    return v
}

export type HastaproConsulta =
    | 'resumo' | 'leiloes' | 'vendas'
    | 'contas_pagar' | 'contas_receber' | 'movimento' | 'cliente'

export interface HastaproParams {
    de?: string | null
    ate?: string | null
    termo?: string | null
    /** '2' = Bula Assessoria (default) | '01' = Bula Remates (leilão inteiro). */
    fil?: string | null
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export async function hastaproConsulta(consulta: HastaproConsulta, p: HastaproParams = {}): Promise<unknown> {
    if (!isHastaproConfigured()) return { error: 'hastapro_nao_configurado' }
    const fil = p.fil === '01' ? '01' : '2'
    const de = p.de || iso(new Date(Date.now() - 60 * 86400_000))
    const ate = p.ate || iso(new Date(Date.now() + 120 * 86400_000))
    const termo = (p.termo ?? '').trim().toUpperCase()

    const db = await attach()
    try {
        switch (consulta) {
            case 'resumo': {
                const [vgv, cp, cr] = await Promise.all([
                    query(db, `SELECT COUNT(*) AS LOTES, SUM(LOT_QTD) AS ANIMAIS, SUM(LOT_TOTAL) AS VGV
                               FROM LOTES WHERE FIL_CODIGO = ? AND LOT_DATA_VENDA >= ? AND LOT_DATA_VENDA < ?`, [fil, de, ate]),
                    query(db, `SELECT COUNT(*) AS N, SUM(TIT_VALOR) AS TOTAL FROM FIN_TITULOS
                               WHERE FIL_CODIGO = ? AND TIT_TIPO = 'D' AND TIT_STATUS = 'ABERTO'`, [fil]),
                    query(db, `SELECT COUNT(*) AS N, SUM(TIT_VALOR) AS TOTAL FROM FIN_TITULOS
                               WHERE FIL_CODIGO = ? AND TIT_TIPO = 'R' AND TIT_STATUS = 'ABERTO'`, [fil]),
                ])
                return decode({
                    fil, periodo_vendas: { de, ate },
                    vendas: vgv[0],
                    contas_pagar_abertas: cp[0],
                    contas_receber_abertas: cr[0],
                    obs: 'VGV = LOT_TOTAL (lance x 30). Receita oficial da Bula = fechamentos do web-bula.',
                })
            }
            case 'leiloes': {
                const rows = await query(db, `
                    SELECT FIRST ${MAX_LINHAS} L.LEI_NOME, L.LEI_LOCAL, L.LEI_UF, L.LEI_DATA, L.LEI_DATA_TERMINO,
                           COUNT(T.LOT_LOTE) AS LOTES_VENDIDOS, SUM(T.LOT_TOTAL) AS VGV
                    FROM LEILAO L
                    LEFT JOIN LOTES T ON T.LEI_CODIGO = L.LEI_CODIGO AND T.FIL_CODIGO = L.FIL_CODIGO
                    WHERE L.FIL_CODIGO = ? AND L.LEI_DATA >= ? AND L.LEI_DATA < ?
                    GROUP BY L.LEI_NOME, L.LEI_LOCAL, L.LEI_UF, L.LEI_DATA, L.LEI_DATA_TERMINO
                    ORDER BY L.LEI_DATA DESC`, [fil, de, ate])
                return decode({ fil, de, ate, leiloes: rows })
            }
            case 'vendas': {
                const rows = await query(db, `
                    SELECT FIRST ${MAX_LINHAS} L.LEI_NOME, T.LOT_LOTE, T.LOT_QTD, T.LOT_LANCE, T.LOT_TOTAL, T.LOT_DATA_VENDA
                    FROM LOTES T
                    JOIN LEILAO L ON L.LEI_CODIGO = T.LEI_CODIGO AND L.FIL_CODIGO = T.FIL_CODIGO
                    WHERE T.FIL_CODIGO = ? AND T.LOT_DATA_VENDA >= ? AND T.LOT_DATA_VENDA < ?
                    ORDER BY T.LOT_DATA_VENDA DESC`, [fil, de, ate])
                return decode({ fil, de, ate, vendas: rows, obs: 'LOT_TOTAL = VGV do lote (lance x 30)' })
            }
            case 'contas_pagar':
            case 'contas_receber': {
                const tipo = consulta === 'contas_pagar' ? 'D' : 'R'
                const rows = await query(db, `
                    SELECT FIRST ${MAX_LINHAS} TIT_DESCRICAO, TIT_VALOR, TIT_VALOR_REAL, TIT_DT_VENCTO, TIT_STATUS,
                           TIT_PARCELA, TIT_PARCELAS_TOTAL
                    FROM FIN_TITULOS
                    WHERE FIL_CODIGO = ? AND TIT_TIPO = ? AND TIT_STATUS = 'ABERTO'
                    ORDER BY TIT_DT_VENCTO`, [fil, tipo])
                const total = await query(db, `
                    SELECT COUNT(*) AS N, SUM(TIT_VALOR) AS TOTAL FROM FIN_TITULOS
                    WHERE FIL_CODIGO = ? AND TIT_TIPO = ? AND TIT_STATUS = 'ABERTO'`, [fil, tipo])
                return decode({ fil, abertos: rows, totais: total[0] })
            }
            case 'movimento': {
                const rows = await query(db, `
                    SELECT FIRST ${MAX_LINHAS} M.MOV_PAGODIA, M.MOV_TIPO, M.MOV_VALOR, M.MOV_JUROS, M.MOV_DESCONTO,
                           M.MOV_DOCUMENTO, T.TIT_DESCRICAO, T.TIT_TIPO
                    FROM FIN_MOVIMENTO M
                    JOIN FIN_TITULOS T ON T.TIT_CODIGO = M.TIT_CODIGO
                    WHERE T.FIL_CODIGO = ? AND M.MOV_PAGODIA >= ? AND M.MOV_PAGODIA < ?
                    ORDER BY M.MOV_PAGODIA DESC`, [fil, de, ate])
                return decode({ fil, de, ate, movimentos: rows })
            }
            case 'cliente': {
                if (termo.length < 3) return { error: 'informe termo com pelo menos 3 letras (nome ou CPF/CNPJ)' }
                const rows = await query(db, `
                    SELECT FIRST 20 CLI_NOME, CLI_CPFCNPJ, CLI_CELULAR, CLI_FONECOM1, CLI_EMAIL, CLI_UF, CLI_ATIVO
                    FROM CLIENTES
                    WHERE CLI_NOME CONTAINING ? OR CLI_CPFCNPJ CONTAINING ?
                    ORDER BY CLI_NOME`, [termo, termo])
                return decode({ termo, clientes: rows })
            }
            default:
                return { error: `consulta desconhecida: ${consulta}` }
        }
    } finally {
        try { db.detach() } catch { /* conexão já caiu */ }
    }
}
