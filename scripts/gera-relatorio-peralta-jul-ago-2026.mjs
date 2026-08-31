/**
 * VENDAS E COMISSOES DO PERALTA — julho/agosto de 2026.
 *
 * Apura a partir de DUAS fontes e cruza uma contra a outra:
 *   HastaPro (Firebird, so leitura) → LOTES com LOT_PISTEIRO = Peralta.
 *   ERP (Supabase)                  → bula_leilao_fechamento + erp_contas_pagar + extrato.
 *
 * A separacao por filial nao e detalhe: FIL '2' e a cobertura da Bula
 * Assessoria e gera comissao; FIL '01' e pregao da Bula Remates, onde o
 * Peralta esta na pista PELA REMATES (decisao do Joao em 26/08/2026, gravada
 * em PISTA_DA_REMATES no importa-fechamento-hastapro.mts) e por isso nao vira
 * cobertura da Assessoria.
 *
 * Saida: outputs/peralta-jul-ago-2026/dados.json — nenhum numero escrito a mao.
 */
import fs from 'node:fs'
import path from 'node:path'
import Firebird from 'node-firebird'
import { createClient } from '@supabase/supabase-js'

const INI = '2026-07-01', FIM = '2026-08-31'
const PERALTA_HP = '250930184945119'          // PRESTADORES.PRE_CODIGO
const OUT = 'outputs/peralta-jul-ago-2026'

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

/* ── HastaPro ────────────────────────────────────────────────────────────── */
const FB = {
    host: process.env.HASTAPRO_HOST, port: +process.env.HASTAPRO_PORT,
    database: process.env.HASTAPRO_DATABASE, user: process.env.HASTAPRO_USER,
    password: process.env.HASTAPRO_PASSWORD, lowercase_keys: true,
}
const txt = v => (Buffer.isBuffer(v) ? v.toString('latin1') : v)
const norm = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, txt(v)]))
async function abre() {
    const db = await new Promise((res, rej) => Firebird.attach(FB, (e, d) => e ? rej(e) : res(d)))
    return { db, q: sql => new Promise((res, rej) => db.query(sql, [], (e, r) => e ? rej(e) : res(r.map(norm)))) }
}

const iso = d => new Date(d).toISOString().slice(0, 10)
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000)

const { db, q } = await abre()
const lotes = await q(`
    select l.FIL_CODIGO fil, l.LEI_CODIGO lei, l.LEI_NOME leilao, l.LEI_DATA data_leilao, l.LEI_UF uf,
           lo.LOT_LOTE lote, lo.LOT_DATA_VENDA data_venda, lo.LOT_QTD qtd, lo.LOT_LANCE lance,
           lo.LOT_TOTAL total, lo.CON_CODIGO con
      from LOTES lo
      join LEILAO l on l.LEI_CODIGO = lo.LEI_CODIGO and l.FIL_CODIGO = lo.FIL_CODIGO
     where lo.LOT_PISTEIRO = '${PERALTA_HP}'
       and lo.LOT_DATA_VENDA >= '${INI}' and lo.LOT_DATA_VENDA <= '${FIM}'
     order by lo.LOT_DATA_VENDA`)
const compradores = await q(`
    select c.FIL_CODIGO fil, c.LEI_CODIGO lei, c.LOT_LOTE lote, c.COP_PORCENTAGEM pct,
           cl.CLI_NOME nome, cl.CLI_UF uf
      from COMPRADORES c left join CLIENTES cl on cl.CLI_CODIGO = c.CLI_CODIGO`)
