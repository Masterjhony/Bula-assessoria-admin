/**
 * RESULTADO COMERCIAL 2026 — do que a Bula vendeu até o que sobra.
 *
 *   npx tsx scripts/gera-resultado-comercial-2026.mts
 *
 * Pedido do chefe (21/08/2026, áudio): "faturamento, quanto a Bula vendeu até
 * agora, quanto tem a receber de acordo com os acordos que teve com as marcas,
 * quanto a gente tem que pagar de comissão pra ter nossa margem bruta — tira
 * imposto e tira comissão. Lembrando que tem muita comissão, os negócios que o
 * Douglas tá vendendo, nem é tudo Rusa que ganha 5%. E além disso, depois da
 * margem de contribuição, coloca os custos fixos de ter trazido todo mundo."
 *
 * FONTES (nenhum número escrito à mão)
 *   bula_leilao_fechamento  — o que foi vendido (cobertura), a receita pelo
 *                             acordo de cada leiloeira e a comissão por assessor
 *   erp_contas_receber      — o que a Bula tem a receber, por leiloeira
 *   erp_contas_pagar        — comissão paga x em aberto, custo fixo lançado
 *   erp_movimentos_bancarios— custo de estrutura realmente realizado no banco
 *   erp_folha_estrutura     — a folha nova (cadastro canônico)
 *
 * O BURACO E COMO ELE É TRATADO
 * 48 dos 106 leilões de 2026 ainda não têm a receita apurada com a leiloeira —
 * a maioria é da Expogenética (13–20/08), fechada há dias. O volume vendido
 * desses leilões é FATO; a receita deles é ESTIMADA pelo take-rate observado
 * nos 58 leilões que já têm acordo fechado. As duas parcelas viajam separadas
 * até o fim do relatório: nada apurado vira estimado por descuido.
 *
 * A comissão, essa, é fato em todos os 106 — ela nasce do lance, não do acordo.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { normalizeAssessorNome } from '../src/lib/assessor-normalize'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').replace(/^﻿/, '').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')])) as Record<string, string>
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const r2 = (n: number) => Math.round(Number(n || 0) * 100) / 100
const r4 = (n: number) => Math.round(Number(n || 0) * 10000) / 10000
const num = (v: unknown) => Number(v || 0)

const HOJE = '2026-08-21'
const ANO_INI = '2026-01-01'
const IMPOSTO_PCT = 0.18 // mesmo critério da tela Fechamento e da planilha-mestra

async function todos<T>(tabela: string, select: string, filtro?: (q: any) => any): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; ; i += 1000) {
    let q = sb.from(tabela).select(select).range(i, i + 999)
    if (filtro) q = filtro(q)
    const { data, error } = await q
    if (error) throw new Error(`${tabela}: ${error.message}`)
    if (!data?.length) break
    out.push(...(data as T[]))
    if (data.length < 1000) break
  }
  return out
}

const D: any = { meta: { geradoEm: HOJE, periodo: 'janeiro a agosto de 2026' } }

/* ══ 1. O que a Bula vendeu, e o que ela ganha com isso ═══════════════════ */

type Fech = {
  nome: string; data: string; lotes_vendidos: number | null; vgv_total: number | null
  receita_bula: number | null; comissao_assessoria: number | null
  despesas_variaveis: number | null; por_assessor: any[] | null
}
const fech = await todos<Fech>(
  'bula_leilao_fechamento',
  'nome,data,lotes_vendidos,vgv_total,receita_bula,comissao_assessoria,despesas_variaveis,por_assessor',
  (q) => q.gte('data', ANO_INI).lte('data', HOJE),
)

const MES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const temReceita = (f: Fech) => num(f.receita_bula) > 0

// take-rate observado: só os leilões com o acordo já fechado respondem por ele
const apur = fech.filter(temReceita)
const pend = fech.filter((f) => !temReceita(f))
const vgvApurado = r2(apur.reduce((s, f) => s + num(f.vgv_total), 0))
const receitaApurada = r2(apur.reduce((s, f) => s + num(f.receita_bula), 0))
const comissaoApurada = r2(apur.reduce((s, f) => s + num(f.comissao_assessoria), 0))
const takeRate = r4(receitaApurada / vgvApurado)

D.apuracao = {
  leiloes: fech.length,
  comAcordo: apur.length,
  semAcordo: pend.length,
  vgvApurado,
  vgvPendente: r2(pend.reduce((s, f) => s + num(f.vgv_total), 0)),
  receitaApurada,
  comissaoApurada,
  takeRate,
  // relação comissão/receita medida nos MESMOS leilões — comparar a comissão de
  // 106 leilões com a receita de 58 inflaria o peso da comissão
  pctComissaoSobreReceita: r4(comissaoApurada / receitaApurada),
}

