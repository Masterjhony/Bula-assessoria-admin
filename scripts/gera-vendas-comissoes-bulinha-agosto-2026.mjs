/**
 * VENDAS E COMISSÕES DO BULINHA (Felipe Vilela Andrade) — AGOSTO/2026
 *
 * Pergunta do chefe no Grupo Financeiro (03/09, 11h44):
 *   "sabe quanto o Bulinha fez de vendas em Agosto? Quanto ele tem a receber?"
 *
 * A resposta tem duas metades que não se somam:
 *   1. VENDAS  — o que ele pôs na pista, que é quase todo em pregão da PRÓPRIA
 *      Bula Remates (FIL '01') e por isso NÃO comissiona. Só a FIL '2'
 *      (cobertura Bula Assessoria) gera comissão. Regra do chefe 23/07 +
 *      PISTA_DA_REMATES (26/08).
 *   2. A RECEBER — comissão da FIL '2' MENOS a fatura do cartão da Bula, que na
 *      prática é o cartão dele (100% das compras têm portador FELIPE V ANDRADE,
 *      reconfirmado na fonte em 26/08). O precedente é o acerto de junho, pago em
 *      julho "com desconto dos gastos dele no cartão", e o de 24/08.
 *
 * Fontes (nenhum número escrito à mão):
 *   HASTAPRO (Firebird, leitura) — LOTES × LEILAO pelo LOT_PISTEIRO; ASSESSORIA
 *     TIPO='VENDA' dá o % de comissão gravado no lote; COMPRADORES dá o comprador.
 *   ERP — bula_leilao_fechamento (por_assessor/lances), erp_contas_pagar,
 *     erp_contas_receber, erp_cartao_faturas, erp_movimentos_bancarios.
 *
 * Saída: outputs/bulinha-agosto-2026/dados.json
 *   node scripts/gera-vendas-comissoes-bulinha-agosto-2026.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import Firebird from 'node-firebird'
import { createClient } from '@supabase/supabase-js'

const INI = '2026-08-01', FIM = '2026-08-31'
const OUT = 'outputs/bulinha-agosto-2026'
fs.mkdirSync(OUT, { recursive: true })

/* Os dois códigos do Bulinha no HastaPro: prestador (= cliente, mesmo código) e
 * um segundo cadastro de cliente. Qualquer filtro por "%FELIPE%" contamina o
 * resultado — existem 8 Felipes em PRESTADORES, incluindo o Peralta. */
const COD_BULINHA = ['250930183027880', '2510072104283']
const PCT = 0.02   // percentuais-fixos-assessores (22/07), reconfirmado 05/08

/* ── env ─────────────────────────────────────────────────────────────────── */
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })

const txt = v => (Buffer.isBuffer(v) ? v.toString('latin1') : v)
const norm = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, txt(v)]))
const db = await new Promise((res, rej) => Firebird.attach({
    host: process.env.HASTAPRO_HOST, port: +process.env.HASTAPRO_PORT, database: process.env.HASTAPRO_DATABASE,
    user: process.env.HASTAPRO_USER, password: process.env.HASTAPRO_PASSWORD, lowercase_keys: true,
}, (e, d) => e ? rej(e) : res(d)))
const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => e ? rej(e) : res(r.map(norm))))
const inl = COD_BULINHA.map(c => `'${c}'`).join(',')
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const iso = d => d ? new Date(d).toISOString().slice(0, 10) : null
const sum = (a, f = x => x.vgv) => r2(a.reduce((s, x) => s + Number(f(x) || 0), 0))

