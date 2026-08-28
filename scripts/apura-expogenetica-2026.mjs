/**
 * APURAÇÃO DA EXPOGENÉTICA 2026 — base única do relatório do chefe.
 *
 * Pedido (grupo, 26/08): vendas por assessor · comissão paga por assessor ·
 * faturamento por leilão · comissão recebida por leilão · comissão paga por leilão
 * · DRE (faturamento − imposto 18% − comissões − transporte − estadia − alimentação).
 *
 * DECISÕES DE FONTE (o que faz este número ser confiável):
 *
 * 1. A VENDA vem do HASTAPRO FIL 2, lote a lote — não dos fechamentos do ERP.
 *    Motivo: os fechamentos de origem `lances-auto` são parseados do grupo de
 *    WhatsApp, que NÃO separa pregões do mesmo dia. Isso duplicou R$ 84.000 (o
 *    lote 09 do CEN & Fazenda Modelo virou um fechamento "Paranã e Casabranca"),
 *    inflou o Naviraí de Matrizes em R$ 33.000 e o 28º em R$ 7.500 — e deixou o
 *    6º Excelência Genética (R$ 105.000) fora do relatório inteiro.
 *
 * 2. Os dois pregões que o HastaPro NÃO tem (KatiSpera 17/08 e Fêmeas JMP 21/08)
 *    entram pelo grupo, marcados — o KatiSpera já tem cobrança emitida.
 *
 * 3. A COMISSÃO segue o COMPRADOR, não quem estava na pista: lote de comprador
 *    direcionado pelo Gustavo Rusa paga 5% a ele e 0% ao assessor
 *    (src/lib/parceiro-direcionamento.ts). O LOT_PISTEIRO do HastaPro só diz quem
 *    anunciou.
 *
 * 4. A RECEITA usa a cobrança do ERP quando existe. Onde não existe, aplica o %
 *    efetivo que AQUELE criador pagou em 2026; sem histórico, 5% — a mediana das
 *    98 cobranças de 2026 (e o valor exato de 26 delas).
 *
 * Uso: node scripts/apura-expogenetica-2026.mjs [--json <saida>]
 */
import fs from 'node:fs'
import Firebird from 'node-firebird'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
  let v = m[2].trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
  if (!(m[1] in process.env)) process.env[m[1]] = v
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })
const fbOpts = { host: process.env.HASTAPRO_HOST, port: +process.env.HASTAPRO_PORT,
  database: process.env.HASTAPRO_DATABASE, user: process.env.HASTAPRO_USER,
  password: process.env.HASTAPRO_PASSWORD, lowercase_keys: false }
const fb = (sql, p = []) => new Promise((res, rej) =>
  Firebird.attach(fbOpts, (e, db) => e ? rej(e) : db.query(sql, p, (e2, r) => { db.detach(); e2 ? rej(e2) : res(r) })))
const str = v => (Buffer.isBuffer(v) ? v.toString('latin1') : v == null ? '' : String(v))
const iso = d => d ? new Date(d).toISOString().slice(0, 10) : ''
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const chave = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

/* ══════════ PARÂMETROS E PREMISSAS ═════════════════════════════════════════ */
export const P = {
  aliquota: 0.18,
  pctPadrao: 0.05,        // mediana das 98 cobranças de 2026 (26 delas são exatamente 5,00%)
  // Custos definidos pelo Marcelo no grupo Financeiro:
  //   26/08 18:19 — "Estadia não foi 8.000?"
  //   27/08 21:06 — "Reembolso da equipe é menor, pode considerar 5.000"
  casaTotal: 8000,        // ERP tem 2.000 pagos; saldo de 6.000 a lançar
  casaExpozebu: 7000,     // benchmark: mesma cidade, mesmo formato, abr/mai 2026
  alimentacao: 5000,      // reembolso da equipe — valor definido pelo Marcelo em 27/08
  alimentacaoMin: 4000, alimentacaoMax: 9000,
}