const mensal: any[] = []
for (let m = 1; m <= 8; m++) {
  const ym = `2026-${String(m).padStart(2, '0')}`
  const doMes = fech.filter((f) => String(f.data).slice(0, 7) === ym)
  const a = doMes.filter(temReceita), p = doMes.filter((f) => !temReceita(f))
  const vgv = r2(doMes.reduce((s, f) => s + num(f.vgv_total), 0))
  const recA = r2(a.reduce((s, f) => s + num(f.receita_bula), 0))
  const vgvP = r2(p.reduce((s, f) => s + num(f.vgv_total), 0))
  const recE = r2(vgvP * takeRate)
  const receita = r2(recA + recE)
  const comissao = r2(doMes.reduce((s, f) => s + num(f.comissao_assessoria), 0))
  mensal.push({
    mes: m, nome: MES_NOME[m - 1], leiloes: doMes.length,
    lotes: doMes.reduce((s, f) => s + num(f.lotes_vendidos), 0),
    vgv, vgvApurado: r2(a.reduce((s, f) => s + num(f.vgv_total), 0)), vgvPendente: vgvP,
    receitaApurada: recA, receitaEstimada: recE, receita,
    imposto: r2(receita * IMPOSTO_PCT), comissao,
    take: vgv > 0 ? r4(receita / vgv) : 0,
  })
}
D.mensal = mensal
D.ano = {
  leiloes: fech.length,
  lotes: mensal.reduce((s, x) => s + x.lotes, 0),
  vgv: r2(mensal.reduce((s, x) => s + x.vgv, 0)),
  receitaApurada: r2(mensal.reduce((s, x) => s + x.receitaApurada, 0)),
  receitaEstimada: r2(mensal.reduce((s, x) => s + x.receitaEstimada, 0)),
  receita: r2(mensal.reduce((s, x) => s + x.receita, 0)),
  imposto: r2(mensal.reduce((s, x) => s + x.imposto, 0)),
  comissao: r2(mensal.reduce((s, x) => s + x.comissao, 0)),
}

/* ══ 2. Quanto a Bula tem a receber ═══════════════════════════════════════ */

type Cr = { valor: number; desconto: number | null; valor_recebido: number | null; vencimento: string | null; status: string; cliente_id: string | null; categoria_id: string | null; descricao: string; tags: string[] | null }
const [crs, pessoas, categorias] = await Promise.all([
  todos<Cr>('erp_contas_receber', 'valor,desconto,valor_recebido,vencimento,status,cliente_id,categoria_id,descricao,tags'),
  todos<{ id: string; nome: string }>('erp_pessoas', 'id,nome'),
  todos<{ id: string; nome: string; dre_grupo: string | null }>('erp_categorias', 'id,nome,dre_grupo'),
])
const nomeP = Object.fromEntries(pessoas.map((p) => [p.id, p.nome]))
const catById = Object.fromEntries(categorias.map((c) => [c.id, c]))

// a mesma leiloeira aparece com grafias diferentes no cadastro de clientes
const normLeiloeira = (n: string) => {
  const s = String(n || '').toUpperCase()
  if (/PROGRAMA/.test(s)) return 'Programa Leilões'
  if (/REMATES/.test(s)) return 'Bula Remates'
  if (/AGRESTE/.test(s)) return 'Agreste Leilões'
  if (/E-?RURAL/.test(s)) return 'e-Rural'
  return n ? String(n) : 'Sem leiloeira identificada'
}
const ehOperacional = (c: Cr) => {
  const g = c.categoria_id ? catById[c.categoria_id]?.dre_grupo : null
  return g !== 'financeiro' && g !== 'ignorar'
}
// o que ainda entra é o LÍQUIDO: o desconto à vista da leiloeira já foi
// concedido, não é dinheiro a receber (caso Naviraí, 21/08)
const saldoCr = (c: Cr) => r2(num(c.valor) - num(c.desconto) - num(c.valor_recebido))

const abertos = crs.filter((c) => ['aberto', 'vencido', 'parcial'].includes(c.status) && ehOperacional(c))
const porLeiloeira: Record<string, { leiloeira: string; vencido: number; aVencer: number; total: number; n: number }> = {}
for (const c of abertos) {
  const k = normLeiloeira(nomeP[c.cliente_id || ''] || '')
  const e = (porLeiloeira[k] ||= { leiloeira: k, vencido: 0, aVencer: 0, total: 0, n: 0 })
  const v = saldoCr(c)
  const venceu = String(c.vencimento || '') < HOJE
  e[venceu ? 'vencido' : 'aVencer'] += v
  e.total += v
  e.n++
}
const listaLeiloeira = Object.values(porLeiloeira)
  .map((e) => ({ ...e, vencido: r2(e.vencido), aVencer: r2(e.aVencer), total: r2(e.total) }))
  .sort((a, b) => b.total - a.total)
