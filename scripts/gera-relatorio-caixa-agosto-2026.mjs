/**
 * Relatorio de posicao de caixa e fluxo projetado — agosto/2026 e 2o semestre.
 *
 * Le TUDO do ERP (Supabase) + historico 2025 (erp_resultados_historico) e emite:
 *   outputs/relatorio-caixa-agosto-2026/dados.json  (todos os numeros do relatorio)
 *   outputs/relatorio-caixa-agosto-2026/relatorio.html
 *   <Desktop>/Bula-Posicao-de-Caixa-e-Cenarios-2026-08-17.pdf
 *
 * Nenhum numero e digitado no HTML: tudo vem do dados.json calculado aqui.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import os from 'os'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const page = async (t, sel, f = q => q) => {
  let a = [], i = 0
  while (true) { const { data, error } = await f(sb.from(t).select(sel)).range(i, i + 999); if (error) throw error; a = a.concat(data); if (data.length < 1000) break; i += 1000 }
  return a
}
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const HOJE = '2026-08-17'
const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000)

const D = {}

/* ---------------- 1. Posicao de caixa ---------------- */
const contas = await page('erp_contas_bancarias', '*')
D.contas = contas.map(c => ({ nome: c.nome, saldo: Number(c.saldo_atual) }))
D.caixa = {
  sicoob: Number(contas.find(c => c.nome.includes('Sicoob')).saldo_atual),
  sicrediCC: Number(contas.find(c => c.nome.includes('Corrente 53609')).saldo_atual),
  sicrediApp: Number(contas.find(c => c.nome.includes('Investimentos')).saldo_atual),
}
D.caixa.consolidado = r2(D.caixa.sicoob + D.caixa.sicrediCC + D.caixa.sicrediApp)
D.caixa.sicrediLiquido = r2(D.caixa.sicrediCC + D.caixa.sicrediApp)

/* ---------------- 2. Titulos ---------------- */
const cps = await page('erp_contas_pagar', 'descricao,valor,valor_pago,vencimento,data_pagamento,status,tags')
const crs = await page('erp_contas_receber', 'descricao,valor,valor_recebido,vencimento,data_recebimento,status,numero_documento')
const saldoCP = c => r2(Number(c.valor) - Number(c.valor_pago || 0))
const saldoCR = c => r2(Number(c.valor) - Number(c.valor_recebido || 0))
const cpAb = cps.filter(c => !['pago', 'cancelado'].includes(c.status))
const crAb = crs.filter(c => !['recebido', 'cancelado'].includes(c.status))
const orc = c => (c.tags || []).includes('orcamento')

/* --- CR de agosto: separa o que tem data firmada pela leiloeira do que e "a cobrar" --- */
const FIRMES = ['BULA-2026-CR-KIRZ-TOUROS-20260707', 'BULA-2026-CR-NELORACO-PO-20260725', 'BULA-2026-CR-KITO-20260509-B2']
const crAgo = crAb.filter(c => c.vencimento > HOJE && c.vencimento <= '2026-08-31')
D.crAgosto = crAgo.map(c => ({
  data: c.vencimento, valor: saldoCR(c), desc: c.descricao,
  firme: FIRMES.includes(c.numero_documento),
})).sort((a, b) => a.data < b.data ? -1 : 1)
D.crAgostoFirme = r2(D.crAgosto.filter(x => x.firme).reduce((s, x) => s + x.valor, 0))
D.crAgostoCobrar = r2(D.crAgosto.filter(x => !x.firme).reduce((s, x) => s + x.valor, 0))
D.crAgostoTotal = r2(D.crAgostoFirme + D.crAgostoCobrar)

/* --- vencidos, por faixa de idade --- */
const venc = crAb.filter(c => c.vencimento <= HOJE)
D.vencidos = venc.map(c => ({ idade: dias(c.vencimento, HOJE), valor: saldoCR(c), desc: c.descricao, data: c.vencimento }))
  .sort((a, b) => b.idade - a.idade)
