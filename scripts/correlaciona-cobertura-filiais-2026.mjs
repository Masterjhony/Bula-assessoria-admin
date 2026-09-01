/**
 * QUEM COBRIU O QUE — resolve a "zona cinzenta" por correlacao, sem depender
 * de decisao previa.
 *
 * A pergunta: dos lotes vendidos pela equipe da Bula DENTRO de pregoes da
 * filial '01' (Bula Remates), quais sao receita da Bula Assessoria?
 *
 * A prova nao esta no HastaPro (titulo nao cruza filial: sao zero nos dois
 * sentidos). Esta na aba Leiloes da planilha do financeiro, que e a lista do
 * que a Bula COBROU — com leiloeira, VENDAS BULA, %, receita e o numero da NF.
 * Se o evento foi cobrado, a cobertura era da Assessoria, esteja o leilao na
 * filial que estiver.
 *
 * ⭐ A REGRA QUE DECIDE, e que ja estava no banco: QUEM PAGOU A COMISSAO DO
 * LOTE. O titulo de comissao nasce na filial que pagou. Em 2026, NENHUM leilao
 * da FIL 01 teve comissao paga pela FIL 2 — a Assessoria nunca comissionou
 * venda em pregao da Remates.
 *
 * Cascata de evidencia por leilao (a primeira que responder decide):
 *   1. comissao do leilao paga pela FIL 2       -> ASSESSORIA
 *   2. cobrado na planilha (nome + data, com NF)-> ASSESSORIA
 *   3. fechamento no ERP com receita_bula       -> ASSESSORIA
 *   4. comissao paga so pela FIL 01             -> REMATES
 *   5. nenhuma das anteriores                   -> A DECIDIR (o residuo real)
 *
 * Uso: node scripts/correlaciona-cobertura-filiais-2026.mjs [caminho-do-xlsx]
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Firebird from 'node-firebird'
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const n = v => Number(v || 0)
const r2 = v => Math.round(n(v) * 100) / 100
const ch = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const PARTICULAS = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'LEILAO', 'VIRTUAL', 'ETAPA', 'EDICAO'])
const partes = s => ch(s).split(' ').filter(w => w.length > 2 && !PARTICULAS.has(w))

/* ------------------------------------------------------------- HastaPro   */
const fbOpts = {
    host: env.HASTAPRO_HOST, port: Number(env.HASTAPRO_PORT || 3050), database: env.HASTAPRO_DATABASE,
    user: env.HASTAPRO_USER || 'SYSDBA', password: env.HASTAPRO_PASSWORD, encoding: 'NONE',
}
const dec = v => (Buffer.isBuffer(v) ? v.toString('latin1').trim() : (v instanceof Date ? v.toISOString().slice(0, 10) : v))
const db = await new Promise((res, rej) => Firebird.attach(fbOpts, (e, d) => (e ? rej(e) : res(d))))
const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => (e ? rej(e)
    : res((r || []).map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, dec(v)])))))))

const ATE = '2026-08-31'
const PRE = Object.fromEntries((await q('SELECT PRE_CODIGO,PRE_NOME FROM PRESTADORES')).map(p => [p.PRE_CODIGO, p.PRE_NOME]))
const LEIS = await q(`SELECT LEI_CODIGO,LEI_NOME,LEI_DATA,FIL_CODIGO,LEI_LOCAL,LEI_UF FROM LEILAO
    WHERE LEI_DATA BETWEEN '2026-01-01' AND '${ATE}'`)
const TITULOS = await q(`SELECT FIL_CODIGO,TIT_DESCRICAO,TIT_VALOR,TIT_DT_VENCTO,LEI_CODIGO FROM FIN_TITULOS
    WHERE TIT_TIPO='D' AND TIT_DT_VENCTO>='2026-01-01' AND LEI_CODIGO IS NOT NULL`)
const LOTES = await q(`SELECT FIL_CODIGO,LEI_CODIGO,LOT_LOTE,LOT_TOTAL,LOT_DATA_VENDA,LOT_PISTEIRO
    FROM LOTES WHERE LOT_DATA_VENDA BETWEEN '2026-01-01' AND '${ATE}'`)