// título com data confirmada pela leiloeira x vencimento automático de
// leilão+45d — a distinção que separa cobrança de palpite
const acordado = (c: Cr) => Array.isArray(c.tags) && c.tags.includes('data-acordada')
D.receber = {
  comDataAcordada: r2(abertos.filter(acordado).reduce((s, c) => s + saldoCr(c), 0)),
  titulosAcordados: abertos.filter(acordado).length,
  total: r2(listaLeiloeira.reduce((s, e) => s + e.total, 0)),
  vencido: r2(listaLeiloeira.reduce((s, e) => s + e.vencido, 0)),
  aVencer: r2(listaLeiloeira.reduce((s, e) => s + e.aVencer, 0)),
  titulos: abertos.length,
  porLeiloeira: listaLeiloeira,
}

// Recebido no ano: só a comissão de leilão. A categoria "Recebimento Cliente"
// fica FORA — são PIX de comprador que entram na conta e seguem adiante
// (JBJ, Vinicius e outros, quase tudo no 1º trimestre). Somá-la faria a Bula
// parecer ter recebido mais do que faturou.
const REPASSE = 'Recebimento Cliente'
const recebidos = crs.filter((c) => c.status === 'recebido' && ehOperacional(c)
  && String(c.vencimento || '') >= ANO_INI && String(c.vencimento || '') < '2026-09-01')
const catNomeCr = (c: Cr) => (c.categoria_id ? catById[c.categoria_id]?.nome : null) || '(sem categoria)'
D.receber.recebidoComissao = r2(recebidos.filter((c) => catNomeCr(c) !== REPASSE)
  .reduce((s, c) => s + num(c.valor_recebido || c.valor), 0))
D.receber.repasseComprador = r2(recebidos.filter((c) => catNomeCr(c) === REPASSE)
  .reduce((s, c) => s + num(c.valor_recebido || c.valor), 0))

/* ══ 3. A comissão — o ponto que o chefe mandou olhar ═════════════════════ */

const porAssessor: Record<string, { nome: string; vgv: number; comissao: number; leiloes: number; pcts: number[] }> = {}
for (const f of fech) {
  for (const a of (f.por_assessor || [])) {
    const nome = normalizeAssessorNome(a?.nome) || 'A definir'
    const e = (porAssessor[nome] ||= { nome, vgv: 0, comissao: 0, leiloes: 0, pcts: [] })
    e.vgv += num(a?.vgv)
    e.comissao += num(a?.comissao)
    e.leiloes++
    if (num(a?.comissao_pct) > 0) e.pcts.push(num(a.comissao_pct))
  }
}
const listaAssessor = Object.values(porAssessor).map((e) => ({
  nome: e.nome, leiloes: e.leiloes, vgv: r2(e.vgv), comissao: r2(e.comissao),
  pctEfetivo: e.vgv > 0 ? r4(e.comissao / e.vgv) : 0,
  pctTabela: e.pcts.length ? r4(e.pcts.reduce((s, p) => s + p, 0) / e.pcts.length) : null,
})).sort((a, b) => b.comissao - a.comissao)
const totComissao = r2(listaAssessor.reduce((s, e) => s + e.comissao, 0))
const totVgvAssessor = r2(listaAssessor.reduce((s, e) => s + e.vgv, 0))

// faixas: o chefe quer ver que 5% é a minoria
const faixa = (p: number) => (p >= 0.045 ? '5% (parceiro)' : p >= 0.015 ? '2% (assessor)' : p > 0 ? 'até 1% (apoio)' : 'sem percentual')
const porFaixa: Record<string, { faixa: string; vgv: number; comissao: number; n: number }> = {}
for (const f of fech) {
  for (const a of (f.por_assessor || [])) {
    const k = faixa(num(a?.comissao_pct))
    const e = (porFaixa[k] ||= { faixa: k, vgv: 0, comissao: 0, n: 0 })
    e.vgv += num(a?.vgv); e.comissao += num(a?.comissao); e.n++
  }
}
D.comissao = {
  total: totComissao,
  vgvCoberto: totVgvAssessor,
  pctSobreVgv: totVgvAssessor > 0 ? r4(totComissao / totVgvAssessor) : 0,
  porAssessor: listaAssessor,
  porFaixa: Object.values(porFaixa).map((e) => ({ ...e, vgv: r2(e.vgv), comissao: r2(e.comissao), pctDoTotal: r4(e.comissao / totComissao) })).sort((a, b) => b.comissao - a.comissao),
}

// pago x em aberto (o caixa, não a competência)
type Cp = { valor: number; desconto: number | null; valor_pago: number | null; vencimento: string | null; status: string; categoria_id: string | null; origem: string; descricao: string }
const cps = await todos<Cp>('erp_contas_pagar', 'valor,desconto,valor_pago,vencimento,status,categoria_id,origem,descricao')
const catNome = (c: Cp) => (c.categoria_id ? catById[c.categoria_id]?.nome : null) || ''
const liq = (c: Cp) => r2(num(c.valor) - num(c.desconto))
const noAno = (c: Cp) => String(c.vencimento || '') >= ANO_INI && String(c.vencimento || '') < '2026-09-01'
const ehComissao = (c: Cp) => ['Comissão Funcionário', 'Repasse Assessorias/Parceiros'].includes(catNome(c))
const vivos = cps.filter((c) => c.status !== 'cancelado' && c.origem !== 'sintetico')
D.comissao.pago = r2(vivos.filter((c) => ehComissao(c) && noAno(c) && c.status === 'pago').reduce((s, c) => s + num(c.valor_pago || c.valor), 0))
D.comissao.emAberto = r2(vivos.filter((c) => ehComissao(c) && noAno(c) && c.status !== 'pago').reduce((s, c) => s + liq(c), 0))

