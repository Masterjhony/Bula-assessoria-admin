/**
 * Conciliacao Sicoob 20/08 -> 24/08/2026.
 * Fonte: extrato PDF sicoob_2026_08_24_16_22_23.pdf (periodo 01/08 a 24/08, saldo final 23.013,27 C).
 * Continuacao de scripts/concilia-sicoob-2026-08-20.mjs (que fechou em 29.169,19).
 *
 * Os 6 movimentos novos ja entraram pelo importador oficial
 * (POST /api/erp/movimentos/importar, CSV gerado por scripts/sicoob-pdf-para-csv.mjs),
 * como PENDENTE. Este script faz a parte humana: classificar e conciliar.
 *
 * Regra de vinculo: 1 movimento : 1 titulo vincula em `conta_pagar_id`.
 * 1 movimento : N titulos NAO vincula (a coluna e singular) — baixa os N,
 * marca o movimento conciliado e lista os titulos em `observacoes`.
 *
 * O que NAO se resolve aqui (fica `classificado`, decisao do Joao):
 *  - a entrada de 19.810,50 (acerto Bula Remates) e PARCIAL contra dois CR
 *    vencidos (Kriz 10.164,00 + Neloraco PO 25.155,00 = 35.319,00); o rateio
 *    entre os dois nao esta no extrato.
 *
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7' // Sicoob CC 1.056-1
const OBS = 'Extrato Sicoob 01-24/08/2026 (PDF sicoob_2026_08_24_16_22_23)'
const TAG = '[CONCILIADO 24/08]'
const SALDO_EXTRATO = 23013.27

const CAT = {
  comissaoRecebida: '0153d30c-e167-40c6-9c5a-2605bd39dc6e', // Comissoes Recebidas (receita)
  viagem: '98083139-0fbf-487a-9988-a08519ebf259',           // Viagem/Passagens (custo direto)
  comissaoFunc: 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e',     // Comissao Funcionario (custo direto)
  software: '0edf60f2-bf96-44bd-8f93-ca5432b69830',         // Software/Assinaturas (despesa fixa)
  cartao: 'bd6c6ed1-054a-404c-ba21-08f424888c1f',           // Cartao de Credito
}
const PESSOA = {
  bulaRemates: '0e458050-bf86-4c52-9a4e-a06d0b94a386',
  douglas: 'e1a5b047-e685-439a-a810-ee1b72a33f1f',  // GRUPO AGROBISPO 50.938.748/0001-08 (CNPJ do PIX)
  joao: '72f9c999-48cc-4d5a-8ab0-9db5fb758418',
}

const fmt = n => Number(n).toFixed(2).padStart(11)
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
let erros = 0
const fail = (e, ctx) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }

/* ------- os 6 movimentos novos, localizados pelo import_key do importador ---- */
const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,tipo,valor,descricao,documento,categoria_id,status_conciliacao,conta_pagar_id,conta_receber_id')
  .eq('conta_bancaria_id', CONTA).gte('data', '2026-08-20').order('data')
const acha = (data, valor, doc) => (movs || []).find(m =>
  m.data === data && Math.abs(Number(m.valor) - valor) < 0.005 && (!doc || m.documento === doc))

const M = {
  acerto: acha('2026-08-20', 19810.50, '3014534'),
  viagens: acha('2026-08-21', 6178.45, 'Pix'),
  douglas: acha('2026-08-24', 11908.00, 'Pix'),
  claude: acha('2026-08-24', 550.00, 'Pix'),
  master: acha('2026-08-24', 1380.13, 'MASTERCARD'),
  visa: acha('2026-08-24', 5949.84, 'DBAUTO VIS'),
}
for (const [k, v] of Object.entries(M)) if (!v) { console.error('FALTA o movimento "' + k + '" — rode o importador antes.'); process.exit(1) }

