/**
 * VENDAS DE AGOSTO/2026 — apuração consolidada das TRÊS fontes.
 *
 * Pedido do Marcelo (31/08, grupo Financeiro): "sobe esse trem e depois faz
 * reunião. Temos que matar Agosto agora... temos que atualizar os assessores
 * se batemos ou não a meta."
 *
 * As três fontes, e o que cada uma sabe que as outras não sabem:
 *
 *  1. HASTAPRO — filial '2' (Bula Assessoria). É a fonte do painel que circula
 *     no grupo (LOTES agrupados por LOT_PISTEIRO). É a única auditável lote a
 *     lote, mas só enxerga o que já foi lançado. A filial '01' (Bula Remates)
 *     entra em bloco SEPARADO: ali a Assessoria cobre lotes, ganha comissão, e
 *     o painel nunca mostra.
 *  2. WEB-BULA (ERP) — bula_leilao_fechamento. Tem leilões que não existem na
 *     FIL '2' e carrega o acordo/comissão. Mas a atribuição por assessor dele
 *     não é confiável: parte dos fechamentos deduziu o vendedor pela UF.
 *  3. WHATSAPP — bula_leilao_vendas, extraído dos grupos de lances em tempo
 *     real. É a ÚNICA fonte nas primeiras 24-48h ("os que tenho por fora
 *     aqui", do João). Não é auditável sozinha: o parser já dobrou valor e
 *     subavaliou lote multi-animal.
 *
 * Regra de ouro: VGV sai do HastaPro (LOT_TOTAL, nunca recalculado); o que só
 * existe no ERP ou no WhatsApp entra como PENDENTE DE LANÇAMENTO, somado à
 * parte, com a divergência escrita.
 *
 * Saída: outputs/vendas-agosto-2026/dados.json
 */
import fs from 'node:fs'
import path from 'node:path'
import Firebird from 'node-firebird'
import { createClient } from '@supabase/supabase-js'

const INI = '2026-08-01', FIM = '2026-08-31'
const OUT = 'outputs/vendas-agosto-2026'
/** Meta oficial de agosto: 12% de cobertura sobre a agenda (Marcelo, 04/08). */
const META = { pct: 0.12, agenda_completa: 68024400, agenda_divulgada: 57294800 }

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

const iso = d => d ? new Date(d).toISOString().slice(0, 10) : null
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const chave = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/* ── 1. HastaPro ─────────────────────────────────────────────────────────── */
/* LOT_TOTAL já é lance x parcelas x quantidade — nunca recalcular. */
const sqlLotes = fil => `
    select l.LEI_NOME leilao, l.LEI_DATA data_leilao, l.LEI_CODIGO cod,
           lo.LOT_LOTE lote, lo.LOT_DATA_VENDA dv, lo.LOT_QTD qtd, lo.LOT_TOTAL total,
           lo.LOT_LANCE lance, lo.LOT_PISTEIRO p
      from LOTES lo join LEILAO l on l.LEI_CODIGO = lo.LEI_CODIGO and l.FIL_CODIGO = lo.FIL_CODIGO
     where l.FIL_CODIGO = '${fil}' and l.LEI_DATA >= '${INI}' and l.LEI_DATA <= '${FIM}'`
const cruLotes2 = await q(sqlLotes('2'))
const cruLotes01 = await q(sqlLotes('01'))

/* Lotes da FIL '2' vendidos em agosto mas de leilão de OUTRO mês: o painel usa
 * a data de venda, o fechamento usa a data do leilão — e os dois divergem. */
const vendaForaDoMes = await q(`
    select l.LEI_NOME leilao, l.LEI_DATA data_leilao, lo.LOT_LOTE lote,
           lo.LOT_DATA_VENDA dv, lo.LOT_TOTAL total, lo.LOT_QTD qtd, lo.LOT_PISTEIRO p
      from LOTES lo join LEILAO l on l.LEI_CODIGO = lo.LEI_CODIGO and l.FIL_CODIGO = lo.FIL_CODIGO
     where l.FIL_CODIGO = '2' and lo.LOT_DATA_VENDA >= '${INI}' and lo.LOT_DATA_VENDA <= '${FIM}'
       and (l.LEI_DATA < '${INI}' or l.LEI_DATA > '${FIM}')`)

/* Resolver o pisteiro por CLIENTES **com fallback** em PRESTADORES: o painel só
 * junta com PRESTADORES e é por isso que a Nane sai em branco nele. */
const codigos = [...new Set([...cruLotes2, ...cruLotes01, ...vendaForaDoMes]
    .map(l => String(l.p ?? '')).filter(c => c && c !== 'null'))]
const emLista = codigos.map(c => `'${c}'`).join(',')
const nomeCli = new Map((await q(`select CLI_CODIGO c, CLI_NOME n from CLIENTES where CLI_CODIGO in (${emLista})`))
    .map(x => [String(x.c), String(x.n).trim()]))
const nomePre = new Map((await q(`select PRE_CODIGO c, PRE_NOME n from PRESTADORES where PRE_CODIGO in (${emLista})`))
    .map(x => [String(x.c), String(x.n).trim()]))
db.detach()

