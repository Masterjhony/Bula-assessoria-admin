/**
 * Leilão da BULA REMATES que a Assessoria cobriu está lançado no ERP?
 *
 * A Bula Remates (filial '01' do HastaPro) é empresa à parte: ela conduz muitos
 * pregões que não têm nada a ver com a Bula Assessoria, e a equipe pisteia
 * neles pela Remates. Olhar só "tem pisteiro da equipe" dá 52 leilões e R$ 70,9
 * milhões de VGV — e concluir que tudo isso deveria estar no ERP levaria a
 * inflar VGV, metas e comissões com faturamento que não é da Assessoria.
 *
 * O CRITÉRIO CERTO É A AGENDA. Leilão que a Assessoria cobriu entra em
 * `bula_leiloes`. Quem está na agenda é nosso e precisa de fechamento; quem não
 * está é pregão da Remates e fica de fora.
 *
 * Na apuração de 25/08/2026: dos 52, apenas 17 estavam na agenda — e todos os
 * 17 já tinham fechamento. Os outros 35 (R$ 57,99 mi) são pregões só da
 * Remates e não entram no ERP da Assessoria.
 *
 *   npx tsx scripts/confere-remates-na-agenda.mts
 *
 * Sai com código 1 se algum leilão da agenda estiver sem fechamento.
 */
import fs from 'node:fs'
import Firebird from 'node-firebird'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
}
const FILIAL = process.argv[2] || '01'
const ANO = process.argv[3] || '2026'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})
const fb = {
    host: process.env.HASTAPRO_HOST, port: +process.env.HASTAPRO_PORT!,
    database: process.env.HASTAPRO_DATABASE, user: process.env.HASTAPRO_USER,
    password: process.env.HASTAPRO_PASSWORD, lowercase_keys: true,
}
const txt = (v: unknown) => (Buffer.isBuffer(v) ? v.toString('latin1') : v)
const norm = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, txt(v)]))
const brl = (n: unknown) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const chave = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const PART = new Set(['de', 'da', 'do', 'dos', 'das', 'e'])
const partes = (s: string) => s.split(' ').filter(w => w && !PART.has(w))

/** Palavras que aparecem em quase todo nome de leilão e não identificam nada. */
const GENERICAS = new Set(['leilao', 'leiloes', 'virtual', 'edicao', 'etapa', 'mega', 'evento',
    'especial', 'nelore', 'femeas', 'touros', 'matrizes', 'fazenda', 'agropecuaria', 'premium',
    'reserva', 'criador', 'expogenetica', 'expozebu', 'gado', 'corte', 'alto', 'padrao', 'machos'])
const distintivas = (s: string) => chave(s).split(' ').filter(w => w.length >= 3 && !GENERICAS.has(w))

/**
 * A agenda escreve "KIRZ" e o HastaPro "KRIZ" — o mesmo leilão. Duas palavras
 * longas a uma letra de distância são a mesma palavra digitada torto.
 */
function quaseIgual(a: string, b: string) {
    if (a === b) return true
    if (a.length < 4 || Math.abs(a.length - b.length) > 1) return false

    // Transposição de letras vizinhas conta como UM erro. "KRIZ" e "KIRZ" são o
    // mesmo leilão — a agenda escreve de um jeito e o HastaPro de outro —, mas
    // para a distância de edição comum elas estão a DOIS erros de distância e o
    // leilão seria dado como de terceiro.
    if (a.length === b.length) {
        const dif: number[] = []
        for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) dif.push(k)
        if (dif.length === 0) return true
        if (dif.length === 1) return true
        if (dif.length === 2 && dif[1] === dif[0] + 1
            && a[dif[0]] === b[dif[1]] && a[dif[1]] === b[dif[0]]) return true
        if (dif.length > 2) return false
    }

    const [curto, longo] = a.length <= b.length ? [a, b] : [b, a]
    let i = 0, j = 0, erros = 0
    while (i < curto.length && j < longo.length) {
        if (curto[i] === longo[j]) { i++; j++; continue }
        if (++erros > 1) return false
        if (curto.length === longo.length) { i++; j++ } else { j++ }
    }
    return erros + (longo.length - j) + (curto.length - i) <= 1
}
const mesmoEvento = (nome: string, outro: string) => {
    const alvo = distintivas(nome), tb = distintivas(outro)
    return alvo.some(w => tb.some(v => v.includes(w) || w.includes(v) || quaseIgual(w, v)))
}

