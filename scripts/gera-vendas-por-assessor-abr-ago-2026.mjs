/**
 * VENDAS POR ASSESSOR — abril a agosto de 2026 (pedido do Marcelo, 31/08).
 *
 * O formato pedido e o do painel: Pessoa | Faturado | Lotes | Qtd. Animais.
 * A fonte desse painel e o HastaPro **filial '2'** (Bula Assessoria) — provado
 * ancorando agosto contra o print: os 8 nomes batem lote a lote ate 26/08.
 *
 * O que este script faz A MAIS que o painel, e por que:
 *
 *  1. RESOLVE O "EM BRANCO". O painel junta LOT_PISTEIRO com PRESTADORES; a
 *     Nane so existe em CLIENTES (Regiane Cristina Neves de Abreu), entao ela
 *     sai sem nome. Aqui o pisteiro e resolvido por CLIENTES com fallback em
 *     PRESTADORES — as duas tabelas usam o mesmo formato de codigo.
 *  2. CANONICALIZA NOMES. "LM ASSESSORIA" e o Leonardo (pagamento_nome da
 *     folha); sem isso ele aparece duas vezes.
 *  3. SEPARA A COBERTURA EM LEILAO DA REMATES. O painel so ve a filial '2'.
 *     Quando a Bula Assessoria cobre um pregao da propria Bula Remates
 *     (filial '01'), a venda existe, esta no ERP e gera comissao — mas nao
 *     aparece no painel. Entra aqui como bloco SEPARADO, a partir do que o
 *     ERP ja reconheceu (nao por criterio inventado aqui).
 *  4. CONFERE CONTRA O ERP mes a mes e lista as divergencias.
 *
 * Saida: outputs/vendas-por-assessor-2026/dados.json
 */
import fs from 'node:fs'
import path from 'node:path'
import Firebird from 'node-firebird'
import { createClient } from '@supabase/supabase-js'

const INI = '2026-04-01', FIM = '2026-08-31'
const MESES = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
const OUT = 'outputs/vendas-por-assessor-2026'

/* ── env ─────────────────────────────────────────────────────────────────── */
for (const f of ['.env.local', '.env']) {
    if (!fs.existsSync(f)) continue
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (!m) continue
        let v = m[2].trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
        if (!(m[1] in process.env)) process.env[m[1]] = v
    }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })

const txt = v => (Buffer.isBuffer(v) ? v.toString('latin1') : v)
const norm = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, txt(v)]))
const db = await new Promise((res, rej) => Firebird.attach({
    host: process.env.HASTAPRO_HOST, port: +process.env.HASTAPRO_PORT,
    database: process.env.HASTAPRO_DATABASE, user: process.env.HASTAPRO_USER,
    password: process.env.HASTAPRO_PASSWORD, lowercase_keys: true,
}, (e, d) => e ? rej(e) : res(d)))
const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => e ? rej(e) : res(r.map(norm))))

const iso = d => new Date(d).toISOString().slice(0, 10)
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const chave = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/* ── 1. HastaPro filial '2' — a base do painel ───────────────────────────── */
const lotes2 = await q(`
    select l.LEI_NOME leilao, l.LEI_DATA data_leilao, lo.LOT_LOTE lote, lo.LOT_DATA_VENDA dv,
           lo.LOT_QTD qtd, lo.LOT_TOTAL total, lo.LOT_PISTEIRO p
      from LOTES lo join LEILAO l on l.LEI_CODIGO = lo.LEI_CODIGO and l.FIL_CODIGO = lo.FIL_CODIGO
     where l.FIL_CODIGO = '2' and lo.LOT_DATA_VENDA >= '${INI}' and lo.LOT_DATA_VENDA <= '${FIM}'`)

/* Resolver o pisteiro: CLIENTES e a tabela completa; PRESTADORES (a que o
 * painel usa) nao tem todo mundo — e dai que nasce o "em branco" da Nane. */
const codigos = [...new Set(lotes2.map(l => String(l.p ?? '')).filter(Boolean))]
const emLista = codigos.map(c => `'${c}'`).join(',')
const nomeCli = new Map((await q(`select CLI_CODIGO c, CLI_NOME n from CLIENTES where CLI_CODIGO in (${emLista})`))
    .map(x => [String(x.c), String(x.n).trim()]))
