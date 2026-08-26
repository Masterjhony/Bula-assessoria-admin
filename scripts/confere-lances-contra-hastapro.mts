/**
 * Confere, lote a lote, os fechamentos importados do HastaPro contra o próprio
 * HastaPro — e tira o lote que não existe no pregão.
 *
 * O caso que originou isto: em 16/08 houve dois pregões, o Matinha Expogenética
 * e o Fazenda Araras. O lote 22 (R$ 87.000, José Fábio · Nelore Pérola) é do
 * Araras e estava lançado NOS DOIS. O VGV de agosto contava o mesmo touro duas
 * vezes, e o Matinha aparecia com R$ 547.500 onde o HastaPro diz R$ 460.500.
 *
 * POR QUE NÃO SIMPLESMENTE REIMPORTAR: o `por_assessor` gravado costuma valer
 * MAIS que o do HastaPro. Ele já passou pelo direcionamento de parceiro (lote de
 * comprador do Rusa sai de quem anunciou) e por correção manual de pisteiro — o
 * Matinha guarda "Gustavo Rusa" e "Nane" onde uma reimportação escreveria
 * "(a definir)". Então aqui só se REMOVE o lote intruso e se recalcula em cima
 * do que sobrou. A atribuição é preservada.
 *
 * O QUE É "NÃO EXISTE": o par (número do lote, valor). Número sozinho não
 * identifica nada — todo leilão tem lote 1, 2, 3 — e valor sozinho se repete
 * entre lotes irmãos.
 *
 * FALTAR NO HASTAPRO NÃO PROVA QUE A VENDA NÃO EXISTIU. O HastaPro é digitado a
 * partir dos grupos de lances e tem buraco conhecido — o lote M44 do Naviraí de
 * 05/07 é um MACHO de reoferta num leilão de matrizes, foi conferido, é venda de
 * verdade, e não está lá. Por isso só se REMOVE o lote que aparece em OUTRO
 * fechamento do mesmo dia: isso é prova de que ele tem dono e está no lugar
 * errado. O que não existe em canto nenhum é apenas RELATADO, para alguém olhar.
 *
 *   npx tsx scripts/confere-lances-contra-hastapro.mts 2026-08          (dry-run)
 *   npx tsx scripts/confere-lances-contra-hastapro.mts 2026-08 --apply
 */
import fs from 'node:fs'
import Firebird from 'node-firebird'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
}

const COMPET = process.argv.slice(2).find(a => /^\d{4}-\d{2}$/.test(a))
const APPLY = process.argv.includes('--apply')
if (!COMPET) {
    console.error('uso: npx tsx scripts/confere-lances-contra-hastapro.mts <AAAA-MM> [--apply]')
    process.exit(1)
}
const de = `${COMPET}-01`
const ate = new Date(Number(COMPET.slice(0, 4)), Number(COMPET.slice(5, 7)), 0).toISOString().slice(0, 10)

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})
const fbOpts = {
    host: process.env.HASTAPRO_HOST, port: +process.env.HASTAPRO_PORT!,
    database: process.env.HASTAPRO_DATABASE, user: process.env.HASTAPRO_USER,
    password: process.env.HASTAPRO_PASSWORD, lowercase_keys: true,
}
const txt = (v: unknown) => (Buffer.isBuffer(v) ? v.toString('latin1') : v)
const brl = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const r2 = (n: number) => Math.round(n * 100) / 100
const chave = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
/** Identidade do lote: número + valor em centavos. */
const idLote = (lote: unknown, vgv: unknown) =>
    `${String(lote ?? '').trim().replace(/^0+(?=\d)/, '')}|${Math.round(Number(vgv || 0) * 100)}`

type Lance = { lote?: unknown; vgv?: number; animais?: number; assessor?: string; comprador?: string | null }

const db: { query: (s: string, p: unknown[], cb: (e: unknown, r: Record<string, unknown>[]) => void) => void; detach: () => void } =
    await new Promise((res, rej) => Firebird.attach(fbOpts as never, (e, d) => (e ? rej(e) : res(d as never))))
const q = (sql: string) => new Promise<Record<string, unknown>[]>((res, rej) =>
    db.query(sql, [], (e, r) => e ? rej(e) : res((r ?? []).map(x =>
        Object.fromEntries(Object.entries(x).map(([k, v]) => [k, txt(v)]))))))