const ALIAS = new Map([
    ['lm assessoria', 'Leonardo Serafim Francisco'],
    ['regiane cristina neves de abreu', 'Regiane C. N. de Abreu (Nane)'],
])
const nomeDoPisteiro = cod => {
    const bruto = nomeCli.get(cod) || nomePre.get(cod) || ''
    return bruto ? (ALIAS.get(chave(bruto)) || bruto) : null
}

/* ── quem é da equipe: a MESMA regra do importador de fechamento ──────────── */
/* Fonte = erp_folha_estrutura com comissao_pct > 0 (administrativo não vai a
 * pista). Reimplementar isso por lista fixa foi o que já trouxe R$ 4 mi de
 * pisteiro de terceiro para dentro do VGV. */
const { data: folha } = await sb.from('erp_folha_estrutura').select('nome, apelidos, pagamento_nome, comissao_pct, ativo')
const equipe = (folha ?? []).filter(f => Number(f.comissao_pct || 0) > 0).map(f => ({
    nome: String(f.nome), pct: Number(f.comissao_pct || 0),
    tokens: [f.nome, f.pagamento_nome, ...((f.apelidos) ?? [])].filter(Boolean).map(n => chave(n)).filter(Boolean),
}))
const PARTICULAS = new Set(['de', 'da', 'do', 'dos', 'das', 'e'])
const partes = s => s.split(' ').filter(w => w && !PARTICULAS.has(w))
/** Apelido de 1 palavra exige o nome; com 2+, primeiro nome igual E 1 sobrenome. */
const achaMembro = nomePisteiro => {
    const alvo = chave(nomePisteiro)
    if (!alvo) return null
    const pa = partes(alvo)
    for (const m of equipe) for (const t of m.tokens) {
        if (!t) continue
        if (alvo === t) return m
        const pt = partes(t)
        if (pt.length === 1) { if (pa.includes(pt[0])) return m; continue }
        if (pa.length < 2 || pa[0] !== pt[0]) continue
        const sobrenomes = new Set(pa.slice(1))
        if (pt.slice(1).some(w => sobrenomes.has(w))) return m
    }
    return null
}
/**
 * QUEM, NUM PREGÃO DA BULA REMATES, ESTÁ NA PISTA PELA REMATES.
 * Decisão do João em 26/08/2026, copiada de importa-fechamento-hastapro.mts —
 * é o que segura o São Geraldo de 01/08 em R$ 375.800 e não R$ 1,83 mi.
 * Se mudar lá, mudar aqui.
 */
const PISTA_DA_REMATES = ['BULINHA (FELIPE ANDRADE)', 'PERALTA', 'LUCAS MARTINS', 'LAILA']
const naPistaPelaRemates = nome => PISTA_DA_REMATES.some(n => chave(n) === chave(nome))

const linhaDe = (l, filial) => {
    const pisteiro = nomeDoPisteiro(String(l.p ?? ''))
    const membro = pisteiro ? achaMembro(pisteiro) : null
    return {
        filial, leilao: String(l.leilao).trim(), data: iso(l.data_leilao), data_venda: iso(l.dv),
        lote: String(l.lote ?? '').trim(), qtd: Number(l.qtd || 0), vgv: r2(l.total),
        lance: r2(l.lance), pisteiro, membro: membro ? membro.nome : null,
        pela_remates: !!(membro && naPistaPelaRemates(membro.nome)),
    }
}
const hp2 = cruLotes2.map(l => linhaDe(l, '2'))
const hp01Todos = cruLotes01.map(l => linhaDe(l, '01'))
/* Cobertura da Assessoria dentro do pregão da Remates: equipe, menos quem
 * estava ali pela Remates. */
const hp01 = hp01Todos.filter(l => l.membro && !l.pela_remates)
const hp01PelaRemates = hp01Todos.filter(l => l.pela_remates)

/* ── 2. ERP (web-bula) ───────────────────────────────────────────────────── */
const { data: fechamentos } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,data,vgv_total,lotes_vendidos,animais_vendidos,por_assessor,lances,origem,observacoes,comissao_assessoria,receita_bula,etapa')
    .gte('data', INI).lte('data', FIM).order('data')

/* ── 3. WhatsApp (grupos de lances) ──────────────────────────────────────── */
const { data: vendasWa } = await sb.from('bula_leilao_vendas')
    .select('id,leilao_data,lote,valor,animais,sexo,assessor,comprador,fazenda,cidade,uf,status,fonte,confidence,raw_text,cronograma_id')
    .gte('leilao_data', INI).lte('leilao_data', FIM).order('leilao_data')

