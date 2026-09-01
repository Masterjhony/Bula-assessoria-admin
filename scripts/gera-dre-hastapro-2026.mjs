/**
 * DRE BULA ASSESSORIA 2026 — CONSTRUIDA A PARTIR DO HASTAPRO.
 *
 * Reproduz a estrutura da aba DRE da planilha "FINANCEIRO BULA 2026" (Drive,
 * 12aVCknseexoEaV2YKnDMI5nr5Xxo_1i_) e a preenche SO com o que existe em
 * FIN_TITULOS da filial '2' — para servir de camada de validacao por cima da
 * planilha, com a conferencia contra o extrato bancario do lado.
 *
 * Criterio (o mesmo da planilha, ver aba Leia-me):
 *   - Regime de CAIXA: o mes e o da baixa (MOV_PAGODIA); sem baixa, o vencimento.
 *   - Despesa classificada pela NATUREZA (descricao + categoria), nao pela
 *     categoria crua — as categorias do HastaPro misturam (ESCRITORIO tem
 *     combustivel e passagem, DIVERSOS tem DARF).
 *   - Fatura de cartao NAO e despesa: e liquidacao. Vai para memorando.
 *   - Imposto separado em ISS e Simples; INSS/IRRF/FGTS entram na Folha, como
 *     nas linhas 40-41 da planilha.
 *
 * Uso: node scripts/gera-dre-hastapro-2026.mjs
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

/* ---------------------------------------------------------------- HastaPro */
const fbOpts = {
    host: env.HASTAPRO_HOST, port: Number(env.HASTAPRO_PORT || 3050), database: env.HASTAPRO_DATABASE,
    user: env.HASTAPRO_USER || 'SYSDBA', password: env.HASTAPRO_PASSWORD, encoding: 'NONE',
}
const dec = v => (Buffer.isBuffer(v) ? v.toString('latin1').trim() : (v instanceof Date ? v.toISOString().slice(0, 10) : v))
const db = await new Promise((res, rej) => Firebird.attach(fbOpts, (e, d) => (e ? rej(e) : res(d))))
const q = sql => new Promise((res, rej) => db.query(sql, [], (e, r) => (e ? rej(e)
    : res((r || []).map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, dec(v)])))))))

const CATS = Object.fromEntries((await q('SELECT FCT_CODIGO,FCT_DESCRICAO FROM FIN_CATEGORIAS')).map(c => [c.FCT_CODIGO, c.FCT_DESCRICAO]))
const CLI = Object.fromEntries((await q('SELECT CLI_CODIGO,CLI_NOME FROM CLIENTES')).map(c => [c.CLI_CODIGO, c.CLI_NOME]))
const PRE = Object.fromEntries((await q('SELECT PRE_CODIGO,PRE_NOME FROM PRESTADORES')).map(p => [p.PRE_CODIGO, p.PRE_NOME]))
const LEI = Object.fromEntries((await q('SELECT LEI_CODIGO,LEI_NOME FROM LEILAO')).map(l => [l.LEI_CODIGO, l.LEI_NOME]))

const titulos = await q(`SELECT T.TIT_CODIGO,T.TIT_TIPO,T.TIT_DESCRICAO,T.TIT_VALOR,T.TIT_FORNECEDOR,T.TIT_CLIENTE,
    T.TIT_DT_VENCTO,T.TIT_DT_COMPETENCIA,T.FCT_CODIGO,T.LEI_CODIGO,T.TIT_STATUS,
    M.MOV_PAGODIA,M.MOV_VALOR,M.MOV_PAGAMENTO
    FROM FIN_TITULOS T LEFT JOIN FIN_MOVIMENTO M ON M.TIT_CODIGO=T.TIT_CODIGO
    WHERE T.FIL_CODIGO='2' AND T.TIT_DT_VENCTO BETWEEN '2026-01-01' AND '2026-12-31'`)
db.detach()

const n = v => Number(v || 0)
const r2 = v => Math.round(n(v) * 100) / 100
const up = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
const cat = t => CATS[t.FCT_CODIGO] || ''
const fornecedor = t => CLI[t.TIT_FORNECEDOR] || PRE[t.TIT_FORNECEDOR] || '(sem fornecedor)'
/** Regime de caixa: o mes e o da baixa; sem baixa, o vencimento (previsto). */
const dataRef = t => t.MOV_PAGODIA || t.TIT_DT_VENCTO
const mesDe = t => Number(String(dataRef(t) || '').slice(5, 7)) || 0

