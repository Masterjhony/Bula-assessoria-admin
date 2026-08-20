/**
 * Fluxo de caixa 20/08 -> 10/09/2026.
 * Pergunta do relatorio: o caixa comporta pagar as comissoes de julho (25/08) e,
 * depois, a folha de agosto (05/09), contando com as parcelas que ainda entram de outros leiloes?
 *
 * Ancora: extrato Sicoob de 20/08/2026 13:47 -> saldo 29.169,19 (conciliado, bate 1:1).
 * Metodologia herdada de gera-fluxo-cenarios-2026-08-19.mjs:
 *   - so entra no fluxo o recebivel com data ACORDADA; o resto e cobranca a fazer
 *   - o custo corrente que nunca vira conta a pagar entra por media historica
 *   - FGTS/DARF de empregados entram sempre (nao estao no DAS nem no ISSQN)
 *
 * Grava outputs/fluxo-20ago-10set-2026/dados.json. Nenhum numero no template.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

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
const HOJE = '2026-08-20'
const FIM = '2026-09-10'
const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const SICREDI_CC = 'af4724ec-e098-4e13-b172-04b2bfb1949d'
const SICREDI_APP = '5879aa04-2d69-4b9a-a80c-d9e3eca7ac06'
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000)
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

const D = { hoje: HOJE, fim: FIM, geradoEm: '2026-08-20' }

/* ================= 1. Caixa ================= */
const contas = await page('erp_contas_bancarias', '*')
D.caixa = {
  sicoob: Number(contas.find(c => c.nome.includes('Sicoob')).saldo_atual),
  sicrediCC: Number(contas.find(c => c.nome.includes('Corrente 53609')).saldo_atual),
  sicrediApp: Number(contas.find(c => c.nome.includes('Investimentos')).saldo_atual),
}
D.caixa.sicrediLiquido = r2(D.caixa.sicrediCC + D.caixa.sicrediApp)
D.caixa.consolidado = r2(D.caixa.sicoob + D.caixa.sicrediLiquido)
D.caixa.saldoExtrato = 29169.19
D.caixa.confere = Math.abs(D.caixa.sicoob - D.caixa.saldoExtrato) < 0.005

/* --- o que saiu hoje (o extrato ja debitou; explica a queda de 87k para 29k) --- */
const movHoje = await page('erp_movimentos_bancarios', 'data,tipo,valor,descricao',
  q => q.eq('conta_bancaria_id', SICOOB).gte('data', '2026-08-18'))
D.saidasRecentes = movHoje.filter(m => m.tipo === 'saida')
  .map(m => ({ data: m.data, valor: r2(m.valor), desc: m.descricao })).sort((a, b) => a.data < b.data ? -1 : 1)
D.saidasRecentesTotal = r2(D.saidasRecentes.reduce((s, x) => s + x.valor, 0))

/* ================= 2. Titulos ================= */
const cps = await page('erp_contas_pagar', 'descricao,valor,valor_pago,vencimento,status,tags,numero_documento')
const crs = await page('erp_contas_receber', 'descricao,valor,valor_recebido,vencimento,status,numero_documento,created_at')
const sCP = c => r2(Number(c.valor) - Number(c.valor_pago || 0))
const sCR = c => r2(Number(c.valor) - Number(c.valor_recebido || 0))
const crAb = crs.filter(c => !['recebido', 'cancelado'].includes(c.status))
const cpAb = cps.filter(c => !['pago', 'cancelado'].includes(c.status))

/* ===== FIRMEZA DO RECEBIMENTO =====
 * O vencimento das CR e, na quase totalidade, "data do leilao + 45 dias" gerado em massa em 17/08.
 * NAO e data acordada. So entram como certas as que tem acordo expresso.
 */
const FIRMES = {
  'BULA-2026-CR-KIRZ-TOUROS-20260707': { motivo: 'Repasse da Bula Remates, planilha de NF da leiloeira', obs: 'estava previsto para 20/08 e ainda nao entrou' },
  'BULA-2026-CR-NELORACO-PO-20260725': { motivo: 'Repasse da Bula Remates, planilha de NF da leiloeira', obs: 'estava previsto para 20/08 e ainda nao entrou' },
  'BULA-2026-CR-KITO-20260509-B2': { motivo: 'Boleto 2/2 emitido, vencimento 30/08 (conferencia Ana Paula)' },
  'BULA-2026-CR-GUADALUPE-FEMEAS-20260718': { motivo: 'Acordo fechado no WhatsApp em 20/08: 2x, 1a parcela ate 25/08' },
  'BULA-2026-CR-GUADALUPE-TOUROS-20260719': { motivo: 'Acordo fechado no WhatsApp em 20/08: 2x, 1a parcela ate 25/08' },
  'BULA-2026-CR-JMP-FEMEAS-20260613-P2': { motivo: 'Contrato JBJ: 2x, 30 e 60 dias; 1a parcela entrou em 10/08' },
  'BULA-2026-CR-JMP-TOUROS-20260614-P2': { motivo: 'Contrato JBJ: 2x, 30 e 60 dias; 1a parcela entrou em 10/08' },
}
/* --- o repasse da Bula Remates de 20/08 vale o que a planilha da leiloeira diz, nao o que o ERP tem --- */
const AJUSTE = { 'BULA-2026-CR-KIRZ-TOUROS-20260707': 7623.00, 'BULA-2026-CR-NELORACO-PO-20260725': 12187.50 }
D.remates = {
  previstoPara: '2026-08-20', entrou: false,
  itens: Object.entries(AJUSTE).map(([doc, real]) => {
    const t = crAb.find(c => c.numero_documento === doc)
    return { doc, real, erp: t ? sCR(t) : 0, desc: t ? t.descricao : null, delta: r2(real - (t ? sCR(t) : 0)) }
  }),
}
D.remates.totalReal = r2(D.remates.itens.reduce((s, x) => s + x.real, 0))
D.remates.totalErp = r2(D.remates.itens.reduce((s, x) => s + x.erp, 0))
D.remates.delta = r2(D.remates.totalReal - D.remates.totalErp)