/* ── canonicalização de nomes ────────────────────────────────────────────── */
const CANON = new Map([
    ['douglas bispo', 'Douglas Bispo Carvalho'], ['douglas', 'Douglas Bispo Carvalho'],
    ['douglas bispo carvalho', 'Douglas Bispo Carvalho'],
    ['fabio omena', 'Fabio de Omena Gaia'], ['fabio omena gaia', 'Fabio de Omena Gaia'],
    ['fabio omenna', 'Fabio de Omena Gaia'], ['fabio de omena gaia', 'Fabio de Omena Gaia'],
    ['fabio omena da bula assessoria', 'Fabio de Omena Gaia'], ['fabio', 'Fabio de Omena Gaia'],
    ['leonardo serafim', 'Leonardo Serafim Francisco'], ['leonardo', 'Leonardo Serafim Francisco'],
    ['leo', 'Leonardo Serafim Francisco'], ['leo serafim', 'Leonardo Serafim Francisco'],
    ['leozinho', 'Leonardo Serafim Francisco'], ['lm assessoria', 'Leonardo Serafim Francisco'],
    ['leonardo serafim francisco', 'Leonardo Serafim Francisco'],
    ['peralta', 'Luiz Felipe Peralta Garcez'], ['peralta bula', 'Luiz Felipe Peralta Garcez'],
    ['luiz felipe peralta garcez', 'Luiz Felipe Peralta Garcez'],
    ['lucas martins', 'Lucas Martins Durães Bragança'], ['lucas martins duraes braganca', 'Lucas Martins Durães Bragança'],
    ['laila', 'Laila de Sousa Oliveira'], ['laila oliveira', 'Laila de Sousa Oliveira'],
    ['laila de sousa oliveira', 'Laila de Sousa Oliveira'],
    ['nane', 'Regiane C. N. de Abreu (Nane)'], ['regiane cristina neves de abreu', 'Regiane C. N. de Abreu (Nane)'],
    ['regiane c n de abreu nane', 'Regiane C. N. de Abreu (Nane)'],
    ['gustavo rusa', 'Gustavo Rusa Pereira'], ['rusa', 'Gustavo Rusa Pereira'],
    ['gustavo rusa pereira', 'Gustavo Rusa Pereira'],
    ['bulinha', 'Felipe Vilela Andrade'], ['bulinha felipe andrade', 'Felipe Vilela Andrade'],
    ['felipe vilela andrade', 'Felipe Vilela Andrade'], ['felipe andrade', 'Felipe Vilela Andrade'],
    ['marcelo carneiro', 'Marcelo Carneiro'], ['marcelo', 'Marcelo Carneiro'],
    ['matheus amormino', 'Marcelo Carneiro'],
    ['matheus alves', 'Mateus Alves da Silva'], ['mateus alves', 'Mateus Alves da Silva'],
    ['mateus alves da silva', 'Mateus Alves da Silva'],
    ['valeria borges', 'Valéria Borges da Silva Araujo'], ['valeria', 'Valéria Borges da Silva Araujo'],
    ['valeria borges da silva araujo', 'Valéria Borges da Silva Araujo'],
])
/**
 * O grupo escreve o assessor em texto livre ("Com Douglas Bispo - Bula
 * Assessoria - Gilberto Sarubi", "Marcelo e Leozinho"). Reduzir ao primeiro
 * nome canônico que aparecer no texto.
 */
const canon = bruto => {
    const k = chave(bruto)
    if (!k) return null
    if (CANON.has(k)) return CANON.get(k)
    for (const [alvo, nome] of CANON) {
        if (alvo.length >= 4 && new RegExp(`(^| )${alvo}( |$)`).test(k)) return nome
    }
    return String(bruto || '').trim() || null
}

/* ── 4. agregações por pessoa ────────────────────────────────────────────── */
const somaPessoa = arr => {
    const m = new Map()
    for (const x of arr) {
        const k = x.pessoa || '(sem atribuição)'
        if (!m.has(k)) m.set(k, { pessoa: k, vgv: 0, lotes: 0, animais: 0 })
        const a = m.get(k)
        a.vgv = r2(a.vgv + x.vgv); a.lotes += x.lotes; a.animais += x.animais
    }
    return [...m.values()].sort((a, b) => b.vgv - a.vgv)
}
const tot = arr => ({
    vgv: r2(arr.reduce((a, b) => a + b.vgv, 0)),
    lotes: arr.reduce((a, b) => a + b.lotes, 0),
    animais: arr.reduce((a, b) => a + b.animais, 0),
})

const porPessoaHp2 = somaPessoa(hp2.map(l => ({ pessoa: l.pisteiro || '(sem pisteiro no HastaPro)', vgv: l.vgv, lotes: 1, animais: l.qtd })))
const porPessoaHp01 = somaPessoa(hp01.map(l => ({ pessoa: l.pisteiro, vgv: l.vgv, lotes: 1, animais: l.qtd })))
const porPessoaErp = somaPessoa((fechamentos || []).flatMap(f =>
    (Array.isArray(f.por_assessor) ? f.por_assessor : []).map(a => ({
        pessoa: canon(a.nome || a.assessor), vgv: r2(a.vgv), lotes: Number(a.transacoes || 0), animais: Number(a.animais || 0),
    }))))
/* WhatsApp: o VGV do grupo é INDICATIVO (parcela x 30 x animais). Serve para
 * ver O QUE existe, nunca para somar dinheiro — o número de parcelas varia. */
const waVgv = v => r2(Number(v.valor || 0) * 30 * Math.max(1, Number(v.animais || 1)))
const porPessoaWa = somaPessoa((vendasWa || []).map(v => ({
    pessoa: canon(v.assessor) || '(sem assessor na ficha)', vgv: waVgv(v), lotes: 1, animais: Number(v.animais || 1),
})))

