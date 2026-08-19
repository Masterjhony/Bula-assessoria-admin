/**
 * Fluxo de caixa projetado 19/08 -> 31/10/2026 com cenarios para dois eventos novos:
 *   (1) repasse integral (ou parcial) da 2a parcela do JMP (13/09) para o Felipe;
 *   (2) R$ 40.000 de participacao societaria para o Marcelo.
 * Ancora de partida: repasse Bula Remates de 20/08 = R$ 19.810,50 (planilha NF da leiloeira),
 * contra R$ 35.319,00 registrados no ERP -> ajuste explicito.
 *
 * Calcula TUDO e grava outputs/fluxo-cenarios-2026-09/dados.json. Nenhum numero no template.
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
const HOJE = '2026-08-19'
const FIM = '2026-10-31'
const SICOOB = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000)
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

const D = { hoje: HOJE, fim: FIM }

/* ================= 1. Caixa ================= */
const contas = await page('erp_contas_bancarias', '*')
D.caixa = {
  sicoob: Number(contas.find(c => c.nome.includes('Sicoob')).saldo_atual),
  sicrediCC: Number(contas.find(c => c.nome.includes('Corrente 53609')).saldo_atual),
  sicrediApp: Number(contas.find(c => c.nome.includes('Investimentos')).saldo_atual),
}
D.caixa.sicrediLiquido = r2(D.caixa.sicrediCC + D.caixa.sicrediApp)
D.caixa.consolidado = r2(D.caixa.sicoob + D.caixa.sicrediLiquido)

/* ================= 2. Titulos ================= */
const cps = await page('erp_contas_pagar', 'descricao,valor,valor_pago,vencimento,data_pagamento,status,tags')
const crs = await page('erp_contas_receber', 'descricao,valor,valor_recebido,vencimento,data_recebimento,status,numero_documento')
const sCP = c => r2(Number(c.valor) - Number(c.valor_pago || 0))
const sCR = c => r2(Number(c.valor) - Number(c.valor_recebido || 0))
const crAb = crs.filter(c => !['recebido', 'cancelado'].includes(c.status))
const cpAb = cps.filter(c => !['pago', 'cancelado'].includes(c.status))
const orc = c => (c.tags || []).includes('orcamento')

/* --- ancora: o repasse real da Bula Remates de 20/08 --- */
D.remates = {
  data: '2026-08-20',
  itens: [
    { doc: 'BULA-2026-CR-KIRZ-TOUROS-20260707', leilao: 'Nelore Kriz Reprodutores', dataLeilao: '07/jul', lotes: 46, animais: 46, faturamento: 1016400, pct: 0.75, real: 7623.00 },
    { doc: 'BULA-2026-CR-NELORACO-PO-20260725', leilao: 'Neloraço Touros', dataLeilao: '25/jul', lotes: 49, animais: 49, faturamento: 2437500, pct: 0.50, real: 12187.50 },
  ],
}
for (const it of D.remates.itens) {
  const t = crAb.find(c => c.numero_documento === it.doc)
  it.erp = t ? sCR(t) : 0
  it.erpDesc = t ? t.descricao : null
  it.delta = r2(it.real - it.erp)
}
D.remates.totalReal = r2(D.remates.itens.reduce((s, x) => s + x.real, 0))
D.remates.totalErp = r2(D.remates.itens.reduce((s, x) => s + x.erp, 0))
D.remates.delta = r2(D.remates.totalReal - D.remates.totalErp)
D.remates.faturamento = r2(D.remates.itens.reduce((s, x) => s + x.faturamento, 0))
const AJUSTE = Object.fromEntries(D.remates.itens.map(i => [i.doc, i.real]))

/* --- vencidos (nao entram na base) --- */
const vencidos = crAb.filter(c => c.vencimento < HOJE)
D.vencidos = {
  total: r2(vencidos.reduce((s, c) => s + sCR(c), 0)),
  n: vencidos.length,
  ate60: r2(vencidos.filter(c => dias(c.vencimento, HOJE) <= 60).reduce((s, c) => s + sCR(c), 0)),
  mais60: r2(vencidos.filter(c => dias(c.vencimento, HOJE) > 60).reduce((s, c) => s + sCR(c), 0)),
  itens: vencidos.map(c => ({ data: c.vencimento, idade: dias(c.vencimento, HOJE), valor: sCR(c), desc: c.descricao })).sort((a, b) => b.idade - a.idade),
}

