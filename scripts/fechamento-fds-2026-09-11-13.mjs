/**
 * CONFERÊNCIA DOS LANÇAMENTOS — LEILÕES DO FIM DE SEMANA 11 a 13/09/2026.
 *
 * Pedido do João (14/09): "conferência ampla e cuidadosa sobre os lançamentos
 * pra fazer um fechamento dos leilões do fim de semana (de 11/09 a 13/09)".
 *
 * O que cada fonte sabe hoje (14/09, manhã):
 *   1. GRUPOS DE WHATSAPP — a única fonte primária: "Lances Bula Assessoria"
 *      (pregão ao vivo), "Bula Assessoria l Assessores" (vendas fora do grupo
 *      de lances: Katayama, lt 96) e "Financeiro" (resumo da própria equipe às
 *      22h de 13/09: AZ 158.000 · EAO 310.500 · Katayama 87.000).
 *   2. bula_leilao_vendas — o que o parser capturou (17 linhas de 12 a 14/09):
 *      inclui 1 falso positivo (lt 105, IA) e 1 duplicata (lt 38 = Mafra 06/09).
 *   3. bula_leilao_fechamento — só o fantasma "MATRIZES E BEZERRAS 14/09".
 *   4. HASTAPRO — NADA de setembro na FIL 2 (último pregão lançado: 30/08).
 *   5. PLANILHA FINANCEIRO BULA 2026 (7).xlsx — previsão/meta e os acordos
 *      (aba "Acordos com Marcas": EAO 0,33% fat · AZ 0,5% fat + 3% venda).
 *
 * Regra: VGV = parcela × nº de parcelas × qtd (30 por padrão; lt 2023 do AZ é
 * 40x pela correção do próprio Fábio às 22:12). Nada é gravado no banco —
 * este script só LÊ e escreve outputs/ + Área de Trabalho.
 *
 *   node scripts/fechamento-fds-2026-09-11-13.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import XLSX from 'xlsx'
import Firebird from 'node-firebird'
import { createClient } from '@supabase/supabase-js'

const OUT = 'outputs/fechamento-fds-2026-09-11-13'
const DESK = path.join(os.homedir(), 'Desktop', 'Fechamento 11-13 set 2026')
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(DESK, { recursive: true })

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    if (!(m[1] in process.env)) process.env[m[1]] = v
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })

const r2 = n => Math.round(Number(n || 0) * 100) / 100
const brt = iso => { if (!iso) return null; const d = new Date(new Date(iso).getTime() - 3 * 3600e3); const z = n => String(n).padStart(2, '0'); return `${z(d.getUTCDate())}/${z(d.getUTCMonth() + 1)} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}` }
const sum = (arr, f) => r2(arr.reduce((s, x) => s + Number(f(x) || 0), 0))

/* ── equipe: percentuais pela folha (mesma régua do importador) ─────────── */
const { data: folha } = await sb.from('erp_folha_estrutura').select('nome, apelidos, comissao_pct, ativo')
const pctFolha = nome => { const f = (folha ?? []).find(f => [f.nome, ...(f.apelidos ?? [])].some(a => String(a).toLowerCase() === nome.toLowerCase())); return f ? Number(f.comissao_pct) / 100 : null }
const PCT = {
    'Douglas Bispo': pctFolha('Douglas Bispo') ?? 0.02,
    'Fábio Omena': pctFolha('Fábio Omena') ?? 0.02,
    'Leonardo Serafim': pctFolha('Leonardo Serafim') ?? 0.02,
    'Nane (Regiane)': pctFolha('Nane') ?? 0.02,
    'Gustavo Rusa': pctFolha('Gustavo Rusa') ?? 0.05,
}

/* ── o que o parser capturou (12 a 14/09) e os fechamentos que existem ───── */
const { data: vendasDb } = await sb.from('bula_leilao_vendas').select('*').gte('leilao_data', '2026-09-12').lte('leilao_data', '2026-09-14').order('leilao_data').order('lote')
const { data: fechDb } = await sb.from('bula_leilao_fechamento').select('id, nome, data, vgv_total, lotes_vendidos, origem, lances').gte('data', '2026-09-11').lte('data', '2026-09-14')
const { data: agenda } = await sb.from('bula_leiloes').select('id, data, nome, horario, leiloeira, cronograma_id, acordo_comissao, status').gte('data', '2026-09-12').lte('data', '2026-09-14').order('data')
const { data: crono } = await sb.from('cronograma_leiloes').select('id, data, nome, hora, leiloeira, criador').gte('data', '2026-09-12').lte('data', '2026-09-14').order('data')
const { data: lt38mafra } = await sb.from('bula_leilao_vendas').select('id, leilao_data, lote, valor, msg_ts, group_jid, cronograma_id').eq('lote', '38').eq('leilao_data', '2026-09-06').maybeSingle()
const { data: fechMafra } = await sb.from('bula_leilao_fechamento').select('id, nome, data, vgv_total').eq('data', '2026-09-06').maybeSingle()
const { data: vendasSet } = await sb.from('bula_leilao_vendas').select('leilao_data, status, cronograma_id').gte('leilao_data', '2026-09-01').lte('leilao_data', '2026-09-10')

const vendaDb = (data, lote) => (vendasDb ?? []).find(v => v.leilao_data === data && String(v.lote) === String(lote))

/* ── as mensagens-fonte (texto vivo, com horário e grupo) ──────────────── */
const GRUPOS = {
    '120363162972078973@g.us': 'Lances Bula Assessoria', '120363425959659407@g.us': 'Bula Assessoria l Assessores',
    '120363408594638064@g.us': 'Financeiro Bula Assessoria', '120363428067530926@g.us': 'Lances Mafra', '120363426678313709@g.us': 'Cadastros Bula e Programa',
}
// PostgREST corta em 1000 linhas — pagina com range() (o grupo de lances sozinho tem ~900 msgs no fim de semana)
const msgs = []
for (let from = 0; ; from += 1000) {
    const { data } = await sb.from('whatsapp_messages').select('created_at, phone, body, reason').in('phone', Object.keys(GRUPOS))
        .gte('created_at', '2026-09-11T03:00:00Z').lte('created_at', '2026-09-14T15:00:00Z').order('created_at').range(from, from + 999)
    msgs.push(...(data ?? [])); if (!data || data.length < 1000) break
}
const { data: autores } = await sb.from('operational_items').select('external_message_id, source_sender_name').in('source_chat_jid', Object.keys(GRUPOS)).gte('occurred_at', '2026-09-11T03:00:00Z')
const autorDe = new Map((autores ?? []).map(a => [a.external_message_id, a.source_sender_name]))
const acha = (re, grupo) => (msgs ?? []).filter(m => re.test(m.body || '') && (!grupo || GRUPOS[m.phone] === grupo))
const fonte = (re, grupo) => { const m = acha(re, grupo)[0]; return m ? { quando: brt(m.created_at), grupo: GRUPOS[m.phone], autor: autorDe.get(m.reason) || null, texto: m.body } : null }