/* ══ 4. Custo fixo — "de ter trazido todo mundo" ══════════════════════════ */

// folha nova: o cadastro canônico já reprojetado em 21/08
const estrutura = await todos<{ nome: string; funcao: string | null; salario_fixo: number; ativo: boolean }>(
  'erp_folha_estrutura', 'nome,funcao,salario_fixo,ativo')
const folhaNova = r2(estrutura.filter((e) => e.ativo && num(e.salario_fixo) > 0).reduce((s, e) => s + num(e.salario_fixo), 0))

// estrutura realizada no banco (abr–jul, meses inteiros e já conciliados).
// Fora: comissão, imposto, folha, despesa de leilão e movimento interno —
// e fora TAMBÉM o cartão, que é gasto do Bulinha abatendo dívida, não estrutura.
type Mov = { data: string; tipo: string; valor: number; categoria_id: string | null }
const movs = await todos<Mov>('erp_movimentos_bancarios', 'data,tipo,valor,categoria_id',
  (q) => q.eq('tipo', 'saida').gte('data', '2026-04-01').lt('data', '2026-08-01'))
const FORA_ESTRUTURA = new Set(['Comissão Funcionário', 'Repasse Assessorias/Parceiros', 'Impostos e Taxas',
  'Encargos Sociais', 'Despesa Operacional Leilão', 'REEMBOLSO', 'Viagem/Passagens', 'Folha de Pagamento',
  'SALÁRIOS', 'Transferencias Internas - Saida', 'Aplicacao Financeira', 'Integralizacao Capital Cooperativa',
  'Cartão de Crédito', 'Pagamento Fatura'])
const DE_LEILAO = new Set(['Despesa Operacional Leilão', 'REEMBOLSO', 'Viagem/Passagens'])
const nomeCat = (id: string | null) => (id ? catById[id]?.nome : null) || '(sem categoria)'
const MESES_BASE = 4
const somaMov = (filtro: (n: string) => boolean) => r2(movs.filter((m) => filtro(nomeCat(m.categoria_id))).reduce((s, m) => s + num(m.valor), 0))
const estruturaMes = r2(somaMov((n) => !FORA_ESTRUTURA.has(n)) / MESES_BASE)
const leilaoMes = r2(somaMov((n) => DE_LEILAO.has(n)) / MESES_BASE)
const cartaoMes = r2(somaMov((n) => n === 'Cartão de Crédito') / MESES_BASE)

// Folha do período pelos títulos de competência, não pela média do banco: um
// mês paga a folha do anterior e o extrato mistura as duas. A janela vai até
// 05/09 porque a folha de agosto vence lá (jan..ago = 8 competências).
const ehFolha = (c: Cp) => ['Folha de Pagamento', 'SALÁRIOS'].includes(catNome(c))
const folhaCps = vivos.filter((c) => ehFolha(c) && String(c.vencimento || '') >= ANO_INI && String(c.vencimento || '') <= '2026-09-06')
const folhaPeriodo = r2(folhaCps.reduce((s, c) => s + liq(c), 0))
// "antes" = a folha que vigorava até a mudança (competência julho, a última
// fechada sob a estrutura antiga) — não a média, que carrega acertos pontuais
const folhaAntes = r2(vivos.filter((c) => ehFolha(c) && /Folha Julho\/2026/i.test(c.descricao)).reduce((s, c) => s + liq(c), 0))

// despesa de leilão como % da receita: é custo direto do evento, não fixo
const receitaBase = r2(mensal.filter((m) => m.mes >= 4 && m.mes <= 7).reduce((s, m) => s + m.receita, 0))
const pctLeilaoSobreReceita = r4((leilaoMes * MESES_BASE) / receitaBase)

D.custo = {
  folhaNova,
  folhaAntes,
  folhaPeriodo,
  estruturaMes,
  leilaoMes,
  cartaoMes,
  fixoAntes: r2(folhaAntes + estruturaMes),
  fixoDepois: r2(folhaNova + estruturaMes),
  pctLeilaoSobreReceita,
  equipe: estrutura.filter((e) => e.ativo && num(e.salario_fixo) > 0)
    .map((e) => ({ nome: e.nome, funcao: e.funcao, salario: r2(num(e.salario_fixo)) }))
    .sort((a, b) => b.salario - a.salario),
}

/* ══ 5. A cascata: da receita ao que sobra ════════════════════════════════ */