/* --- recebiveis datados no horizonte --- */
const crH = crAb.filter(c => c.vencimento >= HOJE && c.vencimento <= FIM)
D.receber = crH.map(c => ({
  data: c.vencimento, valor: AJUSTE[c.numero_documento] ?? sCR(c), desc: c.descricao,
  ajustado: AJUSTE[c.numero_documento] !== undefined, doc: c.numero_documento || null,
  jmp: /JMP/i.test(c.descricao),
})).sort((a, b) => a.data < b.data ? -1 : 1)
D.receberAgosto = r2(D.receber.filter(x => x.data <= '2026-08-31').reduce((s, x) => s + x.valor, 0))
D.receberSetembro = r2(D.receber.filter(x => x.data >= '2026-09-01' && x.data <= '2026-09-30').reduce((s, x) => s + x.valor, 0))
D.receberOutubro = r2(D.receber.filter(x => x.data >= '2026-10-01').reduce((s, x) => s + x.valor, 0))
D.jmp2 = r2(D.receber.filter(x => x.jmp).reduce((s, x) => s + x.valor, 0))
D.jmpData = D.receber.find(x => x.jmp) ? D.receber.find(x => x.jmp).data : null
D.jmpPctSetembro = r2(100 * D.jmp2 / D.receberSetembro)
D.jmpItens = D.receber.filter(x => x.jmp)

/* --- pagaveis datados no horizonte (vencidos realocados p/ 20/08) --- */
const cpH = cpAb.filter(c => c.vencimento <= FIM)
D.pagar = cpH.map(c => ({
  data: c.vencimento < HOJE ? '2026-08-20' : c.vencimento, valor: sCP(c), desc: c.descricao,
  orcamento: orc(c), realocado: c.vencimento < HOJE, vencOriginal: c.vencimento,
})).sort((a, b) => a.data < b.data ? -1 : 1)
D.pagarAgosto = r2(D.pagar.filter(x => x.data <= '2026-08-31').reduce((s, x) => s + x.valor, 0))
D.pagarSetembro = r2(D.pagar.filter(x => x.data >= '2026-09-01' && x.data <= '2026-09-30').reduce((s, x) => s + x.valor, 0))
D.pagarOutubro = r2(D.pagar.filter(x => x.data >= '2026-10-01').reduce((s, x) => s + x.valor, 0))
D.folhaAgosto = r2(D.pagar.filter(x => /^Folha Agosto/i.test(x.desc)).reduce((s, x) => s + x.valor, 0))
D.comissoes25set = r2(D.pagar.filter(x => x.data === '2026-09-25' && /^COMISSAO/i.test(x.desc)).reduce((s, x) => s + x.valor, 0))
D.comissoes25ago = r2(D.pagar.filter(x => x.data === '2026-08-25' && /^COMISSAO/i.test(x.desc)).reduce((s, x) => s + x.valor, 0))

/* ================= 3. Carga tributaria observada ================= */
const cats = await page('erp_categorias', 'id,nome')
const CN = Object.fromEntries(cats.map(c => [c.id, c.nome]))
const mv = await page('erp_movimentos_bancarios', 'data,tipo,valor,descricao,categoria_id,conta_bancaria_id', q => q.gte('data', '2026-01-01').eq('conta_bancaria_id', SICOOB))
const entradasMes = {}
mv.filter(m => m.tipo === 'entrada').forEach(m => { const k = m.data.slice(0, 7); entradasMes[k] = r2((entradasMes[k] || 0) + Number(m.valor)) })
D.entradasMes = entradasMes
const guias = mv.filter(m => m.tipo === 'saida' && /Simples Nacional|DAS |ISSQN/i.test(m.descricao || ''))
  .map(m => ({ data: m.data, valor: r2(m.valor), desc: m.descricao, tipo: /ISSQN/i.test(m.descricao) ? 'ISSQN' : 'DAS' }))
  .sort((a, b) => a.data < b.data ? -1 : 1)