/** Percentual de comissão por assessor. Folha do ERP + decisão do grupo de 05/08. */
const PCT_ASSESSOR = {
  'Douglas Bispo': 0.02, 'Fábio Omena': 0.02, 'Leonardo Serafim': 0.02,
  'Nane': 0.02, 'Peralta': 0.02, 'Bulinha (Felipe Andrade)': 0.02,
  'Gustavo Rusa': 0.05, 'Laila': 0.01, 'Lucas Martins': 0.01,
}
/** LOT_PISTEIRO (PRESTADORES do HastaPro) → nome canônico. */
const PISTEIRO = {
  '251002191112765': 'Fábio Omena', '251122122024148': 'Douglas Bispo',
  '251031200406473': 'Leonardo Serafim', '260707195925645': 'Nane',
  '250930184945119': 'Peralta', '251001161557564': 'Lucas Martins',
  '250930183027880': 'Bulinha (Felipe Andrade)', '250930182057885': 'Laila',
  '251012115159815': 'Gustavo Rusa', '260422192032168': 'Marcelo Moura',
}
/** Compradores direcionados pelo Gustavo Rusa — a comissão do lote é dele, a 5%. */
const RUSA = [
  { nome: 'José Fábio (Nelore Pérola)', re: /JOSE\s+FABIO|NELORE\s+PEROLA/ },
  { nome: 'Dr. Celso Lopes (Flor de Minas)', re: /CELSO\s+LOPES|FLOR\s+DE\s+MINAS|GRAO\s*PARA/, exc: /CELSO\s+CAMARGO|CHAVES\s+GAIOTTO/ },
  { nome: 'Pedro Pontes (São Caetano)', re: /PEDRO\s+PONTES|SAO\s+CAETANO/ },
  { nome: 'Diego Benitah Batista', re: /BENITAH|PARAISO\s+DO\s+ACARA|NELORE\s+FPA/ },
  { nome: 'Anésio Santarém', re: /ANESIO|CORREGO\s+DA\s+ONCA/ },
  { nome: 'Alfredo José Cardoso (Galopeira)', re: /ALFREDO\s+JOSE\s+CARDOSO|GALOPEIRA/ },
  { nome: 'Itajaí / Parazão', re: /WELTON\s+BORGES|GUSTAVO\s+MIRANDA|ITAJAI|PARAZAO/, exc: /WELTON\s+COSTA/ },
]
const direcionadoPor = (comprador, fazenda, uf) => {
  const alvo = chave(`${comprador} ${fazenda} ${uf}`)
  for (const c of RUSA) { if (c.exc && c.exc.test(alvo)) continue; if (c.re.test(alvo)) return c.nome }
  return null
}

/**
 * Pregões da feira (10 a 23/08). `hp` = nome no HastaPro.
 * `ord` = número na AGENDA OFICIALIZADA da ABCZ (PDF de 17/08, 32 leilões + 7 shoppings,
 * R$ 121 mi movimentados). `ord: null` = a equipe operou no período mas o pregão não
 * integra a agenda oficial — some no subtotal "fora da agenda oficial".
 */
