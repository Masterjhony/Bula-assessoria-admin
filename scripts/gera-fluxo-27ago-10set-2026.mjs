/**
 * Fluxo de caixa e posicao de caixa 27/08 -> 10/09/2026.  (v2, 27/08 fim da tarde)
 *
 * Pergunta do chefe: com o Kito e o Nelore Sorriso entrando ate o fim de agosto e
 * o Navirai em 10/09, o caixa atravessa a folha de 05/09?
 *
 * ⚠ A v1 deste relatorio errou o lado das SAIDAS e o chefe apontou. O que mudou:
 *
 *   1. NADA SAI ATE 31/08. Palavra dele: "nao vai ter saida programada ate o fim
 *      desse mes". A v1 realocava todo titulo vencido para o primeiro dia da
 *      janela — isso e o gerador decidindo por quem paga.
 *   2. COMISSOES DE JULHO FORA. 16.809,00 em 13 titulos `real` vencidos em 25/08.
 *      Decisao adiada pelo chefe; saem do relatorio, ficam no quadro de aberto.
 *   3. ESTIMATIVA DO ERP FORA. Todo CP `origem='estimativa'` que nao e folha:
 *      9.045,20 em 8 titulos (Melhoradores 3.200, FGTS jul e ago, marketing,
 *      contador, site, tarifas, cooperativa). Palavra dele: "o que for de fato eu
 *      lanco". Eles nao somem da vida — somem da PROJECAO, e o custo que eles
 *      tentavam representar volta pela media historica, que e medida e nao chutada.
 *   4. A FOLHA FICA, apesar de estar gravada como `estimativa`. Ela nao e
 *      orcamento: e reflexo do cadastro `erp_folha_estrutura`, conferido por
 *      `npx tsx scripts/reprojeta-folha.mts` (45 titulos, sem divergencia). E o
 *      chefe pediu expressamente para projeta-la.
 *   5. DESPESA DE LEILAO CAI DEPOIS DO PREGAO, nao no dia. A v1 dizia isso no
 *      texto e lancava no dia — incoerencia minha. Regra unica agora: pregao + 10
 *      dias (dentro da faixa de 1 a 3 semanas observada no extrato).
 *
 * O criterio virou SIMETRICO nos dois lados: so entra recebivel que o chefe
 * declarou firme, e so sai obrigacao com data que alguem prometeu. O resto —
 * dos dois lados — vai para quadro proprio, visivel, fora da linha do caixa.
 *
 * Ancoras: Sicoob 33.764,45 conciliado 1:1 com o extrato de 27/08 15h48;
 * Sicredi 12.598,64 (ultima posicao do ERP, extrato nunca importado).
 *
 * Grava outputs/fluxo-27ago-10set-2026/dados.json. Nenhum numero no template.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const page = async (t, sel, f = q => q) => {
  let a = [], i = 0
  for (;;) { const { data, error } = await f(sb.from(t).select(sel)).range(i, i + 999); if (error) throw error; a = a.concat(data); if (data.length < 1000) break; i += 1000 }
  return a
}
const r2 = n => Math.round(Number(n || 0) * 100) / 100
const HOJE = '2026-08-27'
const FIM = '2026-09-10'
const NADA_ATE = '2026-08-31'     // regra do chefe: nada sai ate o fim de agosto
const LAG_LEILAO = 10             // dias entre o pregao e a saida de caixa do presencial
const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000)
const CAL = []
for (let d = HOJE; d <= FIM; d = addDias(d, 1)) CAL.push(d)

const D = { hoje: HOJE, fim: FIM, nadaAte: NADA_ATE, lagLeilao: LAG_LEILAO, dias: CAL.length - 1, calendario: CAL }

/* ================= 1. Caixa de partida ================= */
const contas = await page('erp_contas_bancarias', '*')
const acha = f => Number((contas.find(c => f(String(c.nome || ''))) || {}).saldo_atual || 0)
D.caixa = {
  sicoob: acha(n => /Sicoob/i.test(n)),
  sicrediCC: acha(n => /Corrente 53609/i.test(n)),
  sicrediApp: acha(n => /Investimentos/i.test(n)),
  saldoExtrato: 33764.45,
}
D.caixa.sicredi = r2(D.caixa.sicrediCC + D.caixa.sicrediApp)
D.caixa.inicial = r2(D.caixa.sicoob + D.caixa.sicredi)
D.caixa.confere = Math.abs(D.caixa.sicoob - D.caixa.saldoExtrato) < 0.005
if (!D.caixa.confere) throw new Error('Sicoob do ERP (' + D.caixa.sicoob + ') nao bate com o extrato de 27/08 (33.764,45) — conciliar antes de projetar')