/* ── 5. divergências, leilão a leilão ────────────────────────────────────── */
const STOP = new Set(['leilao', 'virtual', 'nelore', 'edicao', 'especial', 'convidados', 'anos',
    'selecao', '2026', 'etapa', 'fazenda', 'touros', 'femeas', 'matrizes', 'reprodutores', 'expogenetica'])
const toks = s => new Set(chave(s).split(' ').filter(w => w.length > 2 && !STOP.has(w)))
const agrupaLeilao = linhas => [...linhas.reduce((m, l) => {
    const k = `${l.data}|${l.leilao}`
    if (!m.has(k)) m.set(k, { nome: l.leilao, data: l.data, vgv: 0, lotes: 0, animais: 0, filial: l.filial })
    const a = m.get(k); a.vgv = r2(a.vgv + l.vgv); a.lotes += 1; a.animais += l.qtd
    return m
}, new Map()).values()].sort((a, b) => a.data.localeCompare(b.data))
const leiloesHp2 = agrupaLeilao(hp2)
const leiloesHp01Bula = agrupaLeilao(hp01)

/**
 * Casamento leilão HastaPro × fechamento do ERP, por PONTUAÇÃO — não pelo
 * primeiro critério que bater.
 *
 * A regra antiga ("valor idêntico ±3d antes do nome") existe porque as
 * etiquetas de etapa vivem trocadas entre as bases (Naviraí 1ª/2ª, EAO
 * fêmeas/touros). Mas valor sozinho inventa par quando dois leilões diferentes
 * fecham no mesmo número: o KATISPERA de 17/08 (117.000) casava com o CEN &
 * FAZENDA MODELO de 20/08 (117.000) e as duas divergências sumiam de vez.
 *
 * Pontos: nome em comum 3 · valor idêntico 2 · mesmo dia 1. Exige >= 2, e o
 * melhor par vence globalmente (não por ordem de varredura).
 */
const pontua = (h, f) => {
    const dias = Math.abs(new Date(h.data) - new Date(f.data)) / 86400000
    if (dias > 3) return null
    const tf = toks(f.nome), th = toks(h.nome)
    const nome = [...th].some(w => tf.has(w))
    const valor = Math.abs(h.vgv - Number(f.vgv_total || 0)) < 1
    const p = (nome ? 3 : 0) + (valor ? 2 : 0) + (dias === 0 ? 1 : 0)
    if (p < 2) return null
    return { pontos: p, como: [nome && 'nome', valor && 'valor', dias === 0 && 'mesmo dia'].filter(Boolean).join('+') }
}
const universo = [...leiloesHp2, ...leiloesHp01Bula].sort((a, b) => a.data.localeCompare(b.data))
const pares = []
for (const h of universo) for (const f of (fechamentos || [])) {
    const s = pontua(h, f)
    if (s) pares.push({ h, f, ...s })
}
pares.sort((a, b) => b.pontos - a.pontos)
const parDoHp = new Map(), fechUsados = new Set()
for (const p of pares) {
    if (parDoHp.has(p.h) || fechUsados.has(p.f.id)) continue
    parDoHp.set(p.h, p); fechUsados.add(p.f.id)
}
const cruzamento = universo.map(h => {
    const p = parDoHp.get(h)
    const wa = (vendasWa || []).filter(v => Math.abs(new Date(v.leilao_data) - new Date(h.data)) / 86400000 <= 1)
    return {
        data: h.data, leilao: h.nome, filial: h.filial,
        hp: { vgv: h.vgv, lotes: h.lotes, animais: h.animais },
        erp: p ? { vgv: r2(p.f.vgv_total), lotes: Number(p.f.lotes_vendidos || 0), nome: p.f.nome, origem: p.f.origem, casou_por: p.como, id: p.f.id } : null,
        wa: wa.length ? { lotes: wa.length, vgv_indicativo: r2(wa.reduce((s, v) => s + waVgv(v), 0)) } : null,
        dif_erp: p ? r2(Number(p.f.vgv_total || 0) - h.vgv) : null,
    }
})
/* Fechamentos do ERP sem par no HastaPro = venda que o painel não enxerga. */
const erpSemPar = (fechamentos || []).filter(f => !fechUsados.has(f.id))
    .map(f => ({
        data: f.data, nome: f.nome, vgv: r2(f.vgv_total), origem: f.origem,
        lotes: Number(f.lotes_vendidos || 0),
        por_assessor: (Array.isArray(f.por_assessor) ? f.por_assessor : []).map(a => ({ pessoa: canon(a.nome || a.assessor), vgv: r2(a.vgv), lotes: Number(a.transacoes || 0), animais: Number(a.animais || 0) })),
    }))
    .sort((a, b) => a.data.localeCompare(b.data))

/** Número de lote comparável: "01" e "1" são o mesmo lote; "E11" não é "11". */
const num = s => String(s ?? '').trim().replace(/^0+(?=\d)/, '').toUpperCase()

