/**
 * Fluxo de caixa e posicao de caixa 27/08 -> 10/09/2026.
 *
 * Pergunta do chefe: com o Kito e o Nelore Sorriso entrando ate o fim de agosto e
 * o Navirai em 10/09, o caixa atravessa a folha de 05/09?
 *
 * Ancoras (nada aqui e chute):
 *   - Sicoob 33.764,45 — conciliado 1:1 com o extrato de 27/08 15h48.
 *   - Sicredi aplicacao 12.598,64 — posicao do ERP; o extrato daquele banco nunca
 *     foi importado, entao o numero e o ultimo conhecido, nao um saldo conferido.
 *   - Folha de 05/09 = 50.451,61, conferida contra o cadastro erp_folha_estrutura
 *     por `npx tsx scripts/reprojeta-folha.mts` (45 titulos, sem mudanca).
 *
 * Metodologia herdada de gera-fluxo-consolidado-10set-2026.mjs, com uma correcao
 * de escopo: aqui NAO se inventa recebivel. So entra o que o chefe declarou firme
 * em 27/08 (Kito, Sorriso, Navirai); todo o resto — inclusive 142 mil de vencido —
 * fica de fora e aparece como cobranca a fazer.
 *
 * A armadilha que este modelo evita (ver relatorio de 19/08): projetar caixa so
 * com titulo lancado subestima a saida. Cartao, viagem, combustivel, marketing,
 * reembolso e despesa de leilao so viram lancamento quando o extrato chega. Aqui
 * eles entram por media historica, separados em dois blocos com regras distintas:
 *   - ESTRUTURAL: media jul-ago do Sicoob fora de folha/comissao/imposto/leilao,
 *     por dia, DESCONTANDO o que ja esta lancado como CP na janela.
 *   - LEILAO (operacional + viagens + reembolsos): so leilao PRESENCIAL gasta
 *     ([[erp-despesas-operacionais-por-leilao]]). A janela tem 3 presenciais; um
 *     ja tem CP, os outros dois entram pela media por presencial de jun-ago.
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
const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000)
const CAL = []
for (let d = HOJE; d <= FIM; d = addDias(d, 1)) CAL.push(d)

const D = { hoje: HOJE, fim: FIM, dias: CAL.length - 1, calendario: CAL }

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
const cr = await page('erp_contas_receber', 'id,descricao,valor,valor_recebido,status,vencimento,nota_fiscal,observacoes')
const vivo = c => ['aberto', 'vencido', 'parcial'].includes(c.status)
const falta = c => r2(Number(c.valor) - Number(c.valor_recebido || 0))
const acheCR = re => {
  const hit = cr.filter(c => vivo(c) && re.test(c.descricao || ''))
  if (!hit.length) throw new Error('nenhum CR vivo casa com ' + re)
  return hit
}
// Declaracao do chefe em 27/08: Kito e Sorriso ate o fim de agosto; Navirai em 10/09.
const kito = acheCR(/KITO.*\(2\/2\)/i)
const sorriso = acheCR(/SORRISO.*ETAPA FEMEAS/i)
const navirai = acheCR(/NAVIRAI/i).filter(c => c.vencimento === '2026-09-10')
if (kito.length !== 1 || sorriso.length !== 1) throw new Error('Kito/Sorriso ambiguos')
if (navirai.length !== 2) throw new Error('esperava 2 titulos do Navirai vencendo em 10/09, achei ' + navirai.length)

D.entradas = [
  { data: kito[0].vencimento, rot: 'Leilão 09/05 — KITO, parcela 2/2', valor: falta(kito[0]), id: kito[0].id, nota: 'vencimento do próprio título' },
  { data: '2026-08-31', rot: 'Nelore Sorriso — Etapa Fêmeas (12/07)', valor: falta(sorriso[0]), id: sorriso[0].id, nota: 'NF 635, R$ 7.149,98 — valor retificado em 27/08; portal da e-Rural marca "aguardando pagamento"' },
  ...navirai.sort((a, b) => Number(b.valor) - Number(a.valor)).map(c => ({
    data: '2026-09-10', rot: c.descricao.replace(/ - COMISSAO BULA.*$/i, ''), valor: falta(c), id: c.id, nota: 'vence 10/09; o chefe confirmou o pagamento na data',
  })),
]
D.entradasTotal = r2(D.entradas.reduce((s, e) => s + e.valor, 0))

/* --- o que NAO entrou: tudo o que segue em tratativa --- */
D.emTratativa = cr.filter(vivo).filter(c => !D.entradas.some(e => e.id === c.id))
  .map(c => ({ id: c.id, rot: c.descricao, valor: falta(c), vencimento: c.vencimento, status: c.status }))
  .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