/* ================= 2. Entradas — SOMENTE o que o chefe declarou firme ======= */
const cr = await page('erp_contas_receber', 'id,descricao,valor,valor_recebido,status,vencimento,nota_fiscal')
const vivo = c => ['aberto', 'vencido', 'parcial'].includes(c.status)
const falta = c => r2(Number(c.valor) - Number(c.valor_recebido || 0))
const acheCR = re => {
  const hit = cr.filter(c => vivo(c) && re.test(c.descricao || ''))
  if (!hit.length) throw new Error('nenhum CR vivo casa com ' + re)
  return hit
}
const kito = acheCR(/KITO.*\(2\/2\)/i)
const sorriso = acheCR(/SORRISO.*ETAPA FEMEAS/i)
const navirai = acheCR(/NAVIRAI/i).filter(c => c.vencimento === '2026-09-10')
if (kito.length !== 1 || sorriso.length !== 1) throw new Error('Kito/Sorriso ambiguos')
if (navirai.length !== 2) throw new Error('esperava 2 titulos do Navirai vencendo em 10/09, achei ' + navirai.length)

D.entradas = [
  { data: kito[0].vencimento, rot: 'Leilão 09/05 — KITO, parcela 2/2', valor: falta(kito[0]), id: kito[0].id, nota: 'vencimento do próprio título' },
  { data: '2026-08-31', rot: 'Nelore Sorriso — Etapa Fêmeas (12/07)', valor: falta(sorriso[0]), id: sorriso[0].id, nota: 'NF 635 — valor retificado em 27/08; portal da e-Rural marca "aguardando pagamento"' },
  ...navirai.sort((a, b) => Number(b.valor) - Number(a.valor)).map(c => ({
    data: '2026-09-10', rot: c.descricao.replace(/ - COMISSAO BULA.*$/i, ''), valor: falta(c), id: c.id, nota: 'vence 10/09; o chefe confirmou o pagamento na data',
  })),
]
D.entradasTotal = r2(D.entradas.reduce((s, e) => s + e.valor, 0))

D.emTratativa = cr.filter(vivo).filter(c => !D.entradas.some(e => e.id === c.id))
  .map(c => ({ id: c.id, rot: c.descricao, valor: falta(c), vencimento: c.vencimento, status: c.status }))
  .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
D.emTratativaTotal = r2(D.emTratativa.reduce((s, c) => s + c.valor, 0))
D.vencidoTotal = r2(D.emTratativa.filter(c => c.vencimento < HOJE).reduce((s, c) => s + c.valor, 0))

/* ================= 3. Saidas — o que entra no fluxo e o que fica de fora ==== */
const cats = await page('erp_categorias', 'id,nome,tipo,dre_grupo')
const CN = Object.fromEntries(cats.map(c => [c.id, c.nome]))
const cp = await page('erp_contas_pagar', 'id,descricao,valor,valor_pago,status,vencimento,origem,tags,categoria_id,substituido_por')
const cpVivo = cp.filter(c => ['aberto', 'vencido', 'parcial'].includes(c.status) && !c.substituido_por && !(c.tags || []).includes('retido-por-decisao'))
const faltaCP = c => r2(Number(c.valor) - Number(c.valor_pago || 0))
const ehFolha = c => CN[c.categoria_id] === 'Folha de Pagamento'

const naJanela = cpVivo.filter(c => c.vencimento <= FIM)
// (a) Divida REAL vencida sem data de pagamento acordada — as comissoes de julho.
//     Fica fora do fluxo por decisao do chefe, mas e obrigacao de verdade.
D.abertoSemData = naJanela.filter(c => c.vencimento < HOJE && c.origem === 'real')
  .map(c => ({ rot: c.descricao, valor: faltaCP(c), vencimento: c.vencimento, categoria: CN[c.categoria_id] || '?', origem: c.origem }))
  .sort((a, b) => b.valor - a.valor)
D.abertoSemDataTotal = r2(D.abertoSemData.reduce((s, x) => s + x.valor, 0))
// (b) Estimativa do ERP que nao e folha — vencida ou nao. Fora do fluxo: o custo
//     que ela tentava representar volta pela media historica, que e medida.
D.estimativasFora = naJanela.filter(c => c.origem === 'estimativa' && !ehFolha(c))
  .map(c => ({ rot: c.descricao, valor: faltaCP(c), vencimento: c.vencimento, categoria: CN[c.categoria_id] || '?' }))
  .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