/* ---------------------------------------------------------------- helpers -- */
async function classifica(mov, { categoria_id, pessoa_id, status, conta_pagar_id, conta_receber_id, nota }) {
  console.log('  MOV ' + mov.data + ' ' + fmt(mov.valor) + ' -> ' + status + (nota ? '  (' + nota + ')' : ''))
  if (!APPLY) return
  const patch = { categoria_id, status_conciliacao: status, conciliado: status !== 'pendente', observacoes: [OBS, nota].filter(Boolean).join(' | ') }
  if (pessoa_id) patch.pessoa_id = pessoa_id
  if (conta_pagar_id) patch.conta_pagar_id = conta_pagar_id
  if (conta_receber_id) patch.conta_receber_id = conta_receber_id
  fail((await sb.from('erp_movimentos_bancarios').update(patch).eq('id', mov.id)).error, 'classifica ' + mov.data + ' ' + mov.valor)
}

async function baixaCP(id, { data_pagamento, forma_pagamento, nota }) {
  const { data: cp } = await sb.from('erp_contas_pagar').select('id,descricao,valor,status,observacoes').eq('id', id).single()
  if (!cp) { console.log('  BAIXA ! CP ' + id + ' nao existe'); erros++; return null }
  if (cp.status === 'pago') { console.log('  BAIXA = ja pago ' + fmt(cp.valor) + '  ' + cp.descricao.slice(0, 58)); return cp }
  console.log('  BAIXA ' + fmt(cp.valor) + '  ' + cp.descricao.slice(0, 62))
  if (APPLY) fail((await sb.from('erp_contas_pagar').update({
    status: 'pago', valor_pago: cp.valor, data_pagamento, forma_pagamento, conta_bancaria_id: CONTA,
    observacoes: ((cp.observacoes || '') + ' ' + TAG + ' ' + nota).trim(),
  }).eq('id', cp.id)).error, 'baixa CP ' + cp.descricao.slice(0, 24))
  return cp
}

async function criaCPPaga({ doc, descricao, valor, data, cat, pessoa_id, tags, nota }) {
  const { data: ja } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', doc).limit(1)
  if (ja && ja.length) { console.log('  CP  = ja existe  ' + descricao.slice(0, 60)); return ja[0].id }
  console.log('  CP  + pago ' + fmt(valor) + '  ' + descricao.slice(0, 60))
  if (!APPLY) return null
  const { data: ins, error } = await sb.from('erp_contas_pagar').insert({
    descricao, valor, valor_pago: valor, emissao: data, vencimento: data, data_pagamento: data,
    status: 'pago', categoria_id: cat, fornecedor_id: pessoa_id, conta_bancaria_id: CONTA,
    forma_pagamento: 'pix', numero_documento: doc, tags, observacoes: TAG + ' ' + nota,
  }).select('id').single()
  fail(error, 'CP nova ' + descricao.slice(0, 24))
  return ins?.id ?? null
}

/* ---------- 1) cartoes: 1 movimento : 1 titulo, valor e data exatos --------- */
console.log('\n[1] Faturas de cartao (24/08) — previstas pelo bloco "Lancamentos futuros" do extrato de 20/08')
const cpMaster = await baixaCP('b2d86004-8ef5-4fad-9e61-67c99c359ef1', {
  data_pagamento: '2026-08-24', forma_pagamento: 'debito_automatico',
  nota: 'Debitado em 24/08 (DEB.CONV.DEM.EMPRES, doc MASTERCARD) - valor exato.',
})
await classifica(M.master, { categoria_id: CAT.cartao, status: 'conciliado', conta_pagar_id: cpMaster?.id, nota: 'Fatura cartao MASTERCARD' })

const cpVisa = await baixaCP('2e82dcd6-0ce8-4af3-ba3b-e5626cf51ef7', {
  data_pagamento: '2026-08-24', forma_pagamento: 'debito_automatico',
  nota: 'Debitado em 24/08 (DEB.CONV.DEM.EMPRES, doc DBAUTO VIS) - valor exato.',
})
await classifica(M.visa, { categoria_id: CAT.cartao, status: 'conciliado', conta_pagar_id: cpVisa?.id, nota: 'Fatura cartao VISA' })