/* --- vencidos: nao entram no fluxo, sao o estoque de cobranca --- */
const vencidos = crAb.filter(c => c.vencimento < HOJE && !AJUSTE[c.numero_documento])
D.vencidos = {
  total: r2(vencidos.reduce((s, c) => s + sCR(c), 0)), n: vencidos.length,
  ate60: r2(vencidos.filter(c => dias(c.vencimento, HOJE) <= 60).reduce((s, c) => s + sCR(c), 0)),
  mais60: r2(vencidos.filter(c => dias(c.vencimento, HOJE) > 60).reduce((s, c) => s + sCR(c), 0)),
  itens: vencidos.map(c => ({ data: c.vencimento, idade: dias(c.vencimento, HOJE), valor: sCR(c), desc: c.descricao })).sort((a, b) => b.idade - a.idade),
}

/* --- recebiveis com data dentro da janela --- */
const crH = crAb.filter(c => (c.vencimento >= HOJE || AJUSTE[c.numero_documento]) && c.vencimento <= FIM)
D.receber = crH.map(c => ({
  data: AJUSTE[c.numero_documento] ? HOJE : c.vencimento,
  valor: AJUSTE[c.numero_documento] ?? sCR(c),
  valorErp: sCR(c), ajustado: AJUSTE[c.numero_documento] !== undefined,
  desc: c.descricao, doc: c.numero_documento || null,
  firme: !!FIRMES[c.numero_documento],
  motivo: FIRMES[c.numero_documento] ? FIRMES[c.numero_documento].motivo : null,
  obs: FIRMES[c.numero_documento] ? FIRMES[c.numero_documento].obs || null : null,
})).sort((a, b) => a.data < b.data ? -1 : 1)
D.firmeza = {
  firme: r2(D.receber.filter(x => x.firme).reduce((s, x) => s + x.valor, 0)),
  semData: r2(D.receber.filter(x => !x.firme).reduce((s, x) => s + x.valor, 0)),
  nFirme: D.receber.filter(x => x.firme).length,
  nSemData: D.receber.filter(x => !x.firme).length,
}
D.firmeza.total = r2(D.firmeza.firme + D.firmeza.semData)
D.firmeza.pctSemData = r2(100 * D.firmeza.semData / D.firmeza.total)

/* --- o que vem logo DEPOIS da janela: e o que muda a leitura do mes --- */
const crPos = crAb.filter(c => c.vencimento > FIM && c.vencimento <= '2026-09-30')
D.depois = crPos.map(c => ({ data: c.vencimento, valor: sCR(c), desc: c.descricao, doc: c.numero_documento, firme: !!FIRMES[c.numero_documento] }))
  .sort((a, b) => a.data < b.data ? -1 : 1)
D.depoisTotal = r2(D.depois.reduce((s, x) => s + x.valor, 0))
D.depoisFirme = r2(D.depois.filter(x => x.firme).reduce((s, x) => s + x.valor, 0))
D.jmp2 = r2(D.depois.filter(x => /JMP/i.test(x.desc)).reduce((s, x) => s + x.valor, 0))

/* --- pagaveis: vencidos realocados para hoje ---
 * EXCECAO: titulo com a tag 'retido-por-decisao' e divida reconhecida SEM data de pagamento.
 * Nao entra no fluxo, pelo mesmo motivo que recebivel vencido nao entra: ninguem combinou data.
 * Aparece separado, como estoque, para nao sumir do relatorio.
 */
const retido = c => (c.tags || []).includes('retido-por-decisao')
const cpRet = cpAb.filter(c => c.vencimento <= FIM && retido(c))
const cpH = cpAb.filter(c => c.vencimento <= FIM && !retido(c))
const bucket = desc =>
  /^Folha /i.test(desc) ? 'folha'
    : /^COMISSAO|BULINHA|RUSA|^Repasse/i.test(desc) ? 'comissao'
      : /Simples|DAS|ISSQN|DARF|FGTS|INSS/i.test(desc) ? 'imposto'
        : 'corrente'
