/**
 * FECHAMENTO DE VENDAS — SETEMBRO/2026 (parcial, até 13/09).
 *
 * Pedido do Marcelo no grupo Financeiro (14/09 13:47): "manda de todos os
 * leilões do mês por favor" — depois da conferência do fim de semana.
 *
 * Fontes, na ordem em que valem:
 *   1. Fichas "Levamos lt N – parcela – Foi com … da Bula" nos grupos Lances
 *      Bula / Assessores / Lances Mafra (lidas mensagem a mensagem, com o
 *      repasse curado do Marcelo na DM do João em 05/09 corrigindo lote 25,
 *      lote 64 e lote 82).
 *   2. Mapa Geral da Magnos (foto, DM do Marcelo 05/09 20:34) para o Flor do
 *      Arataú — único pregão com listagem oficial em mãos.
 *   3. Resumos da própria equipe: "22 reprodutores e 1 touro de central"
 *      (Jacamim), "617.100 / 25 lt" (Arataú), 158.000 / 310.500 / 87.000 (fim
 *      de semana), meta do mês R$ 5.479.544,90 (Marcelo, 03/09).
 *   4. Os três pregões de 12–13/09 vêm prontos de
 *      outputs/fechamento-fds-2026-09-11-13/dados.json (conferência anterior).
 *   5. HastaPro (nada de setembro na FIL 2), ERP (1 fechamento certo + 1
 *      fantasma), planilha FINANCEIRO BULA 2026 (previsão/meta/acordo).
 *
 * VGV = parcela × parcelas × cabeças (30 padrão; touro de central 40).
 * Nada é gravado no banco.
 *
 *   node scripts/fechamento-setembro-2026.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import XLSX from 'xlsx'
import Firebird from 'node-firebird'
import { createClient } from '@supabase/supabase-js'

const OUT = 'outputs/fechamento-setembro-2026'
const DESK = path.join(os.homedir(), 'Desktop', 'Fechamento setembro 2026 (ate 13-09)')
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(DESK, { recursive: true })
const ATE = '2026-09-13'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const sum = (arr, f) => r2(arr.reduce((s, x) => s + Number(f(x) || 0), 0))
const brt = iso => { if (!iso) return null; const d = new Date(new Date(iso).getTime() - 3 * 3600e3); const z = n => String(n).padStart(2, '0'); return `${z(d.getUTCDate())}/${z(d.getUTCMonth() + 1)} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}` }

/* ── percentuais pela folha ─────────────────────────────────────────────── */
const { data: folha } = await sb.from('erp_folha_estrutura').select('nome, apelidos, comissao_pct, ativo')
const pctFolha = nome => { const f = (folha ?? []).find(f => [f.nome, ...(f.apelidos ?? [])].some(a => String(a).toLowerCase() === nome.toLowerCase())); return f ? Number(f.comissao_pct) / 100 : null }
const PCT = {
    'Douglas Bispo': pctFolha('Douglas Bispo') ?? 0.02, 'Fábio Omena': pctFolha('Fábio Omena') ?? 0.02, 'Leonardo Serafim': pctFolha('Leonardo Serafim') ?? 0.02,
    'Nane (Regiane)': pctFolha('Nane') ?? 0.02, 'Peralta': pctFolha('Peralta') ?? 0.02, 'Laila': pctFolha('Laila') ?? 0.01,
    'Marcelo Carneiro': pctFolha('Marcelo Carneiro') ?? 0.02, 'Gustavo Rusa': pctFolha('Gustavo Rusa') ?? 0.05,
}

/* ── mensagens-fonte (para carimbar hora/autor nas fichas) ─────────────── */
const GRUPOS = { '120363162972078973@g.us': 'Lances Bula Assessoria', '120363425959659407@g.us': 'Bula Assessoria l Assessores', '120363408594638064@g.us': 'Financeiro Bula Assessoria', '120363428067530926@g.us': 'Lances Mafra' }
const msgs = []
for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('whatsapp_messages').select('created_at, phone, body, reason').in('phone', Object.keys(GRUPOS))
        .gte('created_at', '2026-09-01T03:00:00Z').lte('created_at', '2026-09-14T15:00:00Z').order('created_at').range(from, from + 999)
    msgs.push(...(data ?? [])); if (!data || data.length < 1000) break
}
const { data: autores } = await sb.from('operational_items').select('external_message_id, source_sender_name').in('source_chat_jid', Object.keys(GRUPOS)).gte('occurred_at', '2026-09-01T03:00:00Z')
const autorDe = new Map((autores ?? []).map(a => [a.external_message_id, a.source_sender_name]))
const fonte = (re, grupo) => { const m = msgs.find(m => re.test(m.body || '') && (!grupo || GRUPOS[m.phone] === grupo)); return m ? { quando: brt(m.created_at), grupo: GRUPOS[m.phone], autor: autorDe.get(m.reason) || null, texto: m.body } : null }
const { data: vendasDb } = await sb.from('bula_leilao_vendas').select('id, leilao_data, lote, valor, status, cronograma_id, fonte').gte('leilao_data', '2026-09-01').lte('leilao_data', '2026-09-14')
const vendaDb = (data, lote) => (vendasDb ?? []).find(v => v.leilao_data === data && String(v.lote) === String(lote))
const { data: fechDb } = await sb.from('bula_leilao_fechamento').select('id, nome, data, vgv_total, lotes_vendidos, origem').gte('data', '2026-09-01').lte('data', '2026-09-30').order('data')
const { data: agenda } = await sb.from('bula_leiloes').select('data, nome, horario, leiloeira, status').gte('data', '2026-09-01').lte('data', '2026-09-30').order('data')

/* ── HastaPro ───────────────────────────────────────────────────────────── */
const txt = v => (Buffer.isBuffer(v) ? v.toString('latin1') : v)
const norm = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, txt(v)]))
const db = await new Promise((res, rej) => Firebird.attach({ host: process.env.HASTAPRO_HOST, port: +process.env.HASTAPRO_PORT, database: process.env.HASTAPRO_DATABASE, user: process.env.HASTAPRO_USER, password: process.env.HASTAPRO_PASSWORD, lowercase_keys: true }, (e, d) => e ? rej(e) : res(d)))
const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => e ? rej(e) : res(r.map(norm))))
const hp = await q(`select l.FIL_CODIGO fil, l.LEI_NOME nome, l.LEI_DATA data, count(lo.LOT_LOTE) n, sum(lo.LOT_TOTAL) vgv from LEILAO l left join LOTES lo on lo.LEI_CODIGO=l.LEI_CODIGO and lo.FIL_CODIGO=l.FIL_CODIGO where l.LEI_DATA >= '2026-08-25' group by 1,2,3 order by l.LEI_DATA`)
const sc = await q(`select lo.LOT_LOTE lote, lo.LOT_TOTAL total, lo.LOT_PISTEIRO p from LOTES lo join LEILAO l on l.LEI_CODIGO=lo.LEI_CODIGO and l.FIL_CODIGO=lo.FIL_CODIGO where l.LEI_DATA >= '2026-09-10' and l.LEI_DATA < '2026-09-11' and lo.LOT_TOTAL > 0`)
const pc = [...new Set(sc.map(x => String(x.p)).filter(x => x && x !== 'null'))]
const nomeP = new Map(pc.length ? (await q(`select CLI_CODIGO c, CLI_NOME n from CLIENTES where CLI_CODIGO in (${pc.map(c => `'${c}'`).join(',')})`)).map(x => [String(x.c), String(x.n).trim()]) : [])
db.detach()
const hastapro = {
    ultimoFil2: hp.filter(x => String(x.fil).trim() === '2').map(x => new Date(x.data).toISOString().slice(0, 10)).sort().at(-1),
    setembro: hp.filter(x => new Date(x.data).toISOString().slice(0, 10) >= '2026-09-01').map(x => ({ fil: String(x.fil).trim(), nome: String(x.nome).trim(), data: new Date(x.data).toISOString().slice(0, 10), lotes: Number(x.n), vgv: r2(x.vgv) })),
    soCriador: { vgv: sum(sc, x => x.total), lotes: sc.length, laila: { lotes: sc.filter(x => /laila/i.test(nomeP.get(String(x.p)) || '')).map(x => String(x.lote).trim()), vgv: sum(sc.filter(x => /laila/i.test(nomeP.get(String(x.p)) || '')), x => x.total) } },
}