D.emTratativaTotal = r2(D.emTratativa.reduce((s, c) => s + c.valor, 0))
D.vencidoTotal = r2(D.emTratativa.filter(c => c.vencimento < HOJE).reduce((s, c) => s + c.valor, 0))
D.vencidoNaJanela = D.emTratativa.filter(c => c.vencimento <= FIM)
D.vencidoNaJanelaTotal = r2(D.vencidoNaJanela.reduce((s, c) => s + c.valor, 0))

/* ================= 3. Saidas — titulos ja lancados ========================= */
const cats = await page('erp_categorias', 'id,nome,tipo,dre_grupo')
const CN = Object.fromEntries(cats.map(c => [c.id, c.nome]))
const cp = await page('erp_contas_pagar', 'id,descricao,valor,valor_pago,status,vencimento,origem,tags,categoria_id,substituido_por')
const cpVivo = cp.filter(c => ['aberto', 'vencido', 'parcial'].includes(c.status) && !c.substituido_por)
const cpRetido = cpVivo.filter(c => (c.tags || []).includes('retido-por-decisao'))
const cpJanela = cpVivo.filter(c => !(c.tags || []).includes('retido-por-decisao') && c.vencimento <= FIM)
const faltaCP = c => r2(Number(c.valor) - Number(c.valor_pago || 0))

// Vencido antes de hoje entra no primeiro dia util da janela — nao some do fluxo.
D.saidasLancadas = cpJanela.map(c => ({
  data: c.vencimento < HOJE ? addDias(HOJE, 1) : c.vencimento,
  vencimento: c.vencimento, atrasado: c.vencimento < HOJE,
  rot: c.descricao, valor: faltaCP(c), categoria: CN[c.categoria_id] || '?', origem: c.origem,
  tags: c.tags || [],
})).sort((a, b) => a.data.localeCompare(b.data))
D.saidasLancadasTotal = r2(D.saidasLancadas.reduce((s, x) => s + x.valor, 0))
D.retidos = cpRetido.map(c => ({ rot: c.descricao, valor: faltaCP(c), vencimento: c.vencimento }))

// Blocos que o relatorio nomeia
const bloco = re => r2(D.saidasLancadas.filter(x => re.test(x.categoria)).reduce((s, x) => s + x.valor, 0))
D.blocos = {
  folha: r2(D.saidasLancadas.filter(x => x.categoria === 'Folha de Pagamento').reduce((s, x) => s + x.valor, 0)),
  comissaoJulhoAberta: r2(D.saidasLancadas.filter(x => x.categoria === 'Comissões' && x.atrasado).reduce((s, x) => s + x.valor, 0)),
  encargos: bloco(/Encargos Sociais/),
  leilaoLancado: bloco(/Despesa Operacional Leilão|Viagem\/Passagens/),
  recorrentes: r2(D.saidasLancadas.filter(x => ['Marketing e Publicidade', 'Servicos de Terceiros', 'Tarifas Bancarias', 'Integralizacao Capital Cooperativa', 'Software/Assinaturas', 'Seguros'].includes(x.categoria)).reduce((s, x) => s + x.valor, 0)),
}
D.comissoesJulhoAbertas = D.saidasLancadas.filter(x => x.categoria === 'Comissões' && x.atrasado)
  .map(x => ({ rot: x.rot, valor: x.valor, vencimento: x.vencimento }))

/* ================= 4. Saidas — o custo que nunca vira conta a pagar ======== */
const mvS = await page('erp_movimentos_bancarios', 'data,tipo,valor,descricao,categoria_id',
  q => q.eq('conta_bancaria_id', SICOOB).eq('tipo', 'saida'))