const ASS = await q('SELECT FIL_CODIGO,LEI_CODIGO,LOT_LOTE,PRE_CODIGO,COMISSAO,TIPO FROM ASSESSORIA')
db.detach()

const AK = new Map()
for (const a of ASS) AK.set([a.FIL_CODIGO, a.LEI_CODIGO, a.LOT_LOTE, a.TIPO].join('|'), a)
const assessorDe = l => PRE[AK.get([l.FIL_CODIGO, l.LEI_CODIGO, l.LOT_LOTE, 'VENDA'].join('|'))?.PRE_CODIGO] || PRE[l.LOT_PISTEIRO] || ''

/* ------------------------------------------------- quem e da equipe (ERP) */
const { data: folha } = await sb.from('erp_folha_estrutura').select('nome,apelidos')
const { data: fech } = await sb.from('bula_leilao_fechamento')
    .select('id,data,nome,vgv_total,receita_bula,por_assessor').gte('data', '2026-01-01').lte('data', ATE)
const doErp = [...new Set((fech || []).flatMap(f => (f.por_assessor || []).map(a => a?.nome || a?.assessor || '')))]
const CONHECIDOS = [...(folha || []).flatMap(p => [p.nome, ...(Array.isArray(p.apelidos) ? p.apelidos : [])]), ...doErp]
    .filter(Boolean).map(partes).filter(a => a.length >= 2)
const APELIDO_UNICO = new Set(['BULINHA', 'PERALTA', 'LAILA', 'NANE', 'RUSA'])
const daEquipe = nome => {
    const a = partes(nome)
    if (!a.length) return false
    if (a.some(w => APELIDO_UNICO.has(w))) return true
    return CONHECIDOS.some(b => a.filter(w => b.includes(w)).length >= 2)
}
const PISTA_DA_REMATES = [/BULINHA|FELIPE VILELA|FELIPE ANDRADE/i, /PERALTA/i, /LUCAS MARTINS/i, /LAILA/i]
const naPista = nome => PISTA_DA_REMATES.some(re => re.test(nome))

/* --------------------------------------------- a planilha do financeiro   */
const XLSX = process.argv[2] || path.join(os.homedir(), 'Downloads', 'FINANCEIRO BULA 2026.xlsx')
const wbIn = new ExcelJS.Workbook()
await wbIn.xlsx.readFile(XLSX)
const wsL = wbIn.worksheets.find(w => /leil/i.test(w.name))
const MES = { JANEIRO: 1, FEVEREIRO: 2, 'MARÇO': 3, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12 }
const val = (row, c) => { const v = row.getCell(c).value; return v && typeof v === 'object' && 'result' in v ? v.result : v }
const COBRADOS = []
wsL.eachRow((row, i) => {
    if (i === 1) return
    const nome = val(row, 3)
    if (!nome) return
    const mes = MES[ch(val(row, 2))] || 0
    const dia = Number(val(row, 1)) || 0
    COBRADOS.push({
        dia, mes, nome: String(nome).trim(), leiloeira: String(val(row, 4) ?? '').trim(),
        faturamento: n(val(row, 7)), vendasBula: n(val(row, 8)),
        pctVendas: n(val(row, 11)), pctFat: n(val(row, 12)), status: String(val(row, 14) ?? '').trim(),
        receita: n(val(row, 15)), comissao: n(val(row, 17)), obs: String(val(row, 19) ?? '').trim(),
    })
})