const FEIRA = [
  { data: '2026-08-10', nome: '1º Guadalupe Agropecuária Expogenética', hp: null, ord: 1, fatPregao: 1519500 },
  { data: '2026-08-12', nome: 'Elo de Prova', hp: null, ord: 3, fatPregao: 2622000 },
  { data: '2026-08-14', nome: 'Mega Genética EAO (EAO Expogenética)', hp: null, ord: 5, fatPregao: 4742800 },
  { data: '2026-08-15', nome: 'Terra Brava Agropecuária', hp: 'TERRA BRAVA AGROPECU', ord: 7, fatPregao: 1248600, pctHist: 0.1119,
    pctNota: 'cobrança emitida no ERP em 18/08; os 11,19% NÃO são acordo desta edição — vieram herdados do fechamento de junho',
    alerta: 'tabelaPerformance' },
  { data: '2026-08-15', nome: 'Shopping Naviraí Expogenética', hp: 'SHOPPING NAVIRAI', ord: null, pctHist: 0.05, pctNota: 'Naviraí pagou 5,00% em 05/07 e 16/07' },
  { data: '2026-08-16', nome: 'Matinha Expogenética 2026', hp: 'MATINHA EXPOGEN', ord: 9, fatPregao: 7375000, pctHist: 0.05, pctNota: 'Matinha pagou 5,00% em 28/04, 05/05 e 17/05' },
  { data: '2026-08-16', nome: 'Fazenda Araras e Convidados', hp: 'FAZENDA ARARAS', ord: 10, fatPregao: 1271400, pctHist: 0.03,
    pctNota: 'acordo de 3% da venda — Marcelo, grupo Financeiro 26/08 12:51 ("Acordo Araras: 3% da venda")' },
  { data: '2026-08-17', nome: 'Matrizes Premium KatiSpera', hp: null, soGrupo: 'KATISPERA', ord: 12, fatPregao: 2496000 },
  { data: '2026-08-18', nome: 'Agronova, Nelore Mafra & Amigos', hp: null, ord: 13, fatPregao: 3233000 },
  { data: '2026-08-18', nome: '13º Genética Provada HoRa', hp: 'NELORE HORA', ord: 14, fatPregao: 1234500, pctHist: 0.04,
    pctNota: 'acordo de 4% da venda — Marcelo, grupo Financeiro 26/08 12:51 ("Acordo HORA: 4% da venda")' },
  { data: '2026-08-19', nome: '9º Genética Aditiva Expogenética', hp: 'GENETICA ADITIVA', ord: 16, fatPregao: 5214000,
    pctFat: 0.00426, pctNota: 'acordo da Genética Aditiva é 0,35–0,5% do FATURAMENTO TOTAL: sobre os R$ 5.214.000 do pregão dá de R$ 18.249 a R$ 26.070' },
  { data: '2026-08-19', nome: 'Reserva Expogenética Santa Nice', hp: 'SANTA NICE', ord: 18, fatPregao: 4131000, pctHist: 0.05,
    pctNota: 'acordo de 5% — Marcelo, 27/08 21:06 ("Por que Santa Nice é 5.7? Acordo e 5"); o ERP vinha usando os 5,70% pagos em 06/06' },
  { data: '2026-08-20', nome: 'Top Cen Expogenética (CEN & Fz. Modelo)', hp: 'CEN & FAZENDA MODELO', ord: 21, fatPregao: 1416000, pctHist: 0.03,
    pctNota: 'acordo de 3% — Marcelo, 27/08 21:06 ("Fazenda modelo 3%"); o ERP vinha usando os 3,85% pagos em 23/06' },
  { data: '2026-08-20', nome: 'Baby de Prova — Acelerar Gerações', hp: 'BABY DE PROVA', ord: null, obs: 'realizado em Delta/MG, fora da feira' },
  { data: '2026-08-21', nome: '12º Noite Nacional Matrizes Premium', hp: 'NOITE NACIONAL', ord: 26, fatPregao: 1996500, pctHist: 0.03,
    pctNota: 'acordo de 3% — Marcelo, 27/08 21:06 ("Nacional premium e pepitas é 3%")' },
  { data: '2026-08-22', nome: 'Naviraí Camparino Essência', hp: 'NAVIRAI CAMPARINO - MATRIZES', ord: 30, fatPregao: 3768000, pctHist: 0.05, pctNota: 'Naviraí pagou 5,00% em 05/07 e 16/07' },
  { data: '2026-08-22', nome: '4º Pepitas Colonial e Convidados', hp: 'PEPITAS COLONIAL', ord: 28, fatPregao: 2229000, pctHist: 0.03,
    pctNota: 'acordo de 3% — Marcelo, 27/08 21:06 ("Nacional premium e pepitas é 3%")' },
  { data: '2026-08-23', nome: '28º Naviraí Camparino', hp: 'NAVIRAI CAMPARINO - REPRODUTORES', ord: 31, fatPregao: 4185000, pctHist: 0.05, pctNota: 'Naviraí pagou 5,00% em 05/07 e 16/07' },
  { data: '2026-08-23', nome: 'Nelore Marcondes — Abertura', hp: 'NELORE MARCONDES', ord: null },
  { data: '2026-08-23', nome: '6º Excelência Genética', hp: 'EXCELENCIA GENETICA', ord: 32, fatPregao: 3602000 },
]
/** Agenda oficializada pela ABCZ (PDF de 17/08) e resultado apurado da feira. */
export const FEIRA_ABCZ = { leiloes: 32, shoppings: 7, faturamento: 114868100, edicao: '19ª' }

/** Pregões que saíram do universo — ficam no relatório como nota, fora de toda soma. */
export const EXCLUIDOS = [
  { data: '2026-08-21', nome: 'Fêmeas JMP', venda: 41400, comissao: 828,
    motivo: 'Existia só no parser do grupo de lances. Não está no HastaPro, não está no consolidado do '
      + 'HastaPro de 27/08 e não está na agenda da ABCZ. O valor é idêntico ao do lote 48 do Shopping '
      + 'Naviraí (mesmo assessor): é o mesmo lote contado duas vezes. Excluído por decisão do João em 28/08.' },
]

/**
 * Comissão que a Bula PAGA mas não desembolsa no ciclo de 25/09.
 * A Nane não entra no ciclo mensal: acumula e é paga de uma vez em 28/12 (decisão do João, 11/08).
 * É a leitura do "Não paga 2% para Nane" do Marcelo (27/08 21:09) — o custo é da feira, o caixa é de dezembro.
 */
const DIFERIDO = { 'Nane': { vencimento: '2026-12-28', nota: 'acumula e é paga de uma vez em 28/12 — não sai no ciclo de 25/09' } }

/**
 * Relatório de Nota Fiscal da Prefeitura de Campo Grande (NFS-e), emitido em 27/08/2026:
 * tudo que a BULA ASSESSORIA PECUÁRIA faturou entre 01/08 e 27/08. É a fonte primária do que
 * virou nota — vence qualquer estimativa de receita.
 */