D.pagar = cpH.map(c => ({
  data: c.vencimento < HOJE ? HOJE : c.vencimento, valor: sCP(c), desc: c.descricao,
  realocado: c.vencimento < HOJE, vencOriginal: c.vencimento, bucket: bucket(c.descricao),
})).sort((a, b) => a.data < b.data ? -1 : 1)
D.retidos = {
  itens: cpRet.map(c => ({ valor: sCP(c), desc: c.descricao, vencOriginal: c.vencimento, idade: dias(c.vencimento, HOJE) }))
    .sort((a, b) => b.valor - a.valor),
}
D.retidos.total = r2(D.retidos.itens.reduce((s, x) => s + x.valor, 0))

D.comissoes25ago = r2(D.pagar.filter(x => x.data === '2026-08-25' && x.bucket === 'comissao').reduce((s, x) => s + x.valor, 0))
D.comissoes25agoItens = D.pagar.filter(x => x.data === '2026-08-25' && x.bucket === 'comissao').sort((a, b) => b.valor - a.valor)
D.folhaAgosto = r2(D.pagar.filter(x => x.bucket === 'folha').reduce((s, x) => s + x.valor, 0))
D.folhaItens = D.pagar.filter(x => x.bucket === 'folha').sort((a, b) => b.valor - a.valor)
D.pagarTotal = r2(D.pagar.reduce((s, x) => s + x.valor, 0))
D.pagarPorBucket = ['comissao', 'folha', 'imposto', 'corrente'].map(b => ({
  bucket: b, valor: r2(D.pagar.filter(x => x.bucket === b).reduce((s, x) => s + x.valor, 0)),
  n: D.pagar.filter(x => x.bucket === b).length,
}))

/* ================= 3. Custo corrente que nunca vira conta a pagar ================= */
const cats = await page('erp_categorias', 'id,nome')
const CN = Object.fromEntries(cats.map(c => [c.id, c.nome]))
const mv = await page('erp_movimentos_bancarios', 'data,tipo,valor,descricao,categoria_id',
  q => q.gte('data', '2026-01-01').eq('conta_bancaria_id', SICOOB))
const FORA = ['Comissão Funcionário', 'Repasse Assessorias/Parceiros', 'Impostos e Taxas', 'Encargos Sociais',
  'Transferencias Internas - Saida', 'Aplicacao Financeira', 'Integralizacao Capital Cooperativa', 'Folha de Pagamento']
const correnteMes = {}
mv.filter(m => m.tipo === 'saida' && !FORA.includes(CN[m.categoria_id] || '?'))
  .forEach(m => { const k = m.data.slice(0, 7); correnteMes[k] = r2((correnteMes[k] || 0) + Number(m.valor)) })
const MESES_CHEIOS = ['2026-04', '2026-05', '2026-06', '2026-07']
D.custoCorrente = {
  porMes: Object.keys(correnteMes).sort().map(m => ({ mes: m, valor: correnteMes[m], parcial: m === '2026-08' })),
  mesesBase: MESES_CHEIOS,
  media: r2(MESES_CHEIOS.reduce((s, m) => s + (correnteMes[m] || 0), 0) / MESES_CHEIOS.length),
  agostoAte20: r2(correnteMes['2026-08'] || 0),
}
const entradasMes = {}
mv.filter(m => m.tipo === 'entrada').forEach(m => { const k = m.data.slice(0, 7); entradasMes[k] = r2((entradasMes[k] || 0) + Number(m.valor)) })
D.entradasMes = entradasMes

const DIAS_MES = { '2026-08': 31, '2026-09': 30 }
const correnteLancado = (de, ate) => r2(D.pagar.filter(p => p.bucket === 'corrente' && p.data >= de && p.data <= ate).reduce((s, p) => s + p.valor, 0))
function residuo(mes, de, ate) {
  const prop = (dias(de, ate) + 1) / DIAS_MES[mes]
  const esperado = r2(D.custoCorrente.media * prop)
  const lancado = correnteLancado(de, ate)
  return { mes, de, ate, prop: r2(prop * 100), esperado, lancado, residuo: r2(Math.max(0, esperado - lancado)) }
}
D.residuos = [residuo('2026-08', HOJE, '2026-08-31'), residuo('2026-09', '2026-09-01', FIM)]
const TRANCHES = { '2026-08': ['2026-08-24', '2026-08-28', '2026-08-31'], '2026-09': ['2026-09-03', '2026-09-08'] }
D.correnteTranches = D.residuos.flatMap(x => TRANCHES[x.mes].map(d => ({ data: d, valor: r2(x.residuo / TRANCHES[x.mes].length) }))).filter(t => t.valor > 0)

/* --- FGTS + DARF de empregados --- */
const fgtsCP = cpAb.find(c => /FGTS/i.test(c.descricao))
D.encargos = { fgts: fgtsCP ? sCP(fgtsCP) : 950, darf: 1114.60 }
D.encargos.mensal = r2(D.encargos.fgts + D.encargos.darf)
D.encargosJaLancado = !!fgtsCP

/* --- impostos: as guias de agosto vencem 15/09 e 20/09, DEPOIS da janela --- */
const guias = mv.filter(m => m.tipo === 'saida' && /Simples Nacional|DAS |ISSQN/i.test(m.descricao || ''))
  .map(m => ({ data: m.data, valor: r2(m.valor), tipo: /ISSQN/i.test(m.descricao) ? 'ISSQN' : 'DAS' }))