/* ── planilha do chefe ──────────────────────────────────────────────────── */
const planFile = fs.readdirSync('F:/').filter(f => /^FINANCEIRO BULA 2026.*\.xlsx$/i.test(f)).map(f => ({ f, m: fs.statSync('F:/' + f).mtimeMs })).sort((a, b) => b.m - a.m)[0]?.f
const wbP = XLSX.readFile('F:/' + planFile)
const num = s => Number(String(s ?? '').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0
const planilha = XLSX.utils.sheet_to_json(wbP.Sheets['Leilões'], { header: 1, raw: false }).filter(r => /SETEMBRO/i.test(String(r[1] || '')))
    .map(r => ({ dia: Number(r[0]), leilao: String(r[2]).trim(), leiloeira: String(r[3] || '').trim(), previsaoFat: num(r[5]), metaVenda: num(r[6]), cobertura: String(r[7] || '').trim(), metaComissao: num(r[8]), pctVenda: String(r[14] || '').trim(), pctFat: String(r[15] || '').trim() }))
const plan = re => planilha.find(l => re.test(l.leilao))
const acordos = Object.fromEntries(XLSX.utils.sheet_to_json(wbP.Sheets['Acordos com Marcas'], { header: 1, raw: false }).filter(r => String(r[1] || '').trim() && String(r[2] || '').trim()).map(r => [String(r[1]).trim(), String(r[2]).trim()]))
const META_MES = 5479544.90

/* ── os lotes ───────────────────────────────────────────────────────────── */
const lote = o => {
    const parcelas = o.parcelas ?? 30, qtd = o.qtd ?? 1
    const vgv = o.vgvFixo != null ? r2(o.vgvFixo) : r2(o.parcela * parcelas * qtd)
    const dono = o.comissaoDe || o.assessor
    const pct = o.pct ?? (PCT[dono] ?? 0.02)
    const f = o.fonteRe ? fonte(o.fonteRe, o.fonteGrupo) : null
    const db = o.data && o.lote ? vendaDb(o.data, o.lote) : null
    return { ...o, parcelas, qtd, vgv, comissaoDe: dono, pct, comissao: r2(vgv * pct), fichaQuando: f?.quando ?? o.fichaQuando ?? null, fichaGrupo: f?.grupo ?? o.fichaGrupo ?? null, fichaAutor: f?.autor ?? o.fichaAutor ?? null,
        noSistema: db ? { status: db.status, vinculado: !!db.cronograma_id } : null }
}
const RL = { comprador: 'Reginaldo Leandro', fazenda: 'Fazenda São José', cidade: 'São Félix do Xingu', uf: 'PA' }
const JAC = {
    key: 'jacamim', data: '2026-09-05', nome: '10º Leilão Especial Touros Fazenda Jacamim', leiloeira: 'Programa Leilões', praca: 'Nova Mutum-MT · recinto + virtual', tipo: 'leilão',
    condicao: 'lance × 30 (2+2+2+2+2+20); touro de central 40 parcelas; à vista −15%', acordo: plan(/JACAMIM/i)?.pctVenda ? `${plan(/JACAMIM/i).pctVenda} da venda (planilha)` : '3% da venda', planilha: plan(/JACAMIM/i),
    resumoEquipe: { texto: '"Foram 22 reprodutores e 1 touro de central comercializados" (post oficial 20:27) · tally no grupo às 20:05: "já foram 22 touros + 1 central"', lotes: 23 },
    lotes: [
        lote({ data: '2026-09-05', lote: '17', parcela: 1100, sexo: 'M', assessor: 'Nane (Regiane)', comprador: 'Rubens Peixoto', fazenda: 'Fazenda Morro Alto', cidade: 'Jauru', uf: 'MT', fonteRe: /Lote 17- \$ 1\.100/ }),
        lote({ data: '2026-09-05', lote: '25', parcela: 1100, sexo: 'M', assessor: 'Douglas Bispo', ...RL, fonteRe: /Levamos lt 26 - 1100/, obs: 'A ficha diz "lt 26", mas o recinto anotou o 26 para João Giuzzo, a Nane perguntou "vc levou o lote 25?" e o repasse do Marcelo ao João (17:31) já sai com lt 25. Conferir na listagem da Programa.' }),
        lote({ data: '2026-09-05', lote: '2', parcela: 1150, sexo: 'M', assessor: 'Douglas Bispo', comprador: 'Luis Diehl', fazenda: 'Agropecuária N. S. Aparecida', cidade: 'Nova Mutum', uf: 'MT', fonteRe: /Levamos lt 2 - 1150/ }),
        lote({ data: '2026-09-05', lote: '1', parcela: 2150, sexo: 'M', assessor: 'Peralta', comprador: 'Diego e Arthur Chiovetti', fazenda: 'Fazenda Santa Rita', cidade: 'Rio Negro', uf: null, fonteRe: /Lote 1 - Daniele Coutinho vendeu/, obs: 'Registro do Peralta: "Lote 1 - Daniele Coutinho vendeu - 2150". Entrou na contagem da equipe (22 touros) e no repasse do Marcelo; a comissão depende de quem é a Daniele.' }),
        lote({ data: '2026-09-05', lote: '15', parcela: 1100, sexo: 'M', assessor: 'Peralta', comprador: 'Moacir e Leo Duim — Sementes Pasto Forma', fazenda: null, cidade: null, uf: null, fonteRe: /Comprador lote 15/ }),
        lote({ data: '2026-09-05', lote: '76', parcela: 1000, sexo: 'M', assessor: 'Douglas Bispo', ...RL, fonteRe: /Levamos lt 76 - 1000/ }),
        lote({ data: '2026-09-05', lote: '77', parcela: 1000, sexo: 'M', assessor: 'Peralta', comprador: 'Nicole Perondi e Fernando César Pinheiro — 7P Agro', fazenda: null, cidade: null, uf: null, fonteRe: /Comprador do 77/ }),
        lote({ data: '2026-09-05', lote: '75', parcela: 950, sexo: 'M', assessor: 'Douglas Bispo', ...RL, fonteRe: /Levamos lt 75 - 950/ }),
        lote({ data: '2026-09-05', lote: 'central', animal: 'touro de central Estocolmo', parcela: 4800, parcelas: 40, sexo: 'M', assessor: 'Peralta', comprador: 'Eduardo da Costa', fazenda: null, cidade: null, uf: null, fonteRe: /Comprador lote central Estocolmo/, obs: '"4800 x 40" — touro de central, 40 parcelas pela condição do leilão. Maior arremate da Bula no mês.' }),
        lote({ data: '2026-09-05', lote: '96', parcela: 900, sexo: 'M', assessor: 'Nane (Regiane)', comprador: 'Fazenda São Jerônimo', fazenda: 'Fazenda São Jerônimo', cidade: 'Nova Canaã do Norte', uf: 'MT', fonteRe: /Lote 96- \$ 900/ }),
        lote({ data: '2026-09-05', lote: '81', parcela: 850, sexo: 'M', assessor: 'Laila', comprador: 'Luis Antonio Dias Pinheiro', fazenda: 'Fazenda Santa Lúcia', cidade: 'Planalto', uf: 'BA', fonteRe: /Lote 81 - 850/, obs: 'Duas fichas no mesmo minuto: Leonardo escreveu 900, Fábio 850; o pregão foi "Lote 81 - 850" e o repasse do Marcelo usa 850.' }),
        lote({ data: '2026-09-05', lote: '82', parcela: 1000, sexo: 'M', assessor: 'Fábio Omena', comprador: 'Paulo César Oberlaender', fazenda: 'Fazenda Santa Teresinha', cidade: 'Santa Rita do Pardo', uf: 'MS', fonteRe: /Levamos 82 - 1000/, obs: 'No grupo saiu só "Levamos 82 - 1000 - 1M"; comprador e fazenda vêm do repasse do Marcelo (17:34).' }),
        lote({ data: '2026-09-05', lote: '55', parcela: 1000, sexo: 'M', assessor: 'Nane (Regiane)', comprador: 'Euclides Comim', fazenda: 'Fazenda Chão de Estrelas', cidade: 'Nova Bandeirantes', uf: 'MT', fonteRe: /Lote 55- \$ 1\.000/ }),
        lote({ data: '2026-09-05', lote: '53', parcela: 800, sexo: 'M', assessor: 'Nane (Regiane)', comprador: 'Rodrigo Capuci (assessoria Valentina Capuci)', fazenda: 'Fazenda Santo Antônio', cidade: 'Rio Verde', uf: 'MS', fonteRe: /Lote 53- \$ 800/ }),
        lote({ data: '2026-09-05', lote: '64', parcela: 800, sexo: 'M', assessor: 'Peralta', comprador: 'Wilian Moreira', fazenda: 'Fazenda Boa Esperança', cidade: 'Rio Verde de Mato Grosso', uf: 'MS', fonteRe: /Comprador lote 64/, obs: 'Valor (800) só no repasse do Marcelo (17:52); a ficha do grupo veio sem valor.' }),
        lote({ data: '2026-09-05', lote: '58', parcela: 870, sexo: 'M', assessor: 'Nane (Regiane)', comprador: 'Fazenda São Jerônimo', fazenda: 'Fazenda São Jerônimo', cidade: 'Nova Canaã do Norte', uf: 'MT', fonteRe: /Lotes 58\/59- \$ 870/, obs: 'Ficha única "Lotes 58/59 - $ 870,00" = 870 por lote.' }),
        lote({ data: '2026-09-05', lote: '59', parcela: 870, sexo: 'M', assessor: 'Nane (Regiane)', comprador: 'Fazenda São Jerônimo', fazenda: 'Fazenda São Jerônimo', cidade: 'Nova Canaã do Norte', uf: 'MT', fonteRe: /Lotes 58\/59- \$ 870/ }),
        lote({ data: '2026-09-05', lote: '102', parcela: 800, sexo: 'M', assessor: 'Laila', comprador: 'Luis Antonio Dias Pinheiro', fazenda: 'Fazenda Santa Lúcia', cidade: 'Planalto', uf: 'BA', fonteRe: /Comprador do lote 102/, obs: 'Valor no pregão: "102 - 800,00" (17:57).' }),
        lote({ data: '2026-09-05', lote: '61', parcela: 800, sexo: 'M', assessor: 'Nane (Regiane)', comprador: 'Euclides Comim', fazenda: 'Fazenda Chão de Estrelas', cidade: 'Nova Bandeirantes', uf: 'MT', fonteRe: /Lote 61-800/ }),
        lote({ data: '2026-09-05', lote: '62', parcela: 750, sexo: 'M', assessor: 'Nane (Regiane)', comprador: 'Fazenda São Jerônimo', fazenda: 'Fazenda São Jerônimo', cidade: 'Nova Canaã do Norte', uf: 'MT', fonteRe: /Lotes 62- \$ 750/ }),
        lote({ data: '2026-09-05', lote: '108', parcela: 750, sexo: 'M', assessor: 'Nane (Regiane)', comprador: 'Euclides Comim', fazenda: 'Fazenda Chão de Estrelas', cidade: 'Nova Bandeirantes', uf: 'MT', fonteRe: /Lote 108- \$ 750/ }),
        lote({ data: '2026-09-05', lote: '12', parcela: 850, sexo: 'M', assessor: 'Douglas Bispo', ...RL, fonteRe: /Levamos lt 12 - 850/ }),
        lote({ data: '2026-09-05', lote: '23', parcela: 850, sexo: 'M', assessor: 'Fábio Omena', comprador: 'Thiago Silva', fazenda: 'Fazenda Fortaleza Castelo', cidade: null, uf: 'MG', fonteRe: /Levamos lt 23 - 850/ }),
    ],
    naoVendas: ['Último lote da noite (20:03–20:07): Douglas foi a 1.500/1.520 pelo Reginaldo Leandro e o leiloeiro fechou com "Agradece lançando comigo Coronel Reginaldo Leandro" — perdido. O card de fechamento feito às 22:03 de 05/09 (883.200, "23 touros + 1 central") ainda contava esse lote; o post oficial das 20:27 diz 22 + 1.', 'lt 16: Leonardo a 1.050, "Liberou". lt 14: 1.450, "Liberou". lt 36: 1.400, "Liberou". lt 86: "Levamos?" a 1.000, "Não". Último lote da noite: Douglas a 1.500/1.520 pelo Reginaldo — "Agradece lançando comigo", perdido.'],
}
const ARA = {
    key: 'aratau', data: '2026-09-05', nome: '10º Leilão Nelore Flor do Arataú & Convidados', leiloeira: 'Magnos Leilões', praca: 'Novo Repartimento-PA · presencial', tipo: 'leilão',
    condicao: 'valores do Mapa Geral da Magnos (valor total por lote, já com as parcelas)', acordo: plan(/ARATAU/i)?.pctFat ? `${plan(/ARATAU/i).pctFat} do faturamento (planilha)` : '1% do faturamento', planilha: plan(/ARATAU/i),
    faturamento: 927300, faturamentoLotes: 38, faturamentoCabecas: 41, defesas: { lotes: 6, valor: 44100 },
    resumoEquipe: { texto: '"Leilão Flor do Aratau — Faturamento geral 927.300 / 38 lt vendidos / 6 lt defesa — Vendas pela Bula 617.100 / 25 lt vendidos" (Lances Bula, 21:07) · lista dos 25 lotes + 4 fotos do Mapa Geral + áudio "olha os lotes aí que o Douglas vendeu" (DM do Marcelo, 20:34–20:36)', valor: 617100 },
    lotes: [
        ['8', 'touro', 1, 40500, 'Dona Filomena (Faz…)'], ['9', 'touro', 1, 43500, 'Gessival Buss'], ['10', 'touro', 1, 21000, 'Paulo Henrique Baza…'],
        ['15', 'matriz', 2, 36000, 'Aldemar Broca'], ['16', 'matriz', 2, 24000, 'Aldemar Broca'], ['17', 'matriz', 2, 21000, 'Zé Fabio — Nelore Pe…'],
        ['18', 'matriz', 1, 15000, 'Roberto Ribeiro (Faz…)'], ['19', 'matriz', 1, 18600, 'Gessival Buss'], ['20', 'matriz +60M', 1, 28500, 'Murilo Bispo — Grupo A…'],
        ['23', 'touro', 1, 28500, 'Dalvan Barbosa (Faz…)'], ['25', 'touro', 1, 21000, 'Vitor Mendes'], ['26', 'touro', 1, 25500, 'Adriano Marques do N…'], ['27', 'touro', 1, 24000, 'Donivaldo (Faz. Santo…)'],
        ['30', 'touro', 1, 21900, 'Gessival Buss'], ['31', 'touro', 1, 33000, 'Dalvan Barbosa (Faz…)'], ['36', 'touro', 1, 22500, 'Donivaldo (Faz. Santo…)'], ['37', 'touro', 1, 22500, 'Vitor Mendes'],
        ['39', 'matriz', 1, 16500, 'Rodrigo e Valdeci Be…'], ['40', 'matriz', 1, 18000, 'Paulo Henrique Baza…'], ['41', 'matriz', 1, 14100, 'Gessival Buss'], ['42', 'matriz', 1, 15000, 'Paulo Henrique Baza…'],
        ['43', 'matriz', 1, 13500, 'Roberto Ribeiro (Faz…)'], ['44', 'matriz 36M', 1, 18000, 'Rodrigo e Valdeci Be…'], ['45', 'matriz', 1, 15000, 'Felipe Milanezi'],
        ['46', 'matriz +60M', 1, 60000, 'Condomínio Douglas B… (vendedor: Alfredo José Cardoso)'],
    ].map(([lt, cat, qtd, v, comp]) => lote({ data: '2026-09-05', lote: lt, animal: cat, qtd, parcela: r2(v / qtd / 30), vgvFixo: v, sexo: /touro/.test(cat) ? 'M' : 'F', assessor: 'Douglas Bispo', comprador: comp, fazenda: null, cidade: null, uf: 'PA', fichaQuando: '05/09 20:34', fichaGrupo: 'DM Marcelo → João (Mapa Geral)', fichaAutor: 'Marcelo C.',
        obs: lt === '46' ? 'Comprador é um condomínio com o próprio Douglas; vendedor convidado Alfredo José Cardoso (Galopeira, lista de direcionamento do Rusa). Decidir como a comissão desse lote entra.' : (lt === '20' ? 'Lotes 1–20 têm vendedor Eron José de Carvalho (Flor do Arataú); do 21 em diante o vendedor convidado é Welton Borges de Miranda (Nelore Itajaí).' : undefined) })),
    naoVendas: [],
}
const MAR = {
    key: 'marcondes', data: '2026-09-05', nome: 'Leilão Caminhos — Nelore Marcondes', leiloeira: 'a confirmar', praca: 'virtual · 13h30', tipo: 'leilão',
    condicao: 'assumido lance × 30', acordo: 'sem acordo cadastrado e fora da agenda ("Não tava agenda", Marcelo 21:33)', planilha: null,
    resumoEquipe: { texto: 'ficha encaminhada pelo Marcelo ao João (21:32) junto com a arte do leilão', valor: 18600 },
    lotes: [lote({ data: '2026-09-05', lote: '5', parcela: 620, sexo: 'F', assessor: 'Douglas Bispo', comprador: 'Gabriel Delfino', fazenda: 'Fazenda Espinho Branco', cidade: 'Patos', uf: 'PB', fichaQuando: '05/09 21:32', fichaGrupo: 'DM Marcelo → João', fichaAutor: 'Marcelo C.', obs: 'Não estava na agenda nem na planilha; ficou fora do card de fechamento de 05/09 (1.500.300).' })],
    naoVendas: [],
}
const MAF = {
    key: 'mafra', data: '2026-09-06', nome: 'Leilão Virtual Touros Premium Nelore Mafra — Edição Uberaba', leiloeira: 'Programa Leilões', praca: 'virtual · 09:00', tipo: 'leilão',
    condicao: 'lance × 30 (mega lotes 40 parcelas)', acordo: acordos['MAFRA AGROPECUÁRIA'] ? `tabela Mafra: ${acordos['MAFRA AGROPECUÁRIA']} …` : 'tabela Mafra por cobertura', planilha: plan(/MAFRA/i),
    resumoEquipe: { texto: 'única ficha do dia; nenhum resumo da equipe', valor: 21600 },
    lotes: [lote({ data: '2026-09-06', lote: '38', animal: 'touro 23m 749kg (OE 52º)', parcela: 720, sexo: 'M', assessor: 'Fábio Omena', comprador: 'Sra. Edna Bellato', fazenda: 'Fazenda Novo Mundo', cidade: null, uf: 'MT', fonteRe: /Levamos lt 38 - 720/, fonteGrupo: 'Lances Bula Assessoria', obs: 'É o único fechamento certo que o ERP tem em setembro. A mesma ficha repostada em 14/09 no Lances Mafra criou um duplicado (ver correções).' })],
    naoVendas: ['No grupo Lances Mafra (06/09): "Bateu 450 / cada mandou 60" e "450 / 460 / N consigo retorno" — duas disputas sem arremate; o mega lote de 40× foi só divulgação.'],
}
const VIS = {
    key: 'visual', data: '2026-09-09', nome: 'Shopping de Genética Nelore Visual (venda direta, 02–12/09)', leiloeira: '— (preço fixo, sem comissão de leilão)', praca: 'Esmeraldas-MG', tipo: 'shopping',
    condicao: 'preço fixo por animal; 20× no boleto ou 12×; frete grátis MG', acordo: plan(/VISUAL/i)?.pctVenda ? `${plan(/VISUAL/i).pctVenda} da venda (planilha, linha de 17/09)` : '5% da venda', planilha: plan(/VISUAL/i),
    resumoEquipe: { texto: 'anúncio "VENDA SHOPPING NELORE VISUAL — Foi com Marcelo da Bula Assessoria" (Lances Bula, 09/09 09:37); nenhuma outra venda até o fim do shopping em 12/09', valor: 17800 },
    lotes: [lote({ data: '2026-09-09', lote: 'VIS4819', animal: 'touro (venda direta)', parcela: 1480, parcelas: 12, vgvFixo: 17800, sexo: 'M', assessor: 'Marcelo Carneiro', comprador: 'Nivaldo Alves Ferreira Neto', fazenda: null, cidade: 'Santa Helena de Minas', uf: 'MG', fonteRe: /VENDA SHOPPING NELORE VISUAL/, fonteGrupo: 'Lances Bula Assessoria', obs: 'R$ 17.800 à vista (12× de 1.480). Não está em bula_leilao_vendas (o parser não lê esse formato) nem em fechamento. Marcelo Carneiro está inativo na folha — quem recebe é decisão.' })],
    naoVendas: [],
}
/* fim de semana: vem pronto da conferência anterior */
const FDS = JSON.parse(fs.readFileSync('outputs/fechamento-fds-2026-09-11-13/dados.json', 'utf8'))
const fromFds = (L, extra) => ({ key: L.key, data: L.data, nome: L.nome, leiloeira: L.leiloeira, praca: L.praca, tipo: 'leilão', condicao: L.condicao, acordo: L.acordo, planilha: L.planilha, resumoEquipe: { texto: `${L.resumoGrupo.texto} (grupo Financeiro, ${L.resumoGrupo.quando})`, valor: L.resumoGrupo.valor },
    lotes: L.lotes.map(l => ({ ...l, comissaoDe: l.comissaoDe, fichaGrupo: l.fichaGrupo, noSistema: l.noSistema ? { status: l.noSistema.status, vinculado: !!l.noSistema.cronograma_id } : null })), naoVendas: L.naoVendas, ...extra })
const [AZ, EAO, KAT] = FDS.leiloes
const EVENTOS = [
    { key: 'crispim', data: '2026-09-03', nome: '2º Leilão Nelore Crispim — Herança Genética', leiloeira: 'E-Rural', praca: 'virtual · 19:00', tipo: 'leilão', condicao: '—', acordo: acordos['E-RURAL'] || '5% da venda', planilha: plan(/CRISPIM/i), resumoEquipe: { texto: 'nenhuma ficha em nenhum grupo; no Marketing às 20:06: "mexer com os leads para esse leilão de agora… leilão barato"', valor: 0 }, lotes: [], naoVendas: [] },
    JAC, ARA, MAR, MAF, VIS,
    fromFds(AZ), fromFds(EAO), fromFds(KAT, { atribuicaoNota: KAT.atribuicaoNota }),
]
for (const E of EVENTOS) {
    E.totais = { lotes: E.lotes.length, cabecas: sum(E.lotes, l => l.qtd), vgv: sum(E.lotes, l => l.vgv), comissao: sum(E.lotes, l => l.comissao) }
    E.confere = E.resumoEquipe.valor != null ? E.totais.vgv === E.resumoEquipe.valor : (E.resumoEquipe.lotes != null ? E.totais.lotes === E.resumoEquipe.lotes : null)
    E.porAssessor = Object.values(E.lotes.reduce((acc, l) => { const a = acc[l.comissaoDe] ||= { nome: l.comissaoDe, lotes: 0, vgv: 0, comissao: 0 }; a.lotes++; a.vgv = r2(a.vgv + l.vgv); a.comissao = r2(a.comissao + l.comissao); return acc }, {})).sort((a, b) => b.vgv - a.vgv)
    E.metaVenda = E.planilha?.metaVenda || null
    E.pctMeta = E.metaVenda ? r2(E.totais.vgv / E.metaVenda) : null
}
JAC.receita = { descr: '3% da venda', valor: r2(JAC.totais.vgv * 0.03) }
ARA.receita = { descr: '1% do faturamento (R$ 927.300)', valor: r2(927300 * 0.01) }
MAR.receita = { descr: 'sem acordo', valor: null }
MAF.receita = { descr: 'tabela Mafra — cobertura abaixo de 3% → 4% da venda', valor: r2(21600 * 0.04) }
VIS.receita = { descr: '5% da venda', valor: r2(17800 * 0.05) }
EVENTOS.find(e => e.key === 'az').receita = { descr: '3% da venda (certo) + 0,5% do faturamento (a apurar)', valor: r2(158000 * 0.03), variavel: 'sobre a previsão da planilha: + R$ 7.920' }
EVENTOS.find(e => e.key === 'eao').receita = { descr: '0,33% do faturamento total (a apurar, 3 dias)', valor: null, variavel: 'sobre a previsão só dos touros: R$ 13.612,50' }
EVENTOS.find(e => e.key === 'katayama').receita = { descr: 'sem acordo; precedente 31/05 = 5% da venda', valor: null, variavel: 'R$ 4.350 se repetir o precedente' }
EVENTOS.find(e => e.key === 'crispim').receita = { descr: '5% da venda', valor: 0 }

/* ── o que fica fora ────────────────────────────────────────────────────── */
const ibcMsgs = msgs.filter(m => /AGROFEIRA IBC/i.test(m.body || '') && /lote/i.test(m.body || '')).map(m => ({ quando: brt(m.created_at), autor: autorDe.get(m.reason) || 'Fábio Omena', texto: m.body.replace(/\s*\n\s*/g, ' · ') }))
const fora = [
    { item: 'Agrofeira IBC — pré-venda / shopping (02 a 08/09)', assessor: 'Fábio Omena', situacao: 'SEM VALOR — VGV a apurar', porque: `O Fábio anunciou ${ibcMsgs.length} registros de lote/comprador no grupo de lances ("Lote 16 / Ronipetrison Ferreira / Bahia / AGROFEIRA IBC", "62 - GILMAR - FO - VENDIDO"…), compradores da BA/MA/SE/AL, sem parcela nem valor. O marketing diz "quem paga a sua comissão é Nelore IBC"; a planilha só tem o pregão de 18–19/09 (BC Agrofeira Fazenda Recanto, Agreste, 1% do faturamento). Pedir ao Fábio a lista com valores.`, detalhe: ibcMsgs },
    { item: 'lt 96 — 1 fêmea — 700 (12/09, Douglas, direcionamento Rusa → Welton Miranda/Itajaí)', assessor: 'Douglas Bispo → 5% Rusa', situacao: 'LEILÃO NÃO IDENTIFICADO', porque: 'Não é o AZ (só touros) e não está em nenhum resumo. Curiosidade que ajuda: Welton Borges de Miranda foi VENDEDOR convidado no Flor do Arataú (lotes 21 em diante). VGV 21.000 se ×30.' },
    { item: 'lt 105 do EAO (13/09) — "Bateu 1300" do gerente da EAO', assessor: '—', situacao: 'FALSO POSITIVO — apagar', porque: 'A Nane parou em 1.550 e liberou; a IA gravou venda de 39.000.' },
    { item: 'lt 38 datado 14/09 — ficha do Mafra repostada no Lances Mafra', assessor: '—', situacao: 'DUPLICATA — apagar (venda + fechamento fantasma "MATRIZES E BEZERRAS 14/09")', porque: 'Já está em 06/09 com fechamento próprio.' },
    { item: `Só Criador Machos e Fêmeas de Alto Padrão (10/09, Bula Remates, gado comercial) — R$ ${hastapro.soCriador.vgv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no HastaPro FIL 01`, assessor: 'Laila (pela Remates)', situacao: 'NÃO É COBERTURA DA ASSESSORIA', porque: `Laila na pista em ${hastapro.soCriador.laila.lotes.length} lotes (R$ ${hastapro.soCriador.laila.vgv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) pela Remates — decisão do João de 26/08 (quem está na pista pela Remates não é cobertura).` },
]

/* ── consolidação ───────────────────────────────────────────────────────── */
const todos = EVENTOS.flatMap(E => E.lotes.map(l => ({ ...l, evento: E.nome, key: E.key, data: E.data })))
const porAssessor = Object.values(todos.reduce((acc, l) => {
    const a = acc[l.comissaoDe] ||= { nome: l.comissaoDe, pct: l.pct, lotes: 0, cabecas: 0, vgv: 0, comissao: 0, eventos: {} }
    a.lotes++; a.cabecas += l.qtd; a.vgv = r2(a.vgv + l.vgv); a.comissao = r2(a.comissao + l.comissao)
    const e = a.eventos[l.key] ||= { lotes: 0, vgv: 0 }; e.lotes++; e.vgv = r2(e.vgv + l.vgv); return acc
}, {})).sort((a, b) => b.vgv - a.vgv)
const totais = { eventosComVenda: EVENTOS.filter(E => E.lotes.length).length, lotes: todos.length, cabecas: sum(todos, l => l.qtd), vgv: sum(todos, l => l.vgv), comissao: sum(todos, l => l.comissao) }
const meta = { valor: META_MES, fonte: 'Marcelo, grupo Assessores, 03/09 19:11 — "22 leilões, faturamento previsto 39 milhões, cobertura média 16,68%"', realizado: totais.vgv, pct: r2(totais.vgv / META_MES), falta: r2(META_MES - totais.vgv), leiloes: 22, faturamentoPrevisto: 39000000, coberturaAlvo: 0.1668 }
const GENERICAS = new Set(['LEILAO', 'LEILÃO', 'NELORE', 'VIRTUAL', 'ETAPA', 'TOUROS', 'FEMEAS', 'FÊMEAS', 'MATRIZES', 'ESPECIAL', 'GENETICA', 'GENÉTICA', 'FAZENDA', 'PREMIUM', 'CONVIDADOS', 'BEZERRAS', 'SHOPPING', 'EDICAO', 'EDIÇÃO'])
const chaves = s => String(s || '').toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').split(/[^A-Z0-9]+/).filter(w => w.length > 3 && !GENERICAS.has(w))
const ALIAS = { '2º DIA - BC AGROFEIRA': /2º DIA - BC AGROFEIRA/, '1º DIA - BC AGROFEIRA': /1º DIA - BC AGROFEIRA/, 'MATRIZES E BEZERRAS': /EAO - FEMEAS/, 'ASPIRACOES EAO E CONVIDADOS': /EAO - ASPIRACOES/, 'ETAPA TOUROS': /GENETICA ADITIVA - TOUROS/, 'ETAPA FEMEAS': /GENETICA ADITIVA - FEMEAS/ }
const semAcento = s => String(s || '').toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
const restante = (agenda ?? []).filter(a => a.data > ATE).map(a => {
    const nomeA = semAcento(a.nome)
    const alias = Object.entries(ALIAS).find(([k]) => nomeA.includes(k))?.[1]
    const p = planilha.find(l => (alias ? alias.test(semAcento(l.leilao)) : (Math.abs(l.dia - Number(a.data.slice(8, 10))) <= 1 && chaves(a.nome).some(w => chaves(l.leilao).includes(w)))))
    return { data: a.data, nome: a.nome, leiloeira: a.leiloeira, previsaoFat: p?.previsaoFat || null, metaVenda: p?.metaVenda || null, pct: p ? (p.pctVenda || p.pctFat) : null, planilha: p?.leilao || null }
})
const metaRestante = sum(restante, r => r.metaVenda)

const correcoes = [
    { n: 1, o: 'Apagar o fechamento fantasma "MATRIZES E BEZERRAS 14/09" e a venda duplicada do lt 38 (14/09); apagar o lt 105 (13/09)', por: 'Duplicata do Mafra 06/09 e falso positivo da IA — os dois inflariam setembro em R$ 60.600.' },
    { n: 2, o: 'Vincular as 23 fichas de 05/09 ao "TOUROS JACAMIN", as 4 de 12/09 ao AZ e as 12 de 13/09 ao EAO; depois "Importar pro fechamento"', por: 'Estão todas como "revisar" sem leilão (dois pregões no mesmo dia). O rebuild faz ×30: ajustar à mão o central Estocolmo (×40 = 192.000) e o lt 2023 do AZ (×40 = 92.000). Corrigir lt 26 → 25 e lt 81 = 850 antes de importar.' },
    { n: 3, o: 'Criar à mão os fechamentos sem ficha capturável: Flor do Arataú (25 lotes, 617.100, Douglas — lote a lote pelo Mapa Geral), Nelore Marcondes (1 lote, 18.600), Katayama (4 lotes, 87.000) e o Shopping Visual (17.800)', por: 'Nenhum passou pelo grupo de lances no formato que o parser lê; o Arataú tem listagem oficial (foto) — é o mais seguro de todos.' },
    { n: 4, o: 'Lançar setembro no HastaPro (FIL 2) e rodar o importador canônico', por: `Último pregão da FIL 2 no HastaPro: ${hastapro.ultimoFil2 ? hastapro.ultimoFil2.slice(8, 10) + '/' + hastapro.ultimoFil2.slice(5, 7) : '—'}. Até lá tudo isto é fechamento provisório (origem lances-auto), e a comissão só deve virar CP depois.` },
    { n: 5, o: 'Cobrar as listagens oficiais: Programa (Jacamim, Mafra, EAO), Ricardo Nicolau (AZ), Katayama e Marcondes', por: 'Só a listagem confirma parcelas, cotas (lt 10 e central do Jacamim, lt 2023 do AZ), cancelamentos e o faturamento total de que saem as notas (AZ 0,5%, EAO 0,33%, Arataú 1%).' },
    { n: 6, o: 'Pedir ao Fábio a lista do IBC com valores e ao Douglas o pregão do lt 96 e a confirmação do Katayama', por: 'São os únicos VGVs do mês que ainda não têm número ou dono.' },
]
const pendencias = [
    { p: 'Jacamim lote 1 (2.150 × 30 = 64.500): "Daniele Coutinho vendeu" — quem recebe a comissão?', impacto: 'R$ 1.290 (2%) e o próprio VGV do Peralta', quem: 'Peralta / Marcelo' },
    { p: 'Jacamim lote 25 × 26 (mesma parcela, 1.100): a ficha do Douglas diz 26, o recinto deu o 26 a João Giuzzo', impacto: 'só o número do lote (VGV igual)', quem: 'listagem da Programa' },
    { p: 'Arataú lote 46 (60.000): comprador é condomínio com o Douglas, vendedor é Alfredo José Cardoso (Galopeira, lista do Rusa)', impacto: 'R$ 1.200 (2% Douglas) × R$ 3.000 (5% Rusa) × nada', quem: 'João / Rusa' },
    { p: 'AZ lote 2023: 40 ou 30 parcelas', impacto: 'R$ 23.000 de VGV e R$ 460 do Fábio', quem: 'Fábio / Ricardo Nicolau' },
    { p: 'EAO lote 19: cadastro "não autorizado" na Programa em 11/09, venda "à vista dia 20/09"', impacto: 'R$ 24.000 e R$ 480 do Fábio caem se não pagar', quem: 'Fábio / Programa' },
    { p: 'Katayama: assessor não declarado (atribuído ao Douglas por correlação) e acordo inexistente', impacto: 'R$ 1.740 de comissão; receita de ~R$ 4.350 se 5% da venda', quem: 'Douglas / João' },
    { p: 'lt 96 (12/09): de qual leilão?', impacto: 'R$ 21.000 de VGV fora de tudo; 5% do Rusa', quem: 'Douglas' },
    { p: 'Agrofeira IBC: quantos lotes e quanto', impacto: 'VGV inteiro do Fábio no IBC', quem: 'Fábio / Nelore IBC' },
    { p: 'Shopping Visual: quem recebe a comissão dos R$ 17.800 (Marcelo Carneiro inativo na folha)', impacto: 'R$ 356 (2%) e receita de R$ 890', quem: 'João' },
    { p: 'Faturamento total do AZ (0,5%), do EAO (0,33%) e do Mafra (tabela)', impacto: 'as notas dos três pregões', quem: 'Ricardo Nicolau / Programa' },
]

/* ── TABELA ÚNICA: todos os leilões do mês, realizados e por vir ─────────── */
const tabelaUnica = [
    ...EVENTOS.map(E => ({ data: E.data, nome: E.nome, leiloeira: E.leiloeira, status: 'realizado', lotes: E.totais.lotes, cabecas: E.totais.cabecas, vgv: E.totais.vgv, metaVenda: E.metaVenda, pctMeta: E.pctMeta,
        assessores: E.porAssessor.map(a => `${a.nome.replace(' (Regiane)', '')} ${a.lotes}`).join(' · ') || '—', acordo: E.acordo, receita: E.receita?.valor ?? null, receitaDescr: E.receita?.descr || '', fonte: E.resumoEquipe?.texto || '', confere: E.confere, sistema: E.key === 'mafra' ? 'fechamento OK' : (E.lotes.length ? (['az', 'eao', 'jacamim'].includes(E.key) ? 'fichas sem leilão' : 'nada') : '—') })),
    ...restante.map(r => ({ data: r.data, nome: r.nome, leiloeira: r.leiloeira, status: 'a realizar', lotes: null, cabecas: null, vgv: null, metaVenda: r.metaVenda, pctMeta: null, assessores: '', acordo: r.pct ? `${r.pct} (planilha)` : '', receita: null, receitaDescr: '', fonte: r.planilha ? `planilha: ${r.planilha}` : 'não está na planilha', confere: null, sistema: '' })),
    { data: '2026-09-02', nome: 'Agrofeira IBC — pré-venda / shopping (02 a 08/09)', leiloeira: 'Nelore IBC (pregão 18–19/09 pela Agreste)', status: 'sem valor', lotes: null, cabecas: null, vgv: null, metaVenda: null, pctMeta: null, assessores: `Fábio Omena (${ibcMsgs.length} registros)`, acordo: '', receita: null, receitaDescr: '', fonte: 'registros sem parcela/valor no grupo de lances', confere: null, sistema: 'nada' },
    { data: '2026-09-10', nome: 'Só Criador Machos e Fêmeas de Alto Padrão (Bula Remates, gado comercial)', leiloeira: 'Bula Remates', status: 'não é cobertura', lotes: hastapro.soCriador.laila.lotes.length, cabecas: null, vgv: null, metaVenda: null, pctMeta: null, assessores: `Laila pela Remates (R$ ${hastapro.soCriador.laila.vgv.toLocaleString('pt-BR')})`, acordo: '', receita: null, receitaDescr: '', fonte: `HastaPro FIL 01: R$ ${hastapro.soCriador.vgv.toLocaleString('pt-BR')} em ${hastapro.soCriador.lotes} lotes`, confere: null, sistema: 'HastaPro (FIL 01)' },
].sort((a, b) => a.data.localeCompare(b.data) || (a.status === 'realizado' ? -1 : 1))

const D = { geradoEm: new Date().toISOString(), ate: ATE, tabelaUnica, eventos: EVENTOS, fora, totais, porAssessor, meta, restante, metaRestante, correcoes, pendencias, hastapro, planilha: { arquivo: planFile, linhas: planilha, acordos }, sistema: { fechamentos: fechDb ?? [], vendasCapturadas: (vendasDb ?? []).length, semVinculo: (vendasDb ?? []).filter(v => !v.cronograma_id).length }, cardDia05: { vgv: 1500300, jacamim: 883200, aratau: 617100, nota: 'card feito em 05/09 22:03 contava o último lote do Jacamim (1.600 × 30 = 48.000), que foi perdido no "agradece"; sem ele o Jacamim é 835.200 e o dia 1.452.300 (+ 18.600 do Marcondes = 1.470.900)' } }
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(D, null, 2))

