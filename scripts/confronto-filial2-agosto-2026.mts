/**
 * Confronto lote a lote entre a FILIAL 2 do HastaPro (Bula Assessoria) e os
 * fechamentos do nosso ERP, competência agosto/2026.
 *
 * A filial 2 é a que o HastaPro chama de "Bula Assessoria" — é dela que sai a
 * lista de R$ 6.118.100 que o Matheus mandou. Este script não julga: ele expõe
 * os dois lados com a origem de cada número, para a conferência ser auditável.
 *
 * IDENTIDADE DO LOTE = número normalizado (sem zero à esquerda) + valor. Só o
 * número não identifica nada: todo leilão tem lote 1, 2, 3. Foi exatamente o
 * zero à esquerda ("09" no HastaPro contra "9" no parser do grupo) que deixou
 * passar as três duplicatas de agosto.
 *
 * COTA NÃO MULTIPLICA O LOTE. O join com COMPRADORES devolve uma linha por
 * dono, e touro de central é vendido em frações — somar linhas conta o mesmo
 * animal várias vezes. Aqui as linhas voltam a ser um lote e os donos entram
 * juntos no mesmo registro.
 *
 *   npx tsx scripts/confronto-filial2-agosto-2026.mts            (imprime)
 *   npx tsx scripts/confronto-filial2-agosto-2026.mts --json     (grava o dataset)
 */
import fs from 'node:fs'
import Firebird from 'node-firebird'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
}

const DE = '2026-08-01', ATE = '2026-08-31'
const JSON_OUT = process.argv.includes('--json')

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
})
const fbOpts = {
    host: process.env.HASTAPRO_HOST, port: +process.env.HASTAPRO_PORT!,
    database: process.env.HASTAPRO_DATABASE, user: process.env.HASTAPRO_USER,
    password: process.env.HASTAPRO_PASSWORD, lowercase_keys: true,
}
const txt = (v: unknown) => (Buffer.isBuffer(v) ? v.toString('latin1') : v)
const brl = (n: unknown) => Number(n || 0).toLocaleString('pt-BR')
const r2 = (n: number) => Math.round(n * 100) / 100
const chave = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
/** Sem zero à esquerda e sem pontuação: "09" e "9" são o mesmo lote; "E11" não. */
const nLote = (s: unknown) => String(s ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+(?=\d)/, '')

/**
 * Quanto dois nomes de leilão se parecem, de 0 a 1 (Jaccard sobre as palavras
 * que discriminam). "leilão", "nelore" e "expogenética" aparecem em quase todo
 * nome do mês e não distinguem nada — contá-las fazia o Nelore CEN casar com o
 * Paranã e Casabranca, que é outro pregão do mesmo dia.
 */
const VAZIAS = new Set(['leilao', 'leilão', 'nelore', 'expogenetica', 'virtual', 'edicao', 'especial',
    'convidados', 'amigos', 'fazenda', 'agropecuaria', '2026', 'de', 'do', 'da', 'e', 'o', 'a'])
function similaridade(a: string, b: string): number {
    const toks = (s: string) => new Set(chave(s).split(' ').filter(w => w.length > 2 && !VAZIAS.has(w)))
    const A = toks(a), B = toks(b)
    if (!A.size || !B.size) return 0
    const inter = [...A].filter(w => B.has(w)).length
    return inter / Math.min(A.size, B.size)
}

const db: any = await new Promise((res, rej) => Firebird.attach(fbOpts as never, (e, d) => (e ? rej(e) : res(d))))
const q = (sql: string) => new Promise<any[]>((res, rej) =>
    db.query(sql, [], (e: unknown, r: Record<string, unknown>[]) => e ? rej(e) :
        res((r ?? []).map(x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, txt(v)]))))))

type LoteHP = {
    lote: string; loteRaw: string; lance: number; parcelas: string | null; qtd: number
    total: number; pisteiro: string; compradores: string[]
}
type LoteNosso = { lote: string; loteRaw: string; vgv: number; animais: number; assessor: string; comprador: string }
type Leilao = {
    cod: string; nome: string; data: string
    hp: LoteHP[]; totalHp: number
    fech: { id: string; nome: string; origem: string; vgv: number } | null
    nosso: LoteNosso[]; totalNosso: number
    linhas: { lote: string; hp: LoteHP | null; ns: LoteNosso | null; status: string }[]
}