D.guias = guias
const compet = {}
for (const g of guias) {
  const m = g.data.slice(0, 7)
  const y = Number(m.slice(0, 4)), mm = Number(m.slice(5, 7))
  const ant = mm === 1 ? (y - 1) + '-12' : y + '-' + String(mm - 1).padStart(2, '0')
  compet[ant] = compet[ant] || { DAS: 0, ISSQN: 0, pagoEm: m }
  compet[ant][g.tipo] += g.valor
}
const dasJul = cpAb.find(c => /Simples Nacional \(DAS\) ref\. julho/i.test(c.descricao))
if (dasJul) { compet['2026-07'] = compet['2026-07'] || { DAS: 0, ISSQN: 0, pagoEm: '2026-08' }; compet['2026-07'].DAS += sCP(dasJul) }
D.cargaTributaria = Object.entries(compet).filter(([k]) => k >= '2026-05').sort().map(([mes, v]) => {
  const base = entradasMes[mes] || 0
  return { mes, das: r2(v.DAS), iss: r2(v.ISSQN), total: r2(v.DAS + v.ISSQN), base: r2(base), pct: base ? r2(100 * (v.DAS + v.ISSQN) / base) : null, pagoEm: v.pagoEm }
})
const comPct = D.cargaTributaria.filter(x => x.pct)
D.taxaTributaria = {
  min: r2(Math.min(...comPct.map(x => x.pct))),
  max: r2(Math.max(...comPct.map(x => x.pct))),
  media: r2(comPct.reduce((s, x) => s + x.pct, 0) / comPct.length),
}

D.entradasAgostoRealizado = r2(entradasMes['2026-08'] || 0)
D.entradasAgostoProjetado = r2(D.entradasAgostoRealizado + D.receber.filter(x => x.data <= '2026-08-31').reduce((s, x) => s + x.valor, 0))

/* --- composicao da guia (DAS x ISSQN) observada na ultima competencia --- */
const ultimaComp = D.cargaTributaria[D.cargaTributaria.length - 1]
D.mixIss = ultimaComp.total ? Math.round(ultimaComp.iss / ultimaComp.total * 10000) / 10000 : 0.3

/* --- entrada estimada de outubro: leiloes de 19/08 a 15/09, recebidos em D+45 --- */
const cronPrev = await page('cronograma_leiloes', 'data,nome', q => q.gte('data', HOJE).lte('data', '2026-09-15'))
const feBase = await page('bula_leilao_fechamento', 'data,vgv_total,receita_bula', q => q.gte('data', '2026-04-01'))
const receitaMediaEvento = r2(feBase.reduce((s, f) => s + Number(f.receita_bula || 0), 0) / feBase.length)
const totalOut = r2(cronPrev.length * receitaMediaEvento)
D.entradaOutubro = {
  nEventos: cronPrev.length, receitaMediaEvento, total: totalOut, nFechamentosBase: feBase.length,
  tranches: [
    { data: '2026-10-06', valor: r2(totalOut * 0.35) },
    { data: '2026-10-16', valor: r2(totalOut * 0.35) },
    { data: '2026-10-27', valor: r2(totalOut * 0.30) },
  ],
}

/* ================= 4. Motor de fluxo ================= */
const DATAS = []
for (let d = new Date(HOJE + 'T12:00:00Z'); d.toISOString().slice(0, 10) <= FIM; d.setUTCDate(d.getUTCDate() + 1)) DATAS.push(d.toISOString().slice(0, 10))