export const NFS_AGOSTO = {
  emitidoEm: '27/08/2026', total: 96335.08, quantidade: 9,
  notas: [
    { nf: 626, emissao: '04/08', valor: 6756.00, refere: 'leilão de julho' },
    { nf: 628, emissao: '20/08', valor: 21425.90, refere: 'Guadalupe — 3 dias de pregão (julho)' },
    { nf: 629, emissao: '20/08', valor: 19810.50, refere: 'leilão de julho' },
    { nf: 630, emissao: '21/08', valor: 2411.25, refere: 'Naviraí etapas 1 e 2 (julho)' },
    { nf: 631, emissao: '21/08', valor: 8490.00, refere: 'Naviraí (julho)' },
    { nf: 632, emissao: '21/08', valor: 7473.00, refere: 'Naviraí (julho)' },
    { nf: 634, emissao: '24/08', valor: 4536.00, refere: 'Nelore Sorriso (julho)' },
    { nf: 635, emissao: '25/08', valor: 7149.98, refere: 'Nelore Sorriso 12/07' },
    { nf: 636, emissao: '25/08', valor: 18282.45, refere: '23º Genética Aditiva, etapas 1 e 2 (25 e 26/07)' },
  ],
  daFeira: 0,
}

/**
 * Terceira fonte, independente do HastaPro lido aqui e dos replays: o consolidado de vendas
 * que o Matheus (M1) publicou no grupo Financeiro em 27/08 12:38, extraído do painel do HastaPro.
 * Serve para conferir a venda pregão a pregão com o número que o próprio time usa.
 */
const CONSOLIDADO_M1 = {
  fonte: 'consolidado de vendas do HastaPro publicado por Matheus Eberts no grupo Financeiro em 27/08/2026',
  porEvento: { 'TERRA BRAVA AGROPECU': 107100, 'SHOPPING NAVIRAI': 96600, 'FAZENDA ARARAS': 87000,
    'MATINHA EXPOGEN': 460500, 'NELORE HORA': 24000, 'GENETICA ADITIVA': 444000, 'SANTA NICE': 297000,
    'BABY DE PROVA': 73500, 'CEN & FAZENDA MODELO': 117000, 'NOITE NACIONAL': 195000,
    'PEPITAS COLONIAL': 325500, 'NAVIRAI CAMPARINO - MATRIZES': 543000,
    'NAVIRAI CAMPARINO - REPRODUTORES': 940500, 'EXCELENCIA GENETICA': 105000, 'NELORE MARCONDES': 37500 },
}

/**
 * Contraditório: fechamento final da Bula consolidado em 25/08 por fonte externa
 * (ExpoGenetica_2026_Analise_Final_Bula_25-08-2026.xlsx, aba "Vendas Bula"),
 * montado a partir de replays das leiloeiras — independente do HastaPro.
 */
const CONTRA = {
  fonte: 'Análise Final Bula (25/08), aba Vendas Bula — reconstruída de replays das leiloeiras',
  total: 3679200, vendas: 67, eventos: 14,
  porEvento: { 'TERRA BRAVA': 107100, 'SHOPPING NAVIRAI': 96600, 'MATINHA': 460500, 'ARARAS': 87000,
    'NELORE HORA': 24000, 'GENETICA ADITIVA': 444000, 'SANTA NICE': 297000, 'CEN & FAZENDA MODELO': 117000,
    'BABY DE PROVA': 73500, 'NOITE NACIONAL': 195000, 'PEPITAS COLONIAL': 325500,
    'NAVIRAI CAMPARINO - MATRIZES': 543000, 'NAVIRAI CAMPARINO - REPRODUTORES': 871500, 'NELORE MARCONDES': 37500 },
}

/* ══════════ 1. VENDA: HastaPro FIL 2, lote a lote ══════════════════════════ */
const leiloesHp = (await fb(`select LEI_CODIGO, LEI_NOME, LEI_DATA from LEILAO
  where FIL_CODIGO='2' and LEI_DATA between '2026-08-10' and '2026-08-23'`))
  .map(l => ({ cod: str(l.LEI_CODIGO), nome: str(l.LEI_NOME), data: iso(l.LEI_DATA) }))

const lotesDe = async cod => {
  const rows = await fb(`select LOT_LOTE, LOT_QTD, LOT_TOTAL, LOT_PISTEIRO from LOTES
    where LEI_CODIGO=? and FIL_CODIGO='2' and LOT_LANCE>0 order by LOT_ORDEM`, [cod])
  const comps = await fb(`select c.LOT_LOTE, c.COP_PORCENTAGEM, cl.CLI_NOME, cl.CLI_UF, f.FAZ_NOME
    from COMPRADORES c left join CLIENTES cl on cl.CLI_CODIGO=c.CLI_CODIGO
    left join FAZENDAS f on f.FAZ_CODIGO=c.FAZ_CODIGO and f.CLI_CODIGO=c.CLI_CODIGO
    where c.FIL_CODIGO='2' and c.LEI_CODIGO=?`, [cod])
  const cpl = {}
  for (const c of comps) { const k = str(c.LOT_LOTE)
    if (!cpl[k] || Number(c.COP_PORCENTAGEM || 0) > Number(cpl[k].COP_PORCENTAGEM || 0)) cpl[k] = c }
  return rows.map(r => { const c = cpl[str(r.LOT_LOTE)] || {}
    return { lote: str(r.LOT_LOTE), animais: Number(r.LOT_QTD || 1), vgv: Number(r.LOT_TOTAL || 0),
      anunciante: PISTEIRO[str(r.LOT_PISTEIRO)] || `(código ${str(r.LOT_PISTEIRO)})`,
      comprador: str(c.CLI_NOME), fazenda: str(c.FAZ_NOME), uf: str(c.CLI_UF) } })
}