/* Nomes canonicos — a mesma pessoa aparece como cliente e como prestador. */
const CANON = [
    [/FABIO.*OMENA/, 'Fábio Omena'], [/DOUGLAS.*BISPO/, 'Douglas Bispo'],
    [/LEONARDO.*SERAFIM/, 'Leonardo Serafim'], [/FELIPE.*(VILELA|ANDRADE)/, 'Felipe Andrade'],
    [/PERALTA/, 'Luiz Felipe Peralta'], [/GUSTAVO.*RUSA|RUSA ASSESSORIA/, 'Gustavo Rusa'],
    [/REGIANE|NANE/, 'Nane Neves'], [/VALERIA.*BORGES/, 'Valéria Borges da Silva'],
    [/LAILA/, 'Laila de Sousa'], [/LUCAS.*MARTINS/, 'Lucas Martins'],
    [/MARCELO.*CARNEIRO|FORMULA DO BOI/, 'Marcelo Carneiro'], [/FABRICIO.*HYPPOLITO/, 'Fabrício Hyppolito'],
    [/MATHEUS.*ALVES/, 'Matheus Alves'], [/BRUNO.*REIS/, 'Bruno dos Reis'],
    [/ANA PAULA/, 'Ana Paula Munhoz'], [/FLAVIO.*JACQUES/, 'Flavio Jacques'],
    [/FRANCIELI/, 'Francieli Ferreira'], [/VALDEN/, 'Valdenuza Felix'],
    [/JOAO EDUARDO/, 'João Eduardo'], [/JOAO GABRIEL/, 'João Gabriel'], [/JOAO ANTONIO/, 'João Antônio'],
    [/MATHEUS.*EBERT/, 'Matheus Ebert'], [/RAVENNA/, 'Ravenna Fonseca'],
    [/PEDRO.*PEREIRA/, 'Pedro Pereira'], [/LUANA/, 'Luana'], [/CARRELO/, 'Alexandre Carrelo'],
    [/NATHALIA/, 'Nathalia Bacellar'], [/FATIMA/, 'Fátima Cantini'],
]
const canon = nome => (CANON.find(([re]) => re.test(up(nome)))?.[1]) || String(nome).split(' ').slice(0, 3)
    .map(w => (w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(' ')

/* ------------------------------------------------- classificacao por linha */
/**
 * Devolve [grupo, subgrupo, detalhe]. A ordem das regras importa: o que e
 * inequivoco pela descricao vem antes da categoria, porque as categorias do
 * HastaPro misturam naturezas.
 */
function classifica(t) {
    const d = up(t.TIT_DESCRICAO), c = up(cat(t)), f = up(fornecedor(t))
    const pessoa = canon(fornecedor(t))

    if (/^CARTAO$|CARTAO DE CREDITO/.test(c) || /FATURA CARTAO|CARTAO (ABRIL|MASTER|VISA|CRED|SICREDI)|CARTAO CREDITO|CARTAO DE CREDITO/.test(d))
        return ['MEMO', 'Fatura de cartão (liquidação)', fornecedor(t)]
    if (/APORTE SOCIEDADE|PARCERIA FORMULA DO BOI/.test(d))
        return ['MEMO', 'Aporte e parceria de sócio', fornecedor(t)]

    if (/RESCISAO/.test(d) || c === 'RESCISAO') return ['VAR', 'Despesas Trabalhistas', pessoa]

    /* Encargos e beneficios vem antes da comissao: "VALE TRANSP" do Consorcio
       Guaicurus estava caindo em comissao por causa da categoria BONIFICACAO. */
    if (/FGTS|INSS|IRRF|IRPF|DARF FUNCIONARIOS/.test(d) || /FGTS/.test(f))
        return ['FIX', 'Folha de Pagamento', /FGTS/.test(d + f) ? 'FGTS' : 'INSS / IRRF']
    if (/VALE TRANSP/.test(d) || /GUAICURUS/.test(f)) return ['FIX', 'Folha de Pagamento', 'Vale-transporte']

    if (/COMISSAO|COMISAO/.test(d) || /COMISS|BONIFICACAO/.test(c)) return ['COM', pessoa, pessoa]

    if (/ISSQN|^ISS |GUIA ISSQN/.test(d) || /ISSQN/.test(c)) return ['IMP', 'ISS', 'ISS']
    if (/SIMPLES|DASN|^DAS |DARF/.test(d) || /SIMPLES NACIONAL|IMPOSTO/.test(c))
        return ['IMP', 'Simples Nacional', 'Simples Nacional']

    if (/SALARIO|FIXO |PRESTACAO DE SERVICO|SERVICOS (JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO)/.test(d)
        || /SALARIO|FOLHA SALARIAL|VETERINARIO/.test(c)) return ['FIX', 'Folha de Pagamento', pessoa]

    if (/UNIDAS|ALUGUEL (DE )?CARRO|LOCACAO|MULTA|REPARO.*(JEEP|CARRO)|FINANC COMPASS|SAFRA FINANCEIRA|LOCALIZA/.test(d)
        || /ALUGUEL CARRO/.test(c) || /UNIDAS|SAFRA FINANCEIRA/.test(f)) {
        const det = /MULTA/.test(d) ? 'Multas' : /FINANC|SAFRA/.test(d + f) ? 'Financiamento'
            : /REPARO/.test(d) ? 'Reparo' : 'Aluguel de carro'
        return ['FIX', 'Carros', det]
    }

    if (/CONTADOR|CONTABIL/.test(d)) return ['FIX', 'Utilitários', 'Contabilidade']
    if (/CLICKWEB|CLICK WEB|HOSPEDAGEM SITE|SITE BULA|DOCUSING|DOCUSIGN|SUPABASE|VERCEL|CLAUDE|CODEX/.test(d) || /DOCUSING/.test(c))
        return ['FIX', 'Utilitários', 'Tecnologia']
    if (/INTERNET|DIGITAL ?NET/.test(d) || c === 'INTERNET') return ['FIX', 'Utilitários', 'Internet']
    if (/ALUGUEL/.test(d)) return ['FIX', 'Utilitários', 'Aluguel']
    if (/SEGURO.*EQUIPE|MONGERAL/.test(d + f)) return ['FIX', 'Utilitários', 'Seguro da equipe']
    if (/ENERGIA|ENERSUL/.test(d)) return ['FIX', 'Utilitários', 'Energia']
    if (/MATERIAL|TOALHA|LAVANDERIA|MANUTENCAO|IMPRESSORA|MAT ESCRIT/.test(d) || /AQUISICAO DE MATERIAIS|MANUTENCAO/.test(c))
        return ['FIX', 'Utilitários', 'Material e manutenção']
    if (/CAFE/.test(d)) return ['FIX', 'Utilitários', 'Café']

    if (/PATROCINADO|TRAFEGO|FACEBOOK|CAMPANHA|COLLAB|ADS|OPEROUTER|META API/.test(d) || /PATROCINADO|MARKETING/.test(c))
        return ['VAR', 'Despesas de Marketing', /PATROCINADO|TRAFEGO/.test(d) ? `Patrocinado ${pessoa}` : 'Mídia e campanhas']
    if (/DIARIA|MOTORISTA|LIMPEZA|FAXINA|CONSULTA.*CADASTRO|CPD/.test(d) || /DIARIAS|LIMPEZA|CPD|SERVICOS GERAIS/.test(c))
        return ['VAR', 'Despesas de Diárias', /LIMPEZA|FAXINA/.test(d) ? 'Limpeza'
            : /CPD/.test(d + c) ? 'CPD e diárias de leilão' : 'Diárias']
    if (/REEMBOLSO/.test(d)) return ['VAR', 'Despesas Operacionais|Reembolsos', pessoa]
    if (/HOTEL|HOSPEDAGEM|CASA (ALUGADA|UBERABA|EXPOZEBU|EXPOGENETICA)|DIARIA HOTEL|ESTADIA/.test(d) || c === 'HOTEL')
        return ['VAR', 'Despesas Operacionais|Hospedagem', fornecedor(t)]
    if (/PASSAGEM|COMBUSTIVEL|GASOLINA|PEDAGIO|UBER|TAXI|TRANSLADO|DESLOCAMENTO|ABASTECIMENTO/.test(d)
        || /PASSAGENS|COMBUSTIVEL|PEDAGIO|UBER|DESLOCAMENTO/.test(c)) {
        const det = /PASSAGEM/.test(d) ? 'Passagens de avião' : /PEDAGIO/.test(d) ? 'Pedágio'
            : /UBER|TAXI/.test(d) ? 'Uber e táxi' : /COMBUSTIVEL|GASOLINA|ABASTEC/.test(d) ? 'Gasolina' : 'Translado'
        return ['VAR', 'Despesas Operacionais|Translado', det]
    }
    if (/ALIMENTACAO|MERCADO|ALMOCO|RESTAURANTE|ACOUGUE|BOLO/.test(d) || /ALIMENTACAO|MERCADO/.test(c))
        return ['VAR', 'Despesas Operacionais|Alimentação', fornecedor(t)]

    return ['VAR', 'Despesas Operacionais|Outros', `${fornecedor(t)} · ${cat(t) || 'sem categoria'}`]
}

/* ------------------------------------------------------------- agregacao  */
const MESES = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO']
const SEP = '::'
const desp = titulos.filter(t => t.TIT_TIPO === 'D')
const rec = titulos.filter(t => t.TIT_TIPO === 'R')
const ULTIMO = Math.max(...desp.concat(rec).map(mesDe).filter(Boolean))
const M = Array.from({ length: ULTIMO }, (_, i) => i + 1)

const zeros = () => Array(13).fill(0)
const acc = {}
const soma = (chave, mes, v) => { (acc[chave] ??= zeros())[mes] += n(v); acc[chave][0] += n(v) }
const S = chave => acc[chave] || zeros()
/** Filhos DIRETOS de um caminho: mesma raiz e exatamente um nivel a mais. */
const filhosDe = pref => Object.keys(acc).filter(k => k.startsWith(pref + SEP)
    && k.split(SEP).length === pref.split(SEP).length + 1)
const nomeDet = k => k.split(SEP).pop()
const ordena = ks => ks.sort((a, b) => S(b)[0] - S(a)[0])
const filhos = pref => ordena(filhosDe(pref)).map(k => ({ nome: nomeDet(k), serie: S(k) }))

const classificados = desp.map(t => ({ t, cls: classifica(t), mes: mesDe(t) }))
for (const { t, cls, mes } of classificados) {
    const [g, sub, det] = cls
    const v = n(t.TIT_VALOR)
    soma([g, sub, det].join(SEP), mes, v)
    soma([g, sub].join(SEP), mes, v)
    soma(g, mes, v)
}
for (const t of rec) soma('REC', mesDe(t), n(t.TIT_VALOR))

/* ----------------------------------------------------- extrato bancario   */
/* So a conta corrente do Sicoob: e a conta da Bula Assessoria. As duas do
   Sicredi sao o caixa dos leiloes e a aplicacao — entrada = saida, varredura. */
const { data: contas } = await sb.from('erp_contas_bancarias').select('id,nome,banco')
const CONTA_BULA = (contas || []).find(c => /sicoob/i.test(c.banco || c.nome || ''))
const { data: extrato } = await sb.from('erp_movimentos_bancarios')
    .select('data,descricao,valor,tipo').eq('conta_bancaria_id', CONTA_BULA.id)
    .gte('data', '2026-01-01').lte('data', '2026-12-31')
const INTERNO = /RESGATE|APLICACAO|VARREDURA|INTEGR\.?CAPITAL|DEB\.PARC\.SUBS|CAPTACAO/i
const saidaMes = zeros(); const internoMes = zeros()
const saidas = []
for (const m of extrato || []) {
    if (m.tipo !== 'saida') continue
    const mes = Number(String(m.data).slice(5, 7))
    if (INTERNO.test(m.descricao || '')) { internoMes[mes] += n(m.valor); internoMes[0] += n(m.valor) }
    else { saidaMes[mes] += n(m.valor); saidaMes[0] += n(m.valor); saidas.push(m) }
}
/* Lastro: titulo baixado cujo valor aparece no extrato dentro de 7 dias. */
const porValor = new Map()
for (const m of saidas) {
    const k = r2(m.valor).toFixed(2)
    if (!porValor.has(k)) porValor.set(k, [])
    porValor.get(k).push(m)
}
const perto = (a, b) => Math.abs(new Date(a) - new Date(b)) <= 7 * 864e5
const comLastro = zeros(); const semLastro = zeros(); const semLastroSet = new Set()
const usados = new Set()
for (const { t, mes } of classificados) {
    if (!t.MOV_PAGODIA) continue
    const cands = porValor.get(r2(t.TIT_VALOR).toFixed(2)) || []
    const achou = cands.find(m => perto(m.data, t.MOV_PAGODIA) && !usados.has(m))
    if (achou) { usados.add(achou); comLastro[mes] += n(t.TIT_VALOR); comLastro[0] += n(t.TIT_VALOR) }
    else { semLastro[mes] += n(t.TIT_VALOR); semLastro[0] += n(t.TIT_VALOR); semLastroSet.add(t.TIT_CODIGO) }
}
/* O outro lado: saida no extrato que nenhum titulo do HastaPro explica. */
const extratoSemTituloMes = zeros()
const extratoSemTitulo = []
for (const m of saidas) {
    if (usados.has(m)) continue
    const mes = Number(String(m.data).slice(5, 7))
    extratoSemTituloMes[mes] += n(m.valor); extratoSemTituloMes[0] += n(m.valor)
    extratoSemTitulo.push(m)
}

/* ------------------------------------------------------------- planilha   */
/** Numeros da aba DRE do financeiro, lidos do Drive em 01/09/2026. */
const PLAN = {
    'RECEITA BRUTA': [0, 6096.75, 27195.15, 112746.35, 146470.30, 304651.32, 347488.22, 188808.55, 429215.62],
    '(-) IMPOSTO': [0, 1097.41, 4895.13, 20294.34, 26364.65, 54837.24, 62547.88, 33985.54, 74540.72],
    '(-) CUSTOS DE COMISSÃO': [0, 3849, 19344, 53337.80, 50616, 88346, 128408.44, 40021, 154707],
    '(-) DESPESAS FIXAS': [0, 44013.19, 53794.69, 51686.69, 40567.29, 40634.52, 41183.40, 39447.89, 49461.79],
    '(-) Folha de Pagamento': [0, 38800, 43000, 43000, 34800, 34800, 34800, 33100, 47952.11],
    '(-) Carros': [0, 0, 5262, 938.91, 0, 0, 0, 0, 1509.68],
    '(-) Utilitários': [0, 5213.19, 5532.69, 7747.78, 5767.29, 5834.52, 6383.40, 6347.89, 1528.39],
    '(-) DESPESAS VARIÁVEIS': [0, 0, 1265.70, 35914.06, 31577.43, 0, 173.40, 12187.88, 22468],
    '(-) Despesas Trabalhistas': [0, 0, 0, 8584.83, 6300, 0, 0, 0, 5500],
    '(-) Despesas de Diárias': [0, 0, 0, 2600, 3150, 0, 0, 0, 0],
    '(-) Despesas de Marketing': [0, 0, 0, 2238.84, 4300, 0, 173.40, 390, 5500],
    '(-) Despesas Operacionais': [0, 0, 1265.70, 22490.39, 17827.43, 0, 0, 11797.88, 11468],
    '(-) LUCRO LÍQUIDO': [0, -42862.86, -52104.37, -48486.54, -2655.07, 120833.56, 115175.10, 63166.24, 128038.11],
}
const totalPlan = k => r2((PLAN[k] || []).reduce((a, b) => a + b, 0))

/* ---------------------------------------------------------- montagem DRE  */
const sub2 = (a, b) => { const r = zeros(); for (let i = 0; i <= 12; i++) r[i] = r2(a[i] - b[i]); return r }
const somaS = (...as) => { const r = zeros(); for (const a of as) for (let i = 0; i <= 12; i++) r[i] = r2(r[i] + a[i]); return r }
const RECEITA = S('REC')
const IMPOSTO = S('IMP')
const LIQUIDA = sub2(RECEITA, IMPOSTO)
const COMISSAO = S('COM')
const MARGEM = sub2(LIQUIDA, COMISSAO)
const FIXAS = S('FIX')
const VARIAVEIS = S('VAR')
const LUCRO = sub2(sub2(MARGEM, FIXAS), VARIAVEIS)
const OPER = ['Reembolsos', 'Translado', 'Hospedagem', 'Alimentação', 'Outros']
const OPERACIONAIS = somaS(...OPER.map(o => S(['VAR', `Despesas Operacionais|${o}`].join(SEP))))

const LINHAS = []
const put = (nivel, nome, serie, opts = {}) => LINHAS.push({ nivel, nome, serie, ...opts })
put(0, 'RECEITA BRUTA', RECEITA, { destaque: true })
put(1, '(-) IMPOSTO', IMPOSTO, { pct: RECEITA })
for (const f of filhos('IMP')) put(2, f.nome, f.serie)
put(0, 'RECEITA LÍQUIDA', LIQUIDA, { destaque: true, pct: RECEITA })
put(1, '(-) CUSTOS DE COMISSÃO', COMISSAO, { pct: RECEITA })
for (const f of filhos('COM')) put(2, f.nome, f.serie)
put(0, 'MARGEM DE CONTRIBUIÇÃO', MARGEM, { destaque: true, pct: RECEITA })
put(1, '(-) DESPESAS FIXAS', FIXAS, { grupo: true })
for (const bloco of ['Folha de Pagamento', 'Carros', 'Utilitários']) {
    put(2, `(-) ${bloco}`, S(['FIX', bloco].join(SEP)), { sub: true })
    for (const f of filhos(['FIX', bloco].join(SEP))) put(3, f.nome, f.serie)
}
put(1, '(-) DESPESAS VARIÁVEIS', VARIAVEIS, { grupo: true })
for (const bloco of ['Despesas Trabalhistas', 'Despesas de Diárias', 'Despesas de Marketing']) {
    put(2, `(-) ${bloco}`, S(['VAR', bloco].join(SEP)), { sub: true })
    for (const f of filhos(['VAR', bloco].join(SEP))) put(3, f.nome, f.serie)
}
put(2, '(-) Despesas Operacionais', OPERACIONAIS, { sub: true })
for (const o of OPER) {
    const chave = ['VAR', `Despesas Operacionais|${o}`].join(SEP)
    if (!S(chave)[0]) continue
    put(3, o, S(chave))
    for (const f of filhos(chave)) put(4, f.nome, f.serie)
}
put(0, '(-) LUCRO LÍQUIDO', LUCRO, { destaque: true, pct: RECEITA })
put(0, '', zeros())
put(0, 'MEMORANDO — fora do resultado', S('MEMO'), { grupo: true })
for (const f of filhos('MEMO')) {
    put(1, f.nome, f.serie, { sub: true })
    for (const g of filhos(['MEMO', f.nome].join(SEP))) put(2, g.nome, g.serie)
}

/* -------------------------------------------------------------- workbook  */
const wb = new ExcelJS.Workbook()
wb.creator = 'Bula Assessoria'
const PRETO = 'FF0A0A0A', CINZA = 'FFE8E8E8', CINZACLARO = 'FFF5F5F5'
const money = '#,##0.00;[Red]-#,##0.00'
const pctFmt = '0.0%'
const preto = c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }; c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 } }

