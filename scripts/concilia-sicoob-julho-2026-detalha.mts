/**
 * JULHO/2026 — troca o lancamento AGREGADO de 25-29/07 pelos lancamentos reais.
 *
 * Julho ja estava 100% "conciliado" no ERP, mas com um buraco escondido: em
 * 04/08 a sessao daquele dia nao tinha o extrato de 25 a 31/07 e fechou o mes
 * com DOIS lancamentos-tampao, escritos com todas as letras na observacao —
 * "Substituir pelos lancamentos reais quando o extrato for puxado":
 *
 *   29/07  +3.032,92  MOVIMENTOS AGREGADOS 25-29/07   (mov 3ce01898 / CR c5d8bcd0)
 *   31/07  -6.672,06  MOVIMENTOS AGREGADOS 30-31/07   (mov db2803f6 / CP 2d2b9c1c)
 *
 * O tampao fecha o SALDO, entao nenhuma validacao reclamava — e o mes parecia
 * conferido. Mas um valor liquido nao tem contraparte, nao tem titulo e nao
 * baixa nada: os dois recebimentos que estavam ali dentro continuaram
 * aparecendo como "a receber vencido" por mais de um mes.
 *
 * O extrato `sicoob_2026_07_29_10_50_55.pdf` (01 a 29/07, 68 lancamentos,
 * validacao por saldo OK) resolve o PRIMEIRO tampao. Convertido por
 * sicoob-pdf-para-csv.mjs e importado por importa-extrato.mts: 5 novos, 63
 * deduplicados. Os 5 somam exatamente os 3.032,92 do tampao.
 *
 * [1] 27/07  +2.405,00  EDUARDO PINHEIRO CAMPOS — 2a parcela da NF 615 (Terra
 *     Brava junho/2026, 7.215,00 em 3 x 2.405,00). ⭐ CORRIGE A LEITURA DE
 *     26/08: o PIX de 25/08 foi tratado como a 1a parcela; era a 2a. Faltava
 *     4.810,00, falta 2.405,00.
 * [2] 29/07  +2.800,00  CRED.LIQ.COBRANCA = Leilao Virtual Touros Matinha —
 *     Thiago (1/2), boleto com vencimento em 29/07. Pagou NO DIA e o titulo
 *     seguia "vencido" com zero recebido. A parcela (2/2) ja tinha sido
 *     baixada em 11/08 — o ERP mostrava a 2a paga e a 1a em aberto.
 * [3] 29/07     -2,08  TARIFA COBRANCA — tarifa do boleto de [2].
 * [4] 29/07 -2.000,00  Trafego da campanha do Leilao Sao Geraldo (Meta).
 * [5] 29/07   -170,00  "Taxi Marcelo Cofins" (PIX a CPF ***.037.836-**).
 * [6] Apaga o tampao 3ce01898 e o CR stub c5d8bcd0 — o liquido dos cinco e
 *     identico ao centavo, entao o saldo nao se move.
 *
 * [7] Faxina de detalhe: o PIX de 3.000,00 de 09/07 estava em "Outras Despesas"
 *     com a nota "IDENTIFICAR / aguarda revisao". O CNPJ 13.347.016/0001-17 e
 *     o Facebook — todos os outros pagamentos a ele sao trafego pago. Vira
 *     Marketing e Publicidade.
 * [8] O pass-through do Leilao Prata 2025 (13/07, +38.000 de Francisco Prata e
 *     -38.000 para Felipe Vilela Andrade no mesmo dia) tinha as duas pernas
 *     marcadas como transferencia mas SEM par declarado. Passa a ter.
 *
 * ⚠ O SEGUNDO tampao (30-31/07, -6.672,06) CONTINUA: nao existe extrato de
 * 30-31/07. Apagar sem ter o detalhe quebraria o saldo de 31/07, que hoje bate
 * ao centavo com o SALDO ANTERIOR do extrato de agosto (25.208,83). Fica
 * declarado — e some assim que o Joao puxar o extrato de 01 a 31/07.
 *
 * Reexecutavel. Dry-run por padrao. Use --apply para gravar.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

const APPLY = process.argv.includes('--apply')
const CONTA = 'e0eca43c-1a2c-4077-ab54-801eb5d692e7'
const TAG = '[JULHO-DETALHE 02/09]'
const FONTE = 'Extrato Sicoob 01-29/07/2026 (PDF sicoob_2026_07_29_10_50_55, validacao por saldo OK)'
const SALDO_HOJE = 60682.37

const CAT_COMISSAO_LEIL = 'e74434bd-3366-4015-9268-15d6640cf15f'
const CAT_MARKETING     = '26762d4e-b517-48b9-98f3-155a6421264e'
const CAT_TARIFAS       = 'f8ae3a53-bb4e-414e-97d1-ebdca81df658'
const CAT_TRANSPORTE    = '39139125-e4b4-4b9c-9438-28d775e9e637'
const CC_MARKETING      = '70886cf3-c996-46de-a049-26581b3d08ad'
const P_SICOOB_T        = 'e5488a95-aef2-4288-aba6-428c5c5fbdb2'
const P_FACEBOOK        = '51ebfcd7-2cb0-4ad0-9052-e73e8f68cc82'
const MOV_PLUG_2529     = '3ce01898-0692-498a-b394-5aae0afd556f'
const CR_PLUG_2529      = 'c5d8bcd0-8b75-450d-9446-140cd4bcad8f'

const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const fmt = (n: any) => brl(n).padStart(12)
let erros = 0
const fail = (e: any, ctx: string) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }
const anexa = (antes: any, nota: string) => String(antes || '').includes(TAG) ? String(antes || '') : (String(antes || '') + '\n' + nota).trim()

console.log(APPLY ? '>>> APLICANDO <<<' : '>>> DRY-RUN (use --apply para gravar) <<<')

/* ---------- os cinco lancamentos reais de 25-29/07 ------------------------ */
const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,tipo,valor,descricao,status_conciliacao,observacoes,conta_pagar_id,conta_receber_id,pessoa_id,categoria_id')
  .eq('conta_bancaria_id', CONTA).gte('data', '2026-07-25').lte('data', '2026-07-29')
