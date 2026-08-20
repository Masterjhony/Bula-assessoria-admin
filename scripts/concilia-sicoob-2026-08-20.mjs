/**
 * Conciliacao Sicoob 18/08 -> 20/08/2026.
 * Fonte: extrato PDF sicoob_2026_08_20_13_47_47.pdf (periodo 01/08 a 20/08, saldo final 29.169,19 C).
 * Continuacao de scripts/concilia-sicoob-2026-08-17.mjs (que fechou em 87.045,43).
 *
 * Faz:
 *  1) importa os 5 movimentos novos (18/08 e 20/08)
 *  2) baixa as 3 CP agendadas que o extrato confirma pagas em 20/08 (DAS, REMAT marcas, DARF funcionarios)
 *  3) cria CP ja pagas dos 2 debitos de 18/08 que nao tinham titulo
 *  4) confere o bloco "Lancamentos futuros" contra as CP em aberto
 *  5) valida o saldo contra o extrato
 *
 * Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fs from 'fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7' // Sicoob CC 1.056-1
const OBS = 'Extrato Sicoob 01-20/08/2026 (PDF sicoob_2026_08_20_13_47_47)'
const TAG = '[CONCILIADO 20/08]'
const SALDO_EXTRATO = 29169.19

const CAT = {
  leilao: '562264eb-8134-4990-a56b-d884279acf90',    // Despesa Operacional Leilao
  imposto: '6d3270c8-2680-4cdd-a709-5b1520d1f430',   // Impostos e Taxas
  encargos: '05a6785c-3fe2-4411-a70e-5f2ac7083863',  // Encargos Sociais
  terceiros: '1f72e05d-01ed-474b-bc83-90974be930f9', // Servicos de Terceiros
  software: '0edf60f2-bf96-44bd-8f93-ca5432b69830',  // Software/Assinaturas
}
const fmt = n => Number(n).toFixed(2).padStart(11)
let erros = 0
const fail = (e, ctx) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }

/* ---------- 1) movimentos novos (18/08 e 20/08) ---------- */
const MOV = [
  ['2026-08-18', 'saida', 180.00, 'PIX EMITIDO OUTRA IF - ***.037.156-** - Ref pagamento sistema fatura banco de dados', 'Pix', CAT.software],
  ['2026-08-18', 'saida', 240.00, 'PIX EMITIDO OUTRA IF - 68.392.671 0001-89 - Ref restante uniformes expogenetica', 'Pix', CAT.leilao],
  ['2026-08-20', 'saida', 495.00, 'DEB.TIT.COMPE.EFETIVADO - Ref Remat deferimento marcas 1 pgto', '2996830', CAT.terceiros],
  ['2026-08-20', 'saida', 55846.64, 'DB.CONV.TR FD-RFB - Ref Simples Nacional Julho (DAS)', '2996829', CAT.imposto],
  ['2026-08-20', 'saida', 1114.60, 'DB.CONV.TR FD-RFB - Darf funcionarios', '2965048', CAT.encargos],
]
const { data: jaTemMov } = await sb.from('erp_movimentos_bancarios')
  .select('import_key').eq('conta_bancaria_id', CONTA).gte('data', '2026-08-17')
const chaves = new Set((jaTemMov || []).map(m => m.import_key))
const movId = {}
let novos = 0
for (const [data, tipo, valor, descricao, documento, categoria_id] of MOV) {
  const key = 'csv:' + crypto.createHash('sha1')
    .update([CONTA, data, tipo, valor.toFixed(2), descricao].join('|')).digest('hex').slice(0, 24)
  if (chaves.has(key)) { console.log('MOV = ja existe  ' + data + fmt(valor) + '  ' + descricao.slice(0, 60)); continue }
  novos++
  console.log('MOV + ' + data + ' ' + tipo.padEnd(7) + fmt(valor) + '  ' + descricao.slice(0, 74))
  if (APPLY) {
    const { data: ins, error } = await sb.from('erp_movimentos_bancarios').insert({
      conta_bancaria_id: CONTA, data, tipo, valor, descricao, documento, categoria_id,
      origem: 'importacao_csv', observacoes: OBS, import_key: key,
      conciliado: true, status_conciliacao: 'classificado',
    }).select('id').single()
    fail(error, 'mov ' + descricao.slice(0, 30))
    if (ins) movId[valor.toFixed(2) + '@' + data] = ins.id
  }
}
console.log('-> ' + novos + ' movimentos novos')
console.log('')