const falhas = []
for (const E of EVENTOS) { if (E.confere === false) falhas.push(`${E.key}: ${E.totais.vgv} ≠ resumo ${E.resumoEquipe.valor ?? E.resumoEquipe.lotes}`); for (const l of E.lotes) if (l.fonteRe && !l.fichaQuando) falhas.push(`${E.key} lt ${l.lote}: ficha não achada`) }
if (falhas.length) { console.warn('⚠ CHECAGENS:'); falhas.forEach(f => console.warn('  -', f)) } else console.log('checagens OK: todos os eventos batem com o resumo da equipe e todas as fichas foram localizadas')

/* ── XLSX ───────────────────────────────────────────────────────────────── */
const wb = XLSX.utils.book_new()
const aoa = (name, rows, widths) => { const ws = XLSX.utils.aoa_to_sheet(rows); if (widths) ws['!cols'] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name) }
aoa('Todos os leilões do mês', [
    ['SETEMBRO/2026 — TODOS OS LEILÕES NUMA TABELA (realizados até 13/09 + o que ainda vem)', '', '', '', '', '', `gerado em ${new Date().toLocaleString('pt-BR')}`],
    ['Meta do mês', META_MES, 'Realizado até 13/09', totais.vgv, '% da meta', meta.pct, 'Meta somada dos pregões restantes (planilha)', metaRestante],
    [],
    ['Data', 'Leilão / evento', 'Leiloeira', 'Status', 'Lotes Bula', 'Cabeças', 'VGV Bula (R$)', 'Meta de venda (planilha)', '% da meta', 'Quem vendeu (lotes)', 'Acordo', 'Receita estimada (R$)', 'Bate com a equipe?', 'Sistema', 'Fonte / resumo'],
    ...tabelaUnica.map(t => [t.data, (([[/Jacamim/i, 'JACAMIM — 10º Especial Touros'], [/Arata/i, 'FLOR DO ARATAÚ — 10º Leilão & Convidados'], [/Marcondes/i, 'NELORE MARCONDES — Leilão Caminhos'], [/Mafra/i, 'MAFRA — Touros Premium (Uberaba)'], [/Visual/i, 'NELORE VISUAL — Shopping de Genética'], [/Nelore AZ/i, 'NELORE AZ — Reprodutores'], [/Mega Premium EAO/i, 'EAO — 7º Mega Premium (touros + fêmeas 13/09)'], [/Katayama/i, 'KATAYAMA — Novo Repartimento (fêmeas)'], [/Crispim/i, 'CRISPIM — 2º Herança Genética'], [/IBC/i, 'AGROFEIRA IBC — pré-venda (02–08/09)'], [/Só Criador/i, 'SÓ CRIADOR — Bula Remates (gado comercial)']].find(([re]) => re.test(t.nome)) || [null, t.nome])[1]), t.leiloeira, t.status, t.lotes ?? '', t.cabecas ?? '', t.vgv ?? '', t.metaVenda ?? '', t.pctMeta ?? '', t.assessores, t.acordo, t.receita ?? '', t.confere === null ? '' : (t.confere ? 'sim' : 'NÃO'), t.sistema, t.fonte]),
    ['TOTAL realizado', '', '', '', totais.lotes, totais.cabecas, totais.vgv, tabelaUnica.filter(t => t.status === 'realizado').reduce((s, t) => s + (t.metaVenda || 0), 0)],
    ['TOTAL a realizar (meta)', '', '', '', '', '', '', metaRestante],
], [12, 58, 30, 14, 9, 8, 14, 16, 9, 44, 40, 14, 10, 16, 60])
aoa('Resumo do mês', [
    ['FECHAMENTO DE VENDAS — SETEMBRO/2026 — até 13/09', '', '', '', '', `gerado em ${new Date().toLocaleString('pt-BR')}`],
    ['Meta do mês (Marcelo, 03/09)', META_MES, 'Realizado até 13/09', totais.vgv, '% da meta', meta.pct],
    [],
    ['Data', 'Leilão / evento', 'Leiloeira', 'Lotes', 'Cabeças', 'VGV Bula (R$)', 'Comissão equipe (R$)', 'Meta de venda (planilha)', '% da meta', 'Resumo da equipe', 'Bate?', 'Acordo', 'Receita estimada (R$)', 'No HastaPro?', 'Fechamento no ERP?'],
    ...EVENTOS.map(E => [E.data, E.nome, E.leiloeira, E.totais.lotes, E.totais.cabecas, E.totais.vgv, E.totais.comissao, E.metaVenda || '', E.pctMeta ?? '', E.resumoEquipe.valor ?? (E.resumoEquipe.lotes ? E.resumoEquipe.lotes + ' lotes' : ''), E.confere === null ? '' : (E.confere ? 'sim' : 'NÃO'), E.acordo, E.receita?.valor ?? '', 'não', E.key === 'mafra' ? 'sim (1 lote)' : 'não']),
    ['TOTAL', '', '', totais.lotes, totais.cabecas, totais.vgv, totais.comissao],
    [], ['Fora do fechamento (ver aba)'], ...fora.map(f => [f.item, '', '', '', '', '', '', '', '', '', f.situacao]),
], [12, 52, 26, 7, 8, 14, 16, 16, 9, 40, 7, 40, 14, 12, 14])
aoa('Lotes', [['Data', 'Leilão', 'Lote', 'Animal/categoria', 'Sexo', 'Qtd', 'Parcela (R$)', 'Parcelas', 'VGV (R$)', 'Vendeu', 'Comissão de', '%', 'Comissão (R$)', 'Comprador', 'Fazenda', 'Cidade', 'UF', 'Ficha (hora)', 'Onde', 'Postou', 'No sistema', 'Observação'],
    ...todos.map(l => [l.data, l.evento, l.lote, l.animal || '', l.sexo, l.qtd, l.parcela, l.parcelas, l.vgv, l.assessor + (l.atribuicao ? ` (${l.atribuicao})` : ''), l.comissaoDe, l.pct, l.comissao, l.comprador, l.fazenda || '', l.cidade || '', l.uf || '', l.fichaQuando || '', l.fichaGrupo || '', l.fichaAutor || '', l.noSistema ? `${l.noSistema.status}${l.noSistema.vinculado ? '' : ' · sem leilão'}` : 'não capturada', l.obs || '']),
    ['TOTAL', '', '', '', '', totais.cabecas, '', '', totais.vgv, '', '', '', totais.comissao]], [11, 40, 8, 26, 5, 5, 11, 8, 12, 18, 18, 6, 12, 36, 28, 20, 4, 12, 26, 14, 20, 80])