const compet = {}
for (const g of guias) {
  const m = g.data.slice(0, 7), y = Number(m.slice(0, 4)), mm = Number(m.slice(5, 7))
  const ant = mm === 1 ? (y - 1) + '-12' : y + '-' + String(mm - 1).padStart(2, '0')
  compet[ant] = compet[ant] || { DAS: 0, ISSQN: 0, pagoEm: m }
  compet[ant][g.tipo] += g.valor
}
D.cargaTributaria = Object.entries(compet).filter(([k]) => k >= '2026-05').sort().map(([mes, v]) => {
  const base = entradasMes[mes] || 0
  return { mes, das: r2(v.DAS), iss: r2(v.ISSQN), total: r2(v.DAS + v.ISSQN), base: r2(base), pct: base ? r2(100 * (v.DAS + v.ISSQN) / base) : null, pagoEm: v.pagoEm }
})
const comPct = D.cargaTributaria.filter(x => x.pct)
D.taxaTributaria = {
  min: r2(Math.min(...comPct.map(x => x.pct))), max: r2(Math.max(...comPct.map(x => x.pct))),
  media: r2(comPct.reduce((s, x) => s + x.pct, 0) / comPct.length),
}
D.entradasAgostoRealizado = r2(entradasMes['2026-08'] || 0)