const nomePre = new Map((await q(`select PRE_CODIGO c, PRE_NOME n from PRESTADORES where PRE_CODIGO in (${emLista})`))
    .map(x => [String(x.c), String(x.n).trim()]))
db.detach()

/** Nome de exibicao: o do cadastro, com os apelidos consolidados. */
const ALIAS = new Map([
    ['lm assessoria', 'Leonardo Serafim Francisco'],
    ['regiane cristina neves de abreu', 'Regiane C. N. de Abreu (Nane)'],
])
const nomeDoPisteiro = cod => {
    const bruto = nomeCli.get(cod) || nomePre.get(cod) || ''
    if (!bruto) return null
    return ALIAS.get(chave(bruto)) || bruto
}

const linhas = lotes2.map(l => ({
    leilao: String(l.leilao).trim(), data: iso(l.data_leilao), data_venda: iso(l.dv),
    lote: String(l.lote).trim(), qtd: Number(l.qtd || 0), vgv: r2(l.total),
    pisteiro: nomeDoPisteiro(String(l.p ?? '')),
    so_em_clientes: !!(l.p && nomeCli.has(String(l.p)) && !nomePre.has(String(l.p))),
}))

/* ── 2. ERP — fechamentos, inclusive a cobertura em pregao da Remates ────── */
const { data: fechamentos } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,data,vgv_total,por_assessor,origem,observacoes')
    .gte('data', INI).lte('data', FIM).order('data')

/**
 * Um fechamento do ERP é COMPLEMENTO quando o leilão dele não existe na filial
 * '2' do HastaPro — é venda da Assessoria que o painel não enxerga (pregão da
 * Bula Remates ou de terceiro registrado só no ERP).
 *
 * O teste é empírico: casa por VGV idêntico (±3 dias) ou por palavra
 * distintiva do nome. Classificar pela observação em texto livre não funciona
 * — metade dos fechamentos da filial '2' menciona "Bula Remates" na descrição
 * e seriam contados duas vezes.
 */
const STOP = new Set(['leilao', 'virtual', 'nelore', 'edicao', 'especial', 'convidados', 'anos',
    'selecao', '2026', 'etapa', 'fazenda', 'touros', 'femeas', 'matrizes', 'reprodutores'])
const toks = s => new Set(chave(s).split(' ').filter(w => w.length > 2 && !STOP.has(w)))
const leiloesHp2 = [...linhas.reduce((m, l) => {
    const k = `${l.data}|${l.leilao}`
    if (!m.has(k)) m.set(k, { nome: l.leilao, data: l.data, vgv: 0 })
    m.get(k).vgv = r2(m.get(k).vgv + l.vgv)
    return m
}, new Map()).values()]
const temParNoPainel = f => {
    const perto = leiloesHp2.filter(h => Math.abs(new Date(h.data) - new Date(f.data)) / 86400000 <= 3)
    if (perto.some(h => Math.abs(h.vgv - Number(f.vgv_total || 0)) < 1)) return true
    const tf = toks(f.nome)
    return perto.some(h => [...toks(h.nome)].some(w => tf.has(w)))
}
const ehComplemento = f => !temParNoPainel(f)

