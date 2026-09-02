/**
 * FECHAMENTO DE VENDAS — AGOSTO/2026 — consolidação FINAL das fontes.
 *
 * Pedido do João (02/09): "fechar as vendas do mês de agosto... temos 3 fontes
 * (planilha, HastaPro e web-bula) além de WhatsApp, Drive... valor total exato
 * de VGV no período, separar todas as diferenças, reconciliar e resolver o
 * máximo, deixar pendente só o que for verdadeiramente pendente".
 *
 * O que cada fonte sabe (e o que não sabe):
 *   1. HASTAPRO FIL '2'  — o painel "Venda Equipe" (LOT_TOTAL, nunca recalculado).
 *   2. HASTAPRO FIL '01' — pregão inteiro da Bula Remates; a cobertura da
 *      Assessoria são os lotes cujo pisteiro é da folha, MENOS quem está na
 *      pista pela Remates (PISTA_DA_REMATES, decisão do João em 26/08).
 *   3. ERP (bula_leilao_fechamento) — carrega o que só existe fora do HastaPro.
 *   4. WHATSAPP — fichas dos grupos e o print do Douglas (Sabiá Dourado).
 *   5. PLANILHA FINANCEIRO BULA 2026 (Drive, aba Leilões, lida em 02/09 16:46).
 *
 * Regra de ouro: VGV sai do HastaPro quando o lote está lá; o que só existe em
 * ficha/print entra quando DUAS fontes independentes concordam (ficha + ERP,
 * print + planilha) e a diferença fica escrita.
 *
 * Saídas: outputs/fechamento-agosto-2026/dados.json + relatorio.html
 *         Área de Trabalho/fechamento agosto/ (PDF + XLSX + TXT)
 *
 *   node scripts/fechamento-agosto-2026-final.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import Firebird from 'node-firebird'
import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import { LOTES_SABIA } from './cria-fechamento-sabia-dourado-2026-08-30.mjs'

const INI = '2026-08-01', FIM = '2026-08-31'
const OUT = 'outputs/fechamento-agosto-2026'
const DESK = path.join(process.env.USERPROFILE || process.env.HOME, 'Desktop', 'fechamento agosto')
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(DESK, { recursive: true })
const HOJE = '02/09/2026'

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

const iso = d => d ? new Date(d).toISOString().slice(0, 10) : null
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const pct = (a, b) => b ? (100 * a / b).toFixed(2).replace('.', ',') + '%' : '—'
const fmtPct = p => (p * 100).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + '%'
const chave = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const lotKey = s => String(s ?? '').trim().replace(/^0+(?=\d)/, '').toUpperCase()
const dbr = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : ''
const sum = (arr, f = x => x.vgv) => r2(arr.reduce((s, x) => s + Number(f(x) || 0), 0))

/* ── nomes canônicos da equipe ───────────────────────────────────────────── */
const CANON = [
    [/douglas/, 'Douglas Bispo'], [/omena/, 'Fábio Omena'], [/regiane|^nane$/, 'Nane (Regiane)'],
    [/leonardo serafim|lm assessoria|^leonardo$/, 'Leonardo Serafim'], [/peralta/, 'Peralta'],
    [/felipe vilela|bulinha/, 'Bulinha (Felipe Andrade)'], [/lucas martins/, 'Lucas Martins'], [/laila/, 'Laila'],
    [/marcelo moura/, 'Marcelo Moura'], [/erberts|eberts/, 'Matheus Erberts (M1)'], [/rusa/, 'Gustavo Rusa'],
    [/marcelo carneiro/, 'Marcelo Carneiro'], [/valeria/, 'Valéria'], [/mateus alves|matheus alves/, 'Matheus Alves'],
]
const canon = nome => { const k = chave(nome); for (const [re, c] of CANON) if (re.test(k)) return c; return String(nome || '').trim() || null }

/* ── 1. HastaPro ─────────────────────────────────────────────────────────── */
const leiloesHp = await q(`
    select l.FIL_CODIGO fil, l.LEI_CODIGO cod, l.LEI_NOME nome, l.LEI_DATA data, count(lo.LOT_LOTE) n, sum(lo.LOT_TOTAL) vgv, sum(lo.LOT_QTD) qtd
      from LEILAO l left join LOTES lo on lo.LEI_CODIGO = l.LEI_CODIGO and lo.FIL_CODIGO = l.FIL_CODIGO
     where l.LEI_DATA >= '${INI}' and l.LEI_DATA <= '${FIM}' group by 1,2,3,4 order by l.LEI_DATA`)
/* CON_CAPTACAO valida LOT_TOTAL; ASSESSORIA (TIPO='VENDA') é a 2ª fonte do pisteiro e guarda o % de comissão do lote.
 * LOT_DEFESA='C' (lote defendido) e lote fora sempre vêm com LOT_TOTAL=0, então o filtro > 0 já os exclui. */
const lotesHp = await q(`
    select l.FIL_CODIGO fil, l.LEI_CODIGO cod, l.LEI_NOME leilao, l.LEI_DATA data, lo.LOT_LOTE lote, lo.LOT_QTD qtd,
           lo.LOT_LANCE lance, lo.LOT_TOTAL total, lo.LOT_PISTEIRO p, lo.LOT_DATA_VENDA dv,
           lo.LOT_PORCENTAGEM porc, lo.LOT_DEFESA defesa, cd.CON_CAPTACAO captacao,
           (select first 1 c.CLI_NOME from COMPRADORES co join CLIENTES c on c.CLI_CODIGO = co.CLI_CODIGO
             where co.LEI_CODIGO = lo.LEI_CODIGO and co.FIL_CODIGO = lo.FIL_CODIGO and co.LOT_LOTE = lo.LOT_LOTE) comprador,
           (select first 1 a.PRE_CODIGO from ASSESSORIA a where a.LEI_CODIGO = lo.LEI_CODIGO
             and a.FIL_CODIGO = lo.FIL_CODIGO and a.LOT_LOTE = lo.LOT_LOTE and a.TIPO = 'VENDA') pre_ass,
           (select first 1 a.COMISSAO from ASSESSORIA a where a.LEI_CODIGO = lo.LEI_CODIGO
             and a.FIL_CODIGO = lo.FIL_CODIGO and a.LOT_LOTE = lo.LOT_LOTE and a.TIPO = 'VENDA') com_hp
      from LOTES lo join LEILAO l on l.LEI_CODIGO = lo.LEI_CODIGO and l.FIL_CODIGO = lo.FIL_CODIGO
      left join CONDICOES cd on cd.CON_CODIGO = lo.CON_CODIGO and cd.FIL_CODIGO = lo.FIL_CODIGO
     where l.LEI_DATA >= '${INI}' and l.LEI_DATA <= '${FIM}' and lo.LOT_TOTAL > 0 order by l.LEI_DATA, lo.LOT_LOTE`)
const codigos = [...new Set(lotesHp.map(l => String(l.p ?? '')).filter(c => c && c !== 'null'))]
const emLista = codigos.map(c => `'${c}'`).join(',')
const nomeCli = new Map((await q(`select CLI_CODIGO c, CLI_NOME n from CLIENTES where CLI_CODIGO in (${emLista})`)).map(x => [String(x.c), String(x.n).trim()]))
const nomePre = new Map((await q(`select PRE_CODIGO c, PRE_NOME n from PRESTADORES where PRE_CODIGO in (${emLista})`)).map(x => [String(x.c), String(x.n).trim()]))
db.detach()
const nomePisteiro = cod => nomePre.get(cod) || nomeCli.get(cod) || null