const ws = wb.addWorksheet('DRE (HastaPro)', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] })
ws.getColumn(1).width = 44
const colDe = m => 2 + (m - 1) * 2
for (const m of M) { ws.getColumn(colDe(m)).width = 13; ws.getColumn(colDe(m) + 1).width = 7 }
const COL_TOT = colDe(ULTIMO) + 2
ws.getColumn(COL_TOT).width = 15
ws.getColumn(COL_TOT + 1).width = 7

ws.mergeCells(1, 1, 1, COL_TOT + 1)
const tit = ws.getCell(1, 1)
tit.value = 'DRE BULA ASSESSORIA 2026 — construída a partir do HastaPro (filial 2, regime de caixa)'
tit.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
tit.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
tit.alignment = { vertical: 'middle' }
ws.getRow(1).height = 26

/* Aviso na cara: a despesa aqui e completa, a receita nao. */
ws.mergeCells(2, 1, 2, COL_TOT + 1)
const av = ws.getCell(2, 1)
av.value = `⚠ A despesa é completa; a RECEITA do HastaPro cobre só ${(S('REC')[0] / totalPlan('RECEITA BRUTA') * 100).toFixed(0)}% da planilha (abril está zerado). O “lucro” abaixo NÃO é resultado — leia a aba Leia-me.`
av.font = { bold: true, size: 10, color: { argb: 'FF7A5B00' } }
av.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCF3D7' } }
av.alignment = { vertical: 'middle' }
ws.getRow(2).height = 20