/* ── 1. HastaPro: os lotes de agosto ────────────────────────────────────── */
const lotesRaw = await q(`
    select l.FIL_CODIGO fil, l.LEI_CODIGO leicod, l.LEI_NOME leilao, l.LEI_DATA data,
           lo.LOT_LOTE lote, lo.LOT_QTD qtd, lo.LOT_LANCE lance, lo.LOT_TOTAL total,
           lo.LOT_DEFESA defesa, lo.LOT_DATA_VENDA dv,
           (select first 1 a.COMISSAO from ASSESSORIA a where a.LEI_CODIGO = lo.LEI_CODIGO
             and a.FIL_CODIGO = lo.FIL_CODIGO and a.LOT_LOTE = lo.LOT_LOTE and a.TIPO = 'VENDA') com_hp,
           (select first 1 c.CLI_NOME from COMPRADORES co join CLIENTES c on c.CLI_CODIGO = co.CLI_CODIGO
             where co.LEI_CODIGO = lo.LEI_CODIGO and co.FIL_CODIGO = lo.FIL_CODIGO and co.LOT_LOTE = lo.LOT_LOTE) comprador,
           (select first 1 co.CLI_CODIGO from COMPRADORES co where co.LEI_CODIGO = lo.LEI_CODIGO
             and co.FIL_CODIGO = lo.FIL_CODIGO and co.LOT_LOTE = lo.LOT_LOTE) comprador_cod
      from LOTES lo join LEILAO l on l.LEI_CODIGO = lo.LEI_CODIGO and l.FIL_CODIGO = lo.FIL_CODIGO
     where l.LEI_DATA >= '${INI}' and l.LEI_DATA <= '${FIM}'
       and lo.LOT_PISTEIRO in (${inl}) and lo.LOT_TOTAL > 0
     order by l.LEI_DATA, lo.LOT_LOTE`)

const lotes = lotesRaw.map(l => ({
    filial: String(l.fil).replace(/^0*(?=\d)/, '') === '2' ? '2' : '01',
    leilao: String(l.leilao).trim(),
    data: iso(l.data),
    lote: String(l.lote).trim(),
    qtd: Number(l.qtd || 0),
    lance: Number(l.lance || 0),
    vgv: Number(l.total || 0),
    /* LOT_TOTAL é canônico e nunca recalculado — o multiplicador é derivado dele,
     * não de CON_PARCELAS (que em agosto divergiu em vários lotes). */
    mult: l.lance ? r2(Number(l.total) / Number(l.lance)) : null,
    com_hp: Number(l.com_hp || 0),
    comprador: String(l.comprador || '').trim() || null,
    /* o pisteiro do FIL 01 pode ser o próprio comprador do lote */
    comprou_ele_mesmo: COD_BULINHA.includes(String(l.comprador_cod || '')),
}))
const fil2 = lotes.filter(l => l.filial === '2')
const fil01 = lotes.filter(l => l.filial === '01')

/* série do ano, para dar tamanho ao mês */
const serie = (await q(`
    select l.FIL_CODIGO fil, extract(month from l.LEI_DATA) mes, count(*) n, sum(lo.LOT_TOTAL) vgv
      from LOTES lo join LEILAO l on l.LEI_CODIGO = lo.LEI_CODIGO and l.FIL_CODIGO = lo.FIL_CODIGO
     where l.LEI_DATA >= '2026-01-01' and l.LEI_DATA <= '2026-12-31'
       and lo.LOT_PISTEIRO in (${inl}) and lo.LOT_TOTAL > 0
     group by 1, 2 order by 2, 1`)).map(r => ({
        mes: Number(r.mes), filial: String(r.fil).replace(/^0*(?=\d)/, '') === '2' ? '2' : '01',
        lotes: Number(r.n), vgv: Number(r.vgv || 0),
    }))

/* julho: a pergunta "tem saldo anterior?" só fecha olhando o mês anterior */
const julho = (await q(`
    select l.FIL_CODIGO fil, sum(lo.LOT_TOTAL) vgv, count(*) n
      from LOTES lo join LEILAO l on l.LEI_CODIGO = lo.LEI_CODIGO and l.FIL_CODIGO = lo.FIL_CODIGO
     where l.LEI_DATA >= '2026-07-01' and l.LEI_DATA <= '2026-07-31'
       and lo.LOT_PISTEIRO in (${inl}) and lo.LOT_TOTAL > 0 group by 1`)).map(r => ({
        filial: String(r.fil).replace(/^0*(?=\d)/, '') === '2' ? '2' : '01', lotes: Number(r.n), vgv: Number(r.vgv || 0),
    }))