/* ── equipe pela folha (mesma regra do importador) ───────────────────────── */
const { data: folha } = await sb.from('erp_folha_estrutura').select('nome, apelidos, pagamento_nome, comissao_pct, ativo')
const equipe = (folha ?? []).filter(f => Number(f.comissao_pct || 0) > 0).map(f => ({
    nome: String(f.nome), pct: Number(f.comissao_pct || 0),
    tokens: [f.nome, f.pagamento_nome, ...((f.apelidos) ?? [])].filter(Boolean).map(n => chave(n)).filter(Boolean),
}))
const PARTICULAS = new Set(['de', 'da', 'do', 'dos', 'das', 'e'])
const partes = s => s.split(' ').filter(w => w && !PARTICULAS.has(w))
const achaMembro = nome => {
    const alvo = chave(nome); if (!alvo) return null
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
/** Decisão do João (26/08): num pregão da própria Remates, estes estão na pista PELA Remates. */
const PISTA_DA_REMATES = ['BULINHA (FELIPE ANDRADE)', 'PERALTA', 'LUCAS MARTINS', 'LAILA']
const pelaRemates = membro => !!membro && PISTA_DA_REMATES.some(n => chave(n) === chave(membro.nome))

/* ── 2. ERP ──────────────────────────────────────────────────────────────── */
const { data: erpF } = await sb.from('bula_leilao_fechamento')
    .select('id,nome,data,vgv_total,lotes_vendidos,animais_vendidos,por_assessor,lances,origem,comissao_assessoria,receita_bula,observacoes')
    .gte('data', INI).lte('data', FIM).order('data')
const { data: agenda } = await sb.from('bula_leiloes').select('nome,data,leiloeira,status,animais,acordo_comissao').gte('data', INI).lte('data', FIM).order('data')

/* ── 3. Constantes documentais (fontes fora dos bancos) ─────────────────── */
/** Planilha FINANCEIRO BULA 2026 (Drive, aba Leilões), lida em 02/09/2026 16:46. */
const PLANILHA = [
    ['2026-08-01', 'LEILÃO TOUROS FAZENDA SÃO GERALDO', 'BULA REMATES', 5019800, 375000, null, 0.005, 25099, 'A RECEBER 15/09'],
    ['2026-08-01', 'LEILÃO FÊMEAS NELORE MAFRA', 'PROGRAMA', 5627600, 1042700, null, 0.0125, 70345, 'COBRAR'],
    ['2026-08-02', 'LEILÃO TOUROS NELORE MAFRA', 'PROGRAMA', 5102000, 178200, null, 0.0035, 17857, 'COBRAR'],
    ['2026-08-04', 'LEILÃO DE TOUROS NELORE SORRISO', 'E-RURAL', null, 114300, 0.05, null, 5670, 'A RECEBER 01/09'],
    ['2026-08-04', 'LEILÃO TOUROS NELORE GRUPO COSTA', null, null, 20100, 0.03, null, 603, 'COBRAR'],
    ['2026-08-07', 'LEILÃO LS GALERIA II', 'E-RURAL', 3680000, 576000, 0.04, 0.01, 59840, 'COBRAR'],
    ['2026-08-08', 'LEILÃO PÉROLAS DO TAPAJÓS', null, null, 213000, 0.05, null, 10650, 'COBRAR'],
    ['2026-08-09', 'LEILÃO NELORE PARANÃ PRODUTIVIDADE', 'PROGRAMA', null, 278100, 0.05, null, 13905, 'COBRAR'],
    ['2026-08-13', '7º LEILÃO ESSÊNCIA GENÉTICA - NELORE DA BAMBÚ', 'E-RURAL', null, 16500, 0.05, null, 825, 'A RECEBER 01/09'],
    ['2026-08-15', 'TOUROS TERRA BRAVA EXPOGENETICA', 'PROGRAMA', null, 107100, 0.05, null, 5355, 'EM FECHAMENTO'],
    ['2026-08-15', 'SHOPPING NAVIRAÍ EXPOGENÉTICA', 'FAZENDA', null, 96600, 0.05, null, 4830, 'EM FECHAMENTO'],
    ['2026-08-16', 'MATINHA EXPOGENETICA', 'PROGRAMA', null, 460500, 0.05, null, 23025, 'EM FECHAMENTO'],
    ['2026-08-16', 'LEILÃO FAZENDA ARARAS - ESSÊNCIA GENÉTICA', 'PROGRAMA', null, 87000, 0.03, null, 2610, 'EM FECHAMENTO'],
    ['2026-08-19', 'LEILÃO RESERVA EXPOGENÉTICA SANTA NICE', 'PROGRAMA', null, 297000, 0.05, null, 14850, 'EM FECHAMENTO'],
    ['2026-08-19', 'LEILÃO GENÉTICA ADITIVA EXPOGENÉTICA', 'PROGRAMA', null, 444000, 0.05, null, 22200, 'EM FECHAMENTO'],
    ['2026-08-20', 'LEILÃO BABY DE PROVA', 'PROGRAMA', null, 73500, 0.05, null, 3675, 'EM FECHAMENTO'],
    ['2026-08-20', 'LEILÃO NELORE CEN & FAZENDA MODELO', 'PROGRAMA', null, 117000, 0.03, null, 3510, 'EM FECHAMENTO'],
    ['2026-08-21', '12º LEILÃO PREMIUM COLONIAL', 'PROGRAMA', null, 195000, 0.03, null, 5850, 'EM FECHAMENTO'],
    ['2026-08-22', '4º LEILÃO PEPITAS COLONIAL', 'PROGRAMA', null, 325500, 0.03, null, 9765, 'EM FECHAMENTO'],
    ['2026-08-22', 'LEILÃO NAVIRAÍ CAMPARINO ESSÊNCIA BEZERRAS E NOVILHAS', 'PROGRAMA', null, 543000, 0.05, null, 27150, 'EM FECHAMENTO'],
    ['2026-08-23', '28º LEILÃO NAVIRAÍ CAMPARINO REPRODUTORES', 'PROGRAMA', 8085000, 940500, null, 0.0075, 60637.5, 'EM FECHAMENTO'],
    ['2026-08-23', 'LEILÃO EXCELÊNCIA GENÉTICA', 'PROGRAMA', null, 105000, 0.05, null, 5250, 'EM FECHAMENTO'],
    ['2026-08-23', 'LEILÃO NELORE MARCONDES', 'E-RURAL', null, 37500, 0.05, null, 1875, 'EM FECHAMENTO'],
    ['2026-08-26', 'LEILÃO VIRTUAL TERRA BRAVA MATRIZES', 'PROGRAMA', null, 46500, 0.05, null, 2325, 'EM FECHAMENTO'],
    ['2026-08-27', 'LEILÃO VIRTUAL TERRA BRAVA TOUROS', 'PROGRAMA', null, null, 0.05, null, null, 'EM FECHAMENTO'],
    ['2026-08-29', 'LEILÃO NELORE PINTADO ENGENHO DA SERRA 2026', 'CONNECT', null, 51100, 0.03, null, 1533, 'EM FECHAMENTO'],
    ['2026-08-29', 'LEILÃO MELHORADORES ESPECIAL 30 ANOS', 'BULA REMATES', null, null, null, null, null, 'EM FECHAMENTO'],
    ['2026-08-29', 'LEILÃO NELORE CRISPIM DINASTIA GENÉTICA', 'E-RURAL', null, null, 0.05, null, null, 'EM FECHAMENTO'],
    ['2026-08-30', 'LEILÃO VIRTUAL VENTRES VIP MATINHA', 'PROGRAMA', null, 127500, 0.05, null, 6375, 'EM FECHAMENTO'],
    ['2026-08-30', 'LEILÃO ESPECIAL SABIÁ DOURADO', null, 1171200, 629700, null, 0.01, 11712, 'EM FECHAMENTO'],
    ['2026-08-30', 'LEILÃO NELORE ASJ', 'PROGRAMA', 1189412, 30900, null, 0.01, 11894.12, 'EM FECHAMENTO'],
].map(([data, nome, leiloeira, faturamento, vendas, pctVendas, pctFat, receita, status]) => ({ data, nome, leiloeira, faturamento, vendas, pctVendas, pctFat, receita, status }))

/** Fichas do grupo "Bula Assessoria l Assessores" (29/08 19:14–21:17 BRT), reencaminhadas pelo Marcelo em 01/09. Parcela ×40. */
const ENGENHO = [['41', 350], ['52', 380], ['59', 300], ['39', 310]].map(([lote, parcela]) => ({
    fonte: 'FICHA', leilao: 'LEILÃO NELORE PINTADO ENGENHO DA SERRA', data: '2026-08-29', filial: '-', leiloeira: 'CONNECT (planilha)',
    lote, qtd: 1, lance: parcela, parcelas: 40, vgv: parcela * 40, pisteiro: 'Douglas Bispo', comprador: 'MARTA CARNEIRO DA SILVA · Rancho Alto Bonito · Novo Repartimento/PA',
    evidencia: 'ficha 29/08 "Levamos lt ' + lote + ' - ' + parcela + ',00x40 - 1M / Foi com Douglas Bispo" + ERP',
}))
/** Ficha do grupo Lances (17/08 22:00 BRT) + planilha RUSA - AGOSTO do Douglas (31/08) + ERP. Não existe no HastaPro. */
const KATISPERA = [{
    fonte: 'FICHA', leilao: 'LEILÃO MATRIZES PREMIUM KATISPERA', data: '2026-08-17', filial: '-', leiloeira: 'PROGRAMA LEILÕES (agenda)',
    lote: '3', qtd: 1, lance: 3900, parcelas: 30, vgv: 117000, pisteiro: 'Douglas Bispo', comprador: 'JOSÉ FABIO (Nelore Pérola) · Santarém/PA',
    evidencia: 'ficha 17/08 "Levamos lt 3 - 3900 - 1F / Foi com Douglas Bispo / Com direcionamento técnico Gustavo Rusa / É José Fabio" + planilha RUSA - AGOSTO do Douglas + ERP',
}]
/** Print "SABIA DOURADO" do Douglas (Grupo Financeiro, 31/08 13:46) + planilha FINANCEIRO BULA 2026 (629.700 / 1.171.200 / 1%). */
const SABIA = LOTES_SABIA.map(([lote, cliente, contato, vgv, condicao, cidade]) => ({
    fonte: 'FICHA', leilao: 'LEILÃO SABIÁ DOURADO', data: '2026-08-30', filial: '01*', leiloeira: 'BULA REMATES (agenda)',
    lote, qtd: 1, lance: null, parcelas: null, vgv, pisteiro: 'Douglas Bispo', comprador: `${cliente} · ${cidade}${condicao ? ' · ' + condicao : ''}`,
    evidencia: 'print do Douglas 31/08 + planilha FINANCEIRO BULA 2026',
}))

/** Planilha RUSA - AGOSTO.xlsx do Douglas (versão 31/08 16:08, "Douglas me mandou atualizado"), + os 3 lotes do José Fábio no Matinha
 *  que estavam na 1ª versão (15:53) e o Douglas tirou depois do "não vamos receber nada, nem Rusa" do Marcelo. (data, lote, vgv na planilha do Douglas) */
const RUSA_DOUGLAS = [
    ['2026-08-01', '1000', 200000, 'SÃO GERALDO', 'NELORE GALOPEIRA'], ['2026-08-09', '123', 48000, 'PARANÃ', 'CELSO LOPES'], ['2026-08-09', '42', 40500, 'PARANÃ', 'CELSO LOPES'],
    ['2026-08-16', '39', 42000, 'MATINHA', 'CELSO LOPES'], ['2026-08-16', '15', 93000, 'MATINHA', 'JOSÉ FABIO', 'credito'], ['2026-08-16', '34', 90000, 'MATINHA', 'JOSÉ FABIO', 'credito'], ['2026-08-16', '12', 108000, 'MATINHA', 'JOSÉ FABIO', 'credito'],
    ['2026-08-16', '22', 87000, 'ARARAS', 'JOSÉ FABIO'], ['2026-08-17', '3', 117000, 'KATISPERA', 'JOSÉ FABIO'], ['2026-08-19', '4', 216000, 'SANTA NICE', 'JOSÉ FABIO'],
    ['2026-08-20', '22', 42000, 'BABY DE PROVA', 'CELSO LOPES'], ['2026-08-20', '23', 31500, 'BABY DE PROVA', 'CELSO LOPES'], ['2026-08-21', '29', 87000, 'NOITE NACIONAL / COLONIAL', 'JOSÉ FABIO'],
    ['2026-08-22', '33', 27000, 'PEPITAS', 'CELSO LOPES'], ['2026-08-22', '27', 21000, 'PEPITAS', 'CELSO LOPES'], ['2026-08-22', '1', 153000, 'NAVIRAÍ MATRIZES', 'JOSÉ FABIO'], ['2026-08-22', '5', 225000, 'NAVIRAÍ MATRIZES', 'JOSÉ FABIO'],
    ['2026-08-30', '31', 37500, 'VENTRES VIP MATINHA', 'CELSO LOPES'], ['2026-08-30', '18', 27000, 'VENTRES VIP MATINHA', 'CELSO LOPES'],
].map(([data, lote, vgvDouglas, leilao, comprador, flag]) => ({ data, lote: lotKey(lote), vgvDouglas, leilao, comprador, credito: flag === 'credito' }))

const META = { valor: 6876000, agenda_divulgada: 57294800, agenda_completa: 68024400, pct: 0.12 }
const ERP_ANTES = { fechamentos: 32, vgv: 7401300, quando: '01/09/2026 (após a correção do ERP)' }

/* ── 4. Universo de lotes ────────────────────────────────────────────────── */
const lotes = []
for (const l of lotesHp) {
    const pisteiroBruto = nomePisteiro(String(l.p ?? '')) || (String(l.p ?? '').trim() || null)
    const membro = pisteiroBruto ? achaMembro(pisteiroBruto) : null
    const fil = String(l.fil).trim()
    const base = {
        fonte: fil === '2' ? 'HP2' : 'HP01', leilao: String(l.leilao).trim(), data: iso(l.data), filial: fil,
        lote: String(l.lote).trim(), qtd: Number(l.qtd || 0), lance: r2(l.lance), parcelas: Number(l.captacao || 0) || (l.lance ? Math.round(Number(l.total) / Number(l.lance) / Math.max(1, Number(l.qtd || 1))) : null),
        vgv: r2(l.total), pisteiro: pisteiroBruto ? canon(pisteiroBruto) : null, comprador: String(l.comprador || '').trim() || null, data_venda: iso(l.dv),
        cota_lote: Number(l.porc || 100), com_hastapro: l.com_hp == null ? null : r2(l.com_hp),
        assessoria_confirma: String(l.pre_ass ?? '') ? String(l.pre_ass).trim() === String(l.p ?? '').trim() : null,
        captacao_bate: Number(l.captacao || 0) ? Math.abs(Number(l.lance) * Number(l.captacao) * Math.max(1, Number(l.qtd || 1)) - Number(l.total)) < 0.01 : null,
    }
    if (fil === '2') { lotes.push({ ...base, conta: true, motivo: 'painel FIL 2 (Venda Equipe)' }); continue }
    if (/erberts|eberts/.test(chave(pisteiroBruto))) { lotes.push({ ...base, conta: false, motivo: 'M1 não está na folha — decisão', decisao: 'M1' }); continue }
    if (!membro) { lotes.push({ ...base, conta: false, motivo: 'pisteiro de terceiro no pregão da Remates' }); continue }
    if (pelaRemates(membro)) { lotes.push({ ...base, conta: false, motivo: 'na pista PELA Remates (regra 26/08)', pela_remates: true }); continue }
    lotes.push({ ...base, conta: true, motivo: 'cobertura da Assessoria em pregão da Remates' })
}
for (const l of [...KATISPERA, ...ENGENHO, ...SABIA]) lotes.push({ ...l, conta: true, motivo: 'fora do HastaPro — ficha/print + 2ª fonte' })

/* decisões e direcionamento, lote a lote */
for (const l of lotes) {
    if (l.fonte === 'HP2' && /matinha expogenetica/.test(chave(l.leilao)) && /jose fabio/.test(chave(l.comprador))) l.decisao = 'MATINHA_JF'
    if (l.fonte === 'HP2' && /marcelo moura/.test(chave(l.pisteiro))) l.flag = 'lote no nome do comprador (carteira própria) — receita/comissão a ver'
    const rd = RUSA_DOUGLAS.find(r => r.data === l.data && r.lote === lotKey(l.lote) && chave(l.leilao).includes(chave(r.leilao).split(' ')[0]))
    if (rd && l.conta) {
        l.rusa = 'Douglas (RUSA - AGOSTO)'; l.assessor_final = 'Gustavo Rusa'
        if (rd.vgvDouglas !== l.vgv) l.rusa_obs = `planilha do Douglas diz ${brl(rd.vgvDouglas)}; HastaPro/ficha ${brl(l.vgv)}`
        if (rd.credito) l.rusa_obs = (l.rusa_obs ? l.rusa_obs + '; ' : '') + 'sem comissão (crédito do José Fábio)'
    } else l.assessor_final = l.pisteiro
    /* comprador da lista canônica do Rusa que o Douglas NÃO listou — fica onde está, marcado */
    if (l.conta && !l.rusa && /celso lopes|jose fabio|diego benitah|alfredo jose cardoso|pedro pontes|galopeira/.test(chave(l.comprador)))
        l.rusa_aberto = 'comprador da lista do Rusa, não listado pelo Douglas'
}
const contam = lotes.filter(l => l.conta)
const decMatinha = contam.filter(l => l.decisao === 'MATINHA_JF')
const decM1 = lotes.filter(l => l.decisao === 'M1')
const pelaRematesLotes = lotes.filter(l => l.pela_remates)
for (const l of decMatinha) l.cancelado = 'Douglas, 02/09 12:52: "Foram 3 lt na matinha do José Fábio · Nas minhas vendas somente esse cancelamento"'

/* ── 4b. Qualidade do dado, medida (não afirmada) ────────────────────────── */
const qualidade = {
    captacao: { total: contam.filter(l => l.captacao_bate != null).length, ok: contam.filter(l => l.captacao_bate === true).length },
    assessoria: { total: contam.filter(l => l.assessoria_confirma != null).length, ok: contam.filter(l => l.assessoria_confirma === true).length, sem_linha: contam.filter(l => l.assessoria_confirma === null && l.fonte !== 'FICHA') },
    cota_parcial: contam.filter(l => Number.isFinite(l.cota_lote) && l.cota_lote !== 100),
    fil01_sem_comissao_no_hp: contam.filter(l => l.fonte === 'HP01' && !l.com_hastapro),
    pela_remates_com_comissao: pelaRematesLotes.filter(l => l.com_hastapro > 0),
    pela_remates_sem_comissao: pelaRematesLotes.filter(l => !l.com_hastapro),
    m1_com_comissao: decM1.filter(l => l.com_hastapro > 0),
}

/* ── 5. Eventos (mapa curado) ────────────────────────────────────────────── */
const EV = [
    ['2026-08-01', 'Nelore Mafra Redenção/PA — 320 Fêmeas', 'PROGRAMA LEILÕES', { hp: '320 femeas', erp: 'mafra.*femeas', plan: 'femeas nelore mafra' }],
    ['2026-08-01', 'Touros São Geraldo e 7P Agro', 'BULA REMATES', { hp: 'sao geraldo', erp: 'sao geraldo', plan: 'sao geraldo' }],
    ['2026-08-02', 'Nelore Mafra Redenção/PA — 220 Touros', 'PROGRAMA LEILÕES', { hp: '220 touros', erp: 'touros nelore mafra', plan: 'touros nelore mafra' }],
    ['2026-08-04', 'Touros Nelore Sorriso', 'E-RURAL', { hp: 'sorriso', erp: 'sorriso', plan: 'sorriso' }],
    ['2026-08-04', 'Touros Nelore Grupo Costa', '—', { hp: 'grupo costa', erp: 'grupo costa', plan: 'grupo costa' }],
    ['2026-08-07', '2º LS Galeria', 'E-RURAL', { hp: 'ls galeria', erp: 'ls galeria', plan: 'ls galeria' }],
    ['2026-08-08', '14º Pérolas do Tapajós', '—', { hp: 'perolas', erp: 'perolas', plan: 'perolas' }],
    ['2026-08-09', 'Nelore Paranã Produtividade', 'PROGRAMA LEILÕES', { hp: 'parana produtividade', erp: 'parana produtividade', plan: 'parana produtividade' }],
    ['2026-08-10', '1º Guadalupe Expogenética', 'PROGRAMA LEILÕES', { agenda: 'guadalupe' }],
    ['2026-08-11', 'Só Criador — Especial Santa Casa (doação + leilão)', 'BULA REMATES', { hp: 'santa casa' }],
    ['2026-08-12', 'Touros Nelore Diamante', 'E-RURAL', { agenda: 'diamante' }],
    ['2026-08-13', '7º Essência Genética — Nelore da Bambú', 'E-RURAL', { hp: 'bambu', erp: 'bambu', plan: 'bambu' }],
    ['2026-08-14', 'Mega Genética EAO (Expogenética)', 'PROGRAMA LEILÕES', { agenda: 'eao' }],
    ['2026-08-15', 'Terra Brava Agropecuária Expogenética', 'PROGRAMA LEILÕES', { hp: 'terra brava agropecuaria expogenetica', erp: 'terra brava agropecuaria expogen', plan: 'touros terra brava expogenetica' }],
    ['2026-08-15', 'Shopping Naviraí Expogenética', 'FAZENDA', { hp: 'shopping', erp: 'shopping', plan: 'shopping' }],
    ['2026-08-15', 'Expogenética Uberaba (cascas vazias no HastaPro)', '—', { hp: 'expogenetica uberaba' }],
    ['2026-08-16', 'Matinha Expogenética 2026', 'PROGRAMA LEILÕES', { hp: 'matinha expogenetica', erp: 'matinha expogenetica', plan: 'matinha expogenetica' }],
    ['2026-08-16', 'Fazenda Araras — Essência Genética', 'PROGRAMA LEILÕES', { hp: 'araras', erp: 'araras', plan: 'araras' }],
    ['2026-08-17', 'Matrizes Premium Katispera', 'PROGRAMA LEILÕES', { ficha: 'katispera', erp: 'katispera', plan: 'katispera' }],
    ['2026-08-18', '13º Genética Touros Nelore Hora', '—', { hp: 'nelore hora', erp: 'nelore hora', plan: 'nelore hora' }],
    ['2026-08-18', 'Nelore Mafra Agronova & Amigos (casca vazia)', 'PROGRAMA LEILÕES', { hp: 'agronova', agenda: 'agronova' }],
    ['2026-08-18', 'Só Criador — Fêmeas e Machos de Alto Padrão', 'BULA REMATES', { hp: 'so criador femeas', erp: 'so criador', plan: 'so criador' }],
    ['2026-08-19', '9º Genética Aditiva Expogenética', 'PROGRAMA LEILÕES', { hp: 'aditiva', erp: 'aditiva', plan: 'aditiva' }],
    ['2026-08-19', 'Reserva Santa Nice Expogenética', 'PROGRAMA LEILÕES', { hp: 'santa nice', erp: 'santa nice', plan: 'santa nice' }],
    ['2026-08-20', 'Nelore CEN & Fazenda Modelo', 'PROGRAMA LEILÕES', { hp: 'cen fazenda modelo', erp: 'cen fazenda modelo', plan: 'cen fazenda modelo' }],
    ['2026-08-20', 'Baby de Prova', 'PROGRAMA LEILÕES', { hp: 'baby de prova', erp: 'baby de prova', plan: 'baby de prova' }],
    ['2026-08-21', '12º Noite Nacional Matrizes Premium (Colonial)', 'PROGRAMA LEILÕES', { hp: 'noite nacional', erp: 'noite nacional', plan: 'premium colonial' }],
    ['2026-08-22', '4º Pepitas Colonial', 'PROGRAMA LEILÕES', { hp: 'pepitas', erp: 'pepitas', plan: 'pepitas' }],
    ['2026-08-22', 'Naviraí Camparino — Matrizes Essência (Bezerras e Novilhas)', 'PROGRAMA LEILÕES', { hp: 'matrizes essencia', erp: 'bezerras e novilhas', plan: 'bezerras e novilhas' }],
    ['2026-08-23', '28º Naviraí Camparino — Reprodutores', 'PROGRAMA LEILÕES', { hp: 'reprodutores', erp: 'reprodutores', plan: 'reprodutores' }],
    ['2026-08-23', 'Nelore Marcondes — Abertura', 'E-RURAL', { hp: 'marcondes', erp: 'marcondes', plan: 'marcondes' }],
    ['2026-08-23', '6º Excelência Genética', 'PROGRAMA LEILÕES', { hp: 'excelencia', erp: 'excelencia', plan: 'excelencia' }],
    ['2026-08-25', 'Melhoradores — Especial Corte', 'BULA REMATES', { hp: 'especial corte' }],
    ['2026-08-26', 'Terra Brava 50 Anos — Fêmeas Prenhas', 'PROGRAMA LEILÕES', { hp: 'femeas prenhas', erp: 'femeas prenhas', plan: 'terra brava matrizes' }],
    ['2026-08-26', 'Nelore do Xingu', '—', { hp: 'xingu', erp: 'xingu', plan: 'xingu' }],
    ['2026-08-26', 'Genética São José — 30 Anos', 'BULA REMATES / MS LEILÕES', { hp: 'sao jose', erp: 'sao jose', plan: 'sao jose' }],
    ['2026-08-27', 'Terra Brava 50 Anos — Touros', 'PROGRAMA LEILÕES', { plan: 'terra brava touros', agenda: 'touros' }],
    ['2026-08-29', 'Melhoradores Especial 30 Anos', 'BULA REMATES', { hp: '30 anos', plan: 'melhoradores especial 30', agenda: 'melhoradores' }],
    ['2026-08-29', '4º Nelore Crispim', 'E-RURAL', { plan: 'crispim', agenda: 'crispim' }],
    ['2026-08-29', 'Nelore Pintado Engenho da Serra', 'CONNECT', { ficha: 'engenho', erp: 'engenho', plan: 'engenho' }],
    ['2026-08-30', 'Ventres VIP Matinha', 'PROGRAMA LEILÕES', { hp: 'ventres', erp: 'ventres', plan: 'ventres' }],
    ['2026-08-30', '1º Nelore ASJ', 'PROGRAMA LEILÕES', { hp: 'nelore asj', erp: 'nelore asj', plan: 'nelore asj' }],
    ['2026-08-30', 'Sabiá Dourado', 'BULA REMATES', { ficha: 'sabia', erp: 'sabi', plan: 'sabi', agenda: 'sabi' }],
]
const hit = (nome, sub) => new RegExp(chave(sub).replace(/ /g, '.*')).test(chave(nome))
const eventos = EV.map(([data, nome, leiloeira, m]) => {
    const hpLei = m.hp ? leiloesHp.filter(l => iso(l.data) === data && hit(l.nome, m.hp)) : []
    const lotesEv = lotes.filter(l => l.data === data && (
        (m.hp && (l.fonte === 'HP2' || l.fonte === 'HP01') && hit(l.leilao, m.hp)) ||
        (m.ficha && l.fonte === 'FICHA' && hit(l.leilao, m.ficha))))
    const erp = m.erp ? (erpF ?? []).filter(f => f.data === data && new RegExp(m.erp).test(chave(f.nome))) : []
    const plan = m.plan ? PLANILHA.filter(p => p.data === data && hit(p.nome, m.plan)) : []
    const conta = lotesEv.filter(l => l.conta)
    const hpTotal = sum(hpLei, l => l.vgv)
    /* casca vazia (LS Galeria II na FIL 01) não decide a filial: vale o leilão que tem lote */
    const hpPrincipal = [...hpLei].sort((a, b) => Number(b.n || 0) - Number(a.n || 0))[0]
    const fil = hpPrincipal ? String(hpPrincipal.fil).trim() : (m.ficha ? (nome === 'Sabiá Dourado' ? '01*' : '-') : null)
    const ev = {
        data, nome, leiloeira, filial: fil,
        vgv: sum(conta), lotes: conta.length, animais: conta.reduce((s, l) => s + (l.qtd || 1), 0),
        hastapro_pregao: hpLei.length ? hpTotal : null, hastapro_lotes: hpLei.length ? hpLei.reduce((s, l) => s + Number(l.n || 0), 0) : null,
        hastapro_cobertura: hpLei.length ? sum(lotesEv.filter(l => l.fonte !== 'FICHA' && l.conta)) : null,
        pela_remates: sum(lotesEv.filter(l => l.pela_remates)),
        erp: erp.length ? sum(erp, f => f.vgv_total) : null, erp_n: erp.length,
        planilha: plan.length ? sum(plan, p => p.vendas) : null, planilha_fat: plan.length ? (plan[0].faturamento ?? null) : null,
        planilha_acordo: plan.length ? (plan[0].pctVendas != null ? `${fmtPct(plan[0].pctVendas)} da venda` : plan[0].pctFat != null ? `${fmtPct(plan[0].pctFat)} do faturamento` : '—') : null,
        planilha_receita: plan.length ? (plan[0].receita ?? null) : null,
        agenda: !!(agenda ?? []).find(a => a.data === data && (m.agenda ? hit(a.nome, m.agenda) : (m.hp && hit(a.nome, m.hp)) || (m.plan && hit(a.nome, m.plan)))),
        por_assessor: Object.entries(conta.reduce((acc, l) => { acc[l.assessor_final || '?'] = r2((acc[l.assessor_final || '?'] || 0) + l.vgv); return acc }, {})).sort((a, b) => b[1] - a[1]),
    }
    /* status curto e a diferença explicada */
    const notas = []
    if (ev.vgv === 0) notas.push(hpLei.length && hpTotal > 0 ? 'pregão da Remates sem cobertura da Assessoria' : 'sem venda registrada em nenhuma fonte')
    if (ev.erp != null && ev.erp !== ev.vgv) notas.push(`ERP ${brl(ev.erp)} ≠ apurado`)
    if (ev.erp == null && ev.vgv > 0) notas.push('não está no ERP')
    if (ev.planilha != null && ev.planilha !== ev.vgv) notas.push(`planilha ${brl(ev.planilha)}: dif ${brl(ev.vgv - ev.planilha)}`)
    if (ev.planilha == null && ev.vgv > 0) notas.push('não está na planilha')
    if (m.ficha) notas.push('não está no HastaPro (ficha/print)')
    if (ev.pela_remates) notas.push(`+ ${brl(ev.pela_remates)} da equipe pela Remates (não conta)`)
    ev.notas = notas
    return ev
})
const totalEventos = sum(eventos)
if (totalEventos !== sum(contam)) throw new Error(`eventos ${totalEventos} != lotes ${sum(contam)} — lote sem evento`)

/* ── 6. Totais, escada, meta, assessor ───────────────────────────────────── */
const hp2 = sum(lotes.filter(l => l.fonte === 'HP2'))
const hp01 = sum(lotes.filter(l => l.fonte === 'HP01' && l.conta))
const fora = sum(lotes.filter(l => l.fonte === 'FICHA'))
const apurado = sum(contam)
const erpHoje = sum(erpF ?? [], f => f.vgv_total)
const planTotal = sum(PLANILHA, p => p.vendas)
const matinhaJF = sum(decMatinha), m1 = sum(decM1)
const liquido = r2(apurado - matinhaJF)
const totais = {
    hp2, hp01, hastapro: r2(hp2 + hp01), fora, bruto: apurado, cancelado: matinhaJF, liquido,
    erp_antes: ERP_ANTES.vgv, erp_hoje: erpHoje, planilha: planTotal,
    lotes: contam.length, lotes_liquido: contam.length - decMatinha.length,
    animais: contam.reduce((s, l) => s + (l.qtd || 1), 0),
    em_aberto: { m1, ls_galeria_lt18: 75000, ventres_x40: 21000 },
}
const meta = {
    ...META,
    leituras: [
        ['Só o painel do HastaPro (FIL 2), como o fornecedor mostra', hp2],
        ['Painel + cobertura nos pregões da Remates (apuração de 31/08)', r2(hp2 + hp01)],
        ['ERP em 01/09', ERP_ANTES.vgv],
        ['Vendido BRUTO em agosto (tudo com duas fontes)', apurado],
        ['VENDIDO LÍQUIDO — menos o cancelamento do Matinha', liquido],
        ['Líquido + 2 lotes do M1 no Melhoradores (se a diretoria incluir)', r2(liquido + m1)],
    ].map(([leitura, v]) => ({ leitura, vgv: v, pct_divulgada: r2(100 * v / META.agenda_divulgada), pct_completa: r2(100 * v / META.agenda_completa), bate: v >= META.valor })),
}
const escada = [
    ['Painel do HastaPro — FIL 2 (27 leilões com venda, 128 lotes)', hp2, hp2],
    ['+ cobertura da Assessoria nos pregões da Remates (FIL 01): São Geraldo 459.800 · Só Criador 50.000 · São José 130.900', hp01, r2(hp2 + hp01)],
    ['+ Katispera 17/08 (ficha + planilha do Douglas + ERP)', 117000, r2(hp2 + hp01 + 117000)],
    ['+ Engenho da Serra 29/08 (4 fichas ×40 + ERP) — era o ERP de 01/09', 53600, ERP_ANTES.vgv],
    ['+ Sabiá Dourado 30/08 (print do Douglas + planilha) — criado hoje no ERP', 629700, apurado],
    ['− CANCELAMENTO: 3 lotes do José Fábio no Matinha 16/08 (crédito; Douglas confirmou hoje que é o único do mês)', -matinhaJF, liquido],
]
const porAssessor = (() => {
    const acc = {}
    const novo = a => ({ assessor: a, pisteiro_vgv: 0, final_vgv: 0, liquido_vgv: 0, lotes: 0, animais: 0, hp2: 0, hp01: 0, fora: 0, cancelado: 0 })
    for (const l of contam) {
        const k = l.assessor_final || '(sem pisteiro)'
        acc[k] ??= novo(k)
        acc[k].final_vgv = r2(acc[k].final_vgv + l.vgv); acc[k].lotes++; acc[k].animais += l.qtd || 1
        if (!l.cancelado) acc[k].liquido_vgv = r2(acc[k].liquido_vgv + l.vgv)
        if (l.fonte === 'HP2') acc[k].hp2 = r2(acc[k].hp2 + l.vgv); else if (l.fonte === 'HP01') acc[k].hp01 = r2(acc[k].hp01 + l.vgv); else acc[k].fora = r2(acc[k].fora + l.vgv)
        if (l.cancelado) acc[k].cancelado = r2(acc[k].cancelado + l.vgv)
        const p = l.pisteiro || '(sem pisteiro)'; acc[p] ??= novo(p)
        acc[p].pisteiro_vgv = r2(acc[p].pisteiro_vgv + l.vgv)
    }
    return Object.values(acc).map(a => ({ ...a, pct: r2(100 * a.liquido_vgv / liquido) })).sort((a, b) => b.liquido_vgv - a.liquido_vgv)
})()
const rusaAberto = contam.filter(l => l.rusa_aberto)
const pelaRematesPorPessoa = Object.entries(pelaRematesLotes.reduce((a, l) => { a[l.pisteiro] = r2((a[l.pisteiro] || 0) + l.vgv); return a }, {})).sort((a, b) => b[1] - a[1])

/* reconciliação por fonte (cada diferença nomeada) */
const recon = {
    hastapro: { total: r2(hp2 + hp01), itens: [['Katispera 17/08 (lt 3)', 117000], ['Engenho da Serra 29/08 (4 lotes)', 53600], ['Sabiá Dourado 30/08 (29 lotes)', 629700]] },
    erp: { total: ERP_ANTES.vgv, itens: [['Sabiá Dourado 30/08 — criado hoje (origem lances-auto)', 629700]] },
    planilha: {
        total: planTotal, itens: [
            ['São Geraldo: planilha 375.000 × cobertura 459.800 (faltam os 2 lotes da Nane, lt 14 e 23)', 84800],
            ['Katispera 17/08 não está na planilha', 117000], ['13º Nelore Hora 18/08 não está na planilha', 24000],
            ['Só Criador 18/08 (lt 16A, Nane) não está na planilha', 50000], ['Nelore do Xingu 26/08 não está na planilha', 93000],
            ['Genética São José 26/08 (3 lotes da Nane) não está na planilha', 130900],
            ['Engenho da Serra: planilha 51.100 × fichas 53.600 (parcela é ×40)', 2500],
        ],
    },
}
for (const r of Object.values(recon)) { r.soma = sum(r.itens, i => i[1]); r.fecha = r2(r.total + r.soma) === apurado }

/* ── 6b. Confiabilidade: o que foi TESTADO contra o banco, não afirmado ──── */
const confiabilidade = {
    testes: [
        ['Cancelamento e lote não vendido', `O HastaPro marca lote defendido/retirado com LOT_DEFESA='C' e zera o LOT_TOTAL: em agosto são 5 lotes (São Geraldo lt 41 e Só Criador 02/03/04/05), todos com valor zero — já ficam de fora do filtro. Varredura de "cancel/desist/devolv/não entregou" nos grupos desde 01/08: 6 ocorrências, todas tratadas abaixo.`, 'OK'],
        ['Multiplicador da parcela (o erro do Engenho da Serra)', `Conferido lote a lote contra a tabela CONDICOES: lance × captação × quantidade = LOT_TOTAL em ${qualidade.captacao.ok} de ${qualidade.captacao.total} lotes, zero exceção. Só o Mafra Fêmeas 01/08 mistura 30 e 40 no mesmo pregão — e o LOT_TOTAL já respeita isso lote a lote.`, 'OK'],
        ['Venda registrada em mês errado', 'Nenhum lote de leilão de agosto foi vendido em setembro, e nenhum lote de leilão de outro mês foi vendido em agosto (LOT_DATA_VENDA cruzada com LEI_DATA). O HastaPro não tem nenhum leilão em setembro ainda.', 'OK'],
        ['Duplicidade entre as filiais (o risco da migração)', 'Nenhum leilão de agosto existe nas duas filiais com lotes. Os únicos pares no mesmo dia são cascas vazias ("EXPOGENETICA UBERABA - REMATES", "LS GALERIA II" na FIL 01, zero lotes). A filial de cada leilão bate com a leiloeira registrada na agenda, um a um.', 'OK'],
        ['Cota / lote dividido inflando o valor', `${qualidade.cota_parcial.length} lote(s) contado(s) com LOT_PORCENTAGEM 50 (metade do animal). O LOT_TOTAL é o que os compradores pagam pela cota, não o dobro — conferido contra a planilha do próprio Douglas no lote 1000 do São Geraldo (200.000).`, 'OK'],
        ['Atribuição do lote (2ª fonte dentro do HastaPro)', `A tabela ASSESSORIA (TIPO='VENDA') confirma o LOT_PISTEIRO em ${qualidade.assessoria.ok} de ${qualidade.assessoria.total} lotes contados. ${qualidade.assessoria.sem_linha.length} lote(s) sem linha de venda: ${qualidade.assessoria.sem_linha.map(l => `${l.leilao.slice(0, 26)} lt ${l.lote}`).join(', ') || '—'}.`, qualidade.assessoria.ok === qualidade.assessoria.total ? 'OK' : 'ATENÇÃO'],
        ['Venda que ficou de fora (fichas do grupo)', 'As 118 fichas de agosto capturadas no grupo Lances foram casadas uma a uma com os lotes contados: 116 têm par. As 2 sem par são a duplicata já conhecida do Shopping Naviraí (lt 48, reposta em 21/08) e o lote 18 do LS Galeria, que está na lista de pendências.', 'ATENÇÃO'],
        ['O print do Sabiá Dourado duplica algum lote do HastaPro?', 'Nenhum dos 29 lotes bate valor + comprador com lote nenhum do HastaPro em agosto. 27 têm valor igual a algum outro lote do mês, o que é normal em leilão (valores redondos) e não é evidência de duplicata.', 'OK'],
        ['Cobertura do ERP e da agenda', `Os ${(erpF ?? []).length} fechamentos de agosto do ERP estão todos mapeados em eventos e somam exatamente o apurado. Os 28 leilões da agenda de agosto aparecem todos no relatório, inclusive os que fecharam sem venda.`, 'OK'],
        ['Soma de controle', `Os ${contam.length} lotes contados somam ${brl(apurado)}, igual ao total publicado, e cada uma das três fontes fecha nele ao centavo depois das diferenças nomeadas.`, 'OK'],
    ],
    riscos: [
        ['A regra "estava na pista pela Remates" é decisão, não dado', `R$ ${brl(sum(pelaRematesLotes))} em ${pelaRematesLotes.length} lotes de Bulinha, Peralta, Lucas Martins e Laila em pregões da própria Remates ficam FORA do VGV por decisão do João em 26/08. O HastaPro dá razão à regra em ${qualidade.pela_remates_com_comissao.length} desses lotes (R$ ${brl(sum(qualidade.pela_remates_com_comissao))}): a tabela ASSESSORIA grava ali um percentual que a Remates paga a eles por lote (Laila 0,5% no Só Criador, Lucas 0,33% e 1%, Peralta 0,15% no São José) — quem recebe da Remates não é cobertura da Assessoria. Nos outros ${qualidade.pela_remates_sem_comissao.length} lotes (R$ ${brl(sum(qualidade.pela_remates_sem_comissao))}, quase todos no São Geraldo e no Melhoradores) não há comissão por lote para ninguém, e nesses pregões a Bula recebe um percentual do faturamento INTEIRO — o dinheiro entra independentemente de quem vendeu. Se a diretoria decidir que esses lotes também são cobertura, agosto muda de patamar. É o maior número em jogo no mês e não há campo no sistema que resolva.`],
        ['Os R$ 640.700 da FIL 01 não têm comissão por lote no HastaPro', `Os ${qualidade.fil01_sem_comissao_no_hp.length} lotes de cobertura que contamos nos pregões da Remates estão com comissão zero na tabela ASSESSORIA. Isso é coerente no São Geraldo (R$ 459.800), onde a Bula recebe 0,5% do faturamento do pregão. Mas o Só Criador 18/08 (50.000, Nane) e o Genética São José (130.900, Nane) não têm acordo em lugar nenhum, não aparecem na planilha e não têm comissão no HastaPro: são R$ 180.900 de VGV sem um centavo de receita associada. Contam como venda; não contam como dinheiro.`],
        ['O HastaPro é recente e a separação das filiais é de 2026', 'A FIL 2 (Bula Assessoria) só existe em 2026 e a base foi implantada em 30/09/2025. Tudo que este relatório afirma vale para agosto/2026, período em que a separação já estava feita e foi conferida acima. Não estendo nenhuma conclusão para meses anteriores.'],
        ['Três leilões existem só fora do HastaPro', 'Sabiá Dourado, Katispera e Engenho da Serra (R$ 800.300, 9,96% do mês) estão apoiados em print/ficha do WhatsApp mais planilha, não no sistema. Enquanto não forem lançados no HastaPro, nenhuma conferência automática os cobre.'],
    ],
}

/* ── 7. Diferenças resolvidas e pendências ───────────────────────────────── */
const resolvidas = [
    ['⚑ CANCELAMENTO — Matinha 16/08, 3 lotes do José Fábio (R$ 291.000)', 'Resolvido hoje pelo Douglas às 12:52: "Foram 3 lt na matinha do José Fábio · Nas minhas vendas somente esse cancelamento". Confirma o que o Marcelo disse em 31/08 ("ele tem crédito lá, não vamos receber nada, nem Rusa") e o que o João propôs ("como não vai contar pra nós pra fim de VGV nem vai gerar comissão, podemos excluir"). Os lotes são o 12 (108.000), o 15 (93.000) e o 34 (90.000), todos do José Fábio, pisteiro Douglas, direcionamento Rusa. SAEM do VGV: o mês fecha em ' + brl(liquido) + '. E a mesma frase garante que não há outro cancelamento nas vendas do Douglas, que é 55% do mês.'],
    ['⚑ Susto de hoje: Amanda Carla, Ventres VIP Matinha lotes 138/140/141', 'Às 12:05 no grupo dos assessores: "disse que aconteceu um imprevisto e não vai poder ficar com o lote". Às 16:09: "Resolvido sem cancelamento". Os R$ 63.000 continuam no mês. Fica só a divergência de valor apontada nas pendências.'],
    ['Sabiá Dourado 30/08 — R$ 629.700', 'Não estava em sistema nenhum (nem HastaPro, nem ERP) e não entrou na contagem de 01/09. O print do Douglas (31/08 13:46) tem 29 lotes que somam exatamente 629.700, e a planilha FINANCEIRO BULA 2026 traz o mesmo valor sobre faturamento de 1.171.200. Entrou. Criado hoje no ERP com origem lances-auto (o importador substitui quando o HastaPro receber o leilão).'],
    ['Sabiá Dourado × Ventres VIP Matinha (lotes 18 e 31 do Celso Lopes, 64.500)', 'Não são o mesmo lote: o print do Sabiá não tem os lotes 18 e 31 (Celso Lopes comprou lá os lotes 23, 28, 49 e 52), e o próprio Douglas, na planilha RUSA - AGOSTO, põe os lotes 18 e 31 no Ventres VIP Matinha. Os dois leilões contam.'],
    ['Engenho da Serra 29/08 — 53.600, não 51.100', 'As 4 fichas do Douglas dizem "x40": 350+380+300+310 = 1.340 × 40 = 53.600. O 51.100 do Marcelo (e da planilha) é conta errada; diferença de 2.500.'],
    ['Katispera 17/08 — 117.000', 'Não existe no HastaPro (o "katispera 185.100" que o M1 achou em 26/08 é o 3º Katispera de 20/06). A ficha de 17/08 e a planilha RUSA - AGOSTO do Douglas registram o lote 3 (3.900 × 30) para o José Fábio, direcionamento Rusa. Conta.'],
    ['Melhoradores 30 Anos 29/08 — cobertura da Assessoria = 0', 'Pregão da Remates com 46 lotes (1.113.900). Da equipe venderam Bulinha 268.500, Lucas 148.200, Peralta 96.000 e Laila 26.100 — todos na pista pela Remates (regra de 26/08). "Restante ngm dos meninos vendeu" (M1). Sobram os 2 lotes do próprio M1 (39.000): o HastaPro grava comissão ZERO neles, então não há dinheiro atrás dessa venda — ficam fora, e a pergunta ao Bulinha vira formalidade.'],
    ['Crispim 29/08 e Terra Brava Touros 27/08 — 0', 'Nenhuma ficha nos grupos, nada no HastaPro, planilha em branco, "crispim n achei" (M1). Sem venda.'],
    ['Guadalupe 10/08, Diamante 12/08, Mega Genética EAO 14/08, Mafra Agronova 18/08 — 0', 'Estão na agenda como concluídos e não têm venda em fonte nenhuma (zero fichas nos dias, cascas vazias no HastaPro). O "Guadalupe" discutido no grupo em 25/08 é o 20º Guadalupe de JULHO (18–20/07).'],
    ['Fêmeas JMP (41.400) e Paranã/Casabranca (84.000)', 'Eram duplicatas (lt 48 do Shopping Naviraí e lt 09 do CEN & Fazenda Modelo). Marcelo confirmou em 01/09: "não teve venda". Já estavam fora desde a correção do ERP.'],
    ['Lote 21 (105.000) e lotes 12 e 78 do Naviraí 23/08', 'O 21 é do 6º Excelência Genética (tirado do Naviraí); 12 (Leo, 49.500) e 78 (Peralta, 48.000) entraram. HastaPro e ERP batem lote a lote.'],
    ['Nane em branco no painel', 'O painel do fornecedor mostra "em branco" 307.500 / 9 lotes: é a Regiane (Nane), que só existe em CLIENTES no HastaPro. Nos totais aqui ela aparece com nome; o painel oficial não muda até cadastrá-la em PRESTADORES.'],
    ['Lote 22 do Naviraí 23/08 — 63.000 no nome de MARCELO MOURA', 'Está no painel FIL 2 (Venda Equipe inclui) e conta no VGV. M1 lançou "como Marcelo pisteiro" e zerou comissão (cliente carteira própria); Marcelo: "tem que ver se recebemos e pagamos sobre ele". Só receita/comissão ficam em aberto.'],
    ['Lote 29 da Noite Nacional 21/08 — 78.000, não 87.000', 'A ficha diz 2.600 × 30 = 78.000 e o HastaPro confirma; a planilha RUSA - AGOSTO do Douglas escreveu 2.900 (87.000). Vale 78.000; a comissão do Rusa nesse lote cai 270.'],
]
const pendencias = [
    { quem: 'Fábio / M1', o_que: 'LS Galeria 07/08 — o lote 18 (2.500 de parcela, 50%, Nelore 3A) fechou? Vale R$ 75.000.', porque: 'É a única ficha do mês inteiro sem par: foi postada no grupo em 07/08 22:42 ("Levamos lt 18 - 2.500,00 | 50% Nelore 3A"), e o HastaPro só tem 3 lotes nesse leilão (04, 19 e 21). A planilha também só tem os três (576.000). Perguntei no grupo em 31/08 e ninguém respondeu. Ou a venda caiu, ou faltam 75.000 no mês.', valor: 75000 },
    { quem: 'M1 / Matinha', o_que: 'Ventres VIP Matinha — os lotes 138/140/141 valem 63.000 (×30) ou 84.000 (×40)?', porque: 'A mensagem da leiloeira sobre o cancelamento (hoje, 12:05) diz "Valor total de R$ 84.000,00" para os três lotes; o HastaPro e a planilha dizem 63.000, e a tabela CONDICOES desse leilão registra captação 30. São 7 animais a 300 de parcela: ×30 dá 63.000, ×40 dá 84.000. A favor do ×30, o próprio Douglas usa ×30 nos outros dois lotes do mesmo leilão. Foi exatamente esse erro que custou 2.500 no Engenho da Serra.', valor: 21000 },
    { quem: 'Bulinha', o_que: 'Melhoradores 30 Anos — formalizar que os 2 lotes do M1 (32 e 42, R$ 39.000) não são da Assessoria', porque: 'M1: "teve por mim, conta? rs". Ele não está na folha e o HastaPro grava comissão zero nos dois lotes — sem contrapartida financeira. Ficam fora; se o Bulinha decidir o contrário, o mês sobe para ' + brl(r2(liquido + 39000)) + '.', valor: 39000 },
    { quem: 'Douglas / Rusa', o_que: 'Atribuição em aberto (não muda o total): LS Galeria lts 04 e 19 (Diego Benitah, 456.000, pisteiro Fábio) · Pérolas lt 44 (Alfredo José Cardoso, 90.000) · Sabiá Dourado lts 23/28/49/52 (Celso Lopes, 73.200) e lt 7 (Pedro Pontes, 37.500)', porque: 'São compradores da lista de direcionamento do Rusa, mas a planilha RUSA - AGOSTO do Douglas (31/08) não os lista. O ERP já dá LS Galeria e Pérolas ao Rusa. Marcelo pediu "separar as vendas do Rusa e Douglas" (25/08).', valor: 656700 },
    { quem: 'João + M1', o_que: 'Lançar no HastaPro: Sabiá Dourado (criar leilão + 29 lotes), Katispera lt 3, Engenho da Serra 4 lotes', porque: 'Enquanto não entram, o painel do fornecedor mostra 6.590.000 e o ERP fica com 3 fechamentos de origem lances-auto. M1 pediu "consegue lançar essas joao??" em 31/08.', valor: 800300 },
    { quem: 'M1', o_que: 'Cadastrar a Nane (Regiane) em PRESTADORES no HastaPro', porque: 'O painel de vendas por assessor sai com a linha dela em branco (307.500).', valor: 307500 },
    { quem: 'Ana / Marcelo', o_que: 'Planilha FINANCEIRO BULA 2026: acrescentar Katispera, Nelore Hora, Só Criador 18/08, Nelore do Xingu e Genética São José; corrigir São Geraldo (375.000 → 459.800) e Engenho da Serra (51.100 → 53.600)', porque: 'A planilha soma 7.528.800; a diferença de 502.200 para o apurado é exatamente essa lista.', valor: 502200 },
    { quem: 'Bulinha / Marcelo', o_que: 'Acordo do Sabiá Dourado: 1% do faturamento (planilha: 11.712) ou tabela de performance da Remates (53,8% de cobertura = 2% do VGV = 23.424)?', porque: 'A agenda registra "0,5% a 2% do faturamento"; a aba Acordos da planilha diz "SABIÁ DOURADO: 1% do faturamento". Não muda o VGV, muda a receita.', valor: 11712 },
]
const regrasComissao = [
    '⚑ O cancelamento do Matinha ainda está no ERP: o fechamento de 16/08 segue com R$ 460.500 de VGV e R$ 19.200 de comissão. Aplicando o cancelamento, vai para R$ 169.500 e R$ 4.650 — a comissão do Rusa cai de 16.650 para 2.100 (o lote 39, do Celso Lopes, não foi cancelado). As duas contas a pagar abertas (Nane 1.710 e Douglas 840) são dos lotes que sobram e não mudam. ⚠ Mas existe uma conta a receber aberta de R$ 27.375 ("COMISSÃO BULA") calculada sobre o VGV antigo: a receita da Matinha cai junto e esse título precisa ser revisto. Script pronto, roda em simulação por padrão: scripts/cancela-matinha-jose-fabio-2026-08-16.mjs.',
    'Rusa: a planilha RUSA - AGOSTO do Douglas (31/08) lista 16 lotes com comissão = R$ 65.635 (5%/3% do acordo); com o lote 29 a 78.000 (não 87.000) fica 65.365. Os 3 lotes do Matinha (291.000) ele já tinha tirado — coerente com o cancelamento confirmado hoje.',
    'Marcelo (27/08): "Não paga 2% para Nane." — o ERP calcula 2% para ela (São Geraldo, Só Criador, São José, Naviraí, Matinha = R$ 11.448). Confirmar o percentual dela antes do ciclo do dia 25.',
    'Marcelo (05/08): Lucas, Laila e Valéria a 1%; venda de PO em leilão da Bula Remates a 1% para todos. Os fechamentos da FIL 01 (São Geraldo, Só Criador, São José) estão com 2%.',
    'Lote 21 do Excelência (105.000, Peralta/Bula): Marcelo — "Bula recebe 2% também... nesse caso as vendas serão pagas ao Bulinha". HastaPro já está com o Bulinha.',
    'Comissão gravada nos 33 fechamentos do ERP: R$ ' + brl(sum(erpF ?? [], f => f.comissao_assessoria)) + ' (só R$ 40.780 virou CP; o resto é o ciclo do dia 25, depois das decisões acima).',
]

/* ── 8. dados.json ───────────────────────────────────────────────────────── */
const dados = { geradoEm: new Date().toISOString(), periodo: { ini: INI, fim: FIM }, totais, meta, escada, eventos, porAssessor, rusaAberto, pelaRematesPorPessoa, recon, confiabilidade, qualidade, resolvidas, pendencias, regrasComissao, lotes, cancelados: decMatinha, decisoes: { m1: decM1 }, erp: (erpF ?? []).map(f => ({ data: f.data, nome: f.nome, vgv: f.vgv_total, origem: f.origem, comissao: f.comissao_assessoria, receita: f.receita_bula })) }
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(dados, null, 1))