const acha = (data: string, tipo: string, valor: number, re?: RegExp) => (movs || []).find(m =>
  m.data === data && m.tipo === tipo && Math.abs(Number(m.valor) - valor) < 0.005 && (!re || re.test(String(m.descricao))))

const mvEduardo = acha('2026-07-27', 'entrada', 2405)
const mvMatinha = acha('2026-07-29', 'entrada', 2800)
const mvTarifa  = acha('2026-07-29', 'saida', 2.08)
const mvMeta    = acha('2026-07-29', 'saida', 2000)
const mvTaxi    = acha('2026-07-29', 'saida', 170)
const falta = Object.entries({ mvEduardo, mvMatinha, mvTarifa, mvMeta, mvTaxi }).filter(([, v]) => !v).map(([k]) => k)
if (falta.length) {
  console.error('FALTAM os lancamentos reais de 25-29/07 no ERP: ' + falta.join(', '))
  console.error('Rode antes:')
  console.error('  node scripts/sicoob-pdf-para-csv.mjs "F:/sicoob_2026_07_29_10_50_55.pdf" jul.csv')
  console.error('  npx tsx scripts/importa-extrato.mts jul.csv --apply')
  process.exit(1)
}
const liquido = 2405 + 2800 - 2.08 - 2000 - 170
console.log('\n--- trava de sanidade ---')
console.log('  liquido dos 5 lancamentos ... ' + fmt(liquido))
console.log('  tampao 25-29/07 ............. ' + fmt(3032.92))
if (Math.abs(liquido - 3032.92) > 0.005) { console.error('  ! nao batem — abortado'); process.exit(1) }
console.log('  batem ao centavo: o saldo nao se move ao trocar um pelo outro.')