/* ---------- 2) viagens Expogenetica: 1 movimento : 2 titulos --------------- */
console.log('\n[2] Viagens Expogenetica (21/08) — um PIX de 6.178,45 quita DOIS titulos (4.196,87 + 1.981,58)')
for (const id of ['3605b2ed-5ce7-49c8-958a-409dbf24a6e9', 'ef6374fa-ac47-468e-98c6-867fe0f68c9b'])
  await baixaCP(id, { data_pagamento: '2026-08-21', forma_pagamento: 'pix', nota: 'Pago no PIX unico de 21/08 a 22.002.438/0001-41 (6.178,45 = 4.196,87 + 1.981,58).' })
await classifica(M.viagens, {
  categoria_id: CAT.viagem, status: 'conciliado',
  nota: 'Quita 2 titulos: BILHETE/BOLETO FABIO OMENA 4.196,87 (3605b2ed) + LEONARDO FRANCISCO 1.981,58 (ef6374fa). Sem vinculo 1:1 porque conta_pagar_id e singular.',
})

/* ---------- 3) assinatura Anthropic: debito sem titulo previo -------------- */
console.log('\n[3] Assinatura Anthropic/Claude (24/08) — reembolso via PIX, sem titulo previo')
const cpClaude = await criaCPPaga({
  doc: 'sicoob24:assinatura-anthropic-claude', descricao: 'ASSINATURA ANTHROPIC / CLAUDE IA - reembolso via PIX',
  valor: 550.00, data: '2026-08-24', cat: CAT.software, pessoa_id: PESSOA.joao,
  tags: ['a-pagar', 'agosto', 'software'],
  nota: 'PIX de 24/08 a ***.037.156-** "Ref assinatura Antrophic Claude IA". Mesmo padrao do reembolso de 180,00 em 18/08.',
})
await classifica(M.claude, { categoria_id: CAT.software, pessoa_id: PESSOA.joao, status: 'conciliado', conta_pagar_id: cpClaude, nota: 'Assinatura Anthropic (Claude IA)' })

/* ---------- 4) comissoes de julho do Douglas: 1 movimento : N titulos ------ */
console.log('\n[4] Comissoes julho/2026 - Douglas Bispo (24/08, 11.908,00)')
const { data: cpDoug } = await sb.from('erp_contas_pagar').select('id,descricao,valor,status,observacoes')
  .eq('vencimento', '2026-08-25').neq('status', 'cancelado').ilike('descricao', '%DOUGLAS BISPO%')
const somaDoug = (cpDoug || []).reduce((s, c) => s + Number(c.valor), 0)
console.log('  ERP tem ' + (cpDoug || []).length + ' titulo(s) abertos = ' + brl(somaDoug) + ' | PIX pago = 11.908,00 | devido conferido 24/08 = 12.228,00')
const complemento = Number((11908 - somaDoug).toFixed(2))
for (const c of cpDoug || [])
  await baixaCP(c.id, { data_pagamento: '2026-08-24', forma_pagamento: 'pix', nota: 'Pago no PIX unico de 24/08 a 50.938.748/0001-08 (11.908,00, "Ref Comissoes Douglas Julho").' })