/* ================= 4. Motor de fluxo ================= */
const DATAS = []
for (let d = new Date(HOJE + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= FIM; d.setUTCDate(d.getUTCDate() + 1)) DATAS.push(d.toISOString().slice(0, 10))

function simula(op) {
  const ent = [], sai = []
  const REG = op.recebimento || 'firme'
  for (const c of D.receber) {
    const temData = c.firme || REG === 'nominal' || REG === 'atrasado'
      || (op.cobra && op.cobra.some(rx => rx.test(c.desc)))
    if (!temData) continue
    let dt = c.data
    if (op.rematesAtraso && AJUSTE[c.doc]) dt = addDias(dt, op.rematesAtraso)
    if (REG === 'atrasado' && !c.firme) dt = addDias(c.data, op.atrasoDias != null ? op.atrasoDias : 15)
    if (dt > FIM) continue
    ent.push({ data: dt, valor: r2(c.valor), desc: c.desc, firme: c.firme })
  }
  if (op.cobranca) ent.push({ data: op.cobrancaData || '2026-09-01', valor: r2(op.cobranca), desc: 'Recuperação de cobrança atrasada (esforço dirigido)', estimado: true })
  for (const c of D.pagar) {
    if (op.adiaComissoes && c.data === '2026-08-25' && c.bucket === 'comissao') { sai.push({ data: op.adiaComissoes, valor: c.valor, desc: c.desc, adiado: true }); continue }
    sai.push({ data: c.data, valor: c.valor, desc: c.desc })
  }
  const fator = op.custoCorrenteFator != null ? op.custoCorrenteFator : 1
  for (const t of D.correnteTranches) sai.push({ data: t.data, valor: r2(t.valor * fator), desc: 'Custo corrente não lançado (cartão, viagem, leilão, marketing) — estimado', estimado: true })
  sai.push({ data: '2026-09-07', valor: D.encargos.fgts, desc: 'FGTS ref. agosto — estimado', estimado: true })

  const porDia = {}
  for (const e of ent) { porDia[e.data] = porDia[e.data] || { ent: 0, sai: 0, itens: [] }; porDia[e.data].ent += e.valor; porDia[e.data].itens.push(Object.assign({ t: 'e' }, e)) }
  for (const s of sai) { porDia[s.data] = porDia[s.data] || { ent: 0, sai: 0, itens: [] }; porDia[s.data].sai += s.valor; porDia[s.data].itens.push(Object.assign({ t: 's' }, s)) }
  let saldo = D.caixa.sicoob + (op.sicredi ? D.caixa.sicrediLiquido : 0)
  const linha = [{ data: HOJE, ent: 0, sai: 0, saldo: r2(saldo), itens: (porDia[HOJE] || { itens: [] }).itens }]
  // o dia de hoje ja esta no saldo do extrato: entradas/saidas de hoje entram como movimento do dia
  if (porDia[HOJE]) { saldo += porDia[HOJE].ent - porDia[HOJE].sai; linha[0] = { data: HOJE, ent: r2(porDia[HOJE].ent), sai: r2(porDia[HOJE].sai), saldo: r2(saldo), itens: porDia[HOJE].itens } }
  for (const k of DATAS.slice(1)) {
    const x = porDia[k] || { ent: 0, sai: 0, itens: [] }
    saldo += x.ent - x.sai
    linha.push({ data: k, ent: r2(x.ent), sai: r2(x.sai), saldo: r2(saldo), itens: x.itens })
  }
  const min = linha.reduce((m, x) => x.saldo < m.saldo ? x : m)
  const at = d => linha.filter(x => x.data <= d).slice(-1)[0].saldo
  return {
    linha, minimo: { data: min.data, saldo: min.saldo },
    saldo25ago: at('2026-08-25'), saldo31ago: at('2026-08-31'), saldo05set: at('2026-09-05'), saldo10set: at(FIM),
    antesComissao: at('2026-08-24'), antesFolha: at('2026-09-04'),
    minAteFolha: linha.filter(x => x.data <= '2026-09-04').reduce((a, b) => b.saldo < a.saldo ? b : a).saldo,
    diasNegativos: linha.filter(x => x.saldo < 0).length,
    entTotal: r2(linha.reduce((s, x) => s + x.ent, 0)), saiTotal: r2(linha.reduce((s, x) => s + x.sai, 0)),
  }
}

/* ================= 5. Cenarios ================= */
const CEN = [
  { chave: 'FIRME', nome: 'Só o que tem data acordada',
    resumo: 'Entram apenas as cobranças com acordo expresso: o repasse da Bula Remates, a 1ª parcela do Guadalupe em 25/08 e o boleto do Kito em 30/08. Nenhuma outra leiloeira paga no período. É o piso, não uma previsão.',
    op: { recebimento: 'firme' } },
  { chave: 'REM5', nome: 'Piso com o repasse da Bula Remates 5 dias atrasado',
    resumo: 'O mesmo piso, mas o repasse que era para ter entrado hoje só cai em 25/08 — exatamente no dia das comissões.',
    op: { recebimento: 'firme', rematesAtraso: 5 } },
  { chave: 'NOMINAL', nome: 'Tudo na data do ERP',
    resumo: 'Cada título entra no vencimento que o sistema calculou (leilão + 45 dias). Nenhuma dessas datas foi acordada com as leiloeiras — é o cenário otimista.',
    op: { recebimento: 'nominal' } },
  { chave: 'NOM15', nome: 'Cobrança fechada, +15 dias',
    resumo: 'As cobranças sem acordo são negociadas e entram 15 dias depois da data nominal do ERP.',
    op: { recebimento: 'atrasado', atrasoDias: 15 } },
  { chave: 'ADIA', nome: 'Piso, adiando as comissões para 05/09',
    resumo: 'O piso de cobrança, mas pagando as comissões de julho junto com a folha, em 05/09, em vez de 25/08.',
    op: { recebimento: 'firme', adiaComissoes: '2026-09-05' } },
  { chave: 'EAO', nome: 'Piso + o EAO Baviera pagando',
    resumo: 'O piso mais os dois títulos do Mega Evento EAO Baviera (25 e 26/08), que sozinhos valem quase metade de tudo que a Bula tem para receber na janela. É a cobrança de maior alavanca do período.',
    op: { recebimento: 'firme', cobra: [/EAO BAVIERA/i] } },
]
D.cenarios = CEN.map(c => {
  const r = simula(c.op)
  const rs = simula(Object.assign({}, c.op, { sicredi: true }))
  return Object.assign({ chave: c.chave, nome: c.nome, resumo: c.resumo }, {
    minimo: r.minimo, saldo25ago: r.saldo25ago, saldo31ago: r.saldo31ago, saldo05set: r.saldo05set, saldo10set: r.saldo10set,
    antesComissao: r.antesComissao, antesFolha: r.antesFolha, minAteFolha: r.minAteFolha, diasNegativos: r.diasNegativos,
    entTotal: r.entTotal, saiTotal: r.saiTotal,
    pagaComissao: r.saldo25ago >= 0, pagaFolha: r.saldo05set >= 0,
    sic: {
      minimo: rs.minimo, saldo25ago: rs.saldo25ago, saldo05set: rs.saldo05set, saldo10set: rs.saldo10set,
      antesComissao: rs.antesComissao, minAteFolha: rs.minAteFolha, diasNegativos: rs.diasNegativos,
      pagaComissao: rs.saldo25ago >= 0, pagaFolha: rs.saldo05set >= 0,
    },
  })
})
D.linhas = Object.fromEntries(CEN.map(c => [c.chave, simula(c.op).linha]))
D.linhasSic = Object.fromEntries(CEN.map(c => [c.chave, simula(Object.assign({}, c.op, { sicredi: true })).linha]))
D.escada = D.linhas.FIRME.filter(x => x.ent || x.sai || x.data === HOJE || x.data === FIM)

/* --- quanto precisa ser cobrado ate cada marco para manter o colchao --- */
D.colchao = 30000
function necessidade(colchao, op) {
  const r = simula(Object.assign({ recebimento: 'firme' }, op))
  let pior = 0
  const out = []
  for (const m of ['2026-08-25', '2026-08-31', '2026-09-05', FIM]) {
    r.linha.filter(x => x.data <= m).forEach(x => { const falta = colchao - x.saldo; if (falta > pior) pior = falta })
    out.push({ ate: m, precisa: r2(Math.max(0, pior)) })
  }
  return out
}
D.necessidade = [
  { rot: 'Só o Sicoob, sem ficar negativo', colchao: 0, sicredi: false, linha: necessidade(0, {}) },
  { rot: 'Sicoob + reserva do Sicredi, sem ficar negativo', colchao: 0, sicredi: true, linha: necessidade(0, { sicredi: true }) },
  { rot: 'Sicoob + Sicredi, mantendo colchão de R$ 30.000', colchao: 30000, sicredi: true, linha: necessidade(30000, { sicredi: true }) },
  { rot: 'Sicoob + Sicredi, adiando as comissões para 05/09', colchao: 0, sicredi: true, linha: necessidade(0, { sicredi: true, adiaComissoes: '2026-09-05' }) },
]

/* --- sensibilidade: quanto de atraso o piso aguenta --- */
D.sensibilidade = []
for (const d of [0, 3, 5, 7, 10, 15]) {
  const r = simula({ recebimento: 'firme', rematesAtraso: d })
  D.sensibilidade.push({ atrasoRemates: d, antesComissao: r.antesComissao, saldo25ago: r.saldo25ago, minAteFolha: r.minAteFolha, minimo: r.minimo.saldo, data: r.minimo.data, saldo05set: r.saldo05set, saldo10set: r.saldo10set })
}
/* --- e se o Guadalupe nao pagar em 25/08? --- */
const semGua = JSON.parse(JSON.stringify(D.receber))
D.impactoGuadalupe = (() => {
  const guard = D.receber.filter(x => /GUADALUPE/i.test(x.desc))
  const total = r2(guard.reduce((s, x) => s + x.valor, 0))
  const backup = D.receber.slice()
  D.receber = D.receber.filter(x => !/GUADALUPE/i.test(x.desc))
  const r = simula({ recebimento: 'firme' })
  D.receber = backup
  return { valor: total, data: guard[0] ? guard[0].data : null, minimoSem: r.minimo.saldo, dataMin: r.minimo.data, saldo05setSem: r.saldo05set, saldo10setSem: r.saldo10set }
})()
void semGua

/* --- capacidade: qual o maior valor de comissao pagavel em 25/08 sem furar o colchao --- */
// Quanto da comissao de 25/08 cabe no caixa SEM contar com nenhuma cobranca nova.
// Mede o minimo ate 04/09 (vespera da folha), para isolar a decisao das comissoes da decisao da folha.
function capacidadeComissao(colchao, op) {
  const total = D.comissoes25ago
  let lo = 0, hi = total
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const backup = D.pagar.slice()
    D.pagar = D.pagar.map(p => (p.data === '2026-08-25' && p.bucket === 'comissao')
      ? Object.assign({}, p, { valor: r2(p.valor * mid / total) }) : p)
    const r = simula(Object.assign({ recebimento: 'firme' }, op))
    D.pagar = backup
    if (r.minAteFolha >= colchao) lo = mid; else hi = mid
  }
  return r2(lo)
}
D.capacidade = [
  { rot: 'Sem colchão — só não ficar negativo', colchao: 0 },
  { rot: 'Colchão de R$ 10.000', colchao: 10000 },
  { rot: 'Colchão de R$ 30.000', colchao: 30000 },
].map(c => {
  const v = capacidadeComissao(c.colchao, {})
  const vSic = capacidadeComissao(c.colchao, { sicredi: true })
  const vEao = capacidadeComissao(c.colchao, { cobra: [/EAO BAVIERA/i] })
  return {
    rot: c.rot, colchao: c.colchao,
    valor: v, pct: r2(100 * v / D.comissoes25ago),
    valorSic: vSic, pctSic: r2(100 * vSic / D.comissoes25ago),
    valorEao: vEao, pctEao: r2(100 * vEao / D.comissoes25ago),
  }
})