/* -------------------------------------------------------- o casamento     */
/** Dois eventos são o mesmo se a data bate (±3 dias) e o nome compartilha marca. */
const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 864e5)
const mesmoEvento = (lei, cob) => {
    if (!cob.mes || !cob.dia) return false
    const dataCob = `2026-${String(cob.mes).padStart(2, '0')}-${String(cob.dia).padStart(2, '0')}`
    if (dias(lei.LEI_DATA, dataCob) > 3) return false
    const a = partes(lei.LEI_NOME), b = partes(cob.nome)
    const comuns = a.filter(w => b.includes(w)).length
    return comuns >= 2 || (comuns === 1 && Math.min(a.length, b.length) === 1)
}
const cobrancaDe = lei => COBRADOS.filter(c => mesmoEvento(lei, c))
/* Quem pagou a comissao daquele leilao — a evidencia mais forte que existe. */
const comisPorLeilao = {}
for (const t of TITULOS.filter(t => /COMISS|COMISAO|CAPTA|REF VENDA/i.test(t.TIT_DESCRICAO || ''))) {
    if (!t.LEI_CODIGO) continue
    const c = (comisPorLeilao[t.LEI_CODIGO] ??= { f01: 0, f2: 0 })
    if (t.FIL_CODIGO === '01') c.f01 += n(t.TIT_VALOR)
    else if (t.FIL_CODIGO === '2') c.f2 += n(t.TIT_VALOR)
}
const fechamentoDe = lei => (fech || []).find(f => dias(f.data, lei.LEI_DATA) <= 3
    && partes(f.nome).filter(w => partes(lei.LEI_NOME).includes(w)).length >= 2)

/* ------------------------------------------------------ o veredito        */
const lotesDe = lei => LOTES.filter(l => l.LEI_CODIGO === lei.LEI_CODIGO && l.FIL_CODIGO === lei.FIL_CODIGO)
const vgv = ls => r2(ls.reduce((s, l) => s + n(l.LOT_TOTAL), 0))
const LINHAS = []
for (const lei of LEIS.filter(l => l.FIL_CODIGO === '01')) {
    const ls = lotesDe(lei)
    const daBula = ls.filter(l => daEquipe(assessorDe(l)))
    const cinza = daBula.filter(l => !naPista(assessorDe(l)))
    if (!cinza.length) continue
    const cobs = cobrancaDe(lei)
    const f = fechamentoDe(lei)
    const receitaCobrada = r2(cobs.reduce((s, c) => s + c.receita, 0))
    const vendasBula = r2(cobs.reduce((s, c) => s + c.vendasBula, 0))
    const com = comisPorLeilao[lei.LEI_CODIGO] || { f01: 0, f2: 0 }
    const veredito = com.f2 > 0 ? 'ASSESSORIA (comissão paga pela FIL 2)'
        : cobs.length ? 'ASSESSORIA (cobrado, com NF)'
            : f && n(f.receita_bula) ? 'ASSESSORIA (fechamento)'
                : com.f01 > 0 ? 'REMATES (comissão paga pela FIL 01)'
                    : 'A DECIDIR'
    LINHAS.push({
        data: lei.LEI_DATA, leilao: lei.LEI_NOME, uf: lei.LEI_UF || '',
        lotesCinza: cinza.length, vgvCinza: vgv(cinza),
        quem: [...new Set(cinza.map(l => assessorDe(l).split(' ').filter(w => !PARTICULAS.has(ch(w))).slice(0, 2).join(' ')))].join(', '),
        veredito, comissaoFil01: r2(com.f01), comissaoFil2: r2(com.f2),
        leiloeira: cobs[0]?.leiloeira || '', vendasBula, receitaCobrada,
        pct: cobs[0]?.pctVendas || cobs[0]?.pctFat || 0, nf: cobs.map(c => c.obs).filter(Boolean).join(' · '),
        status: cobs[0]?.status || '', fechamento: f ? f.nome : '',
    })
}
LINHAS.sort((a, b) => b.vgvCinza - a.vgvCinza)

const grupo = v => LINHAS.filter(l => l.veredito.startsWith(v))
const somaV = ls => r2(ls.reduce((s, l) => s + l.vgvCinza, 0))
const somaR = ls => r2(ls.reduce((s, l) => s + l.receitaCobrada, 0))

/* Do outro lado: eventos cobrados na planilha que NAO existem na FIL 2 —
   sinal de que a cobertura estava na '01' o tempo todo. */