/* ── HastaPro: o que já está lançado ───────────────────────────────────── */
const txt = v => (Buffer.isBuffer(v) ? v.toString('latin1') : v)
const norm = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, txt(v)]))
const db = await new Promise((res, rej) => Firebird.attach({
    host: process.env.HASTAPRO_HOST, port: +process.env.HASTAPRO_PORT, database: process.env.HASTAPRO_DATABASE,
    user: process.env.HASTAPRO_USER, password: process.env.HASTAPRO_PASSWORD, lowercase_keys: true,
}, (e, d) => e ? rej(e) : res(d)))
const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => e ? rej(e) : res(r.map(norm))))
const hpSet = await q(`select l.FIL_CODIGO fil, l.LEI_NOME nome, l.LEI_DATA data, count(lo.LOT_LOTE) n, sum(lo.LOT_TOTAL) vgv
  from LEILAO l left join LOTES lo on lo.LEI_CODIGO=l.LEI_CODIGO and lo.FIL_CODIGO=l.FIL_CODIGO
  where l.LEI_DATA >= '2026-08-25' group by 1,2,3 order by l.LEI_DATA`)
const soCriador = await q(`select lo.LOT_LOTE lote, lo.LOT_QTD qtd, lo.LOT_TOTAL total, lo.LOT_PISTEIRO p from LOTES lo join LEILAO l on l.LEI_CODIGO=lo.LEI_CODIGO and l.FIL_CODIGO=lo.FIL_CODIGO
  where l.LEI_DATA >= '2026-09-10' and l.LEI_DATA < '2026-09-11' and lo.LOT_TOTAL > 0`)
const pistCods = [...new Set(soCriador.map(x => String(x.p)).filter(x => x && x !== 'null'))]
const nomePist = new Map(pistCods.length ? (await q(`select CLI_CODIGO c, CLI_NOME n from CLIENTES where CLI_CODIGO in (${pistCods.map(c => `'${c}'`).join(',')})`)).map(x => [String(x.c), String(x.n).trim()]) : [])
db.detach()
const hastapro = {
    ultimoFil2: hpSet.filter(x => String(x.fil).trim() === '2').map(x => new Date(x.data).toISOString().slice(0, 10)).sort().at(-1),
    setembro: hpSet.filter(x => new Date(x.data).toISOString().slice(0, 10) >= '2026-09-01').map(x => ({ fil: String(x.fil).trim(), nome: String(x.nome).trim(), data: new Date(x.data).toISOString().slice(0, 10), lotes: Number(x.n), vgv: r2(x.vgv) })),
    soCriador: { data: '2026-09-10', vgv: sum(soCriador, x => x.total), lotes: soCriador.length,
        laila: { lotes: soCriador.filter(x => /laila/i.test(nomePist.get(String(x.p)) || '')).map(x => String(x.lote).trim()), vgv: sum(soCriador.filter(x => /laila/i.test(nomePist.get(String(x.p)) || '')), x => x.total) } },
}

/* ── planilha do chefe (previsão / acordos) ────────────────────────────── */
const planFile = fs.readdirSync('F:/').filter(f => /^FINANCEIRO BULA 2026.*\.xlsx$/i.test(f)).map(f => ({ f, m: fs.statSync('F:/' + f).mtimeMs })).sort((a, b) => b.m - a.m)[0]?.f
let planilha = { arquivo: planFile, linhas: [], acordos: {} }
if (planFile) {
    const wb = XLSX.readFile('F:/' + planFile)
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['Leilões'], { header: 1, raw: false })
    const num = s => Number(String(s ?? '').replace(/[^0-9.,-]/g, '').replace(/,/g, '')) || 0
    planilha.linhas = rows.filter(r => /SETEMBRO/i.test(String(r[1] || '')) && Number(r[0]) >= 12 && Number(r[0]) <= 17)
        .map(r => ({ dia: Number(r[0]), leilao: String(r[2]).trim(), leiloeira: String(r[3] || '').trim(), previsaoFat: num(r[5]), metaVenda: num(r[6]), metaComissao: num(r[8]), pctVenda: String(r[14] || '').trim(), pctFat: String(r[15] || '').trim() }))
    const ac = XLSX.utils.sheet_to_json(wb.Sheets['Acordos com Marcas'], { header: 1, raw: false })
    for (const r of ac) { const nome = String(r[1] || '').trim(); if (/EAO|NELORE AZ|MAFRA/i.test(nome)) planilha.acordos[nome] = String(r[2] || '').trim() }
}
const plan = re => planilha.linhas.find(l => re.test(l.leilao))