/* --- concentracao da cobranca: quem devo cobrar primeiro --- */
const grupo = d => {
  const m = [['EAO BAVIERA', 'EAO Baviera'], ['GENETICA ADITIVA', 'Genética Aditiva'], ['SANTA CRUZ', 'Nelore Santa Cruz'],
    ['NAVIRAI', 'Naviraí'], ['SORRISO', 'Nelore Sorriso'], ['GUADALUPE', 'Guadalupe'], ['KITO', 'Kito'],
    ['NELORACO|KIRZ|SAO GERALDO', 'Bula Remates'], ['HIPOLITO|HIPÓLITO', 'Irmãos Hipólito']]
  for (const [rx, nome] of m) if (new RegExp(rx, 'i').test(d)) return nome
  return 'Outros'
}
const conc = {}
for (const c of D.receber) { const g = grupo(c.desc); conc[g] = conc[g] || { grupo: g, valor: 0, n: 0, firme: 0 }; conc[g].valor = r2(conc[g].valor + c.valor); conc[g].n++; if (c.firme) conc[g].firme = r2(conc[g].firme + c.valor) }
D.concentracao = Object.values(conc).sort((a, b) => b.valor - a.valor)
  .map(x => Object.assign(x, { pct: r2(100 * x.valor / D.firmeza.total), aCobrar: r2(x.valor - x.firme) }))

/* --- o que vem logo depois da janela: as guias de agosto --- */
const entradasAgostoPiso = r2(D.entradasAgostoRealizado + simula({ recebimento: 'firme' }).linha
  .filter(x => x.data <= '2026-08-31').reduce((s, x) => s + x.ent, 0))
const entradasAgostoNominal = r2(D.entradasAgostoRealizado + simula({ recebimento: 'nominal' }).linha
  .filter(x => x.data <= '2026-08-31').reduce((s, x) => s + x.ent, 0))