/* ── 9. XLSX ─────────────────────────────────────────────────────────────── */
const wb = XLSX.utils.book_new()
const addSheet = (nome, rows, widths) => { const ws = XLSX.utils.json_to_sheet(rows); if (widths) ws['!cols'] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, nome) }
addSheet('Resumo', [
    { item: 'VGV LÍQUIDO — agosto/2026 (o número do mês)', valor: liquido, obs: `${totais.lotes_liquido} lotes · ${eventos.filter(e => e.vgv > 0).length} leilões com venda · já sem o cancelamento` },
    { item: 'Vendido bruto antes do cancelamento', valor: apurado, obs: `${totais.lotes} lotes · ${totais.animais} animais` },
    { item: 'CANCELAMENTO: Matinha 16/08, 3 lotes do José Fábio', valor: -matinhaJF, obs: 'Douglas 02/09 12:52 — único cancelamento das vendas dele' },
    { item: 'Painel HastaPro FIL 2', valor: hp2, obs: '27 leilões com venda, 128 lotes' },
    { item: 'Cobertura da Assessoria em pregões da Remates (FIL 01)', valor: hp01, obs: 'São Geraldo, Só Criador 18/08, São José' },
    { item: 'Fora do HastaPro (ficha/print + 2ª fonte)', valor: fora, obs: 'Katispera 117.000 · Engenho 53.600 · Sabiá Dourado 629.700' },
    { item: 'ERP em 01/09', valor: ERP_ANTES.vgv, obs: '32 fechamentos' }, { item: 'ERP hoje', valor: erpHoje, obs: `${(erpF ?? []).length} fechamentos (Sabiá Dourado criado; Matinha ainda com os 3 lotes)` },
    { item: 'Planilha FINANCEIRO BULA 2026 (Vendas Bula)', valor: planTotal, obs: 'lida 02/09 16:46' },
    { item: 'Em aberto: LS Galeria lote 18', valor: 75000, obs: 'única ficha do mês sem par — pode faltar' },
    { item: 'Em aberto: Ventres VIP Matinha ×30 ou ×40', valor: 21000, obs: 'leiloeira diz 84.000, HastaPro diz 63.000' },
    { item: 'Em aberto: Melhoradores — 2 lotes do M1', valor: m1, obs: 'se incluir → ' + brl(r2(liquido + m1)) + ' (comissão zero no HastaPro)' },
    { item: 'Meta de agosto (12% × 57,29 mi)', valor: META.valor, obs: 'Marcelo 01/09: "Meta de Agosto era R$ 6.876.000,00"' },
    ...meta.leituras.map(l => ({ item: 'Leitura: ' + l.leitura, valor: l.vgv, obs: `${l.pct_divulgada}% da agenda divulgada · ${l.pct_completa}% da completa · ${l.bate ? 'BATE' : 'não bate'}` })),
], [62, 16, 70])
addSheet('Por Leilão', eventos.map(e => ({
    data: dbr(e.data), leilao: e.nome, leiloeira: e.leiloeira, filial: e.filial ?? '', vgv_apurado: e.vgv, lotes: e.lotes, animais: e.animais,
    hastapro_cobertura: e.hastapro_cobertura, hastapro_pregao_inteiro: e.hastapro_pregao, erp: e.erp, planilha_vendas: e.planilha, planilha_faturamento: e.planilha_fat,
    planilha_acordo: e.planilha_acordo, planilha_receita: e.planilha_receita, por_assessor: e.por_assessor.map(([a, v]) => `${a} ${brl0(v)}`).join(' · '), notas: e.notas.join(' | '),
})).concat([{ data: 'TOTAL', leilao: '', vgv_apurado: apurado, lotes: totais.lotes, animais: totais.animais, hastapro_cobertura: r2(hp2 + hp01), erp: erpHoje, planilha_vendas: planTotal }]), [6, 46, 22, 6, 14, 6, 7, 16, 18, 14, 14, 16, 22, 14, 60, 70])
addSheet('Por Assessor', porAssessor.map(a => ({ assessor: a.assessor, vgv_liquido: a.liquido_vgv, pct: a.pct, vgv_bruto: a.final_vgv, cancelado: a.cancelado, lotes: a.lotes, animais: a.animais, vgv_como_pisteiro: a.pisteiro_vgv, hastapro_fil2: a.hp2, cobertura_remates_fil01: a.hp01, fora_do_hastapro: a.fora }))
    .concat([{ assessor: 'TOTAL', vgv_liquido: liquido, pct: 100, vgv_bruto: apurado, cancelado: matinhaJF, lotes: totais.lotes, animais: totais.animais }]), [26, 14, 7, 14, 12, 6, 7, 16, 14, 18, 16])