const pctImposto = IMPOSTO_PCT
const pctComissao = D.apuracao.pctComissaoSobreReceita

const receitaAno = D.ano.receita
const despLeilaoAno = r2(receitaAno * pctLeilaoSobreReceita)
const margemAno = r2(receitaAno - D.ano.imposto - D.ano.comissao - despLeilaoAno)
const MESES_ANO = 8
D.cascata = {
  receita: receitaAno,
  imposto: D.ano.imposto,
  comissao: D.ano.comissao,
  despesaLeilao: despLeilaoAno,
  margemContribuicao: margemAno,
  margemPct: r4(margemAno / receitaAno),
  // custo fixo do período = folha realmente lançada mês a mês + estrutura média
  folhaPeriodo: D.custo.folhaPeriodo,
  estruturaPeriodo: r2(estruturaMes * MESES_ANO),
  custoFixoPeriodo: r2(D.custo.folhaPeriodo + estruturaMes * MESES_ANO),
  resultado: r2(margemAno - (D.custo.folhaPeriodo + estruturaMes * MESES_ANO)),
  meses: MESES_ANO,
}
// a margem que vale para projetar é a REALIZADA do ano, não a modelada por
// percentuais médios: ela já carrega o mix real de leilão caro e leilão barato
const margemPct = D.cascata.margemPct
D.modelo = { takeRate, pctImposto, pctComissao, pctLeilao: pctLeilaoSobreReceita, margemPct }

/* ══ 5b. Lucro mês a mês e a participação do sócio ════════════════════════ */

// Contrato de sociedade (17/07/2026): o Marcelo é remunerado com 35% do LUCRO,
// pago TRIMESTRALMENTE, contando a partir de junho/2026. Primeiro trimestre =
// jun–ago, a pagar em setembro. Não é despesa da operação: sai depois do lucro
// e só existe quando há lucro — por isso não entra no custo fixo nem no ponto
// de equilíbrio, e por isso a base é o resultado, não a receita.
const SOCIO_PCT = 0.35
const SOCIO_INICIO = 6 // junho

// folha lançada por competência (a de agosto vence em 05/09)
const folhaPorMes = new Map<number, number>()
for (const c of folhaCps) {
  const m = MES_NOME.findIndex((n) => new RegExp(`Folha ${n}/2026`, 'i').test(c.descricao)) + 1
  if (m > 0) folhaPorMes.set(m, r2((folhaPorMes.get(m) || 0) + liq(c)))
}
for (const l of mensal) {
  l.despesaLeilao = r2(l.receita * pctLeilaoSobreReceita)
  l.folha = folhaPorMes.get(l.mes) ?? 0
  l.custoFixo = r2(l.folha + estruturaMes)
  l.lucro = r2(l.receita - l.imposto - l.comissao - l.despesaLeilao - l.custoFixo)
}

const trimestreDe = (m: number) => Math.floor((m - SOCIO_INICIO) / 3) // 0 = jun–ago
const mesPagamento = (tri: number) => SOCIO_INICIO + tri * 3 + 3      // mês seguinte ao fim
const FERIADOS_FIXOS = new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'])
const proxDiaUtil = (iso: string) => {
  const dt = new Date(iso + 'T12:00:00')
  while (dt.getDay() === 0 || dt.getDay() === 6 || FERIADOS_FIXOS.has(dt.toISOString().slice(5, 10))) dt.setDate(dt.getDate() + 1)
  return dt.toISOString().slice(0, 10)
}
const vencimentoTri = (tri: number) => proxDiaUtil(`2026-${String(mesPagamento(tri)).padStart(2, '0')}-25`)
const rotuloTri = (tri: number) => {
  const ini = SOCIO_INICIO + tri * 3
  return `${MES_NOME[ini - 1]}–${MES_NOME[Math.min(ini + 2, 12) - 1]}/2026`
}

// trimestre já corrido (jun–ago): base é o lucro apurado mês a mês
const mesesTri0 = mensal.filter((l) => l.mes >= SOCIO_INICIO && trimestreDe(l.mes) === 0)
const lucroTri0 = r2(mesesTri0.reduce((s, l) => s + l.lucro, 0))
D.socio = {
  pct: SOCIO_PCT,
  inicio: `${MES_NOME[SOCIO_INICIO - 1]}/2026`,
  contrato: 'Marcelo — 35% do lucro, pagos trimestralmente (contrato de 17/07/2026). Participação societária de 15% integralizada no ato, mais 5% por semestre em 4 semestres conforme metas do conselho de sócios.',
  realizado: {
    trimestre: rotuloTri(0),
    meses: mesesTri0.map((l) => ({ mes: l.mes, nome: l.nome, receita: l.receita, lucro: l.lucro })),
    lucro: lucroTri0,
    // sobre prejuízo não há participação — o contrato remunera lucro
    valor: r2(Math.max(lucroTri0, 0) * SOCIO_PCT),
    mesPagamento: MES_NOME[mesPagamento(0) - 1],
    vencimento: vencimentoTri(0),
  },
}
D.socio.parcelaAoMes = r2(D.socio.realizado.valor / 3)