const cab = ws.getRow(3)
cab.getCell(1).value = 'DRE BULA ASSESSORIA'
for (const m of M) { cab.getCell(colDe(m)).value = MESES[m - 1]; cab.getCell(colDe(m) + 1).value = '%' }
cab.getCell(COL_TOT).value = 'TOTAL'
cab.getCell(COL_TOT + 1).value = '%'
cab.eachCell(c => { preto(c); c.alignment = { horizontal: 'center' } })
cab.getCell(1).alignment = { horizontal: 'left' }

let r = 4
for (const L of LINHAS) {
    const row = ws.getRow(r++)
    row.getCell(1).value = '    '.repeat(Math.max(0, L.nivel - 1)) + L.nome
    if (L.nome) {
        for (const m of [...M, 'T']) {
            const i = m === 'T' ? 0 : m
            const col = m === 'T' ? COL_TOT : colDe(m)
            row.getCell(col).value = r2(L.serie[i])
            row.getCell(col).numFmt = money
            if (L.pct && L.pct[i]) { row.getCell(col + 1).value = r2(L.serie[i]) / L.pct[i]; row.getCell(col + 1).numFmt = pctFmt }
        }
    }
    row.font = { bold: L.destaque || L.grupo || L.sub, size: 10, italic: L.nivel >= 4 }
    if (L.destaque) row.eachCell(c => preto(c))
    else if (L.grupo) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } } })
    else if (L.sub) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZACLARO } } })
}