/* ── OS LOTES (leitura mensagem a mensagem; ver relatório) ─────────────── */
const lote = (o) => {
    const parcelas = o.parcelas ?? 30, qtd = o.qtd ?? 1
    const vgv = r2(o.parcela * parcelas * qtd)
    const dono = o.direcionamento || o.assessor
    const pct = PCT[dono] ?? 0.02
    const db = vendaDb(o.data, o.lote)
    const f = o.fonteRe ? fonte(o.fonteRe, o.fonteGrupo) : null
    return { ...o, parcelas, qtd, vgv, comissaoDe: dono, pct, comissao: r2(vgv * pct),
        fichaQuando: f?.quando ?? null, fichaGrupo: f?.grupo ?? null, fichaAutor: f?.autor ?? o.fichaAutor ?? null, fichaTexto: f?.texto ?? null,
        noSistema: db ? { id: db.id, status: db.status, cronograma_id: db.cronograma_id, valorDb: db.valor, assessorDb: db.assessor, fonte: db.fonte } : null,
        bateComDb: db ? Number(db.valor) === o.parcela : null }
}
const AZ = {
    key: 'az', data: '2026-09-12', nome: 'Leilão Virtual Reprodutores Nelore AZ', leiloeira: 'Ricardo Nicolau Leilões (Boi e Terra Negócios Agropecuários)', praca: 'Sinop-MT · virtual', hora: '14:00 (Brasília)',
    condicao: '30 parcelas (2+2+2+2+2+2+18) para os touros P.O.; lotes 2023/2026 são cotas (50% e 33%) do touro de central Expresso do AZZA',
    acordo: planilha.acordos['NELORE AZ'] || '0,5% do faturamento leilão + 3% da venda', acordoFonte: 'aba Acordos com Marcas · linha 14',
    cronogramaId: (crono ?? []).find(c => /AZ$/i.test(c.nome))?.id, bulaLeilaoId: (agenda ?? []).find(a => /AZ$/i.test(a.nome))?.id,
    planilha: plan(/NELORE AZ/i),
    resumoGrupo: { texto: 'Vendas Nelore AZ: R$158.000 (4 touros)', valor: 158000, quando: fonte(/Vendas \*Nelore AZ\*/)?.quando },
    lotes: [
        lote({ data: '2026-09-12', lote: '2023', animal: 'EXPRESSO DO AZZA (AZZA 5620) — cota de 50% do touro de central', parcela: 2300, parcelas: 40, sexo: 'M', assessor: 'Fábio Omena', comprador: 'João Batista Soares Diniz', fazenda: 'Fazenda Rio Bonito', cidade: 'Redenção', uf: 'PA', fonteRe: /Levamos lote 2023/, fonteGrupo: 'Lances Bula Assessoria',
            obs: '40 parcelas: o próprio Fábio reenviou a ficha ao Financeiro às 22:12 com "(40x)"; a OE do leilão marca o lote como "VENDA 50% - 17:00 HRS MT". A 30x seria R$ 69.000 — o HastaPro (CON_CAPTACAO) decide.' }),
        lote({ data: '2026-09-12', lote: '11', animal: 'FULGOR FIV DO AZZA (AZZA 6143)', parcela: 800, sexo: 'M', assessor: 'Leonardo Serafim', comprador: 'José Nilson Ceron', fazenda: 'Fazenda Ana Amália', cidade: 'Marcelândia', uf: 'MT', fonteRe: /levamos lote 11 - 800/, fonteGrupo: 'Lances Bula Assessoria' }),
        lote({ data: '2026-09-12', lote: '43', animal: '6417 DO AZZA (AZZA 6417)', parcela: 700, sexo: 'M', assessor: 'Leonardo Serafim', comprador: 'José Nilson Ceron', fazenda: 'Fazenda Ana Amália', cidade: 'Marcelândia', uf: 'MT', fonteRe: /levamos lote 43 e 44/, fonteGrupo: 'Lances Bula Assessoria', obs: 'Ficha única "lote 43 e 44 - 700,00" = 700 por lote (bate com o resumo de 158.000).' }),
        lote({ data: '2026-09-12', lote: '44', animal: '6305 DO AZZA (AZZA 6305)', parcela: 700, sexo: 'M', assessor: 'Leonardo Serafim', comprador: 'José Nilson Ceron', fazenda: 'Fazenda Ana Amália', cidade: 'Marcelândia', uf: 'MT', fonteRe: /levamos lote 43 e 44/, fonteGrupo: 'Lances Bula Assessoria' }),
    ],
    naoVendas: [
        'lt 53 (touro mocho, 700): o cliente autorizou 750 ("Vamos 50? Pode") e o martelo caiu antes — print do Fábio às 18:22; sem "Levamos".',
        'lt 2026 (Farturão, cota 33%): Fábio foi até 1.800 e o cliente "N resp".',
        'lt 5 (850), lt 1 (950), lt 35 (750), lt 49 e lt 70 (650 "bateu"): lances sem arremate.',
        'Leonardo às 19:01: "Cliente meu ficou todo perdido e perdeu os lances em 3 lts" (delay da transmissão) — "firmou para amanhã".',
    ],
}
const EAO = {
    key: 'eao', data: '2026-09-13', nome: '7º Leilão Mega Premium EAO — Touros, Bezerras e Matrizes (1º dia)', leiloeira: 'Programa Leilões / Central Leilões', praca: 'Londrina-PR · virtual', hora: '09:00 touros · noite fêmeas',
    condicao: 'Lance × 30 (2+2+2+2+2+2+20); múltiplos × 40. À vista 10% de desconto até 18/09; comissão de compra 8%',
    acordo: planilha.acordos['EAO AGROPECUÁRIA'] || '0,33% do faturamento total dos leilões', acordoFonte: 'aba Acordos com Marcas · linha 1 (mesma régua do Expozebu e do Baviera)',
    cronogramaId: (crono ?? []).find(c => /TOUROS E MATRIZES EAO/i.test(c.nome))?.id, bulaLeilaoId: (agenda ?? []).find(a => /TOUROS E MATRIZES EAO/i.test(a.nome))?.id,
    planilha: plan(/EAO - TOUROS/i), planilhaFemeas: plan(/EAO - FÊMEAS/i),
    resumoGrupo: { texto: 'Resultado EAO 13/09: 11 touros e 1 fêmea — R$ 310.500,00', valor: 310500, quando: fonte(/Resultado EAO 13\/09/)?.quando },
    lotes: [
        lote({ data: '2026-09-13', lote: '9', animal: 'touro 23m 802kg (OE 11º)', parcela: 820, sexo: 'M', assessor: 'Douglas Bispo', comprador: 'Dra. Marilda Alves Moreira', fazenda: 'Fazenda Asa Branca', cidade: 'Xinguara', uf: 'PA', fonteRe: /Levamos lt 9 - 820/, fonteGrupo: 'Lances Bula Assessoria', obs: 'Lead qualificada na sexta à noite; cadastro aprovado na Bula Remates em 11/09 21:58. Não consta no repasse ao Financeiro das 13:41, mas está no total de 310.500.' }),
        lote({ data: '2026-09-13', lote: '12', animal: 'touro 23m 818kg (OE 14º)', parcela: 800, sexo: 'M', assessor: 'Fábio Omena', comprador: 'Laurentino Fernandes Pereira', fazenda: 'Fazenda Santa Maria', cidade: 'Jaíba', uf: 'MG', fonteRe: /Levamos lt 12 - 800/, fonteGrupo: 'Lances Bula Assessoria', obs: 'Cadastro na Programa pedido às 10:19, arremate às 10:45.' }),
        lote({ data: '2026-09-13', lote: '19', animal: 'touro 22m 704kg (OE 19º)', parcela: 800, sexo: 'M', assessor: 'Fábio Omena', comprador: 'Alberto Medeiros', fazenda: 'Fazenda Medeiros', cidade: 'Bacabal', uf: 'MA', fonteRe: /Levamos lt 19 - 800/, fonteGrupo: 'Lances Bula Assessoria',
            obs: '"À vista — dia 20 de setembro" (10% de desconto). ⚠ Em 11/09 15:32 a Programa respondeu "Antonio Alberto Feitoza de Medeiros — Não autorizado" no grupo de cadastros; provável mesmo comprador. Acompanhar o pagamento à vista.' }),
        lote({ data: '2026-09-13', lote: '21', animal: 'touro 22m 774kg (OE 21º)', parcela: 1050, sexo: 'M', assessor: 'Douglas Bispo', comprador: 'Dra. Marilda Alves Moreira', fazenda: 'Fazenda Asa Branca', cidade: 'Xinguara', uf: 'PA', fonteRe: /Levamos lt 21 - 1050/, fonteGrupo: 'Lances Bula Assessoria' }),
        lote({ data: '2026-09-13', lote: '26', animal: 'touro 22m 734kg (OE 24º)', parcela: 800, sexo: 'M', assessor: 'Fábio Omena', comprador: 'Joerson Ferronato', fazenda: 'Fazenda Jacutinga', cidade: null, uf: 'MT', fonteRe: /Levamos lt 26 - 800/, fonteGrupo: 'Lances Bula Assessoria' }),
        lote({ data: '2026-09-13', lote: '47', animal: 'touro 22m 834kg (OE 37º)', parcela: 1300, sexo: 'M', assessor: 'Douglas Bispo', comprador: 'Gessivaldo Lobo', fazenda: 'Agropecuária 3 Marias', cidade: 'Barra do Corda', uf: 'MA', fonteRe: /Levamos lt 47 - 1300/, fonteGrupo: 'Lances Bula Assessoria' }),
        lote({ data: '2026-09-13', lote: '52', animal: 'touro 25m 784kg (OE 46º)', parcela: 820, sexo: 'M', assessor: 'Nane (Regiane)', comprador: 'Marcos Rodrigo Capuci', fazenda: 'Fazenda Santo Antônio', cidade: 'Rio Verde', uf: 'MS', fonteRe: /Lote 52- \$ 820/, fonteGrupo: 'Lances Bula Assessoria', obs: 'Ficha no formato da Nane ("Lote 52- $ 820,00 / Nane - Bula"); o parser gravou o comprador dentro do campo assessor. Comissão da Nane é diferida para 28/12.' }),
        lote({ data: '2026-09-13', lote: '71', animal: 'touro 25m 760kg (OE 55º)', parcela: 800, sexo: 'M', assessor: 'Douglas Bispo', comprador: 'Deiglames Oliveira', fazenda: 'Fazenda Canaã', cidade: 'Montes Altos', uf: 'MA', fonteRe: /Levamos lote 71 - 800/, fonteGrupo: 'Lances Bula Assessoria' }),
        lote({ data: '2026-09-13', lote: '74', animal: 'touro 25m 830kg (OE 58º)', parcela: 770, sexo: 'M', assessor: 'Fábio Omena', comprador: 'Wesley Carvalho Silva', fazenda: 'Fazenda Carvalho', cidade: 'Formoso', uf: 'GO', fonteRe: /Levamos lt 74 - 770/, fonteGrupo: 'Lances Bula Assessoria' }),
        lote({ data: '2026-09-13', lote: '100', animal: 'touro 25m 778kg (OE 76º)', parcela: 800, sexo: 'M', assessor: 'Fábio Omena', comprador: 'Joerson Ferronato', fazenda: 'Fazenda Jacutinga', cidade: null, uf: 'MT', fonteRe: /Levamos lt 100 - 800/, fonteGrupo: 'Lances Bula Assessoria' }),
        lote({ data: '2026-09-13', lote: '107', animal: 'touro 25m 800kg (OE 99º)', parcela: 820, sexo: 'M', assessor: 'Fábio Omena', comprador: 'Vilmar Pantaleão', fazenda: 'Fazenda VP', cidade: null, uf: 'MT', fonteRe: /Levamos lt 107 - 820/, fonteGrupo: 'Lances Bula Assessoria', obs: 'Postado pelo segundo número do Fábio ("Fábio De Omena Gaia").' }),
        lote({ data: '2026-09-13', lote: '222', animal: 'vaca parida de fêmea, 44m (OE fêmeas 136º)', parcela: 770, sexo: 'F', assessor: 'Leonardo Serafim', comprador: 'Rafael Falci', fazenda: null, cidade: 'Belo Horizonte', uf: 'MG', fonteRe: /Levamos LT 222/, fonteGrupo: 'Lances Bula Assessoria',
            obs: 'Ficha diz "Foi com Marcelo e Leonardo" — a dupla foi extinta em 22/07 e a comissão é 100% do Leonardo. Postada pelo Marcelo Carneiro às 20:58 (etapa de fêmeas da noite). Lote de 1 cabeça na OE (bezerra ao pé).' }),
    ],
    naoVendas: [
        'lt 105 (EXPRESSIVO FIV EAO, 56m/1.255kg): a Nane disputou de 870 a 1.520; o Max escreveu "Bateu!!!! Lote 105 1300" por engano ("falei que digitei errado"), a disputa seguiu e a Nane parou em 1.550 ("parei liberado"). O parser (IA) gravou uma venda a 1.300 — FALSO POSITIVO.',
        'lt 118: Nane, "mandou lance atrasado / liberou". lt 99: disputa até 1.100, "Liberou". lt 72: "Deixa ir / Bateu". lt 81 e lt 102: sem resposta do cliente.',
        'lt 15 (2º da ordem): Fábio perguntou se saiu — "Vendeu já / Putz vacilei".',
        'Fêmeas da noite (lts 200–229): além do 222, dois lotes a 600–670 com "Liberou" e um cliente do Fábio com limite 450 ("Amanhã coloco ele no game").',
    ],
}
const KAT = {
    key: 'katayama', data: '2026-09-13', nome: 'Leilão Katayama Novo Repartimento — Fêmeas', leiloeira: 'não identificada (não está na agenda pública nem no radar)', praca: 'Novo Repartimento-PA', hora: '—',
    condicao: 'assumido lance × 30 (o Katayama Trilogia de 31/05 usou 40x em lote múltiplo — conferir na listagem)',
    acordo: 'sem acordo cadastrado (não está na aba Acordos com Marcas nem na planilha de setembro); precedente 31/05: 5% da venda da cobertura', acordoFonte: 'bula_leilao_fechamento 2026-05-31 (acordo_pct_venda_cobertura 0,05)',
    cronogramaId: (crono ?? []).find(c => /KATAYAMA/i.test(c.nome))?.id, bulaLeilaoId: null,
    planilha: null,
    resumoGrupo: { texto: 'Vendas Katayama: R$87.000,00 (4 fêmeas)', valor: 87000, quando: fonte(/Vendas \*Katayama\*/)?.quando },
    lotes: [
        lote({ data: '2026-09-13', lote: '5', animal: '1 fêmea', parcela: 1010, sexo: 'F', assessor: 'Douglas Bispo', atribuicao: 'por correlação', comprador: 'Leo Buss / Val Buss — Agropecuária Buss', fazenda: 'Agropecuária Buss', cidade: 'Maracajá', uf: 'PA', fonteRe: /Katayama Novo Repartimento/, fonteGrupo: 'Bula Assessoria l Assessores' }),
        lote({ data: '2026-09-13', lote: '4', animal: '1 fêmea', parcela: 700, sexo: 'F', assessor: 'Douglas Bispo', atribuicao: 'por correlação', comprador: 'Leo Buss / Val Buss — Agropecuária Buss', fazenda: 'Agropecuária Buss', cidade: 'Maracajá', uf: 'PA', fonteRe: /Katayama Novo Repartimento/, fonteGrupo: 'Bula Assessoria l Assessores' }),
        lote({ data: '2026-09-13', lote: '7', animal: '1 fêmea', parcela: 660, sexo: 'F', assessor: 'Douglas Bispo', atribuicao: 'por correlação', comprador: 'Leo Buss / Val Buss — Agropecuária Buss', fazenda: 'Agropecuária Buss', cidade: 'Maracajá', uf: 'PA', fonteRe: /Katayama Novo Repartimento/, fonteGrupo: 'Bula Assessoria l Assessores' }),
        lote({ data: '2026-09-13', lote: '3', animal: '1 fêmea', parcela: 530, sexo: 'F', assessor: 'Douglas Bispo', atribuicao: 'por correlação', comprador: 'Leo Buss / Val Buss — Agropecuária Buss', fazenda: 'Agropecuária Buss', cidade: 'Maracajá', uf: 'PA', fonteRe: /Katayama Novo Repartimento/, fonteGrupo: 'Bula Assessoria l Assessores' }),
    ],
    atribuicaoNota: 'A mensagem (grupo Assessores, 13/09 17:11; autor não capturado pelo sistema) não diz "foi com". Atribuída ao Douglas por correlação: Novo Repartimento-PA é praça dele (13 fichas de jul–ago/2026, todas dele); em 11/08 ele escreveu "estou só olhando o gado da Katayama aqui para mandar para um cliente"; Gessivaldo Buss (PA, DDD 94) já é cliente no HastaPro. Confirmar com ele antes de gerar título.',
    naoVendas: [],
}
const LEILOES = [AZ, EAO, KAT]
for (const L of LEILOES) {
    L.totais = { lotes: L.lotes.length, animais: sum(L.lotes, l => l.qtd), vgv: sum(L.lotes, l => l.vgv), comissao: sum(L.lotes, l => l.comissao) }
    L.confereComGrupo = L.totais.vgv === L.resumoGrupo.valor
    L.porAssessor = Object.values(L.lotes.reduce((acc, l) => { const a = acc[l.comissaoDe] ||= { nome: l.comissaoDe, lotes: 0, vgv: 0, comissao: 0, pct: l.pct }; a.lotes++; a.vgv = r2(a.vgv + l.vgv); a.comissao = r2(a.comissao + l.comissao); return acc }, {})).sort((a, b) => b.vgv - a.vgv)
}
AZ.receita = { certa: r2(AZ.totais.vgv * 0.03), certaDescr: '3% da venda (R$ 158.000)', variavel: '0,5% do faturamento do leilão — a apurar com a Ricardo Nicolau', variavelSobrePrevisao: r2((AZ.planilha?.previsaoFat || 0) * 0.005) }
EAO.receita = { certa: null, variavel: '0,33% do faturamento total do 7º Mega Premium (3 dias) — a apurar com a Programa/EAO após 15/09', variavelSobrePrevisao: r2((EAO.planilha?.previsaoFat || 0) * 0.0033) }
KAT.receita = { certa: null, variavel: 'sem acordo cadastrado; pelo precedente de 31/05 (5% da venda) seriam R$ ' + (KAT.totais.vgv * 0.05).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), variavelSobrePrevisao: r2(KAT.totais.vgv * 0.05) }