// ── lado A: filial 2 do HastaPro ────────────────────────────────────────────
const leiloesHp = await q(`select LEI_CODIGO cod, LEI_NOME nome, LEI_DATA data from LEILAO
    where FIL_CODIGO='2' and LEI_DATA between '${DE}' and '${ATE}' order by LEI_DATA, LEI_NOME`)

// ── lado B: nossos fechamentos ──────────────────────────────────────────────
const { data: fechs } = await sb.from('bula_leilao_fechamento')
    .select('id, nome, data, vgv_total, origem, lances')
    .gte('data', DE).lte('data', ATE).order('data')
const usados = new Set<string>()

const leiloes: Leilao[] = []
for (const l of leiloesHp) {
    const data = new Date(String(l.data)).toISOString().slice(0, 10)
    const nome = String(l.nome).trim()
    const linhasHp = await q(`select lo.LOT_LOTE lote, lo.LOT_LANCE lance, lo.LOT_PARCELAS parcelas,
            lo.LOT_QTD qtd, lo.LOT_TOTAL total, pi.CLI_NOME pisteiro, c.CLI_NOME comprador
        from LOTES lo
        left join CLIENTES pi on pi.CLI_CODIGO = lo.LOT_PISTEIRO
        left join COMPRADORES co on co.FIL_CODIGO=lo.FIL_CODIGO and co.LEI_CODIGO=lo.LEI_CODIGO and co.LOT_LOTE=lo.LOT_LOTE
        left join CLIENTES c on c.CLI_CODIGO = co.CLI_CODIGO
        where lo.FIL_CODIGO='2' and lo.LEI_CODIGO='${l.cod}' order by lo.LOT_LOTE`)
    const porLote = new Map<string, LoteHP>()
    for (const x of linhasHp) {
        const k = nLote(x.lote)
        const dono = String(x.comprador || '').trim()
        const ex = porLote.get(k)
        if (ex) { if (dono && !ex.compradores.includes(dono)) ex.compradores.push(dono); continue }
        porLote.set(k, {
            lote: k, loteRaw: String(x.lote).trim(), lance: Number(x.lance || 0),
            parcelas: String(x.parcelas ?? '').trim() || null, qtd: Number(x.qtd || 1),
            total: r2(Number(x.total || 0)), pisteiro: String(x.pisteiro || '').trim(),
            compradores: dono ? [dono] : [],
        })
    }
    const hp = [...porLote.values()]

    // Casa o fechamento pelo dia + nome. Escolhe o MELHOR par do dia, não o
    // primeiro que passa: em 20/08 há dois pregões e "leilão"+"nelore" bastavam
    // para o Nelore CEN casar com o Paranã e Casabranca.
    const candidatos = (fechs ?? [])
        .filter(x => !usados.has(String(x.id)) && String(x.data).slice(0, 10) === data)
        .map(x => ({ x, score: similaridade(String(x.nome), nome) }))
        .filter(c => c.score >= 0.34)
        .sort((a, b) => b.score - a.score)
    const f = candidatos[0]?.x
    if (f) usados.add(String(f.id))
    const nosso: LoteNosso[] = ((f?.lances ?? []) as any[]).map(x => ({
        lote: nLote(x.lote), loteRaw: String(x.lote ?? '').trim(), vgv: r2(Number(x.vgv || 0)),
        animais: Number(x.animais || 1), assessor: String(x.assessor || '').trim(),
        comprador: String(x.comprador || '').trim(),
    }))

    const todos = [...new Set([...hp.map(x => x.lote), ...nosso.map(x => x.lote)])]
        .sort((a, b) => (Number(a.replace(/\D/g, '')) || 0) - (Number(b.replace(/\D/g, '')) || 0))
    const linhas = todos.map(k => {
        const h = hp.find(x => x.lote === k) ?? null
        const n = nosso.find(x => x.lote === k) ?? null
        const status = !n ? 'so-hastapro' : !h ? 'so-nosso'
            : Math.abs(n.vgv - h.total) > 0.5 ? 'valor' : 'ok'
        return { lote: k, hp: h, ns: n, status }
    })

    leiloes.push({
        cod: String(l.cod).trim(), nome, data, hp, totalHp: r2(hp.reduce((s, x) => s + x.total, 0)),
        fech: f ? { id: String(f.id), nome: String(f.nome), origem: String(f.origem || ''), vgv: Number(f.vgv_total || 0) } : null,
        nosso, totalNosso: r2(nosso.reduce((s, x) => s + x.vgv, 0)), linhas,
    })
}