/* ------------------------------------------------ aba Conferencia planilha */
const wc = wb.addWorksheet('Conferência x Planilha', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] })
wc.getColumn(1).width = 32
wc.mergeCells(1, 1, 1, 4 + M.length * 3)
wc.getCell(1, 1).value = 'Planilha do financeiro × DRE do HastaPro — a diferença de cada linha, mês a mês'
wc.getCell(1, 1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
wc.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
const ch2 = wc.getRow(3)
ch2.getCell(1).value = 'LINHA DA DRE'
for (const m of M) {
    const c0 = 2 + (m - 1) * 3
    ch2.getCell(c0).value = `${MESES[m - 1].slice(0, 3)} planilha`
    ch2.getCell(c0 + 1).value = 'HastaPro'
    ch2.getCell(c0 + 2).value = 'dif.'
    for (const k of [0, 1, 2]) wc.getColumn(c0 + k).width = 13
}
const C_TOT = 2 + M.length * 3
ch2.getCell(C_TOT).value = 'TOTAL planilha'
ch2.getCell(C_TOT + 1).value = 'TOTAL HastaPro'
ch2.getCell(C_TOT + 2).value = 'dif.'
for (const k of [0, 1, 2]) wc.getColumn(C_TOT + k).width = 16
ch2.eachCell(c => { preto(c); c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }; c.alignment = { horizontal: 'center' } })