/* ── o que fica FORA do fechamento (e por quê) ─────────────────────────── */
const lt96 = fonte(/Levamos lt 96 - 1F - 700/, 'Bula Assessoria l Assessores')
const lt105 = vendaDb('2026-09-13', '105')
const lt38dup = vendaDb('2026-09-14', '38')
const fantasma = (fechDb ?? []).find(f => f.data === '2026-09-14')
const visual = (await sb.from('whatsapp_messages').select('created_at, body, reason').ilike('body', '%VENDA SHOPPING NELORE VISUAL%').order('created_at').limit(1)).data?.[0]
const foraDoFechamento = [
    { item: 'lt 96 — 1 fêmea — parcela 700 (VGV 21.000 se ×30)', quando: lt96?.quando, grupo: lt96?.grupo, autor: lt96?.autor || 'Douglas Bispo', texto: lt96?.texto,
        situacao: 'LEILÃO NÃO IDENTIFICADO', porque: 'Não é o Nelore AZ (catálogo só tem touros: lotes 1–70, 1000, 2023 e 2026) e não entrou no resumo do Financeiro (AZ 158.000 · Katayama 87.000). Comprador Welton Borges de Miranda / Gustavo Miranda (Nelore Itajaí, "Parazão") com direcionamento técnico do Gustavo Rusa — comissão de 5% do Rusa, o Douglas não recebe os 2%. Perguntar ao Douglas de qual pregão é (hipótese: Katayama em 12/09, se o pregão teve dois dias).' },
    { item: 'lt 105 — EXPRESSIVO FIV EAO — 1.300 (VGV 39.000)', quando: brt(lt105?.msg_ts), grupo: 'Lances Bula Assessoria', autor: 'Max Pereira (gerente comercial)', texto: lt105?.raw_text,
        situacao: 'FALSO POSITIVO — apagar', porque: 'O "Bateu!!!! Lote 105 1300" foi erro de digitação do Max; a disputa seguiu até 1.550 e a Nane liberou. A linha veio da IA (fonte "ia", status revisar) e ainda não contaminou fechamento porque está sem leilão vinculado.', idDb: lt105?.id },
    { item: 'lt 38 — 720 — Fábio — Sra. Edna Bellato (Faz. Novo Mundo, MT)', quando: brt(lt38dup?.msg_ts), grupo: 'Lances Mafra', autor: 'Fábio Omena', texto: lt38dup?.raw_text,
        situacao: 'DUPLICATA — é do Mafra de 06/09', porque: `A mesma ficha já foi postada em 06/09 14:05 no Lances Bula (venda ${lt38mafra?.id}) e tem fechamento próprio ("${fechMafra?.nome}", R$ ${Number(fechMafra?.vgv_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}). Em 14/09 09:26 o Fábio a repostou no grupo Lances Mafra para cobrar o CPD ("pessoal ainda não entrou em contato com minha cliente"); o parser datou 14/09 e criou o fechamento fantasma "${fantasma?.nome}" (${fantasma?.id}).`, idDb: lt38dup?.id, fechamentoFantasmaId: fantasma?.id },
    { item: 'Shopping Nelore Visual — VIS4819 — R$ 17.800 (12× 1.480) — Marcelo Carneiro — Nivaldo Alves Ferreira Neto (Santa Helena de Minas-MG)', quando: brt(visual?.created_at), grupo: 'Lances Bula Assessoria', autor: 'Marcelo Carneiro', texto: visual?.body,
        situacao: 'VENDA DE 09/09 (fora da janela) — sem registro no sistema', porque: 'O Shopping (venda direta, preço fixo, sem comissão de leilão) esteve aberto até 12/09; a única venda anunciada é de 09/09 e o parser não lê o formato "VENDA SHOPPING". Não há fechamento. Na planilha o Shopping está em 17/09 com acordo 5% da venda (R$ 890). Marcelo Carneiro está inativo na folha — decidir quem recebe.' },
]