/* ---------- resolve os dois CR alvo --------------------------------------- */
const { data: crTB } = await sb.from('erp_contas_receber').select('*')
  .ilike('descricao', '%TERRA BRAVA%JUNHO/2026%').eq('valor', 7215).maybeSingle()
const { data: crMT } = await sb.from('erp_contas_receber').select('*')
  .ilike('descricao', '%MATINHA - THIAGO (1/2)%').maybeSingle()
if (!crTB) { console.error('CR do Terra Brava (7.215,00) nao encontrado'); erros++ }
if (!crMT) { console.error('CR do Matinha Thiago (1/2) nao encontrado'); erros++ }
if (erros) process.exit(1)

/* ================= [1] TERRA BRAVA +2.405,00 (27/07) ====================== */
console.log('\n[1] 27/07  +' + fmt(2405) + '  EDUARDO PINHEIRO CAMPOS — NF 615 Terra Brava, parcela de 3')
const jaTem = Number(crTB!.valor_recebido || 0) >= 4810 - 0.005
const recebidoNovo = jaTem ? Number(crTB!.valor_recebido) : Number(crTB!.valor_recebido || 0) + 2405
const NOTA_TB = TAG + ' Parcela recebida em 27/07/2026 por PIX de EDUARDO PINHEIRO CAMPOS (CPF ***.530.756-**), 2.405,00 — estava dentro do lancamento AGREGADO 25-29/07 e por isso nunca foi baixada. ⭐ CORRIGE A LEITURA DE 26/08: o PIX de 25/08 foi registrado como a 1a das 3 parcelas da NF 615 (7.215,00 = 3 x 2.405,00); com esta, ele era a 2a. Recebido acumulado passa a ' + brl(recebidoNovo) + ' e RESTA UMA parcela de 2.405,00, nao duas.'
console.log('    CR ' + String(crTB!.id).slice(0, 8) + '  recebido ' + brl(crTB!.valor_recebido) + ' -> ' + brl(recebidoNovo) + ' de ' + brl(crTB!.valor) + '  |  status ' + crTB!.status + ' -> parcial')
if (APPLY) {
  fail((await sb.from('erp_contas_receber').update({
    valor_recebido: recebidoNovo, status: recebidoNovo >= Number(crTB!.valor) - 0.005 ? 'recebido' : 'parcial',
    data_recebimento: crTB!.data_recebimento || '2026-07-27', conta_bancaria_id: CONTA,
    observacoes: anexa(crTB!.observacoes, NOTA_TB),
  }).eq('id', crTB!.id)).error, 'baixa CR Terra Brava')
  fail((await sb.from('erp_movimentos_bancarios').update({
    categoria_id: CAT_COMISSAO_LEIL, pessoa_id: crTB!.cliente_id ?? null, conta_receber_id: crTB!.id,
    status_conciliacao: 'conciliado', conciliado: true,
    observacoes: [FONTE, NOTA_TB].join(' | '),
  }).eq('id', mvEduardo!.id)).error, 'concilia Eduardo')
}