const MAPA_CONF = [
    ['RECEITA BRUTA', RECEITA], ['(-) IMPOSTO', IMPOSTO], ['(-) CUSTOS DE COMISSÃO', COMISSAO],
    ['(-) DESPESAS FIXAS', FIXAS], ['(-) Folha de Pagamento', S(['FIX', 'Folha de Pagamento'].join(SEP))],
    ['(-) Carros', S(['FIX', 'Carros'].join(SEP))], ['(-) Utilitários', S(['FIX', 'Utilitários'].join(SEP))],
    ['(-) DESPESAS VARIÁVEIS', VARIAVEIS], ['(-) Despesas Trabalhistas', S(['VAR', 'Despesas Trabalhistas'].join(SEP))],
    ['(-) Despesas de Diárias', S(['VAR', 'Despesas de Diárias'].join(SEP))],
    ['(-) Despesas de Marketing', S(['VAR', 'Despesas de Marketing'].join(SEP))],
    ['(-) Despesas Operacionais', OPERACIONAIS], ['(-) LUCRO LÍQUIDO', LUCRO],
]
let rc = 4
for (const [nome, serie] of MAPA_CONF) {
    const row = wc.getRow(rc++)
    row.getCell(1).value = nome
    const p = PLAN[nome] || zeros()
    for (const m of M) {
        const c0 = 2 + (m - 1) * 3
        row.getCell(c0).value = r2(p[m] || 0); row.getCell(c0).numFmt = money
        row.getCell(c0 + 1).value = r2(serie[m]); row.getCell(c0 + 1).numFmt = money
        const dif = r2((p[m] || 0) - serie[m])
        const cd = row.getCell(c0 + 2)
        cd.value = dif; cd.numFmt = money
        if (Math.abs(dif) >= 1) cd.font = { color: { argb: dif > 0 ? 'FFAA3333' : 'FF117744' }, size: 10 }
    }
    row.getCell(C_TOT).value = totalPlan(nome); row.getCell(C_TOT).numFmt = money
    row.getCell(C_TOT + 1).value = r2(serie[0]); row.getCell(C_TOT + 1).numFmt = money
    row.getCell(C_TOT + 2).value = r2(totalPlan(nome) - serie[0]); row.getCell(C_TOT + 2).numFmt = money
    row.getCell(C_TOT + 2).font = { bold: true, size: 10 }
    if (/^\(-\) [A-ZÁÍ]/.test(nome) || nome === 'RECEITA BRUTA') row.font = { bold: true, size: 10 }
}
wc.getCell(rc + 1, 1).value = 'Vermelho: a planilha lançou mais que o HastaPro. Verde: o HastaPro tem despesa que a planilha não lançou.'
wc.getCell(rc + 2, 1).value = 'A planilha lança por competência (mês de referência) e o HastaPro pela baixa — comparar o acumulado, não o mês isolado.'
for (const k of [1, 2]) wc.getCell(rc + k, 1).font = { italic: true, size: 9 }