const FORA_DO_CORRENTE = new Set(['Comissões', 'Impostos e Taxas', 'Folha de Pagamento', 'Transferencias Internas - Saida',
  'Encargos Sociais', 'Remuneracao de Socio', 'Repasse Assessorias/Parceiros', 'Imposto sobre Receita (18%)', 'Aplicacao Financeira', 'SALÁRIOS'])
const LEILAO = new Set(['Despesa Operacional Leilão', 'Viagem/Passagens'])
const mes = d => String(d).slice(0, 7)
const somaMes = (filtro) => {
  const o = {}
  for (const m of mvS) { const n = CN[m.categoria_id] || ''; if (!filtro(n)) continue; const k = mes(m.data); o[k] = r2((o[k] || 0) + Number(m.valor)) }
  return o
}
const estrutural = somaMes(n => !FORA_DO_CORRENTE.has(n) && !LEILAO.has(n))
const leilaoHist = somaMes(n => LEILAO.has(n))

// Estrutural: media dos dois meses pos-escritorio (jul e ago), por dia.
const BASE_EST = ['2026-07', '2026-08']
D.premissas = {}
D.premissas.estrutural = {
  meses: BASE_EST.map(k => ({ mes: k, valor: estrutural[k] || 0 })),
  serie: Object.keys(estrutural).sort().map(k => ({ mes: k, valor: estrutural[k] })),
  media: r2(BASE_EST.reduce((s, k) => s + (estrutural[k] || 0), 0) / BASE_EST.length),
}
D.premissas.estrutural.porDia = r2(D.premissas.estrutural.media / 30)

// Leilao: so PRESENCIAL gasta. Media por presencial de jun-ago.
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

// Presenciais dentro da janela e quais ja tem CP.
D.presenciaisJanela = agenda.filter(a => ehPresencial(a) && a.data >= HOJE && a.data <= FIM)
  .sort((a, b) => a.data.localeCompare(b.data))
  .map(a => {
    const chave = String(a.nome || '').toUpperCase().split(/\s+/).filter(w => w.length > 4)
    const cpDele = D.saidasLancadas.find(x => LEILAO.has(x.categoria) && chave.some(w => String(x.rot).toUpperCase().includes(w)))
    return { nome: a.nome, data: a.data, local: a.local, leiloeira: a.leiloeira, cpLancado: cpDele ? cpDele.valor : 0 }
  })
D.presenciaisSemCP = D.presenciaisJanela.filter(p => !p.cpLancado)

// Reembolso: quanto do gasto de leilao historicamente sai como reembolso a gente da casa.
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
for (const p of D.presenciaisSemCP) {
  // O gasto do presencial nao sai no dia: passagem/estadia sai antes, diaria e
  // reembolso depois. Concentrar no dia do pregao e a aproximacao honesta numa
  // janela de 15 dias — nao muda o total, so a data.
  D.saidasProjetadas.push({
    data: p.data, rot: 'Despesa de leilão presencial — ' + p.nome, valor: D.premissas.leilao.porPresencial,
    categoria: 'Despesa Operacional Leilão', tipo: 'projetado',
    nota: 'operacional + viagens + reembolsos; média de ' + leiQtd + ' presenciais em jun–ago',
  })
}
// Estrutural: dilui por dia o que a media manda MENOS o que ja esta lancado.
const diasJanela = dias(HOJE, FIM)
const estruturalBruto = r2(D.premissas.estrutural.porDia * diasJanela)
const estruturalLancado = D.blocos.recorrentes
D.premissas.estrutural.bruto = estruturalBruto
D.premissas.estrutural.jaLancado = estruturalLancado
D.premissas.estrutural.aProjetar = r2(Math.max(0, estruturalBruto - estruturalLancado))
const porDiaLiq = r2(D.premissas.estrutural.aProjetar / diasJanela)
for (let i = 1; i <= diasJanela; i++) {
  D.saidasProjetadas.push({
    data: addDias(HOJE, i), rot: 'Custo estrutural corrente (diluído)', valor: porDiaLiq,
    categoria: 'Estrutura', tipo: 'projetado', oculto: true,
  })
}
D.saidasProjetadasTotal = r2(D.saidasProjetadas.reduce((s, x) => s + x.valor, 0))
D.saidasTotal = r2(D.saidasLancadasTotal + D.saidasProjetadasTotal)