const faixa = (a, b) => r2(D.vencidos.filter(v => v.idade >= a && v.idade <= b).reduce((s, v) => s + v.valor, 0))
D.aging = [
  { faixa: '1 a 30 dias', valor: faixa(1, 30), n: D.vencidos.filter(v => v.idade <= 30).length },
  { faixa: '31 a 60 dias', valor: faixa(31, 60), n: D.vencidos.filter(v => v.idade > 30 && v.idade <= 60).length },
  { faixa: '61 a 90 dias', valor: faixa(61, 90), n: D.vencidos.filter(v => v.idade > 60 && v.idade <= 90).length },
  { faixa: 'mais de 90 dias', valor: faixa(91, 9999), n: D.vencidos.filter(v => v.idade > 90).length },
]
D.vencidoTotal = r2(D.vencidos.reduce((s, v) => s + v.valor, 0))
D.vencidoDentroPadrao = r2(faixa(1, 60))
D.vencidoForaPadrao = r2(faixa(61, 9999))

/* --- CP de agosto --- */
const cpAgo = cpAb.filter(c => c.vencimento <= '2026-08-31')
const FOLHA_RE = /^Folha Agosto/i
D.folhaAgosto = r2(cpAgo.filter(c => FOLHA_RE.test(c.descricao)).reduce((s, c) => s + saldoCP(c), 0))
D.cpAgostoTotal = r2(cpAgo.reduce((s, c) => s + saldoCP(c), 0))
D.cpAgostoSemFolha = r2(D.cpAgostoTotal - D.folhaAgosto)
D.cpAgostoReal = r2(cpAgo.filter(c => !orc(c)).reduce((s, c) => s + saldoCP(c), 0))
D.cpAgostoOrc = r2(cpAgo.filter(c => orc(c)).reduce((s, c) => s + saldoCP(c), 0))

/* ---------------- 3. Comportamento historico de recebimento e pagamento ---------------- */
const recOk = crs.filter(c => c.status === 'recebido' && c.data_recebimento && c.vencimento)
const atrasos = recOk.map(c => ({ d: dias(c.vencimento, c.data_recebimento), v: Number(c.valor_recebido || c.valor) })).sort((a, b) => a.d - b.d)
const pct = p => atrasos[Math.floor(atrasos.length * p)].d
D.recebimento = {
  n: atrasos.length, p25: pct(0.25), mediana: pct(0.5), p75: pct(0.75), p90: pct(0.90),
  medioPonderado: r2(atrasos.reduce((s, x) => s + x.d * x.v, 0) / atrasos.reduce((s, x) => s + x.v, 0)),
  noPrazoPct: r2(100 * atrasos.filter(x => x.d <= 0).length / atrasos.length),
  ate30Pct: r2(100 * atrasos.filter(x => x.d <= 30).length / atrasos.length),
  maiorAtraso: atrasos[atrasos.length - 1].d,
}
const pgOk = cps.filter(c => c.status === 'pago' && c.data_pagamento && c.vencimento)
const folhaPg = pgOk.filter(c => /^Folha /i.test(c.descricao)).map(c => dias(c.vencimento, c.data_pagamento))
D.folhaAtrasoMediano = folhaPg.sort((a, b) => a - b)[Math.floor(folhaPg.length / 2)]

/* ---------------- 4. Escada diaria 18-31/08 ---------------- */
const evAgo = []
for (const c of crAgo) evAgo.push({ data: c.vencimento, tipo: 'entrada', valor: saldoCR(c), desc: c.descricao, firme: FIRMES.includes(c.numero_documento) })
for (const c of cpAgo) {
  const d = c.vencimento <= HOJE ? '2026-08-18' : c.vencimento   // vencidos: regularizacao assumida em 18/08
  if (FOLHA_RE.test(c.descricao)) continue                        // folha cai em 03/09 (mediana historica)
  evAgo.push({ data: d, tipo: 'saida', valor: saldoCP(c), desc: c.descricao })
}
const porDia = {}
for (const e of evAgo) { porDia[e.data] = porDia[e.data] || { ent: 0, sai: 0, itens: [] }; porDia[e.data][e.tipo === 'entrada' ? 'ent' : 'sai'] += e.valor; porDia[e.data].itens.push(e) }
D.escada = []
let saldo = D.caixa.sicoob
D.escada.push({ data: HOJE, ent: 0, sai: 0, saldo: r2(saldo), label: 'hoje' })
for (let d = 18; d <= 31; d++) {
  const k = '2026-08-' + String(d).padStart(2, '0')
  const x = porDia[k] || { ent: 0, sai: 0, itens: [] }
  saldo += x.ent - x.sai
  D.escada.push({ data: k, ent: r2(x.ent), sai: r2(x.sai), saldo: r2(saldo), itens: x.itens.map(i => ({ t: i.tipo, v: r2(i.valor), d: i.desc })) })
}
D.saldo31 = r2(saldo)
const minDia = D.escada.reduce((m, x) => x.saldo < m.saldo ? x : m)
D.pontoMinimo = { data: minDia.data, saldo: minDia.saldo }