/* ----------------------------------------------------- aba Extrato        */
const we = wb.addWorksheet('Conferência x Extrato')
we.getColumn(1).width = 14
for (let c = 2; c <= 8; c++) we.getColumn(c).width = 19
we.mergeCells(1, 1, 1, 8)
we.getCell(1, 1).value = 'Camada bancária — o que o HastaPro diz que saiu × o que o extrato mostra'
we.getCell(1, 1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
we.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
const he = we.getRow(3)
const CABE = ['MÊS', 'Despesa no HastaPro', 'Saídas no extrato', 'Diferença', 'Títulos com lastro', 'Títulos sem lastro', '% com lastro', 'Extrato sem título']
CABE.forEach((t, i) => { he.getCell(i + 1).value = t })
he.eachCell(c => { preto(c); c.alignment = { wrapText: true, horizontal: 'center' } })
let re = 4
const DESP_MES = somaS(FIXAS, VARIAVEIS, COMISSAO, IMPOSTO, S('MEMO'))
for (const m of [...M, 0]) {
    const row = we.getRow(re++)
    row.getCell(1).value = m === 0 ? 'TOTAL' : MESES[m - 1]
    row.getCell(2).value = r2(DESP_MES[m])
    row.getCell(3).value = r2(saidaMes[m])
    row.getCell(4).value = r2(DESP_MES[m] - saidaMes[m])
    row.getCell(5).value = r2(comLastro[m])
    row.getCell(6).value = r2(semLastro[m])
    row.getCell(7).value = comLastro[m] + semLastro[m] ? comLastro[m] / (comLastro[m] + semLastro[m]) : 0
    row.getCell(8).value = r2(extratoSemTituloMes[m])
    for (const c of [2, 3, 4, 5, 6, 8]) row.getCell(c).numFmt = money
    row.getCell(7).numFmt = pctFmt
    if (m === 0) row.eachCell(c => { c.font = { bold: true }; c.border = { top: { style: 'thin' } } })
}
const nota = [
    'Despesa no HastaPro = tudo que virou título na filial 2, inclusive a fatura de cartão e o aporte (que na DRE ficam no memorando).',
    'Saídas no extrato = débitos do Sicoob fora aplicação, resgate e varredura, que são movimento interno e não despesa.',
    'Lastro = título baixado cujo valor aparece no extrato dentro de 7 dias, cada movimento usado uma vez só.',
    'Pagamento agrupado (vários títulos num PIX só) aparece como "sem lastro" — não é erro, é agregação; confira na aba Base.',
    'Extrato sem título é o buraco que interessa: dinheiro que saiu da conta e não tem nenhum título no HastaPro explicando.',
]
nota.forEach((t, i) => { const c = we.getCell(re + 1 + i, 1); c.value = t; c.font = { italic: true, size: 9 } })

/* ----------------------------------------------------- aba Base           */
const wbse = wb.addWorksheet('Base - Títulos', { views: [{ state: 'frozen', ySplit: 1 }] })
const COLS = [['Mês', 10], ['Pago em', 12], ['Vencimento', 12], ['Descrição', 46], ['Fornecedor', 30], ['Categoria HastaPro', 24],
    ['Linha da DRE', 32], ['Detalhe', 26], ['Leilão', 34], ['Forma', 18], ['Status', 10], ['Valor', 14], ['Lastro no extrato', 16]]
wbse.getRow(1).values = COLS.map(c => c[0])
COLS.forEach((c, i) => { wbse.getColumn(i + 1).width = c[1] })
wbse.getRow(1).eachCell(c => preto(c))
let rb = 2
for (const { t, cls, mes } of classificados.sort((a, b) => String(dataRef(a.t)).localeCompare(String(dataRef(b.t))))) {
    const [g, subn, det] = cls
    const linha = g === 'COM' ? '(-) CUSTOS DE COMISSÃO' : g === 'IMP' ? `(-) IMPOSTO › ${subn}`
        : g === 'MEMO' ? `MEMORANDO › ${subn}` : subn.replace('|', ' › ')
    wbse.getRow(rb++).values = [MESES[mes - 1] || '—', t.MOV_PAGODIA || '', t.TIT_DT_VENCTO || '',
        t.TIT_DESCRICAO || '', fornecedor(t), cat(t) || '(sem categoria)', linha, det,
        LEI[t.LEI_CODIGO] || '', t.MOV_PAGAMENTO || '', t.TIT_STATUS || '', r2(t.TIT_VALOR),
        !t.MOV_PAGODIA ? 'em aberto' : semLastroSet.has(t.TIT_CODIGO) ? 'NÃO' : 'sim']
}
wbse.getColumn(12).numFmt = money
wbse.autoFilter = { from: { row: 1, column: 1 }, to: { row: rb - 1, column: COLS.length } }

/* ------------------------------------------- aba Extrato sem titulo       */
const wx = wb.addWorksheet('Extrato sem título', { views: [{ state: 'frozen', ySplit: 2 }] })
const XCOLS = [['Mês', 12], ['Data', 12], ['Descrição no extrato', 76], ['Valor', 14]]
wx.mergeCells(1, 1, 1, 4)
wx.getCell(1, 1).value = `Saiu da conta do Sicoob e não tem título no HastaPro — ${extratoSemTitulo.length} lançamentos, R$ ${n(extratoSemTituloMes[0]).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Do maior para o menor. Parte é pagamento agrupado (o PIX quita vários títulos de uma vez) e parte é despesa que nunca foi lançada.`
wx.getCell(1, 1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
wx.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRETO } }
wx.getCell(1, 1).alignment = { wrapText: true, vertical: 'middle' }
wx.getRow(1).height = 30
wx.getRow(2).values = XCOLS.map(c => c[0])
XCOLS.forEach((c, i) => { wx.getColumn(i + 1).width = c[1] })
wx.getRow(2).eachCell(c => preto(c))
let rx = 3
for (const m of extratoSemTitulo.sort((a, b) => n(b.valor) - n(a.valor)))
    wx.getRow(rx++).values = [MESES[Number(String(m.data).slice(5, 7)) - 1] || '', m.data, m.descricao || '', r2(m.valor)]
wx.getColumn(4).numFmt = money
wx.autoFilter = { from: { row: 2, column: 1 }, to: { row: rx - 1, column: 4 } }

/* ----------------------------------------------------- aba Receita        */
const wr = wb.addWorksheet('Base - Receita', { views: [{ state: 'frozen', ySplit: 1 }] })
const RCOLS = [['Mês', 12], ['Recebido em', 13], ['Vencimento', 12], ['Descrição', 40], ['Cliente', 32], ['Leilão', 38], ['Valor', 14]]
wr.getRow(1).values = RCOLS.map(c => c[0])
RCOLS.forEach((c, i) => { wr.getColumn(i + 1).width = c[1] })
wr.getRow(1).eachCell(c => preto(c))
let rr = 2
for (const t of rec.sort((a, b) => String(dataRef(a)).localeCompare(String(dataRef(b)))))
    wr.getRow(rr++).values = [MESES[mesDe(t) - 1] || '—', t.MOV_PAGODIA || '', t.TIT_DT_VENCTO || '',
        t.TIT_DESCRICAO || '', CLI[t.TIT_CLIENTE] || '', LEI[t.LEI_CODIGO] || '', r2(t.TIT_VALOR)]
wr.getColumn(7).numFmt = money