/* ── por assessor (só o que entra) ─────────────────────────────────────── */
const todos = LEILOES.flatMap(L => L.lotes.map(l => ({ ...l, leilao: L.nome, key: L.key })))
const porAssessor = Object.values(todos.reduce((acc, l) => {
    const a = acc[l.comissaoDe] ||= { nome: l.comissaoDe, pct: l.pct, lotes: 0, animais: 0, vgv: 0, comissao: 0, leiloes: {} }
    a.lotes++; a.animais += l.qtd; a.vgv = r2(a.vgv + l.vgv); a.comissao = r2(a.comissao + l.comissao)
    const e = a.leiloes[l.key] ||= { lotes: 0, vgv: 0 }; e.lotes++; e.vgv = r2(e.vgv + l.vgv)
    return acc
}, {})).sort((a, b) => b.vgv - a.vgv)
for (const a of porAssessor) a.pagamento = /nane/i.test(a.nome) ? 'diferida — vence 28/12 (acumulado da Nane)' : (/douglas/i.test(a.nome) && KAT.lotes.length ? `CP · ciclo 25/10 (dos quais R$ ${KAT.totais.comissao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} do Katayama a confirmar)` : 'CP · ciclo 25/10')

/* ── correções no sistema + pendências ─────────────────────────────────── */
const capturadas = (vendasDb ?? []).map(v => ({ id: v.id, data: v.leilao_data, lote: v.lote, parcela: v.valor, assessor: v.assessor, comprador: v.comprador, status: v.status, fonte: v.fonte, cronograma_id: v.cronograma_id, grupo: GRUPOS[v.group_jid] || v.group_jid, quando: brt(v.msg_ts) }))
const correcoes = [
    { n: 1, o: 'Apagar o fechamento fantasma "MATRIZES E BEZERRAS" de 14/09 e a venda duplicada do lt 38 de 14/09', ids: [fantasma?.id, lt38dup?.id].filter(Boolean).join(' · '), por: 'É o lt 38 do Touros Premium Nelore Mafra (06/09), que já tem venda e fechamento próprios. Se ficar, o VGV de 21.600 e a comissão de 432 do Fábio contam duas vezes e o EAO Fêmeas de 14/09 nasce com lote errado.' },
    { n: 2, o: 'Apagar (ou marcar como não-venda) o lt 105 de 13/09', ids: lt105?.id, por: 'Falso positivo da IA — a Nane não levou o lote.' },
    { n: 3, o: 'Vincular as 4 vendas de 12/09 ao cronograma "REPRODUTORES NELORE AZ" e as 12 de 13/09 ao "TOUROS E MATRIZES EAO" (Ferramentas → Lances do Pregão → vincular leilão) e clicar "Importar pro fechamento"', ids: `AZ ${AZ.cronogramaId} · EAO ${EAO.cronogramaId}`, por: 'Todas estão como "revisar" sem leilão porque havia dois pregões no mesmo dia — por isso nenhum fechamento foi gerado. ⚠ O rebuild faz parcela × 30 em tudo: o lt 2023 (40x = 92.000) tem de ser ajustado à mão depois, ou aguardar o HastaPro.' },
    { n: 4, o: 'Corrigir os campos parseados antes de importar', ids: [vendaDb('2026-09-13', '52')?.id, vendaDb('2026-09-13', '222')?.id, vendaDb('2026-09-12', '11')?.id].filter(Boolean).join(' · '), por: 'lt 52: assessor "Nane - Bula - Marcos Rodrigo Capuci" → Nane; comprador Marcos Rodrigo Capuci. lt 222: "Marcelo e Leonardo" → Leonardo Serafim (dupla extinta). lts 11/43/44: "Leo" → Leonardo Serafim; fazenda e cidade vieram trocadas ("faz Ana Amalia - Marcelandia MT" caiu em cidade).' },
    { n: 5, o: 'Criar o Katayama Novo Repartimento (13/09) — só existe no cronograma, sem card em bula_leiloes e sem venda capturada', ids: KAT.cronogramaId, por: '4 fêmeas / R$ 87.000 vieram por mensagem no grupo Assessores, fora do grupo de lances. Assessor a confirmar (provável Douglas).' },
    { n: 6, o: 'Registrar o lt 96 (12/09) quando o Douglas disser o pregão', ids: '—', por: 'Comissão de 5% do Rusa (Itajaí/Parazão está na lista de direcionamento).' },
    { n: 7, o: 'Lançar no HastaPro (FIL 2): AZ 12/09, EAO 13/09 e Katayama 13/09 — e rodar o importador canônico', ids: 'scripts/importa-fechamento-hastapro.mts', por: `O HastaPro não tem NADA de setembro na FIL 2 (último pregão lançado: ${hastapro.ultimoFil2.slice(8, 10)}/${hastapro.ultimoFil2.slice(5, 7)}). Até lá, o grupo de lances é a única fonte — e é auditável só depois do cruzamento lote a lote.` },
]
const pendencias = [
    { p: 'lt 2023 do AZ: 30 ou 40 parcelas?', impacto: 'R$ 23.000 de VGV (92.000 × 69.000) e R$ 460 de comissão do Fábio', quem: 'Fábio / listagem da Ricardo Nicolau' },
    { p: 'Katayama: quem vendeu as 4 fêmeas e em quantas parcelas?', impacto: 'R$ 1.740 de comissão (2%) e o próprio acordo com a marca', quem: 'Douglas' },
    { p: 'lt 96 (12/09, Welton Miranda / Itajaí): de qual leilão é?', impacto: 'R$ 21.000 de VGV fora de qualquer fechamento; 5% do Rusa (R$ 1.050)', quem: 'Douglas' },
    { p: 'lt 19 do EAO: cadastro "não autorizado" na Programa em 11/09 e venda "à vista dia 20/09"', impacto: 'R$ 24.000 de VGV e R$ 480 do Fábio caem se o pagamento não entrar', quem: 'Fábio / Programa' },
    { p: 'Faturamento total do AZ (0,5%) e do 7º Mega Premium EAO (0,33%)', impacto: 'a receita dos dois pregões; sobre a previsão da planilha seriam R$ ' + (AZ.receita.variavelSobrePrevisao + EAO.receita.variavelSobrePrevisao).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), quem: 'Ricardo Nicolau / Programa' },
    { p: 'Shopping Nelore Visual: a venda de 09/09 (R$ 17.800) não está em lugar nenhum', impacto: 'R$ 890 de receita (5%); comissão do Marcelo a decidir', quem: 'Marcelo Carneiro / João' },
]