const leiFil2 = LEIS.filter(l => l.FIL_CODIGO === '2')
/* Linha de evento de verdade: tem data, tem receita e nao e total nem parcela. */
const eventoValido = c => c.dia && c.mes && c.receita > 0 && !/^TOTAL|^\d\/\d /i.test(c.nome)
const semLeilaoNaFil2 = COBRADOS.filter(c => eventoValido(c) && !leiFil2.some(l => mesmoEvento(l, c)))
const cobradosNaFil01 = semLeilaoNaFil2.filter(c => LEIS.some(l => l.FIL_CODIGO === '01' && mesmoEvento(l, c)))
const cobradosSemLeilao = semLeilaoNaFil2.filter(c => !LEIS.some(l => mesmoEvento(l, c)))

/* --------------------------------------------------------------- saida    */
const out = {
    gerado: new Date().toISOString().slice(0, 10),
    zona_cinzenta: { leiloes: LINHAS.length, vgv: somaV(LINHAS) },
    veredito: {
        assessoria: { leiloes: grupo('ASSESSORIA').length, vgv: somaV(grupo('ASSESSORIA')), receita: somaR(grupo('ASSESSORIA')) },
        remates: { leiloes: grupo('REMATES').length, vgv: somaV(grupo('REMATES')) },
        a_decidir: { leiloes: grupo('A DECIDIR').length, vgv: somaV(grupo('A DECIDIR')) },
    },
    planilha: {
        eventos_cobrados: COBRADOS.filter(eventoValido).length,
        receita_total: r2(COBRADOS.filter(eventoValido).reduce((s, c) => s + c.receita, 0)),
        por_leiloeira: Object.entries(COBRADOS.filter(eventoValido).reduce((a, c) => {
            const k = c.leiloeira || '(não informada)'
            ;(a[k] ??= { n: 0, receita: 0 }); a[k].n++; a[k].receita = r2(a[k].receita + c.receita); return a
        }, {})).sort((x, y) => y[1].receita - x[1].receita).map(([k, v]) => ({ leiloeira: k, ...v })),
        cobrados_que_estao_na_fil01: { n: cobradosNaFil01.length, receita: r2(cobradosNaFil01.reduce((s, c) => s + c.receita, 0)) },
        cobrados_sem_leilao_no_hastapro: { n: cobradosSemLeilao.length, receita: r2(cobradosSemLeilao.reduce((s, c) => s + c.receita, 0)) },
    },
    linhas: LINHAS,
    cobrados_na_fil01: cobradosNaFil01,
    cobrados_sem_leilao: cobradosSemLeilao,
}
fs.mkdirSync('outputs/cobertura-filiais-2026', { recursive: true })
fs.writeFileSync('outputs/cobertura-filiais-2026/correlacao.json', JSON.stringify(out, null, 1))

const brl = v => n(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
console.log('== ZONA CINZENTA:', LINHAS.length, 'leiloes da FIL 01 com lote da equipe |', brl(somaV(LINHAS)), 'de VGV ==\n')
for (const v of ['ASSESSORIA (comissão', 'ASSESSORIA (cobrado', 'ASSESSORIA (fechamento', 'REMATES', 'A DECIDIR']) {
    const g = grupo(v)
    console.log(`${v.padEnd(34)} ${String(g.length).padStart(3)} leiloes | VGV ${brl(somaV(g)).padStart(12)} | receita cobrada ${brl(somaR(g)).padStart(10)}`)
}
console.log('\n-- detalhe --')
for (const l of LINHAS) console.log(' ', l.data, l.veredito.slice(0, 22).padEnd(24), brl(l.vgvCinza).padStart(10),
    l.leilao.slice(0, 34).padEnd(34), '|', l.quem.slice(0, 28).padEnd(28), '|', l.nf || l.status || '')
console.log('\n== planilha: eventos cobrados que NAO estao na FIL 2 ==')
console.log('  estao na FIL 01 :', cobradosNaFil01.length, 'eventos | receita', brl(cobradosNaFil01.reduce((s, c) => s + c.receita, 0)))
console.log('  sem leilao nenhum:', cobradosSemLeilao.length, 'eventos | receita', brl(cobradosSemLeilao.reduce((s, c) => s + c.receita, 0)))
console.log('\nJSON → outputs/cobertura-filiais-2026/correlacao.json')