/** Rótulos do ERP → nome de exibição do HastaPro. */
const CANON_ERP = new Map([
    ['douglas bispo', 'Douglas Bispo Carvalho'],
    ['fabio omena', 'Fabio de Omena Gaia'], ['fabio omena gaia', 'Fabio de Omena Gaia'],
    ['fabio omenna', 'Fabio de Omena Gaia'], ['fabio de omena gaia', 'Fabio de Omena Gaia'],
    ['leonardo serafim', 'Leonardo Serafim Francisco'], ['leonardo', 'Leonardo Serafim Francisco'],
    ['leo', 'Leonardo Serafim Francisco'], ['leo serafim', 'Leonardo Serafim Francisco'],
    ['lm assessoria', 'Leonardo Serafim Francisco'],
    ['peralta', 'Luiz Felipe Peralta Garcez'], ['peralta bula', 'Luiz Felipe Peralta Garcez'],
    ['lucas martins', 'Lucas Martins Durães Bragança'],
    ['laila', 'Laila de Sousa Oliveira'], ['laila oliveira', 'Laila de Sousa Oliveira'],
    ['nane', 'Regiane C. N. de Abreu (Nane)'],
    ['gustavo rusa', 'GUSTAVO RUSA PEREIRA'],
    ['bulinha felipe andrade', 'Felipe Vilela Andrade'], ['felipe vilela andrade', 'Felipe Vilela Andrade'],
    ['marcelo carneiro', 'MARCELO CARNEIRO'], ['matheus amormino', 'MARCELO CARNEIRO'],
    ['matheus alves', 'Mateus Alves da Silva'], ['mateus alves', 'Mateus Alves da Silva'],
    ['valeria borges', 'VALERIA BORGES DA SILVA ARAUJO'],
])
const canonErp = n => CANON_ERP.get(chave(n)) || String(n || '').trim()

/* ── 3. agregação ────────────────────────────────────────────────────────── */
const somaPessoa = arr => {
    const m = new Map()
    for (const x of arr) {
        const k = x.pessoa
        if (!m.has(k)) m.set(k, { pessoa: k, vgv: 0, lotes: 0, animais: 0 })
        const a = m.get(k)
        a.vgv = r2(a.vgv + x.vgv); a.lotes += x.lotes; a.animais += x.animais
    }
    return [...m.values()].sort((a, b) => b.vgv - a.vgv)
}

const meses = MESES.map(mes => {
    const doMes = linhas.filter(l => l.data.slice(0, 7) === mes)
    const painel = somaPessoa(doMes.map(l => ({
        pessoa: l.pisteiro || '(sem pisteiro no HastaPro)', vgv: l.vgv, lotes: 1, animais: l.qtd,
    })))
    /* vendas da Assessoria que o painel não enxerga (leilão fora da filial '2') */
    const remates = somaPessoa((fechamentos || [])
        .filter(f => f.data.slice(0, 7) === mes && ehComplemento(f))
        .flatMap(f => (Array.isArray(f.por_assessor) ? f.por_assessor : []).map(a => ({
            pessoa: canonErp(a.nome || a.assessor), vgv: r2(a.vgv), lotes: Number(a.transacoes || 0), animais: Number(a.animais || 0),
        }))))
    const total = somaPessoa([...painel, ...remates].map(x => ({ ...x })))
    const tot = arr => ({
        vgv: r2(arr.reduce((a, b) => a + b.vgv, 0)),
        lotes: arr.reduce((a, b) => a + b.lotes, 0),
        animais: arr.reduce((a, b) => a + b.animais, 0),
    })
    return {
        mes, painel, remates, total,
        totais: { painel: tot(painel), remates: tot(remates), total: tot(total) },
        leiloes_remates: (fechamentos || []).filter(f => f.data.slice(0, 7) === mes && ehComplemento(f))
            .map(f => ({ data: f.data, nome: f.nome, vgv: r2(f.vgv_total) })),
    }
})

/* consolidado do período */
const consolidado = {
    painel: somaPessoa(meses.flatMap(m => m.painel)),
    remates: somaPessoa(meses.flatMap(m => m.remates)),
    total: somaPessoa(meses.flatMap(m => m.total)),
}

/* ── 4. conferência contra o ERP (só filial '2') ─────────────────────────── */
const erpFil2 = somaPessoa((fechamentos || [])
    .filter(f => !ehComplemento(f))
    .flatMap(f => (Array.isArray(f.por_assessor) ? f.por_assessor : []).map(a => ({
        pessoa: canonErp(a.nome || a.assessor), vgv: r2(a.vgv), lotes: Number(a.transacoes || 0), animais: Number(a.animais || 0),
    }))))
const conferencia = [...new Set([...consolidado.painel.map(p => p.pessoa), ...erpFil2.map(p => p.pessoa)])]
    .map(pessoa => {
        const hp = consolidado.painel.find(p => p.pessoa === pessoa)
        const erp = erpFil2.find(p => p.pessoa === pessoa)
        return { pessoa, hastapro: hp ? hp.vgv : 0, erp: erp ? erp.vgv : 0, dif: r2((erp ? erp.vgv : 0) - (hp ? hp.vgv : 0)) }
    })
    .filter(x => Math.abs(x.dif) >= 1)
    .sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif))