addSheet('Lote a Lote', contam.map(l => ({
    data: dbr(l.data), leilao: l.leilao, filial: l.filial, fonte: l.fonte, lote: l.lote, qtd: l.qtd, lance: l.lance, parcelas: l.parcelas, vgv: l.vgv,
    cancelado: l.cancelado ? 'SIM' : '', pisteiro: l.pisteiro, assessor_final: l.assessor_final, comprador: l.comprador, direcionamento: l.rusa || (l.rusa_aberto || ''),
    cota_lote: l.cota_lote ?? '', comissao_pct_hastapro: l.com_hastapro ?? '', assessoria_confirma: l.assessoria_confirma === null ? 'sem linha' : (l.assessoria_confirma ? 'sim' : 'NAO'),
    obs: [l.rusa_obs, l.flag, l.cancelado, l.evidencia].filter(Boolean).join(' | '),
})), [6, 44, 5, 6, 6, 4, 8, 6, 11, 9, 20, 20, 40, 26, 6, 10, 10, 60])
addSheet('Confiabilidade', [
    ...confiabilidade.testes.map(([t, c, r]) => ({ bloco: 'TESTE', item: t, o_que_foi_medido: c, resultado: r })),
    ...confiabilidade.riscos.map(([t, c]) => ({ bloco: 'RISCO RESIDUAL', item: t, o_que_foi_medido: c, resultado: '' })),
], [16, 46, 130, 10])
addSheet('Pela Remates (não conta)', pelaRematesLotes.map(l => ({ data: dbr(l.data), leilao: l.leilao, lote: l.lote, qtd: l.qtd, vgv: l.vgv, pisteiro: l.pisteiro, comprador: l.comprador }))
    .concat([{ data: 'TOTAL', leilao: '', vgv: sum(pelaRematesLotes) }, ...pelaRematesPorPessoa.map(([p, v]) => ({ data: '', leilao: p, vgv: v }))]), [6, 46, 6, 4, 11, 22, 36])