function simula(op) {
  const ent = [], sai = []
  for (const c of D.receber) {
    let v = c.valor
    if (op.saoGeraldoMeio && c.doc === 'BULA-2026-CR-SAO-GERALDO-20260801') v = r2(v / 2)
    if (op.slipPct && c.data >= '2026-09-01') {
      ent.push({ data: c.data, valor: r2(v * (1 - op.slipPct)), desc: c.desc })
      const novo = addDias(c.data, op.slipDias || 30)
      if (novo <= FIM) ent.push({ data: novo, valor: r2(v * op.slipPct), desc: c.desc + ' (atraso)' })
      continue
    }
    ent.push({ data: c.data, valor: r2(v), desc: c.desc })
  }
  if (op.recuperaVencidos) ent.push({ data: op.recuperaData || '2026-09-10', valor: r2(D.vencidos.ate60 * op.recuperaVencidos), desc: 'Recuperação de vencidos (cobrança)' })
  for (const c of D.pagar) sai.push({ data: c.data, valor: c.valor, desc: c.desc })
  if (op.felipe) for (const p of op.felipe) sai.push({ data: p.data, valor: r2(D.jmp2 * p.pct), desc: 'Repasse da 2ª parcela do JMP — Felipe', novo: true })
  if (op.marcelo) for (const p of op.marcelo) sai.push({ data: p.data, valor: r2(p.valor), desc: 'Participação societária — Marcelo', novo: true })
  const txt = op.taxaTributaria != null ? op.taxaTributaria : D.taxaTributaria.media
  const impSet = r2(D.entradasAgostoProjetado * txt / 100)
  sai.push({ data: '2026-09-15', valor: r2(impSet * D.mixIss), desc: 'ISSQN ref. agosto — estimado', novo: true, estimado: true })
  sai.push({ data: '2026-09-21', valor: r2(impSet * (1 - D.mixIss)), desc: 'DAS do Simples ref. agosto — estimado', novo: true, estimado: true })
  const caixaSet = r2(ent.filter(e => e.data >= '2026-09-01' && e.data <= '2026-09-30').reduce((s, e) => s + e.valor, 0))
  const impOut = r2(caixaSet * txt / 100)
  sai.push({ data: '2026-10-15', valor: r2(impOut * D.mixIss), desc: 'ISSQN ref. setembro — estimado', novo: true, estimado: true })
  sai.push({ data: '2026-10-20', valor: r2(impOut * (1 - D.mixIss)), desc: 'DAS do Simples ref. setembro — estimado', novo: true, estimado: true })
  sai.push({ data: '2026-10-26', valor: r2(op.comissoesOut != null ? op.comissoesOut : D.comissoes25set), desc: 'Comissões dos leilões de setembro — estimado', novo: true, estimado: true })
  const fatorOut = op.entradaOutFator != null ? op.entradaOutFator : 1
  if (fatorOut > 0) for (const t of D.entradaOutubro.tranches) {
    ent.push({ data: t.data, valor: r2(t.valor * fatorOut), desc: 'Recebíveis dos leilões de 19/08 a 15/09 (D+45) — estimado', estimado: true })
  }

  const porDia = {}
  for (const e of ent) { porDia[e.data] = porDia[e.data] || { ent: 0, sai: 0, itens: [] }; porDia[e.data].ent += e.valor; porDia[e.data].itens.push(Object.assign({ t: 'e' }, e)) }
  for (const s of sai) { porDia[s.data] = porDia[s.data] || { ent: 0, sai: 0, itens: [] }; porDia[s.data].sai += s.valor; porDia[s.data].itens.push(Object.assign({ t: 's' }, s)) }
  let saldo = D.caixa.sicoob
  const linha = [{ data: HOJE, ent: 0, sai: 0, saldo: r2(saldo), itens: [] }]
  for (const k of DATAS.slice(1)) {
    const x = porDia[k] || { ent: 0, sai: 0, itens: [] }
    saldo += x.ent - x.sai
    linha.push({ data: k, ent: r2(x.ent), sai: r2(x.sai), saldo: r2(saldo), itens: x.itens })
  }
  const min = linha.reduce((m, x) => x.saldo < m.saldo ? x : m)
  const at = d => linha.filter(x => x.data <= d).slice(-1)[0].saldo
  const janela = (a, b) => { const l = linha.filter(x => x.data >= a && x.data <= b).reduce((m, x) => x.saldo < m.saldo ? x : m); return { data: l.data, saldo: l.saldo } }
  return {
    linha, minimo: { data: min.data, saldo: min.saldo },
    saldo31ago: at('2026-08-31'), saldo30set: at('2026-09-30'), saldo31out: at('2026-10-31'),
    minAgo: janela(HOJE, '2026-08-31'), minSet: janela('2026-09-01', '2026-09-30'), minOut: janela('2026-10-01', FIM),
    impSet, impOut, diasNegativos: linha.filter(x => x.saldo < 0).length,
    entSet: r2(linha.filter(x => x.data >= '2026-09-01' && x.data <= '2026-09-30').reduce((s, x) => s + x.ent, 0)),
    saiSet: r2(linha.filter(x => x.data >= '2026-09-01' && x.data <= '2026-09-30').reduce((s, x) => s + x.sai, 0)),
  }
}