/* WhatsApp: lote que o grupo registrou e o HastaPro não tem (por data+lote). */
const chaveLote = (d, lote) => `${d}|${String(lote ?? '').replace(/^0+/, '').toUpperCase()}`
const todosHp = [...hp2, ...hp01Todos]
const lotesHp = new Set(todosHp.map(l => chaveLote(l.data, l.lote)))
const datasHp = new Set(todosHp.map(l => l.data))
/**
 * Um lote "faltando" pode ser só chave que não bateu. Dois casos reais de
 * agosto: o pacote de embriões postado como "lt 11" está no HastaPro como lote
 * "E11" do Matinha, e o "lt 48" do Shopping Naviraí virou um leilão inteiro
 * ("FÊMEAS JMP") por ter sido postado num segundo grupo. Antes de mandar
 * lançar, procurar o MESMO VALOR num lote do HastaPro em ±3 dias.
 */
const achaPorValor = v => {
    const alvo = waVgv(v)
    if (!alvo) return null
    return todosHp.find(l => Math.abs(l.vgv - alvo) < 1
        && Math.abs(new Date(l.data) - new Date(v.leilao_data)) / 86400000 <= 3) || null
}
const waSemHp = (vendasWa || []).filter(v => !lotesHp.has(chaveLote(v.leilao_data, v.lote)))
    .map(v => {
        const eco = achaPorValor(v)
        return {
            data: v.leilao_data, lote: v.lote, parcela: r2(v.valor), animais: Number(v.animais || 1),
            vgv_indicativo: waVgv(v), assessor: canon(v.assessor), comprador: v.comprador,
            cidade: v.cidade, uf: v.uf, status: v.status, fonte: v.fonte,
            dia_tem_leilao_no_hastapro: datasHp.has(v.leilao_data),
            /* Mesmo valor já lançado por perto → provável chave trocada, não venda perdida. */
            eco_no_hastapro: eco ? { leilao: eco.leilao, data: eco.data, lote: eco.lote, vgv: eco.vgv } : null,
            trecho: String(v.raw_text || '').replace(/\s+/g, ' ').slice(0, 220),
        }
    })
    .sort((a, b) => a.data.localeCompare(b.data))
/* Só é pendência de verdade o que não tem eco por valor no HastaPro. */
const waPendenteReal = waSemHp.filter(v => !v.eco_no_hastapro)
/**
 * Um lote que falta no HastaPro pode já estar no ERP: o fechamento nasceu do
 * próprio grupo (origem 'lances-auto') e nunca foi lançado no HastaPro. Isso
 * muda a ação — não é "ninguém lançou", é "falta no HastaPro". Casa pelo VGV
 * do fechamento sem par, em ±3 dias.
 */
for (const v of waPendenteReal) {
    const f = erpSemPar.find(f => Math.abs(f.vgv - v.vgv_indicativo) < 1
        && Math.abs(new Date(f.data) - new Date(v.data)) / 86400000 <= 3)
    v.fechamento_no_erp = f ? { nome: f.nome, data: f.data, vgv: f.vgv, origem: f.origem } : null
    /* Sinal mais fraco que o eco de ±3 dias: MESMO valor + MESMO número de lote
     * em qualquer dia de agosto. Pega o lote repostado num segundo grupo dias
     * depois — foi assim que o lt 48 do Shopping Naviraí (15/08) virou um
     * "leilão" à parte no ERP. Não decide sozinho: sinaliza para conferência. */
    const m = todosHp.find(l => Math.abs(l.vgv - v.vgv_indicativo) < 1 && num(l.lote) === num(v.lote))
    v.mesmo_lote_e_valor_no_mes = m ? { leilao: m.leilao, data: m.data, lote: m.lote, vgv: m.vgv, pisteiro: m.pisteiro } : null
}
/* e o inverso: lote no HastaPro que ninguém postou no grupo. */
const lotesWa = new Set((vendasWa || []).map(v => chaveLote(v.leilao_data, v.lote)))
const hpSemWa = hp2.filter(l => l.vgv > 0 && !lotesWa.has(chaveLote(l.data, l.lote)))

/* ── 5b. divergência LOTE A LOTE, onde o ERP guarda os lances ────────────── */
/**
 * O total do leilão bater não prova que os lotes batem, e é no lote que mora a
 * comissão. Aqui, para cada par casado, comparamos lance a lance: lote só no
 * HastaPro, lote só no ERP, valor diferente e ATRIBUIÇÃO diferente.
 *
 * ⚠ Casar lote por valor+data inventa correspondência — no 28º Naviraí há três
 * lotes de R$ 48.000 no mesmo dia. Aqui o casamento é pelo NÚMERO do lote, e
 * valor divergente no mesmo lote é achado, não motivo para descasar.
 */