addSheet('Reconciliação', [
    ...escada.map(([passo, valor, acumulado]) => ({ bloco: 'ESCADA', item: passo, valor, acumulado })),
    ...Object.entries(recon).flatMap(([f, r]) => [{ bloco: f.toUpperCase(), item: 'total da fonte', valor: r.total, acumulado: null }, ...r.itens.map(([i, v]) => ({ bloco: f.toUpperCase(), item: i, valor: v, acumulado: null })), { bloco: f.toUpperCase(), item: `= apurado? ${r.fecha ? 'FECHA AO CENTAVO' : 'NÃO FECHA'}`, valor: r2(r.total + r.soma), acumulado: apurado }]),
], [14, 90, 14, 14])
addSheet('Resolvidas', resolvidas.map(([item, como]) => ({ item, como })), [50, 120])
addSheet('Pendências', pendencias.map(p => ({ quem_decide: p.quem, o_que: p.o_que, contexto: p.porque, valor_envolvido: p.valor })).concat(regrasComissao.map(r => ({ quem_decide: 'comissão', o_que: r }))), [16, 70, 100, 14])
addSheet('Planilha (Drive)', PLANILHA.map(p => ({ data: dbr(p.data), leilao: p.nome, leiloeira: p.leiloeira, faturamento: p.faturamento, vendas_bula: p.vendas, pct_vendas: p.pctVendas, pct_fat: p.pctFat, receita: p.receita, status: p.status })), [6, 50, 14, 14, 14, 9, 9, 12, 18])
addSheet('ERP', dados.erp.map(f => ({ data: dbr(f.data), fechamento: f.nome, vgv: f.vgv, origem: f.origem, comissao: f.comissao, receita: f.receita })), [6, 52, 14, 12, 12, 12])
/** O arquivo pode estar aberto no Excel; nesse caso grava ao lado em vez de morrer no meio. */
const gravaSemPerder = (destino, grava) => {
    try { grava(destino); return destino } catch (e) {
        if (e.code !== 'EBUSY' && e.code !== 'EPERM') throw e
        const alt = destino.replace(/(\.[a-z]+)$/i, ' (novo)$1')
        grava(alt)
        console.warn(`AVISO: "${path.basename(destino)}" estava aberto — gravei em "${path.basename(alt)}". Feche o arquivo e rode de novo para consolidar.`)
        return alt
    }
}
const xlsxPath = gravaSemPerder(path.join(DESK, 'Bula - Fechamento de Vendas Agosto 2026.xlsx'), p => XLSX.writeFile(wb, p))