/* --- o titulo critico: maior entrada de agosto --- */
const maiorEntrada = D.crAgosto.reduce((m, x) => x.valor > m.valor ? x : m)
D.tituloCritico = maiorEntrada
const idxCrit = D.escada.findIndex(e => e.data === maiorEntrada.data)
D.saldoSemCritico = r2(D.escada[idxCrit].saldo - maiorEntrada.valor)

/* ---------------- 5. Cenarios de agosto ---------------- */
const base31 = D.saldo31
D.cenariosAgosto = [
  { nome: 'Otimista', chave: 'A',
    desc: 'Tudo o que esta datado entra no prazo e a cobranca recupera 40% dos vencidos de ate 60 dias. Folha de agosto paga em 03/09, como manda o historico.',
    saldo: r2(base31 + D.vencidoDentroPadrao * 0.40), extra: r2(D.vencidoDentroPadrao * 0.40) },
  { nome: 'Base', chave: 'B',
    desc: 'Todos os titulos datados de agosto entram no vencimento; nenhum vencido e recuperado. Folha de agosto paga em 03/09.',
    saldo: r2(base31), extra: 0 },
  { nome: 'Conservador', chave: 'C',
    desc: 'So os titulos com data firmada pela leiloeira entram integralmente; os que estao "a cobrar" entram pela metade. Folha de agosto antecipada para 31/08.',
    saldo: r2(D.caixa.sicoob + D.crAgostoFirme + D.crAgostoCobrar * 0.5 - D.cpAgostoTotal), extra: null },
  { nome: 'Estresse', chave: 'D',
    desc: 'Nenhum titulo "a cobrar" entra em agosto — so os tres ja firmados. Folha paga em 31/08.',
    saldo: r2(D.caixa.sicoob + D.crAgostoFirme - D.cpAgostoTotal), extra: null },
]
D.cenariosAgosto.forEach(c => { c.comSicredi = r2(c.saldo + D.caixa.sicrediLiquido) })

/* ---------------- 6. Setembro ---------------- */
const crSet = crAb.filter(c => c.vencimento >= '2026-09-01' && c.vencimento <= '2026-09-30')
D.setembro = {
  cr: r2(crSet.reduce((s, c) => s + saldoCR(c), 0)),
  crItens: crSet.map(c => ({ data: c.vencimento, valor: saldoCR(c), desc: c.descricao })).sort((a, b) => a.data < b.data ? -1 : 1),
  cpReal: r2(cpAb.filter(c => c.vencimento >= '2026-09-01' && c.vencimento <= '2026-09-30' && !orc(c)).reduce((s, c) => s + saldoCP(c), 0)),
  cpOrc: r2(cpAb.filter(c => c.vencimento >= '2026-09-01' && c.vencimento <= '2026-09-30' && orc(c)).reduce((s, c) => s + saldoCP(c), 0)),
}
const jmp = crSet.filter(c => /JMP/.test(c.descricao)).reduce((s, c) => s + saldoCR(c), 0)
D.setembro.jmp = r2(jmp)
D.setembro.jmpPct = r2(100 * jmp / D.setembro.cr)