const lotesDivergentes = []
for (const c of cruzamento) {
    if (!c.erp) continue
    const f = (fechamentos || []).find(x => x.id === c.erp.id)
    const lances = Array.isArray(f?.lances) ? f.lances : []
    if (!lances.length) continue
    /* Na filial '01' o fechamento guarda só a COBERTURA Bula, não os 138 lotes
     * do pregão inteiro — comparar contra hp01Todos acusaria o leilão da
     * Remates inteiro como "faltando no ERP". */
    const doHp = (c.filial === '2' ? hp2 : hp01).filter(l => l.data === c.data && l.leilao === c.leilao)
    const mapaHp = new Map(doHp.map(l => [num(l.lote), l]))
    const vistos = new Set()
    for (const l of lances) {
        const k = num(l.lote); vistos.add(k)
        const h = mapaHp.get(k)
        const quemErp = canon(l.assessor || l.nome)
        if (!h) { lotesDivergentes.push({ leilao: c.leilao, data: c.data, lote: l.lote, tipo: 'so_no_erp', vgv_erp: r2(l.vgv), assessor_erp: quemErp }); continue }
        if (Math.abs(h.vgv - Number(l.vgv || 0)) >= 1)
            lotesDivergentes.push({ leilao: c.leilao, data: c.data, lote: l.lote, tipo: 'valor', vgv_hp: h.vgv, vgv_erp: r2(l.vgv), assessor_hp: h.pisteiro, assessor_erp: quemErp })
        else if (quemErp && h.pisteiro && canon(h.pisteiro) !== quemErp)
            lotesDivergentes.push({ leilao: c.leilao, data: c.data, lote: l.lote, tipo: 'atribuicao', vgv_hp: h.vgv, assessor_hp: h.pisteiro, assessor_erp: quemErp })
    }
    for (const h of doHp) if (h.vgv > 0 && !vistos.has(num(h.lote)))
        lotesDivergentes.push({ leilao: c.leilao, data: c.data, lote: h.lote, tipo: 'so_no_hastapro', vgv_hp: h.vgv, assessor_hp: h.pisteiro })
}
const porTipo = t => lotesDivergentes.filter(x => x.tipo === t)
const resumoLotes = {
    so_no_hastapro: { n: porTipo('so_no_hastapro').length, vgv: r2(porTipo('so_no_hastapro').reduce((s, x) => s + (x.vgv_hp || 0), 0)) },
    so_no_erp: { n: porTipo('so_no_erp').length, vgv: r2(porTipo('so_no_erp').reduce((s, x) => s + (x.vgv_erp || 0), 0)) },
    valor: { n: porTipo('valor').length },
    atribuicao: { n: porTipo('atribuicao').length, vgv: r2(porTipo('atribuicao').reduce((s, x) => s + (x.vgv_hp || 0), 0)) },
}

/* ── 5c. dinheiro: comissão comprometida x receita reconhecida ────────────── */
const financeiro = {
    comissao_assessores: r2((fechamentos || []).reduce((s, f) => s + Number(f.comissao_assessoria || 0), 0)),
    receita_bula: r2((fechamentos || []).reduce((s, f) => s + Number(f.receita_bula || 0), 0)),
    fechamentos_sem_receita: (fechamentos || []).filter(f => !Number(f.receita_bula || 0))
        .map(f => ({ data: f.data, nome: f.nome, vgv: r2(f.vgv_total), comissao: r2(f.comissao_assessoria) }))
        .sort((a, b) => b.comissao - a.comissao),
}
financeiro.comissao_sem_receita = r2(financeiro.fechamentos_sem_receita.reduce((s, f) => s + f.comissao, 0))

/* ── 6. divergência de ATRIBUIÇÃO por pessoa (HastaPro x ERP x WhatsApp) ─── */
const pessoas = [...new Set([...porPessoaHp2, ...porPessoaHp01, ...porPessoaErp, ...porPessoaWa].map(p => p.pessoa))]
const acha = (lista, p) => lista.find(x => x.pessoa === p) || { vgv: 0, lotes: 0, animais: 0 }
const atribuicao = pessoas.map(p => {
    const a = acha(porPessoaHp2, p), b = acha(porPessoaHp01, p), c = acha(porPessoaErp, p), d = acha(porPessoaWa, p)
    return {
        pessoa: p,
        hp2: a.vgv, hp2_lotes: a.lotes, hp2_animais: a.animais,
        hp01: b.vgv, hp01_lotes: b.lotes, hp01_animais: b.animais,
        erp: c.vgv, erp_lotes: c.lotes,
        wa: d.vgv, wa_lotes: d.lotes,
        total: r2(a.vgv + b.vgv),
        dif_erp_hp2: r2(c.vgv - a.vgv),
    }
}).sort((x, y) => y.total - x.total)

/* ── 7. consolidado e meta ───────────────────────────────────────────────── */
const consolidado = {
    hp2: tot(porPessoaHp2),
    hp01_bula: tot(porPessoaHp01),
    erp_sem_par: { vgv: r2(erpSemPar.reduce((s, f) => s + f.vgv, 0)), lotes: erpSemPar.reduce((s, f) => s + f.lotes, 0), n: erpSemPar.length },
    wa_pendente: { vgv: r2(waPendenteReal.reduce((s, v) => s + v.vgv_indicativo, 0)), lotes: waPendenteReal.length },
    wa_eco: { vgv: r2(waSemHp.filter(v => v.eco_no_hastapro).reduce((s, v) => s + v.vgv_indicativo, 0)), lotes: waSemHp.filter(v => v.eco_no_hastapro).length },
}
/* Cobertura oficial = FIL '2' + cobertura em pregão da Remates. O que só está
 * no grupo é PENDENTE (ainda não lançado), citado à parte, nunca somado. */