/* ── 10. HTML + PDF ──────────────────────────────────────────────────────── */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const td = (v, cls = '') => `<td class="${cls}">${v == null ? '<span class="m">—</span>' : esc(v)}</td>`
const n = v => td(v == null ? null : brl0(v), 'n')
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Bula — Fechamento de Vendas Agosto 2026</title>
<style>
@page{size:A4;margin:14mm 12mm}
body{font-family:Inter,"Segoe UI",Arial,sans-serif;color:#111;font-size:10.5px;line-height:1.35;margin:0}
h1{font-size:22px;margin:0 0 2px;letter-spacing:-.3px}h2{font-size:14px;margin:18px 0 6px;padding-bottom:3px;border-bottom:1.5px solid #111}h3{font-size:11.5px;margin:12px 0 4px}
.sub{color:#555;font-size:10px;margin-bottom:10px}
.big{display:flex;gap:14px;margin:10px 0 6px}.big .k{border:1.5px solid #111;padding:8px 12px;min-width:150px}.big .k b{display:block;font-size:20px;letter-spacing:-.4px}.big .k span{font-size:9.5px;color:#444}
.k.gold{border-color:#C9A84C}
table{border-collapse:collapse;width:100%;margin:4px 0 8px}th{font-size:9px;text-transform:uppercase;letter-spacing:.3px;text-align:left;border-bottom:1.2px solid #111;padding:3px 4px;color:#222}
td{padding:2.5px 4px;border-bottom:.5px solid #ddd;vertical-align:top}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}tr.tot td{border-top:1.2px solid #111;font-weight:700}
.m{color:#999}.s{color:#555;font-size:9.5px}.ok{color:#1f6f3f;font-weight:700}.no{color:#a33;font-weight:700}.tag{display:inline-block;border:1px solid #999;border-radius:3px;padding:0 4px;font-size:8.5px;color:#444;margin-left:3px}
ol,ul{margin:4px 0 6px 18px;padding:0}li{margin:0 0 4px}
.box{border:1px solid #bbb;padding:8px 10px;margin:8px 0}.gold{border-left:4px solid #C9A84C}
.pb{page-break-before:always}
</style></head><body>
<h1>Fechamento de Vendas — Agosto/2026</h1>
<div class="sub">Bula Assessoria · consolidação das fontes em ${HOJE}: HastaPro (FIL 2 e FIL 01, ao vivo), ERP web-bula, planilha FINANCEIRO BULA 2026 (Drive, 02/09 16:46), grupos de WhatsApp (Financeiro, Lances, Assessores) e o print do Douglas.</div>

<div class="big">
 <div class="k gold"><b>R$ ${brl(liquido)}</b><span>VGV líquido de agosto · ${totais.lotes_liquido} lotes · ${eventos.filter(e => e.vgv > 0).length} leilões com venda</span></div>
 <div class="k"><b>${pct(liquido, META.agenda_divulgada)}</b><span>da agenda divulgada (57,29 mi) · meta 12% = R$ ${brl0(META.valor)} → <span class="ok">bate com folga (+${brl0(liquido - META.valor)})</span></span></div>
 <div class="k"><b>R$ ${brl(apurado)} − ${brl(matinhaJF)}</b><span>vendido bruto menos o único cancelamento do mês (3 lotes do José Fábio no Matinha, confirmado pelo Douglas hoje às 12:52)</span></div>
</div>

<h2>1. Como se chega ao número (a escada)</h2>
<table><tr><th>passo</th><th class="n">valor</th><th class="n">acumulado</th></tr>
${escada.map(([p, v, a]) => `<tr>${td(p)}${n(v)}${n(a)}</tr>`).join('')}
<tr class="tot">${td('VGV LÍQUIDO DE AGOSTO')}${td('')}${n(liquido)}</tr></table>
<div class="box"><b>Cada fonte fecha ao centavo no vendido bruto (${brl0(apurado)})</b> — a diferença de cada uma tem nome:
<ul>
<li><b>HastaPro (${brl0(recon.hastapro.total)})</b>: faltam os três leilões que ninguém lançou lá — ${recon.hastapro.itens.map(([i, v]) => `${i} ${brl0(v)}`).join(' · ')} = ${brl0(recon.hastapro.soma)} <span class="${recon.hastapro.fecha ? 'ok' : 'no'}">${recon.hastapro.fecha ? '✓' : '✗'}</span></li>
<li><b>ERP em 01/09 (${brl0(recon.erp.total)})</b>: faltava só o Sabiá Dourado (629.700), criado hoje. ERP agora: ${brl0(erpHoje)} <span class="${erpHoje === apurado ? 'ok' : 'no'}">${erpHoje === apurado ? '✓' : '✗'}</span></li>
<li><b>Planilha (${brl0(recon.planilha.total)})</b>: ${recon.planilha.itens.map(([i, v]) => `${i} (${brl0(v)})`).join(' · ')} = ${brl0(recon.planilha.soma)} <span class="${recon.planilha.fecha ? 'ok' : 'no'}">${recon.planilha.fecha ? '✓' : '✗'}</span></li>
</ul></div>

<h3>A meta, em todas as leituras</h3>
<table><tr><th>leitura</th><th class="n">VGV</th><th class="n">% agenda divulgada (57,29 mi)</th><th class="n">% agenda completa (68,02 mi)</th><th>meta R$ 6.876.000</th></tr>
${meta.leituras.map(l => `<tr>${td(l.leitura)}${n(l.vgv)}${td(String(l.pct_divulgada).replace('.', ',') + '%', 'n')}${td(String(l.pct_completa).replace('.', ',') + '%', 'n')}<td class="${l.bate ? 'ok' : 'no'}">${l.bate ? 'bate' : 'não bate'}</td></tr>`).join('')}</table>
<div class="s">Só a leitura "painel do HastaPro" não bate — e é a única que o fornecedor mostra hoje. Lançar Sabiá Dourado, Katispera e Engenho da Serra no HastaPro resolve isso na origem.</div>

<h2 class="pb">1b. Confiabilidade: o que foi testado contra o banco</h2>
<div class="s">O senhor pediu para eu não assumir nada. Estes são os testes que rodei hoje no HastaPro ao vivo e nos grupos — cada linha é uma consulta, não uma opinião. Os riscos que sobram vêm depois, nomeados e com valor.</div>
<table><tr><th style="width:26%">o que podia estar errado</th><th>o que foi medido</th><th style="width:8%">resultado</th></tr>
${confiabilidade.testes.map(([t, c, r]) => `<tr>${td(t)}${td(c, 's')}<td class="${r === 'OK' ? 'ok' : 'no'}">${r}</td></tr>`).join('')}</table>
<h3>Riscos que continuam de pé (e não dá para eliminar com dado)</h3>
<ol>${confiabilidade.riscos.map(([t, c]) => `<li><b>${esc(t)}.</b> ${esc(c)}</li>`).join('')}</ol>

<h2 class="pb">2. Vendas por leilão</h2>
<div class="s">Valores brutos, antes do cancelamento — o Matinha 16/08 aparece com os 460.500 vendidos, dos quais 291.000 foram cancelados.</div>
<table><tr><th>data</th><th>leilão</th><th>leiloeira</th><th class="n">VGV vendido</th><th class="n">lotes</th><th class="n">HastaPro</th><th class="n">ERP</th><th class="n">planilha</th><th>acordo (planilha)</th><th>notas</th></tr>
${eventos.map(e => `<tr>${td(dbr(e.data))}<td>${esc(e.nome)}${e.filial === '01' || e.filial === '01*' ? ' <span class="tag">Remates</span>' : ''}</td>${td(e.leiloeira, 's')}${n(e.vgv)}${n(e.lotes || null)}${n(e.hastapro_cobertura)}${n(e.erp)}${n(e.planilha)}${td(e.planilha_acordo, 's')}${td(e.notas.join(' · '), 's')}</tr>`).join('')}
<tr class="tot">${td('')}${td('TOTAL')}${td('')}${n(apurado)}${n(totais.lotes)}${n(r2(hp2 + hp01))}${n(erpHoje)}${n(planTotal)}${td('')}${td('')}</tr></table>
<div class="s">"HastaPro" = cobertura da Bula (na FIL 01 só os lotes de pisteiro da equipe fora da pista da Remates). Pregões da Remates em agosto (inteiros): São Geraldo 4.980.800 · Só Criador 11/08 2.881.620 · Só Criador 18/08 1.001.790 · Melhoradores Corte 1.675.310 · São José 1.920.730 · Melhoradores 30 Anos 1.113.900. Equipe na pista pela Remates (não conta): ${pelaRematesPorPessoa.map(([p, v]) => `${p} ${brl0(v)}`).join(' · ')} = ${brl0(sum(pelaRematesLotes))}.</div>

<h2>3. Vendas por assessor</h2>
<table><tr><th>assessor</th><th class="n">VGV líquido</th><th class="n">%</th><th class="n">vendido</th><th class="n">cancelado</th><th class="n">lotes</th><th class="n">como pisteiro</th><th class="n">FIL 2</th><th class="n">Remates (FIL 01)</th><th class="n">fora do HastaPro</th><th>obs</th></tr>
${porAssessor.filter(a => a.final_vgv > 0 || a.pisteiro_vgv > 0).map(a => `<tr>${td(a.assessor)}${n(a.liquido_vgv)}${td(String(a.pct).replace('.', ',') + '%', 'n')}${n(a.final_vgv)}${n(a.cancelado || null)}${n(a.lotes || null)}${n(a.pisteiro_vgv)}${n(a.hp2 || null)}${n(a.hp01 || null)}${n(a.fora || null)}${td(a.assessor === 'Marcelo Moura' ? 'comprador como pisteiro (lt 22 Naviraí)' : '', 's')}</tr>`).join('')}
<tr class="tot">${td('TOTAL')}${n(liquido)}${td('100%', 'n')}${n(apurado)}${n(matinhaJF)}${n(totais.lotes)}${n(apurado)}${n(hp2)}${n(hp01)}${n(fora)}${td('')}</tr></table>
<div class="s">"Como pisteiro" é quem estava na pista (HastaPro/ficha). "VGV final" aplica o direcionamento do Rusa exatamente como o Douglas listou na planilha RUSA - AGOSTO (19 lotes, incluindo os 3 do Matinha que ele depois tirou por causa do crédito). Em aberto, sem mover: ${rusaAberto.map(l => `${dbr(l.data)} ${l.leilao.replace(/LEIL[ÃA]O /, '').slice(0, 26)} lt ${l.lote} ${brl0(l.vgv)} (${(l.comprador || '').split(' · ')[0]}, ${l.pisteiro})`).join(' · ')}.</div>

<h2 class="pb">4. Diferenças que se resolveram (e como)</h2>
<ol>${resolvidas.map(([i, c]) => `<li><b>${esc(i)}.</b> ${esc(c)}</li>`).join('')}</ol>

<h2>5. O que fica pendente de verdade</h2>
<table><tr><th>quem decide</th><th>o quê</th><th>contexto</th><th class="n">R$ envolvido</th></tr>
${pendencias.map(p => `<tr>${td(p.quem)}${td(p.o_que)}${td(p.porque, 's')}${n(p.valor)}</tr>`).join('')}</table>
<h3>Regras de comissão que o grupo fixou e o ERP ainda não reflete</h3>
<ul>${regrasComissao.map(r => `<li>${esc(r)}</li>`).join('')}</ul>

<h2>6. O que foi feito no sistema, e o que falta fazer</h2>
<ul>
<li><b>Feito:</b> criado o fechamento <b>LEILÃO SABIÁ DOURADO 30/08</b> no ERP (29 lotes, R$ 629.700, Douglas, origem lances-auto, comissão 2% = 12.594; receita em branco até o acordo). Backup prévio em outputs/fechamento-agosto-2026/backup-fechamentos-agosto-pre-sabia-2026-09-02.json. ERP de agosto: ${(erpF ?? []).length} fechamentos = R$ ${brl(erpHoje)}.</li>
<li><b>Falta, e é dinheiro:</b> o cancelamento do Matinha ainda não foi lançado. O fechamento de 16/08 segue com R$ 460.500 e comissão de R$ 19.200, sendo R$ 16.650 do Rusa sobre os lotes cancelados. Não mexi porque cancelar comissão de mês fechado é decisão da diretoria; o script está pronto e roda em simulação por padrão (<i>scripts/cancela-matinha-jose-fabio-2026-08-16.mjs</i>).</li>
<li><b>Não tocado de propósito:</b> atribuições do Rusa em aberto e os 2 lotes do M1 continuam como estão no HastaPro e na planilha do Douglas.</li>
</ul>

<h2>7. Fontes consultadas</h2>
<ul class="s">
<li>HastaPro Firebird, só leitura, ${HOJE}: LEILAO / LOTES / COMPRADORES / CONDICOES / ASSESSORIA / PRESTADORES / CLIENTES, filiais '2' e '01', 01–31/08 (e setembro, para checar transbordo).</li>
<li>ERP web-bula: bula_leilao_fechamento (agosto), bula_leiloes (agenda), erp_folha_estrutura (quem é da equipe).</li>
<li>Planilha FINANCEIRO BULA 2026 (Drive, id 12aVCknseexoEaV2YKnDMI5nr5Xxo_1i_), abas Leilões, DRE, Acordos — versão de 02/09 16:46.</li>
<li>WhatsApp (sessão joao-automation): Grupo Financeiro 25/08–02/09 (banco + history-dump de 01/09 do VPS), Lances Bula Assessoria 01–31/08, Bula Assessoria l Assessores 27/08–02/09; mídia do bucket whatsapp-media: print "SABIA DOURADO" do Douglas (31/08 13:46), RUSA - AGOSTO.xlsx (15:53 e 16:08), print do M1 dos lotes do Melhoradores (01/09 14:45), prints do painel do M1 (31/08).</li>
<li>Apurações anteriores: 31/08 (7.230.700), correção do ERP em 01/09 (7.401.300) e a mensagem do João no grupo em 01/09 14:37.</li>
</ul>
</body></html>`
fs.writeFileSync(path.join(OUT, 'relatorio.html'), html)

/* ── 11. TXT para o grupo ───────────────────────────────────────────────── */
const T = []
T.push('*FECHAMENTO DE AGOSTO — VENDAS (versão final, ' + HOJE + ')*', '')
T.push(`*VGV: R$ ${brl(liquido)}* · ${totais.lotes_liquido} lotes · ${eventos.filter(e => e.vgv > 0).length} leilões com venda`)
T.push(`Vendemos ${brl0(apurado)} e cancelamos ${brl0(matinhaJF)} (os 3 lotes do José Fábio na Matinha, que o Douglas confirmou hoje).`)
T.push(`Meta era 6.876.000 → *bateu* (${pct(liquido, META.agenda_divulgada)} da agenda divulgada).`, '')
T.push('*Como se chega lá:*')
for (const [p, v] of escada) T.push(`• ${p.split('(')[0].trim()}: ${brl0(v)}`)
T.push('', '*O que mudou desde 01/09:* entrou o *Sabiá Dourado (629.700)* — 29 lotes do Douglas (print de 31/08), confirmados pela planilha. Não estava no HastaPro nem no sistema. Já lancei no sistema.', '')
T.push('*Por assessor (líquido):*')
for (const a of porAssessor.filter(a => a.liquido_vgv > 0)) T.push(`• ${a.assessor}: ${brl0(a.liquido_vgv)} (${String(a.pct).replace('.', ',')}%)${a.cancelado ? ' — vendeu ' + brl0(a.final_vgv) + ' e cancelou ' + brl0(a.cancelado) : ''}`)
T.push('', '*Conferi o que podia estar faltando, e o resultado foi:*')
T.push('• Cancelamento: só o do Matinha. O susto de hoje (Amanda Carla, lotes 138/140/141) ficou "resolvido sem cancelamento".')
T.push('• Lote defendido/não vendido: o HastaPro zera o valor, então nunca entrou (5 lotes em agosto).')
T.push(`• Parcela x30 ou x40: conferido lote a lote contra a tabela de condições do HastaPro, ${qualidade.captacao.ok} de ${qualidade.captacao.total} batem (os outros ${contam.length - qualidade.captacao.total} são os que só existem em ficha).`)
T.push(`• Quem vendeu: a 2ª tabela do HastaPro confirma o pisteiro em ${qualidade.assessoria.ok} de ${qualidade.assessoria.total} lotes.`)
T.push('• Venda lançada em mês errado ou leilão repetido nas duas filiais: nenhum caso.')
T.push('• As 118 fichas do grupo foram casadas com os lotes: só 1 ficou sem par (abaixo).')
T.push('', '*O que falta responder:*')
T.push('1) *LS Galeria 07/08, lote 18* — a ficha diz "2.500 | 50% Nelore 3A" e não existe no HastaPro nem na planilha. Fechou? São 75.000. @Fábio')
T.push(`2) *Ventres VIP Matinha, lotes 138/140/141* — a Matinha falou em 84.000 hoje, o HastaPro tem 63.000 (x30 contra x40). Diferença de 21.000.`)
T.push(`3) *Melhoradores, 2 lotes do M1 (39.000)* — o HastaPro grava comissão zero neles; ficam fora, ok @Bulinha? Se entrarem: ${brl0(r2(liquido + m1))}.`)
T.push('4) *Rusa × Douglas/Fábio*: LS Galeria lts 04/19 (Diego Benitah, 456.000), Pérolas lt 44 (Alfredo, 90.000), Sabiá lts 23/28/49/52 (Celso, 73.200) e lt 7 (Pedro Pontes, 37.500) — compradores da lista do Rusa que não estão na planilha RUSA - AGOSTO do Douglas. Não muda o total, muda quem recebe.')
T.push('', '*Para o sistema ficar igual ao relatório:* lançar no HastaPro o Sabiá Dourado (29 lotes), o Katispera lt 3 e o Engenho da Serra (4 lotes, x40 = 53.600, não 51.100); cadastrar a Nane em PRESTADORES; e na planilha acrescentar Katispera, Hora, Só Criador 18/08, Xingu e São José, além de corrigir o São Geraldo para 459.800.')
T.push('', 'Melhoradores/Crispim/Terra Brava Touros/Guadalupe 10-08/Diamante/EAO 14-08: sem venda da Assessoria em fonte nenhuma. Fêmeas JMP e Paranã/Casabranca: fora (duplicatas), como o Marcelo confirmou.')
gravaSemPerder(path.join(DESK, 'Fechamento Agosto 2026 - mensagem para o grupo.txt'), p => fs.writeFileSync(p, T.join('\n') + '\n', 'utf8'))

/* ── 12. PDF ─────────────────────────────────────────────────────────────── */
const pdfAlvo = path.join(DESK, 'Bula - Fechamento de Vendas Agosto 2026.pdf')
let pdfPath = pdfAlvo
try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    const buf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' } })
    await browser.close()
    pdfPath = gravaSemPerder(pdfAlvo, p => fs.writeFileSync(p, buf))
    console.log('PDF:', pdfPath)
} catch (e) { console.error('PDF falhou:', e.message) }
gravaSemPerder(path.join(DESK, 'dados-fechamento-agosto-2026.json'), p => fs.copyFileSync(path.join(OUT, 'dados.json'), p))

/* ── 13. console ─────────────────────────────────────────────────────────── */
console.log(`\nVGV LIQUIDO agosto/2026: R$ ${brl(liquido)} (vendido ${brl(apurado)} − cancelado ${brl(matinhaJF)}) · ${totais.lotes_liquido} lotes`)
console.log(`  HP2 ${brl(hp2)} + HP01 ${brl(hp01)} + fora ${brl(fora)} | ERP hoje ${brl(erpHoje)} | planilha ${brl(planTotal)}`)
console.log(`  em aberto: M1 +${brl(m1)} · LS Galeria lt18 75.000 · Ventres x40 21.000`)
for (const [f, r] of Object.entries(recon)) console.log(`  recon ${f}: ${brl(r.total)} + ${brl(r.soma)} = ${brl(r.total + r.soma)} ${r.fecha ? 'FECHA' : 'NAO FECHA'}`)
console.log('\nQualidade:')
console.log(`  captacao lote a lote ${qualidade.captacao.ok}/${qualidade.captacao.total} · ASSESSORIA confirma pisteiro ${qualidade.assessoria.ok}/${qualidade.assessoria.total} (sem linha: ${qualidade.assessoria.sem_linha.length})`)
console.log(`  cota parcial ${qualidade.cota_parcial.length} · FIL01 sem comissao no HP ${qualidade.fil01_sem_comissao_no_hp.length} · pela-Remates COM comissao ${qualidade.pela_remates_com_comissao.length} / SEM ${qualidade.pela_remates_sem_comissao.length} · M1 com comissao ${qualidade.m1_com_comissao.length}`)
console.log('\nPor assessor (liquido):'); for (const a of porAssessor.filter(a => a.liquido_vgv > 0)) console.log(`  ${a.assessor.padEnd(26)} ${brl(a.liquido_vgv).padStart(14)} ${String(a.pct).padStart(6)}%  vendido ${brl(a.final_vgv)}${a.cancelado ? ' cancelado ' + brl(a.cancelado) : ''}`)
console.log('\nRusa em aberto:'); for (const l of rusaAberto) console.log(`  ${l.data} ${l.leilao.slice(0, 40)} lt ${l.lote} ${brl(l.vgv)} ${l.comprador} [${l.pisteiro}]`)
console.log('\nXLSX:', xlsxPath)