/* ══════════ 2. Fechamentos do ERP (só p/ os pregões fora do HastaPro) ══════ */
const { data: fechs } = await sb.from('bula_leilao_fechamento')
  .select('id,nome,data,vgv_total,lotes_vendidos,por_assessor,lances').gte('data', '2026-08-10').lte('data', '2026-08-23')

/* ══════════ 3. Monta os leilões ════════════════════════════════════════════ */
const leiloes = []
for (const L of FEIRA) {
  let lotes = [], fonte = 'sem venda', fech = null
  if (L.hp) {
    const hp = leiloesHp.find(h => chave(h.nome).includes(chave(L.hp)))
    if (!hp) throw new Error(`leilão não achado no HastaPro: ${L.hp}`)
    lotes = await lotesDe(hp.cod); fonte = 'HastaPro'
  } else if (L.soGrupo) {
    fech = fechs.find(f => chave(f.nome).includes(chave(L.soGrupo)))
    if (!fech) throw new Error(`fechamento não achado: ${L.soGrupo}`)
    fonte = 'grupo de lances'
    for (const a of (fech.por_assessor || [])) {
      const dir = direcionadoPor(a.nome, '', '')
      lotes.push({ lote: '—', animais: Number(a.animais || 1), vgv: Number(a.vgv),
        anunciante: a.nome, comprador: '', fazenda: '', uf: '', viaGrupo: true })
    }
    // o KatiSpera teve o direcionamento do Rusa declarado no grupo em 24/08
    if (L.soGrupo === 'KATISPERA') for (const t of lotes) t.direcionado = 'declarado no grupo (24/08)'
  }
  // aplica direcionamento e resolve a comissão de cada lote
  for (const t of lotes) {
    const dir = t.direcionado ? 'Gustavo Rusa' : (direcionadoPor(t.comprador, t.fazenda, t.uf) ? 'Gustavo Rusa' : null)
    t.quemDirecionou = t.direcionado ? t.direcionado : direcionadoPor(t.comprador, t.fazenda, t.uf)
    t.assessor = dir || (t.anunciante === 'Gustavo Rusa' ? 'Gustavo Rusa' : t.anunciante)
    // Pisteiro fora da folha: provisiona 2% (padrão) e marca — não zerar subestima o custo.
    t.semPct = PCT_ASSESSOR[t.assessor] == null
    t.pct = PCT_ASSESSOR[t.assessor] ?? 0.02
    t.comissao = r2(t.vgv * t.pct)
  }
  const venda = r2(lotes.reduce((s, t) => s + t.vgv, 0))
  leiloes.push({ ...L, fonte, lotes, venda, animais: lotes.reduce((s, t) => s + t.animais, 0),
    comissaoPaga: r2(lotes.reduce((s, t) => s + t.comissao, 0)) })
}

/* ══════════ 4. RECEITA (comissão recebida) ═════════════════════════════════ */
const ids = fechs.map(f => f.id)
const { data: crs } = await sb.from('erp_contas_receber').select('*').in('fechamento_id', ids)
const crDe = frag => (crs || []).find(c => chave(c.descricao).includes(chave(frag)))

for (const L of leiloes) {
  if (!L.venda) { L.receita = 0; L.receitaTipo = 'sem venda'; continue }
  const cr = crDe(L.hp || L.soGrupo || L.nome)
  if (cr) {
    // a cobrança do Matinha foi emitida sobre 547.500; o lote 22 saiu p/ o Araras
    const base = Number(cr.valor)
    const pctCr = Number((cr.observacoes || '').match(/×\s*([\d.,]+)%/)?.[1]?.replace(',', '.')) / 100
    const recalc = pctCr && Math.abs(base / pctCr - L.venda) > 1 ? r2(L.venda * pctCr) : base
    L.receita = recalc; L.receitaTipo = recalc === base ? 'cobrança emitida' : 'cobrança a corrigir'
    L.receitaNota = recalc === base
      ? `cobrança ${cr.status} no ERP, vence ${cr.vencimento?.slice(0, 10)}`
      : `cobrança emitida por ${base.toLocaleString('pt-BR')} sobre venda maior; recalculada a ${(pctCr * 100).toFixed(2)}% da venda conferida`
    L.receitaPct = pctCr || (L.receita / L.venda)
    L.crValor = base; L.crVenc = cr.vencimento?.slice(0, 10); L.crStatus = cr.status
  } else if (L.pctFat) {
    // acordo que cobra sobre o FATURAMENTO do pregão, não sobre a venda da Bula
    L.receita = r2(L.fatPregao * L.pctFat)
    L.receitaPct = L.pctFat; L.receitaBase = 'faturamento'
    L.receitaTipo = 'estimada'
    L.receitaNota = L.pctNota
  } else {
    const pct = L.pctHist ?? P.pctPadrao
    L.receita = r2(L.venda * pct); L.receitaPct = pct
    L.receitaTipo = 'estimada'
    L.receitaNota = L.pctNota ?? 'sem histórico do criador — aplicada a mediana de 2026 (5,00%)'
  }
}