consolidado.oficial = r2(consolidado.hp2.vgv + consolidado.hp01_bula.vgv)
consolidado.com_pendencias = r2(consolidado.oficial + consolidado.wa_pendente.vgv)

const metaCalc = {
    ...META,
    alvo_agenda_completa: r2(META.agenda_completa * META.pct),
    alvo_agenda_divulgada: r2(META.agenda_divulgada * META.pct),
    realizado: consolidado.oficial,
    realizado_com_pendencias: consolidado.com_pendencias,
    pct_agenda_completa: r2(consolidado.oficial / META.agenda_completa * 100),
    pct_agenda_divulgada: r2(consolidado.oficial / META.agenda_divulgada * 100),
}
metaCalc.bateu_divulgada = consolidado.oficial >= metaCalc.alvo_agenda_divulgada
metaCalc.bateu_completa = consolidado.oficial >= metaCalc.alvo_agenda_completa
/**
 * A terceira leitura, e a mais desconfortável: se a meta vinha sendo
 * acompanhada pelo PAINEL (só a filial '2'), a cobertura em pregão da Remates
 * nunca esteve nela — e sem esses R$ 640,7 mil o mês NÃO bate os 12%.
 * As três leituras vão no relatório; a escolha é da diretoria.
 */
metaCalc.so_painel = {
    realizado: consolidado.hp2.vgv,
    pct_agenda_divulgada: r2(consolidado.hp2.vgv / META.agenda_divulgada * 100),
    pct_agenda_completa: r2(consolidado.hp2.vgv / META.agenda_completa * 100),
    bateu_divulgada: consolidado.hp2.vgv >= metaCalc.alvo_agenda_divulgada,
}

/* ── 8. qualidade / achados ──────────────────────────────────────────────── */
const codPorNome = new Map()
for (const c of codigos) { const n = nomeDoPisteiro(c); if (n && !codPorNome.has(n)) codPorNome.set(n, c) }
const semPisteiro = hp2.filter(l => !l.pisteiro && l.vgv > 0)
const valorZero = [...hp2, ...hp01].filter(l => !l.vgv)
const soEmClientes = [...new Set([...hp2, ...hp01].map(l => l.pisteiro).filter(Boolean))]
    .filter(n => { const c = codPorNome.get(n); return c && nomeCli.has(c) && !nomePre.has(c) })
const aDefinir = (fechamentos || []).flatMap(f => (Array.isArray(f.por_assessor) ? f.por_assessor : [])
    .filter(a => /definir/i.test(String(a.nome || a.assessor)))
    .map(a => ({ leilao: f.nome, data: f.data, vgv: r2(a.vgv) })))
const waSemAssessor = (vendasWa || []).filter(v => !canon(v.assessor))
const waARevisar = (vendasWa || []).filter(v => v.status === 'revisar')

const dados = {
    geradoEm: new Date().toISOString(),
    periodo: { ini: INI, fim: FIM },
    fontes: {
        hastapro_fil2: { leiloes: leiloesHp2.length, lotes: hp2.length, ...tot(porPessoaHp2) },
        hastapro_fil01_total: { leiloes: agrupaLeilao(hp01Todos).length, lotes: hp01Todos.length, vgv: r2(hp01Todos.reduce((s, l) => s + l.vgv, 0)) },
        hastapro_fil01_bula: { leiloes: leiloesHp01Bula.length, lotes: hp01.length, ...tot(porPessoaHp01) },
        hastapro_fil01_pela_remates: {
            lotes: hp01PelaRemates.length, vgv: r2(hp01PelaRemates.reduce((s, l) => s + l.vgv, 0)),
            por_pessoa: somaPessoa(hp01PelaRemates.map(l => ({ pessoa: l.pisteiro, vgv: l.vgv, lotes: 1, animais: l.qtd }))),
        },
        erp: { fechamentos: (fechamentos || []).length, vgv: r2((fechamentos || []).reduce((s, f) => s + Number(f.vgv_total || 0), 0)) },
        whatsapp: { lotes: (vendasWa || []).length, vgv_indicativo: r2((vendasWa || []).reduce((s, v) => s + waVgv(v), 0)), dias: [...new Set((vendasWa || []).map(v => v.leilao_data))].length },
    },
    consolidado, meta: metaCalc,
    por_pessoa: { hp2: porPessoaHp2, hp01: porPessoaHp01, erp: porPessoaErp, wa: porPessoaWa },
    atribuicao,
    leiloes: { hp2: leiloesHp2, hp01_bula: leiloesHp01Bula, hp01_todos: agrupaLeilao(hp01Todos) },
    cruzamento, erp_sem_par: erpSemPar,
    lotes_divergentes: lotesDivergentes, resumo_lotes: resumoLotes, financeiro,
    /* Percentual de comissão de cada um, direto da folha — o relatório nunca
     * deve chutar isso: Peralta é 2% e Lucas/Laila são 1%, e errar troca o
     * valor em risco de lugar. */
    comissao_pct: Object.fromEntries([...new Set([...hp2, ...hp01].map(l => l.pisteiro).filter(Boolean))]
        .map(n => [n, achaMembro(n)?.pct ?? null])),
    whatsapp: {
        pendentes: waPendenteReal, sem_chave_no_hastapro: waSemHp,
        hp_sem_grupo: hpSemWa.length, hp_sem_grupo_vgv: r2(hpSemWa.reduce((s, l) => s + l.vgv, 0)),
    },
    qualidade: {
        sem_pisteiro: { n: semPisteiro.length, vgv: r2(semPisteiro.reduce((s, l) => s + l.vgv, 0)), itens: semPisteiro.map(l => ({ data: l.data, leilao: l.leilao, lote: l.lote, vgv: l.vgv })) },
        valor_zero: { n: valorZero.length, itens: valorZero.map(l => ({ data: l.data, leilao: l.leilao, lote: l.lote, filial: l.filial })) },
        so_em_clientes: soEmClientes,
        a_definir: aDefinir,
        wa_sem_assessor: { n: waSemAssessor.length, itens: waSemAssessor.map(v => ({ data: v.leilao_data, lote: v.lote, trecho: String(v.raw_text || '').replace(/\s+/g, ' ').slice(0, 140) })) },
        wa_a_revisar: waARevisar.length,
        venda_fora_do_mes: vendaForaDoMes.map(l => ({ leilao: String(l.leilao).trim(), data_leilao: iso(l.data_leilao), data_venda: iso(l.dv), lote: String(l.lote).trim(), vgv: r2(l.total), pisteiro: nomeDoPisteiro(String(l.p ?? '')) })),
    },
    lotes_detalhe: { hp2, hp01_bula: hp01 },
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(dados, null, 1))