/* o pregão inteiro dos leilões da Remates onde ele esteve na pista — mostra o
 * peso dele lá dentro sem sugerir que aquilo é cobertura da Assessoria */
const leiloesRemates = [...new Set(fil01.map(l => l.leilao))]
db.detach()

/* ── 2. ERP: fechamentos de agosto ──────────────────────────────────────── */
const { data: fechAgo } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,data,vgv_total,comissao_assessoria,receita_bula,por_assessor,lances,origem')
    .gte('data', INI).lte('data', FIM).order('data')

const B = /bulinha|felipe (vilela )?andrade/i
const fechamentos = []
for (const f of fechAgo ?? []) {
    const pa = (Array.isArray(f.por_assessor) ? f.por_assessor : []).filter(a => B.test(String(a.nome ?? a.assessor ?? '')))
    const lan = (Array.isArray(f.lances) ? f.lances : []).filter(l => B.test(String(l.assessor ?? '')))
    if (!pa.length && !lan.length) continue
    fechamentos.push({
        id: f.id, nome: f.nome, data: f.data, vgv_fechamento: Number(f.vgv_total || 0), origem: f.origem,
        vgv: sum(pa, a => a.vgv), comissao: sum(pa, a => a.comissao), pct: pa[0]?.comissao_pct ?? null,
        lotes: lan.map(l => l.lote),
    })
}
/* o lote que o ERP dá a outro nome e o HastaPro dá a ele */
const { data: fEssencia } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,data,por_assessor,lances').eq('data', '2026-08-22')
const disputa = []
for (const f of fEssencia ?? []) {
    for (const l of (Array.isArray(f.lances) ? f.lances : [])) {
        const hp = fil2.find(x => x.data === f.data && x.lote === String(l.lote) && x.vgv === Number(l.vgv))
        if (hp && !B.test(String(l.assessor ?? ''))) disputa.push({
            fechamento_id: f.id, leilao: f.nome, data: f.data, lote: String(l.lote), vgv: Number(l.vgv),
            erp_credita: String(l.assessor), hastapro_credita: 'Bulinha (Felipe Andrade)',
            comissao: r2(Number(l.vgv) * PCT),
        })
    }
}

/* ── 3. ERP: contas a pagar no nome dele ────────────────────────────────── */
const { data: cpAll } = await sb.from('erp_contas_pagar')
    .select('id,descricao,valor,valor_pago,desconto,vencimento,data_pagamento,status,forma_pagamento,numero_documento,tags,origem,observacoes')
    .limit(5000)
const cp = (cpAll ?? [])
    .filter(c => /BULINHA|FELIPE (VILELA )?ANDRADE/i.test(c.descricao || '') || (c.tags ?? []).includes('bulinha'))
    .map(c => ({ ...c, restante: r2(Number(c.valor || 0) - Number(c.valor_pago || 0) - Number(c.desconto || 0)) }))
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))
const cpAberto = cp.filter(c => !['pago', 'cancelado'].includes(String(c.status)) && c.restante > 0.005)

/* o ciclo de setembro — para provar que a comissão dele não está lá */
const { data: cicloSet } = await sb.from('erp_contas_pagar')
    .select('descricao,valor,status,vencimento').eq('vencimento', '2026-09-25')
const ciclo25 = (cicloSet ?? []).filter(c => /COMISS/i.test(c.descricao || '') && c.status !== 'cancelado')
    .map(c => ({ descricao: c.descricao, valor: Number(c.valor || 0) }))

/* ── 4. Cartão: a outra ponta do acerto ─────────────────────────────────── */
const { data: cartoes } = await sb.from('erp_cartoes').select('id,apelido,bandeira,final,titular')
const { data: faturasAll } = await sb.from('erp_cartao_faturas')
    .select('cartao_id,competencia,mes_nome,total_fatura,data_vencimento,data_pagamento,valor_pago,status,observacoes,origem')
