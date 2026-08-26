/**
 * Conciliacao Sicoob 25/08 -> 26/08/2026.
 * Fonte: extrato PDF sicoob_2026_08_26_13_16_36.pdf (periodo 01/08 a 26/08,
 * saldo final 22.043,22 C), convertido por scripts/sicoob-pdf-para-csv.mjs e
 * importado por scripts/importa-extrato.mts (3 movimentos novos, todos de 25/08 —
 * cairam na conta depois que o PDF anterior foi tirado, as 11:01 de 25/08).
 *
 * Os tres lancamentos:
 *   25/08  +2.405,00  PIX EDUARDO PINHEIRO CAMPOS
 *   25/08  -5.262,00  LEONARDO SERAFIM FRANCISCO LTDA - "Ref comissao Julho Leo"
 *   25/08  -8.826,00  59.791.094/0001-07 (FO Assessoria) - "Ref Comissao Julho Fabio Omena"
 *
 * [1] EDUARDO PINHEIRO CAMPOS — pagador recorrente (8.750 em 02/02, 3.990 em
 *     25/05, 3.990 em 24/06), sempre classificado como Comissao de Leilao com
 *     titulo-espelho criado a partir do extrato (padrao de 18/08). Mesmo
 *     tratamento aqui. A que leilao se refere continua por identificar.
 *
 * [2] LEONARDO — a planilha que ele mandou (foto de 26/08) fecha EXATO nos
 *     5.262,00: 7 lotes, VGV 263.100, 2%. Conferida lote a lote contra os
 *     `lances` do ERP: os 7 VGV batem ao centavo. Cobertura:
 *       Navirai 05/07 lt91 ....... 1.170  -> CP existe
 *       Kriz 07/07 lt19+lt20 ......  750  -> SEM CP (fechamento tem, titulo nao) => criado aqui
 *       EAO Femeas lt26+lt30 ..... 1.920  -> o ERP atribui esses lotes ao FABIO
 *       2a Navirai 16/07 lt25 .....  612  -> CP existe
 *       Guadalupe Femeas lt20 .....  810  -> CP existe
 *     Baixamos 3.342 (os tres CP + o do Kriz). Os 1.920 NAO sao baixados: estao
 *     hoje dentro do CP de 3.648 do Fabio (EAO Femeas = lt M04 1.728 + lt26 990
 *     + lt30 930) e mexer nisso com a planilha de um lado so trocaria um erro por
 *     outro. Fica como divergencia aberta.
 *     O que o ERP da ao Leonardo e a planilha dele NAO cobra (segue em aberto,
 *     nao e erro): EAO Femeas lt19 1.200, Santa Cruz lt116 510 e o 23o Genetica
 *     Aditiva 2a etapa 4.068 — 5.778 no total.
 *
 * [3] FABIO — NAO se baixa nada. Pela atribuicao atual do ERP a comissao de
 *     julho dele soma 9.306 (13 lotes) e o pagamento de 8.826 so fecha tirando
 *     o lote 20 do Navirai 05/07 (480). Mas se os lotes 26 e 30 da EAO Femeas
 *     forem mesmo do Leonardo, o devido cai para 7.386 e o pagamento passa a ser
 *     1.440 MAIOR que o devido. As duas leituras nao podem valer juntas: sem a
 *     planilha do Fabio, o movimento entra classificado e os titulos ficam como
 *     estao.
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
const OBS = 'Extrato Sicoob 01-26/08/2026 (PDF sicoob_2026_08_26_13_16_36)'
const TAG = '[CONCILIADO 26/08]'
const SALDO_EXTRATO = 22043.22

const CAT_COMISSAO_LEILAO = 'e74434bd-3366-4015-9268-15d6640cf15f' // receita
const CAT_COMISSOES       = 'd53cf26d-af3b-406f-8a6d-b46dcd65d78e' // despesa
const CC_LEILAO           = '52dd8ed0-0c0a-4524-86bd-01dc121487b3'
const P_EDUARDO = '61239c1b'                                        // prefixo; resolvido abaixo
const P_LEONARDO = '105bb753-2271-4529-8373-771a7b9a3866'            // Leonardo Serafim Francisco
const P_FABIO    = 'c5919834-4e98-4f07-88a8-0892e4f7c247'            // FO ASSESSORIA PECUARIA
const FECH_KRIZ  = 'b047dab4-7644-4481-a982-b135e532661e'            // LEILAO VIRTUAL NELORE KRIZ REPRODUTORES 07/07

const fmt = n => Number(n).toFixed(2).padStart(11)
const brl = n => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
let erros = 0
const fail = (e, ctx) => { if (e) { console.error('  ERRO ' + ctx + ': ' + e.message); erros++ } }

/* ---------- os tres movimentos, importados como PENDENTE -------------------- */
const { data: movs } = await sb.from('erp_movimentos_bancarios')
  .select('id,data,tipo,valor,descricao,status_conciliacao')
  .eq('conta_bancaria_id', CONTA).eq('data', '2026-08-25')