/* ══════════ 4b. MARGEM DE CONTRIBUIÇÃO POR LEILÃO ══════════════════════════
 * Pedido do Marcelo no grupo (26/08 18:22):
 *   "Vendas | comissão recebida | (-) imposto | (-) comissão paga : margem de
 *    contribuição por leilão"
 * Não entram aqui os custos de campo (transporte/estadia/alimentação): eles são
 * da viagem inteira e não se dividem por pregão sem critério de rateio. */
for (const L of leiloes) {
  L.imposto = r2(L.receita * P.aliquota)
  L.margemContrib = r2(L.receita - L.imposto - L.comissaoPaga)
  L.margemPctVenda = L.venda ? L.margemContrib / L.venda : null
}

/* ══════════ 4c. TERRA BRAVA: o percentual que o Marcelo questionou ═════════
 * Pergunta do grupo (27/08 21:06): "Por que Terra Brava deu 11.19%?".
 * Resposta rastreada: a cobrança de 18/08 herdou o percentual do fechamento de JUNHO
 * (NF 615, R$ 7.215 ÷ cobertura de 64.500 de uma etapa só = 11,19%). Não existe acordo
 * de 11,19% para a edição de agosto. Pela tabela padrão de performance, este pregão cai
 * na faixa 5–12,5% e paga 0,5% do faturamento total. */
const tb = leiloes.find(l => /Terra Brava/.test(l.nome))
const TERRA_BRAVA = tb && {
  venda: tb.venda, faturamento: tb.fatPregao,
  performance: tb.venda / tb.fatPregao,
  emitido: tb.receita, pctEmitido: tb.receitaPct,
  faixa: '5% a 12,5% → 0,5% do faturamento',
  tabela: r2(tb.fatPregao * 0.005),
  origemDoPercentual: 'NF 615 de junho (R$ 7.215 = 0,5% × R$ 1.443.000 de faturamento) dividida pela cobertura '
    + 'de UMA etapa (R$ 64.500) — a conta dá 11,19%, que o fechamento de agosto copiou',
}
if (TERRA_BRAVA) TERRA_BRAVA.diferenca = r2(TERRA_BRAVA.emitido - TERRA_BRAVA.tabela)

/* ══════════ 5. POR ASSESSOR ════════════════════════════════════════════════ */
const ass = {}
for (const L of leiloes) for (const t of L.lotes) {
  const k = t.assessor
  ass[k] ||= { nome: k, venda: 0, animais: 0, lotes: 0, comissao: 0, pct: t.pct, pregoes: new Set(), semPct: t.semPct }
  ass[k].venda += t.vgv; ass[k].animais += t.animais; ass[k].lotes++
  ass[k].comissao += t.comissao; ass[k].pregoes.add(L.nome)
}
const assessores = Object.values(ass).map(a => ({ ...a, venda: r2(a.venda), comissao: r2(a.comissao),
  pregoes: a.pregoes.size, diferido: DIFERIDO[a.nome] || null })).sort((x, y) => y.venda - x.venda)

/* ══════════ 6. CUSTOS ══════════════════════════════════════════════════════ */
const { data: cps } = await sb.from('erp_contas_pagar').select('*')
  .gte('vencimento', '2026-08-01').lte('vencimento', '2026-09-30').neq('status', 'cancelado')
const cpDe = frag => (cps || []).find(c => chave(c.descricao).includes(chave(frag)))
const item = (frag, rot, grupo) => { const c = cpDe(frag)
  if (!c) throw new Error(`CP não encontrada: ${frag}`)
  return { grupo, item: rot, valor: Number(c.valor), situacao: c.status === 'pago' ? 'pago' : 'a pagar', fonte: 'ERP · conta a pagar' } }