const cartaoDe = id => (cartoes ?? []).find(c => c.id === id)
const faturas = (faturasAll ?? []).filter(f => f.competencia >= '2026-07')
    .map(f => ({
        cartao: cartaoDe(f.cartao_id)?.apelido ?? '?', bandeira: cartaoDe(f.cartao_id)?.bandeira ?? '?',
        final: cartaoDe(f.cartao_id)?.final ?? '?', competencia: f.competencia, mes: f.mes_nome,
        total: Number(f.total_fatura || 0), vencimento: f.data_vencimento, pagamento: f.data_pagamento,
        status: f.status, origem: f.origem,
        /* "Proxima fatura X" é o que o Sicoob IB mostrou na leitura de 26/08 — é a
         * melhor estimativa da fatura que vence em 22/09, e é dado, não chute. */
        proxima: (() => { const m = /Proxima fatura ([\d.,]+)/i.exec(f.observacoes || ''); return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null })(),
    })).sort((a, b) => a.competencia.localeCompare(b.competencia) || a.cartao.localeCompare(b.cartao))

/* portador das compras — a prova de que a fatura é gasto dele */
let compras = []
for (let i = 0; i < 20000; i += 1000) {
    const { data } = await sb.from('erp_cartao_lancamentos').select('portador,valor,tipo').range(i, i + 999)
    if (!data?.length) break; compras = compras.concat(data)
}
const porPortador = {}
for (const c of compras.filter(c => String(c.tipo) !== 'pagamento')) {
    const k = String(c.portador || '—'); porPortador[k] = r2((porPortador[k] || 0) + Number(c.valor || 0))
}
const { data: cpCartao } = await sb.from('erp_contas_pagar')
    .select('descricao,valor,vencimento,status,origem').gte('vencimento', '2026-09-01').lte('vencimento', '2026-09-30')
const previsaoCartaoSet = (cpCartao ?? []).filter(c => /fatura cart/i.test(c.descricao || ''))
    .map(c => ({ descricao: c.descricao, valor: Number(c.valor || 0), vencimento: c.vencimento, origem: c.origem, status: c.status }))

/* ── 5. A conta do outro lado: Bula Remates deve à Bula ─────────────────── */
const { data: crAll } = await sb.from('erp_contas_receber')
    .select('descricao,valor,valor_recebido,vencimento,data_recebimento,status,origem,observacoes').limit(5000)
const crRemates = (crAll ?? []).filter(c => /REMATES/i.test(c.descricao || ''))
    .map(c => ({
        descricao: c.descricao, valor: Number(c.valor || 0), recebido: Number(c.valor_recebido || 0),
        vencimento: c.vencimento, status: c.status,
        restante: r2(Number(c.valor || 0) - Number(c.valor_recebido || 0)),
    })).sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))
const crAberto = crRemates.filter(c => !['recebido', 'cancelado'].includes(String(c.status)) && c.restante > 0.005)

/* ── 6. Extrato: todo dinheiro que passou entre as duas pontas ──────────── */
let mvAll = []
for (let i = 0; i < 20000; i += 1000) {
    const { data } = await sb.from('erp_movimentos_bancarios').select('data,tipo,descricao,valor,observacoes').range(i, i + 999)
    if (!data?.length) break; mvAll = mvAll.concat(data)
}
const mv = mvAll
    .filter(m => /FELIPE VILELA ANDRADE|BULA REMATES/i.test(m.descricao || ''))
    .map(m => ({ data: m.data, tipo: m.tipo, valor: Number(m.valor || 0), descricao: String(m.descricao || '').replace(/\s+/g, ' ').trim() }))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))

/* ── 7. A conta ─────────────────────────────────────────────────────────── */
const vgvFil2 = sum(fil2), vgvFil01 = sum(fil01)
const comissaoFirme = sum(fechamentos, f => f.comissao)              // já reconhecida no ERP
const comissaoDisputa = sum(disputa, d => d.comissao)               // lote 11, ERP dá a outro
const comissaoDevida = r2(comissaoFirme + comissaoDisputa)          // 2% dos 198.000
const seFosse1pctRemates = r2(vgvFil01 * 0.01)                      // hipótese da regra de 05/08
const faturaConhecida = r2(faturas.filter(f => f.competencia === '2026-08').reduce((s, f) => s + (f.proxima || 0), 0))
const faturaPrevisaoErp = sum(previsaoCartaoSet, c => c.valor)

