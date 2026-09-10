/**
 * Apura a projecao de caixa de 10/09 a 30/09/2026 e grava
 * outputs/caixa-setembro-2026-09-10/dados.json.
 *
 * Base: ERP conciliado ate 10/09 (scripts/concilia-2026-09-10.mts) — as tres
 * contas batem ao centavo com os extratos do Sicoob e do Sicredi.
 *
 * REGRA DE ENTRADA: so entra na curva recebivel com DATA sustentada por
 * documento. O Joao disse "o restante ainda nao tenho posicao nem data e esta
 * em fechamento" e depois mandou conferir a planilha do Drive "pra lancar
 * certinho" — entao a fonte das datas e a aba Leiloes da planilha FINANCEIRO
 * BULA 2026 (coluna OBSERVACAO, lida em 10/09/2026 18:48). O que nao tem data
 * aparece no relatorio como contexto, FORA da curva: projetar recebivel sem
 * data e o erro que faz o mes parecer folgado (cr-vencimento-nao-e-data-acordada).
 *
 * MAFRA: nao e mais projecao — CAIU em 10/09 as 17h (85.620,00, PIX de Carlos
 * Alberto M Terra). Ja esta dentro do saldo de abertura.
 *
 * Nada e escrito a mao: todo numero sai do banco ou das listas declaradas
 * abaixo, e cada linha delas carrega a fonte da data.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

const HOJE = '2026-09-10'
const FIM = '2026-09-30'
const RESERVA = 20000
const OUT = 'outputs/caixa-setembro-2026-09-10'

const r2 = n => Math.round(Number(n || 0) * 100) / 100
const all = async (tab, cols) => {
  let out = []
  for (let p = 0; ; p++) {
    const { data, error } = await sb.from(tab).select(cols).range(p * 1000, p * 1000 + 999)
    if (error) throw error
    if (!data?.length) break
    out = out.concat(data)
    if (data.length < 1000) break
  }
  return out
}

// ── caixa ────────────────────────────────────────────────────────────────────
const contas = await sb.from('erp_contas_bancarias').select('id,nome,saldo_atual,tipo').then(r => r.data)
const caixa = {
  contas: contas.map(c => ({ nome: c.nome, tipo: c.tipo, saldo: r2(c.saldo_atual) })).sort((a, b) => b.saldo - a.saldo),
  total: r2(contas.reduce((s, c) => s + Number(c.saldo_atual || 0), 0)),
}

// ── titulos ──────────────────────────────────────────────────────────────────
const pessoas = await all('erp_pessoas', 'id,nome')
const nomeP = id => pessoas.find(p => p.id === id)?.nome || ''
const cps = await all('erp_contas_pagar', 'id,descricao,valor,desconto,juros,multa,valor_pago,vencimento,status,substituido_por,fornecedor_id,tags,origem,apuracao')
const crs = await all('erp_contas_receber', 'id,descricao,valor,desconto,valor_recebido,vencimento,status,substituido_por,cliente_id,nota_fiscal,observacoes')

const vivoCP = t => t.status !== 'cancelado' && t.status !== 'pago' && !t.substituido_por
const saldoCP = t => r2(Number(t.valor) - Number(t.desconto || 0) + Number(t.juros || 0) + Number(t.multa || 0) - Number(t.valor_pago || 0))
const vivoCR = t => t.status !== 'cancelado' && t.status !== 'recebido' && !t.substituido_por
const saldoCR = t => r2(Number(t.valor) - Number(t.desconto || 0) - Number(t.valor_recebido || 0))

const aDefinir = t => /a definir/i.test(String(t.descricao))
const cpAberto = cps.filter(t => vivoCP(t) && saldoCP(t) > 0.005)

const mapCP = t => ({
  id: t.id.slice(0, 8), desc: String(t.descricao), valor: saldoCP(t), venc: t.vencimento,
  fornecedor: nomeP(t.fornecedor_id), aDefinir: aDefinir(t),
  imposto: (t.tags || []).includes('imposto'), comissao: (t.tags || []).includes('comissao') || /comiss/i.test(String(t.descricao)),
})

const naJanela = cpAberto.filter(t => t.vencimento && t.vencimento >= HOJE && t.vencimento <= FIM).map(mapCP)
const atrasados = cpAberto.filter(t => t.vencimento && t.vencimento < HOJE).map(mapCP)
const semData = cpAberto.filter(t => !t.vencimento).map(mapCP)

// ── entradas projetadas ─────────────────────────────────────────────────────
// REGRA: so entra na curva recebivel com DATA sustentada por documento — a
// planilha "FINANCEIRO BULA 2026" do Drive (aba Leiloes, coluna OBSERVACAO,
// lida em 10/09/2026 18:48) ou anuncio da leiloeira. O resto do que ha a
// receber aparece no relatorio como contexto, fora da curva.
const crAberto = crs.filter(t => vivoCR(t) && saldoCR(t) > 0.005)
const acha = pref => { const t = crAberto.find(x => x.id.startsWith(pref)); return t ? { id: pref, desc: String(t.descricao), valor: saldoCR(t), venc: t.vencimento } : null }

// Cada linha carrega a data QUE A PLANILHA DA e a fonte. Onde a planilha e o
// ERP divergem na data, vale a planilha — ela e a posicao do financeiro.
const PLANILHA = [
  { pref: '49a2e0d1', data: '2026-09-18', rot: 'e-Rural — Touros Nelore Sorriso (04/08)', fonte: 'planilha: A RECEBER (venc. de regra 18/09)' },
  { pref: 'fc9c3c74', data: '2026-09-21', rot: 'e-Rural — 2º LS Galeria II (07/08)', fonte: 'planilha: COBRAR — data do ERP (leilão + 45d)' },
  { pref: '2bc9b403', data: '2026-09-25', rot: '20º Guadalupe — touros 19/07 (2ª parcela)', fonte: 'planilha: A RECEBER 2/2 DIA 25/09' },
  { pref: 'd4fb3071', data: '2026-09-25', rot: '20º Guadalupe — touros 20/07 (2ª parcela)', fonte: 'planilha: A RECEBER 2/2 DIA 25/09' },
  { pref: '19ac2940', data: '2026-09-25', rot: 'Terra Brava — touros provados (3ª parcela)', fonte: 'planilha: A RECEBER 25/09' },
  { pref: 'ab6574a9', data: '2026-09-26', rot: '23º Genética Aditiva — fêmeas (2ª parcela)', fonte: 'planilha: A RECEBER 2/2 26/09' },
  { pref: '07df3346', data: '2026-09-26', rot: '23º Genética Aditiva — touros (2ª parcela)', fonte: 'planilha: A RECEBER 2/2 26/09' },
  { pref: '0392b9b1', data: '2026-09-27', rot: 'e-Rural — Essência Genética Nelore da Bambú (13/08)', fonte: 'planilha: A RECEBER (venc. de regra 27/09)' },
]

// Vencidos COM data na planilha: existem, tem data, e a data ja passou.
// Ficam FORA da curva de proposito — projetar atraso e o que faz o mes mentir.
const VENCIDOS_COM_DATA = [
  { pref: '54128961', data: '2026-09-01', rot: 'e-Rural — Nelore Sorriso fêmeas (12/07)', fonte: 'planilha: A RECEBER l 01/09' },
  { pref: 'a33595fc', data: '2026-09-04', rot: 'Santa Nazaré Excelência (parcela 1/2)', fonte: 'planilha: A RECEBER 04/09' },
]

const entradas = PLANILHA.map(l => { const t = acha(l.pref); return t && { ...l, valor: t.valor, desc: t.desc, vencErp: t.venc } })
  .filter(Boolean).sort((a, b) => a.data.localeCompare(b.data))
const vencidosReceber = VENCIDOS_COM_DATA.map(l => { const t = acha(l.pref); return t && { ...l, valor: t.valor, desc: t.desc, vencErp: t.venc } }).filter(Boolean)

// Mafra: JA RECEBIDO em 10/09 (85.620,00, PIX de Carlos Alberto M Terra).
// Fica registrado como fato do dia, nao como projecao.
const mafra = {
  recebido: 85620.00, data: '2026-09-10', erp: 88202.00, desconto: 2582.00,
  nota: 'PIX de CARLOS ALBERTO M TERRA (pessoa física, não o CNPJ da leiloeira). Quitou as duas etapas: fêmeas 70.345,00 integral e touros 15.275,00 contra 17.857,00 lançados — a tabela do Mafra para 3–8% de cobertura é 0,3% do VGV (15.306,00) e não os 0,35% que o título trazia. Sobram 31,00 sem explicação.',
}

// ── curva ────────────────────────────────────────────────────────────────────
const dias = []
for (let d = new Date(HOJE + 'T12:00:00Z'); d <= new Date(FIM + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) dias.push(d.toISOString().slice(0, 10))

function curva(extraSaidas = []) {
  let saldo = caixa.total
  const pts = []
  for (const dia of dias) {
    const ent = r2(entradas.filter(e => e.data === dia).reduce((s, e) => s + e.valor, 0))
    const sai = r2(naJanela.filter(t => t.venc === dia).reduce((s, t) => s + t.valor, 0)
      + extraSaidas.filter(e => e.data === dia).reduce((s, e) => s + e.valor, 0))
    saldo = r2(saldo + ent - sai)
    pts.push({ dia, entrada: ent, saida: sai, saldo })
  }
  return pts
}

const somaEntradas = r2(entradas.reduce((s, e) => s + e.valor, 0))
const somaSaidas = r2(naJanela.reduce((s, t) => s + t.valor, 0))
const somaAtrasados = r2(atrasados.reduce((s, t) => s + t.valor, 0))
const somaSemData = r2(semData.reduce((s, t) => s + t.valor, 0))

// Repasse ao Bulinha fechado em 10/09: JMP + comissao - 1/2 ISS.
const BULINHA_PREFS = ['637f0a9e', '523e404a', '3a138ee8']
const BULINHA = {
  titulos: naJanela.filter(t => BULINHA_PREFS.includes(t.id)),
  total: r2(naJanela.filter(t => BULINHA_PREFS.includes(t.id)).reduce((s, t) => s + t.valor, 0)),
}

const MARCELO = semData.find(t => /MARCELO CARNEIRO/i.test(t.desc))
const FELIPE = naJanela.find(t => /Repasse JMP/i.test(t.desc))

const cenarios = [
  { chave: 'BASE', rot: 'Como está', desc: 'Só o que tem data: entra Mafra e e-Rural, sai tudo que vence de 10 a 30/09.', extra: [] },
  { chave: 'ATRASADOS', rot: '+ atrasados', desc: 'Paga também os ' + atrasados.length + ' títulos já vencidos (o mais velho de 25/03).', extra: [{ data: HOJE, valor: somaAtrasados }] },
  { chave: 'MARCELO', rot: '+ Marcelo', desc: 'Paga o sócio Marcelo (35% do lucro do 1º trimestre) além dos atrasados.', extra: [{ data: HOJE, valor: somaAtrasados }, { data: HOJE, valor: MARCELO?.valor || 0 }] },
].map(c => {
  const pts = curva(c.extra)
  const min = pts.reduce((m, p) => (p.saldo < m.saldo ? p : m), pts[0])
  return { ...c, extra: undefined, pontos: pts, fecha: pts[pts.length - 1].saldo, min: min.saldo, minDia: min.dia, cabe: r2(min.saldo - RESERVA) }
})

// alavancas: o que existe e nao esta na curva
const somaADefinir = r2(naJanela.filter(t => t.aDefinir).reduce((s, t) => s + t.valor, 0))
const somaVencidosReceber = r2(vencidosReceber.reduce((s, t) => s + t.valor, 0))
// o que ha a receber e NAO entra na curva: sem data, "em fechamento"
const naCurva = new Set([...PLANILHA, ...VENCIDOS_COM_DATA].map(l => l.pref))
const semPosicao = crAberto.filter(t => ![...naCurva].some(p => t.id.startsWith(p)))
  .map(t => ({ id: t.id.slice(0, 8), desc: String(t.descricao), valor: saldoCR(t), venc: t.vencimento }))
  .sort((a, b) => b.valor - a.valor)
const somaSemPosicao = r2(semPosicao.reduce((s, t) => s + t.valor, 0))

// blocos de saida por data, com composicao
const porDia = {}
for (const t of naJanela) (porDia[t.venc] ||= []).push(t)
const blocos = Object.entries(porDia).map(([dia, ts]) => ({
  dia, n: ts.length, valor: r2(ts.reduce((s, t) => s + t.valor, 0)),
  maiores: ts.sort((a, b) => b.valor - a.valor).slice(0, 3).map(t => ({ desc: t.desc, valor: t.valor })),
})).sort((a, b) => a.dia.localeCompare(b.dia))

// 25/09 por beneficiario
const d25 = naJanela.filter(t => t.venc === '2026-09-25')
const benef = {}
for (const t of d25) {
  const m = /Comissão\s+(?:A definir:\s*)?([^—]+?)\s+—/.exec(t.desc) || /COMISSAO .*? - ([A-ZÁÉÍÓÚÂÊÔÃÕÇ.\/ ()]+?)\s*\(/.exec(t.desc)
  let b = (m?.[1] || t.fornecedor || 'outros').trim().replace(/\s+/g, ' ')
  b = b.replace(/^(A definir:\s*)/i, '').trim()
  const canon = /rusa/i.test(b) ? 'Gustavo Rusa' : /douglas/i.test(b) ? 'Douglas Bispo' : /f[áa]bio/i.test(b) ? 'Fábio Omena'
    : /leonardo/i.test(b) ? 'Leonardo Serafim' : /peralta/i.test(b) ? 'Peralta' : /nane/i.test(b) ? 'Nane'
      : /laila/i.test(b) ? 'Laila' : /felipe/i.test(b) ? 'Felipe Andrade' : b
  benef[canon] = r2((benef[canon] || 0) + t.valor)
}
const d25Benef = Object.entries(benef).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor)

const impostos = naJanela.filter(t => t.imposto || /simples|issqn|das /i.test(t.desc))

const dados = {
  hoje: HOJE, fim: FIM, reserva: RESERVA, geradoEm: new Date().toISOString(),
  caixa,
  felipe: FELIPE ? { valor: FELIPE.valor, desc: FELIPE.desc, venc: FELIPE.venc } : null,
  caixaProprio: r2(caixa.total - (FELIPE?.valor || 0)),
  mafra,
  entradas, somaEntradas, somaSaidas, somaAtrasados, somaSemData,
  vencidosReceber, somaVencidosReceber, semPosicao, somaSemPosicao,
  naJanela, atrasados, semData, blocos, d25Benef, impostos,
  marcelo: MARCELO || null, bulinha: BULINHA,
  cenarios, dias,
  alavancas: { aDefinir: somaADefinir, nADefinir: naJanela.filter(t => t.aDefinir).length, vencidosReceber: somaVencidosReceber, semPosicao: somaSemPosicao, nSemPosicao: semPosicao.length },
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(dados, null, 1))

const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
console.log('Caixa em ' + HOJE + ' ......... ' + brl(caixa.total) + '  (proprio ' + brl(dados.caixaProprio) + ')')
console.log('Entradas projetadas ....... ' + brl(somaEntradas) + ' em ' + entradas.length + ' titulos com data')
console.log('Vencidos a receber ........ ' + brl(somaVencidosReceber) + ' (fora da curva)')
console.log('Sem posicao/em fechamento . ' + brl(somaSemPosicao) + ' em ' + semPosicao.length + ' (fora da curva)')
console.log('Saidas 10-30/09 ........... ' + brl(somaSaidas) + ' em ' + naJanela.length + ' titulos')
console.log('Atrasados ................. ' + brl(somaAtrasados) + ' em ' + atrasados.length)
console.log('Sem vencimento ............ ' + brl(somaSemData) + ' em ' + semData.length + ' (Marcelo ' + brl(MARCELO?.valor || 0) + ')')
console.log('')
for (const c of cenarios) console.log('  ' + c.rot.padEnd(14) + ' fecha ' + brl(c.fecha).padStart(13) + '  |  minimo ' + brl(c.min).padStart(13) + ' em ' + c.minDia + '  |  cabe ' + brl(c.cabe).padStart(13))
console.log('')
console.log('Mafra RECEBIDO em 10/09: ' + brl(mafra.recebido) + ' (ERP tinha ' + brl(mafra.erp) + ', desconto ' + brl(mafra.desconto) + ')')
console.log('Repasse ao Bulinha 10/09: ' + brl(BULINHA.total) + ' em ' + BULINHA.titulos.length + ' titulos')
console.log('OK -> ' + path.join(OUT, 'dados.json'))