/* ---------- 2) baixa das CP agendadas confirmadas no extrato ---------- */
const baixasCP = [
  { like: 'Simples Nacional (DAS) ref. julho/2026%', venc: '2026-08-20', valor: 55846.64, mov: '55846.64@2026-08-20',
    nota: 'Debitado em 20/08 (DB.CONV.TR FD-RFB, doc 2996829) - valor exato da guia, confirmado no extrato.' },
  { like: 'REMAT - deferimento de marcas%', venc: '2026-08-20', valor: 495.00, mov: '495.00@2026-08-20',
    nota: 'Debitado em 20/08 (DEB.TIT.COMPE.EFETIVADO, doc 2996830) - 1o pagamento do deferimento de marcas.' },
  { like: 'DARF funcionarios%', venc: '2026-08-20', valor: 1114.60, mov: '1114.60@2026-08-20',
    nota: 'Debitado em 20/08 (DB.CONV.TR FD-RFB, doc 2965048).' },
]
for (const b of baixasCP) {
  const { data: cps } = await sb.from('erp_contas_pagar')
    .select('id,descricao,valor,status,observacoes')
    .ilike('descricao', b.like).eq('vencimento', b.venc).neq('status', 'pago').neq('status', 'cancelado')
  if (!cps || !cps.length) { console.log('BAIXA CP ! nao encontrada: ' + b.like); continue }
  for (const cp of cps) {
    if (Math.abs(Number(cp.valor) - b.valor) > 0.005) {
      console.log('BAIXA CP ! valor divergente ' + fmt(cp.valor) + ' x extrato ' + fmt(b.valor) + '  ' + cp.descricao.slice(0, 50))
      continue
    }
    console.log('BAIXA CP ' + fmt(cp.valor) + '  ' + cp.descricao.slice(0, 66))
    if (APPLY) {
      const { error } = await sb.from('erp_contas_pagar').update({
        status: 'pago', valor_pago: cp.valor, data_pagamento: '2026-08-20',
        forma_pagamento: 'debito_automatico', conta_bancaria_id: CONTA,
        observacoes: ((cp.observacoes || '') + ' ' + TAG + ' ' + b.nota).trim(),
      }).eq('id', cp.id)
      fail(error, 'baixa CP ' + cp.descricao.slice(0, 24))
      if (movId[b.mov]) {
        const { error: e2 } = await sb.from('erp_movimentos_bancarios')
          .update({ conta_pagar_id: cp.id, conciliado: true, status_conciliacao: 'conciliado' })
          .eq('id', movId[b.mov])
        fail(e2, 'vinculo mov->CP')
      }
    }
  }
}
console.log('')

/* ---------- 3) CP novas ja pagas (debitos de 18/08 sem titulo) ---------- */
const novasPagas = [
  { doc: 'sicoob20:sistema-banco-dados', descricao: 'SISTEMA / BANCO DE DADOS - fatura (reembolso via PIX)',
    valor: 180.00, venc: '2026-08-18', cat: CAT.software,
    tags: ['a-pagar', 'agosto', 'software'],
    nota: 'PIX de 18/08 a ***.037.156-** "Ref pagamento sistema fatura banco de dados". Sem titulo previo no ERP.' },
  { doc: 'sicoob20:uniformes-expo-restante', descricao: 'RESTANTE UNIFORMES EXPOGENETICA - 68.392.671/0001-89',
    valor: 240.00, venc: '2026-08-18', cat: CAT.leilao,
    tags: ['a-pagar', 'agosto', 'leilao', 'expogenetica'],
    nota: 'PIX de 18/08 "Ref restante uniformes expogenetica". Fecha os R$ 480,00 do lote (entrada de 240,00 em 11/08).' },
]
for (const n of novasPagas) {
  const { data: ja } = await sb.from('erp_contas_pagar').select('id').eq('numero_documento', n.doc).limit(1)
  if (ja && ja.length) { console.log('CP  = ja existe  ' + n.descricao.slice(0, 60)); continue }
  console.log('CP  + pago ' + fmt(n.valor) + '  ' + n.descricao.slice(0, 62))
  if (APPLY) {
    const { data: ins, error } = await sb.from('erp_contas_pagar').insert({
      descricao: n.descricao, valor: n.valor, valor_pago: n.valor,
      emissao: n.venc, vencimento: n.venc, data_pagamento: n.venc, status: 'pago',
      categoria_id: n.cat, conta_bancaria_id: CONTA,
      forma_pagamento: 'pix', numero_documento: n.doc, tags: n.tags,
      observacoes: TAG + ' ' + n.nota,
    }).select('id').single()
    fail(error, 'CP nova ' + n.descricao.slice(0, 24))
    const k = n.valor.toFixed(2) + '@' + n.venc
    if (ins && movId[k]) {
      const { error: e2 } = await sb.from('erp_movimentos_bancarios')
        .update({ conta_pagar_id: ins.id, conciliado: true, status_conciliacao: 'conciliado' }).eq('id', movId[k])
      fail(e2, 'vinculo mov->CP nova')
    }
  }
}
console.log('')