const dados = {
    geradoEm: '2026-09-03',
    pergunta: 'Grupo Financeiro, 03/09 11h44 — "sabe quanto o Bulinha fez de vendas em Agosto? Quanto ele tem a receber?"',
    pessoa: { nome: 'Felipe Vilela Andrade', apelido: 'Bulinha', funcao: 'Assessor (dono da Bula Remates)', pct: PCT, codigos_hastapro: COD_BULINHA },
    periodo: { ini: INI, fim: FIM },
    vendas: {
        total: r2(vgvFil2 + vgvFil01), lotes: lotes.length,
        fil2: { vgv: vgvFil2, lotes: fil2.length, animais: fil2.reduce((s, l) => s + l.qtd, 0) },
        fil01: { vgv: vgvFil01, lotes: fil01.length, animais: fil01.reduce((s, l) => s + l.qtd, 0), leiloes: leiloesRemates },
    },
    lotes, serie, julho,
    comissao: {
        pct: PCT, base: vgvFil2, devida: comissaoDevida,
        firme: comissaoFirme, disputa: comissaoDisputa,
        fil01: 0, se_fosse_1pct_remates: seFosse1pctRemates,
        vencimento_ciclo: '2026-09-25', lancada_no_erp: false,
    },
    erp: { fechamentos, disputa, ciclo_25_09: ciclo25, contas_pagar: cp, contas_pagar_aberto: cpAberto },
    cartao: {
        faturas, previsao_setembro: previsaoCartaoSet, por_portador: porPortador,
        compras_n: compras.filter(c => String(c.tipo) !== 'pagamento').length,
        compras_total: r2(Object.values(porPortador).reduce((s, v) => s + v, 0)),
        fatura_conhecida: faturaConhecida, previsao_erp: faturaPrevisaoErp,
    },
    remates: { contas_receber: crRemates, aberto: crAberto, total_aberto: sum(crAberto, c => c.restante) },
    extrato: mv,
    saldo: {
        /* Quatro leituras: lote 11 dentro/fora × fatura conhecida/previsão do ERP */
        com_lote11_fatura_real: r2(comissaoDevida - faturaConhecida),
        com_lote11_previsao_erp: r2(comissaoDevida - faturaPrevisaoErp),
        sem_lote11_fatura_real: r2(comissaoFirme - faturaConhecida),
        sem_lote11_previsao_erp: r2(comissaoFirme - faturaPrevisaoErp),
    },
}
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(dados, null, 2))

const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
console.log('=== BULINHA — AGOSTO/2026 ===')
console.log(`Vendas na pista            R$ ${brl(dados.vendas.total)}  em ${lotes.length} lotes`)
console.log(`  FIL '2'  Assessoria      R$ ${brl(vgvFil2)}  (${fil2.length} lotes)  → COMISSIONA`)
console.log(`  FIL '01' Bula Remates    R$ ${brl(vgvFil01)}  (${fil01.length} lotes) → 0%`)
console.log(`Comissão devida (2%)       R$ ${brl(comissaoDevida)}   firme ${brl(comissaoFirme)} + disputa ${brl(comissaoDisputa)}`)
console.log(`Fatura de cartão 22/09     R$ ${brl(faturaConhecida)} (Sicoob IB 26/08)  ·  previsão do ERP ${brl(faturaPrevisaoErp)}`)
console.log(`SALDO                      ${brl(dados.saldo.com_lote11_fatura_real)} a ${brl(dados.saldo.sem_lote11_previsao_erp)}`)
console.log(`Bula Remates deve à Bula   R$ ${brl(dados.remates.total_aberto)}`)
console.log('\nJSON →', path.join(OUT, 'dados.json'))