/* ---------------- 7. Historico VGV 2025 x 2026 ---------------- */
const hist = await page('erp_resultados_historico', '*', q => q.eq('ano', 2025))
const H = Object.fromEntries(hist.filter(x => x.mes > 0).map(x => [x.mes, x]))
const fech = await page('bula_leilao_fechamento', 'data,vgv_total,lotes_vendidos', q => q.gte('data', '2026-01-01'))
const M26 = {}
fech.forEach(f => { const m = Number(f.data.slice(5, 7)); M26[m] = M26[m] || { n: 0, vgv: 0, lt: 0 }; M26[m].n++; M26[m].vgv += Number(f.vgv_total || 0); M26[m].lt += Number(f.lotes_vendidos || 0) })
D.serie = []
for (let m = 1; m <= 12; m++) {
  D.serie.push({
    mes: m,
    v25: H[m] ? Number(H[m].vgv) : null, ev25: H[m] ? Number(H[m].leiloes) : null, lt25: H[m] ? Number(H[m].lotes) : null,
    v26: M26[m] ? r2(M26[m].vgv) : null, ev26: M26[m] ? M26[m].n : null, lt26: M26[m] ? M26[m].lt : null,
  })
}
const soma = (a, ini, fim, k) => a.filter(x => x.mes >= ini && x.mes <= fim).reduce((s, x) => s + (x[k] || 0), 0)
D.janJul = {
  v26: r2(soma(D.serie, 1, 7, 'v26')), v25: r2(soma(D.serie, 1, 7, 'v25')),
  lt26: soma(D.serie, 1, 7, 'lt26'), lt25: soma(D.serie, 1, 7, 'lt25'),
  ev26: soma(D.serie, 1, 7, 'ev26'), ev25: soma(D.serie, 1, 7, 'ev25'),
}
D.janJul.T = r2(D.janJul.v26 / D.janJul.v25 * 10000) / 10000
D.janJul.rl26 = r2(D.janJul.v26 / D.janJul.lt26)
D.janJul.rl25 = r2(D.janJul.v25 / D.janJul.lt25)
D.janJul.deltaPreco = r2((D.janJul.rl26 / D.janJul.rl25 - 1) * 100)
D.janJul.deltaLotes = r2((D.janJul.lt26 / D.janJul.lt25 - 1) * 100)
D.janJul.deltaVGV = r2((D.janJul.v26 / D.janJul.v25 - 1) * 100)
// decomposicao: efeito volume (lotes) x efeito preco
D.decomp = {
  volume: r2((D.janJul.lt26 - D.janJul.lt25) * D.janJul.rl25),
  preco: r2((D.janJul.rl26 - D.janJul.rl25) * D.janJul.lt26),
}
D.decomp.total = r2(D.decomp.volume + D.decomp.preco)
D.decomp.pctPreco = r2(100 * Math.abs(D.decomp.preco) / (Math.abs(D.decomp.preco) + Math.abs(D.decomp.volume)))
// fatores de nivel alternativos
const T = (ini, fim) => r2(soma(D.serie, ini, fim, 'v26') / soma(D.serie, ini, fim, 'v25') * 10000) / 10000
D.fatores = { janJul: T(1, 7), maiJul: T(5, 7), junJul: T(6, 7), julho: T(7, 7) }

/* ---------------- 8. Agenda e lead time ---------------- */
const cron = await page('cronograma_leiloes', 'data,nome,created_at', q => q.gte('data', '2026-01-01').lte('data', '2026-12-31'))
const leads = cron.filter(x => x.created_at).map(x => ({ mes: Number(x.data.slice(5, 7)), lead: dias(x.created_at.slice(0, 10), x.data) }))
const ls = leads.map(l => l.lead).sort((a, b) => a - b)
D.leadTime = {
  n: ls.length, mediana: ls[Math.floor(ls.length / 2)],
  ate30: r2(100 * ls.filter(x => x <= 30).length / ls.length),
  ate45: r2(100 * ls.filter(x => x <= 45).length / ls.length),
}
D.agenda = []
for (let m = 1; m <= 12; m++) {
  const doMes = cron.filter(x => Number(x.data.slice(5, 7)) === m)
  D.agenda.push({ mes: m, cadastrados: doMes.length, real25: H[m] ? Number(H[m].leiloes) : null })
}
// prova: quantos eventos de julho e agosto existiam 40 dias antes do mes comecar
D.provaCalendario = []
for (const m of [7, 8]) {
  const corte = new Date(Date.UTC(2026, m - 1, 1)); corte.setUTCDate(corte.getUTCDate() - 40)
  const doMes = cron.filter(x => Number(x.data.slice(5, 7)) === m)
  const antes = doMes.filter(x => x.created_at && new Date(x.created_at) <= corte).length
  D.provaCalendario.push({ mes: m, corte: corte.toISOString().slice(0, 10), antes, final: doMes.length })
}