/* ── 5. achados de qualidade da base ─────────────────────────────────────── */
const semPisteiro = linhas.filter(l => !l.pisteiro)
const valorZero = linhas.filter(l => !l.vgv)
const soEmClientes = [...new Set(linhas.filter(l => l.so_em_clientes).map(l => l.pisteiro))]
const aDefinirErp = r2((fechamentos || []).filter(f => !ehComplemento(f))
    .flatMap(f => (Array.isArray(f.por_assessor) ? f.por_assessor : []))
    .filter(a => /definir/i.test(String(a.nome || a.assessor))).reduce((s, a) => s + Number(a.vgv || 0), 0))

/* Fechamentos em que o assessor foi deduzido da UF do comprador, nao do lote:
 * a nota "Assessor por zona (UF)" e explicita neles. E a maior fonte de erro de
 * atribuicao do periodo — por isso o ranking sai do HastaPro, nao daqui. */
const porZona = (fechamentos || []).filter(f => /Assessor por zona/i.test(String(f.observacoes || '')))
const porZonaMes = MESES.map(mes => ({
    mes, vgv: r2(porZona.filter(f => f.data.slice(0, 7) === mes).reduce((a, b) => a + Number(b.vgv_total || 0), 0)),
})).filter(x => x.vgv)

const dados = {
    geradoEm: new Date().toISOString().slice(0, 10),
    periodo: { ini: INI, fim: FIM },
    meses, consolidado, conferencia,
    qualidade: {
        lotes_fil2: linhas.length,
        sem_pisteiro: { n: semPisteiro.length, vgv: r2(semPisteiro.reduce((a, b) => a + b.vgv, 0)), itens: semPisteiro.map(l => ({ data: l.data, leilao: l.leilao, lote: l.lote, vgv: l.vgv })) },
        valor_zero: { n: valorZero.length, itens: valorZero.map(l => ({ data: l.data, leilao: l.leilao, lote: l.lote })) },
        so_em_clientes: soEmClientes,
        a_definir_erp: aDefinirErp,
        fechamentos_complemento: (fechamentos || []).filter(ehComplemento).length,
        por_zona: {
            n: porZona.length, vgv: r2(porZona.reduce((a, b) => a + Number(b.vgv_total || 0), 0)),
            por_mes: porZonaMes,
            leiloes: porZona.map(f => ({ data: f.data, nome: f.nome, vgv: r2(f.vgv_total) })),
        },
    },
}
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(dados, null, 1))

const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
for (const m of meses) {
    console.log(`\n### ${m.mes}  painel ${brl(m.totais.painel.vgv)} (${m.totais.painel.lotes} lotes) · remates ${brl(m.totais.remates.vgv)} · TOTAL ${brl(m.totais.total.vgv)}`)
    for (const p of m.total.slice(0, 12)) console.log(`   ${p.pessoa.padEnd(34)} ${brl(p.vgv).padStart(14)} ${String(p.lotes).padStart(3)} lotes ${String(p.animais).padStart(4)} ani`)
}
console.log('\n=== CONSOLIDADO abr-ago ===')
for (const p of consolidado.total) console.log(`   ${p.pessoa.padEnd(34)} ${brl(p.vgv).padStart(14)} ${String(p.lotes).padStart(4)} lotes ${String(p.animais).padStart(4)} ani`)
console.log('\n=== conferencia HastaPro FIL2 x ERP (dif >= 1) ===')
for (const c of conferencia) console.log(`   ${c.pessoa.padEnd(34)} HP ${brl(c.hastapro).padStart(14)}  ERP ${brl(c.erp).padStart(14)}  dif ${brl(c.dif).padStart(14)}`)
console.log('\nqualidade:', JSON.stringify({ ...dados.qualidade, sem_pisteiro: dados.qualidade.sem_pisteiro.n, valor_zero: dados.qualidade.valor_zero.n }, null, 1))
console.log(`→ ${OUT}/dados.json`)