D.impostosAgosto = {
  basePiso: entradasAgostoPiso, baseNominal: entradasAgostoNominal,
  taxa: D.taxaTributaria.media,
  piso: r2(entradasAgostoPiso * D.taxaTributaria.media / 100),
  nominal: r2(entradasAgostoNominal * D.taxaTributaria.media / 100),
  issVence: '2026-09-15', dasVence: '2026-09-20',
}

/* ================= 6. Contexto ================= */
const cron = await page('cronograma_leiloes', 'data,nome,leiloeira', q => q.gte('data', HOJE).lte('data', FIM))
D.agenda = cron.sort((a, b) => a.data < b.data ? -1 : 1).map(c => ({ data: c.data, nome: c.nome, leiloeira: c.leiloeira }))
D.guadalupeAcordo = {
  total: 21425.90, parcela: 10712.95, p1: '2026-08-25', p2: '2026-09-25',
  antesNoErp: 32641.35, delta: r2(21425.90 - 32641.35),
  memoria: [
    { rot: 'Sábado 18/07 — 5% sobre a venda da cobertura Bula', base: 60000, pct: 5, valor: 3000.00 },
    { rot: 'Domingo 19/07 — 0,5% sobre o faturamento do pregão', base: 3043180, pct: 0.5, valor: 15215.90 },
    { rot: 'Segunda 20/07 — 5% sobre a venda da cobertura Bula', base: 64200, pct: 5, valor: 3210.00 },
  ],
}

/* --- 25/09: comissoes de agosto + 2a parcela do Guadalupe --- */
const cp25set = cpAb.filter(c => c.vencimento === '2026-09-25')
D.pos25set = {
  comissoes: r2(cp25set.filter(c => bucket(c.descricao) === 'comissao').reduce((s, c) => s + sCP(c), 0)),
  n: cp25set.filter(c => bucket(c.descricao) === 'comissao').length,
  guadalupeP2: r2(crAb.filter(c => c.vencimento === '2026-09-25' && /GUADALUPE/i.test(c.descricao)).reduce((s, c) => s + sCR(c), 0)),
}
D.pos25set.total = r2(D.pos25set.comissoes)

/* --- comissao dos assessores do proprio leilao Guadalupe: nao muda com o acordo da leiloeira --- */
const cpGua = cpAb.filter(c => /GUADALUPE/i.test(c.descricao))
D.guadalupeAcordo.comissaoAssessores = r2(cpGua.filter(c => c.vencimento === '2026-08-25').reduce((s, c) => s + sCP(c), 0))
D.guadalupeAcordo.comissaoAssessoresVenc = '2026-08-25'
D.guadalupeAcordo.comissaoNane = r2(cpGua.filter(c => c.vencimento > '2026-09-30').reduce((s, c) => s + sCP(c), 0))
D.guadalupeAcordo.comissaoTotal = r2(D.guadalupeAcordo.comissaoAssessores + D.guadalupeAcordo.comissaoNane)

/* --- composicao da guia: ISSQN x DAS na ultima competencia fechada --- */
const ultima = D.cargaTributaria[D.cargaTributaria.length - 1]
D.mixIss = ultima && ultima.total ? Math.round(ultima.iss / ultima.total * 10000) / 10000 : 0.305

/* --- Sicredi: reserva parada, e a correcao do resgate que faltava --- */
const mvSic = await page('erp_movimentos_bancarios', 'data,tipo,valor,descricao,conta_bancaria_id',
  q => q.in('conta_bancaria_id', [SICREDI_CC, SICREDI_APP]))
const datasCC = mvSic.filter(m => m.conta_bancaria_id === SICREDI_CC).map(m => m.data).sort()
const datasApp = mvSic.filter(m => m.conta_bancaria_id === SICREDI_APP).map(m => m.data).sort()
D.sicredi = {
  liquido: D.caixa.sicrediLiquido, cc: D.caixa.sicrediCC, aplicacao: D.caixa.sicrediApp,
  ultimoMovimentoCC: datasCC.slice(-1)[0] || null, ultimoMovimentoApp: datasApp.slice(-1)[0] || null,
  diasSemExtrato: datasCC.length ? dias(datasCC.slice(-1)[0], HOJE) : null,
  ccZerada: Math.abs(D.caixa.sicrediCC) < 0.005,
  corrigidoEm: '2026-08-20', valorCorrecao: 15000,
}

const OUT = 'outputs/fluxo-20ago-10set-2026'
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(D, null, 1))