const D = {
    geradoEm: new Date().toISOString(), janela: { ini: '2026-09-11', fim: '2026-09-13' },
    leiloes: LEILOES, porAssessor, foraDoFechamento, correcoes, pendencias, capturadas, fechamentosExistentes: fechDb ?? [],
    agenda: (agenda ?? []).map(a => ({ data: a.data, nome: a.nome, hora: a.horario, leiloeira: a.leiloeira, status: a.status, acordo: a.acordo_comissao })),
    cronograma: (crono ?? []).map(c => ({ data: c.data, nome: c.nome, hora: c.hora, leiloeira: c.leiloeira, criador: c.criador })),
    hastapro, planilha: { arquivo: planilha.arquivo, linhas: planilha.linhas, acordos: planilha.acordos },
    setembroAntes: { vendasSemVinculo: (vendasSet ?? []).filter(v => !v.cronograma_id).length, dias: [...new Set((vendasSet ?? []).map(v => v.leilao_data))].sort() },
    totais: { lotes: sum(LEILOES, L => L.totais.lotes), animais: sum(LEILOES, L => L.totais.animais), vgv: sum(LEILOES, L => L.totais.vgv), comissao: sum(LEILOES, L => L.totais.comissao), resumoGrupo: sum(LEILOES, L => L.resumoGrupo.valor) },
}
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(D, null, 2))