/* ================= 5. Linha do caixa, dia a dia ============================ */
function linha({ semComissaoJulho = false, soSicoob = false, naviraiMetade = false, atrasoDias = 0 } = {}) {
  let saldo = soSicoob ? D.caixa.sicoob : D.caixa.inicial
  const pts = []
  const ent = D.entradas.map(e => ({ ...e, data: atrasoDias ? addDias(e.data, atrasoDias) : e.data }))
  const naviraiMenor = [...D.entradas].filter(e => e.data === '2026-09-10').sort((a, b) => a.valor - b.valor)[0]
  for (const d of CAL) {
    const entra = r2(ent.filter(e => e.data === d && !(naviraiMetade && e.id === naviraiMenor.id)).reduce((s, e) => s + e.valor, 0))
    const saiL = r2(D.saidasLancadas.filter(x => x.data === d && !(semComissaoJulho && x.categoria === 'Comissões' && x.atrasado)).reduce((s, x) => s + x.valor, 0))
    const saiP = r2(D.saidasProjetadas.filter(x => x.data === d).reduce((s, x) => s + x.valor, 0))
    saldo = r2(saldo + entra - saiL - saiP)
    pts.push({ data: d, entra, sai: r2(saiL + saiP), saiLancado: saiL, saiProjetado: saiP, saldo })
  }
  return pts
}
D.cenarios = [
  { chave: 'BASE', rot: 'Base', desc: 'Kito e Sorriso até 31/08, Naviraí em 10/09, e a Bula paga tudo o que está em aberto — inclusive as comissões de julho ainda não quitadas.' },
  { chave: 'SEM_COM_JUL', rot: 'Segurando as comissões de julho', desc: 'Mesmas entradas, mas os títulos de comissão vencidos em 25/08 ficam para depois da janela.', opts: { semComissaoJulho: true } },
  { chave: 'SO_SICOOB', rot: 'Só o Sicoob', desc: 'Ignora a aplicação do Sicredi, cujo extrato nunca foi importado — é o piso defensável do caixa.', opts: { soSicoob: true } },
  { chave: 'NAVIRAI_1', rot: 'Naviraí parcial', desc: 'Se "Naviraí" for só um dos dois títulos que vencem em 10/09, entra apenas o maior.', opts: { naviraiMetade: true } },
  { chave: 'ATRASO_5', rot: 'Tudo 5 dias atrasado', desc: 'As três promessas de recebimento escorregam 5 dias.', opts: { atrasoDias: 5 } },
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

/* ================= 6. De quanto se precisa ================================= */
const base = D.linhas.BASE
D.necessidade = [0, 20000, 30000].map(colchao => ({
  colchao,
  marcos: ['2026-08-31', '2026-09-05', '2026-09-10'].map(ate => {
    const pior = Math.min(...base.filter(p => p.data <= ate).map(p => p.saldo))
    return { ate, pior, precisa: r2(Math.max(0, colchao - pior)) }
  }),
}))
// Quem pode cobrir o buraco: candidatos entre os vencidos em tratativa.
D.candidatos = D.emTratativa.filter(c => c.vencimento < HOJE).sort((a, b) => b.valor - a.valor).slice(0, 6)

/* ================= 7. O que vem logo depois da janela ====================== */
const depois = cpVivo.filter(c => !(c.tags || []).includes('retido-por-decisao') && c.vencimento > FIM && c.vencimento <= '2026-09-30')
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
console.log('Saídas lançadas .......... ' + brl(D.saidasLancadasTotal))
console.log('Saídas projetadas ........ ' + brl(D.saidasProjetadasTotal) + '  (leilão ' + brl(D.premissas.leilao.porPresencial * D.presenciaisSemCP.length) + ' + estrutural ' + brl(D.premissas.estrutural.aProjetar) + ')')
console.log('')
for (const c of D.cenarios) console.log('  ' + c.rot.padEnd(34) + ' final ' + brl(c.final).padStart(12) + ' | fundo ' + brl(c.fundo).padStart(12) + ' em ' + c.fundoData + ' | ' + c.diasNegativos + ' dia(s) negativo(s)')
console.log('\nEm tratativa (fora do fluxo): ' + brl(D.emTratativaTotal) + ' — vencido ' + brl(D.vencidoTotal))
console.log('dados.json em ' + OUT)