D.estimativasForaTotal = r2(D.estimativasFora.reduce((s, x) => s + x.valor, 0))
// (c) O que sobra e entra no fluxo: folha + qualquer CP real com data na janela.
D.saidasLancadas = naJanela
  .filter(c => c.vencimento >= HOJE && c.vencimento > NADA_ATE && (ehFolha(c) || c.origem === 'real'))
  .map(c => ({ data: c.vencimento, vencimento: c.vencimento, rot: c.descricao, valor: faltaCP(c), categoria: CN[c.categoria_id] || '?', origem: c.origem }))
  .sort((a, b) => a.data.localeCompare(b.data))
D.saidasLancadasTotal = r2(D.saidasLancadas.reduce((s, x) => s + x.valor, 0))
D.blocos = {
  folha: r2(D.saidasLancadas.filter(x => x.categoria === 'Folha de Pagamento').reduce((s, x) => s + x.valor, 0)),
  outrosReais: r2(D.saidasLancadas.filter(x => x.categoria !== 'Folha de Pagamento').reduce((s, x) => s + x.valor, 0)),
}

/* ================= 4. Saidas — o custo que nunca vira conta a pagar ======== */
const mvS = await page('erp_movimentos_bancarios', 'data,tipo,valor,descricao,categoria_id',
  q => q.eq('conta_bancaria_id', SICOOB).eq('tipo', 'saida'))
const FORA_DO_CORRENTE = new Set(['Comissões', 'Impostos e Taxas', 'Folha de Pagamento', 'Transferencias Internas - Saida',
  'Encargos Sociais', 'Remuneracao de Socio', 'Repasse Assessorias/Parceiros', 'Imposto sobre Receita (18%)', 'Aplicacao Financeira', 'SALÁRIOS'])
const LEILAO = new Set(['Despesa Operacional Leilão', 'Viagem/Passagens'])
const mes = d => String(d).slice(0, 7)
const somaMes = filtro => {
  const o = {}
  for (const m of mvS) { const n = CN[m.categoria_id] || ''; if (!filtro(n)) continue; const k = mes(m.data); o[k] = r2((o[k] || 0) + Number(m.valor)) }
  return o
}
const estrutural = somaMes(n => !FORA_DO_CORRENTE.has(n) && !LEILAO.has(n))
const leilaoHist = somaMes(n => LEILAO.has(n))

const BASE_EST = ['2026-07', '2026-08']
D.premissas = {}
D.premissas.estrutural = {
  serie: Object.keys(estrutural).sort().map(k => ({ mes: k, valor: estrutural[k] })),
  media: r2(BASE_EST.reduce((s, k) => s + (estrutural[k] || 0), 0) / BASE_EST.length),
}
D.premissas.estrutural.porDia = r2(D.premissas.estrutural.media / 30)

const agenda = await page('bula_leiloes', 'id,nome,data,modelo,status,local,leiloeira')
const ehPresencial = a => String(a.modelo || '').toUpperCase() === 'PRESENCIAL' && ['concluido', 'confirmado'].includes(a.status)
const presPorMes = {}
for (const a of agenda) if (ehPresencial(a)) { const k = mes(a.data); presPorMes[k] = (presPorMes[k] || 0) + 1 }
const BASE_LEI = ['2026-06', '2026-07', '2026-08']
const leiValor = r2(BASE_LEI.reduce((s, k) => s + (leilaoHist[k] || 0), 0))
const leiQtd = BASE_LEI.reduce((s, k) => s + (presPorMes[k] || 0), 0)
D.premissas.leilao = {
  meses: BASE_LEI.map(k => ({ mes: k, valor: leilaoHist[k] || 0, presenciais: presPorMes[k] || 0 })),
  total: leiValor, presenciais: leiQtd, porPresencial: r2(leiValor / leiQtd),
}

// Presenciais cujo CAIXA cai dentro da janela: pregao + LAG_LEILAO <= FIM.
D.presenciais = agenda.filter(ehPresencial).filter(a => a.data >= '2026-08-20' && a.data <= FIM)
  .sort((a, b) => a.data.localeCompare(b.data))
  .map(a => ({ nome: a.nome, data: a.data, local: a.local, caixa: addDias(a.data, LAG_LEILAO) }))
  .map(p => ({ ...p, dentro: p.caixa > NADA_ATE && p.caixa <= FIM && p.data >= HOJE }))