/* ── checagens que precisam passar ─────────────────────────────────────── */
const falhas = []
for (const L of LEILOES) {
    if (!L.confereComGrupo) falhas.push(`${L.key}: VGV ${L.totais.vgv} ≠ resumo do grupo ${L.resumoGrupo.valor}`)
    for (const l of L.lotes) {
        if (l.fonteRe && !l.fichaQuando) falhas.push(`${L.key} lt ${l.lote}: ficha não encontrada nas mensagens`)
        if (l.noSistema && l.bateComDb === false) falhas.push(`${L.key} lt ${l.lote}: parcela ${l.parcela} ≠ banco ${l.noSistema.valorDb}`)
        if (L.key !== 'katayama' && !l.noSistema) falhas.push(`${L.key} lt ${l.lote}: não está em bula_leilao_vendas`)
    }
}
if (!lt105) falhas.push('lt 105 não encontrado no banco (já apagado?)')
if (!lt38dup) falhas.push('lt 38 de 14/09 não encontrado no banco (já apagado?)')
if (falhas.length) { console.warn('⚠ CHECAGENS:'); for (const f of falhas) console.warn('  -', f) } else console.log('checagens OK: 3 pregões batem com o resumo do grupo, todas as fichas localizadas, parcelas iguais ao banco')