// ── equipe = quem tem comissão na folha ────────────────────────────────────
const { data: folha } = await sb.from('erp_folha_estrutura').select('nome, apelidos, pagamento_nome, comissao_pct')
const toks: string[] = []
for (const f of (folha ?? []).filter(f => Number(f.comissao_pct || 0) > 0))
    for (const n of [f.nome, f.pagamento_nome, ...((f.apelidos as string[] | null) ?? [])]) if (n) toks.push(chave(n))
const ehEquipe = (p: string) => {
    const a = chave(p); if (!a) return false
    const pa = partes(a)
    return toks.some(t => {
        if (!t) return false
        if (a === t) return true
        const pt = partes(t)
        if (pt.length === 1) return pa.includes(pt[0])
        if (pa.length < 2 || pa[0] !== pt[0]) return false
        const sob = new Set(pa.slice(1))
        return pt.slice(1).some(w => sob.has(w))
    })
}

const db = await new Promise<any>((res, rej) => Firebird.attach(fb, (e: unknown, d: unknown) => e ? rej(e) : res(d)))
const q = (sql: string) => new Promise<Record<string, any>[]>((res, rej) =>
    db.query(sql, [], (e: unknown, r: Record<string, unknown>[]) => e ? rej(e) : res((r ?? []).map(norm) as Record<string, any>[])))

try {
    const lotes = await q(`select l.LEI_CODIGO cod, l.LEI_NOME nome, l.LEI_DATA data, lo.LOT_TOTAL total, p.CLI_NOME pist
        from LOTES lo join LEILAO l on l.FIL_CODIGO=lo.FIL_CODIGO and l.LEI_CODIGO=lo.LEI_CODIGO
        left join CLIENTES p on p.CLI_CODIGO = lo.LOT_PISTEIRO
        where l.FIL_CODIGO='${FILIAL}' and l.LEI_DATA >= '${ANO}-01-01' and l.LEI_DATA <= '${ANO}-12-31'`)

    const porLeilao = new Map<string, { nome: string; data: string; n: number; v: number }>()
    for (const x of lotes) {
        if (!ehEquipe(String(x.pist || ''))) continue
        const k = String(x.cod)
        const a = porLeilao.get(k) ?? { nome: String(x.nome).trim(), data: new Date(String(x.data)).toISOString().slice(0, 10), n: 0, v: 0 }
        a.n++; a.v += Number(x.total || 0)
        porLeilao.set(k, a)
    }

    const { data: fechs } = await sb.from('bula_leilao_fechamento').select('nome, data')
    const { data: agenda } = await sb.from('bula_leiloes').select('nome, data, status, leiloeira')
    const dist = (a: string, b: string) => Math.abs(new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000
    const casa = (nome: string, data: string, lista: { nome: string; data: string }[] | null) =>
        (lista ?? []).find(x => dist(String(x.data).slice(0, 10), data) <= 4 && mesmoEvento(nome, x.nome))

    const todos = [...porLeilao.values()].sort((a, b) => a.data.localeCompare(b.data))
    const nossos = todos.filter(x => casa(x.nome, x.data, agenda as never))
    const semFechamento = nossos.filter(x => !casa(x.nome, x.data, fechs as never))
    const daRemates = todos.length - nossos.length

    console.log(`FILIAL ${FILIAL} · ${ANO} — leiloes com lote de pisteiro da equipe Bula: ${todos.length}`)
    console.log(`  NOSSOS (estao na agenda da Assessoria): ${nossos.length}`)
    console.log(`  so da Remates (fora da agenda):         ${daRemates}  ` +
        `R$ ${brl(todos.filter(x => !nossos.includes(x)).reduce((s, x) => s + x.v, 0))} — nao entram no ERP`)

    if (!semFechamento.length) {
        console.log('\nTodos os leiloes NOSSOS desta filial ja tem fechamento no ERP.')
        process.exit(0)
    }
    console.log(`\nSEM FECHAMENTO NO ERP (${semFechamento.length}) — importar:`)
    for (const x of semFechamento) {
        const ag = casa(x.nome, x.data, agenda as never)!
        console.log(`  ${x.data}  ${String(x.n).padStart(3)} lotes  R$ ${String(brl(x.v)).padStart(13)}  ${x.nome.slice(0, 44)}`)
        console.log(`       agenda: "${String(ag.nome).slice(0, 48)}"`)
        const trecho = distintivas(x.nome)[0] ?? x.nome.slice(0, 10)
        console.log(`       npx tsx scripts/importa-fechamento-hastapro.mts ${FILIAL} "${trecho}" ${x.data.slice(0, 7)} --apply`)
    }
    process.exit(1)
} finally {
    db.detach()
}