/* ---------------- 9. Estrutura de custo (realizado) ---------------- */
const mv = await page('erp_movimentos_bancarios', 'data,tipo,valor,categoria_id', q => q.eq('conta_bancaria_id', SICOOB).gte('data', '2026-04-01').eq('tipo', 'saida'))
const cats = await page('erp_categorias', 'id,nome')
const CN = Object.fromEntries(cats.map(c => [c.id, c.nome]))
const G_COM = ['Comissão Funcionário', 'Repasse Assessorias/Parceiros']
const G_IMP = ['Impostos e Taxas', 'Encargos Sociais']
const G_LEI = ['Despesa Operacional Leilão', 'REEMBOLSO', 'Viagem/Passagens']
const G_INT = ['Transferencias Internas - Saida', 'Aplicacao Financeira', 'Integralizacao Capital Cooperativa']
const grupo = n => G_COM.includes(n) ? 'comissao' : G_IMP.includes(n) ? 'imposto' : G_LEI.includes(n) ? 'leilao' : G_INT.includes(n) ? 'interno' : 'estrutura'
const cst = {}
mv.forEach(m => { const k = m.data.slice(0, 7), g = grupo(CN[m.categoria_id] || '?'); cst[k] = cst[k] || { comissao: 0, imposto: 0, leilao: 0, estrutura: 0, interno: 0 }; cst[k][g] += Number(m.valor) })
const meses = Object.keys(cst).filter(k => k < '2026-08')
const media = g => r2(meses.reduce((s, k) => s + cst[k][g], 0) / meses.length)
D.custo = {
  porMes: Object.keys(cst).sort().map(k => ({ mes: k, ...Object.fromEntries(Object.entries(cst[k]).map(([a, b]) => [a, r2(b)])) })),
  mediaEstrutura: media('estrutura'), mediaLeilao: media('leilao'),
  mediaComissao: media('comissao'), mediaImposto: media('imposto'),
}
// estrutura projetada: media realizada, com a folha corrigida para o valor atual
D.folhaMensal = r2(cps.filter(c => /^Folha Setembro/i.test(c.descricao)).reduce((s, c) => s + Number(c.valor), 0))
const folhaRealizadaMedia = r2(cps.filter(c => /^Folha (Abril|Maio|Junho|Julho)/i.test(c.descricao) && c.status === 'pago').reduce((s, c) => s + Number(c.valor_pago || c.valor), 0) / 4)
D.custo.estruturaProjetada = r2(D.custo.mediaEstrutura - folhaRealizadaMedia + D.folhaMensal)
D.custo.folhaRealizadaMedia = folhaRealizadaMedia
D.custo.fixoMensal = r2(D.custo.estruturaProjetada + D.custo.mediaLeilao)

/* ---------------- 10. Modelo economico (planilha-mestra) ---------------- */
// Totais 2026 da aba Leiloes da planilha FINANCEIRO BULA 2026 (Drive, versao 13/08/2026)
D.planilha = { faturamento: 192871091.30, cobertura: 21805050, receita: 1406019.59, imposto: 247402.37, comissao: 455240.14, liquido: 677810.08 }
D.modelo = {
  takeRate: r2(D.planilha.receita / D.planilha.cobertura * 1000000) / 1000000,
  pctComissao: r2(D.planilha.comissao / D.planilha.receita * 1000000) / 1000000,
  pctImposto: r2(D.planilha.imposto / D.planilha.receita * 1000000) / 1000000,
}
D.modelo.margemContribuicao = r2((1 - D.modelo.pctComissao - D.modelo.pctImposto) * 1000000) / 1000000
D.modelo.breakEvenMes = r2(D.custo.fixoMensal / D.modelo.margemContribuicao)