const condicoes = await q(`select FIL_CODIGO fil, LEI_CODIGO lei, CON_CODIGO con, CON_CAPTACAO cap, CON_PARCELAS parc from CONDICOES`)
const prestadores = new Map((await q(`select PRE_CODIGO c, PRE_NOME n from PRESTADORES`)).map(p => [String(p.c), String(p.n).trim()]))
/* todo lote vendido no periodo, para saber a quem o HastaPro da um valor que o ERP credita ao Peralta */
const universo = await q(`
    select l.FIL_CODIGO fil, l.LEI_NOME leilao, l.LEI_DATA data, lo.LOT_LOTE lote, lo.LOT_TOTAL tot, lo.LOT_PISTEIRO p
      from LOTES lo join LEILAO l on l.LEI_CODIGO = lo.LEI_CODIGO and l.FIL_CODIGO = lo.FIL_CODIGO
     where lo.LOT_DATA_VENDA >= '${INI}' and lo.LOT_DATA_VENDA <= '${FIM}'`)
db.detach()

const idxComp = new Map()
for (const c of compradores) {
    const k = `${String(c.fil).trim()}|${c.lei}|${String(c.lote).trim()}`
    if (!idxComp.has(k)) idxComp.set(k, [])
    idxComp.get(k).push({ nome: String(c.nome || '').trim(), uf: c.uf, pct: Number(c.pct || 100) })
}
const idxCond = new Map(condicoes.map(c => [`${String(c.fil).trim()}|${c.lei}|${c.con}`, c]))

const hp = lotes.map(r => {
    const fil = String(r.fil).trim()
    const cd = idxCond.get(`${fil}|${r.lei}|${r.con}`)
    return {
        filial: fil, leilao: String(r.leilao).trim(), uf: r.uf,
        data: iso(r.data_leilao), data_venda: iso(r.data_venda),
        lote: String(r.lote).trim(), qtd: Number(r.qtd || 0), lance: Number(r.lance || 0),
        vgv: r2(r.total), captacao: cd ? Number(cd.cap) : null, parcelas: cd ? Number(cd.parc) : null,
        compradores: idxComp.get(`${fil}|${r.lei}|${String(r.lote).trim()}`) || [],
    }
})

/* ── ERP ─────────────────────────────────────────────────────────────────── */
const ehPeralta = n => /peralta/i.test(String(n || ''))
const { data: folha } = await sb.from('erp_folha_estrutura').select('nome,apelidos,comissao_pct,ativo').ilike('nome', '%PERALTA%')
const PCT = Number(folha?.[0]?.comissao_pct ?? 2) / 100

const { data: fechamentos } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,data,vgv_total,por_assessor,lances,origem,observacoes')
    .gte('data', INI).lte('data', FIM).order('data')

const noErp = []
for (const f of fechamentos || []) {
    const linha = (Array.isArray(f.por_assessor) ? f.por_assessor : []).filter(a => ehPeralta(a.nome || a.assessor))
    if (!linha.length) continue
    noErp.push({
        id: f.id, leilao: f.nome, data: f.data, origem: f.origem,
        rotulo: String(linha[0].nome || linha[0].assessor),
        vgv: r2(linha.reduce((a, b) => a + Number(b.vgv || 0), 0)),
        comissao: r2(linha.reduce((a, b) => a + Number(b.comissao || 0), 0)),
        pct: Number(linha[0].comissao_pct ?? PCT),
        lances: (Array.isArray(f.lances) ? f.lances : []).filter(l => ehPeralta(l.assessor))
            .map(l => ({ lote: String(l.lote), vgv: r2(l.vgv), comprador: l.comprador || '', assessor: String(l.assessor) })),
    })
}

const { data: titulos } = await sb.from('erp_contas_pagar')
    .select('id,descricao,valor,vencimento,status,data_pagamento,numero_documento,fechamento_id,observacoes,tags,updated_at')
    .ilike('descricao', '%PERALTA%').order('vencimento')
const { data: extrato } = await sb.from('erp_movimentos_bancarios')
    .select('data,valor,descricao,tipo').ilike('descricao', '%peralta%').gte('data', '2026-01-01').order('data')
const { data: pessoas } = await sb.from('erp_pessoas').select('id,nome').ilike('nome', '%peralta%')