/* ================= 5. Cenarios ================= */
const MARCELO = 40000
const CEN = [
  { chave: 'REF', nome: 'Referência', resumo: 'Só o que já está contratado. Nem o repasse do JMP, nem a participação do Marcelo.', op: {} },
  { chave: 'M', nome: 'Só o Marcelo', resumo: 'Participação societária de R$ 40.000 em 25/09. A 2ª parcela do JMP fica na Bula.', op: { marcelo: [{ data: '2026-09-25', valor: MARCELO }] } },
  { chave: 'M50', nome: 'Marcelo + metade do JMP', resumo: 'R$ 40.000 ao Marcelo em 25/09 e metade da 2ª parcela do JMP repassada ao Felipe em 13/09.', op: { marcelo: [{ data: '2026-09-25', valor: MARCELO }], felipe: [{ data: '2026-09-13', pct: 0.5 }] } },
  { chave: 'M100', nome: 'Marcelo + JMP integral', resumo: 'O caso levantado: R$ 40.000 de participação em 25/09 e a 2ª parcela do JMP inteira repassada ao Felipe em 13/09.', op: { marcelo: [{ data: '2026-09-25', valor: MARCELO }], felipe: [{ data: '2026-09-13', pct: 1 }] } },
  { chave: 'ESC', nome: 'Integral escalonado', resumo: 'O mesmo dinheiro, em duas datas cada: JMP 50% em 13/09 e 50% em 15/10; Marcelo R$ 20.000 em 25/09 e R$ 20.000 em 25/10.', op: { marcelo: [{ data: '2026-09-25', valor: MARCELO / 2 }, { data: '2026-10-25', valor: MARCELO / 2 }], felipe: [{ data: '2026-09-13', pct: 0.5 }, { data: '2026-10-15', pct: 0.5 }] } },
  { chave: 'STR', nome: 'Estresse', resumo: 'Tudo do cenário integral, mais: 30% dos recebíveis de setembro e outubro atrasam 30 dias, a receita estimada de outubro entra pela metade, o São Geraldo paga 0,5% em vez de 1% e a carga tributária vem no teto observado.', op: { marcelo: [{ data: '2026-09-25', valor: MARCELO }], felipe: [{ data: '2026-09-13', pct: 1 }], slipPct: 0.30, slipDias: 30, entradaOutFator: 0.5, saoGeraldoMeio: true, taxaTributaria: null } },
]
CEN[5].op.taxaTributaria = D.taxaTributaria.max
D.cenarios = CEN.map(c => {
  const r = simula(c.op)
  return {
    chave: c.chave, nome: c.nome, resumo: c.resumo,
    minimo: r.minimo, saldo31ago: r.saldo31ago, saldo30set: r.saldo30set, saldo31out: r.saldo31out,
    minAgo: r.minAgo, minSet: r.minSet, minOut: r.minOut, impSet: r.impSet, impOut: r.impOut,
    diasNegativos: r.diasNegativos, entSet: r.entSet, saiSet: r.saiSet,
    saidaNova: r2((c.op.felipe || []).reduce((s, p) => s + D.jmp2 * p.pct, 0) + (c.op.marcelo || []).reduce((s, p) => s + p.valor, 0)),
    saidaNovaSet: r2((c.op.felipe || []).filter(p => p.data <= '2026-09-30').reduce((s, p) => s + D.jmp2 * p.pct, 0) + (c.op.marcelo || []).filter(p => p.data <= '2026-09-30').reduce((s, p) => s + p.valor, 0)),
  }
})
D.linhas = Object.fromEntries(CEN.map(c => [c.chave, simula(c.op).linha]))
D.escadaDetalhe = D.linhas.M100.filter(x => x.ent || x.sai || x.data === HOJE || x.data === FIM)