const custos = [
  item('REEMBOLSO BULA REMATES - REEMISSAO', 'Reemissão de passagens da equipe', 'transporte'),
  item('BILHETE/BOLETO - FABIO OMENA GAIA', 'Passagem aérea — Fábio Omena', 'transporte'),
  item('BILHETE/BOLETO - LEONARDO FRANCISCO', 'Passagem aérea — Leonardo Serafim', 'transporte'),
  item('DESPESAS EXPOGENETICA - CASA/ESTRUTURA', 'Casa em Uberaba — 1ª parcela', 'estadia'),
  { grupo: 'estadia', item: 'Casa em Uberaba — saldo do aluguel', valor: r2(P.casaTotal - 2000),
    situacao: 'a lançar', fonte: `total de R$ ${P.casaTotal.toLocaleString('pt-BR')} confirmado pelo Marcelo em 26/08` },
  { grupo: 'alimentacao', item: 'Reembolso da equipe — alimentação e deslocamento local', valor: P.alimentacao,
    situacao: 'estimado', fonte: 'valor definido pelo Marcelo em 26/08; prestação de contas chega na 1ª semana de setembro' },
  item('ENTRADA UNIFORMES', 'Uniformes da equipe — entrada', 'outros'),
  item('RESTANTE UNIFORMES', 'Uniformes da equipe — saldo', 'outros'),
]
const somaG = g => r2(custos.filter(c => c.grupo === g).reduce((s, c) => s + c.valor, 0))
const C = { transporte: somaG('transporte'), estadia: somaG('estadia'),
  alimentacao: somaG('alimentacao'), outros: somaG('outros') }
C.total = r2(C.transporte + C.estadia + C.alimentacao + C.outros)

/* ══════════ 7. DRE ═════════════════════════════════════════════════════════ */
const T = {
  venda: r2(leiloes.reduce((s, l) => s + l.venda, 0)),
  animais: leiloes.reduce((s, l) => s + l.animais, 0),
  lotes: leiloes.reduce((s, l) => s + l.lotes.length, 0),
  receita: r2(leiloes.reduce((s, l) => s + l.receita, 0)),
  receitaEmitida: r2(leiloes.filter(l => /cobrança/.test(l.receitaTipo)).reduce((s, l) => s + l.receita, 0)),
  receitaEstimada: r2(leiloes.filter(l => /estimada/.test(l.receitaTipo)).reduce((s, l) => s + l.receita, 0)),
  comissao: r2(assessores.reduce((s, a) => s + a.comissao, 0)),
}
const dre = {
  faturamento: T.receita,
  imposto: r2(T.receita * P.aliquota),
}
dre.liquido = r2(dre.faturamento - dre.imposto)
dre.comissoes = T.comissao
dre.transporte = C.transporte; dre.estadia = C.estadia; dre.alimentacao = C.alimentacao; dre.outros = C.outros
dre.lucro = r2(dre.liquido - dre.comissoes - dre.transporte - dre.estadia - dre.alimentacao - dre.outros)
dre.margem = dre.lucro / T.venda
// "Não é lucro líquido, errei. É lucro bruto" — Marcelo, grupo Financeiro 26/08 21:20.
// O resultado da feira não carrega estrutura, folha nem imposto de renda: é bruto.
dre.rotuloResultado = 'Lucro bruto'
// Desembolso real do ciclo: a comissão da Nane só sai em 28/12.
dre.comissoesDiferidas = r2(assessores.filter(a => a.diferido).reduce((s2, a) => s2 + a.comissao, 0))
dre.comissoesNoCiclo = r2(dre.comissoes - dre.comissoesDiferidas)

/* ══════════ 8. Recorte da agenda oficial da ABCZ ═══════════════════════════ */
const of = leiloes.filter(l => l.ord)
const naoOf = leiloes.filter(l => !l.ord && l.venda > 0)
T.oficial = { venda: r2(of.reduce((s, l) => s + l.venda, 0)), receita: r2(of.reduce((s, l) => s + l.receita, 0)),
  comissao: r2(of.reduce((s, l) => s + l.comissaoPaga, 0)), n: of.filter(l => l.venda > 0).length }
T.foraAgenda = { venda: r2(naoOf.reduce((s, l) => s + l.venda, 0)), receita: r2(naoOf.reduce((s, l) => s + l.receita, 0)),
  comissao: r2(naoOf.reduce((s, l) => s + l.comissaoPaga, 0)), n: naoOf.length }
T.participacao = T.oficial.venda / FEIRA_ABCZ.faturamento

/* ══════════ 9. Reconciliação contra a fonte independente ═══════════════════ */
const recon = leiloes.filter(l => l.venda > 0).map(l => {
  const k = Object.keys(CONTRA.porEvento).find(f => chave(l.hp || l.soGrupo || '').includes(chave(f)))
  const externo = k ? CONTRA.porEvento[k] : null
  return { nome: l.nome, apurado: l.venda, externo, dif: externo == null ? null : r2(l.venda - externo) }
})
const R = {
  fonte: CONTRA.fonte, totalExterno: CONTRA.total,
  batem: recon.filter(x => x.dif === 0),
  divergem: recon.filter(x => x.dif != null && x.dif !== 0),
  ausentes: recon.filter(x => x.externo == null),
}
R.vlrBatem = r2(R.batem.reduce((s, x) => s + x.apurado, 0))
R.vlrAusentes = r2(R.ausentes.reduce((s, x) => s + x.apurado, 0))
R.vlrDiverge = r2(R.divergem.reduce((s, x) => s + x.dif, 0))
R.pctBatem = R.vlrBatem / T.venda
// a soma das duas fontes tem de fechar com a diferença declarada
const checa = r2(R.vlrBatem + R.divergem.reduce((s, x) => s + x.apurado, 0) + R.vlrAusentes)
if (Math.abs(checa - T.venda) > 0.01) throw new Error(`reconciliação não fecha: ${checa} != ${T.venda}`)