/* ── XLSX ───────────────────────────────────────────────────────────────── */
const wb = XLSX.utils.book_new()
const aoa = (name, rows, widths) => { const ws = XLSX.utils.aoa_to_sheet(rows); if (widths) ws['!cols'] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name) }
aoa('Resumo', [
    ['CONFERÊNCIA — LEILÕES DE 11 A 13/09/2026', '', '', '', '', `gerado em ${new Date().toLocaleString('pt-BR')}`],
    [],
    ['Leilão', 'Data', 'Leiloeira', 'Lotes', 'Cabeças', 'VGV (R$)', 'Comissão equipe (R$)', 'Resumo do grupo (R$)', 'Confere', 'Acordo', 'No HastaPro?', 'Fechamento no ERP?'],
    ...LEILOES.map(L => [L.nome, L.data, L.leiloeira, L.totais.lotes, L.totais.animais, L.totais.vgv, L.totais.comissao, L.resumoGrupo.valor, L.confereComGrupo ? 'sim' : 'NÃO', L.acordo, 'não', 'não']),
    ['TOTAL', '', '', D.totais.lotes, D.totais.animais, D.totais.vgv, D.totais.comissao, D.totais.resumoGrupo, D.totais.vgv === D.totais.resumoGrupo ? 'sim' : 'NÃO'],
    [],
    ['Fora do fechamento (ver aba)', '', '', '', '', '', '', '', '', '', '', ''],
    ...foraDoFechamento.map(f => [f.item, f.quando, f.grupo, '', '', '', '', '', f.situacao]),
    [],
    ['11/09 (sexta): nenhum pregão com venda da equipe — só a live de abertura do EAO (19h) e o prazo do Shopping Visual.'],
    [`HastaPro: último pregão lançado na FIL 2 = ${hastapro.ultimoFil2}; setembro inteiro ainda não está lá (05/09 tem ${D.setembroAntes.vendasSemVinculo} fichas sem vínculo no ERP; 06/09 Mafra só 1 lote).`],
    [`10/09 (quinta) — Só Criador (Bula Remates, gado comercial, R$ ${hastapro.soCriador.vgv}): Laila na pista em ${hastapro.soCriador.laila.lotes.length} lotes (R$ ${hastapro.soCriador.laila.vgv}) PELA REMATES — não é cobertura da Assessoria.`],
], [58, 12, 34, 8, 9, 14, 18, 18, 9, 44, 12, 16])
aoa('Lotes', [
    ['Leilão', 'Data', 'Lote', 'Animal', 'Sexo', 'Qtd', 'Parcela (R$)', 'Parcelas', 'VGV (R$)', 'Vendeu (ficha)', 'Comissão de', '%', 'Comissão (R$)', 'Comprador', 'Fazenda', 'Cidade', 'UF', 'Ficha (hora BRT)', 'Grupo', 'Postou', 'No sistema (status)', 'Observação'],
    ...todos.map(l => [l.leilao, l.data, l.lote, l.animal, l.sexo, l.qtd, l.parcela, l.parcelas, l.vgv, l.assessor + (l.atribuicao ? ` (${l.atribuicao})` : ''), l.comissaoDe, l.pct, l.comissao, l.comprador, l.fazenda || '', l.cidade || '', l.uf || '', l.fichaQuando || '', l.fichaGrupo || '', l.fichaAutor || '', l.noSistema ? `${l.noSistema.status}${l.noSistema.cronograma_id ? '' : ' · sem leilão'}` : 'não capturada', l.obs || '']),
    ['TOTAL', '', '', '', '', D.totais.animais, '', '', D.totais.vgv, '', '', '', D.totais.comissao],
], [40, 11, 6, 40, 5, 5, 12, 9, 12, 20, 18, 6, 12, 32, 26, 16, 4, 14, 26, 22, 20, 80])
aoa('Por assessor', [
    ['Assessor', '%', 'Lotes', 'Cabeças', 'VGV (R$)', 'Comissão (R$)', 'AZ (R$)', 'EAO (R$)', 'Katayama (R$)', 'Pagamento'],
    ...porAssessor.map(a => [a.nome, a.pct, a.lotes, a.animais, a.vgv, a.comissao, a.leiloes.az?.vgv || 0, a.leiloes.eao?.vgv || 0, a.leiloes.katayama?.vgv || 0, a.pagamento]),
    ['TOTAL', '', D.totais.lotes, D.totais.animais, D.totais.vgv, D.totais.comissao],
], [22, 6, 7, 8, 14, 14, 12, 12, 14, 60])
aoa('Fora do fechamento', [['Item', 'Quando', 'Grupo', 'Postou', 'Situação', 'Por quê', 'Id no banco', 'Texto da mensagem'],
    ...foraDoFechamento.map(f => [f.item, f.quando, f.grupo, f.autor, f.situacao, f.porque, f.idDb || '', f.texto || ''])], [50, 12, 26, 20, 30, 90, 38, 60])
aoa('Correções no sistema', [['#', 'O que fazer', 'Ids', 'Por quê'], ...correcoes.map(c => [c.n, c.o, c.ids, c.por])], [4, 80, 60, 90])
aoa('Pendências', [['Pendência', 'Impacto', 'Com quem'], ...pendencias.map(p => [p.p, p.impacto, p.quem])], [70, 70, 30])
aoa('Capturado pelo parser', [['Id', 'Data', 'Lote', 'Parcela', 'Assessor (parseado)', 'Comprador (parseado)', 'Status', 'Fonte', 'Leilão vinculado', 'Grupo', 'Hora'],
    ...capturadas.map(c => [c.id, c.data, c.lote, c.parcela, c.assessor, c.comprador, c.status, c.fonte, c.cronograma_id || '—', c.grupo, c.quando])], [38, 11, 6, 9, 34, 40, 9, 8, 38, 24, 12])
aoa('Planilha do chefe', [['Dia', 'Leilão', 'Leiloeira', 'Previsão faturamento', 'Meta venda', 'Meta comissão', '% venda', '% fat.'],
    ...planilha.linhas.map(l => [l.dia, l.leilao, l.leiloeira, l.previsaoFat, l.metaVenda, l.metaComissao, l.pctVenda, l.pctFat]), [], ['Acordos com Marcas'], ...Object.entries(planilha.acordos).map(([k, v]) => [k, v])], [6, 50, 18, 18, 14, 14, 8, 8])
const xlsxPath = path.join(DESK, 'Bula - Fechamento Leiloes 11 a 13-09-2026 - Dados.xlsx')
XLSX.writeFile(wb, path.join(OUT, 'dados.xlsx'))
try { fs.copyFileSync(path.join(OUT, 'dados.xlsx'), xlsxPath) } catch (e) { console.warn(`⚠ não consegui gravar o XLSX na Área de Trabalho (${e.code}) — está aberto no Excel? Cópia em ${path.join(OUT, 'dados.xlsx')}`) }
console.log('dados →', path.join(OUT, 'dados.json'))
console.log('xlsx  →', xlsxPath)
console.log(`VGV ${D.totais.vgv} em ${D.totais.lotes} lotes · comissão ${D.totais.comissao} · resumo do grupo ${D.totais.resumoGrupo}`)