/* ================= 6. Capacidade de repasse ================= */
// maior repasse pagavel ao Felipe em 13/09 mantendo o saldo acima do colchao de 13/09 ate a data-limite.
// A janela comeca em 13/09 porque nada antes disso muda com a decisao.
function capacidade(colchao, ate, extra) {
  let lo = 0, hi = D.jmp2
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2
    const op = Object.assign({ marcelo: [{ data: '2026-09-25', valor: MARCELO }], felipe: [{ data: '2026-09-13', pct: mid / D.jmp2 }] }, extra || {})
    const r = simula(op)
    const min = r.linha.filter(x => x.data >= '2026-09-13' && x.data <= ate).reduce((a, b) => b.saldo < a.saldo ? b : a).saldo
    if (min >= colchao) lo = mid; else hi = mid
  }
  return r2(lo)
}
D.capacidade = [
  { rot: 'Tudo entra no prazo e outubro se comporta como a média de 2026', colchao: 50000, ate: '2026-10-31', extra: {}, valor: capacidade(50000, '2026-10-31') },
  { rot: '30% dos recebíveis de set–out atrasam 30 dias', colchao: 50000, ate: '2026-10-31', valor: capacidade(50000, '2026-10-31', { slipPct: 0.30, slipDias: 30 }) },
  { rot: 'Os leilões de agora até 15/09 rendem metade da média', colchao: 50000, ate: '2026-10-31', valor: capacidade(50000, '2026-10-31', { entradaOutFator: 0.5 }) },
  { rot: 'Os dois ao mesmo tempo, com a carga tributária no teto', colchao: 50000, ate: '2026-10-31', valor: capacidade(50000, '2026-10-31', { slipPct: 0.30, slipDias: 30, entradaOutFator: 0.5, taxaTributaria: D.taxaTributaria.max }) },
]
D.capacidadeColchao = 50000

// margem de seguranca: quanto dos recebiveis precisaria atrasar 30 dias para o cenario
// integral encostar no piso. Busca binaria no percentual de atraso.
function rupturaSlip(piso) {
  let lo = 0, hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const r = simula({ marcelo: [{ data: '2026-09-25', valor: MARCELO }], felipe: [{ data: '2026-09-13', pct: 1 }], slipPct: mid, slipDias: 30 })
    const min = r.linha.filter(x => x.data >= '2026-09-13').reduce((a, b) => b.saldo < a.saldo ? b : a).saldo
    if (min >= piso) lo = mid; else hi = mid
  }
  return r2(lo * 1000) / 10
}
D.margemSeguranca = [
  { piso: 50000, pct: rupturaSlip(50000) },
  { piso: 0, pct: rupturaSlip(0) },
]

/* ============ 6b. Ponte de riscos sobre o saldo de 30/09 no cenario integral ============ */
const baseOp = { marcelo: [{ data: '2026-09-25', valor: MARCELO }], felipe: [{ data: '2026-09-13', pct: 1 }] }
const base30 = simula(baseOp).saldo30set
const variacao = extra => r2(simula(Object.assign({}, baseOp, extra)).saldo30set - base30)
const sg = D.receber.find(x => x.doc === 'BULA-2026-CR-SAO-GERALDO-20260801')
D.saoGeraldo = sg ? { valor: sg.valor, data: sg.data, metade: r2(sg.valor / 2) } : null
D.riscos = [
  { rot: 'Repasse da Bula Remates de 20/08 menor que o registrado no ERP', valor: D.remates.delta, estado: 'confirmado pela planilha da leiloeira', jaEmbutido: true },
  { rot: 'São Geraldo remunerado a 0,5% do faturamento, e não a 1%', valor: variacao({ saoGeraldoMeio: true }), estado: 'a confirmar com a Bula Remates', jaEmbutido: false },
  { rot: 'Carga tributária de agosto no teto observado (29,53%) em vez da média', valor: variacao({ taxaTributaria: D.taxaTributaria.max }), estado: 'sensibilidade', jaEmbutido: false },
  { rot: '30% dos recebíveis de setembro atrasando 30 dias', valor: variacao({ slipPct: 0.30, slipDias: 30 }), estado: 'sensibilidade', jaEmbutido: false },
  { rot: 'Tudo acima ao mesmo tempo', valor: variacao({ saoGeraldoMeio: true, taxaTributaria: D.taxaTributaria.max, slipPct: 0.30, slipDias: 30 }), estado: 'pior caso', jaEmbutido: false },
]
D.base30set = base30
// o Simples tributa a receita bruta: o imposto da parcela repassada fica na Bula
D.impostoSobreRepasse = {
  media: r2(D.jmp2 * D.taxaTributaria.media / 100),
  max: r2(D.jmp2 * D.taxaTributaria.max / 100),
}