/* ══════════ 9b. Terceira fonte: consolidado do HastaPro publicado no grupo ══ */
const reconM1 = leiloes.filter(l => l.venda).map(l => {
  const k = Object.keys(CONSOLIDADO_M1.porEvento).find(f => chave(l.hp || l.soGrupo || '').includes(chave(f)))
  const externo = k ? CONSOLIDADO_M1.porEvento[k] : null
  return { nome: l.nome, apurado: l.venda, externo, dif: externo == null ? null : r2(l.venda - externo) }
})
const M1 = {
  fonte: CONSOLIDADO_M1.fonte,
  batem: reconM1.filter(x => x.dif === 0),
  divergem: reconM1.filter(x => x.dif != null && x.dif !== 0),
  ausentes: reconM1.filter(x => x.externo == null),
}
M1.vlrBatem = r2(M1.batem.reduce((s2, x) => s2 + x.apurado, 0))
M1.pctBatem = M1.vlrBatem / r2(leiloes.reduce((s2, l) => s2 + l.venda, 0))

T.imposto = r2(leiloes.reduce((s, l) => s + l.imposto, 0))
T.margemContrib = r2(leiloes.reduce((s, l) => s + l.margemContrib, 0))
// a margem de contribuição menos os custos de campo tem de fechar com o lucro da DRE
if (Math.abs(r2(T.margemContrib - C.total) - dre.lucro) > 0.02)
  throw new Error(`margem de contribuição não fecha com a DRE: ${r2(T.margemContrib - C.total)} != ${dre.lucro}`)

const D = { P, FEIRA_ABCZ, leiloes, assessores, custos, C, T, dre, R, M1, EXCLUIDOS, NFS_AGOSTO, TERRA_BRAVA,
  comVenda: leiloes.filter(l => l.venda > 0).length, semVenda: leiloes.filter(l => !l.venda).length }

const saida = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null
if (saida) fs.writeFileSync(saida, JSON.stringify(D, null, 1))

const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
console.log('\n══ VENDAS E COMISSÃO POR ASSESSOR ══')
for (const a of assessores) console.log(' ', a.nome.padEnd(26), String(a.lotes).padStart(3) + ' lt',
  brl(a.venda).padStart(14), a.semPct ? '   sem %' : ((a.pct * 100).toFixed(0) + '%').padStart(6), brl(a.comissao).padStart(11))
console.log('  ' + 'TOTAL'.padEnd(26), String(T.lotes).padStart(3) + ' lt', brl(T.venda).padStart(14), ''.padStart(6), brl(T.comissao).padStart(11))
console.log('\n══ POR LEILÃO ══')
for (const l of leiloes) console.log(' ', l.data.slice(8) + '/' + l.data.slice(5, 7), l.nome.slice(0, 38).padEnd(38),
  brl(l.venda).padStart(13), brl(l.receita).padStart(11), brl(l.comissaoPaga).padStart(11), '', l.receitaTipo)
console.log('\n══ DRE ══')
console.log('  FATURAMENTO (comissão recebida) ', brl(dre.faturamento).padStart(12))
console.log('  Imposto (-18%)                  ', brl(-dre.imposto).padStart(12))
console.log('  FATURAMENTO LÍQUIDO             ', brl(dre.liquido).padStart(12))
console.log('  Comissões assessores            ', brl(-dre.comissoes).padStart(12))
console.log('  Custos de transporte            ', brl(-dre.transporte).padStart(12))
console.log('  Custos de estadia               ', brl(-dre.estadia).padStart(12))
console.log('  Custos de alimentação           ', brl(-dre.alimentacao).padStart(12))
console.log('  Outros (uniformes)              ', brl(-dre.outros).padStart(12))
console.log('  LUCRO BRUTO                     ', brl(dre.lucro).padStart(12), `(${(dre.margem * 100).toFixed(2)}% da venda)`)
console.log('\n  comissão diferida p/ 28/12 (Nane)', brl(dre.comissoesDiferidas), '| sai no ciclo de 25/09', brl(dre.comissoesNoCiclo))
if (TERRA_BRAVA) console.log('  Terra Brava: emitido', brl(TERRA_BRAVA.emitido), '| tabela de performance', brl(TERRA_BRAVA.tabela), '| diferença', brl(TERRA_BRAVA.diferenca))
console.log('  confere com o consolidado do M1 em', M1.batem.length, 'de', D.comVenda, 'pregões —', (M1.pctBatem * 100).toFixed(0) + '% da venda')
console.log('\n  receita emitida', brl(T.receitaEmitida), '| estimada', brl(T.receitaEstimada))