const acha = (tipo, valor) => (movs || []).find(m => m.tipo === tipo && Math.abs(Number(m.valor) - valor) < 0.005 && m.status_conciliacao === 'pendente')
const movEduardo = acha('entrada', 2405)
const movLeo     = acha('saida', 5262)
const movFabio   = acha('saida', 8826)
if (!movEduardo || !movLeo || !movFabio) {
  console.error('FALTAM movimentos pendentes de 25/08 (2.405,00 / 5.262,00 / 8.826,00).')
  console.error('Rode antes: node scripts/sicoob-pdf-para-csv.mjs <pdf> <csv> && npx tsx scripts/importa-extrato.mts <csv> --apply')
  process.exit(1)
}

/* ================= [1] EDUARDO PINHEIRO CAMPOS +2.405,00 =================== */
console.log('\n[1] +2.405,00 EDUARDO PINHEIRO CAMPOS — receita, titulo-espelho (padrao 18/08)')
const { data: eduardo } = await sb.from('erp_pessoas').select('id,nome,documento').ilike('nome', '%Eduardo Pinheiro%').single()
if (!eduardo || !eduardo.id.startsWith(P_EDUARDO)) { console.error('  pessoa Eduardo Pinheiro Campos nao confere'); process.exit(1) }
console.log('  cliente ' + eduardo.nome + ' (' + eduardo.documento + ')')

const notaCR = 'Titulo criado a partir do extrato conciliado (movimento ' + movEduardo.id + ') — completa o historico, como nos PIX anteriores do mesmo pagador (02/02 8.750,00; 25/05 3.990,00; 24/06 3.990,00). ATENCAO: leilao de origem ainda NAO identificado.'
let crEduardoId = null
const { data: crJa } = await sb.from('erp_contas_receber').select('id').eq('cliente_id', eduardo.id).eq('vencimento', '2026-08-25').eq('valor', 2405).maybeSingle()
if (crJa) { crEduardoId = crJa.id; console.log('  CR  = ja existe ' + crJa.id) }
else {
  console.log('  CR  + criar ' + fmt(2405) + '  PIX RECEB.OUTRA IF - EDUARDO PINHEIRO CAMPOS  (recebido 25/08)')
  if (APPLY) {
    const { data, error } = await sb.from('erp_contas_receber').insert({
      descricao: 'PIX RECEB.OUTRA IF - EDUARDO PINHEIRO CAMPOS',
      cliente_id: eduardo.id, categoria_id: CAT_COMISSAO_LEILAO, centro_custo_id: CC_LEILAO,
      conta_bancaria_id: CONTA, valor: 2405, valor_recebido: 2405,
      emissao: '2026-08-25', vencimento: '2026-08-25', data_recebimento: '2026-08-25',
      status: 'recebido', forma_recebimento: 'pix', parcela: 1, total_parcelas: 1,
      recorrencia: 'nenhuma', origem: 'real',
      observacoes: '[' + '26/08/2026] ' + notaCR,
      tags: ['a-receber', 'comissao', '2026', 'agosto', 'leilao'],
    }).select('id').single()
    fail(error, 'cria CR Eduardo'); crEduardoId = data?.id ?? null
  }
}
console.log('  MOV ' + movEduardo.data + ' ' + fmt(movEduardo.valor) + ' -> conciliado')
if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
  categoria_id: CAT_COMISSAO_LEILAO, centro_custo_id: CC_LEILAO, pessoa_id: eduardo.id,
  conta_receber_id: crEduardoId, status_conciliacao: 'conciliado', conciliado: true,
  observacoes: [OBS, TAG + ' Comissao de leilao recebida de EDUARDO PINHEIRO CAMPOS (CPF 048.530.756-15). ' + notaCR].join(' | '),
}).eq('id', movEduardo.id)).error, 'classifica Eduardo')