/* ---------- 4) conferencia do bloco "Lancamentos futuros" ---------- */
const futuros = [
  { venc: '2026-08-21', valor: 6178.45, o: 'PIX 22.002.438/0001-41 viagens Fabio e Leonardo expogenetica', likes: ['BILHETE/BOLETO - FABIO OMENA GAIA%', 'BILHETE/BOLETO - LEONARDO FRANCISCO%'] },
  { venc: '2026-08-24', valor: 5949.84, o: 'DEB.CONV.DEM.EMPRES / DBAUTO VIS', likes: ['Fatura cartao VISA%'] },
  { venc: '2026-08-24', valor: 1380.13, o: 'DEB.CONV.DEM.EMPRES / MASTERCARD', likes: ['Fatura cartao MASTERCARD%'] },
  { venc: '2026-09-15', valor: 62.04, o: 'DEB. CONV. SEGUROS / SICOOB SEG', likes: ['Seguro Sicoob (deb. automatico 15/09)'] },
  { venc: '2026-09-15', valor: 122.60, o: 'DEB. CONV. SEGUROS / SICOOB SEG', likes: ['Seguro Sicoob (deb. automatico 15/09)'] },
]
const vistos = new Set()
for (const f of futuros) {
  let soma = 0, achou = 0
  for (const like of f.likes) {
    const { data: cps } = await sb.from('erp_contas_pagar').select('id,descricao,valor,status')
      .ilike('descricao', like).eq('vencimento', f.venc).neq('status', 'cancelado')
    for (const cp of cps || []) {
      if (vistos.has(cp.id)) continue
      if (f.likes.length === 1 && Math.abs(Number(cp.valor) - f.valor) > 0.005) continue
      vistos.add(cp.id); soma += Number(cp.valor); achou++
    }
  }
  const ok = Math.abs(soma - f.valor) < 0.005
  console.log((ok ? 'FUT  OK ' : 'FUT  !! ') + f.venc + fmt(f.valor) + ' | ERP ' + fmt(soma) + ' (' + achou + ' CP)  ' + f.o.slice(0, 46))
}
console.log('')

/* ---------- 5) validacao por saldo ---------- */
const { data: conta } = await sb.from('erp_contas_bancarias').select('saldo_atual,saldo_inicial').eq('id', CONTA).single()
let all = [], from = 0
while (true) {
  const { data } = await sb.from('erp_movimentos_bancarios').select('tipo,valor').eq('conta_bancaria_id', CONTA).range(from, from + 999)
  all = all.concat(data)
  if (data.length < 1000) break
  from += 1000
}
const net = all.reduce((s, m) => s + (m.tipo === 'entrada' ? 1 : m.tipo === 'saida' ? -1 : 0) * Number(m.valor), 0)
const calc = Number(conta.saldo_inicial) + net
console.log('SALDO  gravado ' + fmt(conta.saldo_atual) + ' | recalculado ' + fmt(calc) + ' | extrato ' + fmt(SALDO_EXTRATO))
const diff = Math.abs(calc - SALDO_EXTRATO)
if (diff < 0.005) console.log('OK  saldo bate com o extrato.')
else if (APPLY) console.log('ATENCAO diferenca de R$ ' + diff.toFixed(2))
else console.log('dry-run: diferenca esperada de R$ ' + diff.toFixed(2) + ' (soma dos movimentos ainda nao gravados)')
console.log(APPLY ? (erros ? '*** ' + erros + ' erro(s) ***' : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.')