D.presenciaisDentro = D.presenciais.filter(p => p.dentro)

const reemb = mvS.filter(m => /reembols/i.test(m.descricao || ''))
const reembMes = {}
for (const m of reemb) { const k = mes(m.data); reembMes[k] = r2((reembMes[k] || 0) + Number(m.valor)) }
D.premissas.reembolso = {
  serie: Object.keys(reembMes).sort().map(k => ({ mes: k, valor: reembMes[k] })),
  ultimos: reemb.filter(m => m.data >= '2026-07-01').sort((a, b) => a.data.localeCompare(b.data))
    .map(m => ({ data: m.data, valor: Number(m.valor), rot: m.descricao })),
  fatiaDoLeilao: r2(BASE_LEI.reduce((s, k) => s + (reembMes[k] || 0), 0) / leiValor),
}

/* --- monta as saidas projetadas --- */
D.saidasProjetadas = []
for (const p of D.presenciaisDentro) {
  D.saidasProjetadas.push({
    data: p.caixa, rot: 'Despesa e reembolso do presencial — ' + p.nome, valor: D.premissas.leilao.porPresencial,
    categoria: 'Despesa Operacional Leilão', tipo: 'projetado', pregao: p.data,
  })
}
// Estrutural: media diaria, so a partir de 01/09 (nada sai ate 31/08).
const INICIO_EST = addDias(NADA_ATE, 1)
const diasEst = dias(NADA_ATE, FIM)
D.premissas.estrutural.diasProjetados = diasEst
D.premissas.estrutural.aProjetar = r2(D.premissas.estrutural.porDia * diasEst)
for (let i = 0; i < diasEst; i++) {
  D.saidasProjetadas.push({
    data: addDias(INICIO_EST, i), rot: 'Custo estrutural corrente (diluído)', valor: D.premissas.estrutural.porDia,
    categoria: 'Estrutura', tipo: 'projetado', oculto: true,
  })
}
D.saidasProjetadasTotal = r2(D.saidasProjetadas.reduce((s, x) => s + x.valor, 0))
D.saidasTotal = r2(D.saidasLancadasTotal + D.saidasProjetadasTotal)

/* ================= 5. Linha do caixa, dia a dia ============================ */
function linha({ soSicoob = false, naviraiMetade = false, atrasoDias = 0, comissoesEm = null } = {}) {
  let saldo = soSicoob ? D.caixa.sicoob : D.caixa.inicial
  const pts = []
  const ent = D.entradas.map(e => ({ ...e, data: atrasoDias ? addDias(e.data, atrasoDias) : e.data }))
  const menor = [...D.entradas].filter(e => e.data === '2026-09-10').sort((a, b) => a.valor - b.valor)[0]
  for (const d of CAL) {
    const entra = r2(ent.filter(e => e.data === d && !(naviraiMetade && e.id === menor.id)).reduce((s, e) => s + e.valor, 0))
    let sai = r2(D.saidasLancadas.filter(x => x.data === d).reduce((s, x) => s + x.valor, 0)
      + D.saidasProjetadas.filter(x => x.data === d).reduce((s, x) => s + x.valor, 0))
    if (comissoesEm === d) sai = r2(sai + D.abertoSemDataTotal)
    saldo = r2(saldo + entra - sai)
    pts.push({ data: d, entra, sai, saldo })
  }
  return pts
}
D.cenarios = [
  { chave: 'BASE', rot: 'Base', desc: 'Nada sai até 31/08. Entram Kito, Sorriso e Naviraí; saem a folha de 05/09 e a despesa dos dois presenciais, com o atraso de caixa que ela tem na prática.' },
  { chave: 'SO_SICOOB', rot: 'Só o Sicoob', desc: 'Ignora a aplicação do Sicredi, cujo extrato nunca foi importado — é o piso defensável do caixa.', opts: { soSicoob: true } },
  { chave: 'NAVIRAI_1', rot: 'Naviraí parcial', desc: 'Se "Naviraí" for só um dos dois títulos que vencem em 10/09, entra apenas o maior.', opts: { naviraiMetade: true } },
  { chave: 'ATRASO_5', rot: 'Tudo 5 dias atrasado', desc: 'As três promessas de recebimento escorregam 5 dias — o Naviraí cai fora da janela.', opts: { atrasoDias: 5 } },
  { chave: 'COM_JULHO', rot: 'Se as comissões de julho saírem em 05/09', desc: 'Sensibilidade, não previsão: os R$ 16.809,00 que ficaram fora do relatório entrando junto com a folha.', opts: { comissoesEm: '2026-09-05' } },
]
D.linhas = {}
for (const c of D.cenarios) {
  const pts = linha(c.opts || {})
  D.linhas[c.chave] = pts
  const fundo = pts.reduce((a, p) => (p.saldo < a.saldo ? p : a), pts[0])
  Object.assign(c, {
    final: pts[pts.length - 1].saldo, fundo: fundo.saldo, fundoData: fundo.data,
    diasNegativos: pts.filter(p => p.saldo < 0).length,
    entradas: r2(pts.reduce((s, p) => s + p.entra, 0)), saidas: r2(pts.reduce((s, p) => s + p.sai, 0)),
  })
}