/* ================= [2] MATINHA THIAGO +2.800,00 (29/07) =================== */
console.log('\n[2] 29/07  +' + fmt(2800) + '  CRED.LIQ.COBRANCA = Matinha Thiago (1/2), venc. ' + crMT!.vencimento)
const NOTA_MT = TAG + ' Liquidacao do boleto do LEILAO VIRTUAL TOUROS MATINHA - THIAGO (1/2), vencimento ' + crMT!.vencimento + ' — pago NO DIA do vencimento. Estava dentro do lancamento AGREGADO 25-29/07, entao o titulo seguia "vencido" com zero recebido enquanto a parcela (2/2) ja constava liquidada em 11/08. Tarifa de cobranca de 2,08 no mesmo dia.'
console.log('    CR ' + String(crMT!.id).slice(0, 8) + '  recebido ' + brl(crMT!.valor_recebido) + ' -> ' + brl(2800) + '  |  status ' + crMT!.status + ' -> recebido')
if (APPLY) {
  fail((await sb.from('erp_contas_receber').update({
    valor_recebido: 2800, status: 'recebido', data_recebimento: '2026-07-29',
    forma_recebimento: 'Boleto (liquidacao cobranca)', conta_bancaria_id: CONTA,
    observacoes: anexa(crMT!.observacoes, NOTA_MT),
    tags: Array.from(new Set([...(crMT!.tags || []), 'data_confirmada'])),
  }).eq('id', crMT!.id)).error, 'baixa CR Matinha')
  fail((await sb.from('erp_movimentos_bancarios').update({
    categoria_id: CAT_COMISSAO_LEIL, pessoa_id: crMT!.cliente_id ?? null, conta_receber_id: crMT!.id,
    status_conciliacao: 'conciliado', conciliado: true,
    observacoes: [FONTE, NOTA_MT].join(' | '),
  }).eq('id', mvMatinha!.id)).error, 'concilia Matinha')
}

/* ============ [3][4][5] as tres saidas de 29/07 =========================== */
const SAIDAS: { mov: any; valor: number; cat: string; cc?: string; pessoa?: string; desc: string; nota: string; tags: string[] }[] = [
  { mov: mvTarifa, valor: 2.08, cat: CAT_TARIFAS, pessoa: P_SICOOB_T,
    desc: 'Tarifa de cobranca Sicoob - liquidacao boleto Matinha Thiago (1/2)',
    nota: TAG + ' Tarifa de cobranca do boleto do Matinha liquidado no mesmo dia (2.800,00).',
    tags: ['a-pagar', '2026', 'julho', 'tarifa', 'espelho-extrato'] },
  { mov: mvMeta, valor: 2000, cat: CAT_MARKETING, cc: CC_MARKETING, pessoa: P_FACEBOOK,
    desc: 'Marketing - trafego da campanha do Leilao Sao Geraldo (Meta)',
    nota: TAG + ' Trafego pago no Meta para a campanha do Leilao Touros Fazenda Sao Geraldo (01/08), pago em 29/07 ao CNPJ 13.347.016/0001-17. Mesma natureza dos PIX de 24/07 (2.000,00), 10/08 (3.500,00) e 27/08 (2.000,00).',
    tags: ['a-pagar', '2026', 'julho', 'marketing', 'espelho-extrato'] },
  { mov: mvTaxi, valor: 170, cat: CAT_TRANSPORTE,
    desc: 'Taxi Marcelo - PIX a CPF ***.037.836-**',
    nota: TAG + ' PIX de 170,00 com memo "Taxi Marcelo Cofins" para o CPF ***.037.836-**, que nao esta na base de pessoas. Classificado pelo memo como transporte; CONFIRMAR com o chefe de quem e o CPF.',
    tags: ['a-pagar', '2026', 'julho', 'espelho-extrato', 'conferir-contraparte'] },
]
for (const [i, s] of SAIDAS.entries()) {
  console.log('\n[' + (i + 3) + '] 29/07  -' + fmt(s.valor) + '  ' + s.desc)
  let cpId: string | null = s.mov.conta_pagar_id ?? null
  const { data: ja } = await sb.from('erp_contas_pagar').select('id')
    .eq('categoria_id', s.cat).eq('vencimento', '2026-07-29').eq('valor', s.valor).maybeSingle()
  if (ja) { cpId = ja.id; console.log('    CP = ja existe ' + ja.id.slice(0, 8)) }
  else {
    console.log('    CP + criar e baixar')
    if (APPLY) {
      const { data, error } = await sb.from('erp_contas_pagar').insert({
        descricao: s.desc, fornecedor_id: s.pessoa ?? null, categoria_id: s.cat, centro_custo_id: s.cc ?? null,
        conta_bancaria_id: CONTA, valor: s.valor, valor_pago: s.valor,
        emissao: '2026-07-29', vencimento: '2026-07-29', data_pagamento: '2026-07-29',
        status: 'pago', forma_pagamento: 'pix', parcela: 1, total_parcelas: 1,
        recorrencia: 'nenhuma', origem: 'real', observacoes: s.nota, tags: s.tags,
      }).select('id').single()
      fail(error, 'cria CP ' + s.desc); cpId = data?.id ?? null
    }
  }
  if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
    categoria_id: s.cat, centro_custo_id: s.cc ?? null, pessoa_id: s.pessoa ?? null, conta_pagar_id: cpId,
    status_conciliacao: 'conciliado', conciliado: true,
    observacoes: [FONTE, s.nota].join(' | '),
  }).eq('id', s.mov.id)).error, 'concilia ' + s.desc)
}