// O PIX pagou 1.792,00 alem do que o ERP tinha lancado: sao os lotes que a
// conferencia de 24/08 achou a favor dele e que nunca viraram titulo — Kriz
// Reprodutores 07/07 (1.602,00, leilao sem fechamento no sistema) e o lote 116
// do Santa Cruz 1a (510,00, lancado no Leonardo por engano) — menos os 320,00
// do lote 19 do Nelore Sorriso, que ele cobrou a 400 em vez de 500.
let cpComplemento = null
if (complemento > 0.005) {
  cpComplemento = await criaCPPaga({
    doc: 'sicoob24:comissao-julho-douglas-complemento',
    descricao: 'COMPLEMENTO COMISSAO JULHO/2026 - DOUGLAS BISPO (lotes fora dos fechamentos)',
    valor: complemento, data: '2026-08-24', cat: CAT.comissaoFunc, pessoa_id: PESSOA.douglas,
    tags: ['a-pagar', 'agosto', 'comissao'],
    nota: `Diferenca entre o PIX de 24/08 (11.908,00) e os titulos lancados (${brl(somaDoug)}). Corresponde a Kriz Reprodutores 07/07 (1.602,00) + lote 116 Santa Cruz 1a (510,00) menos os 320,00 do lote 19 do Nelore Sorriso (ele cobrou 400 em vez de 500). Devido conferido: 12.228,00 — restam 320,00 a favor dele, ainda NAO lancados.`,
  })
}
await classifica(M.douglas, {
  categoria_id: CAT.comissaoFunc, pessoa_id: PESSOA.douglas, status: 'conciliado',
  nota: `Quita ${(cpDoug || []).length} titulos de 25/08 (${brl(somaDoug)}) + complemento ${brl(complemento)}. Devido conferido 12.228,00; saldo de 320,00 (lote 19 Nelore Sorriso) segue em aberto, sem titulo.`,
})

/* ---------- 5) acerto Bula Remates: entrada PARCIAL, rateio a decidir ------ */
console.log('\n[5] Acerto Bula Remates (20/08, +19.810,50) — PARCIAL, sem baixa de CR')
const { data: crAbertos } = await sb.from('erp_contas_receber').select('id,descricao,valor,status')
  .eq('vencimento', '2026-08-20').in('status', ['aberto', 'vencido'])
for (const c of crAbertos || []) console.log('  CR aberto ' + fmt(c.valor) + '  ' + c.descricao.slice(0, 60))
const somaCR = (crAbertos || []).reduce((s, c) => s + Number(c.valor), 0)
console.log('  soma ' + brl(somaCR) + ' x recebido 19.810,50 -> faltam ' + brl(somaCR - 19810.5) + ' (rateio Kriz x Neloraco NAO esta no extrato)')
await classifica(M.acerto, {
  categoria_id: CAT.comissaoRecebida, pessoa_id: PESSOA.bulaRemates, status: 'classificado',
  nota: `Recebimento PARCIAL contra os CR vencidos de 20/08 (Kriz 10.164,00 + Neloraco PO 25.155,00 = ${brl(somaCR)}). Rateio a definir — CR NAO baixados de proposito.`,
})

/* ---------- 6) validacao por saldo ---------------------------------------- */
console.log('\n[6] Validacao por saldo')
const { data: conta } = await sb.from('erp_contas_bancarias').select('saldo_atual,saldo_inicial').eq('id', CONTA).single()
let all = [], from = 0
for (;;) {
  const { data } = await sb.from('erp_movimentos_bancarios').select('tipo,valor').eq('conta_bancaria_id', CONTA).range(from, from + 999)
  all = all.concat(data || [])
  if (!data || data.length < 1000) break
  from += 1000
}
const net = all.reduce((s, m) => s + (m.tipo === 'entrada' ? 1 : m.tipo === 'saida' ? -1 : 0) * Number(m.valor), 0)
const calc = Number(conta.saldo_inicial) + net
console.log('  gravado ' + fmt(conta.saldo_atual) + ' | recalculado ' + fmt(calc) + ' | extrato ' + fmt(SALDO_EXTRATO))
console.log(Math.abs(calc - SALDO_EXTRATO) < 0.005 ? '  OK saldo bate com o extrato.' : '  ATENCAO diferenca de R$ ' + Math.abs(calc - SALDO_EXTRATO).toFixed(2))

console.log('\n' + (APPLY ? (erros ? '*** ' + erros + ' erro(s) ***' : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.'))