const f2 = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
console.log('Sicoob            ', f2(D.caixa.sicoob), D.caixa.confere ? '(bate com o extrato)' : '(NAO BATE!)')
console.log('Comissoes 25/08   ', f2(D.comissoes25ago), '(' + D.comissoes25agoItens.length + ' titulos)')
console.log('Folha 05/09       ', f2(D.folhaAgosto), '(' + D.folhaItens.length + ' pessoas)')
console.log('A pagar na janela ', f2(D.pagarTotal), '| RETIDO fora do fluxo', f2(D.retidos.total), '(' + D.retidos.itens.length + ')')
D.retidos.itens.forEach(r => console.log('    retido', f2(r.valor).padStart(11), 'venc', r.vencOriginal, '(' + r.idade + 'd)', r.desc.slice(0, 56)))
D.pagarPorBucket.forEach(b => console.log('   ', b.bucket.padEnd(10), f2(b.valor).padStart(12), '(' + b.n + ')'))
console.log('A receber (datado)', f2(D.firmeza.total), '| firme', f2(D.firmeza.firme), '(' + D.firmeza.nFirme + ') | sem data', f2(D.firmeza.semData), '(' + D.firmeza.nSemData + ') =', D.firmeza.pctSemData + '%')
console.log('Depois de 10/09   ', f2(D.depoisTotal), '| JMP 2a parcela', f2(D.jmp2))
console.log('Vencidos          ', f2(D.vencidos.total), '(' + D.vencidos.n + ')  ate 60d', f2(D.vencidos.ate60))
console.log('Custo corrente    media', f2(D.custoCorrente.media), '| residuo', D.residuos.map(x => x.mes + ' ' + f2(x.residuo)).join(' / '))
console.log('')
console.log('SICREDI  liquido', f2(D.sicredi.liquido), '| CC', f2(D.sicredi.cc), '| aplicacao', f2(D.sicredi.aplicacao), '| ultimo mov', D.sicredi.ultimoMovimentoCC, '(' + D.sicredi.diasSemExtrato + 'd atras)')
console.log('')
console.log('CENARIOS — SO SICOOB      (25/08 | 05/09 | 10/09 | minimo | dias neg)')
D.cenarios.forEach(c => console.log('  ' + c.chave.padEnd(8), f2(c.saldo25ago).padStart(12), f2(c.saldo05set).padStart(12), f2(c.saldo10set).padStart(12), f2(c.minimo.saldo).padStart(12), String(c.diasNegativos).padStart(3)))
console.log('CENARIOS — SICOOB+SICREDI')
D.cenarios.forEach(c => console.log('  ' + c.chave.padEnd(8), f2(c.sic.saldo25ago).padStart(12), f2(c.sic.saldo05set).padStart(12), f2(c.sic.saldo10set).padStart(12), f2(c.sic.minimo.saldo).padStart(12), String(c.sic.diasNegativos).padStart(3), c.sic.pagaComissao ? 'comissao OK' : '', c.sic.pagaFolha ? 'folha OK' : ''))
console.log('')
console.log('NECESSIDADE DE COBRANCA')
D.necessidade.forEach(n => console.log('  ' + n.rot.padEnd(48), n.linha.map(x => x.ate.slice(5) + ': ' + f2(x.precisa)).join(' | ')))
console.log('')
console.log('SENSIBILIDADE ao atraso do repasse da Bula Remates')
D.sensibilidade.forEach(s => console.log('  +' + String(s.atrasoRemates).padStart(2) + 'd  24/08', f2(s.antesComissao).padStart(12), '| 25/08', f2(s.saldo25ago).padStart(12), '| min ate 04/09', f2(s.minAteFolha).padStart(12), '| 10/09', f2(s.saldo10set).padStart(12)))
console.log('')
console.log('SEM o Guadalupe (' + f2(D.impactoGuadalupe.valor) + ' em ' + D.impactoGuadalupe.data + '): minimo', f2(D.impactoGuadalupe.minimoSem), D.impactoGuadalupe.dataMin, '| 10/09', f2(D.impactoGuadalupe.saldo10setSem))
console.log('CAPACIDADE de comissao pagavel em 25/08 (minimo ate 04/09):')
D.capacidade.forEach(c => console.log('   ' + c.rot.padEnd(38), 'so Sicoob', f2(c.valor).padStart(12), '(' + c.pct + '%)', '| +Sicredi', f2(c.valorSic).padStart(12), '(' + c.pctSic + '%)', '| com EAO', f2(c.valorEao).padStart(12), '(' + c.pctEao + '%)'))
console.log('')
console.log('CONCENTRACAO da cobranca na janela')
D.concentracao.forEach(g => console.log('   ' + g.grupo.padEnd(20), f2(g.valor).padStart(12), (g.pct + '%').padStart(7), '| a cobrar', f2(g.aCobrar).padStart(12)))
console.log('')
console.log('GUIAS DE AGOSTO (vencem 15 e 20/09, FORA da janela): piso', f2(D.impostosAgosto.piso), '| nominal', f2(D.impostosAgosto.nominal), '(taxa', D.impostosAgosto.taxa + '%, ISSQN', (D.mixIss * 100).toFixed(1) + '% da guia)')
console.log('25/09: comissoes de agosto', f2(D.pos25set.comissoes), '(' + D.pos25set.n + ') | Guadalupe P2', f2(D.pos25set.guadalupeP2))
console.log('Comissao dos assessores do Guadalupe: 25/08', f2(D.guadalupeAcordo.comissaoAssessores), '| Nane 28/12', f2(D.guadalupeAcordo.comissaoNane), '| total', f2(D.guadalupeAcordo.comissaoTotal), 'contra receita', f2(D.guadalupeAcordo.total))