/* ================= [6] apaga o tampao de 25-29/07 ========================= */
console.log('\n[6] 29/07  +' + fmt(3032.92) + '  APAGAR o tampao MOVIMENTOS AGREGADOS 25-29/07')
const { data: plug } = await sb.from('erp_movimentos_bancarios').select('id,valor,descricao').eq('id', MOV_PLUG_2529).maybeSingle()
if (!plug) console.log('    (ja removido)')
else if (!/AGREGADOS 25-29/.test(String(plug.descricao))) { console.error('    ! o movimento ' + MOV_PLUG_2529.slice(0, 8) + ' nao e o tampao esperado'); erros++ }
else {
  console.log('    mov ' + MOV_PLUG_2529.slice(0, 8) + ' + CR stub ' + CR_PLUG_2529.slice(0, 8) + ' -> removidos')
  if (APPLY) {
    fail((await sb.from('erp_movimentos_bancarios').delete().eq('id', MOV_PLUG_2529)).error, 'apaga movimento tampao')
    fail((await sb.from('erp_contas_receber').delete().eq('id', CR_PLUG_2529)).error, 'apaga CR tampao')
  }
}

/* ================= [7] faxina: 3.000,00 de 09/07 ao Facebook ============== */
console.log('\n[7] 09/07  -' + fmt(3000) + '  PIX ao CNPJ 13.347.016/0001-17 (Facebook) — estava em "Outras Despesas"')
const { data: mv3k } = await sb.from('erp_movimentos_bancarios').select('id,observacoes,categoria_id,conta_pagar_id')
  .eq('conta_bancaria_id', CONTA).eq('data', '2026-07-09').eq('tipo', 'saida').eq('valor', 3000).maybeSingle()
if (!mv3k) console.log('    (movimento nao encontrado)')
else if (mv3k.categoria_id === CAT_MARKETING) console.log('    (ja reclassificado)')
else {
  const NOTA_3K = TAG + ' Contraparte e o FACEBOOK SERVICOS ONLINE DO BRASIL (CNPJ 13.347.016/0001-17), o mesmo de todos os pagamentos de trafego pago da Bula (24/07, 29/07, 10/08, 27/08). O memo "solicitado Joao" nao dizia a natureza e o lancamento tinha ficado em "Outras Despesas" com a nota "IDENTIFICAR / aguarda revisao". Reclassificado para Marketing e Publicidade.'
  console.log('    -> Marketing e Publicidade, centro de custo Prestacoes Servico Marketing')
  if (APPLY) {
    fail((await sb.from('erp_movimentos_bancarios').update({
      categoria_id: CAT_MARKETING, centro_custo_id: CC_MARKETING, pessoa_id: P_FACEBOOK,
      observacoes: anexa(mv3k.observacoes, NOTA_3K),
    }).eq('id', mv3k.id)).error, 'reclassifica 3.000 Meta')
    if (mv3k.conta_pagar_id) {
      const { data: cpx } = await sb.from('erp_contas_pagar').select('id,observacoes,categoria_id').eq('id', mv3k.conta_pagar_id).maybeSingle()
      if (cpx) fail((await sb.from('erp_contas_pagar').update({
        categoria_id: CAT_MARKETING, centro_custo_id: CC_MARKETING, fornecedor_id: P_FACEBOOK,
        observacoes: anexa(cpx.observacoes, NOTA_3K),
      }).eq('id', cpx.id)).error, 'reclassifica CP 3.000 Meta')
    }
  }
}