/* ================= 6. Margem e o que a consome ============================= */
const base = D.linhas.BASE
D.margem = { fundo: D.cenarios[0].fundo, fundoData: D.cenarios[0].fundoData, final: D.cenarios[0].final }
D.consomeMargem = [
  { rot: 'Comissões de julho em aberto', valor: D.abertoSemDataTotal, nota: D.abertoSemData.length + ' títulos vencidos em 25/08 — decisão adiada' },
  { rot: 'Estimativas do ERP retiradas', valor: D.estimativasForaTotal, nota: D.estimativasFora.length + ' títulos de orçamento; o custo real volta pela média' },
  { rot: 'Despesa do presencial do Jacamin', valor: D.premissas.leilao.porPresencial, nota: 'pregão 05/09, caixa projetado para ' + addDias('2026-09-05', LAG_LEILAO) + ' — fora da janela' },
].sort((a, b) => b.valor - a.valor)
D.consomeMargemTotal = r2(D.consomeMargem.reduce((s, x) => s + x.valor, 0))
D.candidatos = D.emTratativa.filter(c => c.vencimento < HOJE).sort((a, b) => b.valor - a.valor).slice(0, 6)

/* ================= 7. O que vem logo depois da janela ====================== */
const depois = cpVivo.filter(c => c.vencimento > FIM && c.vencimento <= '2026-09-30')
D.logoDepois = depois.map(c => ({ data: c.vencimento, rot: c.descricao, valor: faltaCP(c), categoria: CN[c.categoria_id] || '?' }))
  .sort((a, b) => a.data.localeCompare(b.data))
D.logoDepoisTotal = r2(D.logoDepois.reduce((s, x) => s + x.valor, 0))
const jmp = cr.filter(vivo).filter(c => /JMP/i.test(c.descricao || ''))
D.jmp = jmp.map(c => ({ rot: c.descricao, valor: falta(c), vencimento: c.vencimento }))
D.jmpTotal = r2(D.jmp.reduce((s, c) => s + c.valor, 0))

/* ================= grava ================= */
const OUT = 'outputs/fluxo-27ago-10set-2026'
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(D, null, 2))

const brl = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
console.log('Caixa inicial ............ ' + brl(D.caixa.inicial) + '  (Sicoob ' + brl(D.caixa.sicoob) + ' + Sicredi ' + brl(D.caixa.sicredi) + ')')
console.log('Entradas firmes .......... ' + brl(D.entradasTotal) + '  em ' + D.entradas.length + ' títulos')
console.log('Saídas no fluxo .......... ' + brl(D.saidasTotal) + '  (folha ' + brl(D.blocos.folha) + ' + leilão ' + brl(r2(D.premissas.leilao.porPresencial * D.presenciaisDentro.length)) + ' + estrutural ' + brl(D.premissas.estrutural.aProjetar) + ')')
console.log('FORA do fluxo ............ comissões julho ' + brl(D.abertoSemDataTotal) + ' | estimativas do ERP ' + brl(D.estimativasForaTotal))
console.log('')
for (const c of D.cenarios) console.log('  ' + c.rot.padEnd(40) + ' final ' + brl(c.final).padStart(12) + ' | fundo ' + brl(c.fundo).padStart(12) + ' em ' + c.fundoData + ' | ' + c.diasNegativos + ' dia(s) negativo(s)')
console.log('\nPresenciais e a data em que o caixa sente:')
for (const p of D.presenciais) console.log('  pregão ' + p.data + ' -> caixa ' + p.caixa + (p.dentro ? '  [dentro]' : '  [fora]') + '  ' + p.nome.slice(0, 44))
console.log('\ndados.json em ' + OUT)