/* ================= 7. Contexto ================= */
const fe = await page('bula_leilao_fechamento', 'data,nome,vgv_total,receita_bula', q => q.gte('data', '2026-01-01'))
const bym = {}
fe.forEach(f => { const m = f.data.slice(0, 7); bym[m] = bym[m] || { n: 0, vgv: 0, rec: 0 }; bym[m].n++; bym[m].vgv += Number(f.vgv_total || 0); bym[m].rec += Number(f.receita_bula || 0) })
D.mensal = Object.keys(bym).sort().map(m => ({ mes: m, n: bym[m].n, vgv: r2(bym[m].vgv), receita: r2(bym[m].rec) }))
const cron = await page('cronograma_leiloes', 'data,nome,leiloeira', q => q.gte('data', HOJE).lte('data', '2026-10-31'))
D.agenda = { ago: cron.filter(c => c.data <= '2026-08-31').length, set: cron.filter(c => c.data >= '2026-09-01' && c.data <= '2026-09-30').length, out: cron.filter(c => c.data >= '2026-10-01').length }
D.agendaItens = cron.sort((a, b) => a.data < b.data ? -1 : 1).map(c => ({ data: c.data, nome: c.nome, leiloeira: c.leiloeira }))
D.marcelo = MARCELO
D.repasseTotal = r2(D.jmp2 + MARCELO)

const OUT = 'outputs/fluxo-cenarios-2026-09'
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'dados.json'), JSON.stringify(D, null, 1))

const f2 = n => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
console.log('Sicoob hoje            ', f2(D.caixa.sicoob), '| Sicredi liquido', f2(D.caixa.sicrediLiquido))
console.log('Repasse Remates 20/08  ', f2(D.remates.totalReal), 'contra ERP', f2(D.remates.totalErp), '-> delta', f2(D.remates.delta))
console.log('A receber ago/set/out  ', f2(D.receberAgosto), '/', f2(D.receberSetembro), '/', f2(D.receberOutubro))
console.log('A pagar   ago/set/out  ', f2(D.pagarAgosto), '/', f2(D.pagarSetembro), '/', f2(D.pagarOutubro))
console.log('JMP 2a parcela         ', f2(D.jmp2), 'em', D.jmpData, '=', D.jmpPctSetembro + '% do que entra em setembro')
console.log('Vencidos               ', f2(D.vencidos.total), '(ate 60d:', f2(D.vencidos.ate60) + ')')
console.log('Comissoes 25/08', f2(D.comissoes25ago), '| 25/09', f2(D.comissoes25set), '| folha ago', f2(D.folhaAgosto))
console.log('Carga tributaria       ', JSON.stringify(D.taxaTributaria), 'base agosto', f2(D.entradasAgostoProjetado))
D.cargaTributaria.forEach(x => console.log('   comp', x.mes, 'DAS', f2(x.das).padStart(11), 'ISS', f2(x.iss).padStart(11), 'base', f2(x.base).padStart(12), x.pct + '%'))
console.log('\nCENARIOS (saldo Sicoob)')
D.cenarios.forEach(c => console.log('  ' + c.chave.padEnd(5), c.nome.padEnd(26), '31/08', f2(c.saldo31ago).padStart(11), '| min set', f2(c.minSet.saldo).padStart(11), c.minSet.data, '| 30/09', f2(c.saldo30set).padStart(11), '| 31/10', f2(c.saldo31out).padStart(11), '| neg', c.diasNegativos))
console.log('\nCAPACIDADE DE REPASSE em 13/09')
D.capacidade.forEach(c => console.log('  ' + c.rot.padEnd(62), f2(c.valor)))
console.log('MARGEM: atraso que zera ->', JSON.stringify(D.margemSeguranca))
console.log('RISCOS sobre 30/09 (base ' + f2(D.base30set) + ')'); D.riscos.forEach(r => console.log('  ', f2(r.valor).padStart(13), r.rot))
console.log('Entrada estimada de outubro:', f2(D.entradaOutubro.total), '(' + D.entradaOutubro.nEventos + ' leiloes x media', f2(D.entradaOutubro.receitaMediaEvento) + ')')
console.log('Mix ISSQN na guia:', (D.mixIss * 100).toFixed(1) + '%')
console.log('Imposto sobre a parcela repassada:', f2(D.impostoSobreRepasse.media), '(media) /', f2(D.impostoSobreRepasse.max), '(teto)')
D.cenarios.forEach(c => console.log('  minimo global ' + c.chave.padEnd(5), f2(c.minimo.saldo).padStart(12), c.minimo.data))