/* comissao de junho — o titulo cancelado que ficou sem substituto */
const { data: junho } = await sb.from('erp_contas_pagar')
    .select('descricao,valor,vencimento,status,observacoes,updated_at,fechamento_id')
    .ilike('descricao', '%PERALTA%').eq('status', 'cancelado')

/* ── cruzamento lote a lote (FIL 2 e o universo que gera comissao) ───────── */
const fil2 = hp.filter(l => l.filial === '2')
const todosLances = []
for (const f of fechamentos || [])
    for (const l of (Array.isArray(f.lances) ? f.lances : []))
        todosLances.push({
            fech: f.nome, data: f.data, lote: String(l.lote || '').replace(/^0+/, ''),
            vgv: r2(l.vgv), assessor: String(l.assessor || ''), comprador: l.comprador || '',
        })

/**
 * Casar SÓ por valor inventa correspondência: no 28º Naviraí Camparino há três
 * lotes de R$ 48.000 no mesmo dia, dois deles do Lucas Martins. O número do
 * lote é o discriminador — sem ele, o lote 78 do Peralta "virava" lote do
 * Lucas e a falta sumia do relatório. Exigimos lote igual; valor divergente no
 * mesmo lote é achado, não motivo para descasar.
 */
const cruzamento = fil2.map(lote => {
    const n = lote.lote.replace(/^0+/, '')
    const cands = todosLances.filter(l => l.lote === n && dias(l.data, lote.data) <= 3)
    const exato = cands.find(l => l.vgv === lote.vgv) || cands[0] || null
    return {
        ...lote,
        erp: exato ? { fechamento: exato.fech, data: exato.data, lote: exato.lote, vgv: exato.vgv, assessor: exato.assessor } : null,
        situacao: !exato ? 'ausente' : !ehPeralta(exato.assessor) ? 'outro-assessor'
            : exato.vgv !== lote.vgv ? 'valor-divergente' : 'confere',
    }
})

/* o inverso: lance que o ERP da ao Peralta e o HastaPro nao confirma */
const soErp = []
for (const f of noErp)
    for (const l of f.lances) {
        const n = String(l.lote).replace(/^0+/, '')
        if (fil2.some(x => x.lote.replace(/^0+/, '') === n && dias(x.data, f.data) <= 3)) continue
        const perto = universo
            .filter(u => String(u.lote).trim().replace(/^0+/, '') === n && r2(u.tot) === l.vgv && dias(iso(u.data), f.data) <= 3)
            .map(u => ({
                filial: String(u.fil).trim(), leilao: String(u.leilao).trim(),
                lote: String(u.lote).trim(), pisteiro: prestadores.get(String(u.p)) || String(u.p ?? '—'),
            }))
        soErp.push({ ...l, fechamento: f.leilao, data: f.data, hastapro: perto })
    }

/* ── consolidação ────────────────────────────────────────────────────────── */
const soma = (arr, k = 'vgv') => r2(arr.reduce((a, b) => a + Number(b[k] || 0), 0))
const agrupa = arr => {
    const m = new Map()
    for (const l of arr) {
        const k = `${l.data}|${l.leilao}`
        if (!m.has(k)) m.set(k, { data: l.data, leilao: l.leilao, uf: l.uf, lotes: [] })
        m.get(k).lotes.push(l)
    }
    return [...m.values()].sort((a, b) => a.data.localeCompare(b.data))
        .map(g => ({ ...g, n: g.lotes.length, cabecas: g.lotes.reduce((a, b) => a + b.qtd, 0), vgv: soma(g.lotes) }))
}
const fil01 = hp.filter(l => l.filial === '01')
const mes = (arr, m) => arr.filter(l => l.data.slice(0, 7) === m)
const rankCompradores = arr => {
    const m = new Map()
    for (const l of arr)
        for (const c of (l.compradores.length ? l.compradores : [{ nome: '(não informado)', uf: null, pct: 100 }])) {
            const k = c.nome || '(não informado)'
            if (!m.has(k)) m.set(k, { nome: k, uf: c.uf, vgv: 0, lotes: 0 })
            const x = m.get(k)
            x.vgv = r2(x.vgv + l.vgv * (c.pct || 100) / 100)
            x.lotes++
        }
    return [...m.values()].sort((a, b) => b.vgv - a.vgv)
}