// ── lado B que não tem correspondente nenhum na filial 2 ────────────────────
const foraDaFilial2 = (fechs ?? []).filter(f => !usados.has(String(f.id))).map(f => ({
    id: String(f.id), nome: String(f.nome), data: String(f.data).slice(0, 10),
    origem: String(f.origem || ''), vgv: Number(f.vgv_total || 0),
    lances: ((f.lances ?? []) as any[]).map(x => ({
        lote: String(x.lote ?? '').trim(), vgv: r2(Number(x.vgv || 0)),
        assessor: String(x.assessor || '').trim(), comprador: String(x.comprador || '').trim(),
    })),
}))
db.detach()

// ── saída ───────────────────────────────────────────────────────────────────
const totHp = r2(leiloes.reduce((s, l) => s + l.totalHp, 0))
const totNosso = r2(leiloes.reduce((s, l) => s + l.totalNosso, 0))
const totFora = r2(foraDaFilial2.reduce((s, f) => s + f.vgv, 0))

console.log(`FILIAL 2 (HastaPro) em agosto/2026: ${leiloes.length} leiloes  R$ ${brl(totHp)}`)
console.log(`Nosso ERP, nos mesmos leiloes:      R$ ${brl(totNosso)}`)
console.log(`Nosso ERP, fora da filial 2:        ${foraDaFilial2.length} fechamentos  R$ ${brl(totFora)}`)
console.log(`Nosso ERP, total:                   R$ ${brl(r2(totNosso + totFora))}\n`)

for (const l of leiloes) {
    const divergentes = l.linhas.filter(x => x.status !== 'ok')
    const marca = divergentes.length ? '≠' : '='
    console.log(`${marca} ${l.data}  ${l.nome.slice(0, 56)}`)
    console.log(`   HastaPro ${String(l.hp.length).padStart(3)} lotes R$ ${brl(l.totalHp).padStart(11)}  |  ` +
        `nosso ${String(l.nosso.length).padStart(3)} lotes R$ ${brl(l.totalNosso).padStart(11)}` +
        (l.fech ? `  [${l.fech.origem}]` : '  (SEM FECHAMENTO)'))
    for (const d of divergentes) {
        const t = d.status === 'so-hastapro' ? 'só no HastaPro' : d.status === 'so-nosso' ? 'só no nosso' : 'valor difere'
        console.log(`      lt ${d.lote.padStart(4)}  ${t.padEnd(15)} hp=${brl(d.hp?.total ?? 0).padStart(9)} nosso=${brl(d.ns?.vgv ?? 0).padStart(9)}` +
            `  ${(d.hp?.pisteiro || d.ns?.assessor || '').slice(0, 24)}`)
    }
}
console.log(`\nFECHAMENTOS FORA DA FILIAL 2:`)
for (const f of foraDaFilial2) console.log(`   ${f.data}  R$ ${brl(f.vgv).padStart(10)}  [${f.origem}]  ${f.nome.slice(0, 52)}`)

if (JSON_OUT) {
    const out = {
        competencia: '2026-08', gerado_em: new Date().toISOString(),
        totais: { hastapro_filial2: totHp, nosso_nos_mesmos_leiloes: totNosso, nosso_fora_da_filial2: totFora, nosso_total: r2(totNosso + totFora) },
        leiloes, fora_da_filial2: foraDaFilial2,
    }
    fs.mkdirSync('outputs/conferencia-vgv-agosto-2026', { recursive: true })
    fs.writeFileSync('outputs/conferencia-vgv-agosto-2026/confronto-filial2.json', JSON.stringify(out, null, 1))
    console.log('\njson: outputs/conferencia-vgv-agosto-2026/confronto-filial2.json')
}