// break-even: quanto de receita e de cobertura o mês precisa gerar para empatar
const be = (fixo: number) => ({
  fixo: r2(fixo),
  receita: r2(fixo / margemPct),
  vgv: r2(fixo / margemPct / takeRate),
})
D.breakEven = {
  antes: be(D.custo.fixoAntes),
  depois: be(D.custo.fixoDepois),
  vgvMedioMes: r2(D.ano.vgv / MESES_ANO),
  receitaMediaMes: r2(receitaAno / MESES_ANO),
}
D.breakEven.deltaReceita = r2(D.breakEven.depois.receita - D.breakEven.antes.receita)
D.breakEven.deltaVgv = r2(D.breakEven.depois.vgv - D.breakEven.antes.vgv)
D.breakEven.folgaAntes = r2(D.breakEven.receitaMediaMes - D.breakEven.antes.receita)
D.breakEven.folgaDepois = r2(D.breakEven.receitaMediaMes - D.breakEven.depois.receita)

/* ══ 6. Setembro a dezembro — o trimestre que decide ══════════════════════ */

// A pergunta real por trás do pedido: a estrutura nova cabe no último
// trimestre? Só há uma régua honesta para o que set–dez pode vender — o que
// 2025 vendeu nesses mesmos meses, corrigido pelo ritmo que 2026 vem
// mostrando. O fator T = (VGV 2026 ÷ VGV 2025) da mesma janela.
const hist = await todos<{ mes: number; vgv: number | null; leiloes: number | null }>(
  'erp_resultados_historico', 'mes,vgv,leiloes', (q) => q.eq('ano', 2026 - 1))
const v25 = new Map(hist.filter((h) => h.mes >= 1 && h.mes <= 12).map((h) => [h.mes, num(h.vgv)]))
const v26 = new Map(mensal.map((m) => [m.mes, m.vgv]))
const somaJanela = (mapa: Map<number, number>, ini: number, fim: number) => {
  let s = 0
  for (let m = ini; m <= fim; m++) s += mapa.get(m) || 0
  return r2(s)
}
// Agosto de 2026 ainda está correndo (o mês fecha em 31/08) e agosto de 2025
// foi o pico do ano — comparar os dois exagera a queda. As janelas param em
// julho, o último mês inteiro dos dois lados.
const fator = (ini: number, fim: number) => r4(somaJanela(v26, ini, fim) / somaJanela(v25, ini, fim))
const T = { janJul: fator(1, 7), maiJul: fator(5, 7), junJul: fator(6, 7), julho: fator(7, 7) }
const setDez25 = somaJanela(v25, 9, 12)
const MESES_TRI = 4

const cenario = (nome: string, t: number, justificativa: string, fixoMes: number) => {
  const vgv = r2(setDez25 * t)
  const receita = r2(vgv * takeRate)
  const margem = r2(receita * margemPct)
  const fixo = r2(fixoMes * MESES_TRI)
  return { nome, T: t, justificativa, vgv, receita, margem, fixo, resultado: r2(margem - fixo) }
}
const CENARIOS: Array<[string, number, string]> = [
  ['Otimista', T.janJul, 'Set–dez repete o ritmo do acumulado jan–jul, a janela mais larga e mais favorável.'],
  ['Base', T.maiJul, 'Usa mai–jul, os três últimos meses inteiros — já carrega a compressão de ticket de 2026.'],
  ['Conservador', T.junJul, 'Só jun–jul, o par mais recente.'],
  ['Como foi julho', T.julho, 'O trimestre roda no ritmo de julho, o pior mês inteiro do ano.'],
]
D.trimestre = {
  setDez25,
  meses: MESES_TRI,
  fatores: T,
  cenarios: CENARIOS.map(([n, t, j]) => cenario(n, t, j, D.custo.fixoDepois)),
  cenariosFolhaAntiga: CENARIOS.map(([n, t, j]) => cenario(n, t, j, D.custo.fixoAntes)),
}
// O fator de equilíbrio: quanto de 2025 o trimestre precisa repetir para o
// resultado ser zero. É a régua que a folha nova moveu.
const tEquilibrio = (fixoMes: number) => r4((fixoMes * MESES_TRI) / margemPct / takeRate / setDez25)
D.trimestre.equilibrio = {
  antes: tEquilibrio(D.custo.fixoAntes),
  depois: tEquilibrio(D.custo.fixoDepois),
  vgvAntes: r2(tEquilibrio(D.custo.fixoAntes) * setDez25),
  vgvDepois: r2(tEquilibrio(D.custo.fixoDepois) * setDez25),
}
D.trimestre.equilibrio.vgvExtra = r2(D.trimestre.equilibrio.vgvDepois - D.trimestre.equilibrio.vgvAntes)