const dados = {
    geradoEm: new Date().toISOString().slice(0, 10),
    periodo: { ini: INI, fim: FIM },
    pessoa: {
        nome: 'Peralta', hastapro: prestadores.get(PERALTA_HP) || '',
        pct: PCT, folha_ativo: folha?.[0]?.ativo ?? null,
        cadastro_fornecedor: (pessoas || []).length > 0,
    },
    fil2: {
        leiloes: agrupa(fil2), lotes: fil2.length, cabecas: fil2.reduce((a, b) => a + b.qtd, 0),
        vgv: soma(fil2), vgv_julho: soma(mes(fil2, '2026-07')), vgv_agosto: soma(mes(fil2, '2026-08')),
        comissao: r2(soma(fil2) * PCT), compradores: rankCompradores(fil2),
    },
    fil01: {
        leiloes: agrupa(fil01), lotes: fil01.length, cabecas: fil01.reduce((a, b) => a + b.qtd, 0),
        vgv: soma(fil01), vgv_julho: soma(mes(fil01, '2026-07')), vgv_agosto: soma(mes(fil01, '2026-08')),
        equivalente: r2(soma(fil01) * PCT), compradores: rankCompradores(fil01).slice(0, 10),
    },
    erp: {
        fechamentos: noErp, vgv: soma(noErp), comissao: soma(noErp, 'comissao'),
        titulos: (titulos || []).map(t => ({
            descricao: t.descricao, valor: r2(t.valor), vencimento: t.vencimento, status: t.status,
            pago_em: t.data_pagamento, doc: t.numero_documento, obs: t.observacoes,
            tags: t.tags, atualizado: t.updated_at ? t.updated_at.slice(0, 10) : null,
        })),
        extrato: (extrato || []).map(m => ({ data: m.data, valor: r2(m.valor), descricao: m.descricao, tipo: m.tipo })),
        cancelado_junho: (junho || []).map(t => ({
            descricao: t.descricao, valor: r2(t.valor), obs: t.observacoes,
            atualizado: t.updated_at ? t.updated_at.slice(0, 10) : null,
        })),
    },
    cruzamento, soErp,
}
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(dados, null, 1))

const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
console.log(`Peralta = ${dados.pessoa.hastapro} · ${(PCT * 100).toFixed(0)}% · ${INI}..${FIM}`)
console.log(`FIL 2  (Bula Assessoria): ${dados.fil2.lotes} lotes · ${brl(dados.fil2.vgv)} · comissão ${brl(dados.fil2.comissao)}`)
console.log(`FIL 01 (Bula Remates):    ${dados.fil01.lotes} lotes · ${brl(dados.fil01.vgv)} (fora da comissão da Assessoria)`)
console.log(`ERP reconhece: ${brl(dados.erp.vgv)} de VGV · ${brl(dados.erp.comissao)} de comissão em ${noErp.length} fechamentos`)
console.log(`Divergências: ${cruzamento.filter(c => c.situacao !== 'confere').length} lote(s) do HastaPro sem crédito · ${soErp.length} lance(s) do ERP sem lastro`)
for (const c of cruzamento.filter(c => c.situacao !== 'confere'))
    console.log(`   HP→  ${c.data} ${c.leilao} lt${c.lote} ${brl(c.vgv)} :: ${c.situacao}${c.erp ? ' (' + c.erp.assessor + ')' : ''}`)
for (const s of soErp)
    console.log(`   ERP→ ${s.data} ${s.fechamento} lt${s.lote} ${brl(s.vgv)} :: HastaPro diz ${(s.hastapro || []).map(h => h.pisteiro).join(' / ') || 'nada'}`)
console.log(`→ ${OUT}/dados.json`)