/* ----------------------------------------------------- aba Leia-me        */
const wl = wb.addWorksheet('Leia-me')
wl.getColumn(1).width = 3
wl.getColumn(2).width = 120
const brl = v => n(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const txt = (s, o = {}) => {
    const c = wl.getCell(wl.rowCount + 1, 2)
    c.value = s
    c.font = { size: o.size || 11, bold: !!o.bold }
    c.alignment = { wrapText: true, vertical: 'top' }
}
txt('DRE BULA ASSESSORIA 2026 — construída a partir do HastaPro', { bold: true, size: 14 })
txt(`Gerado em ${new Date().toLocaleDateString('pt-BR')} por scripts/gera-dre-hastapro-2026.mjs. Fonte: Firebird do HastaPro, FIN_TITULOS da filial '2', somente leitura — ${desp.length} títulos de despesa e ${rec.length} de recebimento em 2026. Extrato do Sicoob lido do ERP.`)
txt('')
txt('O critério — o mesmo da planilha do financeiro', { bold: true, size: 12 })
txt('1. Estrutura de linhas idêntica à aba DRE de "FINANCEIRO BULA 2026": Receita Bruta → Imposto → Receita Líquida → Custos de Comissão → Margem de Contribuição → Despesas Fixas (Folha, Carros, Utilitários) → Despesas Variáveis (Trabalhistas, Diárias, Marketing, Operacionais → Reembolsos, Translado, Hospedagem, Alimentação) → Lucro Líquido.')
txt('2. Regime de CAIXA: cada título entra no mês em que foi BAIXADO. Título ainda sem baixa entra pelo vencimento, como previsão — a coluna "Lastro no extrato" da aba Base diz qual é qual ("em aberto").')
txt('3. A despesa é classificada pela NATUREZA (descrição + categoria), não pela categoria crua: no HastaPro a categoria ESCRITÓRIO contém combustível, passagem aérea e alimentação, e DIVERSOS contém DARF e passagem. Classificar pela categoria colocaria passagem de avião em "Utilitários".')
txt('4. Imposto separado em ISS e Simples Nacional. INSS, IRRF, FGTS e vale-transporte entram na Folha de Pagamento, como nas linhas 40-41 da planilha.')
txt('5. Fatura de cartão de crédito NÃO é despesa: é liquidação. Vai para o MEMORANDO, fora do resultado — a planilha também não tem linha de cartão, a despesa entra pelo que foi comprado. O aporte da Fórmula do Boi vai junto, por não ser custo operacional.')
txt('')
txt('As três conferências', { bold: true, size: 12 })
txt('• "Conferência x Planilha": linha a linha, mês a mês, planilha × HastaPro e a diferença, com o total do ano no fim.')
txt('• "Conferência x Extrato": a camada bancária. Compara a despesa do HastaPro com as saídas reais do Sicoob (fora aplicação, resgate e varredura, que são movimento interno) e mede quanto tem lastro.')
txt('• "Extrato sem título": o outro lado — dinheiro que saiu da conta e não tem nenhum título no HastaPro para explicar. É a lista de trabalho.')
txt('')
txt('Limites que precisam ser lidos antes de usar', { bold: true, size: 12 })
txt(`• RECEITA — o HastaPro tem R$ ${brl(RECEITA[0])} de títulos de recebimento em 2026, contra R$ ${brl(totalPlan('RECEITA BRUTA'))} na planilha: cobre ${(RECEITA[0] / totalPlan('RECEITA BRUTA') * 100).toFixed(0)}%. Abril está zerado e vários meses só têm parte. O HastaPro NÃO é fonte de receita — para receita, a fonte é a aba Leilões / os fechamentos. Por isso o lucro desta DRE não pode ser lido como resultado: é despesa completa contra receita parcial.`)
txt('• COMPETÊNCIA × CAIXA — a planilha lança pelo mês de referência (o salário de março na coluna de março, a comissão no mês do leilão); o HastaPro guarda o pagamento, que costuma cair no mês seguinte. Por isso a diferença mensal é grande mesmo quando o ano fecha parecido. Compare o acumulado.')
txt('• O que existe de um lado e não do outro — a planilha tem linhas que o HastaPro não registra (aluguel do escritório de R$ 3.292/mês, energia, Claude, Codex, Supabase, Vercel) e o HastaPro tem o que a planilha não lançou (financiamento do carro no Safra, aporte da Fórmula do Boi). As duas listas saem da aba Base filtrando pela coluna "Linha da DRE".')
txt('• Pagamento agrupado — vários títulos quitados num PIX só aparecem como "sem lastro" na conferência bancária. Não é erro: é agregação.')

/* ------------------------------------------------------------- gravacao   */
const arquivo = path.join(os.homedir(), 'Desktop', 'DRE BULA ASSESSORIA 2026 - base HastaPro.xlsx')
await wb.xlsx.writeFile(arquivo)

console.log('titulos:', desp.length, 'despesa /', rec.length, 'receita | ate', MESES[ULTIMO - 1])
console.log('RECEITA', brl(RECEITA[0]), `(${(RECEITA[0] / totalPlan('RECEITA BRUTA') * 100).toFixed(0)}% da planilha)`)
console.log('IMPOSTO', brl(IMPOSTO[0]), '| COMISSAO', brl(COMISSAO[0]), '| FIXAS', brl(FIXAS[0]), '| VARIAVEIS', brl(VARIAVEIS[0]))
console.log('MEMO (cartao/aporte)', brl(S('MEMO')[0]), '| total classificado', brl(IMPOSTO[0] + COMISSAO[0] + FIXAS[0] + VARIAVEIS[0] + S('MEMO')[0]))
console.log('extrato: saidas', brl(saidaMes[0]), '| interno', brl(internoMes[0]), '| sem titulo', brl(extratoSemTituloMes[0]), `(${extratoSemTitulo.length} lancamentos)`)
console.log('lastro:', brl(comLastro[0]), 'com /', brl(semLastro[0]), 'sem')
console.log('nao classificado (Outros):', brl(S(['VAR', 'Despesas Operacionais|Outros'].join(SEP))[0]))
console.log('XLSX →', arquivo)