/* ================= [2] LEONARDO -5.262,00 ================================== */
console.log('\n[2] -5.262,00 LEONARDO SERAFIM FRANCISCO LTDA — comissao julho/2026 (planilha do assessor, 26/08)')
const NOTA_LEO = TAG + ' Pago no PIX unico de 25/08 a LEONARDO SERAFIM FRANCISCO LTDA (5.262,00, "Ref comissao Julho Leo"). Confere com a planilha do assessor (26/08): 7 lotes, VGV 263.100,00 a 2% = 5.262,00.'
const CP_LEO = [
  { id: '24f3439d-a1ed-414c-bd81-ad5efa72cc70', valor: 1170, ev: 'Navirai Matrizes 05/07 lt91 (Romualdo Tavares)' },
  { id: 'b4d28beb-e524-4236-bdb3-dbb46ac5b96e', valor:  612, ev: '2a Etapa Navirai 16/07 lt25 (Felipe Balbuena)' },
  { id: '6c7d5c50-613e-4899-8dd2-66658b25ba76', valor:  810, ev: 'Guadalupe Femeas 18/07 lt20 (Romualdo Tavares)' },
]
let baixado = 0
for (const c of CP_LEO) {
  const { data: cp } = await sb.from('erp_contas_pagar').select('id,descricao,valor,status,observacoes').eq('id', c.id).maybeSingle()
  if (!cp) { console.log('  BAIXA ! CP ' + c.id + ' nao existe'); erros++; continue }
  if (Math.abs(Number(cp.valor) - c.valor) > 0.005) { console.log('  BAIXA ! CP ' + c.id + ' vale ' + brl(cp.valor) + ', esperado ' + brl(c.valor)); erros++; continue }
  baixado += Number(cp.valor)
  if (cp.status === 'pago') { console.log('  BAIXA = ja pago  ' + fmt(cp.valor) + '  ' + cp.descricao.slice(0, 60)); continue }
  console.log('  BAIXA ' + fmt(cp.valor) + '  ' + cp.descricao.slice(0, 60))
  if (APPLY) fail((await sb.from('erp_contas_pagar').update({
    status: 'pago', valor_pago: cp.valor, data_pagamento: '2026-08-25',
    forma_pagamento: 'pix', conta_bancaria_id: CONTA,
    observacoes: ((cp.observacoes || '') + ' ' + NOTA_LEO + ' Item da planilha: ' + c.ev + '.').trim(),
  }).eq('id', cp.id)).error, 'baixa CP ' + c.ev)
}

// Kriz 07/07: o fechamento reconhece 750,00 ao Leonardo, mas nunca virou titulo.
console.log('\n  Kriz 07/07 (lotes 19 e 20) — o fechamento reconhece, o ERP nunca emitiu titulo:')
const EVK_KRIZ = 'comissao:' + FECH_KRIZ + ':leonardo-serafim'
const { data: krizJa } = await sb.from('erp_contas_pagar').select('id,valor,status').eq('evento_key', EVK_KRIZ).maybeSingle()
if (krizJa) { console.log('    CP  = ja existe ' + krizJa.id + ' (' + brl(krizJa.valor) + ', ' + krizJa.status + ')'); baixado += Number(krizJa.valor) }
else {
  console.log('    CP  + criar e ja baixar ' + fmt(750) + '  COMISSAO LEILAO VIRTUAL NELORE KRIZ REPRODUTORES - LEONARDO SERAFIM (2%)')
  baixado += 750
  if (APPLY) fail((await sb.from('erp_contas_pagar').insert({
    descricao: 'COMISSAO LEILÃO VIRTUAL NELORE KRIZ REPRODUTORES – 07/07/2026 - LEONARDO SERAFIM (2%)',
    categoria_id: CAT_COMISSOES, centro_custo_id: CC_LEILAO, conta_bancaria_id: CONTA,
    valor: 750, valor_pago: 750,
    emissao: '2026-07-07', vencimento: '2026-08-25', data_pagamento: '2026-08-25',
    status: 'pago', forma_pagamento: 'pix',
    numero_documento: 'com-jul26:' + FECH_KRIZ.slice(0, 8) + ':leonardo-serafim',
    parcela: 1, total_parcelas: 1, recorrencia: 'nenhuma',
    fechamento_id: FECH_KRIZ, origem: 'real', evento_key: EVK_KRIZ, vendedor: 'LEONARDO SERAFIM',
    observacoes: '[CP-AGO-2026] Comissao ref. julho/2026. VGV do assessor R$ 37.500 (lote 19 R$ 19.500 + lote 20 R$ 18.000). Titulo emitido em 26/08 na conciliacao: o fechamento do Kriz ja reconhecia os 750,00 ao Leonardo, mas nenhum CP havia sido gerado. ' + NOTA_LEO,
    tags: ['a-pagar', 'comissao', '2026', 'julho', 'leilao'],
  })).error, 'cria CP Kriz')
}

const conflito = 5262 - baixado
console.log('\n  baixado ' + brl(baixado) + '  |  PIX 5.262,00  |  sem titulo baixado: ' + brl(conflito))
console.log('  ^ os ' + brl(conflito) + ' sao os lotes 26 (990,00) e 30 (930,00) da EAO Baviera Femeas, que a')
console.log('    planilha do Leonardo cobra e o ERP atribui ao Fabio Omena Gaia (dentro do CP de 3.648,00).')