aoa('Por assessor', [['Assessor', '%', 'Lotes', 'Cabeças', 'VGV (R$)', 'Comissão (R$)', ...EVENTOS.filter(E => E.lotes.length).map(E => E.key)],
    ...porAssessor.map(a => [a.nome, a.pct, a.lotes, a.cabecas, a.vgv, a.comissao, ...EVENTOS.filter(E => E.lotes.length).map(E => a.eventos[E.key]?.vgv || 0)]),
    ['TOTAL', '', totais.lotes, totais.cabecas, totais.vgv, totais.comissao]], [22, 6, 7, 8, 14, 14, 12, 12, 12, 12, 12, 12, 12, 12])
aoa('Meta e agenda restante', [['Meta do mês', META_MES], ['Realizado até 13/09', totais.vgv], ['% da meta', meta.pct], ['Falta', meta.falta], ['Meta de venda somada dos pregões restantes (planilha)', metaRestante], [],
    ['Data', 'Leilão', 'Leiloeira', 'Previsão faturamento', 'Meta de venda', '% acordo'], ...restante.map(r => [r.data, r.nome, r.leiloeira, r.previsaoFat || '', r.metaVenda || '', r.pct || ''])], [12, 50, 30, 18, 16, 10])
aoa('Fora do fechamento', [['Item', 'Assessor', 'Situação', 'Por quê'], ...fora.map(f => [f.item, f.assessor, f.situacao, f.porque]), [], ['Registros do IBC (sem valor)'], ...ibcMsgs.map(m => [m.quando, m.autor, '', m.texto])], [60, 22, 34, 100])
aoa('Correções no sistema', [['#', 'O que fazer', 'Por quê'], ...correcoes.map(c => [c.n, c.o, c.por])], [4, 90, 100])
aoa('Pendências', [['Pendência', 'Impacto', 'Com quem'], ...pendencias.map(p => [p.p, p.impacto, p.quem])], [80, 50, 26])
aoa('Planilha do chefe (set)', [['Dia', 'Leilão', 'Leiloeira', 'Previsão faturamento', 'Meta venda', 'Cobertura', 'Meta comissão', '% venda', '% fat.'], ...planilha.map(l => [l.dia, l.leilao, l.leiloeira, l.previsaoFat, l.metaVenda, l.cobertura, l.metaComissao, l.pctVenda, l.pctFat])], [6, 52, 18, 18, 14, 10, 14, 8, 8])
XLSX.writeFile(wb, path.join(OUT, 'dados.xlsx'))
const xlsxPath = path.join(DESK, 'Bula - Fechamento Leiloes Setembro 2026 (ate 13-09) - Dados.xlsx')
try { fs.copyFileSync(path.join(OUT, 'dados.xlsx'), xlsxPath); console.log('xlsx  →', xlsxPath) } catch (e) { console.warn(`⚠ XLSX não copiado para a Área de Trabalho (${e.code}); cópia em ${path.join(OUT, 'dados.xlsx')}`) }
console.log('dados →', path.join(OUT, 'dados.json'))
console.log(`VGV ${totais.vgv} em ${totais.lotes} lotes (${totais.cabecas} cabeças) · comissão ${totais.comissao} · meta ${META_MES} → ${(meta.pct * 100).toFixed(1)}%`)
for (const E of EVENTOS) console.log(' ', E.data, E.key.padEnd(9), String(E.totais.lotes).padStart(3), 'lotes', String(E.totais.vgv).padStart(10), '| confere:', E.confere, '|', E.porAssessor.map(a => `${a.nome} ${a.vgv}`).join(' · '))