/* ══ 7. Prognóstico mês a mês ═════════════════════════════════════════════ */

// O trimestre somado esconde o que importa: a régua não é a mesma todo mês.
// Setembro e outubro são meses grandes no calendário do leilão; dezembro é o
// menor do ano. Com um custo fixo que não muda, o mesmo R$ 69 mil pesa muito
// mais sobre dezembro — e é lá que a conta aperta primeiro.
const vgvEquilibrioMes = r2(D.custo.fixoDepois / margemPct / takeRate)
const vgvEquilibrioMesAntes = r2(D.custo.fixoAntes / margemPct / takeRate)

D.prognostico = {
  vgvEquilibrioMes,
  vgvEquilibrioMesAntes,
  receitaEquilibrioMes: D.breakEven.depois.receita,
  cenarios: CENARIOS.map(([n, t, j]) => ({ nome: n, T: t, justificativa: j })),
  meses: [] as any[],
}
for (let m = 9; m <= 12; m++) {
  const base25 = v25.get(m) || 0
  const linha: any = {
    mes: m, nome: MES_NOME[m - 1], v25: r2(base25),
    // O fator que ESTE mês precisa entregar para se pagar sozinho. É a régua
    // que interessa: um número por mês, comparável com o que 2026 vem fazendo.
    fatorEquilibrio: base25 > 0 ? r4(vgvEquilibrioMes / base25) : null,
    fatorEquilibrioAntes: base25 > 0 ? r4(vgvEquilibrioMesAntes / base25) : null,
    cenarios: {} as Record<string, any>,
  }
  for (const [nome, t] of CENARIOS.map(([n, t]) => [n, t] as [string, number])) {
    const vgv = r2(base25 * t)
    const receita = r2(vgv * takeRate)
    const margem = r2(receita * margemPct)
    linha.cenarios[nome] = { vgv, receita, margem, resultado: r2(margem - D.custo.fixoDepois) }
  }
  D.prognostico.meses.push(linha)
}
// acumulado por cenário, para ver em que mês a conta vira
for (const [nome] of CENARIOS) {
  let acc = 0
  for (const l of D.prognostico.meses) { acc = r2(acc + l.cenarios[nome].resultado); l.cenarios[nome].acumulado = acc }
}
// o mês mais exigente e o mais folgado, medidos pela régua própria de cada um
const comFator = D.prognostico.meses.filter((l: any) => l.fatorEquilibrio != null)
D.prognostico.mesMaisExigente = comFator.reduce((a: any, b: any) => (b.fatorEquilibrio > a.fatorEquilibrio ? b : a))
D.prognostico.mesMaisFolgado = comFator.reduce((a: any, b: any) => (b.fatorEquilibrio < a.fatorEquilibrio ? b : a))

/* ══ 7b. Os dois compromissos que caem dentro da janela ═══════════════════ */

// Setembro paga a participação do trimestre jun–ago (já apurada) e dezembro
// paga a do trimestre set–nov (que depende do cenário). São saídas que não
// existiam no prognóstico e caem justamente nos dois meses de borda.
const SOCIO_MES = { 9: 'trimestre jun–ago', 12: 'trimestre set–nov' } as Record<number, string>
for (const [nome] of CENARIOS) {
  const lucroTri1 = r2([9, 10, 11]
    .map((m) => D.prognostico.meses.find((l: any) => l.mes === m).cenarios[nome].resultado)
    .reduce((s: number, v: number) => s + v, 0))
  const socioDez = r2(Math.max(lucroTri1, 0) * SOCIO_PCT)
  let acc = 0
  for (const l of D.prognostico.meses) {
    const c = l.cenarios[nome]
    c.socio = l.mes === 9 ? D.socio.realizado.valor : l.mes === 12 ? socioDez : 0
    c.socioRef = SOCIO_MES[l.mes] || null
    c.resultadoComSocio = r2(c.resultado - c.socio)
    acc = r2(acc + c.resultadoComSocio)
    c.acumuladoComSocio = acc
  }
  D.socio[`tri1${nome}`] = { lucro: lucroTri1, valor: socioDez }
}
D.socio.projetado = {
  trimestre: rotuloTri(1),
  mesPagamento: MES_NOME[mesPagamento(1) - 1],
  vencimento: vencimentoTri(1),
  porCenario: CENARIOS.map(([n]) => ({ nome: n, lucro: D.socio[`tri1${n}`].lucro, valor: D.socio[`tri1${n}`].valor })),
}

// A Nane não recebe por leilão: o combinado é acumular tudo e pagar em
// dezembro, o que joga a soma do ano inteiro dentro do mês mais apertado.
const nane = D.comissao.porAssessor.filter((a: any) => /nane/i.test(a.nome))
D.nane = {
  total: r2(nane.reduce((s: number, a: any) => s + a.comissao, 0)),
  participacoes: nane.reduce((s: number, a: any) => s + a.leiloes, 0),
  vencimento: '2026-12-28',
}