/* ---------------- 11. Cenarios set-dez ---------------- */
const v25SetDez = soma(D.serie, 9, 12, 'v25')
D.setDez = { v25: r2(v25SetDez), meses: 4 }
const cen = [
  { nome: 'Otimista', T: D.fatores.janJul, just: 'A cobertura de set-dez repete o fator do acumulado jan-jul.' },
  { nome: 'Base', T: D.fatores.maiJul, just: 'Usa o fator dos ultimos tres meses fechados (mai-jul), que ja captura a compressao de ticket.' },
  { nome: 'Conservador', T: D.fatores.junJul, just: 'Usa so jun-jul, o par mais recente e mais fraco.' },
  { nome: 'Estresse', T: 0.50, just: 'Cobertura cai para metade de 2025 — pior do que qualquer par de meses observado em 2026.' },
]
D.cenariosSetDez = cen.map(c => {
  const vgv = r2(v25SetDez * c.T)
  const receita = r2(vgv * D.modelo.takeRate)
  const contrib = r2(receita * D.modelo.margemContribuicao)
  const fixo = r2(D.custo.fixoMensal * 4)
  return { ...c, vgv, receita, contrib, fixo, resultado: r2(contrib - fixo), receitaMes: r2(receita / 4) }
})
D.setDez.receitaBreakEven = r2(D.custo.fixoMensal * 4 / D.modelo.margemContribuicao)
D.setDez.TBreakEven = r2(D.setDez.receitaBreakEven / (v25SetDez * D.modelo.takeRate) * 10000) / 10000

/* ---------------- 12. Concentracao ---------------- */
const pes = await page('erp_pessoas', 'id,nome')
const PN = Object.fromEntries(pes.map(p => [p.id, p.nome]))
const norm = n => /PROGRAMA/i.test(n) ? 'Programa Leiloes' : /REMATES/i.test(n) ? 'Bula Remates' : /AGRESTE/i.test(n) ? 'Agreste' : n
const crVal = await page('erp_contas_receber', 'valor,status,cliente_id')
const byC = {}
crVal.filter(c => c.status !== 'cancelado').forEach(c => { const n = norm(PN[c.cliente_id] || 'Nao identificado'); byC[n] = (byC[n] || 0) + Number(c.valor) })
const totC = Object.values(byC).reduce((a, b) => a + b, 0)
D.concentracao = Object.entries(byC).sort((a, b) => b[1] - a[1]).map(([nome, v]) => ({ nome, valor: r2(v), pct: r2(100 * v / totC) }))
D.hhi = r2(Object.values(byC).reduce((s, v) => s + Math.pow(v / totC, 2), 0) * 10000) / 10000
D.leiloerasEfetivas = r2(1 / D.hhi * 10) / 10

const OUT = 'outputs/relatorio-caixa-agosto-2026'
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(D, null, 1))
console.log('dados.json gravado.')
console.log('  caixa consolidado      ', D.caixa.consolidado.toFixed(2))
console.log('  saldo 31/08 (base)     ', D.saldo31.toFixed(2))
console.log('  ponto minimo           ', D.pontoMinimo.data, D.pontoMinimo.saldo.toFixed(2))
console.log('  sem o titulo critico   ', D.saldoSemCritico.toFixed(2), '(' + D.tituloCritico.desc.slice(0, 40) + ')')
console.log('  CR setembro            ', D.setembro.cr.toFixed(2), '| JMP', D.setembro.jmpPct + '%')
console.log('  fator T jan-jul        ', D.fatores.janJul, '| mai-jul', D.fatores.maiJul, '| jun-jul', D.fatores.junJul)
console.log('  take-rate              ', (D.modelo.takeRate * 100).toFixed(3) + '%')
console.log('  margem contribuicao    ', (D.modelo.margemContribuicao * 100).toFixed(1) + '%')
console.log('  custo fixo mensal      ', D.custo.fixoMensal.toFixed(2))
console.log('  break-even receita/mes ', D.modelo.breakEvenMes.toFixed(2))
console.log('  T de break-even set-dez', D.setDez.TBreakEven)
D.cenariosSetDez.forEach(c => console.log('   ' + c.nome.padEnd(13), 'T=' + c.T, 'VGV', (c.vgv / 1e6).toFixed(2) + 'mi', 'receita', c.receita.toFixed(0), 'resultado', c.resultado.toFixed(0)))
D.cenariosAgosto.forEach(c => console.log('   ago ' + c.nome.padEnd(13), c.saldo.toFixed(2), '| c/ Sicredi', c.comSicredi.toFixed(2)))