/* ── console ─────────────────────────────────────────────────────────────── */
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
console.log('\n================ FONTES ================')
console.log(JSON.stringify(dados.fontes, null, 1))
console.log('\n================ CONSOLIDADO ================')
console.log(` FIL 2 (o painel)            ${brl(consolidado.hp2.vgv).padStart(16)}  ${consolidado.hp2.lotes} lotes`)
console.log(` Cobertura em pregao Remates ${brl(consolidado.hp01_bula.vgv).padStart(16)}  ${consolidado.hp01_bula.lotes} lotes`)
console.log(` = OFICIAL                   ${brl(consolidado.oficial).padStart(16)}`)
console.log(` + pendente so no WhatsApp   ${brl(consolidado.wa_pendente.vgv).padStart(16)}  ${consolidado.wa_pendente.lotes} lotes`)
console.log(` = COM PENDENCIAS            ${brl(consolidado.com_pendencias).padStart(16)}`)
console.log(`\n META 12%: alvo ${brl(metaCalc.alvo_agenda_divulgada)} (divulgada) / ${brl(metaCalc.alvo_agenda_completa)} (agenda cheia)`)
console.log(` realizado ${brl(metaCalc.realizado)} = ${metaCalc.pct_agenda_divulgada}% da divulgada, ${metaCalc.pct_agenda_completa}% da cheia`)
console.log('\n================ POR PESSOA ================')
console.log('pessoa'.padEnd(34), 'FIL2'.padStart(14), 'REMATES'.padStart(14), 'ERP'.padStart(14), 'WHATS'.padStart(14))
for (const a of atribuicao) console.log(a.pessoa.slice(0, 33).padEnd(34), brl(a.hp2).padStart(14), brl(a.hp01).padStart(14), brl(a.erp).padStart(14), brl(a.wa).padStart(14))
console.log('\n================ ERP SEM PAR NO HASTAPRO ================')
for (const f of erpSemPar) console.log(' ', f.data, String(f.nome).slice(0, 46).padEnd(47), brl(f.vgv).padStart(14), f.origem)
console.log('\n================ DIVERGENCIA POR LEILAO (|dif|>=1) ================')
for (const c of cruzamento.filter(c => c.dif_erp !== null && Math.abs(c.dif_erp) >= 1))
    console.log(' ', c.data, String(c.leilao).slice(0, 40).padEnd(41), 'HP', brl(c.hp.vgv).padStart(13), 'ERP', brl(c.erp.vgv).padStart(13), 'dif', brl(c.dif_erp).padStart(13))
console.log('\n================ SEM FECHAMENTO NO ERP ================')
for (const c of cruzamento.filter(c => !c.erp)) console.log(' ', c.data, `FIL${c.filial}`, String(c.leilao).slice(0, 44).padEnd(45), brl(c.hp.vgv).padStart(14))
console.log('\n================ SO NO WHATSAPP (pendente de lancamento) ================')
for (const v of waSemHp) console.log(' ', v.data, 'lt', String(v.lote).padEnd(6), 'parc', brl(v.parcela).padStart(10), '=', brl(v.vgv_indicativo).padStart(12), (v.assessor || '?').slice(0, 22).padEnd(23), v.dia_tem_leilao_no_hastapro ? 'dia JA tem leilao no HP' : 'dia SEM leilao no HP')
console.log('\n================ QUALIDADE ================')
console.log(JSON.stringify({ ...dados.qualidade, wa_sem_assessor: dados.qualidade.wa_sem_assessor.n }, null, 1).slice(0, 4000))
console.log(`\n-> ${OUT}/dados.json`)