/* ================= [8] par do pass-through Leilao Prata =================== */
console.log('\n[8] 13/07  +/- ' + fmt(38000) + '  pass-through Leilao Prata 2025 — declarar o par')
const { data: parPrata } = await sb.from('erp_movimentos_bancarios').select('id,tipo,transferencia_par_id,observacoes')
  .eq('conta_bancaria_id', CONTA).eq('data', '2026-07-13').eq('valor', 38000)
const pIn = (parPrata || []).find(m => m.tipo === 'entrada')
const pOut = (parPrata || []).find(m => m.tipo === 'saida')
if (!pIn || !pOut) console.log('    (par nao encontrado)')
else if (pIn.transferencia_par_id && pOut.transferencia_par_id) console.log('    (par ja declarado)')
else {
  const NOTA_PP = TAG + ' Par declarado: os 38.000,00 entraram de FRANCISCO PRATA MENDONCA e sairam no mesmo dia para FELIPE VILELA ANDRADE. E dinheiro do Leilao Prata 2025 passando pela conta — nao e receita nem despesa da Bula, e as duas pernas ja estavam fora do resultado. O que faltava era o vinculo entre elas, que agora existe.'
  console.log('    entrada ' + pIn.id.slice(0, 8) + '  <->  saida ' + pOut.id.slice(0, 8))
  if (APPLY) {
    fail((await sb.from('erp_movimentos_bancarios').update({ transferencia_par_id: pOut.id, observacoes: anexa(pIn.observacoes, NOTA_PP) }).eq('id', pIn.id)).error, 'par entrada')
    fail((await sb.from('erp_movimentos_bancarios').update({ transferencia_par_id: pIn.id, observacoes: anexa(pOut.observacoes, NOTA_PP) }).eq('id', pOut.id)).error, 'par saida')
  }
}

/* ---------- fecho --------------------------------------------------------- */
const { data: conta } = await sb.from('erp_contas_bancarias').select('saldo_atual').eq('id', CONTA).maybeSingle()
console.log('\n--- saldo ---')
console.log('  ERP hoje ...... ' + fmt(conta?.saldo_atual))
console.log('  esperado ...... ' + fmt(SALDO_HOJE) + '  (extrato de 01/09)')
console.log('  diferenca ..... ' + fmt(Number(conta?.saldo_atual || 0) - SALDO_HOJE))

const { data: pend } = await sb.from('erp_movimentos_bancarios')
  .select('data,tipo,valor,descricao,status_conciliacao').eq('conta_bancaria_id', CONTA)
  .gte('data', '2026-07-01').lte('data', '2026-07-31').neq('status_conciliacao', 'conciliado').order('data')
console.log('\n--- movimentos de julho fora de "conciliado": ' + (pend?.length || 0))
for (const m of pend || []) console.log('  ' + m.data + ' ' + (m.tipo === 'saida' ? '-' : '+') + fmt(m.valor) + ' [' + m.status_conciliacao + '] ' + String(m.descricao).slice(0, 66))

const { data: resto } = await sb.from('erp_movimentos_bancarios').select('data,valor,descricao')
  .eq('conta_bancaria_id', CONTA).ilike('descricao', '%AGREGADOS%')
console.log('\n--- tampoes que sobram: ' + (resto?.length || 0))
for (const m of resto || []) console.log('  ' + m.data + '  ' + fmt(m.valor) + '  ' + m.descricao)
console.log(erros ? '\n' + erros + ' ERRO(S).' : (APPLY ? '\nOK — gravado.' : '\nOK — dry-run limpo.'))
process.exit(erros ? 1 : 0)