try {
    const { data: fechs } = await sb.from('bula_leilao_fechamento')
        .select('id, nome, data, vgv_total, lotes_vendidos, animais_vendidos, lances, por_assessor, comissao_assessoria, observacoes')
        .eq('origem', 'hastapro').gte('data', de).lte('data', ate).order('data')

    const leiloes = await q(`select l.FIL_CODIGO fil, l.LEI_CODIGO cod, l.LEI_NOME nome, l.LEI_DATA data
        from LEILAO l where l.LEI_DATA between '${de}' and '${ate}'`)

    let achou = 0
    for (const f of fechs ?? []) {
        const dataISO = String(f.data).slice(0, 10)
        // Casa pelo nome, dentro do dia — é como o importador achou o leilão.
        const lei = leiloes.find(l => {
            const d = new Date(String(l.data)).toISOString().slice(0, 10)
            if (d !== dataISO) return false
            const a = chave(l.nome), b = chave(f.nome)
            return a.includes(b) || b.includes(a)
        })
        if (!lei) {
            console.log(`  ? ${dataISO} "${String(f.nome).slice(0, 44)}" — sem leilão correspondente no HastaPro, pulado`)
            continue
        }
        const lotes = await q(`select LOT_LOTE lote, LOT_TOTAL total from LOTES
            where FIL_CODIGO='${lei.fil}' and LEI_CODIGO='${lei.cod}'`)
        const noPregao = new Set(lotes.map(l => idLote(l.lote, l.total)))

        const lances = (f.lances ?? []) as Lance[]
        const intrusos = lances.filter(l => !noPregao.has(idLote(l.lote, l.vgv)))
        if (!intrusos.length) continue

        // Tem dono noutro fechamento do mesmo dia? Entao esta no lugar errado.
        const doMesmoDia = (fechs ?? []).filter(x => x.id !== f.id && String(x.data).slice(0, 10) === dataISO)
        const donoDoLote = new Map<string, string>()
        for (const x of doMesmoDia)
            for (const l of (x.lances ?? []) as Lance[]) donoDoLote.set(idLote(l.lote, l.vgv), String(x.nome))

        const duplicados = intrusos.filter(i => donoDoLote.has(idLote(i.lote, i.vgv)))
        const soAqui = intrusos.filter(i => !donoDoLote.has(idLote(i.lote, i.vgv)))

        achou++
        const fica = lances.filter(l => !duplicados.includes(l))
        const vgvIntruso = r2(duplicados.reduce((s, l) => s + Number(l.vgv || 0), 0))
        console.log(`
${dataISO}  ${String(f.nome).slice(0, 52)}`)
        console.log(`   HastaPro tem ${new Set(lotes.map(l => String(l.lote).trim())).size} lotes; o fechamento tem ${lances.length} lances`)
        for (const i of duplicados)
            console.log(`   DUPLICADO — ja esta em "${String(donoDoLote.get(idLote(i.lote, i.vgv))).slice(0, 40)}": ` +
                `lote ${String(i.lote).trim()} · R$ ${brl(i.vgv)}`)
        for (const i of soAqui)
            console.log(`   SO AQUI (o HastaPro nao tem, mas ninguem mais reivindica — NAO removo): ` +
                `lote ${String(i.lote).trim()} · R$ ${brl(i.vgv)} · ${String(i.comprador ?? '').slice(0, 30)}`)
        if (!duplicados.length) continue
        console.log(`   ${brl(f.vgv_total)} -> ${brl(Number(f.vgv_total) - vgvIntruso)}  (${lances.length} -> ${fica.length} lotes)`)

        if (!APPLY) continue
        if (!fica.length) { console.log('   ! ficaria vazio — nao mexo, confira a mao'); continue }

        // Recalcula em cima do que sobrou, PRESERVANDO o percentual de comissão
        // já atribuído a cada assessor (é o que carrega o direcionamento).
        const vgv = r2(fica.reduce((s, l) => s + Number(l.vgv || 0), 0))
        const animais = fica.reduce((s, l) => s + Number(l.animais || 0), 0)
        const antigos = (f.por_assessor ?? []) as { nome?: string; comissao_pct?: number; empresa?: string }[]
        const doAntigo = (nome: string) => antigos.find(a => chave(a.nome) === chave(nome))
        const nomes = [...new Set(fica.map(l => String(l.assessor ?? '(a definir)')))]
        const porAssessor = nomes.map(nome => {
            const meus = fica.filter(l => String(l.assessor ?? '(a definir)') === nome)
            const v = r2(meus.reduce((s, l) => s + Number(l.vgv || 0), 0))
            const pct = Number(doAntigo(nome)?.comissao_pct ?? 0)
            return {
                nome, vgv: v, animais: meus.reduce((s, l) => s + Number(l.animais || 0), 0),
                transacoes: meus.length, empresa: doAntigo(nome)?.empresa ?? 'Bula Assessoria',
                comissao: r2(v * pct), comissao_pct: pct,
                ticket_medio: r2(v / meus.length),
                pct_total: vgv ? Number((v / vgv).toFixed(6)) : 0,
            }
        }).sort((a, b) => b.vgv - a.vgv).map((a, i) => ({ ...a, posicao: i + 1 }))

        const nota = duplicados.map(i => `lote ${String(i.lote).trim()} (R$ ${brl(i.vgv)})`).join(', ')
        const { error } = await sb.from('bula_leilao_fechamento').update({
            lances: fica, vgv_total: vgv, lotes_vendidos: fica.length, animais_vendidos: animais,
            por_assessor: porAssessor,
            comissao_assessoria: r2(porAssessor.reduce((s, a) => s + a.comissao, 0)),
            ticket_medio: r2(vgv / fica.length),
            maior_lance: r2(Math.max(...fica.map(l => Number(l.vgv || 0)))),
            observacoes: `${String(f.observacoes ?? '').trim()} [CONFERIDO CONTRA O HASTAPRO] ` +
                `Removido ${nota} — ja lancado em outro pregao do mesmo dia e ausente deste no HastaPro.`.trim(),
        }).eq('id', f.id)
        console.log(error ? `   ERRO: ${error.message}` : `   corrigido: ${brl(vgv)} em ${fica.length} lotes`)
    }

    console.log(achou
        ? `\n${achou} fechamento(s) com lote que o HastaPro não tem.${APPLY ? '' : '\n(dry-run) use --apply para gravar'}`
        : '\nNenhum lote sobrando: todo lance existe no pregão correspondente.')
} finally {
    db.detach()
}