const notaMovLeo = 'Comissao de julho/2026 do Leonardo Serafim. A planilha do assessor (26/08) fecha exato: 7 lotes, VGV 263.100,00 x 2% = 5.262,00, e os 7 VGV conferem lote a lote com os lances do ERP. Baixados ' + brl(baixado) + ' em titulo (Navirai 05/07 1.170 + 2a Navirai 612 + Guadalupe Femeas 810 + Kriz 07/07 750, este ultimo emitido agora). Restam ' + brl(conflito) + ' sem titulo proprio: lotes 26 e 30 da EAO Baviera Femeas, hoje atribuidos ao Fabio Omena Gaia (CP 0609dbaa, 3.648,00 = lt M04 1.728 + lt26 990 + lt30 930). DIVERGENCIA DE ATRIBUICAO EM ABERTO — resolver com a planilha do Fabio antes de mexer nos titulos. Nao cobrado pelo Leonardo (segue aberto, sem erro): EAO Femeas lt19 1.200,00, Base Genetica Santa Cruz lt116 510,00 e 23o Genetica Aditiva 2a etapa 4.068,00.'
console.log('  MOV ' + movLeo.data + ' -' + fmt(movLeo.valor) + ' -> classificado (titulo parcial)')
if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
  categoria_id: CAT_COMISSOES, centro_custo_id: CC_LEILAO, pessoa_id: P_LEONARDO,
  status_conciliacao: 'classificado', conciliado: false,
  observacoes: [OBS, TAG + ' ' + notaMovLeo].join(' | '),
}).eq('id', movLeo.id)).error, 'classifica Leonardo')

/* ================= [3] FABIO OMENA -8.826,00 =============================== */
console.log('\n[3] -8.826,00 FO ASSESSORIA PECUARIA (Fabio Omena) — classificado, SEM baixa')
const notaMovFabio = 'Comissao de julho/2026 do Fabio Omena. NENHUM titulo baixado de proposito: as duas leituras possiveis se contradizem. (a) Pela atribuicao atual do ERP, a comissao de julho do Fabio soma 9.306,00 em 13 lotes e o pagamento de 8.826,00 so fecha excluindo o lote 20 do Navirai 05/07 (480,00) — e essa e a UNICA combinacao exata. (b) A planilha do Leonardo (26/08) reivindica os lotes 26 e 30 da EAO Baviera Femeas (990,00 + 930,00), que o ERP hoje atribui ao Fabio; se ela estiver certa, o devido ao Fabio cai para 7.386,00 e o pagamento fica 1.440,00 ACIMA do devido. PENDENTE: planilha de julho do Fabio Omena para decidir a atribuicao dos lotes 26 e 30. Titulos de julho dele seguem vencidos (8.886,00 em 7 CP).'
console.log('  MOV ' + movFabio.data + ' -' + fmt(movFabio.valor) + ' -> classificado')
console.log('  titulos de julho do Fabio: intocados (7 CP, 8.886,00)')
if (APPLY) fail((await sb.from('erp_movimentos_bancarios').update({
  categoria_id: CAT_COMISSOES, centro_custo_id: CC_LEILAO, pessoa_id: P_FABIO,
  status_conciliacao: 'classificado', conciliado: false,
  observacoes: [OBS, TAG + ' ' + notaMovFabio].join(' | '),
}).eq('id', movFabio.id)).error, 'classifica Fabio')

/* ================= [4] validacao por saldo ================================= */
console.log('\n[4] Validacao por saldo')
const { data: conta } = await sb.from('erp_contas_bancarias').select('saldo_atual,saldo_inicial').eq('id', CONTA).single()
let all = [], from = 0
for (;;) {
  const { data } = await sb.from('erp_movimentos_bancarios').select('tipo,valor').eq('conta_bancaria_id', CONTA).range(from, from + 999)
  all = all.concat(data || [])
  if (!data || data.length < 1000) break
  from += 1000
}
const net = all.reduce((s, m) => s + (m.tipo === 'entrada' ? 1 : m.tipo === 'saida' ? -1 : 0) * Number(m.valor), 0)
const calc = Math.round((Number(conta.saldo_inicial) + net) * 100) / 100
console.log('  gravado ' + fmt(conta.saldo_atual) + ' | recalculado ' + fmt(calc) + ' | extrato ' + fmt(SALDO_EXTRATO))
console.log(Math.abs(calc - SALDO_EXTRATO) < 0.005 ? '  OK saldo bate com o extrato.' : '  ATENCAO diferenca de R$ ' + Math.abs(calc - SALDO_EXTRATO).toFixed(2))

console.log('\n' + (APPLY ? (erros ? '*** ' + erros + ' erro(s) ***' : 'APLICADO sem erros.') : 'DRY-RUN. Use --apply para gravar.'))