/* ══ Grava ═══════════════════════════════════════════════════════════════ */

const OUT = 'outputs/resultado-comercial-2026-08-21'
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(D, null, 1))

const brl = (n: number) => 'R$ ' + Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pc = (n: number) => (n * 100).toFixed(2) + '%'
console.log('dados.json gravado em', OUT)
console.log('  leilões                ', D.apuracao.leiloes, '| com acordo', D.apuracao.comAcordo, '| sem', D.apuracao.semAcordo)
console.log('  vendido (cobertura)    ', brl(D.ano.vgv))
console.log('  receita apurada        ', brl(D.ano.receitaApurada))
console.log('  receita estimada       ', brl(D.ano.receitaEstimada), `(take ${pc(takeRate)})`)
console.log('  a receber              ', brl(D.receber.total), '| vencido', brl(D.receber.vencido))
console.log('  comissão               ', brl(D.ano.comissao), '=', pc(pctComissao), 'da receita')
console.log('  imposto 18%            ', brl(D.ano.imposto))
console.log('  despesa de leilão      ', brl(despLeilaoAno), '=', pc(pctLeilaoSobreReceita), 'da receita')
console.log('  MARGEM DE CONTRIBUIÇÃO ', brl(margemAno), '=', pc(D.cascata.margemPct))
console.log('  custo fixo (8 meses)   ', brl(D.cascata.custoFixoPeriodo))
console.log('  RESULTADO              ', brl(D.cascata.resultado))
console.log('  ---')
console.log('  folha nova             ', brl(folhaNova), '(era', brl(folhaAntes) + ') | periodo', brl(folhaPeriodo))
console.log('  break-even receita/mês ', brl(D.breakEven.antes.receita), '->', brl(D.breakEven.depois.receita))
console.log('  break-even cobertura   ', brl(D.breakEven.antes.vgv), '->', brl(D.breakEven.depois.vgv))
console.log('  receita média/mês      ', brl(D.breakEven.receitaMediaMes), '| folga depois', brl(D.breakEven.folgaDepois))

console.log('  ---')
console.log('  fator T jan-jul', T.janJul, '| mai-jul', T.maiJul, '| jun-jul', T.junJul, '| julho', T.julho)
console.log('  set-dez 2025           ', brl(setDez25))
for (const c of D.trimestre.cenarios) {
  console.log(`  ${c.nome.padEnd(15)} T=${String(c.T).padEnd(6)} vgv ${brl(c.vgv).padStart(16)} margem ${brl(c.margem).padStart(14)} resultado ${brl(c.resultado).padStart(14)}`)
}
console.log('  equilíbrio do trimestre: T', D.trimestre.equilibrio.antes, '->', D.trimestre.equilibrio.depois,
  '| cobertura', brl(D.trimestre.equilibrio.vgvAntes), '->', brl(D.trimestre.equilibrio.vgvDepois))

console.log('  ---')
console.log('  cobertura/mês p/ empatar', brl(D.prognostico.vgvEquilibrioMes), '(era', brl(D.prognostico.vgvEquilibrioMesAntes) + ')')
for (const l of D.prognostico.meses) {
  console.log(`  ${l.nome.padEnd(9)} 2025 ${brl(l.v25).padStart(16)} · precisa de ${(l.fatorEquilibrio * 100).toFixed(1).padStart(5)}% dele`
    + ` · base ${brl(l.cenarios['Base'].resultado).padStart(13)} · acum ${brl(l.cenarios['Base'].acumulado).padStart(13)}`)
}
console.log('  mês mais exigente:', D.prognostico.mesMaisExigente.nome, (D.prognostico.mesMaisExigente.fatorEquilibrio * 100).toFixed(1) + '%')

console.log('  ---')
console.log('  SÓCIO 35% do lucro · trimestre', D.socio.realizado.trimestre, '· lucro', brl(D.socio.realizado.lucro), '→ pagar', brl(D.socio.realizado.valor), 'em', D.socio.realizado.vencimento)
for (const l of D.socio.realizado.meses) console.log(`     ${l.nome.padEnd(9)} lucro ${brl(l.lucro).padStart(14)}`)
for (const c of D.socio.projetado.porCenario) console.log(`  ${D.socio.projetado.trimestre} ${c.nome.padEnd(15)} lucro ${brl(c.lucro).padStart(13)} → ${brl(c.valor).padStart(12)} em dezembro`)
console.log('  NANE acumulada até dezembro:', brl(D.nane.total), `(${D.nane.participacoes} participações)`)
console.log('  --- prognóstico COM os compromissos ---')
for (const l of D.prognostico.meses) {
  const c = l.cenarios['Base']
  console.log(`  ${l.nome.padEnd(9)} base ${brl(c.resultado).padStart(13)} − sócio ${brl(c.socio).padStart(11)} = ${brl(c.resultadoComSocio).padStart(13)} · acum ${brl(c.acumuladoComSocio).padStart(13)}`)
}
